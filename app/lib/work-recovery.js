// 作品打不开时的恢复：找出所有能恢复的版本，程序自己挑最新的放在第一个，
// 用户只需要点“恢复”。恢复前，读不出的原记录会另存一份在本机，不会删掉任何东西。

import { get, set } from 'idb-keyval';
import { getSnapshots, getSnapshotChapters, restoreSnapshot } from './snapshots';
import { saveChapters } from './storage';

const MAX_SNAPSHOT_OPTIONS = 5;

function chaptersKey(workId) {
    return `author-chapters-${workId}`;
}

function countChapters(chapters) {
    return Array.isArray(chapters) ? chapters.filter(ch => ch && (ch.type || 'chapter') !== 'volume').length : 0;
}

function summarize(chapters) {
    let words = 0;
    let latest = 0;
    for (const ch of chapters) {
        if (!ch || (ch.type || 'chapter') === 'volume') continue;
        words += Number(ch.wordCount) || 0;
        const edited = Date.parse(ch.updatedAt || '');
        if (Number.isFinite(edited) && edited > latest) latest = edited;
    }
    return { chapterCount: countChapters(chapters), totalWords: words, lastEditedAt: latest || null };
}

// 云端不记章节顺序：按已知的顺序排，不在其中的放在最后（保持原来的先后）。
function orderLike(chapters, order) {
    if (!order.length) return chapters;
    const position = new Map(order.map((id, index) => [id, index]));
    return chapters
        .map((chapter, index) => ({ chapter, index, pos: position.get(chapter?.id) }))
        .sort((a, b) => {
            if (a.pos != null && b.pos != null) return a.pos - b.pos;
            if (a.pos != null) return -1;
            if (b.pos != null) return 1;
            return a.index - b.index;
        })
        .map(entry => entry.chapter);
}

async function attempt(read) {
    try { return await read(); } catch (error) {
        console.warn('[recovery] source unavailable:', error?.message);
        return null;
    }
}

async function cloudSync() {
    const auth = await import('./custom-auth');
    if (!auth.isCustomServerConfigured?.() || !auth.isCustomSignedIn?.()) return null;
    return import('./custom-server-sync');
}

const SOURCE_PRIORITY = { cloud: 0, webdav: 1, snapshot: 2 };

/**
 * 找出这部作品所有可恢复的版本，最新的在最前面。
 * 每个版本：{ source: 'cloud'|'webdav'|'snapshot', time, chapterCount, totalWords, ... }
 */
export async function findRecoveryOptions(workId) {
    const key = chaptersKey(workId);
    const options = [];

    const snapshots = ((await attempt(() => getSnapshots())) || [])
        .filter(s => s?.workId === workId && (s.stats?.chapterCount || 0) > 0)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, MAX_SNAPSHOT_OPTIONS);
    for (const snapshot of snapshots) {
        options.push({
            source: 'snapshot',
            snapshotId: snapshot.id,
            time: snapshot.timestamp || null,
            chapterCount: snapshot.stats?.chapterCount || 0,
            totalWords: snapshot.stats?.totalWords || 0,
        });
    }

    const sync = await attempt(cloudSync);
    if (sync) {
        const cloud = await attempt(() => sync.fetchKeyFromCloud(key));
        if (countChapters(cloud?.value) > 0) {
            const reference = snapshots[0] ? await attempt(() => getSnapshotChapters(snapshots[0].id)) : null;
            const chapters = orderLike(cloud.value, (reference || []).map(ch => ch?.id).filter(Boolean));
            const summary = summarize(chapters);
            options.push({ source: 'cloud', cloud, chapters, time: summary.lastEditedAt, ...summary });
        }
    }

    const webdav = await attempt(async () => (await import('./portable-sync')).fetchKeyFromWebDav(key));
    if (countChapters(webdav?.value) > 0) {
        const summary = summarize(webdav.value);
        options.push({
            source: 'webdav',
            chapters: webdav.value,
            time: summary.lastEditedAt || Date.parse(webdav.updatedAt || '') || null,
            ...summary,
        });
    }

    return options.sort((a, b) => {
        if ((a.time != null) !== (b.time != null)) return a.time != null ? -1 : 1;
        if (a.time !== b.time) return (b.time || 0) - (a.time || 0);
        return SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
    });
}

/** 恢复选中的版本。读不出的原记录先另存一份（只在本机）。 */
export async function restoreRecoveryOption(workId, option) {
    if (option.source === 'snapshot') {
        // 时光机恢复自带“恢复前的备份”，读不出的原始记录也会保留在那份备份里。
        return restoreSnapshot(option.snapshotId, { replaceUnreadable: true });
    }
    const key = chaptersKey(workId);
    const raw = await attempt(() => get(key));
    if (raw !== undefined && raw !== null) {
        await set(`author-unreadable-backup:${key}:${Date.now()}`, raw);
    }
    if (option.source === 'cloud') {
        const sync = await cloudSync();
        if (!sync) throw new Error('Cloud sync is not signed in');
        return sync.applyCloudKeySnapshot(option.cloud, option.chapters);
    }
    return saveChapters(option.chapters, workId, { overwriteDamaged: true });
}
