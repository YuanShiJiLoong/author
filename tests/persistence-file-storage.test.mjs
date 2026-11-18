import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { promisifyRequest } from 'idb-keyval';

const moduleUrl = new URL('../app/lib/persistence.js', import.meta.url);
const statusUrl = new URL('../app/lib/local-save-status.js', import.meta.url);
const policyUrl = new URL('../app/lib/sync-key-policy.js', import.meta.url);
const KEY = 'author-chapters-work-a';
const tick = () => new Promise(resolve => setImmediate(resolve));
let instance = 0;

async function fixture(t) {
    const id = ++instance;
    const values = new Map();
    const server = new Map([[KEY, { text: 'server original' }]]);
    const requests = [];
    const globals = { window: {}, document: { cookie: 'author-uid=test-user' }, localStorage: {
        getItem: () => null, setItem: () => {}, removeItem: () => {},
    } };
    const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
    let transactions = Promise.resolve();
    const env = { values, server, requests, promisifyRequest, pingStatus: 200, postStatus: 200, deleteStatus: 200, getStatus: 200 };
    env.store = (mode, callback) => {
        assert.equal(mode, 'readwrite');
        const operation = transactions.then(() => {
            const staged = new Map(values);
            let aborted = false;
            const transaction = { error: null, abort() {
                if (aborted) return;
                aborted = true;
                queueMicrotask(() => transaction.onabort?.());
            } };
            const store = { transaction,
                get(key) {
                    const request = {};
                    queueMicrotask(() => { request.result = structuredClone(staged.get(key)); request.onsuccess?.(); });
                    return request;
                },
                put(value, key) {
                    if (env.failPut?.(key)) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
                    staged.set(key, structuredClone(value));
                },
                delete(key) { staged.delete(key); },
            };
            const result = callback(store);
            setImmediate(() => {
                if (aborted) return;
                values.clear();
                for (const [key, value] of staged) values.set(key, value);
                transaction.oncomplete?.();
            });
            return result;
        });
        transactions = operation.catch(() => {});
        return operation;
    };
    const mockUrl = `data:text/javascript,${encodeURIComponent(`
        let env; export const configure = value => { env = value; };
        export const get = async key => structuredClone(env.values.get(key));
        export const set = async (key, value) => { env.values.set(key, structuredClone(value)); };
        export const del = async key => { env.values.delete(key); };
        export const createStore = () => (mode, callback) => env.store(mode, callback);
        export const promisifyRequest = request => env.promisifyRequest(request);
        export const apiPath = path => path;
        export const IS_OFFICIAL_WEB = false;
        export const getCustomAuthContext = () => null;
        export const assertCustomAuthContext = () => {};
        export const isCustomServerConfigured = () => false;
        export const portableSyncEnqueue = () => {};
        // fixture ${id}
    `)}`;
    (await import(mockUrl)).configure(env);
    const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
        if (context.parentURL?.startsWith(moduleUrl.href)) {
            const url = specifier === './sync-key-policy' ? policyUrl.href : specifier === './local-save-status' ? `${statusUrl.href}?fixture=files-${id}` : mockUrl;
            return { url, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    } });
    t.after(() => hooks.deregister());
    t.mock.method(console, 'warn', () => {});
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
        const method = options.method || 'GET';
        const body = options.body && JSON.parse(options.body);
        const key = body?.key || new URL(url, 'https://storage.example.test').searchParams.get('key');
        requests.push({ method, key, body, options });
        if (key === '__ping') return Response.json({ ok: true }, { status: env.pingStatus });
        const override = await env.beforeRequest?.({ method, key, body, options });
        if (override) return override;
        if (method === 'GET') return Response.json({ data: server.get(key) ?? null }, { status: env.getStatus });
        const status = method === 'POST' ? env.postStatus : env.deleteStatus;
        if (status === 200) {
            if (method === 'POST') server.set(key, structuredClone(body.value));
            else server.delete(key);
        }
        return Response.json({ ok: status === 200 }, { status });
    });
    let reload = 0;
    const load = () => import(`${moduleUrl.href}?fixture=files-${id}-${++reload}`);
    const api = await load();
    const status = await import(`${statusUrl.href}?fixture=files-${id}`);
    const drain = async () => { for (let i = 0; i < 12; i++) { await tick(); await transactions; } };
    t.after(drain);
    return { api, env, values, server, requests, load, status, drain, globals };
}

