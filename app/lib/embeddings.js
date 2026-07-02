// 文本向量化与余弦相似度计算库

import { tt } from './runtime-i18n';
import { localizeApiError } from './api-error-i18n';

// 错误退避缓存：API 连续失败时暂停重试 60 秒
let _embedErrorUntil = 0;
const EMBED_BACKOFF_MS = 60000;

function describeEmbedError(status, bodyText) {
    const prefix = tt('Embedding 请求失败', 'Embedding request failed', 'Запрос Embedding не удался');
    if (!bodyText) return `${prefix} (${status})`;
    try {
        const parsed = JSON.parse(bodyText);
        // embed 路由带 code 时优先整体本地化（NO_BASE_URL_EMBED 等静态错误）
        if (parsed?.code) {
            const localized = localizeApiError(parsed, tt);
            if (localized) return localized;
        }
        const detail = parsed?.error?.message || parsed?.error || parsed?.message;
        if (detail) return `${prefix} (${status}): ${detail}`;
    } catch {
        // Keep the original body when the API returns plain text or HTML.
    }
    return `${prefix} (${status}): ${bodyText}`;
}

/**
 * 获取文本的向量化表示 (Embeddings)
 * @param {string} text 要向量化的文本
 * @param {object} apiConfig 从 getProjectSettings().apiConfig 传入的配置
 * @returns {Promise<number[]|null>} 浮点数数组形式的向量
 */
export async function getEmbedding(text, apiConfig, options = {}) {
    const { throwOnError = false, ignoreBackoff = false } = options;
    const fail = (message) => {
        if (throwOnError) throw new Error(message);
        return null;
    };

    if (!text || text.trim() === '') return null;
    // 没有配置 Embedding Key 时静默跳过，不发请求。
    // 例外：独立向量供应商且关闭“复用对话 Key”时允许无 Key（本地服务如 Ollama）。
    const allowKeylessEmbed = !!apiConfig?.useCustomEmbed && apiConfig?.embedReuseChatKey === false;
    if (!allowKeylessEmbed && !apiConfig?.embedApiKey && !apiConfig?.embeddingApiKey && !apiConfig?.apiKey) {
        return fail(tt('未配置 Embedding API Key', 'Embedding API Key is not configured', 'Ключ Embedding API не настроен'));
    }
    // 如果上次失败的退避期还没过，直接跳过
    if (!ignoreBackoff && Date.now() < _embedErrorUntil) {
        return fail(tt('Embedding API 处于短暂失败退避中，请稍后重试', 'Embedding API is in a brief failure backoff. Please retry later.', 'Embedding API временно недоступен, повторите позже.'));
    }

    try {
        const res = await fetch('/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, apiConfig })
        });

        if (!res.ok) {
            const errorText = await res.text();
            const log = throwOnError ? console.error : console.warn;
            log('getEmbedding HTTP error:', errorText);
            if (!ignoreBackoff) _embedErrorUntil = Date.now() + EMBED_BACKOFF_MS;
            return fail(describeEmbedError(res.status, errorText));
        }

        const data = await res.json();
        if (data.error) {
            const log = throwOnError ? console.error : console.warn;
            log('getEmbedding API error:', data.error);
            return fail(localizeApiError(data, tt));
        }

        if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
            return fail(tt('Embedding API 未返回有效向量，请检查模型是否为 embedding 模型', 'Embedding API returned no valid vector. Please check that the selected model is an embedding model.', 'Embedding API не вернул вектор. Проверьте, что выбрана модель эмбеддингов.'));
        }

        return data.embedding;
    } catch (err) {
        const log = throwOnError ? console.error : console.warn;
        log('getEmbedding fetch error:', err);
        if (!ignoreBackoff) _embedErrorUntil = Date.now() + EMBED_BACKOFF_MS;
        return fail(err?.message || String(err));
    }
}

/**
 * 计算两个向量之间的余弦相似度
 * @param {number[]} vecA 向量 A
 * @param {number[]} vecB 向量 B
 * @returns {number} 相似度得分 (-1.0 到 1.0)
 */
export function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
