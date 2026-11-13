import { withApiResources } from '../../lib/api-resource-guard.js';
import { createGenerationLifecycle, generationAbortResponse } from '../../lib/ai-request-lifecycle.js';
import { streamAiResponse, createOpenAiMapper } from '../../lib/ai-stream.js';
// OpenAI 兼容 API — 按下游读取速度转发 SSE，并传递取消信号
// 支持智谱、DeepSeek、OpenAI、Moonshot 等所有兼容 OpenAI 格式的 API
// 支持 Function Calling 搜索循环 + OpenAI 内置搜索

export const runtime = 'nodejs';
// 托管层也要为长篇上下文处理和完整流式回复留出时间。
export const maxDuration = 300;

import { applyContentSafety } from '../../lib/content-safety';
import { proxyFetch } from '../../lib/proxy-fetch';
import { rotateKey } from '../../lib/keyRotator';
import { isOutboundRequestBlocked, isServerCredentialBlocked, resolveAiCredential, safeUpstreamDetail } from '../../lib/server-security.mjs';
import { buildDeepSeekWebToolsParams, buildOpenAiCompatibleParams, isDeepSeekRequest, isDeepSeekThinkingMode } from '../../lib/ai-model-rules.js';
import { isInsufficientBalanceError } from '../../lib/ai-upstream-errors.js';
import { assertReadableAfterSearch, createToolRoundGuard, formatWebpageForModel, readableUrlKey, runDeepSeekFetch, runDeepSeekSearch, searchFailureToolText } from '../../lib/web-search.js';

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

// 模型调用了没有提供的工具时的回复；每个 tool_call 都要有对应的 tool 消息，否则下一轮会被服务商拒绝
const UNAVAILABLE_TOOL_TEXT = '这个工具不可用，请直接回答用户的问题。';

// 读取网页工具：只在搜索工具是 DeepSeek 且用户开启时提供
const READ_WEBPAGE_TOOL = {
    type: 'function',
    function: {
        name: 'read_webpage',
        description: 'Read the full text of a web page. Use this when the user gives a link, or when you need the complete content of a specific page rather than a short search summary.',
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'The full http or https URL of the page to read',
                },
            },
            required: ['url'],
        },
    },
};

function getCachedPromptTokens(usage) {
    if (!usage) return 0;
    return usage.prompt_cache_hit_tokens
        || usage.prompt_tokens_details?.cached_tokens
        || 0;
}

function getCacheMissPromptTokens(usage, cachedTokens = getCachedPromptTokens(usage)) {
    if (!usage) return 0;
    if (usage.prompt_cache_miss_tokens != null) return usage.prompt_cache_miss_tokens;
    const promptTokens = usage.prompt_tokens || 0;
    return Math.max(0, promptTokens - cachedTokens);
}

// ===== 内联搜索执行（避免 Edge Runtime 自引用 fetch 问题）=====
async function executeSearch(query, searchConfig, proxyUrl, signal) {
    const provider = searchConfig.provider || 'tavily';
    searchConfig.apiKey = rotateKey(searchConfig.apiKey);
    switch (provider) {
        case 'tavily': {
            const tavilyBase = (searchConfig.baseUrl || 'https://api.tavily.com').replace(/\/$/, '');
            const res = await proxyFetch(`${tavilyBase}/search`, {
                method: 'POST', signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: searchConfig.apiKey, query, max_results: 5, include_answer: false }),
            }, proxyUrl);

            if (!res.ok) { await res.body?.cancel().catch(() => {}); console.error('Tavily Search error:', res.status); return []; }
            const data = await res.json();
            return (data.results || []).map(item => ({ title: item.title || '', url: item.url || '', snippet: item.content || '' }));
        }
        case 'exa': {
            const exaBase = (searchConfig.baseUrl || 'https://api.exa.ai').replace(/\/$/, '');
            const res = await proxyFetch(`${exaBase}/search`, {
                method: 'POST', signal,
                headers: { 'Content-Type': 'application/json', 'x-api-key': searchConfig.apiKey },
                body: JSON.stringify({ query, type: 'auto', numResults: 5, contents: { highlights: { numSentences: 3 } } }),
            }, proxyUrl);

            if (!res.ok) { await res.body?.cancel().catch(() => {}); console.error('Exa Search error:', res.status); return []; }
            const data = await res.json();
            return (data.results || []).map(item => ({ title: item.title || '', url: item.url || '', snippet: (item.highlights || []).join(' ') || item.text || '' }));
        }
        case 'deepseek':
            // 地址由客户端传入（留空时客户端补 DeepSeek 服务商地址），失败时抛 SearchProviderError
            return runDeepSeekSearch({
                query, apiKey: searchConfig.apiKey, baseUrl: searchConfig.baseUrl, signal,
                fetchImpl: (url, options) => proxyFetch(url, options, proxyUrl),
            });
        default: return [];
    }
}

