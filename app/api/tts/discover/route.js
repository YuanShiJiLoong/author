export const runtime = 'nodejs';

import { proxyFetch } from '../../../lib/proxy-fetch';
import { assertUpstreamUrl } from '../../../lib/upstream-guard';

const OPENAI_COMMON_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
const GEMINI_COMMON_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];

function jsonError(message, status = 400) {
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function uniqueStrings(values) {
    return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function normalizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('TTS 地址只支持 HTTP 或 HTTPS');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
}

function joinUrl(baseUrl, suffix) {
    return `${baseUrl.replace(/\/+$/, '')}/${String(suffix || '').replace(/^\/+/, '')}`;
}

function discoveryRoot(provider, config, request) {
    const raw = provider === 'gemini' ? config?.baseUrl : config?.endpoint;
    let normalized;
    try {
        normalized = normalizeUrl(raw);
    } catch (e) {
        // 地址格式/协议错误，统一抛出供上层 catch 返回
        throw new Error(e.message || 'TTS 地址无效');
    }
    if (!normalized) return '';
    // SSRF 防护：拒绝私网/保留/元数据地址（本机请求可放行私网）
    const guard = assertUpstreamUrl(normalized, request);
    if (!guard.ok) throw new Error(guard.error);
    const url = new URL(normalized);
    let pathname = url.pathname.replace(/\/+$/, '');
    if (provider === 'gemini') {
        pathname = pathname.replace(/\/models\/[^/]+:generateContent$/i, '');
    } else {
        pathname = pathname
            .replace(/\/audio\/speech$/i, '')
            .replace(/\/text-to-speech(?:\/[^/]+)?$/i, '')
            .replace(/\/tts(?:\/synthesize)?$/i, '')
            .replace(/\/synthesize$/i, '');
    }
    url.pathname = pathname || '/';
    return url.toString().replace(/\/+$/, '');
}

function discoveryEndpoints(provider, config, request) {
    const root = discoveryRoot(provider, config, request);
    if (!root) return { models: [], voices: [] };
    const rootPath = new URL(root).pathname.replace(/\/+$/, '');
    const hasVersion = /\/v\d+(?:beta\d*)?$/i.test(rootPath);
    return {
        models: uniqueStrings([
            joinUrl(root, 'models'),
            ...(hasVersion ? [] : [joinUrl(root, provider === 'gemini' ? 'v1beta/models' : 'v1/models')]),
        ]),
        voices: uniqueStrings([
            joinUrl(root, 'audio/voices'),
            joinUrl(root, 'voices'),
            joinUrl(root, 'tts/voices'),
        ]),
    };
}

function requestHeaders(provider, config, apiKey) {
    const headers = { Accept: 'application/json' };
    if (provider === 'openai-compatible') headers.Authorization = `Bearer ${apiKey}`;
    if (provider === 'gemini') headers['x-goog-api-key'] = apiKey;
    if (provider === 'anthropic-custom') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    }
    if (provider === 'custom') {
        const authType = config?.authType || 'bearer';
        if (authType === 'bearer' && apiKey) headers.Authorization = `Bearer ${apiKey}`;
        if (authType === 'x-api-key' && apiKey) headers['x-api-key'] = apiKey;
        if (authType === 'x-goog-api-key' && apiKey) headers['x-goog-api-key'] = apiKey;
    }
    return headers;
}

function candidateArray(data, kind) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    const direct = kind === 'models' ? data.models : data.voices;
    const nested = kind === 'models'
        ? data.data?.models || data.result?.models
        : data.data?.voices || data.result?.voices;
    if (Array.isArray(direct)) return direct;
    if (Array.isArray(nested)) return nested;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.result)) return data.result;
    return [];
}

