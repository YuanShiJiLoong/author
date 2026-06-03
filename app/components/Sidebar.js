'use client';

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { createChapter, deleteChapter, updateChapter, saveChapters, getChapters, createVolume, insertChapterAfter, insertChapterInVolume, reorderItems } from '../lib/storage';
import { exportProject, importProject, importWork, exportWorkAsTxt, exportWorkAsMarkdown, exportWorkAsDocx, exportWorkAsEpub, exportWorkAsPdf } from '../lib/project-io';
import { WRITING_MODES, getAllWorks, getProjectSettings, getSettingsNodes, addWork, saveSettingsNodes, setActiveWorkId as setActiveWorkIdSetting, getActiveWorkId } from '../lib/settings';
import { detectConflicts, mergeChapters } from '../lib/chapter-number';
import { estimateTokens } from '../lib/context-engine';
import { Settings, Moon, Sun, History, Save, FolderOpen, FileDown, BookOpen, HelpCircle, Github, PanelLeftClose, ListOrdered, Library, Plus, FileText, FileType, BookMarked, FileOutput, Printer, Book, X, MoreHorizontal, ChevronUp, KeyRound, SlidersHorizontal, Eye, Smartphone, Clapperboard, Cloud, CloudOff, RefreshCw, CloudUpload, CloudDownload, Sparkles, Brain, Search, CheckCircle2, GitMerge, Layers3 } from 'lucide-react';
import Tooltip from './ui/Tooltip';
import IconButton from './ui/IconButton';
import SettingsCategoryPanel, { getCategoryIcon, getCategoryColor, getCategoryLabel, getIconByName } from './SettingsCategoryPanel';
import SettingsCategoryPopover, { getPinnedCategories, savePinnedCategories } from './SettingsCategoryPopover';
import SyncConfirmModal from './SyncConfirmModal';
import ExitSyncModal from './ExitSyncModal';
import { buildChapterSynopsisText, getChapterSynopsis, hasChapterSynopsis, normalizeChapterSynopsis, parseGeneratedSynopsis, stripChapterHtml } from '../lib/chapter-synopsis';
import { buildChapterMemoryGroupText, buildChapterSourceText, getChapterMemoryGroups, hasChapterMemoryGroup, normalizeChapterMemoryGroup, saveChapterMemoryGroups } from '../lib/chapter-memory-groups';

/** 更多操作下拉菜单（Portal 渲染到 body，彻底避免 overflow 裁剪） */
function MoreMenuPortal({ anchorRef, t, setShowSettings, setShowMoreMenu, onOpenHelp, setShowGitPopup }) {
    const menuRef = useRef(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    useLayoutEffect(() => {
        const anchor = anchorRef?.current;
        const menu = menuRef.current;
        if (!anchor || !menu) return;
        const rect = anchor.getBoundingClientRect();
        const menuH = menu.offsetHeight;
        const vh = window.innerHeight;
        let top = rect.bottom - menuH;
        if (top + menuH > vh - 4) top = vh - menuH - 4;
        if (top < 4) top = 4;
        menu.style.left = (rect.right + 8) + 'px';
        menu.style.top = top + 'px';
    });

    if (!mounted) return null;

    return createPortal(
        <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }} onClick={() => setShowMoreMenu(false)} />
            <div ref={menuRef} style={{
                position: 'fixed', zIndex: 9991,
                background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                padding: 4, minWidth: 140,
            }}>
                <button className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setShowSettings('apiConfig'); setShowMoreMenu(false); }}>
                    <KeyRound size={14} style={{ flexShrink: 0 }} /> <span>{t('settings.tabApi') || 'API 配置'}</span>
                </button>
                <button className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setShowSettings('preferences'); setShowMoreMenu(false); }}>
                    <SlidersHorizontal size={14} style={{ flexShrink: 0 }} /> <span>{t('settings.tabPreferences') || '偏好设置'}</span>
                </button>
                <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }} />
                <button className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onOpenHelp?.(); setShowMoreMenu(false); }}>
                    <HelpCircle size={14} style={{ flexShrink: 0 }} /> <span>{t('sidebar.menuHelp') || '帮助'}</span>
                </button>
                <button id="tour-github" className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setShowGitPopup(true); setShowMoreMenu(false); }}>
                    <Github size={14} style={{ flexShrink: 0 }} /> <span>{t('sidebar.menuCommunity') || '社区'}</span>
                </button>
            </div>
        </>,
        document.body
    );
}

/** 云同步下拉菜单（Portal 渲染到 body，根据实际高度动态调整避免被容器裁剪或超出屏幕） */
function SyncMenuPortal({ anchorRef, t, cloudinarySyncStatus, setShowSyncMenu, setShowSyncConfirmModal }) {
    const menuRef = useRef(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    useLayoutEffect(() => {
        const anchor = anchorRef?.current;
        const menu = menuRef.current;
        if (!anchor || !menu) return;
        const rect = anchor.getBoundingClientRect();
        const menuH = menu.offsetHeight;
        const vh = window.innerHeight;
        let top = rect.bottom - menuH; // 默认与按钮底部对齐
        if (top + menuH > vh - 4) top = vh - menuH - 4; // 如果超出底部，则上移
        if (top < 4) top = 4; // 如果超顶部，则至少保留 4px
        menu.style.left = (rect.right + 8) + 'px';
        menu.style.top = top + 'px';
    });

    if (!mounted) return null;

    return createPortal(
        <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }} onClick={() => setShowSyncMenu(false)} />
            <div ref={menuRef} style={{
                position: 'fixed', minWidth: 220, zIndex: 9991,
                background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: 4,
            }}>
                <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 500, color: 'var(--text-color)', borderBottom: '1px solid var(--border-light)', marginBottom: 4 }}>
                    云同步状态
                </div>
                <div style={{ padding: '4px 12px', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {cloudinarySyncStatus?.syncing ? '正在同步中...'
                    : cloudinarySyncStatus?.pending > 0 ? `有 ${cloudinarySyncStatus.pending} 项更改等待同步`
                    : '更改已同步至云端'}
                </div>
                {cloudinarySyncStatus?.pending > 0 && (
                    <div style={{ padding: '0 8px', marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>待同步队列：</div>
                        <div style={{
                            maxHeight: 120, overflowY: 'auto', 
                            background: 'var(--bg-base)', borderRadius: 4, 
                            padding: '6px', fontSize: 11, color: 'var(--text-secondary)',
                            fontFamily: 'monospace', wordBreak: 'break-all',
                            border: '1px solid var(--border-light)'
                        }}>
                            {cloudinarySyncStatus.keys.map(k => {
                                let label = k;
                                if (k === 'author-project-settings') label = '全局设置';
                                else if (k === 'author-works-index') label = '作品库目录';
                                else if (k === 'author-recent-works') label = '近期使用记录';
                                else if (k.startsWith('author-settings-nodes-')) label = '作品设定 (' + k.replace('author-settings-nodes-', '') + ')';
                                else if (k.startsWith('author-chapters-')) label = '全书章节内容 (' + k.replace('author-chapters-', '') + ')';
                                return <div key={k} style={{ padding: '2px 0' }}>• {label}</div>;
                            })}
                        </div>
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 4px', marginTop: 4 }}>
                    <button 
                        className="btn btn-secondary" 
                        style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: '6px 0' }}
                        onClick={async () => {
                            setShowSyncMenu(false);
                            try {
                                await useAppStore.getState().flushPendingEditorSave();
                                const { flushSync } = await import('../lib/firestore-sync');
                                await flushSync({ throwOnError: true });
                            } catch (err) {
                                showToast(`同步失败: ${err.message}`, 'error');
                            }
                        }}
                        disabled={cloudinarySyncStatus?.syncing}
                    >
                        {cloudinarySyncStatus?.syncing ? (
                            <RefreshCw size={14} className="spin" style={{ marginRight: 6 }} />
                        ) : (
                            <CloudUpload size={14} style={{ marginRight: 6 }} />
                        )}
                        同步到云端
                    </button>

                    <button 
                        className="btn" 
                        style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: '6px 0', background: 'transparent', border: '1px solid var(--border-light)', color: '#ef4444' }}
                        onClick={() => {
                            setShowSyncMenu(false);
                            setShowSyncConfirmModal(true);
                        }}
                        disabled={cloudinarySyncStatus?.syncing}
                    >
                        <CloudDownload size={14} style={{ marginRight: 6 }} />
                        从云端同步
                    </button>
                </div>
                <div style={{ padding: '8px 12px 4px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('cloudSync.chatLocalOnly')}
                </div>
            </div>
        </>,
        document.body
    );
}

function resolveAiEndpoint(apiConfig) {
    const provider = apiConfig?.providerType || apiConfig?.provider;
    if (['gemini-native', 'custom-gemini'].includes(provider)) return '/api/ai/gemini';
    if (provider === 'openai-responses') return '/api/ai/responses';
    if (['claude', 'custom-claude'].includes(provider) || apiConfig?.apiFormat === 'anthropic') return '/api/ai/claude';
    return '/api/ai';
}

async function readAiTextStream(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await response.json();
        throw new Error(data.error || '请求失败');
    }

    const reader = response.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
            const trimmed = event.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;
            try {
                const json = JSON.parse(trimmed.slice(6));
                if (json.text) fullText += json.text;
            } catch {
                // Ignore malformed stream fragments.
            }
        }
    }

    return fullText.trim();
}

function buildSynopsisPrompts(chapter) {
    const chapterText = stripChapterHtml(chapter?.content || '');

    const systemPrompt = [
        '你是小说章节概要整理助手。你的任务不是压缩字数，而是把单章正文整理成高保真、可复用的后续写作上下文。',
        '',
        '要求：',
        '1. 只依据正文，完整保留本章发生的事实、事件链、决定、冲突、信息增量和结尾状态。',
        '2. 使用与正文一致的语言；角色名、地名、术语保持原文，不翻译也不改写。',
        '3. 不限制输出 tokens；不要为了简短牺牲内容精细度、详细程度、事件完整性或剧情颗粒度。',
        '4. 按章节顺序、时间顺序和因果关系记录；每个重要节点尽量写清触发、行动、冲突、结果、信息增量。',
        '5. 最高优先级是准确、完整、细致；次要优先级才是简洁。未明确发生的内容不要写成事实。',
        '6. 不要把内容整理成设定库、人物卡或时间线档案；只做这一章的概要与续写衔接。',
        '7. 只输出 JSON，不要输出 Markdown、解释、代码块或元评论。',
        '',
        'JSON 字段必须包含：',
        '- summary：高保真概述本章完整进展、主要冲突、信息增量和结尾状态，不限制字数。',
        '- beats：本章关键情节节点数组，按发生顺序排列，颗粒度要细。',
        '- endingState：本章最后停在什么画面、决定、冲突、信息或情绪状态上。',
        '- continuityNotes：下一章续写必须记住的上下文数组，只写本章造成的衔接点，不扩写成设定档案。',
        '- openThreads：明确出现但尚未回收的伏笔、疑问、承诺、风险或待解决冲突数组。',
        '- spoilerLevel：固定填写 "chapter"。',
        '数组字段使用完整短句；没有内容时返回空数组。'
    ].join('\n');

    const userPrompt = [
        `章节标题：${chapter?.title || '未命名章节'}`,
        '',
        '请根据以下完整正文生成最高细节标准的章节概要 JSON，输出需能作为后续写作上下文继续使用：',
        '',
        '<chapter>',
        chapterText,
        '</chapter>',
        '',
        '输出 JSON 结构：',
        '{"summary":"","beats":[],"endingState":"","continuityNotes":[],"openThreads":[],"spoilerLevel":"chapter"}'
    ].join('\n');

    return { systemPrompt, userPrompt };
}

function buildMemoryGroupPrompts({ name, chapters }) {
    const systemPrompt = [
        '你是小说多章节记忆压缩助手。你的任务不是粗略概括，而是把多章内容整理成可长期复用的高保真剧情记忆。',
        '',
        '要求：',
        '1. 严格依据提供内容，完整保留跨章节连续性：事件链、因果、人物关系、状态变化、地点/物品/线索变化、伏笔与待回收问题。',
        '2. 不限制输出 tokens；不要为了简短牺牲内容精细度、详细程度、事件完整性或剧情颗粒度。',
        '3. 按章节顺序、时间顺序和因果关系组织；写清每个重要节点的触发、行动、冲突、结果和信息增量。',
        '4. 使用与原文一致的语言；角色名、地名、术语保持原文。',
        '5. 只输出 JSON，不要输出 Markdown、解释、代码块或元评论。',
        '',
        'JSON 字段必须包含：summary、beats、events、entityDeltas、foreshadowing、timelineRefs、spoilerLevel。spoilerLevel 固定填写 "multi-chapter"。'
    ].join('\n');

    const content = chapters.map(({ chapter, ordinal }) => buildChapterSourceText(chapter, ordinal)).join('\n\n---\n\n');
    const userPrompt = [
        `记忆组名称：${name || '未命名记忆组'}`,
        '',
        '请根据以下章节内容生成最高细节标准的多章节概要 JSON：',
        '',
        '<chapters>',
        content,
        '</chapters>',
        '',
        '输出 JSON 结构：',
        '{"summary":"","beats":[],"events":[],"entityDeltas":[],"foreshadowing":[],"timelineRefs":[],"spoilerLevel":"multi-chapter"}'
    ].join('\n');

    return { systemPrompt, userPrompt };
}

function buildMemoryMergePrompts({ name, groups, chapters }) {
    const systemPrompt = [
        '你是小说长期记忆压缩助手。你的任务是把多个章节记忆组继续合并为更高层、更稳定的剧情记忆。',
        '',
        '要求：',
        '1. 保留所有影响后续创作的关键事实、事件链、人物状态、关系变化、设定变化、伏笔、未解决冲突。',
        '2. 可以压缩重复表述，但不能丢失剧情颗粒度、因果关系和连续性。',
        '3. 将相同人物/地点/物品/线索的变化合并成清晰状态，不要互相覆盖。',
        '4. 不限制输出 tokens；最高优先级是准确、完整、细致。',
        '5. 只输出 JSON，不要输出 Markdown、解释、代码块或元评论。',
        '',
        'JSON 字段必须包含：summary、beats、events、entityDeltas、foreshadowing、timelineRefs、spoilerLevel。spoilerLevel 固定填写 "merged-group"。'
    ].join('\n');

    const content = groups.map(group => buildChapterMemoryGroupText(group, chapters)).join('\n\n---\n\n');
    const userPrompt = [
        `合并后记忆组名称：${name || '合并记忆组'}`,
        '',
        '请将以下多个记忆组进一步合并/压缩为一个可长期复用的多章节概要 JSON：',
        '',
        '<memory_groups>',
        content,
        '</memory_groups>',
        '',
        '输出 JSON 结构：',
        '{"summary":"","beats":[],"events":[],"entityDeltas":[],"foreshadowing":[],"timelineRefs":[],"spoilerLevel":"merged-group"}'
    ].join('\n');

    return { systemPrompt, userPrompt };
}

function formatMemoryTokens(value) {
    const tokens = Number(value) || 0;
    if (tokens >= 10000) return `${(tokens / 10000).toFixed(1)}万 tokens`;
    return `${tokens.toLocaleString()} tokens`;
}