// DeepSeek 读取网页：由 DeepSeek 服务端抓取目标网址，这里只把网址发给 DeepSeek
async function executeReadWebpage(pageUrl, searchConfig, proxyUrl, signal) {
    searchConfig.apiKey = rotateKey(searchConfig.apiKey);
    return runDeepSeekFetch({
        url: pageUrl, apiKey: searchConfig.apiKey, baseUrl: searchConfig.baseUrl, signal,
        fetchImpl: (url, options) => proxyFetch(url, options, proxyUrl),
    });
}

function parseToolArguments(toolCall) {
    try { return JSON.parse(toolCall.function?.arguments || '{}') || {}; } catch { return {}; }
}

async function handlePOST(request) {
    const lifecycle = createGenerationLifecycle(request.signal);
    const { signal } = lifecycle;
    try {
        signal.throwIfAborted();
        const { systemPrompt, userPrompt, apiConfig, maxTokens, temperature, topP, reasoningEffort, tools: toolsConfig } = await request.json();
        const proxyUrl = apiConfig?.proxyUrl || '';

        const credential = resolveAiCredential({
            request,
            clientApiKey: apiConfig?.apiKey,
            clientBaseUrl: apiConfig?.baseUrl,
            envApiKey: process.env.API_KEY || process.env.ZHIPU_API_KEY,
            envBaseUrl: process.env.API_BASE_URL,
        });
        const apiKey = rotateKey(credential.apiKey);
        const baseUrl = credential.baseUrl;
        const model = apiConfig?.model || process.env.API_MODEL || 'glm-4.7-flash';

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: '请先配置 API Key。点击左下角 ⚙️ → API配置，填入你的 Key', code: 'NO_API_KEY_CONFIG' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (!baseUrl) {
            return new Response(
                JSON.stringify({ error: '请先填写 OpenAI 兼容端点地址（通常以 /v1 结尾）', code: 'NO_BASE_URL_OPENAI' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        };

        const baseParams = buildOpenAiCompatibleParams({ model, maxTokens, temperature, topP, reasoningEffort });
        const keepReasoningContentForTools = isDeepSeekThinkingMode(apiConfig, baseUrl, model, reasoningEffort);
        const shouldIncludeStreamUsage = toolsConfig?.webSearch || isDeepSeekRequest(apiConfig, baseUrl, model);

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
            const canReadWebpage = toolsConfig.searchConfig.provider === 'deepseek' && toolsConfig.searchConfig.readWebpage === true;
            // 搜完再读：看完搜索结果后再挑网页读全文（独立开关）
            const canReadAfterSearch = canReadWebpage && toolsConfig.searchConfig.readAfterSearch === true;
            // 第 1 轮：非流式请求，附带搜索工具定义
            const round1Res = await proxyFetch(url, {
                method: 'POST', signal,
                headers,
                body: JSON.stringify({
                    model, messages, ...baseParams,
                    tools: canReadWebpage ? [WEB_SEARCH_TOOL, READ_WEBPAGE_TOOL] : [WEB_SEARCH_TOOL],
                }),
            }, proxyUrl);

            if (!round1Res.ok) {
                const errorText = await round1Res.text();
                console.error('Function Calling 第1轮错误:', round1Res.status);
                return errorResponse(round1Res.status, errorText);
            }

            const round1Data = await round1Res.json();
            signal.throwIfAborted();
            const assistantMsg = round1Data.choices?.[0]?.message;

            // 检查模型是否要求搜索
            if (assistantMsg?.tool_calls?.length > 0) {
                // 清理 assistant message：确保 content 为字符串（而非 null）
                // DeepSeek 推理模型在 tool_calls 时 content 为 null，传回会导致 Round 2 不产出内容
                const cleanToolCallMessage = message => {
                    const cleaned = { ...message, content: message.content || '' };
                    if (!keepReasoningContentForTools) {
                        // 非 DeepSeek 思考模式维持旧兼容逻辑，避免中转不接受 reasoning_content。
                        delete cleaned.reasoning_content;
                    }
                    return cleaned;
                };
                const toolMessage = (toolCall, content) => ({ role: 'tool', tool_call_id: toolCall.id, content });
                // 收集搜索结果和来源
                const extendedMessages = [...messages, cleanToolCallMessage(assistantMsg)];
                const allSources = [];
                // 一次回答里所有工具调用共用：限速、余额不足、Key 无效后直接用同一个错误回复模型；读取网页有上限
                const toolGuard = createToolRoundGuard();
                // 搜索结果里出现过的网址，"搜完再读"时只允许读这些
                const searchResultUrls = new Set();

                // 读取一个网页，返回交给模型的文字；传入 allowedUrls 时只允许读其中的网址
                const readWebpageForModel = async (pageUrl, allowedUrls) => {
                    try {
                        if (allowedUrls) assertReadableAfterSearch(pageUrl, allowedUrls);
                        toolGuard.assertAvailable('fetch');
                        const page = await executeReadWebpage(pageUrl, toolsConfig.searchConfig, proxyUrl, signal);
                        if (!allSources.some(source => source.uri === page.url)) {
                            allSources.push({ title: page.title || page.url, uri: page.url });
                        }
                        return formatWebpageForModel(page);
                    } catch (fetchErr) {
                        signal.throwIfAborted();
                        if (!toolGuard.isKnown(fetchErr)) console.error('读取网页失败:', fetchErr?.code || fetchErr?.name || 'UNKNOWN');
                        toolGuard.record('fetch', fetchErr);
                        return searchFailureToolText(fetchErr, 'fetch');
                    }
                };

                for (const toolCall of assistantMsg.tool_calls) {
                    const toolName = toolCall.function?.name;
                    const args = parseToolArguments(toolCall);

                    if (toolName === 'web_search') {
                        const searchQuery = args.query || userPrompt;

                        // 直接内联执行搜索（不通过 HTTP 调用自身）
                        try {
                            toolGuard.assertAvailable('search');
                            const results = await executeSearch(searchQuery, toolsConfig.searchConfig, proxyUrl, signal);

                            const resultText = results.length > 0
                                ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
                                : '没有找到相关搜索结果。';

                            extendedMessages.push(toolMessage(toolCall, resultText));

                            for (const r of results) {
                                allSources.push({ title: r.title, uri: r.url });
                                const key = readableUrlKey(r.url);
                                if (key) searchResultUrls.add(key);
                            }
                        } catch (searchErr) {
                            signal.throwIfAborted();
                            if (!toolGuard.isKnown(searchErr)) console.error('搜索执行失败:', searchErr?.code || searchErr?.name || 'UNKNOWN');
                            toolGuard.record('search', searchErr);
                            extendedMessages.push(toolMessage(toolCall, searchFailureToolText(searchErr, 'search')));
                        }
                    } else if (toolName === 'read_webpage' && canReadWebpage) {
                        extendedMessages.push(toolMessage(toolCall, await readWebpageForModel(args.url)));
                    } else {
                        extendedMessages.push(toolMessage(toolCall, UNAVAILABLE_TOOL_TEXT));
                    }
                }

                // 搜完再读：模型看完搜索结果后可以再挑网页读全文，只能读搜索结果里出现过的网址
                if (canReadAfterSearch && searchResultUrls.size > 0 && toolGuard.canUse('fetch')) {
                    const pickRes = await proxyFetch(url, {
                        method: 'POST', signal,
                        headers,
                        body: JSON.stringify({
                            model, messages: extendedMessages, ...baseParams,
                            tools: [READ_WEBPAGE_TOOL],
                        }),
                    }, proxyUrl);

                    if (!pickRes.ok) {
                        const errorText = await pickRes.text();
                        console.error('Function Calling 挑选网页轮错误:', pickRes.status);
                        return errorResponse(pickRes.status, errorText);
                    }

                    const pickData = await pickRes.json();
                    signal.throwIfAborted();
                    const pickMsg = pickData.choices?.[0]?.message;
                    if (!(pickMsg?.tool_calls?.length > 0)) {
                        // 模型看完搜索结果直接作答，这一轮的结果就是最终回答
                        return nonStreamAnswerResponse(pickData, toolEvents(allSources, toolGuard.notices));
                    }

                    extendedMessages.push(cleanToolCallMessage(pickMsg));
                    for (const toolCall of pickMsg.tool_calls) {
                        extendedMessages.push(toolMessage(toolCall, toolCall.function?.name === 'read_webpage'
                            ? await readWebpageForModel(parseToolArguments(toolCall).url, searchResultUrls)
                            : UNAVAILABLE_TOOL_TEXT));
                    }
                }

                // 第 2 轮：流式请求，让模型根据搜索结果回复
                const round2Res = await proxyFetch(url, {
                    method: 'POST', signal,
                    headers,
                    body: JSON.stringify({
                        model, messages: extendedMessages, ...baseParams,
                        stream: true,
                        ...(shouldIncludeStreamUsage ? { stream_options: { include_usage: true } } : {}),
                    }),
                }, proxyUrl);

                if (!round2Res.ok) {
                    const errorText = await round2Res.text();
                    console.error('Function Calling 第2轮错误:', round2Res.status);
                    return errorResponse(round2Res.status, errorText);
                }

                // 流式转发 + 前置发送搜索来源和搜索失败提示
                return streamWithGrounding(round2Res, allSources, lifecycle, toolGuard.notices);
            }

            // 模型没调用工具 → 直接把非流式结果包装成 SSE 返回
            return nonStreamAnswerResponse(round1Data);
        }

        // ===== 普通模式（含 OpenAI 内置搜索、DeepSeek 内置联网） =====
        // DeepSeek 内置联网由 DeepSeek 服务端执行，引用来源在流里以 annotations 返回
        const deepseekWebTools = toolsConfig?.deepseekWebTools && isDeepSeekRequest(apiConfig, baseUrl, model)
            ? toolsConfig.deepseekWebTools : null;
        const response = await proxyFetch(url, {
            method: 'POST', signal,
            headers,
            body: JSON.stringify({
                model, messages, ...baseParams,
                ...(deepseekWebTools
                    ? buildDeepSeekWebToolsParams(deepseekWebTools)
                    : toolsConfig?.webSearch ? { web_search_options: { search_context_size: 'medium' } } : {}),
                stream: true,
                ...(shouldIncludeStreamUsage ? { stream_options: { include_usage: true } } : {}),
            }),
        }, proxyUrl);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API错误:', response.status);
            return errorResponse(response.status, errorText);
        }

        return streamWithGrounding(response, [], lifecycle);

    } catch (error) {
        const aborted = generationAbortResponse(lifecycle);
        if (aborted) return aborted;
        console.error('AI接口错误:', error?.code || error?.name || 'UNKNOWN');
        if (isServerCredentialBlocked(error)) {
            return new Response(
                JSON.stringify({ error: error.message, code: error.code }),
                { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
            );
        }
        if (isOutboundRequestBlocked(error)) {
            return new Response(
                JSON.stringify({ error: error.message, code: error.code }),
                { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
            );
        }
        return new Response(
            JSON.stringify({ error: '网络连接失败，请检查 API 地址是否正确', code: 'NETWORK_ERROR_CHECK' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    } finally {
        if (!lifecycle.streaming) lifecycle.dispose();
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
    let errMsg = '';
    let code = '';
    let detail = '';

    // 余额不足各家状态码不一（402/403/429 都有），先看错误体
    if (isInsufficientBalanceError(errorText)) { errMsg = 'API 账户余额不足，请充值后重试'; code = 'AI_INSUFFICIENT_QUOTA'; }
    else if (status === 401) { errMsg = 'API Key 无效或已过期，请检查后重新填写'; code = 'AI_INVALID_KEY'; }
    else if (status === 429) { errMsg = '请求频率过高或额度不足，请稍后再试'; code = 'AI_RATE_LIMIT'; }

    // 尝试从上游错误体中提取具体原因
    if (!code && errorText) {
        try {
            const errObj = JSON.parse(errorText);
            const msg = safeUpstreamDetail(errObj?.error?.message || '', 300);

            if (msg.includes('额度') || msg.includes('quota')) {
                errMsg = 'API 账户余额不足，请充值后重试'; code = 'AI_INSUFFICIENT_QUOTA';
            } else if (msg.includes('Context window is full') || msg.includes('context_length')) {
                errMsg = '上下文过长：设定集 + 前文 + 对话内容超出模型上下文窗口，请减少勾选的参考内容或清空对话历史'; code = 'AI_CONTEXT_TOO_LONG';
            } else if (msg.includes('too long') || msg.includes('too many tokens') || msg.includes('maximum context length')) {
                errMsg = '输入内容过长，请减少勾选的参考内容或缩短对话历史'; code = 'AI_INPUT_TOO_LONG';
            } else if (msg) {
                errMsg = `AI 服务错误：${msg}`; code = 'AI_SERVICE_ERROR'; detail = msg;
            }
        } catch {
            // JSON 解析失败，使用默认消息
        }
    }

    if (!errMsg) {
        errMsg = `AI服务返回错误(${status})，请检查 API 配置`; code = 'AI_RETURNED_ERROR';
    }

    // 中文兜底文案 + 机器码 code（前端按 code 本地化，detail 为上游原文）
    return new Response(
        JSON.stringify({ error: errMsg, code, status, detail }),
        { status, headers: { 'Content-Type': 'application/json' } }
    );
}

/** 搜索来源和搜索失败提示，放在回答前面发给前端 */
function toolEvents(sources, searchNotices = []) {
    return [
        ...(sources?.length ? [{ grounding: { searchQueries: [], sources, supports: [] } }] : []),
        ...searchNotices.map(searchNotice => ({ searchNotice })),
    ];
}

/** 流式转发上游 SSE 并可选前置 grounding 来源 */
function streamWithGrounding(response, sources, lifecycle, searchNotices = []) {
    return streamAiResponse(response, lifecycle, createOpenAiMapper(), toolEvents(sources, searchNotices));
}

/** 把非流式结果包装成 SSE 返回（模型没调用工具，或看完搜索结果后直接作答） */
function nonStreamAnswerResponse(data, initialEvents = []) {
    const encoder = new TextEncoder();
    const send = (controller, event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    const message = data?.choices?.[0]?.message;
    const content = message?.content || '';
    const thinking = message?.reasoning_content || '';
    const stream = new ReadableStream({
        start(controller) {
            for (const event of initialEvents) send(controller, event);
            if (thinking) send(controller, { thinking });
            if (content) send(controller, { text: content });
            if (data?.usage) {
                const cachedTokens = getCachedPromptTokens(data.usage);
                send(controller, {
                    usage: {
                        promptTokens: data.usage.prompt_tokens || 0,
                        completionTokens: data.usage.completion_tokens || 0,
                        totalTokens: data.usage.total_tokens || 0,
                        cachedTokens,
                        cacheMissTokens: getCacheMissPromptTokens(data.usage, cachedTokens),
                    },
                });
            }
            if (!message || (data.choices?.[0]?.finish_reason && data.choices[0].finish_reason !== 'stop')) {
                controller.enqueue(encoder.encode('data: {"status":"incomplete","code":"AI_STREAM_INCOMPLETE","error":"生成未完成。"}\n\n'));
            } else {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            }
            controller.close();
        },
    });
    return new Response(stream, { headers: sseHeaders() });
}

export const POST = withApiResources('/api/ai', handlePOST);
