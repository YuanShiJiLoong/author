import { NextResponse } from 'next/server';
import { proxyFetch } from '../../../lib/proxy-fetch';
import { rotateKey } from '../../../lib/keyRotator';
import { assertUpstreamUrl } from '../../../lib/upstream-guard';

const DEEPSEEK_V4_MODELS = new Set(['deepseek-v4-pro', 'deepseek-v4-flash']);

function isDeepSeekProvider(provider, baseUrl, model) {
    return provider === 'deepseek'
        || (baseUrl || '').includes('api.deepseek.com')
        || DEEPSEEK_V4_MODELS.has((model || '').trim().toLowerCase());
}

export async function POST(request) {
    try {
        const { apiConfig } = await request.json();
        let { apiKey, baseUrl, model, provider, providerType, apiFormat, proxyUrl } = apiConfig || {};
        apiKey = rotateKey(apiKey);
        provider = providerType || provider;

        if (!apiKey) {
            return NextResponse.json({ success: false, error: '请先填入 API Key', code: 'NO_API_KEY' }, { status: 400 });
        }
        if (!baseUrl) {
            return NextResponse.json({ success: false, error: '请先填写兼容 API 地址', code: 'NO_BASE_URL_COMPAT' }, { status: 400 });
        }
        // SSRF 防护：校验用户可控的 baseUrl（仅放行公网 http/https；本机请求可放行私网）
        const guard = assertUpstreamUrl(baseUrl, request);
        if (!guard.ok) {
            return NextResponse.json({ success: false, error: guard.error, code: guard.code }, { status: guard.status });
        }
        if (provider === 'claude' || apiFormat === 'anthropic') {
            return await testClaudeCompatible(apiKey, baseUrl, model, proxyUrl);
        }
        return await testOpenAICompatible(apiKey, baseUrl, model, proxyUrl, provider);
    } catch (error) {
        console.warn('API 测试连接失败:', error?.message || error);
        return NextResponse.json({ success: false, error: '网络连接失败，请检查兼容 API 地址或代理设置', code: 'NETWORK_ERROR_PROXY' });
    }
}

async function testOpenAICompatible(apiKey, baseUrl, model, proxyUrl, provider) {
    const isDeepSeek = isDeepSeekProvider(provider, baseUrl, model);
    const base = String(baseUrl || '').replace(/\/+$/, '');
    const selectedModel = model || (isDeepSeek ? 'deepseek-v4-pro' : 'gpt-4o-mini');
    const isDeepSeekV4 = DEEPSEEK_V4_MODELS.has(selectedModel.trim().toLowerCase());

    const response = await proxyFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: 'user', content: '说"连接成功"' }],
            max_tokens: 20,
            ...(isDeepSeekV4 ? { thinking: { type: 'disabled' } } : {}),
        }),
    }, proxyUrl);

    if (!response.ok) return connectionError(response);
    const data = await response.json();
    return NextResponse.json({
        success: true,
        message: '✅ OpenAI 兼容接口连接成功！',
        model: selectedModel,
        reply: String(data.choices?.[0]?.message?.content || '').trim(),
    });
}

async function testClaudeCompatible(apiKey, baseUrl, model, proxyUrl) {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    const selectedModel = model || 'claude-sonnet-4-20250514';
    const endpoint = base.endsWith('/v1') ? base + '/messages' : base + '/v1/messages';
    const response = await proxyFetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: selectedModel,
            max_tokens: 20,
            messages: [{ role: 'user', content: '说"连接成功"' }],
        }),
    }, proxyUrl);

    if (!response.ok) return connectionError(response);
    const data = await response.json();
    return NextResponse.json({
        success: true,
        message: '✅ Claude 兼容接口连接成功！',
        model: selectedModel,
        reply: String(data.content?.[0]?.text || '').trim(),
    });
}

async function connectionError(response) {
    const errorText = await response.text();
    let upstream = null;
    try {
        upstream = JSON.parse(errorText)?.error?.message || null;
    } catch { }
    // 上游原文（多为英文）保留、不加 code；仅在回退到自带中文文案时加 code 供前端本地化
    if (upstream) return NextResponse.json({ success: false, error: upstream });
    return NextResponse.json({ success: false, error: `连接失败(${response.status})`, code: 'CONN_FAILED', status: response.status });
}
