import { persistGet, persistSet } from './persistence';
import { getChapters, saveChapters } from './storage';
import { getSettingsNodes, saveSettingsNodes, getActiveWorkId } from './settings';
import { loadSessionStore, saveSessionStore } from './chat-sessions';
import { del, get, set } from 'idb-keyval';
import { useAppStore } from '../store/useAppStore';

const LEGACY_SNAPSHOTS_KEY = 'author-snapshots';
const SNAPSHOT_INDEX_KEY = 'author-snapshots-index-v2';
const SNAPSHOT_DATA_PREFIX = 'author-snapshot-data-v2:';
const CLOUD_SNAPSHOT_KEY = 'author-snapshot-latest'; // 云端仅保留最新一次
const MAX_AUTO_SNAPSHOTS = 50;
const PREVIEW_CHAPTER_LIMIT = 10;

async function flushPendingEditorBeforeSnapshot() {
    const flushPendingEditorSave = useAppStore.getState().flushPendingEditorSave;
    if (typeof flushPendingEditorSave === 'function') {
        await flushPendingEditorSave();
    }
}

function isValidSessionStore(store) {
    return store && typeof store === 'object' && Array.isArray(store.sessions);
}

async function getChatSessionsForSnapshot() {
    const inMemoryStore = useAppStore.getState().sessionStore;
    if (isValidSessionStore(inMemoryStore)) {
        await saveSessionStore(inMemoryStore);
        return inMemoryStore;
    }
    const persistedStore = await loadSessionStore();
    return isValidSessionStore(persistedStore)
        ? persistedStore
        : { activeSessionId: null, sessions: [] };
}

function createCloudSnapshotPayload(snapshot) {
    return {
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        label: snapshot.label,
        type: snapshot.type,
        stats: {
            chapterCount: snapshot.stats?.chapterCount || 0,
            totalWords: snapshot.stats?.totalWords || 0,
            settingCount: snapshot.stats?.settingCount || 0,
        },
        data: {
            chapters: snapshot.data?.chapters || [],
            settingsNodes: snapshot.data?.settingsNodes || [],
        },
    };
}

function getSnapshotDataKey(snapshotId) {
    return `${SNAPSHOT_DATA_PREFIX}${snapshotId}`;
}

function createChapterPreview(chapters = []) {
    if (!Array.isArray(chapters)) return [];
    return chapters.slice(0, PREVIEW_CHAPTER_LIMIT).map(ch => ({
        id: ch?.id,
        title: ch?.title || '',
    }));
}

function createSnapshotIndexEntry(snapshot) {
    return {
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        label: snapshot.label,
        type: snapshot.type,
        stats: snapshot.stats || {},
        data: {
            chapters: createChapterPreview(snapshot.data?.chapters),
        },
        storageVersion: 2,
    };
}

function applySnapshotRetention(snapshots) {
    const kept = [];
    const removed = [];
    let autoCount = 0;

    for (const snapshot of snapshots) {
        if (snapshot?.type === 'auto') {
            autoCount += 1;
            if (autoCount > MAX_AUTO_SNAPSHOTS) {
                removed.push(snapshot.id);
                continue;
            }
        }
        kept.push(snapshot);
    }

    return { kept, removed };
}

async function migrateLegacySnapshots() {
    const legacySnapshots = await get(LEGACY_SNAPSHOTS_KEY);
    if (!Array.isArray(legacySnapshots)) return [];

    const { kept } = applySnapshotRetention(legacySnapshots);
    const index = kept.map(createSnapshotIndexEntry);

    try {
        for (const snapshot of kept) {
            await set(getSnapshotDataKey(snapshot.id), snapshot);
        }
        await set(SNAPSHOT_INDEX_KEY, index);
        await del(LEGACY_SNAPSHOTS_KEY);
        console.info(`[snapshots] Migrated ${index.length} snapshots to split storage.`);
    } catch (e) {
        console.warn('[snapshots] Legacy snapshot migration failed; keeping legacy storage:', e);
        return legacySnapshots.map(createSnapshotIndexEntry);
    }

    return index;
}

async function getSnapshotIndex() {
    const index = await get(SNAPSHOT_INDEX_KEY);
    if (Array.isArray(index)) return index;
    return migrateLegacySnapshots();
}

async function saveSnapshotIndex(index) {
    await set(SNAPSHOT_INDEX_KEY, index);
}

