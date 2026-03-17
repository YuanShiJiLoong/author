'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { getSettingsNodes, updateSettingsNode, getActiveWorkId, getAllWorks } from '../lib/settings';
import {
    X, Maximize2, Minimize2, BookOpen, Users, MapPin, Globe, Gem, ClipboardList, Ruler,
    Layers, Clock, ChevronRight, FileText, Settings as SettingsIcon,
    Plus, Check, Circle, Trash2, Target
} from 'lucide-react';

// 分类图标映射
const CAT_ICONS = {
    character: Users, location: MapPin, world: Globe, object: Gem,
    plot: ClipboardList, rules: Ruler, custom: SettingsIcon,
};

// 分类颜色 — 复用 CSS 变量值
const CAT_COLORS = {
    character: { color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
    location: { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    world: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
    object: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    plot: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    rules: { color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
    custom: { color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
};

// FieldInput 组件
function FieldInput({ label, value, onChange, placeholder, multiline, rows }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {label}
            </label>
            {multiline ? (
                <textarea
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={rows || 3}
                    style={{
                        width: '100%', padding: '10px 14px', border: '1.5px solid var(--border-light)',
                        borderRadius: 12, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                        fontSize: 14, lineHeight: 1.6, resize: 'vertical', outline: 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s', fontFamily: 'inherit',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-light, rgba(99,102,241,0.12))'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border-light)'; e.target.style.boxShadow = 'none'; }}
                />
            ) : (
                <input
                    type="text"
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    style={{
                        width: '100%', padding: '10px 14px', border: '1.5px solid var(--border-light)',
                        borderRadius: 12, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                        fontSize: 14, outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-light, rgba(99,102,241,0.12))'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border-light)'; e.target.style.boxShadow = 'none'; }}
                />
            )}
        </div>
    );
}

// SVG Activity Chart — 按时间窗口统计字数
// 时=60分钟, 天=24时, 周=7天, 月=30天, 季=3月, 年=12月
function ActivityChart({ chapters, period = 'day' }) {
    const data = useMemo(() => {
        const now = Date.now();
        const realChapters = (chapters || [])
            .filter(c => (c.type || 'chapter') !== 'volume' && (c.updatedAt || c.createdAt))
            .map(c => ({ ts: new Date(c.updatedAt || c.createdAt).getTime(), words: c.wordCount || 0 }))
            .filter(c => !isNaN(c.ts));

        // 每种period的配置: slots数量, 每slot毫秒数, label格式
        const cfg = {
            hour:    { slots: 60, stepMs: 60000,     label: (d) => `${d.getMinutes()}分` },
            day:     { slots: 24, stepMs: 3600000,   label: (d) => `${d.getHours()}:00` },
            week:    { slots: 7,  stepMs: 86400000,  label: (d) => `${['日','一','二','三','四','五','六'][d.getDay()]}` },
            month:   { slots: 30, stepMs: 86400000,  label: (d) => `${d.getMonth()+1}/${d.getDate()}` },
            quarter: { slots: 3,  stepMs: 0,         label: (d) => `${d.getMonth()+1}月` },
            year:    { slots: 12, stepMs: 0,          label: (d) => `${d.getMonth()+1}月` },
        };
        const c = cfg[period] || cfg.day;

        // 生成时间slots（从 now 往前推）
        const slots = [];
        for (let i = c.slots - 1; i >= 0; i--) {
            let slotStart, slotEnd;
            if (period === 'quarter') {
                // 季度：3个月slot
                const ref = new Date(now);
                ref.setMonth(ref.getMonth() - i, 1);
                ref.setHours(0, 0, 0, 0);
                slotStart = ref.getTime();
                const end = new Date(ref);
                end.setMonth(end.getMonth() + 1);
                slotEnd = end.getTime();
            } else if (period === 'year') {
                // 年：12个月slot
                const ref = new Date(now);
                ref.setMonth(ref.getMonth() - i, 1);
                ref.setHours(0, 0, 0, 0);
                slotStart = ref.getTime();
                const end = new Date(ref);
                end.setMonth(end.getMonth() + 1);
                slotEnd = end.getTime();
            } else {
                // 固定步长
                slotEnd = now - i * c.stepMs;
                slotStart = slotEnd - c.stepMs;
            }
            const d = new Date(period === 'quarter' || period === 'year' ? slotStart : slotEnd);
            const wordsInSlot = realChapters
                .filter(ch => ch.ts >= slotStart && ch.ts < slotEnd)
                .reduce((s, ch) => s + ch.words, 0);
            slots.push({ label: c.label(d), value: wordsInSlot });
        }
        return slots;
    }, [chapters, period]);

    if (data.length < 1) {
        return (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                暂无写作数据
            </div>
        );
    }

    const chartData = data.length === 1 ? [{ label: '', value: 0 }, ...data] : data;
    const W = 580, H = 220, PX = 45, PY = 24;
    const maxVal = Math.max(...chartData.map(d => d.value), 1);
    const points = chartData.map((d, i) => ({
        x: PX + (i / (chartData.length - 1)) * (W - PX * 2),
        y: PY + (1 - d.value / maxVal) * (H - PY * 2),
    }));

    const smoothPath = points.reduce((acc, p, i, arr) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = arr[i - 1];
        const cpx = (prev.x + p.x) / 2;
        return `${acc} C ${cpx} ${prev.y}, ${cpx} ${p.y}, ${p.x} ${p.y}`;
    }, '');
    const areaPath = `${smoothPath} L ${points[points.length - 1].x} ${H - PY} L ${points[0].x} ${H - PY} Z`;
    const fmtVal = (v) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : v >= 1000 ? `${(v/1000).toFixed(1)}k` : v > 0 ? v : '';
    const maxLabels = 10;
    const labelStep = Math.max(1, Math.ceil(chartData.length / maxLabels));

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 240 }}>
            <defs>
                <linearGradient id="bookinfo-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent, #6366f1)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--accent, #6366f1)" stopOpacity="0.01" />
                </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
                const y = PY + r * (H - PY * 2);
                const val = Math.round(maxVal * (1 - r));
                return (
                    <g key={i}>
                        <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="var(--border-light)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                        <text x={PX - 6} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize="8.5">{fmtVal(val)}</text>
                    </g>
                );
            })}
            <path d={areaPath} fill="url(#bookinfo-area-grad)" />
            <path d={smoothPath} fill="none" stroke="var(--accent, #6366f1)" strokeWidth="2.5" strokeLinecap="round" />
            {points.map((p, i) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r="3.5" fill="var(--bg-primary)" stroke="var(--accent, #6366f1)" strokeWidth="2" />
                    <title>{chartData[i].label}: {chartData[i].value.toLocaleString()}字</title>
                </g>
            ))}
            {points.map((p, i) => (
                i % labelStep === 0 || i === chartData.length - 1 ? (
                    <text key={`l-${i}`} x={p.x} y={H - 3} textAnchor="middle" fill="var(--text-muted)" fontSize="8.5">
                        {chartData[i].label}
                    </text>
                ) : null
            ))}
        </svg>
    );
}