test('a failed file write cannot replace a newer browser draft, including after reload', async t => {
    const f = await fixture(t);
    f.env.postStatus = 500;
    await f.api.persistSet(KEY, { text: 'local new draft' });
    await f.drain();
    assert.deepEqual(await f.api.persistGet(KEY), { text: 'local new draft' });
    await f.drain();
    const restarted = await f.load();
    assert.deepEqual(await restarted.persistGet(KEY), { text: 'local new draft' });
    await f.drain();
    assert.deepEqual(f.server.get(KEY), { text: 'server original' });
    assert.equal(f.requests.filter(r => r.method === 'GET').length, 0);
    f.env.postStatus = 200;
    assert.deepEqual(await restarted.persistGet(KEY), { text: 'local new draft' });
    await f.drain();
    assert.deepEqual(f.server.get(KEY), { text: 'local new draft' });
    f.server.set(KEY, { text: 'subsequent server update' });
    assert.deepEqual(await restarted.persistGet(KEY), { text: 'subsequent server update' });
});

test('failed deletes stay deleted locally across reload and retry when storage recovers', async t => {
    const f = await fixture(t);
    f.values.set(KEY, { text: 'old browser draft' });
    f.env.deleteStatus = 500;
    await f.api.persistDel(KEY);
    await f.drain();
    const restarted = await f.load();
    assert.equal(await restarted.persistGet(KEY), undefined);
    await f.drain();
    assert.equal(f.values.has(KEY), false);
    assert.equal(f.requests.filter(r => r.method === 'GET').length, 0);
    f.env.deleteStatus = 200;
    assert.equal(await restarted.persistGet(KEY), undefined);
    await f.drain();
    assert.equal(f.server.has(KEY), false);
});

test('successive saves send files in order and an old acknowledgement cannot confirm a new draft', async t => {
    const f = await fixture(t);
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.env.beforeRequest = async ({ method, body }) => {
        if (method === 'POST' && body.value.text === 'first') { started.resolve(); await release.promise; }
    };
    const first = f.api.persistSet(KEY, { text: 'first' }, { awaitServerWrite: true });
    await started.promise;
    await f.api.persistSet(KEY, { text: 'second' });
    assert.deepEqual(f.values.get(KEY), { text: 'second' });
    assert.equal(f.requests.filter(r => r.method === 'POST' && r.key === KEY).length, 1);
    release.resolve();
    await first;
    await f.drain();
    assert.deepEqual(f.server.get(KEY), { text: 'second' });
    assert.deepEqual(await f.api.persistGet(KEY), { text: 'second' });
});

test('a late server read cannot overwrite an edit made while its body was loading', async t => {
    const f = await fixture(t);
    await f.api.persistSet(KEY, { text: 'confirmed' }, { awaitServerWrite: true });
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.env.beforeRequest = async ({ method }) => {
        if (method === 'GET') { started.resolve(); return { ok: true, json: () => release.promise }; }
    };
    const reading = f.api.persistGet(KEY);
    await started.promise;
    await f.api.persistSet(KEY, { text: 'edited during read' }, { awaitServerWrite: true });
    release.resolve({ data: { text: 'stale response' } });
    assert.deepEqual(await reading, { text: 'edited during read' });
    assert.deepEqual(f.values.get(KEY), { text: 'edited during read' });
});

test('different legacy browser and server drafts are both preserved without choosing a winner', async t => {
    const f = await fixture(t);
    f.values.set(KEY, { text: 'legacy local draft' });
    assert.deepEqual(await f.api.persistGet(KEY), { text: 'legacy local draft' });
    await f.drain();
    assert.deepEqual(f.server.get(KEY), { text: 'server original' });
    assert.deepEqual(f.values.get(KEY), { text: 'legacy local draft' });
    assert.equal(f.requests.filter(r => r.method === 'POST' && r.key === KEY).length, 0);
});

test('server-only data is cached for offline reading', async t => {
    const f = await fixture(t);
    assert.deepEqual(await f.api.persistGet(KEY), { text: 'server original' });
    f.env.getStatus = 500;
    assert.deepEqual(await f.api.persistGet(KEY), { text: 'server original' });
    assert.deepEqual(f.values.get(KEY), { text: 'server original' });
});

const chapterRead = { validateValue: value => {
    if (!Array.isArray(value)) throw new Error('Invalid chapter list');
} };

