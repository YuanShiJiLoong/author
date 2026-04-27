// 设定集管理 - 存储人物、世界观、大纲等全局创作信息
// 这些信息会在每次AI调用时作为上下文传入，让AI像Cursor一样了解整个项目
// 基于「叙事引擎」架构 — 支持网络小说、传统文学、剧本/脚本三种创作模式

import { persistGet, persistSet, persistDel } from './persistence';
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

function wouldCreateParentCycle(nodes, nodeId, newParentId) {
    if (!nodeId || !newParentId) return false;
    let currentId = newParentId;
    const visited = new Set();
    while (currentId) {
        if (currentId === nodeId) return true;
        if (visited.has(currentId)) return true;
        visited.add(currentId);
        const parent = nodes.find(n => n.id === currentId);
        currentId = parent?.parentId || null;
    }
    return false;
}

function repairParentCycles(nodes, workId) {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const rootByCategory = new Map();
    for (const node of nodes) {
        if (node.parentId === workId && node.category && (node.type === 'folder' || node.type === 'special')) {
            rootByCategory.set(node.category, node.id);
        }
    }

    let changed = false;
    const getFallbackParentId = (node) => {
        if (node.type === 'work') return null;
        if (node.category && rootByCategory.get(node.category) && rootByCategory.get(node.category) !== node.id) {
            return rootByCategory.get(node.category);
        }
        return workId;
    };

    for (const node of nodes) {
        let parentId = node.parentId;
        const visited = new Set([node.id]);
        while (parentId) {
            if (visited.has(parentId)) {
                node.parentId = getFallbackParentId(node);
                node.updatedAt = new Date().toISOString();
                changed = true;
                break;
            }
            visited.add(parentId);
            const parent = nodeById.get(parentId);
            if (!parent) break;
            parentId = parent.parentId;
        }
    }

    return changed;
}

// ==================== 写作模式定义 ====================

export const WRITING_MODES = {
    webnovel: {
        key: 'webnovel',
        label: '网络小说',
        icon: 'smartphone',
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
        icon: 'book-open',
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
        icon: 'clapperboard',
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

    // 用户自定义系统提示词（为空时使用内置默认提示词）
    customPrompt: '',

    // API 配置 — 用户自己填入 API Key
    apiConfig: {
        provider: 'zhipu',   // 预设供应商标识
        apiKey: '',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4-flash',
        // 每个供应商独立保存的配置 { [key]: { apiKey, baseUrl, model, apiFormat? } }
        providerConfigs: {},
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
        proxyUrl: '',               // HTTP 代理地址，如 http://127.0.0.1:7890
    },

    // 对话侧栏独立模型配置（null = 跟随主配置）
    chatApiConfig: null,

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
        const parsed = data ? JSON.parse(data) : null;
        const settings = { ...DEFAULT_SETTINGS, ...(parsed || {}) };

        // 从独立的 author-api-config 中读取 API 设置（防止从云同步覆盖或缺失）
        const apiDataRaw = localStorage.getItem('author-api-config');
        if (apiDataRaw) {
            try {
                const apiData = JSON.parse(apiDataRaw);
                settings.apiConfig = apiData.apiConfig || settings.apiConfig;
                settings.chatApiConfig = apiData.chatApiConfig !== undefined ? apiData.chatApiConfig : settings.chatApiConfig;
            } catch { /* ignore */ }
        }

        // 自动迁移：如果旧的 SETTINGS_KEY 里还存在 apiConfig（特别是包含配置时），并且还没有独立的 author-api-config，分离它
        if (data && !apiDataRaw && settings.apiConfig) {
             const apiConfigData = {
                 apiConfig: settings.apiConfig,
                 chatApiConfig: settings.chatApiConfig
             };
             localStorage.setItem('author-api-config', JSON.stringify(apiConfigData));

             const syncSettings = { ...settings };
             delete syncSettings.apiConfig;
             delete syncSettings.chatApiConfig;
             localStorage.setItem(SETTINGS_KEY, JSON.stringify(syncSettings));
        }
        // 自动迁移：旧数据没有 providerConfigs 时，将当前活跃供应商的配置种入
        if (settings.apiConfig && !settings.apiConfig.providerConfigs) {
            settings.apiConfig.providerConfigs = {};
        }
        if (settings.apiConfig?.apiKey && settings.apiConfig.providerConfigs &&
            Object.keys(settings.apiConfig.providerConfigs).length === 0) {
            const p = settings.apiConfig.provider;
            if (p) {
                settings.apiConfig.providerConfigs[p] = {
                    apiKey: settings.apiConfig.apiKey,
                    baseUrl: settings.apiConfig.baseUrl || '',
                    model: settings.apiConfig.model || '',
                    apiFormat: settings.apiConfig.apiFormat || '',
                };
            }
        }
        // 自动迁移：为 providerConfigs 中的每个供应商补全 models 数组 + providerType
        if (settings.apiConfig?.providerConfigs) {
            for (const [key, cfg] of Object.entries(settings.apiConfig.providerConfigs)) {
                if (!cfg.models) {
                    // 首次迁移：models 字段不存在时，从当前活跃 model 初始化
                    cfg.models = cfg.model ? [cfg.model] : [];
                }
                // 注意：不再自动将 cfg.model 注入 cfg.models，否则用户无法从快切列表中删除模型
                // 自动迁移：补全 providerType 字段（多实例支持）
                if (!cfg.providerType) {
                    // 旧数据 key 本身就是 providerType，实例 key 含下划线后缀
                    cfg.providerType = key.replace(/_[a-z0-9]+$/, '');
                }
            }
        }
        // 在返回前，将 providerType 写入 apiConfig 顶层，方便下游直接使用
        if (settings.apiConfig?.provider && settings.apiConfig.providerConfigs) {
            const activeCfg = settings.apiConfig.providerConfigs[settings.apiConfig.provider];
            if (activeCfg?.providerType) {
                settings.apiConfig.providerType = activeCfg.providerType;
            }
        }
        return settings;
    } catch {
        return DEFAULT_SETTINGS;
    }
}

