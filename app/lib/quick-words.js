// 快捷词：写正文时打出词的开头一两个字，按 Tab 就能补全人名、地名、功法等常用词。
// 本文件只放纯函数（取词、匹配、提示词、解析 AI 结果），存储见 quick-words-store.js。

export const QUICK_WORD_MIN_LENGTH = 2;
export const QUICK_WORD_MAX_LENGTH = 24;
export const QUICK_WORD_STORE_LIMIT = 600;
export const QUICK_WORD_SUGGESTION_LIMIT = 6;

const MAX_CJK_QUERY = 4;
const MIN_LATIN_QUERY = 2;
const EXISTING_WORDS_IN_PROMPT = 300;
// 大纲和写作规则的条目名多是"第一卷主线""文风规范"这类标题，不是正文里会打的词
const EXCLUDED_SETTINGS_CATEGORIES = new Set(['plot', 'rules', 'bookInfo']);
const SOURCE_RANK = { manual: 0, settings: 1, ai: 2 };

const CJK_CHAR = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;
const TRAILING_WORD = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}_'’-]+$/u;
const WRAPPING_PUNCTUATION = /^[\s"'“”‘’「」『』《》【】〈〉()（）[\]<>·•*#\-–—:：,，.。;；、!！?？]+|[\s"'“”‘’「」『』《》【】〈〉()（）[\]<>·•*#\-–—:：,，.。;；、!！?？]+$/g;

function wordKey(text) {
    return text.toLocaleLowerCase();
}

export function normalizeQuickWordText(value) {
    if (typeof value !== 'string') return '';
    const text = value
        .replace(/\s+/g, ' ')
        .replace(WRAPPING_PUNCTUATION, '')
        .trim();
    if (text.length < QUICK_WORD_MIN_LENGTH || text.length > QUICK_WORD_MAX_LENGTH) return '';
    if (/[\n\r\t]/.test(text)) return '';
    return text;
}

export function normalizeQuickWordStore(value) {
    const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const seen = new Set();
    const words = [];
    for (const item of Array.isArray(data.words) ? data.words : []) {
        const text = normalizeQuickWordText(typeof item === 'string' ? item : item?.text);
        if (!text || seen.has(wordKey(text))) continue;
        seen.add(wordKey(text));
        words.push({ text, source: item?.source === 'ai' ? 'ai' : 'manual' });
        if (words.length >= QUICK_WORD_STORE_LIMIT) break;
    }
    const hiddenSeen = new Set();
    const hidden = [];
    for (const item of Array.isArray(data.hidden) ? data.hidden : []) {
        const text = normalizeQuickWordText(item);
        if (!text || hiddenSeen.has(wordKey(text))) continue;
        hiddenSeen.add(wordKey(text));
        hidden.push(text);
    }
    return { words, hidden };
}

// 条目名里常见"沈砚（阿砚）""陆知微/知微"这种写法，拆开后每个都能单独补全
function splitSettingsName(name) {
    const raw = String(name || '');
    const parts = [];
    const outer = raw.replace(/[（(]([^（）()]*)[）)]/g, (_, inner) => {
        parts.push(inner);
        return ' ';
    });
    parts.unshift(...outer.split(/[\/／|｜、,，;；]/));
    return parts.flatMap(part => part.split(/[\/／|｜、,，;；]/));
}

export function collectSettingsQuickWords(nodes) {
    const seen = new Set();
    const words = [];
    for (const node of Array.isArray(nodes) ? nodes : []) {
        if (node?.type !== 'item' || EXCLUDED_SETTINGS_CATEGORIES.has(node.category)) continue;
        for (const part of splitSettingsName(node.name)) {
            const text = normalizeQuickWordText(part);
            if (!text || seen.has(wordKey(text))) continue;
            seen.add(wordKey(text));
            words.push({ text, source: 'settings', category: node.category || 'custom' });
        }
    }
    return words;
}

/** 合并设定集里的名字和作者自己的快捷词，去掉被隐藏的。 */
export function buildQuickWordList(settingsWords, store) {
    const { words, hidden } = normalizeQuickWordStore(store);
    const hiddenKeys = new Set(hidden.map(wordKey));
    const seen = new Set();
    const list = [];
    for (const item of [...words, ...(Array.isArray(settingsWords) ? settingsWords : [])]) {
        const key = wordKey(item.text);
        if (hiddenKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        list.push(item);
    }
    return list;
}

function rankMatches(matches, usage) {
    return matches.sort((a, b) => {
        const usedA = usage?.get?.(a.text) || 0;
        const usedB = usage?.get?.(b.text) || 0;
        if (usedA !== usedB) return usedB - usedA;
        const rankA = SOURCE_RANK[a.source] ?? 3;
        const rankB = SOURCE_RANK[b.source] ?? 3;
        if (rankA !== rankB) return rankA - rankB;
        if (a.text.length !== b.text.length) return a.text.length - b.text.length;
        return a.text.localeCompare(b.text);
    });
}

/**
 * 根据光标前的文字找补全候选。
 * 中文等：取光标前连续的 1~4 个字，越长越优先；拉丁/西里尔字母：取光标前的整个单词（至少 2 个字母）。
 * @returns {{ query: string, matches: string[] } | null}
 */
export function findQuickWordSuggestions(textBefore, words, { limit = QUICK_WORD_SUGGESTION_LIMIT, usage = null } = {}) {
    const before = String(textBefore || '');
    if (!before || !Array.isArray(words) || words.length === 0) return null;

    // 刚打完一个完整的词，就不再接着提示
    if (words.some(word => before.endsWith(word.text))) return null;

    const last = before.slice(-1);
    if (CJK_CHAR.test(last)) {
        let run = 0;
        for (let i = before.length - 1; i >= 0 && run < MAX_CJK_QUERY; i--) {
            if (!CJK_CHAR.test(before[i])) break;
            run++;
        }
        for (let size = run; size >= 1; size--) {
            const query = before.slice(-size);
            const matches = words.filter(word => word.text.length > size && word.text.startsWith(query));
            if (matches.length) {
                return { query, matches: rankMatches(matches, usage).slice(0, limit).map(word => word.text) };
            }
        }
        return null;
    }

    const match = before.match(TRAILING_WORD);
    if (!match || match[0].length < MIN_LATIN_QUERY) return null;
    const query = match[0];
    const lower = wordKey(query);
    const matches = words.filter(word => word.text.length > query.length && wordKey(word.text).startsWith(lower));
    if (!matches.length) return null;
    return { query, matches: rankMatches(matches, usage).slice(0, limit).map(word => word.text) };
}

// ==================== 让 AI 提取快捷词 ====================

function contentToText(content) {
    if (!content || typeof content !== 'object') return typeof content === 'string' ? content : '';
    const parts = [];
    for (const value of Object.values(content)) {
        if (typeof value === 'string' && value.trim()) parts.push(value.trim());
        else if (Array.isArray(value)) {
            const items = value.filter(item => typeof item === 'string' && item.trim());
            if (items.length) parts.push(items.join('、'));
        }
    }
    return parts.join('；');
}

function clip(text, maxChars) {
    const value = String(text || '').trim();
    return value.length > maxChars ? value.slice(0, maxChars) : value;
}

/** 把设定集拆成"设定"和"大纲"两段纯文本，供 AI 提取用。 */
export function buildSettingsSourceTexts(nodes, { settingsChars = 10000, outlineChars = 6000 } = {}) {
    const settings = [];
    const outline = [];
    for (const node of Array.isArray(nodes) ? nodes : []) {
        if (node?.type !== 'item' || node.category === 'rules' || node.category === 'bookInfo') continue;
        const body = contentToText(node.content);
        const line = body ? `${node.name}：${body}` : String(node.name || '');
        if (!line.trim()) continue;
        (node.category === 'plot' ? outline : settings).push(line);
    }
    return {
        settingsText: clip(settings.join('\n'), settingsChars),
        outlineText: clip(outline.join('\n'), outlineChars),
    };
}

function hasCjk(text) {
    const sample = String(text || '').slice(0, 4000);
    const cjk = (sample.match(/[㐀-鿿]/g) || []).length;
    return cjk > 0 && cjk >= sample.replace(/\s/g, '').length * 0.15;
}

export function buildQuickWordExtractionPrompts({ settingsText = '', outlineText = '', chaptersText = '', existingWords = [] } = {}) {
    const chinese = hasCjk(`${settingsText}\n${outlineText}\n${chaptersText}`);
    const existing = existingWords.slice(0, EXISTING_WORDS_IN_PROMPT);
    if (chinese) {
        const systemPrompt = [
            '你是小说作者的写作助手。任务：从作者提供的设定、大纲和正文里，找出写正文时会反复手打的专有词，做成输入补全词库。',
            '要找的：人物名字和常用称呼（外号、尊称、简称）、地名、门派/势力/组织、功法/技能/招式、法宝/物品、种族/职业、境界/等级、专有术语、反复出现的固定说法。',
            '不要：普通常用词（如"突然""师父""宗门"这类谁都会用的词）、整句话、单个字、超过 12 个字的词、材料里没出现过的东西。',
            '只输出一个 JSON 字符串数组，例如 ["沈砚","青石镇","破玄一气指"]，不要任何解释。最多 200 个，常用的排前面。',
        ].join('\n');
        const sections = [];
        if (settingsText) sections.push(`【设定】\n${settingsText}`);
        if (outlineText) sections.push(`【大纲】\n${outlineText}`);
        if (chaptersText) sections.push(`【正文节选】\n${chaptersText}`);
        if (existing.length) sections.push(`【已经有的词，不用再列】\n${existing.join('、')}`);
        return { systemPrompt, userPrompt: `${sections.join('\n\n')}\n\n请输出 JSON 数组。` };
    }

    const systemPrompt = [
        'You are a writing assistant for a fiction author. Task: from the settings, outline and manuscript below, find the proper terms the author types again and again, to build an autocomplete word list.',
        'Include: character names and common forms of address (nicknames, titles, short forms), places, factions/organizations, skills/techniques, artifacts/items, races/classes, ranks/levels, invented terms, recurring set phrases.',
        'Exclude: ordinary everyday words, whole sentences, single letters, terms longer than 4 words, anything not present in the material. Keep every term in the language and spelling used in the material.',
        'Output only a JSON array of strings, e.g. ["Aldric","Greywater Keep","Sunfire Lance"], with no explanation. At most 200 terms, most frequent first.',
    ].join('\n');
    const sections = [];
    if (settingsText) sections.push(`[Settings]\n${settingsText}`);
    if (outlineText) sections.push(`[Outline]\n${outlineText}`);
    if (chaptersText) sections.push(`[Manuscript excerpt]\n${chaptersText}`);
    if (existing.length) sections.push(`[Already in the list, do not repeat]\n${existing.join(', ')}`);
    return { systemPrompt, userPrompt: `${sections.join('\n\n')}\n\nOutput the JSON array.` };
}

function collectStrings(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') return item.text || item.word || item.name || item.term || '';
        return '';
    });
}

/** 解析 AI 返回的词表；JSON 坏了就按行/逗号拆。 */
export function parseQuickWordResponse(text) {
    const raw = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    let candidates = [];
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start >= 0 && end > start) {
        try {
            candidates = collectStrings(JSON.parse(raw.slice(start, end + 1)));
        } catch {
            candidates = [];
        }
    }
    if (!candidates.length) {
        candidates = raw
            .replace(/```[a-z]*|```/gi, '')
            .split(/[\n,，、;；]/)
            .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, ''));
    }
    const seen = new Set();
    const words = [];
    for (const candidate of candidates) {
        const word = normalizeQuickWordText(candidate);
        if (!word || seen.has(wordKey(word))) continue;
        seen.add(wordKey(word));
        words.push(word);
    }
    return words;
}
