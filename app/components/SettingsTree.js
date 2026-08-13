'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
    FolderOpen, FileText, Eye, EyeOff, Pencil, X,
    User, MapPin, Globe, Gem, ClipboardList, Ruler, BookOpen,
    Settings as SettingsIcon, Plus,
    Sparkles, Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers
} from 'lucide-react';
import { useI18n } from '../lib/useI18n';
import { getBuiltInFolderLabel, getBuiltInWorkName } from '../lib/settings';

// 分类的颜色和标识
const CATEGORY_STYLES = {
    work: { color: 'var(--cat-work)', bg: 'var(--cat-work-bg)' },
    bookInfo: { color: 'var(--cat-bookinfo)', bg: 'var(--cat-bookinfo-bg)' },
    character: { color: 'var(--cat-character)', bg: 'var(--cat-character-bg)' },
    location: { color: 'var(--cat-location)', bg: 'var(--cat-location-bg)' },
    world: { color: 'var(--cat-world)', bg: 'var(--cat-world-bg)' },
    object: { color: 'var(--cat-object)', bg: 'var(--cat-object-bg)' },
    plot: { color: 'var(--cat-plot)', bg: 'var(--cat-plot-bg)' },
    rules: { color: 'var(--cat-rules)', bg: 'var(--cat-rules-bg)' },
    custom: { color: 'var(--cat-custom)', bg: 'var(--cat-custom-bg)' },
};

// 分类对应的 Lucide 图标
const CATEGORY_ICONS = {
    work: BookOpen,
    bookInfo: BookOpen,
    character: User,
    location: MapPin,
    world: Globe,
    object: Gem,
    plot: ClipboardList,
    rules: Ruler,
    custom: SettingsIcon,
};

// 图标名称 → 组件映射（用于 node.icon 字段持久化）
const ICON_MAP = {
    'user': User,
    'map-pin': MapPin,
    'globe': Globe,
    'gem': Gem,
    'clipboard-list': ClipboardList,
    'ruler': Ruler,
    'book-open': BookOpen,
    'settings': SettingsIcon,
    'file-text': FileText,
    'folder-open': FolderOpen,
    'sparkles': Sparkles,
    'heart': Heart,
    'star': Star,
    'shield': Shield,
    'zap': Zap,
    'feather': Feather,
    'compass': Compass,
    'flag': Flag,
    'tag': Tag,
    'layers': Layers,
};

// 可选图标列表（用于图标选择器）
export const ICON_PICKER_OPTIONS = [
    { name: 'user', label: '人物' },
    { name: 'map-pin', label: '地点' },
    { name: 'globe', label: '世界' },
    { name: 'gem', label: '宝石' },
    { name: 'clipboard-list', label: '大纲' },
    { name: 'ruler', label: '规则' },
    { name: 'book-open', label: '书籍' },
    { name: 'settings', label: '设置' },
    { name: 'sparkles', label: '魔法' },
    { name: 'heart', label: '爱心' },
    { name: 'star', label: '星标' },
    { name: 'shield', label: '盾牌' },
    { name: 'zap', label: '闪电' },
    { name: 'feather', label: '羽毛' },
    { name: 'compass', label: '罗盘' },
    { name: 'flag', label: '旗帜' },
    { name: 'tag', label: '标签' },
    { name: 'layers', label: '图层' },
];

// 获取节点应该显示的图标组件
function getNodeIcon(node, nodes) {
    // 优先使用节点自身的 icon 字段
    if (node.icon && ICON_MAP[node.icon]) return ICON_MAP[node.icon];
    // 如果是 item（条目），查找父级文件夹的 icon
    if (node.type === 'item' && node.parentId) {
        const parent = nodes.find(n => n.id === node.parentId);
        if (parent?.icon && ICON_MAP[parent.icon]) return ICON_MAP[parent.icon];
    }
    // 使用分类默认图标
    return CATEGORY_ICONS[node.category] || FileText;
}

function getCategoryStyle(category) {
    return CATEGORY_STYLES[category] || CATEGORY_STYLES.custom;
}

