'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n } from '../lib/useI18n';

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
    const isComposingRef = useRef(false);
    const timerRef = useRef(null);
    const onChangeRef = useRef(onChange);
    const localValueRef = useRef(localValue);
    onChangeRef.current = onChange;

    // 同步外部 prop 变化（切换节点时）
    useEffect(() => {
        setLocalValue(value || '');
        localValueRef.current = value || '';
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

    const scheduleFlush = useCallback((newVal) => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            onChangeRef.current(newVal);
        }, 500);
    }, []);

    const handleChange = useCallback((e) => {
        const newVal = e.target.value;
        setLocalValue(newVal);
        localValueRef.current = newVal;
        if (!isComposingRef.current) {
            scheduleFlush(newVal);
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
        scheduleFlush(newVal);
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
        <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</label>
                {aiBtn && (
                    <button className="field-ai-btn" title={t('settingsEditor.aiFill')}>✦</button>
                )}
            </div>
            {multiline ? (
                <textarea
                    {...inputProps}
                    rows={rows}
                    style={{
                        width: '100%', padding: '8px 12px', border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        fontSize: 13, fontFamily: 'var(--font-ui)', resize: 'vertical', outline: 'none',
                        lineHeight: 1.6, transition: 'border-color 0.15s',
                    }}
                />
            ) : (
                <input
                    type="text"
                    {...inputProps}
                    style={{
                        width: '100%', padding: '8px 12px', border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none', transition: 'border-color 0.15s',
                    }}
                />
            )}
        </div>
    );
}

function ButtonGroup({ label, value, options, onChange }) {
    return (
        <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {options.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        style={{
                            padding: '5px 12px', borderRadius: 16, fontSize: 12, border: '1px solid var(--border-light)',
                            background: value === opt.value ? 'var(--accent)' : 'transparent',
                            color: value === opt.value ? 'var(--text-inverse)' : 'var(--text-secondary)',
                            cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-ui)',
                        }}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ==================== 字段分组折叠 ====================

function FieldGroup({ title, icon, children, defaultCollapsed = false }) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    return (
        <div className={`field-group ${collapsed ? 'collapsed' : ''}`}>
            <div className="field-group-header" onClick={() => setCollapsed(!collapsed)}>
                <h4>{icon && <span>{icon}</span>}{title}</h4>
                <span className="field-group-chevron">▼</span>
            </div>
            <div className="field-group-content">
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
        <FieldGroup title={t('settingsEditor.aiExtraFields')} icon="✨" defaultCollapsed>
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

function CharacterCardPreview({ name, content }) {
    const { t } = useI18n();
    const c = content || {};
    const catColor = CATEGORY_COLORS.character;
    const roleLabels = {
        protagonist: t('settingsEditor.roles.protagonist'),
        antagonist: t('settingsEditor.roles.antagonist'),
        supporting: t('settingsEditor.roles.supporting'),
        minor: t('settingsEditor.roles.minor')
    };
    const roleLabel = roleLabels[c.role] || c.role || t('settingsEditor.charRole');

    // 头像文字：取名字第一个字
    const avatarChar = (name || t('settingsEditor.unnamedChar'))[0];

    return (
        <div className="character-card-preview" style={{ background: catColor.bg, color: catColor.color, border: `1px solid ${catColor.color}20` }}>
            <div className="character-card-header">
                <div className="character-card-avatar" style={{ background: `linear-gradient(135deg, ${catColor.color}, ${catColor.color}cc)` }}>
                    {avatarChar}
                </div>
                <div className="character-card-info">
                    <div className="character-card-name">{name || t('settingsEditor.unnamedChar')}</div>
                    <span className="character-card-role" style={{ background: `${catColor.color}18`, color: catColor.color }}>
                        {roleLabel}
                    </span>
                </div>
            </div>
            <div className="character-card-quickinfo">
                {c.gender && <span className="info-item"><span className="info-label">{t('settingsEditor.infoGender')}</span>{c.gender}</span>}
                {c.age && <span className="info-item"><span className="info-label">{t('settingsEditor.infoAge')}</span>{c.age}</span>}
                {c.personality && <span className="info-item"><span className="info-label">{t('settingsEditor.infoPersonality')}</span>{c.personality.length > 20 ? c.personality.slice(0, 20) + '…' : c.personality}</span>}
            </div>
        </div>
    );
}

// ==================== 各分类编辑器 ====================

function CharacterEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });

    return (
        <div>
            <CharacterCardPreview name={node.name} content={content} />

            <FieldGroup title={t('settingsEditor.tabBasic')} icon="📋">
                <ButtonGroup label={t('settingsEditor.charRole')} value={content.role} onChange={v => update('role', v)}
                    options={[
                        { value: 'protagonist', label: t('settingsEditor.roles.proLabel') },
                        { value: 'antagonist', label: t('settingsEditor.roles.antLabel') },
                        { value: 'supporting', label: t('settingsEditor.roles.supLabel') },
                        { value: 'minor', label: t('settingsEditor.roles.minLabel') },
                    ]}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <TextField label={t('settingsEditor.infoGender')} value={content.gender} onChange={v => update('gender', v)} placeholder={t('settingsEditor.charGenderPlaceholder')} />
                    <TextField label={t('settingsEditor.infoAge')} value={content.age} onChange={v => update('age', v)} placeholder={t('settingsEditor.charAgePlaceholder')} />
                </div>
            </FieldGroup>

            <FieldGroup title={t('settingsEditor.tabAppearance')} icon="✨">
                <TextField label={t('settingsEditor.charAppearance')} value={content.appearance} onChange={v => update('appearance', v)} placeholder={t('settingsEditor.charAppearancePlaceholder')} multiline aiBtn />
                <TextField label={t('settingsEditor.charPersonality')} value={content.personality} onChange={v => update('personality', v)} placeholder={t('settingsEditor.charPersonalityPlaceholder')} multiline aiBtn />
                <TextField label={t('settingsEditor.charSpeechStyle')} value={content.speechStyle} onChange={v => update('speechStyle', v)} placeholder={t('settingsEditor.charSpeechStylePlaceholder')} multiline aiBtn />
            </FieldGroup>

            <FieldGroup title={t('settingsEditor.tabBackground')} icon="📖" defaultCollapsed>
                <TextField label={t('settingsEditor.charBackground')} value={content.background} onChange={v => update('background', v)} placeholder={t('settingsEditor.charBackgroundPlaceholder')} multiline rows={4} aiBtn />
                <TextField label={t('settingsEditor.charMotivation')} value={content.motivation} onChange={v => update('motivation', v)} placeholder={t('settingsEditor.charMotivationPlaceholder')} multiline aiBtn />
                <TextField label={t('settingsEditor.charArc')} value={content.arc} onChange={v => update('arc', v)} placeholder={t('settingsEditor.charArcPlaceholder')} multiline aiBtn />
            </FieldGroup>

            <FieldGroup title={t('settingsEditor.tabSkills')} icon="⚔️" defaultCollapsed>
                <TextField label={t('settingsEditor.charSkills')} value={content.skills} onChange={v => update('skills', v)} placeholder={t('settingsEditor.charSkillsPlaceholder')} multiline aiBtn />
                <TextField label={t('settingsEditor.charRelationships')} value={content.relationships} onChange={v => update('relationships', v)} placeholder={t('settingsEditor.charRelationshipsPlaceholder')} multiline aiBtn />
            </FieldGroup>

            <FieldGroup title={t('settingsEditor.tabNotes')} icon="📝" defaultCollapsed>
                <TextField label={t('settingsEditor.charNotes')} value={content.notes} onChange={v => update('notes', v)} placeholder={t('settingsEditor.charNotesPlaceholder')} multiline />
            </FieldGroup>

            <ExtraFieldsSection content={content} knownFields={['role', 'age', 'gender', 'appearance', 'personality', 'speechStyle', 'background', 'motivation', 'arc', 'skills', 'relationships', 'notes']} onUpdate={update} />
        </div>
    );
}

function LocationEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });

    return (
        <div>
            <FieldGroup title={t('settingsEditor.tabBasic')} icon="📋">
                <TextField label={t('settingsEditor.locDescription')} value={content.description} onChange={v => update('description', v)} placeholder={t('settingsEditor.locDescriptionPlaceholder')} multiline rows={4} aiBtn />
                <TextField label={t('settingsEditor.locSlugline')} value={content.slugline} onChange={v => update('slugline', v)} placeholder={t('settingsEditor.locSluglinePlaceholder')} />
            </FieldGroup>

            <FieldGroup title={t('settingsEditor.tabSensory')} icon="👁">
                <TextField label={t('settingsEditor.locVisual')} value={content.sensoryVisual} onChange={v => update('sensoryVisual', v)} placeholder={t('settingsEditor.locVisualPlaceholder')} multiline aiBtn />
                <TextField label={t('settingsEditor.locAudio')} value={content.sensoryAudio} onChange={v => update('sensoryAudio', v)} placeholder={t('settingsEditor.locAudioPlaceholder')} multiline aiBtn />
                <TextField label={t('settingsEditor.locSmell')} value={content.sensorySmell} onChange={v => update('sensorySmell', v)} placeholder={t('settingsEditor.locSmellPlaceholder')} multiline aiBtn />
            </FieldGroup>

            <FieldGroup title={t('settingsEditor.tabMood')} icon="🌙" defaultCollapsed>
                <TextField label={t('settingsEditor.locMood')} value={content.mood} onChange={v => update('mood', v)} placeholder={t('settingsEditor.locMoodPlaceholder')} />
                <ButtonGroup label={t('settingsEditor.locDangerLevel')} value={content.dangerLevel} onChange={v => update('dangerLevel', v)}
                    options={[
                        { value: 'safe', label: t('settingsEditor.dangerSafe') },
                        { value: 'caution', label: t('settingsEditor.dangerCaution') },
                        { value: 'danger', label: t('settingsEditor.dangerHigh') },
                    ]}
                />
            </FieldGroup>

            <ExtraFieldsSection content={content} knownFields={['description', 'slugline', 'sensoryVisual', 'sensoryAudio', 'sensorySmell', 'mood', 'dangerLevel']} onUpdate={update} />
        </div>
    );
}

