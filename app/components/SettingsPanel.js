'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
    getProjectSettings,
    saveProjectSettings,
    getSettingsNodes,
    addSettingsNode,
    updateSettingsNode,
    deleteSettingsNode,
    WRITING_MODES,
    getWritingMode,
    setWritingMode,
    createWorkNode,
    saveSettingsNodes,
    getActiveWorkId,
    setActiveWorkId,
    getAllWorks,
} from '../lib/settings';
import SettingsTree from './SettingsTree';
import { useI18n } from '../lib/useI18n';
import SettingsItemEditor from './SettingsItemEditor';

const CAT_STYLES = {
    work: { color: 'var(--cat-work)', bg: 'var(--cat-work-bg)', icon: '📕' },
    character: { color: 'var(--cat-character)', bg: 'var(--cat-character-bg)', icon: '👤' },
    location: { color: 'var(--cat-location)', bg: 'var(--cat-location-bg)', icon: '🗺️' },
    world: { color: 'var(--cat-world)', bg: 'var(--cat-world-bg)', icon: '🌍' },
    object: { color: 'var(--cat-object)', bg: 'var(--cat-object-bg)', icon: '🔮' },
    plot: { color: 'var(--cat-plot)', bg: 'var(--cat-plot-bg)', icon: '📋' },
    rules: { color: 'var(--cat-rules)', bg: 'var(--cat-rules-bg)', icon: '📐' },
};