// 保存项目设定（同步写 localStorage + 异步写服务端）
export function saveProjectSettings(settings) {
    if (typeof window === 'undefined') return;
    // 抽出 apiConfig 和 chatApiConfig，单独存入本地，不要同步到云端
    const apiConfigData = {
        apiConfig: settings.apiConfig,
        chatApiConfig: settings.chatApiConfig,
    };
    localStorage.setItem('author-api-config', JSON.stringify(apiConfigData));

    // 从 settings 拷贝一份剔除 API 配置后用于云同步
    const syncSettings = { ...settings };
    delete syncSettings.apiConfig;
    delete syncSettings.chatApiConfig;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(syncSettings));
    // 异步写入服务端（不阻塞 UI）
    persistSet(SETTINGS_KEY, syncSettings).catch(() => { });
}

/**
 * 获取对话侧栏使用的 API 配置。
 * 如果已配置独立的 chatApiConfig 则使用它，否则回退到主 apiConfig。
 * tools 和 searchConfig 始终从主配置继承（如果 chatApiConfig 中缺失）。
 */
export function getChatApiConfig() {
    const settings = getProjectSettings();
    const chat = settings.chatApiConfig;
    const base = (chat && chat.provider) ? chat : settings.apiConfig;
    const main = settings.apiConfig || {};

    let result;
    if (chat && chat.provider) {
        // 从主配置继承 tools 和 searchConfig（如果 chat 中缺失）
        result = {
            ...chat,
            tools: chat.tools || main.tools,
            searchConfig: chat.searchConfig || main.searchConfig,
            // 继承高级参数设置
            useAdvancedParams: chat.useAdvancedParams ?? main.useAdvancedParams,
            enableTemperature: chat.enableTemperature ?? main.enableTemperature,
            enableTopP: chat.enableTopP ?? main.enableTopP,
            enableMaxContextLength: chat.enableMaxContextLength ?? main.enableMaxContextLength,
            enableMaxOutputTokens: chat.enableMaxOutputTokens ?? main.enableMaxOutputTokens,
            enableReasoningEffort: chat.enableReasoningEffort ?? main.enableReasoningEffort,
            temperature: chat.temperature ?? main.temperature,
            topP: chat.topP ?? main.topP,
            maxContextLength: chat.maxContextLength ?? main.maxContextLength,
            maxOutputTokens: chat.maxOutputTokens ?? main.maxOutputTokens,
            reasoningEffort: chat.reasoningEffort || main.reasoningEffort,
            // 继承代理设置（代理是全局配置，不分主/聊天）
            proxyUrl: chat.proxyUrl || main.proxyUrl,
        };
    } else {
        result = { ...main };
    }

    // 应用模型级参数覆盖（如果存在）
    const instanceKey = result.provider;
    const modelId = result.model;
    if (instanceKey && modelId) {
        const mParams = getModelParams(instanceKey, modelId);
        if (mParams) {
            if (mParams.temperature != null) { result.temperature = mParams.temperature; result.enableTemperature = true; }
            if (mParams.topP != null) { result.topP = mParams.topP; result.enableTopP = true; }
            if (mParams.maxContextLength != null) { result.maxContextLength = mParams.maxContextLength; result.enableMaxContextLength = true; }
            if (mParams.maxOutputTokens != null) { result.maxOutputTokens = mParams.maxOutputTokens; result.enableMaxOutputTokens = true; }
            if (mParams.reasoningEffort != null) { result.reasoningEffort = mParams.reasoningEffort; result.enableReasoningEffort = true; }
            // 模型级参数自动开启 useAdvancedParams
            result.useAdvancedParams = true;
        }
    }

    // 解析 providerType（多实例架构下 provider 可能是 'deepseek_abc123' 这类实例 key）
    if (instanceKey) {
        const cfg = settings.apiConfig?.providerConfigs?.[instanceKey];
        result.providerType = cfg?.providerType || instanceKey;
    }

    return result;
}

