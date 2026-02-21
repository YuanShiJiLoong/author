'use client';

// ==================== 多会话管理模块 ====================

import { get, set } from 'idb-keyval';

const STORAGE_KEY = 'author-chat-sessions';

function generateId(prefix = 'session') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 从 IndexedDB 读取全部会话数据 (Async)
 */
export async function loadSessionStore() {
    if (typeof window === 'undefined') return { activeSessionId: null, sessions: [] };
    try {
        let store = await get(STORAGE_KEY);
        if (!store) {
            // Fallback: migrate from localStorage
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                store = JSON.parse(raw);
                await set(STORAGE_KEY, store);
            }
        }
        if (store) return store;
    } catch { }
    return { activeSessionId: null, sessions: [] };
}

/**
 * 保存全部会话数据到 IndexedDB (Async)
 */
export async function saveSessionStore(store) {
    if (typeof window === 'undefined') return;
    try {
        await set(STORAGE_KEY, store);
    } catch { }
}

/**
 * 兼容迁移：将旧 chatHistory 数组迁移为多会话结构
 */
export function migrateFromLegacy(legacyChatHistory) {
    if (!legacyChatHistory || legacyChatHistory.length === 0) return null;
    const session = {
        id: generateId(),
        title: autoTitle(legacyChatHistory),
        createdAt: legacyChatHistory[0]?.timestamp || Date.now(),
        updatedAt: Date.now(),
        messages: legacyChatHistory,
    };
    return session;
}

/**
 * 从首条用户消息自动生成标题
 */
function autoTitle(messages) {
    const first = messages.find(m => m.role === 'user');
    if (!first) return '新对话';
    const text = first.content.slice(0, 30);
    return text.length < first.content.length ? text + '…' : text;
}

// ==================== 会话级操作 ====================

/**
 * 创建新的空白会话
 */
export function createSession(store) {
    const session = {
        id: generateId(), title: '新对话', createdAt: Date.now(),
        updatedAt: Date.now(), messages: [],
    };
    const newStore = {
        activeSessionId: session.id,
        sessions: [...store.sessions, session],
    };
    saveSessionStore(newStore); // Run in background
    return newStore;
}

/**
 * 删除会话
 */
export function deleteSession(store, sessionId) {
    const remaining = store.sessions.filter(s => s.id !== sessionId);
    const newActive = store.activeSessionId === sessionId
        ? (remaining[remaining.length - 1]?.id || null)
        : store.activeSessionId;
    const newStore = { activeSessionId: newActive, sessions: remaining };
    saveSessionStore(newStore);
    return newStore;
}

/**
 * 重命名会话
 */
export function renameSession(store, sessionId, newTitle) {
    const newStore = {
        ...store,
        sessions: store.sessions.map(s =>
            s.id === sessionId ? { ...s, title: newTitle, updatedAt: Date.now() } : s
        ),
    };
    saveSessionStore(newStore);
    return newStore;
}

/**
 * 切换活动会话
 */
export function switchSession(store, sessionId) {
    const newStore = { ...store, activeSessionId: sessionId };
    saveSessionStore(newStore);
    return newStore;
}

/**
 * 获取当前活动会话
 */
export function getActiveSession(store) {
    if (!store.activeSessionId) return null;
    return store.sessions.find(s => s.id === store.activeSessionId) || null;
}

// ==================== 消息级操作 ====================

/**
 * 向活动会话添加消息
 */
export function addMessage(store, msg) {
    const newStore = {
        ...store,
        sessions: store.sessions.map(s => {
            if (s.id !== store.activeSessionId) return s;
            const messages = [...s.messages, msg];
            const title = s.messages.length === 0 && msg.role === 'user'
                ? (msg.content.slice(0, 30) + (msg.content.length > 30 ? '…' : ''))
                : s.title;
            return { ...s, messages, title, updatedAt: Date.now() };
        }),
    };
    saveSessionStore(newStore);
    return newStore;
}

/**
 * 更新活动会话的最后一条消息（用于流式输出拼接）
 */
