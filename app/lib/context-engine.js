// 上下文收集引擎 — 像 Cursor 一样，在每次 AI 调用前自动汇聚所有相关信息
// 让 AI 完整理解：作品风格、人物设定、世界观、前文脉络、当前位置

import { getChapters } from './storage';
import { getProjectSettings, getSettingsNodes, getWritingMode, getActiveWorkId } from './settings';
import { getEmbedding, cosineSimilarity } from './embeddings';
import { estimateTokenCount } from 'tokenx';
import { buildChapterSynopsisBriefText, buildChapterSynopsisText, hasChapterSynopsis, stripChapterHtml } from './chapter-synopsis';
import { buildChapterMemoryGroupText, getChapterMemoryGroups, hasChapterMemoryGroup } from './chapter-memory-groups';

// ==================== Graph RAG 智能推荐 ====================

/**
 * 对设定条目做 RAG 向量相似度推荐
 * @param {string} queryText 编辑器上下文文本（光标附近 ~500 字）
 * @param {number} topN 返回前 N 个推荐（默认10）
 * @returns {Promise<{id: string, score: number}[]>} 按相似度降序排列的推荐列表
 */
export async function ragRecommend(queryText, topN = 10) {
    if (!queryText || !queryText.trim()) return [];

    const { apiConfig } = getProjectSettings();
    if (!apiConfig?.useCustomEmbed) return [];

    // 如果查询文本太短，补充更多上下文
    let enrichedQuery = queryText.trim();

    // 获取查询向量
    const queryVector = await getEmbedding(enrichedQuery, apiConfig);
    if (!queryVector) return [];

    // getSettingsNodes() 已按当前作品过滤
    const nodes = await getSettingsNodes();

    const itemNodes = nodes.filter(n => n.type === 'item' && n.enabled !== false);

    // 计算每个条目的相似度
    const scored = [];
    for (const n of itemNodes) {
        if (!n.embedding) continue;
        const score = cosineSimilarity(queryVector, n.embedding);
        if (score > 0.15) {  // 宽松阈值，避免过度过滤中文内容
            scored.push({ id: `setting-${n.id}`, nodeId: n.id, score });
        }
    }

    // 按相似度降序排序，取 Top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN);
}

// ==================== Token 预算管理 ====================

export const DEFAULT_INPUT_TOKEN_BUDGET = 200000;  // 默认输入预算（发送给AI的上下文）
export const INPUT_TOKEN_BUDGET = DEFAULT_INPUT_TOKEN_BUDGET;  // 兼容旧导入
export const OUTPUT_TOKEN_BUDGET = 6000;   // 输出预算（AI生成的回复长度，约4500字）

export function normalizeInputTokenBudget(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_INPUT_TOKEN_BUDGET;
    return Math.max(1000, Math.min(2000000, parsed));
}

// 基于 tokenx 库的 token 估算（与 Cherry Studio 同一方案）
// tokenx 是启发式估算，与实际 tokenizer 会有微小差异（±10-20%），这是正常的
export function estimateTokens(text) {
    if (!text) return 0;
    return estimateTokenCount(text);
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
    previousChapterAnchor: 2.5, // 上一章原文——文风与承接锚点
    previousChapters: 10, // 前文回顾（最容易截断）
};

const CHAPTER_GROUP_SIZE = 5;
const PREVIOUS_CHAPTER_ANCHOR_ID = 'chapter-previous-anchor';

/**
 * 获取上下文可勾选条目列表（供「📚 参考」Tab 使用） (Async)
 * 返回扁平化数组，每个条目包含 id, group, name, tokens, category
 */
