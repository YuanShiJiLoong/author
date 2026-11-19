import assert from 'node:assert/strict';
import test from 'node:test';
import { diffKeyToItems, fingerprint, mergeItemsIntoLocal, splitPushBatches, utf8ByteLength } from '../app/lib/custom-sync-core.js';

const row = (id, content) => ({ id, content });
const remote = (value, serverSeq) => ({ itemId: value.id, value, serverSeq });
const baseline = values => Object.fromEntries(values.map(value => [value.id, { hash: fingerprint(value) }]));

for (const kind of ['chapter', 'settings_node', 'memory_group']) {
    test(`${kind}: multiple revisions apply the highest server sequence without mistaking it for a local edit`, () => {
        const initial = row('one', 'initial');
        const latest = row('one', 'latest');
        const items = [remote(latest, 10), remote(row('one', 'middle'), 9)];
        const result = mergeItemsIntoLocal(kind, [initial], items, baseline([initial]));
        assert.deepEqual(result, { changed: true, value: [latest] });
        assert.deepEqual(initial, row('one', 'initial'));
        assert.equal(items[0].serverSeq, 10);
    });

    test(`${kind}: a create/update/delete batch leaves no resurrected item`, () => {
        const result = mergeItemsIntoLocal(kind, [], [
            remote(row('one', 'new'), 1), remote(row('one', 'updated'), 2),
            { itemId: 'one', deleted: true, serverSeq: 3 },
        ]);
        assert.deepEqual(result.value, []);
    });

    test(`${kind}: an unsent local deletion survives incoming live revisions`, () => {
        const initial = row('one', 'initial');
        const result = mergeItemsIntoLocal(kind, [], [remote(row('one', 'remote edit'), 2)], baseline([initial]));
        assert.deepEqual(result, { changed: false, value: [] });
    });

    test(`${kind}: local edits survive update/delete batches while unrelated changes apply`, () => {
        const initial = row('one', 'initial');
        const local = row('one', 'new local draft');
        const other = row('two', 'unchanged');
        const updatedOther = row('two', 'remote update');
        const result = mergeItemsIntoLocal(kind, [local, other], [
            remote(row('one', 'remote edit'), 2), { itemId: 'one', deleted: true, serverSeq: 3 },
            remote(updatedOther, 4),
        ], baseline([initial, other]));
        assert.deepEqual(result.value, [local, updatedOther]);
    });

    test(`${kind}: a remote recreation after an acknowledged deletion can be restored`, () => {
        const recreated = row('one', 'recreated remotely');
        assert.deepEqual(mergeItemsIntoLocal(kind, [], [remote(recreated, 4)], { one: { deleted: true } }).value, [recreated]);
    });

    test(`${kind}: force-rebuilding a tombstone-only key produces an empty array`, () => {
        assert.deepEqual(mergeItemsIntoLocal(kind, undefined, [{ itemId: 'one', deleted: true, serverSeq: 3 }]).value, []);
    });
}

test('merge preserves local order, appends new items, and respects numeric sequence strings', () => {
    const local = [row('b', 'b'), row('a', 'a')];
    const latest = row('a', 'latest');
    const added = row('c', 'new');
    assert.deepEqual(mergeItemsIntoLocal('chapter', local, [remote(latest, '10'), remote(row('a', 'older'), '9'), remote(added, '11')], baseline(local)).value, [local[0], latest, added]);
});

test('works-index mirroring uses numeric server sequence order', () => {
    const latest = [{ id: 'work-new' }];
    const result = mergeItemsIntoLocal('works_index', [], [
        { itemId: '_index', serverSeq: '10', value: latest },
        { itemId: '_index', serverSeq: '9', value: [{ id: 'old' }] },
    ]);
    assert.deepEqual(result.value, latest);
});

// ==================== 推送版本戳 ====================
// 设定 / 记忆组默认用条目自带的 updatedAt 作为版本。被服务器判 stale 后若原样重推，
// 版本戳不变 → 服务器给出同样的结论 → 永远推不上去，用户永久停在"部分内容未同步"。
// 章节一直用 now，所以没有这个问题。以下用例锁住两个出口：恢复和 stale 重推。

const NOW = '2026-01-02T03:04:05.000Z';
const OLD = '2025-06-07T08:09:10.000Z';
const SETTINGS_KEY = 'author-settings-nodes-work-test';
const node = (id, updatedAt = OLD) => ({ id, content: 'c-' + id, updatedAt });
const stamps = result => Object.fromEntries(result.items.map(item => [item.itemId, item.clientUpdatedAt]));

test('设定默认仍沿用条目自带的 updatedAt', () => {
    const result = diffKeyToItems(SETTINGS_KEY, [node('a')], NOW);
    assert.deepEqual(stamps(result), { a: OLD });
});

test('恢复的 key 整份用当前时间，旧时间戳不会被云端判过期', () => {
    const result = diffKeyToItems(SETTINGS_KEY, [node('a'), node('b')], NOW, {}, {}, { freshClientUpdatedAt: true });
    assert.deepEqual(stamps(result), { a: NOW, b: NOW });
});

test('只有被判 stale 的条目换版本戳，其余条目不受影响', () => {
    const result = diffKeyToItems(
        SETTINGS_KEY, [node('a'), node('b')], NOW, {}, {},
        { freshClientUpdatedAt: new Set(['a']) },
    );
    assert.deepEqual(stamps(result), { a: NOW, b: OLD });
});