// ==================== 供应商多实例管理 ====================

/**
 * 创建同类型供应商的新实例
 * @param {string} providerType - 原始供应商类型 key（如 'deepseek'）
 * @param {string} instanceName - 用户自定义实例名称（可选，自动生成）
 * @param {Object} initialConfig - 初始配置（可选）
 * @returns {string} 新创建的实例 key
 */
export function addProviderInstance(providerType, instanceName, initialConfig = {}) {
    const settings = getProjectSettings();
    const pc = settings.apiConfig.providerConfigs || {};
    // 生成唯一实例 key
    const suffix = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    const instanceKey = `${providerType}_${suffix}`;
    pc[instanceKey] = {
        apiKey: initialConfig.apiKey || '',
        baseUrl: initialConfig.baseUrl || '',
        model: initialConfig.model || '',
        models: initialConfig.models || [],
        apiFormat: initialConfig.apiFormat || '',
        providerType,
        instanceName: instanceName || `${providerType} (${suffix.slice(0, 4)})`,
        modelParams: {},
    };
    settings.apiConfig.providerConfigs = pc;
    saveProjectSettings(settings);
    return instanceKey;
}

/**
 * 删除供应商实例
 * @param {string} instanceKey - 要删除的实例 key
 */
export function deleteProviderInstance(instanceKey) {
    const settings = getProjectSettings();
    const pc = settings.apiConfig.providerConfigs || {};
    if (!pc[instanceKey]) return false;
    delete pc[instanceKey];
    // 如果当前活跃的 provider 就是这个实例，切回第一个可用
    if (settings.apiConfig.provider === instanceKey) {
        const remaining = Object.keys(pc);
        if (remaining.length > 0) {
            const first = remaining[0];
            settings.apiConfig.provider = first;
            settings.apiConfig.apiKey = pc[first].apiKey || '';
            settings.apiConfig.baseUrl = pc[first].baseUrl || '';
            settings.apiConfig.model = pc[first].model || '';
        }
    }
    if (settings.chatApiConfig?.provider === instanceKey) {
        settings.chatApiConfig = null;
    }
    settings.apiConfig.providerConfigs = pc;
    saveProjectSettings(settings);
    return true;
}

/**
 * 获取指定模型的独立参数覆盖
 * @param {string} instanceKey - 供应商实例 key
 * @param {string} modelId - 模型 ID
 * @returns {Object|null} 参数对象或 null
 */
export function getModelParams(instanceKey, modelId) {
    if (!instanceKey || !modelId) return null;
    const settings = getProjectSettings();
    const cfg = settings.apiConfig?.providerConfigs?.[instanceKey];
    if (!cfg?.modelParams?.[modelId]) return null;
    const p = cfg.modelParams[modelId];
    // 返回非空的参数对象，如果所有字段都为 null 则整体返回 null
    const hasAny = Object.values(p).some(v => v != null);
    return hasAny ? p : null;
}

/**
 * 设置指定模型的独立参数覆盖
 * @param {string} instanceKey - 供应商实例 key
 * @param {string} modelId - 模型 ID
 * @param {Object} params - { temperature?, topP?, maxContextLength?, maxOutputTokens?, reasoningEffort? }
 */
export function setModelParams(instanceKey, modelId, params) {
    if (!instanceKey || !modelId) return;
    const settings = getProjectSettings();
    const pc = settings.apiConfig.providerConfigs || {};
    if (!pc[instanceKey]) return;
    if (!pc[instanceKey].modelParams) pc[instanceKey].modelParams = {};
    const prev = pc[instanceKey].modelParams[modelId] || {};
    pc[instanceKey].modelParams[modelId] = { ...prev, ...params };
    // 清除值为 null 的字段（表示恢复默认）
    const mp = pc[instanceKey].modelParams[modelId];
    for (const k of Object.keys(mp)) {
        if (mp[k] === null || mp[k] === undefined) delete mp[k];
    }
    if (Object.keys(mp).length === 0) delete pc[instanceKey].modelParams[modelId];
    settings.apiConfig.providerConfigs = pc;
    saveProjectSettings(settings);
}

