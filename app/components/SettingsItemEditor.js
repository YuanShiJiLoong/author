'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    ClipboardList, Sparkles, BookOpen, FileText, Eye, Moon, Swords, BarChart3,
    FolderOpen, PenLine, Target, Maximize2, Pencil, X, Copy,
    User, MapPin, Globe, Gem, Ruler, Settings as SettingsIcon,
    Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers
} from 'lucide-react';
import { ICON_PICKER_OPTIONS } from './SettingsTree';
import { useI18n } from '../lib/useI18n';
import MiniMarkdownEditor from './MiniMarkdownEditor';
import RadarStatsChart from './RadarStatsChart';

// ==================== 分类配色 ====================
const CATEGORY_COLORS = {
    character: { color: 'var(--cat-character)', bg: 'var(--cat-character-bg)' },
    location: { color: 'var(--cat-location)', bg: 'var(--cat-location-bg)' },
    world: { color: 'var(--cat-world)', bg: 'var(--cat-world-bg)' },
    object: { color: 'var(--cat-object)', bg: 'var(--cat-object-bg)' },
    plot: { color: 'var(--cat-plot)', bg: 'var(--cat-plot-bg)' },
    rules: { color: 'var(--cat-rules)', bg: 'var(--cat-rules-bg)' },
    custom: { color: 'var(--cat-custom)', bg: 'var(--cat-custom-bg)' },
};

// ==================== 通用字段组件 ====================

