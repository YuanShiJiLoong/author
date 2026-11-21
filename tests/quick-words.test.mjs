import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildQuickWordExtractionPrompts,
    buildQuickWordList,
    buildSettingsSourceTexts,
    collectSettingsQuickWords,
    findQuickWordSuggestions,
    normalizeQuickWordStore,
    parseQuickWordResponse,
} from '../app/lib/quick-words.js';
import { isSyncableKey } from '../app/lib/sync-key-policy.js';

const words = (...texts) => texts.map(text => ({ text, source: 'settings' }));

test('settings item names become quick words, folders and outline titles do not', () => {
    const nodes = [
        { id: 'f', type: 'folder', category: 'character', name: '主要角色' },
        { id: 'a', type: 'item', category: 'character', name: '沈砚（阿砚）' },
        { id: 'b', type: 'item', category: 'character', name: '陆知微/知微' },
        { id: 'c', type: 'item', category: 'location', name: '青石镇' },
        { id: 'd', type: 'item', category: 'plot', name: '第一卷主线' },
        { id: 'e', type: 'item', category: 'rules', name: '文风规范' },
        { id: 'g', type: 'item', category: 'object', name: '石' },
        { id: 'h', type: 'item', category: 'location', name: '青石镇' },
    ];
    assert.deepEqual(collectSettingsQuickWords(nodes).map(word => word.text), ['沈砚', '阿砚', '陆知微', '知微', '青石镇']);
});

test('Chinese suggestions use the longest matching tail and skip finished words', () => {
    const list = words('沈砚', '沈青禾', '青石镇', '青云门');
    assert.deepEqual(findQuickWordSuggestions('他抬头看见沈', list), { query: '沈', matches: ['沈砚', '沈青禾'] });
    assert.deepEqual(findQuickWordSuggestions('来到了青石', list), { query: '青石', matches: ['青石镇'] });
    assert.equal(findQuickWordSuggestions('他就是沈砚', list), null);
    assert.equal(findQuickWordSuggestions('天色已晚', list), null);
    assert.equal(findQuickWordSuggestions('', list), null);
});

test('Latin suggestions need two letters and ignore case', () => {
    const list = words('Aldric', 'Alvena', 'Garrow');
    assert.equal(findQuickWordSuggestions('Then A', list), null);
    assert.deepEqual(findQuickWordSuggestions('Then al', list), { query: 'al', matches: ['Aldric', 'Alvena'] });
    assert.equal(findQuickWordSuggestions('沈砚说Ga', list).query, 'Ga');
});

test('words the author used before are offered first', () => {
    const list = words('沈砚', '沈青禾');
    const usage = new Map([['沈青禾', 2]]);
    assert.deepEqual(findQuickWordSuggestions('沈', list, { usage }).matches, ['沈青禾', '沈砚']);
});

test('hidden settings names are left out and own words come first', () => {
    const store = { words: [{ text: '破玄一气指', source: 'ai' }, '沈砚'], hidden: ['青石镇'] };
    const list = buildQuickWordList(words('沈砚', '青石镇', '陆知微'), store);
    assert.deepEqual(list.map(word => word.text), ['破玄一气指', '沈砚', '陆知微']);
});

test('stored quick words are cleaned and de-duplicated', () => {
    const store = normalizeQuickWordStore({
        words: [' 「沈砚」 ', { text: '沈砚', source: 'ai' }, 'x', { text: 'Greywater Keep', source: 'ai' }, 42],
        hidden: ['青石镇', '青石镇', ''],
    });
    assert.deepEqual(store, {
        words: [{ text: '沈砚', source: 'manual' }, { text: 'Greywater Keep', source: 'ai' }],
        hidden: ['青石镇'],
    });
    assert.deepEqual(normalizeQuickWordStore(null), { words: [], hidden: [] });
});

test('AI replies are parsed from JSON, code fences or plain lists', () => {
    assert.deepEqual(parseQuickWordResponse('```json\n["沈砚", "青石镇", "沈砚", "a"]\n```'), ['沈砚', '青石镇']);
    assert.deepEqual(parseQuickWordResponse('<think>先想想</think>[{"word":"陆知微"},{"name":"知微"}]'), ['陆知微', '知微']);
    assert.deepEqual(parseQuickWordResponse('1. 沈砚\n2. 青石镇、破玄一气指'), ['沈砚', '青石镇', '破玄一气指']);
});

test('extraction prompt follows the material language and lists existing words', () => {
    const zh = buildQuickWordExtractionPrompts({ chaptersText: '沈砚走进青石镇的大门。', existingWords: ['沈砚'] });
    assert.match(zh.systemPrompt, /JSON 字符串数组/);
    assert.match(zh.userPrompt, /【正文节选】/);
    assert.match(zh.userPrompt, /沈砚/);
    const en = buildQuickWordExtractionPrompts({ chaptersText: 'Aldric rode to Greywater Keep.' });
    assert.match(en.systemPrompt, /JSON array/);
    assert.doesNotMatch(en.userPrompt, /Already in the list/);
});

test('settings source text splits outline from other settings and skips rules', () => {
    const { settingsText, outlineText } = buildSettingsSourceTexts([
        { type: 'item', category: 'character', name: '沈砚', content: { personality: '坚韧', skills: '破玄一气指' } },
        { type: 'item', category: 'plot', name: '第一卷', content: { description: '沈砚离开青石镇' } },
        { type: 'item', category: 'rules', name: '文风', content: { description: '不要写成爽文' } },
    ]);
    assert.equal(settingsText, '沈砚：坚韧；破玄一气指');
    assert.equal(outlineText, '第一卷：沈砚离开青石镇');
});

test('quick words stay on this device', () => {
    assert.equal(isSyncableKey('author-quick-words-work-1'), false);
    assert.equal(isSyncableKey('author-quick-words-enabled'), false);
});