/**
 * 获取 providerType 对应的所有实例 key 列表
 * @param {string} providerType - 供应商类型
 * @returns {string[]} 实例 key 数组
 */
export function getProviderInstances(providerType) {
    const settings = getProjectSettings();
    const pc = settings.apiConfig?.providerConfigs || {};
    return Object.keys(pc).filter(key => {
        const cfg = pc[key];
        return (cfg.providerType || key) === providerType;
    });
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

const LEGACY_NODES_KEY = 'author-settings-nodes';       // 旧全局 key（仅迁移用）
const WORKS_INDEX_KEY  = 'author-works-index';           // 轻量作品索引
const ACTIVE_WORK_KEY  = 'author-active-work';

/** 每个作品的设定集独立 key */
function getNodesKey(workId) {
    return `author-settings-nodes-${workId || 'work-default'}`;
}

function generateNodeId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ==================== 作品级节点系统 ====================

// 每个作品下自动创建的子分类模板
const WORK_SUB_CATEGORIES = [
    { suffix: 'characters', name: '人物设定', category: 'character', type: 'folder', subFolders: [
        { name: '主要角色', icon: 'Star' },
        { name: '次要角色', icon: 'User' },
        { name: '阵营/势力', icon: 'Shield' },
    ]},
    { suffix: 'locations', name: '空间/地点', category: 'location', type: 'folder', subFolders: [
        { name: '主要场景', icon: 'Building' },
        { name: '自然环境', icon: 'Mountain' },
    ]},
    { suffix: 'world', name: '世界观/设定', category: 'world', type: 'folder', subFolders: [
        { name: '历史/纪元', icon: 'BookOpen' },
        { name: '社会/政治', icon: 'Crown' },
        { name: '文化/习俗', icon: 'Compass' },
        { name: '力量体系', icon: 'Zap' },
    ]},
    { suffix: 'objects', name: '物品/道具', category: 'object', type: 'folder', subFolders: [
        { name: '武器/装备', icon: 'Sword' },
        { name: '特殊道具', icon: 'Gem' },
    ]},
    { suffix: 'plot', name: '大纲', category: 'plot', type: 'folder', subFolders: [
        { name: '主线', icon: 'Flame' },
        { name: '支线', icon: 'Feather' },
        { name: '伏笔', icon: 'Lightbulb' },
    ]},
    { suffix: 'rules', name: '写作规则', category: 'rules', type: 'folder', subFolders: [
        { name: '文风规范', icon: 'Palette' },
        { name: '禁忌/注意', icon: 'Flag' },
    ]},
    { suffix: 'custom', name: '自定义设定', category: 'custom', type: 'folder', subFolders: [] },
];

// 全局根分类（不属于任何作品）— 已废弃，所有规则均归属各作品
const GLOBAL_ROOT_CATEGORIES = [];

// 旧版 ROOT_CATEGORIES 的 id（用于迁移检测）
const LEGACY_ROOT_IDS = [
    'root-characters', 'root-locations',
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
        icon: '',
        content: {},
        collapsed: false,
        enabled: true,
        createdAt: now,
        updatedAt: now,
    };
    const subNodes = [];
    WORK_SUB_CATEGORIES.forEach((cat, i) => {
        const catId = `${id}-${cat.suffix}`;
        subNodes.push({
            id: catId, name: cat.name, type: cat.type, category: cat.category,
            parentId: id, order: i, icon: cat.icon || '', content: {},
            collapsed: false, createdAt: now, updatedAt: now,
        });
        if (cat.subFolders) {
            cat.subFolders.forEach((sub, j) => {
                subNodes.push({
                    id: `${catId}-sub${j}`, name: sub.name, type: 'folder',
                    category: cat.category, parentId: catId, order: j,
                    icon: sub.icon || 'FolderOpen', content: {},
                    collapsed: false, createdAt: now, updatedAt: now,
                });
            });
        }
    });
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
        persistSet(ACTIVE_WORK_KEY, workId).catch(() => { });
    } else {
        localStorage.removeItem(ACTIVE_WORK_KEY);
    }
}

/**
 * 获取所有作品列表（从轻量索引读取，不加载设定）
 * @param {Array|null} nodes - 如果已有节点数组，直接从中提取；否则从索引读取
 */
