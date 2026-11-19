import { getChapters, saveChapters, validateChapterList } from './storage';
import { getSettingsNodes, saveSettingsNodes, getActiveWorkId, setActiveWorkId } from './settings';
import { getChapterMemoryGroups, saveChapterMemoryGroups } from './chapter-memory-groups';
import { loadSessionStore, saveSessionStore } from './chat-sessions';
import { persistGet, persistSet } from './persistence';
import { del, get, set } from 'idb-keyval';
import { useAppStore } from '../store/useAppStore';

const LEGACY_SNAPSHOTS_KEY = 'author-snapshots';
const SNAPSHOT_INDEX_KEY = 'author-snapshots-index-v2';
const SNAPSHOT_DATA_PREFIX = 'author-snapshot-data-v2:';
const RESTORE_JOURNAL_KEY = 'author-snapshot-restore-pending-v1';
const MAX_AUTO_SNAPSHOTS = 50;
const PREVIEW_CHAPTER_LIMIT = 10;
let snapshotWriteQueue = Promise.resolve();
let nextSnapshotSequence = 0;

function serializeSnapshotWrite(operation) {
    const result = snapshotWriteQueue.then(operation);
    snapshotWriteQueue = result.catch(() => {});
    return result;
}

function newSnapshotId() {
    const suffix = globalThis.crypto?.randomUUID?.() || `${++nextSnapshotSequence}-${Math.random().toString(36).slice(2)}`;
    return `snap-${Date.now()}-${suffix}`;
}

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