function normalizeCandidates(data, kind) {
    const values = candidateArray(data, kind).map(item => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        if (kind === 'models') {
            return item.id || item.name || item.model || item.modelId || item.model_id || item.slug || '';
        }
        return item.voice_id || item.voiceId || item.id || item.name || item.shortName || item.short_name || item.slug || '';
    }).map(value => kind === 'models' ? String(value || '').replace(/^models\//i, '') : value);
    return uniqueStrings(values).slice(0, 200);
}

function preferSpeechModels(models) {
    const speech = models.filter(model => /tts|speech|audio|voice|sonic|kokoro|cosyvoice|fish|orpheus|eleven/i.test(model));
    return speech.length > 0 ? speech : models;
}

async function responseDetail(response) {
    const text = await response.text().catch(() => '');
    try {
        const data = JSON.parse(text);
        return String(data?.error?.message || data?.message || `HTTP ${response.status}`).slice(0, 300);
    } catch {
        return String(text || `HTTP ${response.status}`)
            .replace(/(?:sk-|key[=:\s]*)[A-Za-z0-9_.-]{8,}/gi, '[已隐藏密钥]')
            .slice(0, 300);
    }
}

function failureDetail(status, statusText, detail) {
    const label = `${status} ${statusText || ''}`.trim();
    if (!detail || detail === `HTTP ${status}` || detail === statusText) return label;
    return `${label}：${detail}`;
}

function looksLikeAuthFailure(status, detail) {
    if (status === 401 || status === 403) return true;
    return /(?:api[ _-]?key|access[ _-]?token|credential|auth(?:entication|orization)?).*(?:invalid|missing|incorrect|expired|denied|failed)|(?:invalid|missing|incorrect|expired).*(?:api[ _-]?key|access[ _-]?token|credential)/i.test(detail || '');
}

function isUnsupportedDiscoveryStatus(status) {
    return [400, 404, 405, 406, 415, 422].includes(status);
}

async function fetchCandidates(urls, headers, proxyUrl, kind) {
    let lastDetail = '';
    let reachedEndpoint = false;
    const failures = [];
    for (const url of urls) {
        try {
            const response = await proxyFetch(url, {
                method: 'GET',
                headers,
                cache: 'no-store',
                signal: AbortSignal.timeout(8000),
            }, proxyUrl);
            if (!response.ok) {
                const detail = await responseDetail(response);
                lastDetail = failureDetail(response.status, response.statusText, detail);
                if (looksLikeAuthFailure(response.status, detail)) {
                    return { ok: false, authError: true, items: [], detail: lastDetail, failures };
                }
                failures.push({
                    kind: isUnsupportedDiscoveryStatus(response.status) ? 'unsupported' : 'http',
                    status: response.status,
                    detail: lastDetail,
                });
                continue;
            }
            reachedEndpoint = true;
            const data = await response.json().catch(() => null);
            const items = normalizeCandidates(data, kind);
            if (items.length > 0) return { ok: true, items, endpoint: url };
        } catch (error) {
            lastDetail = error?.name === 'TimeoutError' ? '连接超时' : String(error?.message || '连接失败').slice(0, 200);
            failures.push({ kind: 'network', status: 0, detail: lastDetail });
        }
    }
    return { ok: reachedEndpoint, items: [], detail: lastDetail, failures };
}

export async function POST(request) {
    try {
        const body = await request.json();
        const provider = String(body?.provider || '');
        const config = body?.config && typeof body.config === 'object' ? body.config : {};
        const apiKey = String(body?.apiKey || '').trim();
        if (!['openai-compatible', 'gemini', 'anthropic-custom', 'custom'].includes(provider)) {
            return jsonError('不支持的 TTS 音源类型');
        }

        const authType = provider === 'custom' ? (config.authType || 'bearer') : '';
        if ((provider !== 'custom' || authType !== 'none') && !apiKey) {
            return jsonError('请先填写此音源的 API Key');
        }

        const endpoints = discoveryEndpoints(provider, config, request);
        if (endpoints.models.length === 0) return jsonError('请先填写 TTS 接口地址');
        const headers = requestHeaders(provider, config, apiKey);
        const modelResult = await fetchCandidates(endpoints.models, headers, config.proxyUrl, 'models');
        if (modelResult.authError) return jsonError(`API Key 验证失败：${modelResult.detail}`, 401);

        const voiceResult = await fetchCandidates(endpoints.voices, headers, config.proxyUrl, 'voices');
        if (voiceResult.authError && !modelResult.ok) return jsonError(`API Key 验证失败：${voiceResult.detail}`, 401);
        const discoveredModels = preferSpeechModels(modelResult.items);
        const discoveredVoices = voiceResult.items;
        const knownVoices = provider === 'openai-compatible'
            ? OPENAI_COMMON_VOICES
            : provider === 'gemini'
                ? GEMINI_COMMON_VOICES
                : [];
        const models = uniqueStrings([...discoveredModels, config.model]);
        const voices = discoveredVoices.length > 0
            ? uniqueStrings([...discoveredVoices, config.voice])
            : uniqueStrings([config.voice, ...knownVoices]);
        const discoveryAvailable = modelResult.ok || voiceResult.ok;

        if (!discoveryAvailable) {
            const failures = [...(modelResult.failures || []), ...(voiceResult.failures || [])];
            const directoryUnsupported = failures.length > 0 && failures.every(failure => failure.kind === 'unsupported');
            if (!directoryUnsupported) {
                return jsonError(`连接失败：${modelResult.detail || voiceResult.detail || '无法访问模型或音色目录'}`, 502);
            }
            const detail = modelResult.detail || voiceResult.detail || '目录接口不可用';
            return Response.json({
                connected: false,
                discoveryAvailable: false,
                models,
                voices,
                modelSource: config.model ? 'configured' : 'none',
                voiceSource: knownVoices.length > 0 ? 'known' : (config.voice ? 'configured' : 'none'),
                warning: `当前服务未开放模型/音色目录（${detail}）。这不代表密钥无效；已保留手动模型并列出可用候选。`,
            }, { headers: { 'Cache-Control': 'no-store' } });
        }

        return Response.json({
            connected: true,
            discoveryAvailable: true,
            models,
            voices,
            modelSource: modelResult.items.length > 0 ? 'endpoint' : 'none',
            voiceSource: discoveredVoices.length > 0 ? 'endpoint' : (knownVoices.length > 0 ? 'known' : 'none'),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return jsonError(error?.message || 'TTS 连接失败', 500);
    }
}
