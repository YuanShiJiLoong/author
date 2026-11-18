import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const moduleUrl = new URL('../app/lib/snapshots.js', import.meta.url);
const storageUrl = new URL('../app/lib/storage.js', import.meta.url);
const projectUrl = new URL('../app/lib/project-io.js', import.meta.url);
let instance = 0;
const targetSnapshot = () => ({
    id: 'old-a', timestamp: 1, type: 'manual', label: 'Older A',
    data: { workId: 'a', worksIndex: [{ id: 'a', name: 'Old A' }], chapters: [{ id: 'chapter-a', content: 'old a' }], settingsNodes: [], chapterMemoryGroups: [] },
});

async function fixture(t, persisted = {}) {
    const values = persisted.values || new Map([
        ['author-works-index', [{ id: 'a', name: 'Current A' }, { id: 'b', name: 'Current B' }]],
        ['author-chapters-a', [{ id: 'chapter-a', content: 'current a' }]],
        ['author-chapters-b', [{ id: 'chapter-b', content: 'current b' }]],
        ['author-settings-nodes-a', []], ['author-chapter-memory-groups-a', []],
    ]);
    const target = persisted.snapshots?.get('author-snapshot-data-v2:old-a') || targetSnapshot();
    const snapshots = persisted.snapshots || new Map([['author-snapshots-index-v2', [target]], ['author-snapshot-data-v2:old-a', target]]);
    let activeWorkId = 'b';
    const app = { language: 'en', sessionStore: { activeSessionId: null, sessions: [] }, setSessionStore: store => { app.sessionStore = store; } };
    const savedGlobals = new Map(['window', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
    t.after(() => { for (const [key, descriptor] of savedGlobals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
    t.mock.method(console, 'error', () => {});
    const writes = [];
    const env = {
        app,
        getActive: () => activeWorkId,
        setActive: value => { activeWorkId = value; },
        read: async key => {
            if (env.failReadKey === key) throw new Error('Synthetic read failure');
            return structuredClone(values.get(key));
        },
        write: async (key, value) => {
            if (env.failKey === key) throw new Error('Synthetic write failure');
            values.set(key, structuredClone(value)); writes.push(key);
        },
        get: async key => structuredClone(snapshots.get(key)),
        set: async (key, value) => {
            if (env.failSnapshotWrite || env.failSnapshotKey === key || (env.failJournalPhase && env.failJournalPhase === value?.phase)) throw new Error('Snapshot unavailable');
            snapshots.set(key, structuredClone(value));
        },
        del: async key => snapshots.delete(key),
    };
    const mockUrl = `data:text/javascript,${encodeURIComponent(`
        // fixture ${++instance}
        let env;
        export function configure(value) { env = value; }
        export const persistGet = async (key, options = {}) => {
            const value = await env.read(key);
            if (value !== undefined) options.validateValue?.(value);
            return value;
        };
        export const persistDel = () => { throw new Error('Unexpected chapter deletion'); };
        export const persistSet = (key, value) => env.write(key, value);
        export const get = key => env.get(key);
        export const set = (key, value) => env.set(key, value);
        export const del = key => env.del(key);
        export const getSettingsNodes = id => env.read('author-settings-nodes-' + id).then(value => value || []);
        export const saveSettingsNodes = (value, id) => env.write('author-settings-nodes-' + id, value);
        export const getChapterMemoryGroups = id => env.read('author-chapter-memory-groups-' + id).then(value => value || []);
        export const saveChapterMemoryGroups = (value, id) => env.write('author-chapter-memory-groups-' + id, value);
        export const getActiveWorkId = () => env.getActive();
        export const getAllWorks = () => env.read('author-works-index');
        export const setActiveWorkId = value => env.setActive(value);
        export const loadSessionStore = () => Promise.resolve(env.app.sessionStore);
        export const saveSessionStore = value => env.write('author-chat-sessions', value);
        export const useAppStore = { getState: () => env.app };
    `)}`;
    (await import(mockUrl)).configure(env);
    const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
        if ((context.parentURL?.startsWith(moduleUrl.href) || context.parentURL?.startsWith(projectUrl.href)) && specifier === './storage') {
            return { url: storageUrl.href + '?snapshot=' + instance, shortCircuit: true };
        }
        if (context.parentURL?.startsWith(projectUrl.href)) {
            const url = ['./settings', './persistence'].includes(specifier) ? mockUrl : new URL(specifier + '.js', projectUrl).href;
            return { url, shortCircuit: true };
        }
        if (context.parentURL?.startsWith(storageUrl.href) && specifier === './persistence') return { url: mockUrl, shortCircuit: true };
        if (context.parentURL?.startsWith(moduleUrl.href)) return { url: mockUrl, shortCircuit: true };
        return nextResolve(specifier, context);
    } });
    let api, project;
    try {
        api = await import(`${moduleUrl.href}?fixture=${instance}`);
        if (persisted.withExport) project = await import(`${projectUrl.href}?fixture=${instance}`);
    }
    finally { hooks.deregister(); }
    return { api, project, values, snapshots, target, env, writes, app, activeWork: () => activeWorkId };
}

test('project export leaves out an unreadable work instead of blocking the others, and Markdown recovery uses only the selected snapshot', async t => {
    const f = await fixture(t, { withExport: true });
    const downloads = [];
    window.showSaveFilePicker = async () => ({
        createWritable: async () => ({ write: async value => downloads.push(value), close: async () => {} }),
    });
    f.env.failReadKey = 'author-chapters-b';
    const partial = await f.project.exportProject();
    assert.deepEqual(partial.incomplete, [{ id: 'b', name: 'Current B', parts: ['chapters'] }]);
    const partialFile = JSON.parse(downloads[0]);
    // 缺的部分不写空数组：导入这份存档时 B 的章节保持原样。
    assert.equal(Object.hasOwn(partialFile.perWorkChapters, 'b'), false);
    assert.equal(partialFile.perWorkChapters.a[0].content, 'current a');
    assert.deepEqual(partialFile._incomplete, partial.incomplete);
    f.env.failReadKey = 'author-chapters-a';
    await f.project.exportWorkAsMarkdown(await f.api.getSnapshotChapters('old-a'), 'Recovered');
    assert.match(downloads[1], /old a/);
    assert.deepEqual(f.writes, []);
    f.env.failReadKey = null;
    const full = await f.project.exportProject();
    assert.deepEqual(full.incomplete, []);
    assert.equal(JSON.parse(downloads[2]).perWorkChapters.b[0].content, 'current b');
    assert.equal(Object.hasOwn(JSON.parse(downloads[2]), '_incomplete'), false);
});

test('project export never stores default settings in place of unreadable ones', async t => {
    const f = await fixture(t, { withExport: true });
    const downloads = [];
    window.showSaveFilePicker = async () => ({
        createWritable: async () => ({ write: async value => downloads.push(value), close: async () => {} }),
    });
    f.values.set('author-settings-nodes-a', { invalid: true });
    const result = await f.project.exportProject();
    assert.deepEqual(result.incomplete, [{ id: 'a', name: 'Current A', parts: ['settings'] }]);
    assert.equal(Object.hasOwn(JSON.parse(downloads[0]).perWorkSettings, 'a'), false);
});

test('failed chapter reads never publish an empty snapshot or rotate existing history', async t => {
    const f = await fixture(t);
    const original = structuredClone(f.snapshots);
    for (const type of ['auto', 'manual']) {
        f.env.failReadKey = 'author-chapters-a';
        await assert.rejects(f.api.createSnapshot('failed', type, { workId: 'a' }));
        assert.deepEqual(await f.api.getSnapshotChapters('old-a'), f.target.data.chapters);
        f.env.failReadKey = null;
        for (const bad of [undefined, null, {}, [{ id: 'ok' }, { content: 'unreadable' }]]) {
            f.values.set('author-chapters-a', bad);
            await assert.rejects(f.api.createSnapshot('failed', type, { workId: 'a' }));
        }
    }
    assert.deepEqual(f.snapshots, original);
    assert.deepEqual(f.writes, []);
    f.values.set('author-chapters-a', []);
    assert.deepEqual((await f.api.createSnapshot('empty work', 'auto', { workId: 'a' })).data.chapters, []);
});

test('restoring A preserves B and backs up A even while B is active', async t => {
    const f = await fixture(t);
    await f.api.restoreSnapshot('old-a');
    assert.deepEqual(f.values.get('author-works-index'), [{ id: 'a', name: 'Old A' }, { id: 'b', name: 'Current B' }]);
    assert.equal(f.values.get('author-chapters-b')[0].content, 'current b');
    assert.equal(f.values.get('author-chapters-a')[0].content, 'old a');
    const backups = [...f.snapshots.values()].filter(value => value?.id && value.id !== 'old-a' && value.data?.workId === 'a' && value.data?.chapters?.[0]?.content === 'current a');
    assert.ok(backups.length > 0);
    assert.equal(f.activeWork(), 'a');
});

test('a damaged snapshot index is reported and preserved on both list and create', async t => {
    const f = await fixture(t);
    f.snapshots.set('author-snapshots-index-v2', { invalid: true });
    const original = structuredClone(f.snapshots);
    await assert.rejects(f.api.getSnapshots());
    await assert.rejects(f.api.createSnapshot('new', 'auto'));
    assert.deepEqual(f.snapshots, original);
    assert.deepEqual(await f.api.getSnapshotChapters('old-a'), f.target.data.chapters);
});

test('old snapshot indexes never resurrect unrelated deleted works', async t => {
    const f = await fixture(t);
    f.target.data.worksIndex.push({ id: 'deleted-work', name: 'Deleted' });
    await f.api.restoreSnapshot('old-a');
    assert.deepEqual(f.values.get('author-works-index').map(work => work.id), ['a', 'b']);
});

test('same-millisecond snapshots get distinct IDs', async t => {
    const f = await fixture(t);
    t.mock.method(Date, 'now', () => 123);
    const a = await f.api.createSnapshot('one', 'manual');
    const b = await f.api.createSnapshot('two', 'manual');
    assert.notEqual(a.id, b.id);
    assert.equal((await f.api.getSnapshots()).length, 3);
});

test('restoration cannot start without a durable backup', async t => {
    const f = await fixture(t);
    f.env.failSnapshotWrite = true;
    await assert.rejects(f.api.restoreSnapshot('old-a'));
    assert.equal(f.values.get('author-chapters-a')[0].content, 'current a');
    assert.equal(f.activeWork(), 'b');
});

test('a partial restore leaves a recoverable marker and retains the original backup on retry', async t => {
    const f = await fixture(t);
    f.env.failKey = 'author-settings-nodes-a';
    await assert.rejects(f.api.restoreSnapshot('old-a'));
    const pending = await f.api.getPendingSnapshotRestore();
    assert.equal(pending.snapshotId, 'old-a');
    assert.equal(f.activeWork(), 'b');
    assert.equal(f.snapshots.get(`author-snapshot-data-v2:${pending.backupId}`).data.chapters[0].content, 'current a');
    f.env.failKey = null;
    await f.api.restoreSnapshot('old-a');
    assert.equal(await f.api.getPendingSnapshotRestore(), null);
    assert.equal(f.snapshots.get(`author-snapshot-data-v2:${pending.backupId}`).data.chapters[0].content, 'current a');
});

test('restoring chat history keeps new conversations and preserves changed ones as well as restored copies', async t => {
    const f = await fixture(t);
    f.target.data.chatSessions = { activeSessionId: 'old-chat', sessions: [{ id: 'old-chat', title: 'Chat', messages: [{ content: 'old message' }] }] };
    const current = { id: 'old-chat', title: 'Chat', messages: [{ content: 'new message' }] };
    const unrelated = { id: 'new-chat', title: 'New chat', messages: [] };
    f.app.sessionStore = { activeSessionId: 'new-chat', sessions: [current, unrelated] };
    await f.api.restoreSnapshot('old-a');
    const restored = f.app.sessionStore;
    assert.deepEqual(restored.sessions.find(item => item.id === 'old-chat'), current);
    assert.deepEqual(restored.sessions.find(item => item.id === 'new-chat'), unrelated);
    assert.equal(restored.sessions.find(item => item.id === restored.activeSessionId).messages[0].content, 'old message');
});

test('concurrent snapshot creation keeps both index entries', async t => {
    const f = await fixture(t);
    const [one, two] = await Promise.all([f.api.createSnapshot('one', 'manual'), f.api.createSnapshot('two', 'manual')]);
    const index = await f.api.getSnapshots();
    assert.ok(index.some(item => item.id === one.id));
    assert.ok(index.some(item => item.id === two.id));
    assert.equal(index.length, 3);
});

test('failed backup reads and missing snapshot fields stop before overwriting work data', async t => {
    for (const failure of ['read', 'malformed', 'incomplete']) {
        await t.test(failure, async t => {
            const f = await fixture(t);
            if (failure === 'read') f.env.failReadKey = 'author-chapters-a';
            if (failure === 'malformed') f.values.set('author-settings-nodes-a', { invalid: true });
            if (failure === 'incomplete') delete f.target.data.chapters;
            await assert.rejects(f.api.restoreSnapshot('old-a'));
            assert.deepEqual(f.writes, []);
            assert.equal(f.activeWork(), 'b');
        });
    }
});

test('unreadable current chapters need confirmation, then the snapshot replaces them', async t => {
    for (const damage of ['unreadable', 'malformed']) {
        await t.test(damage, async t => {
            const f = await fixture(t);
            const broken = { broken: true };
            if (damage === 'unreadable') f.env.failReadKey = 'author-chapters-a';
            else {
                f.values.set('author-chapters-a', broken);
                // 测试里两张表是同一个浏览器库的两种读法。
                f.snapshots.set('author-chapters-a', broken);
            }
            f.values.set('author-settings-nodes-a', [{ id: 'current-setting' }]);
            const before = structuredClone(f.snapshots);

            // 未确认：只报告，不写任何东西。
            await assert.rejects(f.api.restoreSnapshot('old-a'), error => error.code === f.api.CURRENT_UNREADABLE_CODE);
            assert.deepEqual(f.writes, []);
            assert.deepEqual(f.snapshots, before);
            assert.equal(await f.api.getPendingSnapshotRestore(), null);

            await f.api.restoreSnapshot('old-a', { replaceUnreadable: true });
            assert.equal(f.values.get('author-chapters-a')[0].content, 'old a');
            assert.equal(f.activeWork(), 'a');
            const backup = (await f.api.getSnapshots()).find(item => item.id !== 'old-a');
            const backupData = f.snapshots.get('author-snapshot-data-v2:' + backup.id).data;
            // 能读的设定照常备份；读不出的章节记录下来，格式坏但还在的原样保留。
            assert.deepEqual(backupData.settingsNodes, [{ id: 'current-setting' }]);
            assert.deepEqual(backupData.chapters, []);
            assert.deepEqual(backupData.unreadable, { chapters: damage === 'malformed' ? broken : null });
            assert.match(backup.label, /unreadable/);
        });
    }
});

test('a pre-restore backup with unreadable chapters can itself be restored', async t => {
    const f = await fixture(t);
    f.env.failReadKey = 'author-chapters-a';
    await f.api.restoreSnapshot('old-a', { replaceUnreadable: true });
    f.env.failReadKey = null;
    const backup = (await f.api.getSnapshots()).find(item => item.id !== 'old-a');
    await f.api.restoreSnapshot(backup.id);
    assert.deepEqual(f.values.get('author-chapters-a'), []);
});

test('auto snapshots are skipped while nothing has changed, but manual ones are always kept', async t => {
    const f = await fixture(t);
    const first = await f.api.createSnapshot('auto 1', 'auto', { workId: 'a' });
    assert.ok(first.fingerprint);
    // 程序挂一夜：内容不变，不应再多出快照、挤掉历史。
    for (let i = 0; i < 60; i++) assert.equal(await f.api.createSnapshot('idle', 'auto', { workId: 'a' }), null);
    assert.deepEqual((await f.api.getSnapshots()).map(item => item.id), [first.id, 'old-a']);
    assert.ok(f.snapshots.has('author-snapshot-data-v2:old-a'));

    // 另一部作品的快照不影响判断。
    await f.api.createSnapshot('b', 'manual', { workId: 'b' });
    assert.equal(await f.api.createSnapshot('idle', 'auto', { workId: 'a' }), null);

    f.values.set('author-chapters-a', [{ id: 'chapter-a', content: 'edited a' }]);
    const changed = await f.api.createSnapshot('auto 2', 'auto', { workId: 'a' });
    assert.ok(changed);
    assert.notEqual(changed.fingerprint, first.fingerprint);
    assert.equal(await f.api.createSnapshot('idle', 'auto', { workId: 'a' }), null);

    const manual = await f.api.createSnapshot('manual', 'manual', { workId: 'a' });
    assert.equal(manual.fingerprint, changed.fingerprint);
    assert.equal((await f.api.getSnapshots()).length, 5);
});

test('backup index or recovery journal write failure prevents the restore from starting', async t => {
    for (const key of ['author-snapshots-index-v2', 'author-snapshot-restore-pending-v1']) {
        await t.test(key, async t => {
            const f = await fixture(t);
            f.env.failSnapshotKey = key;
            await assert.rejects(f.api.restoreSnapshot('old-a'));
            assert.deepEqual(f.writes, []);
            assert.equal(f.activeWork(), 'b');
        });
    }
});

test('every restore write failure leaves a backup and does not switch the active work', async t => {
    for (const key of ['author-chapters-a', 'author-settings-nodes-a', 'author-chapter-memory-groups-a', 'author-chat-sessions', 'author-works-index', 'journal-completion']) {
        await t.test(key, async t => {
            const f = await fixture(t);
            f.target.data.chatSessions = { activeSessionId: null, sessions: [] };
            if (key === 'journal-completion') f.env.failJournalPhase = 'completed';
            else f.env.failKey = key;
            window._forcePersistAwaitServerWrite = 'previous-value';
            await assert.rejects(f.api.restoreSnapshot('old-a'));
            const pending = await f.api.getPendingSnapshotRestore();
            assert.equal(pending.phase, 'failed');
            assert.equal(f.snapshots.get(`author-snapshot-data-v2:${pending.backupId}`).type, 'manual');
            assert.equal(f.snapshots.get(`author-snapshot-data-v2:${pending.backupId}`).data.chapters[0].content, 'current a');
            assert.equal(f.activeWork(), 'b');
            assert.equal(window._forcePersistAwaitServerWrite, 'previous-value');
            assert.equal(f.values.get('author-chapters-b')[0].content, 'current b');
        });
    }
});

test('unfinished recovery snapshots are protected and the backup can restore the pre-restore work', async t => {
    const f = await fixture(t);
    f.env.failKey = 'author-settings-nodes-a';
    await assert.rejects(f.api.restoreSnapshot('old-a'));
    const pending = await f.api.getPendingSnapshotRestore();
    await assert.rejects(f.api.deleteSnapshot(pending.snapshotId));
    await assert.rejects(f.api.deleteSnapshot(pending.backupId));
    f.env.failKey = null;
    await f.api.restoreSnapshot(pending.backupId);
    assert.equal(await f.api.getPendingSnapshotRestore(), null);
    assert.equal(f.values.get('author-chapters-a')[0].content, 'current a');
    assert.equal(f.values.get('author-chapters-b')[0].content, 'current b');
});

test('retention cannot remove the restore target while the pre-restore backup is being created', async t => {
    const f = await fixture(t);
    f.target.type = 'auto';
    const newer = Array.from({ length: 50 }, (_, index) => ({ id: `newer-${index}`, type: 'auto', data: {} }));
    f.snapshots.set('author-snapshots-index-v2', [...newer, f.target]);
    f.env.failKey = 'author-settings-nodes-a';
    await assert.rejects(f.api.restoreSnapshot('old-a'));
    assert.ok(f.snapshots.has('author-snapshot-data-v2:old-a'));
    assert.ok((await f.api.getSnapshots()).some(item => item.id === 'old-a'));
    await f.api.createSnapshot('later', 'auto');
    assert.ok(f.snapshots.has('author-snapshot-data-v2:old-a'));
});

test('retrying after a chat write and later failure does not duplicate restored conversations', async t => {
    const f = await fixture(t);
    f.target.data.chatSessions = { activeSessionId: 'chat', sessions: [{ id: 'chat', title: 'Chat', messages: [{ content: 'old' }] }] };
    f.app.sessionStore = { activeSessionId: 'chat', sessions: [{ id: 'chat', title: 'Chat', messages: [{ content: 'new' }] }] };
    f.env.failKey = 'author-works-index';
    await assert.rejects(f.api.restoreSnapshot('old-a'));
    assert.equal(f.app.sessionStore.sessions.length, 2);
    f.env.failKey = null;
    await f.api.restoreSnapshot('old-a');
    assert.equal(f.app.sessionStore.sessions.length, 2);
    assert.equal(f.app.sessionStore.sessions.find(session => session.id === 'chat').messages[0].content, 'new');
});

test('an interrupted restore is recoverable after loading a fresh application instance', async t => {
    const f = await fixture(t);
    f.env.failKey = 'author-settings-nodes-a';
    await assert.rejects(f.api.restoreSnapshot('old-a'));
    const pending = await f.api.getPendingSnapshotRestore();
    // A process exit may leave the original applying record without running the catch handler.
    f.snapshots.set('author-snapshot-restore-pending-v1', { ...pending, phase: 'applying' });
    await t.test('fresh instance', async child => {
        const reopened = await fixture(child, { values: f.values, snapshots: f.snapshots });
        assert.equal((await reopened.api.getPendingSnapshotRestore()).backupId, pending.backupId);
        await reopened.api.restoreSnapshot(pending.backupId);
        assert.equal(await reopened.api.getPendingSnapshotRestore(), null);
        assert.equal(reopened.values.get('author-chapters-a')[0].content, 'current a');
        assert.equal(reopened.values.get('author-chapters-b')[0].content, 'current b');
    });
});
