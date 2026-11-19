import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { fingerprint } from '../app/lib/custom-sync-core.js';
import { isSyncableKey } from '../app/lib/sync-key-policy.js';

const SERVER_URL = 'https://sync.example.test';
const STATE_KEY = `author-cloud-sync-state-v2:${encodeURIComponent(JSON.stringify([SERVER_URL, 'author_free', 'test-account']))}`;
const KEY = 'author-chapters-work-test';
const moduleUrl = new URL('../app/lib/custom-server-sync.js', import.meta.url);
let instance = 0;
const initializedContexts = new WeakSet();

const chapter = (id, content) => ({ id, content });
const cloudItem = (value, serverSeq = 2) => ({
    kind: 'chapter', workId: 'work-test', itemId: value.id, value, serverSeq,
});
const acknowledgement = (item, accepted = true, reason) => ({
    kind: item.kind, workId: item.workId, itemId: item.itemId, accepted, reason,
});
const response = body => ({ ok: true, json: async () => structuredClone(body) });

async function fixture(t, { local = [], baseline = [], storage = new Map(), values = new Map() } = {}) {
    if (!storage.has(STATE_KEY)) {
        storage.set(STATE_KEY, JSON.stringify({
            accountId: 'test-account', serverUrl: SERVER_URL, product: 'author_free', cursor: 1,
            keys: { [KEY]: Object.fromEntries(baseline.map(item => [item.id, { hash: fingerprint(item) }])) },
        }));
        values.set(KEY, structuredClone(local));
    }
    if (!initializedContexts.has(t)) {
        initializedContexts.add(t);
        const originalGlobals = new Map(['window', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        t.after(() => {
            for (const [key, descriptor] of originalGlobals) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else delete globalThis[key];
            }
        });
        t.mock.method(globalThis, 'setInterval', () => 1);
        t.mock.method(globalThis, 'clearInterval', () => {});
        t.mock.method(globalThis, 'setTimeout', () => 1);
        t.mock.method(globalThis, 'clearTimeout', () => {});
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
    } });
    const requests = [];
    const statuses = [];
    const env = {
        authContext: { serverUrl: SERVER_URL, product: 'author_free', userId: 'test-account', epoch: 0, signal: new AbortController().signal },
        request: async (path, options) => {
            requests.push({ path, options: structuredClone(options) });
            if (path.endsWith('/push')) return env.push(options.body.items);
            return env.pull(options.query);
        },
        push: async items => response({ ok: true, results: items.map(item => acknowledgement(item)) }),
        pull: async () => response({ ok: true, items: [], nextSince: 2, hasMore: false }),
    };
    const authUrl = `data:text/javascript,${encodeURIComponent(`
        // fixture ${++instance}
        let env;
        export function configure(value) { env = value; }
        export function isCustomSignedIn() { return true; }
        export function getCurrentCustomUser() { return { id: 'test-account' }; }
        export function getCustomAuthContext() { return env.authContext; }
        export function isCustomAuthContextCurrent(context) { return context === env.authContext && !context.signal.aborted; }
        export function assertCustomAuthContext(context) { if (!isCustomAuthContextCurrent(context)) throw new Error('Session changed'); }
        export function authorizedFetch(path, options) { return env.request(path, options); }
    `)}`;
    (await import(authUrl)).configure(env);
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (context.parentURL?.startsWith(moduleUrl.href)) {
                if (specifier === './custom-auth') return { url: authUrl, shortCircuit: true };
                if (specifier.startsWith('./')) {
                    return nextResolve(new URL(`${specifier}.js`, moduleUrl).href, context);
                }
            }
            return nextResolve(specifier, context);
        },
    });
    let sync;
    try { sync = await import(`${moduleUrl.href}?test=${instance}`); }
    finally { hooks.deregister(); }
    sync.bindLocalIO(
        async key => structuredClone(values.get(key)),
        async (key, value) => {
            if (env.failBackup && key.includes('conflict-backup')) throw new Error('Backup unavailable');
            values.set(key, structuredClone(value));
            if (key.includes('conflict-backup')) await env.onBackup?.();
        },
    );
    sync.onCustomSyncStatusChange(status => statuses.push(status));
    return {
        sync, env, requests, statuses, values, storage,
        state: () => JSON.parse(storage.get(STATE_KEY)),
        backups: () => [...values.entries()].filter(([key]) => key.includes('conflict-backup')),
    };
}

