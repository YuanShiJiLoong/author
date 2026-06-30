/**
 * 设定集多格式导入导出工具
 * 支持 JSON / TXT / Markdown / DOCX / PDF 格式的互相转换
 */

import { localizedError, tt } from './runtime-i18n';
import { localizeApiError } from './api-error-i18n';

// ==================== 字段映射表 ====================

// 中文标签 → 字段 key 的映射（用于导入时自动匹配）
const FIELD_ALIASES = {
    character: {
        _nameAliases: ['姓名', '名字', '名称', '角色名', '人名'],
        role: ['角色', '角色类型', '身份', '定位'],
        gender: ['性别'],
        age: ['年龄', '岁数'],
        appearance: ['外貌', '外表', '外观', '容貌', '长相', '相貌', '外貌描写'],
        personality: ['性格', '个性', '人格', '性格特征', '性格特点'],
        background: ['背景', '身世', '经历', '来历', '背景故事', '过往'],
        motivation: ['动机', '目标', '追求', '愿望', '目的', '理想'],
        skills: ['能力', '技能', '特长', '武功', '法术', '本领', '擅长'],
        speechStyle: ['说话风格', '口头禅', '语气', '话风', '说话方式', '对白风格'],
        relationships: ['关系', '人际关系', '社交', '人物关系', '人际'],
        arc: ['成长', '发展', '弧线', '成长弧线', '角色发展', '变化'],
        notes: ['备注', '其他', '注释', '补充', '其他信息'],
    },
    location: {
        _nameAliases: ['地点名', '地名', '场景名', '名称'],
        description: ['描述', '简介', '介绍', '说明', '概述'],
        slugline: ['场景标题', '标题行'],
        sensoryVisual: ['视觉', '视觉描写', '画面', '光线'],
        sensoryAudio: ['听觉', '听觉描写', '声音', '音效'],
        sensorySmell: ['嗅觉', '触觉', '嗅觉描写', '气味', '温度'],
        mood: ['氛围', '情绪', '基调', '氛围基调'],
        dangerLevel: ['危险等级', '危险', '安全等级'],
        notes: ['备注', '其他', '注释'],
    },
    object: {
        _nameAliases: ['物品名', '道具名', '名称'],
        description: ['描述', '简介', '介绍', '说明'],
        objectType: ['类型', '分类', '物品类型', '道具分类'],
        rank: ['品阶', '等级', '品级', '稀有度'],
        currentHolder: ['持有者', '拥有者', '持有人', '归属'],
        numericStats: ['数值', '属性', '数值属性', '面板'],
        symbolism: ['象征', '象征意义', '寓意', '隐喻'],
        notes: ['备注', '其他', '注释'],
    },
    world: {
        _nameAliases: ['设定名', '名称'],
        description: ['描述', '简介', '介绍', '内容', '说明', '详情'],
        notes: ['备注', '其他', '注释'],
    },
    plot: {
        _nameAliases: ['标题', '章节名', '名称'],
        status: ['状态', '进度'],
        description: ['描述', '简介', '剧情', '内容', '说明'],
        notes: ['备注', '其他', '注释'],
    },
    rules: {
        _nameAliases: ['规则名', '名称'],
        description: ['描述', '内容', '规则', '说明', '详情'],
        notes: ['备注', '其他'],
    },
};

// 字段 key → 中文显示名（用于导出）
const FIELD_LABELS = {
    character: {
        role: '角色', gender: '性别', age: '年龄',
        appearance: '外貌', personality: '性格',
        background: '背景故事', motivation: '动机', skills: '能力',
        speechStyle: '说话风格', relationships: '人物关系',
        arc: '成长弧线', notes: '备注',
    },
    location: {
        description: '描述', slugline: '场景标题',
        sensoryVisual: '视觉描写', sensoryAudio: '听觉描写',
        sensorySmell: '嗅觉/触觉', mood: '氛围基调',
        dangerLevel: '危险等级', notes: '备注',
    },
    object: {
        description: '描述', objectType: '物品类型', rank: '品阶',
        currentHolder: '持有者', numericStats: '数值属性',
        symbolism: '象征意义', notes: '备注',
    },
    world: { description: '描述', notes: '备注' },
    plot: { status: '状态', description: '描述', notes: '备注' },
    rules: { description: '描述', notes: '备注' },
};

// 分类中文名
const CATEGORY_NAMES = {
    character: '人物设定', location: '空间/地点', object: '物品/道具',
    world: '世界观/设定', plot: '大纲', rules: '写作规则',
};

