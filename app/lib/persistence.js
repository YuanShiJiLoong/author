'use client';

// ==================== 持久化适配器 ====================
// 统一的存储接口：
//   1. 浏览器 IndexedDB/localStorage（本地，未确认的修改始终优先）
//   2. 服务端文件系统 /api/storage（Docker/自建部署模式）
//   3. Author Cloud（云同步模式，5分钟去抖）
// 多用户隔离：首次访问自动生成 userId 并存入 cookie

import { get, set, del, createStore, promisifyRequest } from 'idb-keyval';
import { isSyncableKey } from './sync-key-policy';
import { apiPath } from './api-base';
import { IS_OFFICIAL_WEB } from './deployment-target';
import { trackLocalSave } from './local-save-status';
import { getCustomAuthContext, assertCustomAuthContext } from './custom-auth';

// ==================== 用户ID管理 ====================

function getUserId() {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)author-uid=([a-zA-Z0-9_-]{1,128})(?:;|$)/);
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

// 官网使用带认证的 Author Cloud，不探测仅供可信自托管使用的文件接口。
let _serverAvailable = IS_OFFICIAL_WEB ? false : null; // null = 未检测, true/false = 检测结果
let _serverCheck = null;

async function checkServerAvailable() {
    if (_serverAvailable !== null) return _serverAvailable;
    if (_serverCheck) return _serverCheck;
    _serverCheck = (async () => {
        try {
            // 先尝试写入 __ping 以检测是否为只读环境（如 Vercel）。暂时故障留待下次重试。
            const res = await fetch(apiPath('/api/storage'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ key: '__ping', value: Date.now() }),
            });
            if (res.ok) _serverAvailable = true;
            else if (res.status === 403 || res.status === 404) _serverAvailable = false;
            return res.ok;
        } catch {
            return false;
        } finally { _serverCheck = null; }
    })();
    return _serverCheck;
}

async function serverGet(key, options = {}) {
    options.assertCurrent?.();
    if (_serverAvailable === false) throw new Error('Server storage disabled');
    const res = await fetch(apiPath(`/api/storage?key=${encodeURIComponent(key)}`), {
        method: 'GET',
        credentials: 'include',
        signal: options.signal,
    });
    if (!res.ok) {
        if (res.status === 403 || res.status === 404) _serverAvailable = false;
        throw new Error(`Server GET failed: ${res.status}`);
    }
    const body = await res.json();
    options.assertCurrent?.();
    if (!body || !Object.hasOwn(body, 'data')) throw new Error('Invalid server storage response');
    return body.data;
}

async function serverSet(key, value, options = {}) {
    options.assertCurrent?.();
    if (_serverAvailable === false) throw new Error('Server storage disabled');
    const res = await fetch(apiPath('/api/storage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, value }),
        signal: options.signal,
    });
    if (!res.ok) {
        if (res.status === 403 || res.status === 404) {
            _serverAvailable = false;
            console.warn(`[persist] Server POST returned ${res.status}. Disabling server storage to prevent looping.`);
        }
        throw new Error(`Server POST failed: ${res.status}`);
    }
    const body = await res.json();
    options.assertCurrent?.();
    if (body?.ok !== true) throw new Error('Server write was not acknowledged');
}

async function serverDel(key, options = {}) {
    options.assertCurrent?.();
    if (_serverAvailable === false) throw new Error('Server storage disabled');
    const res = await fetch(apiPath(`/api/storage?key=${encodeURIComponent(key)}`), {
        method: 'DELETE',
        credentials: 'include',
        signal: options.signal,
    });
    if (!res.ok) {
        if (res.status === 403 || res.status === 404) _serverAvailable = false;
        throw new Error(`Server DELETE failed: ${res.status}`);
    }
    const body = await res.json();
    options.assertCurrent?.();
    if (body?.ok !== true) throw new Error('Server deletion was not acknowledged');
}

// ==================== Author Cloud 同步 ====================

let _customSync = null;
let _customAuthModule = null;

// 懒加载自建服务器同步模块（仅当配置了服务器地址时）
async function ensureCustomSync() {
    if (_customSync) return _customSync;
    try {
        _customAuthModule ||= await import('./custom-auth');
        if (!_customAuthModule.isCustomServerConfigured()) {
            return null;
        }
        _customSync = await import('./custom-server-sync');
        _customSync.bindLocalIO(persistGet, persistSet); // 注入本地读写，避免循环依赖
        return _customSync;
    } catch {
        return null;
    }
}

function isCustomSignedIn() {
    return _customAuthModule?.isCustomSignedIn?.() || false;
}