async function getChatSessionsForSnapshot(strictRead = false) {
    const inMemoryStore = useAppStore.getState().sessionStore;
    if (isValidSessionStore(inMemoryStore)) {
        if (!strictRead) await saveSessionStore(inMemoryStore);
        return structuredClone(inMemoryStore);
    }
    const persistedStore = strictRead ? await persistGet('author-chat-sessions') : await loadSessionStore();
    if (strictRead && persistedStore != null && !isValidSessionStore(persistedStore)) {
        throw new Error(text('无法读取对话，尚未开始恢复。', 'Cannot read conversations. Restore has not started.'));
    }
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

// 快照内容指纹（cyrb53 + 长度）。只用来判断“和上一份是否完全相同”；
// 偶发误判为不同只会多存一份，不会少存。
function fingerprintSnapshotData(data) {
    const json = JSON.stringify(data);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < json.length; i++) {
        const ch = json.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${json.length}:${(h2 >>> 0).toString(36)}:${(h1 >>> 0).toString(36)}`;
}

function createSnapshotIndexEntry(snapshot) {
    return {
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        label: snapshot.label,
        type: snapshot.type,
        workId: snapshot.data?.workId,
        stats: snapshot.stats || {},
        ...(snapshot.fingerprint ? { fingerprint: snapshot.fingerprint } : {}),
        data: {
            chapters: createChapterPreview(snapshot.data?.chapters),
        },
        storageVersion: 2,
    };
}

function applySnapshotRetention(snapshots, protectedIds = new Set()) {
    const kept = [];
    const removed = [];
    let autoCount = 0;

    for (const snapshot of snapshots) {
        if (snapshot?.type === 'auto') {
            autoCount += 1;
            if (autoCount > MAX_AUTO_SNAPSHOTS && !protectedIds.has(snapshot.id)) {
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
    if (legacySnapshots === undefined) return [];
    if (!Array.isArray(legacySnapshots)) throw new Error(text('无法读取旧版快照列表。', 'Cannot read the legacy snapshot list.', 'Не удалось прочитать старый список снимков.'));

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
    if (index === undefined) return migrateLegacySnapshots();
    if (!Array.isArray(index)) throw new Error(text('无法读取快照列表。', 'Cannot read the snapshot list.', 'Не удалось прочитать список снимков.'));
    return index;
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

export async function getSnapshotChapters(snapshotId) {
    const snapshot = await getSnapshotById(snapshotId);
    validateChapterList(snapshot?.data?.chapters);
    return snapshot.data.chapters;
}

async function restoreWorksIndexForSnapshot(workId, worksIndex) {
    const current = await persistGet('author-works-index');
    if (current != null && !Array.isArray(current)) throw new Error('Cannot read the current works list');
    const currentWorks = Array.isArray(current) ? current : [];
    const savedWork = Array.isArray(worksIndex) ? worksIndex.find(work => work?.id === workId) : null;
    const currentWork = currentWorks.find(work => work?.id === workId);
    if (currentWork) {
        if (!savedWork) return;
        const restoredWork = { ...currentWork, ...savedWork, id: workId };
        // Keep the current position; a snapshot may refer to a folder that no longer exists.
        for (const key of ['parentId', 'order']) {
            if (Object.hasOwn(currentWork, key)) restoredWork[key] = currentWork[key];
        }
        if (restoredWork.parentId && !currentWorks.some(work => work?.id === restoredWork.parentId)) {
            restoredWork.parentId = null;
        }
        await persistSet('author-works-index', currentWorks.map(work => work?.id === workId ? restoredWork : work));
        return;
    }

    const now = new Date().toISOString();
    await persistSet('author-works-index', [
        ...currentWorks,
        {
            name: text('恢复的作品', 'Restored Work', 'Восстановленное произведение'),
            type: 'work',
            category: 'work',
            icon: '',
            order: currentWorks.length,
            createdAt: now,
            updatedAt: now,
            ...savedWork,
            id: workId,
            parentId: savedWork?.parentId && currentWorks.some(work => work?.id === savedWork.parentId) ? savedWork.parentId : null,
        },
    ]);
}

/**
 * 获取所有快照（从本地 IndexedDB 读取，不走云同步）
 * @returns {Promise<Array>} 快照列表（按时间倒序）
 */
export async function getSnapshots() {
    return getSnapshotIndex();
}

/**
 * 创建新快照
 * @param {string} label - 快照标签描述
 * @param {string} type - 'auto' | 'manual'
 * @returns {Promise<object|null>} 自动快照与最近一份内容相同时跳过，返回 null
 */
export function createSnapshot(label, type = 'auto', options = {}) {
    const workId = options.workId || getActiveWorkId() || 'work-default';
    return serializeSnapshotWrite(() => createSnapshotNow(label, type, { ...options, workId }));
}

async function readBackupArray(key) {
    const value = await persistGet(key);
    if (value == null) return [];
    if (!Array.isArray(value)) throw new Error(text('无法读取当前作品，尚未开始恢复。', 'Cannot read the current work. Restore has not started.'));
    return value;
}

export const CURRENT_UNREADABLE_CODE = 'SNAPSHOT_CURRENT_UNREADABLE';

function currentUnreadableError(cause) {
    const error = new Error(text(
        '这部作品现在打不开，没法在恢复前先给它做备份。',
        "This work can't be opened right now, so it can't be backed up first.",
        'Это произведение сейчас не открывается, поэтому его нельзя сначала сохранить.',
    ));
    error.code = CURRENT_UNREADABLE_CODE;
    error.cause = cause;
    return error;
}

// 恢复前的备份：某部分读不出时先停下，交给用户确认。确认后跳过这部分继续恢复，
// 浏览器里还能取到的原始值（格式坏但没丢）原样留在备份里；连原始值都取不到的已无法保存。
async function readCurrentForBackup(part, key, readValid, { replaceUnreadable, unreadable }) {
    try {
        return await readValid();
    } catch (error) {
        if (!replaceUnreadable) throw currentUnreadableError(error);
        let raw;
        try { raw = await get(key); } catch { raw = undefined; }
        unreadable[part] = raw === undefined ? null : raw;
        return [];
    }
}

async function createSnapshotNow(label, type, { workId, strictRead = false, replaceUnreadable = false, protectedIds: extraProtectedIds = [] }) {
    try {
        await flushPendingEditorBeforeSnapshot();
        const unreadable = {};
        const backupRead = { replaceUnreadable, unreadable };
        const chapters = strictRead
            ? await readCurrentForBackup('chapters', `author-chapters-${workId}`, () => getChapters(workId, { requireStored: false }), backupRead)
            : await getChapters(workId, { requireStored: true });
        const settingsNodes = strictRead
            ? await readCurrentForBackup('settingsNodes', `author-settings-nodes-${workId}`, () => readBackupArray(`author-settings-nodes-${workId}`), backupRead)
            : await getSettingsNodes(workId);
        const chapterMemoryGroups = strictRead
            ? await readCurrentForBackup('chapterMemoryGroups', `author-chapter-memory-groups-${workId}`, () => readBackupArray(`author-chapter-memory-groups-${workId}`), backupRead)
            : await getChapterMemoryGroups(workId);
        const hasUnreadable = Object.keys(unreadable).length > 0;
        const worksIndex = await persistGet('author-works-index');
        if (strictRead && worksIndex != null && !Array.isArray(worksIndex)) throw new Error('Cannot read the current works list');
        const chatSessions = await getChatSessionsForSnapshot(strictRead);
        const chatMessageCount = chatSessions.sessions.reduce((sum, session) => (
            sum + (Array.isArray(session.messages) ? session.messages.length : 0)
        ), 0);

        const baseLabel = label || (type === 'auto'
            ? text('自动存档', 'Auto Snapshot', 'Автоснимок')
            : text('手动存档', 'Manual Snapshot', 'Ручной снимок'));
        const snapshot = {
            id: newSnapshotId(),
            timestamp: Date.now(),
            label: hasUnreadable
                ? baseLabel + text('（部分内容读不出，未能备份）', ' (some content was unreadable and not backed up)', ' (часть содержимого не читалась и не сохранена)')
                : baseLabel,
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
                worksIndex: Array.isArray(worksIndex) ? worksIndex.filter(work => work?.id === workId) : null,
                chapters,
                settingsNodes,
                chapterMemoryGroups,
                chatSessions,
                ...(hasUnreadable ? { unreadable } : {}),
            }
        };
        snapshot.fingerprint = fingerprintSnapshotData(snapshot.data);

        const existingIndex = await getSnapshotIndex();
        // 内容和这部作品最近一份快照完全相同时不再自动存档。否则程序挂一夜，
        // 几十份一模一样的自动快照会把更早的历史全部挤出保留上限。
        if (type === 'auto' && existingIndex.find(s => s?.workId === workId)?.fingerprint === snapshot.fingerprint) {
            return null;
        }
        const nextIndex = [
            createSnapshotIndexEntry(snapshot),
            ...existingIndex.filter(s => s?.id !== snapshot.id),
        ];
        const pending = await getPendingSnapshotRestore();
        const protectedIds = new Set([...extraProtectedIds, ...(pending ? [pending.snapshotId, pending.backupId] : [])]);
        const { kept, removed } = applySnapshotRetention(nextIndex, protectedIds);

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
// options.replaceUnreadable：当前作品有读不出的内容时，用户已确认用快照替换它们。
export function restoreSnapshot(snapshotId, options = {}) {
    return serializeSnapshotWrite(() => restoreSnapshotNow(snapshotId, options));
}

export async function getPendingSnapshotRestore() {
    const journal = await get(RESTORE_JOURNAL_KEY);
    return journal && journal.phase !== 'completed' ? journal : null;
}

function mergeRestoredSessions(current, saved, restoreId) {
    const sessions = structuredClone(current.sessions);
    const restoredIds = new Map();
    for (const session of saved.sessions) {
        if (!session || typeof session.id !== 'string') continue;
        const existing = sessions.find(item => item.id === session.id);
        if (!existing) {
            sessions.push(structuredClone(session));
            restoredIds.set(session.id, session.id);
        } else if (JSON.stringify(existing) === JSON.stringify(session)) {
            restoredIds.set(session.id, session.id);
        } else {
            // Conversation history is global. Keep later edits and restore older versions as copies.
            const id = `restored-${restoreId}-${session.id}`;
            if (!sessions.some(item => item.id === id)) {
                sessions.push({ ...structuredClone(session), id, title: text('恢复的对话：', 'Restored conversation: ', 'Восстановленный диалог: ') + (session.title || '') });
            }
            restoredIds.set(session.id, id);
        }
    }
    return { ...current, sessions, activeSessionId: restoredIds.get(saved.activeSessionId) || current.activeSessionId };
}

async function restoreSnapshotNow(snapshotId, { replaceUnreadable = false } = {}) {
    let journal;
    try {
        const target = await getSnapshotById(snapshotId);
        if (!target) throw new Error('Snapshot not found');
        const data = target.data || {};
        const workId = data.workId || getActiveWorkId() || 'work-default';
        if (!Array.isArray(data.chapters) || !Array.isArray(data.settingsNodes)) {
            throw new Error(text('快照内容不完整，未修改作品。', 'Snapshot is incomplete. No work was changed.'));
        }
        validateChapterList(data.chapters);
        const pending = await getPendingSnapshotRestore();
        if (pending && snapshotId !== pending.snapshotId && snapshotId !== pending.backupId) {
            throw new Error(text('请先重试上次恢复，或恢复其备份。', 'Retry the unfinished restore or restore its backup first.'));
        }
        if (pending?.snapshotId === snapshotId) {
            if (pending.workId !== workId || !await getSnapshotById(pending.backupId)) {
                throw new Error(text('找不到恢复前的备份，已停止恢复。', 'The backup before restore is missing. Restore stopped.'));
            }
            journal = { ...pending, phase: 'applying' };
        } else {
            const backup = await createSnapshotNow(text('恢复前的备份', 'Backup before restore', 'Резервная копия перед восстановлением'), 'manual', { workId, strictRead: true, replaceUnreadable, protectedIds: [snapshotId] });
            journal = { id: newSnapshotId(), snapshotId, backupId: backup.id, workId, phase: 'applying', startedAt: Date.now() };
        }
        // Persist recovery information before changing any work data, including on retries.
        await set(RESTORE_JOURNAL_KEY, journal);

        const previousAwaitServerWrite = window._forcePersistAwaitServerWrite;
        window._forcePersistAwaitServerWrite = true;
        try {
            // 走到这里时，当前内容已备份，或用户已确认替换读不出的部分，或是在续做有备份的恢复。
            await saveChapters(data.chapters, workId, { overwriteDamaged: true });
            await saveSettingsNodes(data.settingsNodes, workId);
            if (Array.isArray(data.chapterMemoryGroups)) {
                await saveChapterMemoryGroups(data.chapterMemoryGroups, workId);
            }
            if (isValidSessionStore(data.chatSessions)) {
                const current = await getChatSessionsForSnapshot(true);
                const restored = mergeRestoredSessions(current, data.chatSessions, journal.id);
                // The usual chat save helper suppresses errors; recovery must observe write failures.
                await persistSet('author-chat-sessions', restored);
                useAppStore.getState().setSessionStore(restored);
            }
            await restoreWorksIndexForSnapshot(workId, data.worksIndex);
            await set(RESTORE_JOURNAL_KEY, { ...journal, phase: 'completed', completedAt: Date.now() });
            setActiveWorkId(workId);
        } finally {
            window._forcePersistAwaitServerWrite = previousAwaitServerWrite;
        }

        return true;
    } catch (e) {
        if (journal) {
            // If this update also fails, the durable "applying" record still supports recovery.
            await set(RESTORE_JOURNAL_KEY, { ...journal, phase: 'failed' }).catch(() => {});
        }
        console.error('Failed to restore snapshot:', e);
        throw e;
    }
}

/**
 * 删除指定快照
 */
export function deleteSnapshot(snapshotId) {
    return serializeSnapshotWrite(() => deleteSnapshotNow(snapshotId));
}

async function deleteSnapshotNow(snapshotId) {
    const pending = await getPendingSnapshotRestore();
    if (pending && [pending.snapshotId, pending.backupId].includes(snapshotId)) {
        throw new Error(text('此快照用于完成上次恢复，暂时不能删除。', 'This snapshot is needed for the unfinished restore and cannot be deleted yet.'));
    }
    const snapshots = await getSnapshotIndex();
    const remaining = snapshots.filter(s => s.id !== snapshotId);
    await saveSnapshotIndex(remaining);
    await del(getSnapshotDataKey(snapshotId)).catch(() => { });
    return remaining;
}
