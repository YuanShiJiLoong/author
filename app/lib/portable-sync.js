'use client';

import { isSyncableKey } from './sync-key-policy';
import { localizedError, tt } from './runtime-i18n';
import { localizeApiError } from './api-error-i18n';
import { apiPath } from './api-base';
import { waitForLocalSaves } from './local-save-status';
import { utf8ByteLength, isDamagedItemArray, parseKey } from './custom-sync-core';

// 章节 / 设定 / 记忆组的值已损坏时，既不推到 WebDAV，也不拿来覆盖本机。
function isDamagedEntry(key, value) {
    return isDamagedItemArray(parseKey(key)?.kind, value);
}

const SETTINGS_KEY = 'author-sync-settings';
const SECRET_PREFIX = 'author-sync-secret-';
const PENDING_KEYS_STORAGE = 'author-sync-webdav-pending-v1'; // 只记 key 名，内容推送时现读
const DELETE_MARKER = '_AUTHOR_DELETE_';
const SYNC_INTERVAL = 5 * 60 * 1000;
const IDLE_TIMEOUT = 5 * 60 * 1000;
const LEAVE_SAVE_WAIT = 2000; // 离开页面时等编辑器落盘的最长时间
const MANIFEST_FILE = 'manifest.json';
const KEY_DIR = 'keys';

const DEFAULT_SETTINGS = {
    version: 1,
    webdav: {
        enabled: false,
        preset: 'jianguoyun',
        endpoint: 'https://dav.jianguoyun.com/dav/',
        username: '',
        basePath: '/AuthorSync',
    },
    lan: {
        shareMinutes: 30,
    },
};

const WEBDAV_PRESETS = {
    jianguoyun: {
        label: '坚果云',
        endpoint: 'https://dav.jianguoyun.com/dav/',
        basePath: '/AuthorSync',
        note: '使用坚果云账号邮箱和应用密码。',
    },
    pan123: {
        label: '123 云盘',
        endpoint: '',
        basePath: '/AuthorSync',
        note: '在 123 云盘第三方挂载/WebDAV 页面复制地址和授权信息。',
    },
    custom: {
        label: '自定义 WebDAV',
        endpoint: '',
        basePath: '/AuthorSync',
        note: '适用于 NAS、Nextcloud、ownCloud、Seafile、Cloudreve 等。',
    },
};

// 诊断：同步失败必须留下可追查的证据，但诊断本身绝不能让同步失败，
// 因此一律动态载入并吞掉自身错误。
function recordSyncDiagnostic(event, message, metadata, level = 'info') {
    import('./diagnostics')
        .then(({ recordDiagnosticEvent }) => recordDiagnosticEvent(event, message, metadata, level))
        .catch(() => {});
}

const _pendingWrites = new Map();
const _inFlightWrites = new Map(); // 正在推的条目：推完之前页面被回收，下次还得接着推
const _statusListeners = new Set();
let _syncTimer = null;
let _idleTimer = null;
let _isSyncing = false;
let _activeFlushPromise = null;
let _leaveFlushInstalled = false;
let _resumeStarted = false;
let _persistedPendingSignature = null;

function cloneDefaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function normalizeBasePath(basePath) {
    const raw = String(basePath || '/AuthorSync').trim();
    if (!raw || raw === '/') return '';
    return '/' + raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function normalizeEndpoint(endpoint) {
    return String(endpoint || '').trim();
}

function normalizeSettings(input) {
    const defaults = cloneDefaultSettings();
    const next = {
        ...defaults,
        ...(input && typeof input === 'object' ? input : {}),
        webdav: {
            ...defaults.webdav,
            ...(input?.webdav && typeof input.webdav === 'object' ? input.webdav : {}),
        },
        lan: {
            ...defaults.lan,
            ...(input?.lan && typeof input.lan === 'object' ? input.lan : {}),
        },
    };

    next.version = 1;
    next.webdav.enabled = !!next.webdav.enabled;
    next.webdav.preset = WEBDAV_PRESETS[next.webdav.preset] ? next.webdav.preset : 'custom';
    next.webdav.endpoint = normalizeEndpoint(next.webdav.endpoint);
    next.webdav.username = String(next.webdav.username || '').trim();
    next.webdav.basePath = normalizeBasePath(next.webdav.basePath);
    next.lan.shareMinutes = Math.max(5, Math.min(120, Number(next.lan.shareMinutes) || 30));

    delete next.webdav.password;
    return next;
}

function getSecretStorageKey(name) {
    return `${SECRET_PREFIX}${name}`;
}

async function setSecret(name, value) {
    if (typeof window === 'undefined') return;
    const normalized = String(value || '');
    if (window.electronAPI?.secureSet) {
        if (normalized) await window.electronAPI.secureSet(name, normalized);
        else await window.electronAPI.secureDelete?.(name);
        return;
    }
    if (normalized) localStorage.setItem(getSecretStorageKey(name), normalized);
    else localStorage.removeItem(getSecretStorageKey(name));
}

async function getSecret(name) {
    if (typeof window === 'undefined') return '';
    if (window.electronAPI?.secureGet) {
        try {
            return await window.electronAPI.secureGet(name) || '';
        } catch {
            return '';
        }
    }
    return localStorage.getItem(getSecretStorageKey(name)) || '';
}

export async function hasPortableSyncSecret(name) {
    return !!(await getSecret(name));
}

export function getWebDavPresets() {
    return WEBDAV_PRESETS;
}

export function getWebDavPresetDefaults(preset) {
    return WEBDAV_PRESETS[preset] || WEBDAV_PRESETS.custom;
}

export function loadPortableSyncSettings() {
    if (typeof window === 'undefined') return cloneDefaultSettings();
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return normalizeSettings(raw ? JSON.parse(raw) : null);
    } catch {
        return cloneDefaultSettings();
    }
}

export async function savePortableSyncSettings(settings, secrets = {}) {
    if (typeof window === 'undefined') return normalizeSettings(settings);
    const normalized = normalizeSettings(settings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
    if (Object.prototype.hasOwnProperty.call(secrets, 'webdavPassword')) {
        await setSecret('webdav-password', secrets.webdavPassword);
    }
    notifyPortableSyncStatus({ settings: normalized });
    return normalized;
}

async function getResolvedWebDavSettings(override) {
    const settings = normalizeSettings(override || loadPortableSyncSettings());
    const password = override?.webdav?.password ?? await getSecret('webdav-password');
    return {
        ...settings.webdav,
        password: String(password || ''),
    };
}

function notifyPortableSyncStatus(status) {
    const payload = {
        ...status,
        pending: _pendingWrites.size,
        keys: Array.from(_pendingWrites.keys()),
    };
    for (const listener of _statusListeners) {
        try { listener(payload); } catch { }
    }
}

export function onPortableSyncStatusChange(callback) {
    if (typeof callback !== 'function') return () => {};
    _statusListeners.add(callback);
    callback({ pending: _pendingWrites.size, keys: Array.from(_pendingWrites.keys()) });
    return () => _statusListeners.delete(callback);
}

function ensureSyncTimer() {
    if (!_syncTimer) {
        _syncTimer = setInterval(() => {
            flushPortableSync().catch(() => {});
        }, SYNC_INTERVAL);
    }
}

function clearSyncTimer() {
    if (_syncTimer) {
        clearInterval(_syncTimer);
        _syncTimer = null;
    }
}

function resetIdleTimer() {
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
        flushPortableSync().finally(() => {
            clearSyncTimer();
            notifyPortableSyncStatus({ syncing: false, idle: true, lastSync: Date.now() });
        });
    }, IDLE_TIMEOUT);
}

// ==================== 待推队列落盘 ====================
// 队列只在内存里的话，手机浏览器切到后台被回收后就丢了，那台设备上写的内容再也不会
// 自动推送。内容可能很大，只落 key 名和是否删除；下次打开页面按名字现读本地内容接着推。

const _resumingKeys = new Map(); // 启动时从落盘记录读出、还没处理完的 key → { deleted }

