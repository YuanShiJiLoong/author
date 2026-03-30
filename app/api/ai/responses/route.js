// OpenAI Responses API — SSE 流式转发（Edge Runtime 确保流式不被缓冲）
// 支持使用 /v1/responses 格式的提供商

export const runtime = 'nodejs';
export const maxDuration = 120;

import { applyContentSafety } from '../../../lib/content-safety';
import { proxyFetch } from '../../../lib/proxy-fetch';
import { rotateKey } from '../../../lib/keyRotator';

export async function POST(request) {
    try {
        const { systemPrompt, userPrompt, apiConfig, maxTokens, temperature, topP, tools: toolsConfig } = await request.json();
        const proxyUrl = apiConfig?.proxyUrl || '';

        const apiKey = rotateKey(apiConfig?.apiKey || process.env.OPENAI_API_KEY);
        const baseUrl = (apiConfig?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
        const model = apiConfig?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: '请先配置 API Key。点击左下角 ⚙️ → API配置，填入你的 Key' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const url = `${baseUrl}/responses`;

        // 构造 Responses API 请求体
        const requestBody = {
            model,
            input: [
                { role: 'developer', content: applyContentSafety(systemPrompt) },
                { role: 'user', content: userPrompt },
            ],
            stream: true,
            ...(temperature != null ? { temperature } : {}),
            ...(topP != null ? { top_p: topP } : {}),
        };

        // 添加思考等级（默认 medium，不受高级参数面板影响）
        const rawEffort = apiConfig?.reasoningEffort;
        const effort = (!rawEffort || rawEffort === 'auto') ? 'medium' : rawEffort;
        if (effort !== 'none' && ['low', 'medium', 'high', 'xhigh'].includes(effort)) {
            requestBody.reasoning = { effort, summary: 'auto' };
        }

        // 联网搜索工具
        if (toolsConfig?.webSearch) {
            requestBody.tools = [
                ...(requestBody.tools || []),
                { type: 'web_search_preview', search_context_size: 'medium' },
            ];
        }

        const response = await proxyFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        }, proxyUrl);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Responses API 错误:', response.status, errorText);

            const errorMessages = {
                401: 'API Key 无效或已过期，请检查后重新填写',
                429: '请求频率过高或额度不足，请稍后再试',
            };
            let errMsg = errorMessages[response.status];

            if (!errMsg && errorText) {
                try {
                    const errObj = JSON.parse(errorText);
                    const msg = errObj?.error?.message || '';
                    const code = errObj?.error?.code || '';
                    if (code === 'insufficient_user_quota' || msg.includes('额度') || msg.includes('quota')) {
                        errMsg = 'API 账户余额不足，请充值后重试';
                    } else if (msg.includes('Context window is full') || msg.includes('context_length')) {
                        errMsg = '上下文过长：设定集 + 前文 + 对话内容超出模型上下文窗口，请减少勾选的参考内容或清空对话历史';
                    } else if (msg.includes('too long') || msg.includes('too many tokens') || msg.includes('maximum context length')) {
                        errMsg = '输入内容过长，请减少勾选的参考内容或缩短对话历史';
                    } else if (msg) {
                        errMsg = `AI 服务错误：${msg}`;
                    }
                } catch { /* ignore */ }
            }
            if (!errMsg) errMsg = `AI服务返回错误(${response.status})，请检查 API 配置`;

            return new Response(
                JSON.stringify({ error: errMsg }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // 将上游 SSE 流解析并转发为统一的 {text, thinking} 格式
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

                            // Responses API 格式: event: xxx\ndata: {...}
                            if (trimmed.startsWith('data: ')) {
                                try {
                                    const json = JSON.parse(trimmed.slice(6));
                                    const eventType = json.type;

                                    // 处理文本输出 delta
                                    if (eventType === 'response.output_text.delta') {
                                        const delta = json.delta;
                                        if (delta) {
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
                                        }
                                    }

                                    // 处理思维链/推理摘要 delta
                                    if (eventType === 'response.reasoning_summary_text.delta') {
                                        const delta = json.delta;
                                        if (delta) {
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: delta })}\n\n`));
                                        }
                                    }

                                    // 处理完成事件
                                    if (eventType === 'response.completed') {
                                        // 提取 usage
                                        const usage = json.response?.usage;
                                        if (usage) {
                                            const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                                usage: {
                                                    promptTokens: usage.input_tokens || 0,
                                                    completionTokens: usage.output_tokens || 0,
                                                    totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
                                                    cachedTokens,
                                                }
                                            })}\n\n`));
                                        }

                                        // 提取 web_search 引用注释
                                        const outputs = json.response?.output || [];
                                        const allAnnotations = [];
                                        for (const out of outputs) {
                                            if (out.type === 'message' && out.content) {
                                                for (const part of out.content) {
                                                    if (part.annotations) {
                                                        for (const ann of part.annotations) {
                                                            if (ann.type === 'url_citation' && ann.url) {
                                                                allAnnotations.push({ title: ann.title || '', uri: ann.url });
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        if (allAnnotations.length > 0) {
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                                grounding: { searchQueries: [], sources: allAnnotations, supports: [] }
                                            })}\n\n`));
                                        }

                                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                                    }
                                } catch {
                                    // 解析失败的行直接跳过
                                }
                            }
                        }
                    }
                } catch (err) {
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
        console.error('Responses API 接口错误:', error);
        return new Response(
            JSON.stringify({ error: '网络连接失败，请检查 API 地址是否正确' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
