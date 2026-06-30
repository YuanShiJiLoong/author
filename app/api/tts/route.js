export const runtime = 'nodejs';

import { proxyFetch } from '../../lib/proxy-fetch';
import { assertUpstreamUrl } from '../../lib/upstream-guard';

const GEMINI_MODEL = 'gemini-3.1-flash-tts-preview';

function errorResponse(message, status = 400) {
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function normalizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('TTS 地址只支持 HTTP 或 HTTPS');
    return url.toString().replace(/\/+$/, '');
}

// SSRF 防护：在 normalizeUrl 之上叠加主机校验，拒绝私网/保留/元数据地址
function guardTtsUrl(value, request) {
    const normalized = normalizeUrl(value);
    if (!normalized) return '';
    const guard = assertUpstreamUrl(normalized, request);
    if (!guard.ok) throw new Error(guard.error);
    return normalized;
}

function readPath(source, path) {
    return String(path || 'audio').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function decodeBase64(value) {
    const normalized = String(value || '').replace(/^data:[^;]+;base64,/, '');
    if (!normalized) throw new Error('TTS 接口没有返回音频数据');
    return Buffer.from(normalized, 'base64');
}

function wavFromPcm(pcm) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(24000, 24);
    header.writeUInt32LE(48000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

async function upstreamError(response) {
    const raw = await response.text();
    let detail = '';
    try {
        const parsed = JSON.parse(raw);
        detail = parsed?.error?.message || parsed?.message || '';
    } catch {
        detail = raw;
    }
    return String(detail || `HTTP ${response.status}`)
        .replace(/(?:sk-|key[=:\s]*)[A-Za-z0-9_.-]{8,}/gi, '[已隐藏密钥]')
        .slice(0, 500);
}

function audioResponse(buffer, contentType) {
    return new Response(buffer, {
        headers: {
            'Content-Type': contentType || 'audio/mpeg',
            'Cache-Control': 'no-store',
            'Content-Length': String(buffer.length),
        },
    });
}

async function requestOpenAICompatible(input, config, apiKey, request) {
    if (!apiKey) return errorResponse('请先在本机填写 OpenAI 兼容 API Key');
    let endpoint;
    try {
        endpoint = guardTtsUrl(config.endpoint, request);
    } catch (e) {
        return errorResponse(e.message || 'OpenAI 兼容 TTS 地址无效');
    }
    if (!endpoint) return errorResponse('请先填写 OpenAI 兼容 TTS 完整接口地址');
    const model = String(config.model || 'tts-1').trim();
    const voice = String(config.voice || 'alloy').trim();
    const responseFormat = String(config.responseFormat || 'mp3').trim();

    const response = await proxyFetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            input,
            voice,
            response_format: responseFormat,
            speed: Number(config.speed) || 1,
        }),
        cache: 'no-store',
    }, config.proxyUrl);

    if (!response.ok) return errorResponse(`OpenAI 兼容 TTS 调用失败：${await upstreamError(response)}`, response.status);
    return audioResponse(
        Buffer.from(await response.arrayBuffer()),
        response.headers.get('content-type') || config.contentType || 'audio/mpeg',
    );
}

