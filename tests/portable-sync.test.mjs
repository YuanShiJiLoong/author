import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// WebDAV（坚果云等）自动同步在手机上的两个问题：
//   1. 待推队列只在内存里，手机浏览器切到后台被冻结或回收，5 分钟定时器等不到，内容推不出去；
//   2. 部署在反向代理后面时，代理嫌请求体太大会直接回 HTML 413，用户只看到一句 "WebDAV put failed"。

const moduleUrl = new URL('../app/lib/portable-sync.js', import.meta.url);
const PENDING_KEY = 'author-sync-webdav-pending-v1';
const CHAPTERS = 'author-chapters-work-phone';
let instance = 0;

const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)); };

function installGlobals(t, storage) {
    const listeners = new Map();
    const target = () => ({ addEventListener: (name, callback) => listeners.set(name, callback) });
    const globals = {
        window: target(),
        document: { ...target(), visibilityState: 'visible' },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key),
        },
    };
    const originals = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    t.after(() => {
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
    return {
        hide: () => { globalThis.document.visibilityState = 'hidden'; listeners.get('visibilitychange')?.(); },
    };
}

// 每次调用相当于重新打开一次页面：模块状态全新，浏览器存储（storage / values）沿用。
async function openPage(t, { storage = new Map(), values = new Map() } = {}) {
    if (!storage.has('author-sync-settings')) {
        storage.set('author-sync-settings', JSON.stringify({ webdav: {
            enabled: true, endpoint: 'https://dav.example.test/dav/', username: 'writer@example.test', basePath: '/AuthorSync',
        } }));
        storage.set('author-sync-secret-webdav-password', 'synthetic-app-password');
    }
    const page = installGlobals(t, storage);
    const requests = [];
    const env = {
        respond: ({ action }) => {
            if (action === 'propfind') return Response.json({ ok: true, exists: true });
            if (action === 'get') return Response.json({ ok: true, missing: true });
            return Response.json({ ok: true });
        },
    };
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        return env.respond(body);
    });
    t.mock.method(globalThis, 'setInterval', () => 1);
    t.mock.method(globalThis, 'clearInterval', () => {});
    t.mock.method(globalThis, 'setTimeout', () => 1);
    t.mock.method(globalThis, 'clearTimeout', () => {});

    const id = ++instance;
    globalThis[`__portableSyncValues${id}`] = values;
    const persistenceUrl = `data:text/javascript,${encodeURIComponent(`
        const values = globalThis.__portableSyncValues${id};
        export async function persistGet(key) { return structuredClone(values.get(key)); }
        export async function persistSet(key, value) { values.set(key, structuredClone(value)); }
        export async function persistDel(key) { values.delete(key); }
    `)}`;
    const stubs = {
        './persistence': persistenceUrl,
        './diagnostics': 'data:text/javascript,export function recordDiagnosticEvent() {}',
        './custom-server-sync': 'data:text/javascript,export function markKeysRestored() {}',
    };
    const instanceUrl = `${moduleUrl.href}?page=${id}`;
    // 模块里有运行时的动态 import（persistence 等），钩子要保留到用例结束。
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (context.parentURL === instanceUrl) {
                if (stubs[specifier]) return { url: stubs[specifier], shortCircuit: true };
                if (specifier.startsWith('./')) return nextResolve(new URL(`${specifier}.js`, moduleUrl).href, context);
            }
            return nextResolve(specifier, context);
        },
    });
    t.after(() => hooks.deregister());
    const sync = await import(instanceUrl);
    const puts = () => requests.filter(request => request.action === 'put' && request.path.includes('/keys/'));
    return { sync, env, page, requests, storage, values, puts, pending: () => JSON.parse(storage.get(PENDING_KEY) || 'null') };
}

test('写完没来得及推、页面就被回收：下次打开按名字现读最新内容接着推', async t => {
    const first = await openPage(t);
    first.values.set(CHAPTERS, [{ id: 'c1', content: 'draft' }]);
    first.sync.portableSyncEnqueue(CHAPTERS, first.values.get(CHAPTERS));
    assert.deepEqual(first.pending(), { [CHAPTERS]: { deleted: false } }); // 只记名字，不存内容
    assert.equal(first.puts().length, 0);

    // 回收前本地又保存过一次：接着推的必须是本地最新内容，而不是入队时的旧值。
    first.values.set(CHAPTERS, [{ id: 'c1', content: 'final text' }]);
    const reopened = await openPage(t, { storage: first.storage, values: first.values });
    assert.equal(await reopened.sync.resumePortableSync(), 1);
    const [put] = reopened.puts();
    assert.equal(put.path, `/AuthorSync/keys/${encodeURIComponent(CHAPTERS)}.json`);
    assert.deepEqual(JSON.parse(put.body).value, [{ id: 'c1', content: 'final text' }]);
    assert.equal(reopened.pending(), null);
});