function persistPendingKeys() {
    if (typeof window === 'undefined') return;
    const record = {};
    for (const [key, meta] of _resumingKeys) record[key] = meta;
    for (const source of [_inFlightWrites, _pendingWrites]) {
        for (const [key, { value }] of source) record[key] = { deleted: value === DELETE_MARKER };
    }
    const signature = JSON.stringify(record);
    if (signature === _persistedPendingSignature) return; // 打字时每次落盘都会入队，内容没变就不重写
    try {
        if (Object.keys(record).length === 0) localStorage.removeItem(PENDING_KEYS_STORAGE);
        else localStorage.setItem(PENDING_KEYS_STORAGE, signature);
        _persistedPendingSignature = signature;
    } catch {}
}

// 离开页面前的推送。手机浏览器切到后台后随时冻结或回收页面，iOS Safari 也不触发
// beforeunload；只靠 5 分钟定时器，手机上写的内容几乎推不出去。
function installLeaveFlush() {
    if (_leaveFlushInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
    _leaveFlushInstalled = true;
    const flushBeforeLeaving = () => {
        // 编辑器在同一个事件里把最后几个字落盘，等它落完再推；等不到也照推已入队的。
        waitForLocalSaves({ timeoutMs: LEAVE_SAVE_WAIT }).catch(() => {}).then(() => {
            if (_pendingWrites.size > 0) flushPortableSync().catch(() => {});
        });
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushBeforeLeaving();
    });
    window.addEventListener('pagehide', flushBeforeLeaving);
}

// 页面启动时调用：把上次没推完的接着推。
export async function resumePortableSync() {
    if (typeof window === 'undefined' || _resumeStarted) return 0;
    _resumeStarted = true;
    if (!loadPortableSyncSettings().webdav.enabled) return 0;
    installLeaveFlush();

    let record = null;
    try { record = JSON.parse(localStorage.getItem(PENDING_KEYS_STORAGE) || 'null'); } catch {}
    if (!record || typeof record !== 'object' || Array.isArray(record)) return 0;
    for (const [key, meta] of Object.entries(record)) {
        if (isSyncableKey(key)) _resumingKeys.set(key, { deleted: meta?.deleted === true });
    }

    const { persistGet } = await import('./persistence');
    let resumed = 0;
    for (const [key, meta] of Array.from(_resumingKeys)) {
        // 这期间已经重新入队的，队列里的值更新
        if (!_pendingWrites.has(key) && !_inFlightWrites.has(key)) {
            let value;
            try { value = await persistGet(key); } catch { continue; } // 读不到就留着记录，下次再试
            if (isDamagedEntry(key, value)) {
                recordSyncDiagnostic('sync.webdav.damaged-local', '本地记录已损坏，未推送到 WebDAV', { key }, 'error');
                continue; // 同样留着记录，恢复后再推
            }
            if (value !== undefined && value !== null) {
                _pendingWrites.set(key, { value, timestamp: Date.now() });
                resumed++;
            } else if (meta.deleted) {
                _pendingWrites.set(key, { value: DELETE_MARKER, timestamp: Date.now() });
                resumed++;
            }
            // 记录说要写、本地却没有这份数据：不猜测，更不能因此删远端
        }
        _resumingKeys.delete(key);
    }
    persistPendingKeys();
    if (_pendingWrites.size === 0) return 0;
    notifyPortableSyncStatus({ pending: _pendingWrites.size });
    ensureSyncTimer();
    resetIdleTimer();
    await flushPortableSync();
    return resumed;
}

export function portableSyncEnqueue(key, value, options = {}) {
    if (typeof window === 'undefined') return;
    if (window._isPortableSyncApplying) return;
    if (!isSyncableKey(key)) return;

    const settings = loadPortableSyncSettings();
    if (!settings.webdav.enabled) return;
    if (!options.deleted && isDamagedEntry(key, value)) {
        recordSyncDiagnostic('sync.webdav.damaged-local', '本地记录已损坏，未推送到 WebDAV', { key }, 'error');
        return;
    }

    _pendingWrites.set(key, {
        value: options.deleted ? DELETE_MARKER : value,
        timestamp: Date.now(),
    });
    persistPendingKeys();
    installLeaveFlush();
    notifyPortableSyncStatus({ pending: _pendingWrites.size });
    ensureSyncTimer();
    resetIdleTimer();
}