async function requestGemini(input, config, apiKey, request) {
    if (!apiKey) return errorResponse('请先在本机填写 Gemini 兼容 API Key');
    let baseUrl;
    try {
        baseUrl = guardTtsUrl(config.baseUrl, request);
    } catch (e) {
        return errorResponse(e.message || 'Gemini 兼容 TTS 地址无效');
    }
    if (!baseUrl) return errorResponse('请先填写 Gemini 兼容 API Base URL');
    const model = String(config.model || GEMINI_MODEL).trim();
    const voice = String(config.voice || 'Kore').trim();
    const normalizedBase = baseUrl.replace(/\/models\/[^/]+:generateContent$/i, '').replace(/\/+$/, '');
    const response = await proxyFetch(`${normalizedBase}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{ parts: [{ text: input }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
            },
        }),
        cache: 'no-store',
    }, config.proxyUrl);

    if (!response.ok) return errorResponse(`Gemini 兼容 TTS 调用失败：${await upstreamError(response)}`, response.status);
    const data = await response.json();
    const part = data?.candidates?.[0]?.content?.parts?.find(item => item?.inlineData?.data);
    if (!part) return errorResponse('Gemini 兼容 TTS 没有返回音频数据', 502);
    const mimeType = String(part.inlineData.mimeType || '').toLowerCase();
    const bytes = decodeBase64(part.inlineData.data);
    if (mimeType.includes('wav')) return audioResponse(bytes, 'audio/wav');
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return audioResponse(bytes, 'audio/mpeg');
    return audioResponse(wavFromPcm(bytes), 'audio/wav');
}

function customHeaders(config, apiKey, provider) {
    const headers = { 'Content-Type': 'application/json' };
    const authType = provider === 'anthropic-custom' ? 'x-api-key' : (config.authType || 'bearer');
    if (authType === 'bearer' && apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (authType === 'x-api-key' && apiKey) headers['x-api-key'] = apiKey;
    if (authType === 'x-goog-api-key' && apiKey) headers['x-goog-api-key'] = apiKey;
    if (provider === 'anthropic-custom') headers['anthropic-version'] = '2023-06-01';
    return headers;
}

async function requestCustom(input, config, apiKey, provider, request) {
    let endpoint;
    try {
        endpoint = guardTtsUrl(config.endpoint, request);
    } catch (e) {
        return errorResponse(e.message || '兼容 TTS 地址无效');
    }
    if (!endpoint) return errorResponse('请先填写兼容 TTS 完整接口地址');
    const authType = provider === 'anthropic-custom' ? 'x-api-key' : (config.authType || 'bearer');
    if (authType !== 'none' && !apiKey) return errorResponse('请先在本机填写此接口的 API Key');
    const response = await proxyFetch(endpoint, {
        method: 'POST',
        headers: customHeaders(config, apiKey, provider),
        body: JSON.stringify({
            input,
            model: String(config.model || '').trim(),
            voice: String(config.voice || '').trim(),
            speed: Number(config.speed) || 1,
            language: String(config.language || '').trim(),
        }),
        cache: 'no-store',
    }, config.proxyUrl);

    if (!response.ok) return errorResponse(`兼容 TTS 调用失败：${await upstreamError(response)}`, response.status);
    if ((config.responseMode || 'binary') === 'json-base64') {
        const bytes = decodeBase64(readPath(await response.json(), config.audioPath));
        return audioResponse(bytes, config.contentType || 'audio/mpeg');
    }
    return audioResponse(Buffer.from(await response.arrayBuffer()), response.headers.get('content-type') || config.contentType || 'audio/mpeg');
}

export async function POST(request) {
    try {
        const body = await request.json();
        const input = String(body?.input || '').trim();
        const provider = String(body?.provider || '');
        const config = body?.config && typeof body.config === 'object' ? body.config : {};
        const apiKey = String(body?.apiKey || '').trim();
        if (!input) return errorResponse('没有可朗读的文字');
        if (input.length > 5000) return errorResponse('单次朗读文字过长，请分段发送');
        if (!config.licenseConfirmed) return errorResponse('请先确认你拥有该音源及输出内容的使用授权');
        if (provider === 'openai-compatible') return await requestOpenAICompatible(input, config, apiKey, request);
        if (provider === 'gemini') return await requestGemini(input, config, apiKey, request);
        if (provider === 'anthropic-custom' || provider === 'custom') return await requestCustom(input, config, apiKey, provider, request);
        return errorResponse('不支持的 TTS 音源类型');
    } catch (error) {
        return errorResponse(error?.message || 'TTS 请求失败', 500);
    }
}
