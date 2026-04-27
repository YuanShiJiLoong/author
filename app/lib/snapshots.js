import { persistGet, persistSet } from './persistence';
import { getChapters, saveChapters } from './storage';
import { getSettingsNodes, saveSettingsNodes, getActiveWorkId } from './settings';
import { loadSessionStore, saveSessionStore } from './chat-sessions';
import { get, set } from 'idb-keyval';
import { useAppStore } from '../store/useAppStore';

const SNAPSHOTS_KEY = 'author-snapshots';
const CLOUD_SNAPSHOT_KEY = 'author-snapshot-latest'; // 云端仅保留最新一次

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

/**
 * 获取所有快照（从本地 IndexedDB 读取，不走云同步）
 * @returns {Promise<Array>} 快照列表（按时间倒序）
 */
export async function getSnapshots() {
    try {
        // 优先从 IndexedDB 读取（本地存储，不同步到云端）
        const snapshots = await get(SNAPSHOTS_KEY);
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

        const existing = await getSnapshots();
        existing.unshift(snapshot); // 最新在前

        // 限制自动快照数量（例如最多保留 50 个自动快照，超出的按时间删除）
        const maxAutoSnapshots = 50;
        let finalSnapshots = existing;
        const autoSnapshots = existing.filter(s => s.type === 'auto');
        if (autoSnapshots.length > maxAutoSnapshots) {
            const toRemove = autoSnapshots.slice(maxAutoSnapshots).map(s => s.id);
            finalSnapshots = existing.filter(s => !toRemove.includes(s.id));
        }

        // 保存到本地 IndexedDB（不走 persistSet，避免同步到云端）
        await set(SNAPSHOTS_KEY, finalSnapshots);

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
        const snapshots = await getSnapshots();
        const target = snapshots.find(s => s.id === snapshotId);
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
    const snapshots = await getSnapshots();
    const remaining = snapshots.filter(s => s.id !== snapshotId);
    await set(SNAPSHOTS_KEY, remaining);
    return remaining;
}