function joinDavPath(...parts) {
    const clean = parts
        .map(part => String(part || '').trim())
        .filter(Boolean)
        .map(part => part.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean);
    return clean.length ? '/' + clean.join('/') : '';
}

function keyFileName(key) {
    return `${encodeURIComponent(key)}.json`;
}

function keyPath(basePath, key) {
    return joinDavPath(basePath, KEY_DIR, keyFileName(key));
}

function manifestPath(basePath) {
    return joinDavPath(basePath, MANIFEST_FILE);
}

function assertWebDavConfig(config) {
    if (!config.endpoint) throw localizedError('请填写 WebDAV 地址', 'Please enter the WebDAV address.', 'Укажите адрес WebDAV.');
    if (!config.username) throw localizedError('请填写 WebDAV 账号', 'Please enter the WebDAV username.', 'Укажите имя пользователя WebDAV.');
    if (!config.password) throw localizedError('请填写 WebDAV 应用密码或授权码', 'Please enter the WebDAV app password or auth code.', 'Укажите пароль приложения или код авторизации WebDAV.');
}

function requestTooLargeMessage(bytes) {
    const mb = (bytes / 1024 / 1024).toFixed(1);
    return tt(
        `这次要上传的数据约 ${mb} MB，超过了服务器允许的单次上传上限，没能推送到 WebDAV。`,
        `This upload is about ${mb} MB, which exceeds the server's per-request limit, so it was not pushed to WebDAV.`,
        `Объём загрузки около ${mb} МБ превышает лимит сервера на один запрос, поэтому данные не отправлены в WebDAV.`,
    );
}

async function webdavProxy(action, config, extra = {}) {
    assertWebDavConfig(config);
    const started = Date.now();
    const requestBody = JSON.stringify({
        action,
        path: extra.path || '',
        body: extra.body,
        config: {
            endpoint: config.endpoint,
            username: config.username,
            password: config.password,
        },
    });
    let res;
    try {
        res = await fetch(apiPath('/api/sync/webdav'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: requestBody,
        });
    } catch (err) {
        // 请求没送到本站服务端（离线、被拦截），与上游 WebDAV 失败是两类问题。
        recordSyncDiagnostic('sync.webdav.request', 'WebDAV 代理请求未送达', {
            action, path: extra.path || '', requestChars: requestBody.length, ms: Date.now() - started,
        }, 'error');
        throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
        recordSyncDiagnostic('sync.webdav.request', 'WebDAV 请求失败', {
            action, path: extra.path || '', status: res.status, code: data.code || '',
            upstreamStatus: data.upstreamStatus ?? null,
            requestChars: requestBody.length, ms: Date.now() - started,
        }, 'error');
        // 服务端拿不到界面语言，只能回中文兜底 + 机器码；这里按 code 出三语文案。
        // 前面的反向代理嫌请求体太大时直接回 HTML 413、没有机器码，不单独说明的话
        // 用户只会看到一句 "WebDAV put failed"。
        const message = res.status === 413 && !data.code
            ? requestTooLargeMessage(utf8ByteLength(requestBody))
            : localizeApiError(data, tt);
        const error = new Error(message || `WebDAV ${action} failed`);
        error.code = data.code || '';
        error.upstreamStatus = data.upstreamStatus ?? null;
        throw error;
    }
    if (action === 'get') {
        recordSyncDiagnostic('sync.webdav.get', 'WebDAV 读取完成', {
            path: extra.path || '', missing: !!data.missing,
            responseChars: typeof data.body === 'string' ? data.body.length : 0,
            ms: Date.now() - started,
        }, 'debug');
    }
    return data;
}

async function webdavGetJson(path, config) {
    const data = await webdavProxy('get', config, { path });
    if (data.missing) return null;
    if (!data.body) return null;
    return JSON.parse(data.body);
}

