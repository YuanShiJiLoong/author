import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let instance = 0;
async function fixture(t) {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const prefs = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => prefs.get(key), setItem: (key, value) => prefs.set(key, value) } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    t.after(() => {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else delete globalThis.window;
        if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage);
        else delete globalThis.localStorage;
    });
    const values = new Map([['author-chapters-a', [{ id: 'a1', title: 'Chapter A', content: 'base' }]], ['author-chapters-b', [{ id: 'b1', content: 'B' }]]]);
    const env = { values, writes: [], fail: false };
    const mockUrl = `data:text/javascript,${encodeURIComponent(`
        // ${++instance}
        let env;
        export const configure = value => { env = value; };
        export const persistGet = async (key, options = {}) => {
            if (key === env.failReadKey) throw new Error('Synthetic read failure');
            const value = structuredClone(env.values.get(key));
            if (value !== undefined) options.validateValue?.(value);
            return value;
        };
        export const persistSet = async (key, value) => {
            if (env.fail) throw new Error('Synthetic write failure');
            env.writes.push({key, value: structuredClone(value)});
            env.values.set(key, structuredClone(value));
        };
        export const persistDel = key => env.values.delete(key);
    `)}`;
    (await import(mockUrl)).configure(env);
    const moduleUrl = new URL('../app/lib/storage.js', import.meta.url);
    const hooks = registerHooks({ resolve(specifier, context, next) {
        if (context.parentURL?.startsWith(moduleUrl.href) && specifier === './persistence') return { url: mockUrl, shortCircuit: true };
        return next(specifier, context);
    } });
    t.after(() => hooks.deregister());
    const api = await import(`${moduleUrl.href}?editor=${instance}`);
    return { api, env, values };
}

const draft = (overrides = {}) => ({ content: 'local', wordCount: 5, baseContent: 'base', backupSuffix: 'External backup', ...overrides });

test('unreadable chapters stop opening, and a retry reads the original draft', async t => {
    const f = await fixture(t);
    f.env.failReadKey = 'author-chapters-a';
    await assert.rejects(f.api.openWorkChapters('a', 'First chapter'), /Synthetic read failure/);
    await assert.rejects(f.api.getChapters('a'), /Synthetic read failure/);
    f.env.failReadKey = undefined;
    assert.equal((await f.api.openWorkChapters('a', 'First chapter'))[0].content, 'base');
    assert.deepEqual(f.env.writes, []);
});

test('malformed values and partially readable arrays are preserved without rewriting', async t => {
    const f = await fixture(t);
    for (const value of [null, false, {}, [null], [{ id: 'ok', content: 'draft' }, { content: 'orphan' }]]) {
        f.values.set('author-chapters-a', value);
        await assert.rejects(f.api.openWorkChapters('a', 'First chapter'));
        await assert.rejects(f.api.createChapter('Another chapter', 'a'));
        await assert.rejects(f.api.saveChapters([{ id: 'replacement' }], 'a'));
        assert.deepEqual(f.values.get('author-chapters-a'), value);
    }
    assert.deepEqual(f.env.writes, []);
});

test('an explicit recovery write can replace an unreadable or malformed chapter record', async t => {
    const f = await fixture(t);
    const restored = [{ id: 'restored', content: 'from snapshot' }];
    f.env.failReadKey = 'author-chapters-a';
    await assert.rejects(f.api.saveChapters(restored, 'a'));
    await f.api.saveChapters(restored, 'a', { overwriteDamaged: true });
    f.env.failReadKey = undefined;
    assert.deepEqual(await f.api.getChapters('a'), restored);
    f.values.set('author-chapters-b', { broken: true });
    await f.api.saveChapters(restored, 'b', { overwriteDamaged: true });
    assert.deepEqual(await f.api.getChapters('b'), restored);
    // 要写入的内容本身仍须合格。
    await assert.rejects(f.api.saveChapters([{ content: 'no id' }], 'a', { overwriteDamaged: true }));
});