function ObjectEditor({ node, onUpdate }) {
    const { t } = useI18n();
    const content = node.content || {};
    const update = (field, value) => onUpdate(node.id, { content: { ...content, [field]: value } });

    return (
        <div>
            <FieldGroup title={t('settingsEditor.tabBasic')} icon="📋">
                <TextField label={t('settingsEditor.objDescription')} value={content.description} onChange={v => update('description', v)} placeholder={t('settingsEditor.objDescriptionPlaceholder')} multiline rows={4} aiBtn />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <TextField label={t('settingsEditor.objType')} value={content.objectType} onChange={v => update('objectType', v)} placeholder={t('settingsEditor.objTypePlaceholder')} />
                    <TextField label={t('settingsEditor.objRank')} value={content.rank} onChange={v => update('rank', v)} placeholder={t('settingsEditor.objRankPlaceholder')} />
                </div>
            </FieldGroup>

            <FieldGroup title={t('settingsEditor.tabStats')} icon="📊" defaultCollapsed>
                <TextField label={t('settingsEditor.objHolder')} value={content.currentHolder} onChange={v => update('currentHolder', v)} placeholder={t('settingsEditor.objHolderPlaceholder')} />
                <TextField label={t('settingsEditor.objStats')} value={content.numericStats} onChange={v => update('numericStats', v)} placeholder={t('settingsEditor.objStatsPlaceholder')} multiline />
                <TextField label={t('settingsEditor.objSymbolism')} value={content.symbolism} onChange={v => update('symbolism', v)} placeholder={t('settingsEditor.objSymbolismPlaceholder')} multiline aiBtn />
            </FieldGroup>

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
            />
            <TextField label={t('settingsEditor.plotDescription')} value={content.description} onChange={v => update('description', v)} placeholder={t('settingsEditor.plotDescriptionPlaceholder')} multiline rows={6} aiBtn />
            <TextField label={t('settingsEditor.plotNotes')} value={content.notes} onChange={v => update('notes', v)} placeholder={t('settingsEditor.plotNotesPlaceholder')} multiline />
            <ExtraFieldsSection content={content} knownFields={['status', 'description', 'notes']} onUpdate={update} />
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
    const path = [];
    let current = node;
    while (current) {
        path.unshift(current);
        current = current.parentId ? allNodes.find(n => n.id === current.parentId) : null;
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, flexWrap: 'wrap' }}>
            {path.map((p, i) => (
                <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {i > 0 && <span style={{ opacity: 0.5 }}>/</span>}
                    <span
                        onClick={() => onSelect(p.id)}
                        style={{ cursor: 'pointer', color: i === path.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: i === path.length - 1 ? 600 : 400, transition: 'color 0.15s' }}
                        onMouseEnter={e => e.target.style.color = 'var(--accent)'}
                        onMouseLeave={e => e.target.style.color = i === path.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)'}
                    >
                        {p.icon} {p.name}
                    </span>
                </span>
            ))}
        </div>
    );
}