async function webdavPutJson(path, value, config) {
    const body = JSON.stringify(value, null, 2);
    // portable 同步每次都整份重传该 key，体积即是每次上传的流量，
    // 也用来判断有没有逼近 /api/sync/webdav 的请求体上限。
    recordSyncDiagnostic('sync.webdav.put', 'WebDAV 写入', { path, chars: body.length }, 'debug');
    await webdavProxy('put', config, { path, body });
}

async function webdavDelete(path, config) {
    await webdavProxy('delete', config, { path });
}

async function webdavCollectionExists(path, config) {
    const data = await webdavProxy('propfind', config, { path });
    return !data.missing;
}

async function ensureWebDavCollection(path, config) {
    if (await webdavCollectionExists(path, config)) return;
    await webdavProxy('mkcol', config, { path });
}

async function ensureWebDavReady(config) {
    assertWebDavConfig(config);
    const baseSegments = (config.basePath || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    let current = '';
    for (const segment of baseSegments) {
        current = joinDavPath(current, segment);
        await ensureWebDavCollection(current, config);
    }
    await ensureWebDavCollection(joinDavPath(config.basePath, KEY_DIR), config);
}

function createEmptyManifest() {
    return {
        type: 'author-sync-manifest-v1',
        version: 1,
        updatedAt: new Date().toISOString(),
        entries: {},
    };
}

// 返回 { manifest, missing, invalid }：清单"不存在"和"存在但是空的"后果完全不同，
// 前者多半是路径/账号指错了地方，合并成一个空清单会让拉取变成静默空转。
async function readManifest(config) {
    const raw = await webdavGetJson(manifestPath(config.basePath), config);
    if (!raw) return { manifest: createEmptyManifest(), missing: true, invalid: false };
    if (raw.type !== 'author-sync-manifest-v1') {
        return { manifest: createEmptyManifest(), missing: false, invalid: true };
    }
    return {
        manifest: {
            ...raw,
            entries: raw.entries && typeof raw.entries === 'object' ? raw.entries : {},
        },
        missing: false,
        invalid: false,
    };
}

async function writeEntriesToWebDav(entries, config) {
    await ensureWebDavReady(config);
    const { manifest } = await readManifest(config);
    const now = new Date().toISOString();

    let done = 0;
    for (const [key, { value, timestamp }] of entries) {
        if (!isSyncableKey(key)) continue;
        const updatedAt = new Date(timestamp || Date.now()).toISOString();

        try {
            if (value === DELETE_MARKER) {
                await webdavDelete(keyPath(config.basePath, key), config);
                manifest.entries[key] = { updatedAt, deleted: true };
            } else {
                await webdavPutJson(keyPath(config.basePath, key), { key, value, updatedAt }, config);
                manifest.entries[key] = { updatedAt, deleted: false };
            }
        } catch (err) {
            // 失败会把全部条目重新入队，不记下断点就无法知道断在哪一条。
            recordSyncDiagnostic('sync.webdav.write', 'WebDAV 写入条目失败', {
                key, done, total: entries.length, code: err?.code || '',
                upstreamStatus: err?.upstreamStatus ?? null,
            }, 'error');
            throw err;
        }
        done++;
    }

    manifest.updatedAt = now;
    // 清单最后写：前面每条都成功、唯独清单没落盘的话，别的设备将看不到这批数据。
    try {
        await webdavPutJson(manifestPath(config.basePath), manifest, config);
    } catch (err) {
        recordSyncDiagnostic('sync.webdav.write', 'WebDAV 清单写入失败', {
            done, total: entries.length, manifestKeys: Object.keys(manifest.entries || {}).length,
            code: err?.code || '', upstreamStatus: err?.upstreamStatus ?? null,
        }, 'error');
        throw err;
    }
}

export async function testWebDavConnection(settingsOverride) {
    const config = await getResolvedWebDavSettings(settingsOverride);
    await ensureWebDavReady(config);
    const testPath = joinDavPath(config.basePath, '.connection-test.json');
    const expected = { ok: true, ts: Date.now() };
    await webdavPutJson(testPath, expected, config);
    const actual = await webdavGetJson(testPath, config);
    await webdavDelete(testPath, config);
    if (!actual?.ok) throw localizedError('WebDAV 测试文件读取失败', 'Failed to read the WebDAV test file.', 'Не удалось прочитать тестовый файл WebDAV.');
    return true;
}

export async function flushPortableSync(options = {}) {
    const { throwOnError = false } = options;
    const settings = loadPortableSyncSettings();
    if (!settings.webdav.enabled) return;

    if (_isSyncing) {
        if (_activeFlushPromise) return await _activeFlushPromise;
        return;
    }

    if (_pendingWrites.size === 0) {
        notifyPortableSyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
        return;
    }

    _isSyncing = true;
    const entries = Array.from(_pendingWrites.entries());
    _pendingWrites.clear();
    for (const [key, data] of entries) _inFlightWrites.set(key, data);
    notifyPortableSyncStatus({ syncing: true, pending: entries.length });

    const flushStarted = Date.now();
    _activeFlushPromise = (async () => {
        const config = await getResolvedWebDavSettings(settings);
        await writeEntriesToWebDav(entries, config);
        recordSyncDiagnostic('sync.webdav.flush', 'WebDAV 推送完成', {
            keys: entries.map(([key]) => key), count: entries.length, ms: Date.now() - flushStarted,
        }, 'info');
        notifyPortableSyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
    })()
        .catch((err) => {
            for (const [key, data] of entries) {
                if (!_pendingWrites.has(key)) _pendingWrites.set(key, data);
            }
            recordSyncDiagnostic('sync.webdav.flush', 'WebDAV 推送失败', {
                keys: entries.map(([key]) => key), count: entries.length,
                requeued: _pendingWrites.size, code: err?.code || '',
                upstreamStatus: err?.upstreamStatus ?? null, ms: Date.now() - flushStarted,
            }, 'error');
            notifyPortableSyncStatus({ syncing: false, pending: _pendingWrites.size, error: err.message });
            throw err;
        })
        .finally(() => {
            _isSyncing = false;
            _activeFlushPromise = null;
            _inFlightWrites.clear(); // 失败的已经重新入队
            persistPendingKeys();
        });

    try {
        return await _activeFlushPromise;
    } catch (err) {
        if (throwOnError) throw err;
    }
}

async function collectSyncableKeys() {
    const { persistGet } = await import('./persistence');
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
    for (const key of _pendingWrites.keys()) keys.add(key);

    return Array.from(keys).filter(isSyncableKey);
}

async function collectLocalEntries() {
    const { persistGet } = await import('./persistence');
    const keys = await collectSyncableKeys();
    const entries = [];
    const now = Date.now();

    for (const key of keys) {
        const value = await persistGet(key);
        if (isDamagedEntry(key, value)) {
            recordSyncDiagnostic('sync.webdav.damaged-local', '本地记录已损坏，未推送到 WebDAV', { key }, 'error');
            continue;
        }
        if (value !== undefined && value !== null) {
            entries.push([key, { value, timestamp: now }]);
        }
    }

    return entries;
}

export async function pushAllToWebDav() {
    const settings = loadPortableSyncSettings();
    if (!settings.webdav.enabled) {
        throw localizedError('请先启用并保存 WebDAV 同步', 'Please enable and save WebDAV sync first.', 'Сначала включите и сохраните синхронизацию WebDAV.');
    }
    const config = await getResolvedWebDavSettings(settings);
    const entries = await collectLocalEntries();
    const started = Date.now();
    await writeEntriesToWebDav(entries, config);
    recordSyncDiagnostic('sync.webdav.push-all', '全量推送到 WebDAV 完成', {
        keys: entries.map(([key]) => key), count: entries.length,
        basePath: config.basePath, ms: Date.now() - started,
    }, 'info');
    notifyPortableSyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
    return entries.length;
}

async function applyRemoteEntries(entries) {
    const { persistSet, persistDel } = await import('./persistence');
    let count = 0;

    if (typeof window !== 'undefined') {
        window._isPortableSyncApplying = true;
        window._isAppForcePulling = true;
        window._isForcePullingBypass = true;
    }

    const restoredKeys = [];
    try {
        for (const entry of entries) {
            if (!entry?.key || !isSyncableKey(entry.key)) continue;
            if (!entry.deleted && isDamagedEntry(entry.key, entry.value)) {
                // 远端这份已损坏：不能拿它盖掉本机可能完好的内容。
                recordSyncDiagnostic('sync.webdav.damaged-remote', '远端记录已损坏，未覆盖本机', { key: entry.key }, 'error');
                continue;
            }
            if (entry.deleted) {
                await persistDel(entry.key);
            } else {
                await persistSet(entry.key, entry.value);
            }
            restoredKeys.push(entry.key);
            count++;
        }
    } finally {
        if (typeof window !== 'undefined') {
            window._isPortableSyncApplying = false;
            window._isAppForcePulling = false;
            window._isForcePullingBypass = false;
        }
        // 这些 key 的本地内容已被导入的数据覆盖，之前没推完的旧版本不能再推回去。
        for (const key of restoredKeys) {
            _pendingWrites.delete(key);
            _resumingKeys.delete(key);
        }
        persistPendingKeys();
    }

    // 恢复进来的条目带的是原设备的 updatedAt（比云端旧），照原样推会被云端判 stale
    // 而永远推不上去，接着还会被云端版本盖回来——用户看到的就是"拉取成功但没生效"。
    // 恢复是用户明确的"以这份为准"，所以让它们以当前时间作为版本推上云端。
    if (restoredKeys.length > 0) {
        try {
            const { markKeysRestored } = await import('./custom-server-sync');
            markKeysRestored(restoredKeys);
        } catch {}
    }

    return count;
}

// 返回 { count, manifestMissing, manifestInvalid, manifestKeys, skipped, basePath }。
// 只返回条数不足以判断成败：清单缺失、清单里列了但远端文件读不到、条目被策略过滤，
// 三种情况都会得到 count = 0，调用方必须能区分，否则"拉取成功 0 项"会被当成成功。
// 只读取 WebDAV 上某一个 key 的内容，不改本地。未启用或没有这个 key 时返回 null。
export async function fetchKeyFromWebDav(key) {
    const settings = loadPortableSyncSettings();
    if (!settings.webdav.enabled || !isSyncableKey(key)) return null;
    const config = await getResolvedWebDavSettings(settings);
    const payload = await webdavGetJson(keyPath(config.basePath, key), config);
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'value')) return null;
    return { value: payload.value, updatedAt: payload.updatedAt || null };
}

