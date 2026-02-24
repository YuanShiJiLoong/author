'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { INPUT_TOKEN_BUDGET, buildContext, compileSystemPrompt } from '../lib/context-engine';
import {
    saveSessionStore, createSession, deleteSession as deleteSessionFn,
    renameSession, switchSession, getActiveSession, addMessage, editMessage as editMsgFn,
    deleteMessage as deleteMsgFn, createBranch, addVariant, switchVariant, replaceMessages
} from '../lib/chat-sessions';
import { getProjectSettings, getActiveWorkId, getSettingsNodes, addSettingsNode, updateSettingsNode, deleteSettingsNode } from '../lib/settings';
import { useAppStore } from '../store/useAppStore';
import ChatMarkdown from './ChatMarkdown';
import { useI18n } from '../lib/useI18n';

// 解析消息中的 [SETTINGS_ACTION] 块
function parseSettingsActions(content) {
    if (!content) return { parts: [content || ''], actions: [] };
    const regex = /\[SETTINGS_ACTION\]\s*([\s\S]*?)\s*\[\/SETTINGS_ACTION\]/g;
    const parts = [];
    const actions = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
        try {
            const action = JSON.parse(match[1].trim());
            actions.push(action);
            parts.push({ _action: true, index: actions.length - 1 });
        } catch {
            parts.push(match[0]); // parse failed, show raw
        }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    return { parts, actions };
}

// Removed static label maps in favor of i18n

