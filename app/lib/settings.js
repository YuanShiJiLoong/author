// 设定集管理 - 存储人物、世界观、大纲等全局创作信息
// 这些信息会在每次AI调用时作为上下文传入，让AI像Cursor一样了解整个项目
// 基于「叙事引擎」架构 — 支持网络小说、传统文学、剧本/脚本三种创作模式

import { get, set } from 'idb-keyval';
import { getEmbedding } from './embeddings';

const SETTINGS_KEY = 'author-project-settings';

/**
 * 递归提取节点的所有文本内容，用于向量化
 */
function extractTextForEmbedding(node) {
    if (!node) return '';
    let text = `Name: ${node.name || ''}\n`;

    const extract = (obj) => {
        if (typeof obj === 'string') return obj;
        if (Array.isArray(obj)) return obj.map(extract).join(' ');
        if (typeof obj === 'object' && obj !== null) {
            return Object.values(obj).filter(v => v).map(extract).join(' ');
        }
        return '';
    };

    if (node.content) {
        text += extract(node.content);
    }
    return text.trim();
}

// ==================== 写作模式定义 ====================

export const WRITING_MODES = {
    webnovel: {
        key: 'webnovel',
        label: '网络小说',
        icon: '📱',
        color: '#3b82f6',
        desc: '适合日更连载、修仙玄幻、系统流等网文创作',
        painPoint: '数值膨胀与连载一致性',
        extraCharacterFields: [
            { key: 'level', label: '等级/境界', placeholder: '例：筑基期三层 / Lv.45', multiline: false },
            { key: 'stats', label: '属性面板', placeholder: '力量：85\n敏捷：72\n智力：90\n体质：68', multiline: true, rows: 4 },
            { key: 'skillList', label: '技能列表', placeholder: '技能名称、效果、冷却时间...', multiline: true, rows: 3 },
            { key: 'equipment', label: '装备/法宝', placeholder: '当前装备和持有的重要物品', multiline: true, rows: 2 },
        ],
        extraLocationFields: [
            { key: 'dangerLevel', label: '危险等级', placeholder: '例：S级禁区 / 安全区', multiline: false },
            { key: 'resources', label: '资源产出', placeholder: '灵石矿脉、药草分布...', multiline: true, rows: 2 },
        ],
        extraObjectFields: [
            { key: 'rank', label: '品阶/等级', placeholder: '例：天级上品 / SSR', multiline: false },
            { key: 'numericStats', label: '数值属性', placeholder: '攻击力+500\n暴击率+15%', multiline: true, rows: 3 },
        ],
    },
    traditional: {
        key: 'traditional',
        label: '传统文学',
        icon: '📚',
        color: '#8b5cf6',
        desc: '适合严肃小说、纯文学、短篇、出版向作品',
        painPoint: '主题编织与草稿迭代',
        extraCharacterFields: [
            { key: 'coreTrauma', label: '核心创伤', placeholder: '角色内心深处的伤痕、驱动行为的心理根源', multiline: true, rows: 2 },
            { key: 'innerMonologue', label: '内心独白关键词', placeholder: '角色内心世界的典型词汇和思维方式', multiline: true, rows: 2 },
            { key: 'voice', label: '人物声音/对话标签', placeholder: '独特的措辞习惯、语法特点、方言痕迹...', multiline: true, rows: 2 },
            { key: 'motifs', label: '反复意象/母题', placeholder: '与角色绑定的象征符号，如“绿光”、“断桥”', multiline: true, rows: 2 },
        ],
        extraLocationFields: [
            { key: 'sensoryVisual', label: '视觉描写', placeholder: '色调、光线、空间感...', multiline: true, rows: 2 },
            { key: 'sensoryAudio', label: '听觉描写', placeholder: '环境音、远处声响...', multiline: true, rows: 2 },
            { key: 'sensorySmell', label: '嗅觉/触觉', placeholder: '气味、温度、湿度、质感...', multiline: true, rows: 2 },
            { key: 'mood', label: '氛围/情绪基调', placeholder: '压抑、温馨、荒凉、神秘...', multiline: false },
        ],
        extraObjectFields: [
            { key: 'symbolism', label: '象征意义', placeholder: '这个物品在主题上代表什么？', multiline: true, rows: 2 },
        ],
    },
    screenplay: {
        key: 'screenplay',
        label: '剧本/脚本',
        icon: '🎬',
        color: '#f59e0b',
        desc: '适合影视剧本、舞台剧、广播剧等脚本创作',
        painPoint: '连续性与制作可行性',
        extraCharacterFields: [
            { key: 'castType', label: '角色类型', placeholder: '主演 / 配角 / 客串 / 群演', multiline: false },
            { key: 'sceneCount', label: '出场场次', placeholder: '出现在哪些场次（如 4, 12, 55）', multiline: false },
            { key: 'dialogueStyle', label: '对白风格笔记', placeholder: '说话节奏、用语习惯、语气特点...', multiline: true, rows: 3 },
        ],
        extraLocationFields: [
            { key: 'slugline', label: '场景标题', placeholder: '如：INT. 厨房 - DAY / EXT. 街道 - NIGHT', multiline: false },
            { key: 'shootingNotes', label: '拍摄备注', placeholder: '布景需求、特殊灯光、道具需求...', multiline: true, rows: 2 },
            { key: 'usedInScenes', label: '使用场次', placeholder: '此场景在哪些场次中被使用', multiline: false },
        ],
        extraObjectFields: [
            { key: 'propCategory', label: '道具分类', placeholder: '手持道具 / 场景道具 / 特效道具', multiline: false },
            { key: 'requiredScenes', label: '所需场次', placeholder: '需要此道具的场次编号', multiline: false },
        ],
    },
};

