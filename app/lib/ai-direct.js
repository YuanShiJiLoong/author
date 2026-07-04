'use client';

// ==================== AI 直连层(直连优先,代发兜底) ====================
// 官方网页版(basePath 子路径部署)默认启用:浏览器直接调用用户配置的 AI 服务商
// (实测智谱/DeepSeek/Moonshot/硅基流动/OpenAI/Gemini/Anthropic 均放行浏览器跨域),
// 提示词与 API Key 不经过官方服务器;直连失败(跨域/网络)自动回落到本应用的
// 服务端代理路由(apiPath 补 basePath 前缀)。
// 开源/桌面/本地开发(无 basePath)默认仍走本地代理,行为与历史版本完全一致。
// localStorage 'author-ai-direct' = '1' / '0' 可强制开 / 关(调试与逃生开关)。
//
// ⚠️ 直连的请求拼装与 SSE 协议转换必须与 app/api/ai/route.js 保持一致(那边是唯一
// 真相源):上游 OpenAI 流 → 应用简化协议 {thinking}/{text}/{usage}/{grounding}/[DONE]。
// 直连遇到非 2xx 不在客户端翻译错误,直接回落代发,由服务端产出带 code 的本地化错误。

import { apiPath, BASE_PATH } from './api-base';
import { rotateKey } from './keyRotator';
import { applyContentSafety } from './content-safety';

// ===== 以下工具函数镜像自 app/api/ai/route.js =====

const DEEPSEEK_V4_MODELS = new Set(['deepseek-v4-pro', 'deepseek-v4-flash']);

function normalizeModel(model) {
    return (model || '').trim().toLowerCase();
}

function isDeepSeekRequest(apiConfig, baseUrl, model) {
    const provider = (apiConfig?.providerType || apiConfig?.provider || '').toLowerCase();
    return provider === 'deepseek'
        || (baseUrl || '').includes('api.deepseek.com')
        || DEEPSEEK_V4_MODELS.has(normalizeModel(model));
}

function isDeepSeekV4Model(model) {
    return DEEPSEEK_V4_MODELS.has(normalizeModel(model));
}

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

function buildBaseParams({ model, maxTokens, temperature, topP, reasoningEffort }) {
    const isV4 = isDeepSeekV4Model(model);
    const thinkingType = isV4 ? (reasoningEffort === 'none' ? 'disabled' : 'enabled') : null;
    const thinkingEnabled = thinkingType === 'enabled';

    return {
        ...(temperature != null && !thinkingEnabled ? { temperature } : {}),
        ...(topP != null && !thinkingEnabled ? { top_p: topP } : {}),
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...(thinkingType ? { thinking: { type: thinkingType } } : {}),
        ...(reasoningEffort && reasoningEffort !== 'auto' && !(isV4 && reasoningEffort === 'none') ? { reasoning_effort: reasoningEffort } : {}),
    };
}

// ===== 开关与资格判断 =====

/** 是否直连优先:官方子路径部署默认开;localStorage 可强制开/关。 */
export function preferDirectAi() {
    if (typeof window === 'undefined') return false;
    try {
        const flag = window.localStorage.getItem('author-ai-direct');
        if (flag === '1') return true;
        if (flag === '0') return false;
    } catch { /* ignore */ }
    return Boolean(BASE_PATH);
}

/** 本次请求能否直连:仅 OpenAI 兼容族、未配自定义代理、未用服务端搜索循环、配置齐全、非已知跨域封锁的服务商。 */
function isDirectEligible(payload) {
    const cfg = payload?.apiConfig || {};
    if (cfg.proxyUrl) return false;                       // 浏览器用不了自定义 HTTP 代理
    if (payload?.tools?.functionSearch) return false;     // Function Calling 搜索循环在服务端执行
    const baseUrl = String(cfg.baseUrl || '').trim();
    if (!baseUrl || !cfg.apiKey) return false;            // 配置缺失交给代发,出带 code 的本地化提示
    if (/volces\.com|volcengine/i.test(baseUrl)) return false; // 火山引擎不放行浏览器跨域(实测)
    return true;
}

