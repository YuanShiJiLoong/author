import { NextResponse } from 'next/server';

// 通用模型列表拉取 — 支持 OpenAI 兼容格式和 Gemini 原生格式
export async function POST(request) {
    try {
        const { apiKey, baseUrl, provider, embedOnly } = await request.json();

        if (!apiKey) {
            return NextResponse.json(
                { error: '请先填入 API Key' },
                { status: 400 }
            );
        }

        // Gemini 原生格式
        if (provider === 'gemini-native') {
            return await fetchGeminiModels(apiKey, baseUrl, embedOnly);
        }

        // Claude/Anthropic（无 /models 端点，返回预定义列表）
        if (provider === 'claude') {
            return fetchClaudeModels();
        }

        // OpenAI 兼容格式（适用于所有其他供应商）
        return await fetchOpenAIModels(apiKey, baseUrl, embedOnly);

    } catch (error) {
        console.error('拉取模型列表错误:', error);
        return NextResponse.json(
            { error: '网络连接失败，请检查 API 地址' },
            { status: 500 }
        );
    }
}

// Gemini 原生格式拉取模型
async function fetchGeminiModels(apiKey, baseUrl, embedOnly) {
    const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const url = `${base}/models?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        return handleFetchError(response);
    }

    const data = await response.json();
    let models = (data.models || []);

    if (embedOnly) {
        models = models.filter(m => m.supportedGenerationMethods?.includes('embedContent'));
    } else {
        models = models.filter(m => m.supportedGenerationMethods?.includes('generateContent') || m.supportedGenerationMethods?.includes('embedContent'));
    }

    models = models.map(m => ({
        id: m.name?.replace('models/', '') || m.name,
        displayName: m.displayName || m.name,
    }))
        .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
}

// OpenAI 兼容格式拉取模型（/v1/models）
async function fetchOpenAIModels(apiKey, baseUrl, embedOnly) {
    const base = (baseUrl || '').replace(/\/$/, '');
    if (!base) {
        return NextResponse.json(
            { error: '请先填写 API 地址' },
            { status: 400 }
        );
    }

    const url = `${base}/models`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
    });

    if (!response.ok) {
        return handleFetchError(response);
    }

    const data = await response.json();
    let models = (data.data || []);

    if (embedOnly) {
        models = models.filter(m => /embed/i.test(m.id));
    }

    models = models.map(m => ({
        id: m.id,
        displayName: m.id,
    }))
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

// Claude/Anthropic 模型列表（预定义，无 API 端点）
function fetchClaudeModels() {
    const models = [
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