// 分类检测关键词
const CATEGORY_KEYWORDS = {
    character: ['性别', '年龄', '性格', '外貌', '人物', '角色', '长相', '口头禅', '身世', '人际关系'],
    location: ['地点', '地理', '场景', '地图', '位置', '区域', '氛围', '视觉描写'],
    object: ['物品', '道具', '装备', '武器', '法宝', '品阶', '持有者'],
    world: ['世界', '设定', '体系', '历史', '势力', '社会', '文化', '世界观'],
    plot: ['大纲', '剧情', '章节', '伏笔', '结局', '冲突', '支线'],
    rules: ['规则', '禁忌', '风格', '禁止', '必须'],
};

// 中文分类名 → category key 映射（用于解析节头）
const CATEGORY_NAME_MAP = {
    '人物设定': 'character', '人物': 'character', '角色设定': 'character', '角色': 'character',
    '空间/地点': 'location', '空间 / 地点': 'location', '地点': 'location', '场景': 'location', '地点设定': 'location', '空间': 'location',
    '世界观/设定': 'world', '世界观 / 设定': 'world', '世界观': 'world', '世界': 'world', '世界设定': 'world',
    '物品/道具': 'object', '物品 / 道具': 'object', '物品': 'object', '道具': 'object', '物品设定': 'object',
    '物品道具': 'object', '物品与道具': 'object',
    '装备': 'object', '装备设定': 'object', '装备物品': 'object', '装备/物品': 'object',
    '装备与物品': 'object', '装备道具': 'object', '装备/道具': 'object',
    '武器': 'object', '武器装备': 'object', '器物': 'object', '法宝': 'object',
    '大纲': 'plot', '剧情': 'plot', '剧情大纲': 'plot',
    '写作规则': 'rules', '写作': 'rules', '规则': 'rules',
};

// 构建所有已知字段标签集合（用于兼容旧格式导入）
function buildKnownLabelsSet() {
    const labels = new Set();
    for (const catAliases of Object.values(FIELD_ALIASES)) {
        for (const [fk, aliases] of Object.entries(catAliases)) {
            if (fk === '_nameAliases') continue;
            if (Array.isArray(aliases)) aliases.forEach(a => labels.add(a));
        }
    }
    for (const catLabels of Object.values(FIELD_LABELS)) {
        Object.values(catLabels).forEach(l => labels.add(l));
    }
    return labels;
}
const ALL_KNOWN_LABELS = buildKnownLabelsSet();

// ==================== 分类检测 ====================

export function detectCategory(text) {
    const scores = {};
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        scores[cat] = 0;
        for (const kw of keywords) {
            if (text.includes(kw)) scores[cat]++;
        }
    }
    let best = 'character';
    let bestScore = 0;
    for (const [cat, score] of Object.entries(scores)) {
        if (score > bestScore) { best = cat; bestScore = score; }
    }
    return best;
}

// ==================== 结构化文本解析（导入） ====================

/**
 * 检测文本是否为结构化格式（带有分类节头或【】条目标记 + 字段）
 */
