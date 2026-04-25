import { NextResponse } from 'next/server';
import { proxyFetch } from '../../lib/proxy-fetch';
import { rotateKey } from '../../lib/keyRotator';

export const runtime = 'nodejs';

// ==================== API 余额查询 ====================
// 三层瀑布策略：
// 1. 通用计费接口（NewAPI/OneAPI/大部分中转）
// 2. 供应商专用接口（DeepSeek/SiliconFlow/OpenRouter/Moonshot）
// 3. 都失败 → 返回 unsupported

export async function POST(request) {
    try {
        let { provider, apiKey, baseUrl, proxyUrl } = await request.json();
        apiKey = rotateKey(apiKey);
        if (!apiKey) {
            return NextResponse.json({ error: '未配置 API Key' }, { status: 400 });
        }

        const effectiveBaseUrl = (baseUrl || '').replace(/\/+$/, '');

        // 有专用接口的已知供应商列表
        const knownProviders = ['deepseek', 'siliconflow', 'openrouter', 'moonshot'];
        const isKnown = knownProviders.includes(provider);

        if (isKnown) {
            // 已知供应商：专用接口优先（避免通用接口返回错误数据）
            const providerResult = await tryProviderSpecific(provider, effectiveBaseUrl, apiKey, proxyUrl);
            if (providerResult) return NextResponse.json(providerResult);
        }

        // 通用接口：/dashboard/billing/subscription + /dashboard/billing/usage
        // 覆盖 NewAPI / OneAPI / ChatGPT-Next-Web 等中转
        const universalResult = await tryUniversalBilling(effectiveBaseUrl, apiKey, proxyUrl);
        if (universalResult) return NextResponse.json(universalResult);

        // 未知供应商 + 自定义：尝试所有专用接口
        if (!isKnown) {
            const providerResult = await tryProviderSpecific(provider, effectiveBaseUrl, apiKey, proxyUrl);
            if (providerResult) return NextResponse.json(providerResult);
        }

        // 都失败
        return NextResponse.json({
            supported: false,
            message: '当前供应商不支持余额查询',
        });
    } catch (error) {
        console.error('Balance query error:', error);
        return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
    }
}

// ==================== 1. 通用 NewAPI/OneAPI 计费接口 ====================

async function tryUniversalBilling(baseUrl, apiKey, proxyUrl) {
    if (!baseUrl) return null;

    // 去掉可能的 /v1 后缀，因为 billing 接口在根路径下
    const root = baseUrl.replace(/\/v1\/?$/, '');

    try {
        const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

        // 并行请求 subscription 和 usage
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

        const [subRes, usageRes] = await Promise.all([
            fetchWithTimeout(`${root}/dashboard/billing/subscription`, { headers }, 8000, proxyUrl),
            fetchWithTimeout(`${root}/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`, { headers }, 8000, proxyUrl),
        ]);

        if (!subRes.ok && !usageRes.ok) return null;

        let totalBalance = null;
        let usedAmount = null;
        let hardLimit = null;
        let currency = 'USD';

        if (subRes.ok) {
            const sub = await readJsonSafely(subRes);
            if (!sub) return null;
            hardLimit = sub.hard_limit_usd ?? sub.system_hard_limit_usd ?? null;
            // 有些中转直接返回 soft_limit_usd 作为余额
            if (hardLimit === null) hardLimit = sub.soft_limit_usd ?? null;
        }

        if (usageRes.ok) {
            const usage = await readJsonSafely(usageRes);
            if (!usage) return null;
            // total_usage 通常以美分为单位
            usedAmount = usage.total_usage != null ? usage.total_usage / 100 : null;
        }

        if (hardLimit != null) {
            totalBalance = usedAmount != null ? hardLimit - usedAmount : hardLimit;
            return {
                supported: true,
                source: 'universal',
                balance: round(totalBalance),
                currency,
                detail: {
                    total_limit: round(hardLimit),
                    used: usedAmount != null ? round(usedAmount) : null,
                    remaining: round(totalBalance),
                },
            };
        }

        return null;
    } catch {
        return null;
    }
}

// ==================== 2. 供应商专用接口 ====================