export default function SettingsPanel() {
    const {
        showSettings: open,
        setShowSettings,
        setWritingMode: setGlobalWritingMode,
        incrementSettingsVersion
    } = useAppStore();

    const onClose = () => {
        setShowSettings(false);
        setGlobalWritingMode(getWritingMode());
        incrementSettingsVersion();
    };

    const [settings, setSettings] = useState(null);
    const [activeTab, setActiveTab] = useState('settings');
    const [nodes, setNodes] = useState([]);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [writingMode, setWritingModeState] = useState('webnovel');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeWorkId, setActiveWorkIdState] = useState(null);
    const [showNewWorkInput, setShowNewWorkInput] = useState(false);
    const [newWorkName, setNewWorkName] = useState('');
    const { t } = useI18n();

    const [expandedCategory, setExpandedCategory] = useState(null);

    // 获取当前作品的节点
    useEffect(() => {
        if (open) {
            setSettings(getProjectSettings());
            const loadNodes = async () => {
                const allNodes = await getSettingsNodes();
                setNodes(allNodes);
                setWritingModeState(getWritingMode());
                setSearchQuery('');
                // 初始化激活作品
                let wid = getActiveWorkId();
                if (!wid || !allNodes.find(n => n.id === wid)) {
                    const firstWork = allNodes.find(n => n.type === 'work');
                    wid = firstWork?.id || null;
                    if (wid) setActiveWorkId(wid);
                }
                setActiveWorkIdState(wid);
            };
            loadNodes();
        }
    }, [open]);

    // 所有作品列表
    const works = useMemo(() => getAllWorks(nodes), [nodes]);

    // 当前作品下的节点
    const visibleNodes = useMemo(() => {
        if (!activeWorkId) return nodes;
        // 递归收集当前作品的所有后代 id
        const workDescendants = new Set();
        const collectDescendants = (parentId) => {
            nodes.filter(n => n.parentId === parentId).forEach(n => {
                workDescendants.add(n.id);
                collectDescendants(n.id);
            });
        };
        workDescendants.add(activeWorkId);
        collectDescendants(activeWorkId);
        return nodes.filter(n => workDescendants.has(n.id));
    }, [nodes, activeWorkId]);

    const stats = useMemo(() => {
        const items = visibleNodes.filter(n => n.type === 'item');
        return Object.entries(CAT_STYLES).filter(([cat]) => cat !== 'work').map(([cat, style]) => ({
            category: cat,
            count: items.filter(n => n.category === cat).length,
            label: t(`settings.categories.${cat}`),
            ...style,
        }));
    }, [visibleNodes, t]);

    // 作品管理
    const handleSwitchWork = (workId) => {
        setActiveWorkIdState(workId);
        setActiveWorkId(workId);
        setSelectedNodeId(null);
    };

    const handleCreateWork = async () => {
        const name = newWorkName.trim();
        if (!name) return;
        const { workNode, subNodes } = createWorkNode(name);
        const updatedNodes = [...nodes, workNode, ...subNodes];
        await saveSettingsNodes(updatedNodes);
        setNodes(updatedNodes);
        setActiveWorkIdState(workNode.id);
        setActiveWorkId(workNode.id);
        setNewWorkName('');
        setShowNewWorkInput(false);
        setSelectedNodeId(null);
    };

    const handleDeleteWork = async (workId) => {
        const work = nodes.find(n => n.id === workId);
        if (!work) return;
        if (works.length <= 1) { alert(t('settings.deleteWorkAlert')); return; }
        if (!confirm(t('settings.deleteWorkPrompt').replace('{name}', work.name))) return;
        // 递归删除作品及其所有后代
        const toDelete = new Set();
        const collect = (pid) => { toDelete.add(pid); nodes.filter(n => n.parentId === pid).forEach(n => collect(n.id)); };
        collect(workId);
        const updatedNodes = nodes.filter(n => !toDelete.has(n.id));
        await saveSettingsNodes(updatedNodes);
        setNodes(updatedNodes);
        // 切换到第一个存活的作品
        const nextWork = updatedNodes.find(n => n.type === 'work');
        if (nextWork) {
            setActiveWorkIdState(nextWork.id);
            setActiveWorkId(nextWork.id);
        }
        setSelectedNodeId(null);
    };

    if (!open || !settings) return null;

    const handleSettingsSave = (section, data) => {
        const newSettings = { ...settings, [section]: data };
        setSettings(newSettings);
        saveProjectSettings(newSettings);
    };

    // 节点操作
    const handleAddNode = async (parentId, category) => {
        let cat = category || 'custom';
        if (parentId && !category) {
            const parent = nodes.find(n => n.id === parentId);
            if (parent) cat = parent.category;
        }
        const newNode = await addSettingsNode({
            name: t('settings.newItem'),
            type: 'item',
            category: cat,
            parentId,
            enabled: true,
        });
        setNodes(await getSettingsNodes());
        setSelectedNodeId(newNode.id);
    };

    const handleDeleteNode = async (id) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        if (!confirm(t('settings.deleteNodePrompt').replace('{name}', node.name))) return;
        await deleteSettingsNode(id);
        setNodes(await getSettingsNodes());
        if (selectedNodeId === id) setSelectedNodeId(null);
    };

    const handleRenameNode = async (id, newName) => {
        await updateSettingsNode(id, { name: newName });
        setNodes(await getSettingsNodes());
    };

    const handleToggleEnabled = async (id) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        const newEnabled = node.enabled === false ? true : false;
        await updateSettingsNode(id, { enabled: newEnabled });
        setNodes(prev => prev.map(n => n.id === id ? { ...n, enabled: newEnabled } : n));
    };

    const handleUpdateNode = async (id, updates) => {
        await updateSettingsNode(id, updates);
        setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n));
    };

    const selectedNode = visibleNodes.find(n => n.id === selectedNodeId);
    const showBookInfo = selectedNode?.type === 'special' && selectedNode?.category === 'bookInfo';

    const tabs = [
        { key: 'settings', label: t('settings.tabSettings') },
        { key: 'apiConfig', label: t('settings.tabApi') },
        { key: 'preferences', label: t('settings.tabPreferences') },
    ];

    return (
        <div className="settings-panel-overlay" onClick={onClose}>
            <div className="settings-panel-container glass-panel" onClick={e => e.stopPropagation()}>
                {/* 头部 */}
                <div className="settings-header" style={{ background: 'transparent' }}>
                    <h2>
                        ⚙️ {t('settings.title')}
                        <span className="subtitle">— {t('settings.subtitle')}</span>
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                {/* Tab 导航 */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-glass)', padding: '0 24px' }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            style={{
                                padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                                fontSize: 13, color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
                                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                                fontWeight: activeTab === tab.key ? 600 : 400, transition: 'all 0.15s', whiteSpace: 'nowrap',
                            }}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* 内容区 */}
                {activeTab === 'apiConfig' ? (
                    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                        <ApiConfigForm data={settings.apiConfig} onChange={data => handleSettingsSave('apiConfig', data)} />
                    </div>
                ) : activeTab === 'preferences' ? (
                    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                        <PreferencesForm />
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* 写作模式选择器 */}
                        <div style={{ display: 'flex', gap: 10, padding: '14px 24px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
                            {Object.values(WRITING_MODES).map(m => (
                                <button
                                    key={m.key}
                                    className={`writing-mode-card ${writingMode === m.key ? 'active' : ''}`}
                                    style={{
                                        border: writingMode === m.key ? `2px solid ${m.color}` : '1px solid var(--border-light)',
                                        background: writingMode === m.key ? `${m.color}10` : 'var(--bg-primary)',
                                    }}
                                    onClick={() => { setWritingModeState(m.key); setWritingMode(m.key); }}
                                >
                                    <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: writingMode === m.key ? m.color : 'var(--text-primary)', marginBottom: 2 }}>{m.label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{m.desc}</div>
                                </button>
                            ))}
                        </div>

                        {/* 作品切换器 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-primary)' }}>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('settings.workLabel')}</span>
                            <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                                {works.map(w => (
                                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                        <button
                                            style={{
                                                padding: '5px 12px', border: activeWorkId === w.id ? '2px solid var(--cat-work)' : '1px solid var(--border-light)',
                                                borderRadius: 'var(--radius-sm)', background: activeWorkId === w.id ? 'var(--cat-work-bg)' : 'var(--bg-secondary)',
                                                cursor: 'pointer', fontSize: 12, fontWeight: activeWorkId === w.id ? 600 : 400,
                                                color: activeWorkId === w.id ? 'var(--cat-work)' : 'var(--text-primary)', transition: 'all 0.15s',
                                            }}
                                            onClick={() => handleSwitchWork(w.id)}
                                        >
                                            {w.name}
                                        </button>
                                        {works.length > 1 && (
                                            <button
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10, padding: '2px 4px', lineHeight: 1, opacity: 0.6 }}
                                                onClick={() => handleDeleteWork(w.id)}
                                                title={t('common.delete') + ' ' + w.name}
                                            >✕</button>
                                        )}
                                    </div>
                                ))}
                                {showNewWorkInput ? (
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <input
                                            style={{ padding: '4px 8px', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', width: 120 }}
                                            value={newWorkName}
                                            onChange={e => setNewWorkName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleCreateWork(); if (e.key === 'Escape') setShowNewWorkInput(false); }}
                                            placeholder={t('settings.workNamePlaceholder')}
                                            autoFocus
                                        />
                                        <button className="btn btn-primary btn-sm" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleCreateWork}>{t('settings.confirmBtn')}</button>
                                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setShowNewWorkInput(false)}>{t('common.cancel')}</button>
                                    </div>
                                ) : (
                                    <button
                                        style={{ padding: '5px 10px', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', transition: 'all 0.15s' }}
                                        onClick={() => { setNewWorkName(''); setShowNewWorkInput(true); }}
                                    >{t('settings.newWork')}</button>
                                )}
                            </div>
                        </div>

                        {/* 统计栏 */}
                        <div className="settings-stats">
                            {stats.map(s => (
                                <div
                                    key={s.category}
                                    className="stat-badge"
                                    style={{ background: s.bg, color: s.color, borderColor: s.color + '33', cursor: 'pointer' }}
                                    title={t('settings.statsTitle') + ': ' + s.label}
                                    onClick={() => setExpandedCategory(s.category)}
                                >
                                    <span>{s.icon}</span>
                                    <span className="stat-count">{s.count}</span>
                                    <span>{s.label}</span>
                                </div>
                            ))}
                        </div>

                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            {/* 左侧：搜索 + 树形导航 */}
                            <div style={{
                                width: 260, minWidth: 260, borderRight: '1px solid var(--border-light)',
                                display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)',
                            }}>
                                {/* 搜索框 */}
                                <div className="settings-search">
                                    <input
                                        className="settings-search-input"
                                        type="text"
                                        placeholder={t('settings.searchPlaceholder')}
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                {/* 树 */}
                                <div style={{ flex: 1, overflow: 'auto' }}>
                                    <SettingsTree
                                        nodes={visibleNodes}
                                        selectedId={selectedNodeId}
                                        onSelect={setSelectedNodeId}
                                        onAdd={handleAddNode}
                                        onDelete={handleDeleteNode}
                                        onRename={handleRenameNode}
                                        onToggleEnabled={handleToggleEnabled}
                                        searchQuery={searchQuery}
                                        expandedCategory={expandedCategory}
                                        onExpandComplete={() => setExpandedCategory(null)}
                                    />
                                </div>
                            </div>

                            {/* 右侧：编辑器 */}
                            <div style={{ flex: 1, overflow: 'auto' }}>
                                {showBookInfo ? (
                                    <div style={{ padding: '20px 24px' }}>
                                        <BookInfoForm data={settings.bookInfo} onChange={data => handleSettingsSave('bookInfo', data)} />
                                    </div>
                                ) : (
                                    <SettingsItemEditor
                                        selectedNode={selectedNode}
                                        allNodes={visibleNodes}
                                        onUpdate={handleUpdateNode}
                                        onSelect={setSelectedNodeId}
                                        onAdd={handleAddNode}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ==================== API 配置 ====================

const PROVIDERS = [
    { key: 'zhipu', label: '智谱AI (GLM)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-flash', 'glm-4-plus', 'glm-4-long', 'glm-4'] },
    { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { key: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
    { key: 'gemini', label: 'Gemini (OpenAI兼容)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'] },
    { key: 'gemini-native', label: 'Gemini（原生格式）', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'] },
    { key: 'siliconflow', label: 'SiliconFlow (硅基流动)', baseUrl: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'THUDM/glm-4-9b-chat'] },
    { key: 'moonshot', label: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
    { key: 'custom', label: '自定义 (OpenAI兼容)', baseUrl: '', models: [] },
];

function PreferencesForm() {
    const { language, setLanguage, visualTheme, setVisualTheme } = useAppStore();
    const { t } = useI18n();

    return (
        <div style={{ maxWidth: 640 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                {t('preferences.intro')}
            </p>

            <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('preferences.langLabel')}</label>
                <div style={{ display: 'flex', gap: 12 }}>
                    {['zh', 'en', 'ru'].map(lang => (
                        <button
                            key={lang}
                            style={{
                                flex: 1, padding: '12px 16px', border: language === lang ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                borderRadius: 'var(--radius-md)', background: language === lang ? 'var(--accent-light)' : 'var(--bg-primary)',
                                cursor: 'pointer', fontSize: 14, fontWeight: language === lang ? 600 : 400,
                                color: language === lang ? 'var(--accent)' : 'var(--text-primary)', transition: 'all 0.15s',
                                boxShadow: language === lang ? '0 2px 8px var(--accent-glow)' : 'var(--shadow-sm)'
                            }}
                            onClick={() => setLanguage(lang)}
                        >
                            {lang === 'zh' ? '🇨🇳 简体中文' : lang === 'en' ? '🇬🇧 English' : '🇷🇺 Русский'}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('preferences.themeLabel')}</label>
                <div style={{ display: 'flex', gap: 16 }}>
                    {[{ id: 'warm', label: t('preferences.themeWarm'), desc: t('preferences.themeWarmDesc') }, { id: 'modern', label: t('preferences.themeModern'), desc: t('preferences.themeModernDesc') }].map(theme => (
                        <button
                            key={theme.id}
                            style={{
                                flex: 1, padding: '20px 16px', border: visualTheme === theme.id ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                borderRadius: 'var(--radius-lg)', background: visualTheme === theme.id ? 'var(--accent-light)' : 'var(--bg-primary)',
                                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                                boxShadow: visualTheme === theme.id ? '0 6px 16px var(--accent-glow)' : 'var(--shadow-sm)'
                            }}
                            onMouseEnter={e => { if (visualTheme !== theme.id) e.currentTarget.style.transform = 'translateY(-2px)' }}
                            onMouseLeave={e => { if (visualTheme !== theme.id) e.currentTarget.style.transform = 'none' }}
                            onClick={() => {
                                setVisualTheme(theme.id);
                                document.documentElement.setAttribute('data-visual', theme.id);
                            }}
                        >
                            <div style={{ fontSize: 15, fontWeight: 600, color: visualTheme === theme.id ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 6 }}>
                                {theme.label}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{theme.desc}</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ApiConfigForm({ data, onChange }) {
    const update = (field, value) => onChange({ ...data, [field]: value });
    const [testStatus, setTestStatus] = useState(null);
    const [fetchedModels, setFetchedModels] = useState(null);
    const [fetchedEmbedModels, setFetchedEmbedModels] = useState(null);
    const [savedProfiles, setSavedProfiles] = useState([]);
    const [profileName, setProfileName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const { t } = useI18n();

    useEffect(() => {
        try {
            const saved = localStorage.getItem('author-api-profiles');
            if (saved) setSavedProfiles(JSON.parse(saved));
        } catch { /* ignore */ }
    }, []);

    const persistProfiles = (profiles) => {
        setSavedProfiles(profiles);
        localStorage.setItem('author-api-profiles', JSON.stringify(profiles));
    };

    const handleSaveProfile = () => {
        const name = profileName.trim();
        if (!name) return;
        const profile = { id: Date.now().toString(36), name, config: { ...data }, createdAt: new Date().toLocaleString('zh-CN') };
        const updated = savedProfiles.filter(p => p.name !== name);
        updated.unshift(profile);
        persistProfiles(updated);
        setProfileName('');
        setShowSaveInput(false);
    };

    const handleLoadProfile = (profile) => { onChange({ ...profile.config }); setTestStatus(null); setFetchedModels(null); };
    const handleDeleteProfile = (id) => { persistProfiles(savedProfiles.filter(p => p.id !== id)); };

    const handleProviderChange = (providerKey) => {
        const provider = PROVIDERS.find(p => p.key === providerKey);
        if (provider) {
            onChange({ ...data, provider: providerKey, baseUrl: providerKey === 'custom' ? '' : (provider.baseUrl || data.baseUrl), model: providerKey === 'custom' ? '' : (provider.models[0] || data.model) });
        }
        setTestStatus(null);
        setFetchedModels(null);
        setFetchedEmbedModels(null);
    };

    const handleTestConnection = async () => {
        setTestStatus('loading');
        try {
            const res = await fetch('/api/ai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiConfig: data }) });
            setTestStatus(await res.json());
        } catch { setTestStatus({ success: false, error: t('apiConfig.networkError') }); }
    };

    const handleFetchModels = async () => {
        setFetchedModels('loading');
        try {
            const res = await fetch('/api/ai/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: data.apiKey, baseUrl: data.baseUrl, provider: data.provider }) });
            const result = await res.json();
            if (result.error) { setFetchedModels(null); setTestStatus({ success: false, error: result.error }); }
            else { setFetchedModels(result.models || []); }
        } catch { setFetchedModels(null); setTestStatus({ success: false, error: t('apiConfig.fetchModelsFailed') }); }
    };

    const handleFetchEmbedModels = async () => {
        setFetchedEmbedModels('loading');
        try {
            const embedKey = data.embedApiKey || data.apiKey;
            const embedBase = data.embedBaseUrl || data.baseUrl;
            const res = await fetch('/api/ai/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: embedKey, baseUrl: embedBase, provider: data.embedProvider }) });
            const result = await res.json();
            if (result.error) { setFetchedEmbedModels(null); setTestStatus({ success: false, error: t('apiConfig.embedApiPrefix') + result.error }); }
            else { setFetchedEmbedModels(result.models || []); }
        } catch { setFetchedEmbedModels(null); setTestStatus({ success: false, error: t('apiConfig.fetchEmbedModelsFailed') }); }
    };

    const currentProvider = PROVIDERS.find(p => p.key === data.provider) || PROVIDERS[7];
    const isCustom = data.provider === 'custom';

    return (
        <div>
            {savedProfiles.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('apiConfig.savedProfiles')}</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {savedProfiles.map(p => (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', fontSize: 12 }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 500, fontSize: 12, padding: 0 }} onClick={() => handleLoadProfile(p)} title={`${p.config.provider} | ${p.config.model}`}>{p.name}</button>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '0 2px', lineHeight: 1 }} onClick={() => handleDeleteProfile(p.id)} title={t('apiConfig.deleteProfile')}>✕</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{t('apiConfig.intro')}</p>

            {/* 供应商选择 */}
            <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('apiConfig.provider')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {PROVIDERS.map(p => (
                        <button key={p.key} style={{ padding: '8px 12px', border: data.provider === p.key ? '2px solid var(--accent)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', background: data.provider === p.key ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 12, fontWeight: data.provider === p.key ? 600 : 400, color: data.provider === p.key ? 'var(--accent)' : 'var(--text-primary)', transition: 'all 0.15s' }} onClick={() => handleProviderChange(p.key)}>{p.label}</button>
                    ))}
                </div>
                {data.provider === 'gemini-native' && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--accent-light)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--accent)', lineHeight: 1.6 }}>
                        {t('apiConfig.geminiNativeHint')}
                    </div>
                )}
            </div>

            <FieldInput label="API Key" value={data.apiKey} onChange={v => update('apiKey', v)} placeholder={t('apiConfig.apiKeyPlaceholder')} />
            {data.apiKey && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: -10, marginBottom: 10 }}>{t('apiConfig.apiKeyConfigured')}</div>}

            <FieldInput label={isCustom ? t('apiConfig.apiAddress') : t('apiConfig.apiAddressAuto')} value={data.baseUrl} onChange={v => update('baseUrl', v)} placeholder={t('apiConfig.apiAddressPlaceholder')} />

            {/* 模型选择 */}
            {currentProvider.models.length > 0 && !isCustom ? (
                <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
                        {t('apiConfig.model')}
                        {data.apiKey && (
                            <button style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={handleFetchModels} disabled={fetchedModels === 'loading'}>
                                {fetchedModels === 'loading' ? t('apiConfig.fetching') : t('apiConfig.fetchModels')}
                            </button>
                        )}
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(Array.isArray(fetchedModels) ? fetchedModels.map(m => m.id) : currentProvider.models).map(m => (
                            <button key={m} style={{ padding: '5px 12px', border: data.model === m ? '2px solid var(--accent)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: data.model === m ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 12, color: data.model === m ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'monospace' }} onClick={() => update('model', m)}>{m}</button>
                        ))}
                    </div>
                    {Array.isArray(fetchedModels) && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t('apiConfig.fetchedCount').replace('{count}', fetchedModels.length)}</div>}
                </div>
            ) : (
                <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
                        {t('apiConfig.modelName')}
                        {data.apiKey && data.baseUrl && (
                            <button style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={handleFetchModels} disabled={fetchedModels === 'loading'}>
                                {fetchedModels === 'loading' ? t('apiConfig.fetching') : t('apiConfig.fetchModels')}
                            </button>
                        )}
                    </label>
                    <input className="modal-input" style={{ marginBottom: 0 }} value={data.model || ''} onChange={e => update('model', e.target.value)} placeholder="例如：gpt-4o-mini" />
                    {Array.isArray(fetchedModels) && fetchedModels.length > 0 && (
                        <>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 4px' }}>{t('apiConfig.fetchedCountClick').replace('{count}', fetchedModels.length)}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {fetchedModels.map(m => (
                                    <button key={m.id} style={{ padding: '4px 10px', border: data.model === m.id ? '2px solid var(--accent)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: data.model === m.id ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 11, color: data.model === m.id ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'monospace' }} onClick={() => update('model', m.id)}>{m.id}</button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* 独立 Embedding 配置 */}
            <div style={{ marginTop: 24, marginBottom: 14, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    <input
                        type="checkbox"
                        checked={data.useCustomEmbed || false}
                        onChange={e => update('useCustomEmbed', e.target.checked)}
                        style={{ margin: 0 }}
                    />
                    {t('apiConfig.embedTitle')}
                </label>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 22 }}>
                    {t('apiConfig.embedDesc')}
                </div>
            </div>

            {data.useCustomEmbed && (
                <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('apiConfig.embedProvider')}</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                            {PROVIDERS.filter(p => !['deepseek', 'moonshot', 'siliconflow', 'openai'].includes(p.key)).map(p => (
                                <button key={p.key} style={{ padding: '8px 12px', border: data.embedProvider === p.key ? '2px solid var(--accent)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', background: data.embedProvider === p.key ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 12, fontWeight: data.embedProvider === p.key ? 600 : 400, color: data.embedProvider === p.key ? 'var(--accent)' : 'var(--text-primary)', transition: 'all 0.15s' }} onClick={() => onChange({ ...data, embedProvider: p.key, embedBaseUrl: p.key === 'custom' ? '' : (p.baseUrl || data.embedBaseUrl), embedModel: p.key === 'custom' ? '' : (p.key === 'zhipu' ? 'embedding-3' : 'text-embedding-v3-small') })}>{p.label}</button>
                            ))}
                        </div>
                    </div>
                    <FieldInput label="Embedding API Key" value={data.embedApiKey} onChange={v => update('embedApiKey', v)} placeholder={t('apiConfig.embedApiKeyPlaceholder')} />
                    <FieldInput label={data.embedProvider === 'custom' ? t('apiConfig.embedApiAddress') : t('apiConfig.embedApiAddressAuto')} value={data.embedBaseUrl} onChange={v => update('embedBaseUrl', v)} placeholder="https://api.example.com/v1" />
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
                            {t('apiConfig.embedModel')}
                            {data.embedApiKey || data.apiKey ? (
                                <button style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={handleFetchEmbedModels} disabled={fetchedEmbedModels === 'loading'}>
                                    {fetchedEmbedModels === 'loading' ? t('apiConfig.fetching') : t('apiConfig.fetchEmbedModels')}
                                </button>
                            ) : null}
                        </label>
                        <input className="modal-input" style={{ marginBottom: 0 }} value={data.embedModel || ''} onChange={e => update('embedModel', e.target.value)} placeholder="例如：text-embedding-v3-small" />
                        {Array.isArray(fetchedEmbedModels) && fetchedEmbedModels.length > 0 && (
                            <>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 4px' }}>{t('apiConfig.fetchedCountClick').replace('{count}', fetchedEmbedModels.length)}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto', padding: '4px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
                                    {fetchedEmbedModels.map(m => (
                                        <button key={m.id} style={{ padding: '4px 10px', border: data.embedModel === m.id ? '2px solid var(--accent)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: data.embedModel === m.id ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 11, color: data.embedModel === m.id ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'monospace', flexShrink: 0 }} onClick={() => update('embedModel', m.id)}>{m.id}</button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* 测试连接 */}
            {data.apiKey && (
                <div style={{ marginBottom: 14 }}>
                    <button style={{ padding: '8px 16px', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', cursor: testStatus === 'loading' ? 'wait' : 'pointer', fontSize: 13, color: 'var(--accent)', fontWeight: 500, transition: 'all 0.15s', opacity: testStatus === 'loading' ? 0.7 : 1 }} onClick={handleTestConnection} disabled={testStatus === 'loading'}>
                        {testStatus === 'loading' ? t('apiConfig.testLoading') : t('apiConfig.testBtn')}
                    </button>
                    {testStatus && testStatus !== 'loading' && (
                        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, lineHeight: 1.6, background: testStatus.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: testStatus.success ? 'var(--success)' : 'var(--error)', border: `1px solid ${testStatus.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                            {testStatus.success ? <>{testStatus.message}<br />{testStatus.reply && <span>{t('apiConfig.testReply')}{testStatus.reply}</span>}</> : <>❌ {testStatus.error}</>}
                        </div>
                    )}
                </div>
            )}

            {/* 保存配置 */}
            {data.apiKey && (
                <div style={{ marginBottom: 14 }}>
                    {!showSaveInput ? (
                        <button style={{ padding: '8px 16px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }} onClick={() => { const pl = PROVIDERS.find(p => p.key === data.provider)?.label || data.provider; setProfileName(`${pl} - ${data.model || t('common.confirm')}`); setShowSaveInput(true); }}>
                            {t('apiConfig.saveProfileBtn')}
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input className="modal-input" style={{ margin: 0, flex: 1, padding: '7px 10px', fontSize: 13 }} value={profileName} onChange={e => setProfileName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveProfile()} placeholder={t('apiConfig.saveProfilePlaceholder')} autoFocus />
                            <button className="btn btn-primary btn-sm" style={{ padding: '7px 14px', whiteSpace: 'nowrap' }} onClick={handleSaveProfile}>{t('apiConfig.saveBtn')}</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '7px 10px' }} onClick={() => setShowSaveInput(false)}>{t('common.cancel')}</button>
                        </div>
                    )}
                </div>
            )}

            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                <strong>{t('apiConfig.howToGetKey')}</strong><br />
                • {t('apiConfig.keyGuide').split('\n').map((line, i) => <span key={i}>{line.replace(/^• /, '')}<br /></span>)}
            </div>
        </div>
    );
}

// ==================== 表单组件 ====================

function FieldInput({ label, value, onChange, placeholder, multiline, rows }) {
    const Component = multiline ? 'textarea' : 'input';
    return (
        <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</label>
            <Component className="modal-input" style={{ marginBottom: 0, ...(multiline ? { resize: 'vertical', minHeight: `${(rows || 3) * 22}px` } : {}) }} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows || 3} />
        </div>
    );
}

function BookInfoForm({ data, onChange }) {
    const update = (field, value) => onChange({ ...data, [field]: value });
    const { t } = useI18n();
    return (
        <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{t('bookInfo.intro')}</p>
            <FieldInput label={t('bookInfo.title')} value={data.title} onChange={v => update('title', v)} placeholder={t('bookInfo.titlePlaceholder')} />
            <FieldInput label={t('bookInfo.genre')} value={data.genre} onChange={v => update('genre', v)} placeholder={t('bookInfo.genrePlaceholder')} />
            <FieldInput label={t('bookInfo.synopsis')} value={data.synopsis} onChange={v => update('synopsis', v)} placeholder={t('bookInfo.synopsisPlaceholder')} multiline rows={3} />
            <FieldInput label={t('bookInfo.style')} value={data.style} onChange={v => update('style', v)} placeholder={t('bookInfo.stylePlaceholder')} />
            <FieldInput label={t('bookInfo.tone')} value={data.tone} onChange={v => update('tone', v)} placeholder={t('bookInfo.tonePlaceholder')} />
            <FieldInput label={t('bookInfo.pov')} value={data.pov} onChange={v => update('pov', v)} placeholder={t('bookInfo.povPlaceholder')} />
            <FieldInput label={t('bookInfo.targetAudience')} value={data.targetAudience} onChange={v => update('targetAudience', v)} placeholder={t('bookInfo.targetAudiencePlaceholder')} />
        </div>
    );
}
