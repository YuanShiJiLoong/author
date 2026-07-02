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
  generateId,
  exportToMarkdown,
  exportAllToMarkdown,
  migrateGlobalChapters,
  saveChapters,
} from './lib/storage';
import { initPersistence } from './lib/persistence';
import { buildContext, compileSystemPrompt, compileUserPrompt, getContextItems, estimateTokens } from './lib/context-engine';
import { addTokenRecord } from './lib/token-stats';
import { getProjectSettings, WRITING_MODES, getWritingMode, addSettingsNode, updateSettingsNode, deleteSettingsNode, getSettingsNodes, getActiveWorkId } from './lib/settings';
import { resolveAiEndpoint } from './lib/ai-provider-compat';
import { localizeApiError } from './lib/api-error-i18n';
import { tt } from './lib/runtime-i18n';
import {
  loadSessionStore, saveSessionStore, createSession, getActiveSession,
} from './lib/chat-sessions';
import { loadGenerationArchive, normalizeGenerationArchive, saveGenerationArchive } from './lib/generation-archive';
import { exportProject, importProject } from './lib/project-io';
import { createSnapshot } from './lib/snapshots';
import { initDiagnostics, recordDiagnosticEvent } from './lib/diagnostics';
import { clearChunkRecoveryQuery, importWithChunkRecovery } from './lib/chunk-recovery';
// 动态导入编辑器和设定集面板及侧边栏（避免 SSR 问题）
const Sidebar = dynamic(() => importWithChunkRecovery(() => import('./components/Sidebar')), { ssr: false });
const Editor = dynamic(() => importWithChunkRecovery(() => import('./components/Editor')), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, background: 'var(--bg-canvas)', transition: 'none' }} />
  ),
});
const SettingsPanel = dynamic(() => importWithChunkRecovery(() => import('./components/SettingsPanel')), { ssr: false });
const CategorySettingsModal = dynamic(() => importWithChunkRecovery(() => import('./components/CategorySettingsModal')), { ssr: false });
const HelpPanel = dynamic(() => importWithChunkRecovery(() => import('./components/HelpPanel')), { ssr: false });
const TourOverlay = dynamic(() => importWithChunkRecovery(() => import('./components/TourOverlay')), { ssr: false });
const AiSidebar = dynamic(() => importWithChunkRecovery(() => import('./components/AiSidebar')), { ssr: false });
const SnapshotManager = dynamic(() => importWithChunkRecovery(() => import('./components/SnapshotManager')), { ssr: false });
const WelcomeModal = dynamic(() => importWithChunkRecovery(() => import('./components/WelcomeModal')), { ssr: false });
const UpdateBanner = dynamic(() => importWithChunkRecovery(() => import('./components/UpdateBanner')), { ssr: false });
const AndroidDownloadMenu = dynamic(() => importWithChunkRecovery(() => import('./components/AndroidDownloadMenu')), { ssr: false });
const BookInfoPanel = dynamic(() => importWithChunkRecovery(() => import('./components/BookInfoPanel')), { ssr: false });
const CloudSyncIndicator = dynamic(() => importWithChunkRecovery(() => import('./components/CloudSyncIndicator')), { ssr: false });
const LoginModal = dynamic(() => importWithChunkRecovery(() => import('./components/LoginModal')), { ssr: false });
const AccountModal = dynamic(() => importWithChunkRecovery(() => import('./components/AccountModal')), { ssr: false });
const RegisterModal = dynamic(() => importWithChunkRecovery(() => import('./components/RegisterModal')), { ssr: false });
const SyncMethodModal = dynamic(() => importWithChunkRecovery(() => import('./components/SyncMethodModal')), { ssr: false });
const WebDavSyncModal = dynamic(() => importWithChunkRecovery(() => import('./components/WebDavSyncModal')), { ssr: false });
const LanSyncModal = dynamic(() => importWithChunkRecovery(() => import('./components/LanSyncModal')), { ssr: false });

