'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useAppStore } from './store/useAppStore';
import { useI18n } from './lib/useI18n';
import { Menu, Sparkles, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import Tooltip from './components/ui/Tooltip';
import {
  getChapters,
  createChapter,
  updateChapter,
  deleteChapter,
  exportToMarkdown,
  exportAllToMarkdown,
  migrateGlobalChapters,
  saveChapters,
} from './lib/storage';
import { initPersistence } from './lib/persistence';
import { buildContext, compileSystemPrompt, compileUserPrompt, getContextItems, estimateTokens } from './lib/context-engine';
import { addTokenRecord } from './lib/token-stats';
import { getProjectSettings, WRITING_MODES, getWritingMode, addSettingsNode, updateSettingsNode, deleteSettingsNode, getSettingsNodes, getActiveWorkId } from './lib/settings';
import {
  loadSessionStore, saveSessionStore, createSession, getActiveSession,
} from './lib/chat-sessions';
import { exportProject, importProject } from './lib/project-io';
import { createSnapshot } from './lib/snapshots';
// 动态导入编辑器和设定集面板及侧边栏（避免 SSR 问题）
const Sidebar = dynamic(() => import('./components/Sidebar'), { ssr: false });
const Editor = dynamic(() => import('./components/Editor'), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, background: 'var(--bg-canvas)', transition: 'none' }} />
  ),
});
const SettingsPanel = dynamic(() => import('./components/SettingsPanel'), { ssr: false });
const CategorySettingsModal = dynamic(() => import('./components/CategorySettingsModal'), { ssr: false });
const HelpPanel = dynamic(() => import('./components/HelpPanel'), { ssr: false });
const TourOverlay = dynamic(() => import('./components/TourOverlay'), { ssr: false });
const AiSidebar = dynamic(() => import('./components/AiSidebar'), { ssr: false });
const SnapshotManager = dynamic(() => import('./components/SnapshotManager'), { ssr: false });
const WelcomeModal = dynamic(() => import('./components/WelcomeModal'), { ssr: false });
const UpdateBanner = dynamic(() => import('./components/UpdateBanner'), { ssr: false });
const BookInfoPanel = dynamic(() => import('./components/BookInfoPanel'), { ssr: false });
const CloudSyncIndicator = dynamic(() => import('./components/CloudSyncIndicator'), { ssr: false });
const LoginModal = dynamic(() => import('./components/LoginModal'), { ssr: false });
const AccountModal = dynamic(() => import('./components/AccountModal'), { ssr: false });
const RegisterModal = dynamic(() => import('./components/RegisterModal'), { ssr: false });
const SyncGuideModal = dynamic(() => import('./components/SyncGuideModal'), { ssr: false });

