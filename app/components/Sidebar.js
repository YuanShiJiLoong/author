'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { createChapter, deleteChapter, updateChapter, exportToMarkdown, exportAllToMarkdown } from '../lib/storage';
import { exportProject, importProject } from '../lib/project-io';
import { WRITING_MODES } from '../lib/settings';

export default function Sidebar() {
    const {
        chapters, addChapter, setChapters, updateChapter: updateChapterStore,
        activeChapterId, setActiveChapterId,
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
    const { t } = useI18n();

    // 切换主题
    const toggleTheme = useCallback(() => {
        const next = theme === 'light' ? 'dark' : 'light';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('author-theme', next);
    }, [theme, setTheme]);

    // 从上一章节名推算下一章节名：提取末尾数字 +1
    const getNextChapterTitle = useCallback(() => {
        if (chapters.length === 0) return t('sidebar.defaultChapterTitle').replace('{num}', 1);
        const lastTitle = chapters[chapters.length - 1].title;
        const match = lastTitle.match(/(\d+)\s*$/);
        if (match) {
            const nextNum = parseInt(match[1], 10) + 1;
            return lastTitle.replace(/(\d+)\s*$/, String(nextNum));
        }
        return t('sidebar.defaultChapterTitle').replace('{num}', chapters.length + 1);
    }, [chapters, t]);

    // 创建新章节 — 一键创建并进入重命名模式
    const handleCreateChapter = useCallback(() => {
        const title = getNextChapterTitle();
        const ch = createChapter(title);
        addChapter(ch);
        setActiveChapterId(ch.id);
        // 立即进入重命名模式，方便用户修改标题
        setRenameId(ch.id);
        setRenameTitle(title);
        showToast(t('sidebar.chapterCreated').replace('{title}', title), 'success');
    }, [getNextChapterTitle, showToast, addChapter, setActiveChapterId, t]);

    // 删除章节
    const handleDeleteChapter = useCallback((id) => {
        if (chapters.length <= 1) {
            showToast(t('sidebar.alertRetainOne'), 'error');
            return;
        }
        const ch = chapters.find(c => c.id === id);
        const remaining = deleteChapter(id);
        setChapters(remaining);
        if (activeChapterId === id) {
            setActiveChapterId(remaining[0]?.id || null);
        }
        showToast(t('sidebar.chapterDeleted').replace('{title}', ch?.title), 'info');
        setContextMenu(null);
    }, [chapters, activeChapterId, showToast, setChapters, setActiveChapterId, t]);

    // 重命名章节
    const handleRename = useCallback((id) => {
        const title = renameTitle.trim();
        if (!title) return;
        const updated = updateChapter(id, { title });
        updateChapterStore(id, { title });
        setRenameId(null);
        setRenameTitle('');
    }, [renameTitle, updateChapterStore]);

    // 导出
    const handleExport = useCallback((type) => {
        if (type === 'current' && activeChapterId) {
            const activeChapter = chapters.find(ch => ch.id === activeChapterId);
            if (activeChapter) {
                exportToMarkdown(activeChapter);
                showToast(t('sidebar.exportedChapter'), 'success');
            }
        } else if (type === 'all') {
            exportAllToMarkdown(chapters);
            showToast(t('sidebar.exportedAll'), 'success');
        }
    }, [activeChapterId, chapters, showToast, t]);

    const totalWords = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

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
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => handleExport('current')}>
                            {t('sidebar.exportCurrent')}
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => handleExport('all')}>
                            {t('sidebar.exportAll')}
                        </button>
                        <button id="tour-settings" className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowSettings(true)} title={t('sidebar.tooltipSettings')}>
                            ⚙️
                        </button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={toggleTheme} title={theme === 'light' ? t('sidebar.tooltipThemeDark') : t('sidebar.tooltipThemeLight')}>
                            {theme === 'light' ? '🌙' : '☀️'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowSnapshots(true)} title={t('sidebar.tooltipTimeMachine')}>
                            🕒
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => { exportProject(); }}>
                            {t('sidebar.btnSave')}
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => { document.getElementById('project-import-input')?.click(); }}>
                            {t('sidebar.btnLoad')}
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
                                if (ch) exportToMarkdown(ch);
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
        </>
    );
}
