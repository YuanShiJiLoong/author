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
 * 导入作品 — 从 TXT 文件中自动识别章节并批量创建
 * 支持格式：第X章/回/节/卷（中文/阿拉伯数字）、Chapter X、纯数字、纯中文数字
 * @param {File} file - 用户选择的 TXT 文件
 * @returns {Promise<{ success: boolean, message: string, chapters?: Array, totalWords?: number }>}
 */
export async function importWork(file) {
    if (typeof window === 'undefined') return { success: false, message: '环境不支持' };

    try {
        const text = await file.text();
        if (!text.trim()) {
            return { success: false, message: '文件内容为空' };
        }

        // 章节标题正则 — 支持多种格式
        // 1. 第X章/回/节/卷（中文数字或阿拉伯数字）+ 可选标题
        // 2. Chapter X + 可选标题
        // 3. 纯阿拉伯数字行（如 "1"、"23"）
        // 4. 纯中文数字行（如 "一"、"三十三"）
        const CHAPTER_REGEX = /^(?:第[零一二三四五六七八九十百千万\d]+[章回节卷](?:\s+.*)?|Chapter\s+\d+(?:\s+.*)?|\d+|[零一二三四五六七八九十百千万]+)$/i;

        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const rawChapters = [];
        let currentChapter = null;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();

            if (CHAPTER_REGEX.test(trimmed)) {
                // 找到章节标题
                if (currentChapter) {
                    rawChapters.push(currentChapter);
                }
                currentChapter = { title: trimmed, lines: [] };
            } else {
                if (!currentChapter) {
                    // 第一个章节标题之前的内容归为序章
                    currentChapter = { title: null, lines: [] };
                }
                currentChapter.lines.push(lines[i]);
            }
        }
        if (currentChapter) {
            rawChapters.push(currentChapter);
        }

        // 如果只有一个无标题章节且无内容，说明没识别到任何章节
        if (rawChapters.length === 0 || (rawChapters.length === 1 && !rawChapters[0].title && rawChapters[0].lines.join('').trim() === '')) {
            return { success: false, message: 'noChapter' };
        }

        // 转换为章节对象
        const { generateId } = await import('./storage');
        const now = new Date().toISOString();
        const chapters = rawChapters.map((raw, idx) => {
            const content = textToHtml(raw.lines);
            const plainText = raw.lines.join('').replace(/\s/g, '');
            return {
                id: generateId(),
                title: raw.title || `序章`,
                content,
                wordCount: plainText.length,
                createdAt: now,
                updatedAt: now,
            };
        });

        const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
        return { success: true, chapters, totalWords, message: '' };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * 将纯文本行数组转换为 HTML（匹配编辑器 insertText 格式）
 * 规则：空行分段（<p>），段内换行用 <br>，去掉多余空行
 */
function textToHtml(lines) {
    const normalized = lines.join('\n').trim();
    if (!normalized) return '';

    // 按空行（连续换行）分段
    const blocks = normalized.split(/\n\n+/);
    return blocks
        .map(block => {
            const blockLines = block.split('\n').map(l => l.trimEnd()).filter(l => l);
            if (blockLines.length === 0) return '';
            return `<p>${blockLines.join('<br>')}</p>`;
        })
        .filter(p => p && p !== '<p></p>')
        .join('');
}

/**
 * 导出章节为 TXT 文件
 * @param {Array} chapters - 章节数组
 * @param {string} [fileName] - 文件名（不含扩展名）
 */
export function exportWorkAsTxt(chapters, fileName) {
    if (!chapters || chapters.length === 0) return;
    const text = chapters.map(ch => {
        const title = ch.title || '';
        const content = (ch.content || '')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
        return `${title}\n\n${content}`;
    }).join('\n\n\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName || '导出作品'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
