const LEGACY_PROVIDER_MAP = {
    // gemini-native 保持独立（走原生通道），不再并入 gemini 兼容
    'custom-gemini': 'custom',
    'openai-responses': 'openai',
    'custom-claude': 'claude',
};

const FOREIGN_COMPATIBLE_PROVIDER_TYPES = new Set([
    'openai', 'claude', 'gemini', 'groq', 'mistral', 'cohere', 'together',
    'perplexity', 'xai', 'cerebras', 'github', 'openrouter',
]);

const LEGACY_FOREIGN_DIRECT_BASE_URLS = new Set([
    'https://api.openai.com/v1',
    'https://api.anthropic.com',
    'https://api.anthropic.com/v1',
    'https://generativelanguage.googleapis.com/v1beta',
    'https://generativelanguage.googleapis.com/v1beta/openai',
    'https://api.groq.com/openai/v1',
    'https://api.mistral.ai/v1',
    'https://api.cohere.com/v2',
    'https://api.together.xyz/v1',
    'https://api.perplexity.ai',
    'https://api.x.ai/v1',
    'https://api.cerebras.ai/v1',
    'https://models.inference.ai.azure.com',
    'https://openrouter.ai/api/v1',
]);

function scrubForeignDirectBaseUrl(providerType, value) {
    const baseUrl = String(value || '').trim();
    const normalized = baseUrl.replace(/\/+$/, '').toLowerCase();
    if (FOREIGN_COMPATIBLE_PROVIDER_TYPES.has(providerType) && LEGACY_FOREIGN_DIRECT_BASE_URLS.has(normalized)) {
        return '';
    }
    return baseUrl;
}

function compatibleGeminiBaseUrl(value) {
    const baseUrl = String(value || '').trim().replace(/\/+$/, '');
    if (!baseUrl) return '';
    if (/generativelanguage\.googleapis\.com\/v1beta$/i.test(baseUrl)) {
        return `${baseUrl}/openai`;
    }
    return baseUrl;
}

export function normalizeCompatibleProviderType(providerType) {
    return LEGACY_PROVIDER_MAP[providerType] || providerType || '';
}

function isDeepSeekProviderKey(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    return normalized === 'deepseek' || /^deepseek_[a-z0-9]+$/.test(normalized);
}

/**
 * DeepSeek 预设始终使用 OpenAI 兼容协议。
 * provider 是用户当前选中的预设/实例 key，应优先于旧版本可能残留的 providerType。
 */
export function isDeepSeekPresetConfig(apiConfig) {
    return isDeepSeekProviderKey(apiConfig?.provider)
        || normalizeCompatibleProviderType(apiConfig?.providerType) === 'deepseek';
}

function migrateProviderEntry(entry, oldType) {
    if (!entry || typeof entry !== 'object') return false;
    const nextType = normalizeCompatibleProviderType(oldType);
    let changed = false;

    if (entry.providerType !== nextType) {
        entry.providerType = nextType;
        changed = true;
    }

    const migratedBaseUrl = ['custom-gemini'].includes(oldType)
        ? compatibleGeminiBaseUrl(entry.baseUrl)
        : String(entry.baseUrl || '');
    const nextBaseUrl = scrubForeignDirectBaseUrl(nextType, migratedBaseUrl);
    if (nextBaseUrl !== String(entry.baseUrl || '')) {
        entry.baseUrl = nextBaseUrl;
        changed = true;
    }

    if (nextType === 'claude') {
        if (entry.apiFormat !== 'anthropic') {
            entry.apiFormat = 'anthropic';
            changed = true;
        }
    } else if (nextType === 'deepseek' && entry.apiFormat) {
        // DeepSeek 预设没有格式切换；清理旧版本错误遗留的 Anthropic 标记。
        delete entry.apiFormat;
        changed = true;
    } else if (['gemini-native', 'custom-gemini', 'openai-responses'].includes(oldType) && entry.apiFormat) {
        delete entry.apiFormat;
        changed = true;
    }

    return changed;
}

function migrateProviderConfigs(apiConfig) {
    const configs = apiConfig?.providerConfigs;
    if (!configs || typeof configs !== 'object') return false;
    let changed = false;

    for (const [key, entry] of Object.entries({ ...configs })) {
        if (!entry || typeof entry !== 'object') continue;
        // 配置表的 key 才是用户选择的预设/实例；例如 deepseek 项中残留
        // providerType=claude 时，不能继续把真实聊天路由到 /v1/messages。
        const oldType = isDeepSeekProviderKey(key) ? 'deepseek' : (entry.providerType || key);
        const nextType = normalizeCompatibleProviderType(oldType);
        if (migrateProviderEntry(entry, oldType)) changed = true;

        if (!LEGACY_PROVIDER_MAP[key]) continue;
        if (!configs[nextType]) {
            configs[nextType] = entry;
            delete configs[key];
            if (apiConfig.provider === key) apiConfig.provider = nextType;
            changed = true;
        } else {
            entry.instanceName ||= '迁移的兼容端点';
        }
    }

    return changed;
}

