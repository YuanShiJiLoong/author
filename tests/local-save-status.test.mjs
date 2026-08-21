import test from 'node:test';
import assert from 'node:assert/strict';

import {
    beginLocalSave,
    completeLocalSave,
    failLocalSave,
    getLocalSaveSnapshot,
    hasBlockingLocalSave,
    resetLocalSaveStatusForTests,
    trackLocalSave,
    waitForLocalSaves,
} from '../app/lib/local-save-status.js';

test.beforeEach(() => resetLocalSaveStatusForTests());

test('tracks concurrent local writes until every write is complete', () => {
    const first = beginLocalSave('chapter');
    const second = beginLocalSave('settings');

    assert.equal(getLocalSaveSnapshot().status, 'saving');
    assert.equal(getLocalSaveSnapshot().pending, 2);
    assert.equal(hasBlockingLocalSave(), true);

    completeLocalSave(first);
    assert.equal(getLocalSaveSnapshot().pending, 1);
    completeLocalSave(second);

    assert.equal(getLocalSaveSnapshot().status, 'saved');
    assert.equal(getLocalSaveSnapshot().pending, 0);
    assert.equal(hasBlockingLocalSave(), false);
    assert.equal(typeof getLocalSaveSnapshot().lastSavedAt, 'number');
});

test('keeps a failed local write blocking until a retry succeeds', async () => {
    const failed = beginLocalSave('chapter');
    failLocalSave(failed, new Error('IndexedDB unavailable'));

    assert.equal(getLocalSaveSnapshot().status, 'error');
    assert.equal(hasBlockingLocalSave(), true);
    await assert.rejects(waitForLocalSaves(), /IndexedDB unavailable/);

    await trackLocalSave(async () => 'saved', 'chapter-retry');
    assert.equal(getLocalSaveSnapshot().status, 'saved');
    assert.equal(hasBlockingLocalSave(), false);
});

test('waits for an in-flight local write', async () => {
    const operation = beginLocalSave('chat');
    const waiting = waitForLocalSaves({ timeoutMs: 1000 });
    queueMicrotask(() => completeLocalSave(operation));

    const result = await waiting;
    assert.equal(result.status, 'saved');
    assert.equal(result.pending, 0);
});