export async function pullAllFromWebDav() {
    const settings = loadPortableSyncSettings();
    if (!settings.webdav.enabled) {
        throw localizedError('请先启用并保存 WebDAV 同步', 'Please enable and save WebDAV sync first.', 'Сначала включите и сохраните синхронизацию WebDAV.');
    }
    const config = await getResolvedWebDavSettings(settings);
    const started = Date.now();
    const { manifest, missing, invalid } = await readManifest(config);
    const manifestKeys = Object.keys(manifest.entries || {});
    const remoteEntries = [];
    const skipped = [];

    for (const [key, meta] of Object.entries(manifest.entries || {})) {
        if (!isSyncableKey(key)) {
            skipped.push({ key, reason: 'not-syncable' });
            continue;
        }
        if (meta?.deleted) {
            remoteEntries.push({ key, deleted: true });
            continue;
        }
        const payload = await webdavGetJson(keyPath(config.basePath, key), config);
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'value')) {
            remoteEntries.push({ key, value: payload.value, updatedAt: payload.updatedAt });
        } else {
            // 清单列了这个 key，远端文件却读不到：这是真实的数据缺口，不能默默跳过。
            skipped.push({ key, reason: payload === null ? 'file-missing' : 'no-value-field' });
        }
    }

    const count = await applyRemoteEntries(remoteEntries);
    const result = {
        count,
        manifestMissing: missing,
        manifestInvalid: invalid,
        manifestKeys: manifestKeys.length,
        skipped,
        basePath: config.basePath,
    };
    recordSyncDiagnostic('sync.webdav.pull', '从 WebDAV 拉取结束', {
        ...result, skipped: skipped.slice(0, 20), ms: Date.now() - started,
    }, count > 0 ? 'info' : 'warn');
    notifyPortableSyncStatus({ syncing: false, pending: _pendingWrites.size, lastSync: Date.now() });
    return result;
}

