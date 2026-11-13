// 外部搜索（Function Calling）配置在发请求前的整理。
//
// searchConfig 存在本地 API 配置里，所有以 apiKey 结尾的字段按 api-secret-storage 的规则
// 单独加密保存，不同步、不随项目导出。Tavily / Exa 共用 apiKey、baseUrl；DeepSeek 搜索
// 用自己的 deepseekApiKey、deepseekBaseUrl，选中时预填已配置的 DeepSeek 服务商 Key 和地址，
// 用户可以改；留空时发请求前再取一次已配置的 DeepSeek 服务商。DeepSeek 搜索还可以让 AI
// 读取网页全文（deepseekReadWebpage，默认开启），以及看完搜索结果再挑网页读（deepseekReadAfterSearch，默认关闭）。

import { isDeepSeekPresetConfig } from './ai-provider-compat.js';
import { supportsDeepSeekWebTools } from './ai-model-rules.js';

export const SEARCH_TOOLS = ['tavily', 'exa', 'deepseek'];
export const DEFAULT_SEARCH_TOOL = 'tavily';
export const SEARCH_TOOL_LABELS = { tavily: 'Tavily', exa: 'Exa', deepseek: 'DeepSeek' };
// 设置面板"点此获取"链接：各搜索工具申请 API Key 的页面
export const SEARCH_TOOL_KEY_PAGES = {
    tavily: 'https://tavily.com',
    exa: 'https://exa.ai',
    deepseek: 'https://platform.deepseek.com/api_keys',
};

// 与 SettingsPanel PROVIDERS 里 DeepSeek 的默认地址一致；服务端路由不内置这个地址。
export const DEEPSEEK_SEARCH_DEFAULT_BASE_URL = 'https://api.deepseek.com';

export function getSearchTool(searchConfig) {
    const tool = searchConfig?.tool || searchConfig?.provider;
    return SEARCH_TOOLS.includes(tool) ? tool : DEFAULT_SEARCH_TOOL;
}

function trimmed(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * 找已配置好 Key 的 DeepSeek 服务商：当前选中的是 DeepSeek 就用它（顶层字段是最新值），
 * 否则按 providerConfigs 里的顺序找第一个 DeepSeek 预设或实例。依次查看传入的每份配置。
 */
export function findConfiguredDeepSeekApi(...apiConfigs) {
    for (const config of apiConfigs) {
        if (config && isDeepSeekPresetConfig(config) && trimmed(config.apiKey)) {
            return { apiKey: trimmed(config.apiKey), baseUrl: trimmed(config.baseUrl) };
        }
    }
    for (const config of apiConfigs) {
        for (const [key, entry] of Object.entries(config?.providerConfigs || {})) {
            if (!trimmed(entry?.apiKey)) continue;
            if (isDeepSeekPresetConfig({ provider: key, providerType: entry.providerType })) {
                return { apiKey: trimmed(entry.apiKey), baseUrl: trimmed(entry.baseUrl) };
            }
        }
    }
    return null;
}

/** 选中 DeepSeek 搜索时要预填的字段：只填空着的，已有的值（包括用户改过的）不动。 */
export function deepSeekSearchPrefill(searchConfig, configured) {
    const patch = {};
    if (!trimmed(searchConfig?.deepseekApiKey) && configured?.apiKey) patch.deepseekApiKey = configured.apiKey;
    if (!trimmed(searchConfig?.deepseekBaseUrl)) patch.deepseekBaseUrl = configured?.baseUrl || DEEPSEEK_SEARCH_DEFAULT_BASE_URL;
    return patch;
}

/**
 * 返回随请求发给服务端的 searchConfig；没有可用的 Key 时返回 null（调用方提示用户去设置）。
 * Tavily / Exa 保持原样传递，地址留空时由服务端使用各自默认地址。
 * fallbackConfigs 是额外查找已配置 DeepSeek 服务商的配置（例如对话单独配置服务商时的主配置）。
 */
export function resolveFunctionSearchConfig(apiConfig, ...fallbackConfigs) {
    const searchConfig = apiConfig?.searchConfig || {};
    const tool = getSearchTool(searchConfig);
    if (tool !== 'deepseek') {
        return searchConfig.apiKey ? { ...searchConfig, tool, provider: tool } : null;
    }

    const configured = findConfiguredDeepSeekApi(apiConfig, ...fallbackConfigs);
    const apiKey = trimmed(searchConfig.deepseekApiKey) || configured?.apiKey || '';
    if (!apiKey) return null;
    const baseUrl = trimmed(searchConfig.deepseekBaseUrl) || configured?.baseUrl || DEEPSEEK_SEARCH_DEFAULT_BASE_URL;
    const readWebpage = isDeepSeekReadWebpageEnabled(searchConfig);
    return { tool, provider: tool, apiKey, baseUrl, readWebpage, readAfterSearch: readWebpage && isDeepSeekReadAfterSearchEnabled(searchConfig) };
}

/**
 * 当前对话用 DeepSeek 内置联网时返回 { readUrl }，否则返回 null（调用方继续走原来的搜索方式）。
 * 条件：DeepSeek 预设、模型支持内置工具、搜索方式不是"外部搜索"。读网页沿用 deepseekReadWebpage 开关。
 */
export function resolveDeepSeekWebTools(apiConfig) {
    if (!apiConfig || !isDeepSeekPresetConfig(apiConfig)) return null;
    if (apiConfig.tools?.searchMode === 'external') return null;
    if (!supportsDeepSeekWebTools(apiConfig.model)) return null;
    return { readUrl: isDeepSeekReadWebpageEnabled(apiConfig.searchConfig) };
}

/** DeepSeek 搜索时是否同时让 AI 读取网页全文（默认开启，设置面板可关）。 */
export function isDeepSeekReadWebpageEnabled(searchConfig) {
    return searchConfig?.deepseekReadWebpage !== false;
}

/** 是否让 AI 看完搜索结果后再挑网页读全文（默认关闭：回答更慢，且只能读搜索结果里的网址）。 */
export function isDeepSeekReadAfterSearchEnabled(searchConfig) {
    return searchConfig?.deepseekReadAfterSearch === true;
}
