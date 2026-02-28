// Gemini 原生 API — SSE 流式转发（Edge Runtime 确保流式不被缓冲）
// 使用 streamGenerateContent 端点

export const runtime = 'edge';

export async function POST(request) {
    try {
        const { systemPrompt, userPrompt, apiConfig, maxTokens } = await request.json();

        const apiKey = apiConfig?.apiKey || process.env.GEMINI_API_KEY;
        let rawBaseUrl = apiConfig?.baseUrl;
        if (!rawBaseUrl || rawBaseUrl.includes('open.bigmodel.cn')) {
            rawBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        }
        const baseUrl = rawBaseUrl.replace(/\/$/, '');
        const model = apiConfig?.model || 'gemini-2.0-flash';

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: '请先配置 API Key。点击左下角 ⚙️ → API配置，填入你的 Gemini Key' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // 使用 streamGenerateContent 端点 + alt=sse
        const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        const requestBody = {
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                {
                    role: 'user',
                    parts: [{ text: userPrompt }]
                }
            ],
            generationConfig: {
                temperature: 0.8,
                topP: 0.9,
                ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
            },
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API错误:', response.status, errorText);

            const errorHandlers = {
                400: () => {
                    try {
                        const errObj = JSON.parse(errorText);
                        return `Gemini 请求错误：${errObj?.error?.message || errorText}`;
                    } catch {
                        return `Gemini 请求错误(400)：${errorText}`;
                    }
                },
                401: () => 'API Key 无效或无权限，请检查你的 Gemini API Key',
                403: () => 'API Key 无效或无权限，请检查你的 Gemini API Key',
                429: () => '请求频率过高或配额不足，请稍后再试',
            };
            const errMsg = errorHandlers[response.status]?.()
                || `Gemini 服务返回错误(${response.status})，请检查 API 配置`;

            return new Response(
                JSON.stringify({ error: errMsg }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // 将 Gemini SSE 流转换为统一格式转发给前端
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

                            if (trimmed.startsWith('data: ')) {
                                try {
                                    const json = JSON.parse(trimmed.slice(6));
                                    const candidate = json.candidates?.[0];
                                    const parts = candidate?.content?.parts || [];

                                    for (const part of parts) {
                                        if (part.thought === true && part.text) {
                                            // Gemini 思维链
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: part.text })}\n\n`));
                                        } else if (part.text) {
                                            // 正文内容
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: part.text })}\n\n`));
                                        }
                                    }

                                    // 提取 usage（通常在最后一个 chunk）
                                    const usageMeta = json.usageMetadata;
                                    if (usageMeta?.totalTokenCount) {
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                            usage: {
                                                promptTokens: usageMeta.promptTokenCount || 0,
                                                completionTokens: usageMeta.candidatesTokenCount || 0,
                                                totalTokens: usageMeta.totalTokenCount || 0,
                                            }
                                        })}\n\n`));
                                    }
                                } catch {
                                    // 解析失败跳过
                                }
                            }
                        }
                    }
                    // 发送结束信号
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                } catch (err) {
                    console.error('Gemini Stream 读取错误:', err.message);
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
        console.error('Gemini 接口错误:', error);
        return new Response(
            JSON.stringify({ error: '网络连接失败，请检查 API 地址是否正确' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