test('stale rejection preserves the local draft and baseline through pull and restart', async t => {
    const base = chapter('c1', 'base');
    const local = chapter('c1', 'local draft');
    const remote = chapter('c1', 'remote draft');
    const f = await fixture(t, { baseline: [base], local: [local] });
    f.env.push = async items => response({ ok: true, results: items.map(item => acknowledgement(item, false, 'stale')) });
    f.env.pull = async () => response({ ok: true, items: [cloudItem(remote)], nextSince: 2, hasMore: false });
    f.sync.customEnqueue(KEY);
    await f.sync.flushSync();
    assert.deepEqual(f.values.get(KEY), [local]);
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(base));
    assert.equal(f.state().cursor, 2);
    assert.equal(f.backups().length, 1);
    assert.equal(isSyncableKey(f.backups()[0][0]), false);
    assert.match(JSON.stringify(f.backups()[0][1]), /local draft/);
    assert.match(JSON.stringify(f.backups()[0][1]), /remote draft/);
    assert.ok(f.statuses.at(-1).pending > 0);
    assert.ok(f.statuses.at(-1).error);

    const restarted = await fixture(t, { storage: f.storage, values: f.values });
    restarted.env.pull = f.env.pull;
    await restarted.sync.pullFromCloud();
    assert.deepEqual(restarted.values.get(KEY), [local]);
    await restarted.sync.flushSync({ throwOnError: true });
    const upload = restarted.requests.find(request => request.path.endsWith('/push'));
    assert.deepEqual(upload.options.body.items[0].value, local);
    assert.equal(restarted.state().keys[KEY].c1.hash, fingerprint(local));
});

test('only explicitly accepted items advance their baseline in a mixed response', async t => {
    const base = [chapter('c1', 'base 1'), chapter('c2', 'base 2')];
    const local = [chapter('c1', 'edit 1'), chapter('c2', 'edit 2')];
    const f = await fixture(t, { baseline: base, local });
    f.env.push = async items => response({ ok: true, results: [
        acknowledgement(items[1], false, 'stale'), acknowledgement(items[0]),
    ] });
    f.sync.customEnqueue(KEY);
    await assert.rejects(f.sync.flushSync({ throwOnError: true }));
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(local[0]));
    assert.equal(f.state().keys[KEY].c2.hash, fingerprint(base[1]));
    f.env.push = async items => {
        assert.deepEqual(items.map(item => item.itemId), ['c2']);
        return response({ ok: true, results: items.map(item => acknowledgement(item)) });
    };
    await f.sync.flushSync({ throwOnError: true });
});

test('empty, missing, malformed and ambiguous acknowledgements never mean success', async t => {
    const cases = [
        { ok: true }, { ok: true, results: [] }, null,
        { ok: true, results: [{}] },
        { ok: true, results: [{ itemId: 'other', accepted: true }] },
        { ok: true, results: [{ itemId: 'c1', workId: 'another-work', accepted: true }] },
        { ok: true, results: [{ workId: 'another-work', accepted: true }] },
        { ok: true, results: [{ itemId: 'c1', accepted: true }, { itemId: 'c1', accepted: true }] },
        { ok: false, results: [{ itemId: 'c1', accepted: true }] },
    ];
    for (const data of cases) {
        await t.test(JSON.stringify(data), async t => {
            const base = chapter('c1', 'base');
            const f = await fixture(t, { baseline: [base], local: [chapter('c1', 'edit')] });
            f.env.push = async () => response(data);
            f.sync.customEnqueue(KEY);
            await assert.rejects(f.sync.flushSync({ throwOnError: true }));
            assert.equal(f.state().keys[KEY].c1.hash, fingerprint(base));
            assert.ok(f.statuses.at(-1).pending > 0);
        });
    }
});

test('a complete ordered legacy response still requires acceptance for every item', async t => {
    const f = await fixture(t, { local: [chapter('c1', 'one'), chapter('c2', 'two')] });
    f.env.push = async () => response({ ok: true, results: [{ accepted: true }, { accepted: false, reason: 'invalid' }] });
    f.sync.customEnqueue(KEY);
    await assert.rejects(f.sync.flushSync({ throwOnError: true }));
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(chapter('c1', 'one')));
    assert.equal(f.state().keys[KEY].c2, undefined);
});

