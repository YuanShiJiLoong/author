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
export async function exportProject() {
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
    const jsonStr = JSON.stringify(data, null, 2);
    await downloadFile(jsonStr, fileName, 'application/json');

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
 * 导入作品 — 支持 TXT / Markdown / EPUB / DOCX / DOC / PDF
 * 根据文件扩展名自动选择解析方式
 * @param {File} file - 用户选择的文件
 * @returns {Promise<{ success: boolean, message: string, chapters?: Array, totalWords?: number }>}
 */
export async function importWork(file) {
    if (typeof window === 'undefined') return { success: false, message: '环境不支持' };

    try {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let rawChapters;

        switch (ext) {
            case 'txt':
                rawChapters = await parseTxt(file);
                break;
            case 'md':
            case 'markdown':
                rawChapters = await parseMarkdown(file);
                break;
            case 'epub':
                rawChapters = await parseEpub(file);
                break;
            case 'docx':
                rawChapters = await parseDocx(file);
                break;
            case 'doc':
            case 'pdf':
                rawChapters = await parseViaApi(file);
                break;
            default:
                return { success: false, message: `不支持的文件格式：.${ext}` };
        }

        // 如果没有识别到章节
        if (!rawChapters || rawChapters.length === 0 ||
            (rawChapters.length === 1 && !rawChapters[0].title && rawChapters[0].lines.join('').trim() === '')) {
            return { success: false, message: 'noChapter' };
        }

        // 转换为章节对象
        const { generateId } = await import('./storage');
        const now = new Date().toISOString();
        const chapters = rawChapters.map((raw) => {
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

// ==================== 导入解析器 ====================

// 章节标题正则 — 支持多种格式
// 1. 第X章/回/节/卷（中文数字或阿拉伯数字）+ 可选标题
// 2. Chapter X + 可选标题
// 3. 纯阿拉伯数字行（如 "1"、"23"）
// 4. 纯中文数字行（如 "一"、"三十三"）
const CHAPTER_REGEX = /^(?:第[零一二三四五六七八九十百千万\d]+[章回节卷](?:\s+.*)?|Chapter\s+\d+(?:\s+.*)?|\d+|[零一二三四五六七八九十百千万]+)$/i;

/**
 * TXT 解析 — 原有逻辑，完全保留
 */
async function parseTxt(file) {
    const text = await file.text();
    if (!text.trim()) throw new Error('文件内容为空');

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rawChapters = [];
    let currentChapter = null;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (CHAPTER_REGEX.test(trimmed)) {
            if (currentChapter) rawChapters.push(currentChapter);
            currentChapter = { title: trimmed, lines: [] };
        } else {
            if (!currentChapter) currentChapter = { title: null, lines: [] };
            currentChapter.lines.push(lines[i]);
        }
    }
    if (currentChapter) rawChapters.push(currentChapter);
    return rawChapters;
}

/**
 * Markdown 解析 — 按一级标题 (# heading) 拆分章节
 */
async function parseMarkdown(file) {
    const text = await file.text();
    if (!text.trim()) throw new Error('文件内容为空');

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rawChapters = [];
    let currentChapter = null;

    for (const line of lines) {
        const headingMatch = line.match(/^#\s+(.+)$/);
        if (headingMatch) {
            if (currentChapter) rawChapters.push(currentChapter);
            currentChapter = { title: headingMatch[1].trim(), lines: [] };
        } else {
            if (!currentChapter) currentChapter = { title: null, lines: [] };
            // 去除 Markdown 格式标记，保留纯文本
            const plain = line
                .replace(/^#{2,6}\s+/, '')       // 子标题 → 纯文本
                .replace(/\*\*(.+?)\*\*/g, '$1') // 粗体
                .replace(/\*(.+?)\*/g, '$1')     // 斜体
                .replace(/~~(.+?)~~/g, '$1')     // 删除线
                .replace(/`(.+?)`/g, '$1')       // 行内代码
                .replace(/!\[.*?\]\(.*?\)/g, '') // 图片
                .replace(/\[(.+?)\]\(.*?\)/g, '$1') // 链接
                .replace(/^>\s?/gm, '')          // 引用
                .replace(/^[-*+]\s+/gm, '')      // 无序列表
                .replace(/^\d+\.\s+/gm, '')      // 有序列表
                .replace(/^---+$/gm, '');         // 分隔线
            currentChapter.lines.push(plain);
        }
    }
    if (currentChapter) rawChapters.push(currentChapter);

    // 如果 Markdown 中没有一级标题，回退到 TXT 章节正则匹配
    if (rawChapters.length <= 1 && (!rawChapters[0]?.title)) {
        const fullText = rawChapters.map(c => c.lines.join('\n')).join('\n');
        const mockFile = { text: () => Promise.resolve(fullText), name: 'fallback.txt' };
        return parseTxt(mockFile);
    }

    return rawChapters;
}

/**
 * EPUB 解析 — 解压 ZIP，按 spine 顺序提取 XHTML 文本
 */
async function parseEpub(file) {
    const JSZip = (await import('jszip')).default;
    const arrayBuf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuf);

    // 找到 OPF 文件（content.opf）
    let opfPath = null;
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    if (containerXml) {
        const m = containerXml.match(/full-path="([^"]+\.opf)"/);
        if (m) opfPath = m[1];
    }
    // 回退：搜索 .opf 文件
    if (!opfPath) {
        for (const path of Object.keys(zip.files)) {
            if (path.endsWith('.opf')) { opfPath = path; break; }
        }
    }

    const opfDir = opfPath ? opfPath.replace(/[^/]*$/, '') : '';
    const opfText = opfPath ? await zip.file(opfPath)?.async('text') : null;

    // 解析 spine 中的 itemref 顺序
    let orderedFiles = [];
    if (opfText) {
        // 解析 manifest（id → href 映射）
        const manifest = {};
        const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*/gi;
        let im;
        while ((im = itemRegex.exec(opfText)) !== null) {
            manifest[im[1]] = im[2];
        }
        // 也处理 href 在 id 之前的情况
        const itemRegex2 = /<item\s+[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*/gi;
        while ((im = itemRegex2.exec(opfText)) !== null) {
            if (!manifest[im[2]]) manifest[im[2]] = im[1];
        }

        // 解析 spine
        const spineRegex = /idref="([^"]+)"/g;
        let sm;
        while ((sm = spineRegex.exec(opfText)) !== null) {
            const href = manifest[sm[1]];
            if (href) orderedFiles.push(opfDir + decodeURIComponent(href));
        }
    }

    // 回退：如果没找到 spine，按文件名排序取所有 xhtml/html
    if (orderedFiles.length === 0) {
        orderedFiles = Object.keys(zip.files)
            .filter(p => /\.(x?html?|xml)$/i.test(p) && !p.includes('META-INF'))
            .sort();
    }

    // 提取各文件的文本
    const rawChapters = [];
    for (const filePath of orderedFiles) {
        const content = await zip.file(filePath)?.async('text');
        if (!content) continue;
        const { title, lines } = parseXhtmlContent(content);
        if (lines.join('').trim()) {
            rawChapters.push({ title, lines });
        }
    }

    return rawChapters;
}

/**
 * 从 XHTML/HTML 内容中提取标题和文本行
 */
function parseXhtmlContent(html) {
    // 提取 <title> 或 <h1> 作为章节标题
    let title = null;
    const h1Match = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/is);
    if (h1Match) title = h1Match[1].replace(/<[^>]*>/g, '').trim();
    if (!title) {
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        if (titleMatch) title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    // 忽略无意义标题
    if (title && (title.toLowerCase() === 'untitled' || title === '')) title = null;

    // 提取 <body> 内容
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    // 将 <p>, <div>, <br> 转为换行，去除标签
    const text = bodyHtml
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(div|h[1-6])>/gi, '\n\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c));

    const lines = text.split('\n');
    return { title, lines };
}

/**
 * DOCX 解析 — 用 mammoth 提取 HTML 再转文本（保留段落换行）
 */
async function parseDocx(file) {
    const mammoth = await import('mammoth');
    const arrayBuf = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuf });
    const html = result.value || '';
    if (!html.trim()) throw new Error('文件内容为空');

    // 将 HTML 转为带换行的纯文本
    const text = html
        .replace(/<\/(?:p|h[1-6]|li|div)>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!text) throw new Error('文件内容为空');

    // 用章节正则拆分
    return splitTextToChapters(text);
}

/**
 * DOC / PDF — 通过 API route 在服务端解析
 */
async function parseViaApi(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `解析失败 (${response.status})`);
    }

    const { text } = await response.json();
    if (!text || !text.trim()) throw new Error('文件内容为空');

    return splitTextToChapters(text);
}

