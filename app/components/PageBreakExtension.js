'use client';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const PAGE_HEIGHT = 1056;
const PAGE_GAP = 24;

const pluginKey = new PluginKey('pageBreakSpacer');

export const PageBreakExtension = Extension.create({
    name: 'pageBreakSpacer',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: pluginKey,

                state: {
                    init() {
                        return DecorationSet.empty;
                    },
                    apply(tr, decoSet) {
                        const meta = tr.getMeta(pluginKey);
                        if (meta) {
                            if (meta.clear) return DecorationSet.empty;
                            if (meta.apply) return meta.decoSet;
                        }
                        // 文档变更时，不再立刻清除装饰器，而是利用 Tiptap 的 Mapping 机制让占位符随着文本自动漂移。
                        // 这样打字时旧的断头台还在，高度不变，绝对不会导致内容突然上缩。
                        if (tr.docChanged) {
                            return decoSet.map(tr.mapping, tr.doc);
                        }
                        return decoSet;
                    },
                },

                props: {
                    decorations(state) {
                        return pluginKey.getState(state) || DecorationSet.empty;
                    },
                },

                view(editorView) {
                    let updateTimer = null;
                    let isProcessing = false;

                    const performPagination = () => {
                        if (isProcessing) return;
                        isProcessing = true;

                        const dom = editorView.dom;
                        if (!dom || !dom.isConnected) {
                            isProcessing = false;
                            return;
                        }

                        // 1. 锁定容器高度：防止清空占位符瞬间因高度收缩引发滚动条狂跳
                        // 注意：不再保存/恢复 scrollTop，避免与用户滚动操作冲突
                        const oldMinHeight = dom.style.minHeight;
                        dom.style.minHeight = `${dom.scrollHeight}px`;

                        // 2. 瞬间剥离旧排版
                        const oldState = pluginKey.getState(editorView.state);
                        let cleared = false;
                        if (oldState && oldState !== DecorationSet.empty) {
                            const trClear = editorView.state.tr;
                            trClear.setMeta(pluginKey, { clear: true });
                            trClear.setMeta('addToHistory', false);
                            editorView.dispatch(trClear);
                            cleared = true;
                        }

                        // 【魔法核心】强制浏览器在当前帧立即进行同步布局重排 (Reflow)，暴露天然文档流
                        void dom.offsetHeight;

                        // 3. 进入"绝对坐标系"精准测量
                        const doc = editorView.state.doc;
                        const domRect = dom.getBoundingClientRect();
                        const domTop = domRect.top;

                        // 自动侦测当前的真实 Padding (不再需要通过 React 传参)
                        const computedStyle = window.getComputedStyle(dom);
                        const marginY = parseFloat(computedStyle.paddingTop) || 96;

                        let accumulatedSpacers = 0;
                        let currentPage = 0;
                        const spacerData = [];

                        // 纸张可用区域计算公式
                        const getUsableBottom = (page) => page * (PAGE_HEIGHT + PAGE_GAP) + PAGE_HEIGHT - marginY;
                        const getUsableTop = (page) => page * (PAGE_HEIGHT + PAGE_GAP) + marginY;

                        // 收集顶级内容块
                        const blocks = [];
                        doc.descendants((node, pos) => {
                            if (node.isTextblock || (node.isBlock && node.isAtom)) {
                                blocks.push({ node, pos });
                                return false;
                            }
                            return true;
                        });

                        for (const { node, pos } of blocks) {
                            const domNode = editorView.nodeDOM(pos);
                            if (!domNode || domNode.nodeType !== 1) continue;

                            const rect = domNode.getBoundingClientRect();
                            if (rect.height === 0) continue;

                            const naturalTop = rect.top - domTop;
                            const naturalBottom = rect.bottom - domTop;

                            let actualTop = naturalTop + accumulatedSpacers;
                            let actualBottom = naturalBottom + accumulatedSpacers;

                            // 如果段落已经完全位于下一页的内容区域内，直接跳过前面的页码
                            // 注意：用 getUsableTop(next) 而非 getUsableBottom(current)，
                            // 避免跳过"边距区"或"间隙区"的段落（它们仍需由跨页逻辑推送）
                            while (actualTop >= getUsableTop(currentPage + 1)) {
                                currentPage++;
                            }

                            // 触发跨页逻辑！
                            while (actualBottom > getUsableBottom(currentPage)) {
                                const limitY = getUsableBottom(currentPage);
                                const nextTopY = getUsableTop(currentPage + 1);

                                // 无法拆分的原子块（如大图片、公式），整体推向下一页
                                if (node.isAtom || !node.isTextblock) {
                                    const spacerHeight = nextTopY - actualTop;
                                    if (spacerHeight > 0) {
                                        spacerData.push({ pos, height: spacerHeight, isBlock: true });
                                        accumulatedSpacers += spacerHeight;
                                        actualTop += spacerHeight;
                                        actualBottom += spacerHeight;
                                    }
                                    currentPage++;
                                } else {
                                    // 常规文字段落，开始寻找破界点
                                    const startPos = pos + 1;
                                    const endPos = pos + node.nodeSize - 1;

                                    if (startPos > endPos) {
                                        currentPage++; continue;
                                    }

                                    // 【二分查找】极速锁定越过边界的那一个字符
                                    let low = startPos;
                                    let high = endPos;
                                    let crossPos = null;

                                    while (low <= high) {
                                        let mid = Math.floor((low + high) / 2);
                                        let coords;
                                        try { coords = editorView.coordsAtPos(mid); } catch (e) { }

                                        // 容错处理：某些特殊字符可能拿不到坐标，就近偏移
                                        if (!coords) {
                                            let fallback = null;
                                            for (let step = 1; step < 5; step++) {
                                                if (mid + step <= high) { try { fallback = editorView.coordsAtPos(mid + step); if (fallback) { mid = mid + step; coords = fallback; break; } } catch (e) { } }
                                                if (mid - step >= low) { try { fallback = editorView.coordsAtPos(mid - step); if (fallback) { mid = mid - step; coords = fallback; break; } } catch (e) { } }
                                            }
                                            if (!coords) { low = mid + 1; continue; }
                                        }

                                        const charActualBottom = (coords.bottom - domTop) + accumulatedSpacers;
                                        if (charActualBottom > limitY) {
                                            crossPos = mid;
                                            high = mid - 1;
                                        } else {
                                            low = mid + 1;
                                        }
                                    }

                                    // 若没找到（通常是段落的 Margin 溢出），忽略
                                    if (crossPos === null) {
                                        break;
                                    }

                                    // 【精确回溯】找到了越界字，往回倒退，找出这行字的行首
                                    let lineStartPos = crossPos;
                                    let currentLineTop = null;
                                    try {
                                        let crossCoords = editorView.coordsAtPos(crossPos);
                                        if (crossCoords) {
                                            currentLineTop = crossCoords.top - domTop;
                                            for (let p = crossPos - 1; p >= startPos; p--) {
                                                let c = editorView.coordsAtPos(p);
                                                if (!c) continue;
                                                let cTop = c.top - domTop;
                                                // Y轴剧烈跳跃说明退到了上一行
                                                if (cTop < currentLineTop - 4) break;
                                                lineStartPos = p;
                                            }
                                        }
                                    } catch (e) { }

                                    let lineCoords;
                                    try { lineCoords = editorView.coordsAtPos(lineStartPos); } catch (e) { }
                                    let lineActualTop = lineCoords ? (lineCoords.top - domTop) + accumulatedSpacers : actualTop;

                                    let spacerHeight = nextTopY - lineActualTop;

                                    if (spacerHeight > 0) {
                                        // 判断：段落整体已经超出当前页可用区域时，整块推走
                                        // 否则使用行内断裂（即使越界行是第一行，前面仍有段间空白可利用）
                                        if (actualTop >= limitY) {
                                            // 段落完全在边界之后，整体推到下一页
                                            spacerData.push({ pos, height: nextTopY - actualTop, isBlock: true });
                                            accumulatedSpacers += (nextTopY - actualTop);
                                            actualBottom += (nextTopY - actualTop);
                                            actualTop = nextTopY;
                                        } else {
                                            // 段落跨越边界，在越界行首处插入行内断裂
                                            spacerData.push({ pos: lineStartPos, height: spacerHeight, isBlock: false });
                                            accumulatedSpacers += spacerHeight;
                                            actualBottom += spacerHeight;
                                            actualTop += spacerHeight;
                                        }
                                    }
                                    currentPage++;
                                }
                            }
                        }

                        // 4. 重组排版，生成全新的物理占位 Decoration Widget
                        const decorations = spacerData.map(data => {
                            if (data.isBlock) {
                                const spacer = document.createElement('div');
                                spacer.className = 'page-break-spacer-block';
                                spacer.style.height = `${data.height}px`;
                                spacer.style.width = '100%';
                                spacer.style.clear = 'both';
                                spacer.setAttribute('data-pb-spacer', '1');
                                return Decoration.widget(data.pos, spacer, { key: `pb-${data.pos}`, side: -1, ignoreSelection: true });
                            } else {
                                // 隐形断头台：利用 inline-block 占满 100% 宽度，直接把后半行文字生生挤到下一页
                                const spacer = document.createElement('span');
                                spacer.className = 'page-break-spacer-inline';
                                spacer.style.display = 'block';
                                spacer.style.width = '100%';
                                spacer.style.height = `${data.height}px`;
                                spacer.style.lineHeight = '0';
                                spacer.style.fontSize = '0';
                                spacer.style.verticalAlign = 'top';
                                spacer.style.userSelect = 'none'; // 忽略光标焦点
                                spacer.style.pointerEvents = 'none';
                                spacer.setAttribute('data-pb-spacer', '1');
                                return Decoration.widget(data.pos, spacer, { key: `pb-${data.pos}`, side: -1, ignoreSelection: true });
                            }
                        });

                        const decoSet = decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;

                        // 5. 无缝推送回视图
                        if (decorations.length > 0 || cleared) {
                            const trApply = editorView.state.tr;
                            trApply.setMeta(pluginKey, { apply: true, decoSet });
                            trApply.setMeta('addToHistory', false);
                            editorView.dispatch(trApply);
                        }

                        // 解除 DOM 高度锁定
                        dom.style.minHeight = oldMinHeight;
                        isProcessing = false;
                    };

                    let initTimer = null;
                    let debounceTimer = null;

                    // 立即调度（初始化 & 窗口 resize）
                    const scheduleImmediate = () => {
                        if (updateTimer) cancelAnimationFrame(updateTimer);
                        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
                        updateTimer = requestAnimationFrame(performPagination);
                    };

                    // 延迟调度（文档变更触发，加长防抖避免打字中途重排）
                    // 只要在连续打字，就绝不重排页面；停手 500ms 后再安静地后台重新计算分页
                    const scheduleDebouncedForDoc = () => {
                        if (debounceTimer) clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                            debounceTimer = null;
                            if (updateTimer) cancelAnimationFrame(updateTimer);
                            updateTimer = requestAnimationFrame(performPagination);
                        }, 500);
                    };

                    // 初始化延迟——等 Editor DOM 完全挂载后首次计算
                    initTimer = setTimeout(scheduleImmediate, 200);
                    window.addEventListener('resize', scheduleImmediate);

                    return {
                        update(view, prevState) {
                            // 文档内容变化引发重算（防抖）
                            if (prevState.doc !== view.state.doc) scheduleDebouncedForDoc();
                        },
                        destroy() {
                            if (updateTimer) cancelAnimationFrame(updateTimer);
                            if (debounceTimer) clearTimeout(debounceTimer);
                            if (initTimer) clearTimeout(initTimer);
                            window.removeEventListener('resize', scheduleImmediate);
                        },
                    };
                },
            }),
        ];
    },
});
