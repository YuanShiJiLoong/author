/**
 * 章节编号工具：归一化、冲突检测、合并排序
 */

// ===== 中文数字 → 阿拉伯数字 =====

const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 贰: 2, 两: 2, 三: 3, 叁: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陆: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 };
const CN_UNITS = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000, 万: 10000 };

/**
 * 将中文数字字符串转换为阿拉伯数字
 * 支持：一 ~ 九万九千九百九十九，以及"十三"省略"一十"的写法
 * @param {string} str 纯中文数字字符串，如 "三十三"、"一百零五"
 * @returns {number|null} 转换结果，无法识别返回 null
 */
export function chineseToNumber(str) {
    if (!str || str.length === 0) return null;

    let result = 0;
    let current = 0;   // 当前累计（百位以下）
    let section = 0;   // 当前段值

    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        const digit = CN_DIGITS[ch];
        const unit = CN_UNITS[ch];

        if (digit !== undefined) {
            current = digit;
        } else if (unit !== undefined) {
            if (unit === 10000) {
                // "万"：把之前的累计乘以万
                section = (section + (current || 1)) * unit;
                result += section;
                section = 0;
                current = 0;
            } else {
                // 十、百、千
                section += (current || 1) * unit;
                current = 0;
            }
        } else {
            // 非中文数字字符
            return null;
        }
    }

    result += section + current;
    return result > 0 ? result : null;
}

/**
 * 从章节标题中提取归一化的章节编号（数字）
 * 支持格式：
 *   "第三十三章 xxx" → 33
 *   "第33章 xxx"     → 33
 *   "三十三"         → 33
 *   "33"             → 33
 *   "Chapter 33: xx" → 33
 *   "第一卷"         → (不匹配，仅支持"章")
 *   自由文字标题      → null
 *
 * @param {string} title 章节标题
 * @returns {number|null} 归一化编号，无法识别返回 null
 */
export function extractChapterNumber(title) {
    if (!title) return null;
    const t = title.trim();

    // 1️⃣ "第X章" — X 可以是阿拉伯数字或中文数字
    const m1 = t.match(/^第([0-9]+)章/);
    if (m1) return parseInt(m1[1], 10);

    const m2 = t.match(/^第([零〇一壹二贰两三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟万]+)章/);
    if (m2) return chineseToNumber(m2[1]);

    // 2️⃣ 纯阿拉伯数字开头 — "33"、"33 xxx"、"33.xxx"、"33、xxx"
    const m3 = t.match(/^([0-9]+)(?:\s|[.、：:：]|$)/);
    if (m3) return parseInt(m3[1], 10);

    // 3️⃣ 纯中文数字（整个标题或开头部分）
    // 先尝试整个标题
    const whole = chineseToNumber(t);
    if (whole !== null) return whole;

    // 再尝试开头的中文数字部分（"三十三 xxx" → 33）
    const m4 = t.match(/^([零〇一壹二贰两三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟万]+)(?:\s|[.、：:：]|$)/);
    if (m4) return chineseToNumber(m4[1]);

    // 4️⃣ "Chapter X" (英文)
    const m5 = t.match(/^chapter\s+([0-9]+)/i);
    if (m5) return parseInt(m5[1], 10);

    return null;
}

/**
 * 检测已有章节和导入章节之间的编号冲突
 * @param {Array} existingChapters 已有章节 [{ id, title, content, ... }]
 * @param {Array} importedChapters 导入章节
 * @returns {{
 *   conflicts: Array<{ num: number, existing: Array, imported: Array }>,
 *   noConflictExisting: Array,
 *   noConflictImported: Array
 * }}
 */
export function detectConflicts(existingChapters, importedChapters) {
    // 给每个章节标记来源和归一化编号
    const tagExisting = existingChapters.map(ch => ({
        ...ch,
        _source: 'existing',
        _num: extractChapterNumber(ch.title),
    }));
    const tagImported = importedChapters.map(ch => ({
        ...ch,
        _source: 'imported',
        _num: extractChapterNumber(ch.title),
    }));

    // 收集已有章节的编号集合
    const existingNums = new Map(); // num → [chapters]
    for (const ch of tagExisting) {
        if (ch._num !== null) {
            if (!existingNums.has(ch._num)) existingNums.set(ch._num, []);
            existingNums.get(ch._num).push(ch);
        }
    }

    // 检测冲突
    const conflictMap = new Map(); // num → { existing: [], imported: [] }
    const noConflictImported = [];

    for (const ch of tagImported) {
        if (ch._num !== null && existingNums.has(ch._num)) {
            // 冲突
            if (!conflictMap.has(ch._num)) {
                conflictMap.set(ch._num, {
                    num: ch._num,
                    existing: [...existingNums.get(ch._num)],
                    imported: [],
                });
            }
            conflictMap.get(ch._num).imported.push(ch);
        } else {
            noConflictImported.push(ch);
        }
    }

    // 没有冲突的已有章节
    const conflictNums = new Set(conflictMap.keys());
    const noConflictExisting = tagExisting.filter(ch => ch._num === null || !conflictNums.has(ch._num));

    // 按编号排序冲突组
    const conflicts = Array.from(conflictMap.values()).sort((a, b) => a.num - b.num);

    return { conflicts, noConflictExisting, noConflictImported };
}

/**
 * 根据用户选择合并章节并排序
 * @param {Array} noConflictExisting 无冲突的已有章节
 * @param {Array} noConflictImported 无冲突的导入章节
 * @param {Array<{ num: number, selected: Array }>} resolvedConflicts 用户已选择的冲突解决结果
 * @returns {Array} 合并后的章节列表（按编号排序）
 */
export function mergeChapters(noConflictExisting, noConflictImported, resolvedConflicts) {
    // 所有章节统一为 { chapter, _num }
    const allChapters = [];

    // 无冲突的已有章节
    for (const ch of noConflictExisting) {
        allChapters.push({ chapter: ch, _num: ch._num, _source: 'existing' });
    }

    // 无冲突的导入章节
    for (const ch of noConflictImported) {
        allChapters.push({ chapter: ch, _num: ch._num, _source: 'imported' });
    }

    // 已解决冲突的选定章节
    for (const group of resolvedConflicts) {
        for (const ch of group.selected) {
            allChapters.push({ chapter: ch, _num: group.num, _source: ch._source });
        }
    }

    // 分为有编号和无编号
    const numbered = allChapters.filter(c => c._num !== null);
    const unnumbered = allChapters.filter(c => c._num === null);

    // 有编号的按编号排序，同编号内先 existing 后 imported
    numbered.sort((a, b) => {
        if (a._num !== b._num) return a._num - b._num;
        // 同编号：existing 优先
        const sourceOrder = { existing: 0, imported: 1 };
        return (sourceOrder[a._source] || 0) - (sourceOrder[b._source] || 0);
    });

    // 合并：有编号 + 无编号追加末尾
    const merged = [...numbered, ...unnumbered].map(c => {
        // 清理内部标记
        const { _source, _num, ...clean } = c.chapter;
        return clean;
    });

    return merged;
}
