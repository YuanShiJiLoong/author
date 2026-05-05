'use client';

import { Mark, mergeAttributes } from '@tiptap/core';

function createRemarkId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `remark-${crypto.randomUUID()}`;
    }
    return `remark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * RemarkMark — persistent inline remarks.
 * The body text stays untouched; remark content is stored in data attributes
 * so export can either strip or expand it.
 */
const RemarkMark = Mark.create({
    name: 'remark',

    inclusive: false,

    addOptions() {
        return {
            HTMLAttributes: {
                class: 'remark-mark',
            },
        };
    },

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-remark-id'),
            },
            text: {
                default: '',
                parseHTML: element => element.getAttribute('data-remark-text') || '',
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-remark-id]' }];
    },

    renderHTML({ HTMLAttributes }) {
        const { id, text, class: className, ...rest } = HTMLAttributes;
        return [
            'span',
            mergeAttributes(
                this.options.HTMLAttributes,
                rest,
                {
                    class: [this.options.HTMLAttributes.class, className].filter(Boolean).join(' '),
                    'data-remark-id': id || createRemarkId(),
                    'data-remark-text': text || '',
                    title: text ? `备注：${text}` : '备注',
                },
            ),
            0,
        ];
    },

    addCommands() {
        return {
            setRemark: attrs => ({ commands }) => {
                return commands.setMark(this.name, {
                    id: attrs?.id || createRemarkId(),
                    text: attrs?.text || '',
                });
            },
            unsetRemark: () => ({ commands }) => {
                return commands.unsetMark(this.name);
            },
        };
    },
});

export function promptForRemark(editor) {
    if (!editor || typeof window === 'undefined') return false;

    const { from, to, empty } = editor.state.selection;
    const isActive = editor.isActive('remark');

    if (empty && !isActive) {
        window.alert('请先选中要添加备注的文字。');
        return false;
    }

    const attrs = editor.getAttributes('remark') || {};
    const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ').trim();
    const label = isActive ? '编辑备注（留空可删除备注）' : `给选中文字添加备注${selectedText ? `：${selectedText.slice(0, 20)}` : ''}`;
    const nextText = window.prompt(label, attrs.text || '');

    if (nextText === null) return false;

    const chain = editor.chain().focus();
    if (isActive) chain.extendMarkRange('remark');

    if (!nextText.trim()) {
        chain.unsetRemark().run();
        return true;
    }

    chain
        .setRemark({
            id: attrs.id || createRemarkId(),
            text: nextText.trim(),
        })
        .run();
    return true;
}

export default RemarkMark;