test('legacy read or copy failure can be retried before a first chapter is created', async t => {
    const f = await fixture(t);
    const legacy = [{ id: 'old', content: 'legacy text' }];
    f.values.set('author-chapters', legacy);
    const open = () => f.api.openWorkChapters('new', 'First chapter', { migrateLegacy: true });
    f.env.failReadKey = 'author-chapters';
    await assert.rejects(open(), /Synthetic read failure/);
    f.env.failReadKey = undefined;
    f.env.fail = true;
    await assert.rejects(open(), /Synthetic write failure/);
    assert.equal(f.values.has('author-chapters-new'), false);
    assert.deepEqual(f.values.get('author-chapters'), legacy);
    f.env.fail = false;
    assert.deepEqual(await open(), legacy);
    assert.deepEqual(await open(), legacy);
    assert.deepEqual(f.env.writes, [{ key: 'author-chapters-new', value: legacy }]);
});

test('concurrent opens of an empty work initialize one first chapter', async t => {
    const f = await fixture(t);
    for (const work of ['empty', 'missing']) {
        if (work === 'empty') f.values.set('author-chapters-empty', []);
        const open = () => f.api.openWorkChapters(work, 'First chapter');
        const [a, b] = await Promise.all([open(), open()]);
        assert.equal(a.length, 1);
        assert.deepEqual(a, b);
        assert.equal(f.env.writes.filter(write => write.key === 'author-chapters-' + work).length, 1);
    }
});

test('a remembered work with a missing chapter record is not reinitialized', async t => {
    const f = await fixture(t);
    f.api.rememberChapterId('missing', 'last-chapter');
    const open = () => f.api.openWorkChapters('missing', 'First chapter', { migrateLegacy: true });
    await assert.rejects(open());
    await assert.rejects(f.api.getChapters('missing'));
    assert.deepEqual(f.env.writes, []);
    f.values.set('author-chapters', [{ id: 'legacy', content: 'recovered' }]);
    assert.deepEqual(await open(), [{ id: 'legacy', content: 'recovered' }]);
});

test('a concurrent persisted revision is preserved alongside the current draft in one write', async t => {
    const f = await fixture(t);
    f.values.get('author-chapters-a')[0].content = 'remote';
    const result = await f.api.saveEditorChapter('a1', draft(), 'a');
    assert.equal(result.chapter.content, 'local');
    assert.deepEqual(result.backups.map(b => b.content), ['remote']);
    assert.equal(result.backups[0].numberingIgnored, true);
    assert.equal(f.env.writes.length, 1);
    assert.deepEqual(f.env.writes[0].value.map(ch => ch.content), ['local', 'remote']);
    assert.equal(f.values.get('author-chapters-b')[0].content, 'B');
});

test('all pending external versions including an empty body survive a local save', async t => {
    const f = await fixture(t);
    const result = await f.api.saveEditorChapter('a1', draft({ externalVersions: ['remote one', '', 'remote two', 'remote one'] }), 'a');
    assert.deepEqual(result.backups.map(b => b.content), ['remote one', '', 'remote two']);
});

test('matching base content is an ordinary save and creates no backups', async t => {
    const f = await fixture(t);
    const result = await f.api.saveEditorChapter('a1', draft(), 'a');
    assert.equal(result.backups.length, 0);
});

test('failed persistence preserves the old chapter and retry does not duplicate backups', async t => {
    const f = await fixture(t);
    f.values.get('author-chapters-a')[0].content = 'remote';
    f.env.fail = true;
    await assert.rejects(f.api.saveEditorChapter('a1', draft(), 'a'), /Synthetic write failure/);
    assert.deepEqual(f.values.get('author-chapters-a').map(ch => ch.content), ['remote']);
    f.env.fail = false;
    await f.api.saveEditorChapter('a1', draft(), 'a');
    await f.api.saveEditorChapter('a1', draft({ externalVersions: ['remote'] }), 'a');
    assert.deepEqual(f.values.get('author-chapters-a').map(ch => ch.content), ['local', 'remote']);
});

test('a delayed save never recreates a removed chapter or writes into another work', async t => {
    const f = await fixture(t);
    f.values.set('author-chapters-a', []);
    await assert.rejects(f.api.saveEditorChapter('a1', draft(), 'a'), /no longer exists/);
    assert.equal(f.env.writes.length, 0);
    assert.equal(f.values.get('author-chapters-b')[0].content, 'B');
});