// 默认项目设定结构
const DEFAULT_SETTINGS = {
    // 写作模式
    writingMode: 'webnovel',

    // API 配置 — 用户自己填入 API Key
    apiConfig: {
        provider: 'zhipu',   // 预设供应商标识
        apiKey: '',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4-flash',
        useCustomEmbed: false, // 是否使用独立的 Embedding API
        embedProvider: 'zhipu',
        embedApiKey: '',
        embedBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        embedModel: 'embedding-3',
        // 高级模型参数
        useAdvancedParams: false,   // 总开关：关闭时使用默认值
        temperature: 1,             // 0 ~ 2
        topP: 0.95,                 // 0 ~ 1
        maxContextLength: 200000,   // 最大上下文 token
        maxOutputTokens: 65536,     // 最大输出 token
        reasoningEffort: 'auto',    // 思考层级: auto / low / medium / high
    },

    // 作品基本信息
    bookInfo: {
        title: '',
        genre: '',       // 题材类型：玄幻/都市/悬疑/言情/科幻...
        synopsis: '',     // 故事简介/梗概
        style: '',        // 写作风格：如"轻松幽默"、"严肃沉重"、"诗意抒情"
        tone: '',         // 整体基调
        targetAudience: '', // 目标读者
        pov: '',          // 叙事视角：第一人称/第三人称/全知视角
    },

    // 人物设定
    characters: [
        // 每个人物的数据结构：
        // {
        //   id: string,
        //   name: string,           // 姓名
        //   role: string,           // 角色类型：主角/反派/配角/路人
        //   age: string,            // 年龄
        //   gender: string,         // 性别
        //   appearance: string,     // 外貌描写
        //   personality: string,    // 性格特征
        //   background: string,     // 背景故事
        //   motivation: string,     // 动机/目标
        //   skills: string,         // 能力/技能
        //   speechStyle: string,    // 说话风格/口头禅
        //   relationships: string,  // 与其他角色的关系
        //   arc: string,            // 角色成长弧线
        //   notes: string,          // 其他备注
        // }
    ],

    // 世界观设定
    worldbuilding: {
        era: '',           // 时代背景
        geography: '',     // 地理环境
        society: '',       // 社会制度
        culture: '',       // 文化习俗
        powerSystem: '',   // 力量体系/魔法体系
        technology: '',    // 科技水平
        rules: '',         // 世界特殊规则
        history: '',       // 历史大事件
        factions: '',      // 势力/组织
        notes: '',         // 其他设定
    },

    // 大纲/剧情规划
    plotOutline: {
        mainConflict: '',  // 核心矛盾
        plotPoints: '',    // 关键剧情节点（按顺序）
        subplots: '',      // 支线剧情
        ending: '',        // 结局方向
        currentArc: '',    // 当前所处的故事弧
        foreshadowing: '', // 已埋伏笔
        notes: '',         // 其他备注
    },

    // 写作规则/禁忌
    writingRules: {
        mustDo: '',        // 必须遵守的规则
        mustNotDo: '',     // 禁止出现的内容/词汇
        styleGuide: '',    // 风格指南
        notes: '',         // 其他备注
    },
};