test('validated reads reject malformed files before replacing the last readable browser copy', async t => {
    const f = await fixture(t);
    const chapters = [{ id: 'chapter', content: 'saved locally' }];
    await f.api.persistSet(KEY, chapters, { awaitServerWrite: true });
    f.server.set(KEY, {});
    await assert.rejects(f.api.persistGet(KEY, chapterRead), /Invalid chapter list/);
    assert.deepEqual(f.values.get(KEY), chapters);
});

test('a malformed legacy browser value is never queued for file migration by a chapter read', async t => {
    const f = await fixture(t);
    f.values.set(KEY, false);
    await assert.rejects(f.api.persistGet(KEY, chapterRead), /Invalid chapter list/);
    await f.drain();
    assert.deepEqual([...f.values], [[KEY, false]]);
    assert.equal(f.requests.length, 0);
});

test('file read failure without a cached copy cannot initialize an empty chapter list', async t => {
    const f = await fixture(t);
    f.env.getStatus = 500;
    await assert.rejects(f.api.persistGet(KEY, chapterRead));
    assert.equal(f.values.has(KEY), false);
    f.env.getStatus = 200;
    f.server.set(KEY, [{ id: 'saved' }]);
    assert.deepEqual(await f.api.persistGet(KEY, chapterRead), [{ id: 'saved' }]);
});

test('a lost pending value and a paused migration cannot be acknowledged as successful', async t => {
    const f = await fixture(t);
    f.env.pingStatus = 403;
    await f.api.persistSet(KEY, [], { awaitServerWrite: true });
    f.values.delete(KEY);
    await assert.rejects(f.api.persistGet(KEY, chapterRead), /missing/);
    f.globals.window._isAppForcePulling = true;
    await assert.rejects(f.api.persistSet(KEY, [], { requireWrite: true }));
    assert.equal(f.values.has(KEY), false);
});

test('failure to save pending metadata aborts the data write and reports a local save error', async t => {
    const f = await fixture(t);
    f.values.set(KEY, { text: 'original' });
    f.env.failPut = key => key.startsWith('author-file-storage-state:');
    await assert.rejects(f.api.persistSet(KEY, { text: 'new' }), { name: 'QuotaExceededError' });
    assert.deepEqual(f.values.get(KEY), { text: 'original' });
    assert.equal(f.requests.length, 0);
    assert.equal(f.status.getLocalSaveSnapshot().status, 'error');
});

test('explicitly awaited storage writes keep reporting transient failures until recovery', async t => {
    const f = await fixture(t);
    f.env.postStatus = 500;
    await assert.rejects(f.api.persistSet(KEY, 'first', { awaitServerWrite: true }), /500/);
    await assert.rejects(f.api.persistSet(KEY, 'second', { awaitServerWrite: true }), /500/);
    f.env.postStatus = 200;
    await f.api.persistSet(KEY, 'third', { awaitServerWrite: true });
    assert.equal(f.server.get(KEY), 'third');
});

test('an unavailable initial probe is retried, while disabled storage permits browser-only saves', async t => {
    for (const pingStatus of [500, 403, 404]) {
        await t.test(String(pingStatus), async t => {
            const f = await fixture(t);
            f.env.pingStatus = pingStatus;
            const saving = f.api.persistSet(KEY, 'new', { awaitServerWrite: true });
            if (pingStatus === 500) await assert.rejects(saving, /unavailable/);
            else await saving;
            assert.equal(await f.api.persistGet(KEY), 'new');
            await f.drain();
            f.env.pingStatus = 200;
            await f.api.persistSet(KEY, 'retry', { awaitServerWrite: true });
            assert.deepEqual(f.server.get(KEY), pingStatus === 500 ? 'retry' : { text: 'server original' });
        });
    }
});

test('a response without explicit acknowledgement leaves the draft pending', async t => {
    const f = await fixture(t);
    f.env.beforeRequest = async ({ method }) => method === 'POST' ? Response.json({}) : undefined;
    await assert.rejects(f.api.persistSet(KEY, 'new', { awaitServerWrite: true }), /not acknowledged/);
    const restarted = await f.load();
    assert.equal(await restarted.persistGet(KEY), 'new');
});