async function tryProviderSpecific(provider, baseUrl, apiKey, proxyUrl) {
    const handlers = {
        deepseek: tryDeepSeek,
        siliconflow: trySiliconFlow,
        openrouter: tryOpenRouter,
        moonshot: tryMoonshot,
    };

    // 根据已知供应商直接尝试
    const handler = handlers[provider];
    if (handler) {
        const result = await handler(baseUrl, apiKey, proxyUrl);
        if (result) return result;
    }

    // 对于自定义供应商，尝试所有已知的接口模式
    if (provider === 'custom' || provider === 'custom-gemini' || provider === 'custom-claude') {
        for (const fn of Object.values(handlers)) {
            const result = await fn(baseUrl, apiKey, proxyUrl);
            if (result) return result;
        }
    }

    return null;
}

// --- DeepSeek ---
async function tryDeepSeek(baseUrl, apiKey, proxyUrl) {
    try {
        const root = (baseUrl || 'https://api.deepseek.com/v1').replace(/\/v1\/?$/, '');
        const res = await fetchWithTimeout(`${root}/user/balance`, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        }, 8000, proxyUrl);
        if (!res.ok) return null;
        const data = await readJsonSafely(res);
        if (!data) return null;
        if (!data.balance_infos && !data.is_available) return null;

        const info = data.balance_infos?.[0] || {};
        return {
            supported: true,
            source: 'deepseek',
            balance: parseFloat(info.total_balance || 0),
            currency: info.currency || 'CNY',
            detail: {
                total: parseFloat(info.total_balance || 0),
                granted: parseFloat(info.granted_balance || 0),
                topped_up: parseFloat(info.topped_up_balance || 0),
            },
        };
    } catch {
        return null;
    }
}

// --- SiliconFlow ---
async function trySiliconFlow(baseUrl, apiKey, proxyUrl) {
    try {
        const root = (baseUrl || 'https://api.siliconflow.cn/v1').replace(/\/v1\/?$/, '');
        const res = await fetchWithTimeout(`${root}/v1/user/info`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        }, 8000, proxyUrl);
        if (!res.ok) return null;
        const data = await readJsonSafely(res);
        if (!data) return null;
        const d = data.data || data;
        if (d.balance == null && d.totalBalance == null) return null;

        return {
            supported: true,
            source: 'siliconflow',
            balance: parseFloat(d.balance || 0),
            currency: 'CNY',
            detail: {
                balance: parseFloat(d.balance || 0),
                charge_balance: parseFloat(d.chargeBalance || 0),
                total_balance: parseFloat(d.totalBalance || 0),
            },
        };
    } catch {
        return null;
    }
}

// --- OpenRouter ---
async function tryOpenRouter(baseUrl, apiKey, proxyUrl) {
    try {
        const res = await fetchWithTimeout('https://openrouter.ai/api/v1/credits', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        }, 8000, proxyUrl);
        if (!res.ok) return null;
        const data = await readJsonSafely(res);
        if (!data) return null;
        const d = data.data || data;
        if (d.total_credits == null && d.balance == null) return null;

        const balance = d.balance ?? (d.total_credits - (d.total_usage || 0));
        return {
            supported: true,
            source: 'openrouter',
            balance: round(balance),
            currency: 'USD',
            detail: {
                total_credits: d.total_credits,
                total_usage: d.total_usage,
                remaining: round(balance),
            },
        };
    } catch {
        return null;
    }
}

// --- Moonshot ---
async function tryMoonshot(baseUrl, apiKey, proxyUrl) {
    try {
        const root = (baseUrl || 'https://api.moonshot.cn/v1').replace(/\/v1\/?$/, '');
        const res = await fetchWithTimeout(`${root}/v1/users/me/balance`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        }, 8000, proxyUrl);
        if (!res.ok) return null;
        const data = await readJsonSafely(res);
        if (!data) return null;
        const d = data.data || data;
        if (d.available_balance == null && d.balance == null && d.cash_balance == null) return null;

        const balance = d.available_balance ?? d.balance ?? d.cash_balance ?? 0;
        return {
            supported: true,
            source: 'moonshot',
            balance: parseFloat(balance),
            currency: 'CNY',
            detail: {
                available: parseFloat(d.available_balance || d.balance || 0),
                voucher: parseFloat(d.voucher_balance || 0),
                cash: parseFloat(d.cash_balance || 0),
            },
        };
    } catch {
        return null;
    }
}

// ==================== 工具函数 ====================

function round(n) {
    return Math.round(n * 100) / 100;
}

async function readJsonSafely(res) {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function fetchWithTimeout(url, options, timeoutMs = 8000, proxyUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await proxyFetch(url, { ...options, signal: controller.signal }, proxyUrl);
        return res;
    } finally {
        clearTimeout(timer);
    }
}
