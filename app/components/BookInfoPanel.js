'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { getSettingsNodes, updateSettingsNode, deleteSettingsNode, saveSettingsNodes, getActiveWorkId, setActiveWorkId as setActiveWorkIdSetting, getAllWorks, getChatApiConfig, addWork, removeWork, addSettingsNode, renameWork } from '../lib/settings';
import { getChapters } from '../lib/storage';
import { createPortal } from 'react-dom';
import { promptInput } from '../lib/promptInput';
import {
    X, Maximize2, Minimize2, BookOpen, Users, MapPin, Globe, Gem, ClipboardList, Ruler,
    Layers, Clock, ChevronRight, FileText, Settings as SettingsIcon,
    Plus, Check, Circle, Trash2, Target, ImageIcon, Upload, Star, Sparkles, RefreshCw, Eye
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

// FieldInput 组件 — 非受控 input + ref 同步，完美支持 IME 中文输入
function FieldInput({ label, value, onChange, placeholder, multiline, rows }) {
    const editableRef = useRef(null);
    const inputRef = useRef(null);
    const isUserInput = useRef(false);
    const isComposingRef = useRef(false);

    // 外部 value 变化时，通过 ref 同步 DOM（不触发 React 重渲染）
    useEffect(() => {
        if (multiline && editableRef.current && !isUserInput.current) {
            const current = editableRef.current.innerText;
            if (current !== (value || '')) {
                editableRef.current.innerText = value || '';
            }
        }
        // 单行 input：仅在非 IME 组合时，通过 ref 同步外部值
        if (!multiline && inputRef.current && !isComposingRef.current) {
            if (inputRef.current.value !== (value || '')) {
                inputRef.current.value = value || '';
            }
        }
        isUserInput.current = false;
    }, [value, multiline]);

    const baseStyle = {
        width: '100%', padding: '10px 14px', border: '1.5px solid var(--border-light)',
        borderRadius: 12, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
        fontSize: 14, outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
        boxSizing: 'border-box',
    };
    const focusStyle = e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-light, rgba(99,102,241,0.12))'; };
    const blurStyle = e => { e.target.style.borderColor = 'var(--border-light)'; e.target.style.boxShadow = 'none'; };
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {label}
            </label>
            {multiline ? (
                <div
                    ref={editableRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={e => { isUserInput.current = true; onChange(e.currentTarget.innerText); }}
                    onFocus={focusStyle}
                    onBlur={blurStyle}
                    data-placeholder={placeholder}
                    style={{
                        ...baseStyle,
                        minHeight: (rows || 3) * 24 + 20,
                        lineHeight: 1.6,
                        fontFamily: 'inherit',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        overflowY: 'auto',
                    }}
                />
            ) : (
                <input
                    ref={inputRef}
                    type="text"
                    defaultValue={value || ''}
                    onChange={e => {
                        if (!isComposingRef.current) {
                            onChange(e.target.value);
                        }
                    }}
                    onCompositionStart={() => { isComposingRef.current = true; }}
                    onCompositionEnd={e => {
                        isComposingRef.current = false;
                        onChange(e.target.value);
                    }}
                    placeholder={placeholder}
                    style={baseStyle}
                    onFocus={focusStyle}
                    onBlur={e => {
                        if (isComposingRef.current) {
                            isComposingRef.current = false;
                            onChange(e.target.value);
                        }
                        blurStyle(e);
                    }}
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

function StatCard({ label, value, icon: Icon, color, bg, onClick, onDelete }) {
    const displayValue = fmtStatValue(value);
    return (
        <div style={{
            padding: '14px 16px', borderRadius: 14,
            border: '1px solid var(--border-light)', background: 'var(--bg-primary)',
            transition: 'all 0.2s', cursor: onClick ? 'pointer' : 'default',
            position: 'relative',
        }}
            onClick={onClick}
            onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                const del = e.currentTarget.querySelector('[data-del]');
                if (del) del.style.opacity = '1';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'none';
                const del = e.currentTarget.querySelector('[data-del]');
                if (del) del.style.opacity = '0';
            }}
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
            {onDelete && (
                <span
                    data-del
                    title="删除"
                    onClick={e => { e.stopPropagation(); onDelete(); }}
                    style={{
                        width: 24, height: 24, borderRadius: 7,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)', background: 'transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                        opacity: 0,
                        position: 'absolute', right: 12, bottom: 10,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                >
                    <Trash2 size={14} />
                </span>
            )}
        </div>
    );
}

// ===== 图片裁剪器 =====
const COVER_RATIO = 5 / 7; // 封面宽高比
function ImageCropper({ imageSrc, onConfirm, onCancel }) {
    const containerRef = useRef(null);
    const imgRef = useRef(null);
    const [imgSize, setImgSize] = useState({ w: 0, h: 0, naturalW: 0, naturalH: 0 });
    const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const dragRef = useRef(null);

    // 图片加载后初始化裁剪框
    const onImgLoad = useCallback(() => {
        const img = imgRef.current;
        if (!img) return;
        const displayW = img.clientWidth, displayH = img.clientHeight;
        setImgSize({ w: displayW, h: displayH, naturalW: img.naturalWidth, naturalH: img.naturalHeight });
        // 初始裁剪框居中，尽可能大
        let cropH = displayH * 0.85, cropW = cropH * COVER_RATIO;
        if (cropW > displayW * 0.85) { cropW = displayW * 0.85; cropH = cropW / COVER_RATIO; }
        setCrop({ x: (displayW - cropW) / 2, y: (displayH - cropH) / 2, w: cropW, h: cropH });
    }, []);

    // 拖动 & 缩放逻辑
    const startDrag = (e, mode) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const startCrop = { ...crop };
        const onMove = (ev) => {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            setCrop(prev => {
                let { x, y, w, h } = startCrop;
                if (mode === 'move') {
                    x = Math.max(0, Math.min(imgSize.w - w, x + dx));
                    y = Math.max(0, Math.min(imgSize.h - h, y + dy));
                } else {
                    // corner resize — 保持比例
                    let newW = w, newH = h, newX = x, newY = y;
                    if (mode.includes('r')) newW = Math.max(40, w + dx);
                    if (mode.includes('l')) { newW = Math.max(40, w - dx); newX = x + (w - newW); }
                    if (mode.includes('b')) newH = Math.max(40, h + dy);
                    if (mode.includes('t')) { newH = Math.max(40, h - dy); newY = y + (h - newH); }
                    // 锁定比例
                    if (mode.includes('r') || mode.includes('l')) { newH = newW / COVER_RATIO; }
                    else { newW = newH * COVER_RATIO; }
                    // 边界限制
                    if (newX < 0) { newW += newX; newX = 0; newH = newW / COVER_RATIO; }
                    if (newY < 0) { newH += newY; newY = 0; newW = newH * COVER_RATIO; }
                    if (newX + newW > imgSize.w) { newW = imgSize.w - newX; newH = newW / COVER_RATIO; }
                    if (newY + newH > imgSize.h) { newH = imgSize.h - newY; newW = newH * COVER_RATIO; }
                    x = newX; y = newY; w = newW; h = newH;
                }
                return { x, y, w, h };
            });
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const handleConfirm = () => {
        const canvas = document.createElement('canvas');
        const scaleX = imgSize.naturalW / imgSize.w, scaleY = imgSize.naturalH / imgSize.h;
        canvas.width = 560; canvas.height = 784; // 输出 5:7
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgRef.current, crop.x * scaleX, crop.y * scaleY, crop.w * scaleX, crop.h * scaleY, 0, 0, 560, 784);
        onConfirm(canvas.toDataURL('image/jpeg', 0.92));
    };

    const handleStyle = (cursor) => ({
        position: 'absolute', width: 14, height: 14, background: '#fff',
        border: '2px solid var(--accent, #6366f1)', borderRadius: 3,
        cursor, zIndex: 3, transform: 'translate(-50%, -50%)',
    });

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={onCancel}
        >
            <div style={{ background: 'var(--bg-primary)', borderRadius: 16, padding: 24, maxWidth: '80vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>裁剪封面</h3>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>拖动选框调整区域，拖动角点缩放</span>
                </div>
                <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', maxHeight: '65vh', overflow: 'hidden', borderRadius: 8, lineHeight: 0 }}>
                    <img ref={imgRef} src={imageSrc} onLoad={onImgLoad}
                        style={{ maxWidth: '70vw', maxHeight: '65vh', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
                        draggable={false}
                    />
                    {imgSize.w > 0 && (
                        <>
                            {/* 暗色遮罩 */}
                            <svg style={{ position: 'absolute', inset: 0, width: imgSize.w, height: imgSize.h, pointerEvents: 'none', zIndex: 1 }}>
                                <defs><mask id="cropMask">
                                    <rect x="0" y="0" width={imgSize.w} height={imgSize.h} fill="white" />
                                    <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="black" rx="4" />
                                </mask></defs>
                                <rect x="0" y="0" width={imgSize.w} height={imgSize.h} fill="rgba(0,0,0,0.55)" mask="url(#cropMask)" />
                            </svg>
                            {/* 裁剪框 */}
                            <div style={{
                                position: 'absolute', left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                                border: '2px solid var(--accent, #6366f1)', borderRadius: 4,
                                cursor: 'move', zIndex: 2, boxShadow: '0 0 0 1px rgba(255,255,255,0.3)',
                            }} onMouseDown={e => startDrag(e, 'move')}>
                                {/* 三分线 */}
                                <div style={{ position: 'absolute', left: '33.3%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(255,255,255,0.3)' }} />
                                <div style={{ position: 'absolute', left: '66.6%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(255,255,255,0.3)' }} />
                                <div style={{ position: 'absolute', top: '33.3%', left: 0, right: 0, borderTop: '1px dashed rgba(255,255,255,0.3)' }} />
                                <div style={{ position: 'absolute', top: '66.6%', left: 0, right: 0, borderTop: '1px dashed rgba(255,255,255,0.3)' }} />
                            </div>
                            {/* 角点手柄 */}
                            <div style={{ ...handleStyle('nw-resize'), left: crop.x, top: crop.y, zIndex: 4 }} onMouseDown={e => startDrag(e, 'lt')} />
                            <div style={{ ...handleStyle('ne-resize'), left: crop.x + crop.w, top: crop.y, zIndex: 4 }} onMouseDown={e => startDrag(e, 'rt')} />
                            <div style={{ ...handleStyle('sw-resize'), left: crop.x, top: crop.y + crop.h, zIndex: 4 }} onMouseDown={e => startDrag(e, 'lb')} />
                            <div style={{ ...handleStyle('se-resize'), left: crop.x + crop.w, top: crop.y + crop.h, zIndex: 4 }} onMouseDown={e => startDrag(e, 'rb')} />
                        </>
                    )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button onClick={onCancel} style={{ padding: '8px 20px', border: '1px solid var(--border-light)', borderRadius: 8, background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>取消</button>
                    <button onClick={handleConfirm} style={{ padding: '8px 20px', border: 'none', borderRadius: 8, background: 'var(--accent, #6366f1)', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600, boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>确认裁剪</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default function BookInfoPanel() {
    const { t } = useI18n();
    const { showBookInfo, setShowBookInfo, settingsVersion, incrementSettingsVersion, chapters } = useAppStore();
    const [isFullscreen, setIsFullscreen] = useState(true);
    const [nodes, setNodes] = useState([]);
    const [selectedChapters, setSelectedChapters] = useState([]);
    const [bookInfoNode, setBookInfoNode] = useState(null);
    const [bookData, setBookData] = useState({});
    const [workName, setWorkName] = useState('');
    const [goals, setGoals] = useState([]);
    const [newGoalText, setNewGoalText] = useState('');
    const [chartPeriod, setChartPeriod] = useState('day');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [works, setWorks] = useState([]);
    const [selectedWorkId, setSelectedWorkId] = useState(null);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'info'
    const coverInputRef = useRef(null);
    const [cropperSrc, setCropperSrc] = useState(null); // 裁剪器图片源
    const [aiEval, setAiEval] = useState(null); // AI评价结果
    const [aiEvalLoading, setAiEvalLoading] = useState(false);
    const skipWorksReloadRef = useRef(false); // 防止标题编辑触发 useEffect 重载

    // 检查是否跳过删除确认（与 SettingsPanel 共用同一套 localStorage Key）
    const shouldSkipDeleteConfirm = () => {
        try {
            if (localStorage.getItem('author-delete-never-remind') === 'true') return true;
            const skipDate = localStorage.getItem('author-delete-skip-today');
            if (skipDate && skipDate === new Date().toISOString().slice(0, 10)) return true;
        } catch { /* ignore */ }
        return false;
    };

    // 删除分类
    const handleDeleteCat = (catKey, catLabel, count, isCustomFolder, rootFolderId) => {
        if (shouldSkipDeleteConfirm()) {
            doDeleteCat(catKey, isCustomFolder, rootFolderId);
            return;
        }
        const message = isCustomFolder
            ? `确认删除分类「${catLabel}」及其下所有 ${count} 条设定？此操作不可撤销。`
            : `确认清空「${catLabel}」下的所有 ${count} 条设定？分类本身会保留，此操作不可撤销。`;
        setDeleteConfirm({
            message,
            onConfirm: async () => { setDeleteConfirm(null); await doDeleteCat(catKey, isCustomFolder, rootFolderId); },
            onCancel: () => setDeleteConfirm(null),
        });
    };

    const doDeleteCat = async (catKey, isCustomFolder, rootFolderId) => {
        const workId = getActiveWorkId();
        if (isCustomFolder && rootFolderId) {
            await deleteSettingsNode(rootFolderId);
        } else if (rootFolderId) {
            // 内置分类：仅清空 item 节点
            const toDelete = new Set();
            const collectItems = (pid) => {
                nodes.filter(n => n.parentId === pid).forEach(child => {
                    if (child.type === 'item') toDelete.add(child.id);
                    else collectItems(child.id);
                });
            };
            collectItems(rootFolderId);
            if (toDelete.size > 0) {
                const updatedNodes = nodes.filter(n => !toDelete.has(n.id));
                await saveSettingsNodes(updatedNodes, workId);
                setNodes(updatedNodes);
                incrementSettingsVersion();
                return;
            }
        }
        const refreshed = await getSettingsNodes(workId);
        setNodes(refreshed);
        incrementSettingsVersion();
    };

    // 加载作品列表
    useEffect(() => {
        if (!showBookInfo) return;
        (async () => {
            const allWorks = await getAllWorks();
            setWorks(allWorks);
            const activeId = getActiveWorkId();
            setSelectedWorkId(activeId || (allWorks[0]?.id ?? null));
        })();
    }, [showBookInfo]);

    // 加载选中作品的数据
    useEffect(() => {
        if (!showBookInfo || !selectedWorkId) return;
        // 标题编辑导致 works 变化时，跳过重载（避免覆盖用户输入）
        if (skipWorksReloadRef.current) {
            skipWorksReloadRef.current = false;
            return;
        }
        (async () => {
            const allNodes = await getSettingsNodes(selectedWorkId);
            setNodes(allNodes);
            // 加载选中作品的章节数据（非全局活跃作品）
            const workChapters = await getChapters(selectedWorkId);
            setSelectedChapters(workChapters);
            const biNode = allNodes.find(n => n.category === 'bookInfo' && n.type === 'special');
            setBookInfoNode(biNode || null);
            const rawData = biNode?.content || {};
            const work = works.find(w => w.id === selectedWorkId);
            const data = {
                ...rawData,
                title: rawData.title || work?.name || '',
            };
            const infoTitle = rawData.title?.trim();
            if (infoTitle && work?.name !== infoTitle) {
                setWorks(prev => prev.map(w => w.id === selectedWorkId ? { ...w, name: infoTitle } : w));
                renameWork(selectedWorkId, infoTitle);
            }
            setBookData(data);
            setGoals(data.goals || []);
            setWorkName(work?.name || '');
        })();
    }, [showBookInfo, selectedWorkId, works, settingsVersion]);

    // 选中查看（不切换全局）
    const handleSelectWork = (workId) => {
        setSelectedWorkId(workId);
    };

    // 显式切换全局活跃作品
    const handleActivateWork = (workId) => {
        const store = useAppStore.getState();
        setActiveWorkIdSetting(workId);
        if (store.setActiveWorkId) store.setActiveWorkId(workId);
    };

    const globalActiveWorkId = useAppStore(s => s.activeWorkId) || getActiveWorkId();

    // 上传封面
    const handleCoverUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setCropperSrc(reader.result); // 打开裁剪器
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    // 保存表单数据
    const saveTimerRef = useRef(null);
    const latestBookDataRef = useRef(bookData);
    latestBookDataRef.current = bookData;
    const handleFieldChange = useCallback((field, value) => {
        // 1. 立即更新本地状态（保证输入流畅）
        setBookData(prev => ({ ...prev, [field]: value }));
        // 2. 如果修改的是标题，同步更新左侧作品列表的名称
        if (field === 'title' && selectedWorkId && value) {
            skipWorksReloadRef.current = true; // 防止 setWorks 触发 useEffect 重载
            setWorks(prev => prev.map(w => w.id === selectedWorkId ? { ...w, name: value } : w));
            setWorkName(value);
        }
        // 3. 防抖保存到持久化存储（500ms 无新输入后才执行）
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const cur = { ...latestBookDataRef.current, [field]: value };
            if (bookInfoNode) {
                updateSettingsNode(bookInfoNode.id, { content: cur }, nodes.map(n => n.id === bookInfoNode.id ? { ...n, content: cur } : n), selectedWorkId);
            }
            // 同步持久化作品名称
            if (field === 'title' && selectedWorkId && value) {
                renameWork(selectedWorkId, value);
            }
        }, 500);
    }, [bookInfoNode, nodes, selectedWorkId]);

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
        // 预填所有内置分类为 0，确保即使没有条目也在概览中显示
        ['character', 'location', 'world', 'object', 'plot', 'rules'].forEach(cat => { catCounts[cat] = 0; });
        const customFolderLabels = {}; // custom__id → folder name
        const builtInFolderLabels = {}; // category → renamed root folder name
        nodes.forEach(n => {
            if ((n.type === 'folder' || n.type === 'special') && n.parentId === workId && builtInCats.has(n.category) && n.name) {
                builtInFolderLabels[n.category] = n.name;
            }
        });
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
        const chaps = selectedChapters;
        const totalWords = Array.isArray(chaps)
            ? chaps.filter(c => (c.type || 'chapter') !== 'volume').reduce((s, c) => s + (c.wordCount || 0), 0)
            : 0;
        const chapterCount = Array.isArray(chaps)
            ? chaps.filter(c => (c.type || 'chapter') !== 'volume').length
            : 0;
        // 最近编辑的章节
        const recentChapters = Array.isArray(chaps)
            ? chaps.filter(c => (c.type || 'chapter') !== 'volume')
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
        return { catCounts, customFolderLabels, builtInFolderLabels, orderedCatEntries, recentItems: recentItems.slice(0, 5), totalItems, totalWords, chapterCount, recentChapters };
    }, [nodes, selectedChapters]);

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
        <>
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9998,
                display: showBookInfo ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
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
                    padding: '14px 24px', borderBottom: '1px solid var(--border-light)',
                    background: 'var(--bg-secondary)', flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'linear-gradient(135deg, var(--accent, #6366f1), #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                        }}>
                            <BookOpen size={18} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>作品管理</h2>
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>管理作品信息与创作数据</p>
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

                    {/* ===== 左侧：作品列表 ===== */}
                    <div style={{
                        width: 220, minWidth: 180, flexShrink: 0,
                        borderRight: '1px solid var(--border-light)',
                        display: 'flex', flexDirection: 'column',
                        background: 'var(--bg-primary)',
                    }}>
                        <div style={{ padding: '12px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            作品列表
                            <button
                                onClick={async () => {
                                    const name = await promptInput('新作品名称：');
                                    if (!name || !name.trim()) return;
                                    const workNode = await addWork(name.trim());
                                    const allWorks = await getAllWorks();
                                    setWorks(allWorks);
                                    handleSelectWork(workNode.id);
                                }}
                                style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border-light)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'all 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                                title="新建作品"
                            ><Plus size={12} /></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                            {works.map(w => {
                                const isViewing = w.id === selectedWorkId;
                                const isGlobalActive = w.id === globalActiveWorkId;
                                return (
                                    <div
                                        key={w.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                                            transition: 'all 0.15s', marginBottom: 2,
                                            background: isViewing ? 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.08))' : 'transparent',
                                            border: isViewing ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                                        }}
                                        onClick={() => handleSelectWork(w.id)}
                                        onMouseEnter={e => { if (!isViewing) e.currentTarget.style.background = 'var(--bg-hover, #f3f4f6)'; }}
                                        onMouseLeave={e => { if (!isViewing) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                            background: isViewing ? 'var(--accent, #6366f1)' : 'var(--bg-secondary)',
                                            color: isViewing ? '#fff' : 'var(--text-muted)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all 0.15s', position: 'relative',
                                        }}>
                                            <BookOpen size={14} />
                                            {isGlobalActive && (
                                                <div style={{
                                                    position: 'absolute', bottom: -2, right: -2,
                                                    width: 10, height: 10, borderRadius: '50%',
                                                    background: '#10b981', border: '2px solid var(--bg-primary)',
                                                }} title="当前写作中" />
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{
                                                margin: 0, fontSize: 13, fontWeight: isViewing ? 600 : 500,
                                                color: isViewing ? 'var(--accent, #6366f1)' : 'var(--text-primary)',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>{w.name}</p>
                                            {isGlobalActive && (
                                                <span style={{ fontSize: 10, color: '#10b981', fontWeight: 500 }}>写作中</span>
                                            )}
                                        </div>
                                        {!isGlobalActive && (
                                            <button
                                                onClick={e => { e.stopPropagation(); handleActivateWork(w.id); }}
                                                style={{
                                                    padding: '3px 8px', border: '1px solid var(--border-light)',
                                                    borderRadius: 6, background: 'var(--bg-primary)', cursor: 'pointer',
                                                    fontSize: 10, color: 'var(--text-muted)', fontWeight: 500,
                                                    transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                            >切换</button>
                                        )}
                                        {!isGlobalActive && (
                                            <button
                                                onClick={async e => {
                                                    e.stopPropagation();
                                                    if (!confirm(`确定要删除作品「${w.name}」吗？\n此操作不可撤销！`)) return;
                                                    await removeWork(w.id);
                                                    const allWorks = await getAllWorks();
                                                    setWorks(allWorks);
                                                    if (selectedWorkId === w.id && allWorks.length > 0) {
                                                        handleSelectWork(allWorks[0].id);
                                                    }
                                                }}
                                                style={{
                                                    width: 22, height: 22, borderRadius: 5, border: 'none',
                                                    background: 'transparent', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: 'var(--text-muted)', transition: 'all 0.15s', flexShrink: 0,
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                                                title="删除作品"
                                            ><Trash2 size={12} /></button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ===== 右侧：标签页内容 ===== */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* 标签切换栏 */}
                        <div style={{
                            display: 'flex', gap: 0, padding: '0 28px',
                            borderBottom: '1px solid var(--border-light)',
                            background: 'var(--bg-primary)', flexShrink: 0,
                        }}>
                            {[{ key: 'overview', label: '创作概览', icon: Layers }, { key: 'info', label: '作品信息', icon: FileText }].map(tab => (
                                <button
                                    key={tab.key}
                                    onMouseDown={e => e.preventDefault()} // 阻止按钮抢焦点，避免打断 IME 组合导致 Chrome IME 崩溃
                                    onClick={() => setActiveTab(tab.key)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '12px 20px', border: 'none', cursor: 'pointer',
                                        fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 500,
                                        color: activeTab === tab.key ? 'var(--accent, #6366f1)' : 'var(--text-muted)',
                                        background: 'transparent', transition: 'all 0.15s',
                                        borderBottom: activeTab === tab.key ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
                                        marginBottom: -1,
                                    }}
                                    onMouseEnter={e => { if (activeTab !== tab.key) e.currentTarget.style.color = 'var(--text-primary)'; }}
                                    onMouseLeave={e => { if (activeTab !== tab.key) e.currentTarget.style.color = 'var(--text-muted)'; }}
                                >
                                    <tab.icon size={14} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* 标签内容 */}
                        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-secondary)' }}>
                            {/* ========== 作品信息tab ========== */}
                            <div style={activeTab === 'info' ? { display: 'flex', gap: 28, padding: '28px 32px' } : { height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
                                {/* 左侧：表单 */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                {/* 封面上传 */}
                                <div style={{ display: 'flex', gap: 24, marginBottom: 28 }}>
                                    <div
                                        style={{
                                            width: 140, height: 196, borderRadius: 14, flexShrink: 0,
                                            border: bookData.coverImage ? 'none' : '2px dashed var(--border-medium, #d1d5db)',
                                            background: bookData.coverImage ? 'none' : 'var(--bg-primary)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            gap: 8, cursor: 'pointer', transition: 'all 0.2s',
                                            overflow: 'hidden', position: 'relative',
                                        }}
                                        onClick={() => coverInputRef.current?.click()}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-medium, #d1d5db)'; e.currentTarget.style.transform = 'none'; }}
                                    >
                                        {bookData.coverImage ? (
                                            <img src={bookData.coverImage} alt="封面" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                                        ) : (
                                            <>
                                                <ImageIcon size={24} style={{ color: 'var(--text-muted)' }} />
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>上传封面</span>
                                            </>
                                        )}
                                        {bookData.coverImage && (
                                            <div style={{
                                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                opacity: 0, transition: 'opacity 0.2s', borderRadius: 14,
                                            }}
                                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                                            >
                                                <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>更换封面</span>
                                            </div>
                                        )}
                                    </div>
                                    <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {bookData.title || workName || '未命名作品'}
                                        </h3>
                                        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                                            这些信息帮助AI理解你的作品定位和风格
                                        </p>
                                        {bookData.coverImage && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleFieldChange('coverImage', ''); }}
                                                style={{ alignSelf: 'flex-start', padding: '4px 12px', border: '1px solid var(--border-light)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, transition: 'all 0.15s' }}
                                                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-light)'; }}
                                            >删除封面</button>
                                        )}
                                    </div>
                                </div>

                                <FieldInput label={t('bookInfo.title') || '作品名称'} value={bookData.title} onChange={v => handleFieldChange('title', v)} placeholder={t('bookInfo.titlePlaceholder') || '例：《修仙世界的日常生活》'} />
                                <FieldInput label={t('bookInfo.genre') || '题材类型'} value={bookData.genre} onChange={v => handleFieldChange('genre', v)} placeholder={t('bookInfo.genrePlaceholder') || '例：仙侠/都市/悬疑/言情/科幻/奇幻/历史...'} />
                                <FieldInput label={t('bookInfo.synopsis') || '故事简介'} value={bookData.synopsis} onChange={v => handleFieldChange('synopsis', v)} placeholder={t('bookInfo.synopsisPlaceholder') || '用几句话概括整个故事的核心'} multiline rows={4} />
                                <FieldInput label={t('bookInfo.style') || '写作风格'} value={bookData.style} onChange={v => handleFieldChange('style', v)} placeholder={t('bookInfo.stylePlaceholder') || '例：轻松幽默、严肃沉重、诗意抒情、硬汉派、轻小说...'} />
                                <FieldInput label={t('bookInfo.tone') || '整体基调'} value={bookData.tone} onChange={v => handleFieldChange('tone', v)} placeholder={t('bookInfo.tonePlaceholder') || '例：温暖治愈、黑暗压抑、热血燃向、悬疑追谜...'} />
                                <FieldInput label={t('bookInfo.pov') || '叙事视角'} value={bookData.pov} onChange={v => handleFieldChange('pov', v)} placeholder={t('bookInfo.povPlaceholder') || '例：第一人称（主角视角）、第三人称有限视角、全知视角'} />
                                <FieldInput label={t('bookInfo.targetAudience') || '目标读者'} value={bookData.targetAudience} onChange={v => handleFieldChange('targetAudience', v)} placeholder={t('bookInfo.targetAudiencePlaceholder') || '例：18-30岁男性网文读者、女性言情读者...'} />
                                </div>

                                {/* 右侧：读者预览 + AI评价 */}
                                <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    {/* 读者预览卡片 */}
                                    <div style={{
                                        background: 'var(--bg-primary)', borderRadius: 16,
                                        border: '1px solid var(--border-light)',
                                        overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                                    }}>
                                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Eye size={14} style={{ color: 'var(--accent)' }} />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>读者预览</span>
                                        </div>
                                        <div style={{ padding: 18 }}>
                                            <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                                                {bookData.coverImage ? (
                                                    <img src={bookData.coverImage} alt="" style={{ width: 80, height: 112, objectFit: 'cover', borderRadius: 8, flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                                                ) : (
                                                    <div style={{ width: 80, height: 112, borderRadius: 8, flexShrink: 0, background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <BookOpen size={24} style={{ color: '#6366f1', opacity: 0.5 }} />
                                                    </div>
                                                )}
                                                <div>
                                                    <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                                                        {bookData.title || '未命名作品'}
                                                    </h4>
                                                    {bookData.genre && <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>{bookData.genre}</span>}
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                                        {bookData.style && <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>{bookData.style}</span>}
                                                        {bookData.tone && <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>{bookData.tone}</span>}
                                                        {bookData.pov && <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>{bookData.pov}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            {bookData.synopsis ? (
                                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{bookData.synopsis}</p>
                                            ) : (
                                                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>暂无简介，填写后将在此预览</p>
                                            )}
                                            {bookData.targetAudience && (
                                                <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>🎯 {bookData.targetAudience}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* AI 评价面板 */}
                                    <div style={{
                                        background: 'var(--bg-primary)', borderRadius: 16,
                                        border: '1px solid var(--border-light)',
                                        overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                                    }}>
                                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Sparkles size={14} style={{ color: '#f59e0b' }} />
                                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI 评价</span>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    setAiEvalLoading(true);
                                                    try {
                                                        const apiConfig = getChatApiConfig();
                                                        if (!apiConfig?.apiKey) { setAiEval({ _error: '请先在设置中配置AI API' }); return; }
                                                        const pType = apiConfig?.providerType || apiConfig?.provider;
                                                        const apiEndpoint = ['gemini-native', 'custom-gemini'].includes(pType) ? '/api/ai/gemini'
                                                            : pType === 'openai-responses' ? '/api/ai/responses'
                                                                : (['claude', 'custom-claude'].includes(pType) || apiConfig?.apiFormat === 'anthropic') ? '/api/ai/claude'
                                                                    : '/api/ai';
                                                        const fields = [
                                                            { key: 'title', label: '作品名称', value: bookData.title },
                                                            { key: 'genre', label: '题材类型', value: bookData.genre },
                                                            { key: 'synopsis', label: '故事简介', value: bookData.synopsis },
                                                            { key: 'style', label: '写作风格', value: bookData.style },
                                                            { key: 'tone', label: '整体基调', value: bookData.tone },
                                                            { key: 'pov', label: '叙事视角', value: bookData.pov },
                                                            { key: 'targetAudience', label: '目标读者', value: bookData.targetAudience },
                                                        ];
                                                        const filledFields = fields.filter(f => f.value?.trim());
                                                        if (filledFields.length === 0) { setAiEval({ _error: '请先填写至少一个字段' }); return; }
                                                        const prompt = '你是一位资深网文编辑，请对以下作品信息进行专业评价。对每个已填写的字段给出1-5星评分、简短评价（一句话）、和具体修改建议。注意评分标准：1星=非常糟糕 2星=待改进 3星=可以 4星=优秀 5星=极佳。\n\n作品信息如下：\n' + filledFields.map(f => f.label + ': ' + f.value).join('\n') + '\n\n请以以下JSON格式回复，不要加任何其他文字：\n{\n' + filledFields.map(f => '  "' + f.key + '": { "score": 评分, "feedback": "一句话评价", "suggestion": "建议的内容，如果当前已经很好则保持原文" }').join(',\n') + '\n}';
                                                        const res = await fetch(apiEndpoint, {
                                                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ systemPrompt: '你是一位专业的网文编辑，只输出JSON。', userPrompt: prompt, apiConfig }),
                                                        });
                                                        const contentType = res.headers.get('content-type') || '';
                                                        let fullText = '';
                                                        if (contentType.includes('text/event-stream')) {
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
                                                                        try { const json = JSON.parse(trimmed.slice(6)); if (json.text) fullText += json.text; } catch (_e) {}
                                                                    }
                                                                }
                                                            }
                                                        } else {
                                                            const data = await res.json();
                                                            fullText = data.text || data.error || '';
                                                        }
                                                        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
                                                        if (jsonMatch) {
                                                            try { setAiEval(JSON.parse(jsonMatch[0])); } catch (_e) { setAiEval({ _error: 'AI返回格式异常，请重试' }); }
                                                        } else { setAiEval({ _error: 'AI返回格式异常，请重试' }); }
                                                    } catch (err) {
                                                        setAiEval({ _error: err.message || '请求失败' });
                                                    } finally { setAiEvalLoading(false); }
                                                }}
                                                disabled={aiEvalLoading}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                                    padding: '4px 12px', border: '1px solid var(--border-light)', borderRadius: 8,
                                                    background: aiEvalLoading ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                                                    cursor: aiEvalLoading ? 'wait' : 'pointer', fontSize: 11, fontWeight: 500,
                                                    color: 'var(--text-muted)', transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => { if (!aiEvalLoading) { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b'; } }}
                                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                            >
                                                {aiEvalLoading ? <><RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> 评价中...</> : <><Sparkles size={11} /> {aiEval ? '重新评价' : '开始评价'}</>}
                                            </button>
                                        </div>
                                        <div style={{ padding: '12px 18px' }}>
                                            {aiEval?._error && (
                                                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#ef4444' }}>{aiEval._error}</p>
                                            )}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                                {[{ key: 'title', label: '作品名称' }, { key: 'genre', label: '题材类型' }, { key: 'synopsis', label: '故事简介' }, { key: 'style', label: '写作风格' }, { key: 'tone', label: '整体基调' }, { key: 'pov', label: '叙事视角' }, { key: 'targetAudience', label: '目标读者' }].map(field => {
                                                    const ev = aiEval?.[field.key];
                                                    const hasValue = bookData[field.key]?.trim();
                                                    return (
                                                        <div key={field.key} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', opacity: hasValue ? 1 : 0.5 }}>
                                                            {/* 栏目标题 */}
                                                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: ev ? 8 : 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <span>{field.label}</span>
                                                                {!hasValue && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>未填写</span>}
                                                            </div>
                                                            {ev ? (
                                                                <>
                                                                    {/* 1. 评语 */}
                                                                    <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ev.feedback}</p>
                                                                    {/* 2. 星级 */}
                                                                    <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                                                                        {[1, 2, 3, 4, 5].map(s => (
                                                                            <Star key={s} size={13} fill={s <= (ev.score || 0) ? '#f59e0b' : 'none'} style={{ color: s <= (ev.score || 0) ? '#f59e0b' : 'var(--border-light)' }} />
                                                                        ))}
                                                                        <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, marginLeft: 4 }}>{ev.score}/5</span>
                                                                    </div>
                                                                    {/* 3. 修改意见 */}
                                                                    {ev.suggestion && (
                                                                        <div style={{ marginBottom: 6 }}>
                                                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>修改意见</span>
                                                                            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ev.suggestion !== bookData[field.key] ? ev.suggestion : '当前内容已很好，无需修改'}</p>
                                                                        </div>
                                                                    )}
                                                                    {/* 4. 修改结果（可采纳） */}
                                                                    {ev.suggestion && ev.suggestion !== bookData[field.key] && (
                                                                        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                                                <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>修改结果</span>
                                                                                <button
                                                                                    onClick={() => handleFieldChange(field.key, ev.suggestion)}
                                                                                    style={{ padding: '3px 10px', border: 'none', borderRadius: 5, background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                                                                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                                                                                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                                                                                >采纳</button>
                                                                            </div>
                                                                            <p style={{ margin: 0, fontSize: 12, color: 'var(--accent)', lineHeight: 1.6, fontWeight: 500 }}>{ev.suggestion}</p>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : !aiEval && !aiEvalLoading ? (
                                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>等待评价</span>
                                                            ) : aiEvalLoading ? (
                                                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>评估中...</span>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* ========== 创作概览tab ========== */}
                            <div style={activeTab === 'overview' ? { padding: '28px 32px' } : { height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>

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
                                const label = isCustomFolder ? (stats.customFolderLabels[cat] || '自定义') : (stats.builtInFolderLabels?.[cat] || builtInLabels[cat] || cat);
                                // 获取该分类的根文件夹 ID
                                const workId = getActiveWorkId();
                                const rootFolder = isCustomFolder
                                    ? nodes.find(n => n.id === cat.replace('custom__', ''))
                                    : nodes.find(n => (n.type === 'folder') && n.category === cat && n.parentId === workId);
                                const handleClick = () => {
                                    setShowBookInfo(false);
                                    setTimeout(() => {
                                        const realCat = isCustomFolder ? (rootFolder?.category || 'custom') : cat;
                                        useAppStore.getState().setOpenCategoryModal(realCat);
                                    }, 80);
                                };
                                return (
                                    <StatCard key={cat} label={label} value={count} icon={Icon} color={c.color} bg={c.bg} onClick={handleClick}
                                        onDelete={() => handleDeleteCat(cat, label, count, isCustomFolder, rootFolder?.id)}
                                    />
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
                                onClick={async () => {
                                    const name = await promptInput('新分类名称：');
                                    if (!name || !name.trim()) return;
                                    const workId = getActiveWorkId();
                                    if (!workId) return;
                                    const uniqueCat = 'custom-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
                                    const newNode = await addSettingsNode({
                                        name: name.trim(),
                                        type: 'folder',
                                        category: uniqueCat,
                                        parentId: workId,
                                        icon: 'Gem',
                                    });
                                    if (newNode) {
                                        setNodes(prev => [...prev, newNode]);
                                        incrementSettingsVersion();
                                    }
                                }}
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
                            <ActivityChart chapters={selectedChapters} period={chartPeriod} />
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
                                                    updateSettingsNode(bookInfoNode.id, { content: updated }, null, selectedWorkId);
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
                                                updateSettingsNode(bookInfoNode.id, { content: updated }, null, selectedWorkId);
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
                                                        updateSettingsNode(bookInfoNode.id, { content: updated }, null, selectedWorkId);
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
                                                            updateSettingsNode(bookInfoNode.id, { content: updated }, null, selectedWorkId);
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
            </div>
        </div>
        {deleteConfirm && (
            <BookInfoDeleteModal
                message={deleteConfirm.message}
                onConfirm={deleteConfirm.onConfirm}
                onCancel={deleteConfirm.onCancel}
            />
        )}
        {cropperSrc && (
            <ImageCropper
                imageSrc={cropperSrc}
                onConfirm={(croppedDataUrl) => {
                    // 直接保存封面，不触发 settingsVersion 更新以避免 tab 重置
                    setBookData(prev => {
                        const next = { ...prev, coverImage: croppedDataUrl };
                        if (bookInfoNode) {
                            updateSettingsNode(bookInfoNode.id, { content: next }, nodes.map(n => n.id === bookInfoNode.id ? { ...n, content: next } : n), selectedWorkId);
                        }
                        return next;
                    });
                    setCropperSrc(null);
                }}
                onCancel={() => setCropperSrc(null)}
            />
        )}
        </>
    );
}

// 删除确认弹窗（与 SettingsPanel 的 DeleteConfirmModal 相同逻辑）
function BookInfoDeleteModal({ message, onConfirm, onCancel }) {
    const [skipToday, setSkipToday] = useState(false);
    const [neverRemind, setNeverRemind] = useState(false);
    const handleConfirm = () => {
        try {
            if (neverRemind) localStorage.setItem('author-delete-never-remind', 'true');
            else if (skipToday) localStorage.setItem('author-delete-skip-today', new Date().toISOString().slice(0, 10));
        } catch { /* ignore */ }
        onConfirm();
    };
    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={onCancel}>
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 12, padding: '24px 28px', minWidth: 340, maxWidth: 440, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 20 }}>⚠️</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>确认删除</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>{message}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={skipToday} disabled={neverRemind} onChange={e => setSkipToday(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }} />
                        今日不再提醒
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={neverRemind} onChange={e => { setNeverRemind(e.target.checked); if (e.target.checked) setSkipToday(false); }} style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }} />
                        不再提醒
                    </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button onClick={onCancel} style={{ padding: '8px 20px', border: '1px solid var(--border-light)', borderRadius: 8, background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>取消</button>
                    <button onClick={handleConfirm} style={{ padding: '8px 20px', border: 'none', borderRadius: 8, background: '#e53e3e', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600, boxShadow: '0 2px 8px rgba(229,62,62,0.3)' }}>删除</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