test('a rejected deletion is not resurrected by the subsequent pull', async t => {
    const base = chapter('c1', 'base');
    const f = await fixture(t, { baseline: [base], local: [] });
    f.env.push = async items => response({ ok: true, results: items.map(item => acknowledgement(item, false, 'stale')) });
    f.env.pull = async () => response({ ok: true, items: [cloudItem(chapter('c1', 'remote'))], nextSince: 2 });
    f.sync.customDel(KEY);
    await f.sync.flushSync();
    assert.deepEqual(f.values.get(KEY), []);
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(base));
    assert.equal(f.backups().length, 1);
});

test('a rejected works index is not overwritten by the automatic pull', async t => {
    const f = await fixture(t);
    const key = 'author-works-index';
    const local = [{ id: 'work-test', name: 'Local work' }];
    f.values.set(key, local);
    f.env.push = async items => response({ ok: true, results: items.map(item => acknowledgement(item, false, 'stale')) });
    f.env.pull = async () => response({ ok: true, items: [{
        kind: 'works_index', workId: '_index', itemId: '_index', value: [], serverSeq: 2,
    }], nextSince: 2 });
    f.sync.customEnqueue(key);
    await f.sync.flushSync();
    assert.deepEqual(f.values.get(key), local);
    assert.equal(f.backups().length, 1);
});

test('a conflict backup failure cannot advance the pull cursor', async t => {
    const base = chapter('c1', 'base');
    const local = chapter('c1', 'edit');
    const f = await fixture(t, { baseline: [base], local: [local] });
    f.env.failBackup = true;
    f.env.push = async items => response({ ok: true, results: items.map(item => acknowledgement(item, false, 'stale')) });
    f.env.pull = async () => response({ ok: true, items: [cloudItem(chapter('c1', 'remote'))], nextSince: 2 });
    f.sync.customEnqueue(KEY);
    await f.sync.flushSync();
    assert.equal(f.state().cursor, 1);
    assert.deepEqual(f.values.get(KEY), [local]);
});

test('an unconfirmed create followed by a local delete retries an explicit tombstone', async t => {
    const f = await fixture(t, { local: [chapter('c1', 'new')] });
    f.env.push = async () => response({ ok: true, results: [] });
    f.sync.customEnqueue(KEY);
    await f.sync.flushSync();
    f.values.set(KEY, []);
    f.sync.customDel(KEY);
    f.env.push = async items => {
        assert.equal(items.length, 1);
        assert.equal(items[0].deleted, true);
        return response({ ok: true, results: items.map(item => acknowledgement(item)) });
    };
    await f.sync.flushSync({ throwOnError: true });
    assert.deepEqual(f.state().keys[KEY].c1, { deleted: true });
});

test('a later batch failure keeps earlier confirmations and retries the remainder after restart', async t => {
    const local = Array.from({ length: 101 }, (_, index) => chapter(`c${index}`, 'new'));
    const f = await fixture(t, { local });
    let batch = 0;
    f.env.push = async items => {
        if (++batch > 1) throw new Error('Network unavailable');
        return response({ ok: true, results: items.map(item => acknowledgement(item)) });
    };
    f.sync.customEnqueue(KEY);
    await assert.rejects(f.sync.flushSync({ throwOnError: true }), /Network unavailable/);
    assert.equal(Object.keys(f.state().keys[KEY]).length, 100);
    const restarted = await fixture(t, { storage: f.storage, values: f.values });
    restarted.env.push = async items => {
        assert.deepEqual(items.map(item => item.itemId), ['c100']);
        return response({ ok: true, results: items.map(item => acknowledgement(item)) });
    };
    await restarted.sync.flushSync({ throwOnError: true });
    assert.equal(Object.keys(restarted.state().keys[KEY]).length, 101);
});

test('an upload cannot start until its retry state is saved', async t => {
    const local = chapter('c1', 'new');
    const f = await fixture(t, { local: [local] });
    t.mock.method(globalThis.localStorage, 'setItem', () => { throw new Error('State storage unavailable'); });
    f.sync.customEnqueue(KEY);
    await assert.rejects(f.sync.flushSync({ throwOnError: true }), /State storage unavailable/);
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.values.get(KEY), [local]);
});

