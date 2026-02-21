'use client';

import { Mark } from '@tiptap/core';

/**
 * GhostMark — Tiptap Mark 扩展
 * AI 生成的文本标记为 ghost-text，以半透明样式显示。
 * 用户接受时去除 mark，拒绝时删除文本。
 */
const GhostMark = Mark.create({
    name: 'ghostText',

    // 不会被持久化到 HTML（保存时自动剥离）
    addOptions() {
        return {
            HTMLAttributes: {
                class: 'ghost-text',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span.ghost-text',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', { ...this.options.HTMLAttributes, ...HTMLAttributes }, 0];
    },

    addCommands() {
        return {
            setGhostText: () => ({ commands }) => {
                return commands.setMark(this.name);
            },
            unsetGhostText: () => ({ commands }) => {
                return commands.unsetMark(this.name);
            },
            // 删除文档中所有 ghost 标记（保留文本，去掉半透明）
            acceptAllGhost: () => ({ tr, dispatch }) => {
                if (dispatch) {
                    tr.doc.descendants((node, pos) => {
                        if (node.isText) {
                            const ghostMark = node.marks.find(m => m.type.name === this.name);
                            if (ghostMark) {
                                tr.removeMark(pos, pos + node.nodeSize, ghostMark.type);
                            }
                        }
                    });
                }
                return true;
            },
            // 删除带 ghost 标记的所有文本节点，并清理残留的空段落
            // ghostStart: 可选，ghost 文本插入起始位置，仅清理该位置之后的空段落
            removeAllGhost: (ghostStart) => ({ tr, dispatch }) => {
                if (dispatch) {
                    // 第一步：收集所有 ghost 文本范围
                    const ranges = [];
                    tr.doc.descendants((node, pos) => {
                        if (node.isText) {
                            const ghostMark = node.marks.find(m => m.type.name === this.name);
                            if (ghostMark) {
                                ranges.push({ from: pos, to: pos + node.nodeSize });
                            }
                        }
                    });
                    // 记录 ghost 区域的最小起始位置（用于限定空段落清理范围）
                    const effectiveStart = ghostStart != null
                        ? ghostStart
                        : (ranges.length > 0 ? ranges[0].from : null);
                    // 从后向前删除 ghost 文本
                    for (let i = ranges.length - 1; i >= 0; i--) {
                        tr.delete(ranges[i].from, ranges[i].to);
                    }
                    // 第二步：清理 ghost 区域内因删除文本而产生的空段落
                    if (effectiveStart != null) {
                        const emptyParas = [];
                        tr.doc.descendants((node, pos) => {
                            if (node.type.name === 'paragraph' && node.content.size === 0 && pos >= effectiveStart) {
                                emptyParas.push({ from: pos, to: pos + node.nodeSize });
                            }
                        });
                        for (let i = emptyParas.length - 1; i >= 0; i--) {
                            if (tr.doc.content.childCount > 1) {
                                tr.delete(emptyParas[i].from, emptyParas[i].to);
                            }
                        }
                    }
                }
                return true;
            },
        };
    },
});

export default GhostMark;
