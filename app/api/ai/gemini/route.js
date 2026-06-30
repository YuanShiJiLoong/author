// Gemini 原生 API — SSE 流式转发（Edge Runtime 确保流式不被缓冲）
// 使用 streamGenerateContent 端点

export const runtime = 'nodejs';
export const maxDuration = 120;

import { applyContentSafety } from '../../../lib/content-safety';
import { proxyFetch } from '../../../lib/proxy-fetch';
import { rotateKey } from '../../../lib/keyRotator';
import { assertUpstreamUrl } from '../../../lib/upstream-guard';

export async function POST(request) {
    try {
        const { systemPrompt, userPrompt, apiConfig, maxTokens, temperature, topP, reasoningEffort, tools: toolsConfig } = await request.json();
        const proxyUrl = apiConfig?.proxyUrl || '';

        const apiKey = rotateKey(apiConfig?.apiKey || process.env.GEMINI_API_KEY);
        // 不内置官方默认地址：baseUrl 必须由用户填写（open core 边界）
        const baseUrl = String(apiConfig?.baseUrl || process.env.GEMINI_BASE_URL || '').trim().replace(/\/+$/, '');
        const model = apiConfig?.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash';

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: '请先配置 Gemini 原生 API Key', code: 'NO_API_KEY_GEMINI' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (!baseUrl) {
            return new Response(
                JSON.stringify({ error: '请先填写 Gemini 原生 API 地址（通常以 /v1beta 结尾）', code: 'NO_BASE_URL_GEMINI' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // SSRF 防护：校验用户可控的 baseUrl（仅放行公网 http/https；本机请求可放行私网）
        const guard = assertUpstreamUrl(baseUrl, request);
        if (!guard.ok) {
            return new Response(
                JSON.stringify({ error: guard.error, code: guard.code }),
                { status: guard.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // 使用 streamGenerateContent 端点 + alt=sse
        const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        const requestBody = {
            system_instruction: {
                parts: [{ text: applyContentSafety(systemPrompt) }]
            },
            contents: [
                {
                    role: 'user',
                    parts: [{ text: userPrompt }]
                }
            ],
            generationConfig: {
                ...(temperature != null ? { temperature } : {}),
                ...(topP != null ? { topP } : {}),
                ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
                ...(reasoningEffort && reasoningEffort !== 'auto' ? {
                    thinkingConfig: {
                        thinkingBudget: reasoningEffort === 'none' ? 0 : ({ low: 1024, medium: 8192, high: 32768 }[reasoningEffort] || 8192),
                    },
                } : {}),
            },
        };

        // 内置工具（仅在用户明确开启时才添加，默认不影响原有行为）
        const geminiTools = [];
        if (toolsConfig?.googleSearch) geminiTools.push({ googleSearch: {} });
        if (toolsConfig?.codeExecution) geminiTools.push({ codeExecution: {} });
        if (geminiTools.length > 0) requestBody.tools = geminiTools;

        const response = await proxyFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        }, proxyUrl);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API错误:', response.status, errorText);

            let errMsg = '';
            let code = '';
            let detail = '';
            if (response.status === 400) {
                try {
                    const errObj = JSON.parse(errorText);
                    detail = errObj?.error?.message || errorText;
                } catch { detail = errorText; }
                errMsg = `Gemini 请求错误：${detail}`; code = 'AI_SERVICE_ERROR';
            } else if (response.status === 401 || response.status === 403) {
                errMsg = 'API Key 无效或无权限，请检查你的 Gemini API Key'; code = 'INVALID_KEY';
            } else if (response.status === 429) {
                errMsg = '请求频率过高或配额不足，请稍后再试'; code = 'AI_RATE_LIMIT';
            } else {
                errMsg = `Gemini 服务返回错误(${response.status})，请检查 API 配置`; code = 'AI_RETURNED_ERROR';
            }

            return new Response(
                JSON.stringify({ error: errMsg, code, status: response.status, detail }),
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
                                        } else if (part.executableCode) {
                                            // Code Execution — 模型生成的代码
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ codeExec: { code: part.executableCode.code, language: part.executableCode.language || 'python' } })}\n\n`));
                                        } else if (part.codeExecutionResult) {
                                            // Code Execution — 执行结果
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ codeResult: { output: part.codeExecutionResult.output, outcome: part.codeExecutionResult.outcome } })}\n\n`));
                                        } else if (part.text) {
                                            // 正文内容
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: part.text })}\n\n`));
                                        }
                                    }

                                    // Google Search grounding 元数据（在 candidate 级别）
                                    const grounding = candidate?.groundingMetadata;
                                    if (grounding) {
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                            grounding: {
                                                searchQueries: grounding.webSearchQueries || [],
                                                sources: (grounding.groundingChunks || []).map(c => ({
                                                    title: c.web?.title || '',
                                                    uri: c.web?.uri || '',
                                                })),
                                                supports: (grounding.groundingSupports || []).map(s => ({
                                                    text: s.segment?.text || '',
                                                    indices: s.groundingChunkIndices || [],
                                                })),
                                            }
                                        })}\n\n`));
                                    }

                                    // 提取 usage（通常在最后一个 chunk）
                                    const usageMeta = json.usageMetadata;
                                    if (usageMeta?.totalTokenCount) {
                                        const cachedTokens = usageMeta.cachedContentTokenCount || 0;
                                        const thoughtsTokens = usageMeta.thoughtsTokenCount || 0;
                                        const completionTokens = (usageMeta.candidatesTokenCount || 0) + thoughtsTokens;
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                            usage: {
                                                promptTokens: usageMeta.promptTokenCount || 0,
                                                completionTokens,
                                                totalTokens: usageMeta.totalTokenCount || 0,
                                                cachedTokens,
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
            JSON.stringify({ error: '网络连接失败，请检查 API 地址是否正确', code: 'NETWORK_ERROR_CHECK' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