// 单个树节点
function TreeNode({ node, nodes, selectedId, onSelect, onAdd, onDelete, onRename, onToggleEnabled, collapsedIds, onToggleCollapse, level = 0 }) {
    const { t, text } = useI18n();
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const children = nodes.filter(n => n.parentId === node.id && !(n.category === 'bookInfo' && n.type === 'special'));
    const isFolder = node.type === 'folder' || node.type === 'special' || node.type === 'work';
    const isWork = node.type === 'work';
    const isRoot = node.parentId === null;
    const builtinSuffixes = ['bookinfo', 'characters', 'locations', 'world', 'objects', 'plot', 'rules'];
    const parentNode = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
    const isBuiltinCategory = parentNode && parentNode.type === 'work' && builtinSuffixes.some(s => node.id.endsWith('-' + s));
    const canDelete = !isRoot && !isBuiltinCategory;
    const isCollapsed = collapsedIds.has(node.id);
    const isSelected = selectedId === node.id;
    const isDisabled = node.enabled === false;
    const style = getCategoryStyle(node.category);

    const nodeRef = useRef(null);

    const descendantCount = useMemo(() => {
        if (!isFolder) return 0;
        let count = 0;
        const countChildren = (parentId) => {
            nodes.filter(n => n.parentId === parentId).forEach(child => {
                if (child.type === 'item') count++;
                else countChildren(child.id);
            });
        };
        countChildren(node.id);
        return count;
    }, [node.id, nodes, isFolder]);

    const handleRename = () => {
        if (renameValue.trim()) {
            onRename(node.id, renameValue.trim());
        }
        setIsRenaming(false);
    };

    useEffect(() => {
        if (isSelected && isFolder && nodeRef.current) {
            setTimeout(() => {
                nodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
    }, [isSelected, isFolder]);

    const NodeIcon = getNodeIcon(node, nodes);

    return (
        <div className="tree-node" style={{ paddingLeft: level > 0 ? 12 : 0 }} ref={nodeRef}>
            <div
                className={`tree-node-row ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => onSelect(node.id)}
                style={isRoot ? { borderLeft: `3px solid ${style.color}`, marginBottom: 2 } : {}}
                title={isDisabled ? t('settingsTree.disabledHint') : ''}
            >
                {/* 折叠箭头 */}
                {isFolder && (
                    <span
                        className="tree-node-icon"
                        onClick={e => { e.stopPropagation(); onToggleCollapse(node.id); }}
                        style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10 }}
                    >
                        {isCollapsed ? '▶' : '▼'}
                    </span>
                )}

                {/* 图标 — 使用分类图标，支持自定义覆盖 */}
                <span className="tree-node-icon" style={isFolder ? { color: style.color } : {}}>
                    <NodeIcon size={14} />
                </span>

                {/* 名称 */}
                {isRenaming ? (
                    <input
                        className="tree-node-name"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setIsRenaming(false); }}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                        style={{ border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 4px', fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                ) : (
                    <span className="tree-node-name">
                        {isWork
                            ? getBuiltInWorkName(node.name, text)
                            : (node.type === 'folder' || node.type === 'special')
                                ? getBuiltInFolderLabel(node.name, text)
                                : node.name}
                    </span>
                )}

                {/* 启用/禁用开关（仅item节点） */}
                {!isFolder && !isRoot && (
                    <button
                        className={`tree-toggle-btn ${isDisabled ? 'visible' : ''}`}
                        onClick={e => { e.stopPropagation(); onToggleEnabled(node.id); }}
                        title={isDisabled ? t('settingsTree.enableHint') : t('settingsTree.disableHint')}
                    >
                        {isDisabled ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                )}

                {/* 子项计数徽标（folder节点） */}
                {isFolder && descendantCount > 0 && (
                    <span
                        className="tree-node-badge"
                        style={{ background: style.bg, color: style.color }}
                    >
                        {descendantCount}
                    </span>
                )}

                {/* 操作按钮 */}
                <span className="tree-node-actions">
                    {/* 添子项 */}
                    {isFolder && (
                        <button className="tree-action-btn" onClick={e => { e.stopPropagation(); onAdd(node.id, node.category); }} title={t('settingsTree.add')}>＋</button>
                    )}
                    {/* 重命名 */}
                    {!isRoot && (
                        <button className="tree-action-btn" onClick={e => { e.stopPropagation(); setRenameValue(node.name); setIsRenaming(true); }} title={t('common.rename')}><Pencil size={12} /></button>
                    )}
                    {/* 删除 */}
                    {canDelete && (
                        <button className="tree-action-btn danger" onClick={e => { e.stopPropagation(); onDelete(node.id); }} title={t('common.delete')}><X size={12} /></button>
                    )}
                </span>
            </div>

            {/* 子节点 */}
            {isFolder && !isCollapsed && (
                <div className="tree-node-children">
                    {children
                        .sort((a, b) => (a.type === 'folder' ? -1 : 1) - (b.type === 'folder' ? -1 : 1) || (a.sortOrder || 0) - (b.sortOrder || 0))
                        .map(child => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                nodes={nodes}
                                selectedId={selectedId}
                                onSelect={onSelect}
                                onAdd={onAdd}
                                onDelete={onDelete}
                                onRename={onRename}
                                onToggleEnabled={onToggleEnabled}
                                collapsedIds={collapsedIds}
                                onToggleCollapse={onToggleCollapse}
                                level={level + 1}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}

// 设定树组件
export default function SettingsTree({
    nodes,
    selectedId,
    onSelect,
    onAdd,
    onDelete,
    onRename,
    onToggleEnabled,
    searchQuery = '',
    expandedCategory = null,
    onExpandComplete,
}) {
    const [collapsedIds, setCollapsedIds] = useState(new Set());

    const toggleCollapse = (id) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // 监听外部控制展开特定分类文件夹
    useEffect(() => {
        if (expandedCategory) {
            const targetFolder = nodes.find(n => n.type === 'folder' && n.category === expandedCategory && n.parentId !== null);
            if (targetFolder) {
                // 确保父节点和该节点自己都没被折叠
                setCollapsedIds(prev => {
                    const next = new Set(prev);
                    next.delete(targetFolder.id);
                    if (targetFolder.parentId) {
                        next.delete(targetFolder.parentId);
                    }
                    return next;
                });
                onSelect(targetFolder.id);
                if (onExpandComplete) {
                    onExpandComplete();
                }
            }
        }
    }, [expandedCategory, nodes, onSelect, onExpandComplete]);

    // 获取根节点: 如果 parentId 为 null，或者其父节点不在当前渲染的节点列表中，就认为是根节点
    const nodeIds = new Set(nodes.map(n => n.id));
    const rootNodes = nodes.filter(n => n.parentId === null || !nodeIds.has(n.parentId));

    // 搜索过滤
    const filteredNodes = useMemo(() => {
        if (!searchQuery.trim()) return nodes;
        const q = searchQuery.toLowerCase();
        // 找到匹配的节点和它们到根的路径
        const matchIds = new Set();
        nodes.forEach(n => {
            if (n.name.toLowerCase().includes(q) ||
                (n.content?.description || '').toLowerCase().includes(q) ||
                (n.content?.personality || '').toLowerCase().includes(q) ||
                (n.content?.background || '').toLowerCase().includes(q)) {
                // 添加自己和所有祖先
                let current = n;
                while (current) {
                    matchIds.add(current.id);
                    current = current.parentId ? nodes.find(p => p.id === current.parentId) : null;
                }
            }
        });
        return nodes.filter(n => matchIds.has(n.id));
    }, [nodes, searchQuery]);

    const filteredRootNodes = rootNodes.filter(n => filteredNodes.some(fn => fn.id === n.id));

    return (
        <div className="settings-tree">
            {filteredRootNodes.map(root => (
                <TreeNode
                    key={root.id}
                    node={root}
                    nodes={filteredNodes}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onAdd={onAdd}
                    onDelete={onDelete}
                    onRename={onRename}
                    onToggleEnabled={onToggleEnabled}
                    collapsedIds={collapsedIds}
                    onToggleCollapse={toggleCollapse}
                    level={0}
                />
            ))}
            {/* 新建分类按钮 */}
            {onAdd && (
                <button
                    className="tree-add-category-btn"
                    onClick={() => {
                        // getSettingsNodes 不含 work 节点，从根文件夹的 parentId 获取 work ID
                        const rootFolder = nodes.find(n => n.type === 'folder' && n.parentId);
                        const workId = rootFolder?.parentId;
                        if (workId) onAdd(workId, 'custom');
                    }}
                >
                    <Plus size={13} />
                    新建分类
                </button>
            )}
        </div>
    );
}
