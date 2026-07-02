'use client';

// ==================== 自建服务器（Author Cloud）同步层 ====================
// 与 firestore-sync.js 平级、触发机制一致（变动防抖 5 分钟、空闲 5 分钟停、手动、
// 首次登录强制同步），但后端是"按条目增量"的 Author Cloud（/api/free/sync/push|pull）。
//
// 本地按 key 存数组（章节/设定/记忆组）；本模块把变化的数组"拆成条目"只推改动/新增/
// 删除的条目，拉取时把云端条目"重组"回数组合并进本地。拆分/合并的纯逻辑在
// custom-sync-core.js（可单元测试），这里只负责定时器 / 网络 / localStorage 状态。
//
// 数据安全铁律见 custom-sync-core.js 顶部说明。

import { isSyncableKey } from './sync-key-policy';
import { authorizedFetch, isCustomSignedIn } from './custom-auth';
import { fingerprint, parseKey, itemToKey, diffKeyToItems, mergeItemsIntoLocal } from './custom-sync-core';

// ==================== 配置 ====================

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 分钟
const IDLE_TIMEOUT = 5 * 60 * 1000;  // 5 分钟无变化后停止自动同步
const PUSH_BATCH = 100;              // 单次 push 的条目数（配合后端 ~1MB 请求体上限）
const PULL_LIMIT = 200;
const SYNC_STATE_KEY = 'author-cloud-sync-state'; // 本地增量状态，绝不上云

// ==================== 状态 & 队列 ====================

const _pendingKeys = new Set(); // 变化的 key（待拆分对账）
let _syncTimer = null;
let _idleTimer = null;
let _isSyncing = false;
let _firstSyncAfterLogin = true;
let _localGet = null;           // 由 persistence 注入，避免循环依赖
let _localSet = null;

let _syncStatusCallback = null;
export function onCustomSyncStatusChange(cb) { _syncStatusCallback = cb; }
function notifyStatus(status) {
    if (_syncStatusCallback) _syncStatusCallback({ ...status, keys: Array.from(_pendingKeys) });
}

// persistence 层注入本地读写函数
export function bindLocalIO(localGet, localSet) { _localGet = localGet; _localSet = localSet; }

// ==================== 增量状态 ====================
// { cursor: <server_seq>, keys: { [key]: { [itemId]: { hash } | { deleted:true } } } }

function loadState() {
    if (typeof window === 'undefined') return { cursor: 0, keys: {} };
    try {
        const s = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null');
        if (s && typeof s === 'object') return { cursor: Number(s.cursor) || 0, keys: s.keys || {} };
    } catch {}
    return { cursor: 0, keys: {} };
}
function saveState() {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(_state)); } catch {}
}
let _state = loadState();

// 退出/切换账号时清空增量状态（换用户后不能沿用旧游标/指纹）
export function resetSyncState() {
    _state = { cursor: 0, keys: {} };
    saveState();
}

// 把某 key 的增量状态推进到"与云端一致"（pull 应用后调用）
function commitPulledState(key, items) {
    const cur = _state.keys[key] || {};
    for (const it of items) {
        const id = String(it.itemId);
        if (it.deleted) cur[id] = { deleted: true };
        else cur[id] = { hash: fingerprint(it.value) };
    }
    _state.keys[key] = cur;
}

// ==================== 触发机制（复刻 firestore-sync） ====================

export function customEnqueue(key) {
    if (!isCustomSignedIn() || !isSyncableKey(key)) return;
    _pendingKeys.add(key); // 值稍后由 _localGet 现取，保证推的是最新
    notifyStatus({ pending: _pendingKeys.size });
    ensureSyncTimer();
    resetIdleTimer();
}

export function customDel(key) {
    if (!isCustomSignedIn() || !isSyncableKey(key)) return;
    // 删除整个 key：入队，flush 时取到 undefined → diff 产出该 key 全部 tombstone
    _pendingKeys.add(key);
    ensureSyncTimer();
    resetIdleTimer();
}

function ensureSyncTimer() {
    if (!_syncTimer) _syncTimer = setInterval(() => { flushSync().catch(() => {}); }, SYNC_INTERVAL);
}
function clearSyncTimer() {
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
}
function resetIdleTimer() {
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
        flushSync().then(() => {
            clearSyncTimer();
            notifyStatus({ syncing: false, pending: _pendingKeys.size, lastSync: Date.now(), idle: true });
        }).catch(() => {});
    }, IDLE_TIMEOUT);
}