export function isStructuredText(text) {
    // TXT 导出格式: │ 分类名  或  ┌───
    if (/^[│┌└]/m.test(text)) return true;
    // 有多个 【name】 单独一行
    const entryHeaders = text.match(/^【.+?】\s*$/gm);
    if (entryHeaders && entryHeaders.length >= 2) return true;
    // Markdown 格式: ## 分类 或 ### 条目
    const mdHeaders = text.match(/^#{2,3}\s+.+$/gm);
    if (mdHeaders && mdHeaders.length >= 2) return true;
    return false;
}

/**
 * 预处理 PDF 提取的纯文本 — 恢复分类和条目结构
 * 优先检测 ■ / ◆ 标记（我们的 PDF 导出格式），
 * 否则用启发式规则（行级分析）
 */
export function preprocessPdfText(text) {
    const lines = text.split('\n');

    // 判断是否为字段行（短标签 + 冒号 + 内容，或 ▸ 标记）
    const isFieldLine = (s) => {
        if (!s) return false;
        // 新格式：▸ 标签：值
        if (/^\u25b8\s*.+?[\uff1a:]/.test(s.trim())) return true;
        return /^[^\s\uff1a:\u3010\u3011\u3002\uff01\uff1f\u25a0\u25c6\u25b8]{1,6}[\uff1a:]\s*/.test(s.trim());
    };

    const SENTENCE_ENDINGS = /[。！？）】」、；\.\!\?\)\]]$/;

    const categoryIndices = new Set();
    const entryIndices = new Set();

    // 检测是否有 ■ / ◆ / ▸ 标记
    const hasMarkers = lines.some(l => /^[\u25a0\u25c6\u25b8]\s/.test(l.trim()));

    if (hasMarkers) {
        // ===== 标记模式：直接使用 ■/◆ =====
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (/^■\s/.test(trimmed)) {
                categoryIndices.add(i);
            } else if (/^◆\s/.test(trimmed)) {
                entryIndices.add(i);
            }
        }
    } else {
        // ===== 启发式模式：用于非本应用导出的 PDF =====
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed) continue;
            if (/—\s*设定集\s*$/.test(trimmed)) continue;
            if (SENTENCE_ENDINGS.test(trimmed)) continue;
            if (isFieldLine(trimmed)) continue;
            if (trimmed.length > 50) continue;

            const nextTrimmed = (lines[i + 1] || '').trim();
            if (isFieldLine(nextTrimmed)) {
                // 下一行是字段 → 本行是条目名
                entryIndices.add(i);
            }
        }
        // 检测分类：非字段、非条目的短行，后面的非空行是一个条目
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed) continue;
            if (entryIndices.has(i)) continue;
            if (isFieldLine(trimmed)) continue;
            if (SENTENCE_ENDINGS.test(trimmed)) continue;
            if (trimmed.length > 30) continue;
            if (/—\s*设定集\s*$/.test(trimmed)) continue;

            // 向前找下一个非空行，看是否是条目
            for (let j = i + 1; j < lines.length; j++) {
                const nextT = lines[j].trim();
                if (!nextT) continue;
                if (entryIndices.has(j)) {
                    categoryIndices.add(i);
                }
                break;
            }
        }
    }

    // 生成结果：去掉 ■/◆ 前缀，加上 ##/### 标记，保留 ▸ 给 parseStructuredText 识别
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        if (categoryIndices.has(i)) {
            result.push(`## ${lines[i].trim().replace(/^\u25a0\s*/, '')}`);
        } else if (entryIndices.has(i)) {
            result.push(`### ${lines[i].trim().replace(/^\u25c6\s*/, '')}`);
        } else {
            result.push(lines[i]);
        }
    }

    return result.join('\n');
}


/**
 * 结构化文本解析 — 正确处理分类节头 + 【条目】 + 字段：值 格式
 * 支持三种结构标记（优先级从高到低）：
 *   1. MD:  **label**：value
 *   2. TXT: 〈label〉：value
 *   3. PDF: ▸ label：value
 *   4. 兼容旧格式: label：value（仅当 label ∈ 已知标签集时）
 * 多行续行统一用 2 空格缩进
 * @returns {Array<{name: string, category: string, fields: Object}>}
 */