// 统计卡片 — 紧凑数字格式
function fmtStatValue(v) {
    if (typeof v === 'string') {
        const n = Number(v.replace(/,/g, ''));
        if (!isNaN(n)) v = n; else return v;
    }
    if (typeof v !== 'number') return v;
    if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return v.toLocaleString();
}

function StatCard({ label, value, icon: Icon, color, bg, onClick }) {
    const displayValue = fmtStatValue(value);
    return (
        <div style={{
            padding: '14px 16px', borderRadius: 14,
            border: '1px solid var(--border-light)', background: 'var(--bg-primary)',
            transition: 'all 0.2s', cursor: onClick ? 'pointer' : 'default',
        }}
            onClick={onClick}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
                    <Icon size={16} />
                </div>
                <span style={{
                    fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                }}>{displayValue}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>{label}</p>
        </div>
    );
}

export default function BookInfoPanel() {
    const { t } = useI18n();
    const { showBookInfo, setShowBookInfo, settingsVersion, incrementSettingsVersion, chapters } = useAppStore();
    const [isFullscreen, setIsFullscreen] = useState(true);
    const [nodes, setNodes] = useState([]);
    const [bookInfoNode, setBookInfoNode] = useState(null);
    const [bookData, setBookData] = useState({});
    const [workName, setWorkName] = useState('');
    const [goals, setGoals] = useState([]);
    const [newGoalText, setNewGoalText] = useState('');
    const [chartPeriod, setChartPeriod] = useState('day');

    // 加载数据
    useEffect(() => {
        if (!showBookInfo) return;
        (async () => {
            const workId = getActiveWorkId();
            if (!workId) return;
            const allNodes = await getSettingsNodes(workId);
            setNodes(allNodes);
            const biNode = allNodes.find(n => n.category === 'bookInfo' && n.type === 'special');
            setBookInfoNode(biNode || null);
            setBookData(biNode?.content || {});
            setGoals(biNode?.content?.goals || []);
            // 获取作品名
            const works = await getAllWorks();
            const work = works.find(w => w.id === workId);
            setWorkName(work?.name || '');
        })();
    }, [showBookInfo, settingsVersion]);

    // 保存表单数据
    const handleFieldChange = useCallback((field, value) => {
        setBookData(prev => {
            const next = { ...prev, [field]: value };
            // 异步保存
            if (bookInfoNode) {
                updateSettingsNode(bookInfoNode.id, { content: next }, nodes.map(n => n.id === bookInfoNode.id ? { ...n, content: next } : n));
                incrementSettingsVersion();
            }
            return next;
        });
    }, [bookInfoNode, nodes, incrementSettingsVersion]);

    // 统计数据
    const stats = useMemo(() => {
        const builtInCats = new Set(['character', 'location', 'world', 'object', 'plot', 'rules', 'bookInfo']);
        const workId = getActiveWorkId();
        
        // Build parent lookup for tracing items to root folders
        const nodeMap = {};
        nodes.forEach(n => { nodeMap[n.id] = n; });
        
        // Find root-level custom folders
        const customFolders = nodes.filter(n =>
            (n.type === 'folder' || n.type === 'special') && n.parentId === workId && !builtInCats.has(n.category)
        );
        
        const catCounts = {};
        const customFolderLabels = {}; // custom__id → folder name
        customFolders.forEach(f => {
            const key = `custom__${f.id}`;
            catCounts[key] = 0;
            customFolderLabels[key] = f.name || '自定义';
        });
        
        // Helper: trace an item to its root folder
        const getRootFolderId = (node) => {
            let cur = node;
            while (cur && cur.parentId && cur.parentId !== workId) {
                cur = nodeMap[cur.parentId];
            }
            return cur?.id;
        };
        
        const recentItems = [];
        nodes.forEach(n => {
            if (n.type === 'item' && n.category !== 'bookInfo') {
                if (builtInCats.has(n.category)) {
                    catCounts[n.category] = (catCounts[n.category] || 0) + 1;
                } else {
                    // Custom item: trace to root folder
                    const rootId = getRootFolderId(n);
                    const key = `custom__${rootId}`;
                    if (key in catCounts) {
                        catCounts[key] = (catCounts[key] || 0) + 1;
                    } else {
                        catCounts['custom'] = (catCounts['custom'] || 0) + 1;
                    }
                }
                recentItems.push(n);
            }
        });
        recentItems.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        const totalItems = Object.values(catCounts).reduce((s, v) => s + v, 0);
        const totalWords = Array.isArray(chapters)
            ? chapters.filter(c => (c.type || 'chapter') !== 'volume').reduce((s, c) => s + (c.wordCount || 0), 0)
            : 0;
        const chapterCount = Array.isArray(chapters)
            ? chapters.filter(c => (c.type || 'chapter') !== 'volume').length
            : 0;
        // 最近编辑的章节
        const recentChapters = Array.isArray(chapters)
            ? chapters.filter(c => (c.type || 'chapter') !== 'volume')
                .map(c => ({ ...c }))
                .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
                .slice(0, 5)
            : [];
        // Build ordered entries: built-in first, then custom
        const builtInOrder = ['character', 'location', 'world', 'object', 'plot', 'rules'];
        const orderedCatEntries = [];
        builtInOrder.forEach(cat => {
            if (cat in catCounts) orderedCatEntries.push({ key: cat, count: catCounts[cat] });
        });
        // Add remaining built-in keys not in the predefined order
        Object.keys(catCounts).forEach(cat => {
            if (!cat.startsWith('custom__') && !builtInOrder.includes(cat)) {
                orderedCatEntries.push({ key: cat, count: catCounts[cat] });
            }
        });
        // Then custom folders
        customFolders.forEach(f => {
            const key = `custom__${f.id}`;
            orderedCatEntries.push({ key, count: catCounts[key] || 0 });
        });
        return { catCounts, customFolderLabels, orderedCatEntries, recentItems: recentItems.slice(0, 5), totalItems, totalWords, chapterCount, recentChapters };
    }, [nodes, chapters]);

    if (!showBookInfo) return null;

    const onClose = () => setShowBookInfo(false);

    // 时间展示
    const timeAgo = (dateStr) => {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return '刚刚';
        if (mins < 60) return `${mins}分钟前`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}小时前`;
        const days = Math.floor(hrs / 24);
        return `${days}天前`;
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9998,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            }}
            onMouseDown={e => { e.currentTarget._md = e.target; }}
            onClick={e => { if (e.currentTarget._md === e.currentTarget) onClose(); }}
        >
            <div
                style={{
                    width: isFullscreen ? '100%' : '90%', height: isFullscreen ? '100%' : '90%',
                    maxWidth: isFullscreen ? '100%' : 1200, maxHeight: isFullscreen ? '100%' : '90vh',
                    background: 'var(--bg-primary)', borderRadius: isFullscreen ? 0 : 20,
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    boxShadow: isFullscreen ? 'none' : '0 20px 60px rgba(0,0,0,0.2)',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 24px', borderBottom: '1px solid var(--border-light)',
                    background: 'var(--bg-secondary)', flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: 'linear-gradient(135deg, var(--accent, #6366f1), #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                        }}>
                            <BookOpen size={20} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {bookData.title || workName || t('bookInfo.title') || '作品信息'}
                            </h2>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                                {t('bookInfo.intro') || '填写作品基本信息，AI创作时自动作为上下文参考'}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? '窗口化' : '全屏'}>
                            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
                    </div>
                </div>

                {/* Content — 左右两栏 */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                    {/* 左侧：表单 */}
                    <div style={{
                        width: 420, minWidth: 360, flexShrink: 0,
                        padding: '28px 28px', overflowY: 'auto',
                        borderRight: '1px solid var(--border-light)',
                    }}>
                        <div style={{ marginBottom: 20 }}>
                            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FileText size={16} style={{ color: 'var(--accent)' }} />
                                基本信息
                            </h3>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                                这些信息将作为AI创作的核心上下文
                            </p>
                        </div>

                        <FieldInput label={t('bookInfo.title') || '书名'} value={bookData.title} onChange={v => handleFieldChange('title', v)} placeholder={t('bookInfo.titlePlaceholder') || '作品名称'} />
                        <FieldInput label={t('bookInfo.genre') || '题材'} value={bookData.genre} onChange={v => handleFieldChange('genre', v)} placeholder={t('bookInfo.genrePlaceholder') || '例：都市/玄幻/悬疑'} />
                        <FieldInput label={t('bookInfo.synopsis') || '故事简介'} value={bookData.synopsis} onChange={v => handleFieldChange('synopsis', v)} placeholder={t('bookInfo.synopsisPlaceholder') || '用几句话概括你的故事核心'} multiline rows={4} />
                        <FieldInput label={t('bookInfo.style') || '写作风格'} value={bookData.style} onChange={v => handleFieldChange('style', v)} placeholder={t('bookInfo.stylePlaceholder') || '例：轻松幽默/严肃沉重'} />
                        <FieldInput label={t('bookInfo.tone') || '整体基调'} value={bookData.tone} onChange={v => handleFieldChange('tone', v)} placeholder={t('bookInfo.tonePlaceholder') || '例：热血/温馨/黑暗'} />
                        <FieldInput label={t('bookInfo.pov') || '叙事视角'} value={bookData.pov} onChange={v => handleFieldChange('pov', v)} placeholder={t('bookInfo.povPlaceholder') || '例：第一人称/第三人称/全知'} />
                        <FieldInput label={t('bookInfo.targetAudience') || '目标读者'} value={bookData.targetAudience} onChange={v => handleFieldChange('targetAudience', v)} placeholder={t('bookInfo.targetAudiencePlaceholder') || '例：男频18-30/女频青年'} />
                    </div>

                    {/* 右侧：仪表盘 */}
                    <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', background: 'var(--bg-secondary)' }}>

                        {/* 统计卡片 */}
                        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Layers size={16} style={{ color: 'var(--accent)' }} />
                            创作概览
                        </h3>
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                            gap: 12, marginBottom: 28,
                        }}>
                            <StatCard label="总设定条目" value={stats.totalItems} icon={Layers} color="#6366f1" bg="rgba(99,102,241,0.1)" onClick={() => { setShowBookInfo(false); setTimeout(() => useAppStore.getState().setShowSettings('settings'), 80); }} />
                            <StatCard label="总字数" value={stats.totalWords.toLocaleString()} icon={FileText} color="#10b981" bg="rgba(16,185,129,0.1)" />
                            <StatCard label="章节数" value={stats.chapterCount} icon={BookOpen} color="#8b5cf6" bg="rgba(139,92,246,0.1)" />
                            {stats.orderedCatEntries.map(({ key: cat, count }) => {
                                const isCustomFolder = cat.startsWith('custom__');
                                const Icon = isCustomFolder ? SettingsIcon : (CAT_ICONS[cat] || SettingsIcon);
                                const c = isCustomFolder ? CAT_COLORS.custom : (CAT_COLORS[cat] || CAT_COLORS.custom);
                                const builtInLabels = { character: '人物', location: '地点', world: '世界观', object: '物品', plot: '大纲', rules: '规则', custom: '自定义', bookInfo: '作品信息' };
                                const label = isCustomFolder ? (stats.customFolderLabels[cat] || '自定义') : (builtInLabels[cat] || cat);
                                const handleClick = () => {
                                    setShowBookInfo(false);
                                    setTimeout(() => {
                                        const realCat = isCustomFolder ? 'custom' : cat;
                                        useAppStore.getState().setOpenCategoryModal(realCat);
                                    }, 80);
                                };
                                return (
                                    <StatCard key={cat} label={label} value={count} icon={Icon} color={c.color} bg={c.bg} onClick={handleClick} />
                                );
                            })}
                            {/* 新建分类 */}
                            <div
                                style={{
                                    padding: '14px 16px', borderRadius: 14,
                                    border: '1.5px dashed var(--border-medium, #d1d5db)', background: 'transparent',
                                    transition: 'all 0.2s', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 4,
                                }}
                                onClick={() => { setShowBookInfo(false); setTimeout(() => useAppStore.getState().setShowSettings('settings'), 80); }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent, #6366f1)'; e.currentTarget.style.background = 'rgba(99,102,241,0.04)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-medium, #d1d5db)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'none'; }}
                            >
                                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                    <Plus size={16} />
                                </div>
                                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>新建分类</p>
                            </div>
                        </div>

                        {/* 创作热度曲线 */}
                        <div style={{
                            background: 'var(--bg-primary)', borderRadius: 16,
                            border: '1px solid var(--border-light)', padding: '20px 24px', marginBottom: 28,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    创作热度
                                </h4>
                                <div style={{ display: 'flex', gap: 3 }}>
                                    {[{ v: 'hour', l: '时' }, { v: 'day', l: '天' }, { v: 'week', l: '周' }, { v: 'month', l: '月' }, { v: 'quarter', l: '季' }, { v: 'year', l: '年' }].map(opt => (
                                        <button key={opt.v} onClick={() => setChartPeriod(opt.v)} style={{
                                            padding: '3px 7px', border: 'none', borderRadius: 6, cursor: 'pointer',
                                            fontSize: 11, fontWeight: chartPeriod === opt.v ? 600 : 400,
                                            background: chartPeriod === opt.v ? 'var(--accent, #6366f1)' : 'var(--bg-secondary)',
                                            color: chartPeriod === opt.v ? '#fff' : 'var(--text-muted)',
                                            transition: 'all 0.15s',
                                        }}>{opt.l}</button>
                                    ))}
                                </div>
                            </div>
                            <ActivityChart chapters={chapters} period={chartPeriod} />
                        </div>

                        {/* 最近编辑 + 最近章节 — 左右并排 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, gridAutoRows: '280px' }}>
                            {/* 最近编辑的设定 */}
                            <div style={{
                                background: 'var(--bg-primary)', borderRadius: 16,
                                border: '1px solid var(--border-light)', padding: '18px 20px',
                                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            }}>
                                <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock size={13} style={{ color: 'var(--accent)' }} />
                                    最近编辑
                                </h4>
                                {stats.recentItems.length === 0 ? (
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>暂无设定条目</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflowY: 'auto' }}>
                                        {stats.recentItems.map(item => {
                                            const Icon = CAT_ICONS[item.category] || FileText;
                                            const c = CAT_COLORS[item.category] || CAT_COLORS.custom;
                                            return (
                                                <div key={item.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    padding: '8px 12px', borderRadius: 10,
                                                    transition: 'background 0.15s', cursor: 'default',
                                                }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div style={{
                                                        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                                                        background: c.bg, color: c.color,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        <Icon size={13} />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.name}
                                                        </p>
                                                        <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                                                            {timeAgo(item.updatedAt)}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 创作目标 */}
                            <div style={{
                                background: 'var(--bg-primary)', borderRadius: 16,
                                border: '1px solid var(--border-light)', padding: '18px 20px',
                                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            }}>
                                <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Target size={13} style={{ color: '#8b5cf6' }} />
                                    创作目标
                                </h4>
                                {/* 添加目标 */}
                                <div style={{ display: 'flex', gap: 6, marginBottom: goals.length > 0 ? 10 : 0 }}>
                                    <input
                                        value={newGoalText}
                                        onChange={e => setNewGoalText(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && newGoalText.trim()) {
                                                const next = [...goals, { id: Date.now().toString(), text: newGoalText.trim(), done: false }];
                                                setGoals(next);
                                                setNewGoalText('');
                                                if (bookInfoNode) {
                                                    const updated = { ...bookData, goals: next };
                                                    updateSettingsNode(bookInfoNode.id, { content: updated });
                                                    setBookData(updated);
                                                }
                                            }
                                        }}
                                        placeholder="输入目标按回车添加…"
                                        style={{
                                            flex: 1, padding: '6px 10px', border: '1.5px solid var(--border-light)',
                                            borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                                            fontSize: 12, outline: 'none', transition: 'border-color 0.2s',
                                        }}
                                        onFocus={e => e.target.style.borderColor = '#8b5cf6'}
                                        onBlur={e => e.target.style.borderColor = 'var(--border-light)'}
                                    />
                                    <button
                                        onClick={() => {
                                            if (!newGoalText.trim()) return;
                                            const next = [...goals, { id: Date.now().toString(), text: newGoalText.trim(), done: false }];
                                            setGoals(next);
                                            setNewGoalText('');
                                            if (bookInfoNode) {
                                                const updated = { ...bookData, goals: next };
                                                updateSettingsNode(bookInfoNode.id, { content: updated });
                                                setBookData(updated);
                                            }
                                        }}
                                        style={{
                                            padding: '4px 8px', border: 'none', borderRadius: 8,
                                            background: '#8b5cf6', color: '#fff', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'filter 0.15s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                                        onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                {/* 目标列表 */}
                                {goals.length === 0 ? (
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0', margin: 0 }}>设定你的创作目标…</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
                                        {goals.map(goal => (
                                            <div key={goal.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '6px 8px', borderRadius: 8,
                                                transition: 'background 0.15s', cursor: 'pointer',
                                                opacity: goal.done ? 0.55 : 1,
                                            }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                onClick={() => {
                                                    const next = goals.map(g => g.id === goal.id ? { ...g, done: !g.done } : g);
                                                    setGoals(next);
                                                    if (bookInfoNode) {
                                                        const updated = { ...bookData, goals: next };
                                                        updateSettingsNode(bookInfoNode.id, { content: updated });
                                                        setBookData(updated);
                                                    }
                                                }}
                                            >
                                                {/* 勾选框 */}
                                                <div style={{
                                                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                                                    border: goal.done ? 'none' : '2px solid var(--border-light)',
                                                    background: goal.done ? '#8b5cf6' : 'transparent',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.2s',
                                                }}>
                                                    {goal.done && <Check size={12} style={{ color: '#fff' }} />}
                                                </div>
                                                <span style={{
                                                    flex: 1, fontSize: 12, color: 'var(--text-primary)',
                                                    textDecoration: goal.done ? 'line-through' : 'none',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                }}>
                                                    {goal.text}
                                                </span>
                                                {/* 删除 */}
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        const next = goals.filter(g => g.id !== goal.id);
                                                        setGoals(next);
                                                        if (bookInfoNode) {
                                                            const updated = { ...bookData, goals: next };
                                                            updateSettingsNode(bookInfoNode.id, { content: updated });
                                                            setBookData(updated);
                                                        }
                                                    }}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--text-muted)', padding: 2, borderRadius: 4,
                                                        opacity: 0, transition: 'opacity 0.15s, color 0.15s',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.opacity = '0'; }}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
