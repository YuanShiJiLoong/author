import { NextResponse } from 'next/server';

// 拉取 Gemini 可用模型列表
export async function POST(request) {
    try {
        const { apiKey, baseUrl } = await request.json();

        if (!apiKey) {
            return NextResponse.json(
                { error: '请填入 API Key' },
                { status: 400 }
            );
        }

        const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
        const url = `${base}/models?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('拉取模型列表失败:', response.status, errorText);

            if (response.status === 401 || response.status === 403) {
                return NextResponse.json(
                    { error: 'API Key 无效或无权限' },
                    { status: 401 }
                );
            }
            return NextResponse.json(
                { error: `拉取失败(${response.status})` },
                { status: response.status }
            );
        }

        const data = await response.json();

        // 过滤出支持 generateContent 的模型
        const models = (data.models || [])
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => ({
                id: m.name?.replace('models/', '') || m.name,
                displayName: m.displayName || m.name,
                description: m.description || '',
                inputTokenLimit: m.inputTokenLimit,
                outputTokenLimit: m.outputTokenLimit,
            }))
            .sort((a, b) => a.id.localeCompare(b.id));

        return NextResponse.json({ models });

    } catch (error) {
        console.error('拉取模型列表错误:', error);
        return NextResponse.json(
            { error: '网络连接失败' },
            { status: 500 }
        );
    }
}