test('a pending edit survives a remote deletion', async t => {
    const base = chapter('c1', 'base');
    const local = chapter('c1', 'local edit');
    const f = await fixture(t, { baseline: [base], local: [local] });
    f.env.push = async items => response({ ok: true, results: items.map(item => acknowledgement(item, false, 'stale')) });
    f.env.pull = async () => response({ ok: true, items: [{ ...cloudItem(base), deleted: true, value: undefined }], nextSince: 2 });
    f.sync.customEnqueue(KEY);
    await f.sync.flushSync();
    assert.deepEqual(f.values.get(KEY), [local]);
    assert.equal(f.backups()[0][1].remote.deleted, true);
});

test('edits made while saving a conflict backup survive the merge of unrelated remote items', async t => {
    const base = [chapter('c1', 'base 1'), chapter('c2', 'base 2')];
    const local = [chapter('c1', 'local edit'), base[1]];
    const latest = chapter('c1', 'typed while saving backup');
    const remoteSecond = chapter('c2', 'remote edit');
    const f = await fixture(t, { baseline: base, local });
    f.env.push = async items => response({ ok: true, results: items.map(item => acknowledgement(item, false, 'stale')) });
    f.env.pull = async () => response({ ok: true, items: [cloudItem(chapter('c1', 'conflicting edit')), cloudItem(remoteSecond, 3)], nextSince: 3 });
    f.env.onBackup = () => { f.values.set(KEY, [latest, base[1]]); };
    f.sync.customEnqueue(KEY);
    await f.sync.flushSync();
    assert.deepEqual(f.values.get(KEY), [latest, remoteSecond]);
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(base[0]));
    assert.equal(f.state().keys[KEY].c2.hash, fingerprint(remoteSecond));
});

test('a pull already in flight finishes before an upload can confirm a newer local version', async t => {
    const base = chapter('c1', 'base');
    const local = chapter('c1', 'local edit');
    const remote = chapter('c1', 'remote edit');
    const f = await fixture(t, { baseline: [base], local: [base] });
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.env.pull = async () => {
        started.resolve();
        await release.promise;
        return response({ ok: true, items: [cloudItem(remote)], nextSince: 2 });
    };
    const pulling = f.sync.pullFromCloud();
    await started.promise;
    f.values.set(KEY, [local]);
    f.sync.customEnqueue(KEY);
    const uploading = f.sync.flushSync({ throwOnError: true });
    await Promise.resolve();
    assert.equal(f.requests.filter(request => request.path.endsWith('/push')).length, 0);
    release.resolve();
    await pulling;
    await uploading;
    assert.deepEqual(f.values.get(KEY), [local]);
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(local));
});

test('an acknowledgement confirms the sent version, not an edit made during upload', async t => {
    const base = chapter('c1', 'base');
    const sent = chapter('c1', 'sent edit');
    const newer = chapter('c1', 'newer edit');
    const f = await fixture(t, { baseline: [base], local: [sent] });
    f.env.push = async items => {
        f.values.set(KEY, [newer]);
        f.sync.customEnqueue(KEY);
        return response({ ok: true, results: items.map(item => acknowledgement(item)) });
    };
    f.sync.customEnqueue(KEY);
    await f.sync.flushSync({ throwOnError: true });
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(sent));
    f.env.pull = async () => response({ ok: true, items: [cloudItem(sent)], nextSince: 2 });
    await f.sync.pullFromCloud();
    assert.deepEqual(f.values.get(KEY), [newer]);
    f.env.push = async items => {
        assert.deepEqual(items[0].value, newer);
        return response({ ok: true, results: items.map(item => acknowledgement(item)) });
    };
    await f.sync.flushSync({ throwOnError: true });
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(newer));
});

test('a failed cursor save is retried from the previous cursor in the same session', async t => {
    const f = await fixture(t);
    const setItem = globalThis.localStorage.setItem;
    let fail = true;
    t.mock.method(globalThis.localStorage, 'setItem', (key, value) => {
        if (fail) { fail = false; throw new Error('State storage unavailable'); }
        return setItem(key, value);
    });
    await f.sync.pullFromCloud();
    await f.sync.pullFromCloud();
    assert.deepEqual(f.requests.map(request => request.options.query.since), [1, 1]);
    assert.equal(f.state().cursor, 2);
});

