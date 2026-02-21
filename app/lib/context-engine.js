// 上下文收集引擎 — 像 Cursor 一样，在每次 AI 调用前自动汇聚所有相关信息
// 让 AI 完整理解：作品风格、人物设定、世界观、前文脉络、当前位置

import { getChapters } from './storage';
import { getProjectSettings, getSettingsNodes, getWritingMode, getActiveWorkId } from './settings';
import { getEmbedding, cosineSimilarity } from './embeddings';

// ==================== Token 预算管理 ====================

export const INPUT_TOKEN_BUDGET = 200000;  // 输入预算（发送给AI的上下文）
export const OUTPUT_TOKEN_BUDGET = 6000;   // 输出预算（AI生成的回复长度，约4500字）

// 中文 token 估算：约 1.5 个中文字符 = 1 个 token
export function estimateTokens(text) {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

// 上下文模块优先级（数字越小越优先）
const PRIORITY = {
    writingRules: 1,   // 写作规则——必须严格遵守
    currentChapter: 2, // 当前章节元信息
    characters: 3,     // 人物设定
    plotOutline: 4,    // 大纲
    bookInfo: 5,       // 作品信息
    worldbuilding: 6,  // 世界观
    locations: 7,      // 地点
    objects: 8,        // 物品
    customSettings: 9, // 自定义设定
    previousChapters: 10, // 前文回顾（最容易截断）
};

/**
 * 获取上下文可勾选条目列表（供「📚 参考」Tab 使用） (Async)
 * 返回扁平化数组，每个条目包含 id, group, name, tokens, category
 */
export async function getContextItems(activeChapterId) {
    const settings = getProjectSettings();
    const chapters = await getChapters();
    const currentIndex = chapters.findIndex(ch => ch.id === activeChapterId);

    const allNodes = await getSettingsNodes();
    const activeWorkId = getActiveWorkId();

    // 按当前作品过滤
    let nodes;
    if (activeWorkId) {
        const workDesc = new Set();
        const coll = (pid) => { allNodes.filter(n => n.parentId === pid).forEach(n => { workDesc.add(n.id); coll(n.id); }); };
        workDesc.add(activeWorkId);
        coll(activeWorkId);
        nodes = allNodes.filter(n => workDesc.has(n.id));
    } else {
        nodes = allNodes;
    }
    const itemNodes = nodes.filter(n => n.type === 'item');

    const items = [];

    // 分类映射
    const categoryMap = {
        rules: { group: '📐 写作规则', builder: (ns) => buildRulesContext(ns) },
        character: { group: '👤 人物设定', builder: (ns) => buildCharactersContext(ns) },
        location: { group: '🗺️ 空间/地点', builder: (ns) => buildLocationsContext(ns, nodes) },
        world: { group: '🌍 世界观', builder: (ns) => buildWorldContext(ns, nodes) },
        object: { group: '🔮 物品/道具', builder: (ns) => buildObjectsContext(ns, nodes) },
        plot: { group: '📋 大纲', builder: (ns) => buildPlotContext(ns, nodes) },
        custom: { group: '⚙️ 自定义', builder: (ns) => buildCustomContext(ns, nodes) },
    };

    // 设定条目
    for (const [cat, config] of Object.entries(categoryMap)) {
        const catNodes = itemNodes.filter(n => n.category === cat);
        if (catNodes.length === 0) {
            // 检查是否有该分类的文件夹 — 如果有，显示空提示
            const hasFolder = nodes.some(n => n.type === 'folder' && n.category === cat);
            if (hasFolder) {
                items.push({
                    id: `empty-${cat}`,
                    group: config.group,
                    name: '（暂无条目）',
                    tokens: 0,
                    category: cat,
                    enabled: false,
                    _empty: true,
                });
            }
            continue;
        }
        for (const n of catNodes) {
            const text = config.builder([n]);
            items.push({
                id: `setting-${n.id}`,
                group: config.group,
                name: n.name,
                tokens: estimateTokens(text),
                category: cat,
                enabled: n.enabled !== false,
                _nodeId: n.id,
            });
        }
    }

    // 作品信息
    const bookInfo = settings.bookInfo;
    if (bookInfo && (bookInfo.title || bookInfo.author || bookInfo.genre || bookInfo.synopsis)) {
        items.push({
            id: 'bookinfo',
            group: '📖 作品信息',
            name: bookInfo.title || '作品信息',
            tokens: estimateTokens(buildBookInfoContext(bookInfo)),
            category: 'bookInfo',
            enabled: true,
        });
    }

    // 章节条目 — 显示全部章节
    chapters.forEach((ch, i) => {
        const text = stripHtml(ch.content || '');
        if (i === currentIndex) {
            // 当前章节
            items.push({
                id: `chapter-current`,
                group: '📑 章节',
                name: `第${i + 1}章 ${ch.title}（当前）`,
                tokens: estimateTokens(buildCurrentContext(ch, i, chapters.length)),
                category: 'currentChapter',
                enabled: true,
            });
        } else {
            items.push({
                id: `chapter-${ch.id}`,
                group: '📑 章节',
                name: `第${i + 1}章 ${ch.title}${i > currentIndex ? '（后续）' : ''}`,
                tokens: estimateTokens(text ? text.slice(0, 1500) : ''),
                category: 'chapter',
                enabled: i < currentIndex, // 前文章节默认启用，后续章节默认不启用
            });
        }
    });

    return items;
}

/**
 * 构建完整的 AI 上下文 (Async)
 * @param {string} activeChapterId
 * @param {string} selectedText
 * @param {Set|null} selectedIds - 如果提供，只包含 id 在此 Set 中的条目
 */
export async function buildContext(activeChapterId, selectedText, selectedIds = null) {
    const settings = getProjectSettings();
    const chapters = await getChapters();
    const currentChapter = chapters.find(ch => ch.id === activeChapterId);
    const currentIndex = chapters.findIndex(ch => ch.id === activeChapterId);

    // 从树形节点读取设定（过滤掉禁用项，并按当前作品过滤）
    const allNodes = await getSettingsNodes();
    const activeWorkId = getActiveWorkId();

    // 收集当前作品的所有后代节点
    let nodes;
    if (activeWorkId) {
        const workDescendants = new Set();
        const collectDesc = (pid) => {
            allNodes.filter(n => n.parentId === pid).forEach(n => {
                workDescendants.add(n.id);
                collectDesc(n.id);
            });
        };
        workDescendants.add(activeWorkId);
        collectDesc(activeWorkId);
        nodes = allNodes.filter(n => workDescendants.has(n.id));
    } else {
        nodes = allNodes;
    }

    // 获取所有有效的设定条目
    const allValidItemNodes = nodes.filter(n => n.type === 'item' && n.enabled !== false);

    // 如果有 selectedIds，提取手动勾选的设定
    const manualItemNodes = [];
    const unselectedItemNodes = [];

    for (const n of allValidItemNodes) {
        // 规则类总是作为手动（强制生效）如果 enabled
        if (n.category === 'rules') {
            manualItemNodes.push(n);
            continue;
        }

        if (selectedIds && selectedIds.has(`setting-${n.id}`)) {
            manualItemNodes.push(n);
        } else if (!selectedIds) {
            // 如果 selectedIds 为 null，默认所有启用的项都算作手动（兼容旧逻辑，或视情况全转RAG）
            // 为了发挥 RAG 威力，如果 selectedIds 为 null，我们可以假设除了规则外，全部走向 RAG，
            // 或者全部走 Manual。这里我们设定期望：全部走 RAG 自动检索。
            unselectedItemNodes.push(n);
        } else {
            unselectedItemNodes.push(n);
        }
    }

    // --- RAG 自动检索 ---
    let autoRetrievedNodes = [];
    const queryText = (selectedText || '').trim();
    if (queryText && unselectedItemNodes.length > 0) {
        try {
            // 获取 Query 的 Embedding
            // 此处的文本可以是光标前的一小段文字，为了简便使用 selectedText
            const { apiConfig } = getProjectSettings();
            // TODO: 这里如果是空文本，可能需要补当前章节最近的内容
            let ragSourceText = queryText;
            if (ragSourceText.length < 50 && currentChapter) {
                // 文本太短，用当前章节末尾补充
                const stripChapText = stripHtml(currentChapter.content || '').slice(-200);
                ragSourceText = ragSourceText + '\n' + stripChapText;
            }

            const queryVector = await getEmbedding(ragSourceText, apiConfig);
            if (queryVector) {
                // 计算相似度
                const scoredNodes = unselectedItemNodes.map(n => {
                    if (!n.embedding) return { node: n, score: -1 };
                    return { node: n, score: cosineSimilarity(queryVector, n.embedding) };
                }).filter(x => x.score > 0.3); // 设置一个基础阈值 0.3

                // 按分数降序
                scoredNodes.sort((a, b) => b.score - a.score);

                // 取 Top-K (比如最多取 5 个)
                autoRetrievedNodes = scoredNodes.slice(0, 5).map(x => x.node);
            }
        } catch (e) {
            console.error('RAG Retrieval failed:', e);
        }
    }

    // 合并手动与自动检索的节点
    const itemNodes = [...manualItemNodes, ...autoRetrievedNodes];
    // 去重
    const finalItemNodes = Array.from(new Set(itemNodes));

    const writingMode = getWritingMode();

    // 先构建各模块的原始文本
    const rawModules = {
        bookInfo: (!selectedIds || selectedIds.has('bookinfo')) ? buildBookInfoContext(settings.bookInfo) : '',
        characters: buildCharactersContext(finalItemNodes.filter(n => n.category === 'character')),
        locations: buildLocationsContext(finalItemNodes.filter(n => n.category === 'location'), nodes),
        worldbuilding: buildWorldContext(finalItemNodes.filter(n => n.category === 'world'), nodes),
        objects: buildObjectsContext(finalItemNodes.filter(n => n.category === 'object'), nodes),
        plotOutline: buildPlotContext(finalItemNodes.filter(n => n.category === 'plot'), nodes),
        writingRules: buildRulesContext(finalItemNodes.filter(n => n.category === 'rules')),
        customSettings: buildCustomContext(finalItemNodes.filter(n => n.category === 'custom'), nodes),
        previousChapters: selectedIds
            ? buildPreviousContextFiltered(chapters, currentIndex, selectedIds)
            : buildPreviousContext(chapters, currentIndex),
        currentChapter: (!selectedIds || selectedIds.has('chapter-current'))
            ? buildCurrentContext(currentChapter, currentIndex, chapters.length)
            : '',
    };

    // 按优先级分配 token 预算
    const budgetedModules = applyTokenBudget(rawModules);

    const context = {
        writingMode,
        ...budgetedModules,
        focusText: selectedText || '',
    };

    return context;
}

/**
 * 按优先级分配 token 预算，超出时截断低优先级内容
 */
function applyTokenBudget(modules) {
    // 计算每个模块的 token
    const entries = Object.entries(modules).map(([key, text]) => ({
        key,
        text: text || '',
        tokens: estimateTokens(text),
        priority: PRIORITY[key] || 99,
    }));

    // 按优先级排序
    entries.sort((a, b) => a.priority - b.priority);

    let remaining = INPUT_TOKEN_BUDGET;
    const result = {};

    for (const entry of entries) {
        if (entry.tokens <= remaining) {
            result[entry.key] = entry.text;
            remaining -= entry.tokens;
        } else if (remaining > 100) {
            // 截断：按比例保留
            const ratio = remaining / entry.tokens;
            const keepChars = Math.floor(entry.text.length * ratio * 0.9); // 留10%余量
            result[entry.key] = entry.text.slice(0, keepChars) + '\n…（因 token 限制，部分内容已省略）';
            remaining = 0;
        } else {
            result[entry.key] = ''; // 预算耗尽
        }
    }

    return result;
}

/**
 * 获取上下文预览（各模块状态和 token 估算） (Async)
 */
export async function getContextPreview(activeChapterId, selectedText) {
    const settings = getProjectSettings();
    const chapters = await getChapters();
    const currentChapter = chapters.find(ch => ch.id === activeChapterId);
    const currentIndex = chapters.findIndex(ch => ch.id === activeChapterId);

    const allNodes = await getSettingsNodes();
    const activeWorkId = getActiveWorkId();

    // 按当前作品过滤
    let nodes;
    if (activeWorkId) {
        const workDesc = new Set();
        const coll = (pid) => { allNodes.filter(n => n.parentId === pid).forEach(n => { workDesc.add(n.id); coll(n.id); }); };
        workDesc.add(activeWorkId);
        coll(activeWorkId);
        nodes = allNodes.filter(n => workDesc.has(n.id));
    } else {
        nodes = allNodes;
    }
    const allItemNodes = nodes.filter(n => n.type === 'item');
    const enabledItemNodes = allItemNodes.filter(n => n.enabled !== false);

    const modules = [
        {
            key: 'writingRules',
            label: '📐 写作规则',
            count: enabledItemNodes.filter(n => n.category === 'rules').length,
            totalCount: allItemNodes.filter(n => n.category === 'rules').length,
            tokens: estimateTokens(buildRulesContext(enabledItemNodes.filter(n => n.category === 'rules'))),
            priority: PRIORITY.writingRules,
        },
        {
            key: 'characters',
            label: '👤 人物设定',
            count: enabledItemNodes.filter(n => n.category === 'character').length,
            totalCount: allItemNodes.filter(n => n.category === 'character').length,
            tokens: estimateTokens(buildCharactersContext(enabledItemNodes.filter(n => n.category === 'character'))),
            priority: PRIORITY.characters,
        },
        {
            key: 'locations',
            label: '🗺️ 空间/地点',
            count: enabledItemNodes.filter(n => n.category === 'location').length,
            totalCount: allItemNodes.filter(n => n.category === 'location').length,
            tokens: estimateTokens(buildLocationsContext(enabledItemNodes.filter(n => n.category === 'location'), nodes)),
            priority: PRIORITY.locations,
        },
        {
            key: 'worldbuilding',
            label: '🌍 世界观',
            count: enabledItemNodes.filter(n => n.category === 'world').length,
            totalCount: allItemNodes.filter(n => n.category === 'world').length,
            tokens: estimateTokens(buildWorldContext(enabledItemNodes.filter(n => n.category === 'world'), nodes)),
            priority: PRIORITY.worldbuilding,
        },
        {
            key: 'objects',
            label: '🔮 物品/道具',
            count: enabledItemNodes.filter(n => n.category === 'object').length,
            totalCount: allItemNodes.filter(n => n.category === 'object').length,
            tokens: estimateTokens(buildObjectsContext(enabledItemNodes.filter(n => n.category === 'object'), nodes)),
            priority: PRIORITY.objects,
        },
        {
            key: 'plotOutline',
            label: '📋 大纲',
            count: enabledItemNodes.filter(n => n.category === 'plot').length,
            totalCount: allItemNodes.filter(n => n.category === 'plot').length,
            tokens: estimateTokens(buildPlotContext(enabledItemNodes.filter(n => n.category === 'plot'), nodes)),
            priority: PRIORITY.plotOutline,
        },
        {
            key: 'bookInfo',
            label: '📖 作品信息',
            count: settings.bookInfo?.title ? 1 : 0,
            totalCount: 1,
            tokens: estimateTokens(buildBookInfoContext(settings.bookInfo)),
            priority: PRIORITY.bookInfo,
        },
        {
            key: 'previousChapters',
            label: '📑 前文回顾',
            count: Math.max(0, currentIndex),
            totalCount: Math.max(0, currentIndex),
            tokens: estimateTokens(buildPreviousContext(chapters, currentIndex)),
            priority: PRIORITY.previousChapters,
        },
        {
            key: 'currentChapter',
            label: '✏️ 当前章节',
            count: currentChapter ? 1 : 0,
            totalCount: 1,
            tokens: estimateTokens(buildCurrentContext(currentChapter, currentIndex, chapters.length)),
            priority: PRIORITY.currentChapter,
        },
    ];

    const totalTokens = modules.reduce((sum, m) => sum + m.tokens, 0);

    return {
        modules,
        totalTokens,
        inputBudget: INPUT_TOKEN_BUDGET,
        outputBudget: OUTPUT_TOKEN_BUDGET,
        budget: INPUT_TOKEN_BUDGET,  // 兼容旧字段
        overBudget: totalTokens > INPUT_TOKEN_BUDGET,
    };
}

/**
 * 将上下文编译成系统提示词
 */
export function compileSystemPrompt(context, mode) {
    const sections = [];

    sections.push(getModeRolePrompt(context.writingMode));

    if (context.bookInfo) {
        sections.push(`【作品信息】\n${context.bookInfo}`);
    }
    if (context.characters) {
        sections.push(`【人物档案】\n以下是本作品中的重要角色，写作时必须严格遵循他们的设定：\n${context.characters}`);
    }
    if (context.locations) {
        sections.push(`【空间/地点】\n以下是本作品中的重要场所：\n${context.locations}`);
    }
    if (context.worldbuilding) {
        sections.push(`【世界观设定】\n以下是本作品的世界观，所有内容必须在这个框架内：\n${context.worldbuilding}`);
    }
    if (context.objects) {
        sections.push(`【物品/道具】\n以下是本作品中的重要物品：\n${context.objects}`);
    }
    if (context.plotOutline) {
        sections.push(`【剧情大纲】\n${context.plotOutline}`);
    }
    if (context.writingRules) {
        sections.push(`【写作规则——必须严格遵守】\n${context.writingRules}`);
    }
    if (context.customSettings) {
        sections.push(`【补充设定】\n${context.customSettings}`);
    }
    if (context.previousChapters) {
        sections.push(`【前文回顾】\n以下是之前章节的主要内容，续写时必须保持连贯：\n${context.previousChapters}`);
    }
    if (context.currentChapter) {
        sections.push(`【当前写作位置】\n${context.currentChapter}`);
    }

    const modeInstruction = getModeInstruction(mode);
    sections.push(`【你的任务】\n${modeInstruction}`);

    return sections.join('\n\n---\n\n');
}

/**
 * 构建用户提示词
 */
export function compileUserPrompt(mode, text, instruction) {
    switch (mode) {
        case 'continue':
            if (!text || !text.trim()) {
                return instruction
                    ? `请根据以下要求开始创作新内容（约300-500字）：\n要求：${instruction}`
                    : '请根据设定集信息，开始撰写新的章节内容（约300-500字）。';
            }
            return instruction
                ? `请续写以下内容（约300-500字），保持风格和情节的连贯性：\n要求：${instruction}\n\n「${text}」`
                : `请续写以下内容（约300-500字），保持风格和情节的连贯性：\n\n「${text}」`;
        case 'rewrite':
            return instruction
                ? `按照以下要求改写文本：\n要求：${instruction}\n\n原文：\n「${text}」`
                : `请润色改写以下文本，提升文学质量：\n\n「${text}」`;
        case 'expand':
            return `请扩写以下文本，加入更丰富的细节和描写（约为原文1.5-2倍）：\n\n「${text}」`;
        case 'condense':
            return `请精简以下文本，保留核心信息，删除冗余：\n\n「${text}」`;
        case 'dialogue':
            return `请为以下场景优化或续写人物对话，对话须符合各角色的说话风格：\n\n「${text}」`;
        case 'chat':
            // 自由对话模式：instruction 是用户的问题，text 可能是选中文本
            if (text && instruction) {
                return `${instruction}\n\n参考文本：\n「${text}」`;
            }
            return instruction || text || '请根据设定集信息回答我的问题。';
        default:
            return instruction ? `${instruction}\n\n「${text}」` : text;
    }
}

// ==================== 内部构建函数 ====================

function buildBookInfoContext(bookInfo) {
    if (!bookInfo) return '';
    const parts = [];
    if (bookInfo.title) parts.push(`书名：${bookInfo.title}`);
    if (bookInfo.genre) parts.push(`题材：${bookInfo.genre}`);
    if (bookInfo.synopsis) parts.push(`故事简介：${bookInfo.synopsis}`);
    if (bookInfo.style) parts.push(`写作风格：${bookInfo.style}`);
    if (bookInfo.tone) parts.push(`整体基调：${bookInfo.tone}`);
    if (bookInfo.pov) parts.push(`叙事视角：${bookInfo.pov}`);
    if (bookInfo.targetAudience) parts.push(`目标读者：${bookInfo.targetAudience}`);
    return parts.length > 0 ? parts.join('\n') : '';
}

// 从树节点构建人物上下文
function buildCharactersContext(charNodes) {
    if (!charNodes || charNodes.length === 0) return '';
    return charNodes.map(n => {
        const c = n.content || {};
        const parts = [`【${n.name}】（${c.role || '角色'}）(id: ${n.id})`];
        if (c.age) parts.push(`  年龄：${c.age}`);
        if (c.gender) parts.push(`  性别：${c.gender}`);
        if (c.appearance) parts.push(`  外貌：${c.appearance}`);
        if (c.personality) parts.push(`  性格：${c.personality}`);
        if (c.background) parts.push(`  背景：${c.background}`);
        if (c.motivation) parts.push(`  动机/目标：${c.motivation}`);
        if (c.skills) parts.push(`  能力：${c.skills}`);
        if (c.speechStyle) parts.push(`  说话风格：${c.speechStyle}`);
        if (c.relationships) parts.push(`  人物关系：${c.relationships}`);
        if (c.arc) parts.push(`  成长弧线：${c.arc}`);
        if (c.notes) parts.push(`  备注：${c.notes}`);
        return parts.join('\n');
    }).join('\n\n');
}

// 从树节点构建世界观上下文（带层级路径）
function buildWorldContext(worldNodes, allNodes) {
    if (!worldNodes || worldNodes.length === 0) return '';
    return worldNodes.map(n => {
        const path = getNodePathStr(n, allNodes);
        const desc = n.content?.description || '';
        return `[${path}] (id: ${n.id})
${desc}`;
    }).join('\n\n');
}

// 从树节点构建大纲上下文
function buildPlotContext(plotNodes, allNodes) {
    if (!plotNodes || plotNodes.length === 0) return '';
    return plotNodes.map(n => {
        const path = getNodePathStr(n, allNodes);
        const status = n.content?.status ? `（${n.content.status}）` : '';
        const desc = n.content?.description || '';
        return `[${path}]${status} (id: ${n.id})
${desc}`;
    }).join('\n\n');
}

// 从树节点构建写作规则
function buildRulesContext(rulesNodes) {
    if (!rulesNodes || rulesNodes.length === 0) return '';
    return rulesNodes.map(n => {
        const desc = n.content?.description || '';
        return `${n.name} (id: ${n.id})：
${desc}`;
    }).join('\n\n');
}

// 从树节点构建自定义设定
function buildCustomContext(customNodes, allNodes) {
    if (!customNodes || customNodes.length === 0) return '';
    return customNodes.map(n => {
        const path = getNodePathStr(n, allNodes);
        const desc = n.content?.description || '';
        return `[${path}] (id: ${n.id})
${desc}`;
    }).join('\n\n');
}

// 获取节点路径字符串（不含根分类）
function getNodePathStr(node, allNodes) {
    const path = [];
    let current = node;
    while (current) {
        if (current.parentId !== null) {
            path.unshift(current.name);
        }
        current = current.parentId ? allNodes.find(n => n.id === current.parentId) : null;
    }
    return path.join(' / ');
}

function buildPreviousContext(chapters, currentIndex) {
    if (currentIndex <= 0) return '';

    const prevChapters = chapters.slice(0, currentIndex);

    return prevChapters.map((ch, i) => {
        const text = stripHtml(ch.content || '');
        if (!text) return `第${i + 1}章「${ch.title}」：（空）`;

        if (i === currentIndex - 1) {
            // 前一章：保留更多内容
            const excerpt = text.length > 1500 ? '...' + text.slice(-1500) : text;
            return `第${i + 1}章「${ch.title}」（前一章完整回顾）：\n${excerpt}`;
        }

        // 远距章节：只保留简要摘要
        if (text.length > 300) {
            return `第${i + 1}章「${ch.title}」：\n${text.slice(0, 150)}…（中间省略）…${text.slice(-100)}`;
        }
        return `第${i + 1}章「${ch.title}」：\n${text}`;
    }).join('\n\n');
}

// 按 selectedIds 过滤的前文上下文
function buildPreviousContextFiltered(chapters, currentIndex, selectedIds) {
    if (currentIndex <= 0) return '';

    const prevChapters = chapters.slice(0, currentIndex);
    const selected = prevChapters.filter(ch => selectedIds.has(`chapter-${ch.id}`));
    if (selected.length === 0) return '';

    return selected.map((ch) => {
        const i = chapters.indexOf(ch);
        const text = stripHtml(ch.content || '');
        if (!text) return `第${i + 1}章「${ch.title}」：（空）`;

        if (i === currentIndex - 1) {
            const excerpt = text.length > 1500 ? '...' + text.slice(-1500) : text;
            return `第${i + 1}章「${ch.title}」（前一章完整回顾）：\n${excerpt}`;
        }

        if (text.length > 300) {
            return `第${i + 1}章「${ch.title}」：\n${text.slice(0, 150)}…（中间省略）…${text.slice(-100)}`;
        }
        return `第${i + 1}章「${ch.title}」：\n${text}`;
    }).join('\n\n');
}

function buildCurrentContext(chapter, index, totalChapters) {
    if (!chapter) return '';
    const text = stripHtml(chapter.content || '');
    const parts = [
        `当前章节：第${index + 1}章 / 共${totalChapters}章`,
        `章节标题：「${chapter.title}」`,
    ];
    if (text) {
        parts.push(`本章已有字数：${text.replace(/\s/g, '').length}字`);
        parts.push(`\n--- 本章正文 ---\n${text}`);
    }
    return parts.join('\n');
}

function getModeInstruction(mode) {
    switch (mode) {
        case 'continue':
            return `根据前文的情节走向和当前章节的内容，自然地续写故事。
要求：
- 续写内容必须与前文情节逻辑严格连贯，不能出现矛盾
- 如果涉及已有角色，必须符合其性格设定和说话风格
- 场景描写要符合世界观设定
- 情节推进要符合大纲规划的方向
- 约300-500字`;

        case 'rewrite':
            return `润色和改写指定文本，提升文学质量。
要求：
- 保持原文的核心含义和情节不变
- 提升感官描写和文学表现力
- 确保改写后的内容仍然符合人物设定和世界观
- 保持叙事视角一致`;

        case 'expand':
            return `扩写指定文本，丰富细节。
要求：
- 增加环境描写、感官细节、心理活动
- 深化人物的情感表达
- 扩写后必须与前后文衔接自然
- 不改变原有情节走向`;

        case 'condense':
            return `精简指定文本，提升节奏感。
要求：
- 删除冗余修饰和重复表达
- 保留核心信息和关键描写
- 保持情节完整性`;

        case 'dialogue':
            return `优化或续写人物对话。
要求：
- 每个角色的对话必须符合其性格设定和说话风格
- 通过对话推动情节或展现人物关系
- 加入适当的动作描写和表情细节
- 对话节奏要自然，长短句交替`;

        case 'chat':
            return `作为创作顾问，根据上述设定集的全部信息回答作者的问题。
要求：
- 回答必须基于已有的设定信息，不能凭空捏造
- 如果问题涉及设定中未覆盖的内容，可以给出基于现有设定的合理建议
- 语言简洁明了，尽量具体
- 回答以中文呈现

【设定集管理能力】
当用户要求你创建、修改或删除设定集条目时，你可以在回复中嵌入操作指令块。格式如下：

\`\`\`
[SETTINGS_ACTION]
{"action":"add","category":"character","name":"角色姓名","content":{"role":"主角","personality":"...","background":"..."}}
[/SETTINGS_ACTION]
\`\`\`

可用的 action: "add"（新增）、"update"（更新，需提供 nodeId）、"delete"（删除，需提供 nodeId）

可用的 category 和对应 content 字段：
- "character"：角色。content 可含：role, age, gender, appearance, personality, background, motivation, skills, speechStyle, relationships, arc, notes
- "world"：世界观。content 可含：description
- "location"：地点。content 可含：description, sensoryVisual, sensoryAudio, sensorySmell, mood, dangerLevel
- "object"：物品。content 可含：description, objectType, currentHolder, rank, numericStats, symbolism
- "plot"：大纲。content 可含：description, status
- "rules"：写作规则。content 可含：description
- "custom"：自定义。content 可含：description

使用规则：
- 每个操作块只包含一个 JSON 对象
- 如果需要多个操作，使用多个 [SETTINGS_ACTION] 块
- 操作块前后必须有正常的文字说明
- update 示例：{"action":"update","nodeId":"具体id","name":"新名称","content":{...}}
- delete 示例：{"action":"delete","nodeId":"具体id"}
- 在正文中已有角色/设定出现时，如果用户要求，可以从正文分析内容并自动创建设定`;

        default:
            return '按照作者的指示完成写作任务，确保内容与已有设定一致。';
    }
}

// ==================== 写作模式角色提示词 ====================

function getModeRolePrompt(writingMode) {
    const base = `你的核心原则：
- 深度理解作品的世界观和人物，绝不写出与设定矛盾的内容
- 保持作者已建立的写作风格和语气，你是协作者，不是替代者
- 对话要体现角色独特的说话方式和性格
- 避免"然而"、"不禁"、"竟然"、"仿佛"等AI味词汇
- 情节推进要自然，符合大纲规划和人物动机`;

    switch (writingMode) {
        case 'webnovel':
            return `你是一位资深网络小说写手兼编辑，擅长连载节奏把控和爽点设计。你正在协助作者创作一部网络小说。
${base}
- 注重节奏感和爽点密度，每个章节要有"钩子"吸引读者
- 严格维护数值体系（等级、属性、技能冷却等）的一致性
- 对话简洁有力，推动剧情和人物关系发展`;

        case 'traditional':
            return `你是一位经验丰富的文学编辑兼小说家，深谙散文美学和主题构建。你正在协助作者创作一部文学作品。
${base}
- 使用丰富的感官描写（视觉、听觉、触觉、嗅觉、味觉）
- 注重主题的编织和意象的呼应，象征具有层次感
- 深入挖掘人物心理，内心独白要体现角色独特的思维方式
- 散文质量优先，追求文字的精确性和美感`;

        case 'screenplay':
            return `你是一位专业的影视编剧兼剧本顾问，精通视觉叙事和对白技巧。你正在协助作者创作一部剧本/脚本。
${base}
- 以视觉化思维写作，描述"镜头能看到的"而非抽象概念
- 对白必须口语化、角色化，每个角色有独特的"声音"
- 注意场景的物理逻辑：谁在场、在哪里、什么时间
- 保持光照连续性（日/夜）和空间连续性`;

        default:
            return `你是一位经验丰富的中文作家兼编辑。你正在协助作者创作一部作品。
${base}
- 使用丰富的感官描写（视觉、听觉、触觉、嗅觉、味觉）`;
    }
}

// ==================== 新分类上下文构建 ====================

// 空间/地点上下文
function buildLocationsContext(locationNodes, allNodes) {
    if (!locationNodes || locationNodes.length === 0) return '';
    return locationNodes.map(n => {
        const path = getNodePathStr(n, allNodes);
        const c = n.content || {};
        const parts = [`[${path}]`];
        if (c.description) parts.push(c.description);
        if (c.slugline) parts.push(`场景标题：${c.slugline}`);
        if (c.sensoryVisual) parts.push(`视觉：${c.sensoryVisual}`);
        if (c.sensoryAudio) parts.push(`听觉：${c.sensoryAudio}`);
        if (c.sensorySmell) parts.push(`嗅觉/触觉：${c.sensorySmell}`);
        if (c.mood) parts.push(`氛围：${c.mood}`);
        if (c.dangerLevel) parts.push(`危险等级：${c.dangerLevel}`);
        return parts.join('\n');
    }).join('\n\n');
}

// 物品/道具上下文
function buildObjectsContext(objectNodes, allNodes) {
    if (!objectNodes || objectNodes.length === 0) return '';
    return objectNodes.map(n => {
        const path = getNodePathStr(n, allNodes);
        const c = n.content || {};
        const parts = [`[${path}]`];
        if (c.description) parts.push(c.description);
        if (c.objectType) parts.push(`类型：${c.objectType}`);
        if (c.currentHolder) parts.push(`当前持有者：${c.currentHolder}`);
        if (c.rank) parts.push(`品阶：${c.rank}`);
        if (c.numericStats) parts.push(`属性：${c.numericStats}`);
        if (c.symbolism) parts.push(`象征意义：${c.symbolism}`);
        return parts.join('\n');
    }).join('\n\n');
}

// 去除HTML标签
function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