export function parseStructuredText(text) {
    const entries = [];
    let currentCategory = 'character';
    let currentEntryName = null;
    let currentFields = {};
    let currentFieldLabel = null;
    let currentFieldLines = [];

    const flushField = () => {
        if (currentFieldLabel) {
            const val = currentFieldLines.join('\n').trim();
            if (val) currentFields[currentFieldLabel] = val;
        }
        currentFieldLabel = null;
        currentFieldLines = [];
    };

    const flushEntry = () => {
        flushField();
        if (currentEntryName && Object.keys(currentFields).length > 0) {
            entries.push({
                name: currentEntryName,
                category: currentCategory,
                fields: { ...currentFields },
            });
        }
        currentEntryName = null;
        currentFields = {};
    };

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // 跳过装饰线（═══ ┌── └── ───等）
        if (/^[═─┌└┐┘]+\s*$/.test(trimmed)) continue;
        // 跳过空行
        if (!trimmed) continue;
        // 跳过顶部标题 (xxx — 设定集)
        if (/—\s*设定集\s*$/.test(trimmed)) continue;

        // === TXT 分类节头: │ 人物设定 ===
        const catBoxMatch = trimmed.match(/^│\s*(.+)$/);
        if (catBoxMatch) {
            flushEntry();
            const catName = catBoxMatch[1].trim();
            currentCategory = CATEGORY_NAME_MAP[catName] || catName;
            continue;
        }

        // === Markdown 二级标题作为分类: ## 人物设定 ===
        const mdH2 = trimmed.match(/^##\s+(.+)$/);
        if (mdH2 && !trimmed.startsWith('###')) {
            const catName = mdH2[1].replace(/\s*—\s*设定集.*$/, '').trim();
            flushEntry();
            currentCategory = CATEGORY_NAME_MAP[catName] || catName;
            continue;
        }

        // === 条目标记: 【name】 单独一行 ===
        const entryBracket = trimmed.match(/^【(.+?)】\s*$/);
        if (entryBracket) {
            flushEntry();
            currentEntryName = entryBracket[1].trim();
            continue;
        }

        // === Markdown 三级标题作为条目: ### name ===
        const entryMd = trimmed.match(/^###\s+(.+)$/);
        if (entryMd) {
            flushEntry();
            currentEntryName = entryMd[1].trim();
            continue;
        }

        // 如果没有条目名但在分类下遇到了内容行，自动以分类名创建条目
        if (!currentEntryName) {
            const looksLikeContent = /^(?:[-*]\s+)?(?:\*\*.+?\*\*\s*[：:]|〈.+?〉\s*[：:]|\u25b8\s*.+?[：:]|[^\s：:\[\]【】]{1,15}[：:])/.test(trimmed)
                || /^[-*]\s+/.test(trimmed);
            if (looksLikeContent) {
                const catNames = Object.entries(CATEGORY_NAME_MAP).find(([, v]) => v === currentCategory);
                currentEntryName = catNames ? catNames[0] : currentCategory;
            } else {
                continue;
            }
        }

        // === 结构标记字段解析（优先级从高到低） ===

        // ① MD 加粗标签: **label**：value  或  - **label**：value
        const mdBold = trimmed.match(/^(?:[-*]\s+)?\*\*(.+?)\*\*\s*[：:]\s*(.*)/);
        if (mdBold) {
            flushField();
            currentFieldLabel = mdBold[1].trim();
            if (mdBold[2].trim()) currentFieldLines.push(mdBold[2].trim());
            continue;
        }

        // ② TXT 尖括号标签: 〈label〉：value
        const angleBracket = trimmed.match(/^〈(.+?)〉\s*[：:]\s*(.*)/);
        if (angleBracket) {
            flushField();
            currentFieldLabel = angleBracket[1].trim();
            if (angleBracket[2].trim()) currentFieldLines.push(angleBracket[2].trim());
            continue;
        }

        // ③ PDF 三角标签: ▸ label：value
        const triangleMark = trimmed.match(/^\u25b8\s*(.+?)\s*[：:]\s*(.*)/);
        if (triangleMark) {
            flushField();
            currentFieldLabel = triangleMark[1].trim();
            if (triangleMark[2].trim()) currentFieldLines.push(triangleMark[2].trim());
            continue;
        }

        // ④ 兼容旧格式: label：value（仅当 label ∈ 已知标签集 或 为简短标签）
        const colonMatch = trimmed.match(/^(?:[-*]\s+)?([^\s：:\[\]【】]{1,15})[：:]\s*(.*)/);
        if (colonMatch) {
            const potentialLabel = colonMatch[1].trim();
            // 只有在已知标签集中才认为是字段开始，否则当作续行
            if (ALL_KNOWN_LABELS.has(potentialLabel)) {
                flushField();
                currentFieldLabel = potentialLabel;
                if (colonMatch[2].trim()) currentFieldLines.push(colonMatch[2].trim());
                continue;
            }
        }

        // === 续行判断 ===

        // 优先级 4：2 空格缩进续行（新格式导出的多行值）
        if (/^\s{2,}/.test(line) && currentFieldLabel) {
            currentFieldLines.push(trimmed);
            continue;
        }

        // === 普通内容行（追加到当前字段，或作为描述） ===
        if (currentFieldLabel) {
            currentFieldLines.push(trimmed);
        } else if (currentEntryName) {
            const cleanLine = trimmed.replace(/^[-*]\s+/, '');
            if (cleanLine) {
                if (!currentFields.description) currentFields.description = '';
                currentFields.description += (currentFields.description ? '\n' : '') + cleanLine;
            }
        }
    }
    flushEntry();

    return entries;
}

/**
 * 简单文本解析（用于没有明确结构的纯文本，单个条目）
 */
export function parseTextToFields(text) {
    const fields = {};
    const lines = text.split('\n');
    let currentLabel = null;
    let currentLines = [];

    const flush = () => {
        if (currentLabel) {
            const val = currentLines.join('\n').trim();
            if (val) fields[currentLabel] = val;
        }
        currentLabel = null;
        currentLines = [];
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const mdMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
        if (mdMatch) { flush(); currentLabel = mdMatch[1].trim(); continue; }
        const bracketMatch = trimmed.match(/^【(.+?)】\s*(.*)/);
        if (bracketMatch) {
            flush();
            currentLabel = bracketMatch[1].trim();
            if (bracketMatch[2].trim()) currentLines.push(bracketMatch[2].trim());
            continue;
        }
        const colonMatch = trimmed.match(/^([^\s：:]{1,10})[：:]\s*(.*)/);
        if (colonMatch) {
            flush();
            currentLabel = colonMatch[1].trim();
            if (colonMatch[2].trim()) currentLines.push(colonMatch[2].trim());
            continue;
        }
        currentLines.push(line);
    }
    flush();

    return fields;
}

/**
 * 将解析出的 {中文标签: 内容} 映射到 content 字段
 * @returns {{ name, content, category }}
 */
export function mapFieldsToContent(parsedFields, category) {
    const aliases = FIELD_ALIASES[category] || {};
    const content = {};
    let name = '';

    for (const [label, value] of Object.entries(parsedFields)) {
        let matched = false;
        if (aliases._nameAliases?.some(a => label.includes(a))) {
            name = value;
            matched = true;
            continue;
        }
        for (const [fieldKey, fieldAliases] of Object.entries(aliases)) {
            if (fieldKey === '_nameAliases') continue;
            if (fieldAliases.some(a => label.includes(a) || a.includes(label))) {
                content[fieldKey] = value;
                matched = true;
                break;
            }
        }
        if (!matched) {
            content[label] = value;
        }
    }

    return { name, content, category };
}

/**
 * 解析多个条目（用于无结构的纯文本，用 --- 或连续空行分隔）
 */
export function parseMultipleEntries(text) {
    const blocks = text.split(/(?:\n\s*---+\s*\n|\n{3,})/).filter(b => b.trim());
    if (blocks.length <= 1) return [text];
    return blocks;
}

// ==================== 文本导出 ====================

/**
 * 将节点数组导出为 TXT 文本
 */
export function exportNodesToTxt(nodes) {
    const workNode = nodes.find(n => n.type === 'work');
    let output = '';

    if (workNode) {
        output += `═══════════════════════════\n`;
        output += `  ${workNode.name} — 设定集\n`;
        output += `═══════════════════════════\n\n`;
    }

    const knownCategories = ['character', 'location', 'world', 'object', 'plot', 'rules'];
    const customCategories = [...new Set(nodes.filter(n => n.type === 'item').map(n => n.category))].filter(c => !knownCategories.includes(c));
    const categories = [...knownCategories, ...customCategories];
    for (const cat of categories) {
        const items = nodes.filter(n => n.type === 'item' && n.category === cat);
        if (items.length === 0) continue;

        const catName = CATEGORY_NAMES[cat] || cat;
        output += `┌──────────────────────────\n`;
        output += `│ ${catName}\n`;
        output += `└──────────────────────────\n\n`;

        const labels = FIELD_LABELS[cat] || {};

        for (const item of items) {
            output += `【${item.name}】\n`;
            const content = item.content || {};
            for (const [key, label] of Object.entries(labels)) {
                if (content[key]) {
                    const lines = content[key].split('\n');
                    output += `〈${label}〉：${lines[0]}\n`;
                    for (let i = 1; i < lines.length; i++) {
                        output += `  ${lines[i]}\n`;
                    }
                }
            }
            const knownKeys = new Set(Object.keys(labels));
            for (const [key, val] of Object.entries(content)) {
                if (!knownKeys.has(key) && val) {
                    const lines = val.split('\n');
                    output += `〈${key}〉：${lines[0]}\n`;
                    for (let i = 1; i < lines.length; i++) {
                        output += `  ${lines[i]}\n`;
                    }
                }
            }
            output += '\n';
        }
    }

    return output.trimEnd() + '\n';
}

/**
 * 将节点数组导出为 Markdown
 */
export function exportNodesToMarkdown(nodes) {
    const workNode = nodes.find(n => n.type === 'work');
    let output = '';

    if (workNode) {
        output += `# ${workNode.name} — 设定集\n\n`;
    }

    const knownCategories = ['character', 'location', 'world', 'object', 'plot', 'rules'];
    const customCategories = [...new Set(nodes.filter(n => n.type === 'item').map(n => n.category))].filter(c => !knownCategories.includes(c));
    const categories = [...knownCategories, ...customCategories];
    for (const cat of categories) {
        const items = nodes.filter(n => n.type === 'item' && n.category === cat);
        if (items.length === 0) continue;

        const catName = CATEGORY_NAMES[cat] || cat;
        output += `## ${catName}\n\n`;

        const labels = FIELD_LABELS[cat] || {};

        for (const item of items) {
            output += `### ${item.name}\n\n`;
            const content = item.content || {};
            for (const [key, label] of Object.entries(labels)) {
                if (content[key]) {
                    const lines = content[key].split('\n');
                    output += `**${label}**：${lines[0]}\n`;
                    for (let i = 1; i < lines.length; i++) {
                        output += `  ${lines[i]}\n`;
                    }
                    output += '\n';
                }
            }
            const knownKeys = new Set(Object.keys(labels));
            for (const [key, val] of Object.entries(content)) {
                if (!knownKeys.has(key) && val) {
                    const lines = val.split('\n');
                    output += `**${key}**：${lines[0]}\n`;
                    for (let i = 1; i < lines.length; i++) {
                        output += `  ${lines[i]}\n`;
                    }
                    output += '\n';
                }
            }
        }
    }

    return output.trimEnd() + '\n';
}

// ==================== DOCX 导出 ====================

/**
 * 将节点数组导出为 DOCX 文件（返回 Blob）
 */
export async function exportNodesToDocx(nodes) {
    const docx = await import('docx');
    const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } = docx;

    const workNode = nodes.find(n => n.type === 'work');
    const children = [];

    children.push(new Paragraph({
        text: `${workNode?.name || '设定集'} — 设定集`,
        heading: HeadingLevel.TITLE,
        spacing: { after: 300 },
    }));

    const knownCategories = ['character', 'location', 'world', 'object', 'plot', 'rules'];
    const customCategories = [...new Set(nodes.filter(n => n.type === 'item').map(n => n.category))].filter(c => !knownCategories.includes(c));
    const categories = [...knownCategories, ...customCategories];
    for (const cat of categories) {
        const items = nodes.filter(n => n.type === 'item' && n.category === cat);
        if (items.length === 0) continue;

        const catName = CATEGORY_NAMES[cat] || cat;
        children.push(new Paragraph({
            text: catName,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
        }));

        const labels = FIELD_LABELS[cat] || {};

        for (const item of items) {
            children.push(new Paragraph({
                text: item.name,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
            }));

            const content = item.content || {};
            for (const [key, label] of Object.entries(labels)) {
                if (content[key]) {
                    const lines = content[key].split('\n');
                    children.push(new Paragraph({
                        children: [
                            new TextRun({ text: `${label}：`, bold: true, size: 24, font: '宋体' }),
                            new TextRun({ text: lines[0], size: 24, font: '宋体' }),
                        ],
                        spacing: { after: lines.length > 1 ? 40 : 100, line: 360 },
                        alignment: AlignmentType.LEFT,
                    }));
                    for (let i = 1; i < lines.length; i++) {
                        children.push(new Paragraph({
                            children: [new TextRun({ text: lines[i], size: 24, font: '宋体' })],
                            indent: { left: 480 },
                            spacing: { after: i === lines.length - 1 ? 100 : 40, line: 360 },
                            alignment: AlignmentType.LEFT,
                        }));
                    }
                }
            }
            const knownKeys = new Set(Object.keys(labels));
            for (const [key, val] of Object.entries(content)) {
                if (!knownKeys.has(key) && val) {
                    const lines = val.split('\n');
                    children.push(new Paragraph({
                        children: [
                            new TextRun({ text: `${key}：`, bold: true, size: 24, font: '宋体' }),
                            new TextRun({ text: lines[0], size: 24, font: '宋体' }),
                        ],
                        spacing: { after: lines.length > 1 ? 40 : 100, line: 360 },
                        alignment: AlignmentType.LEFT,
                    }));
                    for (let i = 1; i < lines.length; i++) {
                        children.push(new Paragraph({
                            children: [new TextRun({ text: lines[i], size: 24, font: '宋体' })],
                            indent: { left: 480 },
                            spacing: { after: i === lines.length - 1 ? 100 : 40, line: 360 },
                            alignment: AlignmentType.LEFT,
                        }));
                    }
                }
            }
        }
    }

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

    return await Packer.toBlob(doc);
}