const ACTIVE_CHAPTER_KEY_PREFIX = 'author-active-chapter-';
const CONTEXT_STRATEGY_VERSION_KEY = 'author-context-strategy-version';
const CONTEXT_STRATEGY_VERSION = 'multi-chapter-v1';

function getWorkScopedId(workId) {
  return workId || getActiveWorkId() || 'work-default';
}

function isWritableChapter(chapter) {
  return chapter && (chapter.type || 'chapter') !== 'volume';
}

function getRememberedChapterId(workId) {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`${ACTIVE_CHAPTER_KEY_PREFIX}${getWorkScopedId(workId)}`) || null;
}

function rememberChapterId(workId, chapterId) {
  if (typeof window === 'undefined' || !chapterId) return;
  localStorage.setItem(`${ACTIVE_CHAPTER_KEY_PREFIX}${getWorkScopedId(workId)}`, chapterId);
}

function chooseActiveChapterForWork(chapters, workId) {
  const realChapters = Array.isArray(chapters) ? chapters.filter(isWritableChapter) : [];
  if (realChapters.length === 0) return null;

  const rememberedId = getRememberedChapterId(workId);
  return realChapters.find(ch => ch.id === rememberedId) || realChapters[0];
}

function stripHtmlForWordCount(html) {
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = html || '';
    return (el.textContent || '').replace(/\u00a0/g, ' ');
  }
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ');
}

function countChapterWords(html) {
  return stripHtmlForWordCount(html).replace(/\s/g, '').length;
}

function hasChapterText(html) {
  return countChapterWords(html) > 0;
}

function mergeChapterHtml(currentHtml, nextHtml) {
  const current = String(currentHtml || '').trim();
  const next = String(nextHtml || '').trim();
  if (!hasChapterText(current)) return next;
  if (!hasChapterText(next)) return current;
  return `${current}<p><br></p>${next}`;
}

function tryNextChapterTitle(title) {
  const source = String(title || '').trim();
  const arabic = source.match(/第(\d+)章/);
  if (arabic) return `第${Number(arabic[1]) + 1}章`;
  const trailing = source.match(/^(.+?)(\d+)\s*$/);
  if (trailing) return `${trailing[1]}${Number(trailing[2]) + 1}`;
  return null;
}

