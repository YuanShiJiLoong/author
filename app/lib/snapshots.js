import { getChapters, saveChapters } from './storage';
import { getSettingsNodes, saveSettingsNodes, getActiveWorkId, setActiveWorkId } from './settings';
import { getChapterMemoryGroups, saveChapterMemoryGroups } from './chapter-memory-groups';
import { loadSessionStore, saveSessionStore } from './chat-sessions';
import { persistGet, persistSet } from './persistence';
import { del, get, set } from 'idb-keyval';
import { useAppStore } from '../store/useAppStore';

const LEGACY_SNAPSHOTS_KEY = 'author-snapshots';
const SNAPSHOT_INDEX_KEY = 'author-snapshots-index-v2';
const SNAPSHOT_DATA_PREFIX = 'author-snapshot-data-v2:';
const MAX_AUTO_SNAPSHOTS = 50;
const PREVIEW_CHAPTER_LIMIT = 10;

function getCurrentLanguage() {
    if (typeof window === 'undefined') return 'zh';
    return useAppStore.getState().language || localStorage.getItem('author-lang') || 'zh';
}

function text(zh, en, ru = en) {
    const lang = getCurrentLanguage();
    if (lang === 'en') return en;
    if (lang === 'ru') return ru || en;
    return zh;
}

async function flushPendingEditorBeforeSnapshot() {
    const flushPendingLocalSave = useAppStore.getState().flushPendingLocalSave;
    if (typeof flushPendingLocalSave === 'function') {
        await flushPendingLocalSave();
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

async function restoreWorksIndexForSnapshot(workId, worksIndex) {
    if (Array.isArray(worksIndex)) {
        await persistSet('author-works-index', worksIndex);
        return;
    }

    const current = await persistGet('author-works-index');
    const currentWorks = Array.isArray(current) ? current : [];
    if (currentWorks.some(work => work?.id === workId)) return;

    const now = new Date().toISOString();
    await persistSet('author-works-index', [
        ...currentWorks,
        {
            id: workId,
            name: text('恢复的作品', 'Restored Work', 'Восстановленное произведение'),
            type: 'work',
            category: 'work',
            icon: '',
            order: currentWorks.length,
            createdAt: now,
            updatedAt: now,
        },
    ]);
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
 * @returns {Promise<object>}
 */
export async function createSnapshot(label, type = 'auto') {
    try {
        await flushPendingEditorBeforeSnapshot();
        const workId = getActiveWorkId() || 'work-default';
        const chapters = await getChapters(workId);
        const settingsNodes = await getSettingsNodes(workId);
        const chapterMemoryGroups = await getChapterMemoryGroups(workId);
        const worksIndex = await persistGet('author-works-index');
        const chatSessions = await getChatSessionsForSnapshot();
        const chatMessageCount = chatSessions.sessions.reduce((sum, session) => (
            sum + (Array.isArray(session.messages) ? session.messages.length : 0)
        ), 0);

        const snapshot = {
            id: `snap-${Date.now()}`,
            timestamp: Date.now(),
            label: label || (type === 'auto'
                ? text('自动存档', 'Auto Snapshot', 'Автоснимок')
                : text('手动存档', 'Manual Snapshot', 'Ручной снимок')),
            type,
            stats: {
                chapterCount: chapters.length,
                totalWords: chapters.reduce((acc, ch) => acc + (ch.wordCount || 0), 0),
                settingCount: settingsNodes.length,
                chapterMemoryGroupCount: chapterMemoryGroups.length,
                chatSessionCount: chatSessions.sessions.length,
                chatMessageCount,
            },
            data: {
                workId,
                worksIndex: Array.isArray(worksIndex) ? worksIndex : null,
                chapters,
                settingsNodes,
                chapterMemoryGroups,
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

        // 快照只保存在本机 IndexedDB。完整快照经常超过 Firestore 单文档 1MiB
        // 限制；云同步只同步作品索引、章节和设定集节点。

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
        await createSnapshot(text('恢复前的备份', 'Backup before restore', 'Резервная копия перед восстановлением'), 'auto');

        const data = target.data || {};
        const workId = data.workId || getActiveWorkId() || 'work-default';

        window._forcePersistAwaitServerWrite = true;
        try {
            // 覆盖现有数据。恢复后马上刷新页面，所以这里必须等服务端存储也落盘。
            await restoreWorksIndexForSnapshot(workId, data.worksIndex);
            setActiveWorkId(workId);
            await saveChapters(data.chapters || [], workId);
            await saveSettingsNodes(data.settingsNodes || [], workId);
            if (Array.isArray(data.chapterMemoryGroups)) {
                await saveChapterMemoryGroups(data.chapterMemoryGroups, workId);
            }
            if (isValidSessionStore(data.chatSessions)) {
                await saveSessionStore(data.chatSessions);
                useAppStore.getState().setSessionStore(data.chatSessions);
            }
        } finally {
            window._forcePersistAwaitServerWrite = false;
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