function enqueuePortableSync(key, value, options = {}) {
    if (!isSyncableKey(key)) return;
    import('./portable-sync')
        .then(sync => { options.assertCurrent?.(); return sync.portableSyncEnqueue(key, value, options); })
        .catch(() => {});
}

// ==================== 统一存储接口 ====================

/**
 * 读取数据（本地优先）
 * @param {string} key - 存储键名
 * @returns {Promise<any>} 存储的值，不存在时返回 undefined
 */
export async function persistGet(key, options = {}) {
    options.assertCurrent?.();
    if (typeof window === 'undefined') return undefined;
    ensureUserId();

    if (!usesFileStorage(key)) {
        const value = await browserGet(key);
        options.assertCurrent?.();
        if (value !== undefined) options.validateValue?.(value);
        return value;
    }
    options = fileStorageOptions(options);
    const local = await readFileState(key, options);
    if (local.state?.pending) {
        // 未确认的修改（含删除）始终以浏览器为准，刷新后也不能被旧服务器内容盖回。
        queueFileWrite(key, options).catch(warnFileWrite);
        return local.value;
    }
    let remote;
    let received = false;
    try {
        if (await checkServerAvailable()) {
            remote = await serverGet(key, options);
            received = true;
        }
    } catch {
        options.assertCurrent?.();
        options.signal?.throwIfAborted();
    }
    if (received) {
        // 文件接口用 null 表示键不存在。其他值先校验，再更新本机缓存。
        if (remote != null) options.validateValue?.(remote);
        // 读取期间若发生本地保存，返回新本地稿；迟到的 GET 不得覆盖它。
        try { return await cacheFileRead(key, remote, local.state, options); }
        catch (error) {
            options.assertCurrent?.();
            const current = await readFileState(key, options);
            console.warn('[persist] Server data read, but browser cache could not be updated:', error?.message);
            if (current.state?.revision !== local.state?.revision || current.state?.pending) return current.value;
            return remote ?? undefined;
        }
    }
    const fallback = await readFileState(key, options);
    if (options.validateValue && fallback.value === undefined && !fallback.state?.deleted && (fallback.state || _serverAvailable !== false)) {
        throw new Error('Could not read the file or find a local copy');
    }
    return fallback.value;
}

/**
 * 写入数据（本地实时 + Author Cloud 去抖同步）
 * @param {string} key - 存储键名
 * @param {any} value - 要存储的值
 */
export async function persistSet(key, value, options = {}) {
    options.assertCurrent?.();
    options.signal?.throwIfAborted();
    if (typeof window !== 'undefined' && window._isAppForcePulling && !window._isForcePullingBypass && !options.bypassForcePull) {
        if (options.signal || options.requireWrite) throw new Error('同步写入已暂停，请稍后重试');
        return;
    }
    if (typeof window === 'undefined') return;
    const awaitServerWrite = !!options.awaitServerWrite || !!window._isForcePullingBypass || !!window._forcePersistAwaitServerWrite;
    ensureUserId();
    if (usesFileStorage(key)) options = fileStorageOptions(options);

    // 1. 先写浏览器（立即可用）
    await trackLocalSave(() => browserSet(key, value, options), `set:${key}`, { signal: options.signal });
    options.assertCurrent?.();

    // 2. 异步写服务端（不阻塞 UI）
    if (usesFileStorage(key)) {
        const serverWrite = queueFileWrite(key, options);
        if (awaitServerWrite) await serverWrite;
        else serverWrite.catch(warnFileWrite);
    }

    // 3. 云同步（去抖队列，5分钟批量写入）。
    if (isSyncableKey(key)) {
        const custom = await ensureCustomSync();
        options.assertCurrent?.();
        if (custom && isCustomSignedIn()) {
            custom.customEnqueue(key);
        }
        enqueuePortableSync(key, value, options);
    }
}

/**
 * 删除数据
 * @param {string} key - 存储键名
 */