function makeUniqueChapterTitle(chapters, title) {
  const existing = new Set((chapters || []).map(ch => ch?.title).filter(Boolean));
  if (!existing.has(title)) return title;
  const first = `${title}（新）`;
  if (!existing.has(first)) return first;
  let index = 2;
  while (existing.has(`${title}（新${index}）`)) index++;
  return `${title}（新${index}）`;
}

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
  const [memoryGroupsVersion, setMemoryGroupsVersion] = useState(0);
  const editorRef = useRef(null);
  const sessionStoreHydratedRef = useRef(false);
  const latestSessionStoreRef = useRef(sessionStore);
  const sessionAutosaveTimerRef = useRef(null);
  const chapterLoadSeqRef = useRef(0);
  const chaptersWorkIdRef = useRef(null);
  const generationArchiveHydratedRef = useRef(false);
  const generationArchiveLoadSeqRef = useRef(0);
  const generationArchiveWorkIdRef = useRef(null);
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
    clearChunkRecoveryQuery();
    initDiagnostics();
    recordDiagnosticEvent('app.mount', 'Home mounted', {}, 'info');
  }, []);

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
    let observedHeader = null;
    let observedToolbar = null;
    let rafId = 0;

    const updateHeaderHeight = () => {
      const header = document.querySelector('.top-header-bar');
      if (!header) return;
      document.documentElement.style.setProperty('--top-header-h', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    };

    const updateToolbarHeight = () => {
      const toolbar = document.querySelector('.editor-toolbar');
      const main = document.querySelector('.main-content');
      updateHeaderHeight();
      if (toolbar && main) {
        const h = `${Math.ceil(toolbar.getBoundingClientRect().height)}px`;
        main.style.setProperty('--toolbar-h', h);
        document.documentElement.style.setProperty('--toolbar-h', h);
      }
    };

    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateToolbarHeight();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    const syncObservedTargets = () => {
      const toolbar = document.querySelector('.editor-toolbar');
      const header = document.querySelector('.top-header-bar');

      if (observedHeader !== header) {
        if (observedHeader) resizeObserver.unobserve(observedHeader);
        observedHeader = header;
        if (observedHeader) resizeObserver.observe(observedHeader);
      }

      if (observedToolbar !== toolbar) {
        if (observedToolbar) resizeObserver.unobserve(observedToolbar);
        observedToolbar = toolbar;
        if (observedToolbar) resizeObserver.observe(observedToolbar);
      }

      scheduleUpdate();
    };

    const mutationObserver = new MutationObserver(syncObservedTargets);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    syncObservedTargets();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  // 派生：当前活动会话和消息列表
  const activeSession = useMemo(() => getActiveSession(sessionStore), [sessionStore]);
  const chatHistory = useMemo(() => activeSession?.messages || [], [activeSession]);

  // 加载指定作品的章节
  const loadChaptersForWork = useCallback(async (workId) => {
    const targetWorkId = getWorkScopedId(workId);
    const loadSeq = chapterLoadSeqRef.current + 1;
    chapterLoadSeqRef.current = loadSeq;

    let saved = await getChapters(targetWorkId);
    // 自动修复：过滤掉损坏的章节数据
    if (Array.isArray(saved)) {
      const cleaned = saved.filter(ch => ch && typeof ch === 'object' && ch.id);
      if (cleaned.length !== saved.length) {
        console.warn(`[数据修复] 发现 ${saved.length - cleaned.length} 条损坏的章节数据，已自动清理`);
        saved = cleaned;
        await saveChapters(saved, targetWorkId);
      }
    } else {
      saved = [];
    }
    if (chapterLoadSeqRef.current !== loadSeq) return;

    chaptersWorkIdRef.current = targetWorkId;
    if (saved.length === 0) {
      const first = await createChapter(t('page.firstChapterTitle'), targetWorkId);
      if (chapterLoadSeqRef.current !== loadSeq) return;
      setChapters([first]);
      setActiveChapterId(first.id);
      rememberChapterId(targetWorkId, first.id);
    } else {
      const targetChapter = chooseActiveChapterForWork(saved, targetWorkId);
      setChapters(saved);
      setActiveChapterId(targetChapter?.id || null);
      if (targetChapter?.id) rememberChapterId(targetWorkId, targetChapter.id);
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
        store = createSession(store, { workId: getActiveWorkId() || 'work-default' });
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
    if (!sessionStoreHydratedRef.current) return;
    const targetWorkId = activeWorkId || getActiveWorkId() || 'work-default';
    setSessionStore(prev => {
      const current = getActiveSession(prev);
      if (current?.workId === targetWorkId) return prev;

      if (current && !current.workId) {
        const next = {
          ...prev,
          sessions: prev.sessions.map(s =>
            s.id === current.id ? { ...s, workId: targetWorkId, updatedAt: Date.now() } : s
          ),
        };
        saveSessionStore(next);
        return next;
      }

      const sameWorkSession = [...prev.sessions]
        .filter(s => s.workId === targetWorkId)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      if (sameWorkSession) {
        const next = { ...prev, activeSessionId: sameWorkSession.id };
        saveSessionStore(next);
        return next;
      }

      return createSession(prev, { workId: targetWorkId });
    });
  }, [activeWorkId, sessionStore.sessions.length, setSessionStore]);

  useEffect(() => {
    const workId = activeWorkId || getActiveWorkId() || 'work-default';
    const seq = generationArchiveLoadSeqRef.current + 1;
    generationArchiveLoadSeqRef.current = seq;
    generationArchiveHydratedRef.current = false;
    generationArchiveWorkIdRef.current = workId;

    loadGenerationArchive(workId).then((archive) => {
      if (generationArchiveLoadSeqRef.current !== seq) return;
      setGenerationArchive(archive);
      generationArchiveHydratedRef.current = true;
    });
  }, [activeWorkId, setGenerationArchive]);

  useEffect(() => {
    if (!generationArchiveHydratedRef.current) return;
    const workId = generationArchiveWorkIdRef.current || activeWorkId || getActiveWorkId() || 'work-default';
    saveGenerationArchive(workId, generationArchive);
  }, [activeWorkId, generationArchive]);

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
  const contextWorkIdRef = useRef(activeWorkId);

  // 章节指纹 —— 当章节改名或拖动排序时会变化，触发上下文列表重建
  const chaptersFingerprint = useMemo(
    () => (Array.isArray(chapters) ? chapters.map(ch => {
      const synopsis = ch.synopsis || ch.chapterSynopsis || ch.summary || '';
      const synopsisStamp = typeof synopsis === 'string'
        ? synopsis.length
        : `${synopsis.summary?.length || 0}:${synopsis.updatedAt || ''}:${synopsis.locked ? 1 : 0}`;
      return `${ch.id}:${ch.title}:${synopsisStamp}`;
    }).join('|') : ''),
    [chapters]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMemoryGroupsChanged = (event) => {
      const changedWorkId = event?.detail?.workId;
      if (!changedWorkId || changedWorkId === getWorkScopedId(activeWorkId)) {
        setMemoryGroupsVersion(version => version + 1);
      }
    };
    window.addEventListener('author-chapter-memory-groups-changed', handleMemoryGroupsChanged);
    return () => {
      window.removeEventListener('author-chapter-memory-groups-changed', handleMemoryGroupsChanged);
    };
  }, [activeWorkId]);

  // 初始化上下文条目和勾选状态（设定集 + 章节 + 对话历史）
  useEffect(() => {
    if (!activeChapterId) return;
    let cancelled = false;

    const loadContext = async () => {
      const baseItems = await getContextItems(activeChapterId, chapters, activeWorkId);
      if (cancelled) return;

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
          enabled: false,
          _msgId: m.id,
        };
      });

      const allItems = [...baseItems, ...chatItems];
      setContextItems(allItems);

      const validIds = new Set(allItems.map(it => it.id));
      const workChanged = contextWorkIdRef.current !== activeWorkId;
      contextWorkIdRef.current = activeWorkId;

      // 切换作品时参考条目必须跟随当前作品；同作品刷新时只保留仍存在的勾选项。
      setContextSelection(prev => {
        const retained = new Set([...prev].filter(id => validIds.has(id)));
        const defaultEnabledIds = new Set(allItems.filter(it => it.enabled || it.alwaysInclude).map(it => it.id));
        const strategyVersion = typeof window !== 'undefined'
          ? localStorage.getItem(CONTEXT_STRATEGY_VERSION_KEY)
          : CONTEXT_STRATEGY_VERSION;
        const shouldResetForStrategy = strategyVersion !== CONTEXT_STRATEGY_VERSION;
        if (shouldResetForStrategy && typeof window !== 'undefined') {
          localStorage.setItem(CONTEXT_STRATEGY_VERSION_KEY, CONTEXT_STRATEGY_VERSION);
        }
        if (workChanged || retained.size === 0) {
          return defaultEnabledIds;
        }
        if (shouldResetForStrategy) {
          return defaultEnabledIds;
        }
        allItems.filter(it => it.alwaysInclude).forEach(it => retained.add(it.id));
        return retained;
      });
    };

    loadContext();
    return () => { cancelled = true; };
  }, [activeWorkId, activeChapterId, settingsVersion, chatHistory.length, chaptersFingerprint, memoryGroupsVersion]);

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

  useEffect(() => {
    const targetWorkId = getWorkScopedId(activeWorkId);
    if (chaptersWorkIdRef.current !== targetWorkId) return;
    const selectedChapter = chapters.find(ch => ch.id === activeChapterId);
    if (!isWritableChapter(selectedChapter)) return;
    rememberChapterId(targetWorkId, activeChapterId);
  }, [activeChapterId, activeWorkId, chapters]);

  // 当前活跃章节
  const activeChapter = Array.isArray(chapters) ? chapters.find(ch => ch.id === activeChapterId && isWritableChapter(ch)) : null;

  const handleToggleActiveChapterSpecial = useCallback(async () => {
    if (!activeChapter || (activeChapter.type || 'chapter') === 'volume') return;
    const numberingIgnored = !activeChapter.numberingIgnored;
    await updateChapter(activeChapter.id, { numberingIgnored }, activeWorkId);
    updateChapterStore(activeChapter.id, { numberingIgnored });
    showToast(
      numberingIgnored
        ? `「${activeChapter.title}」已设为特殊章节，重排编号时会跳过`
        : `「${activeChapter.title}」已恢复普通章节`,
      'success'
    );
  }, [activeChapter, activeWorkId, showToast, updateChapterStore]);

  const handleEditorUpdate = useCallback(async ({ chapterId: targetChapterId, workId: targetWorkId, html, wordCount }) => {
    // Destructive writes must name the document that actually produced the HTML.
    // Falling back to the currently selected chapter can write A's delayed update into B.
    if (!targetChapterId || !targetWorkId) {
      console.error('Rejected editor save without an explicit document identity');
      return;
    }
    const workIdToSave = getWorkScopedId(targetWorkId);
    const updated = await updateChapter(targetChapterId, {
      content: html,
      wordCount,
    }, workIdToSave);
    if (updated && workIdToSave === getWorkScopedId(activeWorkId)) {
      updateChapterStore(targetChapterId, { content: html, wordCount });
    }
  }, [activeWorkId, updateChapterStore]);

  const handleSplitActiveChapter = useCallback(async (draft) => {
    if (!activeChapter || !isWritableChapter(activeChapter)) return null;
    if (!draft || draft.beforeWordCount <= 0 || draft.afterWordCount <= 0) {
      showToast('请把光标放在正文中间，拆分点前后都需要有内容', 'error');
      return null;
    }

    const currentIndex = chapters.findIndex(ch => ch.id === activeChapter.id);
    if (currentIndex === -1) return null;

    const now = new Date().toISOString();
    const fallbackTitle = activeChapter.title
      ? `${activeChapter.title}（下）`
      : t('sidebar.defaultChapterTitle').replace('{num}', chapters.length + 1);
    const title = makeUniqueChapterTitle(
      chapters,
      tryNextChapterTitle(activeChapter.title) || fallbackTitle,
    );
    const newChapter = {
      id: generateId(),
      title,
      content: draft.afterHtml,
      wordCount: draft.afterWordCount,
      ...(activeChapter.numberingIgnored ? { numberingIgnored: true } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const nextChapters = [...chapters];
    nextChapters[currentIndex] = {
      ...activeChapter,
      content: draft.beforeHtml,
      wordCount: draft.beforeWordCount,
      updatedAt: now,
    };
    nextChapters.splice(currentIndex + 1, 0, newChapter);

    await saveChapters(nextChapters, activeWorkId);
    setChapters(nextChapters);
    setActiveChapterId(newChapter.id);
    showToast(`已拆分为「${activeChapter.title}」和「${newChapter.title}」`, 'success');
    return { chapterId: newChapter.id };
  }, [activeChapter, activeWorkId, chapters, setActiveChapterId, setChapters, showToast, t]);

  const handleMergeNextChapter = useCallback(async ({ currentHtml, currentWordCount } = {}) => {
    if (!activeChapter || !isWritableChapter(activeChapter)) return null;

    const currentIndex = chapters.findIndex(ch => ch.id === activeChapter.id);
    if (currentIndex === -1) return null;

    const nextIndex = chapters.findIndex((chapter, index) =>
      index > currentIndex && isWritableChapter(chapter)
    );
    if (nextIndex === -1) {
      showToast('当前章节后面没有可合并的章节', 'error');
      return null;
    }

    const nextChapter = chapters[nextIndex];
    const baseHtml = typeof currentHtml === 'string' ? currentHtml : activeChapter.content || '';
    const mergedContent = mergeChapterHtml(baseHtml, nextChapter.content || '');
    const mergedWordCount = countChapterWords(mergedContent) || currentWordCount || 0;
    const now = new Date().toISOString();
    const nextChapters = chapters.map(ch => ch.id === activeChapter.id
      ? {
        ...activeChapter,
        content: mergedContent,
        wordCount: mergedWordCount,
        updatedAt: now,
      }
      : ch
    ).filter(ch => ch.id !== nextChapter.id);

    await saveChapters(nextChapters, activeWorkId);
    setChapters(nextChapters);
    setActiveChapterId(activeChapter.id);
    showToast(`已将「${nextChapter.title}」合并到当前章节`, 'success');
    return { content: mergedContent, chapterId: activeChapter.id };
  }, [activeChapter, activeWorkId, chapters, setActiveChapterId, setChapters, showToast]);

  // Inline AI 回调：编辑器调用此函数发起 AI 请求
  const handleInlineAiRequest = useCallback(async ({ mode, text, instruction, signal, onChunk }) => {
    const startTime = Date.now();
    let usageData = null;
    let fullText = '';
    try {
      // 使用上下文引擎收集项目信息
      const context = await buildContext(activeChapterId, text, contextSelection.size > 0 ? contextSelection : null, activeWorkId);
      const systemPrompt = compileSystemPrompt(context, mode);
      const userPrompt = compileUserPrompt(mode, text, instruction);

      const { apiConfig } = getProjectSettings();
      const apiEndpoint = resolveAiEndpoint(apiConfig);


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
        showToast(localizeApiError(data, tt) || t('page.toastRequestFailed'), 'error');
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
          cacheMissTokens: usageData.cacheMissTokens || 0,
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
  }, [activeWorkId, activeChapterId, contextSelection, showToast]);

  // AI 生成存档 — Editor 的 ghost text 操作会调用此函数
  const handleArchiveGeneration = useCallback((entry) => {
    const text = typeof entry?.text === 'string' ? entry.text : '';
    if (!text.trim()) return;

    const workId = activeWorkId || getActiveWorkId() || 'work-default';
    const record = {
      id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      workId,
      chapterId: activeChapterId,
      ...entry,
      text,
      source: entry?.source || 'inline',
    };
    const currentArchive = useAppStore.getState().generationArchive;
    const nextArchive = normalizeGenerationArchive([...currentArchive, record]);
    useAppStore.getState().setGenerationArchive(nextArchive);
    saveGenerationArchive(workId, nextArchive);
  }, [activeChapterId, activeWorkId]);



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
          <div className="top-header-logo" role="img" aria-label="Author">
            <span className="brand-mark" aria-hidden="true"></span>
            <span className="brand-word" aria-hidden="true"></span>
          </div>
        </div>
        <div className="top-header-right">
          <AndroidDownloadMenu />
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
              workId={activeWorkId || getActiveWorkId() || 'work-default'}
              content={activeChapter.content}
              onUpdate={handleEditorUpdate}
              onAiRequest={handleInlineAiRequest}
              onArchiveGeneration={handleArchiveGeneration}
              chapterNumberingIgnored={!!activeChapter.numberingIgnored}
              onToggleSpecialChapter={handleToggleActiveChapterSpecial}
              onSplitChapter={handleSplitActiveChapter}
              onMergeNextChapter={handleMergeNextChapter}
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
      <SyncMethodModal />
      <WebDavSyncModal />
      <LanSyncModal />
      <WelcomeModal />
    </div>
  );
}
