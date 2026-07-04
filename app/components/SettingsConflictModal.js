'use client';

import { useState, useCallback } from 'react';
import { ClipboardList, Bot, Sparkles, XCircle, FolderOpen, Download, CheckCircle2 } from 'lucide-react';
import { getProjectSettings } from '../lib/settings';
import { useI18n } from '../lib/useI18n';
import { resolveAiEndpoint } from '../lib/ai-provider-compat';
import { aiFetch } from '../lib/ai-direct';
import { localizeApiError } from '../lib/api-error-i18n';

// 字段标签（用于展示摘要）
const FIELD_LABELS = {
    character: { role: '角色', gender: '性别', age: '年龄', appearance: '外貌', personality: '性格', background: '背景故事', motivation: '动机', skills: '能力', speechStyle: '说话风格', relationships: '人物关系', arc: '成长弧线', notes: '备注' },
    location: { description: '描述', slugline: '场景标题', sensoryVisual: '视觉', sensoryAudio: '听觉', sensorySmell: '嗅觉', mood: '氛围', dangerLevel: '危险等级', notes: '备注' },
    object: { description: '描述', objectType: '类型', rank: '品阶', currentHolder: '持有者', numericStats: '数值', symbolism: '象征', notes: '备注' },
    world: { description: '描述', notes: '备注' },
    plot: { status: '状态', description: '描述', notes: '备注' },
    rules: { description: '描述', notes: '备注' },
};

const CAT_LABELS = {
    character: '人物', location: '地点', object: '物品', world: '世界观', plot: '大纲', rules: '规则',
};

/**
 * 设定集导入冲突解决弹窗
 * @param {Array} conflicts - [{name, category, existing: node, imported: {name, category, content}}]
 * @param {Array} noConflicts - [{name, category, content, ...}] 无冲突的新条目
 * @param {Function} onConfirm - (resolvedNodes) => void
 * @param {Function} onClose
 */