// ===== 上游 OpenAI SSE → 应用简化协议(镜像 route.js streamWithGrounding) =====

function sseHeaders() {
    return {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    };
}

function transformOpenAiStream(upstreamRes) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
        async start(controller) {
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

                                const reasoning = delta?.reasoning_content;
                                if (reasoning) {
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: reasoning })}\n\n`));
                                }

                                const content = delta?.content;
                                if (content) {
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
                                }

                                if (json.usage) {
                                    const cachedTokens = getCachedPromptTokens(json.usage);
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                        usage: {
                                            promptTokens: json.usage.prompt_tokens || 0,
                                            completionTokens: json.usage.completion_tokens || 0,
                                            totalTokens: json.usage.total_tokens || 0,
                                            cachedTokens,
                                            cacheMissTokens: getCacheMissPromptTokens(json.usage, cachedTokens),
                                        }
                                    })}\n\n`));
                                }

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
                controller.close();
            } catch (err) {
                // 中断(用户停止)或网络错误:向下游传播,保持与代发路径一致的中止语义
                try { controller.error(err); } catch { /* 已关闭 */ }
            } finally {
                try { reader.releaseLock(); } catch { /* ignore */ }
            }
        }
    });

    return new Response(stream, { headers: sseHeaders() });
}

// ===== 直连请求(镜像 route.js 普通模式的请求拼装) =====

async function directOpenAiFetch(payload, signal) {
    const apiConfig = payload?.apiConfig || {};
    const apiKey = rotateKey(apiConfig.apiKey);
    const baseUrl = String(apiConfig.baseUrl || '').trim();
    const model = apiConfig.model || 'glm-4-flash';
    const { systemPrompt, userPrompt, maxTokens, temperature, topP, reasoningEffort, tools: toolsConfig } = payload;

    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const baseParams = buildBaseParams({ model, maxTokens, temperature, topP, reasoningEffort });
    const shouldIncludeStreamUsage = Boolean(toolsConfig?.webSearch) || isDeepSeekRequest(apiConfig, baseUrl, model);

    const messages = [
        { role: 'system', content: applyContentSafety(systemPrompt) },
        { role: 'user', content: userPrompt },
    ];

    const upstream = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model, messages, ...baseParams,
            ...(toolsConfig?.webSearch ? { web_search_options: { search_context_size: 'medium' } } : {}),
            stream: true,
            ...(shouldIncludeStreamUsage ? { stream_options: { include_usage: true } } : {}),
        }),
        signal,
    });

    // 非 2xx 不在客户端翻译错误:返回 null 触发代发兜底,由服务端复现并产出本地化错误
    if (!upstream.ok || !upstream.body) return null;
    return transformOpenAiStream(upstream);
}

// ===== 对外入口:fetch 的直连替身 =====

/**
 * 与 fetch 同签名的 AI 请求入口。endpoint 传 resolveAiEndpoint() 的裸路径。
 * 直连优先(仅 '/api/ai' OpenAI 兼容族);其余情况走代理路由并自动补 basePath 前缀。
 */
export async function aiFetch(endpoint, init = {}) {
    const proxyRequest = () => fetch(apiPath(endpoint), init);

    if (endpoint !== '/api/ai' || !preferDirectAi()) return proxyRequest();

    let payload = null;
    try { payload = JSON.parse(init?.body || 'null'); } catch { /* body 异常则走代发 */ }
    if (!payload || !isDirectEligible(payload)) return proxyRequest();

    try {
        const direct = await directOpenAiFetch(payload, init?.signal);
        if (direct) return direct;
    } catch (err) {
        if (err?.name === 'AbortError') throw err; // 用户主动停止:保持原语义,不回落
        // 跨域 / 网络失败 → 回落服务端代发
    }
    return proxyRequest();
}
