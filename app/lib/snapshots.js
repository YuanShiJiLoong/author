import { get, set } from 'idb-keyval';
import { getChapters, saveChapters } from './storage';
import { getSettingsNodes, saveSettingsNodes } from './settings';

const SNAPSHOTS_KEY = 'author-snapshots';

/**
 * 获取所有快照
 * @returns {Promise<Array>} 快照列表（按时间倒序）
 */
export async function getSnapshots() {
    try {
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
 * @returns {Promise<object>}
 */
export async function createSnapshot(label, type = 'auto') {
    try {
        const chapters = await getChapters();
        const settingsNodes = await getSettingsNodes();

        const snapshot = {
            id: `snap-${Date.now()}`,
            timestamp: Date.now(),
            label: label || (type === 'auto' ? '自动存档' : '手动存档'),
            type,
            stats: {
                chapterCount: chapters.length,
                totalWords: chapters.reduce((acc, ch) => acc + (ch.wordCount || 0), 0),
                settingCount: settingsNodes.length,
            },
            data: {
                chapters,
                settingsNodes,
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

        await set(SNAPSHOTS_KEY, finalSnapshots);
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

        // 覆盖现有数据
        await saveChapters(target.data.chapters || []);
        await saveSettingsNodes(target.data.settingsNodes || []);

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