// ==================== 文件夹信息 ====================

function FolderInfo({ node, nodes, onAdd }) {
    const { t } = useI18n();
    const catColor = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.custom;
    const children = nodes.filter(n => n.parentId === node.id);
    const folders = children.filter(n => n.type === 'folder');
    const items = children.filter(n => n.type === 'item');

    return (
        <div>
            <div style={{
                padding: 24, borderRadius: 'var(--radius-md)', background: catColor.bg,
                border: `1px solid ${catColor.color}20`, marginBottom: 20, textAlign: 'center',
            }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{node.icon || '📁'}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>{node.name}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {folders.length > 0 && `${folders.length} 个子文件夹 · `}
                    {items.length} 个设定项
                </p>
            </div>

            {children.length === 0 && (
                <div className="settings-empty-state">
                    <div className="empty-icon">📝</div>
                    <h3>{t('settingsEditor.emptyTitle')}</h3>
                    <p>{t('settingsEditor.emptyDesc')}</p>
                </div>
            )}

            <button
                className="tree-ai-generate-btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={() => onAdd(node.id, node.category)}
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
        <div className="settings-empty-state">
            <div className="empty-icon">🎯</div>
            <h3>{t('settingsEditor.selectTitle')}</h3>
            <p>{t('settingsEditor.selectDesc')}</p>
        </div>
    );
}

// ==================== 主组件 ====================

export default function SettingsItemEditor({ selectedNode, allNodes, onUpdate, onSelect, onAdd }) {
    if (!selectedNode) return <EmptyState />;

    // 文件夹 → 显示文件夹信息
    if (selectedNode.type === 'folder' || selectedNode.type === 'special') {
        return (
            <div style={{ padding: 20 }}>
                <Breadcrumb node={selectedNode} allNodes={allNodes} onSelect={onSelect} />
                <FolderInfo node={selectedNode} nodes={allNodes} onAdd={onAdd} />
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
        <div style={{ padding: 20 }}>
            <Breadcrumb node={selectedNode} allNodes={allNodes} onSelect={onSelect} />
            <EditorComponent node={selectedNode} onUpdate={onUpdate} />
        </div>
    );
}