export async function getAllWorks(nodes) {
    if (nodes) return nodes.filter(n => n.type === 'work');
    if (typeof window === 'undefined') return [];
    // 确保迁移已完成
    await migrateGlobalToPerWork();
    const index = await persistGet(WORKS_INDEX_KEY);
    return Array.isArray(index) ? index : [];
}

/** 保存作品索引（仅 work 节点的轻量信息） */
async function saveWorksIndex(workEntries) {
    if (typeof window === 'undefined') return;
    // 只保留必要字段
    const slim = workEntries.map(w => ({
        id: w.id, name: w.name, type: 'work', category: 'work',
        icon: w.icon || '', order: w.order ?? 0,
        createdAt: w.createdAt, updatedAt: w.updatedAt,
    }));
    await persistSet(WORKS_INDEX_KEY, slim);
}

/**
 * 添加新作品（写入索引 + 初始化独立 key）
 * @returns {Object} workNode - 创建的作品节点
 */
export async function addWork(name, workId) {
    const { workNode, subNodes } = createWorkNode(name, workId);
    const works = await getAllWorks();
    works.push(workNode);
    await saveWorksIndex(works);
    await persistSet(getNodesKey(workNode.id), subNodes);
    return workNode;
}

/**
 * 删除作品（移除索引 + 删除独立 key）
 */
export async function removeWork(workId) {
    const works = await getAllWorks();
    const updated = works.filter(w => w.id !== workId);
    await saveWorksIndex(updated);
    await persistDel(getNodesKey(workId));
    return updated;
}

/**
 * 重命名作品（更新索引）
 */
export async function renameWork(workId, newName) {
    const works = await getAllWorks();
    const work = works.find(w => w.id === workId);
    if (work) {
        work.name = newName;
        work.updatedAt = new Date().toISOString();
        await saveWorksIndex(works);
    }
    return works;
}

// ==================== 节点初始化与迁移 ====================

// 获取默认节点树（只含子分类，不含 work 节点本身）
function getDefaultWorkNodes(workId) {
    const wid = workId || 'work-default';
    const now = new Date().toISOString();
    const nodes = [];
    WORK_SUB_CATEGORIES.forEach((cat, i) => {
        const catId = `${wid}-${cat.suffix}`;
        nodes.push({
            id: catId, name: cat.name, type: cat.type, category: cat.category,
            parentId: wid, order: i, icon: cat.icon, content: {},
            collapsed: false, createdAt: now, updatedAt: now,
        });
        // 预设子分类
        if (cat.subFolders) {
            cat.subFolders.forEach((sub, j) => {
                nodes.push({
                    id: `${catId}-sub${j}`, name: sub.name, type: 'folder',
                    category: cat.category, parentId: catId, order: j,
                    icon: sub.icon || 'FolderOpen', content: {},
                    collapsed: false, createdAt: now, updatedAt: now,
                });
            });
        }
    });
    // Ensure bookInfo special node is always created
    nodes.push({
        id: `${wid}-bookInfo`, name: '作品信息', type: 'special', category: 'bookInfo',
        parentId: wid, order: -1, icon: 'BookOpen', content: { title: '', genre: '', synopsis: '', style: '', tone: '', targetAudience: '', pov: '' },
        collapsed: false, createdAt: now, updatedAt: now,
    });
    return nodes;
}

// ==================== 全局 → 按作品迁移（一次性） ====================

let _migrationDone = false;

/**
 * 将旧的单一 author-settings-nodes 拆分为每个作品一个 key
 * 旧数据保留为 author-settings-nodes-backup 以防万一
 */