export function updateLastMessage(store, updater) {
    const newStore = {
        ...store,
        sessions: store.sessions.map(s => {
            if (s.id !== store.activeSessionId) return s;
            if (s.messages.length === 0) return s;
            const messages = [...s.messages];
            messages[messages.length - 1] = updater(messages[messages.length - 1]);
            return { ...s, messages, updatedAt: Date.now() };
        }),
    };
    return newStore;
}

/**
 * 编辑指定消息的内容
 */
export function editMessage(store, msgId, newContent) {
    const newStore = {
        ...store,
        sessions: store.sessions.map(s => {
            if (s.id !== store.activeSessionId) return s;
            return {
                ...s,
                messages: s.messages.map(m =>
                    m.id === msgId ? { ...m, content: newContent, editedAt: Date.now() } : m
                ),
                updatedAt: Date.now(),
            };
        }),
    };
    saveSessionStore(newStore);
    return newStore;
}

/**
 * 删除指定消息
 */
export function deleteMessage(store, msgId) {
    const newStore = {
        ...store,
        sessions: store.sessions.map(s => {
            if (s.id !== store.activeSessionId) return s;
            return {
                ...s,
                messages: s.messages.filter(m => m.id !== msgId),
                updatedAt: Date.now(),
            };
        }),
    };
    saveSessionStore(newStore);
    return newStore;
}

/**
 * 从指定消息创建分支 — 复制该消息及之前的所有消息到新会话
 */
export function createBranch(store, msgId) {
    const activeSession = getActiveSession(store);
    if (!activeSession) return store;

    const msgIndex = activeSession.messages.findIndex(m => m.id === msgId);
    if (msgIndex < 0) return store;

    const branchedMessages = activeSession.messages.slice(0, msgIndex + 1).map(m => ({
        ...m, id: generateId('msg'),
    }));

    const branchSession = {
        id: generateId(), title: `${activeSession.title} (分支)`,
        createdAt: Date.now(), updatedAt: Date.now(), messages: branchedMessages,
    };

    const newStore = {
        activeSessionId: branchSession.id,
        sessions: [...store.sessions, branchSession],
    };
    saveSessionStore(newStore);
    return newStore;
}

/**
 * 替换活动会话的消息列表（用于总结等批量操作）
 */
export function replaceMessages(store, newMessages) {
    const newStore = {
        ...store,
        sessions: store.sessions.map(s => {
            if (s.id !== store.activeSessionId) return s;
            return { ...s, messages: newMessages, updatedAt: Date.now() };
        }),
    };
    saveSessionStore(newStore);
    return newStore;
}

/**
 * 为指定消息添加一个变体（多次重新生成的结果）
 */
export function addVariant(store, msgId, variantData) {
    const newStore = {
        ...store,
        sessions: store.sessions.map(s => {
            if (s.id !== store.activeSessionId) return s;
            return {
                ...s,
                messages: s.messages.map(m => {
                    if (m.id !== msgId) return m;
                    const existingVariants = m.variants || [{
                        content: m.content,
                        thinking: m.thinking || '',
                        timestamp: m.timestamp,
                    }];
                    const newVariants = [...existingVariants, variantData];
                    return {
                        ...m,
                        variants: newVariants,
                        activeVariant: newVariants.length - 1,
                        content: variantData.content,
                        thinking: variantData.thinking || '',
                    };
                }),
                updatedAt: Date.now(),
            };
        }),
    };
    saveSessionStore(newStore);
    return newStore;
}

/**
 * 切换指定消息的当前显示变体
 */
export function switchVariant(store, msgId, variantIndex) {
    const newStore = {
        ...store,
        sessions: store.sessions.map(s => {
            if (s.id !== store.activeSessionId) return s;
            return {
                ...s,
                messages: s.messages.map(m => {
                    if (m.id !== msgId || !m.variants) return m;
                    const idx = Math.max(0, Math.min(variantIndex, m.variants.length - 1));
                    const variant = m.variants[idx];
                    return { ...m, activeVariant: idx, content: variant.content, thinking: variant.thinking || '' };
                }),
                updatedAt: Date.now(),
            };
        }),
    };
    saveSessionStore(newStore);
    return newStore;
}
