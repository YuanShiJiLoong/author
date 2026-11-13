// ==================== 各服务商模型规则（纯函数）====================
// 三条 AI 路由（OpenAI 兼容 / Gemini 原生 / Claude 兼容）和浏览器直连层共用：
// 按模型名判断该发哪些参数，避免新一代模型因参数写法变化直接返回 400。
// 这里只做模型识别和请求参数拼装，不发网络请求，便于单元测试。

/** 思考层级取值：auto = 不覆盖服务商默认；none = 尽量关闭思考。 */
export const REASONING_EFFORT_LEVELS = ['auto', 'none', 'low', 'medium', 'high', 'xhigh', 'max'];

const EFFORT_ON_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

function normalizeModelId(model) {
    return String(model || '').trim().toLowerCase().replace(/^models\//, '');
}

function isEffortOn(reasoningEffort) {
    return EFFORT_ON_LEVELS.has(reasoningEffort);
}

// ==================== DeepSeek ====================

/** 支持 thinking 开关和 reasoning_effort 的 DeepSeek 模型名（含仍被临时转发的旧名）。 */
const DEEPSEEK_THINKING_MODELS = new Set([
    'deepseek-flash',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp',
]);
const DEEPSEEK_LEGACY_REASONER_MODEL = 'deepseek-reasoner';

/** 已停用（deepseek-chat / deepseek-reasoner）或已退役仅临时转发（deepseek-v4-flash*）的模型名。 */
export const DEEPSEEK_RETIRED_MODELS = new Set([
    'deepseek-chat',
    'deepseek-reasoner',
    'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp',
]);

export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-flash';

export function isDeepSeekThinkingModel(model) {
    return DEEPSEEK_THINKING_MODELS.has(normalizeModelId(model));
}

export function isDeepSeekRequest(apiConfig, baseUrl, model) {
    const provider = (apiConfig?.providerType || apiConfig?.provider || '').toLowerCase();
    return provider === 'deepseek'
        || (baseUrl || '').includes('api.deepseek.com')
        || isDeepSeekThinkingModel(model);
}

/**
 * DeepSeek 内置联网工具（2026-11-13 上线）：在 chat/completions 里声明，由 DeepSeek 服务端
 * 执行搜索和读网页，引用来源以 url_citation 注释随最后一个流式分片返回。官方文档目前只写明
 * deepseek-flash 支持；其他模型继续走 Function Calling 外部搜索。
 */
const DEEPSEEK_WEB_TOOLS_MODELS = new Set(['deepseek-flash']);

export function supportsDeepSeekWebTools(model) {
    return DEEPSEEK_WEB_TOOLS_MODELS.has(normalizeModelId(model));
}

/**
 * 内置联网工具的请求字段。webTools = { readUrl } ，未开启时返回空对象。
 * 声明这些工具时不能再带 web_search_options 或自定义搜索工具，否则 DeepSeek 返回 400。
 */
export function buildDeepSeekWebToolsParams(webTools) {
    if (!webTools) return {};
    return {
        tools: [
            { type: 'deepseek_web_search' },
            ...(webTools.readUrl ? [{ type: 'deepseek_read_url' }] : []),
        ],
    };
}

/** 思考模式下带工具调用时，DeepSeek 要求把之前各轮的 reasoning_content 原样传回。 */
export function isDeepSeekThinkingMode(apiConfig, baseUrl, model, reasoningEffort) {
    if (!isDeepSeekRequest(apiConfig, baseUrl, model)) return false;
    if (normalizeModelId(model) === DEEPSEEK_LEGACY_REASONER_MODEL) return true;
    if (!isDeepSeekThinkingModel(model)) return false;
    return reasoningEffort !== 'none';
}

// ==================== Gemini ====================

function parseGeminiVersion(model) {
    const id = normalizeModelId(model);
    const match = id.match(/^gemini-(\d+)(?:\.(\d+))?/);
    if (!match) return null;
    return { major: Number(match[1]), minor: Number(match[2] || 0) };
}

/** Gemini 3 及以后（含 gemini-*-latest 别名）用 thinkingLevel；2.5 及未知模型名沿用 thinkingBudget。 */
export function usesGeminiThinkingLevel(model) {
    const id = normalizeModelId(model);
    if (/^gemini-[a-z-]+-latest$/.test(id)) return true;
    const version = parseGeminiVersion(id);
    return !!version && version.major >= 3;
}

/** 支持 minimal 档位的模型；其余（如 Gemini 4 Argon、3.8 Flash、3.1 Pro）传 minimal 会报错。 */
function geminiSupportsMinimal(id) {
    return id.includes('flash-lite')
        || /^gemini-3\.6-flash/.test(id)
        || /^gemini-3-flash/.test(id);
}

function geminiThinkingLevel(id, reasoningEffort) {
    // Gemini 3 / 4 的思考无法完全关闭，"关闭思考"降到该模型支持的最低档。
    if (reasoningEffort === 'none') return geminiSupportsMinimal(id) ? 'minimal' : 'low';
    if (reasoningEffort === 'low' || reasoningEffort === 'medium') return reasoningEffort;
    return 'high';
}

function geminiThinkingBudget(id, reasoningEffort) {
    if (/^gemini-2\.5-pro/.test(id)) {
        // 2.5 Pro：128–32768，不能关闭思考
        return { none: 128, low: 1024, medium: 8192 }[reasoningEffort] ?? 32768;
    }
    if (/^gemini-2\.5-flash/.test(id)) {
        // 2.5 Flash / Flash-Lite：上限 24576，0 关闭思考
        return { none: 0, low: 1024, medium: 8192 }[reasoningEffort] ?? 24576;
    }
    return { none: 0, low: 1024, medium: 8192 }[reasoningEffort] ?? 32768;
}

/** Gemini 原生 generateContent 的 thinkingConfig；auto 或未传时返回 null（不覆盖默认）。 */
export function buildGeminiThinkingConfig(model, reasoningEffort) {
    if (!reasoningEffort || reasoningEffort === 'auto') return null;
    if (reasoningEffort !== 'none' && !isEffortOn(reasoningEffort)) return null;
    const id = normalizeModelId(model);
    if (usesGeminiThinkingLevel(id)) return { thinkingLevel: geminiThinkingLevel(id, reasoningEffort) };
    return { thinkingBudget: geminiThinkingBudget(id, reasoningEffort) };
}

// ==================== MiniMax ====================

/**
 * MiniMax M3 及以后的思考写法（两种 API 格式通用）：
 * - 'effort'：M3.1-Flash 起的 Flash 模型始终思考，只能调深浅；不传默认 max，传 none 或关闭思考返回 400
 * - 'toggle'：MiniMax-M3 只有思考开关，不认 effort
 * M2.x 即将下线，返回 null，沿用原有写法。
 */
function getMiniMaxThinkingMode(model) {
    const match = normalizeModelId(model).match(/minimax-m(\d+)(?:\.(\d+))?(-flash)?/);
    if (!match) return null;
    const version = Number(match[1]) + Number(match[2] || 0) / 10;
    if (version < 3) return null;
    return match[3] && version >= 3.1 ? 'effort' : 'toggle';
}

// ==================== OpenAI 兼容 chat/completions ====================

/** OpenAI 推理系列（GPT-5 及以后、o 系列）只认 max_completion_tokens，不接受 max_tokens。 */
export function usesMaxCompletionTokens(model) {
    return /^(?:gpt-(?:[5-9]|\d{2,})|o[1-9])(?:[.-]|$)/.test(normalizeModelId(model));
}

/** 把界面上的思考层级换成目标服务商能接受的 reasoning_effort 取值。 */
export function normalizeOpenAiReasoningEffort(model, reasoningEffort) {
    if (!reasoningEffort || reasoningEffort === 'auto') return null;
    const id = normalizeModelId(model);
    if (/^gemini-/.test(id)) {
        // Gemini 的 OpenAI 兼容层只认 minimal / low / medium / high，none 仅 2.5 Flash 系列可用
        if (reasoningEffort === 'none') {
            if (/^gemini-2\.5-flash/.test(id)) return 'none';
            return geminiSupportsMinimal(id) ? 'minimal' : 'low';
        }
        return geminiThinkingLevel(id, reasoningEffort);
    }
    const miniMaxMode = getMiniMaxThinkingMode(id);
    if (miniMaxMode === 'effort') return reasoningEffort === 'none' ? 'low' : reasoningEffort;
    // MiniMax-M3 不认 reasoning_effort，关闭思考改发 thinking.disabled
    if (miniMaxMode === 'toggle') return null;
    return reasoningEffort;
}

/** OpenAI 兼容请求的公共参数（与 app/lib/ai-direct.js 直连共用）。 */
export function buildOpenAiCompatibleParams({ model, maxTokens, temperature, topP, reasoningEffort }) {
    const isDeepSeekThinking = isDeepSeekThinkingModel(model);
    const thinkingType = isDeepSeekThinking
        ? (reasoningEffort === 'none' ? 'disabled' : 'enabled')
        : (reasoningEffort === 'none' && getMiniMaxThinkingMode(model) === 'toggle' ? 'disabled' : null);
    const thinkingEnabled = thinkingType === 'enabled';
    const effort = isDeepSeekThinking && reasoningEffort === 'none'
        ? null
        : normalizeOpenAiReasoningEffort(model, reasoningEffort);
    const maxTokensKey = usesMaxCompletionTokens(model) ? 'max_completion_tokens' : 'max_tokens';

    return {
        ...(temperature != null && !thinkingEnabled ? { temperature } : {}),
        ...(topP != null && !thinkingEnabled ? { top_p: topP } : {}),
        ...(maxTokens ? { [maxTokensKey]: maxTokens } : {}),
        ...(thinkingType ? { thinking: { type: thinkingType } } : {}),
        ...(effort ? { reasoning_effort: effort } : {}),
    };
}

// ==================== Claude（Anthropic Messages API）====================

const CLAUDE_EFFORTS_FULL = ['low', 'medium', 'high', 'xhigh', 'max'];
const CLAUDE_EFFORTS_46 = ['low', 'medium', 'high', 'max'];
const CLAUDE_LEGACY_MAX_TOKENS = 8192;
const CLAUDE_DEFAULT_MAX_TOKENS = 32000;
// MiniMax 的思考也计入 max_tokens，默认 max 档想得很久，额度太小只剩思考、没有正文
const MINIMAX_DEFAULT_MAX_TOKENS = 65536;
const CLAUDE_MIN_THINKING_BUDGET = 1024;
const CLAUDE_THINKING_BUDGETS = { low: 2048, medium: 8192, high: 32768, xhigh: 32768, max: 32768 };

/**
 * 解析 Claude 模型名，兼容 claude-opus-5-5、claude-sonnet-4-20250514、claude-3-7-sonnet-…、
 * 以及带 anthropic. / anthropic/ 等前缀的写法。无法识别时返回 null。
 */
export function parseClaudeModel(model) {
    const id = normalizeModelId(model);
    const named = id.match(/claude-(opus|sonnet|haiku|fable|mythos)(?:-(\d+)(?:[-.](\d{1,2}))?(?!\d))?/);
    if (named) {
        const major = named[2] != null ? Number(named[2]) : null;
        const minor = named[3] != null ? Number(named[3]) : 0;
        return { family: named[1], version: major == null ? null : major + minor / 10 };
    }
    const legacy = id.match(/claude-(\d+)(?:-(\d))?-(opus|sonnet|haiku)/);
    if (legacy) return { family: legacy[3], version: Number(legacy[1]) + Number(legacy[2] || 0) / 10 };
    return null;
}

/**
 * 每个模型的请求规则：
 * - thinking：'adaptive'（thinking.type=adaptive + output_config.effort）或 'budget'（budget_tokens）
 * - offMode："关闭思考"的写法 —— omit 不发 / disabled / between_tools / lowEffort（无法关闭，降到 low）
 * - sampling：'none' 不发 temperature/top_p；'single' 两者只发一个；'both' 照旧
 */
export function getClaudeModelRules(model) {
    const miniMaxMode = getMiniMaxThinkingMode(model);
    if (miniMaxMode) {
        // 采样参数 MiniMax 不生效；M3 用 thinking 开关，M3.1-Flash 无法关闭思考，降到 low
        return {
            recognized: true, thinking: 'adaptive', sampling: 'none', summarizeThinking: false, defaultMaxTokens: MINIMAX_DEFAULT_MAX_TOKENS,
            ...(miniMaxMode === 'effort' ? { offMode: 'lowEffort', efforts: CLAUDE_EFFORTS_FULL } : { offMode: 'disabled', efforts: [] }),
        };
    }

    const info = parseClaudeModel(model);
    const legacy = { recognized: false, thinking: 'budget', offMode: 'omit', sampling: 'both', efforts: [], summarizeThinking: false, defaultMaxTokens: CLAUDE_LEGACY_MAX_TOKENS };
    if (!info) return legacy;

    const { family, version } = info;
    const adaptive = (offMode, extra = {}) => ({
        recognized: true, thinking: 'adaptive', offMode, sampling: 'none', efforts: CLAUDE_EFFORTS_FULL,
        summarizeThinking: true, defaultMaxTokens: CLAUDE_DEFAULT_MAX_TOKENS, ...extra,
    });

    // Fable / Mythos：思考始终开启，只能用 effort 调节
    if (family === 'fable' || family === 'mythos') return adaptive('lowEffort');
    if (version == null) return legacy;

    if (family === 'opus') {
        if (version >= 5.5) return adaptive('lowEffort');
        if (version >= 5) return adaptive('disabled');
        if (version >= 4.7) return adaptive('omit');
    }
    if (family === 'sonnet') {
        if (version >= 5.5) return adaptive('between_tools');
        if (version >= 5) return adaptive('disabled');
    }
    if (family === 'haiku' && version >= 5) return adaptive('disabled');
    if ((family === 'opus' || family === 'sonnet') && version >= 4.6) {
        return adaptive('omit', { sampling: 'single', efforts: CLAUDE_EFFORTS_46, summarizeThinking: false });
    }
    // Haiku 4.5、Sonnet 4.5 及更早：继续用 budget_tokens
    return {
        recognized: true, thinking: 'budget', offMode: 'omit', sampling: version >= 4 ? 'single' : 'both',
        efforts: [], summarizeThinking: false, defaultMaxTokens: version >= 4 ? CLAUDE_DEFAULT_MAX_TOKENS : CLAUDE_LEGACY_MAX_TOKENS,
    };
}

function clampClaudeEffort(efforts, reasoningEffort) {
    if (efforts.includes(reasoningEffort)) return reasoningEffort;
    const order = CLAUDE_EFFORTS_FULL;
    for (let i = order.indexOf(reasoningEffort) - 1; i >= 0; i -= 1) {
        if (efforts.includes(order[i])) return order[i];
    }
    return efforts[0] || null;
}

/**
 * 拼装 Messages API 的 max_tokens / temperature / top_p / thinking / output_config。
 * 新一代模型（Opus 5.5、Sonnet 5.5、Haiku 5.5 等）不接受 budget_tokens 和采样参数，
 * 老模型（Haiku 4.5 及更早）和无法识别的兼容模型继续走 budget_tokens。
 */
export function buildClaudeRequestParams({ model, maxTokens, temperature, topP, reasoningEffort }) {
    const rules = getClaudeModelRules(model);
    const max_tokens = Number(maxTokens) > 0 ? Number(maxTokens) : rules.defaultMaxTokens;
    const params = { max_tokens };
    let thinkingOn = false;

    if (rules.thinking === 'adaptive') {
        if (reasoningEffort === 'none') {
            if (rules.offMode === 'disabled') params.thinking = { type: 'disabled' };
            else if (rules.offMode === 'between_tools') params.thinking = { type: 'between_tools' };
            else if (rules.offMode === 'lowEffort') params.output_config = { effort: clampClaudeEffort(rules.efforts, 'low') };
        } else if (isEffortOn(reasoningEffort)) {
            params.thinking = rules.summarizeThinking ? { type: 'adaptive', display: 'summarized' } : { type: 'adaptive' };
            const effort = clampClaudeEffort(rules.efforts, reasoningEffort);
            if (effort) params.output_config = { effort };
            thinkingOn = true;
        }
    } else if (isEffortOn(reasoningEffort)) {
        // budget_tokens 必须小于 max_tokens：至少给正文留一半
        const budget = Math.min(CLAUDE_THINKING_BUDGETS[reasoningEffort], Math.floor(max_tokens / 2));
        if (budget >= CLAUDE_MIN_THINKING_BUDGET) {
            params.thinking = { type: 'enabled', budget_tokens: budget };
            thinkingOn = true;
        }
    }

    if (rules.sampling !== 'none') {
        // 开启思考时不能改 temperature，top_p 只能在 0.95–1 之间
        const sendTemperature = temperature != null && !thinkingOn;
        const sendTopP = topP != null && (!thinkingOn || topP >= 0.95)
            && !(rules.sampling === 'single' && sendTemperature);
        if (sendTemperature) params.temperature = temperature;
        if (sendTopP) params.top_p = topP;
    }

    return params;
}