/**
 * 将纯文本按章节正则拆分为 rawChapters 数组
 */
function splitTextToChapters(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rawChapters = [];
    let currentChapter = null;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (CHAPTER_REGEX.test(trimmed)) {
            if (currentChapter) rawChapters.push(currentChapter);
            currentChapter = { title: trimmed, lines: [] };
        } else {
            if (!currentChapter) currentChapter = { title: null, lines: [] };
            currentChapter.lines.push(lines[i]);
        }
    }
    if (currentChapter) rawChapters.push(currentChapter);
    return rawChapters;
}

// ==================== HTML ↔ 文本 工具 ====================

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
 * 将章节 HTML 内容转换为纯文本
 */
function htmlToText(html) {
    return (html || '')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

// ==================== 导出功能 ====================

// 通用下载：优先用系统另存为对话框（showSaveFilePicker），回退到 data URL
export async function downloadFile(content, fileName, mimeType = 'text/plain') {
    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        try {
            const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '.txt';
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: fileName, accept: { [mimeType]: [ext] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }
    // fallback: data URL
    const a = document.createElement('a');
    a.href = 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(content);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Blob 版下载（给 DOCX/EPUB 等二进制格式用）
export async function downloadBlob(blob, fileName, mimeType) {
    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        try {
            const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: fileName, accept: { [mimeType]: ['.' + ext] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }
    // fallback: blob URL
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 导出章节为 TXT 文件
 */
export async function exportWorkAsTxt(chapters, fileName) {
    if (!chapters || chapters.length === 0) return;
    const text = chapters.map(ch => {
        const title = ch.title || '';
        const content = htmlToText(ch.content);
        return `${title}\n\n${content}`;
    }).join('\n\n\n');

    await downloadFile(text, `${fileName || '导出作品'}.txt`);
}

/**
 * 导出章节为 Markdown 文件
 */
export async function exportWorkAsMarkdown(chapters, fileName) {
    if (!chapters || chapters.length === 0) return;
    const md = chapters.map(ch => {
        const title = ch.title || '未命名章节';
        const content = htmlToText(ch.content);
        return `# ${title}\n\n${content}`;
    }).join('\n\n---\n\n');

    await downloadFile(md, `${fileName || '导出作品'}.md`);
}

/**
 * 导出章节为 DOCX 文件
 */
export async function exportWorkAsDocx(chapters, fileName) {
    if (!chapters || chapters.length === 0) return;
    const docx = await import('docx');
    const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } = docx;

    // 从 HTML 中提取段落（按 <p> 标签拆分）
    function htmlToParagraphs(html) {
        if (!html) return [];
        // 提取所有 <p>...</p> 的内容
        const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        const paragraphs = [];
        let match;
        while ((match = pRegex.exec(html)) !== null) {
            let text = match[1]
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .trim();
            paragraphs.push(text);
        }
        // 如果没有 <p> 标签，fallback 为纯文本
        if (paragraphs.length === 0) {
            const fallback = htmlToText(html);
            return fallback.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
        }
        return paragraphs;
    }

    const children = [];
    chapters.forEach((ch, idx) => {
        if (idx > 0) {
            // 章节间分页
            children.push(new Paragraph({ text: '' }));
            children.push(new Paragraph({ text: '' }));
        }
        // 章节标题
        children.push(new Paragraph({
            text: ch.title || '未命名章节',
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
        }));
        // 章节内容
        const paras = htmlToParagraphs(ch.content);
        for (const para of paras) {
            if (!para) {
                children.push(new Paragraph({ text: '' }));
                continue;
            }
            // 处理段内换行（<br> 转的 \n）
            const lines = para.split('\n');
            const runs = [];
            lines.forEach((line, li) => {
                if (li > 0) runs.push(new TextRun({ break: 1 }));
                runs.push(new TextRun({ text: line, size: 24, font: '宋体' }));
            });
            children.push(new Paragraph({
                children: runs,
                spacing: { after: 120, line: 360 },
                alignment: AlignmentType.LEFT,
            }));
        }
    });

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { size: 24, font: '宋体' },
                    paragraph: { alignment: AlignmentType.LEFT, spacing: { line: 360 } },
                },
            },
        },
        sections: [{ children }],
    });

    const buffer = await Packer.toBlob(doc);
    await downloadBlob(buffer, `${fileName || '导出作品'}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

/**
 * 导出章节为 EPUB 文件
 */
export async function exportWorkAsEpub(chapters, fileName) {
    if (!chapters || chapters.length === 0) return;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const bookTitle = fileName || '导出作品';

    // mimetype（必须是第一个文件，不压缩）
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // META-INF/container.xml
    zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    // 生成各章节 XHTML
    const manifestItems = [];
    const spineItems = [];

    chapters.forEach((ch, idx) => {
        const id = `chapter${idx + 1}`;
        const filename = `${id}.xhtml`;
        const title = ch.title || `章节 ${idx + 1}`;
        const content = htmlToText(ch.content);
        const paragraphsHtml = content.split(/\n\n+/)
            .filter(p => p.trim())
            .map(p => `    <p>${p.trim().replace(/\n/g, '<br/>')}</p>`)
            .join('\n');

        const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body>
  <h1>${title}</h1>
${paragraphsHtml}
</body>
</html>`;

        zip.file(`OEBPS/${filename}`, xhtml);
        manifestItems.push(`    <item id="${id}" href="${filename}" media-type="application/xhtml+xml"/>`);
        spineItems.push(`    <itemref idref="${id}"/>`);
    });

    // content.opf
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:title>${bookTitle}</dc:title>
    <dc:language>zh</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems.join('\n')}
  </manifest>
  <spine>
