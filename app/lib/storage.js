// 本地存储工具 - 使用 IndexedDB 管理核心数据 (章节、摘要)
// 章节按作品(workId)隔离存储
import { get, set, del } from 'idb-keyval';

const LEGACY_STORAGE_KEY = 'author-chapters';

function getStorageKey(workId) {
    return workId ? `author-chapters-${workId}` : LEGACY_STORAGE_KEY;
}

// 生成唯一ID
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * 一次性迁移：将旧的全局 author-chapters 剪切到当前活跃作品
 * 调用方在 page.js initData 中负责调用
 */
export async function migrateGlobalChapters(workId) {
    if (typeof window === 'undefined' || !workId) return;
    try {
        const perWorkData = await get(getStorageKey(workId));
        if (perWorkData) return; // 该作品已有数据，不迁移

        const globalData = await get(LEGACY_STORAGE_KEY);
        if (!globalData || !Array.isArray(globalData) || globalData.length === 0) {
            // 也检查 localStorage fallback
            const legacyLocal = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacyLocal) {
                const parsed = JSON.parse(legacyLocal);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    await set(getStorageKey(workId), parsed);
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                }
            }
            return;
        }
        // 剪切到新 key
        await set(getStorageKey(workId), globalData);
        await del(LEGACY_STORAGE_KEY);
    } catch (e) {
        console.warn('[迁移] 章节迁移失败：', e);
    }
}

// 获取所有章节 (Async)
export async function getChapters(workId) {
    if (typeof window === 'undefined') return [];
    const key = getStorageKey(workId);
    try {
        let chapters = await get(key);
        if (!chapters) {
            chapters = [];
        }
        return chapters;
    } catch {
        return [];
    }
}

// 保存所有章节 (Async)
export async function saveChapters(chapters, workId) {
    if (typeof window === 'undefined') return;
    await set(getStorageKey(workId), chapters);
}

// 创建新章节 (Async)
export async function createChapter(title = '未命名章节', workId) {
    const chapters = await getChapters(workId);
    const newChapter = {
        id: generateId(),
        title,
        content: '',
        wordCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    chapters.push(newChapter);
    await saveChapters(chapters, workId);
    return newChapter;
}

// 更新章节 (Async)
export async function updateChapter(id, updates, workId) {
    const chapters = await getChapters(workId);
    const index = chapters.findIndex(ch => ch.id === id);
    if (index === -1) return null;

    chapters[index] = {
        ...chapters[index],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    await saveChapters(chapters, workId);
    return chapters[index];
}

// 删除章节 (Async)
export async function deleteChapter(id, workId) {
    const chapters = await getChapters(workId);
    const newChapters = chapters.filter(ch => ch.id !== id);
    await saveChapters(newChapters, workId);
    return newChapters;
}

// 获取单个章节 (Async)
export async function getChapter(id, workId) {
    const chapters = await getChapters(workId);
    return chapters.find(ch => ch.id === id) || null;
}

// 导出为 Markdown
export function exportToMarkdown(chapter) {
    const md = `# ${chapter.title}\n\n${chapter.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chapter.title || '未命名'}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

// 导出所有章节
export function exportAllToMarkdown(chapters) {
    const md = chapters.map(ch => {
        const text = ch.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
        return `# ${ch.title}\n\n${text}`;
    }).join('\n\n---\n\n');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '全部章节.md';
    a.click();
    URL.revokeObjectURL(url);
}

// ==================== 章节摘要缓存 ====================

const SUMMARY_PREFIX = 'author-chapter-summary-';

// 获取章节摘要 (Async)
export async function getChapterSummary(id) {
    if (typeof window === 'undefined') return null;
    try {
        let summary = await get(SUMMARY_PREFIX + id);
        if (!summary) {
            // Fallback
            summary = localStorage.getItem(SUMMARY_PREFIX + id);
            if (summary) {
                await set(SUMMARY_PREFIX + id, summary);
            }
        }
        return summary || null;
    } catch {
        return null;
    }
}

// 保存章节摘要 (Async)
export async function saveChapterSummary(id, summary) {
    if (typeof window === 'undefined') return;
    await set(SUMMARY_PREFIX + id, summary);
}
