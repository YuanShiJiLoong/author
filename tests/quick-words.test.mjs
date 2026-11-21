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
        { id: 'a', type: 'item', category: 'character', name: '林动（动哥）' },
        { id: 'b', type: 'item', category: 'character', name: '萧炎/炎帝' },
        { id: 'c', type: 'item', category: 'location', name: '青阳镇' },
        { id: 'd', type: 'item', category: 'plot', name: '第一卷主线' },
        { id: 'e', type: 'item', category: 'rules', name: '文风规范' },
        { id: 'g', type: 'item', category: 'object', name: '石' },
        { id: 'h', type: 'item', category: 'location', name: '青阳镇' },
    ];
    assert.deepEqual(collectSettingsQuickWords(nodes).map(word => word.text), ['林动', '动哥', '萧炎', '炎帝', '青阳镇']);
});

test('Chinese suggestions use the longest matching tail and skip finished words', () => {
    const list = words('林动', '林琅天', '青阳镇', '青云门');
    assert.deepEqual(findQuickWordSuggestions('他抬头看见林', list), { query: '林', matches: ['林动', '林琅天'] });
    assert.deepEqual(findQuickWordSuggestions('来到了青阳', list), { query: '青阳', matches: ['青阳镇'] });
    assert.equal(findQuickWordSuggestions('他就是林动', list), null);
    assert.equal(findQuickWordSuggestions('天色已晚', list), null);
    assert.equal(findQuickWordSuggestions('', list), null);
});

test('Latin suggestions need two letters and ignore case', () => {
    const list = words('Aragorn', 'Arwen', 'Gandalf');
    assert.equal(findQuickWordSuggestions('Then A', list), null);
    assert.deepEqual(findQuickWordSuggestions('Then ar', list), { query: 'ar', matches: ['Arwen', 'Aragorn'] });
    assert.equal(findQuickWordSuggestions('林动说Ga', list).query, 'Ga');
});

test('words the author used before are offered first', () => {
    const list = words('林动', '林琅天');
    const usage = new Map([['林琅天', 2]]);
    assert.deepEqual(findQuickWordSuggestions('林', list, { usage }).matches, ['林琅天', '林动']);
});

test('hidden settings names are left out and own words come first', () => {
    const store = { words: [{ text: '大荒囚天指', source: 'ai' }, '林动'], hidden: ['青阳镇'] };
    const list = buildQuickWordList(words('林动', '青阳镇', '萧炎'), store);
    assert.deepEqual(list.map(word => word.text), ['大荒囚天指', '林动', '萧炎']);
});

test('stored quick words are cleaned and de-duplicated', () => {
    const store = normalizeQuickWordStore({
        words: [' 「林动」 ', { text: '林动', source: 'ai' }, 'x', { text: 'Greywater Keep', source: 'ai' }, 42],
        hidden: ['青阳镇', '青阳镇', ''],
    });
    assert.deepEqual(store, {
        words: [{ text: '林动', source: 'manual' }, { text: 'Greywater Keep', source: 'ai' }],
        hidden: ['青阳镇'],
    });
    assert.deepEqual(normalizeQuickWordStore(null), { words: [], hidden: [] });
});

test('AI replies are parsed from JSON, code fences or plain lists', () => {
    assert.deepEqual(parseQuickWordResponse('```json\n["林动", "青阳镇", "林动", "a"]\n```'), ['林动', '青阳镇']);
    assert.deepEqual(parseQuickWordResponse('<think>先想想</think>[{"word":"萧炎"},{"name":"炎帝"}]'), ['萧炎', '炎帝']);
    assert.deepEqual(parseQuickWordResponse('1. 林动\n2. 青阳镇、大荒囚天指'), ['林动', '青阳镇', '大荒囚天指']);
});

test('extraction prompt follows the material language and lists existing words', () => {
    const zh = buildQuickWordExtractionPrompts({ chaptersText: '林动走进青阳镇的大门。', existingWords: ['林动'] });
    assert.match(zh.systemPrompt, /JSON 字符串数组/);
    assert.match(zh.userPrompt, /【正文节选】/);
    assert.match(zh.userPrompt, /林动/);
    const en = buildQuickWordExtractionPrompts({ chaptersText: 'Aldric rode to Greywater Keep.' });
    assert.match(en.systemPrompt, /JSON array/);
    assert.doesNotMatch(en.userPrompt, /Already in the list/);
});

test('settings source text splits outline from other settings and skips rules', () => {
    const { settingsText, outlineText } = buildSettingsSourceTexts([
        { type: 'item', category: 'character', name: '林动', content: { personality: '坚韧', skills: '大荒囚天指' } },
        { type: 'item', category: 'plot', name: '第一卷', content: { description: '林动离开青阳镇' } },
        { type: 'item', category: 'rules', name: '文风', content: { description: '不要写成爽文' } },
    ]);
    assert.equal(settingsText, '林动：坚韧；大荒囚天指');
    assert.equal(outlineText, '第一卷：林动离开青阳镇');
});

test('quick words stay on this device', () => {
    assert.equal(isSyncableKey('author-quick-words-work-1'), false);
    assert.equal(isSyncableKey('author-quick-words-enabled'), false);
});
