import { NextResponse } from 'next/server';

// 通用模型列表拉取 — 支持 OpenAI 兼容格式和 Gemini 原生格式
export async function POST(request) {
    try {
        const { apiKey, baseUrl, provider } = await request.json();

        if (!apiKey) {
            return NextResponse.json(
                { error: '请先填入 API Key' },
                { status: 400 }
            );
        }

        // Gemini 原生格式
        if (provider === 'gemini-native') {
            return await fetchGeminiModels(apiKey, baseUrl);
        }

        // OpenAI 兼容格式（适用于所有其他供应商）
        return await fetchOpenAIModels(apiKey, baseUrl);

    } catch (error) {
        console.error('拉取模型列表错误:', error);
        return NextResponse.json(
            { error: '网络连接失败，请检查 API 地址' },
            { status: 500 }
        );
    }
}

// Gemini 原生格式拉取模型
async function fetchGeminiModels(apiKey, baseUrl) {
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
    const models = (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent') || m.supportedGenerationMethods?.includes('embedContent'))
        .map(m => ({
            id: m.name?.replace('models/', '') || m.name,
            displayName: m.displayName || m.name,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
}

// OpenAI 兼容格式拉取模型（/v1/models）
async function fetchOpenAIModels(apiKey, baseUrl) {
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
    // OpenAI 格式返回 { data: [{id, ...}, ...] }
    const models = (data.data || [])
        .map(m => ({
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