${spineItems.join('\n')}
  </spine>
</package>`;
    zip.file('OEBPS/content.opf', opf);

    // nav.xhtml（目录）
    const navItems = chapters.map((ch, idx) =>
        `      <li><a href="chapter${idx + 1}.xhtml">${ch.title || `章节 ${idx + 1}`}</a></li>`
    ).join('\n');

    const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
  <nav epub:type="toc">
    <h1>目录</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`;
    zip.file('OEBPS/nav.xhtml', nav);

    // 生成 EPUB（ZIP）
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
    await downloadBlob(blob, `${bookTitle}.epub`, 'application/epub+zip');
}

/**
 * 导出章节为 PDF — 利用浏览器打印功能
 */
export function exportWorkAsPdf(chapters, fileName) {
    if (!chapters || chapters.length === 0) return;

    const content = chapters.map(ch => {
        const title = ch.title || '未命名章节';
        const text = htmlToText(ch.content);
        const paragraphs = text.split(/\n\n+/)
            .filter(p => p.trim())
            .map(p => `<p style="text-indent:2em;line-height:1.8;margin:0.5em 0">${p.trim().replace(/\n/g, '<br>')}</p>`)
            .join('');
        return `<h1 style="page-break-before:auto;margin:1em 0 0.5em;font-size:1.4em">${title}</h1>${paragraphs}`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${fileName || '导出作品'}</title>
<style>
  body { font-family: "SimSun", "Songti SC", serif; font-size: 14px; padding: 20px; }
  h1 { font-family: "SimHei", "Heiti SC", sans-serif; }
  @media print { body { padding: 0; } }
</style>
</head><body>${content}</body></html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
        printWindow.print();
    };
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