async function getSnapshotById(snapshotId) {
    const splitSnapshot = await get(getSnapshotDataKey(snapshotId));
    if (splitSnapshot) return splitSnapshot;

    const legacySnapshots = await get(LEGACY_SNAPSHOTS_KEY);
    if (Array.isArray(legacySnapshots)) {
        return legacySnapshots.find(s => s?.id === snapshotId) || null;
    }

    return null;
}

/**
 * 获取所有快照（从本地 IndexedDB 读取，不走云同步）
 * @returns {Promise<Array>} 快照列表（按时间倒序）
 */
export async function getSnapshots() {
    try {
        // 读取轻量索引，完整快照按需读取，避免每次都克隆整份历史数据。
        const snapshots = await getSnapshotIndex();
        return Array.isArray(snapshots) ? snapshots : [];
    } catch (e) {
        console.error('Failed to get snapshots:', e);
        return [];
    }
}

/**
 * 创建新快照
 * @param {string} label - 快照标签描述
 * @param {string} type - 'auto' | 'manual'
 * @param {{ syncLatestToCloud?: boolean }} options
 * @returns {Promise<object>}
 */
export async function createSnapshot(label, type = 'auto', options = {}) {
    try {
        const { syncLatestToCloud = true } = options;
        await flushPendingEditorBeforeSnapshot();
        const chapters = await getChapters(getActiveWorkId());
        const settingsNodes = await getSettingsNodes();
        const chatSessions = await getChatSessionsForSnapshot();
        const chatMessageCount = chatSessions.sessions.reduce((sum, session) => (
            sum + (Array.isArray(session.messages) ? session.messages.length : 0)
        ), 0);

        const snapshot = {
            id: `snap-${Date.now()}`,
            timestamp: Date.now(),
            label: label || (type === 'auto' ? '自动存档' : '手动存档'),
            type,
            stats: {
                chapterCount: chapters.length,
                totalWords: chapters.reduce((acc, ch) => acc + (ch.wordCount || 0), 0),
                settingCount: settingsNodes.length,
                chatSessionCount: chatSessions.sessions.length,
                chatMessageCount,
            },
            data: {
                chapters,
                settingsNodes,
                chatSessions,
            }
        };

        const existingIndex = await getSnapshotIndex();
        const nextIndex = [
            createSnapshotIndexEntry(snapshot),
            ...existingIndex.filter(s => s?.id !== snapshot.id),
        ];
        const { kept, removed } = applySnapshotRetention(nextIndex);

        // 完整快照按 ID 分开保存，新增快照不再重写整个历史数组。
        await set(getSnapshotDataKey(snapshot.id), snapshot);
        await saveSnapshotIndex(kept);
        await Promise.all(removed.map(id => del(getSnapshotDataKey(id)).catch(() => { })));

        // 仅将最新一次快照同步到云端（轻量元数据 + 数据）
        if (syncLatestToCloud) {
            try {
                await persistSet(CLOUD_SNAPSHOT_KEY, createCloudSnapshotPayload(snapshot));
            } catch {
                // 云同步失败不影响本地
            }
        }

        return snapshot;
    } catch (e) {
        console.error('Failed to create snapshot:', e);
        throw e;
    }
}

/**
 * 恢复到指定快照
 * @param {string} snapshotId
 * @returns {Promise<boolean>}
 */
export async function restoreSnapshot(snapshotId) {
    try {
        const target = await getSnapshotById(snapshotId);
        if (!target) throw new Error('Snapshot not found');

        // 发起静默的当前状态备份，以防后悔
        await createSnapshot('恢复前的备份', 'auto');

        const data = target.data || {};

        // 覆盖现有数据
        await saveChapters(data.chapters || [], getActiveWorkId());
        await saveSettingsNodes(data.settingsNodes || []);
        if (isValidSessionStore(data.chatSessions)) {
            await saveSessionStore(data.chatSessions);
            useAppStore.getState().setSessionStore(data.chatSessions);
        }

        return true;
    } catch (e) {
        console.error('Failed to restore snapshot:', e);
        throw e;
    }
}

/**
 * 删除指定快照
 */
export async function deleteSnapshot(snapshotId) {
    const snapshots = await getSnapshotIndex();
    const remaining = snapshots.filter(s => s.id !== snapshotId);
    await saveSnapshotIndex(remaining);
    await del(getSnapshotDataKey(snapshotId)).catch(() => { });
    return remaining;
}
