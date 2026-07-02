'use client';

// ==================== 持久化适配器 ====================
// 统一的存储接口：
//   1. 浏览器 IndexedDB/localStorage（本地，始终优先）
//   2. 服务端文件系统 /api/storage（Docker/自建部署模式）
//   3. Firebase Firestore（云同步模式，5分钟去抖）
// 多用户隔离：首次访问自动生成 userId 并存入 cookie

import { get, set, del } from 'idb-keyval';
import { isSyncableKey } from './sync-key-policy';

// ==================== 用户ID管理 ====================

function getUserId() {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/author-uid=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

function ensureUserId() {
    let uid = getUserId();
    if (!uid) {
        uid = 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        // 设置 365 天有效的 cookie（HttpOnly = false，前端可读）
        document.cookie = `author-uid=${uid}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`;
    }
    return uid;
}

// ==================== 服务端存储 ====================

let _serverAvailable = null; // null = 未检测, true/false = 检测结果

async function checkServerAvailable() {
    if (_serverAvailable !== null) return _serverAvailable;
    try {
        // 先尝试写入 __ping 以检测是否为只读环境（如 Vercel）
        const res = await fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ key: '__ping', value: Date.now() }),
        });
        _serverAvailable = res.ok;
        return _serverAvailable;
    } catch {
        _serverAvailable = false;
        return false;
    }
}

async function serverGet(key) {
    if (_serverAvailable === false) throw new Error('Server storage disabled');
    const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, {
        method: 'GET',
        credentials: 'include',
    });
    if (!res.ok) {
        if (res.status === 500) _serverAvailable = false;
        throw new Error(`Server GET failed: ${res.status}`);
    }
    const { data } = await res.json();
    return data;
}

async function serverSet(key, value) {
    if (_serverAvailable === false) throw new Error('Server storage disabled');
    const res = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
        if (res.status === 500 || res.status === 403 || res.status === 404) {
            _serverAvailable = false;
            console.warn(`[persist] Server POST returned ${res.status}. Disabling server storage to prevent looping.`);
        }
        throw new Error(`Server POST failed: ${res.status}`);
    }
}

async function serverDel(key) {
    if (_serverAvailable === false) throw new Error('Server storage disabled');
    const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!res.ok) {
        if (res.status === 500) _serverAvailable = false;
        throw new Error(`Server DELETE failed: ${res.status}`);
    }
}

// ==================== Firebase 同步 ====================

let _firebaseReady = false;
let _firestoreSync = null;
let _authModule = null;

/**
 * 懒加载 Firebase 模块（避免未配置时报错）
 */
async function ensureFirebase() {
    if (_firebaseReady) return _firestoreSync;
    try {
        const { isFirebaseConfigured } = await import('./firebase');
        if (!isFirebaseConfigured) {
            _firebaseReady = true;
            return null;
        }
        _firestoreSync = await import('./firestore-sync');
        _authModule = await import('./auth');
        _firebaseReady = true;
        return _firestoreSync;
    } catch {
        _firebaseReady = true;
        return null;
    }
}

function isFirebaseSignedIn() {
    return _authModule?.isSignedIn?.() || false;
}

// ==================== 自建服务器（Author Cloud）同步 ====================

let _customReady = false;
let _customSync = null;
let _customAuthModule = null;

// 懒加载自建服务器同步模块（仅当配置了服务器地址时）
async function ensureCustomSync() {
    if (_customReady) return _customSync;
    try {
        _customAuthModule = await import('./custom-auth');
        if (!_customAuthModule.isCustomServerConfigured()) {
            _customReady = true;
            return null;
        }
        _customSync = await import('./custom-server-sync');
        _customSync.bindLocalIO(persistGet, persistSet); // 注入本地读写，避免循环依赖
        _customReady = true;
        return _customSync;
    } catch {
        _customReady = true;
        return null;
    }
}

function isCustomSignedIn() {
    return _customAuthModule?.isCustomSignedIn?.() || false;
}

function enqueuePortableSync(key, value, options = {}) {
    if (!isSyncableKey(key)) return;
    import('./portable-sync')
        .then(sync => sync.portableSyncEnqueue(key, value, options))
        .catch(() => {});
}

// ==================== 统一存储接口 ====================