async function migrateGlobalToPerWork() {
    if (_migrationDone) return;
    if (typeof window === 'undefined') { _migrationDone = true; return; }

    // 已有索引 → 说明已经迁移过
    const existingIndex = await persistGet(WORKS_INDEX_KEY);
    if (existingIndex) { _migrationDone = true; return; }

    // 读旧数据
    let oldNodes = await persistGet(LEGACY_NODES_KEY);
    if (!oldNodes) {
        // 尝试最古老的迁移（从 localStorage 项目设定）
        const migrated = await migrateOldSettings();
        if (migrated) {
            oldNodes = await migrateToWorkStructure(migrated);
        }
    } else {
        // 依次跑旧的迁移链
        oldNodes = await migrateToWorkStructure(oldNodes);
        oldNodes = await migrateGlobalRulesToWork(oldNodes);
        oldNodes = await ensureWorkExistsLegacy(oldNodes);
        oldNodes = await migrateBookInfoToNodeLegacy(oldNodes);
    }

    if (!oldNodes || oldNodes.length === 0) {
        // 全新用户 → 创建默认作品
        const { workNode, subNodes } = createWorkNode('默认作品', 'work-default');
        await saveWorksIndex([workNode]);
        await persistSet(getNodesKey('work-default'), subNodes);
        if (!getActiveWorkId()) setActiveWorkId('work-default');
        _migrationDone = true;
        return;
    }

    // 按作品拆分
    const workNodes = oldNodes.filter(n => n.type === 'work');
    for (const work of workNodes) {
        // 收集该作品的所有后代
        const descendants = [];
        const collect = (pid) => {
            oldNodes.filter(n => n.parentId === pid).forEach(n => {
                descendants.push(n);
                collect(n.id);
            });
        };
        collect(work.id);
        await persistSet(getNodesKey(work.id), descendants);
    }

    // 保存索引
    await saveWorksIndex(workNodes);

    // 备份旧数据（不删除，以防万一）
    await persistSet('author-settings-nodes-backup', oldNodes);
    // 删除旧 key
    await persistDel(LEGACY_NODES_KEY);

    if (!getActiveWorkId() && workNodes.length > 0) {
        setActiveWorkId(workNodes[0].id);
    }

    _migrationDone = true;
}

/**
 * 修复根分类节点 parentId 不一致的数据损坏问题
 * 当节点存储在某个作品的 key 下但 parentId 指向另一个作品时，修复 parentId
 * @param {Array} nodes - 节点数组（就地修改）
 * @param {string} workId - 当前作品 ID
 * @returns {boolean} 是否有修改
 */
function repairOrphanedRootFolders(nodes, workId) {
    let changed = false;
    // 检查所有预设分类是否都有正确 parentId 的根节点
    const presetCategories = WORK_SUB_CATEGORIES.filter(c => c.category !== 'bookInfo');
    const hasAllPresetRoots = presetCategories.every(cat =>
        nodes.some(n => n.parentId === workId && n.category === cat.category && (n.type === 'folder' || n.type === 'special'))
    );
    if (hasAllPresetRoots) return false; // 所有预设分类都有正确的根节点，无需修复

    // 找出所有"孤儿"根分类节点 — parentId 以 'work-' 开头但不等于当前 workId
    const orphanRoots = nodes.filter(n =>
        n.parentId && n.parentId.startsWith('work-') && n.parentId !== workId &&
        (n.type === 'folder' || n.type === 'special') &&
        !nodes.some(p => p.id === n.parentId) // parentId 指向的节点不在当前节点列表中
    );

    if (orphanRoots.length === 0) return false;

    // 修复：更新这些根节点的 parentId 为当前 workId
    // 同时需要更新其子节点的 parentId（因为根节点 ID 包含旧 workId 前缀）
    const oldIdToNew = {};
    for (const root of orphanRoots) {
        const oldId = root.id;
        // 为预设分类生成正确的 ID（workId-suffix 格式）
        const matchingSub = WORK_SUB_CATEGORIES.find(c => c.category === root.category);
        const newId = matchingSub ? `${workId}-${matchingSub.suffix}` : oldId;
        
        root.parentId = workId;
        if (newId !== oldId) {
            oldIdToNew[oldId] = newId;
            root.id = newId;
        }
        changed = true;
    }

    // 级联更新子节点的 parentId
    if (Object.keys(oldIdToNew).length > 0) {
        for (const node of nodes) {
            if (node.parentId && oldIdToNew[node.parentId]) {
                node.parentId = oldIdToNew[node.parentId];
                changed = true;
            }
        }
    }

    if (changed) {
        console.log(`[Settings] Repaired ${orphanRoots.length} orphaned root folders for work ${workId}`);
    }
    return changed;
}

/**
 * 获取指定作品的设定节点（不含 work 节点本身） (Async)
 * @param {string} workId - 作品 ID，默认取当前活跃作品
 */
