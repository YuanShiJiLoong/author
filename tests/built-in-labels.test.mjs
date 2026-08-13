import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getBuiltInFolderLabel,
    getBuiltInWorkName,
    isBuiltInFolderLabel,
} from '../app/lib/built-in-labels.js';

const pick = language => (zh, en, ru) => ({ zh, en, ru })[language];

test('root category labels translate from any stored language', () => {
    assert.equal(getBuiltInFolderLabel('Characters', pick('zh')), '人物设定');
    assert.equal(getBuiltInFolderLabel('人物设定', pick('en')), 'Characters');
    assert.equal(getBuiltInFolderLabel('Персонажи', pick('en')), 'Characters');
    assert.equal(getBuiltInFolderLabel('Items', pick('ru')), 'Предметы / реквизит');
});

test('pre-created subfolders translate in both directions', () => {
    assert.equal(getBuiltInFolderLabel('Main Characters', pick('ru')), 'Главные персонажи');
    assert.equal(getBuiltInFolderLabel('История / Эпохи', pick('zh')), '历史/纪元');
});

test('custom names remain unchanged', () => {
    assert.equal(getBuiltInFolderLabel('My secret society', pick('zh')), 'My secret society');
    assert.equal(isBuiltInFolderLabel('My secret society'), false);
    assert.equal(isBuiltInFolderLabel('Worldbuilding'), true);
});

test('default work names also translate from old localized storage', () => {
    assert.equal(getBuiltInWorkName('Default Work', pick('ru')), 'Работа по умолчанию');
    assert.equal(getBuiltInWorkName('Новое произведение', pick('zh')), '新作品');
});
