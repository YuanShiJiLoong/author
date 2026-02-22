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
  const [fabPositions, setFabPositions] = useState({ github: { right: 24, bottom: 76 }, help: { right: 24, bottom: 24 } });
  const editorRef = useRef(null);

  // 加载浮动按钮位置
  useEffect(() => {
    const gh = JSON.parse(localStorage.getItem('author-fab-github') || 'null');
    const hp = JSON.parse(localStorage.getItem('author-fab-help') || 'null');
    if (gh || hp) setFabPositions(prev => ({ github: gh || prev.github, help: hp || prev.help }));
  }, []);

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

      // 仅首次使用（localStorage无记录）时默认全选启用条目，之后记住用户的勾选
      setContextSelection(prev => {
        if (prev.size === 0 && !localStorage.getItem('author-context-selection')) {
          return new Set(allItems.filter(it => it.enabled).map(it => it.id));
        }
        return prev;
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

        {/* 独立可拖动浮动按钮 */}
        {['github', 'help'].map(btnKey => {
          const storageKey = `author-fab-${btnKey}`;
          const pos = fabPositions[btnKey];
          const makeDraggable = (e) => {
            const el = e.currentTarget;
            const parentRect = el.parentElement.getBoundingClientRect();
            const rect = el.getBoundingClientRect();
            const startX = e.clientX, startY = e.clientY;
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            let dragging = false;
            const onMove = (ev) => {
              if (!dragging && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5) return;
              dragging = true;
              ev.preventDefault();
              const r = Math.max(0, Math.min(parentRect.width - rect.width, parentRect.right - ev.clientX - (rect.width - offsetX)));
              const b = Math.max(0, Math.min(parentRect.height - rect.height, parentRect.bottom - ev.clientY - (rect.height - offsetY)));
              el.style.right = `${r}px`;
              el.style.bottom = `${b}px`;
            };
            const onUp = (ev) => {
              document.removeEventListener('pointermove', onMove);
              document.removeEventListener('pointerup', onUp);
              if (dragging) {
                ev.preventDefault();
                localStorage.setItem(storageKey, JSON.stringify({ right: parseInt(el.style.right), bottom: parseInt(el.style.bottom) }));
              }
            };
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
          };
          const commonStyle = {
            position: 'absolute',
            right: `${pos.right}px`,
            bottom: `${pos.bottom}px`,
            zIndex: 40,
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            boxShadow: 'var(--shadow-md)',
            fontSize: '18px',
            opacity: 0.8,
            cursor: 'grab',
            userSelect: 'none',
            touchAction: 'none',
          };
          if (btnKey === 'github') {
            return (
              <a
                key="github"
                id="tour-github"
                href="https://github.com/YuanShiJiLoong/author"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-icon"
                style={{ ...commonStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}
                onPointerDown={makeDraggable}
                onClick={(e) => { if (e.defaultPrevented) return; }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                title="GitHub"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </a>
            );
          }
          return (
            <button
              key="help"
              id="tour-help"
              className="btn btn-secondary btn-icon"
              style={commonStyle}
              onPointerDown={makeDraggable}
              onClick={(e) => { if (!e.defaultPrevented) setShowHelp(true); }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
              title={t('page.helpAndGuide')}
            >
              📖
            </button>
          );
        })}
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