function migrateEmbedProviderConfigs(apiConfig) {
    const configs = apiConfig?.embedProviderConfigs;
    if (!configs || typeof configs !== 'object') return false;
    let changed = false;

    for (const [key, entry] of Object.entries({ ...configs })) {
        if (!entry || typeof entry !== 'object') continue;
        const nextType = key === 'custom-claude' ? 'custom' : normalizeCompatibleProviderType(key);
        const migratedBaseUrl = ['custom-gemini'].includes(key)
            ? compatibleGeminiBaseUrl(entry.baseUrl)
            : entry.baseUrl;
        const nextBaseUrl = scrubForeignDirectBaseUrl(nextType, migratedBaseUrl);

        if (nextType === key) {
            if (nextBaseUrl !== String(entry.baseUrl || '')) {
                entry.baseUrl = nextBaseUrl;
                changed = true;
            }
            continue;
        }

        const nextEntry = { ...entry, baseUrl: nextBaseUrl };
        if (!configs[nextType]) configs[nextType] = nextEntry;
        delete configs[key];
        if (apiConfig.embedProvider === key) apiConfig.embedProvider = nextType;
        changed = true;
    }

    return changed;
}

export function migrateApiConfigToCompatible(apiConfig) {
    if (!apiConfig || typeof apiConfig !== 'object') return false;
    let changed = migrateProviderConfigs(apiConfig);
    const oldType = isDeepSeekProviderKey(apiConfig.provider)
        ? 'deepseek'
        : (apiConfig.providerType || apiConfig.provider || '');
    const nextType = normalizeCompatibleProviderType(oldType);

    if (apiConfig.provider && LEGACY_PROVIDER_MAP[apiConfig.provider] && !apiConfig.providerConfigs?.[apiConfig.provider]) {
        apiConfig.provider = normalizeCompatibleProviderType(apiConfig.provider);
        changed = true;
    }
    if (apiConfig.providerType !== nextType) {
        apiConfig.providerType = nextType;
        changed = true;
    }

    const migratedBaseUrl = ['custom-gemini'].includes(oldType)
        ? compatibleGeminiBaseUrl(apiConfig.baseUrl)
        : apiConfig.baseUrl;
    const nextBaseUrl = scrubForeignDirectBaseUrl(nextType, migratedBaseUrl);
    if (nextBaseUrl !== String(apiConfig.baseUrl || '')) {
        apiConfig.baseUrl = nextBaseUrl;
        changed = true;
    }

    if (nextType === 'claude') {
        if (apiConfig.apiFormat !== 'anthropic') {
            apiConfig.apiFormat = 'anthropic';
            changed = true;
        }
    } else if (nextType === 'deepseek' && apiConfig.apiFormat) {
        delete apiConfig.apiFormat;
        changed = true;
    } else if (['gemini-native', 'custom-gemini', 'openai-responses'].includes(oldType) && apiConfig.apiFormat) {
        delete apiConfig.apiFormat;
        changed = true;
    }

    const oldEmbedProvider = apiConfig.embedProvider || '';
    const nextEmbedProvider = oldEmbedProvider === 'custom-claude'
        ? 'custom'
        : normalizeCompatibleProviderType(oldEmbedProvider);
    const migratedEmbedBaseUrl = ['custom-gemini'].includes(oldEmbedProvider)
        ? compatibleGeminiBaseUrl(apiConfig.embedBaseUrl)
        : apiConfig.embedBaseUrl;
    const nextEmbedBaseUrl = scrubForeignDirectBaseUrl(nextEmbedProvider, migratedEmbedBaseUrl);
    if (nextEmbedProvider !== oldEmbedProvider) {
        apiConfig.embedProvider = nextEmbedProvider;
        changed = true;
    }
    if (nextEmbedBaseUrl !== String(apiConfig.embedBaseUrl || '')) {
        apiConfig.embedBaseUrl = nextEmbedBaseUrl;
        changed = true;
    }
    if (migrateEmbedProviderConfigs(apiConfig)) changed = true;

    return changed;
}

export function resolveAiEndpoint(apiConfig) {
    // 当前选中 DeepSeek 预设时，provider 比旧 providerType/apiFormat 更可信。
    // 否则测试连接会走 /chat/completions，而真实聊天会误走 /v1/messages 并返回 404。
    if (isDeepSeekPresetConfig(apiConfig)) return '/api/ai';
    const providerType = normalizeCompatibleProviderType(apiConfig?.providerType || apiConfig?.provider);
    if (providerType === 'gemini-native') return '/api/ai/gemini';
    if (providerType === 'claude' || apiConfig?.apiFormat === 'anthropic') return '/api/ai/claude';
    return '/api/ai';
}