test('stale 重推必须换新版本戳，否则重试永远得到同样结论', () => {
    const value = [node('a')];
    const first = diffKeyToItems(SETTINGS_KEY, value, NOW);
    // 服务器判 stale：条目留在 pending，内容一个字没改，下一轮照原样重推。
    const pending = { a: { hash: fingerprint(value[0]) } };
    const later = '2026-01-02T03:09:05.000Z';
    const retryWithoutFix = diffKeyToItems(SETTINGS_KEY, value, later, {}, pending);
    assert.equal(retryWithoutFix.items[0].clientUpdatedAt, first.items[0].clientUpdatedAt, '未标记时确实会原样重推');

    const retry = diffKeyToItems(SETTINGS_KEY, value, later, {}, pending, { freshClientUpdatedAt: new Set(['a']) });
    assert.equal(retry.items[0].clientUpdatedAt, later);
    assert.notEqual(retry.items[0].clientUpdatedAt, first.items[0].clientUpdatedAt);
    // 内容本身不能被改动：保住本地草稿是既有契约。
    assert.deepEqual(retry.items[0].value, node('a'));
});

test('章节不受影响，始终用当前时间', () => {
    const result = diffKeyToItems('author-chapters-work-test', [node('a')], NOW);
    assert.deepEqual(stamps(result), { a: NOW });
});

// ==================== 推送切批 ====================
// 服务端会限制单个请求体的大小。只按条数切（100 条一批）的话，每章几千字的长篇整批超限，
// 重试时还是同一批、同样大小，用户永久停在"部分内容未同步"。以下用例锁住按字节切批。

const bodyBytes = batch => Buffer.byteLength(JSON.stringify({ items: batch }), 'utf8');
const pushItem = (id, text) => ({ workId: 'w', kind: 'chapter', itemId: id, value: { id, content: text }, contentHash: 'h', clientUpdatedAt: NOW });

test('UTF-8 字节数与实际发出的请求体一致（中文 3 字节、emoji 4 字节）', () => {
    for (const text of ['plain ascii', '中文正文', 'é ü', '表情😀结尾', JSON.stringify('孤立代理\ud800')]) {
        assert.equal(utf8ByteLength(text), Buffer.byteLength(text, 'utf8'), text);
    }
});

test('长章节按请求体字节切批，每批都不超上限，顺序与条目一个不少', () => {
    const items = Array.from({ length: 30 }, (_, index) => pushItem(`c${index}`, '长'.repeat(20_000 + index * 997)));
    const { batches, oversized } = splitPushBatches(items, { maxItems: 100, maxBytes: 200_000 });
    assert.deepEqual(oversized, []);
    assert.ok(batches.length > 1);
    for (const batch of batches) assert.ok(bodyBytes(batch) <= 200_000, `batch of ${bodyBytes(batch)} bytes`);
    assert.deepEqual(batches.flat(), items);
});

test('条数上限仍然生效', () => {
    const items = Array.from({ length: 250 }, (_, index) => pushItem(`c${index}`, 'short'));
    const { batches } = splitPushBatches(items, { maxItems: 100, maxBytes: 900_000 });
    assert.deepEqual(batches.map(batch => batch.length), [100, 100, 50]);
});

test('刚好压线的批不超限，多一个字节就换批', () => {
    const one = pushItem('a', 'x');
    const exact = bodyBytes([one, one]);
    assert.equal(splitPushBatches([one, one], { maxItems: 100, maxBytes: exact }).batches.length, 1);
    assert.equal(splitPushBatches([one, one], { maxItems: 100, maxBytes: exact - 1 }).batches.length, 2);
});

test('单条就放不进一个请求的条目单独隔离，不连累前后条目', () => {
    const small = pushItem('small', '短');
    const huge = pushItem('huge', '巨'.repeat(100_000));
    const tail = pushItem('tail', '尾');
    const { batches, oversized } = splitPushBatches([small, huge, tail], { maxItems: 100, maxBytes: 200_000 });
    assert.deepEqual(batches, [[small, tail]]);
    assert.equal(oversized.length, 1);
    assert.equal(oversized[0].item, huge);
    assert.equal(oversized[0].bytes, bodyBytes([huge]));
});

for (const kind of ['chapter', 'settings_node', 'memory_group']) {
    test(`${kind}: a damaged local value is never diffed into deletions or merged into a partial list`, () => {
        const key = { chapter: 'author-chapters-w', settings_node: 'author-settings-nodes-w', memory_group: 'author-chapter-memory-groups-w' }[kind];
        const prev = baseline([row('one', 'a'), row('two', 'b')]);
        for (const damaged of [{ broken: true }, 'not json', 42, false]) {
            const diff = diffKeyToItems(key, damaged, 'now', prev);
            assert.deepEqual(diff, { items: [], nextItemState: prev, damagedLocalValue: true });
            const merge = mergeItemsIntoLocal(kind, damaged, [remote(row('one', 'remote'), 5)], prev);
            assert.deepEqual(merge, { changed: false, value: damaged, damagedLocalValue: true });
        }
        // 记录不存在（整部作品删掉）仍是合法的删除。
        assert.deepEqual(diffKeyToItems(key, undefined, 'now', prev).items.map(item => [item.itemId, item.deleted]), [['one', true], ['two', true]]);
    });
}
