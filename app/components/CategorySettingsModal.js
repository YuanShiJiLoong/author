'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Maximize2, Minimize2, Plus, Search, FolderOpen, ChevronRight, ChevronDown,
    Trash2, EyeOff, Eye, FileText, FolderPlus, BookOpen, Upload, Download,
    User, MapPin, Globe, Gem, ClipboardList, Ruler, Settings as SettingsIcon,
    Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers,
    Bookmark, Crown, Flame, Lightbulb, Music, Palette, Sword, Target,
    Moon, Sun, Cloud, TreePine, Mountain, Waves, Building, Car,
    Pencil, GripVertical,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
    getSettingsNodes, addSettingsNode, updateSettingsNode, deleteSettingsNode,
    getActiveWorkId, setActiveWorkId, getAllWorks, addWork, saveSettingsNodes,
} from '../lib/settings';
import { useI18n } from '../lib/useI18n';
import SettingsItemEditor from './SettingsItemEditor';
import { downloadFile, downloadBlob } from '../lib/project-io';
import {
    detectCategory, parseTextToFields, mapFieldsToContent,
    parseMultipleEntries, isStructuredText, parseStructuredText,
    preprocessPdfText,
    exportNodesToTxt, exportNodesToMarkdown,
    exportNodesToDocx, exportSettingsAsPdf, parseDocxToText, parsePdfToText,
} from '../lib/settings-io';

// ==================== 图标库 ====================
const ICON_MAP = {
    FolderOpen, User, MapPin, Globe, Gem, ClipboardList, Ruler,
    Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers,
    Bookmark, Crown, Flame, Lightbulb, Music, Palette, Sword, Target,
    Moon, Sun, Cloud, TreePine, Mountain, Waves, Building, Car,
    FileText, BookOpen, Settings: SettingsIcon,
};

const ICON_GRID = [
    'FolderOpen', 'User', 'Heart', 'Star', 'Shield', 'Zap',
    'Crown', 'Sword', 'Flag', 'Target', 'Compass', 'Feather',
    'Flame', 'Lightbulb', 'Moon', 'Sun', 'Cloud', 'TreePine',
    'Mountain', 'Waves', 'Building', 'Music', 'Palette', 'Bookmark',
    'MapPin', 'Globe', 'Gem', 'Tag', 'Layers', 'Car',
    'ClipboardList', 'Ruler', 'FileText', 'BookOpen',
];

function getIconComponent(iconName) {
    return ICON_MAP[iconName] || null;
}

// ==================== 分类配置 ====================
const CAT_META = {
    bookInfo: { icon: BookOpen, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', label: '作品信息' },
    character: { icon: User, color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: '人物设定' },
    location: { icon: MapPin, color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: '空间/地点' },
    world: { icon: Globe, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', label: '世界观' },
    object: { icon: Gem, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: '物品/道具' },
    plot: { icon: ClipboardList, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: '大纲' },
    rules: { icon: Ruler, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', label: '写作规则' },
    custom: { icon: SettingsIcon, color: '#64748b', bg: 'rgba(100,116,139,0.12)', label: '自定义' },
};

function getCatMeta(category) {
    return CAT_META[category] || CAT_META.custom;
}

// ==================== 剧情曲线图 ====================
const DEFAULT_PLOT_POINTS = [
    { label: '序幕', tension: 0.2 },
    { label: '铺垫', tension: 0.35 },
    { label: '冲突', tension: 0.6 },
    { label: '高潮', tension: 0.95 },
    { label: '结局', tension: 0.4 },
];

function PlotCurveChart({ nodes, rootFolder, onSave }) {
    const initData = rootFolder?.content?.plotCurve || DEFAULT_PLOT_POINTS;
    const [points, setPoints] = useState(initData);
    const [dragging, setDragging] = useState(null); // index
    const [editIdx, setEditIdx] = useState(null);
    const [editLabel, setEditLabel] = useState('');
    const [collapsed, setCollapsed] = useState(false);
    const svgRef = useRef(null);
    const W = 600, H = 200, PX = 50, PY = 28;
    const chartW = W - PX * 2, chartH = H - PY * 2;

    useEffect(() => {
        const d = rootFolder?.content?.plotCurve;
        if (d && Array.isArray(d)) setPoints(d);
    }, [rootFolder?.content?.plotCurve]);

    const coords = useMemo(() => points.map((p, i) => ({
        x: PX + (i / Math.max(points.length - 1, 1)) * chartW,
        y: PY + (1 - p.tension) * chartH,
    })), [points, chartW, chartH]);

    const smoothPath = useMemo(() => coords.reduce((acc, p, i, arr) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = arr[i - 1];
        const cpx = (prev.x + p.x) / 2;
        return `${acc} C ${cpx} ${prev.y}, ${cpx} ${p.y}, ${p.x} ${p.y}`;
    }, ''), [coords]);

    const areaPath = useMemo(() => {
        if (coords.length < 2) return '';
        return `${smoothPath} L ${coords[coords.length - 1].x} ${H - PY} L ${coords[0].x} ${H - PY} Z`;
    }, [smoothPath, coords]);

    const handlePointerDown = (idx, e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(idx);
        const svg = svgRef.current;
        const onMove = (ev) => {
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            const svgY = (ev.clientY - rect.top) / rect.height * H;
            const tension = Math.max(0, Math.min(1, 1 - (svgY - PY) / chartH));
            setPoints(prev => prev.map((p, i) => i === idx ? { ...p, tension: Math.round(tension * 100) / 100 } : p));
        };
        const onUp = () => {
            setDragging(null);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            // save
            setPoints(prev => { onSave?.(prev); return prev; });
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    const addPoint = () => {
        const next = [...points, { label: `节点${points.length + 1}`, tension: 0.5 }];
        setPoints(next);
        onSave?.(next);
    };

    const removePoint = (idx) => {
        if (points.length <= 2) return;
        const next = points.filter((_, i) => i !== idx);
        setPoints(next);
        onSave?.(next);
    };

    const startEdit = (idx) => {
        setEditIdx(idx);
        setEditLabel(points[idx].label);
    };

    const finishEdit = () => {
        if (editIdx === null) return;
        const next = points.map((p, i) => i === editIdx ? { ...p, label: editLabel.trim() || p.label } : p);
        setPoints(next);
        onSave?.(next);
        setEditIdx(null);
    };

    // 张力等级标签
    const tensionLabels = ['平缓', '低', '中', '高', '极高'];

    return (
        <div style={{
            background: 'var(--bg-primary)', borderRadius: 14,
            border: '1px solid var(--border-light)', margin: '0 0 16px',
            overflow: 'hidden', transition: 'all 0.25s',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 18px', cursor: 'pointer', userSelect: 'none',
            }} onClick={() => setCollapsed(!collapsed)}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ClipboardList size={14} style={{ color: '#ef4444' }} />
                    剧情节奏曲线
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>— 拖拽节点调整张力</span>
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </div>
            {!collapsed && (
                <div style={{ padding: '0 18px 16px' }}>
                    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, cursor: dragging !== null ? 'grabbing' : 'default' }}>
                        <defs>
                            <linearGradient id="plot-tension-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.18" />
                                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
                            </linearGradient>
                        </defs>
                        {/* Grid */}
                        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
                            const y = PY + r * chartH;
                            return (
                                <g key={i}>
                                    <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="var(--border-light)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
                                    <text x={PX - 8} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize="8.5" fontWeight="500">
                                        {tensionLabels[4 - i] || ''}
                                    </text>
                                </g>
                            );
                        })}
                        {/* Area fill */}
                        {coords.length >= 2 && <path d={areaPath} fill="url(#plot-tension-grad)" />}
                        {/* Curve line */}
                        {coords.length >= 2 && <path d={smoothPath} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />}
                        {/* Points */}
                        {coords.map((c, i) => (
                            <g key={i}>
                                {/* Vertical guide line on drag */}
                                {dragging === i && <line x1={c.x} y1={PY} x2={c.x} y2={H - PY} stroke="#ef4444" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />}
                                {/* Draggable dot */}
                                <circle
                                    cx={c.x} cy={c.y} r={dragging === i ? 7 : 5}
                                    fill={dragging === i ? '#ef4444' : 'var(--bg-primary)'}
                                    stroke="#ef4444" strokeWidth="2.5"
                                    style={{ cursor: 'grab', transition: dragging === i ? 'none' : 'r 0.15s' }}
                                    onPointerDown={(e) => handlePointerDown(i, e)}
                                />
                                {/* Tension value */}
                                <text x={c.x} y={c.y - 12} textAnchor="middle" fill="#ef4444" fontSize="9.5" fontWeight="700" opacity={dragging === i ? 1 : 0.7}>
                                    {Math.round(points[i].tension * 100)}%
                                </text>
                                {/* Label */}
                                {editIdx === i ? null : (
                                    <text
                                        x={c.x} y={H - 5} textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="600"
                                        style={{ cursor: 'pointer' }}
                                        onDoubleClick={() => startEdit(i)}
                                    >
                                        {points[i].label}
                                    </text>
                                )}
                                {/* Delete button on hover (small × above dot) */}
                                {points.length > 2 && (
                                    <text
                                        x={c.x + 10} y={c.y - 10} textAnchor="middle" fill="var(--text-muted)" fontSize="10"
                                        style={{ cursor: 'pointer', opacity: 0.3 }}
                                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.fill = '#ef4444'; }}
                                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.fill = 'var(--text-muted)'; }}
                                        onClick={() => removePoint(i)}
                                    >×</text>
                                )}
                            </g>
                        ))}
                    </svg>
                    {/* Inline label editor */}
                    {editIdx !== null && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                            <input
                                value={editLabel} onChange={e => setEditLabel(e.target.value)}
                                onBlur={finishEdit} onKeyDown={e => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') setEditIdx(null); }}
                                autoFocus
                                style={{ flex: 1, padding: '4px 8px', border: '1.5px solid #ef4444', borderRadius: 8, fontSize: 12, outline: 'none', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                placeholder="节点名称"
                            />
                        </div>
                    )}
                    {/* Add point button */}
                    <button
                        onClick={addPoint}
                        style={{ marginTop: 8, padding: '4px 12px', border: '1px dashed var(--border-light)', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >+ 添加节点</button>
                </div>
            )}
        </div>
    );
}

