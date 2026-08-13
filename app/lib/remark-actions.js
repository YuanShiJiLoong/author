export function createRemarkId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `remark-${crypto.randomUUID()}`;
    }
    return `remark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getRemarkEditState(editor) {
    if (!editor) return null;

    const { from, to, empty } = editor.state.selection;
    const isActive = editor.isActive('remark');
    if (empty && !isActive) {
        return { status: 'selection-required' };
    }

    const attrs = editor.getAttributes('remark') || {};
    return {
        status: 'ready',
        isActive,
        id: attrs.id || null,
        initialText: attrs.text || '',
        selectedText: empty ? '' : editor.state.doc.textBetween(from, to, ' ').trim(),
    };
}

export function applyRemarkText(editor, draft, value) {
    if (!editor || draft?.status !== 'ready') return false;

    const chain = editor.chain().focus();
    if (draft.isActive) chain.extendMarkRange('remark');

    const text = String(value || '').trim();
    if (!text) {
        chain.unsetRemark().run();
        return true;
    }

    chain.setRemark({
        id: draft.id || createRemarkId(),
        text,
    }).run();
    return true;
}
