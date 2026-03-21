'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { INPUT_TOKEN_BUDGET, buildContext, compileSystemPrompt, estimateTokens } from '../lib/context-engine';
import { addTokenRecord, getTokenStats, clearTokenStats } from '../lib/token-stats';
import {
    saveSessionStore, createSession, deleteSession as deleteSessionFn,
    renameSession, switchSession, getActiveSession, addMessage, editMessage as editMsgFn,
    deleteMessage as deleteMsgFn, createBranch, addVariant, switchVariant, replaceMessages
} from '../lib/chat-sessions';
import { getProjectSettings, getChatApiConfig, getActiveWorkId, getSettingsNodes, addSettingsNode, updateSettingsNode, deleteSettingsNode } from '../lib/settings';
import { useAppStore } from '../store/useAppStore';
import ChatMarkdown from './ChatMarkdown';
import ModelPicker from './ModelPicker';
import { FolderOpen, Plus, X, Pencil, Trash2, RefreshCw, GitBranch, CornerDownLeft, ClipboardList, Copy, Code2, FileText } from 'lucide-react';
import { useI18n } from '../lib/useI18n';

/* ---------- 上下文查看器弹窗组件 ---------- */
function ContextViewerModal({ viewingContext, onClose }) {
    const [tab, setTab] = useState('context'); // 'context' | 'raw'
    const [copied, setCopied] = useState(false);
    const { context, rawRequest } = viewingContext || {};

    const handleCopy = () => {
        const text = rawRequest ? JSON.stringify(rawRequest, null, 2) : '';
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
                width: '90%', maxWidth: 700, maxHeight: '85vh', overflow: 'hidden',
                padding: 0, boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column',
            }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 12px', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
                        <button onClick={() => setTab('context')} style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 12, fontWeight: 500,
                            border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer', transition: 'all .15s',
                            background: tab === 'context' ? 'var(--bg-primary)' : 'transparent',
                            color: tab === 'context' ? 'var(--text-primary)' : 'var(--text-muted)',
                            boxShadow: tab === 'context' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                        }}><FileText size={13} />上下文</button>
                        <button onClick={() => setTab('raw')} style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 12, fontWeight: 500,
                            border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer', transition: 'all .15s',
                            background: tab === 'raw' ? 'var(--bg-primary)' : 'transparent',
                            color: tab === 'raw' ? 'var(--text-primary)' : 'var(--text-muted)',
                            boxShadow: tab === 'raw' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                        }}><Code2 size={13} />原始请求</button>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)',
                        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-xs)',
                    }} title="关闭">✕</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 20px' }}>
                    {tab === 'context' && context && (
                        Object.entries(context).map(([key, value]) => (
                            <details key={key} style={{ marginBottom: 10 }}>
                                <summary style={{
                                    cursor: 'pointer', padding: '8px 10px', fontSize: 13, fontWeight: 500,
                                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text-secondary)', userSelect: 'none',
                                }}>{key}
                                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                                        {typeof value === 'string' ? `${value.length} 字` : ''}
                                    </span>
                                </summary>
                                <pre style={{
                                    margin: '6px 0 0', padding: '10px 12px', fontSize: 12, lineHeight: 1.6,
                                    background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-primary)',
                                    maxHeight: 300, overflow: 'auto', border: '1px solid var(--border-light)',
                                }}>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>
                            </details>
                        ))
                    )}
                    {tab === 'raw' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                                <button onClick={handleCopy} style={{
                                    display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                                    fontSize: 12, border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                                    cursor: 'pointer', transition: 'all .15s',
                                }}>
                                    <Copy size={12} />
                                    {copied ? '✓ 已复制' : '复制 JSON'}
                                </button>
                            </div>
                            {rawRequest ? (
                                <pre style={{
                                    margin: 0, padding: '14px 16px', fontSize: 11.5, lineHeight: 1.5,
                                    background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-primary)',
                                    maxHeight: 'calc(85vh - 140px)', overflow: 'auto', border: '1px solid var(--border-light)',
                                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                                }}>{JSON.stringify(rawRequest, null, 2)}</pre>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                                    本条消息没有保存原始请求数据（仅新请求会记录）
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// 解析消息中的 [SETTINGS_ACTION] 块
// 彻底版：多模式匹配 + 流式不完整块隐藏 + 渐进式 JSON 修复
function parseSettingsActions(content) {
    if (!content) return { parts: [content || ''], actions: [] };

    // === 阶段 1：用多个正则模式尝试匹配完整的 action 块 ===
    // 从严格到宽松：覆盖所有已知的 AI 输出变体
    const patterns = [
        // 模式 A：标准格式（带/不带代码围栏），关闭标签允许 \ 转义
        /(?:```\w*\s*\n?)?\[SETTINGS_ACTION\]\s*([\s\S]*?)\s*\[\\?\/SETTINGS_ACTION\](?:\s*\n?```)?/g,
        // 模式 B：AI 在标签外面又包了一层代码围栏（整个块在 ``` 内）
        /```\w*\s*\n\[SETTINGS_ACTION\]\s*([\s\S]*?)\s*\[\\?\/SETTINGS_ACTION\]\s*\n?```/g,
        // 模式 C：AI 忘记斜杠，写成 [SETTINGS_ACTION]...[SETTINGS_ACTION] 作为关闭
        /\[SETTINGS_ACTION\]\s*([\s\S]*?)\s*\[SETTINGS_ACTION\]/g,
    ];

    let parts = [];
    let actions = [];
    let matched = false;

    for (const regex of patterns) {
        parts = [];
        actions = [];
        let lastIndex = 0;
        let match;
        regex.lastIndex = 0; // 重置
        while ((match = regex.exec(content)) !== null) {
            matched = true;
            if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
            const parsed = tryParseActionJson(match[1]);
            if (parsed) {
                actions.push(parsed);
                parts.push({ _action: true, index: actions.length - 1 });
            } else {
                parts.push(match[0]);
            }
            lastIndex = regex.lastIndex;
        }
        if (matched) {
            if (lastIndex < content.length) {
                const tail = content.slice(lastIndex);
                // === 阶段 2：隐藏流式传输中不完整的 action 块 ===
                // 如果剩余文本包含 [SETTINGS_ACTION] 但没有关闭标签，说明正在流式传输中
                const incompleteIdx = tail.indexOf('[SETTINGS_ACTION]');
                if (incompleteIdx >= 0) {
                    // 只保留不完整块之前的文本，隐藏正在传输的 action 块
                    if (incompleteIdx > 0) parts.push(tail.slice(0, incompleteIdx));
                    // 不完整块部分不输出 → 等待关闭标签到达后再完整渲染
                } else {
                    parts.push(tail);
                }
            }
            return { parts, actions };
        }
    }

    // === 阶段 3：没有匹配到任何模式 ===
    // 检查是否有不完整的 action 块（流式传输中）
    const incompleteIdx = content.indexOf('[SETTINGS_ACTION]');
    if (incompleteIdx >= 0) {
        // 检查是否也可能被代码围栏包裹（``` 后紧跟 [SETTINGS_ACTION]）
        let hideFrom = incompleteIdx;
        // 向前查找可能的 ``` 开头
        const before = content.slice(Math.max(0, incompleteIdx - 20), incompleteIdx);
        const fenceMatch = before.match(/```\w*\s*\n?\s*$/);
        if (fenceMatch) {
            hideFrom = incompleteIdx - fenceMatch[0].length;
        }
        const visible = content.slice(0, hideFrom);
        if (visible.trim()) {
            return { parts: [visible], actions: [] };
        }
        return { parts: [content], actions: [] };
    }

    // === 阶段 4：兜底 —— 扫描裸 JSON 对象（AI 完全没用标签的罕见情况）===
    // 只在内容中有 "action" 关键字时尝试
    if (content.includes('"action"') && content.includes('"category"')) {
        const jsonRegex = /\{[^{}]*"action"\s*:\s*"(?:add|update|delete)"[^{}]*"category"\s*:\s*"[^"]*"[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g;
        let match;
        let lastIndex = 0;
        while ((match = jsonRegex.exec(content)) !== null) {
            const parsed = tryParseActionJson(match[0]);
            if (parsed && parsed.action && parsed.category) {
                matched = true;
                if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
                actions.push(parsed);
                parts.push({ _action: true, index: actions.length - 1 });
                lastIndex = jsonRegex.lastIndex;
            }
        }
        if (matched) {
            if (lastIndex < content.length) parts.push(content.slice(lastIndex));
            return { parts, actions };
        }
    }

    return { parts: [content], actions: [] };
}

// 尝试解析 action JSON，兼容各种 AI 输出格式问题
function tryParseActionJson(raw) {
    if (!raw) return null;
    let jsonStr = raw.trim();
    // 去掉 AI 可能嵌套的代码围栏
    jsonStr = jsonStr.replace(/^```\w*\s*\n?/, '').replace(/\n?```\s*$/, '');
    jsonStr = jsonStr.trim();
    if (!jsonStr) return null;

    // 第一次尝试：直接解析
    try { return JSON.parse(jsonStr); } catch { /* continue */ }

    // 第二次尝试：提取第一个 { ... } 对象（处理 AI 在 JSON 前后加了说明文字）
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
        const extracted = objMatch[0];
        try { return JSON.parse(extracted); } catch { /* continue */ }

        // 第三次尝试：修复常见 JSON 问题
        try {
            let fixed = extracted
                .replace(/,\s*([}\]])/g, '$1')           // 尾部逗号
                .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // 无引号的 key
                .replace(/:\s*'([^']*)'/g, ':"$1"');      // 单引号值
            return JSON.parse(fixed);
        } catch { /* continue */ }

        // 第四次尝试：处理值中含未转义换行符
        try {
            let fixed = extracted
                .replace(/,\s*([}\]])/g, '$1')
                .replace(/"([^"]*?)"/g, (m, content) => {
                    return '"' + content.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
                });
            return JSON.parse(fixed);
        } catch { /* continue */ }
    }

    return null;
}

// Helper to generate dynamic elegant gradients for providers
function getProviderColor(provider, model) {
    const p = (provider || '').toLowerCase();
    const m = (model || '').toLowerCase();

    // Exact or strong matches taking model into account
    if (p.includes('openai') || m.includes('gpt') || m.includes('o1') || m.includes('o3')) return 'linear-gradient(135deg, #10a37f 0%, #0b7a5e 100%)';
    if (p.includes('anthropic') || m.includes('claude')) return 'linear-gradient(135deg, #d97757 0%, #b85d3f 100%)';
    if (p.includes('gemini') || p.includes('google') || m.includes('gemini')) return 'linear-gradient(135deg, #4285f4 0%, #8ab4f8 100%)';
    if (p.includes('deepseek') || m.includes('deepseek')) return 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';
    if (p.includes('qwen') || p.includes('dashscope') || p.includes('ali') || p.includes('bailian') || m.includes('qwen')) return 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)';
    if (p.includes('siliconflow') || m.includes('silicon')) return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    if (p.includes('ollama') || m.includes('llama')) return 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)';
    if (p.includes('custom')) return 'linear-gradient(135deg, #4b5563 0%, #374151 100%)';
    if (p.includes('openrouter')) return 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)';
    if (p.includes('volcengine') || p.includes('火山') || m.includes('doubao')) return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
    if (p.includes('minimax') || m.includes('abab')) return 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)';

    // Hash-based dynamic fallback colors for anything else
    const colors = [
        'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', // Pink
        'linear-gradient(135deg, #06b6d4 0%, #0369a1 100%)', // Cyan
        'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', // Purple
        'linear-gradient(135deg, #f97316 0%, #c2410c 100%)', // Orange
        'linear-gradient(135deg, #84cc16 0%, #4d7c0f 100%)'  // Lime
    ];
    let hash = 0;
    const key = p + m;
    for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

// SVG Logos for Providers
function ProviderLogo({ provider, model, className = '' }) {
    const p = (provider || '').toLowerCase();
    const m = (model || '').toLowerCase();

    // Default abstract Hex icon if no match
    let svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>;

    if (p.includes('openai') || m.includes('gpt') || m.includes('o1') || m.includes('o3')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M22.28 12.37a7.02 7.02 0 0 0-1-6.15 7.08 7.08 0 0 0-8.81-2.9 6.95 6.95 0 0 0-4.64-1.2 7.09 7.09 0 0 0-5.74 8.24A7.03 7.03 0 0 0 3.32 18.2 7.07 7.07 0 0 0 12.5 21a6.95 6.95 0 0 0 4.25 1.48 7.1 7.1 0 0 0 5.6-8.23l-.07-1.88ZM11 20.4a4.96 4.96 0 0 1-4.04-2.07l5.96-3.44A1.36 1.36 0 0 0 13.6 14v-6.9l3.43 1.98a4.91 4.91 0 0 1-1.35 8.44L11 20.4Zm-6.52-3.8A4.95 4.95 0 0 1 3.5 11l5.96 3.44v6.87L5.5 19.1A4.9 4.9 0 0 1 4.48 16.6ZM3.5 11a4.95 4.95 0 0 1 3-4.52V13.8a1.36 1.36 0 0 0 .68 1.18l5.97 3.45-3.43 1.98a4.92 4.92 0 0 1-6.22-9.41ZM19.5 13.6a4.95 4.95 0 0 1-3 4.54V10.8a1.36 1.36 0 0 0-.68-1.18L9.85 6.17l3.43-1.98A4.93 4.93 0 0 1 19.5 13.6Zm-6.5-9.4a4.96 4.96 0 0 1 4.04 2.07l-5.96 3.44A1.36 1.36 0 0 0 10.4 10v6.89L6.97 14.9a4.9 4.9 0 0 1 1.35-8.43l4.68-2.27Zm6.5 3.8a4.95 4.95 0 0 1 .98 5.6H14.5v-6.87l3.96-2.21A4.9 4.9 0 0 1 19.5 8Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
    } else if (p.includes('anthropic') || m.includes('claude')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2L2 22h3.5l1.5-3h10l1.5 3H22L12 2zm-5 14l5-10 5 10H7z" /></svg>;
    } else if (p.includes('gemini') || p.includes('google') || m.includes('gemini')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" /></svg>;
    } else if (p.includes('deepseek') || m.includes('deepseek')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><ellipse cx="12" cy="12" rx="10" ry="10"></ellipse><path d="M4.93 4.93l14.14 14.14"></path><path d="M19.07 4.93L4.93 19.07"></path></svg>;
    } else if (p.includes('ollama') || m.includes('llama')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>;
    } else if (p.includes('qwen') || m.includes('qwen')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>;
    } else if (p.includes('openrouter')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /><path d="M2 12h20" /></svg>;
    } else if (p.includes('volcengine') || p.includes('火山') || m.includes('doubao')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>;
    } else if (p.includes('minimax') || m.includes('abab')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    } else if (p.includes('bailian') || p.includes('qwen')) {
        svg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>;
    }

    return svg;
}

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
    const onOpenSettings = useCallback(() => { setAiSidebarOpen(false); setShowSettings('settings'); }, [setAiSidebarOpen, setShowSettings]);

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
    // 总结撤销
    const summaryUndoRef = useRef(null);
    const summaryUndoTimerRef = useRef(null);
    const [summaryUndoVisible, setSummaryUndoVisible] = useState(false);
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
    // 统计刷新版本号
    const [statsVersion, setStatsVersion] = useState(0);

    const chatEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const inputRef = useRef(null);
    const abortRef = useRef(null);
    const [viewingContext, setViewingContext] = useState(null); // { context, rawRequest }

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

    // 切到聊天 Tab / 重新打开侧栏时，滚动到底部并聚焦输入框
    useEffect(() => {
        if (activeTab === 'chat' && open) {
            // 延迟一帧等待 DOM 渲染完成后再滚动到底部
            requestAnimationFrame(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'instant' });
            });
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

    // --- 通用 SSE 流式读取，支持 text+thinking+tools ---
    const streamResponse = useCallback(async (apiEndpoint, systemPrompt, userPrompt, apiConfig, onUpdate, onDone, signal) => {
        // 构建工具配置
        const provider = apiConfig?.provider;
        const isGeminiNative = ['gemini-native', 'custom-gemini'].includes(provider);
        const isOpenAI = ['openai', 'openai-responses'].includes(provider);
        const searchMode = apiConfig?.tools?.searchMode || 'builtin'; // 'builtin' | 'external'
        const searchEnabled = !!apiConfig?.tools?.searchEnabled;
        let toolsPayload = undefined;

        if (isGeminiNative) {
            // Gemini: 内置工具
            const gs = searchEnabled || !!apiConfig?.tools?.googleSearch;
            const ce = !!apiConfig?.tools?.codeExecution;
            if (gs || ce) toolsPayload = { googleSearch: gs, codeExecution: ce };
        } else if (searchEnabled) {
            if (searchMode === 'builtin' && (isOpenAI || provider === 'custom')) {
                // OpenAI 内置搜索
                toolsPayload = { webSearch: true };
            } else if (searchMode === 'external' || (!isOpenAI && provider !== 'custom')) {
                // Function Calling 外部搜索 — 需要外部搜索 API Key
                const sc = apiConfig?.searchConfig || {};
                if (sc.apiKey) {
                    toolsPayload = {
                        functionSearch: true,
                        searchConfig: sc,
                    };
                } else {
                    // 未配置搜索 API Key，提醒用户
                    console.warn('[AiSidebar] 已启用联网搜索但未配置搜索 API Key（Tavily/Exa），本次跳过搜索');
                    showToast?.('⚠️ 联网搜索需要配置 Tavily 或 Exa API Key，请在设置 → API配置 → 联网搜索 中填入', 'warning');
                }
            }
        }

        const startTime = Date.now();
        const requestBody = {
            systemPrompt, userPrompt, apiConfig,
            ...(apiConfig?.useAdvancedParams ? {
                maxTokens: apiConfig.maxOutputTokens || 65536,
                temperature: apiConfig.temperature ?? 1,
                topP: apiConfig.topP ?? 0.95,
                reasoningEffort: apiConfig.reasoningEffort || 'auto',
            } : {}),
            ...(toolsPayload ? { tools: toolsPayload } : {}),
        };
        const res = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            ...(signal ? { signal } : {}),
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
        let usageData = null;
        let toolCalls = []; // 收集工具调用结果

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
                        if (json.usage) { usageData = json.usage; }
                        // 工具调用事件
                        if (json.codeExec) { toolCalls.push({ type: 'codeExec', ...json.codeExec }); hasUpdate = true; }
                        if (json.codeResult) { toolCalls.push({ type: 'codeResult', ...json.codeResult }); hasUpdate = true; }
                        if (json.grounding) { toolCalls.push({ type: 'grounding', ...json.grounding }); hasUpdate = true; }
                    } catch { }
                }
            }
            if (hasUpdate) onUpdate(fullText, fullThinking, toolCalls);
        }

        // 记录 token 统计
        const durationMs = Date.now() - startTime;
        if (usageData) {
            addTokenRecord({
                promptTokens: usageData.promptTokens || 0,
                completionTokens: usageData.completionTokens || 0,
                totalTokens: usageData.totalTokens || 0,
                durationMs,
                source: 'chat',
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
                source: 'chat',
                provider: apiConfig?.provider || 'unknown',
                model: apiConfig?.model || 'unknown',
            });
        }
        setStatsVersion(v => v + 1);

        onDone(fullText, fullThinking, toolCalls);
        return requestBody;
    }, []);

    // 终止生成
    const handleStop = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
    }, []);

    const onChatMessage = useCallback(async (text, selectedHistory) => {
        const userMsg = { id: `msg-${Date.now()}-u`, role: 'user', content: text, timestamp: Date.now() };
        setSessionStore(prev => addMessage(prev, userMsg));
        setChatStreaming(true);
        const aiMsgId = `msg-${Date.now()}-a`;
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const apiConfig = getChatApiConfig();

            const apiEndpoint = ['gemini-native', 'custom-gemini'].includes(apiConfig?.provider) ? '/api/ai/gemini'
                : apiConfig?.provider === 'openai-responses' ? '/api/ai/responses'
                    : (['claude', 'custom-claude'].includes(apiConfig?.provider) || apiConfig?.apiFormat === 'anthropic') ? '/api/ai/claude'
                        : '/api/ai';

            const context = await buildContext(activeChapterId, text, contextSelection.size > 0 ? contextSelection : null);
            const systemPrompt = compileSystemPrompt(context, 'chat');
            const historyForApi = selectedHistory.map(m => `${m.role === 'user' ? t('aiSidebar.roleYou') : t('aiSidebar.roleAi')}: ${m.content}`).join('\n');
            const userPrompt = historyForApi ? `${historyForApi}\n${t('aiSidebar.roleYou')}: ${text}` : text;

            // 保存上下文快照（不含提示词模板和安全策略）
            const contextSnapshot = {};
            if (context.bookInfo) contextSnapshot['作品信息'] = context.bookInfo;
            if (context.characters) contextSnapshot['人物档案'] = context.characters;
            if (context.locations) contextSnapshot['空间/地点'] = context.locations;
            if (context.worldbuilding) contextSnapshot['世界观'] = context.worldbuilding;
            if (context.objects) contextSnapshot['物品/道具'] = context.objects;
            if (context.plotOutline) contextSnapshot['剧情大纲'] = context.plotOutline;
            if (context.writingRules) contextSnapshot['写作规则'] = context.writingRules;
            if (context.customSettings) contextSnapshot['补充设定'] = context.customSettings;
            if (context.previousChapters) contextSnapshot['前文回顾'] = context.previousChapters;
            if (context.currentChapter) contextSnapshot['当前章节'] = context.currentChapter;
            contextSnapshot['对话历史'] = userPrompt;

            const aiPlaceholder = { id: aiMsgId, role: 'assistant', content: '', thinking: '', toolCalls: [], timestamp: Date.now(), _context: contextSnapshot, _rawRequest: null };
            setSessionStore(prev => addMessage(prev, aiPlaceholder));

            const returnedBody = await streamResponse(apiEndpoint, systemPrompt, userPrompt, apiConfig,
                (snapText, snapThinking, snapToolCalls) => {
                    setSessionStore(prev => ({
                        ...prev, sessions: prev.sessions.map(s => {
                            if (s.id !== prev.activeSessionId) return s;
                            return { ...s, messages: s.messages.map(m => m.id === aiMsgId ? { ...m, content: snapText, thinking: snapThinking, toolCalls: snapToolCalls } : m) };
                        }),
                    }));
                },
                (finalText, finalThinking, finalToolCalls) => {
                    setSessionStore(prev => {
                        const finalStore = {
                            ...prev, sessions: prev.sessions.map(s => {
                                if (s.id !== prev.activeSessionId) return s;
                                return {
                                    ...s, messages: s.messages.map(m => m.id === aiMsgId ? { ...m, content: finalText || '（AI 未返回内容）', thinking: finalThinking, toolCalls: finalToolCalls } : m),
                                    updatedAt: Date.now(),
                                };
                            }),
                        };
                        saveSessionStore(finalStore);
                        return finalStore;
                    });
                },
                controller.signal
            );
            // Store raw request body on the AI message
            if (returnedBody) {
                setSessionStore(prev => {
                    const updated = {
                        ...prev, sessions: prev.sessions.map(s => {
                            if (s.id !== prev.activeSessionId) return s;
                            return { ...s, messages: s.messages.map(m => m.id === aiMsgId ? { ...m, _rawRequest: returnedBody } : m) };
                        }),
                    };
                    saveSessionStore(updated);
                    return updated;
                });
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                // 用户主动终止 — 保留已生成的内容
                setSessionStore(prev => {
                    const store = {
                        ...prev, sessions: prev.sessions.map(s => {
                            if (s.id !== prev.activeSessionId) return s;
                            return {
                                ...s, messages: s.messages.map(m => {
                                    if (m.id !== aiMsgId) return m;
                                    return { ...m, content: (m.content || '') + '\n\n*（已终止生成）*' };
                                }), updatedAt: Date.now(),
                            };
                        }),
                    };
                    saveSessionStore(store);
                    return store;
                });
            } else {
                const errorMsg = { id: `msg-${Date.now()}-e`, role: 'assistant', content: `❌ ${err.message}`, timestamp: Date.now() };
                setSessionStore(prev => addMessage(prev, errorMsg));
            }
        } finally {
            abortRef.current = null;
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
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const apiConfig = getChatApiConfig();

            const apiEndpoint = ['gemini-native', 'custom-gemini'].includes(apiConfig?.provider) ? '/api/ai/gemini'
                : apiConfig?.provider === 'openai-responses' ? '/api/ai/responses'
                    : (['claude', 'custom-claude'].includes(apiConfig?.provider) || apiConfig?.apiFormat === 'anthropic') ? '/api/ai/claude'
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
                            return { ...m, variants, content: '', thinking: '', toolCalls: [] };
                        }),
                    };
                }),
            }));

            await streamResponse(apiEndpoint, systemPrompt, userPrompt, apiConfig,
                (snapText, snapThinking, snapToolCalls) => {
                    setSessionStore(prev => ({
                        ...prev, sessions: prev.sessions.map(s => {
                            if (s.id !== prev.activeSessionId) return s;
                            return { ...s, messages: s.messages.map(m => m.id === aiMsgId ? { ...m, content: snapText, thinking: snapThinking, toolCalls: snapToolCalls } : m) };
                        }),
                    }));
                },
                (finalText, finalThinking, finalToolCalls) => {
                    setSessionStore(prev => {
                        const newStore = addVariant(prev, aiMsgId, { content: finalText || '（AI 未返回内容）', thinking: finalThinking, toolCalls: finalToolCalls, timestamp: Date.now() });
                        saveSessionStore(newStore);
                        return newStore;
                    });
                },
                controller.signal
            );
        } catch (err) {
            if (err.name === 'AbortError') {
                setSessionStore(prev => {
                    const store = {
                        ...prev, sessions: prev.sessions.map(s => {
                            if (s.id !== prev.activeSessionId) return s;
                            return {
                                ...s, messages: s.messages.map(m => {
                                    if (m.id !== aiMsgId) return m;
                                    return { ...m, content: (m.content || '') + '\n\n*（已终止生成）*' };
                                }), updatedAt: Date.now(),
                            };
                        }),
                    };
                    saveSessionStore(store);
                    return store;
                });
            } else {
                setSessionStore(prev => ({
                    ...prev, sessions: prev.sessions.map(s => {
                        if (s.id !== prev.activeSessionId) return s;
                        return { ...s, messages: s.messages.map(m => m.id === aiMsgId ? { ...m, content: `❌ ${err.message}` } : m) };
                    }),
                }));
            }
        } finally {
            abortRef.current = null;
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
        // 保存当前历史以便撤销
        summaryUndoRef.current = [...chatHistory];
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
        // 显示撤销栏
        setSummaryUndoVisible(true);
        if (summaryUndoTimerRef.current) clearTimeout(summaryUndoTimerRef.current);
        summaryUndoTimerRef.current = setTimeout(() => {
            setSummaryUndoVisible(false);
            summaryUndoRef.current = null;
        }, 8000);
    }, [summaryDraft, checkedHistory, chatHistory, setChatHistory]);

    // 撤销总结
    const undoSummary = useCallback(() => {
        if (!summaryUndoRef.current) return;
        setChatHistory?.(summaryUndoRef.current);
        summaryUndoRef.current = null;
        setSummaryUndoVisible(false);
        if (summaryUndoTimerRef.current) clearTimeout(summaryUndoTimerRef.current);
        showToast?.(t('aiSidebar.summaryUndone'), 'success');
    }, [setChatHistory, showToast, t]);

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

    // Token 统计
    const tokenStats = useMemo(() => getTokenStats(), [statsVersion]);

    const tabs = [
        { key: 'chat', label: t('aiSidebar.tabChat') },
        { key: 'archive', label: t('aiSidebar.tabArchive') },
        { key: 'reference', label: t('aiSidebar.tabReference') },
        { key: 'stats', label: t('aiSidebar.tabStats') },
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
        pending: '… 待确认',
    };

    // 会话列表
    const sessions = sessionStore?.sessions || [];
    const activeSessionId = sessionStore?.activeSessionId;

    if (!open) return null;

    return (
        <>
            <div className="ai-sidebar">
                {/* 标题栏 */}
                <div className="ai-sidebar-header">
                    <span className="ai-sidebar-title">{t('aiSidebar.title')}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setShowSessionList(!showSessionList)}
                            title={t('aiSidebar.btnSessionList')}
                        ><FolderOpen size={15} /></button>
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={onNewSession}
                            title={t('aiSidebar.btnNewSession')}
                        ><Plus size={15} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} title={t('aiSidebar.btnClose')}><X size={15} /></button>
                    </div>
                    {/* 会话列表下拉面板 */}
                    {showSessionList && (<>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowSessionList(false)} />
                        <div className="session-list-panel">
                        <div className="session-list-header">
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{t('aiSidebar.historyCount').replace('{count}', sessions.length)}</span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: 11, padding: '2px 8px', lineHeight: 1.4 }}
                                    onClick={() => {
                                        const data = JSON.stringify(sessionStore, null, 2);
                                        const blob = new Blob([data], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        const ts = new Date().toISOString().slice(0, 10);
                                        a.href = url;
                                        a.download = `chat-sessions-${ts}.json`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                        showToast(t('aiSidebar.exportSessionsOk') || '对话记录已导出', 'success');
                                    }}
                                >导出</button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: 11, padding: '2px 8px', lineHeight: 1.4 }}
                                    onClick={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = '.json';
                                        input.onchange = async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            try {
                                                const text = await file.text();
                                                const imported = JSON.parse(text);
                                                const importedSessions = imported.sessions || [];
                                                if (!importedSessions.length) {
                                                    showToast(t('aiSidebar.importSessionsEmpty') || '文件中没有对话记录', 'error');
                                                    return;
                                                }
                                                setSessionStore(prev => {
                                                    const existingIds = new Set(prev.sessions.map(s => s.id));
                                                    const newSessions = importedSessions.filter(s => !existingIds.has(s.id));
                                                    const merged = {
                                                        ...prev,
                                                        sessions: [...prev.sessions, ...newSessions],
                                                    };
                                                    saveSessionStore(merged);
                                                    return merged;
                                                });
                                                const newCount = importedSessions.length;
                                                showToast((t('aiSidebar.importSessionsOk') || '已导入 {count} 个对话').replace('{count}', newCount), 'success');
                                            } catch (err) {
                                                showToast((t('aiSidebar.importSessionsFail') || '导入失败: {error}').replace('{error}', err.message), 'error');
                                            }
                                        };
                                        input.click();
                                    }}
                                >导入</button>
                                <div style={{ width: 1, height: 14, background: 'var(--border-light)' }} />
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: 11, padding: '2px 8px', lineHeight: 1.4, color: 'var(--danger, #e53e3e)' }}
                                    onClick={() => {
                                        if (!confirm('确定要清空所有对话历史吗？此操作不可撤销。')) return;
                                        setSessionStore(prev => {
                                            const cleared = { activeSessionId: prev.activeSessionId, sessions: prev.sessions.filter(s => s.id === prev.activeSessionId) };
                                            if (cleared.sessions.length === 0) {
                                                const fresh = { id: `session-${Date.now()}`, title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
                                                cleared.sessions = [fresh];
                                                cleared.activeSessionId = fresh.id;
                                            }
                                            saveSessionStore(cleared);
                                            return cleared;
                                        });
                                        showToast('已清空对话历史', 'success');
                                    }}
                                >清空</button>
                            </div>
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
                                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
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
                                                ><Pencil size={12} /></button>
                                                {sessions.length > 1 && (
                                                    <button
                                                        className="btn-mini-icon danger"
                                                        onClick={() => onDeleteSession?.(s.id)}
                                                        title={t('aiSidebar.delete')}
                                                    ><Trash2 size={12} /></button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    </>)}
                </div>

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

                        {/* 撤销总结提示栏 */}
                        {summaryUndoVisible && (
                            <div className="summary-undo-bar">
                                <span>{t('aiSidebar.summaryApplied')}</span>
                                <button className="btn-mini" onClick={undoSummary}>{t('aiSidebar.undoSummary')}</button>
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
                                                    title={t('aiSidebar.btnEdit')}
                                                ><Pencil size={13} /></button>
                                                {msg.role === 'user' && (
                                                    <button
                                                        className="btn-mini-icon"
                                                        onClick={() => handleResend(msg.id)}
                                                        title={t('aiSidebar.btnResend')}
                                                        disabled={chatStreaming}
                                                    ><CornerDownLeft size={13} /></button>
                                                )}
                                                {msg.role === 'assistant' && (
                                                    <button
                                                        className="btn-mini-icon"
                                                        onClick={() => onRegenerate?.(msg.id)}
                                                        title={t('aiSidebar.btnRegenerate')}
                                                        disabled={chatStreaming}
                                                    ><RefreshCw size={13} /></button>
                                                )}
                                                {msg.role === 'assistant' && msg._context && (
                                                    <button
                                                        className="btn-mini-icon"
                                                        onClick={() => setViewingContext({ context: msg._context, rawRequest: msg._rawRequest })}
                                                        title="查看发送给 AI 的上下文"
                                                    ><ClipboardList size={13} /></button>
                                                )}
                                                <button
                                                    className="btn-mini-icon"
                                                    onClick={() => onBranch?.(msg.id)}
                                                    title={t('aiSidebar.btnBranch')}
                                                ><GitBranch size={13} /></button>
                                                <button
                                                    className="btn-mini-icon danger"
                                                    onClick={() => onDeleteMessage?.(msg.id)}
                                                    title={t('aiSidebar.delete')}
                                                ><Trash2 size={13} /></button>
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
                                        {/* 工具调用结果展示（Gemini 内置工具） */}
                                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                                            <div className="tool-calls-container">
                                                {msg.toolCalls.map((tc, idx) => {
                                                    if (tc.type === 'codeExec') return (
                                                        <div key={idx} className="tool-call-card code-exec">
                                                            <div className="tool-call-header">💻 {t('aiSidebar.toolCodeExec') || '代码执行'} <span className="tool-lang">{tc.language}</span></div>
                                                            <pre className="tool-code-block"><code>{tc.code}</code></pre>
                                                        </div>
                                                    );
                                                    if (tc.type === 'codeResult') return (
                                                        <div key={idx} className={`tool-call-card code-result ${tc.outcome === 'OUTCOME_OK' ? 'success' : 'error'}`}>
                                                            <div className="tool-call-header">{tc.outcome === 'OUTCOME_OK' ? '✅' : '❌'} {t('aiSidebar.toolCodeResult') || '执行结果'}</div>
                                                            <pre className="tool-code-block"><code>{tc.output}</code></pre>
                                                        </div>
                                                    );
                                                    if (tc.type === 'grounding' && tc.sources?.length > 0) return (
                                                        <div key={idx} className="tool-call-card grounding">
                                                            <div className="tool-call-header">🔍 {t('aiSidebar.toolSearchSources') || '搜索来源'}</div>
                                                            <div className="grounding-sources">
                                                                {tc.sources.map((src, si) => (
                                                                    <a key={si} className="grounding-chip" href={src.uri} target="_blank" rel="noopener noreferrer" title={src.uri}>
                                                                        {src.title || src.uri}
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                    return null;
                                                })}
                                            </div>
                                        )}
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
                                                            .replace(/(?:```[^\n]*\n)?\[SETTINGS_ACTION\][\s\S]*?\[\\?\/SETTINGS_ACTION\](?:\n```)?/g, '')
                                                            .replace(/\[SETTINGS_ACTION\][\s\S]*?\[SETTINGS_ACTION\]/g, '')
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
                                        )
                                        }
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>

                        {/* 模型切换器 + 输入框 */}
                        <div className="chat-input-area">
                            <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                                <textarea
                                    ref={inputRef}
                                    className="chat-input"
                                    placeholder={t('aiSidebar.inputPlaceholder')}
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    disabled={chatStreaming}
                                    rows={2}
                                />
                                {chatStreaming ? (
                                    <button
                                        className="chat-send-btn chat-stop-btn"
                                        onClick={handleStop}
                                        title="终止生成"
                                    >
                                        ■
                                    </button>
                                ) : (
                                    <button
                                        className="chat-send-btn"
                                        onClick={handleSend}
                                        disabled={!inputText.trim()}
                                    >
                                        ↑
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
                }

                {/* ==================== 📋 存档 Tab ==================== */}
                {
                    activeTab === 'archive' && (
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
                    )
                }

                {/* ==================== 📚 参考 Tab ==================== */}
                {
                    activeTab === 'reference' && (
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
                    )
                }

                {/* ==================== 📊 统计 Tab ==================== */}
                {
                    activeTab === 'stats' && (
                        <div className="ai-sidebar-body">
                            <div className="token-stats-panel">
                                {tokenStats.totalRequests === 0 ? (
                                    <div className="chat-empty">
                                        <div>📊</div>
                                        <div>{t('aiSidebar.statsNoData')}</div>
                                        <div className="chat-empty-hint">{t('aiSidebar.statsNoDataHint')}</div>
                                    </div>
                                ) : (
                                    <>
                                        {/* 汇总卡片 */}
                                        <div className="stats-grid">
                                            <div className="stats-card">
                                                <div className="stats-card-value">{tokenStats.totalTokens.toLocaleString()}</div>
                                                <div className="stats-card-label">{t('aiSidebar.statsTotalTokens')}</div>
                                            </div>
                                            <div className="stats-card">
                                                <div className="stats-card-value">{tokenStats.totalPromptTokens.toLocaleString()}</div>
                                                <div className="stats-card-label">{t('aiSidebar.statsTotalInput')}</div>
                                            </div>
                                            <div className="stats-card">
                                                <div className="stats-card-value">{tokenStats.totalCompletionTokens.toLocaleString()}</div>
                                                <div className="stats-card-label">{t('aiSidebar.statsTotalOutput')}</div>
                                            </div>
                                            <div className="stats-card">
                                                <div className="stats-card-value">{tokenStats.totalRequests}</div>
                                                <div className="stats-card-label">{t('aiSidebar.statsTotalRequests')}</div>
                                            </div>
                                            <div className="stats-card">
                                                <div className="stats-card-value">{tokenStats.trackedDays}</div>
                                                <div className="stats-card-label">{t('aiSidebar.statsTrackedDays')}</div>
                                            </div>
                                        </div>

                                        {/* 消耗速率 */}
                                        <div className="stats-section">
                                            <div className="stats-section-title">{t('aiSidebar.statsRates')}</div>
                                            <div className="stats-section-hint">{t('aiSidebar.statsRatesHint')}</div>
                                            <table className="projection-table">
                                                <thead>
                                                    <tr>
                                                        <th>{t('aiSidebar.statsRateMetric')}</th>
                                                        <th>{t('aiSidebar.statsRateDesc')}</th>
                                                        <th>{t('aiSidebar.statsRateValue')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {[
                                                        ['TPS', tokenStats.rates.tps, t('aiSidebar.statsRateTPS')],
                                                        ['TPM', tokenStats.rates.tpm, t('aiSidebar.statsRateTPM')],
                                                        ['TPH', tokenStats.rates.tph, t('aiSidebar.statsRateTPH')],
                                                        ['TPD', tokenStats.rates.tpd, t('aiSidebar.statsRateTPD')],
                                                        ['RPM', tokenStats.rates.rpm, t('aiSidebar.statsRateRPM')],
                                                        ['RPH', tokenStats.rates.rph, t('aiSidebar.statsRateRPH')],
                                                        ['RPD', tokenStats.rates.rpd, t('aiSidebar.statsRateRPD')],
                                                    ].map(([key, value, label]) => (
                                                        <tr key={key} title={label}>
                                                            <td><strong>{key}</strong></td>
                                                            <td className="stats-rate-desc">{label}</td>
                                                            <td>{value < 1 ? value.toFixed(2) : value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* 近期请求速度 */}
                                        {tokenStats.recentSpeeds.length > 0 && (
                                            <div className="stats-section">
                                                <div className="stats-section-title">{t('aiSidebar.statsRecentSpeeds')}</div>
                                                <div className="speed-chart">
                                                    {(() => {
                                                        const maxSpeed = Math.max(...tokenStats.recentSpeeds.map(s => s.speed));
                                                        return tokenStats.recentSpeeds.map((s, i) => (
                                                            <div key={i} className="speed-bar-wrapper" title={`${s.speed.toFixed(1)} tokens/s · ${s.tokens} tokens`}>
                                                                <div
                                                                    className="speed-bar"
                                                                    style={{ height: `${Math.max(4, (s.speed / maxSpeed) * 100)}%` }}
                                                                />
                                                                <span className="speed-bar-label">{s.speed.toFixed(0)}</span>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>
                                            </div>
                                        )}

                                        {/* 消耗预估 */}
                                        <div className="stats-section">
                                            <div className="stats-section-title">{t('aiSidebar.statsProjections')}</div>
                                            <div className="stats-section-hint">{t('aiSidebar.statsProjectionsHint')}</div>
                                            <table className="projection-table">
                                                <thead>
                                                    <tr>
                                                        <th>{t('aiSidebar.statsPeriod')}</th>
                                                        <th>{t('aiSidebar.statsTokens')}</th>
                                                        <th>{t('aiSidebar.statsRequests')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {[
                                                        ['statsPeriodDay', tokenStats.projections.perDay],
                                                        ['statsPeriodWeek', tokenStats.projections.perWeek],
                                                        ['statsPeriodMonth', tokenStats.projections.perMonth],
                                                        ['statsPeriodQuarter', tokenStats.projections.perQuarter],
                                                        ['statsPeriodYear', tokenStats.projections.perYear],
                                                    ].map(([key, data]) => (
                                                        <tr key={key}>
                                                            <td>{t(`aiSidebar.${key}`)}</td>
                                                            <td>{data.tokens.toLocaleString()}</td>
                                                            <td>{data.requests}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* 渠道/模型分类统计 */}
                                        {tokenStats.modelBreakdown.length > 0 && (
                                            <div className="stats-section">
                                                <div className="stats-section-title">{t('aiSidebar.statsModelBreakdown')}</div>
                                                <div className="stats-section-hint">{t('aiSidebar.statsModelBreakdownHint')}</div>
                                                {tokenStats.modelBreakdown.map((m, idx) => {
                                                    const bgGradient = getProviderColor(m.provider, m.model);
                                                    return (
                                                        <div key={idx} className="model-info-card">
                                                            <div className="model-info-header">
                                                                <div className="model-info-title">
                                                                    <span className="model-info-badge" style={{ background: bgGradient }}>
                                                                        <ProviderLogo provider={m.provider} model={m.model} className="provider-logo-svg" />
                                                                        {m.provider}
                                                                    </span>
                                                                    <span className="model-info-name" title={m.model}>{m.model}</span>
                                                                </div>
                                                                <div className="model-info-percent">
                                                                    {Math.round(m.tokenPercent)}<span>%</span>
                                                                </div>
                                                            </div>

                                                            <div className="model-info-bar-track">
                                                                <div className="model-info-bar-fill" style={{ width: `${m.tokenPercent}%`, background: bgGradient }} />
                                                            </div>

                                                            <div className="model-info-stats">
                                                                <div className="info-stat-group">
                                                                    <span className="info-stat-value">{m.tokens.toLocaleString()}</span>
                                                                    <span className="info-stat-label">Tokens</span>
                                                                </div>
                                                                <div className="info-stat-group">
                                                                    <span className="info-stat-value">{m.requests}</span>
                                                                    <span className="info-stat-label">{t('aiSidebar.statsRequests')}</span>
                                                                </div>
                                                                <div className="info-stat-group" title={`${t('aiSidebar.statsTotalInput')}: ${m.promptTokens} / ${t('aiSidebar.statsTotalOutput')}: ${m.completionTokens}`}>
                                                                    <span className="info-stat-value">
                                                                        {m.promptTokens > 1000 ? (m.promptTokens / 1000).toFixed(1) + 'k' : m.promptTokens} / {m.completionTokens > 1000 ? (m.completionTokens / 1000).toFixed(1) + 'k' : m.completionTokens}
                                                                    </span>
                                                                    <span className="info-stat-label">In / Out</span>
                                                                </div>
                                                                {m.avgSpeed > 0 && (
                                                                    <div className="info-stat-group">
                                                                        <span className="info-stat-value">{m.avgSpeed.toFixed(1)}</span>
                                                                        <span className="info-stat-label">t/s</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* 清空按钮 */}
                                        <div className="stats-actions">
                                            <button
                                                className="btn-mini danger"
                                                onClick={() => {
                                                    if (confirm(t('aiSidebar.statsClearConfirm'))) {
                                                        clearTokenStats();
                                                        setStatsVersion(v => v + 1);
                                                    }
                                                }}
                                            >
                                                {t('aiSidebar.statsClearBtn')}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                }
            </div >

            {/* 上下文查看器弹窗 */}
            {
                viewingContext && (
                    <ContextViewerModal
                        viewingContext={viewingContext}
                        onClose={() => setViewingContext(null)}
                    />
                )
            }
        </>
    );
}