test('a queued deletion cannot overtake an earlier save or resurrect after reload', async t => {
    const f = await fixture(t);
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.env.beforeRequest = async ({ method }) => { if (method === 'POST') { started.resolve(); await release.promise; } };
    const saving = f.api.persistSet(KEY, 'new', { awaitServerWrite: true });
    await started.promise;
    const deleting = f.api.persistDel(KEY, { awaitServerWrite: true });
    await tick();
    release.resolve();
    await Promise.all([saving, deleting]);
    assert.equal(f.server.has(KEY), false);
    assert.equal(await (await f.load()).persistGet(KEY), undefined);
});

test('a successful server read is still returned when the browser cache is full', async t => {
    const f = await fixture(t);
    f.env.failPut = () => true;
    assert.deepEqual(await f.api.persistGet(KEY), { text: 'server original' });
    assert.equal(f.values.has(KEY), false);
    assert.deepEqual(f.server.get(KEY), { text: 'server original' });
});

test('legacy migration writes only missing server content and acknowledges identical content without rewriting it', async t => {
    for (const exists of [false, true]) {
        await t.test(String(exists), async t => {
            const f = await fixture(t);
            f.values.set(KEY, 'legacy');
            if (exists) f.server.set(KEY, 'legacy');
            else f.server.delete(KEY);
            assert.equal(await f.api.persistGet(KEY), 'legacy');
            await f.drain();
            assert.equal(f.server.get(KEY), 'legacy');
            assert.equal(f.requests.filter(r => r.method === 'POST' && r.key === KEY).length, exists ? 0 : 1);
            f.server.set(KEY, 'later server edit');
            assert.equal(await f.api.persistGet(KEY), 'later server edit');
        });
    }
});

test('local-only settings never probe or write file storage', async t => {
    const f = await fixture(t);
    await f.api.persistSet('author-ai-sessions', { private: 'synthetic conversation' });
    assert.deepEqual(await f.api.persistGet('author-ai-sessions'), { private: 'synthetic conversation' });
    assert.equal(f.requests.length, 0);
    assert.deepEqual([...f.values.keys()], ['author-ai-sessions']);
});

test('cancelled writes cannot acknowledge a late response or dispatch a queued request', async t => {
    const f = await fixture(t);
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    const controller = new AbortController();
    f.env.beforeRequest = async ({ method }) => {
        if (method === 'POST') {
            started.resolve();
            return { ok: true, json: () => release.promise };
        }
    };
    const saving = f.api.persistSet(KEY, 'first', { signal: controller.signal, awaitServerWrite: true });
    const rejected = assert.rejects(saving, { name: 'AbortError' });
    await started.promise;
    await f.api.persistSet(KEY, 'second', { signal: controller.signal });
    controller.abort();
    release.resolve({ ok: true });
    await rejected;
    await f.drain();
    assert.equal(f.requests.filter(r => r.method === 'POST' && r.key === KEY).length, 1);
    assert.equal(f.values.get(KEY), 'second');
    const state = [...f.values.entries()].find(([key]) => key.startsWith('author-file-storage-state:'))[1];
    assert.equal(state.pending, true);
});

test('changing the file user while reading prevents the response from being cached or returned', async t => {
    const f = await fixture(t);
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.env.beforeRequest = async ({ method }) => {
        if (method === 'GET') { started.resolve(); return { ok: true, json: () => release.promise }; }
    };
    const reading = f.api.persistGet(KEY);
    const rejected = assert.rejects(reading, /user changed/);
    await started.promise;
    f.globals.document.cookie = 'author-uid=another-user';
    release.resolve({ data: 'previous user data' });
    await rejected;
    assert.equal(f.values.size, 0);
});

test('separate application instances use the shared browser lock to order file writes', async t => {
    const f = await fixture(t);
    const locks = new Map();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
        request(key, options, callback) {
            assert.equal(options.mode, 'exclusive');
            const pending = (locks.get(key) || Promise.resolve()).catch(() => {}).then(callback);
            locks.set(key, pending);
            return pending;
        },
    } } });
    t.after(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; });
    const secondApp = await f.load();
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.env.beforeRequest = async ({ method, body }) => {
        if (method === 'POST' && body.value === 'first tab') { started.resolve(); await release.promise; }
    };
    const first = f.api.persistSet(KEY, 'first tab', { awaitServerWrite: true });
    await started.promise;
    await secondApp.persistSet(KEY, 'second tab');
    assert.equal(f.requests.filter(r => r.method === 'POST' && r.key === KEY).length, 1);
    release.resolve();
    await first;
    await f.drain();
    assert.equal(f.server.get(KEY), 'second tab');
    assert.equal(await secondApp.persistGet(KEY), 'second tab');
});
