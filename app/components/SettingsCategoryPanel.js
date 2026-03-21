'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getSettingsNodes, getActiveWorkId, addSettingsNode } from '../lib/settings';
import { useI18n } from '../lib/useI18n';
import {
    User, MapPin, Globe, Gem, ClipboardList, Ruler, BookOpen,
    Plus, ChevronRight, ChevronDown, FileText, FolderOpen, Eye, EyeOff, Search, X,
    Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers,
    Bookmark, Crown, Flame, Lightbulb, Music, Palette, Sword, Target,
    Moon, Sun, Cloud, TreePine, Mountain, Waves, Building, Car,
} from 'lucide-react';
import Tooltip from './ui/Tooltip';

// 分类图标 & 颜色（与 SettingsPanel 保持一致）
const CAT_ICONS = {
    bookInfo: BookOpen, character: User, location: MapPin, world: Globe,
    object: Gem, plot: ClipboardList, rules: Ruler,
};
const CAT_COLORS = {
    bookInfo: { color: 'var(--cat-bookinfo)', bg: 'var(--cat-bookinfo-bg)' },
    character: { color: 'var(--cat-character)', bg: 'var(--cat-character-bg)' },
    location: { color: 'var(--cat-location)', bg: 'var(--cat-location-bg)' },
    world: { color: 'var(--cat-world)', bg: 'var(--cat-world-bg)' },
    object: { color: 'var(--cat-object)', bg: 'var(--cat-object-bg)' },
    plot: { color: 'var(--cat-plot)', bg: 'var(--cat-plot-bg)' },
    rules: { color: 'var(--cat-rules)', bg: 'var(--cat-rules-bg)' },
};

// 图标名称 → 组件映射（与 SettingsPanel/CategorySettingsModal 共用）
const ICON_MAP = {
    FolderOpen, User, MapPin, Globe, Gem, ClipboardList, Ruler,
    Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers,
    Bookmark, Crown, Flame, Lightbulb, Music, Palette, Sword, Target,
    Moon, Sun, Cloud, TreePine, Mountain, Waves, Building, Car,
    FileText, BookOpen,
};

/** 根据图标名称获取图标组件 */
export function getIconByName(name) {
    return ICON_MAP[name] || null;
}

/** 导出：获取分类图标组件（支持自定义图标名） */
const DEFAULT_FOLDER_ICONS = ['FolderOpen', 'Folder', 'FolderClosed', 'folder-open', 'folder', 'folder-closed'];
export function getCategoryIcon(category, customIconName) {
    if (customIconName && !DEFAULT_FOLDER_ICONS.includes(customIconName)) {
        const custom = ICON_MAP[customIconName];
        if (custom) return custom;
    }
    return CAT_ICONS[category] || FileText;
}

/** 导出：获取分类颜色方案 */
export function getCategoryColor(category) {
    return CAT_COLORS[category] || { color: 'var(--text-muted)', bg: 'var(--bg-hover)' };
}

/** 导出：获取分类标签名 */
export function getCategoryLabel(category, t) {
    const i18nKey = `settings.categories.${category}`;
    const translated = t?.(i18nKey);
    if (translated && translated !== i18nKey) return translated;
    const labels = {
        bookInfo: '作品信息', character: '人物设定', location: '空间/地点',
        world: '世界观', object: '物品/道具', plot: '大纲', rules: '写作规则',
    };
    if (labels[category]) return labels[category];
    if (category?.startsWith('custom-')) return '自定义分类';
    return category;
}

/**
 * 设定分类内容面板 — 嵌入侧边栏 sidebar-content-pane
 * 显示指定分类下的子文件夹和条目
 */
