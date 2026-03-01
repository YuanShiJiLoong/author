// Claude/Anthropic Messages API — SSE 流式转发（Edge Runtime 确保流式不被缓冲）
// 使用 Anthropic Messages API 格式 (/v1/messages)

export const runtime = 'edge';

export async function POST(request) {
    try {
        const { systemPrompt, userPrompt, apiConfig, maxTokens } = await request.json();

        const apiKey = apiConfig?.apiKey;
        const baseUrl = (apiConfig?.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
        const model = apiConfig?.model || 'claude-sonnet-4-20250514';

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: '请先配置 API Key。点击左下角 ⚙️ → API配置，填入你的 Anthropic Key' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const url = `${baseUrl}/v1/messages`;

        // 构造 Messages API 请求体
        const requestBody = {
            model,
            max_tokens: maxTokens || 2000,
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt }
            ],
            stream: true,
        };

        // 如果模型支持 extended thinking (claude-3-7-sonnet)，可以启用
        // 但默认不启用，因为需要额外的 budget 参数

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Claude API 错误:', response.status, errorText);

            const errorMessages = {
                401: 'API Key 无效或已过期，请检查后重新填写',
                403: 'API Key 无权限或已被禁用',
                429: '请求频率过高或额度不足，请稍后再试',
                529: 'Anthropic API 过载，请稍后再试',
            };

            let errMsg = errorMessages[response.status];
            if (!errMsg) {
                try {
                    const errObj = JSON.parse(errorText);
                    errMsg = errObj?.error?.message || `Claude 服务返回错误(${response.status})`;
                } catch {
                    errMsg = `Claude 服务返回错误(${response.status})，请检查 API 配置`;
                }
            }

            return new Response(
                JSON.stringify({ error: errMsg }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // 将 Claude SSE 流解析并转发为统一的 {text, thinking} 格式
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
            async start(controller) {
                const reader = response.body.getReader();
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || trimmed.startsWith(':')) continue;

                            // Claude SSE: event: xxx\ndata: {...}
                            if (trimmed.startsWith('data: ')) {
                                try {
                                    const json = JSON.parse(trimmed.slice(6));
                                    const eventType = json.type;

                                    // 文本内容 delta
                                    if (eventType === 'content_block_delta') {
                                        const delta = json.delta;
                                        if (delta?.type === 'text_delta' && delta.text) {
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta.text })}\n\n`));
                                        }
                                        // 思维链 delta (extended thinking)
                                        if (delta?.type === 'thinking_delta' && delta.thinking) {
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: delta.thinking })}\n\n`));
                                        }
                                    }

                                    // 消息结束 — 提取 usage
                                    if (eventType === 'message_delta') {
                                        const usage = json.usage;
                                        if (usage) {
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                                usage: {
                                                    promptTokens: 0, // message_delta 只有 output_tokens
                                                    completionTokens: usage.output_tokens || 0,
                                                    totalTokens: usage.output_tokens || 0,
                                                }
                                            })}\n\n`));
                                        }
                                    }

                                    // message_start 事件中包含 input tokens
                                    if (eventType === 'message_start') {
                                        const usage = json.message?.usage;
                                        if (usage?.input_tokens) {
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                                usage: {
                                                    promptTokens: usage.input_tokens || 0,
                                                    completionTokens: 0,
                                                    totalTokens: usage.input_tokens || 0,
                                                }
                                            })}\n\n`));
                                        }
                                    }

                                    // 消息停止
                                    if (eventType === 'message_stop') {
                                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                                    }
                                } catch {
                                    // 解析失败的行直接跳过
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('Claude Stream 读取错误:', err.message);
                } finally {
                    controller.close();
                    reader.releaseLock();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        console.error('Claude 接口错误:', error);
        return new Response(
            JSON.stringify({ error: '网络连接失败，请检查 API 地址是否正确' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
