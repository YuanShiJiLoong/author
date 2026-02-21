/**
 * 项目导出/导入 — 将所有 localStorage 数据打包为 JSON 文件
 * 支持：章节、设定集、API 配置、聊天会话
 */

const PROJECT_FILE_VERSION = 1;

// 需要导出的所有 localStorage keys
const STORAGE_KEYS = {
    chapters: 'author-chapters',
    settings: 'author-project-settings',
    settingsNodes: 'author-settings-nodes',
    activeWork: 'author-active-work',
    chatSessions: 'author-chat-sessions',
};

// 章节摘要前缀
const SUMMARY_PREFIX = 'author-chapter-summary-';

/**
 * 导出整个项目为 JSON 文件并下载
 */
export function exportProject() {
    if (typeof window === 'undefined') return;

    const data = {
        _version: PROJECT_FILE_VERSION,
        _exportedAt: new Date().toISOString(),
        _app: 'Author',
    };

    // 收集所有主要数据
    for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
        try {
            const raw = localStorage.getItem(storageKey);
            data[key] = raw ? JSON.parse(raw) : null;
        } catch {
            data[key] = null;
        }
    }

    // 收集章节摘要
    const summaries = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(SUMMARY_PREFIX)) {
            const chapterId = k.slice(SUMMARY_PREFIX.length);
            summaries[chapterId] = localStorage.getItem(k);
        }
    }
    data.chapterSummaries = summaries;

    // 生成文件名
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `Author_存档_${dateStr}.json`;

    // 下载
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return fileName;
}

/**
 * 从 JSON 文件导入项目数据
 * @param {File} file - 用户选择的 JSON 文件
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function importProject(file) {
    if (typeof window === 'undefined') return { success: false, message: '环境不支持' };

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        // 基本校验
        if (!data._app || data._app !== 'Author') {
            return { success: false, message: '文件格式不正确，不是 Author 存档文件' };
        }

        // 恢复主要数据
        for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
            if (data[key] !== undefined && data[key] !== null) {
                localStorage.setItem(storageKey, JSON.stringify(data[key]));
            }
        }

        // 恢复章节摘要
        if (data.chapterSummaries && typeof data.chapterSummaries === 'object') {
            for (const [chapterId, summary] of Object.entries(data.chapterSummaries)) {
                if (summary) {
                    localStorage.setItem(SUMMARY_PREFIX + chapterId, summary);
                }
            }
        }

        return { success: true, message: `成功导入存档（导出时间：${data._exportedAt || '未知'}）` };
    } catch (err) {
        return { success: false, message: `导入失败：${err.message}` };
    }
}

/**
 * 获取当前项目数据的概要信息（用于显示）
 */
export function getProjectSummary() {
    if (typeof window === 'undefined') return null;

    try {
        const chaptersRaw = localStorage.getItem(STORAGE_KEYS.chapters);
        const chapters = chaptersRaw ? JSON.parse(chaptersRaw) : [];
        const nodesRaw = localStorage.getItem(STORAGE_KEYS.settingsNodes);
        const nodes = nodesRaw ? JSON.parse(nodesRaw) : [];
        const sessionsRaw = localStorage.getItem(STORAGE_KEYS.chatSessions);
        const sessions = sessionsRaw ? JSON.parse(sessionsRaw) : {};

        return {
            chapterCount: chapters.length,
            settingsNodeCount: nodes.length,
            sessionCount: Object.keys(sessions.sessions || {}).length,
            totalChars: chapters.reduce((sum, ch) => sum + (ch.content?.length || 0), 0),
        };
    } catch {
        return null;
    }
}