// ==================== DOCX / PDF 导入 ====================

/**
 * 从 DOCX 文件中提取结构化文本（保留标题层级）
 * H1 → ## (分类)   H2 → ### (条目名)   <strong> → 保留标签格式
 */
export async function parseDocxToText(file) {
    const mammoth = await import('mammoth');
    const arrayBuf = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuf });
    const html = result.value || '';
    if (!html.trim()) throw localizedError('文件内容为空', 'The file is empty.', 'Файл пуст.');

    const text = html
        // 标题转 Markdown 格式（保留结构）
        .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n## ${c.replace(/<[^>]*>/g, '').trim()}\n`)
        .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n### ${c.replace(/<[^>]*>/g, '').trim()}\n`)
        .replace(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/gi, (_, c) => `\n#### ${c.replace(/<[^>]*>/g, '').trim()}\n`)
        // 加粗文本保留为 **...** 格式（让解析器能识别加粗标签模式）
        .replace(/<strong>([\s\S]*?)<\/strong>/gi, (_, c) => `**${c.replace(/<[^>]*>/g, '')}**`)
        .replace(/<b>([\s\S]*?)<\/b>/gi, (_, c) => `**${c.replace(/<[^>]*>/g, '')}**`)
        // 段落和换行
        .replace(/<\/(?:p|li|div)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        // 去除剩余 HTML 标签
        .replace(/<[^>]*>/g, '')
        // HTML 实体
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        // 清理多余空行
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!text) throw localizedError('文件内容为空', 'The file is empty.', 'Файл пуст.');
    return text;
}