// 获取项目设定
export function getProjectSettings() {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
        const data = localStorage.getItem(SETTINGS_KEY);
        if (!data) return DEFAULT_SETTINGS;
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

// 保存项目设定
export function saveProjectSettings(settings) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// 添加角色
export function addCharacter(character) {
    const settings = getProjectSettings();
    const newChar = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: '',
        role: '配角',
        age: '',
        gender: '',
        appearance: '',
        personality: '',
        background: '',
        motivation: '',
        skills: '',
        speechStyle: '',
        relationships: '',
        arc: '',
        notes: '',
        ...character,
    };
    settings.characters.push(newChar);
    saveProjectSettings(settings);
    return newChar;
}

// 更新角色
export function updateCharacter(id, updates) {
    const settings = getProjectSettings();
    const idx = settings.characters.findIndex(c => c.id === id);
    if (idx === -1) return null;
    settings.characters[idx] = { ...settings.characters[idx], ...updates };
    saveProjectSettings(settings);
    return settings.characters[idx];
}

// 删除角色
export function deleteCharacter(id) {
    const settings = getProjectSettings();
    settings.characters = settings.characters.filter(c => c.id !== id);
    saveProjectSettings(settings);
}

// ==================== 写作模式读写 ====================

export function getWritingMode() {
    const settings = getProjectSettings();
    return settings.writingMode || 'webnovel';
}

export function setWritingMode(mode) {
    if (!WRITING_MODES[mode]) return;
    const settings = getProjectSettings();
    settings.writingMode = mode;
    saveProjectSettings(settings);
}

// ==================== 树形设定集节点系统 ====================

const NODES_KEY = 'author-settings-nodes';
const ACTIVE_WORK_KEY = 'author-active-work';

function generateNodeId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ==================== 作品级节点系统 ====================

// 每个作品下自动创建的子分类模板
const WORK_SUB_CATEGORIES = [
    { suffix: 'bookinfo', name: '作品信息', icon: '📖', category: 'bookInfo', type: 'special' },
    { suffix: 'characters', name: '人物设定', icon: '👤', category: 'character', type: 'folder' },
    { suffix: 'locations', name: '空间/地点', icon: '🗺️', category: 'location', type: 'folder' },
    { suffix: 'world', name: '世界观/设定', icon: '🌍', category: 'world', type: 'folder' },
    { suffix: 'objects', name: '物品/道具', icon: '🔮', category: 'object', type: 'folder' },
    { suffix: 'plot', name: '大纲', icon: '📋', category: 'plot', type: 'folder' },
    { suffix: 'rules', name: '写作规则', icon: '📐', category: 'rules', type: 'folder' },
];

// 全局根分类（不属于任何作品）— 已废弃，所有规则均归属各作品
const GLOBAL_ROOT_CATEGORIES = [];

// 旧版 ROOT_CATEGORIES 的 id（用于迁移检测）
const LEGACY_ROOT_IDS = [
    'root-bookinfo', 'root-characters', 'root-locations',
    'root-world', 'root-objects', 'root-plot', 'root-rules',
];