export default function SettingsCategoryPanel({ category }) {
    const { t } = useI18n();
    const { setOpenCategoryModal, setJumpToNodeId, settingsVersion } = useAppStore();
    const [nodes, setNodes] = useState([]);
    const [rootFolder, setRootFolder] = useState(null);
    const [collapsed, setCollapsed] = useState({}); // folderId → bool
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const colors = getCategoryColor(category);
    const CatIcon = getCategoryIcon(category, rootFolder?.icon);
    const label = getCategoryLabel(category, t);

    // 加载分类节点
    const loadNodes = useCallback(async () => {
        const workId = getActiveWorkId();
        if (!workId) { setLoading(false); return; }
        const allNodes = await getSettingsNodes(workId);
        // 找到分类根文件夹
        const root = allNodes.find(n =>
            n.parentId === workId && n.category === category
        );
        setRootFolder(root || null);
        setNodes(allNodes);
        setLoading(false);
    }, [category]);

    useEffect(() => { loadNodes(); }, [loadNodes, settingsVersion]);

    // 获取某节点的直接子节点（排序）
    const getChildren = useCallback((parentId) => {
        return nodes
            .filter(n => n.parentId === parentId)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }, [nodes]);

    // 新建子文件夹
    const handleAddSubFolder = async () => {
        if (!rootFolder) return;
        await addSettingsNode({
            name: '新分类',
            type: 'folder',
            category,
            parentId: rootFolder.id,
        });
        await loadNodes();
    };

    // 新建条目
    const handleAddItem = async (parentId) => {
        await addSettingsNode({
            name: '新条目',
            type: 'item',
            category,
            parentId: parentId || rootFolder?.id,
        });
        await loadNodes();
    };

    // 点击条目 → 打开设定面板并跳转
    const handleOpenItem = (nodeId) => {
        setJumpToNodeId(nodeId);
        setOpenCategoryModal(category, nodeId);
    };

    // 切换文件夹折叠
    const toggleCollapse = (folderId) => {
        setCollapsed(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    // 渲染节点
    // 搜索过滤辅助
    const matchesSearch = useCallback((node) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        return node.name?.toLowerCase().includes(q) || node.id?.toLowerCase().includes(q);
    }, [searchQuery]);

    const hasDescendantMatch = useCallback((parentId) => {
        const children = nodes.filter(n => n.parentId === parentId);
        return children.some(c =>
            (c.type === 'item' && matchesSearch(c)) ||
            (c.type === 'folder' && (matchesSearch(c) || hasDescendantMatch(c.id)))
        );
    }, [nodes, matchesSearch]);

    const renderNode = (node, depth = 0) => {
        const isFolder = node.type === 'folder';
        const isItem = node.type === 'item';
        const isSpecial = node.type === 'special';

        // 搜索过滤
        if (searchQuery.trim()) {
            if (isItem && !matchesSearch(node)) return null;
            if (isFolder && !matchesSearch(node) && !hasDescendantMatch(node.id)) return null;
        }
        const isCollapsed = collapsed[node.id];
        const children = getChildren(node.id);
        const indent = depth * 16;

        if (isFolder) {
            return (
                <div key={node.id} className="scp-group">
                    <div
                        className="scp-folder"
                        style={{ paddingLeft: 10 + indent }}
                        onClick={() => toggleCollapse(node.id)}
                    >
                        <span className="scp-folder-chevron">
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </span>
                        <FolderOpen size={14} style={{ color: colors.color, flexShrink: 0 }} />
                        <span className="scp-folder-name">{node.name}</span>
                        <span className="scp-folder-count">{children.filter(c => c.type === 'item').length}</span>
                        <Tooltip content="新建条目">
                            <button
                                className="scp-add-btn"
                                onClick={(e) => { e.stopPropagation(); handleAddItem(node.id); }}
                            >
                                <Plus size={12} />
                            </button>
                        </Tooltip>
                    </div>
                    {!isCollapsed && children.length > 0 && (
                        <div className="scp-children">
                            {children.map(child => renderNode(child, depth + 1))}
                        </div>
                    )}
                </div>
            );
        }

        if (isItem || isSpecial) {
            return (
                <div
                    key={node.id}
                    className="scp-item"
                    style={{ paddingLeft: 10 + indent }}
                    onClick={() => handleOpenItem(node.id)}
                    title={node.name}
                >
                    <span className="scp-item-dot" style={{ background: colors.color }} />
                    <span className="scp-item-name">{node.name}</span>
                    {node.enabled === false && (
                        <EyeOff size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    )}
                </div>
            );
        }

        return null;
    };

    if (loading) {
        return (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                加载中...
            </div>
        );
    }

    const rootChildren = rootFolder ? getChildren(rootFolder.id) : [];

    return (
        <div className="scp-panel">
            {/* 标题栏 */}
            <div className="gdocs-section-header">
                <span className="gdocs-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CatIcon size={13} style={{ color: colors.color }} />
                    {label}
                </span>
                <div style={{ display: 'flex', gap: 2 }}>
                    <Tooltip content="新建子分类">
                        <button className="gdocs-section-add" onClick={handleAddSubFolder}>
                            <FolderOpen size={14} />
                        </button>
                    </Tooltip>
                    <Tooltip content="新建条目">
                        <button className="gdocs-section-add" onClick={() => handleAddItem()}>+</button>
                    </Tooltip>
                </div>
            </div>

            {/* 搜索框 */}
            {rootChildren.length > 0 && (
                <div style={{ padding: '6px 10px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 8,
                        transition: 'all 0.2s',
                    }}
                        onFocus={e => { e.currentTarget.style.borderColor = colors.color; }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; }}
                    >
                        <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder={`搜索${label}...`}
                            style={{
                                flex: 1, border: 'none', outline: 'none',
                                background: 'transparent', color: 'var(--text-primary)',
                                fontSize: 12, padding: 0,
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 1, display: 'flex', alignItems: 'center', borderRadius: 3 }}
                            ><X size={11} /></button>
                        )}
                    </div>
                </div>
            )}

            {/* 条目列表 */}
            <div className="scp-list">
                {rootChildren.length === 0 ? (
                    <div className="scp-empty">
                        <CatIcon size={24} style={{ color: colors.color, opacity: 0.3 }} />
                        <span>暂无内容</span>
                        <button className="scp-empty-add" onClick={() => handleAddItem()}>
                            <Plus size={12} /> 添加{label}
                        </button>
                    </div>
                ) : (
                    rootChildren.map(child => renderNode(child, 0))
                )}
            </div>
        </div>
    );
}
