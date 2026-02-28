// Token 使用统计模块 — 记录每次 AI 请求的 token 用量、速度，并计算消耗预估

const STORAGE_KEY = 'author-token-stats';

/**
 * 读取所有记录
 */
export function getTokenRecords() {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data.records) ? data.records : [];
    } catch {
        return [];
    }
}

/**
 * 添加一条 token 使用记录
 * @param {{
 *   promptTokens: number,
 *   completionTokens: number,
 *   totalTokens: number,
 *   durationMs: number,
 *   source: 'chat' | 'inline',
 *   provider?: string,
 *   model?: string
 * }} record
 */
export function addTokenRecord(record) {
    if (typeof window === 'undefined') return;
    const records = getTokenRecords();
    records.push({
        timestamp: Date.now(),
        promptTokens: record.promptTokens || 0,
        completionTokens: record.completionTokens || 0,
        totalTokens: record.totalTokens || 0,
        durationMs: record.durationMs || 0,
        source: record.source || 'chat',
        provider: record.provider || 'unknown',
        model: record.model || 'unknown',
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records }));
}

/**
 * 清空所有统计数据
 */
export function clearTokenStats() {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records: [] }));
}

/**
 * 计算汇总统计
 * @returns {{
 *   totalRequests: number,
 *   totalTokens: number,
 *   totalPromptTokens: number,
 *   totalCompletionTokens: number,
 *   avgSpeed: number,
 *   recentSpeeds: {speed: number, tokens: number, timestamp: number}[],
 *   projections: {
 *     perDay: {tokens: number, requests: number},
 *     perWeek: {tokens: number, requests: number},
 *     perMonth: {tokens: number, requests: number},
 *     perQuarter: {tokens: number, requests: number},
 *     perYear: {tokens: number, requests: number}
 *   },
 *   firstRecordTime: number | null,
 *   trackedDays: number
 * }}
 */
export function getTokenStats() {
    const records = getTokenRecords();

    if (records.length === 0) {
        return {
            totalRequests: 0,
            totalTokens: 0,
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            avgSpeed: 0,
            rates: { tps: 0, tpm: 0, tph: 0, tpd: 0, rpm: 0, rph: 0, rpd: 0 },
            recentSpeeds: [],
            projections: {
                perDay: { tokens: 0, requests: 0 },
                perWeek: { tokens: 0, requests: 0 },
                perMonth: { tokens: 0, requests: 0 },
                perQuarter: { tokens: 0, requests: 0 },
                perYear: { tokens: 0, requests: 0 },
            },
            modelBreakdown: [],
            firstRecordTime: null,
            trackedDays: 0,
        };
    }

    const totalRequests = records.length;
    const totalTokens = records.reduce((s, r) => s + r.totalTokens, 0);
    const totalPromptTokens = records.reduce((s, r) => s + r.promptTokens, 0);
    const totalCompletionTokens = records.reduce((s, r) => s + r.completionTokens, 0);

    // 平均速度（tokens/s）：用 completionTokens / durationMs
    const validSpeedRecords = records.filter(r => r.durationMs > 0 && r.completionTokens > 0);
    const avgSpeed = validSpeedRecords.length > 0
        ? validSpeedRecords.reduce((s, r) => s + (r.completionTokens / r.durationMs * 1000), 0) / validSpeedRecords.length
        : 0;

    // 最近 10 次请求速度
    const recentSpeeds = validSpeedRecords.slice(-10).map(r => ({
        speed: r.completionTokens / r.durationMs * 1000,
        tokens: r.completionTokens,
        timestamp: r.timestamp,
    }));

    // 时间跨度计算
    const firstRecordTime = records[0].timestamp;
    const now = Date.now();
    const trackedMs = now - firstRecordTime;
    const trackedMinutes = Math.max(1, trackedMs / (60 * 1000));
    const trackedHours = Math.max(1 / 60, trackedMs / (60 * 60 * 1000));
    const trackedDays = Math.max(1 / 24, trackedMs / (24 * 60 * 60 * 1000));

    // 消耗速率（基于实际统计时间）
    const rates = {
        tps: avgSpeed, // tokens per second（生成速度，已有）
        tpm: totalTokens / trackedMinutes,
        tph: totalTokens / trackedHours,
        tpd: totalTokens / trackedDays,
        rpm: totalRequests / trackedMinutes,
        rph: totalRequests / trackedHours,
        rpd: totalRequests / trackedDays,
    };

    // 消耗预估：基于日均值
    const dailyTokens = totalTokens / Math.max(1, trackedDays);
    const dailyRequests = totalRequests / Math.max(1, trackedDays);

    const projections = {
        perDay: { tokens: Math.round(dailyTokens), requests: Math.round(dailyRequests * 10) / 10 },
        perWeek: { tokens: Math.round(dailyTokens * 7), requests: Math.round(dailyRequests * 7 * 10) / 10 },
        perMonth: { tokens: Math.round(dailyTokens * 30), requests: Math.round(dailyRequests * 30 * 10) / 10 },
        perQuarter: { tokens: Math.round(dailyTokens * 90), requests: Math.round(dailyRequests * 90 * 10) / 10 },
        perYear: { tokens: Math.round(dailyTokens * 365), requests: Math.round(dailyRequests * 365 * 10) / 10 },
    };

    // 按 provider + model 分组统计
    const modelMap = {};
    for (const r of records) {
        const key = `${r.provider || 'unknown'}||${r.model || 'unknown'}`;
        if (!modelMap[key]) {
            modelMap[key] = { provider: r.provider || 'unknown', model: r.model || 'unknown', tokens: 0, promptTokens: 0, completionTokens: 0, requests: 0, totalDurationMs: 0, validSpeedCount: 0, speedSum: 0 };
        }
        const m = modelMap[key];
        m.tokens += r.totalTokens;
        m.promptTokens += r.promptTokens;
        m.completionTokens += r.completionTokens;
        m.requests += 1;
        if (r.durationMs > 0 && r.completionTokens > 0) {
            m.speedSum += r.completionTokens / r.durationMs * 1000;
            m.validSpeedCount += 1;
        }
    }
    const modelBreakdown = Object.values(modelMap).map(m => ({
        provider: m.provider,
        model: m.model,
        tokens: m.tokens,
        promptTokens: m.promptTokens,
        completionTokens: m.completionTokens,
        requests: m.requests,
        avgSpeed: m.validSpeedCount > 0 ? m.speedSum / m.validSpeedCount : 0,
        tokenPercent: totalTokens > 0 ? Math.round(m.tokens / totalTokens * 1000) / 10 : 0,
    })).sort((a, b) => b.tokens - a.tokens);

    return {
        totalRequests,
        totalTokens,
        totalPromptTokens,
        totalCompletionTokens,
        avgSpeed,
        rates,
        recentSpeeds,
        projections,
        modelBreakdown,
        firstRecordTime,
        trackedDays: trackedDays < 1 ? '< 1' : Math.round(trackedDays * 10) / 10,
    };
}