export default function SettingsConflictModal({ conflicts, noConflicts, onConfirm, onClose }) {
    const { text } = useI18n();
    const fieldLabels = {
        character: { role: text('角色', 'Role', 'Роль'), gender: text('性别', 'Gender', 'Пол'), age: text('年龄', 'Age', 'Возраст'), appearance: text('外貌', 'Appearance', 'Внешность'), personality: text('性格', 'Personality', 'Характер'), background: text('背景故事', 'Backstory', 'Предыстория'), motivation: text('动机', 'Motivation', 'Мотивация'), skills: text('能力', 'Abilities', 'Способности'), speechStyle: text('说话风格', 'Speech Style', 'Стиль речи'), relationships: text('人物关系', 'Relationships', 'Отношения'), arc: text('成长弧线', 'Arc', 'Арка'), notes: text('备注', 'Notes', 'Заметки') },
        location: { description: text('描述', 'Description', 'Описание'), slugline: text('场景标题', 'Slugline', 'Сцена'), sensoryVisual: text('视觉', 'Visuals', 'Визуально'), sensoryAudio: text('听觉', 'Audio', 'Звук'), sensorySmell: text('嗅觉', 'Smell', 'Запах'), mood: text('氛围', 'Mood', 'Атмосфера'), dangerLevel: text('危险等级', 'Danger Level', 'Уровень опасности'), notes: text('备注', 'Notes', 'Заметки') },
        object: { description: text('描述', 'Description', 'Описание'), objectType: text('类型', 'Type', 'Тип'), rank: text('品阶', 'Rank', 'Ранг'), currentHolder: text('持有者', 'Current Holder', 'Владелец'), numericStats: text('数值', 'Stats', 'Характеристики'), symbolism: text('象征', 'Symbolism', 'Символика'), notes: text('备注', 'Notes', 'Заметки') },
        world: { description: text('描述', 'Description', 'Описание'), notes: text('备注', 'Notes', 'Заметки') },
        plot: { status: text('状态', 'Status', 'Статус'), description: text('描述', 'Description', 'Описание'), notes: text('备注', 'Notes', 'Заметки') },
        rules: { description: text('描述', 'Description', 'Описание'), notes: text('备注', 'Notes', 'Заметки') },
    };
    const getCatLabel = (category) => ({
        character: text('人物', 'Characters', 'Персонажи'),
        location: text('地点', 'Places', 'Места'),
        object: text('物品', 'Items', 'Предметы'),
        world: text('世界观', 'Worldbuilding', 'Мир'),
        plot: text('大纲', 'Outline', 'План'),
        rules: text('规则', 'Rules', 'Правила'),
    }[category] || category);
    // 每个冲突的解决方式: 'existing' | 'imported' | 'merged'
    const [resolutions, setResolutions] = useState(() => {
        const init = {};
        conflicts.forEach((c, i) => { init[i] = 'imported'; }); // 默认选择导入
        return init;
    });
    // AI 合并状态
    const [mergeStates, setMergeStates] = useState({}); // { index: { loading, results: [], currentIndex, error, prompt } }
    const [expandedItems, setExpandedItems] = useState(new Set());

    const setResolution = (index, value) => {
        setResolutions(prev => ({ ...prev, [index]: value }));
    };

    // === 批量操作 ===
    const selectAllExisting = () => {
        const next = {};
        conflicts.forEach((_, i) => { next[i] = 'existing'; });
        setResolutions(next);
    };
    const selectAllImported = () => {
        const next = {};
        conflicts.forEach((_, i) => { next[i] = 'imported'; });
        setResolutions(next);
    };

    // === 字段摘要 ===
    const renderFieldSummary = (content, category) => {
        if (!content || Object.keys(content).length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{text('（空）', '(Empty)', '(Пусто)')}</span>;
        const labels = fieldLabels[category] || FIELD_LABELS[category] || {};
        const entries = Object.entries(content).filter(([_, v]) => v);
        if (entries.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{text('（空）', '(Empty)', '(Пусто)')}</span>;
        return (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {entries.slice(0, 4).map(([key, val]) => (
                    <div key={key} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <b>{labels[key] || key}</b>: {String(val).substring(0, 40)}{String(val).length > 40 ? '...' : ''}
                    </div>
                ))}
                {entries.length > 4 && <div style={{ color: 'var(--text-muted)' }}>+{entries.length - 4} {text('个字段', 'fields', 'полей')}</div>}
            </div>
        );
    };

    // === AI 合并 ===
    // 切换合并结果轮播
    const navigateMergeResult = (index, direction) => {
        setMergeStates(prev => {
            const ms = prev[index];
            if (!ms || !ms.results || ms.results.length === 0) return prev;
            let next = (ms.currentIndex || 0) + direction;
            if (next < 0) next = ms.results.length - 1;
            if (next >= ms.results.length) next = 0;
            return { ...prev, [index]: { ...ms, currentIndex: next } };
        });
    };

    const handleAiMerge = useCallback(async (index) => {
        const conflict = conflicts[index];
        setMergeStates(prev => ({
            ...prev,
            [index]: {
                ...prev[index],
                loading: true,
                error: null,
                results: prev[index]?.results || [],
                currentIndex: prev[index]?.currentIndex || 0,
                prompt: prev[index]?.prompt || '',
            },
        }));

        try {
            const { apiConfig } = getProjectSettings();
            const apiEndpoint = resolveAiEndpoint(apiConfig);


            const existingFields = JSON.stringify(conflict.existing.content || {}, null, 2);
            const importedFields = JSON.stringify(conflict.imported.content || {}, null, 2);
            const userHint = mergeStates[index]?.prompt || '';

            const systemPrompt = `你是一个设定集合并助手。用户正在导入一个设定集，其中有一个条目与已有条目重名。请将两个版本的内容智能合并，保留所有有价值的信息，不丢失任何细节。

规则：
1. 如果两个版本的同一字段内容相似，合并为更完整的版本
2. 如果一个版本有某字段而另一个没有，保留有内容的版本
3. 如果两个版本的同一字段内容冲突，以更详细的为准，或合并两者
4. 返回纯 JSON 对象格式，不要代码块标记，key 保持原有字段名

${userHint ? `用户额外要求：${userHint}` : ''}`;

            const userPrompt = `条目名称：${conflict.name}
分类：${CAT_LABELS[conflict.category] || conflict.category}

【已有版本】
${existingFields}

【导入版本】
${importedFields}

请合并这两个版本，返回合并后的JSON对象：`;

            const res = await aiFetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt, userPrompt, apiConfig,
                    ...(apiConfig?.useAdvancedParams ? {
                        maxTokens: apiConfig.maxOutputTokens || 65536,
                        temperature: apiConfig.temperature ?? 1,
                        topP: apiConfig.topP ?? 0.95,
                        reasoningEffort: apiConfig.reasoningEffort || 'auto',
                    } : {}),
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(localizeApiError(err, text) || text('请求失败', 'Request failed', 'Запрос не выполнен'));
            }

            // 读取 SSE 流
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';

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
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            if (json.text) fullText += json.text;
                        } catch { }
                    }
                }
            }

            // 解析 AI 返回的 JSON
            let mergedContent;
            try {
                const jsonMatch = fullText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, fullText];
                mergedContent = JSON.parse(jsonMatch[1].trim());
            } catch {
                throw new Error(text('AI 返回的内容无法解析为 JSON，请重试', 'The AI response could not be parsed as JSON. Please try again', 'Ответ ИИ не удалось разобрать как JSON. Попробуйте ещё раз'));
            }

            // 将新结果追加到 results 数组，切换到最新
            setMergeStates(prev => {
                const prevResults = prev[index]?.results || [];
                const newResults = [...prevResults, mergedContent];
                return {
                    ...prev,
                    [index]: {
                        ...prev[index],
                        loading: false,
                        results: newResults,
                        currentIndex: newResults.length - 1,
                        error: null,
                    },
                };
            });
            setResolutions(prev => ({ ...prev, [index]: 'merged' }));
        } catch (err) {
            setMergeStates(prev => ({
                ...prev,
                [index]: { ...prev[index], loading: false, error: err.message },
            }));
        }
    }, [conflicts, mergeStates]);

    // === 确认 ===
    const handleConfirm = () => {
        const resolved = conflicts.map((conflict, i) => {
            const resolution = resolutions[i];
            if (resolution === 'existing') {
                return null; // 保留已有，不做操作
            } else if (resolution === 'merged') {
                const ms = mergeStates[i];
                const merged = ms?.results?.[ms?.currentIndex ?? 0];
                return {
                    action: 'update',
                    nodeId: conflict.existing.id,
                    content: merged || conflict.imported.content,
                };
            } else {
                // imported → 覆盖已有
                return {
                    action: 'update',
                    nodeId: conflict.existing.id,
                    content: conflict.imported.content,
                    name: conflict.imported.name,
                };
            }
        }).filter(Boolean);

        onConfirm(resolved, noConflicts);
    };

    const btnStyle = (active) => ({
        padding: '3px 10px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border-light)',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
    });

    const toggleExpanded = (i) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i); else next.add(i);
            return next;
        });
    };

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 1100 }}>
            <div className="glass-panel" onClick={e => e.stopPropagation()} style={{
                padding: '24px', maxWidth: 600, width: '90%', borderRadius: 'var(--radius-lg)',
                display: 'flex', flexDirection: 'column', gap: 16,
                maxHeight: '80vh', overflow: 'hidden',
            }}>
                <h3 style={{ margin: 0, fontSize: 16 }}><ClipboardList size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />{text('设定集导入 — 冲突解决', 'Settings Import - Conflict Resolution', 'Импорт настроек - разрешение конфликтов')}</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    {text(`发现 ${conflicts.length} 个同名条目冲突，`, `Found ${conflicts.length} same-name conflicts. `, `Найдено конфликтов с одинаковыми именами: ${conflicts.length}. `)}
                    {noConflicts.length > 0 ? text(`另有 ${noConflicts.length} 个新条目将直接导入。`, `${noConflicts.length} new items will be imported directly. `, `Новых элементов для прямого импорта: ${noConflicts.length}. `) : ''}
                    {text('请选择处理方式：', 'Choose how to resolve them:', 'Выберите способ разрешения:')}
                </p>

                {/* 冲突列表 */}
                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
                    {conflicts.map((conflict, i) => {
                        const res = resolutions[i];
                        const ms = mergeStates[i] || {};
                        const expanded = expandedItems.has(i);
                        const hasResults = ms.results && ms.results.length > 0;
                        const currentResult = hasResults ? ms.results[ms.currentIndex ?? 0] : null;
                        const totalResults = hasResults ? ms.results.length : 0;

                        return (
                            <div key={i} style={{
                                border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
                                padding: '12px', background: 'var(--bg-secondary)',
                            }}>
                                {/* 头部 */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>{conflict.name}</span>
                                    <span style={{
                                        fontSize: 10, padding: '1px 6px', borderRadius: 8,
                                        background: 'var(--bg-primary)', color: 'var(--text-muted)',
                                    }}>{getCatLabel(conflict.category)}</span>
                                    <button
                                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}
                                        onClick={() => toggleExpanded(i)}
                                    >{expanded ? text('收起 ▲', 'Collapse ▲', 'Свернуть ▲') : text('展开详情 ▼', 'Details ▼', 'Подробнее ▼')}</button>
                                </div>

                                {/* 选择按钮 */}
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: expanded ? 10 : 0 }}>
                                    <button style={btnStyle(res === 'existing')} onClick={() => setResolution(i, 'existing')}>
                                        {text('保留已有', 'Keep Existing', 'Оставить текущее')}
                                    </button>
                                    <button style={btnStyle(res === 'imported')} onClick={() => setResolution(i, 'imported')}>
                                        {text('使用导入', 'Use Imported', 'Использовать импорт')}
                                    </button>
                                    <button
                                        style={{
                                            ...btnStyle(res === 'merged'),
                                            ...(ms.loading ? { opacity: 0.6, cursor: 'wait' } : {}),
                                        }}
                                        onClick={() => {
                                            if (!ms.loading) {
                                                if (hasResults) setResolutions(prev => ({ ...prev, [i]: 'merged' }));
                                                else handleAiMerge(i);
                                            }
                                        }}
                                        disabled={ms.loading}
                                    >
                                        {ms.loading ? text('合并中...', 'Merging...', 'Слияние...') : hasResults ? <><CheckCircle2 size={11} style={{ marginRight: 2 }} />{text('已合并', 'Merged', 'Объединено')} ({totalResults})</> : <><Bot size={11} style={{ marginRight: 2 }} />{text('AI 智能合并', 'AI Smart Merge', 'Умное слияние ИИ')}</>}
                                    </button>
                                </div>

                                {/* 展开详情 */}
                                {expanded && (
                                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                                        {/* 已有版本 */}
                                        <div style={{
                                            flex: 1, padding: '8px', borderRadius: 6,
                                            background: res === 'existing' ? 'rgba(var(--accent-rgb, 180, 120, 60), 0.08)' : 'var(--bg-primary)',
                                            border: res === 'existing' ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                        }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}><FolderOpen size={11} style={{ marginRight: 4 }} />{text('已有', 'Existing', 'Текущее')}</div>
                                            {renderFieldSummary(conflict.existing.content, conflict.category)}
                                        </div>
                                        {/* 导入版本 */}
                                        <div style={{
                                            flex: 1, padding: '8px', borderRadius: 6,
                                            background: res === 'imported' ? 'rgba(var(--accent-rgb, 180, 120, 60), 0.08)' : 'var(--bg-primary)',
                                            border: res === 'imported' ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                        }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}><Download size={11} style={{ marginRight: 4 }} />{text('导入', 'Imported', 'Импорт')}</div>
                                            {renderFieldSummary(conflict.imported.content, conflict.category)}
                                        </div>
                                    </div>
                                )}

                                {/* AI 合并提示词 & 结果 */}
                                {expanded && (
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <input
                                                style={{
                                                    flex: 1, padding: '4px 8px', fontSize: 11,
                                                    border: '1px solid var(--border-light)', borderRadius: 4,
                                                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                                    outline: 'none',
                                                }}
                                                placeholder={text('AI 合并提示词（可选，如：以导入版本为主…）', 'AI merge instruction (optional, e.g. prioritize imported version...)', 'Инструкция для слияния ИИ (необязательно, например: взять импорт как основу...)')}
                                                value={ms.prompt || ''}
                                                onChange={e => setMergeStates(prev => ({
                                                    ...prev,
                                                    [i]: { ...prev[i], prompt: e.target.value },
                                                }))}
                                            />
                                            <button
                                                style={btnStyle(false)}
                                                onClick={() => handleAiMerge(i)}
                                                disabled={ms.loading}
                                            >{ms.loading ? text('合并中...', 'Merging...', 'Слияние...') : <><Bot size={11} style={{ marginRight: 2 }} />{text('合并', 'Merge', 'Объединить')}</>}</button>
                                        </div>
                                        {ms.error && (
                                            <div style={{ fontSize: 11, color: '#e44', marginTop: 4 }}><XCircle size={11} style={{ marginRight: 4 }} />{ms.error}</div>
                                        )}
                                        {hasResults && (
                                            <div style={{
                                                marginTop: 6, padding: 8, borderRadius: 6,
                                                background: res === 'merged' ? 'rgba(var(--accent-rgb, 180, 120, 60), 0.08)' : 'var(--bg-primary)',
                                                border: res === 'merged' ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                                cursor: 'pointer',
                                            }} onClick={() => setResolutions(prev => ({ ...prev, [i]: 'merged' }))}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}><Sparkles size={11} style={{ marginRight: 4 }} />{text('合并结果', 'Merged Result', 'Результат слияния')}</span>
                                                    {totalResults > 1 && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <button
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '0 4px', lineHeight: 1 }}
                                                                onClick={e => { e.stopPropagation(); navigateMergeResult(i, -1); }}
                                                            >◀</button>
                                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'center' }}>
                                                                {(ms.currentIndex ?? 0) + 1}/{totalResults}
                                                            </span>
                                                            <button
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '0 4px', lineHeight: 1 }}
                                                                onClick={e => { e.stopPropagation(); navigateMergeResult(i, 1); }}
                                                            >▶</button>
                                                        </span>
                                                    )}
                                                </div>
                                                {renderFieldSummary(currentResult, conflict.category)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* 底部 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button style={btnStyle(false)} onClick={selectAllExisting}>{text('全选已有', 'Select Existing', 'Выбрать текущее')}</button>
                        <button style={btnStyle(false)} onClick={selectAllImported}>{text('全选导入', 'Select Imported', 'Выбрать импорт')}</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={onClose}>{text('取消', 'Cancel', 'Отмена')}</button>
                        <button className="btn btn-primary btn-sm" onClick={handleConfirm}>{text('确认导入', 'Confirm Import', 'Подтвердить импорт')}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
