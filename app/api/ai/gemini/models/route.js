import { NextResponse } from 'next/server';
import { proxyFetch } from '../../../../lib/proxy-fetch';
import { rotateKey } from '../../../../lib/keyRotator';

// 拉取 Gemini 可用模型列表（支持分页，兼容中转）
export async function POST(request) {
    try {
        let { apiKey, baseUrl, proxyUrl } = await request.json();
        apiKey = rotateKey(apiKey);

        if (!apiKey) {
            return NextResponse.json(
                { error: '请填入 API Key' },
                { status: 400 }
            );
        }

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
                // 首页失败时，不带 pageSize 重试（有些中转不支持分页参数）
                if (allModels.length === 0) {
                    const fallbackUrl = `${base}/models?key=${apiKey}`;
                    const fallbackRes = await proxyFetch(fallbackUrl, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                    }, proxyUrl);
                    if (!fallbackRes.ok) {
                        const errorText = await fallbackRes.text();
                        console.error('拉取模型列表失败:', fallbackRes.status, errorText);
                        if (fallbackRes.status === 401 || fallbackRes.status === 403) {
                            return NextResponse.json(
                                { error: 'API Key 无效或无权限' },
                                { status: 401 }
                            );
                        }
                        return NextResponse.json(
                            { error: `拉取失败(${fallbackRes.status})` },
                            { status: fallbackRes.status }
                        );
                    }
                    const fallbackData = await fallbackRes.json();
                    allModels = extractModelArray(fallbackData);
                    break;
                }
                break;
            }

            const data = await response.json();
            allModels = allModels.concat(extractModelArray(data));
            pageToken = data.nextPageToken || '';
        } while (pageToken);

        // 过滤出支持 generateContent 的模型
        // 如果中转没有返回 supportedGenerationMethods，则保留全部模型
        const hasCapabilityInfo = allModels.some(m => m.supportedGenerationMethods?.length > 0);

        let models;
        if (hasCapabilityInfo) {
            models = allModels.filter(m =>
                !m.supportedGenerationMethods ||
                m.supportedGenerationMethods.includes('generateContent')
            );
        } else {
            models = allModels;
        }

        models = models.map(m => ({
            id: (m.name?.replace('models/', '') || m.id || m.name || '').trim(),
            displayName: m.displayName || m.display_name || m.name?.replace('models/', '') || m.id || '',
            description: m.description || '',
            inputTokenLimit: m.inputTokenLimit,
            outputTokenLimit: m.outputTokenLimit,
        }))
            .filter(m => m.id)
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

// 从不同格式的响应中提取模型数组
function extractModelArray(data) {
    if (Array.isArray(data.models)) return data.models;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data)) return data;
    return [];
}
