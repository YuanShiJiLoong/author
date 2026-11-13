import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeepSeekWebToolsParams, supportsDeepSeekWebTools } from '../app/lib/ai-model-rules.js';
import { resolveDeepSeekWebTools } from '../app/lib/search-config.js';
import { createOpenAiMapper } from '../app/lib/ai-stream.js';

const deepseek = (overrides = {}) => ({
    provider: 'deepseek', model: 'deepseek-flash', apiKey: 'k', baseUrl: 'https://api.deepseek.com',
    tools: { searchEnabled: true }, ...overrides,
});

test('only deepseek-flash supports the built-in web tools', () => {
    assert.equal(supportsDeepSeekWebTools('deepseek-flash'), true);
    assert.equal(supportsDeepSeekWebTools(' DeepSeek-Flash '), true);
    assert.equal(supportsDeepSeekWebTools('deepseek-v4-pro'), false);
    assert.equal(supportsDeepSeekWebTools(''), false);
});

test('request declares deepseek_web_search, plus deepseek_read_url when reading is on', () => {
    assert.deepEqual(buildDeepSeekWebToolsParams(null), {});
    assert.deepEqual(buildDeepSeekWebToolsParams({ readUrl: false }), { tools: [{ type: 'deepseek_web_search' }] });
    assert.deepEqual(buildDeepSeekWebToolsParams({ readUrl: true }), {
        tools: [{ type: 'deepseek_web_search' }, { type: 'deepseek_read_url' }],
    });
});

test('DeepSeek preset with flash uses built-in tools by default', () => {
    assert.deepEqual(resolveDeepSeekWebTools(deepseek()), { readUrl: true });
    assert.deepEqual(resolveDeepSeekWebTools(deepseek({ provider: 'deepseek_abc12' })), { readUrl: true });
    assert.deepEqual(resolveDeepSeekWebTools(deepseek({ searchConfig: { deepseekReadWebpage: false } })), { readUrl: false });
});

test('falls back to the old search path when not applicable', () => {
    assert.equal(resolveDeepSeekWebTools(deepseek({ tools: { searchEnabled: true, searchMode: 'external' } })), null, 'user chose external search');
    assert.equal(resolveDeepSeekWebTools(deepseek({ model: 'deepseek-v4-pro' })), null, 'model not supported');
    assert.equal(resolveDeepSeekWebTools(deepseek({ provider: 'openai', providerType: 'openai' })), null, 'not the DeepSeek preset');
    assert.equal(resolveDeepSeekWebTools(null), null);
});

test('url_citation annotations in the final chunk become grounding sources', () => {
    const mapper = createOpenAiMapper();
    const chunk = {
        choices: [{
            delta: {
                content: '。',
                annotations: [{ type: 'url_citation', url_citation: { url: 'https://example.test/a', title: 'A', start_index: 0, end_index: 3 } }],
            },
            finish_reason: 'stop',
        }],
    };
    const { events } = mapper(JSON.stringify(chunk));
    assert.deepEqual(events.find(e => e.grounding)?.grounding.sources, [{ title: 'A', uri: 'https://example.test/a' }]);
    assert.deepEqual(mapper('[DONE]'), { done: true });
});
