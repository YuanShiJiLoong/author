'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useAppStore } from './store/useAppStore';
import { useI18n } from './lib/useI18n';
import {
  getChapters,
  createChapter,
  updateChapter,
  deleteChapter,
  exportToMarkdown,
  exportAllToMarkdown,
} from './lib/storage';
import { buildContext, compileSystemPrompt, compileUserPrompt, OUTPUT_TOKEN_BUDGET, getContextItems, estimateTokens } from './lib/context-engine';
import { getProjectSettings, WRITING_MODES, getWritingMode, addSettingsNode, updateSettingsNode, deleteSettingsNode, getSettingsNodes, getActiveWorkId } from './lib/settings';
import {
  loadSessionStore, createSession, getActiveSession,
} from './lib/chat-sessions';
import { exportProject, importProject } from './lib/project-io';
import { createSnapshot } from './lib/snapshots';
// 动态导入编辑器和设定集面板及侧边栏（避免 SSR 问题）
const Sidebar = dynamic(() => import('./components/Sidebar'), { ssr: false });
const Editor = dynamic(() => import('./components/Editor'), { ssr: false });
const SettingsPanel = dynamic(() => import('./components/SettingsPanel'), { ssr: false });
const HelpPanel = dynamic(() => import('./components/HelpPanel'), { ssr: false });
const TourOverlay = dynamic(() => import('./components/TourOverlay'), { ssr: false });
const AiSidebar = dynamic(() => import('./components/AiSidebar'), { ssr: false });
const SnapshotManager = dynamic(() => import('./components/SnapshotManager'), { ssr: false });
const WelcomeModal = dynamic(() => import('./components/WelcomeModal'), { ssr: false });

export default function Home() {
  const {
    chapters, setChapters, addChapter, updateChapter: updateChapterStore,
    activeChapterId, setActiveChapterId,
    sidebarOpen, setSidebarOpen, toggleSidebar,
    aiSidebarOpen, setAiSidebarOpen, toggleAiSidebar,
    showSettings, setShowSettings,
    showSnapshots, setShowSnapshots,
    theme, setTheme,
    writingMode, setWritingMode,
    toast, showToast,
    contextSelection, setContextSelection,
    contextItems, setContextItems,
    settingsVersion, incrementSettingsVersion,
    sessionStore, setSessionStore,
    generationArchive, setGenerationArchive,
    chatStreaming, setChatStreaming
  } = useAppStore();

  const { t } = useI18n();
  const [showHelp, setShowHelp] = useState(false);
  const editorRef = useRef(null);

  // 派生：当前活动会话和消息列表
  const activeSession = useMemo(() => getActiveSession(sessionStore), [sessionStore]);
  const chatHistory = useMemo(() => activeSession?.messages || [], [activeSession]);

  // 初始化数据
  useEffect(() => {
    const initData = async () => {
      const saved = await getChapters();
      if (saved.length === 0) {
        const first = await createChapter(t('page.firstChapterTitle'));
        setChapters([first]);
        setActiveChapterId(first.id);
      } else {
        setChapters(saved);
        setActiveChapterId(saved[0].id);
      }
      const savedTheme = localStorage.getItem('author-theme') || 'light';
      setTheme(savedTheme);
      setWritingMode(getWritingMode());

      // 加载会话数据
      let store = await loadSessionStore();
      if (store.sessions.length === 0) {
        // 首次使用：创建一个空会话
        store = createSession(store);
      }
      setSessionStore(store);
    };
    initData();
  }, []);

  // 初始化上下文条目和勾选状态（设定集 + 章节 + 对话历史）
  useEffect(() => {
    if (!activeChapterId) return;

    const loadContext = async () => {
      const baseItems = await getContextItems(activeChapterId);

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

      // 默认全选启用的条目（仅首次）
      setContextSelection(prev => {
        if (prev.size === 0) {
          return new Set(allItems.filter(it => it.enabled).map(it => it.id));
        }
        // 自动加入新出现的条目
        const next = new Set(prev);
        for (const item of allItems) {
          if (item.enabled && !prev.has(item.id)) {
            next.add(item.id);
          }
        }
        return next;
      });
    };

    loadContext();
  }, [activeChapterId, settingsVersion, chatHistory.length]);

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
  const activeChapter = chapters.find(ch => ch.id === activeChapterId);

  const handleEditorUpdate = useCallback(async ({ html, wordCount }) => {
    if (!activeChapterId) return;
    const updated = await updateChapter(activeChapterId, {
      content: html,
      wordCount,
    });
    if (updated) {
      updateChapterStore(activeChapterId, { content: html, wordCount });
    }
  }, [activeChapterId, updateChapterStore]);

  // Inline AI 回调：编辑器调用此函数发起 AI 请求
  const handleInlineAiRequest = useCallback(async ({ mode, text, instruction, signal, onChunk }) => {
    try {
      // 使用上下文引擎收集项目信息
      const context = await buildContext(activeChapterId, text, contextSelection.size > 0 ? contextSelection : null);
      const systemPrompt = compileSystemPrompt(context, mode);
      const userPrompt = compileUserPrompt(mode, text, instruction);

      const { apiConfig } = getProjectSettings();
      const apiEndpoint = apiConfig?.provider === 'gemini-native' ? '/api/ai/gemini' : '/api/ai';

      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, userPrompt, apiConfig, maxTokens: OUTPUT_TOKEN_BUDGET }),
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
              if (json.text) onChunk(json.text);
            } catch {
              // 解析失败跳过
            }
          }
        }
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
    <div className="app-layout">
      {/* ===== 侧边栏 ===== */}
      <Sidebar />

      {/* ===== 主内容 ===== */}
      <main className="main-content">
        {!sidebarOpen && (
          <button
            className="btn btn-ghost btn-icon"
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              zIndex: 10,
            }}
            onClick={() => setSidebarOpen(true)}
            title={t('page.expandSidebar')}
          >
            ☰
          </button>
        )}

        {activeChapter ? (
          <Editor
            id="tour-editor"
            ref={editorRef}
            key={activeChapterId}
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
        {/* AI 侧栏浮动开关 */}
        {!aiSidebarOpen && (
          <button
            id="tour-ai-btn"
            className="ai-sidebar-toggle"
            onClick={() => setAiSidebarOpen(true)}
            title={t('page.openAiAssistant')}
          >
            ✦
          </button>
        )}

        {/* 帮助与向导按钮 */}
        <button
          id="tour-help"
          className="btn btn-secondary btn-icon"
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            zIndex: 40,
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            boxShadow: 'var(--shadow-md)',
            fontSize: '18px',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: 0.8
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
          onClick={() => setShowHelp(true)}
          title={t('page.helpAndGuide')}
        >
          📖
        </button>
      </main>

      {/* ===== AI 对话侧栏 ===== */}
      <AiSidebar onInsertText={handleInsertFromArchive} />


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
      <SnapshotManager />

      {/* ===== 帮助文档 ===== */}
      <HelpPanel open={showHelp} onClose={() => setShowHelp(false)} />

      {/* ===== 首次引导 ===== */}
      <TourOverlay onOpenHelp={() => setShowHelp(true)} />
      <WelcomeModal />
    </div>
  );
}