/**
 * 读取数据（本地优先，Firebase 已登录时作为补充）
 * @param {string} key - 存储键名
 * @returns {Promise<any>} 存储的值，不存在时返回 undefined
 */
export async function persistGet(key) {
    if (typeof window === 'undefined') return undefined;
    ensureUserId();

    // 1. 本地优先读取（快速）
    let localData;
    try {
        if (isSyncableKey(key) && await checkServerAvailable()) {
            localData = await serverGet(key);
            if (localData === null || localData === undefined) {
                // 服务端没有，尝试从浏览器获取
                localData = await browserGet(key);
                if (localData !== null && localData !== undefined) {
                    // 自动迁移到服务端
                    await serverSet(key, localData).catch(() => { });
                }
            }
        } else {
            localData = await browserGet(key);
        }
    } catch {
        localData = await browserGet(key);
    }

    return localData;
}

/**
 * 写入数据（本地实时 + Firebase 去抖同步）
 * @param {string} key - 存储键名
 * @param {any} value - 要存储的值
 */
export async function persistSet(key, value) {
    if (typeof window !== 'undefined' && window._isAppForcePulling && !window._isForcePullingBypass) {
        return;
    }
    if (typeof window === 'undefined') return;
    const awaitServerWrite = !!window._isForcePullingBypass || !!window._forcePersistAwaitServerWrite;
    ensureUserId();

    // 1. 先写浏览器（立即可用）
    await browserSet(key, value);

    // 2. 异步写服务端（不阻塞 UI）
    if (isSyncableKey(key) && await checkServerAvailable()) {
        const serverWrite = serverSet(key, value).catch(err => {
            console.warn('[persist] Server write failed, data saved in browser only:', err.message);
            if (awaitServerWrite) throw err;
        });
        if (awaitServerWrite) await serverWrite;
    }

    // 3. 云同步（去抖队列，5分钟批量写入）。单后端跟随登录：Firebase 或自建服务器
    if (isSyncableKey(key)) {
        const sync = await ensureFirebase();
        if (sync && isFirebaseSignedIn()) {
            sync.firestoreEnqueue(key, value);
        }
        const custom = await ensureCustomSync();
        if (custom && isCustomSignedIn()) {
            custom.customEnqueue(key);
        }
        enqueuePortableSync(key, value);
    }
}

/**
 * 删除数据
 * @param {string} key - 存储键名
 */
export async function persistDel(key) {
    if (typeof window === 'undefined') return;

    await browserDel(key);

    if (isSyncableKey(key) && await checkServerAvailable()) {
        serverDel(key).catch(() => { });
    }

    // 云端删除（Firebase 或自建服务器）
    if (isSyncableKey(key)) {
        const sync = await ensureFirebase();
        if (sync && isFirebaseSignedIn()) {
            sync.firestoreDel(key).catch(() => { });
        }
        const custom = await ensureCustomSync();
        if (custom && isCustomSignedIn()) {
            custom.customDel(key);
        }
        enqueuePortableSync(key, null, { deleted: true });
    }
}

// ==================== 浏览器存储桥接 ====================

// 大数据用 IndexedDB，小数据用 localStorage
const LOCALSTORAGE_KEYS = new Set([
    'author-project-settings',
    'author-active-work',
    'author-token-stats',
    'author-theme',
    'author-lang',
    'author-visual',
    'author-onboarding-done',
    'author-context-selection',
    'author-api-profiles',
    'author-api-config',
    'author-delete-never-remind',
    'author-delete-skip-today',
]);

async function browserGet(key) {
    if (LOCALSTORAGE_KEYS.has(key)) {
        const raw = localStorage.getItem(key);
        if (raw === null) return undefined;
        try { return JSON.parse(raw); } catch { return raw; }
    }
    const val = await get(key);
    return val === undefined ? undefined : val;
}

async function browserSet(key, value) {
    if (LOCALSTORAGE_KEYS.has(key)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        return;
    }
    await set(key, value);
}

async function browserDel(key) {
    if (LOCALSTORAGE_KEYS.has(key)) {
        localStorage.removeItem(key);
        return;
    }
    await del(key);
}

// ==================== 便捷方法 ====================

