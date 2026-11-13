// 聊天回复里的"搜索来源"整理（纯函数）。
//
// 一次回答可能收到多组来源：外部搜索在开头一次性发来，DeepSeek / OpenAI 内置联网
// 则按引用逐条附在流里，同一网页会被引用很多次。这里把所有 grounding 合并、
// 按网址去重，只保留 http(s) 链接，并给出用来展示的站点名。

function sourceKey(url) {
    const normalized = new URL(url);
    normalized.hash = '';
    return normalized.href.replace(/\/$/, '');
}

/** 展示用站点名：去掉 www. / m. / wap. / mobile. 这类前缀 */
export function sourceSiteName(url) {
    try { return new URL(url).hostname.replace(/^(www|m|wap|mobile)\./i, ''); } catch { return ''; }
}

/** 从消息的 toolCalls 里取出去重后的来源：[{ title, uri, site }] */
export function collectSearchSources(toolCalls) {
    const byKey = new Map();
    for (const call of toolCalls || []) {
        if (call?.type !== 'grounding') continue;
        for (const source of call.sources || []) {
            const uri = String(source?.uri || '').trim();
            let key;
            try {
                if (!/^https?:$/.test(new URL(uri).protocol)) continue;
                key = sourceKey(uri);
            } catch { continue; }
            const title = String(source?.title || '').trim();
            const existing = byKey.get(key);
            if (existing) {
                if (!existing.title && title) existing.title = title;
                continue;
            }
            byKey.set(key, { title, uri, site: sourceSiteName(uri) });
        }
    }
    return [...byKey.values()];
}
