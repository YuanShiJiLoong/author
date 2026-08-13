import test from 'node:test';
import assert from 'node:assert/strict';

import { applyRemarkText, getRemarkEditState } from '../app/lib/remark-actions.js';
import { getRemarkNotePlacement } from '../app/lib/remark-layout.js';

function createEditor({ empty = false, active = false, attrs = {}, selectedText = 'selected text' } = {}) {
    const calls = [];
    const chain = {};
    for (const method of ['focus', 'extendMarkRange', 'unsetRemark', 'setRemark', 'run']) {
        chain[method] = (...args) => {
            calls.push([method, ...args]);
            return chain;
        };
    }

    return {
        calls,
        state: {
            selection: { from: 2, to: empty ? 2 : 8, empty },
            doc: { textBetween: () => selectedText },
        },
        isActive: () => active,
        getAttributes: () => attrs,
        chain: () => chain,
    };
}

test('remark dialog requires a selection for a new comment', () => {
    const editor = createEditor({ empty: true, active: false });
    assert.deepEqual(getRemarkEditState(editor), { status: 'selection-required' });
});

test('existing remark opens with its stored text', () => {
    const editor = createEditor({ empty: true, active: true, attrs: { id: 'remark-1', text: 'note' } });
    assert.deepEqual(getRemarkEditState(editor), {
        status: 'ready',
        isActive: true,
        id: 'remark-1',
        initialText: 'note',
        selectedText: '',
    });
});

test('saving a remark trims text and preserves an existing id', () => {
    const editor = createEditor({ active: true });
    const draft = { status: 'ready', isActive: true, id: 'remark-1' };
    assert.equal(applyRemarkText(editor, draft, '  revised note  '), true);
    assert.deepEqual(editor.calls, [
        ['focus'],
        ['extendMarkRange', 'remark'],
        ['setRemark', { id: 'remark-1', text: 'revised note' }],
        ['run'],
    ]);
});

test('clearing an existing remark removes the mark', () => {
    const editor = createEditor({ active: true });
    const draft = { status: 'ready', isActive: true, id: 'remark-1' };
    applyRemarkText(editor, draft, '   ');
    assert.deepEqual(editor.calls, [
        ['focus'],
        ['extendMarkRange', 'remark'],
        ['unsetRemark'],
        ['run'],
    ]);
});

test('wide layouts keep notes in the right gutter', () => {
    const placement = getRemarkNotePlacement({
        anchorX: 600,
        pageWidth: 700,
        workspaceLeft: 250,
        visibleLeft: 0,
        visibleRight: 1200,
    });
    assert.equal(placement.noteLeft, 722);
    assert.equal(placement.compact, false);
    assert.equal(placement.lineAnchor, 'left');
});

test('narrow or AI-covered layouts pull notes inside the visible editor area', () => {
    const placement = getRemarkNotePlacement({
        anchorX: 650,
        pageWidth: 700,
        workspaceLeft: 120,
        visibleLeft: 0,
        visibleRight: 760,
    });
    assert.ok(120 + placement.noteLeft + placement.noteWidth <= 760 - 8);
    assert.equal(placement.compact, true);
    assert.equal(placement.lineAnchor, 'right');
});