/**
 * 从 PDF 文件中提取纯文本（通过服务端 API）
 */
export async function parsePdfToText(file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        if (response.status === 413) {
            throw localizedError('PDF 文件体积过大，请尝试压缩后重新导入', 'The PDF is too large. Please compress it and re-import.', 'PDF слишком большой. Сожмите его и импортируйте снова.');
        }
        const data = await response.json().catch(() => ({}));
        throw new Error(localizeApiError(data, tt) || `${tt('PDF 解析失败', 'PDF parsing failed', 'Не удалось разобрать PDF')} (${response.status})`);
    }
    const data = await response.json();
    if (!data.text?.trim()) {
        throw new Error(localizeApiError(data, tt) || tt('PDF 内容为空，可能是扫描件或图片PDF', 'The PDF has no extractable text — it may be a scan or image-only PDF.', 'В PDF нет извлекаемого текста — возможно, это скан или PDF из изображений.'));
    }
    return data.text;
}

// ==================== PDF 导出 ====================

/**
 * 将节点数组导出为 PDF（通过浏览器打印）
 * 条目名前加 ◆ 标记、分类名前加 ■ 标记，便于导入时识别
 */
export function exportSettingsAsPdf(nodes) {
    const workNode = nodes.find(n => n.type === 'work');
    // 转义作品名（用户可控），避免 </title> / </h1> 上下文逃逸执行脚本
    const safeWorkName = String(workNode?.name || '设定集')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const title = `${safeWorkName} — 设定集`;

    let html = '';
    const knownCategories = ['character', 'location', 'world', 'object', 'plot', 'rules'];
    const customCategories = [...new Set(nodes.filter(n => n.type === 'item').map(n => n.category))].filter(c => !knownCategories.includes(c));
    const categories = [...knownCategories, ...customCategories];
    for (const cat of categories) {
        const items = nodes.filter(n => n.type === 'item' && n.category === cat);
        if (items.length === 0) continue;

        const catName = CATEGORY_NAMES[cat] || cat;
        html += `<h2 style="color:#8b6914;border-bottom:2px solid #d4a853;padding-bottom:4px;margin-top:28px;">■ ${catName}</h2>`;

        const labels = FIELD_LABELS[cat] || {};
        for (const item of items) {
            html += `<h3 style="margin:16px 0 8px;">◆ ${item.name}</h3>`;
            const content = item.content || {};
            for (const [key, label] of Object.entries(labels)) {
                if (content[key]) {
                    const lines = content[key].split('\n');
                    const escaped0 = lines[0].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    html += `<p style="margin:4px 0;line-height:1.7;"><b>▸ ${label}：</b>${escaped0}</p>`;
                    for (let i = 1; i < lines.length; i++) {
                        const escaped = lines[i].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                        html += `<p style="margin:2px 0 2px 2em;line-height:1.7;">${escaped}</p>`;
                    }
                }
            }
            const knownKeys = new Set(Object.keys(labels));
            for (const [key, val] of Object.entries(content)) {
                if (!knownKeys.has(key) && val) {
                    const lines = val.split('\n');
                    const escaped0 = lines[0].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    html += `<p style="margin:4px 0;line-height:1.7;"><b>▸ ${key}：</b>${escaped0}</p>`;
                    for (let i = 1; i < lines.length; i++) {
                        const escaped = lines[i].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                        html += `<p style="margin:2px 0 2px 2em;line-height:1.7;">${escaped}</p>`;
                    }
                }
            }
        }
    }

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:'宋体','SimSun',serif;font-size:14px;max-width:700px;margin:0 auto;padding:30px;color:#333;}
h1{text-align:center;font-size:22px;margin-bottom:30px;}
h2{font-size:18px;}h3{font-size:15px;}p{text-indent:0;}
@media print{body{padding:0;}}</style></head>
<body><h1>${title}</h1>${html}</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(fullHtml);
        win.document.close();
        setTimeout(() => win.print(), 500);
    }
}