function TextField({ label, value, onChange, placeholder, multiline = false, rows = 3, aiBtn = false }) {
    const { t } = useI18n();
    const [localValue, setLocalValue] = useState(value || '');
    const [isExpanded, setIsExpanded] = useState(false);
    const isComposingRef = useRef(false);
    const timerRef = useRef(null);
    const onChangeRef = useRef(onChange);
    const localValueRef = useRef(localValue);
    onChangeRef.current = onChange;

    // 同步外部 prop 变化（切换节点时）—— 仅在外部值真正不同时才更新
    // 避免 debounce flush 后父组件回传相同值导致光标跳转
    // 并且在 IME 输入法组字期间不同步，防止打断组字
    useEffect(() => {
        if (!isComposingRef.current && (value || '') !== localValueRef.current) {
            setLocalValue(value || '');
            localValueRef.current = value || '';
        }
    }, [value]);

    // 组件卸载时 flush 未保存的更改
    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
                onChangeRef.current(localValueRef.current);
            }
        };
    }, []);

    // 防抖刷新：始终使用 localValueRef.current（最新值），而非捕获时的旧值
    // 如果正在 IME 组字中，跳过本次 flush，compositionEnd 会重新触发
    const scheduleFlush = useCallback(() => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            if (isComposingRef.current) return; // IME 组字中不 flush
            timerRef.current = null;
            onChangeRef.current(localValueRef.current);
        }, 500);
    }, []);

    const handleChange = useCallback((e) => {
        const newVal = e.target.value;
        setLocalValue(newVal);
        localValueRef.current = newVal;
        if (!isComposingRef.current) {
            scheduleFlush();
        }
    }, [scheduleFlush]);

    const handleCompositionStart = useCallback(() => {
        isComposingRef.current = true;
    }, []);

    const handleCompositionEnd = useCallback((e) => {
        isComposingRef.current = false;
        // compositionend 之后用最新值触发防抖
        const newVal = e.target.value;
        setLocalValue(newVal);
        localValueRef.current = newVal;
        scheduleFlush();
    }, [scheduleFlush]);

    const handleBlur = useCallback((e) => {
        e.target.style.borderColor = 'var(--border-light)';
        // 失焦时立即 flush，防止切换节点丢数据
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
            onChangeRef.current(localValueRef.current);
        }
    }, []);

    // 关闭展开模态框时立即 flush
    const handleCloseExpand = useCallback(() => {
        setIsExpanded(false);
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        onChangeRef.current(localValueRef.current);
    }, []);

    const inputProps = {
        value: localValue,
        onChange: handleChange,
        onCompositionStart: handleCompositionStart,
        onCompositionEnd: handleCompositionEnd,
        onFocus: e => e.target.style.borderColor = 'var(--accent)',
        onBlur: handleBlur,
        placeholder,
    };

    return (
        <div style={{ marginBottom: multiline ? 0 : 16, flex: multiline ? 1 : 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</label>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {multiline && (
                        <button
                            className="field-expand-btn"
                            title="展开编辑"
                            onClick={() => setIsExpanded(true)}
                            style={{
                                border: 'none', background: 'transparent', cursor: 'pointer',
                                color: 'var(--text-muted)', fontSize: 13, padding: '2px 4px',
                                borderRadius: 6, transition: 'all 0.2s', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                            }}
                            onMouseEnter={e => { e.target.style.color = 'var(--accent)'; e.target.style.background = 'var(--bg-hover)'; }}
                            onMouseLeave={e => { e.target.style.color = 'var(--text-muted)'; e.target.style.background = 'transparent'; }}
                        ><Maximize2 size={13} /></button>
                    )}
                    {aiBtn && (
                        <button className="field-ai-btn" title={t('settingsEditor.aiFill')}>✦</button>
                    )}
                </div>
            </div>
            {multiline ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <MiniMarkdownEditor
                        value={localValue}
                        onChange={(md) => {
                            setLocalValue(md);
                            localValueRef.current = md;
                            scheduleFlush();
                        }}
                        placeholder={placeholder}
                        rows={rows}
                        flexGrow
                    />
                </div>
            ) : (
                <input
                    type="text"
                    {...inputProps}
                    style={{
                        width: '100%', padding: '10px 0', border: 'none',
                        borderBottom: '1px solid var(--border-light)',
                        borderRadius: 0, background: 'transparent', color: 'var(--text-primary)',
                        fontSize: 14, fontFamily: 'var(--font-ui)', outline: 'none', transition: 'border-color 0.2s',
                    }}
                />
            )}

            {/* 展开编辑浮窗 */}
            {isExpanded && (
                <div
                    className="field-expand-overlay"
                    onClick={handleCloseExpand}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'fadeIn 0.2s ease',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'var(--bg-card)', borderRadius: 16,
                            boxShadow: '0 24px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.06)',
                            width: '80%', maxWidth: 900, maxHeight: '85vh',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            animation: 'settingsSlideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
                        }}
                    >
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: 'var(--bg-secondary)',
                        }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                <Pencil size={13} style={{ marginRight: 4 }} />{label}
                            </span>
                            <button
                                onClick={handleCloseExpand}
                                className="btn btn-ghost btn-icon"
                            ><X size={14} /></button>
                        </div>
                        <div style={{ flex: 1, padding: 16, overflow: 'auto', display: 'flex' }}>
                            <div style={{ width: '100%' }}>
                                <MiniMarkdownEditor
                                    value={localValue}
                                    onChange={(md) => {
                                        setLocalValue(md);
                                        localValueRef.current = md;
                                        scheduleFlush();
                                    }}
                                    placeholder={placeholder}
                                    rows={20}
                                    autoFocus
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ButtonGroup({ label, value, options: defaultOptions, onChange, customOptions, onOptionsChange }) {
    const [editing, setEditing] = useState(false);
    const options = customOptions && customOptions.length > 0 ? customOptions : defaultOptions;

    const handleRename = (idx, newLabel) => {
        if (!onOptionsChange) return;
        const updated = options.map((o, i) => i === idx ? { ...o, label: newLabel } : o);
        onOptionsChange(updated);
    };

    const handleDelete = (idx) => {
        if (!onOptionsChange || options.length <= 1) return;
        const deleted = options[idx];
        const updated = options.filter((_, i) => i !== idx);
        onOptionsChange(updated);
        if (value === deleted.value) onChange(updated[0]?.value || '');
    };

    const handleAdd = () => {
        if (!onOptionsChange) return;
        const id = 'tag_' + Date.now().toString(36);
        const updated = [...options, { value: id, label: '新标签' }];
        onOptionsChange(updated);
    };

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</label>
                {onOptionsChange && (
                    <button
                        onClick={() => setEditing(!editing)}
                        style={{
                            background: editing ? 'var(--accent)' : 'var(--bg-hover, #f3f4f6)',
                            border: editing ? '1px solid var(--accent)' : '1px solid var(--border-light, #e5e7eb)',
                            cursor: 'pointer',
                            color: editing ? '#fff' : 'var(--text-muted)',
                            padding: '2px 8px', borderRadius: 10,
                            display: 'flex', alignItems: 'center', gap: 3,
                            transition: 'all 0.15s', fontSize: 10, fontWeight: 500,
                        }}
                        onMouseEnter={e => { if (!editing) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
                        onMouseLeave={e => { if (!editing) { e.currentTarget.style.borderColor = 'var(--border-light, #e5e7eb)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                        title="编辑标签选项"
                    >
                        <Pencil size={9} />
                        {editing ? '完成' : '编辑'}
                    </button>
                )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {options.map((opt, idx) => (
                    <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        {editing ? (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 2,
                                border: '1.5px solid var(--accent)', borderRadius: 20,
                                padding: '3px 4px 3px 12px', background: 'var(--bg-secondary)',
                            }}>
                                <input
                                    value={opt.label}
                                    onChange={e => handleRename(idx, e.target.value)}
                                    style={{
                                        border: 'none', background: 'transparent', outline: 'none',
                                        fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
                                        width: Math.max(30, opt.label.length * 13 + 8),
                                        fontFamily: 'var(--font-ui)',
                                    }}
                                />
                                {options.length > 1 && (
                                    <button
                                        onClick={() => handleDelete(idx)}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--text-muted)', padding: '2px 4px', borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                    >
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => onChange(value === opt.value ? '' : opt.value)}
                                style={{
                                    padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                                    border: value === opt.value ? '1.5px solid var(--accent)' : '1px solid var(--border-light)',
                                    background: value === opt.value ? 'var(--accent)' : 'transparent',
                                    color: value === opt.value ? 'var(--text-inverse)' : 'var(--text-secondary)',
                                    cursor: 'pointer', transition: 'all 0.2s ease', fontFamily: 'var(--font-ui)',
                                    boxShadow: value === opt.value ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                                }}
                            >
                                {opt.label}
                            </button>
                        )}
                    </div>
                ))}
                {editing && (
                    <button
                        onClick={handleAdd}
                        style={{
                            padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            border: '1.5px dashed var(--border-light)', background: 'transparent',
                            color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s',
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                        + 添加
                    </button>
                )}
            </div>
        </div>
    );
}

// ==================== 字段分组折叠 ====================

function FieldGroup({ title, icon, children }) {
    return (
        <div style={{
            borderRadius: 18, overflow: 'hidden', marginBottom: 16,
            border: '1px solid var(--border-light, #e5e7eb)',
            background: 'var(--bg-card, #fff)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            display: 'flex', flexDirection: 'column',
            minHeight: 0,
        }}>
            <div
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px', flexShrink: 0,
                    borderBottom: '1px solid var(--border-light, #e5e7eb)',
                }}
            >
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '0.02em' }}>
                    {icon && <span style={{ color: 'var(--accent)', display: 'flex' }}>{icon}</span>}
                    {title}
                </h4>
            </div>
            <div style={{
                padding: '16px 20px', flex: 1,
                display: 'flex', flexDirection: 'column',
                minHeight: 0, overflow: 'hidden',
            }}>
                {children}
            </div>
        </div>
    );
}

// ==================== AI 生成的额外字段 ====================

function ExtraFieldsSection({ content, knownFields, onUpdate }) {
    const { t } = useI18n();
    const extraKeys = Object.keys(content || {}).filter(k => !knownFields.includes(k) && content[k]);
    if (extraKeys.length === 0) return null;
    return (
        <FieldGroup title={t('settingsEditor.aiExtraFields')} icon={<Sparkles size={13} />} defaultCollapsed>
            {extraKeys.map(k => (
                <TextField
                    key={k}
                    label={k}
                    value={content[k]}
                    onChange={v => onUpdate(k, v)}
                    placeholder=""
                    multiline
                />
            ))}
        </FieldGroup>
    );
}

// ==================== 角色卡片预览 ====================

function CharacterCardPreview({ name, content, onUpdate }) {
    const { t } = useI18n();
    const c = content || {};
    const catColor = CATEGORY_COLORS.character;
    const fileInputRef = useRef(null);
    const roleLabels = {
        protagonist: t('settingsEditor.roles.protagonist'),
        antagonist: t('settingsEditor.roles.antagonist'),
        supporting: t('settingsEditor.roles.supporting'),
        minor: t('settingsEditor.roles.minor')
    };
    const roleLabel = roleLabels[c.role] || c.role || t('settingsEditor.charRole');

    // ===== Avatar logic =====
    const hasAvatar = !!c.avatar;
    const hasGenderOrAge = !!(c.gender || c.age);

    // Gender detection
    const genderType = (() => {
        const g = (c.gender || '').toLowerCase();
        if (g.includes('男') || g.includes('male') || g === 'm') return 'male';
        if (g.includes('女') || g.includes('female') || g === 'f') return 'female';
        if (g) return 'other';
        return null;
    })();

    // Age detection — 5 age groups
    const ageNum = parseInt(c.age) || null;
    const ageGroup = (() => {
        if (!ageNum) return 'young'; // default
        if (ageNum < 10) return 'child';     // 小孩
        if (ageNum < 18) return 'teen';      // 少年
        if (ageNum <= 35) return 'young';    // 青年
        if (ageNum <= 60) return 'middle';   // 中年
        return 'elder';                       // 老年
    })();

    // Color scheme based on gender
    const avatarColors = (() => {
        switch (genderType) {
            case 'male': return { bg: '#4a7fd5', accent: '#2c5aa0', grad: 'linear-gradient(135deg, #5b8ed9, #3a6bc5)' };
            case 'female': return { bg: '#c76bb1', accent: '#a04d90', grad: 'linear-gradient(135deg, #d580c0, #b05aa0)' };
            case 'other': return { bg: '#5bbdad', accent: '#3d9a8b', grad: 'linear-gradient(135deg, #6dcfbe, #4db3a3)' };
            default: return { bg: catColor.color, accent: catColor.color, grad: `linear-gradient(135deg, ${catColor.color}, ${catColor.color}bb)` };
        }
    })();

    // Avatar placeholder image: 5 age × 2 gender = 10 variants
    const getPlaceholderSrc = () => {
        const gender = (genderType === 'female') ? 'female' : 'male';
        return `/avatars/${gender}_${ageGroup}.png`;
    };

    // Handle avatar upload
    const handleAvatarUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            alert('图片大小不能超过 2MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            onUpdate?.('avatar', ev.target.result);
        };
        reader.readAsDataURL(file);
    };

    // Remove avatar
    const handleRemoveAvatar = (e) => {
        e.preventDefault();
        if (c.avatar && confirm('移除头像？')) {
            onUpdate?.('avatar', '');
        }
    };

    // Avatar name initial fallback
    const avatarChar = (name || t('settingsEditor.unnamedChar'))[0];

    return (
        <div style={{
            borderRadius: 20, overflow: 'hidden', marginBottom: 24,
            position: 'relative',
            background: `linear-gradient(135deg, ${catColor.color}18 0%, ${catColor.bg} 40%, ${catColor.color}08 100%)`,
            border: `1px solid ${catColor.color}12`,
        }}>
            {/* 装饰性背景元素 */}
            <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, borderRadius: '50%', background: `${catColor.color}06`, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -30, left: '20%', width: 160, height: 160, borderRadius: '50%', background: `${catColor.color}04`, pointerEvents: 'none' }} />
            
            <div style={{ padding: '32px 32px 24px', display: 'flex', alignItems: 'flex-end', gap: 24, position: 'relative' }}>
                {/* 头像 — 可点击上传 */}
                <div style={{ position: 'relative' }}
                    onClick={() => fileInputRef.current?.click()}
                    onContextMenu={handleRemoveAvatar}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    <div style={{
                        position: 'absolute', inset: -3, borderRadius: 22,
                        background: `linear-gradient(135deg, ${avatarColors.bg}, transparent)`,
                        opacity: 0.5, filter: 'blur(4px)',
                    }} />
                    <div style={{
                        position: 'relative', width: 80, height: 80, borderRadius: 20, flexShrink: 0,
                        background: c.avatar ? 'transparent' : (c.gender || c.age) ? 'transparent' : avatarColors.grad,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', cursor: 'pointer',
                        boxShadow: `0 12px 32px ${avatarColors.bg}35`,
                        border: `2px solid ${avatarColors.bg}30`,
                        transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = `0 16px 40px ${avatarColors.bg}50`; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = `0 12px 32px ${avatarColors.bg}35`; }}
                    >
                        {c.avatar ? (
                            <img src={c.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (genderType === 'male' || genderType === 'female') ? (
                            <img src={getPlaceholderSrc()} alt="placeholder" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <span style={{ color: '#fff', fontSize: 36, fontWeight: 700 }}>{avatarChar}</span>
                        )}
                        {/* Upload hover overlay */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(0,0,0,0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: 0, transition: 'opacity 0.2s', borderRadius: 18,
                        }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                            </svg>
                        </div>
                    </div>
                </div>
                
                {/* 名称区 */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.01em', lineHeight: 1.1 }}>
                            {name || t('settingsEditor.unnamedChar')}
                        </div>
                        <span style={{
                            padding: '4px 14px', borderRadius: 20,
                            background: `${catColor.color}18`, color: catColor.color,
                            border: `1px solid ${catColor.color}25`,
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                        }}>
                            {roleLabel}
                        </span>
                    </div>
                    {/* 快速信息条 */}
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                        {c.gender && <span>{c.gender}</span>}
                        {c.gender && c.age && <span style={{ opacity: 0.3 }}>·</span>}
                        {c.age && <span>{c.age}</span>}
                        {(c.gender || c.age) && c.personality && <span style={{ opacity: 0.3 }}>·</span>}
                        {c.personality && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.personality.length > 20 ? c.personality.slice(0, 20) + '…' : c.personality}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ==================== 各分类编辑器 ====================

function CharacterEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });
    const catColor = CATEGORY_COLORS.character;

    return (
        <div>
            <CharacterCardPreview name={node.name} content={content} onUpdate={update} />

            {/* === Bento Grid: 基础信息 + 外貌与性格 === */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 0 }}>
                <FieldGroup title={t('settingsEditor.tabBasic')} icon={<ClipboardList size={14} />}>
                    <ButtonGroup label={t('settingsEditor.charRole')} value={content.role} onChange={v => update('role', v)}
                        options={[
                            { value: 'protagonist', label: t('settingsEditor.roles.proLabel') },
                            { value: 'antagonist', label: t('settingsEditor.roles.antLabel') },
                            { value: 'supporting', label: t('settingsEditor.roles.supLabel') },
                            { value: 'minor', label: t('settingsEditor.roles.minLabel') },
                        ]}
                        customOptions={content._roleOptions}
                        onOptionsChange={v => update('_roleOptions', v)}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <TextField label={t('settingsEditor.infoGender')} value={content.gender} onChange={v => update('gender', v)} placeholder={t('settingsEditor.charGenderPlaceholder')} />
                        <TextField label={t('settingsEditor.infoAge')} value={content.age} onChange={v => update('age', v)} placeholder={t('settingsEditor.charAgePlaceholder')} />
                    </div>
                    <RadarStatsChart
                        stats={content.stats}
                        onChange={v => update('stats', v)}
                        color={catColor.color}
                    />
                </FieldGroup>

                <FieldGroup title={t('settingsEditor.tabAppearance')} icon={<Sparkles size={14} />}>
                    <TextField label={t('settingsEditor.charAppearance')} value={content.appearance} onChange={v => update('appearance', v)} placeholder={t('settingsEditor.charAppearancePlaceholder')} multiline aiBtn />
                    <TextField label={t('settingsEditor.charPersonality')} value={content.personality} onChange={v => update('personality', v)} placeholder={t('settingsEditor.charPersonalityPlaceholder')} multiline aiBtn />
                    <TextField label={t('settingsEditor.charSpeechStyle')} value={content.speechStyle} onChange={v => update('speechStyle', v)} placeholder={t('settingsEditor.charSpeechStylePlaceholder')} multiline aiBtn />
                </FieldGroup>
            </div>

            {/* === 故事与人设 / 技能 (全宽) === */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 0 }}>
                <FieldGroup title={t('settingsEditor.tabBackground')} icon={<BookOpen size={14} />} defaultCollapsed>
                    <TextField label={t('settingsEditor.charBackground')} value={content.background} onChange={v => update('background', v)} placeholder={t('settingsEditor.charBackgroundPlaceholder')} multiline rows={4} aiBtn />
                    <TextField label={t('settingsEditor.charMotivation')} value={content.motivation} onChange={v => update('motivation', v)} placeholder={t('settingsEditor.charMotivationPlaceholder')} multiline aiBtn />
                    <TextField label={t('settingsEditor.charArc')} value={content.arc} onChange={v => update('arc', v)} placeholder={t('settingsEditor.charArcPlaceholder')} multiline aiBtn />
                </FieldGroup>

                <div>
                    <FieldGroup title={t('settingsEditor.tabSkills')} icon={<Swords size={14} />} defaultCollapsed>
                        <TextField label={t('settingsEditor.charSkills')} value={content.skills} onChange={v => update('skills', v)} placeholder={t('settingsEditor.charSkillsPlaceholder')} multiline aiBtn />
                        <TextField label={t('settingsEditor.charRelationships')} value={content.relationships} onChange={v => update('relationships', v)} placeholder={t('settingsEditor.charRelationshipsPlaceholder')} multiline aiBtn />
                    </FieldGroup>

                    {/* 灵感私语卡片 - 类似参考设计 */}
                    <div style={{
                        padding: '18px 20px', borderRadius: 18, marginBottom: 16,
                        background: `linear-gradient(135deg, ${catColor.color}14, transparent)`,
                        border: `1px solid ${catColor.color}20`,
                    }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: catColor.color, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Heart size={13} /> 灵感私语
                        </h4>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, fontStyle: 'italic' }}>
                            “赋予角色弱点，他才拥有被拯救的价值。内心的矛盾让角色鲜活，外在的行动让故事前进。”
                        </p>
                    </div>
                </div>
            </div>

            <FieldGroup title={t('settingsEditor.tabNotes')} icon={<FileText size={14} />} defaultCollapsed>
                <TextField label={t('settingsEditor.charNotes')} value={content.notes} onChange={v => update('notes', v)} placeholder={t('settingsEditor.charNotesPlaceholder')} multiline />
            </FieldGroup>

            <ExtraFieldsSection content={content} knownFields={['role', 'age', 'gender', 'stats', 'avatar', 'appearance', 'personality', 'speechStyle', 'background', 'motivation', 'arc', 'skills', 'relationships', 'notes', '_roleOptions']} onUpdate={update} />
        </div>
    );
}

function LocationEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });

    return (
        <div>
            {/* === Bento Grid: 基础 + 感官 === */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 0 }}>
                <FieldGroup title={t('settingsEditor.tabBasic')} icon={<ClipboardList size={14} />}>
                    <TextField label={t('settingsEditor.locDescription')} value={content.description} onChange={v => update('description', v)} placeholder={t('settingsEditor.locDescriptionPlaceholder')} multiline rows={4} aiBtn />
                    <TextField label={t('settingsEditor.locSlugline')} value={content.slugline} onChange={v => update('slugline', v)} placeholder={t('settingsEditor.locSluglinePlaceholder')} />
                </FieldGroup>

                <FieldGroup title={t('settingsEditor.tabSensory')} icon={<Eye size={14} />}>
                    <TextField label={t('settingsEditor.locVisual')} value={content.sensoryVisual} onChange={v => update('sensoryVisual', v)} placeholder={t('settingsEditor.locVisualPlaceholder')} multiline aiBtn />
                    <TextField label={t('settingsEditor.locAudio')} value={content.sensoryAudio} onChange={v => update('sensoryAudio', v)} placeholder={t('settingsEditor.locAudioPlaceholder')} multiline aiBtn />
                    <TextField label={t('settingsEditor.locSmell')} value={content.sensorySmell} onChange={v => update('sensorySmell', v)} placeholder={t('settingsEditor.locSmellPlaceholder')} multiline aiBtn />
                </FieldGroup>
            </div>

            <FieldGroup title={t('settingsEditor.tabMood')} icon={<Moon size={14} />} defaultCollapsed>
                <TextField label={t('settingsEditor.locMood')} value={content.mood} onChange={v => update('mood', v)} placeholder={t('settingsEditor.locMoodPlaceholder')} />
                <ButtonGroup label={t('settingsEditor.locDangerLevel')} value={content.dangerLevel} onChange={v => update('dangerLevel', v)}
                    options={[
                        { value: 'safe', label: t('settingsEditor.dangerSafe') },
                        { value: 'caution', label: t('settingsEditor.dangerCaution') },
                        { value: 'danger', label: t('settingsEditor.dangerHigh') },
                    ]}
                    customOptions={content._dangerOptions}
                    onOptionsChange={v => update('_dangerOptions', v)}
                />
            </FieldGroup>

            <ExtraFieldsSection content={content} knownFields={['description', 'slugline', 'sensoryVisual', 'sensoryAudio', 'sensorySmell', 'mood', 'dangerLevel', '_dangerOptions']} onUpdate={update} />
        </div>
    );
}

function ObjectEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });

    return (
        <div>
            {/* === Bento Grid: 基础 + 属性 === */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 0 }}>
                <FieldGroup title={t('settingsEditor.tabBasic')} icon={<ClipboardList size={14} />}>
                    <TextField label={t('settingsEditor.objDescription')} value={content.description} onChange={v => update('description', v)} placeholder={t('settingsEditor.objDescriptionPlaceholder')} multiline rows={4} aiBtn />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <TextField label={t('settingsEditor.objType')} value={content.objectType} onChange={v => update('objectType', v)} placeholder={t('settingsEditor.objTypePlaceholder')} />
                        <TextField label={t('settingsEditor.objRank')} value={content.rank} onChange={v => update('rank', v)} placeholder={t('settingsEditor.objRankPlaceholder')} />
                    </div>
                </FieldGroup>

                <FieldGroup title={t('settingsEditor.tabStats')} icon={<BarChart3 size={14} />}>
                    <TextField label={t('settingsEditor.objHolder')} value={content.currentHolder} onChange={v => update('currentHolder', v)} placeholder={t('settingsEditor.objHolderPlaceholder')} />
                    <TextField label={t('settingsEditor.objStats')} value={content.numericStats} onChange={v => update('numericStats', v)} placeholder={t('settingsEditor.objStatsPlaceholder')} multiline />
                    <TextField label={t('settingsEditor.objSymbolism')} value={content.symbolism} onChange={v => update('symbolism', v)} placeholder={t('settingsEditor.objSymbolismPlaceholder')} multiline aiBtn />
                </FieldGroup>
            </div>

            <ExtraFieldsSection content={content} knownFields={['description', 'objectType', 'rank', 'currentHolder', 'numericStats', 'symbolism']} onUpdate={update} />
        </div>
    );
}

function WorldEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });

    return (
        <div>
            <TextField label={t('settingsEditor.worldDescription')} value={content.description} onChange={v => update('description', v)} placeholder={t('settingsEditor.worldDescriptionPlaceholder')} multiline rows={6} aiBtn />
            <TextField label={t('settingsEditor.worldNotes')} value={content.notes} onChange={v => update('notes', v)} placeholder={t('settingsEditor.worldNotesPlaceholder')} multiline />
            <ExtraFieldsSection content={content} knownFields={['description', 'notes']} onUpdate={update} />
        </div>
    );
}

function PlotEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });

    return (
        <div>
            <ButtonGroup label={t('settingsEditor.plotStatus')} value={content.status} onChange={v => update('status', v)}
                options={[
                    { value: 'planned', label: t('settingsEditor.statusPlanned') },
                    { value: 'writing', label: t('settingsEditor.statusWriting') },
                    { value: 'done', label: t('settingsEditor.statusDone') },
                ]}
                customOptions={content._statusOptions}
                onOptionsChange={v => update('_statusOptions', v)}
            />
            <TextField label={t('settingsEditor.plotDescription')} value={content.description} onChange={v => update('description', v)} placeholder={t('settingsEditor.plotDescriptionPlaceholder')} multiline rows={6} aiBtn />
            <TextField label={t('settingsEditor.plotNotes')} value={content.notes} onChange={v => update('notes', v)} placeholder={t('settingsEditor.plotNotesPlaceholder')} multiline />
            <ExtraFieldsSection content={content} knownFields={['status', 'description', 'notes', '_statusOptions']} onUpdate={update} />
        </div>
    );
}

function RulesEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });

    return (
        <div>
            <TextField label={t('settingsEditor.rulesDescription')} value={content.description} onChange={v => update('description', v)}
                placeholder={t('settingsEditor.rulesDescriptionPlaceholder')} multiline rows={6} />
            <ExtraFieldsSection content={content} knownFields={['description']} onUpdate={update} />
        </div>
    );
}

function GenericEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });

    return (
        <div>
            <TextField label={t('settingsEditor.genericDescription')} value={content.description} onChange={v => update('description', v)} placeholder={t('settingsEditor.genericDescriptionPlaceholder')} multiline rows={6} />
            <TextField label={t('settingsEditor.genericNotes')} value={content.notes} onChange={v => update('notes', v)} placeholder={t('settingsEditor.genericNotesPlaceholder')} multiline />
            <ExtraFieldsSection content={content} knownFields={['description', 'notes']} onUpdate={update} />
        </div>
    );
}

// ==================== 面包屑导航 ====================

function Breadcrumb({ node, allNodes, onSelect }) {
    const [copied, setCopied] = useState(false);
    const path = [];
    let current = node;
    while (current) {
        path.unshift(current);
        current = current.parentId ? allNodes.find(n => n.id === current.parentId) : null;
    }

    const handleCopyId = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(node.id).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, flexWrap: 'wrap' }}>
            {path.map((p, i) => {
                const IconComp = p.icon ? (ICON_COMPONENT_MAP[p.icon] || CATEGORY_DEFAULT_ICONS[p.category]) : CATEGORY_DEFAULT_ICONS[p.category];
                return (
                    <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && <span style={{ opacity: 0.3, fontSize: 10 }}>/</span>}
                        <span
                            onClick={() => onSelect(p.id)}
                            style={{
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                color: i === path.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)',
                                fontWeight: i === path.length - 1 ? 600 : 400,
                                transition: 'all 0.15s',
                                padding: '3px 10px', borderRadius: 8,
                                background: i === path.length - 1 ? 'var(--bg-hover, #f3f4f6)' : 'transparent',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-hover, #f3f4f6)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = i === path.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)'; e.currentTarget.style.background = i === path.length - 1 ? 'var(--bg-hover, #f3f4f6)' : 'transparent'; }}
                        >
                            {IconComp && <IconComp size={12} />}
                            {p.name}
                        </span>
                    </span>
                );
            })}
            {/* 复制 ID 按钮 */}
            <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <button
                    onClick={handleCopyId}
                    title={`复制 ID: ${node.id}`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 8,
                        border: '1px solid var(--border-light)',
                        background: copied ? 'var(--accent)' : 'transparent',
                        color: copied ? '#fff' : 'var(--text-muted)',
                        fontSize: 10, fontFamily: 'monospace', cursor: 'pointer',
                        transition: 'all 0.2s', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!copied) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
                    onMouseLeave={e => { if (!copied) { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                >
                    <Copy size={10} />
                    {copied ? '已复制!' : `ID: ${node.id}`}
                </button>
            </span>
        </div>
    );
}

// ==================== 文件夹信息 ====================

// 图标名称 → 组件映射
const ICON_COMPONENT_MAP = {
    // kebab-case
    'user': User, 'map-pin': MapPin, 'globe': Globe, 'gem': Gem,
    'clipboard-list': ClipboardList, 'ruler': Ruler, 'book-open': BookOpen,
    'settings': SettingsIcon, 'sparkles': Sparkles, 'heart': Heart,
    'star': Star, 'shield': Shield, 'zap': Zap, 'feather': Feather,
    'compass': Compass, 'flag': Flag, 'tag': Tag, 'layers': Layers,
    'folder-open': FolderOpen, 'file-text': FileText, 'pen-line': PenLine,
    'target': Target, 'bar-chart-3': BarChart3, 'swords': Swords,
    // PascalCase (data may store these)
    'FolderOpen': FolderOpen, 'User': User, 'MapPin': MapPin, 'Globe': Globe,
    'Gem': Gem, 'ClipboardList': ClipboardList, 'Ruler': Ruler, 'BookOpen': BookOpen,
    'Settings': SettingsIcon, 'Sparkles': Sparkles, 'Heart': Heart,
    'Star': Star, 'Shield': Shield, 'Zap': Zap, 'Feather': Feather,
    'Compass': Compass, 'Flag': Flag, 'Tag': Tag, 'Layers': Layers,
    'FileText': FileText, 'PenLine': PenLine, 'Target': Target,
    'BarChart3': BarChart3, 'Swords': Swords, 'Eye': Eye, 'Moon': Moon,
};

// 分类默认图标
const CATEGORY_DEFAULT_ICONS = {
    character: User, location: MapPin, world: Globe, object: Gem,
    plot: ClipboardList, rules: Ruler, bookInfo: BookOpen, custom: SettingsIcon,
};

function FolderInfo({ node, nodes, onAdd, onUpdate }) {
    const { t } = useI18n();
    const catColor = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.custom;
    const children = nodes.filter(n => n.parentId === node.id);
    const folders = children.filter(n => n.type === 'folder');
    const items = children.filter(n => n.type === 'item');
    const isCustomCategory = node.category === 'custom';

    // 获取当前图标组件
    const CurrentIcon = (node.icon && ICON_COMPONENT_MAP[node.icon])
        || CATEGORY_DEFAULT_ICONS[node.category]
        || FolderOpen;

    const [showIconPicker, setShowIconPicker] = useState(false);

    const handleIconSelect = (iconName) => {
        if (onUpdate) onUpdate(node.id, { icon: iconName });
        setShowIconPicker(false);
    };

    return (
        <div>
            {/* 文件夹信息卡片 */}
            <div style={{
                borderRadius: 20, overflow: 'hidden', marginBottom: 24,
                background: `linear-gradient(135deg, ${catColor.bg} 0%, ${catColor.color}10 100%)`,
                border: `1px solid ${catColor.color}15`,
                position: 'relative',
            }}>
                {/* 装饰性发光 */}
                <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: `${catColor.color}08`, pointerEvents: 'none' }} />
                <div style={{ padding: '32px 28px', textAlign: 'center', position: 'relative' }}>
                    <div
                        style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 64, height: 64, borderRadius: 18, marginBottom: 12,
                            background: `linear-gradient(135deg, ${catColor.color}20, ${catColor.color}10)`,
                            boxShadow: `0 8px 24px ${catColor.color}15`,
                            cursor: isCustomCategory ? 'pointer' : 'default', position: 'relative',
                        }}
                        onClick={() => isCustomCategory && setShowIconPicker(!showIconPicker)}
                        title={isCustomCategory ? '点击更换图标' : ''}
                    >
                        <CurrentIcon size={32} style={{ color: catColor.color }} />
                        {isCustomCategory && (
                            <span style={{ position: 'absolute', bottom: -4, right: -4, background: 'var(--bg-primary)', borderRadius: '50%', padding: 3, boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                                <Pencil size={10} style={{ color: 'var(--text-muted)' }} />
                            </span>
                        )}
                    </div>
                    <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>{node.name}</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                        {folders.length > 0 && `${folders.length} 个子文件夹 · `}
                        {items.length} 个设定项
                    </p>
                </div>

                {/* 图标选择器 */}
                {showIconPicker && (
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6,
                        padding: '12px 20px 16px', borderTop: `1px solid ${catColor.color}10`,
                        background: `${catColor.color}04`,
                    }}>
                        {ICON_PICKER_OPTIONS.map(opt => {
                            const IconComp = ICON_COMPONENT_MAP[opt.name];
                            const isActive = node.icon === opt.name;
                            return (
                                <button
                                    key={opt.name}
                                    onClick={(e) => { e.stopPropagation(); handleIconSelect(opt.name); }}
                                    title={opt.label}
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                        padding: '8px 4px', border: isActive ? `2px solid ${catColor.color}` : '1px solid transparent',
                                        borderRadius: 10, background: isActive ? catColor.bg : 'transparent',
                                        cursor: 'pointer', color: isActive ? catColor.color : 'var(--text-secondary)',
                                        transition: 'all 0.15s',
                                        fontSize: 10,
                                    }}
                                >
                                    {IconComp && <IconComp size={20} />}
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {children.length === 0 && (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '40px 20px', gap: 12, textAlign: 'center',
                }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: `linear-gradient(135deg, ${catColor.bg}, ${catColor.color}10)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: catColor.color, marginBottom: 4,
                    }}>
                        <PenLine size={24} />
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{t('settingsEditor.emptyTitle')}</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 260, lineHeight: 1.5 }}>{t('settingsEditor.emptyDesc')}</p>
                </div>
            )}

            <button
                onClick={() => onAdd(node.id, node.category)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px 0', border: 'none', borderRadius: 12,
                    background: catColor.color, color: '#fff',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.2s ease', boxShadow: `0 4px 12px ${catColor.color}30`,
                    marginTop: 8,
                }}
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none'; }}
            >
                {t('settingsEditor.addBtn')}
            </button>
        </div>
    );
}

// ==================== 空状态 ====================

function EmptyState() {
    const { t } = useI18n();
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', padding: '60px 40px', textAlign: 'center',
        }}>
            <div style={{
                width: 72, height: 72, borderRadius: 22,
                background: 'linear-gradient(135deg, var(--bg-hover, #f3f4f6), var(--bg-secondary, #e5e7eb))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', marginBottom: 20,
                boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
            }}>
                <Target size={30} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '0.01em' }}>{t('settingsEditor.selectTitle')}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 280, lineHeight: 1.6 }}>{t('settingsEditor.selectDesc')}</p>
        </div>
    );
}

// ==================== 主组件 ====================

export default function SettingsItemEditor({ selectedNode, allNodes, onUpdate, onSelect, onAdd }) {
    if (!selectedNode) return <EmptyState />;

    // 文件夹 → 显示文件夹信息
    if (selectedNode.type === 'folder' || selectedNode.type === 'special') {
        return (
            <div key={selectedNode.id} style={{ padding: '24px 28px' }}>
                <Breadcrumb node={selectedNode} allNodes={allNodes} onSelect={onSelect} />
                <FolderInfo node={selectedNode} nodes={allNodes} onAdd={onAdd} onUpdate={onUpdate} />
            </div>
        );
    }

    // item → 显示对应编辑器
    const editorMap = {
        character: CharacterEditor,
        location: LocationEditor,
        object: ObjectEditor,
        world: WorldEditor,
        plot: PlotEditor,
        rules: RulesEditor,
        custom: GenericEditor,
    };
    const EditorComponent = editorMap[selectedNode.category] || GenericEditor;

    return (
        <div key={selectedNode.id} style={{ padding: '24px 28px' }}>
            <Breadcrumb node={selectedNode} allNodes={allNodes} onSelect={onSelect} />
            <EditorComponent node={selectedNode} onUpdate={onUpdate} />
        </div>
    );
}