test('本地删掉的 key 在下次打开时照样推删除；记录说要写、本地却没有数据时不删远端', async t => {
    const first = await openPage(t);
    first.sync.portableSyncEnqueue('author-chapters-deleted', null, { deleted: true });
    first.sync.portableSyncEnqueue('author-chapters-vanished', [{ id: 'x' }]);

    const reopened = await openPage(t, { storage: first.storage, values: first.values });
    await reopened.sync.resumePortableSync();
    const deletes = reopened.requests.filter(request => request.action === 'delete').map(request => request.path);
    assert.deepEqual(deletes, [`/AuthorSync/keys/${encodeURIComponent('author-chapters-deleted')}.json`]);
    assert.equal(reopened.puts().length, 0);
});

test('推送失败时记录保留，推送途中被回收也不会丢', async t => {
    const first = await openPage(t);
    first.values.set(CHAPTERS, [{ id: 'c1', content: 'draft' }]);
    first.env.respond = () => Response.json({ error: 'upstream', code: 'WEBDAV_UPSTREAM_ERROR', upstreamStatus: 503 }, { status: 502 });
    first.sync.portableSyncEnqueue(CHAPTERS, first.values.get(CHAPTERS));
    await assert.rejects(first.sync.flushPortableSync({ throwOnError: true }));
    assert.deepEqual(first.pending(), { [CHAPTERS]: { deleted: false } });

    let releaseUpload = null;
    first.env.respond = ({ action }) => {
        if (action === 'propfind' && !releaseUpload) {
            return new Promise(resolve => { releaseUpload = () => resolve(Response.json({ ok: true, exists: true })); });
        }
        return Response.json({ ok: true, exists: true, missing: action === 'get' });
    };
    const flushing = first.sync.flushPortableSync({ throwOnError: true });
    await settle();
    first.sync.portableSyncEnqueue('author-settings-nodes-work-phone', [{ id: 's1' }]); // 推送途中又改了别的
    assert.deepEqual(Object.keys(first.pending()).sort(), [CHAPTERS, 'author-settings-nodes-work-phone'].sort());
    releaseUpload();
    await flushing;
    assert.deepEqual(first.pending(), { 'author-settings-nodes-work-phone': { deleted: false } });
});

test('切到后台立即推送，不等 5 分钟定时器', async t => {
    const page = await openPage(t);
    page.values.set(CHAPTERS, [{ id: 'c1', content: 'typed on the phone' }]);
    page.sync.portableSyncEnqueue(CHAPTERS, page.values.get(CHAPTERS));
    page.page.hide();
    await settle();
    assert.equal(page.puts().length, 1);
    assert.equal(page.pending(), null);
});

test('反向代理回 HTML 413 时，报错说清是上传内容太大', async t => {
    const page = await openPage(t);
    page.env.respond = ({ action }) => action === 'put'
        ? new Response('<html><center><h1>413 Request Entity Too Large</h1></center></html>', { status: 413 })
        : Response.json({ ok: true, exists: true, missing: action === 'get' });
    page.sync.portableSyncEnqueue(CHAPTERS, [{ id: 'c1', content: '长'.repeat(400_000) }]);
    await assert.rejects(
        page.sync.flushPortableSync({ throwOnError: true }),
        /约 1\.\d MB，超过了服务器允许的单次上传上限/,
    );
});

test('被导入数据覆盖的 key 不再把之前没推完的旧版本推回去', async t => {
    const page = await openPage(t);
    page.sync.portableSyncEnqueue(CHAPTERS, [{ id: 'c1', content: 'old local' }]);
    await page.sync.applySyncSnapshot({
        type: 'author-sync-snapshot-v1', version: 1,
        entries: [{ key: CHAPTERS, value: [{ id: 'c1', content: 'imported' }] }],
    });
    assert.equal(page.pending(), null);
    await page.sync.flushPortableSync({ throwOnError: true });
    assert.equal(page.puts().length, 0);
});