test('a clean remote update still applies and does not produce a conflict backup', async t => {
    const base = chapter('c1', 'base');
    const remote = chapter('c1', 'remote edit');
    const f = await fixture(t, { baseline: [base], local: [base] });
    f.env.pull = async () => response({ ok: true, items: [cloudItem(remote)], nextSince: 2 });
    assert.equal(await f.sync.pullFromCloud(), 1);
    assert.deepEqual(f.values.get(KEY), [remote]);
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(remote));
    assert.equal(f.backups().length, 0);
});

test('revisions across pull pages apply the newest value and commit that exact baseline', async t => {
    const base = chapter('c1', 'base');
    const newest = chapter('c1', 'newest');
    const f = await fixture(t, { baseline: [base], local: [base] });
    f.env.pull = async ({ since }) => response(since === 1
        ? { ok: true, items: [cloudItem(chapter('c1', 'middle'), 2)], nextSince: 2, hasMore: true }
        : { ok: true, items: [cloudItem(newest, 4), cloudItem(chapter('c1', 'older'), 3)], nextSince: 4, hasMore: false });
    assert.equal(await f.sync.pullFromCloud(), 1);
    assert.deepEqual(f.values.get(KEY), [newest]);
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(newest));
    assert.equal(f.state().cursor, 4);
});

test('an unpushed local deletion survives pull and restart and is queued for upload', async t => {
    const base = chapter('c1', 'base');
    const f = await fixture(t, { baseline: [base], local: [] });
    f.env.pull = async () => response({ ok: true, items: [cloudItem(chapter('c1', 'remote edit'), 2)], nextSince: 2 });
    await f.sync.pullFromCloud();
    assert.deepEqual(f.values.get(KEY), []);
    assert.deepEqual(f.state().pending[KEY].c1, { deleted: true });
    assert.equal(f.state().keys[KEY].c1.hash, fingerprint(base));
    assert.equal(f.backups()[0][1].local.deleted, true);
    const restarted = await fixture(t, { storage: f.storage, values: f.values });
    restarted.env.push = async items => {
        assert.equal(items.length, 1);
        assert.equal(items[0].deleted, true);
        return response({ ok: true, results: items.map(item => acknowledgement(item)) });
    };
    await restarted.sync.flushSync({ throwOnError: true });
    assert.ok(restarted.requests.some(request => request.path.endsWith('/push')));
    assert.deepEqual(restarted.values.get(KEY), []);
});

test('a local deletion made while pull waits for a later page remains deleted', async t => {
    const base = chapter('c1', 'base');
    const f = await fixture(t, { baseline: [base], local: [base] });
    f.env.pull = async ({ since }) => {
        if (since === 1) return response({ ok: true, items: [cloudItem(base, 2)], nextSince: 2, hasMore: true });
        f.values.set(KEY, []);
        return response({ ok: true, items: [cloudItem(chapter('c1', 'latest remote'), 3)], nextSince: 3 });
    };
    await f.sync.pullFromCloud();
    assert.deepEqual(f.values.get(KEY), []);
    assert.deepEqual(f.state().pending[KEY].c1, { deleted: true });
});

test('force pull reflects the final remote deletion rather than an earlier create', async t => {
    const base = chapter('c1', 'base');
    const f = await fixture(t, { baseline: [base], local: [base] });
    f.env.pull = async () => response({ ok: true, items: [
        cloudItem(chapter('c1', 'created remotely'), 2),
        { kind: 'chapter', workId: 'work-test', itemId: 'c1', deleted: true, serverSeq: 3 },
    ], nextSince: 3 });
    await f.sync.forcePullFromCloud();
    assert.deepEqual(f.values.get(KEY), []);
    assert.deepEqual(f.state().keys[KEY].c1, { deleted: true });
});

test('failure to preserve an unpushed deletion conflict leaves the cursor unchanged', async t => {
    const base = chapter('c1', 'base');
    const f = await fixture(t, { baseline: [base], local: [] });
    f.env.failBackup = true;
    f.env.pull = async () => response({ ok: true, items: [cloudItem(chapter('c1', 'remote edit'), 2)], nextSince: 2 });
    await f.sync.pullFromCloud();
    assert.deepEqual(f.values.get(KEY), []);
    assert.equal(f.state().cursor, 1);
    assert.deepEqual(f.state().pending[KEY].c1, { deleted: true });
});

