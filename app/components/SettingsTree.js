'use client';

import { useState, useMemo, useEffect, useRef } from 'react';

import { useI18n } from '../lib/useI18n';

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

function getCategoryStyle(category) {
    return CATEGORY_STYLES[category] || CATEGORY_STYLES.custom;
}

// 单个树节点
function TreeNode({ node, nodes, selectedId, onSelect, onAdd, onDelete, onRename, onToggleEnabled, collapsedIds, onToggleCollapse, level = 0 }) {
    const { t } = useI18n();
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const children = nodes.filter(n => n.parentId === node.id);
    const isFolder = node.type === 'folder' || node.type === 'special' || node.type === 'work';
    const isWork = node.type === 'work';
    const isRoot = node.parentId === null;
    const isCollapsed = collapsedIds.has(node.id);
    const isSelected = selectedId === node.id;
    const isDisabled = node.enabled === false;
    const style = getCategoryStyle(node.category);

    const nodeRef = useRef(null);

    // 计算子项数目（递归）
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

    // 如果是被点击并展开的节点，自动滚入视图
    useEffect(() => {
        if (isSelected && isFolder && nodeRef.current) {
            // 给一点延迟让折叠动画/渲染完成
            setTimeout(() => {
                nodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
    }, [isSelected, isFolder]);

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

                {/* 图标 */}
                <span className="tree-node-icon">{node.icon || (isFolder ? '📁' : '📄')}</span>

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
                    <span className="tree-node-name">{node.name}</span>
                )}

                {/* 启用/禁用开关（仅item节点） */}
                {!isFolder && !isRoot && (
                    <button
                        className={`tree-toggle-btn ${isDisabled ? 'visible' : ''}`}
                        onClick={e => { e.stopPropagation(); onToggleEnabled(node.id); }}
                        title={isDisabled ? t('settingsTree.enableHint') : t('settingsTree.disableHint')}
                    >
                        {isDisabled ? '🚫' : '👁'}
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
                        <button className="tree-action-btn" onClick={e => { e.stopPropagation(); setRenameValue(node.name); setIsRenaming(true); }} title={t('common.rename')}>✏</button>
                    )}
                    {/* 删除 */}
                    {!isRoot && (
                        <button className="tree-action-btn danger" onClick={e => { e.stopPropagation(); onDelete(node.id); }} title={t('common.delete')}>✕</button>
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

    // 获取根节点
    const rootNodes = nodes.filter(n => n.parentId === null);

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
        </div>
    );
}
