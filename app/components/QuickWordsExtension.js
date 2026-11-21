'use client';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { findQuickWordSuggestions } from '../lib/quick-words';

const quickWordsPluginKey = new PluginKey('quickWords');
const LOOKBEHIND_CHARS = 32;

function hasGhostText(state) {
    const ghost = state.schema.marks.ghostText;
    if (!ghost) return false;
    return state.doc.rangeHasMark(0, state.doc.content.size, ghost);
}

/**
 * 快捷词补全：打出词的开头，光标下方弹出候选；Tab 插入第一个，紧接着再按 Tab 换成下一个，Esc 收起。
 * 方向键和回车照常移动光标、换行，不被候选框占用。
 *
 * @param {{ getWords: () => Array<{text: string, source: string}>, isEnabled: () => boolean, onChange: (menu: object|null) => void, controller: object }} options
 *   controller 会被填上 accept(word) / dismiss()，给弹出框的鼠标点击用。
 */
export function createQuickWordsExtension({ getWords, isEnabled, onChange, controller }) {
    return Extension.create({
        name: 'quickWords',
        // 比列表的 Tab 缩进先处理；没有候选时不拦截
        priority: 1000,

        addProseMirrorPlugins() {
            let menu = null;
            let dismissedKey = null;
            let composeTimer = null;
            let editorView = null;
            let lastKeyDeletes = false;
            const usage = new Map();

            const publish = (next) => {
                menu = next;
                onChange(next);
            };

            const close = () => {
                if (menu) publish(null);
            };

            const compute = (view) => {
                if (!view || view.isDestroyed) return;
                if (!isEnabled() || !view.editable || view.composing || !view.hasFocus()) { close(); return; }
                const { selection } = view.state;
                if (!selection.empty) { close(); return; }
                const { $from } = selection;
                if (!$from.parent.isTextblock || $from.parent.type.spec.code) { close(); return; }

                const start = Math.max(0, $from.parentOffset - LOOKBEHIND_CHARS);
                const textBefore = $from.parent.textBetween(start, $from.parentOffset, undefined, '￼');
                const result = findQuickWordSuggestions(textBefore, getWords(), { usage });
                if (!result) { close(); return; }

                const key = `${selection.from}:${result.query}`;
                if (dismissedKey === key) { close(); return; }
                dismissedKey = null;
                // AI 幽灵文本等待确认时，Tab 归它用
                if (hasGhostText(view.state)) { close(); return; }

                publish({
                    from: selection.from - result.query.length,
                    to: selection.from,
                    query: result.query,
                    matches: result.matches,
                    index: 0,
                    cycling: false,
                    doc: view.state.doc,
                });
            };

            const insert = (view, word, from, to) => {
                const tr = view.state.tr.insertText(word, from, to);
                view.dispatch(tr.scrollIntoView());
                usage.set(word, (usage.get(word) || 0) + 1);
                return view.state.doc;
            };

            const accept = (view, word) => {
                if (!menu || !view) return false;
                const current = menu;
                const index = Math.max(0, current.matches.indexOf(word));
                const doc = insert(view, word, current.from, current.to);
                if (current.matches.length > 1) {
                    // 留着候选，紧接着再按 Tab 可以换成下一个
                    publish({
                        ...current,
                        to: current.from + word.length,
                        index,
                        cycling: true,
                        doc,
                    });
                } else {
                    close();
                }
                view.focus();
                return true;
            };

            const cycle = (view) => {
                const current = menu;
                const index = (current.index + 1) % current.matches.length;
                const word = current.matches[index];
                const doc = insert(view, word, current.from, current.to);
                publish({ ...current, to: current.from + word.length, index, doc });
                return true;
            };

            if (controller) {
                controller.accept = (word) => accept(editorView, word);
                controller.dismiss = () => {
                    if (menu && !menu.cycling) dismissedKey = `${menu.to}:${menu.query}`;
                    close();
                };
            }

            return [
                new Plugin({
                    key: quickWordsPluginKey,
                    view(view) {
                        editorView = view;
                        return {
                            update(updatedView, prevState) {
                                editorView = updatedView;
                                const { state } = updatedView;
                                // 插入或换词后保持候选，直到作者做别的操作
                                if (menu?.cycling) {
                                    if (state.doc === menu.doc && state.selection.empty && state.selection.from === menu.to) return;
                                    close();
                                }
                                if (state.doc === prevState.doc) {
                                    // 只是挪了光标（点击、方向键），不弹候选
                                    if (menu && (state.selection.from !== menu.to || !state.selection.empty)) close();
                                    return;
                                }
                                if (lastKeyDeletes) {
                                    // 删字时不弹；删过之后按 Esc 收起的记录作废，重打同一个字还会提示
                                    dismissedKey = null;
                                    close();
                                    return;
                                }
                                compute(updatedView);
                            },
                            destroy() {
                                if (composeTimer) clearTimeout(composeTimer);
                                if (editorView === view) editorView = null;
                                close();
                            },
                        };
                    },
                    props: {
                        handleKeyDown(view, event) {
                            lastKeyDeletes = event.key === 'Backspace' || event.key === 'Delete'
                                || ((event.ctrlKey || event.metaKey) && (event.key === 'x' || event.key === 'X'));
                            if (!menu || event.isComposing || view.composing) return false;
                            if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
                                event.preventDefault();
                                if (menu.cycling) return cycle(view);
                                return accept(view, menu.matches[menu.index] || menu.matches[0]);
                            }
                            if (event.key === 'Escape') {
                                if (!menu.cycling) dismissedKey = `${menu.to}:${menu.query}`;
                                close();
                                return true;
                            }
                            return false;
                        },
                        handleDOMEvents: {
                            beforeinput(view, event) {
                                // 以浏览器给的输入类型为准：删字、剪切都算删，其余（打字、输入法上屏、粘贴）不算
                                lastKeyDeletes = /^delete/.test(event.inputType || '');
                                return false;
                            },
                            compositionend(view) {
                                // 输入法上屏后再看要不要提示
                                lastKeyDeletes = false;
                                if (composeTimer) clearTimeout(composeTimer);
                                composeTimer = setTimeout(() => {
                                    composeTimer = null;
                                    if (!menu) compute(view);
                                }, 50);
                                return false;
                            },
                            blur() {
                                close();
                                return false;
                            },
                        },
                    },
                }),
            ];
        },
    });
}
