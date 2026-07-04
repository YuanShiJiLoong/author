'use client';

import { isSyncableKey } from './sync-key-policy';
import { localizedError, tt } from './runtime-i18n';
import { localizeApiError } from './api-error-i18n';
import { apiPath } from './api-base';

const SETTINGS_KEY = 'author-sync-settings';
const SECRET_PREFIX = 'author-sync-secret-';
const DELETE_MARKER = '_AUTHOR_DELETE_';
const SYNC_INTERVAL = 5 * 60 * 1000;
const IDLE_TIMEOUT = 5 * 60 * 1000;
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

const _pendingWrites = new Map();
const _statusListeners = new Set();
let _syncTimer = null;
let _idleTimer = null;
let _isSyncing = false;
let _activeFlushPromise = null;

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

export function portableSyncEnqueue(key, value, options = {}) {
    if (typeof window === 'undefined') return;
    if (window._isPortableSyncApplying) return;
    if (!isSyncableKey(key)) return;

    const settings = loadPortableSyncSettings();
    if (!settings.webdav.enabled) return;

    _pendingWrites.set(key, {
        value: options.deleted ? DELETE_MARKER : value,
        timestamp: Date.now(),
    });
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

async function webdavProxy(action, config, extra = {}) {
    assertWebDavConfig(config);
    const res = await fetch(apiPath('/api/sync/webdav'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            action,
            path: extra.path || '',
            body: extra.body,
            config: {
                endpoint: config.endpoint,
                username: config.username,
                password: config.password,
            },
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
        throw new Error(data.error || `WebDAV ${action} failed`);
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
    await webdavProxy('put', config, {
        path,
        body: JSON.stringify(value, null, 2),
    });
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

async function readManifest(config) {
    const manifest = await webdavGetJson(manifestPath(config.basePath), config);
    if (!manifest || manifest.type !== 'author-sync-manifest-v1') return createEmptyManifest();
    return {
        ...manifest,
        entries: manifest.entries && typeof manifest.entries === 'object' ? manifest.entries : {},
    };
}

async function writeEntriesToWebDav(entries, config) {
    await ensureWebDavReady(config);
    const manifest = await readManifest(config);
    const now = new Date().toISOString();

    for (const [key, { value, timestamp }] of entries) {
        if (!isSyncableKey(key)) continue;
        const updatedAt = new Date(timestamp || Date.now()).toISOString();

        if (value === DELETE_MARKER) {
            await webdavDelete(keyPath(config.basePath, key), config);
            manifest.entries[key] = { updatedAt, deleted: true };
            continue;
        }

        await webdavPutJson(keyPath(config.basePath, key), {
            key,
            value,
            updatedAt,
        }, config);
        manifest.entries[key] = { updatedAt, deleted: false };
    }

    manifest.updatedAt = now;
    await webdavPutJson(manifestPath(config.basePath), manifest, config);
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
    notifyPortableSyncStatus({ syncing: true, pending: entries.length });

    _activeFlushPromise = (async () => {
        const config = await getResolvedWebDavSettings(settings);
        await writeEntriesToWebDav(entries, config);
        notifyPortableSyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
    })()
        .catch((err) => {
            for (const [key, data] of entries) {
                if (!_pendingWrites.has(key)) _pendingWrites.set(key, data);
            }
            notifyPortableSyncStatus({ syncing: false, pending: _pendingWrites.size, error: err.message });
            throw err;
        })
        .finally(() => {
            _isSyncing = false;
            _activeFlushPromise = null;
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
    await writeEntriesToWebDav(entries, config);
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

    try {
        for (const entry of entries) {
            if (!entry?.key || !isSyncableKey(entry.key)) continue;
            if (entry.deleted) {
                await persistDel(entry.key);
            } else {
                await persistSet(entry.key, entry.value);
            }
            count++;
        }
    } finally {
        if (typeof window !== 'undefined') {
            window._isPortableSyncApplying = false;
            window._isAppForcePulling = false;
            window._isForcePullingBypass = false;
        }
    }

    return count;
}

export async function pullAllFromWebDav() {
    const settings = loadPortableSyncSettings();
    if (!settings.webdav.enabled) {
        throw localizedError('请先启用并保存 WebDAV 同步', 'Please enable and save WebDAV sync first.', 'Сначала включите и сохраните синхронизацию WebDAV.');
    }
    const config = await getResolvedWebDavSettings(settings);
    const manifest = await readManifest(config);
    const remoteEntries = [];

    for (const [key, meta] of Object.entries(manifest.entries || {})) {
        if (!isSyncableKey(key)) continue;
        if (meta?.deleted) {
            remoteEntries.push({ key, deleted: true });
            continue;
        }
        const payload = await webdavGetJson(keyPath(config.basePath, key), config);
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'value')) {
            remoteEntries.push({ key, value: payload.value, updatedAt: payload.updatedAt });
        }
    }

    const count = await applyRemoteEntries(remoteEntries);
    notifyPortableSyncStatus({ syncing: false, pending: _pendingWrites.size, lastSync: Date.now() });
    return count;
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
    return data;
}

export async function importLanShare(source) {
    const raw = String(source || '').trim();
    if (!raw) throw localizedError('请填写局域网同步链接、分享码或同步快照', 'Please enter the LAN sync link, share code, or sync snapshot.', 'Укажите ссылку, код общего доступа или снимок синхронизации по локальной сети.');
    if (raw.startsWith('{')) {
        return await applySyncSnapshot(JSON.parse(raw));
    }
    const url = /^https?:\/\//i.test(raw)
        ? raw
        : apiPath(`/api/sync/lan?token=${encodeURIComponent(raw)}`);
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    const snapshot = await res.json().catch(() => null);
    if (!res.ok || snapshot?.error) throw new Error(localizeApiError(snapshot, tt) || tt('读取局域网同步数据失败', 'Failed to read LAN sync data.', 'Не удалось прочитать данные синхронизации по локальной сети.'));
    return await applySyncSnapshot(snapshot);
}