// ==================== PMPX 导入（排骨笔记） ====================

// PMPX 属性名 → Author 字段 key 映射
const PMPX_FIELD_MAP = {
    '核心身份': 'role', '职业': 'role', '核心身份|职业': 'role',
    '核心性格': 'personality',
    '核心欲望': 'motivation',
    '关键背景': 'background',
    '标志与缺陷': 'appearance',
    '天赋': 'skills', '核心技能': 'skills', '天赋|核心技能': 'skills',
    '说话风格': 'speechStyle', '口头禅': 'speechStyle',
    '关系': 'relationships', '人际关系': 'relationships',
    '成长弧线': 'arc',
};

// PMPX type → Author category
const PMPX_TYPE_MAP = {
    'character': 'character',
    'location': 'location',
    'object': 'object',
    'world': 'world',
    'plot': 'plot',
};

/**
 * 从 PMPX 富文本 content JSON 中提取纯文本
 */
function extractPmpxText(contentJson) {
    try {
        const content = typeof contentJson === 'string' ? JSON.parse(contentJson) : contentJson;
        const blocks = content?.blocks || [];
        const parts = [];
        for (const block of blocks) {
            const spans = block?.spans || [];
            for (const span of spans) {
                if (span?.text) parts.push(span.text);
            }
        }
        return parts.join('').trim();
    } catch {
        return '';
    }
}