/**
 * 创建一个作品节点及其下的完整子分类树
 * @returns {{ workNode, subNodes }} 创建的作品节点和子分类节点数组
 */
export function createWorkNode(name, workId) {
    const id = workId || ('work-' + generateNodeId());
    const now = new Date().toISOString();
    const workNode = {
        id,
        name: name || '新作品',
        type: 'work',
        category: 'work',
        parentId: null,
        order: 0,
        icon: '📕',
        content: {},
        collapsed: false,
        enabled: true,
        createdAt: now,
        updatedAt: now,
    };
    const subNodes = WORK_SUB_CATEGORIES.map((cat, i) => ({
        id: `${id}-${cat.suffix}`,
        name: cat.name,
        type: cat.type,
        category: cat.category,
        parentId: id,
        order: i,
        icon: cat.icon,
        content: {},
        collapsed: false,
        createdAt: now,
        updatedAt: now,
    }));
    return { workNode, subNodes };
}

// ==================== 激活作品管理 ====================

export function getActiveWorkId() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_WORK_KEY) || null;
}

export function setActiveWorkId(workId) {
    if (typeof window === 'undefined') return;
    if (workId) {
        localStorage.setItem(ACTIVE_WORK_KEY, workId);
    } else {
        localStorage.removeItem(ACTIVE_WORK_KEY);
    }
}

export function getAllWorks(nodes) {
    const allNodes = nodes || getSettingsNodes();
    return allNodes.filter(n => n.type === 'work');
}

// ==================== 节点初始化与迁移 ====================

// 获取默认节点树（包含一个默认作品 + 全局规则）
function getDefaultNodes() {
    const { workNode, subNodes } = createWorkNode('默认作品', 'work-default');
    return [workNode, ...subNodes];
}

// 获取所有设定节点 (Async)
export async function getSettingsNodes() {
    if (typeof window === 'undefined') return getDefaultNodes();
    try {
        let nodes = await get(NODES_KEY);
        if (!nodes) {
            // 首次使用：尝试从 localStorage fallback 或迁移旧数据
            const legacyData = localStorage.getItem(NODES_KEY);
            if (legacyData) {
                nodes = JSON.parse(legacyData);
                await set(NODES_KEY, nodes); // 写入 IndexedDB
            } else {
                const migrated = await migrateOldSettings();
                if (migrated) {
                    nodes = await migrateToWorkStructure(migrated);
                    return nodes;
                }
                const defaults = getDefaultNodes();
                await saveSettingsNodes(defaults);
                if (!getActiveWorkId()) setActiveWorkId('work-default');
                return defaults;
            }
        }

        nodes = await migrateToWorkStructure(nodes);
        nodes = await migrateGlobalRulesToWork(nodes);
        nodes = await ensureWorkExists(nodes);
        return nodes;
    } catch {
        return getDefaultNodes();
    }
}

// 保存设定集节点 (Async)
export async function saveSettingsNodes(nodes) {
    if (typeof window === 'undefined') return;
    await set(NODES_KEY, nodes);
}

/**
 * 将旧的扁平根分类结构迁移到作品结构 (Async)
 */
