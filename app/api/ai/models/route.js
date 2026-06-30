import { NextResponse } from 'next/server';
import { proxyFetch } from '../../../lib/proxy-fetch';
import { rotateKey } from '../../../lib/keyRotator';
import { assertUpstreamUrl } from '../../../lib/upstream-guard';

// 通用模型列表拉取 — OpenAI 兼容 / Claude 兼容 / Gemini 原生
export async function POST(request) {
    try {
        let { apiKey, baseUrl, provider, embedOnly, proxyUrl } = await request.json();
        apiKey = rotateKey(apiKey);

        if (!apiKey) {
            return NextResponse.json(
                { error: '请先填入 API Key', code: 'NO_API_KEY' },
                { status: 400 }
            );
        }

        // Gemini 原生格式
        if (provider === 'gemini-native') {
            return await fetchGeminiModels(apiKey, baseUrl, embedOnly, proxyUrl, request);
        }

        // Claude 兼容格式
        if (provider === 'claude') {
            return await fetchClaudeModels(apiKey, baseUrl, proxyUrl, request);
        }

        // OpenAI 兼容格式（适用于所有其他供应商）
        return await fetchOpenAIModels(apiKey, baseUrl, embedOnly, provider, proxyUrl, request);

    } catch (error) {
        console.error('拉取模型列表错误:', error);
        return NextResponse.json(
            { error: '网络连接失败，请检查 API 地址', code: 'NETWORK_ERROR' },
            { status: 500 }
        );
    }
}

// 从不同格式的响应中提取模型数组
function extractModelArray(data) {
    // Anthropic 兼容格式也使用 data[]
    if (Array.isArray(data.models)) return data.models;
    // OpenAI 兼容格式: { data: [...] }
    if (Array.isArray(data.data)) return data.data;
    // 部分中转: { results: [...] }
    if (Array.isArray(data.results)) return data.results;
    // 直接是数组
    if (Array.isArray(data)) return data;
    return [];
}

// 部分供应商的 /models 不返回嵌入模型 → 使用已知列表兜底（参考 Cherry Studio 内置模型）
const KNOWN_EMBED_MODELS = {
    zhipu: [{ id: 'embedding-3', displayName: 'Embedding-3' }],
    deepseek: [{ id: 'deepseek-embedding', displayName: 'DeepSeek Embedding' }],
    moonshot: [{ id: 'moonshot-v1-embedding', displayName: 'Moonshot Embedding' }],
    bailian: [
        { id: 'text-embedding-v4', displayName: 'Text Embedding v4' },
        { id: 'text-embedding-v3', displayName: 'Text Embedding v3' },
        { id: 'text-embedding-v2', displayName: 'Text Embedding v2' },
    ],
    qwen: [
        { id: 'text-embedding-v4', displayName: 'Text Embedding v4' },
        { id: 'text-embedding-v3', displayName: 'Text Embedding v3' },
        { id: 'text-embedding-v2', displayName: 'Text Embedding v2' },
    ],
    baidu: [{ id: 'bce-reranker-base_v1', displayName: 'BCE Reranker Base' }, { id: 'tao-8k', displayName: 'Tao 8K' }],
    doubao: [{ id: 'doubao-embedding', displayName: 'Doubao Embedding' }],
    baichuan: [{ id: 'Baichuan-Text-Embedding', displayName: 'Baichuan Embedding' }],
    hunyuan: [{ id: 'hunyuan-embedding', displayName: 'Hunyuan Embedding' }],
    yi: [{ id: 'yi-embedding', displayName: 'Yi Embedding' }],
    openai: [{ id: 'text-embedding-3-small', displayName: 'Text Embedding 3 Small' }, { id: 'text-embedding-3-large', displayName: 'Text Embedding 3 Large' }, { id: 'text-embedding-ada-002', displayName: 'Ada 002' }],
    siliconflow: [{ id: 'BAAI/bge-m3', displayName: 'BGE-M3' }, { id: 'BAAI/bge-large-zh-v1.5', displayName: 'BGE Large ZH v1.5' }],
};

// OpenAI 兼容格式拉取模型（/v1/models）
// 参考 Cherry Studio：多路径尝试 + 多格式兼容 + 超时处理
function normalizeOpenAIBaseUrl(rawBaseUrl) {
    let base = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
    if (!base) return base;

    const endpointSuffixes = [
        '/chat/completions',
        '/embeddings',
        '/responses',
        '/models',
    ];

    let changed = true;
    while (changed) {
        changed = false;
        const lower = base.toLowerCase();
        for (const suffix of endpointSuffixes) {
            if (lower.endsWith(suffix)) {
                base = base.slice(0, -suffix.length).replace(/\/+$/, '');
                changed = true;
                break;
            }
        }
    }

    return base;
}

