// OpenAI 兼容 API — SSE 流式转发（Edge Runtime 确保流式不被缓冲）
// 支持智谱、DeepSeek、OpenAI、Moonshot 等所有兼容 OpenAI 格式的 API
// 支持 Function Calling 搜索循环 + OpenAI 内置搜索

export const runtime = 'nodejs';
export const maxDuration = 120;

import { applyContentSafety } from '../../lib/content-safety';
import { proxyFetch } from '../../lib/proxy-fetch';

// Function Calling 搜索工具定义
const WEB_SEARCH_TOOL = {
    type: 'function',
    function: {
        name: 'web_search',
        description: 'Search the internet for real-time information. Use this when the user asks about current events, recent news, weather, prices, or any information that requires up-to-date data.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query to look up on the internet',
                },
            },
            required: ['query'],
        },
    },
};

// ===== 内联搜索执行（避免 Edge Runtime 自引用 fetch 问题）=====
async function executeSearch(query, searchConfig, proxyUrl) {
    const provider = searchConfig.provider || 'tavily';
    switch (provider) {
        case 'tavily': {
            const tavilyBase = (searchConfig.baseUrl || 'https://api.tavily.com').replace(/\/$/, '');
            const res = await proxyFetch(`${tavilyBase}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: searchConfig.apiKey, query, max_results: 5, include_answer: false }),
            }, proxyUrl);

            if (!res.ok) { console.error('Tavily Search error:', res.status); return []; }
            const data = await res.json();
            return (data.results || []).map(item => ({ title: item.title || '', url: item.url || '', snippet: item.content || '' }));
        }
        case 'exa': {
            const exaBase = (searchConfig.baseUrl || 'https://api.exa.ai').replace(/\/$/, '');
            const res = await proxyFetch(`${exaBase}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': searchConfig.apiKey },
                body: JSON.stringify({ query, type: 'auto', numResults: 5, contents: { highlights: { numSentences: 3 } } }),
            }, proxyUrl);

            if (!res.ok) { console.error('Exa Search error:', res.status); return []; }
            const data = await res.json();
            return (data.results || []).map(item => ({ title: item.title || '', url: item.url || '', snippet: (item.highlights || []).join(' ') || item.text || '' }));
        }
        default: return [];
    }
}

