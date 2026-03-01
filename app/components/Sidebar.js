'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { createChapter, deleteChapter, updateChapter, saveChapters, getChapters } from '../lib/storage';
import { exportProject, importProject, importWork, exportWorkAsTxt, exportWorkAsMarkdown, exportWorkAsDocx, exportWorkAsEpub, exportWorkAsPdf } from '../lib/project-io';
import { WRITING_MODES, getAllWorks, getSettingsNodes, createWorkNode, saveSettingsNodes, setActiveWorkId as setActiveWorkIdSetting } from '../lib/settings';
import { detectConflicts, mergeChapters } from '../lib/chapter-number';

export default function Sidebar({ onOpenHelp, onToggle, editorRef }) {
    const {
        chapters, addChapter, setChapters, updateChapter: updateChapterStore,
        activeChapterId, setActiveChapterId,
        activeWorkId, setActiveWorkId: setActiveWorkIdStore,
        sidebarOpen, setSidebarOpen,
        theme, setTheme,
        writingMode,
        setShowSettings,
        setShowSnapshots,
        showToast
    } = useAppStore();

    const [renameId, setRenameId] = useState(null);
    const [renameTitle, setRenameTitle] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showCurrentExportMenu, setShowCurrentExportMenu] = useState(false);
    const [importModal, setImportModal] = useState(null);
    const [conflictModal, setConflictModal] = useState(null);
    const [showGitPopup, setShowGitPopup] = useState(false);
    const [outlineCollapsed, setOutlineCollapsed] = useState(false); // 手动折叠大纲
    const [headings, setHeadings] = useState([]); // 文档大纲标题列表
    const [activeHeadingIndex, setActiveHeadingIndex] = useState(-1); // 当前高亮的大纲项
    const isClickScrollingRef = useRef(false); // 防 scrollspy 死循环互斥锁
    const { t } = useI18n();

    // 切换主题
    const toggleTheme = useCallback(() => {
        const next = theme === 'light' ? 'dark' : 'light';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('author-theme', next);
    }, [theme, setTheme]);

    // 中文数字 ↔ 阿拉伯数字 互转
    const cnDigits = '零一二三四五六七八九十百千万';
    const parseCnNum = (s) => {
        if (!s) return NaN;
        let result = 0, current = 0;
        for (const ch of s) {
            const d = '零一二三四五六七八九'.indexOf(ch);
            if (d >= 0) { current = d || current; }
            else if (ch === '十') { result += (current || 1) * 10; current = 0; }
            else if (ch === '百') { result += (current || 1) * 100; current = 0; }
            else if (ch === '千') { result += (current || 1) * 1000; current = 0; }
            else if (ch === '万') { result += (current || 1) * 10000; current = 0; }
        }
        return result + current;
    };
    const toCnNum = (n) => {
        if (n <= 0) return '零';
        if (n <= 10) return '零一二三四五六七八九十'[n];
        const units = ['', '十', '百', '千', '万'];
        const digits = '零一二三四五六七八九';
        let result = '';
        let str = String(n);
        let len = str.length;
        let lastWasZero = false;
        for (let i = 0; i < len; i++) {
            const d = parseInt(str[i]);
            const unit = units[len - 1 - i];
            if (d === 0) { lastWasZero = true; }
            else {
                if (lastWasZero) result += '零';
                if (d === 1 && unit === '十' && result === '') result += unit;
                else result += digits[d] + unit;
                lastWasZero = false;
            }
        }
        return result;
    };

    // 尝试从标题提取数字并生成下一章标题，返回 null 表示无法匹配
    const tryNextTitle = (title) => {
        // 1. "第N章" 阿拉伯数字 — 只保留章节编号，去掉后续标题名
        const m1 = title.match(/第(\d+)章/);
        if (m1) return `第${parseInt(m1[1], 10) + 1}章`;
        // 2. "第X章" 中文数字（如 第三十三章）— 只保留章节编号
        const m2 = title.match(/第([零一二三四五六七八九十百千万]+)章/);
        if (m2) { const n = parseCnNum(m2[1]); if (!isNaN(n)) return `第${toCnNum(n + 1)}章`; }
        // 3. 纯阿拉伯数字（如 "33"）
        if (/^\d+$/.test(title.trim())) return String(parseInt(title.trim(), 10) + 1);
        // 4. 纯中文数字（如 "三十三"）
        if (/^[零一二三四五六七八九十百千万]+$/.test(title.trim())) { const n = parseCnNum(title.trim()); if (!isNaN(n)) return toCnNum(n + 1); }
        // 5. 包含末尾数字（如 "Chapter 33"）— 只递增数字，保留前缀
        const m5 = title.match(/^(.+?)(\d+)\s*$/);
        if (m5) return m5[1] + String(parseInt(m5[2], 10) + 1);
        return null;
    };

    // 从章节列表中向前搜索最近的带数字章节，推算下一章名
    const getNextChapterTitle = useCallback(() => {
        if (chapters.length === 0) return t('sidebar.defaultChapterTitle').replace('{num}', 1);
        // 从最后一章向前找，跳过"更新说明"等非标准章节
        for (let i = chapters.length - 1; i >= 0; i--) {
            const next = tryNextTitle(chapters[i].title);
            if (next) return next;
        }
        return t('sidebar.defaultChapterTitle').replace('{num}', chapters.length + 1);
    }, [chapters, t]);

    // 创建新章节 — 一键创建并进入重命名模式
    const handleCreateChapter = useCallback(async () => {
        const title = getNextChapterTitle();
        const ch = await createChapter(title, activeWorkId);
        addChapter(ch);
        setActiveChapterId(ch.id);
        // 立即进入重命名模式，方便用户修改标题
        setRenameId(ch.id);
        setRenameTitle(title);
        showToast(t('sidebar.chapterCreated').replace('{title}', title), 'success');
    }, [getNextChapterTitle, showToast, addChapter, setActiveChapterId, t, activeWorkId]);

    // 删除章节
    const handleDeleteChapter = useCallback(async (id) => {
        if (!Array.isArray(chapters) || chapters.length <= 1) {
            showToast(t('sidebar.alertRetainOne'), 'error');
            return;
        }
        const ch = chapters.find(c => c.id === id);
        const remaining = await deleteChapter(id, activeWorkId);
        setChapters(remaining);
        if (activeChapterId === id) {
            setActiveChapterId(remaining[0]?.id || null);
        }
        showToast(t('sidebar.chapterDeleted').replace('{title}', ch?.title), 'info');
        setContextMenu(null);
    }, [chapters, activeChapterId, showToast, setChapters, setActiveChapterId, t, activeWorkId]);

    // 重命名章节
    const handleRename = useCallback((id) => {
        const title = renameTitle.trim();
        if (!title) return;
        updateChapter(id, { title }, activeWorkId);
        updateChapterStore(id, { title });
        setRenameId(null);
        setRenameTitle('');
    }, [renameTitle, updateChapterStore, activeWorkId]);

    // ===== 文档大纲：从编辑器提取标题 + Scrollspy =====
    useEffect(() => {
        let debounceTimer = null;
        let observer = null;
        let pollTimer = null;
        let cleanedUp = false;

        // 提取标题的函数
        const extractHeadings = (editor) => {
            const json = editor.getJSON();
            const h = [];
            (json.content || []).forEach((node, idx) => {
                if (node.type === 'heading' && node.attrs?.level) {
                    const text = (node.content || []).map(c => c.text || '').join('');
                    if (text.trim()) h.push({ level: node.attrs.level, text: text.trim(), index: idx });
                }
            });
            setHeadings(h);
        };

        // 设置 IntersectionObserver
        const setupObserver = (editor) => {
            const container = document.querySelector('.editor-container');
            const headingEls = editor.view?.dom?.querySelectorAll('h1, h2, h3');
            if (!container || !headingEls?.length) return;

            observer = new IntersectionObserver(
                (entries) => {
                    if (isClickScrollingRef.current) return;
                    let topEntry = null;
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            if (!topEntry || entry.boundingClientRect.top < topEntry.boundingClientRect.top) {
                                topEntry = entry;
                            }
                        }
                    });
                    if (topEntry) {
                        const allH = Array.from(editor.view.dom.querySelectorAll('h1, h2, h3'));
                        const idx = allH.indexOf(topEntry.target);
                        if (idx >= 0) setActiveHeadingIndex(idx);
                    }
                },
                { root: container, rootMargin: '-10% 0px -80% 0px', threshold: 0 }
            );

            headingEls.forEach(el => observer.observe(el));
        };

        // 当编辑器就绪时，设置监听
        const initWithEditor = (editor) => {
            // 初始提取
            extractHeadings(editor);

            // 监听内容变化（防抖 300ms）
            const onUpdate = () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => extractHeadings(editor), 300);
            };
            editor.on('update', onUpdate);

            // 延迟设置 Observer
            setTimeout(() => {
                if (!cleanedUp) setupObserver(editor);
            }, 500);

            // 返回清理函数
            return () => {
                editor.off('update', onUpdate);
                clearTimeout(debounceTimer);
                observer?.disconnect();
            };
        };

        // 轮询等待编辑器就绪
        let editorCleanup = null;
        const tryInit = () => {
            const editor = editorRef?.current?.getEditor?.();
            if (editor && !cleanedUp) {
                clearInterval(pollTimer);
                editorCleanup = initWithEditor(editor);
            }
        };

        // 立即尝试一次
        tryInit();
        // 如果还没就绪，每 200ms 重试
        if (!editorRef?.current?.getEditor?.()) {
            pollTimer = setInterval(tryInit, 200);
        }

        return () => {
            cleanedUp = true;
            clearInterval(pollTimer);
            editorCleanup?.();
            setHeadings([]);
        };
    }, [editorRef, activeChapterId]);

    // 点击大纲项：滚动到对应位置
    const handleOutlineClick = useCallback((headingIdx) => {
        const editor = editorRef?.current?.getEditor?.();
        if (!editor) return;
        const headingEls = editor.view?.dom?.querySelectorAll('h1, h2, h3');
        const target = headingEls?.[headingIdx];
        if (!target) return;

        isClickScrollingRef.current = true;
        setActiveHeadingIndex(headingIdx);
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 滚动结束后解锁
        const unlock = () => { isClickScrollingRef.current = false; };
        const container = document.querySelector('.editor-container');
        if (container) {
            container.addEventListener('scrollend', unlock, { once: true });
            // 兜底：500ms 后强制解锁
            setTimeout(() => {
                container.removeEventListener('scrollend', unlock);
                isClickScrollingRef.current = false;
            }, 600);
        } else {
            setTimeout(unlock, 600);
        }
    }, [editorRef]);

    // 统计标题数（作为 tab 角标）
    const headingCount = headings.length;

    // 导出

    const totalWords = Array.isArray(chapters) ? chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0) : 0;

    return (
        <>
            <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
                {/* ===== 顶部关闭按钮 ===== */}
                <div className="sidebar-top-row">
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onToggle?.()} title={t('sidebar.collapseSidebar')} style={{ fontSize: '16px' }}>
                        ←
                    </button>
                </div>

                {/* ===== 文档分页 ===== */}
                <div className="gdocs-section-header">
                    <span className="gdocs-section-title">文档分页</span>
                    <button className="gdocs-section-add" onClick={handleCreateChapter} title={t('sidebar.newChapter')}>+</button>
                </div>
                <div className="gdocs-tab-list">
                    {chapters.map(ch => {
                        const isActive = ch.id === activeChapterId;
                        const isExpanded = isActive && headings.length > 0 && !outlineCollapsed;
                        return (
                            <div key={ch.id} className="gdocs-tab-group">
                                <div
                                    className={`gdocs-tab-item ${isActive ? 'active' : ''}`}
                                    onClick={() => {
                                        if (isActive) {
                                            setOutlineCollapsed(prev => !prev);
                                        } else {
                                            setActiveChapterId(ch.id);
                                            setOutlineCollapsed(false);
                                        }
                                    }}
                                >
                                    {renameId === ch.id ? (
                                        <input
                                            className="modal-input"
                                            style={{ margin: 0, padding: '4px 8px', fontSize: '13px', flex: 1 }}
                                            value={renameTitle || ''}
                                            onChange={e => setRenameTitle(e.target.value)}
                                            onBlur={() => handleRename(ch.id)}
                                            onKeyDown={e => e.key === 'Enter' && handleRename(ch.id)}
                                            onClick={e => e.stopPropagation()}
                                            autoFocus
                                        />
                                    ) : (
                                        <>
                                            <span className="gdocs-tab-arrow" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span className="gdocs-tab-title">{ch.title}</span>
                                                {(ch.wordCount || 0) > 0 && (
                                                    <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                                                        {ch.wordCount.toLocaleString()}字 · ~{Math.ceil((ch.wordCount || 0) * 1.5).toLocaleString()} tokens
                                                    </span>
                                                )}
                                            </span>
                                            <div className="gdocs-tab-actions">
                                                <button
                                                    className="gdocs-tab-action-btn"
                                                    title={t('sidebar.contextRename')}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setRenameId(ch.id);
                                                        setRenameTitle(ch.title);
                                                    }}
                                                ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg></button>
                                                <button
                                                    className="gdocs-tab-action-btn danger"
                                                    title={t('sidebar.contextDelete')}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteChapter(ch.id);
                                                    }}
                                                ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>
                                            </div>
                                        </>
                                    )}
                                </div>
                                {/* 展开的章节大纲 */}
                                {isExpanded && (
                                    <div className="gdocs-outline-inline">
                                        {headings.map((h, idx) => (
                                            <div
                                                key={idx}
                                                className={`gdocs-outline-item ${idx === activeHeadingIndex ? 'active' : ''}`}
                                                style={{ paddingLeft: `${28 + (h.level - 1) * 14}px` }}
                                                onClick={() => handleOutlineClick(idx)}
                                                title={h.text}
                                            >
                                                {h.text}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ===== 底部功能区（保留原有功能） ===== */}
                <div className="sidebar-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                    {(() => {
                        const modeConfig = WRITING_MODES[writingMode];
                        return modeConfig ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: `${modeConfig.color}10`, border: `1px solid ${modeConfig.color}30`, cursor: 'pointer', transition: 'all 0.15s ease' }} onClick={() => setShowSettings(true)} title={t('sidebar.clickToSwitchMode')}>
                                <span style={{ fontSize: '14px' }}>{modeConfig.icon}</span>
                                <span style={{ fontSize: '12px', fontWeight: '600', color: modeConfig.color }}>{t('sidebar.modeLabel').replace('{mode}', modeConfig.label)}</span>
                            </div>
                        ) : null;
                    })()}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <span>{t('sidebar.totalWords')}</span>
                        <span style={{ color: 'var(--accent)', fontWeight: '600' }}>{totalWords.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <div style={{ position: 'relative', display: 'flex', flex: 1 }}>
                            <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => setShowCurrentExportMenu(!showCurrentExportMenu)}>{t('sidebar.exportCurrent')}</button>
                            {showCurrentExportMenu && (<>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowCurrentExportMenu(false)} />
                                <div style={{ position: 'absolute', left: 0, bottom: '100%', marginBottom: 6, minWidth: 150, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: 4 }}>
                                    {activeChapterId && chapters.find(c => c.id === activeChapterId) ? [
                                        { label: '📄 TXT', fn: () => exportWorkAsTxt([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                        { label: '📝 Markdown', fn: () => exportWorkAsMarkdown([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                        { label: '📘 DOCX', fn: async () => await exportWorkAsDocx([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                        { label: '📚 EPUB', fn: async () => await exportWorkAsEpub([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                        { label: '🖨️ PDF', fn: () => exportWorkAsPdf([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                    ].map(item => (
                                        <button key={item.label} className="dropdown-item" onClick={async () => { await item.fn(); setShowCurrentExportMenu(false); showToast(t('sidebar.exportedChapter'), 'success'); }}>{item.label}</button>
                                    )) : <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-muted)' }}>{t('sidebar.noActiveChapter') || '请先选择章节'}</div>}
                                </div>
                            </>)}
                        </div>
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => setShowExportModal(true)}>{t('sidebar.exportMore') || '导出更多'}</button>
                        <button id="tour-settings" className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowSettings(true)} title={t('sidebar.tooltipSettings')}>⚙️</button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={toggleTheme} title={theme === 'light' ? t('sidebar.tooltipThemeDark') : t('sidebar.tooltipThemeLight')}>{theme === 'light' ? '🌙' : '☀️'}</button>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch' }}>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowSnapshots(true)} title={t('sidebar.tooltipTimeMachine')}>🕒</button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { exportProject(); }} title={t('sidebar.btnSaveTitle') || '存档（导出项目 JSON）'}>💾</button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { document.getElementById('project-import-input')?.click(); }} title={t('sidebar.btnLoadTitle') || '读档（导入项目 JSON）'}>📂</button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { document.getElementById('work-import-input')?.click(); }} title={t('sidebar.btnImportWorkTitle')}>📥</button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => onOpenHelp?.()} title={t('page.helpAndGuide') || '帮助与教程'}>📖</button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowGitPopup(prev => !prev)} title="GitHub / Gitee / QQ群">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                        </button>
                        <input id="project-import-input" type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const result = await importProject(file); if (result.success) { alert(result.message + '\n' + t('sidebar.importSuccess')); window.location.reload(); } else { alert(result.message); } e.target.value = ''; }} />
                        <input id="work-import-input" type="file" accept=".txt,.md,.markdown,.epub,.docx,.doc,.pdf" style={{ display: 'none' }} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const result = await importWork(file); if (!result.success) { const msg = result.message === 'noChapter' ? t('sidebar.importWorkNoChapter') : t('sidebar.importWorkFailed').replace('{error}', result.message); showToast(msg, 'error'); e.target.value = ''; return; } setImportModal({ chapters: result.chapters, totalWords: result.totalWords }); } catch (err) { showToast(t('sidebar.importWorkFailed').replace('{error}', err.message), 'error'); } e.target.value = ''; }} />
                    </div>
                </div>
            </aside>

            {/* ===== Git / 社区弹窗 ===== */}
            {showGitPopup && (
                <div className="modal-overlay" onClick={() => setShowGitPopup(false)}>
                    <div className="glass-panel" onClick={e => e.stopPropagation()} style={{
                        padding: '28px', maxWidth: 360, width: '90%', borderRadius: 'var(--radius-lg)',
                        display: 'flex', flexDirection: 'column', gap: 16,
                    }}>
                        <h3 style={{ margin: 0, fontSize: 16, textAlign: 'center' }}>社区与源码</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <a href="https://github.com/YuanShiJiLoong/author" target="_blank" rel="noopener noreferrer" onClick={() => setShowGitPopup(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text-primary)', fontSize: 14, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                                <span style={{ flex: 1 }}>GitHub</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
                            </a>
                            <a href="https://gitee.com/yuanshijilong/author" target="_blank" rel="noopener noreferrer" onClick={() => setShowGitPopup(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text-primary)', fontSize: 14, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.48c0 .327.266.592.593.592h5.574c.327 0 .593-.265.593-.593v-1.482a.594.594 0 0 0-.593-.592h-3.408a.43.43 0 0 1-.43-.43v-1.455a.43.43 0 0 1 .43-.43h5.91c.329 0 .594.266.594.593v5.78a2.133 2.133 0 0 1-2.133 2.134H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.444-4.444h8.297z" /></svg>
                                <span style={{ flex: 1 }}>Gitee（国内镜像）</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
                            </a>
                            <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.003 2C6.477 2 2 6.477 2 12.003c0 2.39.84 4.584 2.236 6.31l-.924 3.468 3.592-.96A9.95 9.95 0 0 0 12.003 22C17.52 22 22 17.523 22 12.003S17.52 2 12.003 2zm4.97 13.205c-.234.657-1.378 1.257-1.902 1.313-.525.06-1.003.234-3.38-.703-2.86-1.13-4.68-4.07-4.82-4.26-.14-.19-1.15-1.53-1.15-2.92s.728-2.072.986-2.354c.258-.282.563-.352.75-.352s.375.004.54.01c.173.006.405-.066.633.483.234.563.797 1.947.867 2.088.07.14.117.305.023.492-.094.188-.14.305-.28.468-.14.164-.296.366-.422.492-.14.14-.286.292-.123.571.164.28.727 1.2 1.562 1.944 1.073.955 1.977 1.252 2.258 1.393.28.14.445.117.608-.07.164-.188.703-.82.89-1.102.188-.28.375-.234.633-.14.258.093 1.632.77 1.912.91.28.14.468.21.538.328.07.117.07.68-.164 1.336z" /></svg>
                                <span style={{ flex: 1, fontSize: 14 }}>QQ群：1087016949</span>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { navigator.clipboard?.writeText('1087016949'); showToast('群号已复制', 'success'); }}>复制群号</button>
                                <a href="https://qm.qq.com/q/wjRDkotw0E" target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm" style={{ padding: '4px 8px', fontSize: 11, textDecoration: 'none' }} onClick={() => setShowGitPopup(false)}>直达</a>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowGitPopup(false)}>关闭</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== 右键菜单 ===== */}
            {contextMenu && (
                <div className="modal-overlay" style={{ background: 'transparent' }} onClick={() => setContextMenu(null)}>
                    <div className="dropdown-menu" style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}>
                        <button className="dropdown-item" onClick={() => { setRenameId(contextMenu.id); const ch = chapters.find(c => c.id === contextMenu.id); setRenameTitle(ch?.title || ''); setContextMenu(null); }}>{t('sidebar.contextRename')}</button>
                        <button className="dropdown-item" onClick={() => { const ch = chapters.find(c => c.id === contextMenu.id); if (ch) exportWorkAsMarkdown([ch], ch.title); setContextMenu(null); }}>{t('sidebar.contextExport')}</button>
                        <button className="dropdown-item danger" onClick={() => handleDeleteChapter(contextMenu.id)}>{t('sidebar.contextDelete')}</button>
                    </div>
                </div>
            )}
            {/* ===== 导入作品弹窗 ===== */}
            {importModal && (
                <ImportWorkModal
                    chapters={importModal.chapters}
                    totalWords={importModal.totalWords}
                    onClose={() => setImportModal(null)}
                    onImport={async (targetWorkId) => {
                        try {
                            const existingChapters = await getChapters(targetWorkId);
                            if (existingChapters.length === 0) {
                                await saveChapters(importModal.chapters, targetWorkId);
                                setActiveWorkIdSetting(targetWorkId);
                                setChapters(importModal.chapters);
                                if (importModal.chapters.length > 0) setActiveChapterId(importModal.chapters[0].id);
                                setActiveWorkIdStore(targetWorkId);
                                showToast(t('sidebar.importWorkSuccess').replace('{count}', importModal.chapters.length), 'success');
                                setImportModal(null);
                                return;
                            }
                            const { conflicts, noConflictExisting, noConflictImported } = detectConflicts(existingChapters, importModal.chapters);
                            if (conflicts.length === 0) {
                                const merged = mergeChapters(noConflictExisting, noConflictImported, []);
                                await saveChapters(merged, targetWorkId);
                                setActiveWorkIdSetting(targetWorkId);
                                setChapters(merged);
                                if (merged.length > 0) setActiveChapterId(merged[0].id);
                                setActiveWorkIdStore(targetWorkId);
                                showToast(t('sidebar.importWorkSuccess').replace('{count}', importModal.chapters.length), 'success');
                                setImportModal(null);
                            } else {
                                setConflictModal({ conflicts, noConflictExisting, noConflictImported, targetWorkId, importedCount: importModal.chapters.length });
                                setImportModal(null);
                            }
                        } catch (err) {
                            showToast(t('sidebar.importWorkFailed').replace('{error}', err.message), 'error');
                        }
                    }}
                    t={t}
                />
            )}
            {/* ===== 章节冲突弹窗 ===== */}
            {conflictModal && (
                <ChapterConflictModal
                    conflicts={conflictModal.conflicts}
                    onClose={() => setConflictModal(null)}
                    onConfirm={async (resolvedConflicts) => {
                        try {
                            const merged = mergeChapters(conflictModal.noConflictExisting, conflictModal.noConflictImported, resolvedConflicts);
                            await saveChapters(merged, conflictModal.targetWorkId);
                            setActiveWorkIdSetting(conflictModal.targetWorkId);
                            setChapters(merged);
                            if (merged.length > 0) setActiveChapterId(merged[0].id);
                            setActiveWorkIdStore(conflictModal.targetWorkId);
                            showToast(t('sidebar.importWorkSuccess').replace('{count}', conflictModal.importedCount), 'success');
                            setConflictModal(null);
                        } catch (err) {
                            showToast(t('sidebar.importWorkFailed').replace('{error}', err.message), 'error');
                        }
                    }}
                    t={t}
                />
            )}
            {/* ===== 导出更多弹窗 ===== */}
            {showExportModal && (
                <ExportModal
                    chapters={chapters}
                    onClose={() => setShowExportModal(false)}
                    onExport={(selectedChapters, format) => {
                        const fns = { txt: exportWorkAsTxt, md: exportWorkAsMarkdown, docx: exportWorkAsDocx, epub: exportWorkAsEpub, pdf: exportWorkAsPdf };
                        const fn = fns[format];
                        if (fn) fn(selectedChapters);
                        setShowExportModal(false);
                        showToast(t('sidebar.exportedAll'), 'success');
                    }}
                    t={t}
                />
            )}
        </>
    );
}

/**
 * 导入作品时的目标作品选择弹窗
 */
function ImportWorkModal({ chapters, totalWords, onClose, onImport, t }) {
    const [works, setWorks] = useState([]);
    const [newWorkName, setNewWorkName] = useState('');
    const [showNewInput, setShowNewInput] = useState(false);

    // 加载作品列表
    useEffect(() => {
        (async () => {
            const nodes = await getSettingsNodes();
            setWorks(getAllWorks(nodes));
        })();
    }, []);

    const handleCreateAndImport = async () => {
        const name = newWorkName.trim();
        if (!name) return;
        const { workNode, subNodes } = createWorkNode(name);
        const allNodes = await getSettingsNodes();
        const updatedNodes = [...allNodes, workNode, ...subNodes];
        await saveSettingsNodes(updatedNodes);
        onImport(workNode.id);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-panel" onClick={e => e.stopPropagation()} style={{
                padding: '24px', maxWidth: 420, width: '90%', borderRadius: 'var(--radius-lg)',
                display: 'flex', flexDirection: 'column', gap: 16,
            }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{t('sidebar.importWorkSelectTitle')}</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    {t('sidebar.importWorkSelectDesc')
                        .replace('{count}', chapters.length)
                        .replace('{words}', totalWords.toLocaleString())}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {works.map(w => (
                        <button
                            key={w.id}
                            className="btn btn-secondary"
                            style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: 13 }}
                            onClick={() => onImport(w.id)}
                        >
                            📕 {w.name}
                        </button>
                    ))}

                    {showNewInput ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                                className="modal-input"
                                style={{ margin: 0, flex: 1, padding: '8px 10px', fontSize: 13 }}
                                value={newWorkName}
                                onChange={e => setNewWorkName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateAndImport()}
                                placeholder={t('sidebar.importWorkNewPlaceholder')}
                                autoFocus
                            />
                            <button className="btn btn-primary btn-sm" style={{ padding: '8px 14px', whiteSpace: 'nowrap' }} onClick={handleCreateAndImport}>
                                {t('common.confirm')}
                            </button>
                        </div>
                    ) : (
                        <button
                            className="btn btn-primary"
                            style={{ justifyContent: 'center', padding: '10px 14px', fontSize: 13 }}
                            onClick={() => setShowNewInput(true)}
                        >
                            ＋ {t('sidebar.importWorkNewBtn')}
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>{t('common.cancel')}</button>
                </div>
            </div>
        </div>
    );
}

/**
 * 章节冲突解决弹窗
 * 显示编号冲突的章节分组，用户可勾选保留哪些
 */
function ChapterConflictModal({ conflicts, onClose, onConfirm, t }) {
    // 初始化选择状态：默认全选
    const [selections, setSelections] = useState(() => {
        const init = {};
        for (const group of conflicts) {
            init[group.num] = {};
            for (const ch of group.existing) init[group.num][ch.id] = true;
            for (const ch of group.imported) init[group.num][ch.id] = true;
        }
        return init;
    });

    const toggleChapter = (num, id) => {
        setSelections(prev => ({
            ...prev,
            [num]: { ...prev[num], [id]: !prev[num][id] },
        }));
    };

    const isAllSelected = () => {
        for (const num in selections) {
            for (const id in selections[num]) {
                if (!selections[num][id]) return false;
            }
        }
        return true;
    };

    const toggleAll = () => {
        const allSelected = isAllSelected();
        const next = {};
        for (const num in selections) {
            next[num] = {};
            for (const id in selections[num]) {
                next[num][id] = !allSelected;
            }
        }
        setSelections(next);
    };

    // 全选已有
    const selectAllExisting = () => {
        const next = {};
        for (const group of conflicts) {
            next[group.num] = {};
            for (const ch of group.existing) next[group.num][ch.id] = true;
            for (const ch of group.imported) next[group.num][ch.id] = false;
        }
        setSelections(next);
    };

    // 全选导入
    const selectAllImported = () => {
        const next = {};
        for (const group of conflicts) {
            next[group.num] = {};
            for (const ch of group.existing) next[group.num][ch.id] = false;
            for (const ch of group.imported) next[group.num][ch.id] = true;
        }
        setSelections(next);
    };

    // 单组全选
    const toggleGroupAll = (group) => {
        const ids = [...group.existing, ...group.imported].map(ch => ch.id);
        const allSel = ids.every(id => selections[group.num]?.[id]);
        setSelections(prev => {
            const next = { ...prev, [group.num]: { ...prev[group.num] } };
            ids.forEach(id => { next[group.num][id] = !allSel; });
            return next;
        });
    };

    // 单组全选已有
    const selectGroupExisting = (group) => {
        setSelections(prev => {
            const next = { ...prev, [group.num]: { ...prev[group.num] } };
            for (const ch of group.existing) next[group.num][ch.id] = true;
            for (const ch of group.imported) next[group.num][ch.id] = false;
            return next;
        });
    };

    // 单组全选导入
    const selectGroupImported = (group) => {
        setSelections(prev => {
            const next = { ...prev, [group.num]: { ...prev[group.num] } };
            for (const ch of group.existing) next[group.num][ch.id] = false;
            for (const ch of group.imported) next[group.num][ch.id] = true;
            return next;
        });
    };

    const handleConfirm = () => {
        const resolved = conflicts.map(group => {
            const selected = [];
            for (const ch of group.existing) {
                if (selections[group.num]?.[ch.id]) selected.push(ch);
            }
            for (const ch of group.imported) {
                if (selections[group.num]?.[ch.id]) selected.push(ch);
            }
            return { num: group.num, selected };
        });
        onConfirm(resolved);
    };

    const btnStyle = (active) => ({
        padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border-light)',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
    });

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-panel" onClick={e => e.stopPropagation()} style={{
                padding: '24px', maxWidth: 520, width: '90%', borderRadius: 'var(--radius-lg)',
                display: 'flex', flexDirection: 'column', gap: 16,
                maxHeight: '70vh', overflow: 'hidden',
            }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{t('sidebar.conflictTitle') || '章节编号冲突'}</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    {t('sidebar.conflictDesc') || '以下章节编号相同，请选择保留哪些：'}
                </p>

                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4 }}>
                    {conflicts.map((group, gi) => {
                        const groupIds = [...group.existing, ...group.imported].map(ch => ch.id);
                        const groupAllSel = groupIds.every(id => selections[group.num]?.[id]);
                        return (
                            <div key={group.num} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {(t('sidebar.conflictGroup') || '第 {index} 组冲突（编号 {num}）：')
                                        .replace('{index}', gi + 1)
                                        .replace('{num}', group.num)}
                                </div>
                                {/* 组级快捷按钮 */}
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    <button style={btnStyle(groupAllSel)} onClick={() => toggleGroupAll(group)}>
                                        {t('sidebar.conflictSelectAll') || '全选'}
                                    </button>
                                    <button style={btnStyle(false)} onClick={() => selectGroupExisting(group)}>
                                        {t('sidebar.conflictSelectExisting') || '全选已有'}
                                    </button>
                                    <button style={btnStyle(false)} onClick={() => selectGroupImported(group)}>
                                        {t('sidebar.conflictSelectImported') || '全选导入'}
                                    </button>
                                </div>
                                {group.existing.map(ch => (
                                    <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
                                        <input
                                            type="checkbox"
                                            checked={!!selections[group.num]?.[ch.id]}
                                            onChange={() => toggleChapter(group.num, ch.id)}
                                        />
                                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>[{t('sidebar.conflictExisting') || '已有'}]</span>
                                        <span style={{ flex: 1 }}>{ch.title}</span>
                                    </label>
                                ))}
                                {group.imported.map(ch => (
                                    <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
                                        <input
                                            type="checkbox"
                                            checked={!!selections[group.num]?.[ch.id]}
                                            onChange={() => toggleChapter(group.num, ch.id)}
                                        />
                                        <span style={{ color: 'var(--accent)', fontSize: 11 }}>[{t('sidebar.conflictImported') || '导入'}]</span>
                                        <span style={{ flex: 1 }}>{ch.title}</span>
                                    </label>
                                ))}
                            </div>
                        );
                    })}
                </div>

                {/* 底部：全局快捷按钮 + 操作 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                            <input type="checkbox" checked={isAllSelected()} onChange={toggleAll} />
                            {t('sidebar.conflictSelectAll') || '全选'}
                        </label>
                        <button style={btnStyle(false)} onClick={selectAllExisting}>
                            {t('sidebar.conflictSelectExisting') || '全选已有'}
                        </button>
                        <button style={btnStyle(false)} onClick={selectAllImported}>
                            {t('sidebar.conflictSelectImported') || '全选导入'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={onClose}>{t('common.cancel')}</button>
                        <button className="btn btn-primary btn-sm" onClick={handleConfirm}>{t('sidebar.conflictConfirm') || '确认合并'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// 导出更多弹窗 — 选择章节 + 格式
function ExportModal({ chapters, onClose, onExport, t }) {
    const [selected, setSelected] = useState(new Set());
    const [format, setFormat] = useState('txt');

    // 按每 10 章分组
    const groups = [];
    for (let i = 0; i < chapters.length; i += 10) {
        groups.push(chapters.slice(i, i + 10));
    }

    const toggleChapter = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleGroup = (group) => {
        const ids = group.map(ch => ch.id);
        const allSelected = ids.every(id => selected.has(id));
        setSelected(prev => {
            const next = new Set(prev);
            if (allSelected) {
                ids.forEach(id => next.delete(id));
            } else {
                ids.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === chapters.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(chapters.map(ch => ch.id)));
        }
    };

    const formats = [
        { value: 'txt', label: '📄 TXT' },
        { value: 'md', label: '📝 Markdown' },
        { value: 'docx', label: '📘 DOCX' },
        { value: 'epub', label: '📚 EPUB' },
        { value: 'pdf', label: '🖨️ PDF' },
    ];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '90vw', maxWidth: 500, maxHeight: '85vh',
                display: 'flex', flexDirection: 'column',
                background: 'var(--bg-card)',
                borderRadius: 16,
                border: '1px solid var(--border-light)',
                boxShadow: '0 24px 48px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.05)',
                overflow: 'hidden',
            }}>
                {/* 头部 */}
                <div style={{
                    padding: '20px 24px 16px',
                    background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #000))',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>📤</span>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('sidebar.exportMoreTitle') || '导出更多'}</h3>
                            <span style={{ fontSize: 12, opacity: 0.85 }}>
                                {t('sidebar.exportSelectHint') || '选择要导出的章节'}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8,
                        color: '#fff', width: 32, height: 32, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>✕</button>
                </div>

                {/* 全选栏 */}
                <div style={{
                    padding: '10px 20px',
                    borderBottom: '1px solid var(--border-light)',
                    background: 'var(--bg-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        <input
                            type="checkbox"
                            checked={selected.size === chapters.length && chapters.length > 0}
                            onChange={toggleAll}
                            style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                        />
                        {t('sidebar.exportSelectAll') || '全选'}
                    </label>
                    <span style={{
                        fontSize: 12, fontWeight: 600,
                        background: selected.size > 0 ? 'var(--accent)' : 'var(--bg-tertiary, #888)',
                        color: selected.size > 0 ? '#fff' : 'var(--text-muted)',
                        padding: '2px 10px', borderRadius: 12,
                        transition: 'all 0.2s',
                    }}>
                        {selected.size} / {chapters.length}
                    </span>
                </div>

                {/* 章节分组列表 */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
                    {groups.map((group, gi) => {
                        const startIdx = gi * 10 + 1;
                        const endIdx = gi * 10 + group.length;
                        const groupIds = group.map(ch => ch.id);
                        const allGroupSelected = groupIds.every(id => selected.has(id));
                        const someGroupSelected = groupIds.some(id => selected.has(id));

                        return (
                            <div key={gi} style={{ marginBottom: 6 }}>
                                {/* 组标题 */}
                                <label style={{
                                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                    fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
                                    padding: '8px 8px 6px', letterSpacing: '0.5px',
                                    textTransform: 'uppercase',
                                    borderBottom: '2px solid var(--border-light)',
                                    marginBottom: 2,
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={allGroupSelected}
                                        ref={el => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected; }}
                                        onChange={() => toggleGroup(group)}
                                        style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                                    />
                                    {t('sidebar.exportGroup') || '第'} {startIdx}–{endIdx} {t('sidebar.exportGroupSuffix') || '章'}
                                </label>
                                {/* 组内章节 */}
                                {group.map(ch => (
                                    <label key={ch.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                        fontSize: 13, padding: '6px 8px 6px 24px',
                                        color: selected.has(ch.id) ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        borderRadius: 6,
                                        background: selected.has(ch.id) ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                                        transition: 'background 0.15s',
                                    }}
                                        onMouseEnter={e => { if (!selected.has(ch.id)) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                                        onMouseLeave={e => { if (!selected.has(ch.id)) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected.has(ch.id)}
                                            onChange={() => toggleChapter(ch.id)}
                                            style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
                                        />
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected.has(ch.id) ? 500 : 400 }}>
                                            {ch.title || t('sidebar.untitled') || '未命名'}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                            {(ch.wordCount || 0).toLocaleString()}{t('sidebar.wordUnit') || '字'}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        );
                    })}
                </div>

                {/* 底部操作栏 */}
                <div style={{
                    padding: '14px 20px',
                    borderTop: '1px solid var(--border-light)',
                    background: 'var(--bg-secondary)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
                        {formats.map(f => (
                            <button
                                key={f.value}
                                onClick={() => setFormat(f.value)}
                                style={{
                                    padding: '5px 12px', fontSize: 12, fontWeight: 500,
                                    borderRadius: 20, border: '1px solid',
                                    borderColor: format === f.value ? 'var(--accent)' : 'var(--border-light)',
                                    background: format === f.value ? 'var(--accent)' : 'transparent',
                                    color: format === f.value ? '#fff' : 'var(--text-secondary)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <button
                        className="btn btn-primary"
                        disabled={selected.size === 0}
                        onClick={() => {
                            const selectedChapters = chapters.filter(ch => selected.has(ch.id));
                            onExport(selectedChapters, format);
                        }}
                        style={{
                            flexShrink: 0, padding: '8px 20px', fontSize: 13, fontWeight: 600,
                            borderRadius: 10, opacity: selected.size === 0 ? 0.5 : 1,
                        }}
                    >
                        {t('sidebar.exportBtn') || '导出'} ({selected.size})
                    </button>
                </div>
            </div>
        </div>
    );
}