/**
 * 从 PMPX 文件（排骨笔记导出的 .pmpx）中解析角色/物品数据
 * @param {File} file - .pmpx 文件
 * @returns {Promise<Array<{name: string, category: string, content: Object}>>}
 */
export async function parsePmpxFile(file) {
    const JSZip = (await import('jszip')).default;
    const arrayBuf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuf);

    const items = [];

    // 遍历所有 materials/ 下的 .pobj 文件（跳过 templates/）
    const pobjFiles = [];
    zip.forEach((path, entry) => {
        if (path.startsWith('materials/') && path.endsWith('.pobj') && !entry.dir) {
            pobjFiles.push(entry);
        }
    });

    for (const entry of pobjFiles) {
        const text = await entry.async('text');
        let data;
        try { data = JSON.parse(text); } catch { continue; }

        // 跳过模板
        if (data.isTemplate) continue;

        const name = data.name || '未命名';
        const category = PMPX_TYPE_MAP[data.type] || 'character';
        const properties = data.properties || [];
        const content = {};

        // 解析属性：PMPX 使用配对模式 —
        // kvDocument/inheritedKvDocument（带 name 标签）后跟 textBlock/inheritedTextBlock（无 name，作为补充说明）
        for (let i = 0; i < properties.length; i++) {
            const prop = properties[i];
            const propName = prop.name || '';
            const propText = extractPmpxText(prop.content);
            const propType = prop.type || '';

            // 无名 textBlock → 附加到上一个有名字段
            if (!propName && (propType === 'textBlock' || propType === 'inheritedTextBlock')) {
                if (propText) {
                    // 找到最后写入的字段，追加内容
                    const lastKey = Object.keys(content).pop();
                    if (lastKey && content[lastKey]) {
                        content[lastKey] += '\n' + propText;
                    } else if (lastKey) {
                        content[lastKey] = propText;
                    } else {
                        // 没有上一个字段，存到 notes
                        content.notes = (content.notes ? content.notes + '\n' : '') + propText;
                    }
                }
                continue;
            }

            if (!propName) continue;

            // 映射 PMPX 属性名到 Author 字段 key
            // 先尝试完整匹配，再尝试 | 分割后的各部分
            let fieldKey = PMPX_FIELD_MAP[propName];
            if (!fieldKey) {
                const parts = propName.split('|');
                for (const part of parts) {
                    fieldKey = PMPX_FIELD_MAP[part.trim()];
                    if (fieldKey) break;
                }
            }
            // 仍未匹配 → 保留原始属性名作为 key
            if (!fieldKey) fieldKey = propName;

            // 合并到同一字段（如果已存在）
            if (content[fieldKey] && propText) {
                content[fieldKey] += '\n' + propText;
            } else if (propText) {
                content[fieldKey] = propText;
            }
        }

        if (Object.keys(content).length > 0) {
            items.push({ name, category, content });
        }
    }

    return items;
}