// ==================== 样式 ====================
const S = {
    overlay: {
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    },
    container: {
        background: 'var(--bg-card, #fff)',
        borderRadius: 20,
        boxShadow: '0 40px 120px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)',
        width: '92%', maxWidth: 1100,
        height: '82vh', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'settingsSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    containerFull: {
        position: 'fixed', inset: 0,
        width: '100%', maxWidth: '100%',
        height: '100%', maxHeight: '100%',
        borderRadius: 0,
        background: 'var(--bg-card, #fff)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: 'none',
    },
    // 头部：大幅增高，带装饰性渐变和发光背景
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px',
        height: 72, minHeight: 72,
        borderBottom: '1px solid var(--border-light, #e5e7eb)',
        flexShrink: 0, position: 'relative', overflow: 'hidden',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 16, zIndex: 1 },
    headerIcon: {
        width: 46, height: 46, borderRadius: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    headerTitle: {
        fontSize: 22, fontWeight: 800,
        color: 'var(--text-primary, #1f2937)',
        margin: 0, letterSpacing: '0.02em',
    },
    headerCount: {
        fontSize: 11, fontWeight: 600, padding: '4px 14px', borderRadius: 20,
    },
    headerBtn: {
        width: 36, height: 36, border: 'none', borderRadius: 10,
        background: 'transparent', color: 'var(--text-muted, #9ca3af)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s ease', zIndex: 1,
    },
    body: { flex: 1, display: 'flex', overflow: 'hidden' },
    // 侧边栏：带分类色渐变背景
    sidebar: {
        width: 290, minWidth: 290,
        borderRight: '1px solid var(--border-light, #e5e7eb)',
        display: 'flex', flexDirection: 'column',
    },
    searchWrap: { padding: '14px 14px 10px', flexShrink: 0 },
    searchBox: {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: 'var(--bg-card, #fff)',
        border: '1px solid var(--border-light, #e5e7eb)',
        borderRadius: 12, transition: 'all 0.25s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    },
    searchInput: {
        flex: 1, border: 'none', outline: 'none',
        background: 'transparent', color: 'var(--text-primary, #1f2937)', fontSize: 13,
    },
    treeList: { flex: 1, overflowY: 'auto', padding: '4px 8px' },
    treeFolder: {
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '9px 12px', borderRadius: 10, position: 'relative',
        cursor: 'pointer', fontSize: 13, fontWeight: 600,
        color: 'var(--text-primary, #1f2937)',
        transition: 'all 0.18s ease', userSelect: 'none',
        marginTop: 4,
    },
    treeItem: {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 10, position: 'relative',
        cursor: 'pointer', fontSize: 13,
        color: 'var(--text-primary, #1f2937)',
        transition: 'all 0.18s ease', userSelect: 'none',
    },
    treeDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, transition: 'all 0.2s' },
    treeName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'opacity 0.15s' },
    treeCount: {
        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
        background: 'var(--bg-hover, #f3f4f6)', color: 'var(--text-muted, #9ca3af)', flexShrink: 0,
    },
    treeAction: {
        opacity: 0, border: 'none', background: 'none',
        cursor: 'pointer', padding: 3, borderRadius: 6,
        color: 'var(--text-muted, #9ca3af)',
        display: 'flex', alignItems: 'center', transition: 'all 0.15s', flexShrink: 0,
    },
    renameInput: {
        flex: 1, minWidth: 0, padding: '4px 10px',
        border: '2px solid var(--accent, #3b82f6)', borderRadius: 8,
        background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #1f2937)',
        fontSize: 13, outline: 'none',
    },
    emptyState: {
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, height: '100%', padding: '40px 24px',
    },
    emptyIcon: {
        width: 56, height: 56, borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.8,
    },
    addBtn: {
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 18px', border: '1.5px dashed', borderRadius: 12,
        background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
        transition: 'all 0.2s ease',
    },
    // 底部工具栏
    footer: {
        padding: '10px 12px',
        borderTop: '1px solid var(--border-light, #e5e7eb)',
        display: 'flex', gap: 8, alignItems: 'center',
        position: 'relative',
    },
    footerBtn: {
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '7px 16px',
        border: '1px solid var(--border-light, #e5e7eb)', borderRadius: 10,
        background: 'var(--bg-card, #fff)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        color: 'var(--text-secondary, #6b7280)', transition: 'all 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    },
    // 主要新建按钮（彩色）
    footerPrimaryBtn: {
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '7px 18px', border: 'none', borderRadius: 10,
        cursor: 'pointer', fontSize: 12, fontWeight: 600,
        color: '#fff', transition: 'all 0.2s ease',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    },
    editor: { flex: 1, overflowY: 'auto', background: 'var(--bg-primary, #fff)' },
    // 新建菜单
    addMenu: {
        position: 'absolute', bottom: '100%', left: 12, marginBottom: 6,
        background: 'var(--bg-card, #fff)',
        border: '1px solid var(--border-light, #e5e7eb)',
        borderRadius: 14,
        boxShadow: '0 16px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
        overflow: 'hidden', minWidth: 190, zIndex: 10,
        animation: 'popover-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    addMenuItem: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 18px', width: '100%',
        border: 'none', background: 'transparent',
        cursor: 'pointer', fontSize: 13, fontWeight: 500,
        color: 'var(--text-primary, #1f2937)',
        transition: 'all 0.15s ease', textAlign: 'left',
    },
    addMenuIcon: {
        width: 32, height: 32, borderRadius: 9,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    // 图标选择器
    iconPicker: {
        position: 'absolute', zIndex: 100,
        background: 'var(--bg-card, #fff)',
        border: '1px solid var(--border-light, #e5e7eb)',
        borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        padding: 14, width: 250,
    },
    iconGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4,
    },
    iconCell: {
        width: 36, height: 36, border: 'none', borderRadius: 9,
        background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s ease',
    },
    // 选中指示条
    activeIndicator: {
        position: 'absolute', left: 2, top: '15%', bottom: '15%',
        width: 3.5, borderRadius: 4,
        transition: 'all 0.2s ease',
    },
};

// ==================== 图标选择器 ====================
function IconPicker({ currentIcon, color, bg, onSelect, onClose, anchorRect }) {
    const ref = useRef(null);
    useEffect(() => {
        const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    const [hovered, setHovered] = useState(null);

    // Position near anchor
    const style = {
        ...S.iconPicker,
        top: anchorRect ? anchorRect.bottom + 6 : 40,
        left: anchorRect ? Math.max(8, anchorRect.left - 40) : 8,
    };

    return (
        <div ref={ref} style={style} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, padding: '0 2px' }}>选择图标</div>
            <div style={S.iconGrid}>
                {ICON_GRID.map(name => {
                    const Icon = ICON_MAP[name];
                    if (!Icon) return null;
                    const isActive = currentIcon === name;
                    const isHover = hovered === name;
                    return (
                        <button
                            key={name}
                            style={{
                                ...S.iconCell,
                                background: isActive ? bg : isHover ? 'var(--bg-hover, #f3f4f6)' : 'transparent',
                                color: isActive ? color : isHover ? color : 'var(--text-secondary, #6b7280)',
                                outline: isActive ? `2px solid ${color}` : 'none',
                                outlineOffset: -2,
                            }}
                            onClick={() => { onSelect(name); onClose(); }}
                            onMouseEnter={() => setHovered(name)}
                            onMouseLeave={() => setHovered(null)}
                            title={name}
                        >
                            <Icon size={16} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ==================== 新建菜单 ====================
function AddMenu({ onAddFolder, onAddItem, onClose, catColor, catBg }) {
    const ref = useRef(null);
    const [hovered, setHovered] = useState(null);
    useEffect(() => {
        const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    return (
        <div ref={ref} style={S.addMenu}>
            <button
                style={{
                    ...S.addMenuItem,
                    background: hovered === 'folder' ? 'var(--bg-hover, #f3f4f6)' : 'transparent',
                }}
                onClick={() => { onAddFolder(); onClose(); }}
                onMouseEnter={() => setHovered('folder')}
                onMouseLeave={() => setHovered(null)}
            >
                <span style={{ ...S.addMenuIcon, color: catColor, background: catBg }}>
                    <FolderPlus size={16} />
                </span>
                <span>新建分类</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>子分组</span>
            </button>
            <div style={{ height: 1, background: 'var(--border-light, #e5e7eb)', margin: '0 12px' }} />
            <button
                style={{
                    ...S.addMenuItem,
                    background: hovered === 'item' ? 'var(--bg-hover, #f3f4f6)' : 'transparent',
                }}
                onClick={() => { onAddItem(); onClose(); }}
                onMouseEnter={() => setHovered('item')}
                onMouseLeave={() => setHovered(null)}
            >
                <span style={{ ...S.addMenuIcon, color: '#6b7280', background: 'var(--bg-hover, #f3f4f6)' }}>
                    <FileText size={16} />
                </span>
                <span>新建条目</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>设定项</span>
            </button>
        </div>
    );
}

// ==================== 左侧条目列表 ====================
function ItemList({ nodes, rootFolder, category, selectedId, onSelect, onAddFolder, onAddItem, onRename, onChangeIcon, onDelete, onToggleEnabled, onReorder, searchQuery }) {
    const meta = getCatMeta(category);
    const [collapsed, setCollapsed] = useState({});
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [hoveredId, setHoveredId] = useState(null);
    const [iconPickerFor, setIconPickerFor] = useState(null);
    const [iconPickerRect, setIconPickerRect] = useState(null);
    const renameInputRef = useRef(null);
    const mousePosRef = useRef({ x: 0, y: 0 });

    // 删除后 nodes 变化时，重新检测鼠标下的元素并更新 hoveredId
    useEffect(() => {
        // setTimeout 确保确认弹窗完全关闭、DOM 完全重绘
        const timer = setTimeout(() => {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const x = window._lastMouseX;
                const y = window._lastMouseY;
                if (x == null || y == null) return;
                const el = document.elementFromPoint(x, y);
                if (!el) { setHoveredId(null); return; }
                const row = el.closest('[data-node-id]');
                if (row) {
                    setHoveredId(row.getAttribute('data-node-id'));
                } else {
                    setHoveredId(null);
                }
            }));
        }, 100);
        return () => clearTimeout(timer);
    }, [nodes]);

    // ---- 拖拽状态 ----
    const [dragId, setDragId] = useState(null);
    const [dropTargetId, setDropTargetId] = useState(null);
    const [dropPosition, setDropPosition] = useState(null); // 'before' | 'after' | 'inside'

    // 预计算 children map 和 item count map，避免每次渲染都 O(n) 扫描
    const { childrenMap, itemCountMap } = useMemo(() => {
        const cMap = new Map();
        for (const n of nodes) {
            const pid = n.parentId;
            if (!cMap.has(pid)) cMap.set(pid, []);
            cMap.get(pid).push(n);
        }
        // 排序每个 parent 的 children
        for (const [, children] of cMap) {
            children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        }
        // 递归统计 item 数量
        const iMap = new Map();
        const count = (parentId) => {
            if (iMap.has(parentId)) return iMap.get(parentId);
            const ch = cMap.get(parentId) || [];
            let total = 0;
            for (const c of ch) {
                if (c.type === 'item') total++;
                else total += count(c.id);
            }
            iMap.set(parentId, total);
            return total;
        };
        for (const n of nodes) {
            if (n.type === 'folder') count(n.id);
        }
        return { childrenMap: cMap, itemCountMap: iMap };
    }, [nodes]);

    const getChildren = useCallback((parentId) => {
        return childrenMap.get(parentId) || [];
    }, [childrenMap]);

    const matchesSearch = useCallback((node) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return node.name?.toLowerCase().includes(q) || node.id?.toLowerCase().includes(q);
    }, [searchQuery]);

    const startRename = (e, node) => {
        e.stopPropagation();
        setRenamingId(node.id);
        setRenameValue(node.name);
        setTimeout(() => renameInputRef.current?.focus(), 50);
    };

    const finishRename = () => {
        if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim());
        setRenamingId(null);
    };

    const handleIconClick = (e, nodeId) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const listEl = e.currentTarget.closest('[data-tree-list]');
        const listRect = listEl?.getBoundingClientRect() || { top: 0, left: 0 };
        setIconPickerFor(nodeId);
        setIconPickerRect({
            top: rect.top - listRect.top,
            bottom: rect.bottom - listRect.top,
            left: rect.left - listRect.left,
        });
    };

    // Count all items recursively (uses pre-computed map)
    const countItems = useCallback((parentId) => {
        return itemCountMap.get(parentId) || 0;
    }, [itemCountMap]);

    // ---- 拖拽处理 ----
    const handleDragStart = (e, node) => {
        setDragId(node.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.id);
        // 让拖拽预览半透明
        if (e.currentTarget) {
            e.currentTarget.style.opacity = '0.5';
        }
    };

    const handleDragEnd = (e) => {
        if (e.currentTarget) e.currentTarget.style.opacity = '1';
        setDragId(null);
        setDropTargetId(null);
        setDropPosition(null);
    };

    const handleDragOver = (e, node) => {
        e.preventDefault();
        if (!dragId || dragId === node.id) return;
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const h = rect.height;
        // 文件夹：上1/4=before, 中间=inside, 下1/4=after
        // 条目：上半=before, 下半=after
        if (node.type === 'folder') {
            if (y < h * 0.25) setDropPosition('before');
            else if (y > h * 0.75) setDropPosition('after');
            else setDropPosition('inside');
        } else {
            setDropPosition(y < h / 2 ? 'before' : 'after');
        }
        setDropTargetId(node.id);
    };

    const handleDrop = (e, targetNode) => {
        e.preventDefault();
        if (!dragId || dragId === targetNode.id || !onReorder) return;
        onReorder(dragId, targetNode.id, dropPosition);
        setDragId(null);
        setDropTargetId(null);
        setDropPosition(null);
    };

    // 生成拖拽指示线样式
    const getDropIndicatorStyle = (nodeId) => {
        if (dropTargetId !== nodeId || !dropPosition) return {};
        if (dropPosition === 'before') {
            return { boxShadow: `0 -2px 0 0 ${meta.color}` };
        }
        if (dropPosition === 'after') {
            return { boxShadow: `0 2px 0 0 ${meta.color}` };
        }
        if (dropPosition === 'inside') {
            return { outline: `2px dashed ${meta.color}40`, outlineOffset: -2 };
        }
        return {};
    };

    // ---- 悬停操作按钮 ----
    const actionBtnStyle = {
        border: 'none', background: 'none', cursor: 'pointer', padding: 3,
        borderRadius: 5, display: 'flex', alignItems: 'center',
        transition: 'all 0.12s', flexShrink: 0, lineHeight: 1,
    };

    const renderActions = (node, isHovered, addItemFn) => {
        if (renamingId === node.id) return null;
        const isHidden = node.enabled === false;
        return (
            <div className="cstree-actions" style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, marginLeft: 'auto', ...(isHovered ? { opacity: 1, pointerEvents: 'auto' } : {}) }} onClick={e => e.stopPropagation()}>
                <button style={{ ...actionBtnStyle, color: 'var(--text-muted)' }}
                    onClick={e => startRename(e, node)} title="重命名"
                    onMouseEnter={e => { e.currentTarget.style.color = meta.color; e.currentTarget.style.background = `${meta.color}12`; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                ><Pencil size={12} /></button>
                {node.type === 'item' && onToggleEnabled && (
                    <button style={{ ...actionBtnStyle, color: isHidden ? '#f59e0b' : 'var(--text-muted)' }}
                        onClick={e => { e.stopPropagation(); onToggleEnabled(node.id); }} title={isHidden ? '显示' : '隐藏'}
                        onMouseEnter={e => { e.currentTarget.style.color = isHidden ? '#22c55e' : '#f59e0b'; e.currentTarget.style.background = isHidden ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = isHidden ? '#f59e0b' : 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                    >{isHidden ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                )}
                {onDelete && (
                    <button style={{ ...actionBtnStyle, color: 'var(--text-muted)' }}
                        onClick={e => { e.stopPropagation(); onDelete(node.id); }} title="删除"
                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                    ><Trash2 size={12} /></button>
                )}
                {addItemFn && (
                    <button style={{ ...actionBtnStyle, color: 'var(--text-muted)' }}
                        onClick={e => { e.stopPropagation(); addItemFn(); }} title="新建条目"
                        onMouseEnter={e => { e.currentTarget.style.color = meta.color; e.currentTarget.style.background = `${meta.color}12`; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                    ><Plus size={12} /></button>
                )}
            </div>
        );
    };

    const renderNode = (node, depth = 0) => {
        if (!matchesSearch(node) && node.type === 'item') return null;
        const isFolder = node.type === 'folder';
        const isSelected = selectedId === node.id;
        const isHovered = hoveredId === node.id;
        const isCollapsed = collapsed[node.id];
        const children = getChildren(node.id);
        const indent = depth * 18;
        const isDragging = dragId === node.id;

        if (isFolder) {
            if (searchQuery) {
                const hasDescendantMatch = (pid) => {
                    const ch = nodes.filter(n => n.parentId === pid);
                    return ch.some(c => (c.type === 'item' && matchesSearch(c)) || (c.type === 'folder' && hasDescendantMatch(c.id)));
                };
                if (!hasDescendantMatch(node.id)) return null;
            }

            const FolderIcon = (node.icon && getIconComponent(node.icon)) || FolderOpen;
            const totalItems = countItems(node.id);

            return (
                <div key={node.id}>
                    <div
                        draggable={!renamingId}
                        onDragStart={e => handleDragStart(e, node)}
                        onDragEnd={handleDragEnd}
                        onDragOver={e => handleDragOver(e, node)}
                        onDragLeave={() => { if (dropTargetId === node.id) { setDropTargetId(null); setDropPosition(null); } }}
                        onDrop={e => handleDrop(e, node)}
                        style={{
                            ...S.treeFolder,
                            paddingLeft: 8 + indent,
                            background: isSelected ? `${meta.color}20` : isHovered ? 'var(--bg-hover, #f3f4f6)' : 'transparent',
                            color: isSelected ? meta.color : 'var(--text-primary, #1f2937)',
                            opacity: isDragging ? 0.5 : 1,
                            ...getDropIndicatorStyle(node.id),
                        }}
                        className="cstree-row"
                        data-node-id={node.id}
                        onClick={() => { setCollapsed(p => ({ ...p, [node.id]: !p[node.id] })); onSelect(isSelected ? null : node.id); }}
                        onMouseEnter={() => setHoveredId(node.id)}
                        onMouseMove={() => setHoveredId(node.id)}
                        onMouseLeave={() => setHoveredId(null)}
                    >
                        {/* 选中指示条 */}
                        {isSelected && <span style={{ ...S.activeIndicator, background: meta.color }} />}
                        {/* 拖拽手柄 */}
                        <span className="cstree-drag" style={{ display: 'flex', color: 'var(--text-muted)', flexShrink: 0, cursor: 'grab', marginRight: -2, ...(isHovered ? { opacity: 0.5 } : {}) }}>
                            <GripVertical size={12} />
                        </span>
                        <span style={{ display: 'flex', color: 'var(--text-muted)', flexShrink: 0 }}>
                            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        </span>
                        <span
                            style={{ display: 'flex', cursor: 'pointer', flexShrink: 0, color: meta.color, borderRadius: 4, padding: 1 }}
                            onClick={(e) => handleIconClick(e, node.id)}
                            title="点击更换图标"
                        >
                            <FolderIcon size={14} />
                        </span>
                        {renamingId === node.id ? (
                            <input ref={renameInputRef} style={S.renameInput} value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onBlur={finishRename}
                                onKeyDown={e => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') setRenamingId(null); }}
                                onClick={e => e.stopPropagation()} />
                        ) : <span style={{ ...S.treeName, opacity: node.enabled === false ? 0.45 : 1 }}>{node.name}</span>}
                        <span className="cstree-count" style={{ ...S.treeCount, ...(isHovered ? { display: 'none' } : {}) }}>{totalItems}</span>
                        {renderActions(node, isHovered, () => onAddItem(node.id))}
                    </div>
                    {!isCollapsed && children.map(child => renderNode(child, depth + 1))}
                </div>
            );
        }

        // item
        const isHidden = node.enabled === false;
        return (
            <div
                key={node.id}
                draggable={!renamingId}
                onDragStart={e => handleDragStart(e, node)}
                onDragEnd={handleDragEnd}
                onDragOver={e => handleDragOver(e, node)}
                onDragLeave={() => { if (dropTargetId === node.id) { setDropTargetId(null); setDropPosition(null); } }}
                onDrop={e => handleDrop(e, node)}
                style={{
                    ...S.treeItem,
                    paddingLeft: 12 + indent,
                    background: isSelected ? `${meta.color}22` : isHovered ? 'var(--bg-hover, #f3f4f6)' : 'transparent',
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? meta.color : 'var(--text-primary)',
                    opacity: isDragging ? 0.5 : 1,
                    ...getDropIndicatorStyle(node.id),
                }}
                className="cstree-row"
                data-node-id={node.id}
                onClick={() => onSelect(isSelected ? null : node.id)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseMove={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                title={node.name}
            >
                {/* 选中指示条 */}
                {isSelected && <span style={{ ...S.activeIndicator, background: meta.color }} />}
                {/* 拖拽手柄 */}
                <span className="cstree-drag" style={{ display: 'flex', color: 'var(--text-muted)', flexShrink: 0, cursor: 'grab', marginRight: -4, ...(isHovered ? { opacity: 0.5 } : {}) }}>
                    <GripVertical size={12} />
                </span>
                <span style={{ ...S.treeDot, background: isSelected ? meta.color : isHidden ? `${meta.color}30` : `${meta.color}60` }} />
                {renamingId === node.id ? (
                    <input ref={renameInputRef} style={S.renameInput} value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={finishRename}
                        onKeyDown={e => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') setRenamingId(null); }}
                        onClick={e => e.stopPropagation()} />
                ) : <span style={{ ...S.treeName, opacity: isHidden ? 0.45 : 1, textDecoration: isHidden ? 'line-through' : 'none' }}>{node.name}</span>}
                {isHidden && <span className="cstree-count" style={isHovered ? { display: 'none' } : undefined}><EyeOff size={11} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.5 }} /></span>}
                {renderActions(node, isHovered)}
            </div>
        );
    };

    const rootChildren = rootFolder ? getChildren(rootFolder.id) : [];

    if (rootChildren.length === 0) {
        return (
            <div style={S.treeList} data-tree-list>
                <div style={S.emptyState}>
                    <div style={{ ...S.emptyIcon, color: meta.color, background: meta.bg }}>
                        {(() => { const Icon = meta.icon; return <Icon size={22} />; })()}
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-muted, #9ca3af)', fontWeight: 500 }}>暂无内容</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                            style={{ ...S.addBtn, borderColor: `${meta.color}50`, color: meta.color, fontSize: 12, padding: '6px 14px' }}
                            onClick={() => onAddFolder(rootFolder?.id)}
                            onMouseEnter={e => { e.currentTarget.style.background = meta.bg; e.currentTarget.style.borderColor = meta.color; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = `${meta.color}50`; }}
                        >
                            <FolderPlus size={13} /> 新建分类
                        </button>
                        <button
                            style={{ ...S.addBtn, borderColor: 'var(--border-medium, #d1d5db)', color: 'var(--text-secondary, #6b7280)', fontSize: 12, padding: '6px 14px' }}
                            onClick={() => onAddItem(rootFolder?.id)}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'var(--border-medium, #d1d5db)'; }}
                        >
                            <FileText size={13} /> 新建条目
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ ...S.treeList, position: 'relative' }} data-tree-list
            onMouseMove={e => { mousePosRef.current = { x: e.clientX, y: e.clientY }; }}
        >
            <style>{`
                .cstree-row:not(:hover) > .cstree-actions { opacity: 0; pointer-events: none; }
                .cstree-row:hover > .cstree-actions { opacity: 1; pointer-events: auto; }
                .cstree-row:not(:hover) > .cstree-drag { opacity: 0; }
                .cstree-row:hover > .cstree-drag { opacity: 0.5; }
                .cstree-row:hover > .cstree-count { display: none; }
                .cstree-row:not(:hover) > .cstree-count { display: inline-flex; }
                .cstree-row:hover { background: var(--bg-hover, #f3f4f6); }
            `}</style>
            {rootChildren.map(child => renderNode(child, 0))}
            {iconPickerFor && (
                <IconPicker
                    currentIcon={nodes.find(n => n.id === iconPickerFor)?.icon || 'FolderOpen'}
                    color={meta.color}
                    bg={meta.bg}
                    onSelect={(iconName) => onChangeIcon(iconPickerFor, iconName)}
                    onClose={() => setIconPickerFor(null)}
                    anchorRect={iconPickerRect}
                />
            )}
        </div>
    );
}

// ==================== 删除确认 ====================
function DeleteConfirmDialog({ message, onConfirm, onCancel }) {
    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20001, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
            <div style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, padding: '26px 30px', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', minWidth: 300 }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: '0 0 22px', lineHeight: 1.6, fontWeight: 500 }}>{message}</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button style={{ padding: '7px 18px', borderRadius: 9, border: '1px solid var(--border-light, #e5e7eb)', background: 'var(--bg-card, #fff)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }} onClick={onCancel}>取消</button>
                    <button style={{ padding: '7px 18px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }} onClick={onConfirm}>删除</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ==================== 主组件 ====================
export default function CategorySettingsModal() {
    const {
        openCategoryModal: category,
        setOpenCategoryModal,
        jumpToNodeId,
        setJumpToNodeId,
        incrementSettingsVersion,
    } = useAppStore();

    const { t } = useI18n();
    const [nodes, setNodes] = useState([]);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [searchFocused, setSearchFocused] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [works, setWorks] = useState([]);
    const [activeWorkId, setActiveWorkIdState] = useState(null);
    const [showNewWorkInput, setShowNewWorkInput] = useState(false);
    const [newWorkName, setNewWorkName] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const searchInputRef = useRef(null);
    const importInputRef = useRef(null);

    const meta = getCatMeta(category);

    // 加载作品列表
    useEffect(() => {
        // bookInfo 已移至独立的 BookInfoPanel，不在设定集管理中显示
        if (category === 'bookInfo') {
            setOpenCategoryModal(null);
            return;
        }
        if (category) {
            (async () => {
                const allWorks = await getAllWorks();
                setWorks(allWorks);
                setActiveWorkIdState(getActiveWorkId());
            })();
        }
    }, [category]);

    // 切换作品
    const handleSwitchWork = async (workId) => {
        setActiveWorkIdState(workId);
        setActiveWorkId(workId);
        useAppStore.getState().setActiveWorkId(workId);
        setSelectedNodeId(null);
        const workNodes = await getSettingsNodes(workId);
        setNodes(workNodes);
    };

    // 新建作品
    const handleCreateWork = async () => {
        const trimmed = newWorkName.trim();
        if (!trimmed) return;
        const name = trimmed;
        const newWork = await addWork(name);
        setWorks(prev => [...prev, newWork]);
        setShowNewWorkInput(false);
        setNewWorkName('');
        await handleSwitchWork(newWork.id);
    };

    // 导出当前分类的设定（多格式）
    const handleExportCategory = async (format = 'json') => {
        const catItems = nodes.filter(n => n.category === category && n.type === 'item');
        if (catItems.length === 0) { alert('当前分类没有可导出的条目'); return; }
        setShowExportMenu(false);
        const baseName = meta.label + '-设定';

        if (format === 'txt') {
            const txt = exportNodesToTxt(catItems);
            await downloadFile(txt, `${baseName}.txt`, 'text/plain');
        } else if (format === 'md') {
            const md = exportNodesToMarkdown(catItems);
            await downloadFile(md, `${baseName}.md`, 'text/markdown');
        } else if (format === 'docx') {
            const blob = await exportNodesToDocx(catItems);
            await downloadBlob(blob, `${baseName}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } else if (format === 'pdf') {
            exportSettingsAsPdf(catItems);
        } else {
            // JSON
            const data = {
                type: 'author-category-export',
                version: 1,
                category,
                categoryLabel: meta.label,
                exportedAt: new Date().toISOString(),
                items: catItems.map(({ embedding, ...rest }) => rest),
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${baseName}.json`; a.click();
            URL.revokeObjectURL(url);
        }
    };

    // 导入当前分类的设定（多格式）
    const handleImportCategory = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const ext = file.name.split('.').pop().toLowerCase();
        try {
            const workId = getActiveWorkId();
            const parentFolder = nodes.find(n => n.type === 'folder' && n.category === category);
            const parentId = parentFolder?.id || workId;

            // JSON 导入
            if (ext === 'json') {
                const text = await file.text();
                const data = JSON.parse(text);
                let importItems = [];
                if (data.type === 'author-category-export' && Array.isArray(data.items)) {
                    importItems = data.items;
                } else if (data.type === 'author-settings-export' && Array.isArray(data.nodes)) {
                    importItems = data.nodes.filter(n => n.type === 'item' && n.category === category);
                } else {
                    alert('无法识别的JSON格式'); return;
                }
                if (importItems.length === 0) { alert('未找到可导入的条目'); return; }
                let updatedNodes = [...nodes];
                let count = 0;
                for (const item of importItems) {
                    const nodeId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6) + count;
                    updatedNodes.push({
                        id: nodeId, name: item.name || '导入条目', type: 'item',
                        category, parentId, order: count,
                        content: item.content || {},
                        collapsed: false, enabled: true,
                        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                    });
                    count++;
                }
                await saveSettingsNodes(updatedNodes, workId);
                setNodes(updatedNodes);
                alert(`成功导入 ${count} 个${meta.label}条目`);
                return;
            }

            // TXT/MD/DOCX/PDF 智能导入
            let text;
            if (ext === 'docx') {
                text = await parseDocxToText(file);
            } else if (ext === 'pdf') {
                text = await parsePdfToText(file);
                text = preprocessPdfText(text);
            } else {
                text = await file.text();
            }

            let importedItems = [];
            if (isStructuredText(text)) {
                const parsedEntries = parseStructuredText(text);
                for (const entry of parsedEntries) {
                    // 只导入匹配当前分类的条目
                    if (entry.category && entry.category !== category) continue;
                    const mapped = mapFieldsToContent(entry.fields, category);
                    const nodeName = mapped.name || entry.name || '导入条目';
                    if (Object.keys(mapped.content).length === 0) continue;
                    importedItems.push({ name: nodeName, category, content: mapped.content });
                }
            } else {
                const blocks = parseMultipleEntries(text);
                for (const block of blocks) {
                    const parsed = parseTextToFields(block);
                    if (Object.keys(parsed).length === 0) continue;
                    const mapped = mapFieldsToContent(parsed, category);
                    const nodeName = mapped.name || Object.values(parsed)[0]?.substring(0, 20) || '导入条目';
                    importedItems.push({ name: nodeName, category, content: mapped.content });
                }
            }

            if (importedItems.length === 0) { alert('未能从文件中解析出任何条目'); return; }

            let updatedNodes = [...nodes];
            let count = 0;
            for (const item of importedItems) {
                const nodeId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6) + count;
                updatedNodes.push({
                    id: nodeId, name: item.name, type: 'item',
                    category, parentId, order: count,
                    content: item.content,
                    collapsed: false, enabled: true,
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                });
                count++;
            }
            await saveSettingsNodes(updatedNodes, workId);
            setNodes(updatedNodes);
            alert(`成功导入 ${count} 个${meta.label}条目`);
        } catch (err) {
            alert('导入失败: ' + err.message);
        }
    };

    // 清空当前分类的所有条目
    const handleClearCategory = async () => {
        const catItems = nodes.filter(n => n.category === category && n.type === 'item');
        if (catItems.length === 0) return;
        const workId = getActiveWorkId();
        const updatedNodes = nodes.filter(n => !(n.category === category && n.type === 'item'));
        await saveSettingsNodes(updatedNodes, workId);
        setNodes(updatedNodes);
        setSelectedNodeId(null);
        setShowClearConfirm(false);
    };

    // 加载节点
    const loadNodes = useCallback(async () => {
        const workId = getActiveWorkId();
        if (!workId) return;
        const allNodes = await getSettingsNodes(workId);
        setNodes(allNodes);
    }, []);

    useEffect(() => {
        if (category) {
            loadNodes().then(() => {
                if (jumpToNodeId) {
                    setSelectedNodeId(jumpToNodeId);
                    setJumpToNodeId(null);
                }
            });
            setSearchQuery('');
            setSelectedNodeId(null);
        }
    }, [category, loadNodes, jumpToNodeId, setJumpToNodeId]);

    // 全局追踪鼠标位置，用于删除后重新检测悬停
    useEffect(() => {
        const handler = (e) => { window._lastMouseX = e.clientX; window._lastMouseY = e.clientY; };
        document.addEventListener('mousemove', handler, { passive: true });
        return () => document.removeEventListener('mousemove', handler);
    }, []);

    const rootFolder = useMemo(() => {
        const workId = getActiveWorkId();
        return nodes.find(n => n.parentId === workId && n.category === category) || null;
    }, [nodes, category]);

    // 使用 rootFolder 的图标，与缩略图弹窗和完整面板保持一致
    const CatIcon = (rootFolder?.icon && getIconComponent(rootFolder.icon)) || meta.icon;

    const categoryNodes = useMemo(() => {
        if (!rootFolder) return [];
        const collect = (parentId) => {
            const children = nodes.filter(n => n.parentId === parentId);
            let result = [];
            for (const child of children) {
                result.push(child);
                if (child.type === 'folder') result = result.concat(collect(child.id));
            }
            return result;
        };
        return collect(rootFolder.id);
    }, [nodes, rootFolder]);

    const itemCount = categoryNodes.filter(n => n.type === 'item').length;
    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    // 解析正确的父级 folder：如果 selectedId 是 item，向上找到其所属 folder
    const resolveParentFolder = (explicitParentId) => {
        if (explicitParentId) {
            const node = nodes.find(n => n.id === explicitParentId);
            if (!node) return rootFolder?.id;
            // 如果是 folder，直接作为 parent
            if (node.type === 'folder') return node.id;
            // 如果是 item，使用其 parentId
            return node.parentId || rootFolder?.id;
        }
        return rootFolder?.id;
    };

    // 新建分类（folder）
    const handleAddFolder = async (parentId) => {
        const targetParent = resolveParentFolder(parentId);
        if (!targetParent) return;
        const newNode = await addSettingsNode({
            name: '新分类', type: 'folder', category, parentId: targetParent, icon: 'FolderOpen',
        });
        // 直接追加到现有状态，不重新加载
        setNodes(prev => [...prev, newNode]);
        setSelectedNodeId(newNode.id);
    };

    // 新建条目（item）
    const handleAddItem = async (parentId) => {
        const targetParent = resolveParentFolder(parentId);
        if (!targetParent) return;
        const newNode = await addSettingsNode({
            name: '新条目', type: 'item', category, parentId: targetParent, enabled: true,
        });
        // 直接追加到现有状态，不重新加载
        setNodes(prev => [...prev, newNode]);
        setSelectedNodeId(newNode.id);
    };

    const handleDeleteNode = async (id) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        setDeleteConfirm({
            message: `确定要删除「${node.name}」吗？${node.type === 'folder' ? '分类内的所有条目也会被删除。' : ''}`,
            onConfirm: async () => {
                setDeleteConfirm(null);
                await deleteSettingsNode(id);
                const updated = await getSettingsNodes();
                setNodes(updated);
                if (selectedNodeId === id) setSelectedNodeId(null);
                // 强制浏览器重新计算 hover 状态
                requestAnimationFrame(() => {
                    document.body.style.pointerEvents = 'none';
                    requestAnimationFrame(() => {
                        document.body.style.pointerEvents = '';
                    });
                });
            },
            onCancel: () => setDeleteConfirm(null),
        });
    };

    const handleRenameNode = async (id, newName) => {
        await updateSettingsNode(id, { name: newName });
        setNodes(prev => prev.map(n => n.id === id ? { ...n, name: newName } : n));
    };

    const handleChangeIcon = async (id, iconName) => {
        await updateSettingsNode(id, { icon: iconName });
        setNodes(prev => prev.map(n => n.id === id ? { ...n, icon: iconName } : n));
    };

    const handleUpdateNode = (id, updates) => {
        const updatedNodes = nodes.map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n);
        setNodes(updatedNodes);
        updateSettingsNode(id, updates, updatedNodes);
    };

    const onClose = () => {
        setOpenCategoryModal(null);
        incrementSettingsVersion();
    };

    if (!category || category === 'bookInfo') return null;

    return createPortal(
        <div style={S.overlay} onMouseDown={e => { e.currentTarget._md = e.target; }} onClick={e => { if (e.currentTarget._md === e.currentTarget) onClose(); }}>
            <div style={isFullscreen ? S.containerFull : S.container} onClick={e => e.stopPropagation()}>
                {/* ===== 头部 ===== */}
                <div style={{ ...S.header, background: `linear-gradient(135deg, ${meta.bg} 0%, ${meta.bg}80 50%, var(--bg-card, #fff) 100%)` }}>
                    {/* 装饰性发光圆 */}
                    <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: `${meta.color}08`, pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: -20, left: '30%', width: 120, height: 120, borderRadius: '50%', background: `${meta.color}06`, pointerEvents: 'none' }} />
                    <div style={S.headerLeft}>
                        <span style={{ ...S.headerIcon, color: meta.color, background: `linear-gradient(135deg, ${meta.bg}, ${meta.color}20)`, boxShadow: `0 8px 24px ${meta.color}30` }}>
                            <CatIcon size={22} />
                        </span>
                        <div>
                            <h2 style={S.headerTitle}>{meta.label}</h2>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginLeft: 12 }}>
                            <button
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(6px)', padding: '6px 14px', borderRadius: 9, fontSize: 12.5, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s', fontWeight: 500, whiteSpace: 'nowrap' }}
                                onClick={() => { onClose(); setTimeout(() => useAppStore.getState().setShowSettings('settings'), 80); }}
                                onMouseEnter={e => { e.currentTarget.style.color = meta.color; e.currentTarget.style.background = `${meta.color}15`; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'rgba(255,255,255,0.65)'; }}
                                title="返回完整设定集面板"
                            ><Layers size={14} />设定集面板</button>
                            <button
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(6px)', padding: '6px 14px', borderRadius: 9, fontSize: 12.5, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s', fontWeight: 500, whiteSpace: 'nowrap' }}
                                onClick={() => { onClose(); setTimeout(() => useAppStore.getState().setShowBookInfo(true), 80); }}
                                onMouseEnter={e => { e.currentTarget.style.color = meta.color; e.currentTarget.style.background = `${meta.color}15`; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'rgba(255,255,255,0.65)'; }}
                                title="返回作品信息管理"
                            ><BookOpen size={14} />作品信息</button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', zIndex: 1 }}>
                        <button style={S.headerBtn} onClick={() => setIsFullscreen(!isFullscreen)}
                            title={isFullscreen ? '缩小' : '最大化'}
                            onMouseEnter={e => { e.currentTarget.style.background = `${meta.color}12`; e.currentTarget.style.color = meta.color; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                        </button>
                        <button style={S.headerBtn} onClick={onClose}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* ===== 作品切换器 ===== */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 28px',
                    borderBottom: '1px solid var(--border-light, #e5e7eb)',
                    background: 'var(--bg-secondary, #f9fafb)',
                    flexShrink: 0,
                }}>
                    <BookOpen size={14} style={{ color: meta.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', whiteSpace: 'nowrap', flexShrink: 0 }}>作品</span>
                    <select
                        value={activeWorkId || ''}
                        onChange={e => handleSwitchWork(e.target.value)}
                        style={{
                            padding: '6px 36px 6px 12px',
                            border: `1.5px solid ${meta.color}`,
                            borderRadius: 10,
                            background: 'var(--bg-card, #fff)',
                            color: 'var(--text-primary, #1f2937)',
                            fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', outline: 'none',
                            appearance: 'none', WebkitAppearance: 'none',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(meta.color)}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 10l5 5 5-5'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 10px center',
                            boxShadow: `0 1px 4px ${meta.color}12`,
                            transition: 'all 0.15s',
                        }}
                        onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 3px ${meta.color}20`; }}
                        onBlur={e => { e.currentTarget.style.boxShadow = `0 1px 4px ${meta.color}12`; }}
                    >
                        {works.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                    </select>
                    {showNewWorkInput ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input style={{ padding: '5px 10px', border: `1.5px solid ${meta.color}`, borderRadius: 10, fontSize: 12, background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', outline: 'none', width: 110 }}
                                value={newWorkName} onChange={e => setNewWorkName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateWork(); if (e.key === 'Escape') setShowNewWorkInput(false); }}
                                placeholder="作品名称" autoFocus />
                            <button style={{ padding: '4px 10px', border: 'none', borderRadius: 8, background: meta.color, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                                onClick={handleCreateWork}>确定</button>
                            <button style={{ padding: '4px 8px', border: 'none', borderRadius: 8, background: 'var(--bg-hover, #f3f4f6)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
                                onClick={() => setShowNewWorkInput(false)}>取消</button>
                        </div>
                    ) : (
                        <button style={{ padding: '4px 10px', border: '1px dashed var(--border-light, #d1d5db)', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted, #9ca3af)', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                            onClick={() => { setNewWorkName(''); setShowNewWorkInput(true); }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = meta.color; e.currentTarget.style.color = meta.color; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light, #d1d5db)'; e.currentTarget.style.color = 'var(--text-muted, #9ca3af)'; }}
                        >+ 新作品</button>
                    )}
                    {/* 右侧操作按钮 */}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center', position: 'relative' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #9ca3af)', padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s', display: 'flex', alignItems: 'center' }}
                                onClick={() => setShowExportMenu(!showExportMenu)} title={'导出' + meta.label}
                                onMouseEnter={e => { e.currentTarget.style.color = meta.color; e.currentTarget.style.background = `${meta.color}10`; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #9ca3af)'; e.currentTarget.style.background = 'none'; }}
                            ><Upload size={13} /></button>
                            {showExportMenu && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-light)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden', minWidth: 120 }}>
                                    {[{ key: 'json', label: 'JSON (完整)' }, { key: 'txt', label: 'TXT (纯文本)' }, { key: 'md', label: 'Markdown' }, { key: 'docx', label: 'Word (.docx)' }, { key: 'pdf', label: 'PDF (打印)' }].map(f => (
                                        <button key={f.key} style={{ display: 'block', width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left', transition: 'background 0.1s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f9fafb)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                            onClick={() => handleExportCategory(f.key)}
                                        ><FileText size={12} style={{ marginRight: 6 }} />{f.label}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #9ca3af)', padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s', display: 'flex', alignItems: 'center' }}
                            onClick={() => importInputRef.current?.click()} title={'导入' + meta.label}
                            onMouseEnter={e => { e.currentTarget.style.color = meta.color; e.currentTarget.style.background = `${meta.color}10`; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #9ca3af)'; e.currentTarget.style.background = 'none'; }}
                        ><Download size={13} /></button>
                        <input ref={importInputRef} type="file" accept=".json,.txt,.md,.markdown,.docx,.pdf" onChange={handleImportCategory} style={{ display: 'none' }} />
                        <div style={{ width: 1, height: 14, background: 'var(--border-light, #e5e7eb)', margin: '0 2px' }} />
                        {showClearConfirm ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
                                <span style={{ color: '#ef4444', whiteSpace: 'nowrap' }}>确认清空?</span>
                                <button style={{ padding: '2px 8px', border: 'none', borderRadius: 6, background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}
                                    onClick={handleClearCategory}>确定</button>
                                <button style={{ padding: '2px 8px', border: 'none', borderRadius: 6, background: 'var(--bg-hover, #f3f4f6)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10 }}
                                    onClick={() => setShowClearConfirm(false)}>取消</button>
                            </div>
                        ) : (
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #9ca3af)', padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
                                onClick={() => setShowClearConfirm(true)} title={'清空' + meta.label}
                                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #9ca3af)'; e.currentTarget.style.background = 'none'; }}
                            ><Trash2 size={13} /></button>
                        )}
                    </div>
                </div>

                {/* ===== 子分类标签栏 ===== */}
                {(() => {
                    const subFolders = rootFolder ? nodes.filter(n => n.parentId === rootFolder.id && n.type === 'folder').sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
                    if (subFolders.length === 0) return null;
                    return (
                        <div
                            className="cstab-bar"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 28px',
                                borderBottom: '1px solid var(--border-light, #e5e7eb)',
                                background: 'var(--bg-primary, #fff)',
                                flexShrink: 0,
                                overflowX: 'auto', overflowY: 'hidden',
                                scrollbarWidth: 'none',
                                WebkitOverflowScrolling: 'touch',
                            }}
                            onWheel={e => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); } }}
                            ref={el => { if (el) el.style.setProperty('--scrollbar-display', 'none'); }}
                        >
                            <style>{`.cstab-bar::-webkit-scrollbar { display: none; }`}</style>
                            <button
                                style={{
                                    padding: '4px 12px', border: 'none', borderRadius: 7,
                                    fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
                                    background: !selectedNodeId || selectedNodeId === rootFolder?.id ? `${meta.color}15` : 'transparent',
                                    color: !selectedNodeId || selectedNodeId === rootFolder?.id ? meta.color : 'var(--text-muted, #9ca3af)',
                                }}
                                onClick={() => setSelectedNodeId(null)}
                                onMouseEnter={e => { if (selectedNodeId) { e.currentTarget.style.background = 'var(--bg-hover, #f3f4f6)'; } }}
                                onMouseLeave={e => { if (selectedNodeId) { e.currentTarget.style.background = 'transparent'; } }}
                            >全部</button>
                            {subFolders.map(folder => {
                                const isActive = selectedNodeId === folder.id;
                                const FolderIcon = getIconComponent(folder.icon);
                                return (
                                    <button
                                        key={folder.id}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '4px 12px', border: 'none', borderRadius: 7,
                                            fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                                            transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
                                            background: isActive ? `${meta.color}15` : 'transparent',
                                            color: isActive ? meta.color : 'var(--text-muted, #9ca3af)',
                                        }}
                                        onClick={() => {
                                            setSelectedNodeId(folder.id);
                                            // 展开该文件夹（取消 collapsed）
                                            if (folder.collapsed) {
                                                const updatedNodes = nodes.map(n => n.id === folder.id ? { ...n, collapsed: false } : n);
                                                setNodes(updatedNodes);
                                            }
                                            // 滚动到该文件夹
                                            setTimeout(() => {
                                                const el = document.querySelector(`[data-node-id="${folder.id}"]`);
                                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                            }, 50);
                                        }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover, #f3f4f6)'; }}
                                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        {FolderIcon && <FolderIcon size={12} />}
                                        {folder.name}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })()}

                {/* ===== 内容区 ===== */}
                <div style={S.body}>
                    {/* 左侧 */}
                    <div style={{ ...S.sidebar, background: `linear-gradient(180deg, ${meta.bg}40 0%, var(--bg-secondary, #f9fafb) 120px)` }}>
                        <div style={S.searchWrap}>
                            <div style={{
                                ...S.searchBox,
                                borderColor: searchFocused ? meta.color : 'var(--border-light, #e5e7eb)',
                                boxShadow: searchFocused ? `0 0 0 3px ${meta.color}18, 0 2px 6px rgba(0,0,0,0.06)` : '0 1px 3px rgba(0,0,0,0.04)',
                            }}>
                                <Search size={14} style={{ color: searchFocused ? meta.color : 'var(--text-muted)', flexShrink: 0, transition: 'color 0.2s' }} />
                                <input ref={searchInputRef} style={S.searchInput}
                                    placeholder="搜索条目…" value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={() => setSearchFocused(false)}
                                />
                            </div>
                        </div>

                        <ItemList
                            nodes={nodes} rootFolder={rootFolder} category={category}
                            selectedId={selectedNodeId} onSelect={setSelectedNodeId}
                            onAddFolder={handleAddFolder} onAddItem={handleAddItem}
                            onRename={handleRenameNode} onChangeIcon={handleChangeIcon}
                            onDelete={handleDeleteNode}
                            onToggleEnabled={async (id) => {
                                const node = nodes.find(n => n.id === id);
                                if (!node) return;
                                const newEnabled = node.enabled === false ? true : false;
                                await updateSettingsNode(id, { enabled: newEnabled });
                                setNodes(prev => prev.map(n => n.id === id ? { ...n, enabled: newEnabled } : n));
                            }}
                            onReorder={async (draggedId, targetId, position) => {
                                const dragged = nodes.find(n => n.id === draggedId);
                                const target = nodes.find(n => n.id === targetId);
                                if (!dragged || !target) return;
                                let newParentId, newOrder;
                                if (position === 'inside' && target.type === 'folder') {
                                    // 放入文件夹内部
                                    newParentId = target.id;
                                    const siblings = nodes.filter(n => n.parentId === target.id);
                                    newOrder = siblings.length;
                                } else {
                                    // before/after：放到同级
                                    newParentId = target.parentId;
                                    const siblings = nodes.filter(n => n.parentId === target.parentId && n.id !== draggedId)
                                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                                    const targetIdx = siblings.findIndex(n => n.id === targetId);
                                    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
                                    // 重新编号
                                    const reordered = [...siblings];
                                    reordered.splice(insertIdx, 0, { ...dragged, parentId: newParentId });
                                    const updatedNodes = nodes.map(n => {
                                        if (n.id === draggedId) return { ...n, parentId: newParentId, order: insertIdx, updatedAt: new Date().toISOString() };
                                        const idx = reordered.findIndex(r => r.id === n.id);
                                        if (idx !== -1 && n.order !== idx) return { ...n, order: idx };
                                        return n;
                                    });
                                    setNodes(updatedNodes);
                                    await saveSettingsNodes(updatedNodes);
                                    return;
                                }
                                const updatedNodes = nodes.map(n => {
                                    if (n.id === draggedId) return { ...n, parentId: newParentId, order: newOrder, updatedAt: new Date().toISOString() };
                                    return n;
                                });
                                setNodes(updatedNodes);
                                await saveSettingsNodes(updatedNodes);
                            }}
                            searchQuery={searchQuery}
                        />

                        {/* 底部工具栏 */}
                        <div style={S.footer}>
                            <button style={{ ...S.footerPrimaryBtn, background: meta.color, boxShadow: `0 4px 12px ${meta.color}40` }}
                                onClick={() => setShowAddMenu(!showAddMenu)}
                                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none'; }}
                            >
                                <Plus size={14} /> 新建
                                <ChevronDown size={11} style={{ marginLeft: 2 }} />
                            </button>
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted, #9ca3af)', fontWeight: 500, letterSpacing: '0.03em', marginLeft: 4 }}>{itemCount} 个条目</span>
                            {selectedNodeId && (
                                <button style={{ ...S.footerBtn, marginLeft: 'auto' }}
                                    onClick={() => handleDeleteNode(selectedNodeId)} title="删除选中"
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-card, #fff)'; }}
                                >
                                    <Trash2 size={13} /> 删除
                                </button>
                            )}
                            {showAddMenu && (
                                <AddMenu
                                    onAddFolder={() => handleAddFolder(selectedNodeId)}
                                    onAddItem={() => handleAddItem(selectedNodeId)}
                                    onClose={() => setShowAddMenu(false)}
                                    catColor={meta.color}
                                    catBg={meta.bg}
                                />
                            )}
                        </div>
                    </div>

                    {/* 右侧编辑器 */}
                    <div style={S.editor}>
                        {/* 剧情曲线图 — 仅 plot 分类展示 */}
                        {category === 'plot' && <PlotCurveChart nodes={nodes} rootFolder={rootFolder} onSave={async (curveData) => {
                            if (!rootFolder) return;
                            const updated = { ...rootFolder.content, plotCurve: curveData };
                            await updateSettingsNode(rootFolder.id, { content: updated });
                            setNodes(prev => prev.map(n => n.id === rootFolder.id ? { ...n, content: updated } : n));
                        }} />}
                        <SettingsItemEditor
                            selectedNode={selectedNode}
                            allNodes={nodes}
                            onUpdate={handleUpdateNode}
                            onSelect={setSelectedNodeId}
                            onAdd={(parentId, cat) => handleAddItem(parentId)}
                        />
                    </div>
                </div>
            </div>

            {deleteConfirm && (
                <DeleteConfirmDialog
                    message={deleteConfirm.message}
                    onConfirm={deleteConfirm.onConfirm}
                    onCancel={deleteConfirm.onCancel}
                />
            )}
        </div>,
        document.body
    );
}
