// Claude/Anthropic Messages API — SSE 流式转发（Edge Runtime 确保流式不被缓冲）
// 使用 Anthropic Messages API 格式 (/v1/messages)

export const runtime = 'nodejs';
export const maxDuration = 120;

import { applyContentSafety } from '../../../lib/content-safety';
import { proxyFetch } from '../../../lib/proxy-fetch';
import { rotateKey } from '../../../lib/keyRotator';

// Anthropic 格式的搜索工具定义
const WEB_SEARCH_TOOL = {
    name: 'web_search',
    description: '搜索互联网获取最新信息。当用户问到你不确定、需要实时数据、或涉及近期事件的问题时，调用此工具。',
    input_schema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: '要搜索的关键词或问题' },
        },
        required: ['query'],
    },
};

// 内联搜索执行（与 /api/ai/route.js 共享逻辑）
async function executeSearch(query, searchConfig, proxyUrl) {
    const provider = searchConfig.provider || 'tavily';
    searchConfig.apiKey = rotateKey(searchConfig.apiKey);
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

        const apiKey = rotateKey(apiConfig?.apiKey || process.env.CLAUDE_API_KEY);
        const baseUrl = (apiConfig?.baseUrl || process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
        const model = apiConfig?.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: '请先配置 API Key。点击左下角 ⚙️ → API配置，填入你的 Anthropic Key' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const url = `${baseUrl}/v1/messages`;
        const commonHeaders = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        };

        // 将 system prompt 转为 content block 格式并启用提示缓存
        const safeSystemPrompt = applyContentSafety(systemPrompt);
        const systemBlocks = [
            {
                type: 'text',
                text: safeSystemPrompt,
                cache_control: { type: 'ephemeral' },
            }
        ];

        const baseParams = {
            model,
            max_tokens: maxTokens || 8192,
            system: systemBlocks,
            ...(temperature != null ? { temperature } : {}),
            ...(topP != null ? { top_p: topP } : {}),
        };

        // 扩展思考 (extended thinking)
        if (reasoningEffort && reasoningEffort !== 'auto' && reasoningEffort !== 'none') {
            const budgetMap = { low: 2048, medium: 8192, high: 32768 };
            baseParams.thinking = {
                type: 'enabled',
                budget_tokens: budgetMap[reasoningEffort] || 8192,
            };
            delete baseParams.temperature;
        }

        const messages = [
            { role: 'user', content: userPrompt }
        ];

        // ===== Function Calling 搜索模式 =====
        if (toolsConfig?.functionSearch && toolsConfig?.searchConfig?.apiKey) {
            if (!toolsConfig.searchConfig.provider) {
                toolsConfig.searchConfig.provider = toolsConfig.searchConfig.tool || 'tavily';
            }

            // 第 1 轮：非流式请求，附带搜索工具定义
            const round1Res = await proxyFetch(url, {
                method: 'POST',
                headers: commonHeaders,
                body: JSON.stringify({
                    ...baseParams,
                    messages,
                    tools: [WEB_SEARCH_TOOL],
                }),
            }, proxyUrl);

            if (!round1Res.ok) {
                const errorText = await round1Res.text();
                console.error('Claude Function Calling 第1轮错误:', round1Res.status, errorText);
                return errorResponse(round1Res.status, errorText);
            }

            const round1Data = await round1Res.json();

            // 检查模型是否使用了 tool_use
            const toolUseBlocks = (round1Data.content || []).filter(b => b.type === 'tool_use');

            if (toolUseBlocks.length > 0) {
                // 收集搜索结果和来源
                const allSources = [];
                const toolResults = [];

                for (const toolBlock of toolUseBlocks) {
                    if (toolBlock.name === 'web_search') {
                        const searchQuery = toolBlock.input?.query || userPrompt;

                        try {
                            const results = await executeSearch(searchQuery, toolsConfig.searchConfig, proxyUrl);

                            const resultText = results.length > 0
                                ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
                                : '没有找到相关搜索结果。';

                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: toolBlock.id,
                                content: resultText,
                            });

                            for (const r of results) {
                                allSources.push({ title: r.title, uri: r.url });
                            }
                        } catch (searchErr) {
                            console.error('搜索执行失败:', searchErr.message);
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: toolBlock.id,
                                content: '搜索失败，请直接回答用户的问题。',
                            });
                        }
                    }
                }

                // 第 2 轮：流式请求，附带搜索结果
                const round2Messages = [
                    ...messages,
                    { role: 'assistant', content: round1Data.content },
                    { role: 'user', content: toolResults },
                ];

                const round2Res = await proxyFetch(url, {
                    method: 'POST',
                    headers: commonHeaders,
                    body: JSON.stringify({
                        ...baseParams,
                        messages: round2Messages,
                        stream: true,
                    }),
                }, proxyUrl);

                if (!round2Res.ok) {
                    const errorText = await round2Res.text();
                    console.error('Claude Function Calling 第2轮错误:', round2Res.status, errorText);
                    return errorResponse(round2Res.status, errorText);
                }

                // 流式转发 + 前置发送搜索来源
                return streamClaudeResponse(round2Res, allSources);
            }

            // 模型没调用工具 → 直接把非流式结果包装成 SSE 返回
            const encoder = new TextEncoder();
            const textContent = (round1Data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
            const thinkingContent = (round1Data.content || []).filter(b => b.type === 'thinking').map(b => b.thinking).join('');
            const stream = new ReadableStream({
                start(controller) {
                    if (thinkingContent) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: thinkingContent })}\n\n`));
                    }
                    if (textContent) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: textContent })}\n\n`));
                    }
                    if (round1Data.usage) {
                        const cachedTokens = (round1Data.usage.cache_read_input_tokens || 0);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            usage: {
                                promptTokens: round1Data.usage.input_tokens || 0,
                                completionTokens: round1Data.usage.output_tokens || 0,
                                totalTokens: (round1Data.usage.input_tokens || 0) + (round1Data.usage.output_tokens || 0),
                                cachedTokens,
                            }
                        })}\n\n`));
                    }
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                },
            });
            return new Response(stream, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
            });
        }

        // ===== 普通流式请求（无搜索）=====
        const requestBody = {
            ...baseParams,
            messages,
            stream: true,
        };

        const response = await proxyFetch(url, {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify(requestBody),
        }, proxyUrl);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Claude API 错误:', response.status, errorText);
            return errorResponse(response.status, errorText);
        }

        return streamClaudeResponse(response);

    } catch (error) {
        console.error('Claude 接口错误:', error);
        return new Response(
            JSON.stringify({ error: '网络连接失败，请检查 API 地址是否正确' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// ===== 错误响应 =====
function errorResponse(status, errorText = '') {
    const errorMessages = {
        401: 'API Key 无效或已过期，请检查后重新填写',
        403: 'API Key 无权限或已被禁用',
        429: '请求频率过高或额度不足，请稍后再试',
        529: 'Anthropic API 过载，请稍后再试',
    };

    let errMsg = errorMessages[status];

    if (!errMsg && errorText) {
        try {
            const errObj = JSON.parse(errorText);
            const msg = errObj?.error?.message || '';
            const code = errObj?.error?.code || '';
            if (code === 'insufficient_user_quota' || msg.includes('额度') || msg.includes('quota')) {
                errMsg = 'API 账户余额不足，请充值后重试';
            } else if (msg.includes('Context window is full') || msg.includes('context_length') || msg.includes('too many tokens')) {
                errMsg = '上下文过长：设定集 + 前文 + 对话内容超出模型上下文窗口，请减少勾选的参考内容或清空对话历史';
            } else if (msg.includes('too long') || msg.includes('maximum context length')) {
                errMsg = '输入内容过长，请减少勾选的参考内容或缩短对话历史';
            } else if (msg) {
                errMsg = `Claude 服务错误：${msg}`;
            }
        } catch { /* ignore */ }
    }
    if (!errMsg) errMsg = `Claude 服务返回错误(${status})，请检查 API 配置`;

    return new Response(
        JSON.stringify({ error: errMsg }),
        { status, headers: { 'Content-Type': 'application/json' } }
    );
}

// ===== 流式转发 Claude SSE 响应（可选前置搜索来源）=====
function streamClaudeResponse(response, sources = null) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
        async start(controller) {
            // 先发送搜索来源（如果有）
            if (sources && sources.length > 0) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ grounding: sources })}\n\n`));
            }

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

                                // 消息结束 — 提取 usage（含缓存 token）
                                if (eventType === 'message_delta') {
                                    const usage = json.usage;
                                    if (usage) {
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                            usage: {
                                                promptTokens: 0,
                                                completionTokens: usage.output_tokens || 0,
                                                totalTokens: usage.output_tokens || 0,
                                            }
                                        })}\n\n`));
                                    }
                                }

                                // message_start 事件中包含 input tokens + 缓存 tokens
                                if (eventType === 'message_start') {
                                    const usage = json.message?.usage;
                                    if (usage?.input_tokens) {
                                        const cachedTokens = usage.cache_read_input_tokens || 0;
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                            usage: {
                                                promptTokens: usage.input_tokens || 0,
                                                completionTokens: 0,
                                                totalTokens: usage.input_tokens || 0,
                                                cachedTokens,
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
}
