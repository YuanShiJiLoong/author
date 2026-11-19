import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// 作品打不开时：程序自己比较各处能找到的版本，最新的排第一个，用户只需点“恢复”。
const moduleUrl = new URL('../app/lib/work-recovery.js', import.meta.url);
let instance = 0;

const chapter = (id, content, updatedAt) => ({ id, title: `Chapter ${id}`, content, wordCount: content.length, updatedAt });

async function fixture(t, { signedIn = true, cloud = null, webdav = null, snapshots = [] } = {}) {
    const calls = [];
    const env = { signedIn, cloud, webdav, snapshots, idb: new Map([['author-chapters-w', 'not a list']]), calls };
    const id = ++instance;
    globalThis[`__recoveryEnv${id}`] = env;
    const mock = body => `data:text/javascript,${encodeURIComponent(`const env = globalThis.__recoveryEnv${id};\n${body}`)}`;
    const stubs = {
        'idb-keyval': mock(`
            export const get = async key => env.idb.get(key);
            export const set = async (key, value) => { env.idb.set(key, value); env.calls.push(['idb.set', key]); };`),
        './snapshots': mock(`
            export const getSnapshots = async () => env.snapshots.map(s => s.index);
            export const getSnapshotChapters = async id => env.snapshots.find(s => s.index.id === id).chapters;
            export const restoreSnapshot = async (id, options) => { env.calls.push(['restoreSnapshot', id, options]); return true; };`),
        './storage': mock(`
            export const saveChapters = async (chapters, workId, options) => { env.calls.push(['saveChapters', chapters, workId, options]); };`),
        './custom-auth': mock(`
            export const isCustomServerConfigured = () => true;
            export const isCustomSignedIn = () => env.signedIn;`),
        './custom-server-sync': mock(`
            export const fetchKeyFromCloud = async key => env.cloud;
            export const applyCloudKeySnapshot = async (snapshot, value) => { env.calls.push(['applyCloud', snapshot, value]); return true; };`),
        './portable-sync': mock(`
            export const fetchKeyFromWebDav = async key => env.webdav;`),
    };
    const instanceUrl = `${moduleUrl.href}?test=${id}`;
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (context.parentURL === instanceUrl && stubs[specifier]) return { url: stubs[specifier], shortCircuit: true };
            return nextResolve(specifier, context);
        },
    });
    t.after(() => hooks.deregister());
    t.mock.method(console, 'warn', () => {});
    const api = await import(instanceUrl);
    return { api, env, calls };
}

const snapshot = (id, timestamp, chapters) => ({
    index: { id, workId: 'w', timestamp, stats: { chapterCount: chapters.length, totalWords: 10 } },
    chapters,
});

test('the newest version is offered first, and cloud chapters keep the order known on this computer', async t => {
    const saved = snapshot('s1', Date.parse('2026-11-19T05:00:00Z'), [chapter('c1', 'one', '2026-11-19T04:00:00Z'), chapter('c2', 'two', '2026-11-19T04:30:00Z')]);
    const f = await fixture(t, {
        snapshots: [saved],
        cloud: {
            key: 'author-chapters-w', items: [],
            // 云端按修改先后给出，不是章节顺序。
            value: [chapter('c2', 'two, edited on the phone', '2026-11-19T06:00:00Z'), chapter('c1', 'one', '2026-11-19T04:00:00Z')],
        },
        webdav: { value: 'broken', updatedAt: '2026-11-19T07:00:00Z' },
    });
    const options = await f.api.findRecoveryOptions('w');
    assert.deepEqual(options.map(o => o.source), ['cloud', 'snapshot']);
    assert.deepEqual(options[0].chapters.map(c => c.id), ['c1', 'c2']);
    assert.equal(options[0].chapterCount, 2);
    assert.equal(options[0].time, Date.parse('2026-11-19T06:00:00Z'));

    await f.api.restoreRecoveryOption('w', options[0]);
    const backup = f.calls.find(call => call[0] === 'idb.set');
    assert.match(backup[1], /^author-unreadable-backup:author-chapters-w:\d+$/);
    assert.equal(f.env.idb.get(backup[1]), 'not a list');
    const applied = f.calls.find(call => call[0] === 'applyCloud');
    assert.deepEqual(applied[2].map(c => c.id), ['c1', 'c2']);
});

test('without sync, the computer’s own snapshots are the options, newest first', async t => {
    const f = await fixture(t, {
        signedIn: false,
        snapshots: [
            snapshot('older', 1000, [chapter('c1', 'a', null)]),
            snapshot('newer', 2000, [chapter('c1', 'b', null)]),
            { index: { id: 'empty-backup', workId: 'w', timestamp: 3000, stats: { chapterCount: 0 } }, chapters: [] },
            { index: { id: 'other-work', workId: 'x', timestamp: 4000, stats: { chapterCount: 3 } }, chapters: [] },
        ],
    });
    const options = await f.api.findRecoveryOptions('w');
    assert.deepEqual(options.map(o => o.snapshotId), ['newer', 'older']);
    await f.api.restoreRecoveryOption('w', options[0]);
    assert.deepEqual(f.calls.at(-1), ['restoreSnapshot', 'newer', { replaceUnreadable: true }]);
});

test('a WebDAV copy is restored through the guarded chapter save', async t => {
    const f = await fixture(t, { signedIn: false, webdav: { value: [chapter('c1', 'from dav', '2026-11-19T08:00:00Z')], updatedAt: '2026-11-19T08:00:00Z' } });
    const [option] = await f.api.findRecoveryOptions('w');
    assert.equal(option.source, 'webdav');
    await f.api.restoreRecoveryOption('w', option);
    const save = f.calls.find(call => call[0] === 'saveChapters');
    assert.deepEqual(save.slice(2), ['w', { overwriteDamaged: true }]);
});

test('an unreachable source is skipped instead of hiding the others', async t => {
    const f = await fixture(t, { snapshots: [snapshot('s1', 1000, [chapter('c1', 'a', null)])] });
    f.env.cloud = null;
    const options = await f.api.findRecoveryOptions('w');
    assert.deepEqual(options.map(o => o.source), ['snapshot']);
});