export async function persistDel(key, options = {}) {
    if (typeof window === 'undefined') return;
    ensureUserId();
    if (usesFileStorage(key)) options = fileStorageOptions(options);

    await trackLocalSave(() => browserDel(key, options), `delete:${key}`, { signal: options.signal });
    options.assertCurrent?.();

    if (usesFileStorage(key)) {
        const serverWrite = queueFileWrite(key, options);
        if (options.awaitServerWrite) await serverWrite;
        else serverWrite.catch(warnFileWrite);
    }

    // 云端删除
    if (isSyncableKey(key)) {
        const custom = await ensureCustomSync();
        options.assertCurrent?.();
        if (custom && isCustomSignedIn()) {
            custom.customDel(key);
        }
        enqueuePortableSync(key, null, { ...options, deleted: true });
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

const guardedBrowserStore = createStore('keyval-store', 'keyval');

function browserTransaction(callback, options = {}) {
    return guardedBrowserStore('readwrite', store => {
        const transaction = store.transaction;
        const abort = () => { try { transaction.abort(); } catch {} };
        const completed = promisifyRequest(transaction);
        const cleanup = () => options.signal?.removeEventListener('abort', abort);
        let result;
        try {
            options.assertCurrent?.();
            options.signal?.throwIfAborted();
            options.signal?.addEventListener('abort', abort, { once: true });
            result = callback(store);
        } catch (error) {
            abort();
            return completed.catch(() => { throw error; }).finally(cleanup);
        }
        return Promise.all([result, completed]).then(([value]) => value).catch(error => {
            abort();
            options.signal?.throwIfAborted();
            throw error;
        }).finally(cleanup);
    });
}

function usesFileStorage(key) {
    return !IS_OFFICIAL_WEB && isSyncableKey(key);
}

function fileStorageOptions(options) {
    const userId = getUserId();
    return { ...options, assertCurrent: () => {
        options.assertCurrent?.();
        options.signal?.throwIfAborted();
        if (getUserId() !== userId) throw new Error('File storage user changed');
    } };
}

function fileStateKey(key) {
    return `author-file-storage-state:${JSON.stringify([apiPath('/api/storage'), getUserId(), key])}`;
}

function newFileState(deleted, pending = true) {
    return { revision: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, pending, deleted };
}

async function readStateFromStore(store, key) {
    const [value, state] = await Promise.all([
        promisifyRequest(store.get(key)), promisifyRequest(store.get(fileStateKey(key))),
    ]);
    if (state?.pending && !state.deleted && value === undefined) throw new Error('Pending value is missing for its recorded revision');
    return { value: state?.deleted ? undefined : value, state };
}

function readFileState(key, options) {
    return browserTransaction(async store => {
        const local = await readStateFromStore(store, key);
        options.assertCurrent?.();
        if (local.value !== undefined) options.validateValue?.(local.value);
        // 旧浏览器稿没有确认记录，不能推断服务器那份更新；先保住本地内容。
        if (!local.state && local.value !== undefined) {
            local.state = { ...newFileState(false), unverified: true };
            store.put(local.state, fileStateKey(key));
        }
        return local;
    }, options);
}

function cacheFileRead(key, value, previousState, options) {
    return browserTransaction(async store => {
        const local = await readStateFromStore(store, key);
        options.assertCurrent?.();
        if (local.state?.revision !== previousState?.revision || local.state?.pending) {
            if (local.value !== undefined) options.validateValue?.(local.value);
            return local.value;
        }
        const deleted = value === null || value === undefined;
        if (deleted) store.delete(key);
        else store.put(value, key);
        store.put(newFileState(deleted, false), fileStateKey(key));
        return deleted ? undefined : value;
    }, options);
}

const fileWriteQueues = new Map();

function warnFileWrite(error) {
    console.warn('[persist] Server write failed, pending data retained in browser:', error?.message);
}

function queueFileWrite(key, options) {
    const queueKey = fileStateKey(key);
    const flush = async () => {
        options.assertCurrent?.();
        if (!await checkServerAvailable()) {
            options.assertCurrent?.();
            if (_serverAvailable !== false) throw new Error('Server file storage is unavailable');
            return; // 明确关闭的文件存储不阻断纯浏览器模式。
        }
        const local = await readFileState(key, options);
        if (!local.state?.pending) return;
        let needsWrite = true;
        if (local.state.unverified) {
            const remote = await serverGet(key, options);
            // 升级前两端的先后顺序未知。内容不同就各自保留，不能自动把另一份盖掉。
            if (remote != null && JSON.stringify(remote) !== JSON.stringify(local.value)) return;
            needsWrite = remote == null;
        }
        if (needsWrite) {
            if (local.state.deleted) await serverDel(key, options);
            else await serverSet(key, local.value, options);
        }
        await browserTransaction(async store => {
            const current = await readStateFromStore(store, key);
            options.assertCurrent?.();
            // 旧请求的成功只能确认它实际发送的版本。
            if (current.state?.revision === local.state.revision) {
                store.put({ ...current.state, pending: false, unverified: false }, fileStateKey(key));
            }
        }, options);
    };
    const write = (fileWriteQueues.get(queueKey) || Promise.resolve()).catch(() => {}).then(() => {
        // 同源标签页共享一个 IndexedDB，也应按同一顺序完成文件写入与确认。
        const locks = globalThis.navigator?.locks;
        return locks?.request ? locks.request(queueKey, { mode: 'exclusive', ...(options.signal ? { signal: options.signal } : {}) }, flush) : flush();
    });
    fileWriteQueues.set(queueKey, write);
    const cleanup = () => { if (fileWriteQueues.get(queueKey) === write) fileWriteQueues.delete(queueKey); };
    write.then(cleanup, cleanup);
    return write;
}

async function browserSet(key, value, options = {}) {
    options.assertCurrent?.();
    options.signal?.throwIfAborted();
    if (LOCALSTORAGE_KEYS.has(key)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        return;
    }
    if (!options.signal && !usesFileStorage(key)) { await set(key, value); return; }
    await browserTransaction(store => {
        store.put(value, key);
        if (usesFileStorage(key)) store.put(newFileState(false), fileStateKey(key));
    }, options);
}

async function browserDel(key, options = {}) {
    options.assertCurrent?.();
    options.signal?.throwIfAborted();
    if (LOCALSTORAGE_KEYS.has(key)) {
        localStorage.removeItem(key);
        return;
    }
    if (usesFileStorage(key) || options.signal) {
        await browserTransaction(store => {
            store.delete(key);
            if (usesFileStorage(key)) store.put(newFileState(true), fileStateKey(key));
        }, options);
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
 * 初始化：确保 userId 存在，触发服务端检测并初始化 Author Cloud。
 * 应在应用启动时调用一次
 */
export async function initPersistence() {
    if (typeof window === 'undefined') return;
    ensureUserId();
    await checkServerAvailable();

    // 初始化 Author Cloud Auth（如果配置了服务器地址）
    const custom = await ensureCustomSync();
    if (custom && _customAuthModule) {
        _customAuthModule.initCustomAuth();
        custom.setupCustomBeforeUnloadSync();
    }

    // WebDAV：接着推上次页面被关掉或回收前没推完的（未启用 WebDAV 时直接返回）
    import('./portable-sync').then(sync => sync.resumePortableSync()).catch(() => {});
}

/**
 * 登录后调用：从 Author Cloud 拉取数据合并到本地
 * @returns {Promise<number>} 合并的条数
 */
export async function syncFromCloud({ authContext = getCustomAuthContext() } = {}) {
    if (!authContext) return 0;
    const custom = await ensureCustomSync();
    assertCustomAuthContext(authContext);
    if (custom) {
        const result = await custom.pullFromCloud();
        assertCustomAuthContext(authContext);
        return result;
    }
    return 0;
}

// 手动“从云端同步”：强制用云端覆盖本地（恢复误删、拉回全量）。
export async function forcePullFromCloud({ authContext = getCustomAuthContext() } = {}) {
    if (!authContext) return 0;
    const custom = await ensureCustomSync();
    assertCustomAuthContext(authContext);
    if (custom) {
        const result = await custom.forcePullFromCloud();
        assertCustomAuthContext(authContext);
        return result;
    }
    return 0;
}

async function collectSyncableKeysForCloudPush(authContext) {
    assertCustomAuthContext(authContext);
    const keys = new Set(['author-works-index']);
    const works = await persistGet('author-works-index', { signal: authContext.signal, assertCurrent: () => assertCustomAuthContext(authContext) });
    assertCustomAuthContext(authContext);
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
 * 将本机当前作品图谱全量同步到 Author Cloud。
 * 这比 flush pending 更适合登录后补传已有本地稿件。
 */
export async function syncToCloud({ authContext = getCustomAuthContext() } = {}) {
    if (!authContext) return 0;
    const custom = await ensureCustomSync();
    assertCustomAuthContext(authContext);
    if (custom) {
        const keys = await collectSyncableKeysForCloudPush(authContext);
        assertCustomAuthContext(authContext);
        const result = await custom.pushAllToCloud(keys);
        assertCustomAuthContext(authContext);
        return result;
    }
    return 0;
}

/**
 * 退出登录前调用：同步剩余数据 + 停止同步
 */
export async function stopCloudSync({ authContext = getCustomAuthContext() } = {}) {
    if (!authContext) return;
    // 先补传剩余，再停止同步。各账号的待上传记录和游标分别保留。
    const custom = await ensureCustomSync();
    assertCustomAuthContext(authContext);
    if (custom) {
        // 退出前的补传是“尽力而为”：服务器地址缺失 / 网络断 / 服务器挂都可能失败，
        // 但不能因此中断停止同步和登出。
        try {
            const keys = await collectSyncableKeysForCloudPush(authContext);
            assertCustomAuthContext(authContext);
            await custom.pushAllToCloud(keys);
        } catch (err) {
            assertCustomAuthContext(authContext);
            console.warn('[stopCloudSync] 退出前补传失败，继续退出流程:', err?.message || err);
        }
        assertCustomAuthContext(authContext);
        custom.stopCustomSync();
        return;
    }

}