export async function POST(request) {
    try {
        const { systemPrompt, userPrompt, apiConfig, maxTokens, temperature, topP, reasoningEffort, tools: toolsConfig } = await request.json();
        const proxyUrl = apiConfig?.proxyUrl || '';

        const apiKey = apiConfig?.apiKey || process.env.API_KEY || process.env.ZHIPU_API_KEY;
        const baseUrl = apiConfig?.baseUrl || process.env.API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
        const model = apiConfig?.model || process.env.API_MODEL || 'glm-4-flash';

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: '请先配置 API Key。点击左下角 ⚙️ → API配置，填入你的 Key' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        };

        const baseParams = {
            ...(temperature != null ? { temperature } : {}),
            ...(topP != null ? { top_p: topP } : {}),
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
            ...(reasoningEffort && reasoningEffort !== 'auto' ? { reasoning_effort: reasoningEffort } : {}),
        };

        const safeSystemPrompt = applyContentSafety(systemPrompt);
        const messages = [
            { role: 'system', content: safeSystemPrompt },
            { role: 'user', content: userPrompt },
        ];

        // ===== Function Calling 搜索模式 =====
        if (toolsConfig?.functionSearch && toolsConfig?.searchConfig?.apiKey) {
            // 确保有 provider 默认值（兼容前端存为 tool 或 provider）
            if (!toolsConfig.searchConfig.provider) {
                toolsConfig.searchConfig.provider = toolsConfig.searchConfig.tool || 'tavily';
            }
            // 第 1 轮：非流式请求，附带搜索工具定义
            const round1Res = await proxyFetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model, messages, ...baseParams,
                    tools: [WEB_SEARCH_TOOL],
                }),
            }, proxyUrl);

            if (!round1Res.ok) {
                const errorText = await round1Res.text();
                console.error('Function Calling 第1轮错误:', round1Res.status, errorText);
                return errorResponse(round1Res.status, errorText);
            }

            const round1Data = await round1Res.json();
            const assistantMsg = round1Data.choices?.[0]?.message;

            // 检查模型是否要求搜索
            if (assistantMsg?.tool_calls?.length > 0) {
                // 清理 assistant message：确保 content 为字符串（而非 null）
                // DeepSeek 推理模型在 tool_calls 时 content 为 null，传回会导致 Round 2 不产出内容
                const cleanedAssistantMsg = {
                    ...assistantMsg,
                    content: assistantMsg.content || '',
                };
                // 移除 reasoning_content，防止 Round 2 时推理模型只产出思维链、不产出正文
                delete cleanedAssistantMsg.reasoning_content;
                // 收集搜索结果和来源
                const extendedMessages = [...messages, cleanedAssistantMsg];
                const allSources = [];

                for (const toolCall of assistantMsg.tool_calls) {
                    if (toolCall.function?.name === 'web_search') {
                        let searchQuery = '';
                        try {
                            const args = JSON.parse(toolCall.function.arguments);
                            searchQuery = args.query || userPrompt;
                        } catch { searchQuery = userPrompt; }

                        // 直接内联执行搜索（不通过 HTTP 调用自身）
                        try {
                            const results = await executeSearch(searchQuery, toolsConfig.searchConfig, proxyUrl);

                            const resultText = results.length > 0
                                ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
                                : '没有找到相关搜索结果。';

                            extendedMessages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: resultText,
                            });

                            for (const r of results) {
                                allSources.push({ title: r.title, uri: r.url });
                            }
                        } catch (searchErr) {
                            console.error('搜索执行失败:', searchErr.message);
                            extendedMessages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: '搜索失败，请直接回答用户的问题。',
                            });
                        }
                    }
                }

                // 第 2 轮：流式请求，让模型根据搜索结果回复
                const round2Res = await proxyFetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model, messages: extendedMessages, ...baseParams,
                        stream: true,
                    }),
                }, proxyUrl);

                if (!round2Res.ok) {
                    const errorText = await round2Res.text();
                    console.error('Function Calling 第2轮错误:', round2Res.status, errorText);
                    return errorResponse(round2Res.status, errorText);
                }

                // 流式转发 + 前置发送搜索来源
                return streamWithGrounding(round2Res, allSources);
            }

            // 模型没调用工具 → 直接把非流式结果包装成 SSE 返回
            const encoder = new TextEncoder();
            const content = assistantMsg?.content || '';
            const thinking = assistantMsg?.reasoning_content || '';
            const stream = new ReadableStream({
                start(controller) {
                    if (thinking) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking })}\n\n`));
                    }
                    if (content) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
                    }
                    if (round1Data.usage) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            usage: {
                                promptTokens: round1Data.usage.prompt_tokens || 0,
                                completionTokens: round1Data.usage.completion_tokens || 0,
                                totalTokens: round1Data.usage.total_tokens || 0,
                            }
                        })}\n\n`));
                    }
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                },
            });
            return new Response(stream, { headers: sseHeaders() });
        }

        // ===== 普通模式（含 OpenAI 内置搜索） =====
        const response = await proxyFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model, messages, ...baseParams,
                ...(toolsConfig?.webSearch ? { web_search_options: { search_context_size: 'medium' } } : {}),
                stream: true,
                ...(toolsConfig?.webSearch ? { stream_options: { include_usage: true } } : {}),
            }),
        }, proxyUrl);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API错误:', response.status, errorText);
            return errorResponse(response.status, errorText);
        }

        return streamWithGrounding(response, []);

    } catch (error) {
        console.error('AI接口错误:', error);
        return new Response(
            JSON.stringify({ error: '网络连接失败，请检查 API 地址是否正确' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// ===== 工具函数 =====

function sseHeaders() {
    return {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    };
}

function errorResponse(status, errorText = '') {
    const errorMessages = {
        401: 'API Key 无效或已过期，请检查后重新填写',
        429: '请求频率过高或额度不足，请稍后再试',
    };

    let errMsg = errorMessages[status];

    // 尝试从上游错误体中提取具体原因
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
        } catch {
            // JSON 解析失败，使用默认消息
        }
    }

    if (!errMsg) {
        errMsg = `AI服务返回错误(${status})，请检查 API 配置`;
    }

    return new Response(
        JSON.stringify({ error: errMsg }),
        { status, headers: { 'Content-Type': 'application/json' } }
    );
}

/** 流式转发上游 SSE 并可选前置 grounding 来源 */
function streamWithGrounding(upstreamRes, preSources) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
        async start(controller) {
            // 先发送搜索来源（如果有）
            if (preSources.length > 0) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    grounding: { searchQueries: [], sources: preSources, supports: [] }
                })}\n\n`));
            }

            const reader = upstreamRes.body.getReader();
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

                                // usage 信息
                                if (json.usage) {
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                        usage: {
                                            promptTokens: json.usage.prompt_tokens || 0,
                                            completionTokens: json.usage.completion_tokens || 0,
                                            totalTokens: json.usage.total_tokens || 0,
                                        }
                                    })}\n\n`));
                                }

                                // OpenAI 内置搜索注释
                                const annotations = delta?.annotations;
                                if (annotations && annotations.length > 0) {
                                    const urlCitations = annotations
                                        .filter(a => a.type === 'url_citation' && a.url_citation)
                                        .map(a => ({ title: a.url_citation.title || '', uri: a.url_citation.url || '' }));
                                    if (urlCitations.length > 0) {
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                            grounding: { searchQueries: [], sources: urlCitations, supports: [] }
                                        })}\n\n`));
                                    }
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

    return new Response(stream, { headers: sseHeaders() });
}