// ==================== push（增量） ====================

export async function flushSync(options = {}) {
    const { throwOnError = false } = options;
    if (!isCustomSignedIn() || !_localGet) return;
    if (_isSyncing) return;

    if (_firstSyncAfterLogin) _firstSyncAfterLogin = false;

    if (_pendingKeys.size === 0) {
        notifyStatus({ syncing: false, pending: 0, lastSync: Date.now() });
        return;
    }

    _isSyncing = true;
    notifyStatus({ syncing: true, pending: _pendingKeys.size });
    const keys = Array.from(_pendingKeys);
    _pendingKeys.clear();
    const now = new Date().toISOString();
    let sawStale = false;

    try {
        for (const key of keys) {
            if (!isSyncableKey(key)) continue;
            const value = await _localGet(key);
            const { items, nextItemState } = diffKeyToItems(key, value, now, _state.keys[key] || {});
            if (items.length === 0) { _state.keys[key] = nextItemState; continue; }

            let ok = true;
            for (let i = 0; i < items.length; i += PUSH_BATCH) {
                const batch = items.slice(i, i + PUSH_BATCH);
                const res = await authorizedFetch('/api/free/sync/push', { method: 'POST', body: { items: batch } });
                if (!res.ok) { ok = false; break; }
                const data = await res.json().catch(() => null);
                if (data?.results?.some((r) => r.accepted === false && r.reason === 'stale')) sawStale = true;
            }
            if (ok) {
                _state.keys[key] = nextItemState;   // 记为已同步
            } else {
                _pendingKeys.add(key);              // 失败：留队列下次重试，本地不动
            }
        }
        saveState();
        // 有 stale（别的设备推了更新版）→ 立即拉一次把新版合并到本地
        if (sawStale) { try { await pullFromCloud(); } catch {} }
        notifyStatus({ syncing: false, pending: _pendingKeys.size, lastSync: Date.now() });
    } catch (err) {
        keys.forEach((k) => _pendingKeys.add(k));
        notifyStatus({ syncing: false, pending: _pendingKeys.size, error: err.message });
        if (throwOnError) throw err;
    } finally {
        _isSyncing = false;
    }
}

// 全量上传：迁移/首次把本地所有 syncable key 推上云端
export async function pushAllToCloud(keys = []) {
    if (!isCustomSignedIn() || !_localGet) return 0;
    let queued = 0;
    for (const key of keys) {
        if (!isSyncableKey(key)) continue;
        _pendingKeys.add(key);
        queued++;
    }
    await flushSync({ throwOnError: true });
    return queued;
}

// ==================== pull（增量 + 合并） ====================

export async function pullFromCloud() {
    if (!isCustomSignedIn() || !_localGet || !_localSet) return 0;
    let since = _state.cursor || 0;
    let hasMore = true;
    const byKey = new Map(); // key → items[]

    try {
        while (hasMore) {
            const res = await authorizedFetch('/api/free/sync/pull', { method: 'GET', query: { since, limit: PULL_LIMIT } });
            if (!res.ok) break;
            const data = await res.json().catch(() => null);
            if (!data?.ok) break;
            for (const it of (data.items || [])) {
                const key = itemToKey(it);
                if (!key || !isSyncableKey(key)) continue;
                if (!byKey.has(key)) byKey.set(key, []);
                byKey.get(key).push(it);
            }
            since = data.nextSince ?? since;
            hasMore = Boolean(data.hasMore);
        }

        let merged = 0;
        for (const [key, items] of byKey) {
            const meta = parseKey(key);
            if (!meta) continue;
            const localValue = await _localGet(key);
            const { changed, value } = mergeItemsIntoLocal(meta.kind, localValue, items, _state.keys[key] || {});
            if (changed) { await _localSet(key, value); merged++; }
            commitPulledState(key, items); // 游标状态推进到与云端一致
        }
        _state.cursor = since;
        saveState();
        return merged;
    } catch {
        return 0;
    }
}

// ==================== 清理 ====================

export function stopCustomSync() {
    clearSyncTimer();
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    _pendingKeys.clear();
    _firstSyncAfterLogin = true;
    notifyStatus({ pending: 0, syncing: false });
}

export function setupCustomBeforeUnloadSync() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeunload', () => {
        if (_pendingKeys.size > 0) flushSync().catch(() => {});
    });
}