export async function getContextItems(activeChapterId, chaptersOverride, workId = null) {
    const settings = getProjectSettings();
    const targetWorkId = workId || getActiveWorkId();
    const chapters = chaptersOverride || await getChapters(targetWorkId);
    const currentIndex = chapters.findIndex(ch => ch.id === activeChapterId);

    // getSettingsNodes() 已按当前作品过滤
    const nodes = await getSettingsNodes(targetWorkId);
    const itemNodes = nodes.filter(n => n.type === 'item');

    const items = [];

    // 分类映射
    const categoryMap = {
        rules: { group: '写作规则', builder: (ns) => buildRulesContext(ns) },
        character: { group: '人物设定', builder: (ns) => buildCharactersContext(ns) },
        location: { group: '空间/地点', builder: (ns) => buildLocationsContext(ns, nodes) },
        world: { group: '世界观', builder: (ns) => buildWorldContext(ns, nodes) },
        object: { group: '物品/道具', builder: (ns) => buildObjectsContext(ns, nodes) },
        plot: { group: '大纲', builder: (ns) => buildPlotContext(ns, nodes) },
        custom: { group: '自定义', builder: (ns) => buildCustomContext(ns, nodes) },
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

    // 作品信息 — 从当前作品的 bookInfo 特殊节点读取
    const bookInfoNode = nodes.find(n => n.category === 'bookInfo' && n.type === 'special');
    const bookInfo = bookInfoNode?.content || {};
    if (bookInfo && (bookInfo.title || bookInfo.author || bookInfo.genre || bookInfo.synopsis)) {
        items.push({
            id: 'bookinfo',
            group: '作品信息',
            name: bookInfo.title || '作品信息',
            tokens: estimateTokens(buildBookInfoContext(bookInfo)),
            category: 'bookInfo',
            enabled: true,
        });
    }

    const previousEntry = getPreviousRealChapterEntry(chapters, currentIndex);
    const previousAnchorChapterId = previousEntry?.chapter?.id || null;
    const memoryGroups = await getChapterMemoryGroups(targetWorkId);
    const relevantMemoryGroups = getRelevantMemoryGroups(memoryGroups, chapters, currentIndex);
    const defaultMemoryGroups = relevantMemoryGroups.filter(group => group.enabledByDefault);
    const memoryCoveredChapterIds = getCoveredChapterIds(defaultMemoryGroups);
    const olderGroups = getPreviousChapterGroups(chapters, currentIndex);

    for (const group of relevantMemoryGroups) {
        items.push({
            id: `memory-group-${group.id}`,
            group: '章节',
            name: `${group.name || '未命名记忆组'}（自定义多章节概要）`,
            tokens: estimateTokens(buildMemoryGroupContext(group, chapters)),
            category: 'chapterMemoryGroup',
            enabled: group.enabledByDefault,
            _groupId: group.id,
        });
    }

    for (const group of olderGroups) {
        items.push({
            id: group.id,
            group: '章节',
            name: group.label,
            tokens: estimateTokens(buildChapterGroupContext(group)),
            category: 'chapterGroup',
            enabled: !isChapterGroupCovered(group, memoryCoveredChapterIds),
        });
    }

    if (previousEntry) {
        items.push({
            id: PREVIOUS_CHAPTER_ANCHOR_ID,
            group: '章节',
            name: `第${previousEntry.ordinal}章「${previousEntry.chapter.title}」（上一章原文·文风锚点）`,
            tokens: estimateTokens(buildPreviousChapterAnchorContext(chapters, currentIndex)),
            category: 'previousChapterAnchor',
            enabled: true,
            alwaysInclude: true,
            _chapterId: previousEntry.chapter.id,
        });
    }

    // 章节条目 — 单章精查项仍可手动勾选
    chapters.forEach((ch, i) => {
        if ((ch.type || 'chapter') === 'volume') return;
        if (i === currentIndex) {
            // 当前章节
            items.push({
                id: `chapter-current`,
                group: '章节',
                name: `${ch.title}（当前）`,
                tokens: estimateTokens(buildCurrentContext(ch, getChapterOrdinal(chapters, i), getRealChapterCount(chapters))),
                category: 'currentChapter',
                enabled: true,
            });
        } else {
            if (ch.id === previousAnchorChapterId) return;
            items.push({
                id: `chapter-${ch.id}`,
                group: '章节',
                name: `${ch.title}${hasChapterSynopsis(ch) ? '（概要）' : ''}${i > currentIndex ? '（后续）' : ''}`,
                tokens: estimateTokens(buildChapterReferenceContext(ch, getChapterOrdinal(chapters, i))),
                category: 'chapter',
                enabled: false, // 默认由多章节概要 + 上一章原文锚点接管，需要精查时再手动勾选
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
export async function buildContext(activeChapterId, selectedText, selectedIds = null, workId = null, inputTokenBudget = DEFAULT_INPUT_TOKEN_BUDGET) {
    const settings = getProjectSettings();
    const targetWorkId = workId || getActiveWorkId();
    const chapters = await getChapters(targetWorkId);
    const currentChapter = chapters.find(ch => ch.id === activeChapterId);
    const currentIndex = chapters.findIndex(ch => ch.id === activeChapterId);
    const memoryGroups = await getChapterMemoryGroups(targetWorkId);

    // 从树形节点读取设定（过滤掉禁用项，并按当前作品过滤）
    // getSettingsNodes() 已按当前作品过滤
    const nodes = await getSettingsNodes(targetWorkId);

    // 获取所有有效的设定条目
    const allValidItemNodes = nodes.filter(n => n.type === 'item' && n.enabled !== false);

    let finalItemNodes;

    if (!selectedIds) {
        // selectedIds 为 null — 用户没有手动勾选任何参考
        // 包含所有启用的设定条目，再用 RAG 补充排序（如果可用）
        finalItemNodes = [...allValidItemNodes];
    } else {
        // 用户手动勾选了参考条目
        const manualItemNodes = [];
        const unselectedItemNodes = [];

        for (const n of allValidItemNodes) {
            if (selectedIds.has(`setting-${n.id}`)) {
                manualItemNodes.push(n);
            } else {
                unselectedItemNodes.push(n);
            }
        }

        // --- RAG 自动检索（仅当有手动勾选时，对未勾选项做 RAG 补充） ---
        let autoRetrievedNodes = [];
        const queryText = (selectedText || '').trim();
        if (settings.apiConfig?.useCustomEmbed && queryText && unselectedItemNodes.length > 0) {
            try {
                let ragSourceText = queryText;
                if (ragSourceText.length < 50 && currentChapter) {
                    const stripChapText = stripHtml(currentChapter.content || '').slice(-200);
                    ragSourceText = ragSourceText + '\n' + stripChapText;
                }

                const queryVector = await getEmbedding(ragSourceText, settings.apiConfig);
                if (queryVector) {
                    const scoredNodes = unselectedItemNodes.map(n => {
                        if (!n.embedding) return { node: n, score: -1 };
                        return { node: n, score: cosineSimilarity(queryVector, n.embedding) };
                    }).filter(x => x.score > 0.3);

                    scoredNodes.sort((a, b) => b.score - a.score);
                    autoRetrievedNodes = scoredNodes.slice(0, 5).map(x => x.node);
                }
            } catch (e) {
                console.error('RAG Retrieval failed:', e);
            }
        }

        // 合并手动与自动检索的节点，去重
        finalItemNodes = Array.from(new Set([...manualItemNodes, ...autoRetrievedNodes]));
    }

    // ===== 构建设定索引（全量，供 AI 查询/查找/删除用） =====
    const allItemNodes = nodes.filter(n => n.type === 'item');
    const catLabel = { character: '角色', world: '世界观', location: '地点', object: '物品', plot: '大纲', rules: '规则', custom: '自定义' };
    const settingsIndexLines = allItemNodes.map(n => {
        const statusTag = n.enabled === false ? '[已禁用]' : '';
        return `- ${catLabel[n.category] || n.category} | ${n.name}${statusTag}`;
    });
    const settingsIndex = settingsIndexLines.length > 0
        ? settingsIndexLines.join('\n')
        : '';

    const writingMode = getWritingMode();

    // 从当前作品的 bookInfo 特殊节点读取
    const bookInfoNode = nodes.find(n => n.category === 'bookInfo' && n.type === 'special');
    const bookInfoData = bookInfoNode?.content || {};

    // 先构建各模块的原始文本
    const rawModules = {
        bookInfo: (!selectedIds || selectedIds.has('bookinfo')) ? buildBookInfoContext(bookInfoData) : '',
        characters: buildCharactersContext(finalItemNodes.filter(n => n.category === 'character')),
        locations: buildLocationsContext(finalItemNodes.filter(n => n.category === 'location'), nodes),
        worldbuilding: buildWorldContext(finalItemNodes.filter(n => n.category === 'world'), nodes),
        objects: buildObjectsContext(finalItemNodes.filter(n => n.category === 'object'), nodes),
        plotOutline: buildPlotContext(finalItemNodes.filter(n => n.category === 'plot'), nodes),
        writingRules: buildRulesContext(finalItemNodes.filter(n => n.category === 'rules')),
        customSettings: buildCustomContext(finalItemNodes.filter(n => n.category === 'custom'), nodes),
        previousChapters: selectedIds
            ? buildPreviousContextFiltered(chapters, currentIndex, selectedIds, memoryGroups)
            : buildPreviousContext(chapters, currentIndex, memoryGroups),
        previousChapterAnchor: buildPreviousChapterAnchorContext(chapters, currentIndex),
        currentChapter: (!selectedIds || selectedIds.has('chapter-current'))
            ? buildCurrentContext(currentChapter, getChapterOrdinal(chapters, currentIndex), getRealChapterCount(chapters))
            : '',
    };

    // 按优先级分配 token 预算
    const budgetedModules = applyTokenBudget(rawModules, inputTokenBudget);

    const context = {
        writingMode,
        ...budgetedModules,
        settingsIndex,
        focusText: selectedText || '',
    };

    return context;
}

/**
 * 按优先级分配 token 预算，超出时截断低优先级内容
 */
function applyTokenBudget(modules, inputTokenBudget = DEFAULT_INPUT_TOKEN_BUDGET) {
    // 计算每个模块的 token
    const entries = Object.entries(modules).map(([key, text]) => ({
        key,
        text: text || '',
        tokens: estimateTokens(text),
        priority: PRIORITY[key] || 99,
    }));

    // 按优先级排序
    entries.sort((a, b) => a.priority - b.priority);

    let remaining = normalizeInputTokenBudget(inputTokenBudget);
    const result = {};

    for (const entry of entries) {
        if (entry.tokens <= remaining) {
            result[entry.key] = entry.text;
            remaining -= entry.tokens;
        } else if (remaining > 100) {
            // 截断：按比例保留
            const ratio = remaining / entry.tokens;
            const keepChars = Math.floor(entry.text.length * ratio * 0.9); // 留10%余量
            if (entry.key === 'previousChapterAnchor') {
                result[entry.key] = '…（因 token 限制，仅保留上一章末尾作为文风与承接锚点）\n' + entry.text.slice(-keepChars);
            } else {
                result[entry.key] = entry.text.slice(0, keepChars) + '\n…（因 token 限制，部分内容已省略）';
            }
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
    const targetWorkId = getActiveWorkId();
    const chapters = await getChapters(targetWorkId);
    const currentChapter = chapters.find(ch => ch.id === activeChapterId);
    const currentIndex = chapters.findIndex(ch => ch.id === activeChapterId);
    const memoryGroups = await getChapterMemoryGroups(targetWorkId);
    const relevantMemoryGroups = getRelevantMemoryGroups(memoryGroups, chapters, currentIndex)
        .filter(group => group.enabledByDefault);
    const memoryCoveredChapterIds = getCoveredChapterIds(relevantMemoryGroups);
    const previousAutoGroups = getPreviousChapterGroups(chapters, currentIndex);
    const enabledPreviousAutoGroups = previousAutoGroups
        .filter(group => !isChapterGroupCovered(group, memoryCoveredChapterIds));

    // getSettingsNodes() 已按当前作品过滤
    const nodes = await getSettingsNodes();
    const allItemNodes = nodes.filter(n => n.type === 'item');
    const enabledItemNodes = allItemNodes.filter(n => n.enabled !== false);

    const modules = [
        {
            key: 'writingRules',
            label: '写作规则',
            count: enabledItemNodes.filter(n => n.category === 'rules').length,
            totalCount: allItemNodes.filter(n => n.category === 'rules').length,
            tokens: estimateTokens(buildRulesContext(enabledItemNodes.filter(n => n.category === 'rules'))),
            priority: PRIORITY.writingRules,
        },
        {
            key: 'characters',
            label: '人物设定',
            count: enabledItemNodes.filter(n => n.category === 'character').length,
            totalCount: allItemNodes.filter(n => n.category === 'character').length,
            tokens: estimateTokens(buildCharactersContext(enabledItemNodes.filter(n => n.category === 'character'))),
            priority: PRIORITY.characters,
        },
        {
            key: 'locations',
            label: '空间/地点',
            count: enabledItemNodes.filter(n => n.category === 'location').length,
            totalCount: allItemNodes.filter(n => n.category === 'location').length,
            tokens: estimateTokens(buildLocationsContext(enabledItemNodes.filter(n => n.category === 'location'), nodes)),
            priority: PRIORITY.locations,
        },
        {
            key: 'worldbuilding',
            label: '世界观',
            count: enabledItemNodes.filter(n => n.category === 'world').length,
            totalCount: allItemNodes.filter(n => n.category === 'world').length,
            tokens: estimateTokens(buildWorldContext(enabledItemNodes.filter(n => n.category === 'world'), nodes)),
            priority: PRIORITY.worldbuilding,
        },
        {
            key: 'objects',
            label: '物品/道具',
            count: enabledItemNodes.filter(n => n.category === 'object').length,
            totalCount: allItemNodes.filter(n => n.category === 'object').length,
            tokens: estimateTokens(buildObjectsContext(enabledItemNodes.filter(n => n.category === 'object'), nodes)),
            priority: PRIORITY.objects,
        },
        {
            key: 'plotOutline',
            label: '大纲',
            count: enabledItemNodes.filter(n => n.category === 'plot').length,
            totalCount: allItemNodes.filter(n => n.category === 'plot').length,
            tokens: estimateTokens(buildPlotContext(enabledItemNodes.filter(n => n.category === 'plot'), nodes)),
            priority: PRIORITY.plotOutline,
        },
        {
            key: 'bookInfo',
            label: '作品信息',
            count: (() => { const bi = nodes.find(n => n.category === 'bookInfo' && n.type === 'special'); return bi?.content?.title ? 1 : 0; })(),
            totalCount: 1,
            tokens: (() => { const bi = nodes.find(n => n.category === 'bookInfo' && n.type === 'special'); return estimateTokens(buildBookInfoContext(bi?.content || {})); })(),
            priority: PRIORITY.bookInfo,
        },
        {
            key: 'previousChapters',
            label: '前文概要',
            count: currentIndex > 0
                ? relevantMemoryGroups.length + enabledPreviousAutoGroups.length
                : 0,
            totalCount: currentIndex > 0
                ? relevantMemoryGroups.length + enabledPreviousAutoGroups.length
                : 0,
            tokens: estimateTokens(buildPreviousContext(chapters, currentIndex, memoryGroups)),
            priority: PRIORITY.previousChapters,
        },
        {
            key: 'previousChapterAnchor',
            label: '上一章文风锚点',
            count: getPreviousRealChapterEntry(chapters, currentIndex) ? 1 : 0,
            totalCount: 1,
            tokens: estimateTokens(buildPreviousChapterAnchorContext(chapters, currentIndex)),
            priority: PRIORITY.previousChapterAnchor,
        },
        {
            key: 'currentChapter',
            label: '当前章节',
            count: currentChapter ? 1 : 0,
            totalCount: 1,
            tokens: estimateTokens(buildCurrentContext(currentChapter, getChapterOrdinal(chapters, currentIndex), getRealChapterCount(chapters))),
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
    const stablePrefixSections = [];
    const dynamicSections = [];

    // 优先使用用户自定义提示词，否则使用内置默认
    const settings = getProjectSettings();
    const rolePrompt = settings.customPrompt?.trim()
        ? settings.customPrompt.trim()
        : getModeRolePrompt(context.writingMode);
    stablePrefixSections.push(rolePrompt);

    if (context.bookInfo) {
        stablePrefixSections.push(`【作品信息】\n${context.bookInfo}`);
    }
    if (context.previousChapters) {
        stablePrefixSections.push(`【前文概要】\n以下是较早章节的多章节概要，续写时必须保持情节、人物与设定连续：\n${context.previousChapters}`);
    }

    // 在 chat 模式下注入设定索引，让 AI 知道所有条目。索引通常比勾选详情更稳定，前置有利于 DeepSeek 前缀缓存。
    if (mode === 'chat' && context.settingsIndex) {
        stablePrefixSections.push(`【设定集条目索引】\n以下是当前作品的全部设定条目列表（包括已禁用的），当用户询问"有哪些角色/设定"或要求查找、删除条目时，请参考此列表：\n${context.settingsIndex}`);
    }
    if (context.previousChapterAnchor) {
        stablePrefixSections.push(`【上一章原文——文风与承接锚点】\n以下内容位于稳定前文块的末尾，用于继承最近章节的语言节奏、叙事密度和情绪余韵。不要重复上一章剧情，只延续其风格与承接关系：\n${context.previousChapterAnchor}`);
    }

    if (context.characters) {
        dynamicSections.push(`【人物档案】\n以下是本作品中的重要角色，写作时必须严格遵循他们的设定：\n${context.characters}`);
    }
    if (context.locations) {
        dynamicSections.push(`【空间/地点】\n以下是本作品中的重要场所：\n${context.locations}`);
    }
    if (context.worldbuilding) {
        dynamicSections.push(`【世界观设定】\n以下是本作品的世界观，所有内容必须在这个框架内：\n${context.worldbuilding}`);
    }
    if (context.objects) {
        dynamicSections.push(`【物品/道具】\n以下是本作品中的重要物品：\n${context.objects}`);
    }
    if (context.plotOutline) {
        dynamicSections.push(`【剧情大纲】\n${context.plotOutline}`);
    }
    if (context.writingRules) {
        dynamicSections.push(`【写作规则——必须严格遵守】\n${context.writingRules}`);
    }
    if (context.customSettings) {
        dynamicSections.push(`【补充设定】\n${context.customSettings}`);
    }
    if (context.currentChapter) {
        dynamicSections.push(`【当前写作位置】\n${context.currentChapter}`);
    }

    const modeInstruction = getModeInstruction(mode);
    dynamicSections.push(`【你的任务】\n${modeInstruction}`);

    return [...stablePrefixSections, ...dynamicSections].join('\n\n---\n\n');
}

/**
 * 构建用户提示词
 */
export function compileUserPrompt(mode, text, instruction) {
    switch (mode) {
        case 'continue':
            if (!text || !text.trim()) {
                return instruction
                    ? `请根据以下要求开始创作新内容：\n要求：${instruction}`
                    : '请根据设定集信息，开始撰写新的章节内容。';
            }
            return instruction
                ? `请续写以下内容，保持风格和情节的连贯性：\n要求：${instruction}\n\n「${text}」`
                : `请续写以下内容，保持风格和情节的连贯性：\n\n「${text}」`;
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

function getChapterOrdinal(chapters, index) {
    if (index < 0) return 0;
    return chapters
        .slice(0, index + 1)
        .filter(ch => (ch.type || 'chapter') !== 'volume').length;
}

function getRealChapterCount(chapters) {
    return Array.isArray(chapters)
        ? chapters.filter(ch => (ch.type || 'chapter') !== 'volume').length
        : 0;
}

function getRealChapterEntries(chapters, endIndex = chapters.length) {
    if (!Array.isArray(chapters)) return [];
    return chapters
        .map((chapter, index) => ({ chapter, index, ordinal: getChapterOrdinal(chapters, index) }))
        .filter(entry => entry.index < endIndex && (entry.chapter.type || 'chapter') !== 'volume');
}

function getPreviousRealChapterEntry(chapters, currentIndex) {
    if (currentIndex <= 0) return null;
    const previousEntries = getRealChapterEntries(chapters, currentIndex);
    return previousEntries.length > 0 ? previousEntries[previousEntries.length - 1] : null;
}

function getPreviousChapterGroups(chapters, currentIndex) {
    if (currentIndex <= 0) return [];
    const previousEntries = getRealChapterEntries(chapters, currentIndex);
    if (previousEntries.length <= 1) return [];

    const olderEntries = previousEntries.slice(0, -1);
    const groups = [];
    for (let i = 0; i < olderEntries.length; i += CHAPTER_GROUP_SIZE) {
        const entries = olderEntries.slice(i, i + CHAPTER_GROUP_SIZE);
        const first = entries[0];
        const last = entries[entries.length - 1];
        groups.push({
            id: `chapter-group-${first.chapter.id}-${last.chapter.id}`,
            entries,
            label: `第${first.ordinal}-${last.ordinal}章多章节概要`,
        });
    }
    return groups;
}

function getRelevantMemoryGroups(memoryGroups, chapters, currentIndex) {
    if (!Array.isArray(memoryGroups) || currentIndex <= 0) return [];
    const chapterIndexMap = new Map((chapters || []).map((chapter, index) => [chapter.id, index]));
    const previousEntry = getPreviousRealChapterEntry(chapters, currentIndex);
    const previousAnchorIndex = previousEntry?.index ?? currentIndex;

    return memoryGroups
        .filter(group => hasChapterMemoryGroup(group) && group.chapterIds?.some(id => chapterIndexMap.has(id)))
        .map(group => {
            const indexes = group.chapterIds
                .map(id => chapterIndexMap.get(id))
                .filter(index => Number.isInteger(index));
            const maxIndex = indexes.length ? Math.max(...indexes) : Infinity;
            const minIndex = indexes.length ? Math.min(...indexes) : Infinity;
            return {
                ...group,
                enabledByDefault: indexes.length > 0 && minIndex >= 0 && maxIndex < previousAnchorIndex,
            };
        });
}

function buildMemoryGroupContext(group, chapters) {
    const text = buildChapterMemoryGroupText(group, chapters);
    if (!text) return '';
    return `【自定义多章节概要组】\n${text}`;
}

function getCoveredChapterIds(groups) {
    return new Set((Array.isArray(groups) ? groups : [])
        .flatMap(group => Array.isArray(group.chapterIds) ? group.chapterIds : []));
}

function isChapterGroupCovered(group, coveredChapterIds) {
    if (!group?.entries?.length || !(coveredChapterIds instanceof Set)) return false;
    return group.entries.every(entry => coveredChapterIds.has(entry.chapter.id));
}

function buildRawChapterFallbackDigest(chapter, chapterNumber) {
    const text = stripHtml(chapter.content || '').replace(/\s+/g, ' ').trim();
    if (!text) return `第${chapterNumber}章「${chapter.title}」：暂无正文。`;

    const head = text.slice(0, 320);
    const tail = text.length > 640 ? text.slice(-320) : '';
    const parts = [
        `第${chapterNumber}章「${chapter.title}」：尚未生成章节概要，为节省上下文仅保留首尾线索。`,
        `开头线索：${head}`,
    ];
    if (tail) parts.push(`结尾线索：${tail}`);
    return parts.join('\n');
}

function buildCompactChapterMemory(chapter, chapterNumber) {
    const synopsisText = hasChapterSynopsis(chapter) ? buildChapterSynopsisBriefText(chapter) : '';
    if (synopsisText) {
        return `第${chapterNumber}章「${chapter.title}」：\n${synopsisText}`;
    }
    return buildRawChapterFallbackDigest(chapter, chapterNumber);
}

function buildChapterGroupContext(group) {
    if (!group?.entries?.length) return '';
    const first = group.entries[0];
    const last = group.entries[group.entries.length - 1];
    const missingCount = group.entries.filter(entry => !hasChapterSynopsis(entry.chapter)).length;
    const missingNote = missingCount > 0
        ? `\n提示：其中 ${missingCount} 章尚未生成单章概要，仅使用首尾线索占位；建议补全概要以提高前情准确度。`
        : '';
    return [
        `第${first.ordinal}-${last.ordinal}章「${first.chapter.title}」至「${last.chapter.title}」（多章节概要）${missingNote}`,
        group.entries.map(entry => buildCompactChapterMemory(entry.chapter, entry.ordinal)).join('\n\n'),
    ].join('\n');
}

function buildChapterReferenceContext(chapter, chapterNumber) {
    const synopsisText = hasChapterSynopsis(chapter) ? buildChapterSynopsisText(chapter) : '';
    if (synopsisText) {
        return `第${chapterNumber}章「${chapter.title}」（章节概要）：\n${synopsisText}`;
    }

    const text = stripHtml(chapter.content || '');
    if (!text) return `第${chapterNumber}章「${chapter.title}」：（空）`;
    return `第${chapterNumber}章「${chapter.title}」：\n${text}`;
}

function buildPreviousContext(chapters, currentIndex, memoryGroups = []) {
    const customGroups = getRelevantMemoryGroups(memoryGroups, chapters, currentIndex)
        .filter(group => group.enabledByDefault);
    const coveredChapterIds = getCoveredChapterIds(customGroups);
    const groups = getPreviousChapterGroups(chapters, currentIndex);
    const fallbackGroups = groups.filter(group => !isChapterGroupCovered(group, coveredChapterIds));
    const parts = [
        ...customGroups.map(group => buildMemoryGroupContext(group, chapters)),
        ...fallbackGroups.map(group => buildChapterGroupContext(group)),
    ].filter(Boolean);
    return parts.join('\n\n');
}

// 按 selectedIds 过滤的章节上下文（包含用户手动勾选的所有章节，不限前后）
function buildPreviousContextFiltered(chapters, currentIndex, selectedIds, memoryGroups = []) {
    const parts = [];
    const includedChapterIds = new Set();

    for (const group of getRelevantMemoryGroups(memoryGroups, chapters, currentIndex)) {
        if (!selectedIds.has(`memory-group-${group.id}`)) continue;
        parts.push(buildMemoryGroupContext(group, chapters));
        group.chapterIds.forEach(id => includedChapterIds.add(id));
    }

    for (const group of getPreviousChapterGroups(chapters, currentIndex)) {
        if (!selectedIds.has(group.id)) continue;
        if (isChapterGroupCovered(group, includedChapterIds)) continue;
        parts.push(buildChapterGroupContext(group));
        group.entries.forEach(entry => includedChapterIds.add(entry.chapter.id));
    }

    const previousEntry = getPreviousRealChapterEntry(chapters, currentIndex);
    const previousAnchorChapterId = previousEntry?.chapter?.id || null;
    const selected = chapters.filter((ch, i) => {
        if ((ch.type || 'chapter') === 'volume') return false;
        if (i === currentIndex) return false;
        if (ch.id === previousAnchorChapterId) return false;
        if (includedChapterIds.has(ch.id)) return false;
        return selectedIds.has(`chapter-${ch.id}`);
    });

    const selectedText = selected.map((ch) => {
        const index = chapters.indexOf(ch);
        return buildChapterReferenceContext(ch, getChapterOrdinal(chapters, index));
    }).join('\n\n');
    if (selectedText) parts.push(selectedText);

    return parts.join('\n\n');
}

function buildPreviousChapterAnchorContext(chapters, currentIndex) {
    const previousEntry = getPreviousRealChapterEntry(chapters, currentIndex);
    if (!previousEntry) return '';

    const text = stripHtml(previousEntry.chapter.content || '');
    if (!text) return `第${previousEntry.ordinal}章「${previousEntry.chapter.title}」：（空）`;
    return `第${previousEntry.ordinal}章「${previousEntry.chapter.title}」：\n${text}`;
}

function buildCurrentContext(chapter, chapterNumber, totalChapters) {
    if (!chapter) return '';
    const text = stripHtml(chapter.content || '');
    const parts = [
        `当前章节：第${chapterNumber}章 / 共${totalChapters}章`,
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
- 情节推进要符合大纲规划的方向`;

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
- 当用户要求你生成、改写、续写或润色可直接放入编辑器的正文时，请把最终正文单独放在一个 Markdown 代码块中；解释、点评和备选方案放在代码块外。不要把设定操作块放进代码围栏。

【设定集管理能力】
当用户要求你创建、修改或删除设定集条目时，你可以在回复中嵌入操作指令块。格式如下：

[SETTINGS_ACTION]
{"action":"add","category":"character","name":"角色姓名","content":{"role":"主角","personality":"...","background":"..."}}
[/SETTINGS_ACTION]

可用的 action: "add"（新增）、"update"（更新）、"delete"（删除）
更新和删除可以通过 name+category 定位，也可以通过 nodeId 定位。优先使用 name+category，因为用户通常用名称来交流。

可用的 category 和对应 content 字段：
- "character"：角色。content 可含：role, age, gender, appearance, personality, background, motivation, skills, speechStyle, relationships, arc, notes
- "world"：世界观。content 可含：description
- "location"：地点。content 可含：description, sensoryVisual, sensoryAudio, sensorySmell, mood, dangerLevel
- "object"：物品。content 可含：description, objectType, currentHolder, rank, numericStats, symbolism
- "plot"：大纲。content 可含：description, status
- "rules"：写作规则。content 可含：description
- "custom"：自定义。content 可含：description
- "bookInfo"：作品信息。content 可含：title, genre, synopsis, style, tone, pov, targetAudience

如果用户要求写入某个子分类，可以额外输出 "parentName"、"parentId" 或 "path" 字段；例如写入“细纲”时可使用 {"category":"plot","parentName":"细纲",...}，也可以直接让 category 等于已有文件夹名。

使用规则：
- 每个操作块只包含一个 JSON 对象
- 如果需要多个操作，使用多个 [SETTINGS_ACTION] 块
- 操作块前后必须有正常的文字说明
- 不要用代码围栏（\`\`\`）包裹操作块，直接使用 [SETTINGS_ACTION] 标签
- update 示例：{"action":"update","category":"character","name":"角色姓名","content":{"personality":"新性格描述"}}
- delete 示例：{"action":"delete","category":"character","name":"要删除的角色名"}
- 当用户说"删除XX"时，必须输出 delete 操作，即使你认为不该删除，也要先执行用户的要求
- 在正文中已有角色/设定出现时，如果用户要求，可以从正文分析内容并自动创建设定`;

        default:
            return '按照作者的指示完成写作任务，确保内容与已有设定一致。';
    }
}

// ==================== 写作模式角色提示词 ====================

export function getModeRolePrompt(writingMode) {
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
    return stripChapterHtml(html);
}
