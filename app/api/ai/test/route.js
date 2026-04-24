import { NextResponse } from 'next/server';
import { proxyFetch } from '../../../lib/proxy-fetch';
import { rotateKey } from '../../../lib/keyRotator';

const DEEPSEEK_V4_MODELS = new Set(['deepseek-v4-pro', 'deepseek-v4-flash']);

function isDeepSeekProvider(provider, baseUrl, model) {
    return provider === 'deepseek'
        || (baseUrl || '').includes('api.deepseek.com')
        || DEEPSEEK_V4_MODELS.has((model || '').trim().toLowerCase());
}

// 测试 API 连接（通用 — 支持 OpenAI 兼容格式和 Gemini 原生格式）
export async function POST(request) {
    try {
        const { apiConfig } = await request.json();
        let { apiKey, baseUrl, model, provider, proxyUrl } = apiConfig || {};
        apiKey = rotateKey(apiKey);

        if (!apiKey) {
            return NextResponse.json(
                { success: false, error: '请先填入 API Key' },
                { status: 400 }
            );
        }

        // Gemini 原生格式的测试
        if (['gemini-native', 'custom-gemini'].includes(provider)) {
            return await testGeminiNative(apiKey, baseUrl, model, proxyUrl);
        }

        // OpenAI Responses 格式的测试
        if (provider === 'openai-responses') {
            return await testResponsesAPI(apiKey, baseUrl, model, proxyUrl);
        }

        // Claude/Anthropic 格式的测试
        if (['claude', 'custom-claude'].includes(provider)) {
            return await testClaude(apiKey, baseUrl, model, proxyUrl);
        }

        // OpenAI 兼容格式的测试
        return await testOpenAICompat(apiKey, baseUrl, model, proxyUrl, provider);

    } catch (error) {
        console.warn('API测试连接失败:', error?.message || error);
        return NextResponse.json(
            { success: false, error: '网络连接失败，请检查 API 地址或代理设置' }
        );
    }
}

async function testGeminiNative(apiKey, baseUrl, model, proxyUrl) {
    const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const m = model || 'gemini-2.0-flash';
    const url = `${base}/models/${m}:generateContent?key=${apiKey}`;

    const response = await proxyFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: '说"连接成功"' }] }],
            generationConfig: { maxOutputTokens: 20 },
        }),
    }, proxyUrl);

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `连接失败(${response.status})`;
        try {
            const errObj = JSON.parse(errText);
            errMsg = errObj?.error?.message || errMsg;
        } catch { /* ignore parse error */ }
        return NextResponse.json({ success: false, error: errMsg });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return NextResponse.json({
        success: true,
        message: `✅ Gemini 原生 API 连接成功！`,
        model: m,
        reply: reply.trim(),
    });
}

async function testOpenAICompat(apiKey, baseUrl, model, proxyUrl, provider) {
    const isDeepSeek = isDeepSeekProvider(provider, baseUrl, model);
    const base = (baseUrl || (isDeepSeek ? 'https://api.deepseek.com' : 'https://open.bigmodel.cn/api/paas/v4')).replace(/\/$/, '');
    const m = model || (isDeepSeek ? 'deepseek-v4-pro' : 'gpt-4o-mini');
    const url = `${base}/chat/completions`;
    const isDeepSeekV4 = DEEPSEEK_V4_MODELS.has(m.trim().toLowerCase());

    const response = await proxyFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: m,
            messages: [{ role: 'user', content: '说"连接成功"' }],
            max_tokens: 20,
            ...(isDeepSeekV4 ? { thinking: { type: 'disabled' } } : {}),
        }),
    }, proxyUrl);

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `连接失败(${response.status})`;
        try {
            const errObj = JSON.parse(errText);
            errMsg = errObj?.error?.message || errMsg;
        } catch { /* ignore parse error */ }
        return NextResponse.json({ success: false, error: errMsg });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    return NextResponse.json({
        success: true,
        message: `✅ API 连接成功！`,
        model: m,
        reply: reply.trim(),
    });
}

async function testResponsesAPI(apiKey, baseUrl, model, proxyUrl) {
    const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const m = model || 'gpt-4o-mini';
    const url = `${base}/responses`;

    const response = await proxyFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: m,
            input: '说"连接成功"',
            max_output_tokens: 20,
        }),
    }, proxyUrl);

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `连接失败(${response.status})`;
        try {
            const errObj = JSON.parse(errText);
            errMsg = errObj?.error?.message || errMsg;
        } catch { /* ignore parse error */ }
        return NextResponse.json({ success: false, error: errMsg });
    }

    const data = await response.json();
    const reply = data.output?.[0]?.content?.[0]?.text
        || data.output_text
        || '';

    return NextResponse.json({
        success: true,
        message: `✅ Responses API 连接成功！`,
        model: m,
        reply: reply.trim(),
    });
}

async function testClaude(apiKey, baseUrl, model, proxyUrl) {
    const base = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const m = model || 'claude-sonnet-4-20250514';
    const url = `${base}/v1/messages`;

    const response = await proxyFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: m,
            max_tokens: 20,
            messages: [{ role: 'user', content: '说"连接成功"' }],
        }),
    }, proxyUrl);

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `连接失败(${response.status})`;
        try {
            const errObj = JSON.parse(errText);
            errMsg = errObj?.error?.message || errMsg;
        } catch { /* ignore parse error */ }
        return NextResponse.json({ success: false, error: errMsg });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    return NextResponse.json({
        success: true,
        message: `✅ Claude API 连接成功！`,
        model: m,
        reply: reply.trim(),
    });
}
