// 本地存储工具 - 使用 IndexedDB 管理核心数据 (章节、摘要)
import { get, set } from 'idb-keyval';

const STORAGE_KEY = 'author-chapters';

// 生成唯一ID
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// 获取所有章节 (Async)
export async function getChapters() {
    if (typeof window === 'undefined') return [];
    try {
        let chapters = await get(STORAGE_KEY);
        if (!chapters) {
            // Fallback: 第一次迁移，从 localStorage 拿
            const legacyData = localStorage.getItem(STORAGE_KEY);
            if (legacyData) {
                chapters = JSON.parse(legacyData);
                await set(STORAGE_KEY, chapters);
            } else {
                chapters = [];
            }
        }
        return chapters;
    } catch {
        return [];
    }
}

// 保存所有章节 (Async)
export async function saveChapters(chapters) {
    if (typeof window === 'undefined') return;
    await set(STORAGE_KEY, chapters);
}

// 创建新章节 (Async)
export async function createChapter(title = '未命名章节') {
    const chapters = await getChapters();
    const newChapter = {
        id: generateId(),
        title,
        content: '',
        wordCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    chapters.push(newChapter);
    await saveChapters(chapters);
    return newChapter;
}

// 更新章节 (Async)
export async function updateChapter(id, updates) {
    const chapters = await getChapters();
    const index = chapters.findIndex(ch => ch.id === id);
    if (index === -1) return null;

    chapters[index] = {
        ...chapters[index],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    await saveChapters(chapters);
    return chapters[index];
}

// 删除章节 (Async)
export async function deleteChapter(id) {
    const chapters = await getChapters();
    const newChapters = chapters.filter(ch => ch.id !== id);
    await saveChapters(newChapters);
    return newChapters;
}

// 获取单个章节 (Async)
export async function getChapter(id) {
    const chapters = await getChapters();
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