/**
 * 同步读取 localStorage（仅用于需要同步值的场景，如初始化 zustand store）
 * 不走服务端。
 */
export function persistGetSync(key) {
    if (typeof window === 'undefined') return undefined;
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { return raw; }
}

/**
 * 初始化：确保 userId 存在，触发服务端检测，初始化 Firebase Auth
 * 应在应用启动时调用一次
 */
export async function initPersistence() {
    if (typeof window === 'undefined') return;
    ensureUserId();
    await checkServerAvailable();

    // 初始化 Firebase Auth（如果已配置）
    const sync = await ensureFirebase();
    if (sync && _authModule) {
        _authModule.initAuth();
        // 页面卸载前尝试同步
        sync.setupBeforeUnloadSync();
    }

    // 初始化自建服务器 Auth（如果配置了服务器地址）
    const custom = await ensureCustomSync();
    if (custom && _customAuthModule) {
        _customAuthModule.initCustomAuth();
        custom.setupCustomBeforeUnloadSync();
    }
}

/**
 * Firebase 登录后调用：从云端拉取数据合并到本地
 * @returns {Promise<number>} 合并的条数
 */
export async function syncFromCloud() {
    // 单后端跟随登录：优先自建服务器，否则 Firebase
    const custom = await ensureCustomSync();
    if (custom && isCustomSignedIn()) return await custom.pullFromCloud();
    const sync = await ensureFirebase();
    if (!sync || !isFirebaseSignedIn()) return 0;
    return await sync.pullAllFromCloud(persistGet, persistSet);
}

async function collectSyncableKeysForCloudPush() {
    const keys = new Set(['author-works-index']);
    const works = await persistGet('author-works-index');
    const workIds = new Set(['work-default']);

    if (Array.isArray(works)) {
        for (const work of works) {
            if (work?.id) workIds.add(work.id);
        }
    }

    if (typeof window !== 'undefined') {
        const activeWorkId = localStorage.getItem('author-active-work');
        if (activeWorkId) workIds.add(activeWorkId);
    }

    for (const workId of workIds) {
        keys.add(`author-chapters-${workId}`);
        keys.add(`author-chapter-memory-groups-${workId}`);
        keys.add(`author-settings-nodes-${workId}`);
    }

    return Array.from(keys).filter(isSyncableKey);
}

/**
 * Firebase 手动“同步到云端”：将本机当前作品图谱全量写入云端。
 * 这比 flush pending 更适合登录后补传已有本地稿件。
 */
export async function syncToCloud() {
    const keys = await collectSyncableKeysForCloudPush();
    // 单后端跟随登录：优先自建服务器，否则 Firebase
    const custom = await ensureCustomSync();
    if (custom && isCustomSignedIn()) return await custom.pushAllToCloud(keys);
    const sync = await ensureFirebase();
    if (!sync || !isFirebaseSignedIn()) return 0;
    return await sync.pushAllToCloud(persistGet, keys);
}

/**
 * Firebase 退出登录前调用：同步剩余数据 + 停止同步
 */
export async function stopCloudSync() {
    // 自建服务器：先补传剩余，再停并清增量状态（换用户不能沿用旧游标）
    const custom = await ensureCustomSync();
    if (custom && isCustomSignedIn()) {
        const keys = await collectSyncableKeysForCloudPush();
        // 退出前的补传是“尽力而为”：服务器地址缺失 / 网络断 / 服务器挂都可能失败，
        // 但绝不能因此中断“停止同步 + 清增量状态 + 登出”，否则退出会被带崩、登录态残留。
        try {
            await custom.pushAllToCloud(keys);
        } catch (err) {
            console.warn('[stopCloudSync] 退出前补传失败，继续退出流程:', err?.message || err);
        }
        custom.stopCustomSync();
        custom.resetSyncState?.();
        return;
    }

    const sync = await ensureFirebase();
    if (!sync) return;
    try {
        if (isFirebaseSignedIn()) {
            const keys = await collectSyncableKeysForCloudPush();
            await sync.pushAllToCloud(persistGet, keys);
        } else {
            await sync.flushSync(); // 先同步剩余
        }
    } catch (err) {
        console.warn('[stopCloudSync] 退出前同步失败，继续退出流程:', err?.message || err);
    }
    sync.stopSync();        // 再停止
}