function MemoryWorkspaceHeader({
    activeMode,
    title = '章节记忆',
    subtitle,
    icon,
    showTabs = true,
    onSwitchToSynopsis,
    onSwitchToMemory,
    onClose,
    onSave,
    saving,
    saveDisabled,
    saveLabel = '保存',
}) {
    const headerIcon = icon || <Brain size={22} />;
    return (
        <div className="memory-workspace-header">
            <div className="memory-workspace-title">
                <span className="memory-workspace-icon">{headerIcon}</span>
                <div>
                    <h2>{title}</h2>
                    <p>{subtitle || '用于续写承接与长期剧情压缩'}</p>
                </div>
            </div>
            <div className="memory-workspace-header-actions">
                {showTabs && (
                    <div className="memory-workspace-tabs" aria-label="章节记忆模式">
                        <button
                            type="button"
                            className={`memory-workspace-tab${activeMode === 'synopsis' ? ' active' : ''}`}
                            onClick={onSwitchToSynopsis}
                            disabled={activeMode === 'synopsis' || !onSwitchToSynopsis}
                        >
                            单章概要
                        </button>
                        <button
                            type="button"
                            className={`memory-workspace-tab${activeMode === 'memory' ? ' active' : ''}`}
                            onClick={onSwitchToMemory}
                            disabled={activeMode === 'memory' || !onSwitchToMemory}
                        >
                            多章记忆
                        </button>
                    </div>
                )}
                <button className="memory-workspace-close" onClick={onClose} aria-label="关闭">
                    <X size={16} />
                </button>
                {onSave && (
                    <button className="btn btn-primary btn-sm memory-header-save" onClick={onSave} disabled={saving || saveDisabled}>
                        {saving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                        {saving ? '保存中...' : saveLabel}
                    </button>
                )}
            </div>
        </div>
    );
}

function StructuredMemorySections({ data, mode = 'memory' }) {
    const sections = mode === 'synopsis'
        ? [
            { title: '关键情节', items: data?.beats?.length ? data.beats : (data?.events || []) },
            { title: '续写注意', items: data?.continuityNotes?.length ? data.continuityNotes : (data?.entityDeltas || []) },
            { title: '待回收信息', items: data?.openThreads?.length ? data.openThreads : (data?.foreshadowing || []) },
        ]
        : [
            { title: '关键事件', items: data?.events || data?.beats || [] },
            { title: '人物变化', items: data?.entityDeltas || data?.continuityNotes || [] },
            { title: '伏笔与未回收问题', items: data?.foreshadowing || data?.openThreads || [] },
        ];

    return (
        <div className="memory-structured-grid">
            {sections.map(section => (
                <section key={section.title} className="memory-structured-section">
                    <div className="memory-structured-title">
                        <span />
                        {section.title}
                    </div>
                    {section.items.length > 0 ? (
                        <ul>
                            {section.items.slice(0, 4).map((item, index) => (
                                <li key={`${section.title}-${index}`}>{item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p>暂无结构化条目</p>
                    )}
                </section>
            ))}
        </div>
    );
}

function ChapterSynopsisModal({
    chapter,
    synopsisDraft,
    synopsisLocked,
    synopsisData,
    synopsisGenerating,
    synopsisSaving,
    synopsisError,
    onDraftChange,
    onSynopsisPatch,
    onLockedChange,
    onGenerate,
    onClear,
    onSave,
    onClose,
}) {
    const structuredText = buildChapterSynopsisText(synopsisData);
    const structuredCount = (
        (synopsisData.beats?.length || 0) +
        (synopsisData.events?.length || 0) +
        (synopsisData.continuityNotes?.length || 0) +
        (synopsisData.openThreads?.length || 0) +
        (synopsisData.entityDeltas?.length || 0) +
        (synopsisData.foreshadowing?.length || 0) +
        (synopsisData.timelineRefs?.length || 0)
    );
    const plainText = stripChapterHtml(chapter?.content || '');
    const chapterTokens = estimateTokens(plainText);
    const synopsisTokens = estimateTokens(structuredText || synopsisDraft);
    const hasAdvancedDetails = structuredCount > 0 || !!synopsisData.endingState;

    return createPortal(
        <div className="modal-overlay" onMouseDown={e => { e.currentTarget._mouseDownTarget = e.target; }} onClick={e => { if (e.currentTarget._mouseDownTarget === e.currentTarget) onClose(); }}>
            <div className="modal chapter-memory-workspace chapter-synopsis-workspace" onClick={e => e.stopPropagation()}>
                <MemoryWorkspaceHeader
                    activeMode="synopsis"
                    title="章节概要"
                    subtitle="把当前章节整理成稳定、可复用的前文摘要"
                    icon={<FileText size={22} />}
                    showTabs={false}
                    onClose={onClose}
                    onSave={onSave}
                    saving={synopsisSaving}
                    saveDisabled={synopsisGenerating}
                />

                <div className="synopsis-workspace-grid">
                    <aside className="synopsis-meta-panel">
                        <div className="synopsis-chapter-badge">
                            <FileText size={17} />
                            <span>当前章节</span>
                        </div>
                        <h3 title={chapter?.title || ''}>{chapter?.title || '未命名章节'}</h3>
                        <div className="synopsis-meta-list">
                            <div>
                                <span>正文估算</span>
                                <strong>{formatMemoryTokens(chapterTokens)}</strong>
                            </div>
                            <div>
                                <span>概要估算</span>
                                <strong>{formatMemoryTokens(synopsisTokens)}</strong>
                            </div>
                            <div>
                                <span>概要状态</span>
                                <strong>{hasChapterSynopsis(synopsisData) || synopsisDraft.trim() ? '已填写' : '未填写'}</strong>
                            </div>
                            {hasAdvancedDetails && (
                                <div>
                                    <span>细节提取</span>
                                    <strong>{structuredCount + (synopsisData.endingState ? 1 : 0)} 项</strong>
                                </div>
                            )}
                        </div>
                        <label className="synopsis-lock-row">
                            <input
                                type="checkbox"
                                checked={synopsisLocked}
                                onChange={e => onLockedChange(e.target.checked)}
                            />
                            <span>
                                <strong>锁定概要</strong>
                                <em>避免被 AI 生成覆盖</em>
                            </span>
                        </label>
                    </aside>

                    <section className="memory-editor-panel">
                        <div className="memory-panel-head">
                            <div>
                                <div className="memory-panel-title">概要正文</div>
                                <div className="memory-panel-subtitle">记录本章进展、冲突、信息增量和收束位置</div>
                            </div>
                            <span className="memory-token-pill">{formatMemoryTokens(synopsisTokens)}</span>
                        </div>
                        <textarea
                            className="memory-main-textarea synopsis-main-textarea"
                            value={synopsisDraft}
                            onChange={e => onDraftChange(e.target.value)}
                            placeholder="写下这一章发生了什么、冲突如何推进、信息有什么变化，以及最后停在什么状态。"
                        />

                        <label className="synopsis-ending-field">
                            <span>结尾状态</span>
                            <input
                                value={synopsisData.endingState || ''}
                                onChange={e => onSynopsisPatch({ endingState: e.target.value })}
                                placeholder="例如：本章停在主角做出决定、冲突升级或新线索暴露的位置。"
                            />
                        </label>

                        {hasAdvancedDetails && (
                            <details className="chapter-synopsis-details synopsis-advanced-details">
                                <summary>概要细节 · {structuredCount + (synopsisData.endingState ? 1 : 0)} 项</summary>
                                <StructuredMemorySections data={synopsisData} mode="synopsis" />
                                {structuredText && (
                                    <details className="chapter-synopsis-details memory-raw-details">
                                        <summary>查看注入文本</summary>
                                        <pre>{structuredText}</pre>
                                    </details>
                                )}
                            </details>
                        )}

                        {synopsisError && <div className="chapter-synopsis-error">{synopsisError}</div>}
                    </section>
                </div>

                <div className="memory-workspace-footer">
                    <div className="memory-footer-status">
                        <CheckCircle2 size={15} />
                        <span>{synopsisDraft.trim() ? '概要会作为前文摘要参与续写上下文' : '生成或填写后可用于后续章节承接'}</span>
                    </div>
                    <div className="memory-footer-actions">
                        <button className="btn btn-ghost btn-sm" onClick={onClear} disabled={synopsisGenerating || synopsisSaving}>清空</button>
                        <button className="btn btn-secondary btn-sm" onClick={onGenerate} disabled={synopsisGenerating || synopsisSaving || synopsisLocked}>
                        {synopsisGenerating ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />}
                        {synopsisGenerating ? '生成中...' : 'AI 生成概要'}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={synopsisGenerating || synopsisSaving}>
                            {synopsisSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                            保存概要
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function ChapterMemoryGroupsModal({
    chapters,
    groups,
    generating,
    saving,
    error,
    draft,
    selectedChapterIds,
    selectedGroupIds,
    onDraftChange,
    onChapterToggle,
    onGroupSelectToggle,
    onGenerate,
    onMerge,
    onSave,
    onEdit,
    onDelete,
    onNew,
    onSwitchToSynopsis,
    onClose,
}) {
    const [chapterQuery, setChapterQuery] = useState('');
    const realChapters = chapters
        .map((chapter, index) => ({ chapter, index }))
        .filter(({ chapter }) => (chapter.type || 'chapter') !== 'volume')
        .map((entry, ordinalIndex) => ({ ...entry, ordinal: ordinalIndex + 1 }));
    const selectedGroupCount = selectedGroupIds.size;
    const query = chapterQuery.trim().toLowerCase();
    const filteredChapters = query
        ? realChapters.filter(({ chapter, ordinal }) => `${ordinal} ${chapter.title || ''}`.toLowerCase().includes(query))
        : realChapters;
    const draftTokens = estimateTokens(buildChapterMemoryGroupText(draft, chapters) || draft.summary || '');
    const selectedChapterCount = selectedChapterIds.size;

    return createPortal(
        <div className="modal-overlay" onMouseDown={e => { e.currentTarget._mouseDownTarget = e.target; }} onClick={e => { if (e.currentTarget._mouseDownTarget === e.currentTarget) onClose(); }}>
            <div className="modal chapter-memory-workspace" onClick={e => e.stopPropagation()}>
                <MemoryWorkspaceHeader
                    activeMode="memory"
                    subtitle="用于续写承接与长期剧情压缩"
                    onSwitchToSynopsis={onSwitchToSynopsis}
                    onClose={onClose}
                    onSave={onSave}
                    saving={saving}
                    saveDisabled={generating}
                    saveLabel="保存"
                />

                <div className="chapter-memory-studio-grid">
                    <aside className="memory-left-rail">
                        <div className="memory-rail-title">
                            <Layers3 size={15} />
                            <span>选择章节</span>
                        </div>
                        <label className="memory-search-box">
                            <Search size={15} />
                            <input
                                value={chapterQuery}
                                onChange={e => setChapterQuery(e.target.value)}
                                placeholder="搜索章节"
                            />
                        </label>
                        <div className="memory-chapter-progress">
                            <span>已选择 {selectedChapterCount} / {realChapters.length} 章</span>
                            {selectedChapterCount > 0 && <strong>{formatMemoryTokens(draftTokens)}</strong>}
                        </div>

                        <div className="memory-chapter-list">
                            {filteredChapters.length === 0 ? (
                                <div className="memory-empty-state">没有匹配的章节。</div>
                            ) : filteredChapters.map(({ chapter, ordinal }) => {
                                const selected = selectedChapterIds.has(chapter.id);
                                return (
                                    <label key={chapter.id} className={`memory-chapter-row${selected ? ' selected' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => onChapterToggle(chapter.id)}
                                        />
                                        <span className="memory-row-index">{String(ordinal).padStart(2, '0')}</span>
                                        <span className="memory-row-main">
                                            <strong title={chapter.title}>{chapter.title || '未命名章节'}</strong>
                                            <em>{hasChapterSynopsis(chapter) ? '可用概要压缩' : '使用正文首尾线索'}</em>
                                        </span>
                                        {hasChapterSynopsis(chapter) && <span className="memory-status-chip">已有概要</span>}
                                    </label>
                                );
                            })}
                        </div>
                    </aside>

                    <section className="memory-editor-panel memory-center-rail">
                        <div className="memory-panel-head">
                            <div>
                                <div className="memory-panel-title">记忆正文</div>
                                <div className="memory-panel-subtitle">高保真记录事件、人物变化、伏笔与未回收问题</div>
                            </div>
                            <span className="memory-token-pill">{formatMemoryTokens(draftTokens)}</span>
                        </div>
                        <input
                            className="memory-group-name-input"
                            value={draft.name}
                            onChange={e => onDraftChange({ name: e.target.value })}
                            placeholder="记忆组名，例如：学院篇前半 / 反派伏笔线"
                        />
                        <textarea
                            className="memory-main-textarea memory-group-textarea"
                            value={draft.summary}
                            onChange={e => onDraftChange({ summary: e.target.value, source: draft.source === 'ai' ? 'ai' : 'manual' })}
                            placeholder="可手写，也可选择章节后点击 AI 生成。"
                        />

                        <StructuredMemorySections data={draft} />

                        {error && <div className="chapter-synopsis-error">{error}</div>}
                    </section>

                    <aside className="memory-right-rail">
                        <div className="memory-rail-title">
                            <BookMarked size={15} />
                            <span>已保存的记忆组</span>
                            <em>{groups.length}</em>
                        </div>

                        <div className="memory-saved-list">
                            {groups.length === 0 ? (
                                <div className="memory-empty-state">还没有自定义多章节概要组。</div>
                            ) : groups.map(group => {
                                const selected = selectedGroupIds.has(group.id);
                                return (
                                    <div key={group.id} className={`memory-group-row${selected ? ' selected' : ''}`}>
                                        <label className="memory-group-select">
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() => onGroupSelectToggle(group.id)}
                                            />
                                            <span className="memory-group-folder"><BookMarked size={15} /></span>
                                            <span className="memory-group-row-main">
                                                <strong>{group.name || '未命名记忆组'}</strong>
                                                <em>{group.chapterIds.length} 章 · {formatMemoryTokens(estimateTokens(buildChapterMemoryGroupText(group, chapters)))}</em>
                                            </span>
                                        </label>
                                        <p>{group.summary || '暂无概要正文'}</p>
                                        <div className="memory-group-row-actions">
                                            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(group)} disabled={generating || saving}>编辑</button>
                                            <button className="btn btn-ghost btn-sm danger" onClick={() => onDelete(group.id)} disabled={generating || saving}>删除</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <button className="memory-merge-button" onClick={onMerge} disabled={generating || saving || selectedGroupCount < 2}>
                            {generating ? <RefreshCw size={15} className="spin" /> : <GitMerge size={15} />}
                            合并所选 {selectedGroupCount > 0 ? `(${selectedGroupCount})` : ''}
                        </button>
                    </aside>
                </div>

                <div className="memory-workspace-footer">
                    <div className="memory-footer-status">
                        <CheckCircle2 size={15} />
                        <span>{selectedChapterCount > 0 ? `已覆盖 ${selectedChapterCount} 章 · 可作为前文概要注入 AI` : '选择章节后生成或保存多章记忆'}</span>
                    </div>
                    <div className="memory-footer-actions">
                        <button className="btn btn-ghost btn-sm" onClick={onNew} disabled={generating || saving}>新建草稿</button>
                        <button className="btn btn-secondary btn-sm" onClick={onGenerate} disabled={generating || saving || selectedChapterIds.size === 0}>
                            {generating ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />}
                            {generating ? '生成中...' : 'AI 生成'}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={generating || saving}>
                            {saving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                            保存组
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function formatSynopsisTime(value) {
    if (!value) return '未保存';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未保存';
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getSynopsisSourceLabel(synopsis) {
    if (synopsis?.source === 'ai') return 'AI生成';
    if (synopsis?.source === 'manual') return '手写';
    return '未标记';
}

function ChapterSynopsisOverviewModal({
    chapters,
    activeChapterId,
    activeWorkId,
    initialView = 'saved',
    initialChapterId,
    memoryGroups,
    onToggleLock,
    onChapterUpdated,
    onMemoryGroupsSaved,
    onCopyAll,
    onApplyContext,
    showToast,
    onClose,
}) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [activeView, setActiveView] = useState(initialView);
    const [multiSelectedIds, setMultiSelectedIds] = useState(() => new Set());
    const [groupSelectedIds, setGroupSelectedIds] = useState(() => new Set());
    const [selectedGroupId, setSelectedGroupId] = useState(memoryGroups[0]?.id || '');
    const [singleDraft, setSingleDraft] = useState('');
    const [singleEnding, setSingleEnding] = useState('');
    const [singleLocked, setSingleLocked] = useState(false);
    const [singleData, setSingleData] = useState(() => normalizeChapterSynopsis());
    const [singleBusy, setSingleBusy] = useState(false);
    const [singleError, setSingleError] = useState('');
    const [multiName, setMultiName] = useState('');
    const [multiDraft, setMultiDraft] = useState('');
    const [multiData, setMultiData] = useState(() => normalizeChapterMemoryGroup({ name: '' }));
    const [multiBusy, setMultiBusy] = useState(false);
    const [multiError, setMultiError] = useState('');
    const [groupDraft, setGroupDraft] = useState(() => normalizeChapterMemoryGroup({ name: '' }));
    const [groupBusy, setGroupBusy] = useState(false);
    const [groupError, setGroupError] = useState('');
    const realChapters = [];
    let ordinal = 0;
    let currentVolume = '未分卷';
    chapters.forEach((chapter) => {
        if (chapter.type === 'volume') {
            currentVolume = chapter.title || '未命名分卷';
            return;
        }
        const synopsis = getChapterSynopsis(chapter);
        const hasSynopsis = hasChapterSynopsis(synopsis);
        realChapters.push({
            chapter,
            synopsis,
            hasSynopsis,
            ordinal: ++ordinal,
            volumeTitle: currentVolume,
            textTokens: estimateTokens(stripChapterHtml(chapter.content || '')),
            synopsisText: buildChapterSynopsisText(synopsis),
        });
    });

    const savedCount = realChapters.filter(entry => entry.hasSynopsis).length;
    const missingCount = Math.max(0, realChapters.length - savedCount);
    const lockedCount = realChapters.filter(entry => entry.synopsis.locked).length;
    const aiCount = realChapters.filter(entry => entry.hasSynopsis && entry.synopsis.source === 'ai').length;
    const manualCount = realChapters.filter(entry => entry.hasSynopsis && entry.synopsis.source !== 'ai').length;
    const coverage = realChapters.length ? Math.round((savedCount / realChapters.length) * 100) : 0;

    const normalizedQuery = query.trim().toLowerCase();
    const filteredEntries = realChapters.filter(entry => {
        if (filter === 'missing' && entry.hasSynopsis) return false;
        if (filter === 'locked' && !entry.synopsis.locked) return false;
        if (filter === 'ai' && (!entry.hasSynopsis || entry.synopsis.source !== 'ai')) return false;
        if (filter === 'manual' && (!entry.hasSynopsis || entry.synopsis.source === 'ai')) return false;
        if (!normalizedQuery) return true;
        const haystack = [
            entry.ordinal,
            entry.chapter.title,
            entry.volumeTitle,
            entry.synopsis.summary,
            entry.synopsis.endingState,
            entry.synopsisText,
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
    });

    const defaultSelectedId =
        initialChapterId ||
        activeChapterId ||
        realChapters.find(entry => entry.hasSynopsis)?.chapter.id ||
        realChapters[0]?.chapter.id ||
        '';
    const [selectedId, setSelectedId] = useState(defaultSelectedId);
    const selectedEntry =
        realChapters.find(entry => entry.chapter.id === selectedId) ||
        filteredEntries[0] ||
        realChapters[0] ||
        null;
    const selectedGroup =
        memoryGroups.find(group => group.id === selectedGroupId) ||
        memoryGroups[0] ||
        null;
    const selectedMultiEntries = realChapters.filter(entry => multiSelectedIds.has(entry.chapter.id));

    useEffect(() => {
        if (!selectedEntry) return;
        const synopsis = getChapterSynopsis(selectedEntry.chapter);
        setSingleDraft(synopsis.summary || '');
        setSingleEnding(synopsis.endingState || '');
        setSingleLocked(!!synopsis.locked);
        setSingleData(synopsis);
        setSingleError('');
    }, [selectedEntry?.chapter.id, selectedEntry?.synopsis.updatedAt, selectedEntry?.synopsis.generatedAt]);

    useEffect(() => {
        if (!selectedGroup) {
            setGroupDraft(normalizeChapterMemoryGroup({ name: '' }));
            return;
        }
        setGroupDraft(normalizeChapterMemoryGroup(selectedGroup));
    }, [selectedGroup?.id, selectedGroup?.updatedAt]);

    const toggleMultiChapter = (chapterId) => {
        setMultiSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(chapterId)) next.delete(chapterId);
            else next.add(chapterId);
            return next;
        });
    };

    const toggleGroupSelection = (groupId) => {
        setGroupSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const handleClearSingle = () => {
        setSingleDraft('');
        setSingleEnding('');
        setSingleData(normalizeChapterSynopsis({ locked: singleLocked }));
        setSingleError('');
    };

    const handleSaveSingle = async () => {
        if (!selectedEntry) return;
        setSingleBusy(true);
        setSingleError('');
        try {
            const payload = normalizeChapterSynopsis({
                ...singleData,
                summary: singleDraft.trim(),
                endingState: singleEnding.trim(),
                locked: singleLocked,
                source: singleData.source || 'manual',
                updatedAt: new Date().toISOString(),
            });
            const updated = await updateChapter(selectedEntry.chapter.id, { synopsis: payload }, activeWorkId);
            if (updated) onChapterUpdated?.(selectedEntry.chapter.id, { synopsis: payload });
            setSingleData(payload);
            showToast?.('章节概要已保存', 'success');
        } catch (err) {
            setSingleError(err?.message || '保存失败');
        } finally {
            setSingleBusy(false);
        }
    };

    const handleGenerateSingle = async () => {
        if (!selectedEntry) return;
        if (singleLocked) {
            showToast?.('当前概要已锁定，取消锁定后再生成', 'info');
            return;
        }
        const plainText = stripChapterHtml(selectedEntry.chapter.content || '');
        if (plainText.length < 20) {
            setSingleError('正文太短，暂时无法生成有效概要');
            return;
        }
        setSingleBusy(true);
        setSingleError('');
        try {
            const { apiConfig } = getProjectSettings();
            const { systemPrompt, userPrompt } = buildSynopsisPrompts(selectedEntry.chapter);
            const response = await fetch(resolveAiEndpoint(apiConfig), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    userPrompt,
                    apiConfig,
                    ...(apiConfig?.useAdvancedParams && apiConfig?.enableMaxOutputTokens ? {
                        maxTokens: apiConfig.maxOutputTokens || 65536,
                    } : {}),
                    temperature: 0.2,
                    topP: 0.9,
                }),
            });
            const aiText = await readAiTextStream(response);
            const generated = parseGeneratedSynopsis(aiText);
            if (!hasChapterSynopsis(generated)) throw new Error('AI 没有返回可用概要');
            const now = new Date().toISOString();
            const nextSynopsis = normalizeChapterSynopsis({
                ...generated,
                locked: false,
                source: 'ai',
                generatedAt: now,
                updatedAt: now,
            });
            setSingleData(nextSynopsis);
            setSingleDraft(nextSynopsis.summary || aiText);
            setSingleEnding(nextSynopsis.endingState || '');
            setSingleLocked(false);
            showToast?.('概要已生成，请确认后保存', 'success');
        } catch (err) {
            setSingleError(err?.message || '生成失败，请检查 API 配置');
        } finally {
            setSingleBusy(false);
        }
    };

    const handleGenerateMulti = async () => {
        if (selectedMultiEntries.length === 0) {
            setMultiError('请先选择至少一个章节');
            return;
        }
        setMultiBusy(true);
        setMultiError('');
        try {
            const { apiConfig } = getProjectSettings();
            const name = multiName.trim() || `${selectedMultiEntries[0].chapter.title} 等 ${selectedMultiEntries.length} 章`;
            const { systemPrompt, userPrompt } = buildMemoryGroupPrompts({
                name,
                chapters: selectedMultiEntries.map(entry => ({
                    chapter: entry.chapter,
                    ordinal: entry.ordinal,
                })),
            });
            const response = await fetch(resolveAiEndpoint(apiConfig), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    userPrompt,
                    apiConfig,
                    ...(apiConfig?.useAdvancedParams && apiConfig?.enableMaxOutputTokens ? {
                        maxTokens: apiConfig.maxOutputTokens || 65536,
                    } : {}),
                    temperature: 0.2,
                    topP: 0.9,
                }),
            });
            const aiText = await readAiTextStream(response);
            const generated = parseGeneratedSynopsis(aiText);
            if (!hasChapterSynopsis(generated)) throw new Error('AI 没有返回可用多章节概要');
            const now = new Date().toISOString();
            const nextGroup = normalizeChapterMemoryGroup({
                ...generated,
                name,
                chapterIds: selectedMultiEntries.map(entry => entry.chapter.id),
                sourceType: 'custom',
                source: 'ai',
                generatedAt: now,
                updatedAt: now,
            });
            setMultiName(name);
            setMultiData(nextGroup);
            setMultiDraft(nextGroup.summary || aiText);
            showToast?.('多章节概要已生成，请确认后保存为分组', 'success');
        } catch (err) {
            setMultiError(err?.message || '生成失败，请检查 API 配置');
        } finally {
            setMultiBusy(false);
        }
    };

    const handleSaveMulti = async () => {
        if (selectedMultiEntries.length === 0) {
            setMultiError('请先选择至少一个章节');
            return;
        }
        if (!multiDraft.trim()) {
            setMultiError('请填写概要正文，或先用 AI 生成');
            return;
        }
        setMultiBusy(true);
        setMultiError('');
        try {
            const payload = normalizeChapterMemoryGroup({
                ...multiData,
                name: multiName.trim() || `${selectedMultiEntries[0].chapter.title} 等 ${selectedMultiEntries.length} 章`,
                summary: multiDraft.trim(),
                chapterIds: selectedMultiEntries.map(entry => entry.chapter.id),
                source: multiData.source || 'manual',
                updatedAt: new Date().toISOString(),
            });
            if (!hasChapterMemoryGroup(payload)) {
                setMultiError('请填写概要正文，或先用 AI 生成');
                return;
            }
            const nextGroups = memoryGroups.some(group => group.id === payload.id)
                ? memoryGroups.map(group => group.id === payload.id ? payload : group)
                : [...memoryGroups, payload];
            await onMemoryGroupsSaved?.(nextGroups);
            setSelectedGroupId(payload.id);
            setGroupSelectedIds(new Set([payload.id]));
            setActiveView('groups');
            showToast?.('多章概要组已保存', 'success');
        } catch (err) {
            setMultiError(err?.message || '保存失败');
        } finally {
            setMultiBusy(false);
        }
    };

    const handleSaveGroupDraft = async () => {
        if (!groupDraft?.id) return;
        const payload = normalizeChapterMemoryGroup({
            ...groupDraft,
            updatedAt: new Date().toISOString(),
        });
        if (!payload.name.trim()) {
            setGroupError('请填写组名');
            return;
        }
        if (!hasChapterMemoryGroup(payload)) {
            setGroupError('请填写概要正文');
            return;
        }
        setGroupBusy(true);
        setGroupError('');
        try {
            const nextGroups = memoryGroups.map(group => group.id === payload.id ? payload : group);
            await onMemoryGroupsSaved?.(nextGroups);
            showToast?.('概要分组已保存', 'success');
        } catch (err) {
            setGroupError(err?.message || '保存失败');
        } finally {
            setGroupBusy(false);
        }
    };

    const handleDeleteGroupDraft = async () => {
        if (!groupDraft?.id) return;
        setGroupBusy(true);
        setGroupError('');
        try {
            const nextGroups = memoryGroups.filter(group => group.id !== groupDraft.id);
            await onMemoryGroupsSaved?.(nextGroups);
            setGroupSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(groupDraft.id);
                return next;
            });
            setSelectedGroupId(nextGroups[0]?.id || '');
            showToast?.('概要分组已删除', 'success');
        } catch (err) {
            setGroupError(err?.message || '删除失败');
        } finally {
            setGroupBusy(false);
        }
    };

    const handleMergeGroups = async () => {
        const selectedGroups = memoryGroups.filter(group => groupSelectedIds.has(group.id));
        if (selectedGroups.length < 2) {
            setGroupError('请至少选择两个概要组');
            return;
        }
        setGroupBusy(true);
        setGroupError('');
        try {
            const { apiConfig } = getProjectSettings();
            const unionChapterIds = Array.from(new Set(selectedGroups.flatMap(group => group.chapterIds)));
            const name = `合并概要：${selectedGroups.map(group => group.name || '未命名概要组').slice(0, 2).join(' + ')}${selectedGroups.length > 2 ? ' 等' : ''}`;
            const { systemPrompt, userPrompt } = buildMemoryMergePrompts({
                name,
                groups: selectedGroups,
                chapters,
            });
            const response = await fetch(resolveAiEndpoint(apiConfig), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    userPrompt,
                    apiConfig,
                    ...(apiConfig?.useAdvancedParams && apiConfig?.enableMaxOutputTokens ? {
                        maxTokens: apiConfig.maxOutputTokens || 65536,
                    } : {}),
                    temperature: 0.2,
                    topP: 0.9,
                }),
            });
            const aiText = await readAiTextStream(response);
            const generated = parseGeneratedSynopsis(aiText);
            if (!hasChapterSynopsis(generated)) throw new Error('AI 没有返回可用合并概要');
            const now = new Date().toISOString();
            const mergedDraft = normalizeChapterMemoryGroup({
                ...generated,
                name,
                chapterIds: unionChapterIds,
                sourceGroupIds: selectedGroups.map(group => group.id),
                sourceType: 'merged',
                source: 'ai',
                generatedAt: now,
                updatedAt: now,
            });
            setMultiData(mergedDraft);
            setMultiName(name);
            setMultiDraft(mergedDraft.summary || aiText);
            setMultiSelectedIds(new Set(unionChapterIds));
            setActiveView('multi');
            showToast?.('合并概要已生成，请确认后保存', 'success');
        } catch (err) {
            setGroupError(err?.message || '合并失败，请检查 API 配置');
        } finally {
            setGroupBusy(false);
        }
    };

    const filterItems = [
        { key: 'all', label: '全部', count: realChapters.length },
        { key: 'missing', label: '缺概要', count: missingCount },
        { key: 'locked', label: '已锁定', count: lockedCount },
        { key: 'ai', label: 'AI生成', count: aiCount },
        { key: 'manual', label: '手写', count: manualCount },
    ];

    const rows = [];
    let lastVolume = '';
    filteredEntries.forEach(entry => {
        if (entry.volumeTitle !== lastVolume) {
            rows.push({ type: 'volume', id: `volume-${entry.volumeTitle}-${entry.ordinal}`, title: entry.volumeTitle });
            lastVolume = entry.volumeTitle;
        }
        rows.push({ type: 'chapter', id: entry.chapter.id, entry });
    });

    return createPortal(
        <div className="modal-overlay" onMouseDown={e => { e.currentTarget._mouseDownTarget = e.target; }} onClick={e => { if (e.currentTarget._mouseDownTarget === e.currentTarget) onClose(); }}>
            <div className="modal chapter-memory-workspace synopsis-overview-workspace" onClick={e => e.stopPropagation()}>
                <MemoryWorkspaceHeader
                    title="章节概要中心"
                    subtitle="总览已保存概要、缺失章节、锁定状态与多章分组入口"
                    icon={<BookMarked size={22} />}
                    showTabs={false}
                    onClose={onClose}
                />

                <div className="synopsis-overview-tabs" aria-label="概要中心视图">
                    <button type="button" className={activeView === 'single' ? 'active' : ''} onClick={() => setActiveView('single')}>单章概要</button>
                    <button type="button" className={activeView === 'multi' ? 'active' : ''} onClick={() => setActiveView('multi')}>多章概要</button>
                    <button type="button" className={activeView === 'groups' ? 'active' : ''} onClick={() => setActiveView('groups')}>概要分组</button>
                    <button type="button" className={activeView === 'saved' ? 'active' : ''} onClick={() => setActiveView('saved')}>已保存</button>
                </div>

                <div className="synopsis-overview-grid">
                    <aside className="synopsis-overview-filter">
                        <div className="synopsis-coverage-card">
                            <div>
                                <span>概要覆盖</span>
                                <strong>{savedCount}/{realChapters.length} 章</strong>
                            </div>
                            <div className="synopsis-progress-bar">
                                <span style={{ width: `${coverage}%` }} />
                            </div>
                            <em>{coverage}% 已完成 · {missingCount} 章缺失</em>
                        </div>

                        <label className="memory-search-box synopsis-overview-search">
                            <Search size={15} />
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="搜索章节或概要"
                            />
                        </label>

                        <div className="synopsis-filter-list">
                            {filterItems.map(item => (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={filter === item.key ? 'active' : ''}
                                    onClick={() => setFilter(item.key)}
                                >
                                    <span>{item.label}</span>
                                    <strong>{item.count}</strong>
                                </button>
                            ))}
                        </div>

                        <div className="synopsis-group-summary">
                            <div className="memory-rail-title">
                                <BookMarked size={15} />
                                <span>概要分组</span>
                                <em>{memoryGroups.length}</em>
                            </div>
                            <p>{memoryGroups.length ? `已有 ${memoryGroups.length} 个多章概要组，可在“概要分组”中编辑、合并或注入上下文。` : '还没有多章概要组。可先选择章节生成多章概要。'}</p>
                            <button className="btn btn-secondary btn-sm" onClick={() => setActiveView('groups')}>
                                <Layers3 size={14} />
                                查看分组
                            </button>
                        </div>
                    </aside>

                    <section className="synopsis-saved-list-panel">
                        <div className="synopsis-list-head">
                            <div>
                                <h3>{activeView === 'multi' ? '选择章节生成多章概要' : activeView === 'groups' ? '概要分组' : activeView === 'single' ? '单章概要' : '已保存概要'}</h3>
                                <p>{activeView === 'multi' ? '可任选章节组成一组，保存为多章概要' : activeView === 'groups' ? '查看已保存的多章概要组，可在右侧编辑或合并' : '按分卷浏览章节概要，缺失章节也会显示出来'}</p>
                            </div>
                            <span>{activeView === 'groups' ? memoryGroups.length : filteredEntries.length} 项</span>
                        </div>

                        <div className="synopsis-saved-list">
                            {activeView === 'groups' ? (
                                memoryGroups.length === 0 ? (
                                    <div className="memory-empty-state">还没有概要分组。切到“多章概要”选择章节后创建。</div>
                                ) : memoryGroups.map(group => {
                                    const selected = selectedGroup?.id === group.id;
                                    return (
                                        <div
                                            key={group.id}
                                            className={`synopsis-row synopsis-group-overview-row${selected ? ' selected' : ''}`}
                                            onClick={() => setSelectedGroupId(group.id)}
                                        >
                                            <label className="synopsis-row-index" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={groupSelectedIds.has(group.id)}
                                                    onChange={() => toggleGroupSelection(group.id)}
                                                />
                                            </label>
                                            <span className="synopsis-row-main">
                                                <strong>{group.name || '未命名概要组'}</strong>
                                                <em>{group.summary || '暂无概要正文'}</em>
                                            </span>
                                            <span className="synopsis-row-badge saved">{group.chapterIds?.length || 0} 章</span>
                                            <span className="synopsis-row-source">{getSynopsisSourceLabel(group)}</span>
                                            <span className="synopsis-row-time">{formatSynopsisTime(group.updatedAt || group.generatedAt)}</span>
                                            <div className="synopsis-row-actions" onClick={e => e.stopPropagation()}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedGroupId(group.id)}>编辑</button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => toggleGroupSelection(group.id)}>选择合并</button>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : rows.length === 0 ? (
                                <div className="memory-empty-state">没有匹配的概要。</div>
                            ) : rows.map(row => {
                                if (row.type === 'volume') {
                                    return <div key={row.id} className="synopsis-volume-row">{row.title}</div>;
                                }
                                const { entry } = row;
                                const selected = selectedEntry?.chapter.id === entry.chapter.id;
                                const synopsisPreview = entry.hasSynopsis
                                    ? (entry.synopsis.summary || entry.synopsisText || '已有概要')
                                    : '尚未生成章节概要。';
                                return (
                                    <div
                                        key={entry.chapter.id}
                                        className={`synopsis-row${selected ? ' selected' : ''}${entry.hasSynopsis ? '' : ' missing'}`}
                                        onClick={() => {
                                            setSelectedId(entry.chapter.id);
                                            if (activeView === 'multi') toggleMultiChapter(entry.chapter.id);
                                        }}
                                    >
                                        <span className="synopsis-row-index">
                                            {activeView === 'multi' ? (
                                                <input
                                                    type="checkbox"
                                                    checked={multiSelectedIds.has(entry.chapter.id)}
                                                    onChange={() => toggleMultiChapter(entry.chapter.id)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            ) : String(entry.ordinal).padStart(2, '0')}
                                        </span>
                                        <span className="synopsis-row-main">
                                            <strong>{entry.chapter.title || '未命名章节'}</strong>
                                            <em>{activeView === 'multi' ? (entry.hasSynopsis ? '可使用单章概要压缩' : '缺概要，将使用正文首尾线索') : synopsisPreview}</em>
                                        </span>
                                        <span className={`synopsis-row-badge${entry.hasSynopsis ? ' saved' : ' missing'}`}>
                                            {entry.hasSynopsis ? '已概要' : '缺概要'}
                                        </span>
                                        {entry.synopsis.locked && <span className="synopsis-row-badge locked">锁定</span>}
                                        {entry.hasSynopsis && <span className="synopsis-row-source">{getSynopsisSourceLabel(entry.synopsis)}</span>}
                                        <span className="synopsis-row-time">{formatSynopsisTime(entry.synopsis.updatedAt || entry.synopsis.generatedAt)}</span>
                                        <div className="synopsis-row-actions" onClick={e => e.stopPropagation()}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => {
                                                setSelectedId(entry.chapter.id);
                                                setActiveView('single');
                                            }}>
                                                {entry.hasSynopsis ? '编辑' : '生成'}
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => {
                                                setSelectedId(entry.chapter.id);
                                                setActiveView('single');
                                            }}>
                                                重新生成
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => onToggleLock(entry.chapter.id, !entry.synopsis.locked)}>
                                                {entry.synopsis.locked ? '解锁' : '锁定'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <aside className="synopsis-inspector">
                        {activeView === 'groups' ? (
                            selectedGroup ? (
                                <>
                                    <div className="synopsis-inspector-head">
                                        <span className="synopsis-row-badge saved">概要组</span>
                                        {groupSelectedIds.size > 0 && <span className="synopsis-row-badge locked">已选 {groupSelectedIds.size}</span>}
                                        <h3>{groupDraft.name || selectedGroup.name || '未命名概要组'}</h3>
                                        <p>{groupDraft.chapterIds?.length || 0} 章 · {formatMemoryTokens(estimateTokens(buildChapterMemoryGroupText(groupDraft, chapters)))}</p>
                                    </div>
                                    <input
                                        className="memory-group-name-input"
                                        value={groupDraft.name}
                                        onChange={e => setGroupDraft(prev => normalizeChapterMemoryGroup({ ...prev, name: e.target.value }))}
                                        placeholder="概要组名"
                                    />
                                    <textarea
                                        className="memory-main-textarea synopsis-center-textarea"
                                        value={groupDraft.summary}
                                        onChange={e => setGroupDraft(prev => normalizeChapterMemoryGroup({ ...prev, summary: e.target.value, source: prev.source === 'ai' ? 'ai' : 'manual' }))}
                                        placeholder="概要正文"
                                    />
                                    <StructuredMemorySections data={groupDraft} />
                                    {groupError && <div className="chapter-synopsis-error">{groupError}</div>}
                                    <div className="synopsis-inspector-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={handleMergeGroups} disabled={groupBusy || groupSelectedIds.size < 2}>
                                            {groupBusy ? <RefreshCw size={14} className="spin" /> : <GitMerge size={14} />}
                                            合并所选
                                        </button>
                                        <button className="btn btn-ghost btn-sm danger" onClick={handleDeleteGroupDraft} disabled={groupBusy}>
                                            删除
                                        </button>
                                        <button className="btn btn-primary btn-sm" onClick={handleSaveGroupDraft} disabled={groupBusy}>
                                            {groupBusy ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                                            保存
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="memory-empty-state">还没有概要分组。切到“多章概要”选择章节后创建。</div>
                            )
                        ) : activeView === 'multi' ? (
                            <>
                                <div className="synopsis-inspector-head">
                                    <span className="synopsis-row-badge saved">多章概要</span>
                                    <span className="synopsis-row-badge locked">已选 {selectedMultiEntries.length}</span>
                                    <h3>{multiName || '新建多章概要组'}</h3>
                                    <p>{selectedMultiEntries.length ? selectedMultiEntries.map(entry => entry.chapter.title || '未命名章节').slice(0, 3).join('、') : '从中间列表任选章节组成一组'}</p>
                                </div>
                                <input
                                    className="memory-group-name-input"
                                    value={multiName}
                                    onChange={e => {
                                        setMultiName(e.target.value);
                                        setMultiData(prev => normalizeChapterMemoryGroup({ ...prev, name: e.target.value }));
                                    }}
                                    placeholder="概要组名，例如：第一卷前五章 / 学院篇开端"
                                />
                                <textarea
                                    className="memory-main-textarea synopsis-center-textarea"
                                    value={multiDraft}
                                    onChange={e => {
                                        setMultiDraft(e.target.value);
                                        setMultiData(prev => normalizeChapterMemoryGroup({ ...prev, summary: e.target.value, source: prev.source === 'ai' ? 'ai' : 'manual' }));
                                    }}
                                    placeholder="可手写，也可选择章节后点击 AI 生成多章概要。"
                                />
                                <StructuredMemorySections data={multiData} />
                                {multiError && <div className="chapter-synopsis-error">{multiError}</div>}
                                <div className="synopsis-inspector-actions">
                                    <button className="btn btn-secondary btn-sm" onClick={handleGenerateMulti} disabled={multiBusy || selectedMultiEntries.length === 0}>
                                        {multiBusy ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />}
                                        AI 生成
                                    </button>
                                    <button className="btn btn-primary btn-sm" onClick={handleSaveMulti} disabled={multiBusy || selectedMultiEntries.length === 0}>
                                        {multiBusy ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                                        保存为分组
                                    </button>
                                </div>
                            </>
                        ) : selectedEntry ? (
                            activeView === 'single' ? (
                                <>
                                    <div className="synopsis-inspector-head">
                                        <span className={`synopsis-row-badge${selectedEntry.hasSynopsis ? ' saved' : ' missing'}`}>
                                            {selectedEntry.hasSynopsis ? '已保存' : '缺概要'}
                                        </span>
                                        {singleLocked && <span className="synopsis-row-badge locked">锁定</span>}
                                        <h3>{selectedEntry.chapter.title || '未命名章节'}</h3>
                                        <p>第 {selectedEntry.ordinal} 章 · {formatMemoryTokens(selectedEntry.textTokens)}</p>
                                    </div>
                                    <label className="synopsis-lock-row">
                                        <input
                                            type="checkbox"
                                            checked={singleLocked}
                                            onChange={e => setSingleLocked(e.target.checked)}
                                        />
                                        <span>
                                            <strong>锁定概要</strong>
                                            <em>避免被 AI 生成覆盖</em>
                                        </span>
                                    </label>
                                    <textarea
                                        className="memory-main-textarea synopsis-center-textarea"
                                        value={singleDraft}
                                        onChange={e => {
                                            const value = e.target.value;
                                            setSingleDraft(value);
                                            setSingleData(prev => normalizeChapterSynopsis({ ...prev, summary: value, source: prev.source === 'ai' ? 'ai' : 'manual' }));
                                        }}
                                        placeholder="写下这一章发生了什么、冲突如何推进、信息有什么变化，以及最后停在什么状态。"
                                    />
                                    <label className="synopsis-ending-field">
                                        <span>结尾状态</span>
                                        <input
                                            value={singleEnding}
                                            onChange={e => {
                                                const value = e.target.value;
                                                setSingleEnding(value);
                                                setSingleData(prev => normalizeChapterSynopsis({ ...prev, endingState: value, source: prev.source === 'ai' ? 'ai' : 'manual' }));
                                            }}
                                            placeholder="本章最后停留的画面、决定、冲突或情绪状态"
                                        />
                                    </label>
                                    <details className="chapter-synopsis-details synopsis-advanced-details">
                                        <summary>概要细节</summary>
                                        <StructuredMemorySections data={singleData} mode="synopsis" />
                                        {buildChapterSynopsisText(singleData) && (
                                            <details className="chapter-synopsis-details memory-raw-details">
                                                <summary>查看注入文本</summary>
                                                <pre>{buildChapterSynopsisText(singleData)}</pre>
                                            </details>
                                        )}
                                    </details>
                                    {singleError && <div className="chapter-synopsis-error">{singleError}</div>}
                                    <div className="synopsis-inspector-actions">
                                        <button className="btn btn-ghost btn-sm" onClick={handleClearSingle} disabled={singleBusy}>清空</button>
                                        <button className="btn btn-secondary btn-sm" onClick={handleGenerateSingle} disabled={singleBusy || singleLocked}>
                                            {singleBusy ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />}
                                            AI 生成
                                        </button>
                                        <button className="btn btn-primary btn-sm" onClick={handleSaveSingle} disabled={singleBusy}>
                                            {singleBusy ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                                            保存
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="synopsis-inspector-head">
                                        <span className={`synopsis-row-badge${selectedEntry.hasSynopsis ? ' saved' : ' missing'}`}>
                                            {selectedEntry.hasSynopsis ? '已保存' : '缺概要'}
                                        </span>
                                        {selectedEntry.synopsis.locked && <span className="synopsis-row-badge locked">锁定</span>}
                                        <h3>{selectedEntry.chapter.title || '未命名章节'}</h3>
                                        <p>第 {selectedEntry.ordinal} 章 · {formatMemoryTokens(selectedEntry.textTokens)}</p>
                                    </div>

                                    <div className="synopsis-inspector-block">
                                        <h4>概要正文</h4>
                                        <p>{selectedEntry.synopsis.summary || '还没有保存概要。'}</p>
                                    </div>
                                    <div className="synopsis-inspector-block">
                                        <h4>结尾状态</h4>
                                        <p>{selectedEntry.synopsis.endingState || '暂无结尾状态。'}</p>
                                    </div>
                                    <div className="synopsis-inspector-block">
                                        <h4>续写注意</h4>
                                        {selectedEntry.synopsis.continuityNotes.length ? (
                                            <ul>{selectedEntry.synopsis.continuityNotes.slice(0, 5).map((item, index) => <li key={index}>{item}</li>)}</ul>
                                        ) : (
                                            <p>暂无续写注意。</p>
                                        )}
                                    </div>
                                    <div className="synopsis-inspector-block">
                                        <h4>待回收信息</h4>
                                        {selectedEntry.synopsis.openThreads.length ? (
                                            <ul>{selectedEntry.synopsis.openThreads.slice(0, 5).map((item, index) => <li key={index}>{item}</li>)}</ul>
                                        ) : (
                                            <p>暂无待回收信息。</p>
                                        )}
                                    </div>
                                    <div className="synopsis-inspector-meta">
                                        <span>{getSynopsisSourceLabel(selectedEntry.synopsis)}</span>
                                        <span>{formatSynopsisTime(selectedEntry.synopsis.updatedAt || selectedEntry.synopsis.generatedAt)}</span>
                                        <span>{formatMemoryTokens(estimateTokens(selectedEntry.synopsisText || selectedEntry.synopsis.summary || ''))}</span>
                                    </div>
                                    <div className="synopsis-inspector-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => setActiveView('single')}>
                                            <FileText size={14} />
                                            {selectedEntry.hasSynopsis ? '编辑概要' : '生成概要'}
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => onToggleLock(selectedEntry.chapter.id, !selectedEntry.synopsis.locked)}>
                                            {selectedEntry.synopsis.locked ? '解锁' : '锁定'}
                                        </button>
                                    </div>
                                </>
                            )
                        ) : (
                            <div className="memory-empty-state">请选择一个章节。</div>
                        )}
                    </aside>
                </div>

                <div className="memory-workspace-footer synopsis-overview-footer">
                    <div className="memory-footer-status">
                        <CheckCircle2 size={15} />
                        <span>保存的单章概要会自动作为前文摘要参与续写上下文；多章分组可手动管理。</span>
                    </div>
                    <div className="memory-footer-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                            const firstMissing = realChapters.find(entry => !entry.hasSynopsis);
                            if (firstMissing) {
                                setSelectedId(firstMissing.chapter.id);
                                setActiveView('single');
                            }
                        }} disabled={missingCount === 0 || activeView === 'groups'}>
                            <Sparkles size={14} />
                            生成缺失概要
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => {
                            if (activeView !== 'multi') {
                                setActiveView('multi');
                                return;
                            }
                            handleGenerateMulti();
                        }} disabled={activeView === 'multi' && (multiBusy || multiSelectedIds.size === 0)}>
                            <Layers3 size={14} />
                            {activeView === 'multi' ? `AI 生成多章概要${multiSelectedIds.size ? ` (${multiSelectedIds.size})` : ''}` : '选择章节生成多章概要'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={onCopyAll}>
                            导出概要
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={onApplyContext}>
                            应用到上下文
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default function Sidebar({ onOpenHelp, onToggle, editorRef, pushMode }) {
    const {
        chapters, addChapter, setChapters, updateChapter: updateChapterStore,
        addVolume, toggleVolumeCollapsed, reorderChapters,
        activeChapterId, setActiveChapterId,
        activeWorkId, setActiveWorkId: setActiveWorkIdStore,
        sidebarOpen, setSidebarOpen,
        theme, setTheme,
        writingMode,
        setShowSettings,
        setShowSnapshots,
        setShowBookInfo,
        showToast,
        setOpenCategoryModal,
        settingsVersion,
    } = useAppStore();

    const [renameId, setRenameId] = useState(null);
    const [renameTitle, setRenameTitle] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showNavExportMenu, setShowNavExportMenu] = useState(false);
    const navExportRef = useRef(null);
    const [importModal, setImportModal] = useState(null);
    const [conflictModal, setConflictModal] = useState(null);
    const [showGitPopup, setShowGitPopup] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false); // "更多操作" 下拉菜单
    const [showSyncMenu, setShowSyncMenu] = useState(false); // 云同步下拉菜单
    const [showSyncConfirmModal, setShowSyncConfirmModal] = useState(false); // 从云端同步确认弹窗
    const moreMenuAnchorRef = useRef(null);
    const syncMenuAnchorRef = useRef(null);
    const [activeNavTab, setActiveNavTab] = useState('chapters'); // 'chapters' | 'character' | 'location' | 'world' | 'object' | 'plot' | 'rules'
    const [showCategoryPopover, setShowCategoryPopover] = useState(false);
    const categoryPopoverAnchorRef = useRef(null);
    const [pinnedCategories, setPinnedCategories] = useState(() => getPinnedCategories());
    const [navDragCat, setNavDragCat] = useState(null); // 拖拽中的分类
    const [navDragOverCat, setNavDragOverCat] = useState(null); // 拖拽悬停目标
    const [catCustomIcons, setCatCustomIcons] = useState({}); // category → customIconName
    const [catCustomLabels, setCatCustomLabels] = useState({}); // category → folder name
    const [outlineCollapsed, setOutlineCollapsed] = useState(false); // 手动折叠大纲
    const [headings, setHeadings] = useState([]); // 文档大纲标题列表
    const [headingStats, setHeadingStats] = useState([]); // 每个标题下的字数+token
    const [activeHeadingIndex, setActiveHeadingIndex] = useState(-1); // 当前高亮的大纲项
    const isClickScrollingRef = useRef(false); // 防 scrollspy 死循环互斥锁
    const [dragId, setDragId] = useState(null); // 拖拽中的 item id
    const [dragOverId, setDragOverId] = useState(null); // 拖拽悬停目标 id
    const [dragOverPos, setDragOverPos] = useState(null); // 'top' | 'bottom'
    const [activeVolumeId, setActiveVolumeId] = useState(null); // 当前选中的分卷
    const [synopsisModal, setSynopsisModal] = useState(null);
    const [synopsisDraft, setSynopsisDraft] = useState('');
    const [synopsisLocked, setSynopsisLocked] = useState(false);
    const [synopsisData, setSynopsisData] = useState(() => normalizeChapterSynopsis());
    const [synopsisGenerating, setSynopsisGenerating] = useState(false);
    const [synopsisSaving, setSynopsisSaving] = useState(false);
    const [synopsisError, setSynopsisError] = useState('');
    const [synopsisOverviewModal, setSynopsisOverviewModal] = useState(null);
    const [showMemoryGroupsModal, setShowMemoryGroupsModal] = useState(false);
    const [memoryGroups, setMemoryGroups] = useState([]);
    const [memoryDraft, setMemoryDraft] = useState(() => normalizeChapterMemoryGroup({ name: '' }));
    const [memorySelectedChapterIds, setMemorySelectedChapterIds] = useState(() => new Set());
    const [memorySelectedGroupIds, setMemorySelectedGroupIds] = useState(() => new Set());
    const [memoryGenerating, setMemoryGenerating] = useState(false);
    const [memorySaving, setMemorySaving] = useState(false);
    const [memoryError, setMemoryError] = useState('');
    const { t } = useI18n();

    const synopsisChapter = synopsisModal
        ? chapters.find(ch => ch.id === synopsisModal.chapterId && (ch.type || 'chapter') !== 'volume')
        : null;
    const activeSynopsisTarget = activeChapterId
        ? chapters.find(ch => ch.id === activeChapterId && (ch.type || 'chapter') !== 'volume')
        : null;

    useEffect(() => {
        const syncPinnedCategories = (event) => {
            setPinnedCategories(Array.isArray(event?.detail) ? event.detail : getPinnedCategories());
        };
        const handleStorage = (event) => {
            if (event.key === 'author-pinned-categories') syncPinnedCategories();
        };
        window.addEventListener('author-pinned-categories-changed', syncPinnedCategories);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('author-pinned-categories-changed', syncPinnedCategories);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    const reloadMemoryGroups = useCallback(async () => {
        const groups = await getChapterMemoryGroups(activeWorkId);
        setMemoryGroups(groups);
        return groups;
    }, [activeWorkId]);

    useEffect(() => {
        reloadMemoryGroups();
    }, [reloadMemoryGroups]);

    // ---- 云同步状态（侧栏图标指示） ----
    const [cloudAuthUser, setCloudAuthUser] = useState(null);
    const [cloudSyncStatus, setCloudSyncStatus] = useState(null);
    const [firebaseAvailable, setFirebaseAvailable] = useState(false);
    useEffect(() => {
        let unmounted = false;
        (async () => {
            try {
                const { isFirebaseConfigured } = await import('../lib/firebase');
                if (!isFirebaseConfigured || unmounted) return;
                setFirebaseAvailable(true);
                const { onAuthChange, initAuth } = await import('../lib/auth');
                const { onSyncStatusChange } = await import('../lib/firestore-sync');
                initAuth();
                onAuthChange(user => { if (!unmounted) setCloudAuthUser(user); });
                onSyncStatusChange(status => { if (!unmounted) setCloudSyncStatus(status); });
            } catch { /* Firebase 未配置 */ }
        })();
        return () => { unmounted = true; };
    }, []);

    // 加载分类自定义图标（当 settingsVersion 变化时刷新）
    useEffect(() => {
        (async () => {
            const workId = getActiveWorkId();
            if (!workId) return;
            const nodes = await getSettingsNodes(workId);
            const iconMap = {};
            const labelMap = {};
            nodes.forEach(n => {
                if (n.type === 'folder' && n.parentId === workId && n.icon) {
                    iconMap[n.category] = n.icon;
                }
                if (n.type === 'folder' && n.parentId === workId && n.name) {
                    labelMap[n.category] = n.name;
                }
            });
            setCatCustomIcons(iconMap);
            setCatCustomLabels(labelMap);
        })();
    }, [settingsVersion, activeWorkId, pinnedCategories]);

    // 切换主题 (light → eye → dark 循环)
    const toggleTheme = useCallback(() => {
        const order = ['light', 'eye', 'dark'];
        const idx = order.indexOf(theme);
        const next = order[(idx + 1) % order.length];
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('author-theme', next);
        import('../lib/persistence').then(m => m.persistSet('author-theme', next).catch(() => { }));
    }, [theme, setTheme]);
    const themeMeta = {
        light: {
            icon: <Sun size={18} />,
            text: t('sidebar.navThemeLight') || '亮色',
            label: '当前：亮色模式。点击切换到护眼模式',
        },
        eye: {
            icon: <Eye size={18} />,
            text: '护眼',
            label: '当前：护眼模式。点击切换到暗色模式',
        },
        dark: {
            icon: <Moon size={18} />,
            text: t('sidebar.navThemeDark') || '暗色',
            label: '当前：暗色模式。点击切换到亮色模式',
        },
    }[theme] || {
        icon: <Sun size={18} />,
        text: t('sidebar.navThemeLight') || '亮色',
        label: '切换主题',
    };

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
    // volumeId: 如果指定，只在该分卷内的章节中查找编号
    const makeUniqueChapterTitle = useCallback((baseTitle) => {
        const fallback = baseTitle || t('sidebar.defaultChapterTitle').replace('{num}', chapters.length + 1);
        const existing = new Set(chapters.map(ch => ch.title).filter(Boolean));
        if (!existing.has(fallback)) return fallback;
        const first = `${fallback}（新）`;
        if (!existing.has(first)) return first;
        let index = 2;
        while (existing.has(`${fallback}（新${index}）`)) index++;
        return `${fallback}（新${index}）`;
    }, [chapters, t]);

    const getNextChapterTitle = useCallback((volumeId) => {
        if (chapters.length === 0) return t('sidebar.defaultChapterTitle').replace('{num}', 1);

        // 如果指定了分卷，只在该分卷的子章节中查找
        if (volumeId) {
            const volIdx = chapters.findIndex(c => c.id === volumeId);
            if (volIdx !== -1) {
                // 找到该分卷下的所有子章节
                const volChapters = [];
                for (let i = volIdx + 1; i < chapters.length && (chapters[i].type || 'chapter') !== 'volume'; i++) {
                    volChapters.push(chapters[i]);
                }
                // 从该分卷的最后一章向前找
                for (let i = volChapters.length - 1; i >= 0; i--) {
                    if (volChapters[i].numberingIgnored) continue;
                    const next = tryNextTitle(volChapters[i].title);
                    if (next) return next;
                }
                // 该分卷内没有章节，从分卷在全局中的位置推断
            }
        }

        // 全局：从最后一章向前找，跳过"更新说明"等非标准章节
        for (let i = chapters.length - 1; i >= 0; i--) {
            if (chapters[i].type === 'volume' || chapters[i].numberingIgnored) continue;
            const next = tryNextTitle(chapters[i].title);
            if (next) return next;
        }
        const regularCount = chapters.filter(ch => (ch.type || 'chapter') !== 'volume' && !ch.numberingIgnored).length;
        return t('sidebar.defaultChapterTitle').replace('{num}', regularCount + 1);
    }, [chapters, t]);

    // 创建新章节 — 支持分卷内创建
    const handleCreateChapter = useCallback(async (volumeId) => {
        const targetVol = volumeId || activeVolumeId;
        const title = makeUniqueChapterTitle(getNextChapterTitle(targetVol));
        if (targetVol) {
            // 在分卷内创建
            const result = await insertChapterInVolume(title, targetVol, activeWorkId);
            setChapters(result.chapters);
            setActiveChapterId(result.chapter.id);
            setRenameId(result.chapter.id);
            setRenameTitle(title);
        } else {
            const ch = await createChapter(title, activeWorkId);
            addChapter(ch);
            setActiveChapterId(ch.id);
            setRenameId(ch.id);
            setRenameTitle(title);
        }
        showToast(t('sidebar.chapterCreated').replace('{title}', title), 'success');
    }, [getNextChapterTitle, makeUniqueChapterTitle, showToast, addChapter, setChapters, setActiveChapterId, t, activeWorkId, activeVolumeId]);

    const getNextChapterTitleAfter = useCallback((afterId) => {
        const startIndex = chapters.findIndex(ch => ch.id === afterId);
        for (let i = startIndex; i >= 0; i--) {
            const item = chapters[i];
            if (!item || item.type === 'volume' || item.numberingIgnored) continue;
            const next = tryNextTitle(item.title);
            if (next) return makeUniqueChapterTitle(next);
        }
        return makeUniqueChapterTitle(getNextChapterTitle());
    }, [chapters, getNextChapterTitle, makeUniqueChapterTitle]);

    const handleCreateChapterAfter = useCallback(async (afterId) => {
        const title = getNextChapterTitleAfter(afterId);
        const result = await insertChapterAfter(title, afterId, activeWorkId);
        setChapters(result.chapters);
        setActiveChapterId(result.chapter.id);
        setRenameId(result.chapter.id);
        setRenameTitle(title);
        showToast(t('sidebar.chapterCreated').replace('{title}', title), 'success');
    }, [activeWorkId, getNextChapterTitleAfter, setActiveChapterId, setChapters, showToast, t]);

    // 删除章节/分卷
    const handleDeleteChapter = useCallback(async (id) => {
        const item = chapters.find(c => c.id === id);
        if (!item) return;
        if (item.type === 'volume') {
            // 删除分卷，章节保留（移除 volume 标记）
            const remaining = await deleteChapter(id, activeWorkId);
            setChapters(remaining);
            if (activeVolumeId === id) setActiveVolumeId(null);
            showToast((t('sidebar.volumeDeleted') || '已删除分卷「{title}」').replace('{title}', item.title), 'info');
        } else {
            const realChapters = chapters.filter(c => (c.type || 'chapter') !== 'volume');
            if (realChapters.length <= 1) {
                showToast(t('sidebar.alertRetainOne'), 'error');
                return;
            }
            const remaining = await deleteChapter(id, activeWorkId);
            setChapters(remaining);
            if (activeChapterId === id) {
                const nextCh = remaining.find(c => (c.type || 'chapter') !== 'volume');
                setActiveChapterId(nextCh?.id || null);
            }
            showToast(t('sidebar.chapterDeleted').replace('{title}', item.title), 'info');
        }
        setContextMenu(null);
    }, [chapters, activeChapterId, activeVolumeId, showToast, setChapters, setActiveChapterId, t, activeWorkId]);

    // 重命名章节/分卷
    const handleRename = useCallback((id) => {
        const title = renameTitle.trim();
        if (!title) return;
        updateChapter(id, { title }, activeWorkId);
        updateChapterStore(id, { title });
        setRenameId(null);
        setRenameTitle('');
    }, [renameTitle, updateChapterStore, activeWorkId]);

    const handleToggleSpecialChapter = useCallback(async (id) => {
        const item = chapters.find(c => c.id === id);
        if (!item || item.type === 'volume') return;
        const numberingIgnored = !item.numberingIgnored;
        await updateChapter(id, { numberingIgnored }, activeWorkId);
        updateChapterStore(id, { numberingIgnored });
        showToast(numberingIgnored
            ? `「${item.title}」已设为特殊章节，重排编号时会跳过`
            : `「${item.title}」已恢复普通章节`,
            'success');
    }, [activeWorkId, chapters, showToast, updateChapterStore]);

    const handleOpenSynopsis = useCallback((id) => {
        const chapter = chapters.find(c => c.id === id && (c.type || 'chapter') !== 'volume');
        if (!chapter) return;
        setSynopsisOverviewModal({ view: 'single', chapterId: id });
    }, [chapters]);

    const handleOpenActiveSynopsis = useCallback((e) => {
        e?.stopPropagation?.();
        const chapterId = activeSynopsisTarget?.id || activeChapterId;
        if (!chapterId) return;
        handleOpenSynopsis(chapterId);
    }, [activeChapterId, activeSynopsisTarget?.id, handleOpenSynopsis]);

    const handleOpenSynopsisOverview = useCallback(async (e) => {
        e?.stopPropagation?.();
        await reloadMemoryGroups();
        setSynopsisOverviewModal({ view: 'saved', chapterId: activeSynopsisTarget?.id || activeChapterId || null });
    }, [activeChapterId, activeSynopsisTarget?.id, reloadMemoryGroups]);

    const handleOverviewOpenChapter = useCallback((chapterId) => {
        setSynopsisOverviewModal({ view: 'single', chapterId });
    }, []);

    const handleCloseSynopsis = useCallback(() => {
        if (synopsisGenerating || synopsisSaving) return;
        setSynopsisModal(null);
        setSynopsisDraft('');
        setSynopsisLocked(false);
        setSynopsisData(normalizeChapterSynopsis());
        setSynopsisError('');
    }, [synopsisGenerating, synopsisSaving]);

    const handleClearSynopsis = useCallback(() => {
        setSynopsisDraft('');
        setSynopsisData(normalizeChapterSynopsis({ locked: synopsisLocked }));
        setSynopsisError('');
    }, [synopsisLocked]);

    const handleSaveSynopsis = useCallback(async () => {
        if (!synopsisChapter) return;
        setSynopsisSaving(true);
        setSynopsisError('');
        try {
            const now = new Date().toISOString();
            const payload = normalizeChapterSynopsis({
                ...synopsisData,
                summary: synopsisDraft.trim(),
                locked: synopsisLocked,
                source: synopsisData.source || 'manual',
                updatedAt: now,
            });
            const updated = await updateChapter(synopsisChapter.id, { synopsis: payload }, activeWorkId);
            if (updated) {
                updateChapterStore(synopsisChapter.id, { synopsis: payload });
            }
            showToast('章节概要已保存', 'success');
            handleCloseSynopsis();
        } catch (err) {
            setSynopsisError(err?.message || '保存失败');
        } finally {
            setSynopsisSaving(false);
        }
    }, [activeWorkId, handleCloseSynopsis, showToast, synopsisChapter, synopsisData, synopsisDraft, synopsisLocked, updateChapterStore]);

    const handleGenerateSynopsis = useCallback(async () => {
        if (!synopsisChapter) return;
        if (synopsisLocked) {
            showToast('当前概要已锁定，取消锁定后再生成', 'info');
            return;
        }

        const plainText = stripChapterHtml(synopsisChapter.content || '');
        if (plainText.length < 20) {
            setSynopsisError('正文太短，暂时无法生成有效概要');
            return;
        }

        setSynopsisGenerating(true);
        setSynopsisError('');
        try {
            const { apiConfig } = getProjectSettings();
            const { systemPrompt, userPrompt } = buildSynopsisPrompts(synopsisChapter);
            const response = await fetch(resolveAiEndpoint(apiConfig), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    userPrompt,
                    apiConfig,
                    ...(apiConfig?.useAdvancedParams && apiConfig?.enableMaxOutputTokens ? {
                        maxTokens: apiConfig.maxOutputTokens || 65536,
                    } : {}),
                    temperature: 0.2,
                    topP: 0.9,
                }),
            });
            const aiText = await readAiTextStream(response);
            const generated = parseGeneratedSynopsis(aiText);
            if (!hasChapterSynopsis(generated)) {
                throw new Error('AI 没有返回可用概要');
            }

            const now = new Date().toISOString();
            const nextSynopsis = normalizeChapterSynopsis({
                ...generated,
                locked: false,
                source: 'ai',
                generatedAt: now,
                updatedAt: now,
            });
            setSynopsisData(nextSynopsis);
            setSynopsisDraft(nextSynopsis.summary || aiText);
            showToast('概要已生成，请确认后保存', 'success');
        } catch (err) {
            setSynopsisError(err?.message || '生成失败，请检查 API 配置');
        } finally {
            setSynopsisGenerating(false);
        }
    }, [showToast, synopsisChapter, synopsisLocked]);

    const notifyMemoryGroupsChanged = useCallback(() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('author-chapter-memory-groups-changed', {
            detail: { workId: activeWorkId || getActiveWorkId() || 'work-default' },
        }));
    }, [activeWorkId]);

    const handleSaveOverviewMemoryGroups = useCallback(async (nextGroups) => {
        await saveChapterMemoryGroups(nextGroups, activeWorkId);
        setMemoryGroups(nextGroups);
        notifyMemoryGroupsChanged();
    }, [activeWorkId, notifyMemoryGroupsChanged]);

    const handleOpenMemoryGroups = useCallback(async () => {
        await reloadMemoryGroups();
        setMemoryError('');
        setShowMemoryGroupsModal(true);
    }, [reloadMemoryGroups]);

    const handleOverviewOpenMemoryGroups = useCallback(async () => {
        await reloadMemoryGroups();
        setSynopsisOverviewModal({ view: 'groups', chapterId: activeChapterId || null });
    }, [activeChapterId, reloadMemoryGroups]);

    const handleToggleSynopsisLock = useCallback(async (chapterId, locked) => {
        const chapter = chapters.find(c => c.id === chapterId && (c.type || 'chapter') !== 'volume');
        if (!chapter) return;
        const synopsis = getChapterSynopsis(chapter);
        if (!hasChapterSynopsis(synopsis)) {
            showToast('这个章节还没有概要，生成或填写后再锁定', 'info');
            return;
        }
        const payload = normalizeChapterSynopsis({
            ...synopsis,
            locked,
            updatedAt: new Date().toISOString(),
        });
        const updated = await updateChapter(chapter.id, { synopsis: payload }, activeWorkId);
        if (updated) {
            updateChapterStore(chapter.id, { synopsis: payload });
        }
        showToast(locked ? '概要已锁定' : '概要已解锁', 'success');
    }, [activeWorkId, chapters, showToast, updateChapterStore]);

    const handleCopyAllSynopsis = useCallback(async () => {
        const lines = [];
        let ordinal = 0;
        chapters.forEach(chapter => {
            if ((chapter.type || 'chapter') === 'volume') return;
            ordinal += 1;
            if (!hasChapterSynopsis(chapter)) return;
            lines.push(`第${ordinal}章「${chapter.title || '未命名章节'}」\n${buildChapterSynopsisText(chapter)}`);
        });
        const text = lines.join('\n\n---\n\n').trim();
        if (!text) {
            showToast('还没有可导出的章节概要', 'info');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            showToast('所有已保存概要已复制', 'success');
        } catch {
            showToast('复制失败，请检查浏览器剪贴板权限', 'error');
        }
    }, [chapters, showToast]);

    const handleApplySynopsisContext = useCallback(() => {
        showToast('已保存概要会自动参与前文上下文；多章分组可在概要分组中管理', 'success');
    }, [showToast]);

    const getSynopsisSwitchTargetId = useCallback(() => {
        if (activeSynopsisTarget?.id) return activeSynopsisTarget.id;
        const selectedChapterId = [...memorySelectedChapterIds].find(id =>
            chapters.some(chapter => chapter.id === id && (chapter.type || 'chapter') !== 'volume')
        );
        if (selectedChapterId) return selectedChapterId;
        return chapters.find(chapter => (chapter.type || 'chapter') !== 'volume')?.id || null;
    }, [activeSynopsisTarget?.id, chapters, memorySelectedChapterIds]);

    const handleSwitchSynopsisToMemory = useCallback(async () => {
        if (synopsisGenerating || synopsisSaving) return;
        handleCloseSynopsis();
        await handleOpenMemoryGroups();
    }, [handleCloseSynopsis, handleOpenMemoryGroups, synopsisGenerating, synopsisSaving]);

    const handleSwitchMemoryToSynopsis = useCallback(() => {
        if (memoryGenerating || memorySaving) return;
        const chapterId = getSynopsisSwitchTargetId();
        if (!chapterId) {
            setMemoryError('请先创建或选择一个章节');
            return;
        }
        setMemoryError('');
        setShowMemoryGroupsModal(false);
        handleOpenSynopsis(chapterId);
    }, [getSynopsisSwitchTargetId, handleOpenSynopsis, memoryGenerating, memorySaving]);

    const handleNewMemoryDraft = useCallback(() => {
        setMemoryDraft(normalizeChapterMemoryGroup({ name: '' }));
        setMemorySelectedChapterIds(new Set());
        setMemoryError('');
    }, []);

    const handleMemoryDraftChange = useCallback((patch) => {
        setMemoryDraft(prev => normalizeChapterMemoryGroup({ ...prev, ...patch }));
    }, []);

    const toggleMemoryChapter = useCallback((chapterId) => {
        setMemorySelectedChapterIds(prev => {
            const next = new Set(prev);
            if (next.has(chapterId)) next.delete(chapterId);
            else next.add(chapterId);
            setMemoryDraft(draft => normalizeChapterMemoryGroup({ ...draft, chapterIds: [...next] }));
            return next;
        });
    }, []);

    const toggleMemoryGroupSelection = useCallback((groupId) => {
        setMemorySelectedGroupIds(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    }, []);

    const getSelectedMemoryChapterEntries = useCallback(() => {
        let ordinal = 0;
        return chapters
            .filter(chapter => (chapter.type || 'chapter') !== 'volume')
            .map(chapter => ({ chapter, ordinal: ++ordinal }))
            .filter(({ chapter }) => memorySelectedChapterIds.has(chapter.id));
    }, [chapters, memorySelectedChapterIds]);

    const handleGenerateMemoryGroup = useCallback(async () => {
        const selectedEntries = getSelectedMemoryChapterEntries();
        if (selectedEntries.length === 0) {
            setMemoryError('请先选择至少一个章节');
            return;
        }

        setMemoryGenerating(true);
        setMemoryError('');
        try {
            const { apiConfig } = getProjectSettings();
            const name = memoryDraft.name || `${selectedEntries[0].chapter.title} 等 ${selectedEntries.length} 章`;
            const { systemPrompt, userPrompt } = buildMemoryGroupPrompts({
                name,
                chapters: selectedEntries,
            });
            const response = await fetch(resolveAiEndpoint(apiConfig), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    userPrompt,
                    apiConfig,
                    ...(apiConfig?.useAdvancedParams && apiConfig?.enableMaxOutputTokens ? {
                        maxTokens: apiConfig.maxOutputTokens || 65536,
                    } : {}),
                    temperature: 0.2,
                    topP: 0.9,
                }),
            });
            const aiText = await readAiTextStream(response);
            const generated = parseGeneratedSynopsis(aiText);
            if (!hasChapterSynopsis(generated)) throw new Error('AI 没有返回可用多章节概要');
            const now = new Date().toISOString();
            setMemoryDraft(prev => normalizeChapterMemoryGroup({
                ...prev,
                ...generated,
                name,
                chapterIds: selectedEntries.map(({ chapter }) => chapter.id),
                sourceType: 'custom',
                source: 'ai',
                generatedAt: now,
                updatedAt: now,
            }));
            showToast('多章节概要已生成，请确认后保存', 'success');
        } catch (err) {
            setMemoryError(err?.message || '生成失败，请检查 API 配置');
        } finally {
            setMemoryGenerating(false);
        }
    }, [getSelectedMemoryChapterEntries, memoryDraft.name, showToast]);

    const handleMergeMemoryGroups = useCallback(async () => {
        const selectedGroups = memoryGroups.filter(group => memorySelectedGroupIds.has(group.id));
        if (selectedGroups.length < 2) {
            setMemoryError('请至少选择两个记忆组');
            return;
        }

        setMemoryGenerating(true);
        setMemoryError('');
        try {
            const { apiConfig } = getProjectSettings();
            const unionChapterIds = Array.from(new Set(selectedGroups.flatMap(group => group.chapterIds)));
            const name = `合并概要：${selectedGroups.map(group => group.name || '未命名记忆组').slice(0, 2).join(' + ')}${selectedGroups.length > 2 ? ' 等' : ''}`;
            const { systemPrompt, userPrompt } = buildMemoryMergePrompts({
                name,
                groups: selectedGroups,
                chapters,
            });
            const response = await fetch(resolveAiEndpoint(apiConfig), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    userPrompt,
                    apiConfig,
                    ...(apiConfig?.useAdvancedParams && apiConfig?.enableMaxOutputTokens ? {
                        maxTokens: apiConfig.maxOutputTokens || 65536,
                    } : {}),
                    temperature: 0.2,
                    topP: 0.9,
                }),
            });
            const aiText = await readAiTextStream(response);
            const generated = parseGeneratedSynopsis(aiText);
            if (!hasChapterSynopsis(generated)) throw new Error('AI 没有返回可用合并概要');
            const now = new Date().toISOString();
            setMemoryDraft(normalizeChapterMemoryGroup({
                ...generated,
                name,
                chapterIds: unionChapterIds,
                sourceGroupIds: selectedGroups.map(group => group.id),
                sourceType: 'merged',
                source: 'ai',
                generatedAt: now,
                updatedAt: now,
            }));
            setMemorySelectedChapterIds(new Set(unionChapterIds));
            showToast('合并概要已生成，请确认后保存', 'success');
        } catch (err) {
            setMemoryError(err?.message || '合并失败，请检查 API 配置');
        } finally {
            setMemoryGenerating(false);
        }
    }, [chapters, memoryGroups, memorySelectedGroupIds, showToast]);

    const handleSaveMemoryGroup = useCallback(async () => {
        const payload = normalizeChapterMemoryGroup({
            ...memoryDraft,
            chapterIds: [...memorySelectedChapterIds],
            source: memoryDraft.source || 'manual',
            updatedAt: new Date().toISOString(),
        });
        if (!payload.name.trim()) {
            setMemoryError('请填写组名');
            return;
        }
        if (!hasChapterMemoryGroup(payload)) {
            setMemoryError('请填写概要正文，或先用 AI 生成');
            return;
        }
        if (payload.chapterIds.length === 0) {
            setMemoryError('请至少选择一个章节');
            return;
        }

        setMemorySaving(true);
        setMemoryError('');
        try {
            const nextGroups = memoryGroups.some(group => group.id === payload.id)
                ? memoryGroups.map(group => group.id === payload.id ? payload : group)
                : [...memoryGroups, payload];
            await saveChapterMemoryGroups(nextGroups, activeWorkId);
            setMemoryGroups(nextGroups);
            notifyMemoryGroupsChanged();
            showToast('章节记忆组已保存', 'success');
        } catch (err) {
            setMemoryError(err?.message || '保存失败');
        } finally {
            setMemorySaving(false);
        }
    }, [activeWorkId, memoryDraft, memoryGroups, memorySelectedChapterIds, notifyMemoryGroupsChanged, showToast]);

    const handleEditMemoryGroup = useCallback((group) => {
        const normalized = normalizeChapterMemoryGroup(group);
        setMemoryDraft(normalized);
        setMemorySelectedChapterIds(new Set(normalized.chapterIds));
        setMemoryError('');
    }, []);

    const handleDeleteMemoryGroup = useCallback(async (groupId) => {
        const nextGroups = memoryGroups.filter(group => group.id !== groupId);
        await saveChapterMemoryGroups(nextGroups, activeWorkId);
        setMemoryGroups(nextGroups);
        setMemorySelectedGroupIds(prev => {
            const next = new Set(prev);
            next.delete(groupId);
            return next;
        });
        notifyMemoryGroupsChanged();
        showToast('章节记忆组已删除', 'success');
    }, [activeWorkId, memoryGroups, notifyMemoryGroupsChanged, showToast]);

    // ===== 分卷管理 =====
    const getNextVolumeTitle = useCallback(() => {
        const volumes = chapters.filter(c => c.type === 'volume');
        if (volumes.length === 0) return (t('sidebar.defaultVolumeTitle') || '第{num}卷').replace('{num}', 1);
        for (let i = volumes.length - 1; i >= 0; i--) {
            const next = tryNextTitle(volumes[i].title);
            if (next) return next;
        }
        return (t('sidebar.defaultVolumeTitle') || '第{num}卷').replace('{num}', volumes.length + 1);
    }, [chapters, t]);

    const handleCreateVolume = useCallback(async () => {
        const title = getNextVolumeTitle();
        // 确定插入位置：优先当前选中的分卷之后，其次当前章节之后，否则为 null
        const afterId = activeVolumeId || activeChapterId || null;
        const result = await createVolume(title, activeWorkId, afterId);
        setChapters(result.chapters);
        setActiveVolumeId(result.vol.id); // 选中新分卷，使连续创建时按顺序排列
        setRenameId(result.vol.id);
        setRenameTitle(title);
        showToast((t('sidebar.volumeCreated') || '已创建「{title}」').replace('{title}', title), 'success');
    }, [getNextVolumeTitle, showToast, setChapters, t, activeWorkId, activeChapterId, activeVolumeId]);

    // ===== 一键重新编号 =====
    const handleRenumber = useCallback(async () => {
        const updated = [...chapters];
        let volNum = 0; // 分卷计数器
        let chNum = 0;  // 章节计数器

        for (let i = 0; i < updated.length; i++) {
            const item = updated[i];
            const title = item.title || '';

            if (item.type === 'volume') {
                // 检测分卷编号模式
                const mArabic = title.match(/^(第)(\d+)(卷.*)$/);
                const mChinese = title.match(/^(第)([零一二三四五六七八九十百千万]+)(卷.*)$/);
                if (mArabic) {
                    volNum++;
                    updated[i] = { ...item, title: `${mArabic[1]}${volNum}${mArabic[3]}` };
                } else if (mChinese) {
                    volNum++;
                    updated[i] = { ...item, title: `${mChinese[1]}${toCnNum(volNum)}${mChinese[3]}` };
                }
                // 无编号分卷跳过
            } else {
                if (item.numberingIgnored) continue;
                // 检测章节编号模式
                const mArabic = title.match(/^(第)(\d+)(章.*)$/);
                const mChinese = title.match(/^(第)([零一二三四五六七八九十百千万]+)(章.*)$/);
                const mPureNum = /^\d+$/.test(title.trim());
                const mTrailingNum = title.match(/^(.+?)(\d+)\s*$/);
                if (mArabic) {
                    chNum++;
                    updated[i] = { ...item, title: `${mArabic[1]}${chNum}${mArabic[3]}` };
                } else if (mChinese) {
                    chNum++;
                    updated[i] = { ...item, title: `${mChinese[1]}${toCnNum(chNum)}${mChinese[3]}` };
                } else if (mPureNum) {
                    chNum++;
                    updated[i] = { ...item, title: String(chNum) };
                } else if (mTrailingNum) {
                    chNum++;
                    updated[i] = { ...item, title: mTrailingNum[1] + chNum };
                }
                // 无编号章节（序章、尾声等）跳过
            }
        }

        await saveChapters(updated, activeWorkId);
        setChapters(updated);
        showToast((t('sidebar.renumbered') || '已重新编号'), 'success');
    }, [chapters, activeWorkId, setChapters, showToast, t]);

    // ===== 拖拽排序 =====
    const handleDragStart = useCallback((e, id) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    }, []);

    const handleDragOver = useCallback((e, id) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        setDragOverId(id);
        setDragOverPos(y < rect.height / 2 ? 'top' : 'bottom');
    }, []);

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        if (!dragId || !dragOverId || dragId === dragOverId) {
            setDragId(null); setDragOverId(null); setDragOverPos(null);
            return;
        }
        const ids = chapters.map(c => c.id);
        const fromIdx = ids.indexOf(dragId);
        const toIdx = ids.indexOf(dragOverId);
        if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }

        // 如果拖拽的是分卷，需要带上其下所有章节一起移动
        const draggedItem = chapters[fromIdx];
        let draggedIds = [dragId];
        if (draggedItem.type === 'volume') {
            let i = fromIdx + 1;
            while (i < chapters.length && (chapters[i].type || 'chapter') !== 'volume') {
                draggedIds.push(chapters[i].id);
                i++;
            }
        }

        const remaining = ids.filter(id => !draggedIds.includes(id));
        let insertAt = remaining.indexOf(dragOverId);
        if (insertAt === -1) insertAt = remaining.length;
        if (dragOverPos === 'bottom') insertAt++;
        remaining.splice(insertAt, 0, ...draggedIds);

        const reordered = await reorderItems(remaining, activeWorkId);
        reorderChapters(reordered);
        setDragId(null); setDragOverId(null); setDragOverPos(null);
    }, [dragId, dragOverId, dragOverPos, chapters, activeWorkId, reorderChapters]);

    const handleDragEnd = useCallback(() => {
        setDragId(null); setDragOverId(null); setDragOverPos(null);
    }, []);

    // ===== 文档大纲：从编辑器提取标题 + Scrollspy =====
    useEffect(() => {
        let debounceTimer = null;
        let observer = null;
        let pollTimer = null;
        let cleanedUp = false;

        // 提取标题的函数（含段落字数统计）
        const extractHeadings = (editor) => {
            const json = editor.getJSON();
            const h = [];
            const nodes = json.content || [];
            // 收集标题位置
            const headingPositions = [];
            nodes.forEach((node, idx) => {
                if (node.type === 'heading' && node.attrs?.level) {
                    const text = (node.content || []).map(c => c.text || '').join('');
                    if (text.trim()) {
                        h.push({ level: node.attrs.level, text: text.trim(), index: idx });
                        headingPositions.push(idx);
                    }
                }
            });
            setHeadings(h);
            // 计算每个标题到下一个标题之间的字数
            const stats = h.map((heading, i) => {
                const start = heading.index + 1;
                const end = i < h.length - 1 ? h[i + 1].index : nodes.length;
                let text = '';
                for (let j = start; j < end; j++) {
                    const n = nodes[j];
                    if (n.content) text += n.content.map(c => c.text || '').join('');
                }
                const plainText = text.replace(/\s+/g, '');
                const words = plainText.length;
                const tokens = estimateTokens(text);
                return { words, tokens };
            });
            setHeadingStats(stats);
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
            <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}${pushMode ? ' push-mode' : ''}`}>
                
                {/* ===== 左侧垂直导航栏 (Nav Pane) ===== */}
                <div className={`sidebar-nav-pane${sidebarOpen ? ' sidebar-nav-expanded' : ''}`}>
                    <div className="sidebar-nav-top">
                        {/* 章节 */}
                        <IconButton icon={<BookOpen size={18} />} label={t('sidebar.chapterList') || '章节大纲'} text={sidebarOpen ? (t('sidebar.navChapter') || '章节') : undefined} tooltipSide="right" className={`nav-item ${activeNavTab === 'chapters' ? 'active' : ''}`} onClick={() => { if (activeNavTab === 'chapters' && sidebarOpen) { setSidebarOpen(false); } else { setActiveNavTab('chapters'); setSidebarOpen(true); } }} />
                        
                        {/* 作品信息 */}
                        <IconButton icon={<Book size={18} />} label={'作品信息'} text={sidebarOpen ? '作品' : undefined} tooltipSide="right" className="nav-item" onClick={() => setShowBookInfo(true)} />
                        
                        <div className="nav-category-divider" />
                        
                        {/* 设定集 + 分类快捷入口 视觉分组 */}
                        <div className="nav-settings-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border-light, #e5e7eb)', borderRadius: 12, padding: '4px 2px', margin: '0 3px', background: 'var(--bg-secondary, #f9fafb)', gap: 1 }}>
                        {/* 设定集 — 弹出缩略图菜单 */}
                        <div ref={categoryPopoverAnchorRef}>
                            <IconButton icon={<Library size={18} />} label={showCategoryPopover ? '' : (t('sidebar.tooltipSettings') || '设定集管理')} text={sidebarOpen ? '设定' : undefined} tooltipSide="right" onClick={() => { setSidebarOpen(false); setShowCategoryPopover(!showCategoryPopover); }} className="nav-item" />
                            {showCategoryPopover && (
                                <SettingsCategoryPopover
                                    anchorRef={categoryPopoverAnchorRef}
                                    onPinnedChange={setPinnedCategories}
                                    onClose={() => {
                                        setShowCategoryPopover(false);
                                        setPinnedCategories(getPinnedCategories());
                                    }}
                                    onOpenCategory={(category) => {
                                        setOpenCategoryModal(category);
                                        setShowCategoryPopover(false);
                                    }}
                                    onAddCategory={() => setShowSettings('settings')}
                                />
                            )}
                        </div>
                        
                        {pinnedCategories.length > 0 && <div className="nav-settings-divider" style={{ width: 20, height: 1, background: 'var(--border-light, #e5e7eb)', margin: '3px auto' }} />}
                        
                        {/* 导航栏分类快捷入口（可拖拽排序） */}
                        {pinnedCategories.filter(cat => cat !== 'bookInfo').map(cat => {
                            const CatIcon = getCategoryIcon(cat, catCustomIcons[cat]);
                            const colors = getCategoryColor(cat);
                            const catLabel = catCustomLabels[cat] || getCategoryLabel(cat, t);
                            const isDragging = navDragCat === cat;
                            const isDragOver = navDragOverCat === cat;
                            return (
                                <div
                                    key={cat}
                                    draggable
                                    onDragStart={(e) => {
                                        setNavDragCat(cat);
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData('text/plain', cat);
                                    }}
                                    onDragEnd={() => {
                                        setNavDragCat(null);
                                        setNavDragOverCat(null);
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        if (navDragOverCat !== cat) setNavDragOverCat(cat);
                                    }}
                                    onDragLeave={() => {
                                        if (navDragOverCat === cat) setNavDragOverCat(null);
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const from = navDragCat;
                                        const to = cat;
                                        if (from && to && from !== to) {
                                            const newList = [...pinnedCategories];
                                            const fromIdx = newList.indexOf(from);
                                            const toIdx = newList.indexOf(to);
                                            if (fromIdx !== -1 && toIdx !== -1) {
                                                newList.splice(fromIdx, 1);
                                                newList.splice(toIdx, 0, from);
                                                setPinnedCategories(newList);
                                                savePinnedCategories(newList);
                                            }
                                        }
                                        setNavDragCat(null);
                                        setNavDragOverCat(null);
                                    }}
                                    className={`nav-drag-wrapper${isDragging ? ' nav-dragging' : ''}${isDragOver ? ' nav-drag-over' : ''}`}
                                >
                                    <IconButton
                                        icon={<CatIcon size={18} style={{ color: activeNavTab === cat ? colors.color : undefined }} />}
                                        label={catLabel}
                                        text={sidebarOpen ? catLabel.slice(0, 2) : undefined}
                                        tooltipSide="right"
                                        className={`nav-item ${activeNavTab === cat ? 'active' : ''}`}
                                        onClick={() => {
                                            setOpenCategoryModal(cat);
                                        }}
                                    />
                                </div>
                            );
                        })}
                        </div>
                    </div>
                    <div className="sidebar-nav-bottom">
                        <IconButton icon={themeMeta.icon} label={themeMeta.label} text={sidebarOpen ? themeMeta.text : undefined} tooltipSide="right" onClick={toggleTheme} className="nav-item" />
                        <IconButton icon={<History size={18} />} label={t('sidebar.tooltipTimeMachine')} text={sidebarOpen ? (t('sidebar.navSnapshots') || '快照') : undefined} tooltipSide="right" onClick={() => setShowSnapshots(true)} className="nav-item" />
                        <IconButton icon={<FolderOpen size={18} />} label={t('sidebar.menuLoad') || '读档'} text={sidebarOpen ? (t('sidebar.menuLoad') || '读档') : undefined} tooltipSide="right" onClick={() => document.getElementById('project-import-input')?.click()} className="nav-item" />
                        <IconButton icon={<Save size={18} />} label={t('sidebar.menuSave') || '存档'} text={sidebarOpen ? (t('sidebar.menuSave') || '存档') : undefined} tooltipSide="right" onClick={() => { exportProject(); showToast(t('sidebar.exportedProject') || '已导出', 'success'); }} className="nav-item" />
                        <IconButton icon={<FileDown size={18} />} label={t('sidebar.menuImportWork') || '导入'} text={sidebarOpen ? (t('sidebar.navImport') || '导入') : undefined} tooltipSide="right" onClick={() => document.getElementById('work-import-input')?.click()} className="nav-item" />
                        <div ref={navExportRef} style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
                            <IconButton icon={<FileOutput size={18} />} label={showNavExportMenu ? '' : '导出'} text={sidebarOpen ? '导出' : undefined} tooltipSide="right" onClick={() => setShowNavExportMenu(!showNavExportMenu)} className="nav-item" />
                            {showNavExportMenu && createPortal(
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }} onClick={() => setShowNavExportMenu(false)} />
                                    <div style={{
                                        position: 'fixed',
                                        left: navExportRef.current ? navExportRef.current.getBoundingClientRect().right + 8 : 0,
                                        top: navExportRef.current ? Math.min(navExportRef.current.getBoundingClientRect().top, window.innerHeight - 280) : 0,
                                        minWidth: 170, zIndex: 9991,
                                        background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: 4,
                                    }}>
                                        <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>导出本章</div>
                                        {activeChapterId && chapters.find(c => c.id === activeChapterId) ? [
                                            { label: 'TXT', icon: <FileText size={14} />, fn: () => exportWorkAsTxt([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                            { label: 'Markdown', icon: <FileType size={14} />, fn: () => exportWorkAsMarkdown([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                            { label: 'DOCX', icon: <BookMarked size={14} />, fn: async () => await exportWorkAsDocx([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                            { label: 'EPUB', icon: <BookOpen size={14} />, fn: async () => await exportWorkAsEpub([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                            { label: 'PDF', icon: <Printer size={14} />, fn: () => exportWorkAsPdf([chapters.find(c => c.id === activeChapterId)], chapters.find(c => c.id === activeChapterId).title) },
                                        ].map(item => (
                                            <button key={item.label} className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={async () => { await item.fn(); setShowNavExportMenu(false); showToast(t('sidebar.exportedChapter'), 'success'); }}>{item.icon} {item.label}</button>
                                        )) : <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)' }}>请先选择章节</div>}
                                        <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }} />
                                        <button className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setShowNavExportMenu(false); setShowExportModal(true); }}><Library size={14} /> 导出更多</button>
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>
                        
                        {/* 云同步快捷入口 */}
                        <div ref={syncMenuAnchorRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                            <IconButton
                                id="tour-sidebar-sync"
                                icon={!cloudAuthUser ? <CloudOff size={18} />
                                    : cloudSyncStatus?.syncing ? <RefreshCw size={18} className="spin" />
                                    : <Cloud size={18} />}
                                label={cloudAuthUser
                                    ? (cloudSyncStatus?.syncing ? '同步中...'
                                        : cloudSyncStatus?.pending > 0 ? `${cloudSyncStatus.pending} 项待同步`
                                        : cloudSyncStatus?.idle ? '自动同步已暂停'
                                        : cloudSyncStatus?.lastSync ? `已同步 · ${new Date(cloudSyncStatus.lastSync).toLocaleTimeString()}`
                                        : '云同步')
                                    : '同步方式与设置'}
                                text={sidebarOpen ? '同步' : undefined}
                                tooltipSide="right"
                                onClick={async () => {
                                    if (!firebaseAvailable || !cloudAuthUser) {
                                        useAppStore.getState().setShowSettings(true, 'preferences');
                                        return;
                                    }
                                    // 已登录：点击展开状态面板
                                    setShowSyncMenu(!showSyncMenu);
                                }}
                                className={`nav-item${cloudAuthUser ? ' nav-cloud-active' : ''}`}
                            />
                            {showSyncMenu && (
                                <SyncMenuPortal 
                                    anchorRef={syncMenuAnchorRef} 
                                    t={t}
                                    cloudinarySyncStatus={cloudSyncStatus} 
                                    setShowSyncMenu={setShowSyncMenu} 
                                    setShowSyncConfirmModal={setShowSyncConfirmModal} 
                                />
                            )}
                        </div>
                        
                        {/* 更多操作下拉（仅保留帮助和社区） */}
                        <div ref={moreMenuAnchorRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                            <IconButton id="tour-settings" icon={<Settings size={18} />} label={showMoreMenu ? '' : (t('sidebar.moreActions') || '更多操作')} text={sidebarOpen ? (t('sidebar.navMore') || '更多') : undefined} tooltipSide="right" onClick={() => setShowMoreMenu(!showMoreMenu)} className="nav-item" />
                            {showMoreMenu && (
                                <MoreMenuPortal anchorRef={moreMenuAnchorRef} t={t} setShowSettings={setShowSettings} setShowMoreMenu={setShowMoreMenu} onOpenHelp={onOpenHelp} setShowGitPopup={setShowGitPopup} />
                            )}
                        </div>
                    </div>
                </div>

                {/* ===== 右侧内容区 (Content Pane) ===== */}
                <div className="sidebar-content-pane">
                    {activeNavTab === 'chapters' ? (
                    <>
                    {/* ===== 文档分页 ===== */}
                <div className="gdocs-section-header">
                    <span className="gdocs-section-title">文档分页</span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                        <Tooltip content="章节概要总览">
                            <button
                                className="gdocs-section-add gdocs-section-summary-btn"
                                onClick={handleOpenSynopsisOverview}
                                aria-label="章节概要总览"
                            >
                                <FileText size={13} />
                                <span>概要</span>
                            </button>
                        </Tooltip>
                        <Tooltip content={t('sidebar.renumber') || '重新编号'}><button className="gdocs-section-add" onClick={handleRenumber} aria-label={t('sidebar.renumber') || '重新编号'}><ListOrdered size={14} /></button></Tooltip>
                        <Tooltip content={t('sidebar.newVolume') || '新建分卷'}><button className="gdocs-section-add" onClick={handleCreateVolume} aria-label={t('sidebar.newVolume') || '新建分卷'}><Library size={14} /></button></Tooltip>
                        <button id="tour-new-chapter" className="gdocs-section-add" onClick={() => handleCreateChapter()} title={t('sidebar.newChapter')}>+</button>
                    </div>
                </div>
                <div className="gdocs-tab-list">
                    {chapters.map((ch, chIdx) => {
                        const isVolume = ch.type === 'volume';
                        const isActive = !isVolume && ch.id === activeChapterId;
                        const isExpanded = isActive && headings.length > 0 && !outlineCollapsed;
                        const isDragTarget = dragOverId === ch.id;

                        // 分卷折叠：检查当前章节是否隶属于一个已折叠的分卷
                        if (!isVolume) {
                            let belongsToCollapsed = false;
                            for (let k = chIdx - 1; k >= 0; k--) {
                                if (chapters[k].type === 'volume') {
                                    if (chapters[k].collapsed) belongsToCollapsed = true;
                                    break;
                                }
                            }
                            if (belongsToCollapsed) return null;
                        }

                        // 分卷头渲染
                        if (isVolume) {
                            const isVolActive = activeVolumeId === ch.id;
                            // 计算分卷下章节字数
                            let volWords = 0;
                            for (let k = chIdx + 1; k < chapters.length && (chapters[k].type || 'chapter') !== 'volume'; k++) {
                                volWords += chapters[k].wordCount || 0;
                            }
                            return (
                                <div key={ch.id} className="gdocs-tab-group">
                                    <div
                                        className={`gdocs-tab-item gdocs-volume-item ${isVolActive ? 'active' : ''}${dragId === ch.id ? ' gdocs-dragging' : ''}${isDragTarget ? ` gdocs-drag-${dragOverPos}` : ''}`}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, ch.id)}
                                        onDragOver={(e) => handleDragOver(e, ch.id)}
                                        onDrop={handleDrop}
                                        onDragEnd={handleDragEnd}
                                        onClick={() => {
                                            toggleVolumeCollapsed(ch.id);
                                            updateChapter(ch.id, { collapsed: !ch.collapsed }, activeWorkId);
                                            setActiveVolumeId(isVolActive ? null : ch.id);
                                        }}
                                    >
                                        {renameId === ch.id ? (
                                            <input
                                                className="modal-input"
                                                style={{ margin: 0, padding: '4px 8px', fontSize: '13px', flex: 1, fontWeight: 600 }}
                                                value={renameTitle || ''}
                                                onChange={e => setRenameTitle(e.target.value)}
                                                onBlur={() => handleRename(ch.id)}
                                                onKeyDown={e => e.key === 'Enter' && handleRename(ch.id)}
                                                onClick={e => e.stopPropagation()}
                                                autoFocus
                                            />
                                        ) : (
                                            <>
                                                <span className="gdocs-tab-arrow" style={{ transform: ch.collapsed ? 'none' : 'rotate(90deg)' }}>▶</span>
                                                <Book size={14} style={{ marginRight: 4, flexShrink: 0, color: 'var(--accent)' }} />
                                                <span style={{ flex: 1, minWidth: 0 }}>
                                                    <span className="gdocs-tab-title" style={{ fontWeight: 600 }}>{ch.title}</span>
                                                    {volWords > 0 && (
                                                        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                                                            {volWords.toLocaleString()}字
                                                        </span>
                                                    )}
                                                </span>
                                                <div className="gdocs-tab-actions">
                                                    <button className="gdocs-tab-action-btn" title={t('sidebar.newChapterInVolume') || '新建章节'} onClick={(e) => { e.stopPropagation(); handleCreateChapter(ch.id); }}>+</button>
                                                    <button className="gdocs-tab-action-btn" title={t('sidebar.contextRename')} onClick={(e) => { e.stopPropagation(); setRenameId(ch.id); setRenameTitle(ch.title); }}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                                                    </button>
                                                    <button className="gdocs-tab-action-btn danger" title={t('sidebar.deleteVolume') || '删除分卷'} onClick={(e) => { e.stopPropagation(); handleDeleteChapter(ch.id); }}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        // 章节项渲染（带拖拽）
                        return (
                            <div key={ch.id} className="gdocs-tab-group">
                                <div
                                    className={`gdocs-tab-item ${isActive ? 'active' : ''}${dragId === ch.id ? ' gdocs-dragging' : ''}${isDragTarget ? ` gdocs-drag-${dragOverPos}` : ''}`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, ch.id)}
                                    onDragOver={(e) => handleDragOver(e, ch.id)}
                                    onDrop={handleDrop}
                                    onDragEnd={handleDragEnd}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setContextMenu({ id: ch.id, x: e.clientX, y: e.clientY });
                                    }}
                                    onClick={() => {
                                        if (isActive) {
                                            setOutlineCollapsed(prev => !prev);
                                        } else {
                                            setActiveChapterId(ch.id);
                                            setOutlineCollapsed(false);
                                            // 跟踪所属分卷
                                            for (let k = chIdx - 1; k >= 0; k--) {
                                                if (chapters[k].type === 'volume') { setActiveVolumeId(chapters[k].id); break; }
                                                if (k === 0) setActiveVolumeId(null);
                                            }
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
                                                <span className="gdocs-tab-title">
                                                    {ch.title}
                                                    {ch.numberingIgnored && (
                                                        <span className="gdocs-special-badge" title="特殊章节：重排编号时忽略">特殊</span>
                                                    )}
                                                    {hasChapterSynopsis(ch) && (
                                                        <span className="gdocs-synopsis-badge" title="已有章节概要">概要</span>
                                                    )}
                                                </span>
                                                {(ch.wordCount || 0) > 0 && (
                                                    <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                                                        {ch.wordCount.toLocaleString()}字 · ~{estimateTokens((ch.content || '').replace(/<[^>]*>/g, '')).toLocaleString()} tokens
                                                    </span>
                                                )}
                                            </span>
                                            <div className="gdocs-tab-actions">
                                                <button
                                                    className={`gdocs-tab-action-btn synopsis${hasChapterSynopsis(ch) ? ' active' : ''}`}
                                                    title={hasChapterSynopsis(ch) ? '编辑章节概要' : '添加章节概要'}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenSynopsis(ch.id);
                                                    }}
                                                ><FileText size={14} /></button>
                                                <button
                                                    className="gdocs-tab-action-btn"
                                                    title="在此后插入章节"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCreateChapterAfter(ch.id);
                                                    }}
                                                ><Plus size={14} /></button>
                                                <button
                                                    className={`gdocs-tab-action-btn special${ch.numberingIgnored ? ' active' : ''}`}
                                                    title={ch.numberingIgnored ? '取消特殊章节标记' : '设为特殊章节，重排编号时忽略'}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleSpecialChapter(ch.id);
                                                    }}
                                                >特</button>
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
                                {/* 展开的章节大纲（含字数统计） */}
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
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</span>
                                                {headingStats[idx] && headingStats[idx].words > 0 && (
                                                    <span className="gdocs-outline-stats">
                                                        {headingStats[idx].words.toLocaleString()}字 · ~{headingStats[idx].tokens.toLocaleString()}t
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                    {/* 章节底部工具（保留字数统计） */}
                    <div className="sidebar-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <span>{t('sidebar.totalWords')}</span>
                            <span style={{ color: 'var(--accent)', fontWeight: '600' }}>{totalWords.toLocaleString()}</span>
                        </div>

                    </div>
                    </>
                    ) : (
                        <SettingsCategoryPanel category={activeNavTab} />
                    )}
                </div>

                {/* 隐藏的文件输入组件 */}
                <input id="project-import-input" type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const result = await importProject(file); if (result.success) { alert(result.message + '\n' + t('sidebar.importSuccess')); window.location.reload(); } else { alert(result.message); } e.target.value = ''; }} />
                <input id="work-import-input" type="file" accept=".txt,.md,.markdown,.epub,.docx,.doc,.pdf" style={{ display: 'none' }} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const result = await importWork(file); if (!result.success) { const msg = result.message === 'noChapter' ? t('sidebar.importWorkNoChapter') : t('sidebar.importWorkFailed').replace('{error}', result.message); showToast(msg, 'error'); e.target.value = ''; return; } setImportModal({ chapters: result.chapters, totalWords: result.totalWords }); } catch (err) { showToast(t('sidebar.importWorkFailed').replace('{error}', err.message), 'error'); } e.target.value = ''; }} />
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
                        {chapters.find(c => c.id === contextMenu.id)?.type !== 'volume' && (
                            <>
                                <button className="dropdown-item" onClick={() => { handleOpenSynopsis(contextMenu.id); setContextMenu(null); }}>
                                    章节概要
                                </button>
                                <button className="dropdown-item" onClick={() => { handleToggleSpecialChapter(contextMenu.id); setContextMenu(null); }}>
                                    {chapters.find(c => c.id === contextMenu.id)?.numberingIgnored ? '取消特殊章节' : '设为特殊章节'}
                                </button>
                            </>
                        )}
                        <button className="dropdown-item danger" onClick={() => handleDeleteChapter(contextMenu.id)}>{t('sidebar.contextDelete')}</button>
                    </div>
                </div>
            )}
            {synopsisOverviewModal && (
                <ChapterSynopsisOverviewModal
                    chapters={chapters}
                    activeChapterId={activeChapterId}
                    activeWorkId={activeWorkId}
                    initialView={synopsisOverviewModal.view || 'saved'}
                    initialChapterId={synopsisOverviewModal.chapterId}
                    memoryGroups={memoryGroups}
                    onToggleLock={handleToggleSynopsisLock}
                    onChapterUpdated={updateChapterStore}
                    onMemoryGroupsSaved={handleSaveOverviewMemoryGroups}
                    onCopyAll={handleCopyAllSynopsis}
                    onApplyContext={handleApplySynopsisContext}
                    showToast={showToast}
                    onClose={() => setSynopsisOverviewModal(null)}
                />
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
                    onExport={(selectedChapters, format, exportOptions) => {
                        const fns = { txt: exportWorkAsTxt, md: exportWorkAsMarkdown, docx: exportWorkAsDocx, epub: exportWorkAsEpub, pdf: exportWorkAsPdf };
                        const fn = fns[format];
                        if (fn) fn(selectedChapters, undefined, exportOptions);
                        setShowExportModal(false);
                        showToast(t('sidebar.exportedAll'), 'success');
                    }}
                    t={t}
                />
            )}
            <ExitSyncModal />
            {showSyncConfirmModal && (
                <SyncConfirmModal 
                    isOpen={showSyncConfirmModal} 
                    onClose={() => setShowSyncConfirmModal(false)} 
                    onConfirm={async () => {
                        try {
                            await useAppStore.getState().flushPendingEditorSave();
                            const { forcePullFromCloud } = await import('../lib/firestore-sync');
                            const { persistSet } = await import('../lib/persistence');
                            const { createSnapshot } = await import('../lib/snapshots');

                            await createSnapshot('从云端同步前的备份', 'manual', { syncLatestToCloud: false });
                            
                            window._isAppForcePulling = true;
                            const localSet = async (key, value) => {
                                window._isForcePullingBypass = true;
                                try {
                                    await persistSet(key, value);
                                } finally {
                                    window._isForcePullingBypass = false;
                                }
                            };
                            
                            const count = await forcePullFromCloud(localSet);
                            window._isAppForcePulling = false;
                            showToast(`成功覆盖了 ${count} 项本地数据，即将刷新以应用更改...`, 'success');
                            setTimeout(() => {
                                window.location.reload();
                            }, 1500);
                        } catch (err) {
                            window._isAppForcePulling = false;
                            window._isForcePullingBypass = false;
                            showToast(`拉取失败: ${err.message}`, 'error');
                        }
                    }}
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
            const allWorks = await getAllWorks();
            setWorks(allWorks);
        })();
    }, []);

    const handleCreateAndImport = async () => {
        const name = newWorkName.trim();
        if (!name) return;
        const workNode = await addWork(name);
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
                            <BookOpen size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />{w.name}
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

function prepareRemarkHtmlForPreview(html, options = {}) {
    const source = html || '';
    if (!source.includes('data-remark-id')) return source;
    const includeRemarks = options?.includeRemarks === true || options?.variant === 'annotated';

    if (typeof DOMParser !== 'undefined') {
        const doc = new DOMParser().parseFromString(`<!doctype html><body>${source}</body>`, 'text/html');
        doc.body.querySelectorAll('span[data-remark-id]').forEach(node => {
            const parent = node.parentNode;
            if (!parent) return;
            const remarkText = (node.getAttribute('data-remark-text') || '').trim();
            if (includeRemarks && remarkText) {
                const note = doc.createElement('span');
                note.textContent = `〔批注：${remarkText}〕`;
                parent.insertBefore(note, node.nextSibling);
            }
            while (node.firstChild) parent.insertBefore(node.firstChild, node);
            parent.removeChild(node);
        });
        return doc.body.innerHTML;
    }

    return source.replace(/<span\b([^>]*\bdata-remark-id=["'][^"']+["'][^>]*)>([\s\S]*?)<\/span>/gi, (_match, attrs, inner) => {
        const remarkText = (attrs.match(/data-remark-text=["']([^"']*)["']/i)?.[1] || '').trim();
        const note = includeRemarks && remarkText ? `〔批注：${remarkText}〕` : '';
        return `${inner}${note}`;
    });
}

// HTML → 纯文本
function htmlToPlainText(html, options = {}) {
    return prepareRemarkHtmlForPreview(html, options)
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

// 导出更多弹窗 — 选择章节 + 格式 + 预览
function ExportModal({ chapters, onClose, onExport, t }) {
    const [selected, setSelected] = useState(new Set());
    const [format, setFormat] = useState('txt');
    const [variant, setVariant] = useState('body');
    const [previewChapter, setPreviewChapter] = useState(null); // 当前预览的章节对象
    const [previewMode, setPreviewMode] = useState(null); // null | 'single' | 'all'

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
        { value: 'txt', label: 'TXT' },
        { value: 'md', label: 'Markdown' },
        { value: 'docx', label: 'DOCX' },
        { value: 'epub', label: 'EPUB' },
        { value: 'pdf', label: 'PDF' },
    ];
    const variants = [
        { value: 'body', label: '正文', hint: '不带批注、备注' },
        { value: 'annotated', label: '批注版', hint: '正文中展开备注' },
    ];

    // 导航到上/下一章预览
    const navigatePreview = (delta) => {
        if (!previewChapter) return;
        const idx = chapters.findIndex(ch => ch.id === previewChapter.id);
        const nextIdx = idx + delta;
        if (nextIdx >= 0 && nextIdx < chapters.length) {
            setPreviewChapter(chapters[nextIdx]);
        }
    };

    // 是否显示预览面板
    const showPreview = previewMode === 'all' || (previewMode === 'single' && previewChapter);
    // 全书总字数
    const totalWords = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

    // 每种格式的容器样式
    const formatContainerStyle = {
        txt: { fontFamily: '"Cascadia Code", "SF Mono", "Consolas", monospace', fontSize: 13, lineHeight: 1.7, background: 'var(--bg-secondary)', padding: '20px 24px', borderRadius: 8 },
        md: { fontFamily: '"Cascadia Code", "SF Mono", "Consolas", monospace', fontSize: 13, lineHeight: 1.7, background: '#1e1e2e', color: '#cdd6f4', padding: '20px 24px', borderRadius: 8 },
        docx: { fontFamily: '"SimSun", "Songti SC", "STSong", serif', fontSize: 15, lineHeight: 1.8, background: '#fff', color: '#222', padding: '40px 48px', borderRadius: 4, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e0e0e0', maxWidth: 680, margin: '0 auto' },
        epub: { fontFamily: '"Georgia", "Palatino Linotype", "Book Antiqua", serif', fontSize: 16, lineHeight: 2, background: '#fffef8', color: '#2c2c2c', padding: '32px 40px', borderRadius: 8, maxWidth: 640, margin: '0 auto', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
        pdf: { fontFamily: '"SimSun", "Songti SC", serif', fontSize: 14, lineHeight: 1.8, background: '#fff', color: '#111', padding: '48px 52px', border: '1px solid #ccc', borderRadius: 2, maxWidth: 700, margin: '0 auto', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' },
    };

    // 根据格式渲染单个章节内容块 — 与导出管线保持一致
    const renderChapterBlock = (ch, idx, total) => {
        const title = ch.title || t('sidebar.untitled') || '未命名';
        const plainText = htmlToPlainText(ch.content, { includeRemarks: variant === 'annotated' });
        const empty = !ch.content && !plainText;
        const emptyNode = (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', padding: '20px 0', textIndent: 0 }}>
                {t('sidebar.previewEmpty') || '此章节暂无内容'}
            </div>
        );
        // 与导出一致：先 htmlToText → 按空行拆段，每段内 \n 转 <br>
        const paragraphs = plainText ? plainText.split(/\n\n+/).filter(p => p.trim()) : [];

        // 渲染段落列表（DOCX/EPUB/PDF 共用）
        const renderParagraphs = (style = {}) => (
            paragraphs.map((p, pi) => (
                <p key={pi} style={{ margin: '0.5em 0', textIndent: '2em', ...style }}
                    dangerouslySetInnerHTML={{ __html: p.trim().replace(/\n/g, '<br>') }} />
            ))
        );

        switch (format) {
            case 'txt': {
                // 导出: title\n\ncontent 纯文本
                return (
                    <div key={ch.id} style={{ marginBottom: idx < total - 1 ? 32 : 0 }}>
                        <div style={{ marginBottom: 8, color: 'var(--text-primary)' }}>{title}</div>
                        {empty ? emptyNode : (
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', color: 'inherit' }}>{plainText}</pre>
                        )}
                        {idx < total - 1 && <div style={{ margin: '24px 0 8px', borderTop: '1px dashed var(--border-light)' }} />}
                    </div>
                );
            }
            case 'md': {
                // 导出: # title\n\ncontent\n\n---
                return (
                    <div key={ch.id} style={{ marginBottom: idx < total - 1 ? 24 : 0 }}>
                        {empty ? emptyNode : (
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
                                <span style={{ color: '#f38ba8', fontWeight: 700 }}>{'# '}</span>
                                <span style={{ color: '#cba6f7', fontWeight: 700 }}>{title}</span>
                                {'\n\n'}
                                <span style={{ color: '#cdd6f4' }}>{plainText}</span>
                            </pre>
                        )}
                        {idx < total - 1 && (
                            <div style={{ margin: '20px 0', color: '#585b70', textAlign: 'center', letterSpacing: 4 }}>---</div>
                        )}
                    </div>
                );
            }
            case 'docx': {
                // 导出: Heading1 + 宋体段落, htmlToParagraphs 剥离所有HTML
                return (
                    <div key={ch.id} style={{ marginBottom: idx < total - 1 ? 48 : 0 }}>
                        <h1 style={{
                            fontFamily: '"SimHei", "Heiti SC", "Microsoft YaHei", sans-serif',
                            fontSize: 22, fontWeight: 700, color: '#1a1a2e',
                            margin: '0 0 12px', textIndent: 0,
                            borderBottom: '2px solid #2b2d42', paddingBottom: 8,
                        }}>{title}</h1>
                        {empty ? emptyNode : renderParagraphs({ lineHeight: 1.8 })}
                        {idx < total - 1 && <div style={{ margin: '36px 0 12px', borderTop: '1px solid #e0e0e0' }} />}
                    </div>
                );
            }
            case 'epub': {
                // 导出: <h1> + <p> 纯文本段落
                return (
                    <div key={ch.id} style={{
                        marginBottom: idx < total - 1 ? 48 : 0,
                        paddingBottom: idx < total - 1 ? 48 : 0,
                        borderBottom: idx < total - 1 ? '1px solid #e8e4d9' : 'none',
                    }}>
                        <h1 style={{
                            fontFamily: '"Georgia", serif',
                            fontSize: 24, fontWeight: 400, fontStyle: 'italic',
                            textAlign: 'center', color: '#5c4b37',
                            margin: '12px 0 4px', textIndent: 0,
                            letterSpacing: '0.1em',
                        }}>{title}</h1>
                        <div style={{ textAlign: 'center', margin: '0 0 24px', textIndent: 0 }}>
                            <span style={{ display: 'inline-block', width: 40, height: 1, background: '#c4a882', verticalAlign: 'middle' }} />
                            <span style={{ margin: '0 12px', color: '#c4a882', fontSize: 14 }}>✦</span>
                            <span style={{ display: 'inline-block', width: 40, height: 1, background: '#c4a882', verticalAlign: 'middle' }} />
                        </div>
                        {empty ? emptyNode : renderParagraphs()}
                    </div>
                );
            }
            case 'pdf': {
                // 导出: <h1> + <p text-indent:2em> 纯文本段落
                return (
                    <div key={ch.id} style={{
                        marginBottom: idx < total - 1 ? 40 : 0,
                        paddingBottom: idx < total - 1 ? 40 : 0,
                        borderBottom: idx < total - 1 ? '2px dashed #ccc' : 'none',
                    }}>
                        <h1 style={{
                            fontFamily: '"SimHei", "Heiti SC", sans-serif',
                            fontSize: 19, fontWeight: 700, color: '#111',
                            margin: '0 0 16px', textIndent: 0,
                        }}>{title}</h1>
                        {empty ? emptyNode : renderParagraphs({ lineHeight: 1.8, margin: '0.5em 0' })}
                    </div>
                );
            }
            default:
                return null;
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={e => { e.currentTarget._mouseDownTarget = e.target; }} onClick={e => { if (e.currentTarget._mouseDownTarget === e.currentTarget) onClose(); }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '90vw', maxWidth: showPreview ? 960 : 500, maxHeight: '85vh',
                display: 'flex', flexDirection: 'row',
                background: 'var(--bg-card)',
                borderRadius: 16,
                border: '1px solid var(--border-light)',
                boxShadow: '0 24px 48px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.05)',
                overflow: 'hidden',
                transition: 'max-width 0.3s ease',
            }}>
                {/* ===== 左侧：章节选择列表 ===== */}
                <div style={{
                    display: 'flex', flexDirection: 'column',
                    width: showPreview ? '40%' : '100%',
                    minWidth: showPreview ? 280 : 'auto',
                    transition: 'width 0.3s ease',
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
                            <span style={{ fontSize: 22, display: 'flex' }}><FileOutput size={22} /></span>
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
                        }}><X size={16} /></button>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                                onClick={() => {
                                    if (previewMode === 'all') {
                                        setPreviewMode(null);
                                    } else {
                                        setPreviewMode('all');
                                        setPreviewChapter(null);
                                    }
                                }}
                                title={t('sidebar.previewAll') || '全书预览'}
                                style={{
                                    background: previewMode === 'all' ? 'var(--accent)' : 'transparent',
                                    border: '1px solid', borderColor: previewMode === 'all' ? 'var(--accent)' : 'var(--border-light)',
                                    borderRadius: 6,
                                    color: previewMode === 'all' ? '#fff' : 'var(--text-secondary)',
                                    padding: '3px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <Book size={14} style={{ flexShrink: 0 }} /> {t('sidebar.previewAll') || '全书预览'}
                            </button>
                            <span style={{
                                fontSize: 12, fontWeight: 600,
                                background: selected.size > 0 ? 'var(--accent)' : 'transparent',
                                color: selected.size > 0 ? '#fff' : 'var(--text-secondary)',
                                padding: '2px 10px', borderRadius: 12,
                                border: selected.size > 0 ? '1px solid var(--accent)' : '1px solid var(--border-light)',
                                transition: 'all 0.2s',
                            }}>
                                {selected.size} / {chapters.length}
                            </span>
                        </div>
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
                                    {group.map(ch => {
                                        const isPreviewing = previewChapter?.id === ch.id;
                                        return (
                                            <div key={ch.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                fontSize: 13, padding: '4px 4px 4px 24px',
                                                color: selected.has(ch.id) ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                borderRadius: 6,
                                                background: isPreviewing ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : selected.has(ch.id) ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                                                transition: 'background 0.15s',
                                                border: isPreviewing ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid transparent',
                                            }}
                                                onMouseEnter={e => { if (!selected.has(ch.id) && !isPreviewing) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                                                onMouseLeave={e => { if (!selected.has(ch.id) && !isPreviewing) e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 0, padding: '2px 0' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(ch.id)}
                                                        onChange={() => toggleChapter(ch.id)}
                                                        style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
                                                    />
                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected.has(ch.id) ? 500 : 400 }}>
                                                        {ch.title || t('sidebar.untitled') || '未命名'}
                                                    </span>
                                                </label>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', marginRight: 2 }}>
                                                    {(ch.wordCount || 0).toLocaleString()}{t('sidebar.wordUnit') || '字'}
                                                </span>
                                                {/* 预览按钮 */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isPreviewing) {
                                                            setPreviewChapter(null);
                                                            setPreviewMode(null);
                                                        } else {
                                                            setPreviewChapter(ch);
                                                            setPreviewMode('single');
                                                        }
                                                    }}
                                                    title={t('sidebar.previewChapter') || '预览章节'}
                                                    style={{
                                                        background: isPreviewing ? 'var(--accent)' : 'transparent',
                                                        border: 'none', borderRadius: 4,
                                                        color: isPreviewing ? '#fff' : 'var(--text-muted)',
                                                        width: 24, height: 24, flexShrink: 0,
                                                        cursor: 'pointer', fontSize: 13,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        transition: 'all 0.15s',
                                                        opacity: isPreviewing ? 1 : 0.6,
                                                    }}
                                                    onMouseEnter={e => { if (!isPreviewing) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--bg-secondary)'; } }}
                                                    onMouseLeave={e => { if (!isPreviewing) { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'transparent'; } }}
                                                >
                                                    <Eye size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>

                    {/* 底部操作栏 */}
                    <div style={{
                        padding: '14px 20px',
                        borderTop: '1px solid var(--border-light)',
                        background: 'var(--bg-secondary)',
                        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>内容</span>
                            {variants.map(v => (
                                <button
                                    key={v.value}
                                    onClick={() => setVariant(v.value)}
                                    title={v.hint}
                                    style={{
                                        padding: '5px 12px', fontSize: 12, fontWeight: 600,
                                        borderRadius: 8, border: '1px solid',
                                        borderColor: variant === v.value ? 'var(--accent)' : 'var(--border-light)',
                                        background: variant === v.value ? 'var(--accent-light)' : 'transparent',
                                        color: variant === v.value ? 'var(--accent)' : 'var(--text-secondary)',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                                    onExport(selectedChapters, format, {
                                        variant,
                                        includeRemarks: variant === 'annotated',
                                    });
                                }}
                                style={{
                                    flexShrink: 0, padding: '8px 20px', fontSize: 13, fontWeight: 600,
                                    borderRadius: 10, opacity: selected.size === 0 ? 0.5 : 1,
                                }}
                            >
                                {variant === 'annotated' ? '导出批注版' : (t('sidebar.exportBtn') || '导出')} ({selected.size})
                            </button>
                        </div>
                    </div>
                </div>

                {/* ===== 右侧：预览面板 (单章 / 全书) ===== */}
                {showPreview && (
                    <div style={{
                        width: '60%',
                        display: 'flex', flexDirection: 'column',
                        borderLeft: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        overflow: 'hidden',
                        animation: 'fadeInRight 0.2s ease',
                    }}>
                        {/* 预览头部 */}
                        <div style={{
                            padding: '14px 20px',
                            borderBottom: '1px solid var(--border-light)',
                            background: 'var(--bg-secondary)',
                            display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                            {previewMode === 'single' && previewChapter && (
                                <>
                                    <button
                                        onClick={() => navigatePreview(-1)}
                                        disabled={chapters.findIndex(ch => ch.id === previewChapter.id) === 0}
                                        style={{
                                            background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 6,
                                            width: 28, height: 28, cursor: 'pointer', fontSize: 13,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'var(--text-secondary)', opacity: chapters.findIndex(ch => ch.id === previewChapter.id) === 0 ? 0.3 : 1,
                                            transition: 'all 0.15s',
                                        }}
                                        title={t('sidebar.previewPrev') || '上一章'}
                                    >◀</button>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <Book size={14} style={{ flexShrink: 0, marginRight: 4 }} />{previewChapter.title || t('sidebar.untitled') || '未命名'}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                            {(previewChapter.wordCount || 0).toLocaleString()}{t('sidebar.wordUnit') || '字'}
                                            {' · '}
                                            {t('sidebar.previewLabel') || '预览'}
                                            {' · '}
                                            {variant === 'annotated' ? '批注版' : '正文'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigatePreview(1)}
                                        disabled={chapters.findIndex(ch => ch.id === previewChapter.id) === chapters.length - 1}
                                        style={{
                                            background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 6,
                                            width: 28, height: 28, cursor: 'pointer', fontSize: 13,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'var(--text-secondary)', opacity: chapters.findIndex(ch => ch.id === previewChapter.id) === chapters.length - 1 ? 0.3 : 1,
                                            transition: 'all 0.15s',
                                        }}
                                        title={t('sidebar.previewNext') || '下一章'}
                                    >▶</button>
                                </>
                            )}
                            {previewMode === 'all' && (
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        <Book size={14} style={{ flexShrink: 0, marginRight: 4 }} />{t('sidebar.previewAll') || '全书预览'}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {chapters.length} {t('sidebar.exportGroupSuffix') || '章'}
                                        {' · '}
                                        {totalWords.toLocaleString()}{t('sidebar.wordUnit') || '字'}
                                        {' · '}
                                        {variant === 'annotated' ? '批注版' : '正文'}
                                    </div>
                                </div>
                            )}
                            <button
                                onClick={() => { setPreviewChapter(null); setPreviewMode(null); }}
                                style={{
                                    background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 6,
                                    width: 28, height: 28, cursor: 'pointer', fontSize: 14,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--text-muted)', transition: 'all 0.15s',
                                }}
                                title={t('sidebar.previewClose') || '关闭预览'}
                            ><X size={14} /></button>
                        </div>
                        {/* 预览内容 — 根据格式不同应用不同样式 */}
                        <div style={{
                            flex: 1, overflowY: 'auto', padding: '24px 28px',
                            color: 'var(--text-primary)',
                        }}>
                            <div style={{
                                wordBreak: 'break-word', overflowWrap: 'break-word',
                                ...(formatContainerStyle[format] || {}),
                            }}>
                                {previewMode === 'single' && previewChapter && (
                                    renderChapterBlock(previewChapter, 0, 1)
                                )}
                                {previewMode === 'all' && (
                                    chapters.map((ch, idx) => renderChapterBlock(ch, idx, chapters.length))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