test('newly discovered local deletion state must be durable before pull can advance', async t => {
    const base = chapter('c1', 'base');
    const f = await fixture(t, { baseline: [base], local: [] });
    t.mock.method(globalThis.localStorage, 'setItem', () => { throw new Error('State storage unavailable'); });
    f.env.pull = async () => response({ ok: true, items: [cloudItem(chapter('c1', 'remote edit'), 2)], nextSince: 2 });
    await f.sync.pullFromCloud();
    assert.equal(f.state().cursor, 1);
    assert.deepEqual(f.values.get(KEY), []);
    assert.equal(f.backups().length, 0);
});

test('force pull clears a local key when the remote batch contains only a tombstone', async t => {
    const base = chapter('c1', 'base');
    const f = await fixture(t, { baseline: [base], local: [base] });
    f.env.pull = async () => response({ ok: true, items: [
        { kind: 'chapter', workId: 'work-test', itemId: 'c1', deleted: true, serverSeq: 3 },
    ], nextSince: 3 });
    await f.sync.forcePullFromCloud();
    assert.deepEqual(f.values.get(KEY), []);
    assert.deepEqual(f.state().keys[KEY].c1, { deleted: true });
});

// ==================== 长篇与手机端 ====================
// 长篇在手机上推不上去的两个根因：
//   1. 推送只按条数切批，长篇整批超过服务端请求体上限，每次重试都是同一批；
//   2. 待推队列只在内存里，手机浏览器切到后台就被冻结或回收，5 分钟定时器等不到。

const SERVER_BODY_LIMIT = 1024 * 1024; // 测试里模拟的服务端请求体上限
const tooLarge = () => ({ ok: false, status: 413, json: async () => ({ ok: false }) });
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
const pushRequests = f => f.requests.filter(request => request.path.endsWith('/push'));

test('长篇按字节切批上传，每个请求都在后端上限内，全部确认', async t => {
    // 60 章 × 每章 6000 字：旧逻辑一批 60 章约 1.1 MB，必然 413。
    const local = Array.from({ length: 60 }, (_, index) => chapter(`c${index}`, `第${index}章`.padEnd(6000, '文')));
    const f = await fixture(t, { local });
    f.env.push = async items => Buffer.byteLength(JSON.stringify({ items })) > SERVER_BODY_LIMIT
        ? tooLarge()
        : response({ ok: true, results: items.map(item => acknowledgement(item)) });
    f.sync.customEnqueue(KEY);
    await f.sync.flushSync({ throwOnError: true });
    assert.ok(pushRequests(f).length > 1);
    for (const request of pushRequests(f)) {
        assert.ok(Buffer.byteLength(JSON.stringify(request.options.body)) <= 900 * 1000);
    }
    assert.equal(Object.keys(f.state().keys[KEY]).length, 60);
    assert.equal(f.state().pending[KEY], undefined);
});

test('单章超过上限：不发送、明确说是哪一章，其余章节照常上传，本地一字不动', async t => {
    const huge = { ...chapter('huge', '巨'.repeat(400_000)), title: '整本导入' };
    const local = [chapter('a', 'short a'), huge, chapter('b', 'short b')];
    const f = await fixture(t, { local });
    f.env.push = async items => Buffer.byteLength(JSON.stringify({ items })) > SERVER_BODY_LIMIT
        ? tooLarge()
        : response({ ok: true, results: items.map(item => acknowledgement(item)) });
    f.sync.customEnqueue(KEY);
    await assert.rejects(f.sync.flushSync({ throwOnError: true }), /整本导入.*太长/);
    const sent = pushRequests(f).flatMap(request => request.options.body.items.map(item => item.itemId));
    assert.deepEqual(sent.sort(), ['a', 'b']);
    assert.deepEqual(Object.keys(f.state().keys[KEY]).sort(), ['a', 'b']);
    assert.ok(f.state().pending[KEY].huge);
    assert.deepEqual(f.values.get(KEY), local);
    assert.ok(f.statuses.at(-1).pending > 0);
});

