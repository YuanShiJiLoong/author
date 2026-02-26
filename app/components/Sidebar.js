'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { createChapter, deleteChapter, updateChapter, saveChapters, getChapters } from '../lib/storage';
import { exportProject, importProject, importWork, exportWorkAsTxt, exportWorkAsMarkdown, exportWorkAsDocx, exportWorkAsEpub, exportWorkAsPdf } from '../lib/project-io';
import { WRITING_MODES, getAllWorks, getSettingsNodes, createWorkNode, saveSettingsNodes, setActiveWorkId as setActiveWorkIdSetting } from '../lib/settings';
import { detectConflicts, mergeChapters } from '../lib/chapter-number';

export default function Sidebar() {
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
    const [importModal, setImportModal] = useState(null); // { chapters, totalWords, file }
    const [showCurrentExportMenu, setShowCurrentExportMenu] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [conflictModal, setConflictModal] = useState(null); // { conflicts, noConflictExisting, noConflictImported, targetWorkId, importedChapters }
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
        // 1. "第N章" 阿拉伯数字
        const m1 = title.match(/第(\d+)章/);
        if (m1) return title.replace(/第\d+章/, `第${parseInt(m1[1], 10) + 1}章`);
        // 2. "第X章" 中文数字（如 第三十三章）
        const m2 = title.match(/第([零一二三四五六七八九十百千万]+)章/);
        if (m2) { const n = parseCnNum(m2[1]); if (!isNaN(n)) return title.replace(/第[零一二三四五六七八九十百千万]+章/, `第${toCnNum(n + 1)}章`); }
        // 3. 纯阿拉伯数字（如 "33"）
        if (/^\d+$/.test(title.trim())) return String(parseInt(title.trim(), 10) + 1);
        // 4. 纯中文数字（如 "三十三"）
        if (/^[零一二三四五六七八九十百千万]+$/.test(title.trim())) { const n = parseCnNum(title.trim()); if (!isNaN(n)) return toCnNum(n + 1); }
        // 5. 包含末尾数字（如 "Chapter 33"）
        const m5 = title.match(/(\d+)\s*$/);
        if (m5) return title.replace(/(\d+)\s*$/, String(parseInt(m5[1], 10) + 1));
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

    // 导出

    const totalWords = Array.isArray(chapters) ? chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0) : 0;

    return (
        <>
            <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <span>A</span>uthor
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={() => setSidebarOpen(false)} title={t('sidebar.collapseSidebar')}>
                        ✕
                    </button>
                </div>

                <div style={{ padding: '12px 12px 0' }}>
                    <button
                        id="tour-new-chapter"
                        className="btn btn-primary"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={handleCreateChapter}
                    >
                        {t('sidebar.newChapter')}
                    </button>
                </div>

                <div className="sidebar-content">
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px 14px 6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {t('sidebar.chapterList')} ({chapters.length})
                    </div>
                    <div className="chapter-list">
                        {chapters.map(ch => (
                            <div
                                key={ch.id}
                                className={`chapter-item ${ch.id === activeChapterId ? 'active' : ''}`}
                                onClick={() => setActiveChapterId(ch.id)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({ id: ch.id, x: e.clientX, y: e.clientY });
                                }}
                            >
                                {renameId === ch.id ? (
                                    <input
                                        className="modal-input"
                                        style={{ margin: 0, padding: '4px 8px', fontSize: '13px' }}
                                        value={renameTitle || ''}
                                        onChange={e => setRenameTitle(e.target.value)}
                                        onBlur={() => handleRename(ch.id)}
                                        onKeyDown={e => e.key === 'Enter' && handleRename(ch.id)}
                                        onClick={e => e.stopPropagation()}
                                        autoFocus
                                    />
                                ) : (
                                    <>
                                        <span className="chapter-title">{ch.title}</span>
                                        <span className="chapter-count">{ch.wordCount || 0}{t('sidebar.wordUnit')}</span>
                                        <div className="chapter-actions">
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRenameId(ch.id);
                                                    setRenameTitle(ch.title);
                                                }}
                                                title={t('common.rename')}
                                            >
                                                ✎
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteChapter(ch.id);
                                                }}
                                                title={t('common.delete')}
                                                style={{ color: 'var(--error)' }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="sidebar-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                    {/* 写作模式指示器 */}
                    {(() => {
                        const modeConfig = WRITING_MODES[writingMode];
                        return modeConfig ? (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 10px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: `${modeConfig.color}10`,
                                    border: `1px solid ${modeConfig.color}30`,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                                onClick={() => setShowSettings(true)}
                                title={t('sidebar.clickToSwitchMode')}
                            >
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
                            <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => setShowCurrentExportMenu(!showCurrentExportMenu)}>
                                {t('sidebar.exportCurrent')}
                            </button>
                            {showCurrentExportMenu && (<>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowCurrentExportMenu(false)} />
                                <div style={{
                                    position: 'absolute', left: 0, bottom: '100%', marginBottom: 6,
                                    minWidth: 150, zIndex: 100,
                                    background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                                    padding: 4,
                                }}>
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
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => setShowExportModal(true)}>
                            {t('sidebar.exportMore') || '导出更多'}
                        </button>
                        <button id="tour-settings" className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowSettings(true)} title={t('sidebar.tooltipSettings')}>
                            ⚙️
                        </button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={toggleTheme} title={theme === 'light' ? t('sidebar.tooltipThemeDark') : t('sidebar.tooltipThemeLight')}>
                            {theme === 'light' ? '🌙' : '☀️'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch' }}>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowSnapshots(true)} title={t('sidebar.tooltipTimeMachine')}>
                            🕒
                        </button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { exportProject(); }} title={t('sidebar.btnSaveTitle') || '存档（导出项目 JSON）'}>
                            💾
                        </button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { document.getElementById('project-import-input')?.click(); }} title={t('sidebar.btnLoadTitle') || '读档（导入项目 JSON）'}>
                            📂
                        </button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { document.getElementById('work-import-input')?.click(); }} title={t('sidebar.btnImportWorkTitle')}>
                            📥
                        </button>
                        <input
                            id="project-import-input"
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const result = await importProject(file);
                                if (result.success) {
                                    alert(result.message + '\n' + t('sidebar.importSuccess'));
                                    window.location.reload();
                                } else {
                                    alert(result.message);
                                }
                                e.target.value = '';
                            }}
                        />
                        <input
                            id="work-import-input"
                            type="file"
                            accept=".txt,.md,.markdown,.epub,.docx,.doc,.pdf"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                    const result = await importWork(file);
                                    if (!result.success) {
                                        const msg = result.message === 'noChapter'
                                            ? t('sidebar.importWorkNoChapter')
                                            : t('sidebar.importWorkFailed').replace('{error}', result.message);
                                        showToast(msg, 'error');
                                        e.target.value = '';
                                        return;
                                    }
                                    // 弹出作品选择
                                    setImportModal({ chapters: result.chapters, totalWords: result.totalWords });
                                } catch (err) {
                                    showToast(t('sidebar.importWorkFailed').replace('{error}', err.message), 'error');
                                }
                                e.target.value = '';
                            }}
                        />
                    </div>
                </div>
            </aside>

            {/* ===== 右键菜单 ===== */}
            {contextMenu && (
                <div
                    className="modal-overlay"
                    style={{ background: 'transparent' }}
                    onClick={() => setContextMenu(null)}
                >
                    <div
                        className="dropdown-menu"
                        style={{
                            position: 'fixed',
                            left: contextMenu.x,
                            top: contextMenu.y,
                        }}
                    >
                        <button
                            className="dropdown-item"
                            onClick={() => {
                                setRenameId(contextMenu.id);
                                const ch = chapters.find(c => c.id === contextMenu.id);
                                setRenameTitle(ch?.title || '');
                                setContextMenu(null);
                            }}
                        >
                            {t('sidebar.contextRename')}
                        </button>
                        <button
                            className="dropdown-item"
                            onClick={() => {
                                const ch = chapters.find(c => c.id === contextMenu.id);
                                if (ch) exportWorkAsMarkdown([ch], ch.title);
                                setContextMenu(null);
                            }}
                        >
                            {t('sidebar.contextExport')}
                        </button>
                        <button
                            className="dropdown-item danger"
                            onClick={() => handleDeleteChapter(contextMenu.id)}
                        >
                            {t('sidebar.contextDelete')}
                        </button>
                    </div>
                </div>
            )}
            {/* ===== 导入作品-选择目标作品弹窗 ===== */}
            {importModal && (
                <ImportWorkModal
                    chapters={importModal.chapters}
                    totalWords={importModal.totalWords}
                    onClose={() => setImportModal(null)}
                    onImport={async (targetWorkId) => {
                        try {
                            const existingChapters = await getChapters(targetWorkId);
                            if (existingChapters.length === 0) {
                                // 目标作品为空，直接导入
                                await saveChapters(importModal.chapters, targetWorkId);
                                setActiveWorkIdSetting(targetWorkId);
                                setChapters(importModal.chapters);
                                if (importModal.chapters.length > 0) setActiveChapterId(importModal.chapters[0].id);
                                setActiveWorkIdStore(targetWorkId);
                                showToast(t('sidebar.importWorkSuccess').replace('{count}', importModal.chapters.length), 'success');
                                setImportModal(null);
                                return;
                            }
                            // 检测冲突
                            const { conflicts, noConflictExisting, noConflictImported } = detectConflicts(existingChapters, importModal.chapters);
                            if (conflicts.length === 0) {
                                // 无冲突，直接合并
                                const merged = mergeChapters(noConflictExisting, noConflictImported, []);
                                await saveChapters(merged, targetWorkId);
                                setActiveWorkIdSetting(targetWorkId);
                                setChapters(merged);
                                if (merged.length > 0) setActiveChapterId(merged[0].id);
                                setActiveWorkIdStore(targetWorkId);
                                showToast(t('sidebar.importWorkSuccess').replace('{count}', importModal.chapters.length), 'success');
                                setImportModal(null);
                            } else {
                                // 有冲突，弹出冲突解决弹窗
                                setConflictModal({
                                    conflicts,
                                    noConflictExisting,
                                    noConflictImported,
                                    targetWorkId,
                                    importedCount: importModal.chapters.length,
                                });
                                setImportModal(null);
                            }
                        } catch (err) {
                            showToast(t('sidebar.importWorkFailed').replace('{error}', err.message), 'error');
                        }
                    }}
                    t={t}
                />
            )}
            {/* ===== 章节冲突解决弹窗 ===== */}
            {conflictModal && (
                <ChapterConflictModal
                    conflicts={conflictModal.conflicts}
                    onClose={() => setConflictModal(null)}
                    onConfirm={async (resolvedConflicts) => {
                        try {
                            const merged = mergeChapters(
                                conflictModal.noConflictExisting,
                                conflictModal.noConflictImported,
                                resolvedConflicts
                            );
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
                        const fns = {
                            txt: exportWorkAsTxt,
                            md: exportWorkAsMarkdown,
                            docx: exportWorkAsDocx,
                            epub: exportWorkAsEpub,
                            pdf: exportWorkAsPdf,
                        };
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