async function migrateToWorkStructure(nodes) {
    if (nodes.some(n => n.type === 'work')) return nodes;

    const legacyRoots = nodes.filter(n => n.parentId === null && LEGACY_ROOT_IDS.includes(n.id));
    if (legacyRoots.length === 0) return nodes;

    const { workNode } = createWorkNode('默认作品', 'work-default');
    const newNodes = [workNode];
    for (const node of nodes) {
        if (LEGACY_ROOT_IDS.includes(node.id) && node.parentId === null) {
            const suffix = node.id.replace('root-', '');
            const newId = `work-default-${suffix}`;
            nodes.forEach(child => {
                if (child.parentId === node.id) child.parentId = newId;
            });
            newNodes.push({ ...node, id: newId, parentId: 'work-default' });
        } else if (!LEGACY_ROOT_IDS.includes(node.id)) {
            newNodes.push(node);
        }
    }

    for (const cat of WORK_SUB_CATEGORIES) {
        const expectedId = `work-default-${cat.suffix}`;
        if (!newNodes.find(n => n.id === expectedId)) {
            newNodes.push({
                id: expectedId, name: cat.name, type: cat.type, category: cat.category,
                parentId: 'work-default', order: WORK_SUB_CATEGORIES.indexOf(cat), icon: cat.icon,
                content: {}, collapsed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
        }
    }

    await saveSettingsNodes(newNodes);
    if (!getActiveWorkId()) setActiveWorkId('work-default');
    return newNodes;
}

/**
 * 迁移旧的全局写作规则到默认作品 (Async)
 */
async function migrateGlobalRulesToWork(nodes) {
    const globalRules = nodes.find(n => n.id === 'root-rules' && n.parentId === null);
    if (!globalRules) return nodes;
    const activeWorkId = getActiveWorkId() || 'work-default';
    let targetRulesId = nodes.find(n => n.parentId === activeWorkId && n.category === 'rules')?.id;
    if (!targetRulesId) {
        const anyWork = nodes.find(n => n.type === 'work');
        if (anyWork) targetRulesId = nodes.find(n => n.parentId === anyWork.id && n.category === 'rules')?.id;
    }
    if (targetRulesId) {
        nodes.forEach(n => {
            if (n.parentId === 'root-rules') n.parentId = targetRulesId;
        });
    }
    nodes = nodes.filter(n => n.id !== 'root-rules');
    await saveSettingsNodes(nodes);
    return nodes;
}

// 确保至少有一个作品存在 (Async)
async function ensureWorkExists(nodes) {
    if (!nodes.some(n => n.type === 'work')) {
        const { workNode, subNodes } = createWorkNode('默认作品', 'work-default');
        nodes.push(workNode, ...subNodes);
        await saveSettingsNodes(nodes);
    }
    if (!getActiveWorkId()) {
        const firstWork = nodes.find(n => n.type === 'work');
        if (firstWork) setActiveWorkId(firstWork.id);
    }
    return nodes;
}

// 添加节点 (Async)
export async function addSettingsNode({ name, type, category, parentId, icon, content }) {
    const nodes = await getSettingsNodes();
    const siblings = nodes.filter(n => n.parentId === parentId);
    const node = {
        id: generateNodeId(),
        name: name || (type === 'folder' ? '新分类' : '新条目'),
        type: type || 'item',
        category: category || 'custom',
        parentId: parentId || null,
        order: siblings.length,
        icon: icon || (type === 'folder' ? '📁' : '📄'),
        content: content || {},
        collapsed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    if (node.type === 'item') {
        const { apiConfig } = getProjectSettings();
        if (apiConfig.useCustomEmbed) {
            const textToEmbed = extractTextForEmbedding(node);
            node.embedding = await getEmbedding(textToEmbed, apiConfig);
        }
    }

    nodes.push(node);
    await saveSettingsNodes(nodes);
    return node;
}

// 更新节点 (Async)
// Embedding 防抖定时器 — 避免每次编辑都触发 embedding API 调用
const _embeddingTimers = {};

export async function updateSettingsNode(id, updates) {
    const nodes = await getSettingsNodes();
    const idx = nodes.findIndex(n => n.id === id);
    if (idx === -1) return null;
    const isProtected = GLOBAL_ROOT_CATEGORIES.some(c => c.id === id) ||
        nodes[idx].type === 'work' ||
        (nodes[idx].parentId && nodes.some(p => p.id === nodes[idx].parentId && p.type === 'work') && WORK_SUB_CATEGORIES.some(c => id.endsWith('-' + c.suffix)));
    if (isProtected) {
        delete updates.type;
        delete updates.category;
        delete updates.parentId;
    }

    // 先立即保存内容（不等 embedding），确保数据不丢失
    nodes[idx] = { ...nodes[idx], ...updates, updatedAt: new Date().toISOString() };
    await saveSettingsNodes(nodes);

    // 如果名称或内容发生改变，且是条目，且开启了嵌入功能，延迟计算 embedding
    // 使用 3 秒防抖，避免输入过程中频繁调用 embedding API
    const nodeType = updates.type || nodes[idx].type;
    const { apiConfig } = getProjectSettings();
    if (nodeType === 'item' && apiConfig.useCustomEmbed && (updates.name !== undefined || updates.content !== undefined)) {
        clearTimeout(_embeddingTimers[id]);
        _embeddingTimers[id] = setTimeout(async () => {
            try {
                delete _embeddingTimers[id];
                // 重新读取最新节点数据来计算 embedding
                const freshNodes = await getSettingsNodes();
                const freshIdx = freshNodes.findIndex(n => n.id === id);
                if (freshIdx === -1) return;
                const textToEmbed = extractTextForEmbedding(freshNodes[freshIdx]);
                const embedding = await getEmbedding(textToEmbed, apiConfig);
                if (embedding) {
                    freshNodes[freshIdx] = { ...freshNodes[freshIdx], embedding };
                    await saveSettingsNodes(freshNodes);
                }
            } catch (e) {
                console.warn('[Settings] Deferred embedding failed for node', id, e);
            }
        }, 3000);
    }

    return nodes[idx];
}

// 删除节点（及所有子节点） (Async)
export async function deleteSettingsNode(id) {
    let nodes = await getSettingsNodes();
    const node = nodes.find(n => n.id === id);
    if (node && node.parentId) {
        const parent = nodes.find(p => p.id === node.parentId);
        if (parent && parent.type === 'work' && WORK_SUB_CATEGORIES.some(c => id.endsWith('-' + c.suffix))) return false;
    }
    const toDelete = new Set();
    const collect = (parentId) => {
        toDelete.add(parentId);
        nodes.filter(n => n.parentId === parentId).forEach(n => collect(n.id));
    };
    collect(id);
    nodes = nodes.filter(n => !toDelete.has(n.id));
    await saveSettingsNodes(nodes);
    return true;
}

// 移动节点 (Async)
export async function moveSettingsNode(id, newParentId) {
    const nodes = await getSettingsNodes();
    const idx = nodes.findIndex(n => n.id === id);
    if (idx === -1) return null;
    const siblings = nodes.filter(n => n.parentId === newParentId && n.id !== id);
    nodes[idx] = {
        ...nodes[idx],
        parentId: newParentId,
        order: siblings.length,
        updatedAt: new Date().toISOString(),
    };
    await saveSettingsNodes(nodes);
    return nodes[idx];
}

// 重新计算所有条目的 embedding (Async)
export async function rebuildAllEmbeddings(onProgress) {
    const nodes = await getSettingsNodes();
    const { apiConfig } = getProjectSettings();
    const items = nodes.filter(n => n.type === 'item');
    let done = 0;
    let failed = 0;

    for (const item of items) {
        try {
            const textToEmbed = extractTextForEmbedding(item);
            const embedding = await getEmbedding(textToEmbed, apiConfig);
            const idx = nodes.findIndex(n => n.id === item.id);
            if (idx !== -1 && embedding) {
                nodes[idx].embedding = embedding;
            } else if (!embedding) {
                failed++;
            }
        } catch {
            failed++;
        }
        done++;
        onProgress?.(done, items.length, failed);
    }

    await saveSettingsNodes(nodes);
    return { total: items.length, done, failed };
}

// 获取指定分类下的所有 item 节点（递归） (Async)
export async function getItemsByCategory(category) {
    const nodes = await getSettingsNodes();
    return nodes.filter(n => n.type === 'item' && n.category === category);
}

// 获取某节点的所有子节点（直接子节点） (Async)
export async function getChildren(parentId) {
    const nodes = await getSettingsNodes();
    return nodes
        .filter(n => n.parentId === parentId)
        .sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.order - b.order;
        });
}

// 获取节点的路径（从根到当前节点的名称链） (Async)
export async function getNodePath(id) {
    const nodes = await getSettingsNodes();
    const path = [];
    let current = nodes.find(n => n.id === id);
    while (current) {
        path.unshift(current.name);
        current = current.parentId ? nodes.find(n => n.id === current.parentId) : null;
    }
    return path;
}

// ==================== 旧数据迁移 ====================

// ==================== 旧数据迁移 ====================

async function migrateOldSettings() {
    if (typeof window === 'undefined') return null;
    try {
        const oldData = localStorage.getItem(SETTINGS_KEY);
        if (!oldData) return null;

        const old = JSON.parse(oldData);
        const nodes = getDefaultNodes();
        let hasContent = false;

        // 迁移人物设定
        if (old.characters && old.characters.length > 0) {
            old.characters.forEach((char, i) => {
                nodes.push({
                    id: char.id || generateNodeId(),
                    name: char.name || '未命名角色',
                    type: 'item',
                    category: 'character',
                    parentId: 'root-characters',
                    order: i,
                    icon: '📄',
                    content: {
                        role: char.role || '',
                        age: char.age || '',
                        gender: char.gender || '',
                        appearance: char.appearance || '',
                        personality: char.personality || '',
                        background: char.background || '',
                        motivation: char.motivation || '',
                        skills: char.skills || '',
                        speechStyle: char.speechStyle || '',
                        relationships: char.relationships || '',
                        arc: char.arc || '',
                        notes: char.notes || '',
                    },
                    collapsed: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
            });
            hasContent = true;
        }

        // 迁移世界观
        if (old.worldbuilding) {
            const fieldMap = {
                era: '时代背景', geography: '地理环境', society: '社会制度',
                culture: '文化习俗', powerSystem: '力量体系', technology: '科技水平',
                rules: '特殊规则', history: '历史大事件', factions: '势力/组织',
                notes: '其他设定',
            };
            let order = 0;
            for (const [key, label] of Object.entries(fieldMap)) {
                if (old.worldbuilding[key]) {
                    nodes.push({
                        id: generateNodeId(),
                        name: label, type: 'item', category: 'world',
                        parentId: 'root-world', order: order++, icon: '📄',
                        content: { description: old.worldbuilding[key] },
                        collapsed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                    });
                    hasContent = true;
                }
            }
        }

        // 迁移大纲
        if (old.plotOutline) {
            const fieldMap = {
                mainConflict: '核心矛盾', plotPoints: '关键剧情节点', subplots: '支线剧情',
                currentArc: '当前故事弧', foreshadowing: '已埋伏笔', ending: '结局方向',
                notes: '备注',
            };
            let order = 0;
            for (const [key, label] of Object.entries(fieldMap)) {
                if (old.plotOutline[key]) {
                    nodes.push({
                        id: generateNodeId(),
                        name: label, type: 'item', category: 'plot',
                        parentId: 'root-plot', order: order++, icon: '📄',
                        content: { description: old.plotOutline[key] },
                        collapsed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                    });
                    hasContent = true;
                }
            }
        }

        // 迁移写作规则
        if (old.writingRules) {
            const fieldMap = {
                mustDo: '✅ 必须遵守', mustNotDo: '❌ 禁止内容',
                styleGuide: '📝 风格指南', notes: '备注',
            };
            let order = 0;
            for (const [key, label] of Object.entries(fieldMap)) {
                if (old.writingRules[key]) {
                    nodes.push({
                        id: generateNodeId(),
                        name: label, type: 'item', category: 'rules',
                        parentId: 'root-rules', order: order++, icon: '📄',
                        content: { description: old.writingRules[key] },
                        collapsed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                    });
                    hasContent = true;
                }
            }
        }

        if (hasContent) {
            await saveSettingsNodes(nodes);
            return nodes;
        }
        return null;
    } catch {
        return null;
    }
}