test('改了还没来得及推、页面就被关掉：下次打开接着推', async t => {
    const base = chapter('c1', 'base');
    const edit = chapter('c1', 'written on the phone');
    const f = await fixture(t, { baseline: [base], local: [edit] });
    f.sync.customEnqueue(KEY); // 5 分钟定时器还没到，页面就被系统回收
    assert.equal(f.state().dirty[KEY], true);
    assert.equal(pushRequests(f).length, 0);

    const reopened = await fixture(t, { storage: f.storage, values: f.values });
    await reopened.sync.flushSync({ throwOnError: true });
    const [upload] = pushRequests(reopened);
    assert.deepEqual(upload.options.body.items.map(item => item.value), [edit]);
    assert.equal(reopened.state().keys[KEY].c1.hash, fingerprint(edit));
    assert.equal(reopened.state().dirty[KEY], undefined);
});

test('推送途中又改了同一个 key：推完不撤标记，下一轮把新内容推上去', async t => {
    const first = chapter('c1', 'first');
    const second = chapter('c1', 'second');
    const f = await fixture(t, { local: [first] });
    f.env.push = async items => {
        f.values.set(KEY, [second]);
        f.sync.customEnqueue(KEY);
        return response({ ok: true, results: items.map(item => acknowledgement(item)) });
    };
    f.sync.customEnqueue(KEY);
    await f.sync.flushSync({ throwOnError: true });
    assert.equal(f.state().dirty[KEY], true);

    f.env.push = async items => response({ ok: true, results: items.map(item => acknowledgement(item)) });
    const reopened = await fixture(t, { storage: f.storage, values: f.values });
    await reopened.sync.flushSync({ throwOnError: true });
    assert.deepEqual(pushRequests(reopened)[0].options.body.items.map(item => item.value), [second]);
    assert.equal(reopened.state().dirty[KEY], undefined);
});

test('推送失败时标记保留，重开页面还会重试', async t => {
    const f = await fixture(t, { local: [chapter('c1', 'offline edit')] });
    f.env.push = async () => { throw new Error('Network unavailable'); };
    f.sync.customEnqueue(KEY);
    await assert.rejects(f.sync.flushSync({ throwOnError: true }), /Network unavailable/);
    assert.equal(f.state().dirty[KEY], true);
});

test('从云端强制拉取会放弃本地待推标记，不把刚覆盖的内容再推回去', async t => {
    const f = await fixture(t, { local: [chapter('c1', 'local')] });
    f.sync.customEnqueue(KEY);
    f.env.pull = async () => response({ ok: true, items: [cloudItem(chapter('c1', 'cloud'))], nextSince: 2 });
    await f.sync.forcePullFromCloud();
    assert.deepEqual(f.state().dirty, {});
});

function installLifecycle(t) {
    const listeners = new Map();
    const target = () => ({ addEventListener: (name, callback) => listeners.set(name, callback) });
    const originals = ['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    t.after(() => {
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: target() });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { ...target(), hidden: false } });
    return {
        hide: () => { globalThis.document.hidden = true; listeners.get('visibilitychange')(); },
        show: () => { globalThis.document.hidden = false; listeners.get('visibilitychange')(); },
    };
}

test('打开页面时先拉取，再把上次没推完的推上去', async t => {
    const base = chapter('c1', 'base');
    const edit = chapter('c1', 'left over from last session');
    const f = await fixture(t, { baseline: [base], local: [edit] });
    f.sync.customEnqueue(KEY);

    const reopened = await fixture(t, { storage: f.storage, values: f.values });
    installLifecycle(t);
    reopened.sync.setupCustomBeforeUnloadSync();
    await settle();
    const paths = reopened.requests.map(request => request.path.split('/').at(-1));
    assert.deepEqual(paths, ['pull', 'push']);
    assert.deepEqual(pushRequests(reopened)[0].options.body.items.map(item => item.value), [edit]);
    assert.equal(reopened.state().dirty[KEY], undefined);
});

test('切到后台（锁屏、切应用）立即推送，不等 5 分钟定时器', async t => {
    const f = await fixture(t, { local: [] });
    const page = installLifecycle(t);
    f.sync.setupCustomBeforeUnloadSync();
    await settle();
    f.requests.length = 0;

    const edit = chapter('c1', 'typed on the phone');
    f.values.set(KEY, [edit]);
    f.sync.customEnqueue(KEY);
    page.hide();
    await settle();
    assert.deepEqual(pushRequests(f).map(request => request.options.body.items[0].value), [edit]);

    page.show(); // 切回前台只拉取，没有待推内容就不推
    await settle();
    assert.equal(pushRequests(f).length, 1);
    assert.ok(f.requests.at(-1).path.endsWith('/pull'));
});

