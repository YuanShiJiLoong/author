// Gemini 原生 API & OpenAI 兼容 API — 文本向量化 (Text Embeddings)

export const runtime = 'edge';

export async function POST(request) {
    try {
        const { text, apiConfig } = await request.json();

        const isCustomEmbed = apiConfig?.useCustomEmbed;
        const provider = isCustomEmbed ? apiConfig.embedProvider : (apiConfig?.provider || 'zhipu');
        const apiKey = isCustomEmbed ? (apiConfig.embedApiKey || apiConfig?.apiKey) : apiConfig?.apiKey;

        // 自动识别默认填写或遗留的智谱URL并矫正为对应官方URL
        let defaultBaseUrl = provider === 'gemini-native' ? 'https://generativelanguage.googleapis.com/v1beta' : 'https://open.bigmodel.cn/api/paas/v4';

        let rawBaseUrl;
        if (isCustomEmbed) {
            rawBaseUrl = apiConfig.embedBaseUrl;
        } else {
            // 如果是自定义提供商且没开独立Embed，默认继承对聊的baseUrl
            rawBaseUrl = apiConfig?.baseUrl || defaultBaseUrl;
        }

        if (!rawBaseUrl || (provider === 'gemini-native' && rawBaseUrl.includes('open.bigmodel.cn'))) {
            rawBaseUrl = defaultBaseUrl;
        }

        const baseUrl = rawBaseUrl.replace(/\/$/, '');

        let embedModelName;
        if (isCustomEmbed) {
            embedModelName = apiConfig.embedModel || 'embedding-3';
        } else if (provider === 'custom') {
            // 如果没开独立embed，但选了custom，默认用text-embedding-v3-small或用户主模型
            embedModelName = 'text-embedding-v3-small';
        } else {
            embedModelName = provider === 'zhipu' ? 'embedding-3' : 'text-embedding-v3-small';
        }

        if (!apiKey) {
            return new Response(JSON.stringify({ error: isCustomEmbed ? '请在API配置中填写独立的 Embedding API Key' : '请先配置 API Key' }), { status: 400 });
        }

        if (!text || typeof text !== 'string') {
            return new Response(JSON.stringify({ error: '无效的文本输入' }), { status: 400 });
        }

        let embeddings = [];

        if (provider === 'gemini-native') {
            const geminiModel = embedModelName || 'text-embedding-004';
            const url = `${baseUrl}/models/${geminiModel}:embedContent?key=${apiKey}`;
            console.log('Fetching Gemini Embeddings:', url);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: `models/${geminiModel}`,
                    content: { parts: [{ text }] }
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Gemini Embedding Error: ${errText}`);
            }
            const data = await res.json();
            embeddings = data.embedding.values;
        } else {
            // OpenAI 兼容格式
            const url = `${baseUrl}/embeddings`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    input: text,
                    model: embedModelName
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Embedding API Error: ${errText}`);
            }
            const data = await res.json();
            embeddings = data.data[0].embedding;
        }

        return new Response(JSON.stringify({ embedding: embeddings }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        console.error('Embedding API Error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
