import { NextResponse } from 'next/server';
import { proxyFetch } from '../../../lib/proxy-fetch';

// 通用模型列表拉取 — 支持 OpenAI 兼容格式和 Gemini 原生格式
export async function POST(request) {
    try {
        const { apiKey, baseUrl, provider, embedOnly, proxyUrl } = await request.json();

        if (!apiKey) {
            return NextResponse.json(
                { error: '请先填入 API Key' },
                { status: 400 }
            );
        }

        // Gemini 原生格式
        if (['gemini-native', 'custom-gemini'].includes(provider)) {
            return await fetchGeminiModels(apiKey, baseUrl, embedOnly, proxyUrl);
        }

        // Claude/Anthropic（多策略拉取）
        if (['claude', 'custom-claude'].includes(provider)) {
            return await fetchClaudeModels(apiKey, baseUrl, proxyUrl);
        }

        // OpenAI 兼容格式（适用于所有其他供应商）
        return await fetchOpenAIModels(apiKey, baseUrl, embedOnly, provider, proxyUrl);

    } catch (error) {
        console.error('拉取模型列表错误:', error);
        return NextResponse.json(
            { error: '网络连接失败，请检查 API 地址' },
            { status: 500 }
        );
    }
}

// Gemini 原生格式拉取模型 — 支持分页，兼容中转
async function fetchGeminiModels(apiKey, baseUrl, embedOnly, proxyUrl) {
    const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    let allModels = [];
    let pageToken = '';

    // 循环分页拉取
    do {
        const url = `${base}/models?key=${apiKey}&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;

        const response = await proxyFetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        }, proxyUrl);

        if (!response.ok) {
            // 分页请求失败时，尝试不带 pageSize 参数（有些中转不支持）
            if (allModels.length === 0) {
                const fallbackUrl = `${base}/models?key=${apiKey}`;
                const fallbackRes = await proxyFetch(fallbackUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                }, proxyUrl);
                if (!fallbackRes.ok) {
                    return handleFetchError(fallbackRes);
                }
                const fallbackData = await fallbackRes.json();
                allModels = extractModelArray(fallbackData);
                break;
            }
            break;
        }

        const data = await response.json();
        // 兼容不同中转返回格式：models[] 或 data[]
        allModels = allModels.concat(extractModelArray(data));
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    let models = allModels;

    // 过滤逻辑：有 supportedGenerationMethods 时按能力过滤，没有时全部保留
    const hasCapabilityInfo = models.some(m => m.supportedGenerationMethods?.length > 0);

    if (hasCapabilityInfo) {
        if (embedOnly) {
            models = models.filter(m => m.supportedGenerationMethods?.includes('embedContent'));
        } else {
            models = models.filter(m =>
                !m.supportedGenerationMethods ||
                m.supportedGenerationMethods.includes('generateContent') ||
                m.supportedGenerationMethods.includes('embedContent')
            );
        }
    } else if (embedOnly) {
        // 无能力信息时，按名称匹配嵌入模型（同 OpenAI 路径的正则）
        const EMBED_REGEX = /(?:^text-|embed|bge[-_]|bce[-_]|e5[-_]|gte[-_]|jina-clip|jina-embed|voyage-|uae[-_]|retrieval|LLM2Vec)/i;
        const RERANK_REGEX = /(?:rerank|re-rank|re-ranker)/i;
        models = models.filter(m => {
            const id = (m.name || m.id || '');
            return EMBED_REGEX.test(id) && !RERANK_REGEX.test(id);
        });
    }

    models = models.map(m => ({
        id: (m.name?.replace('models/', '') || m.id || m.name || '').trim(),
        displayName: m.displayName || m.display_name || m.name?.replace('models/', '') || m.id || '',
    }))
        .filter(m => m.id) // 过滤掉空 ID
        .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
}

// 从不同格式的响应中提取模型数组
function extractModelArray(data) {
    // Gemini 原生格式: { models: [...] }
    if (Array.isArray(data.models)) return data.models;
    // OpenAI 兼容格式: { data: [...] }
    if (Array.isArray(data.data)) return data.data;
    // 部分中转: { results: [...] }
    if (Array.isArray(data.results)) return data.results;
    // 直接是数组
    if (Array.isArray(data)) return data;
    return [];
}

// OpenAI 兼容格式拉取模型（/v1/models）
// 参考 Cherry Studio：多路径尝试 + 多格式兼容 + 超时处理
async function fetchOpenAIModels(apiKey, baseUrl, embedOnly, provider, proxyUrl) {
    const base = (baseUrl || '').replace(/\/$/, '');
    if (!base) {
        return NextResponse.json(
            { error: '请先填写 API 地址' },
            { status: 400 }
        );
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    };

    // 根据 baseUrl 构建候选路径列表
    // 用户可能填 https://api.example.com/v1 或 https://api.example.com
    const pathsToTry = [];
    if (base.endsWith('/v1') || base.endsWith('/v1beta')) {
        // 已含版本前缀，直接加 /models
        pathsToTry.push(`${base}/models`);
    } else {
        // 不含版本前缀，两种都试
        pathsToTry.push(`${base}/models`);
        pathsToTry.push(`${base}/v1/models`);
    }

    let rawModels = [];
    let lastError = null;

    for (const url of pathsToTry) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const response = await proxyFetch(url, {
                method: 'GET',
                headers,
                signal: controller.signal,
            }, proxyUrl);
            clearTimeout(timeout);

            if (!response.ok) {
                // 保存最后一个错误以便兜底返回
                lastError = response;
                continue;
            }

            const data = await response.json();
            rawModels = extractModelArray(data);
            if (rawModels.length > 0) break;
        } catch (err) {
            // 超时或网络错误，尝试下一个路径
            console.warn(`模型拉取失败 ${url}:`, err.message);
            continue;
        }
    }

    if (rawModels.length === 0) {
        if (lastError) return handleFetchError(lastError);
        return NextResponse.json({ error: '未能获取到模型列表，请检查 API 地址和 Key 是否正确' }, { status: 404 });
    }

    let models = rawModels;

    if (embedOnly) {
        // 参考 Cherry Studio：更全的嵌入模型正则 + rerank 排除
        const EMBED_REGEX = /(?:^text-|embed|bge[-_]|bce[-_]|e5[-_]|gte[-_]|jina-clip|jina-embed|voyage-|uae[-_]|retrieval|LLM2Vec)/i;
        const RERANK_REGEX = /(?:rerank|re-rank|re-ranker)/i;
        const filtered = models.filter(m => {
            const id = m.id || m.name || '';
            return EMBED_REGEX.test(id) && !RERANK_REGEX.test(id);
        });
        if (filtered.length > 0) {
            models = filtered;
        } else {
            // 部分供应商的 /models 不返回嵌入模型 → 使用已知列表（参考 Cherry Studio 内置模型）
            const KNOWN_EMBED_MODELS = {
                zhipu: [{ id: 'embedding-3', displayName: 'Embedding-3' }],
                deepseek: [{ id: 'deepseek-embedding', displayName: 'DeepSeek Embedding' }],
                moonshot: [{ id: 'moonshot-v1-embedding', displayName: 'Moonshot Embedding' }],
                qwen: [{ id: 'text-embedding-v3', displayName: 'Text Embedding v3' }, { id: 'text-embedding-v2', displayName: 'Text Embedding v2' }],
                baidu: [{ id: 'bce-reranker-base_v1', displayName: 'BCE Reranker Base' }, { id: 'tao-8k', displayName: 'Tao 8K' }],
                doubao: [{ id: 'doubao-embedding', displayName: 'Doubao Embedding' }],
                baichuan: [{ id: 'Baichuan-Text-Embedding', displayName: 'Baichuan Embedding' }],
                hunyuan: [{ id: 'hunyuan-embedding', displayName: 'Hunyuan Embedding' }],
                yi: [{ id: 'yi-embedding', displayName: 'Yi Embedding' }],
                openai: [{ id: 'text-embedding-3-small', displayName: 'Text Embedding 3 Small' }, { id: 'text-embedding-3-large', displayName: 'Text Embedding 3 Large' }, { id: 'text-embedding-ada-002', displayName: 'Ada 002' }],
                siliconflow: [{ id: 'BAAI/bge-m3', displayName: 'BGE-M3' }, { id: 'BAAI/bge-large-zh-v1.5', displayName: 'BGE Large ZH v1.5' }],
            };
            const knownModels = KNOWN_EMBED_MODELS[provider];
            if (knownModels) {
                return NextResponse.json({ models: knownModels });
            }
            // 其他供应商：回退显示全部模型让用户自行选择
            console.log('[embedOnly] 过滤后无嵌入模型，回退全部:', rawModels.map(m => m.id || m.name).slice(0, 20));
        }
    }

    models = models.map(m => ({
        id: (m.id || m.name || '').trim(),
        displayName: m.display_name || m.displayName || m.id || m.name || '',
    }))
        .filter(m => m.id) // 过滤空 ID
        .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
}

async function handleFetchError(response) {
    const errorText = await response.text();
    if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
            { error: 'API Key 无效或无权限' },
            { status: 401 }
        );
    }
    let errMsg = `拉取失败(${response.status})`;
    try {
        const errObj = JSON.parse(errorText);
        errMsg = errObj?.error?.message || errMsg;
    } catch { /* ignore */ }
    return NextResponse.json(
        { error: errMsg },
        { status: response.status }
    );
}

// Claude/Anthropic 模型列表 — 多策略拉取
// 策略1: Anthropic 原生 API（直连 api.anthropic.com）
// 策略2: OpenAI 兼容格式（中转/代理）
// 策略3: 预定义列表（兜底）
async function fetchClaudeModels(apiKey, baseUrl, proxyUrl) {
    const base = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');

    // 策略1: 尝试 Anthropic 原生 /v1/models
    if (apiKey) {
        try {
            const models = await tryAnthropicNativeModels(apiKey, base, proxyUrl);
            if (models.length > 0) {
                return NextResponse.json({ models });
            }
        } catch (err) {
            console.warn('Claude native API failed:', err.message);
        }

        // 策略2: 尝试 OpenAI 兼容格式 /v1/models（很多中转用这种格式）
        try {
            const models = await tryOpenAICompatModels(apiKey, base, proxyUrl);
            if (models.length > 0) {
                return NextResponse.json({ models });
            }
        } catch (err) {
            console.warn('Claude OpenAI-compat API failed:', err.message);
        }
    }

    // 策略3: 预定义列表
    const models = [
        { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4' },
        { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
        { id: 'claude-3-7-sonnet-20250219', displayName: 'Claude 3.7 Sonnet' },
        { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
        { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet v2' },
        { id: 'claude-3-5-sonnet-20240620', displayName: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' },
        { id: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku' },
    ];
    return NextResponse.json({ models });
}

// Anthropic 原生格式：x-api-key + anthropic-version header
async function tryAnthropicNativeModels(apiKey, base, proxyUrl) {
    let allModels = [];
    let hasMore = true;
    let afterId = null;

    while (hasMore) {
        let url = `${base}/v1/models?limit=100`;
        if (afterId) url += `&after_id=${afterId}`;

        const response = await proxyFetch(url, {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
        }, proxyUrl);

        if (!response.ok) return [];

        const data = await response.json();
        const pageModels = data.data || [];
        allModels = allModels.concat(pageModels);

        hasMore = data.has_more === true;
        if (hasMore && pageModels.length > 0) {
            afterId = pageModels[pageModels.length - 1].id;
        } else {
            hasMore = false;
        }
    }

    return allModels.map(m => ({
        id: m.id,
        displayName: m.display_name || m.id,
    })).sort((a, b) => a.id.localeCompare(b.id));
}

// OpenAI 兼容格式：Bearer token + /v1/models（多数中转使用此格式）
async function tryOpenAICompatModels(apiKey, base, proxyUrl) {
    // 根据 base 是否已含版本前缀，构建候选路径
    const pathsToTry = [];
    if (base.endsWith('/v1') || base.endsWith('/v1beta')) {
        pathsToTry.push(`${base}/models`);
    } else {
        pathsToTry.push(`${base}/v1/models`);
        pathsToTry.push(`${base}/models`);
    }

    for (const url of pathsToTry) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await proxyFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                signal: controller.signal,
            }, proxyUrl);
            clearTimeout(timeout);

            if (!response.ok) continue;

            const data = await response.json();
            const rawModels = extractModelArray(data);
            if (rawModels.length === 0) continue;

            return rawModels.map(m => ({
                id: (m.id || m.name || '').trim(),
                displayName: m.display_name || m.displayName || m.id || m.name || '',
            }))
                .filter(m => m.id)
                .sort((a, b) => a.id.localeCompare(b.id));
        } catch {
            continue;
        }
    }

    return [];
}