test('本地章节记录损坏：不上传、不发删除，其余作品照常上传；恢复后正常推送', async t => {
    const base = [chapter('c1', 'one'), chapter('c2', 'two')];
    const OTHER = 'author-chapters-work-other';
    const f = await fixture(t, { baseline: base, local: { broken: true } });
    f.values.set(OTHER, [chapter('o1', 'other work')]);
    f.sync.customEnqueue(KEY);
    f.sync.customEnqueue(OTHER);
    await assert.rejects(f.sync.flushSync({ throwOnError: true }), /打开这部作品/);
    const sent = pushRequests(f).flatMap(request => request.options.body.items);
    assert.equal(sent.some(item => item.deleted), false);
    assert.deepEqual(sent.map(item => item.itemId), ['o1']);
    assert.deepEqual(Object.keys(f.state().keys[KEY]).sort(), ['c1', 'c2']);
    assert.equal(f.state().pending?.[KEY], undefined);
    assert.deepEqual(f.values.get(KEY), { broken: true });
    assert.ok(f.statuses.at(-1).pending > 0);

    // 用户恢复后，只推真正的变化，不会把别的章节当删除。
    f.values.set(KEY, [chapter('c1', 'one'), chapter('c2', 'restored two')]);
    await f.sync.flushSync({ throwOnError: true });
    const afterRestore = pushRequests(f).flatMap(request => request.options.body.items).filter(item => item.workId === 'work-test');
    assert.deepEqual(afterRestore.map(item => [item.itemId, !!item.deleted]), [['c2', false]]);
});

test('本地章节记录损坏时拉取云端：不写残缺列表，也不把章节记成本地删除', async t => {
    const base = [chapter('c1', 'one'), chapter('c2', 'two')];
    const f = await fixture(t, { baseline: base, local: { broken: true } });
    f.env.pull = async () => response({ ok: true, items: [cloudItem(chapter('c1', 'remote edit'), 2)], nextSince: 2 });
    await f.sync.pullFromCloud();
    assert.deepEqual(f.values.get(KEY), { broken: true });
    assert.equal(f.state().pending?.[KEY], undefined);
    assert.equal(f.backups().length, 0);
});

test('只恢复这一部作品：只读这部作品的云端内容，写回后同步基线对齐，不会再推旧内容', async t => {
    const OTHER = 'author-chapters-work-other';
    const f = await fixture(t, { baseline: [chapter('c1', 'old')], local: { broken: true } });
    f.values.set(OTHER, [chapter('o1', 'unpushed edit on another work')]);
    f.sync.customEnqueue(OTHER);
    f.env.pull = async query => response(query.since === 0
        ? { ok: true, items: [
            cloudItem(chapter('c1', 'cloud c1'), 5),
            cloudItem(chapter('c2', 'cloud c2'), 6),
            { kind: 'chapter', workId: 'work-other', itemId: 'o1', value: chapter('o1', 'cloud o1'), serverSeq: 7 },
        ], nextSince: 7, hasMore: false }
        : { ok: true, items: [], nextSince: 7, hasMore: false });

    const snapshot = await f.sync.fetchKeyFromCloud(KEY);
    assert.deepEqual(snapshot.value.map(c => c.id), ['c1', 'c2']);
    assert.deepEqual(f.values.get(KEY), { broken: true }); // 只读，不改本地

    await f.sync.applyCloudKeySnapshot(snapshot, [...snapshot.value].reverse());
    assert.deepEqual(f.values.get(KEY).map(c => c.id), ['c2', 'c1']);
    assert.deepEqual(Object.keys(f.state().keys[KEY]).sort(), ['c1', 'c2']);
    // 其他作品还没上传的修改不受影响。
    assert.equal(f.values.get(OTHER)[0].content, 'unpushed edit on another work');

    f.sync.customEnqueue(KEY);
    await f.sync.flushSync({ throwOnError: true });
    const sent = pushRequests(f).flatMap(request => request.options.body.items);
    assert.equal(sent.some(item => item.workId === 'work-test'), false);
    assert.deepEqual(sent.map(item => item.itemId), ['o1']);
});