async function fetchOpenAIModels(apiKey, baseUrl, embedOnly, provider, proxyUrl, request) {
    const base = normalizeOpenAIBaseUrl(baseUrl);
    if (!base) {
        return NextResponse.json(
            { error: '请先填写 API 地址', code: 'NO_BASE_URL' },
            { status: 400 }
        );
    }

    // SSRF 防护：校验用户可控的 baseUrl（仅放行公网 http/https；本机请求可放行私网）
    const guard = assertUpstreamUrl(base, request);
    if (!guard.ok) {
        return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
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
    let hadNetworkError = false;

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
        } catch {
            // 超时或网络错误：记录下来，避免后面被内置向量模型兜底掩盖了连接问题
            hadNetworkError = true;
            continue;
        }
    }

    if (rawModels.length === 0) {
        // 先如实暴露“请求失败”：HTTP 错误(401/4xx/5xx)或网络超时都不该被内置向量模型兜底掩盖，
        // 否则用户填错 Key/地址仍会看到“可用”的向量模型，真正调用时才失败、难定位。
        if (lastError) return handleFetchError(lastError);
        if (!hadNetworkError && embedOnly) {
            // 仅“连接成功但未返回任何嵌入模型”时才用内置已知向量模型兜底（百炼等不暴露嵌入模型）
            const knownModels = KNOWN_EMBED_MODELS[provider];
            if (knownModels) return NextResponse.json({ models: knownModels });
        }
        return NextResponse.json({ error: '未能获取到模型列表，请检查 API 地址和 Key 是否正确', code: 'MODELS_FETCH_FAILED' }, { status: 404 });
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
            // /models 未返回嵌入模型 → 优先用内置已知列表；都没有则返回空，
            // 让向量供应商只显示向量模型，不再回退混入对话模型（用户可在输入框手填模型名）
            const knownModels = KNOWN_EMBED_MODELS[provider];
            if (knownModels) {
                return NextResponse.json({ models: knownModels });
            }
            return NextResponse.json({ models: [] });
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
            { error: 'API Key 无效或无权限', code: 'INVALID_KEY' },
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

// Claude 兼容模型列表（Anthropic /v1/models 协议）
async function fetchClaudeModels(apiKey, baseUrl, proxyUrl, request) {
    const base = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) {
        return NextResponse.json({ error: '请先填写 Claude 兼容 API 地址', code: 'NO_BASE_URL_CLAUDE' }, { status: 400 });
    }

    // SSRF 防护：校验用户可控的 baseUrl（仅放行公网 http/https；本机请求可放行私网）
    const guard = assertUpstreamUrl(base, request);
    if (!guard.ok) {
        return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
    }

    const endpoint = base.endsWith('/v1') ? base + '/models?limit=100' : base + '/v1/models?limit=100';
    const response = await proxyFetch(endpoint, {
        method: 'GET',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
    }, proxyUrl);

    if (!response.ok) {
        if ([404, 405, 501].includes(response.status)) {
            return NextResponse.json({ models: [
                { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
                { id: 'claude-3-7-sonnet-20250219', displayName: 'Claude 3.7 Sonnet' },
                { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
            ] });
        }
        return handleFetchError(response);
    }

    const data = await response.json();
    const models = extractModelArray(data)
        .map(model => ({
            id: String(model?.id || model?.name || '').trim(),
            displayName: model?.display_name || model?.displayName || model?.id || model?.name || '',
        }))
        .filter(model => model.id)
        .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
}

// Gemini 原生格式模型列表 — 分页拉取（不内置官方默认地址，baseUrl 必填）
async function fetchGeminiModels(apiKey, baseUrl, embedOnly, proxyUrl, request) {
    const base = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) {
        return NextResponse.json({ error: '请先填写 Gemini 原生 API 地址（通常以 /v1beta 结尾）', code: 'NO_BASE_URL_GEMINI' }, { status: 400 });
    }

    // SSRF 防护：校验用户可控的 baseUrl（仅放行公网 http/https；本机请求可放行私网）
    const guard = assertUpstreamUrl(base, request);
    if (!guard.ok) {
        return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
    }

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
            // 首页失败时不带 pageSize 重试（部分中转不支持分页参数）
            if (allModels.length === 0) {
                const fallbackUrl = `${base}/models?key=${apiKey}`;
                const fallbackRes = await proxyFetch(fallbackUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                }, proxyUrl);
                if (!fallbackRes.ok) return handleFetchError(fallbackRes);
                allModels = extractModelArray(await fallbackRes.json());
                break;
            }
            break;
        }

        const data = await response.json();
        allModels = allModels.concat(extractModelArray(data));
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    let models = allModels;
    // 有能力信息时按能力过滤；没有时全部保留
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
        .filter(m => m.id)
        .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
}
