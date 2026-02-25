'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { createChapter, deleteChapter, updateChapter, exportToMarkdown, exportAllToMarkdown, saveChapters } from '../lib/storage';
import { exportProject, importProject, importWork, exportWorkAsTxt } from '../lib/project-io';
import { WRITING_MODES, getAllWorks, getSettingsNodes, createWorkNode, saveSettingsNodes, setActiveWorkId as setActiveWorkIdSetting } from '../lib/settings';

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
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => { document.getElementById('work-import-input')?.click(); }} title={t('sidebar.btnImportWorkTitle')}>
                            {t('sidebar.btnImportWork')}
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => { exportWorkAsTxt(chapters); }} title={t('sidebar.btnExportTxtTitle')}>
                            {t('sidebar.btnExportTxt')}
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
                            accept=".txt"
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
            {/* ===== 导入作品-选择目标作品弹窗 ===== */}
            {importModal && (
                <ImportWorkModal
                    chapters={importModal.chapters}
                    totalWords={importModal.totalWords}
                    onClose={() => setImportModal(null)}
                    onImport={async (targetWorkId) => {
                        try {
                            await saveChapters(importModal.chapters, targetWorkId);
                            // 切换到目标作品
                            setActiveWorkIdSetting(targetWorkId);
                            // 直接更新 store 中的章节列表（立即生效，无需刷新）
                            setChapters(importModal.chapters);
                            if (importModal.chapters.length > 0) {
                                setActiveChapterId(importModal.chapters[0].id);
                            }
                            setActiveWorkIdStore(targetWorkId);
                            showToast(t('sidebar.importWorkSuccess').replace('{count}', importModal.chapters.length), 'success');
                            setImportModal(null);
                        } catch (err) {
                            showToast(t('sidebar.importWorkFailed').replace('{error}', err.message), 'error');
                        }
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
    useState(() => {
        (async () => {
            const nodes = await getSettingsNodes();
            setWorks(getAllWorks(nodes));
        })();
    });

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
                            onClick={() => {
                                if (confirm(t('sidebar.importWorkReplaceConfirm').replace('{name}', w.name))) {
                                    onImport(w.id);
                                }
                            }}
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