export default function Home() {
  const {
    chapters, setChapters, addChapter, updateChapter: updateChapterStore,
    activeChapterId, setActiveChapterId,
    activeWorkId, setActiveWorkId: setActiveWorkIdStore,
    sidebarOpen, setSidebarOpen, toggleSidebar,
    aiSidebarOpen, setAiSidebarOpen, toggleAiSidebar,
    sidebarPushMode, aiSidebarPushMode, _hydrateSidebarModes,
    showSettings, setShowSettings,
    showSnapshots, setShowSnapshots,
    theme, setTheme,
    writingMode, setWritingMode,
    toast, showToast,
    contextSelection, setContextSelection,
    contextItems, setContextItems,
    settingsVersion, incrementSettingsVersion,
    setPendingEditorSaveFlusher,
    sessionStore, setSessionStore,
    generationArchive, setGenerationArchive,
    chatStreaming, setChatStreaming
  } = useAppStore();

  const { t } = useI18n();
  const [showHelp, setShowHelp] = useState(false);
  const editorRef = useRef(null);
  const sessionStoreHydratedRef = useRef(false);
  const latestSessionStoreRef = useRef(sessionStore);
  const sessionAutosaveTimerRef = useRef(null);
  const flushPendingEditorSave = useCallback(async () => {
    if (!editorRef.current?.flushPendingSave) {
      return { changed: false };
    }
    return await editorRef.current.flushPendingSave();
  }, []);

  const flushSessionStoreSave = useCallback(async () => {
    const currentStore = latestSessionStoreRef.current;
    if (!currentStore || !Array.isArray(currentStore.sessions)) return;
    await saveSessionStore(currentStore);
  }, []);

  const scheduleSessionStoreSave = useCallback((delay = 500) => {
    if (sessionAutosaveTimerRef.current) return;
    sessionAutosaveTimerRef.current = window.setTimeout(async () => {
      sessionAutosaveTimerRef.current = null;
      await flushSessionStoreSave();
    }, delay);
  }, [flushSessionStoreSave]);

  useEffect(() => {
    setPendingEditorSaveFlusher(flushPendingEditorSave);
    return () => setPendingEditorSaveFlusher(null);
  }, [flushPendingEditorSave, setPendingEditorSaveFlusher]);

  // ===== AI 助手按钮拖拽位置 =====
  const [aiTogglePos, setAiTogglePos] = useState(null);
  const aiToggleDragRef = useRef(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ai-toggle-pos'));
      if (saved) setAiTogglePos(saved);
    } catch {}
  }, []);

  // ===== 侧栏宽度拖拽调整 =====
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(380);
  const draggingRef = useRef(null); // 'left' | 'right' | null
  const layoutRef = useRef(null);

  // 从 localStorage 恢复宽度
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sidebar-widths') || '{}');
      if (saved.left) setLeftWidth(saved.left);
      if (saved.right) setRightWidth(saved.right);
    } catch { }
  }, []);

  const startDrag = useCallback((side, e) => {
    e.preventDefault();
    draggingRef.current = side;
    const startX = e.clientX;
    const startW = side === 'left' ? leftWidth : rightWidth;
    let lastW = startW;
    let rafId = 0;
    const el = layoutRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('resizing');

    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      if (side === 'left') {
        lastW = Math.max(120, Math.min(800, startW + delta));
      } else {
        lastW = Math.max(200, Math.min(800, startW - delta));
      }
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          if (el) el.style.setProperty(side === 'left' ? '--sidebar-w' : '--ai-sidebar-w', lastW + 'px');
          rafId = 0;
        });
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (rafId) cancelAnimationFrame(rafId);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('resizing');
      draggingRef.current = null;
      if (side === 'left') setLeftWidth(lastW);
      else setRightWidth(lastW);
      try {
        const cur = JSON.parse(localStorage.getItem('sidebar-widths') || '{}');
        if (side === 'left') cur.left = lastW;
        else cur.right = lastW;
        localStorage.setItem('sidebar-widths', JSON.stringify(cur));
      } catch { }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [leftWidth, rightWidth]);

  // 客户端水合后加载 localStorage 中的侧边栏布局偏好
  useEffect(() => { _hydrateSidebarModes(); }, []);

  // 监听工具栏高度，设置 CSS 变量供侧边栏定位使用
  useEffect(() => {
    const updateToolbarHeight = () => {
      const toolbar = document.querySelector('.editor-toolbar');
      const main = document.querySelector('.main-content');
      if (toolbar && main) {
        const h = toolbar.offsetHeight + 'px';
        main.style.setProperty('--toolbar-h', h);
        document.documentElement.style.setProperty('--toolbar-h', h);
      }
    };
    const observer = new ResizeObserver(updateToolbarHeight);
    const tryObserve = () => {
      const toolbar = document.querySelector('.editor-toolbar');
      if (toolbar) {
        observer.observe(toolbar);
        updateToolbarHeight();
      } else {
        requestAnimationFrame(tryObserve);
      }
    };
    tryObserve();
    return () => observer.disconnect();
  }, [activeChapterId]);

  // 派生：当前活动会话和消息列表
  const activeSession = useMemo(() => getActiveSession(sessionStore), [sessionStore]);
  const chatHistory = useMemo(() => activeSession?.messages || [], [activeSession]);

  // 加载指定作品的章节
  const loadChaptersForWork = useCallback(async (workId) => {
    let saved = await getChapters(workId);
    // 自动修复：过滤掉损坏的章节数据
    if (Array.isArray(saved)) {
      const cleaned = saved.filter(ch => ch && typeof ch === 'object' && ch.id);
      if (cleaned.length !== saved.length) {
        console.warn(`[数据修复] 发现 ${saved.length - cleaned.length} 条损坏的章节数据，已自动清理`);
        saved = cleaned;
        await saveChapters(saved, workId);
      }
    } else {
      saved = [];
    }
    if (saved.length === 0) {
      const first = await createChapter(t('page.firstChapterTitle'), workId);
      setChapters([first]);
      setActiveChapterId(first.id);
    } else {
      setChapters(saved);
      setActiveChapterId(saved[0].id);
    }
  }, [t, setChapters, setActiveChapterId]);

  // 初始化数据
  useEffect(() => {
    const initData = async () => {
      // 初始化 Firebase（如果已配置）
      await initPersistence();

      const workId = getActiveWorkId();
      if (workId) {
        setActiveWorkIdStore(workId);
        // 一次性迁移旧全局章节
        await migrateGlobalChapters(workId);
      }
      await loadChaptersForWork(workId);

      const savedTheme = localStorage.getItem('author-theme') || 'light';
      setTheme(savedTheme);
      // 恢复视觉主题（经典纸张 / 现代通透）
      const savedVisual = localStorage.getItem('author-visual');
      if (savedVisual) {
        document.documentElement.setAttribute('data-visual', savedVisual);
      }
      setWritingMode(getWritingMode());

      // 加载会话数据
      let store = await loadSessionStore();
      if (store.sessions.length === 0) {
        store = createSession(store);
      }
      setSessionStore(store);
      sessionStoreHydratedRef.current = true;
    };
    initData();
  }, []);

  useEffect(() => {
    latestSessionStoreRef.current = sessionStore;
    if (!sessionStoreHydratedRef.current) return;
    scheduleSessionStoreSave(chatStreaming ? 1000 : 300);
  }, [sessionStore, chatStreaming, scheduleSessionStoreSave]);

  useEffect(() => {
    const flushNow = () => {
      if (!sessionStoreHydratedRef.current) return;
      if (sessionAutosaveTimerRef.current) {
        window.clearTimeout(sessionAutosaveTimerRef.current);
        sessionAutosaveTimerRef.current = null;
      }
      flushSessionStoreSave();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', flushNow);
      if (sessionAutosaveTimerRef.current) {
        window.clearTimeout(sessionAutosaveTimerRef.current);
        sessionAutosaveTimerRef.current = null;
      }
    };
  }, [flushSessionStoreSave]);

  // 切换作品时重新加载章节
  const prevWorkIdRef = useRef(activeWorkId);
  useEffect(() => {
    if (prevWorkIdRef.current === activeWorkId) return;
    prevWorkIdRef.current = activeWorkId;
    loadChaptersForWork(activeWorkId);
  }, [activeWorkId, loadChaptersForWork]);

  // 章节指纹 —— 当章节改名或拖动排序时会变化，触发上下文列表重建
  const chaptersFingerprint = useMemo(
    () => (Array.isArray(chapters) ? chapters.map(ch => `${ch.id}:${ch.title}`).join('|') : ''),
    [chapters]
  );

  // 初始化上下文条目和勾选状态（设定集 + 章节 + 对话历史）
  useEffect(() => {
    if (!activeChapterId) return;

    const loadContext = async () => {
      const baseItems = await getContextItems(activeChapterId, chapters);

      // 追加对话历史条目 — 逐条生成，供参考面板单独勾选
      const chatItems = chatHistory.map((m, i) => {
        const label = m.role === 'user' ? t('page.dialogueUser') : m.isSummary ? t('aiSidebar.roleSummary') : 'AI';
        const preview = m.content.slice(0, 25) + (m.content.length > 25 ? '…' : '');
        return {
          id: `dialogue-${m.id}`,
          group: t('page.dialogueHistory'),
          name: `${label}: ${preview}`,
          tokens: estimateTokens(m.content),
          category: 'dialogue',
          enabled: true,
          _msgId: m.id,
        };
      });

      const allItems = [...baseItems, ...chatItems];
      setContextItems(allItems);

      // 仅首次使用（localStorage无记录）时默认全选启用条目，之后记住用户的勾选
      setContextSelection(prev => {
        if (prev.size === 0 && !localStorage.getItem('author-context-selection')) {
          return new Set(allItems.filter(it => it.enabled).map(it => it.id));
        }
        return prev;
      });
    };

    loadContext();
  }, [activeChapterId, settingsVersion, chatHistory.length, chaptersFingerprint]);

  // 定时自动存档 (每 15 分钟)
  useEffect(() => {
    // 首次加载后延迟 5 分钟做一次初始存档，之后每 15 分钟做一次
    const initialTimer = setTimeout(() => {
      createSnapshot(t('page.autoSnapshot'), 'auto').catch(e => console.error(t('page.autoSnapshotFail'), e));
    }, 5 * 60 * 1000);

    const intervalTimer = setInterval(() => {
      createSnapshot(t('page.autoSnapshot'), 'auto').catch(e => console.error(t('page.autoSnapshotFail'), e));
    }, 15 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  // 当前活跃章节
  const activeChapter = Array.isArray(chapters) ? chapters.find(ch => ch.id === activeChapterId) : null;

  const handleEditorUpdate = useCallback(async ({ chapterId: targetChapterId, html, wordCount }) => {
    const chapterIdToSave = targetChapterId || activeChapterId;
    if (!chapterIdToSave) return;
    const updated = await updateChapter(chapterIdToSave, {
      content: html,
      wordCount,
    }, activeWorkId);
    if (updated) {
      updateChapterStore(chapterIdToSave, { content: html, wordCount });
    }
  }, [activeChapterId, activeWorkId, updateChapterStore]);

  // Inline AI 回调：编辑器调用此函数发起 AI 请求
  const handleInlineAiRequest = useCallback(async ({ mode, text, instruction, signal, onChunk }) => {
    const startTime = Date.now();
    let usageData = null;
    let fullText = '';
    try {
      // 使用上下文引擎收集项目信息
      const context = await buildContext(activeChapterId, text, contextSelection.size > 0 ? contextSelection : null);
      const systemPrompt = compileSystemPrompt(context, mode);
      const userPrompt = compileUserPrompt(mode, text, instruction);

      const { apiConfig } = getProjectSettings();
      const pType = apiConfig?.providerType || apiConfig?.provider;
      const apiEndpoint = ['gemini-native', 'custom-gemini'].includes(pType) ? '/api/ai/gemini'
        : pType === 'openai-responses' ? '/api/ai/responses'
          : (['claude', 'custom-claude'].includes(pType) || apiConfig?.apiFormat === 'anthropic') ? '/api/ai/claude'
            : '/api/ai';

      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt, userPrompt, apiConfig,
          ...(apiConfig?.useAdvancedParams ? {
            ...(apiConfig.enableMaxOutputTokens ? { maxTokens: apiConfig.maxOutputTokens || 65536 } : {}),
            ...(apiConfig.enableTemperature ? { temperature: apiConfig.temperature ?? 1 } : {}),
            ...(apiConfig.enableTopP ? { topP: apiConfig.topP ?? 0.95 } : {}),
            ...(apiConfig.enableReasoningEffort ? { reasoningEffort: apiConfig.reasoningEffort || 'auto' } : {}),
          } : {}),
        }),
        signal,
      });

      // 错误响应（JSON）
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        showToast(data.error || t('page.toastRequestFailed'), 'error');
        return;
      }

      // 读取 SSE 流
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const trimmed = event.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              if (json.text) { fullText += json.text; onChunk(json.text); }
              if (json.usage) { usageData = json.usage; }
            } catch {
              // 解析失败跳过
            }
          }
        }
      }

      // 记录 token 统计
      const durationMs = Date.now() - startTime;
      if (usageData) {
        addTokenRecord({
          promptTokens: usageData.promptTokens || 0,
          completionTokens: usageData.completionTokens || 0,
          totalTokens: usageData.totalTokens || 0,
          cachedTokens: usageData.cachedTokens || 0,
          durationMs,
          source: 'inline',
          provider: apiConfig?.provider || 'unknown',
          model: apiConfig?.model || 'unknown',
        });
      } else {
        // API 未返回 usage，客户端估算
        const estPrompt = estimateTokens(systemPrompt + userPrompt);
        const estCompletion = estimateTokens(fullText);
        addTokenRecord({
          promptTokens: estPrompt,
          completionTokens: estCompletion,
          totalTokens: estPrompt + estCompletion,
          durationMs,
          source: 'inline',
          provider: apiConfig?.provider || 'unknown',
          model: apiConfig?.model || 'unknown',
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        showToast(t('page.toastStopped'), 'info');
      } else {
        showToast(t('page.toastNetworkError'), 'error');
        throw err;
      }
    }
  }, [activeChapterId, contextSelection, showToast]);

  // AI 生成存档 — Editor 的 ghost text 操作会调用此函数
  const handleArchiveGeneration = useCallback((entry) => {
    const record = {
      id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      chapterId: activeChapterId,
      ...entry,
    };
    useAppStore.getState().addGenerationArchive(record);
  }, [activeChapterId]);



  // 从存档插入文本到编辑器
  const handleInsertFromArchive = useCallback((text) => {
    if (editorRef.current) {
      editorRef.current.insertText?.(text);
      showToast(t('page.toastInserted'), 'success');
    }
  }, [showToast]);

  return (
    <div ref={layoutRef} className={`app-layout${aiSidebarOpen ? ' ai-open' : ''}${!aiSidebarPushMode ? ' ai-overlay' : ''}${sidebarPushMode && sidebarOpen ? ' sidebar-push-open' : ''}`} style={{ '--sidebar-w': leftWidth + 'px', '--ai-sidebar-w': rightWidth + 'px' }}>
      {/* ===== 更新提示 ===== */}
      <UpdateBanner />

      {/* ===== 顶栏（Google Docs 风格，全宽，只含 Logo）===== */}
      <header className="top-header-bar">
        <div className="top-header-left">
          <div className="top-header-logo">
            <span>A</span>uthor
          </div>
        </div>
        <div className="top-header-right">
          <CloudSyncIndicator />
        </div>
      </header>

      {/* ===== 内容区域（编辑器 + AI 侧栏）===== */}
      <div className="content-row">
        {/* 挤开模式：侧边栏放在 main 外面 */}
        {sidebarPushMode && (
          <>
            <Sidebar pushMode onOpenHelp={() => setShowHelp(true)} onToggle={() => setSidebarOpen(!sidebarOpen)} editorRef={editorRef} />
            {sidebarOpen && <div className="resize-handle resize-handle-left" onMouseDown={e => startDrag('left', e)} />}
          </>
        )}

        {/* ===== 主内容 ===== */}
        <main className="main-content">
          {activeChapter ? (
            <Editor
              id="tour-editor"
              ref={editorRef}
              chapterId={activeChapterId}
              content={activeChapter.content}
              onUpdate={handleEditorUpdate}
              onAiRequest={handleInlineAiRequest}
              onArchiveGeneration={handleArchiveGeneration}
              contextItems={contextItems}
              contextSelection={contextSelection}
              setContextSelection={setContextSelection}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '16px',
            }}>
              {t('page.noChapterHint')}
            </div>
          )}

          {/* 覆盖模式：侧边栏放在 main 里面 */}
          {!sidebarPushMode && (
            <>
              <Sidebar onOpenHelp={() => setShowHelp(true)} onToggle={() => setSidebarOpen(!sidebarOpen)} editorRef={editorRef} />
              {sidebarOpen && <div className="resize-handle resize-handle-left overlay" onMouseDown={e => startDrag('left', e)} />}
            </>
          )}



          {/* AI 侧栏浮动开关（可拖拽） */}
          {!aiSidebarOpen && (
            <Tooltip content={t('page.openAiAssistant')} side="left">
              <button
                id="tour-ai-btn"
                className="ai-sidebar-toggle"
                onPointerDown={(e) => {
                  e.preventDefault();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const btn = e.currentTarget;
                  const rect = btn.getBoundingClientRect();
                  let moved = false;

                  const onMove = (ev) => {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                    if (!moved) {
                      btn.style.transition = 'none';
                      btn.style.animation = 'none';
                    }
                    moved = true;
                    const newX = Math.max(0, Math.min(window.innerWidth - rect.width, rect.left + dx));
                    const newY = Math.max(0, Math.min(window.innerHeight - rect.height, rect.top + dy));
                    btn.style.left = newX + 'px';
                    btn.style.top = newY + 'px';
                    btn.style.right = 'auto';
                    btn.style.transform = 'none';
                    aiToggleDragRef.current = { left: newX, top: newY };
                  };
                  const onUp = () => {
                    document.removeEventListener('pointermove', onMove);
                    document.removeEventListener('pointerup', onUp);
                    btn.style.transition = '';
                    btn.style.animation = '';
                    if (moved && aiToggleDragRef.current) {
                      setAiTogglePos(aiToggleDragRef.current);
                      try { localStorage.setItem('ai-toggle-pos', JSON.stringify(aiToggleDragRef.current)); } catch {}
                    } else {
                      setAiSidebarOpen(true);
                    }
                  };
                  document.addEventListener('pointermove', onMove);
                  document.addEventListener('pointerup', onUp);
                }}
                aria-label={t('page.openAiAssistant')}
                style={aiTogglePos ? { left: aiTogglePos.left, top: aiTogglePos.top, right: 'auto', transform: 'none' } : undefined}
              >
                <Sparkles size={16} />
                <span>{t('page.aiAssistantLabel') || 'AI 助手'}</span>
              </button>
            </Tooltip>
          )}
        </main>

        {/* ===== AI 对话侧栏 ===== */}
        {aiSidebarOpen && <div className="resize-handle resize-handle-right" onMouseDown={e => startDrag('right', e)} />}
        <AiSidebar onInsertText={handleInsertFromArchive} />
      </div>

      {/* ===== Toast 通知 ===== */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.type === 'success' && '✓ '}
            {toast.type === 'error' && '✗ '}
            {toast.type === 'info' && 'ℹ '}
            {toast.message}
          </div>
        </div>
      )}

      {/* ===== 设定库弹窗 ===== */}
      <SettingsPanel />
      <CategorySettingsModal />
      <BookInfoPanel />
      <SnapshotManager />

      {/* ===== 帮助文档 ===== */}
      <HelpPanel open={showHelp} onClose={() => setShowHelp(false)} />

      {/* ===== 首次引导 ===== */}
      <TourOverlay onOpenHelp={() => setShowHelp(true)} />
      <LoginModal />
      <AccountModal />
      <RegisterModal />
      <WelcomeModal />
      <SyncGuideModal />
    </div>
  );
}