// ==================== AI 对话侧栏 ====================
export default function AiSidebar({ onInsertText }) {
    const {
        aiSidebarOpen: open, setAiSidebarOpen, setShowSettings,
        activeChapterId,
        sessionStore, setSessionStore,
        chatStreaming, setChatStreaming,
        generationArchive,
        contextItems, contextSelection, setContextSelection,
        showToast
    } = useAppStore();
    const { t } = useI18n();

    const onClose = useCallback(() => setAiSidebarOpen(false), [setAiSidebarOpen]);
    const onOpenSettings = useCallback(() => { setAiSidebarOpen(false); setShowSettings(true); }, [setAiSidebarOpen, setShowSettings]);

    // 派生状态
    const activeSession = useMemo(() => getActiveSession(sessionStore), [sessionStore]);
    const chatHistory = useMemo(() => activeSession?.messages || [], [activeSession]);

    // 会话管理回调
    const setChatHistory = useCallback((newMessages) => setSessionStore(prev => replaceMessages(prev, newMessages)), [setSessionStore]);
    const onNewSession = useCallback(() => setSessionStore(prev => createSession(prev)), [setSessionStore]);
    const onDeleteSession = useCallback((id) => setSessionStore(prev => deleteSessionFn(prev, id)), [setSessionStore]);
    const onRenameSession = useCallback((id, title) => setSessionStore(prev => renameSession(prev, id, title)), [setSessionStore]);
    const onSwitchSession = useCallback((id) => setSessionStore(prev => switchSession(prev, id)), [setSessionStore]);
    const onEditMessage = useCallback((msgId, newContent) => setSessionStore(prev => editMsgFn(prev, msgId, newContent)), [setSessionStore]);
    const onDeleteMessage = useCallback((msgId) => setSessionStore(prev => deleteMsgFn(prev, msgId)), [setSessionStore]);
    const onBranch = useCallback((msgId) => setSessionStore(prev => createBranch(prev, msgId)), [setSessionStore]);
    const onSwitchVariant = useCallback((msgId, variantIndex) => setSessionStore(prev => switchVariant(prev, msgId, variantIndex)), [setSessionStore]);
    const [activeTab, setActiveTab] = useState('chat');
    const [inputText, setInputText] = useState('');
    const [archiveSearch, setArchiveSearch] = useState('');
    const [expandedArchive, setExpandedArchive] = useState(null);
    // 对话历史勾选状态
    const [checkedHistory, setCheckedHistory] = useState(new Set());
    const [slidingWindow, setSlidingWindow] = useState(false);
    const [slidingWindowSize, setSlidingWindowSize] = useState(8);
    // 总结编辑
    const [summaryDraft, setSummaryDraft] = useState(null);
    // 参考 Tab 状态
    const [contextSearch, setContextSearch] = useState('');
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());
    // 消息编辑状态
    const [editingMsgId, setEditingMsgId] = useState(null);
    const [editingContent, setEditingContent] = useState('');
    // 会话重命名
    const [renamingSessionId, setRenamingSessionId] = useState(null);
    const [renameTitle, setRenameTitle] = useState('');
    // 显示会话列表
    const [showSessionList, setShowSessionList] = useState(false);
    // 设定操作卡片展开状态
    const [expandedActions, setExpandedActions] = useState(new Set());

    const chatEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const inputRef = useRef(null);

    // 新消息时只在用户已滚动到底部时才自动滚动（不劫持用户滚动）
    useEffect(() => {
        const container = chatContainerRef.current;
        if (!container) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            return;
        }
        const threshold = 80;
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
        if (isNearBottom) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatHistory]);

    // 切到聊天 Tab 时聚焦输入框
    useEffect(() => {
        if (activeTab === 'chat' && open) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [activeTab, open]);

    // 新消息自动加入 checkedHistory（仅追加，不全量重置）
    useEffect(() => {
        if (chatHistory.length === 0) {
            setCheckedHistory(new Set());
            return;
        }
        setCheckedHistory(prev => {
            const next = new Set(prev);
            for (const m of chatHistory) {
                if (!next.has(m.id)) next.add(m.id);
            }
            // 清理已删除的消息 ID
            const currentIds = new Set(chatHistory.map(m => m.id));
            for (const id of next) {
                if (!currentIds.has(id)) next.delete(id);
            }
            return next;
        });
    }, [chatHistory]);

    // 滑动窗口联动
    useEffect(() => {
        if (slidingWindow && chatHistory.length > 0) {
            const recent = chatHistory.slice(-slidingWindowSize);
            setCheckedHistory(new Set(recent.map(m => m.id)));
        }
    }, [slidingWindow, slidingWindowSize, chatHistory.length]);

    // --- 通用 SSE 流式读取，支持 text+thinking ---
    const streamResponse = useCallback(async (apiEndpoint, systemPrompt, userPrompt, apiConfig, onUpdate, onDone) => {
        const res = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, userPrompt, apiConfig, maxTokens: 2000 }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await res.json();
            throw new Error(data.error || '请求失败');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let fullThinking = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            let hasUpdate = false;
            for (const event of events) {
                const trimmed = event.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (trimmed.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        if (json.thinking) { fullThinking += json.thinking; hasUpdate = true; }
                        if (json.text) { fullText += json.text; hasUpdate = true; }
                    } catch { }
                }
            }
            if (hasUpdate) onUpdate(fullText, fullThinking);
        }
        onDone(fullText, fullThinking);
    }, []);

    const onChatMessage = useCallback(async (text, selectedHistory) => {
        const userMsg = { id: `msg-${Date.now()}-u`, role: 'user', content: text, timestamp: Date.now() };
        setSessionStore(prev => addMessage(prev, userMsg));
        setChatStreaming(true);
        const aiMsgId = `msg-${Date.now()}-a`;

        try {
            const { apiConfig } = getProjectSettings();
            const apiEndpoint = apiConfig?.provider === 'gemini-native' ? '/api/ai/gemini'
                : apiConfig?.provider === 'openai-responses' ? '/api/ai/responses'
                    : '/api/ai';

            const context = await buildContext(activeChapterId, text, contextSelection.size > 0 ? contextSelection : null);
            const systemPrompt = compileSystemPrompt(context, 'chat');
            const historyForApi = selectedHistory.map(m => `${m.role === 'user' ? t('aiSidebar.roleYou') : t('aiSidebar.roleAi')}: ${m.content}`).join('\n');
            const userPrompt = historyForApi ? `${historyForApi}\n${t('aiSidebar.roleYou')}: ${text}` : text;

            const aiPlaceholder = { id: aiMsgId, role: 'assistant', content: '', thinking: '', timestamp: Date.now() };
            setSessionStore(prev => addMessage(prev, aiPlaceholder));

            await streamResponse(apiEndpoint, systemPrompt, userPrompt, apiConfig,
                (snapText, snapThinking) => {
                    setSessionStore(prev => ({
                        ...prev, sessions: prev.sessions.map(s => {
                            if (s.id !== prev.activeSessionId) return s;
                            return { ...s, messages: s.messages.map(m => m.id === aiMsgId ? { ...m, content: snapText, thinking: snapThinking } : m) };
                        }),
                    }));
                },
                (finalText, finalThinking) => {
                    setSessionStore(prev => {
                        const finalStore = {
                            ...prev, sessions: prev.sessions.map(s => {
                                if (s.id !== prev.activeSessionId) return s;
                                return {
                                    ...s, messages: s.messages.map(m => m.id === aiMsgId ? { ...m, content: finalText || '（AI 未返回内容）', thinking: finalThinking } : m),
                                    updatedAt: Date.now(),
                                };
                            }),
                        };
                        saveSessionStore(finalStore);
                        return finalStore;
                    });
                }
            );
        } catch (err) {
            const errorMsg = { id: `msg-${Date.now()}-e`, role: 'assistant', content: `❌ ${err.message}`, timestamp: Date.now() };
            setSessionStore(prev => addMessage(prev, errorMsg));
        } finally {
            setChatStreaming(false);
        }
    }, [activeChapterId, contextSelection, streamResponse, setSessionStore, setChatStreaming]);

    const onRegenerate = useCallback(async (aiMsgId) => {
        if (chatStreaming) return;
        console.log('[Regenerate] Starting for msg:', aiMsgId);

        const msgs = chatHistory;
        const aiIdx = msgs.findIndex(m => m.id === aiMsgId);
        if (aiIdx < 0) { console.log('[Regenerate] AI msg not found'); return; }

        let userMsgIdx = -1;
        for (let i = aiIdx - 1; i >= 0; i--) {
            if (msgs[i].role === 'user') { userMsgIdx = i; break; }
        }
        if (userMsgIdx < 0) { console.log('[Regenerate] User msg not found'); return; }

        const userMsg = msgs[userMsgIdx];
        const priorHistory = msgs.slice(0, userMsgIdx);
        setChatStreaming(true);
        console.log('[Regenerate] User msg:', userMsg.content.slice(0, 50));

        try {
            const { apiConfig } = getProjectSettings();
            const apiEndpoint = apiConfig?.provider === 'gemini-native' ? '/api/ai/gemini'
                : apiConfig?.provider === 'openai-responses' ? '/api/ai/responses'
                    : '/api/ai';

            const context = await buildContext(activeChapterId, userMsg.content, contextSelection.size > 0 ? contextSelection : null);
            const systemPrompt = compileSystemPrompt(context, 'chat');
            const historyForApi = priorHistory
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => `${m.role === 'user' ? t('aiSidebar.roleYou') : t('aiSidebar.roleAi')}: ${m.content}`).join('\n');
            const userPrompt = historyForApi ? `${historyForApi}\n${t('aiSidebar.roleYou')}: ${userMsg.content}` : userMsg.content;

            setSessionStore(prev => ({
                ...prev, sessions: prev.sessions.map(s => {
                    if (s.id !== prev.activeSessionId) return s;
                    return {
                        ...s, messages: s.messages.map(m => {
                            if (m.id !== aiMsgId) return m;
                            const variants = m.variants || [{ content: m.content, thinking: m.thinking || '', timestamp: m.timestamp }];
                            console.log('[Regenerate] Initialized variants:', variants.length);
                            return { ...m, variants, content: '', thinking: '' };
                        }),
                    };
                }),
            }));

            await streamResponse(apiEndpoint, systemPrompt, userPrompt, apiConfig,
                (snapText, snapThinking) => {
                    setSessionStore(prev => ({
                        ...prev, sessions: prev.sessions.map(s => {
                            if (s.id !== prev.activeSessionId) return s;
                            return { ...s, messages: s.messages.map(m => m.id === aiMsgId ? { ...m, content: snapText, thinking: snapThinking } : m) };
                        }),
                    }));
                },
                (finalText, finalThinking) => {
                    console.log('[Regenerate] Stream done, adding variant. Final text length:', finalText?.length);
                    setSessionStore(prev => {
                        const newStore = addVariant(prev, aiMsgId, { content: finalText || '（AI 未返回内容）', thinking: finalThinking, timestamp: Date.now() });
                        console.log('[Regenerate] After addVariant, checking msg:', newStore.sessions.find(s => s.id === newStore.activeSessionId)?.messages.find(m => m.id === aiMsgId)?.variants?.length, 'variants');
                        saveSessionStore(newStore);
                        return newStore;
                    });
                }
            );
        } catch (err) {
            setSessionStore(prev => ({
                ...prev, sessions: prev.sessions.map(s => {
                    if (s.id !== prev.activeSessionId) return s;
                    return { ...s, messages: s.messages.map(m => m.id === aiMsgId ? { ...m, content: `❌ ${err.message}` } : m) };
                }),
            }));
        } finally {
            setChatStreaming(false);
        }
    }, [chatHistory, chatStreaming, activeChapterId, contextSelection, streamResponse, setSessionStore, setChatStreaming]);

    const onApplySettingsAction = useCallback(async (action, actionKey) => {
        try {
            const nodes = await getSettingsNodes();
            const workId = getActiveWorkId() || 'work-default';
            const catToSuffix = { character: 'characters', world: 'world', location: 'locations', object: 'objects', plot: 'plot', rules: 'rules', custom: 'rules' };
            const suffix = catToSuffix[action.category] || 'rules';
            let parentId = `${workId}-${suffix}`;
            const parentNode = nodes.find(n => n.id === parentId);
            if (!parentNode) parentId = nodes.find(n => n.parentId === workId && n.category === action.category)?.id || parentId;

            const resolveNode = () => {
                if (action.nodeId) return nodes.find(n => n.id === action.nodeId);
                if (action.name) return nodes.find(n => n.name === action.name && n.category === action.category && n.type === 'item');
                return null;
            };

            if (action.action === 'add') {
                const existing = resolveNode();
                if (existing) {
                    const mergedContent = { ...(existing.content || {}), ...(action.content || {}) };
                    await updateSettingsNode(existing.id, { name: action.name || existing.name, content: mergedContent });
                } else {
                    await addSettingsNode({ name: action.name || '新条目', type: 'item', category: action.category || 'custom', parentId, content: action.content || {} });
                }
            } else if (action.action === 'update') {
                const target = resolveNode();
                if (target) {
                    const updates = {};
                    if (action.name) updates.name = action.name;
                    if (action.content) updates.content = { ...(target.content || {}), ...action.content };
                    await updateSettingsNode(target.id, updates);
                } else {
                    await addSettingsNode({ name: action.name || '新条目', type: 'item', category: action.category || 'custom', parentId, content: action.content || {} });
                }
            } else if (action.action === 'delete') {
                const target = resolveNode();
                if (target) await deleteSettingsNode(target.id);
            }

            const msgIdFromKey = actionKey.split('-action-')[0].replace(/-v\d+$/, '');
            setSessionStore(prev => {
                const newStore = {
                    ...prev, sessions: prev.sessions.map(s => {
                        if (s.id !== prev.activeSessionId) return s;
                        return { ...s, messages: s.messages.map(m => m.id === msgIdFromKey ? { ...m, _appliedActions: [...(m._appliedActions || []), actionKey] } : m), updatedAt: Date.now() };
                    }),
                };
                saveSessionStore(newStore);
                return newStore;
            });
            showToast('应用设定成功', 'success');
        } catch (err) {
            console.error('Settings action failed:', err);
            showToast('应用操作失败：' + err.message, 'error');
        }
    }, [setSessionStore, showToast]);

    // 发送消息
    const handleSend = useCallback(() => {
        const text = inputText.trim();
        if (!text || chatStreaming) return;

        const selectedHistory = chatHistory.filter(m => checkedHistory.has(m.id));
        onChatMessage?.(text, selectedHistory);
        setInputText('');
    }, [inputText, chatStreaming, chatHistory, checkedHistory, onChatMessage]);

    // 重新发送某条用户消息
    const handleResend = useCallback((msgId) => {
        const msg = chatHistory.find(m => m.id === msgId);
        if (!msg || msg.role !== 'user' || chatStreaming) return;
        const selectedHistory = chatHistory.filter(m => checkedHistory.has(m.id) && m.timestamp < msg.timestamp);
        onChatMessage?.(msg.content, selectedHistory);
    }, [chatHistory, checkedHistory, chatStreaming, onChatMessage]);

    // 思维链折叠状态
    const [expandedThinking, setExpandedThinking] = useState(new Set());
    const toggleThinking = useCallback((msgId) => {
        setExpandedThinking(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) next.delete(msgId);
            else next.add(msgId);
            return next;
        });
    }, []);

    // 开始编辑消息
    const startEdit = useCallback((msg) => {
        setEditingMsgId(msg.id);
        setEditingContent(msg.content);
    }, []);

    // 确认编辑
    const confirmEdit = useCallback(() => {
        if (editingMsgId && editingContent.trim()) {
            onEditMessage?.(editingMsgId, editingContent.trim());
        }
        setEditingMsgId(null);
        setEditingContent('');
    }, [editingMsgId, editingContent, onEditMessage]);

    // 取消编辑
    const cancelEdit = useCallback(() => {
        setEditingMsgId(null);
        setEditingContent('');
    }, []);

    // 切换单条历史勾选
    const toggleCheck = (id) => {
        setCheckedHistory(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // 总结历史
    const handleSummarize = useCallback(() => {
        const checked = chatHistory.filter(m => checkedHistory.has(m.id));
        if (checked.length < 2) return;
        const summaryLines = checked.map(m =>
            `${m.role === 'user' ? t('aiSidebar.roleYou') : t('aiSidebar.roleAi')}: ${m.content.slice(0, 80)}${m.content.length > 80 ? '...' : ''}`
        );
        setSummaryDraft(summaryLines.join('\n'));
    }, [chatHistory, checkedHistory, t]);

    // 确认总结
    const confirmSummary = useCallback(() => {
        if (!summaryDraft) return;
        const checkedIds = new Set(checkedHistory);
        const unchecked = chatHistory.filter(m => !checkedIds.has(m.id));
        const summaryMsg = {
            id: `summary-${Date.now()}`,
            role: 'system',
            content: `[对话摘要]\n${summaryDraft}`,
            timestamp: Date.now(),
            isSummary: true,
        };
        setChatHistory?.([...unchecked, summaryMsg]);
        setSummaryDraft(null);
    }, [summaryDraft, checkedHistory, chatHistory, setChatHistory]);

    // 清空对话
    const handleClearChat = () => {
        setChatHistory?.([]);
        setCheckedHistory(new Set());
    };

    // 存档过滤
    const filteredArchive = archiveSearch
        ? generationArchive.filter(a =>
            a.text?.includes(archiveSearch) || a.mode?.includes(archiveSearch)
        )
        : generationArchive;

    // 参考 Tab 分组
    const groupedItems = useMemo(() => {
        const groups = {};
        const filteredItems = contextSearch
            ? contextItems.filter(it => it.name.toLowerCase().includes(contextSearch.toLowerCase()))
            : contextItems;
        for (const item of filteredItems) {
            if (item._empty) continue;
            // 不显示没有创建条目的空分类
            if (item.tokens === 0 && item.name === '（暂无条目）') continue;
            const g = item.group || '其他';
            if (!groups[g]) groups[g] = [];
            groups[g].push(item);
        }
        return groups;
    }, [contextItems, contextSearch]);

    // Token 统计
    const totalSelectedTokens = useMemo(() => {
        return contextItems
            .filter(it => contextSelection?.has(it.id))
            .reduce((sum, it) => sum + (it.tokens || 0), 0);
    }, [contextItems, contextSelection]);

    // 参考条目切换
    const toggleContextItem = useCallback((itemId) => {
        setContextSelection(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    }, [setContextSelection]);

    const toggleGroup = useCallback((groupName) => {
        const items = groupedItems[groupName] || [];
        setContextSelection(prev => {
            const next = new Set(prev);
            const allChecked = items.every(it => prev.has(it.id));
            items.forEach(it => {
                if (allChecked) next.delete(it.id);
                else next.add(it.id);
            });
            return next;
        });
    }, [groupedItems, contextSelection, setContextSelection]);

    const toggleCollapse = useCallback((groupName) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        if (!contextItems) return;
        setContextSelection(new Set(contextItems.map(it => it.id)));
    }, [contextItems, setContextSelection]);

    const selectNone = useCallback(() => {
        setContextSelection(new Set());
    }, [setContextSelection]);

    const resetSelection = useCallback(() => {
        if (!contextItems) return;
        setContextSelection(new Set(contextItems.filter(it => it.enabled).map(it => it.id)));
    }, [contextItems, setContextSelection]);

    // Token 预算
    const budgetPercent = Math.min(100, (totalSelectedTokens / INPUT_TOKEN_BUDGET) * 100);
    const isOverBudget = totalSelectedTokens > INPUT_TOKEN_BUDGET;

    const tabs = [
        { key: 'chat', label: t('aiSidebar.tabChat') },
        { key: 'archive', label: t('aiSidebar.tabArchive') },
        { key: 'reference', label: t('aiSidebar.tabReference') },
    ];

    const MODE_LABELS = {
        continue: '续写',
        rewrite: '改写',
        expand: '扩写',
        condense: '精简',
        dialogue: '对话',
        chat: '对话',
    };

    const STATUS_LABELS = {
        accepted: '✓ 已接受',
        rejected: '✗ 已拒绝',
        pending: '⏳ 待确认',
    };

    // 会话列表
    const sessions = sessionStore?.sessions || [];
    const activeSessionId = sessionStore?.activeSessionId;

    if (!open) return null;

    return (
        <div className="ai-sidebar" style={{ position: 'absolute', top: 0, right: 0, bottom: 0 }}>
            {/* 标题栏 */}
            <div className="ai-sidebar-header">
                <span className="ai-sidebar-title">{t('aiSidebar.title')}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => setShowSessionList(!showSessionList)}
                        title={t('aiSidebar.btnSessionList')}
                    >📂</button>
                    <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={onNewSession}
                        title={t('aiSidebar.btnNewSession')}
                    >＋</button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} title={t('aiSidebar.btnClose')}>✕</button>
                </div>
            </div>

            {/* 会话列表面板 */}
            {showSessionList && (
                <div className="session-list-panel">
                    <div className="session-list-header">
                        <span>{t('aiSidebar.historyCount').replace('{count}', sessions.length)}</span>
                    </div>
                    <div className="session-list">
                        {[...sessions].reverse().map(s => (
                            <div
                                key={s.id}
                                className={`session-item ${s.id === activeSessionId ? 'active' : ''}`}
                                onClick={() => { onSwitchSession?.(s.id); setShowSessionList(false); }}
                            >
                                {renamingSessionId === s.id ? (
                                    <input
                                        className="session-rename-input"
                                        value={renameTitle}
                                        onChange={e => setRenameTitle(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                onRenameSession?.(s.id, renameTitle.trim() || s.title);
                                                setRenamingSessionId(null);
                                            } else if (e.key === 'Escape') {
                                                setRenamingSessionId(null);
                                            }
                                        }}
                                        onBlur={() => {
                                            onRenameSession?.(s.id, renameTitle.trim() || s.title);
                                            setRenamingSessionId(null);
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        autoFocus
                                    />
                                ) : (
                                    <>
                                        <div className="session-item-info">
                                            <span className="session-item-title">{s.title}</span>
                                            <span className="session-item-meta">
                                                {s.messages?.length || 0} 条 · {new Date(s.updatedAt || s.createdAt).toLocaleDateString('zh-CN')}
                                            </span>
                                        </div>
                                        <div className="session-item-actions" onClick={e => e.stopPropagation()}>
                                            <button
                                                className="btn-mini-icon"
                                                onClick={() => { setRenamingSessionId(s.id); setRenameTitle(s.title); }}
                                                title={t('aiSidebar.rename')}
                                            >✎</button>
                                            {sessions.length > 1 && (
                                                <button
                                                    className="btn-mini-icon danger"
                                                    onClick={() => onDeleteSession?.(s.id)}
                                                    title={t('aiSidebar.delete')}
                                                >🗑</button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tab 切换 */}
            <div className="ai-sidebar-tabs">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        className={`ai-sidebar-tab ${activeTab === t.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ==================== 💬 对话 Tab ==================== */}
            {activeTab === 'chat' && (
                <div className="ai-sidebar-body">
                    {/* 对话控制栏 */}
                    <div className="chat-controls">
                        <label className="chat-control-item">
                            <input
                                type="checkbox"
                                checked={slidingWindow}
                                onChange={e => setSlidingWindow(e.target.checked)}
                            />
                            <span>{t('aiSidebar.slidingWindow')}</span>
                            {slidingWindow && (
                                <input
                                    type="number" min="2" max="20"
                                    value={slidingWindowSize}
                                    onChange={e => setSlidingWindowSize(Number(e.target.value))}
                                    className="chat-window-size-input"
                                />
                            )}
                        </label>
                        <div className="chat-control-actions">
                            <button
                                className="btn-mini"
                                onClick={handleSummarize}
                                disabled={chatHistory.filter(m => checkedHistory.has(m.id)).length < 2}
                                title={t('aiSidebar.summarizeTitle')}
                            >
                                {t('aiSidebar.summarize')}
                            </button>
                            <button className="btn-mini danger" onClick={handleClearChat} title={t('aiSidebar.clearChatTitle')}>
                                {t('aiSidebar.clearChat')}
                            </button>
                        </div>
                    </div>

                    {summaryDraft !== null && (
                        <div className="summary-editor">
                            <div className="summary-editor-label">{t('aiSidebar.editSummary')}</div>
                            <textarea
                                className="summary-textarea"
                                value={summaryDraft}
                                onChange={e => setSummaryDraft(e.target.value)}
                                rows={5}
                            />
                            <div className="summary-actions">
                                <button className="btn-mini" onClick={() => setSummaryDraft(null)}>{t('aiSidebar.cancel')}</button>
                                <button className="btn-mini primary" onClick={confirmSummary}>{t('aiSidebar.confirmReplace')}</button>
                            </div>
                        </div>
                    )}

                    {/* 对话消息列表 */}
                    <div className="chat-messages" ref={chatContainerRef}>
                        {chatHistory.length === 0 && (
                            <div className="chat-empty">
                                <div>{t('aiSidebar.emptyChatIcon')}</div>
                                <div>{t('aiSidebar.emptyChatTitle')}</div>
                                <div className="chat-empty-hint">{t('aiSidebar.emptyChatHint')}</div>
                            </div>
                        )}
                        {chatHistory.map(msg => {
                            const isStreaming = chatStreaming && msg.role === 'assistant' && msg === chatHistory[chatHistory.length - 1];
                            const hasVariants = msg.variants && msg.variants.length > 1;
                            const variantIdx = msg.activeVariant ?? 0;
                            const variantTotal = msg.variants?.length || 1;

                            return (
                                <div key={msg.id} className={`chat-message ${msg.role}`}>
                                    <div className="chat-message-header">
                                        <input
                                            type="checkbox"
                                            checked={checkedHistory.has(msg.id)}
                                            onChange={() => toggleCheck(msg.id)}
                                            className="chat-check"
                                        // TODO: Make this tooltip translate string and optional
                                        // title="勾选以包含在下次请求中" 
                                        />
                                        <span className="chat-role">{msg.role === 'user' ? t('aiSidebar.roleYou') : msg.isSummary ? t('aiSidebar.roleSummary') : t('aiSidebar.roleAi')}</span>
                                        <span className="chat-time">
                                            {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {msg.editedAt && <span className="chat-edited-badge">{t('aiSidebar.edited')}</span>}
                                        <div className="chat-msg-actions">
                                            <button
                                                className="btn-mini-icon"
                                                onClick={() => startEdit(msg)}
                                            // title="编辑"
                                            >{t('aiSidebar.btnEdit')}</button>
                                            {msg.role === 'user' && (
                                                <button
                                                    className="btn-mini-icon"
                                                    onClick={() => handleResend(msg.id)}
                                                    // title="重新发送"
                                                    disabled={chatStreaming}
                                                >{t('aiSidebar.btnResend')}</button>
                                            )}
                                            {msg.role === 'assistant' && (
                                                <button
                                                    className="btn-mini-icon"
                                                    onClick={() => onRegenerate?.(msg.id)}
                                                    // title="重新生成"
                                                    disabled={chatStreaming}
                                                >{t('aiSidebar.btnRegenerate')}</button>
                                            )}
                                            <button
                                                className="btn-mini-icon"
                                                onClick={() => onBranch?.(msg.id)}
                                            // title="从此创建分支"
                                            >{t('aiSidebar.btnBranch')}</button>
                                            <button
                                                className="btn-mini-icon danger"
                                                onClick={() => onDeleteMessage?.(msg.id)}
                                                title={t('aiSidebar.delete')}
                                            >{t('aiSidebar.clearChat')}</button>
                                        </div>
                                    </div>

                                    {/* 思维链折叠显示 */}
                                    {msg.thinking && (
                                        <div className="chat-thinking-block">
                                            <button
                                                className="chat-thinking-toggle"
                                                onClick={() => toggleThinking(msg.id)}
                                            >
                                                <span className={`thinking-chevron ${expandedThinking.has(msg.id) ? 'open' : ''}`}>▶</span>
                                                <span>{t('aiSidebar.thinkingChain')}</span>
                                                {!expandedThinking.has(msg.id) && (
                                                    <span className="thinking-preview">
                                                        {msg.thinking.slice(0, 40)}{msg.thinking.length > 40 ? '…' : ''}
                                                    </span>
                                                )}
                                            </button>
                                            {expandedThinking.has(msg.id) && (
                                                <div className="chat-thinking-content">
                                                    {msg.thinking}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 消息内容 / 编辑模式 */}
                                    {editingMsgId === msg.id ? (
                                        <div className="chat-message-editing">
                                            <textarea
                                                className="chat-edit-textarea"
                                                value={editingContent}
                                                onChange={e => setEditingContent(e.target.value)}
                                                rows={4}
                                                autoFocus
                                            />
                                            <div className="chat-edit-actions">
                                                <button className="btn-mini" onClick={cancelEdit}>✕ {t('aiSidebar.cancel')}</button>
                                                <button className="btn-mini primary" onClick={confirmEdit}>{t('aiSidebar.save')}</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={`chat-bubble-content${isStreaming ? ' streaming' : ''}`}>
                                            {(() => {
                                                const { parts, actions } = parseSettingsActions(msg.content || '正在思考…');
                                                return parts.map((part, pi) => {
                                                    if (typeof part === 'object' && part._action) {
                                                        const action = actions[part.index];
                                                        const actionKey = `${msg.id}-v${msg.activeVariant || 0}-action-${part.index}`;
                                                        return (
                                                            <div key={pi} className="settings-action-card">
                                                                <div
                                                                    className="settings-action-header"
                                                                    onClick={() => setExpandedActions(prev => {
                                                                        const next = new Set(prev);
                                                                        next.has(actionKey) ? next.delete(actionKey) : next.add(actionKey);
                                                                        return next;
                                                                    })}
                                                                    style={{ cursor: 'pointer' }}
                                                                >
                                                                    <span className="settings-action-badge">{t(`aiSidebar.actions.${action.action}`) || action.action}</span>
                                                                    <span className="settings-action-cat">{t(`aiSidebar.categories.${action.category}`) || action.category || ''}</span>
                                                                    <span className="settings-action-name">{action.name || action.nodeId || ''}</span>
                                                                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>{expandedActions.has(actionKey) ? '▲...' : '▼...'}</span>
                                                                </div>
                                                                {action.content && expandedActions.has(actionKey) && (
                                                                    <div className="settings-action-preview">
                                                                        {Object.entries(action.content).map(([k, v]) => (
                                                                            <div key={k} className="settings-action-field">
                                                                                <span className="settings-action-field-key">{k}:</span>
                                                                                <span className="settings-action-field-val">{String(v)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                <button
                                                                    className="btn-mini primary settings-action-apply"
                                                                    onClick={() => onApplySettingsAction?.(action, actionKey)}
                                                                    disabled={msg._appliedActions?.includes(actionKey)}
                                                                >
                                                                    {msg._appliedActions?.includes(actionKey) ? t('aiSidebar.actionsApplied') : t('aiSidebar.actionsApply')}
                                                                </button>
                                                            </div>
                                                        );
                                                    }
                                                    return <ChatMarkdown key={pi} content={part} />;
                                                });
                                            })()}
                                        </div>
                                    )}

                                    {/* 变体导航 < 1/3 > */}
                                    {hasVariants && !isStreaming && (
                                        <div className="chat-variant-nav">
                                            <button
                                                className="btn-mini-icon"
                                                onClick={() => onSwitchVariant?.(msg.id, variantIdx - 1)}
                                                disabled={variantIdx <= 0}
                                            >◀</button>
                                            <span className="variant-indicator">{variantIdx + 1} / {variantTotal}</span>
                                            <button
                                                className="btn-mini-icon"
                                                onClick={() => onSwitchVariant?.(msg.id, variantIdx + 1)}
                                                disabled={variantIdx >= variantTotal - 1}
                                            >▶</button>
                                        </div>
                                    )}

                                    {/* AI 消息：一键插入正文 */}
                                    {msg.role === 'assistant' && !isStreaming && msg.content && (
                                        <div style={{ display: 'flex', gap: '6px', padding: '4px 0 2px' }}>
                                            <button
                                                className="btn-mini"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // 提取正文：去掉系统块、markdown标记、编辑点评
                                                    let text = (msg.content || '')
                                                        .replace(/\[SETTINGS_ACTION\][\s\S]*?\[\\?\/SETTINGS_ACTION\]/g, '')
                                                        .replace(/\n---[\s\S]*$/g, '')          // 去掉 --- 分隔线以后的编辑点评
                                                        .replace(/^#{1,6}\s+/gm, '')            // 去掉标题 #
                                                        .replace(/\*\*(.+?)\*\*/g, '$1')         // **粗体** → 粗体
                                                        .replace(/\*(.+?)\*/g, '$1')             // *斜体* → 斜体
                                                        .replace(/`(.+?)`/g, '$1')               // `代码` → 代码
                                                        .replace(/^[-*]\s+/gm, '')               // 去掉无序列表标记
                                                        .replace(/^\d+\.\s+/gm, '')              // 去掉有序列表标记
                                                        .trim();
                                                    if (text) onInsertText?.(text);
                                                }}
                                            >{t('aiSidebar.insertEditor')}</button>
                                            <button
                                                className="btn-mini"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigator.clipboard.writeText(msg.content || '');
                                                }}
                                            >{t('aiSidebar.copy')}</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <div ref={chatEndRef} />
                    </div>

                    {/* 输入框 */}
                    <div className="chat-input-area">
                        <textarea
                            ref={inputRef}
                            className="chat-input"
                            placeholder={t('aiSidebar.inputPlaceholder')}
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            disabled={chatStreaming}
                            rows={2}
                        />
                        <button
                            className="chat-send-btn"
                            onClick={handleSend}
                            disabled={!inputText.trim() || chatStreaming}
                        >
                            {chatStreaming ? '⏳' : '↑'}
                        </button>
                    </div>
                </div>
            )}

            {/* ==================== 📋 存档 Tab ==================== */}
            {activeTab === 'archive' && (
                <div className="ai-sidebar-body">
                    <div className="archive-search-bar">
                        <input
                            className="archive-search-input"
                            placeholder={t('aiSidebar.searchArchive')}
                            value={archiveSearch}
                            onChange={e => setArchiveSearch(e.target.value)}
                        />
                    </div>
                    <div className="archive-list">
                        {filteredArchive.length === 0 && (
                            <div className="chat-empty">
                                <div>{t('aiSidebar.emptyArchiveIcon')}</div>
                                <div>{t('aiSidebar.emptyArchiveTitle')}</div>
                                <div className="chat-empty-hint">{t('aiSidebar.emptyArchiveHint')}</div>
                            </div>
                        )}
                        {[...filteredArchive].reverse().map(item => (
                            <div
                                key={item.id}
                                className={`archive-item ${item.status}`}
                                onClick={() => setExpandedArchive(expandedArchive === item.id ? null : item.id)}
                            >
                                <div className="archive-item-header">
                                    <span className={`archive-status ${item.status}`}>
                                        {t(`aiSidebar.statuses.${item.status}`) || item.status}
                                    </span>
                                    <span className="archive-mode">{t(`aiSidebar.modes.${item.mode}`) || item.mode}</span>
                                    <span className="archive-time">
                                        {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <div className="archive-preview">
                                    {item.text?.slice(0, 60)}…
                                </div>
                                {expandedArchive === item.id && (
                                    <div className="archive-expanded">
                                        <pre className="archive-full-text">{item.text}</pre>
                                        <div className="archive-actions">
                                            <button className="btn-mini" onClick={(e) => { e.stopPropagation(); onInsertText?.(item.text); }}>
                                                {t('aiSidebar.insertEditor')}
                                            </button>
                                            <button className="btn-mini" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.text); }}>
                                                {t('aiSidebar.copy')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ==================== 📚 参考 Tab ==================== */}
            {activeTab === 'reference' && (
                <div className="ai-sidebar-body">
                    {/* Token 预算进度条 */}
                    <div className="context-budget-bar">
                        <div className="context-budget-label">
                            <span>{t('aiSidebar.tokenUsage')}</span>
                            <span className={isOverBudget ? 'context-over-budget' : ''}>
                                {totalSelectedTokens.toLocaleString()} / {(INPUT_TOKEN_BUDGET / 1000).toFixed(0)}k
                            </span>
                        </div>
                        <div className="context-budget-track">
                            <div
                                className={`context-budget-fill ${isOverBudget ? 'over' : ''}`}
                                style={{ width: `${Math.min(100, budgetPercent)}%` }}
                            />
                        </div>
                    </div>

                    {/* 搜索框 */}
                    <div className="context-search-bar">
                        <input
                            className="context-search-input"
                            placeholder={t('aiSidebar.searchContext')}
                            value={contextSearch}
                            onChange={e => setContextSearch(e.target.value)}
                        />
                    </div>

                    {/* 分组列表 */}
                    <div className="context-groups">
                        {Object.entries(groupedItems).length === 0 && (
                            <div className="chat-empty">
                                <div>{t('aiSidebar.emptyContextIcon')}</div>
                                <div>{t('aiSidebar.emptyContextTitle')}</div>
                                <div className="chat-empty-hint">
                                    {contextSearch ? t('aiSidebar.emptyContextHint1') : t('aiSidebar.emptyContextHint2')}
                                </div>
                            </div>
                        )}
                        {Object.entries(groupedItems).map(([groupName, items]) => {
                            const isCollapsed = collapsedGroups.has(groupName);
                            const checkedCount = items.filter(it => contextSelection?.has(it.id)).length;
                            const groupTokens = items
                                .filter(it => contextSelection?.has(it.id))
                                .reduce((sum, it) => sum + it.tokens, 0);
                            const allGroupChecked = checkedCount === items.length;

                            return (
                                <div key={groupName} className="context-group">
                                    <div
                                        className="context-group-header"
                                        onClick={() => toggleCollapse(groupName)}
                                    >
                                        <span className="context-collapse-icon">
                                            {isCollapsed ? '▶' : '▼'}
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={allGroupChecked && items.length > 0}
                                            ref={el => {
                                                if (el) el.indeterminate = checkedCount > 0 && checkedCount < items.length;
                                            }}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                toggleGroup(groupName);
                                            }}
                                            onClick={e => e.stopPropagation()}
                                            className="context-group-check"
                                        />
                                        <span className="context-group-name">
                                            {groupName} ({checkedCount}/{items.length})
                                        </span>
                                        <span className="context-group-tokens">
                                            {groupTokens > 0 ? `${groupTokens.toLocaleString()}t` : '—'}
                                        </span>
                                    </div>
                                    {!isCollapsed && (
                                        <div className="context-group-items">
                                            {items.map(item => (
                                                <label key={item.id} className="context-item">
                                                    <input
                                                        type="checkbox"
                                                        checked={contextSelection?.has(item.id) || false}
                                                        onChange={() => toggleContextItem(item.id)}
                                                        className="context-item-check"
                                                    />
                                                    <span className="context-item-name" title={item.name}>
                                                        {item.name}
                                                    </span>
                                                    <span className="context-item-tokens">
                                                        {item.tokens > 0 ? `${item.tokens.toLocaleString()}t` : '—'}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* 批量操作 */}
                    <div className="context-actions">
                        <button className="btn-mini" onClick={selectAll}>{t('aiSidebar.selectAll')}</button>
                        <button className="btn-mini" onClick={selectNone}>{t('aiSidebar.selectNone')}</button>
                        <button className="btn-mini" onClick={resetSelection}>{t('aiSidebar.reset')}</button>
                        <button className="btn-mini" onClick={onOpenSettings}>{t('aiSidebar.settings')}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