export async function createSyncSnapshot() {
    const entries = (await collectLocalEntries()).map(([key, data]) => ({
        key,
        value: data.value,
        updatedAt: new Date(data.timestamp || Date.now()).toISOString(),
    }));

    return {
        type: 'author-sync-snapshot-v1',
        version: 1,
        createdAt: new Date().toISOString(),
        entries,
    };
}

export async function applySyncSnapshot(snapshot) {
    if (!snapshot || snapshot.type !== 'author-sync-snapshot-v1' || !Array.isArray(snapshot.entries)) {
        throw localizedError('无效的局域网同步数据', 'Invalid LAN sync data.', 'Недопустимые данные синхронизации по локальной сети.');
    }
    return await applyRemoteEntries(snapshot.entries);
}

export async function createLanShare(minutes) {
    const settings = loadPortableSyncSettings();
    const ttlMinutes = Math.max(5, Math.min(120, Number(minutes || settings.lan.shareMinutes) || 30));
    const bundle = await createSyncSnapshot();
    const res = await fetch(apiPath('/api/sync/lan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            action: 'create',
            bundle,
            ttlMs: ttlMinutes * 60 * 1000,
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(localizeApiError(data, tt) || tt('创建局域网分享失败', 'Failed to create LAN share.', 'Не удалось создать общий доступ по локальной сети.'));
    // 桌面端内置服务只对本机开放，手机要走主进程开的分享网关，链接以网关为准。
    if (typeof window !== 'undefined' && window.electronAPI?.openLanShareGateway) {
        let gateway;
        try {
            gateway = await window.electronAPI.openLanShareGateway({ token: data.token, expiresAt: data.expiresAt });
        } catch {
            throw localizedError('无法开启局域网分享端口，请检查防火墙或安全软件设置', 'Could not open the LAN share port. Check your firewall or security software.', 'Не удалось открыть порт для общего доступа по LAN. Проверьте брандмауэр или защитное ПО.');
        }
        return { ...data, urls: Array.isArray(gateway?.urls) ? gateway.urls : [] };
    }
    return data;
}

export async function importLanShare(source) {
    const raw = String(source || '').trim();
    if (!raw) throw localizedError('请填写局域网同步链接、分享码或同步快照', 'Please enter the LAN sync link, share code, or sync snapshot.', 'Укажите ссылку, код общего доступа или снимок синхронизации по локальной сети.');
    if (raw.startsWith('{')) {
        return await applySyncSnapshot(JSON.parse(raw));
    }
    const isLink = /^https?:\/\//i.test(raw);
    const url = isLink ? raw : apiPath(`/api/sync/lan?token=${encodeURIComponent(raw)}`);
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    const snapshot = await res.json().catch(() => null);
    // 只填分享码时只能在本服务器上找；桌面端的分享在另一台机器上，必须用带地址的完整链接。
    if (!isLink && res.status === 404) {
        throw localizedError('没找到这个分享码。在电脑版创建的分享，请粘贴完整链接（以 http:// 开头）', 'Share code not found. For shares created in the desktop app, paste the full link (starting with http://).', 'Код доступа не найден. Для общего доступа из настольного приложения вставьте полную ссылку (начинается с http://).');
    }
    if (!res.ok || snapshot?.error) throw new Error(localizeApiError(snapshot, tt) || tt('读取局域网同步数据失败', 'Failed to read LAN sync data.', 'Не удалось прочитать данные синхронизации по локальной сети.'));
    return await applySyncSnapshot(snapshot);
}
