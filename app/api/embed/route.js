// OpenAI 兼容 API — 文本向量化 (Text Embeddings)

export const runtime = 'nodejs';

import { proxyFetch } from '../../lib/proxy-fetch';
import { rotateKey } from '../../lib/keyRotator';
import { assertUpstreamUrl } from '../../lib/upstream-guard';

// SSRF 防护：错误响应不再回显上游原始响应体，避免把内网服务返回内容泄露给客户端
function safeEmbedFailure(status, { provider, model }) {
    let hintCode = '';
    if (status === 401 || status === 403) hintCode = 'EMBED_HINT_AUTH';
    else if (status === 404) hintCode = 'EMBED_HINT_ADDR';
    else if (status === 429) hintCode = 'EMBED_HINT_RATE';
    const hintMap = {
        EMBED_HINT_AUTH: '请检查 Embedding API Key 是否正确，并确认该 Key 有调用当前嵌入模型的权限。',
        EMBED_HINT_ADDR: '请检查 Embedding API 地址是否正确。OpenAI 兼容地址通常需要包含 /v1，最终会请求 /embeddings。',
        EMBED_HINT_RATE: '请求过于频繁或额度不足，请稍后重试，或降低重建频率。',
    };
    const prefix = `${provider || 'Embedding'} 模型 ${model || '未指定'} 调用失败 (${status})`;
    return Response.json({
        error: [prefix, hintMap[hintCode]].filter(Boolean).join('：'),
        code: 'EMBED_CALL_FAILED',
        provider: provider || '',
        model: model || '',
        status,
        hintCode,
    }, { status });
}

function invalidEmbeddingResponse(provider, model) {
    return Response.json({
        error: `${provider || 'Embedding'} 模型 ${model || '未指定'} 没有返回有效向量，请确认选择的是 Embedding 模型而不是对话模型。`,
        code: 'EMBED_NO_VECTOR',
        provider: provider || '',
        model: model || '',
    }, { status: 502 });
}

function normalizeOpenAIBaseUrl(rawBaseUrl) {
    let base = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
    if (!base) return base;

    const endpointSuffixes = ['/chat/completions', '/embeddings', '/responses', '/models'];
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

function getDefaultEmbeddingModel(provider) {
    if (provider === 'zhipu') return 'embedding-3';
    if (provider === 'bailian' || provider === 'qwen') return 'text-embedding-v4';
    if (provider === 'openai') return 'text-embedding-3-small';
    if (provider === 'gemini') return 'text-embedding-004';
    return '';
}

export async function POST(request) {
    try {
        const { text, apiConfig } = await request.json();
        const proxyUrl = apiConfig?.proxyUrl || '';
        const isCustomEmbed = apiConfig?.useCustomEmbed;
        const provider = isCustomEmbed
            ? apiConfig.embedProvider
            : (apiConfig?.providerType || apiConfig?.provider || 'zhipu');
        const apiKey = rotateKey(isCustomEmbed ? (apiConfig.embedApiKey || apiConfig?.apiKey) : apiConfig?.apiKey);
        const rawBaseUrl = isCustomEmbed ? apiConfig.embedBaseUrl : apiConfig?.baseUrl;
        const baseUrl = normalizeOpenAIBaseUrl(rawBaseUrl);

        if (!baseUrl) {
            return Response.json({ error: '请先填写 Embedding 兼容 API 地址', code: 'NO_BASE_URL_EMBED' }, { status: 400 });
        }

        const embedModelName = isCustomEmbed
            ? (apiConfig.embedModel || getDefaultEmbeddingModel(provider))
            : (apiConfig.embedModel || getDefaultEmbeddingModel(provider));

        // SSRF 防护：校验用户可控的 baseUrl（仅放行公网 http/https；本机请求可放行私网）
        const guard = assertUpstreamUrl(baseUrl, request);
        if (!guard.ok) {
            return Response.json({ error: guard.error, code: guard.code }, { status: guard.status });
        }

        if (!embedModelName) {
            return Response.json({ error: '请先选择或填写 Embedding 模型', code: 'NO_EMBED_MODEL' }, { status: 400 });
        }
        if (!apiKey) {
            return Response.json({ error: isCustomEmbed ? '请在 API 配置中填写独立的 Embedding API Key' : '请先配置 API Key', code: isCustomEmbed ? 'NO_EMBED_KEY' : 'NO_API_KEY_FOR_EMBED' }, { status: 400 });
        }
        if (!text || typeof text !== 'string') {
            return Response.json({ error: '无效的文本输入', code: 'INVALID_INPUT' }, { status: 400 });
        }

        const urls = baseUrl.endsWith('/v1') || baseUrl.endsWith('/v1beta')
            ? [`${baseUrl}/embeddings`]
            : [`${baseUrl}/embeddings`, `${baseUrl}/v1/embeddings`];
        let lastErrorResponse = null;

        for (const url of urls) {
            const response = await proxyFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    input: text,
                    model: embedModelName,
                    encoding_format: 'float',
                }),
            }, proxyUrl);

            if (!response.ok) {
                lastErrorResponse = response;
                if (response.status !== 404) break;
                continue;
            }

            const data = await response.json();
            const embeddings = data?.data?.[0]?.embedding;
            if (!Array.isArray(embeddings) || embeddings.length === 0) {
                return invalidEmbeddingResponse(provider, embedModelName);
            }
            return Response.json({ embedding: embeddings });
        }

        if (lastErrorResponse) {
            return safeEmbedFailure(lastErrorResponse.status, { provider, model: embedModelName });
        }
        return invalidEmbeddingResponse(provider, embedModelName);
    } catch (error) {
        console.error('Embedding API Error:', error?.message || error);
        // 上游/JS 原文优先；为空时回退中文文案并加 code 供前端本地化
        if (error?.message) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ error: 'Embedding 请求失败', code: 'EMBED_REQUEST_FAILED' }, { status: 500 });
    }
}
