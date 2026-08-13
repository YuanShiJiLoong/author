'use client';

import { Mark, mergeAttributes } from '@tiptap/core';
import { createRemarkId } from '../lib/remark-actions';

function remarkText(zh, en, ru = en) {
    const lang = typeof window !== 'undefined' ? localStorage.getItem('author-lang') : 'zh';
    if (lang === 'en') return en;
    if (lang === 'ru') return ru;
    return zh;
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
                    title: text ? `${remarkText('备注', 'Note', 'Заметка')}：${text}` : remarkText('备注', 'Note', 'Заметка'),
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

export default RemarkMark;