export async function getSettingsNodes(workId) {
    if (typeof window === 'undefined') return getDefaultWorkNodes(workId);
    await migrateGlobalToPerWork();

    const wid = workId || getActiveWorkId() || 'work-default';
    try {
        let nodes = await persistGet(getNodesKey(wid));
        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
            // 首次打开该作品 → 初始化子分类
            const defaults = getDefaultWorkNodes(wid);
            await persistSet(getNodesKey(wid), defaults);
            return defaults;
        }
        // 修复 parentId 不匹配的根分类节点（数据损坏修复）
        const repaired = repairOrphanedRootFolders(nodes, wid);
        // 为旧作品补充缺失的根分类文件夹（如新增的 custom 分类）
        let rootFolderPatched = false;
        const now2 = new Date().toISOString();
        const existingRootOrder = nodes
            .filter(n => n.parentId === wid && (n.type === 'folder' || n.type === 'special'))
            .reduce((m, n) => Math.max(m, n.order || 0), -1);
        WORK_SUB_CATEGORIES.forEach((cat, i) => {
            const hasRoot = nodes.some(n =>
                n.parentId === wid && n.category === cat.category && (n.type === 'folder' || n.type === 'special')
            );
            if (!hasRoot) {
                const catId = `${wid}-${cat.suffix}`;
                nodes.push({
                    id: catId, name: cat.name, type: cat.type, category: cat.category,
                    parentId: wid, order: existingRootOrder + 1 + i, icon: cat.icon || '',
                    content: {}, collapsed: false, createdAt: now2, updatedAt: now2,
                });
                rootFolderPatched = true;
            }
        });
        // 为已有分类补充预设子文件夹
        const patched = ensurePresetSubFolders(nodes, wid);
        // 确保 bookInfo 节点存在（兼容老数据）
        let biNode = nodes.find(n => n.category === 'bookInfo' && n.type === 'special');
        let biPatched = false;
        if (!biNode) {
            nodes.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
                name: '作品信息', type: 'special', category: 'bookInfo',
                parentId: wid, order: -1, icon: 'BookOpen',
                content: { title: '', genre: '', synopsis: '', style: '', tone: '', targetAudience: '', pov: '' },
                collapsed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            biPatched = true;
        }

        const cycleRepaired = repairParentCycles(nodes, wid);

        if (repaired || patched || biPatched || rootFolderPatched || cycleRepaired) {
            await persistSet(getNodesKey(wid), nodes);
        }
        return nodes;
    } catch {
        return getDefaultWorkNodes(wid);
    }
}

/**
 * 为已有作品的各分类根文件夹补充预设子文件夹（仅在该分类没有任何子文件夹时添加）
 * @returns {boolean} 是否有修改
 */
function ensurePresetSubFolders(nodes, workId) {
    // 每个作品只补充一次，用户删除后不再重置（v2: 按名字逐个检查）
    const flagKey = `author-subfolder-init-v2-${workId}`;
    try { if (localStorage.getItem(flagKey)) return false; } catch {}
    let changed = false;
    const now = new Date().toISOString();
    for (const cat of WORK_SUB_CATEGORIES) {
        if (!cat.subFolders || cat.subFolders.length === 0) continue;
        const rootFolder = nodes.find(n =>
            n.parentId === workId && n.category === cat.category && (n.type === 'folder' || n.type === 'special')
        );
        if (!rootFolder) continue;
        const existingChildFolders = nodes.filter(n => n.parentId === rootFolder.id && n.type === 'folder');
        const existingNames = new Set(existingChildFolders.map(f => f.name));
        const maxOrder = existingChildFolders.reduce((m, f) => Math.max(m, f.order || 0), -1);
        cat.subFolders.forEach((sub, j) => {
            if (existingNames.has(sub.name)) return; // 已有同名 → 跳过
            nodes.push({
                id: generateNodeId(), name: sub.name, type: 'folder',
                category: cat.category, parentId: rootFolder.id, order: maxOrder + 1 + j,
                icon: sub.icon || 'FolderOpen', content: {},
                collapsed: false, createdAt: now, updatedAt: now,
            });
            changed = true;
        });
    }
    // 标记已完成，不再重复
    try { localStorage.setItem(flagKey, '1'); } catch {}
    return changed;
}

/**
 * 保存指定作品的设定节点 (Async)
 * @param {Array} nodes - 节点数组
 * @param {string} workId - 作品 ID，默认取当前活跃作品
 */
export async function saveSettingsNodes(nodes, workId) {
    if (typeof window === 'undefined') return;
    const wid = workId || getActiveWorkId() || 'work-default';
    await persistSet(getNodesKey(wid), nodes);
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

    await persistSet(LEGACY_NODES_KEY, newNodes);
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
    return nodes;
}

