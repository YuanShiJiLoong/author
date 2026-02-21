// OpenAI 兼容 API — SSE 流式转发（Edge Runtime 确保流式不被缓冲）
// 支持智谱、DeepSeek、OpenAI、Moonshot 等所有兼容 OpenAI 格式的 API

export const runtime = 'edge';

export async function POST(request) {
    try {
        const { systemPrompt, userPrompt, apiConfig, maxTokens } = await request.json();

        const apiKey = apiConfig?.apiKey || process.env.ZHIPU_API_KEY;
        const baseUrl = apiConfig?.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
        const model = apiConfig?.model || 'glm-4-flash';

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: '请先配置 API Key。点击左下角 ⚙️ → API配置，填入你的 Key' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

        // 请求上游 API，开启 stream 模式
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.8,
                max_tokens: maxTokens || 4096,
                stream: true,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API错误:', response.status, errorText);

            const errorMessages = {
                401: 'API Key 无效或已过期，请检查后重新填写',
                429: '请求频率过高或额度不足，请稍后再试',
            };
            const errMsg = errorMessages[response.status]
                || `AI服务返回错误(${response.status})，请检查 API 配置`;

            return new Response(
                JSON.stringify({ error: errMsg }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // 将上游 SSE 流透传给前端
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
                        // 最后一行可能不完整，留到下次
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || trimmed.startsWith(':')) continue;

                            if (trimmed === 'data: [DONE]') {
                                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                                continue;
                            }

                            if (trimmed.startsWith('data: ')) {
                                try {
                                    const json = JSON.parse(trimmed.slice(6));
                                    const delta = json.choices?.[0]?.delta;

                                    // 转发思维链内容（DeepSeek reasoning_content）
                                    const reasoning = delta?.reasoning_content;
                                    if (reasoning) {
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: reasoning })}\n\n`));
                                    }

                                    // 转发文本 delta
                                    const content = delta?.content;
                                    if (content) {
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
                                    }

                                    // 检查是否包含 usage 信息（某些 API 在最后一个事件中返回）
                                    if (json.usage) {
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                            usage: {
                                                promptTokens: json.usage.prompt_tokens || 0,
                                                completionTokens: json.usage.completion_tokens || 0,
                                                totalTokens: json.usage.total_tokens || 0,
                                            }
                                        })}\n\n`));
                                    }
                                } catch {
                                    // 解析失败的行直接跳过
                                }
                            }
                        }
                    }
                } catch (err) {
                    // 客户端断开等情况
                    console.error('Stream 读取错误:', err.message);
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
        console.error('AI接口错误:', error);
        return new Response(
            JSON.stringify({ error: '网络连接失败，请检查 API 地址是否正确' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
