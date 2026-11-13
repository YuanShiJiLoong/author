'use client';

// ==================== AI 直连层(直连优先,代发兜底) ====================
// 官方网页版(显式 official-web 构建目标)默认启用:浏览器直接调用用户配置的 AI 服务商
// (实测智谱/DeepSeek/Moonshot/硅基流动/OpenAI/Gemini/Anthropic 均放行浏览器跨域),
// 提示词与 API Key 不经过官方服务器;直连失败(跨域/网络)自动回落到本应用的
// 服务端代理路由(apiPath 补 basePath 前缀)。
// 开源/桌面/普通自部署默认仍走自身服务端代理,行为与历史版本完全一致。
// localStorage 'author-ai-direct' = '1' / '0' 可强制开 / 关(调试与逃生开关)。
//
// ⚠️ 直连的请求拼装与 SSE 协议转换必须与 app/api/ai/route.js 保持一致(那边是唯一
// 真相源):上游 OpenAI 流 → 应用简化协议 {thinking}/{text}/{usage}/{grounding}/[DONE]。
// 直连遇到非 2xx 不在客户端翻译错误,直接回落代发,由服务端产出带 code 的本地化错误。

import { createGenerationLifecycle, generationAbortResponse } from './ai-request-lifecycle.js';
import { streamAiResponse, createOpenAiMapper } from './ai-stream.js';
import { isInsufficientBalanceError } from './ai-upstream-errors.js';
import { apiPath } from './api-base';
import { IS_OFFICIAL_WEB } from './deployment-target';
import { rotateKey } from './keyRotator';
import { applyContentSafety } from './content-safety';
// 模型识别与参数拼装和 app/api/ai/route.js 共用同一份实现
import { buildDeepSeekWebToolsParams, buildOpenAiCompatibleParams, DEEPSEEK_DEFAULT_MODEL, isDeepSeekRequest } from './ai-model-rules.js';

// ===== 开关与资格判断 =====

/** 是否直连优先:官方网页版构建默认开;localStorage 可强制开/关。 */
export function preferDirectAi() {
    if (typeof window === 'undefined') return false;
    try {
        const flag = window.localStorage.getItem('author-ai-direct');
        if (flag === '1') return true;
        if (flag === '0') return false;
    } catch { /* ignore */ }
    return IS_OFFICIAL_WEB;
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

// ===== 直连请求(镜像 route.js 普通模式的请求拼装) =====

async function directOpenAiFetch(payload, signal) {
    const apiConfig = payload?.apiConfig || {};
    const apiKey = rotateKey(apiConfig.apiKey);
    const baseUrl = String(apiConfig.baseUrl || '').trim();
    const model = apiConfig.model || 'glm-4.7-flash';
    const { systemPrompt, userPrompt, maxTokens, temperature, topP, reasoningEffort, tools: toolsConfig } = payload;

    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const baseParams = buildOpenAiCompatibleParams({ model, maxTokens, temperature, topP, reasoningEffort });
    const shouldIncludeStreamUsage = Boolean(toolsConfig?.webSearch) || isDeepSeekRequest(apiConfig, baseUrl, model);
    const deepseekWebTools = toolsConfig?.deepseekWebTools && isDeepSeekRequest(apiConfig, baseUrl, model)
        ? toolsConfig.deepseekWebTools : null;

    const messages = [
        { role: 'system', content: applyContentSafety(systemPrompt) },
        { role: 'user', content: userPrompt },
    ];

    const lifecycle = createGenerationLifecycle(signal);
    try {
        const upstream = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model, messages, ...baseParams,
                ...(deepseekWebTools
                    ? buildDeepSeekWebToolsParams(deepseekWebTools)
                    : toolsConfig?.webSearch ? { web_search_options: { search_context_size: 'medium' } } : {}),
                stream: true,
                ...(shouldIncludeStreamUsage ? { stream_options: { include_usage: true } } : {}),
            }),
            signal: lifecycle.signal,
        });

        // 非 2xx 不在客户端翻译错误:返回 null 触发代发兜底,由服务端复现并产出本地化错误
        lifecycle.signal.throwIfAborted();
        if (!upstream.ok || !upstream.body) {
            await upstream.body?.cancel().catch(() => {});
            return null;
        }
        return streamAiResponse(upstream, lifecycle, createOpenAiMapper());
    } catch (error) {
        if (lifecycle.signal.reason?.name === 'TimeoutError') return generationAbortResponse(lifecycle);
        throw error;
    } finally {
        if (!lifecycle.streaming) lifecycle.dispose();
    }
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
        if (init.signal?.aborted || err?.name === 'AbortError' || err?.name === 'TimeoutError') throw err; // 用户主动停止:保持原语义,不回落
        // 跨域 / 网络失败 → 回落服务端代发
    }
    return proxyRequest();
}

/**
 * 测试 AI 连接。官方网页版构建中的 DeepSeek 优先从浏览器直连，
 * 与实际对话链路保持一致；桌面版、自定义代理及直连失败时仍走服务端测试路由。
 */
export async function testAiConnection(apiConfig) {
    const normalizedConfig = apiConfig || {};
    const proxyRequest = async () => {
        const response = await fetch(apiPath('/api/ai/test'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: normalizedConfig }),
        });
        return response.json();
    };

    const baseUrl = String(normalizedConfig.baseUrl || '').trim();
    const model = normalizedConfig.model || DEEPSEEK_DEFAULT_MODEL;
    // DeepSeek 预设没有格式切换；忽略旧配置中可能残留的 anthropic 标记。
    const useAnthropicFormat = normalizedConfig.provider === 'claude'
        || (normalizedConfig.apiFormat === 'anthropic' && normalizedConfig.provider !== 'deepseek');
    const canTestDirect = preferDirectAi()
        && !normalizedConfig.proxyUrl
        && !useAnthropicFormat
        && normalizedConfig.apiKey
        && baseUrl
        && isDeepSeekRequest(normalizedConfig, baseUrl, model);

    if (!canTestDirect) return proxyRequest();

    try {
        const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${rotateKey(normalizedConfig.apiKey)}`,
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: '说"连接成功"' }],
                max_tokens: 20,
            }),
        });
        const responseText = await response.text();
        let data = null;
        try { data = JSON.parse(responseText); } catch { /* 上游可能返回纯文本 */ }

        if (!response.ok) {
            if (isInsufficientBalanceError(responseText)) {
                return { success: false, error: 'API 账户余额不足，请充值后重试', code: 'AI_INSUFFICIENT_QUOTA' };
            }
            const upstreamError = data?.error?.message || data?.message || responseText.trim();
            return upstreamError
                ? { success: false, error: upstreamError }
                : { success: false, error: `连接失败(${response.status})`, code: 'CONN_FAILED', status: response.status };
        }

        return {
            success: true,
            message: '✅ DeepSeek 连接成功！',
            model,
            reply: String(data?.choices?.[0]?.message?.content || '').trim(),
        };
    } catch {
        // 浏览器跨域或网络失败时，回落到原有服务端代发测试。
        return proxyRequest();
    }
}