// 确保至少有一个作品存在（旧迁移链专用）
async function ensureWorkExistsLegacy(nodes) {
    if (!nodes.some(n => n.type === 'work')) {
        const { workNode, subNodes } = createWorkNode('默认作品', 'work-default');
        nodes.push(workNode, ...subNodes);
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
        icon: icon || '',
        content: content || {},
        collapsed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    if (node.type === 'item') {
        const { apiConfig } = getProjectSettings();
        if (apiConfig.useCustomEmbed) {
            try {
                const textToEmbed = extractTextForEmbedding(node);
                node.embedding = await getEmbedding(textToEmbed, apiConfig);
            } catch (e) {
                console.warn('[Settings] Embedding failed for new node, will retry later:', e.message);
            }
        }
    }

    nodes.push(node);
    await saveSettingsNodes(nodes);
    return node;
}

// 更新节点 (Async)
// Embedding 防抖定时器 — 避免每次编辑都触发 embedding API 调用
const _embeddingTimers = {};

export async function updateSettingsNode(id, updates, currentNodes, workId) {
    const targetWorkId = workId || getActiveWorkId() || 'work-default';
    const nodes = currentNodes || await getSettingsNodes(targetWorkId);
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
    if (updates.parentId !== undefined && wouldCreateParentCycle(nodes, id, updates.parentId)) {
        throw new Error('不能把分类移动到自身或它的子分类下');
    }

    // 先立即保存内容（不等 embedding），确保数据不丢失
    nodes[idx] = { ...nodes[idx], ...updates, updatedAt: new Date().toISOString() };
    await saveSettingsNodes(nodes, targetWorkId);

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
                const freshNodes = await getSettingsNodes(targetWorkId);
                const freshIdx = freshNodes.findIndex(n => n.id === id);
                if (freshIdx === -1) return;
                const textToEmbed = extractTextForEmbedding(freshNodes[freshIdx]);
                const embedding = await getEmbedding(textToEmbed, apiConfig);
                if (embedding) {
                    freshNodes[freshIdx] = { ...freshNodes[freshIdx], embedding };
                    await saveSettingsNodes(freshNodes, targetWorkId);
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
    const collect = (parentId, visiting = new Set()) => {
        if (visiting.has(parentId)) return;
        visiting.add(parentId);
        toDelete.add(parentId);
        nodes.filter(n => n.parentId === parentId).forEach(n => collect(n.id, visiting));
        visiting.delete(parentId);
    };
    collect(id);
    // 清除被删除节点的所有待执行 embedding 定时器，
    // 防止定时器回调重新读取并保存含已删除节点的旧数据
    for (const delId of toDelete) {
        if (_embeddingTimers[delId]) {
            clearTimeout(_embeddingTimers[delId]);
            delete _embeddingTimers[delId];
        }
    }
    nodes = nodes.filter(n => !toDelete.has(n.id));
    await saveSettingsNodes(nodes);
    return true;
}

// 移动节点 (Async)
export async function moveSettingsNode(id, newParentId) {
    const nodes = await getSettingsNodes();
    const idx = nodes.findIndex(n => n.id === id);
    if (idx === -1) return null;
    if (wouldCreateParentCycle(nodes, id, newParentId)) {
        throw new Error('不能把分类移动到自身或它的子分类下');
    }
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
// 每次请求间隔 500ms 以避免超出 TPM 限制
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
        // 请求间隔：避免超出 TPM / RPM 限制
        if (done < items.length) {
            await new Promise(r => setTimeout(r, 700));
        }
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

/**
 * 将全局 settings.bookInfo 迁移到默认作品的 bookInfo 节点 content 中（旧迁移链专用）
 * 只执行一次：检查全局 bookInfo 是否有内容，迁移后清空
 */
async function migrateBookInfoToNodeLegacy(nodes) {
    if (typeof window === 'undefined') return nodes;
    try {
        const settings = getProjectSettings();
        const bi = settings.bookInfo;
        if (!bi || !Object.values(bi).some(v => v)) return nodes;

        const activeWid = getActiveWorkId();
        const targetWorkId = activeWid || nodes.find(n => n.type === 'work')?.id;
        if (!targetWorkId) return nodes;

        const biNode = nodes.find(n => n.parentId === targetWorkId && n.category === 'bookInfo' && n.type === 'special');
        if (!biNode) return nodes;

        if (!biNode.content || Object.keys(biNode.content).length === 0) {
            biNode.content = { ...bi };
        }

        settings.bookInfo = {};
        saveProjectSettings(settings);
    } catch (e) {
        console.warn('[Settings] bookInfo migration failed:', e);
    }
    return nodes;
}

// ==================== 旧数据迁移 ====================

// ==================== 旧数据迁移 ====================

async function migrateOldSettings() {
    if (typeof window === 'undefined') return null;
    try {
        const oldData = localStorage.getItem(SETTINGS_KEY);
        if (!oldData) return null;

        const old = JSON.parse(oldData);
        const { workNode, subNodes } = createWorkNode('默认作品', 'work-default');
        const nodes = [workNode, ...subNodes];
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
            await persistSet(LEGACY_NODES_KEY, nodes);
            return nodes;
        }
        return null;
    } catch {
        return null;
    }
}
