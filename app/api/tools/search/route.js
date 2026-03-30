// 统一搜索 API — 支持 Google Custom Search / Bing Search / Tavily
// 供 Function Calling 搜索循环调用

export const runtime = 'edge';

import { rotateKey } from '../../../lib/keyRotator';

export async function POST(request) {
    try {
        const { query, searchConfig } = await request.json();

        if (!query) {
            return Response.json({ error: '搜索关键词不能为空' }, { status: 400 });
        }
        if (!searchConfig?.provider || !searchConfig?.apiKey) {
            return Response.json({ error: '请先配置搜索引擎 API Key（设置 → API配置 → 搜索工具）' }, { status: 400 });
        }

        let results = [];
        
        searchConfig.apiKey = rotateKey(searchConfig.apiKey);

        switch (searchConfig.provider) {

            case 'tavily': {
                const tavilyBase = (searchConfig.baseUrl || 'https://api.tavily.com').replace(/\/$/, '');
                const res = await fetch(`${tavilyBase}/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: searchConfig.apiKey,
                        query,
                        max_results: 5,
                        include_answer: false,
                    }),
                });
                if (!res.ok) {
                    const err = await res.text();
                    console.error('Tavily Search error:', res.status, err);
                    return Response.json({ error: `Tavily 搜索失败 (${res.status})` }, { status: res.status });
                }
                const data = await res.json();
                results = (data.results || []).map(item => ({
                    title: item.title || '',
                    url: item.url || '',
                    snippet: item.content || '',
                }));
                break;
            }

            case 'exa': {
                const exaBase = (searchConfig.baseUrl || 'https://api.exa.ai').replace(/\/$/, '');
                const res = await fetch(`${exaBase}/search`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': searchConfig.apiKey,
                    },
                    body: JSON.stringify({
                        query,
                        type: 'auto',
                        numResults: 5,
                        contents: { highlights: { numSentences: 3 } },
                    }),
                });
                if (!res.ok) {
                    const err = await res.text();
                    console.error('Exa Search error:', res.status, err);
                    return Response.json({ error: `Exa 搜索失败 (${res.status})` }, { status: res.status });
                }
                const data = await res.json();
                results = (data.results || []).map(item => ({
                    title: item.title || '',
                    url: item.url || '',
                    snippet: (item.highlights || []).join(' ') || item.text || '',
                }));
                break;
            }

            default:
                return Response.json({ error: `不支持的搜索引擎: ${searchConfig.provider}` }, { status: 400 });
        }

        return Response.json({ results });
    } catch (error) {
        console.error('搜索接口错误:', error);
        return Response.json({ error: '搜索请求失败' }, { status: 500 });
    }
}