test('未启用 WebDAV 时启动不做任何事', async t => {
    const storage = new Map([['author-sync-settings', JSON.stringify({ webdav: { enabled: false } })]]);
    storage.set(PENDING_KEY, JSON.stringify({ [CHAPTERS]: { deleted: false } }));
    const page = await openPage(t, { storage });
    assert.equal(await page.sync.resumePortableSync(), 0);
    assert.equal(page.requests.length, 0);
});

// 局域网导入：只填分享码时只能在本服务器上找。电脑版的分享在另一台机器上，
// 找不到时要告诉用户改贴完整链接，而不是只说"分享不存在或已过期"。
async function openLanImport(t, respond) {
    const page = await openPage(t);
    const urls = [];
    globalThis.fetch.mock.mockImplementation(async (url) => { urls.push(String(url)); return respond(String(url)); });
    return { page, urls };
}

test('局域网导入只填分享码却找不到时，提示粘贴完整链接', async t => {
    const { page, urls } = await openLanImport(t, () => Response.json({ error: 'not found', code: 'SHARE_NOT_FOUND' }, { status: 404 }));
    await assert.rejects(page.sync.importLanShare('a1'.repeat(16)), /完整链接/);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].endsWith(`/api/sync/lan?token=${'a1'.repeat(16)}`));
});

test('局域网导入用完整链接时，过期仍提示分享不存在或已过期', async t => {
    const link = `http://192.168.1.20:3001/api/sync/lan?token=${'a1'.repeat(16)}`;
    const { page, urls } = await openLanImport(t, () => Response.json({ error: 'not found', code: 'SHARE_NOT_FOUND' }, { status: 404 }));
    await assert.rejects(page.sync.importLanShare(link), /分享不存在或已过期/);
    assert.deepEqual(urls, [link]);
});

test('同一服务器上的分享码照常能导入', async t => {
    const { page } = await openLanImport(t, () => Response.json({ type: 'author-sync-snapshot-v1', version: 1, entries: [] }));
    assert.equal(await page.sync.importLanShare('a1'.repeat(16)), 0);
});

test('损坏的章节记录既不推到 WebDAV，也不拿远端坏数据覆盖本机', async t => {
    const first = await openPage(t);
    first.values.set(CHAPTERS, { broken: true });
    first.sync.portableSyncEnqueue(CHAPTERS, { broken: true });
    assert.equal(first.pending(), null);

    // 之前记着要推、重开时本地已经坏了：不推，记录留着，恢复后再推。
    first.storage.set(PENDING_KEY, JSON.stringify({ [CHAPTERS]: { deleted: false } }));
    const reopened = await openPage(t, { storage: first.storage, values: first.values });
    assert.equal(await reopened.sync.resumePortableSync(), 0);
    assert.equal(reopened.puts().length, 0);
    assert.deepEqual(reopened.pending(), { [CHAPTERS]: { deleted: false } });

    const good = [{ id: 'c1', content: 'good local' }];
    reopened.values.set(CHAPTERS, good);
    await reopened.sync.applySyncSnapshot({
        type: 'author-sync-snapshot-v1', version: 1,
        entries: [{ key: CHAPTERS, value: { broken: true } }, { key: 'author-chapters-other', value: [{ id: 'o1' }] }],
    });
    assert.deepEqual(reopened.values.get(CHAPTERS), good);
    assert.deepEqual(reopened.values.get('author-chapters-other'), [{ id: 'o1' }]);
});

test('只读 WebDAV 上这一部作品的内容，不改本机', async t => {
    const page = await openPage(t);
    page.values.set(CHAPTERS, { broken: true });
    page.env.respond = ({ action, path }) => action === 'get' && path.includes(encodeURIComponent(CHAPTERS))
        ? Response.json({ ok: true, body: JSON.stringify({ key: CHAPTERS, value: [{ id: 'c1', content: 'remote' }], updatedAt: '2026-11-19T08:00:00.000Z' }) })
        : Response.json({ ok: true, missing: true });
    const remote = await page.sync.fetchKeyFromWebDav(CHAPTERS);
    assert.deepEqual(remote, { value: [{ id: 'c1', content: 'remote' }], updatedAt: '2026-11-19T08:00:00.000Z' });
    assert.deepEqual(page.values.get(CHAPTERS), { broken: true });
    assert.equal(await page.sync.fetchKeyFromWebDav('author-chapters-none'), null);
});
