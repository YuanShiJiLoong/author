import assert from 'node:assert/strict';
import test from 'node:test';

import { collectSearchSources, sourceSiteName } from '../app/lib/search-sources.js';

test('多组来源合并后按网址去重，保留先出现的顺序', () => {
    const toolCalls = [
        { type: 'grounding', sources: [{ title: 'A', uri: 'https://www.zhihu.com/q/1' }, { title: '', uri: 'https://baike.baidu.com/x' }] },
        { type: 'codeExec', code: 'x' },
        { type: 'grounding', sources: [{ title: 'A again', uri: 'https://www.zhihu.com/q/1#frag' }, { title: 'B', uri: 'https://baike.baidu.com/x/' }] },
    ];
    assert.deepEqual(collectSearchSources(toolCalls), [
        { title: 'A', uri: 'https://www.zhihu.com/q/1', site: 'zhihu.com' },
        { title: 'B', uri: 'https://baike.baidu.com/x', site: 'baike.baidu.com' },
    ]);
});

test('只保留 http(s) 链接', () => {
    const toolCalls = [{ type: 'grounding', sources: [
        { title: 'x', uri: 'javascript:alert(1)' },
        { title: 'y', uri: 'not a url' },
        { title: 'z', uri: 'http://example.test/' },
    ] }];
    assert.deepEqual(collectSearchSources(toolCalls).map(s => s.uri), ['http://example.test/']);
    assert.deepEqual(collectSearchSources(undefined), []);
});

test('站点名去掉 www / m / wap 前缀', () => {
    assert.equal(sourceSiteName('https://www.example.test/a'), 'example.test');
    assert.equal(sourceSiteName('https://m.96tw.net/a'), '96tw.net');
    assert.equal(sourceSiteName('bad'), '');
});
