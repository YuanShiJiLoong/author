'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Sparkles, X, Settings2 } from 'lucide-react';
import { useI18n } from '../lib/useI18n';
import { useAppStore } from '../store/useAppStore';
import { getSettingsNodes, getProjectSettings } from '../lib/settings';
import {
    buildQuickWordExtractionPrompts,
    buildQuickWordList,
    buildSettingsSourceTexts,
    collectSettingsQuickWords,
    normalizeQuickWordText,
    parseQuickWordResponse,
} from '../lib/quick-words';
import {
    QUICK_WORDS_CHANGED_EVENT,
    getQuickWordStore,
    isQuickWordsEnabled,
    saveQuickWordStore,
    setQuickWordsEnabled,
} from '../lib/quick-words-store';
import { stripChapterHtml } from '../lib/chapter-synopsis';
import { prepareChapterForAi } from '../lib/ai-reference-content';
import { resolveAiEndpoint } from '../lib/ai-provider-compat';
import { aiFetch } from '../lib/ai-direct';
import { readAiEvents } from '../lib/ai-stream.js';
import { localizeApiError } from '../lib/api-error-i18n';
import { tt } from '../lib/runtime-i18n';

const CHAPTER_SOURCE_CHARS = 12000;

/** 当前作品可用的快捷词：设定集里的名字 + 作者自己加的。 */
export function useQuickWordList(workId) {
    const settingsVersion = useAppStore((state) => state.settingsVersion);
    const [data, setData] = useState({ settingsWords: [], store: { words: [], hidden: [] }, enabled: true });
    const [reloadTick, setReloadTick] = useState(0);

    useEffect(() => {
        const handleChanged = () => setReloadTick(tick => tick + 1);
        window.addEventListener(QUICK_WORDS_CHANGED_EVENT, handleChanged);
        return () => window.removeEventListener(QUICK_WORDS_CHANGED_EVENT, handleChanged);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [nodes, store] = await Promise.all([
                getSettingsNodes(workId).catch(() => []),
                getQuickWordStore(workId),
            ]);
            if (cancelled) return;
            setData({ settingsWords: collectSettingsQuickWords(nodes), store, enabled: isQuickWordsEnabled() });
        })();
        return () => { cancelled = true; };
    }, [workId, settingsVersion, reloadTick]);

    const words = useMemo(() => buildQuickWordList(data.settingsWords, data.store), [data]);
    return { ...data, words };
}

// ==================== 写作时的候选框 ====================

export function QuickWordsMenu({ editor, menu, controller, onManage }) {
    const { text } = useI18n();
    const menuRef = useRef(null);

    // 直接改 DOM 定位：位置要等候选框渲染出来量过高度才知道
    useLayoutEffect(() => {
        const element = menuRef.current;
        if (!editor || !menu || !element) return;
        try {
            const coords = editor.view.coordsAtPos(menu.from);
            const height = element.getBoundingClientRect().height;
            const below = coords.bottom + 4;
            const top = below + height > window.innerHeight - 8 ? coords.top - height - 4 : below;
            const left = Math.max(8, Math.min(coords.left, window.innerWidth - 240));
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
            element.style.visibility = 'visible';
        } catch {
            element.style.visibility = 'hidden';
        }
    }, [editor, menu]);

    if (!menu || typeof document === 'undefined') return null;

    return createPortal(
        <div
            ref={menuRef}
            className="quick-words-menu"
            role="listbox"
            aria-label={text('快捷词', 'Quick words', 'Быстрые слова')}
            style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden', zIndex: 9991 }}
            onMouseDown={e => e.preventDefault()}
        >
            {menu.matches.map((word, i) => (
                <button
                    key={word}
                    type="button"
                    role="option"
                    aria-selected={i === menu.index}
                    className={`quick-words-item${i === menu.index ? ' active' : ''}`}
                    onClick={() => controller.accept?.(word)}
                >
                    <span className="quick-words-item-text">{word}</span>
                    {i === menu.index && <kbd>Tab</kbd>}
                </button>
            ))}
            <div className="quick-words-footer">
                <span>
                    {menu.cycling && menu.matches.length > 1
                        ? text('再按 Tab 换下一个', 'Tab again for the next one', 'Ещё раз Tab — следующее')
                        : text('Tab 填入 · Esc 收起', 'Tab to insert · Esc to close', 'Tab — вставить · Esc — закрыть')}
                </span>
                <button
                    type="button"
                    className="quick-words-manage"
                    title={text('管理快捷词', 'Manage quick words', 'Управление быстрыми словами')}
                    onClick={() => { controller.dismiss?.(); onManage?.(); }}
                >
                    <Settings2 size={13} />
                </button>
            </div>
        </div>,
        document.body,
    );
}

// ==================== 管理窗口 ====================

function splitInputWords(value) {
    return String(value || '')
        .split(/[\n,，、;；]/)
        .flatMap(part => (/[A-Za-zЀ-ӿ]/.test(part) ? [part] : part.split(/\s+/)))
        .map(normalizeQuickWordText)
        .filter(Boolean);
}

function buildChaptersText(chapters, activeChapterId, excludeStrikethrough) {
    const list = (Array.isArray(chapters) ? chapters : []).filter(chapter => chapter && chapter.type !== 'volume');
    if (!list.length) return '';
    let index = list.findIndex(chapter => chapter.id === activeChapterId);
    if (index < 0) index = list.length - 1;
    const parts = [];
    let used = 0;
    // 从当前章往前取，越近的越重要
    for (let i = index; i >= 0 && used < CHAPTER_SOURCE_CHARS; i--) {
        const chapter = prepareChapterForAi(list[i], excludeStrikethrough);
        const body = stripChapterHtml(chapter?.content || '');
        if (!body) continue;
        const piece = body.slice(0, CHAPTER_SOURCE_CHARS - used);
        parts.unshift(`${list[i].title || ''}\n${piece}`.trim());
        used += piece.length;
    }
    return parts.join('\n\n---\n\n');
}

async function readAiText(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await response.json();
        throw new Error(localizeApiError(data, tt) || tt('请求失败', 'Request failed', 'Запрос не выполнен'));
    }
    let fullText = '';
    for await (const json of readAiEvents(response, undefined, tt)) {
        if (json.text) fullText += json.text;
    }
    return fullText.trim();
}

function WordChip({ word, onRemove, removeTitle, muted = false }) {
    return (
        <span className={`quick-words-chip${muted ? ' muted' : ''}`}>
            <span>{word}</span>
            {onRemove && (
                <button type="button" onClick={onRemove} title={removeTitle} aria-label={removeTitle}>
                    <X size={12} />
                </button>
            )}
        </span>
    );
}

export default function QuickWordsPanel({ workId, onClose }) {
    const { text } = useI18n();
    const { settingsWords, store, enabled } = useQuickWordList(workId);
    const [input, setInput] = useState('');
    const [extracting, setExtracting] = useState(false);
    const [error, setError] = useState('');
    const [found, setFound] = useState(null);
    const [showHidden, setShowHidden] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const hiddenKeys = useMemo(() => new Set(store.hidden.map(word => word.toLocaleLowerCase())), [store.hidden]);
    const visibleSettingsWords = settingsWords.filter(word => !hiddenKeys.has(word.text.toLocaleLowerCase()));
    const hiddenSettingsWords = settingsWords.filter(word => hiddenKeys.has(word.text.toLocaleLowerCase()));

    const save = useCallback((next) => saveQuickWordStore(next, workId), [workId]);

    const addWords = useCallback(async (words, source) => {
        const existing = new Set([
            ...store.words.map(word => word.text.toLocaleLowerCase()),
            ...settingsWords.map(word => word.text.toLocaleLowerCase()),
        ]);
        const additions = [];
        for (const word of words) {
            const key = word.toLocaleLowerCase();
            if (existing.has(key)) continue;
            existing.add(key);
            additions.push({ text: word, source });
        }
        const addedKeys = new Set(words.map(word => word.toLocaleLowerCase()));
        await save({
            words: [...store.words, ...additions],
            // 重新加回来的词不再隐藏
            hidden: store.hidden.filter(word => !addedKeys.has(word.toLocaleLowerCase())),
        });
        return additions.length;
    }, [save, settingsWords, store]);

    const handleAdd = async () => {
        const words = splitInputWords(input);
        if (!words.length) return;
        await addWords(words, 'manual');
        setInput('');
    };

    const removeOwnWord = (word) => save({ ...store, words: store.words.filter(item => item.text !== word) });
    const hideSettingsWord = (word) => save({ ...store, hidden: [...store.hidden, word] });
    const unhideAll = () => save({ ...store, hidden: store.hidden.filter(word => !settingsWords.some(item => item.text === word)) });

    const handleExtract = async () => {
        setExtracting(true);
        setError('');
        setFound(null);
        try {
            const { apiConfig } = getProjectSettings();
            const excludeStrikethrough = apiConfig?.excludeStrikethroughFromAi === true;
            const nodes = await getSettingsNodes(workId).catch(() => []);
            const { settingsText, outlineText } = buildSettingsSourceTexts(nodes);
            const { chapters, activeChapterId } = useAppStore.getState();
            const chaptersText = buildChaptersText(chapters, activeChapterId, excludeStrikethrough);
            if (!settingsText && !outlineText && chaptersText.replace(/\s/g, '').length < 50) {
                setError(text(
                    '设定集和正文都还很少，先写一些内容再来找词吧。',
                    'There is not much in your settings or chapters yet. Write a bit more first.',
                    'В настройках и главах пока мало текста. Сначала напишите больше.',
                ));
                return;
            }
            const existingWords = [...store.words.map(word => word.text), ...settingsWords.map(word => word.text)];
            const { systemPrompt, userPrompt } = buildQuickWordExtractionPrompts({ settingsText, outlineText, chaptersText, existingWords });
            const response = await aiFetch(resolveAiEndpoint(apiConfig), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    userPrompt,
                    apiConfig,
                    ...(apiConfig?.useAdvancedParams && apiConfig?.enableMaxOutputTokens ? {
                        maxTokens: apiConfig.maxOutputTokens || 65536,
                    } : {}),
                    temperature: 0.2,
                    topP: 0.9,
                }),
            });
            const aiText = await readAiText(response);
            const existing = new Set(existingWords.map(word => word.toLocaleLowerCase()));
            const words = parseQuickWordResponse(aiText).filter(word => !existing.has(word.toLocaleLowerCase()));
            if (!words.length) {
                setError(text('AI 没找到新的词，现有的已经很全了。', 'AI found no new words. Your list already covers them.', 'ИИ не нашёл новых слов — список уже полный.'));
                return;
            }
            setFound(words);
        } catch (err) {
            setError(err?.message || text('没能连上 AI，请检查 API 设置。', 'Could not reach the AI. Check your API settings.', 'Не удалось связаться с ИИ. Проверьте настройки API.'));
        } finally {
            setExtracting(false);
        }
    };

    const handleAcceptFound = async () => {
        if (!found?.length) return;
        await addWords(found, 'ai');
        setFound(null);
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="modal-overlay"
            role="presentation"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className="modal quick-words-panel" role="dialog" aria-modal="true" aria-labelledby="quick-words-title">
                <div className="quick-words-panel-header">
                    <div className="quick-words-heading">
                        <h2 id="quick-words-title">{text('快捷词', 'Quick words', 'Быстрые слова')}</h2>
                        <p className="quick-words-intro">
                            {text(
                                '写正文时打出词的开头，比如"沈"，下面会冒出"沈砚"，按 Tab 填入，连按 Tab 换下一个。',
                                'While writing, type the start of a word and a suggestion pops up. Press Tab to insert it, press Tab again for the next one.',
                                'Начните печатать слово — появится подсказка. Tab вставит её, повторный Tab — следующую.',
                            )}
                        </p>
                    </div>
                    <label className="quick-words-toggle">
                        <span>{text('写作时提示', 'Suggest while writing', 'Подсказывать')}</span>
                        <input
                            type="checkbox"
                            className="quick-words-switch"
                            checked={enabled}
                            onChange={e => setQuickWordsEnabled(e.target.checked)}
                        />
                    </label>
                    <button type="button" className="quick-words-close" onClick={onClose} aria-label={text('关闭', 'Close', 'Закрыть')}>
                        <X size={18} />
                    </button>
                </div>

                <button type="button" className="quick-words-action" onClick={handleExtract} disabled={extracting}>
                    <span className="quick-words-action-icon" aria-hidden="true">
                        <Sparkles size={20} />
                    </span>
                    <span className="quick-words-action-text">
                        <span className="quick-words-action-title">
                            {text('从书稿里找词', 'Find words in your manuscript', 'Найти слова в рукописи')}
                        </span>
                        <span className="quick-words-action-desc">
                            {text(
                                'AI 读设定集、大纲和最近几章，挑出人名、地名、招式这类常打的词',
                                'AI reads your settings, outline and recent chapters and picks out names, places, skills and other words you type often',
                                'ИИ прочитает настройки, план и последние главы и выберет имена, места, приёмы и другие частые слова',
                            )}
                        </span>
                    </span>
                    <span className="quick-words-action-go">
                        {extracting
                            ? text('正在找…', 'Working…', 'Ищу…')
                            : text('开始', 'Start', 'Начать')}
                        {!extracting && <ChevronRight size={16} />}
                    </span>
                </button>

                {error && <div className="quick-words-error">{error}</div>}

                {found && (
                    <div className="quick-words-found">
                        <div className="quick-words-section-title">
                            {text(`AI 找到 ${found.length} 个新词，点 × 去掉不要的`, `AI found ${found.length} new words. Click × to drop any you don't want`, `ИИ нашёл новых слов: ${found.length}. Нажмите ×, чтобы убрать лишние`)}
                        </div>
                        <div className="quick-words-chips">
                            {found.map(word => (
                                <WordChip
                                    key={word}
                                    word={word}
                                    removeTitle={text('不要这个', 'Drop this', 'Убрать')}
                                    onRemove={() => setFound(prev => prev.filter(item => item !== word))}
                                />
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setFound(null)}>
                                {text('都不要', 'Discard all', 'Отклонить все')}
                            </button>
                            <button type="button" className="btn btn-primary" onClick={handleAcceptFound} disabled={!found.length}>
                                {text(`加入这 ${found.length} 个`, `Add these ${found.length}`, `Добавить (${found.length})`)}
                            </button>
                        </div>
                    </div>
                )}

                <div className="quick-words-section">
                    <div className="quick-words-section-title">
                        {text(`我的快捷词（${store.words.length}）`, `My quick words (${store.words.length})`, `Мои быстрые слова (${store.words.length})`)}
                    </div>
                    <form className="quick-words-add" onSubmit={e => { e.preventDefault(); handleAdd(); }}>
                        <input
                            className="modal-input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder={text('自己加词，多个用逗号或空格隔开', 'Add your own words, separated by commas', 'Добавьте свои слова через запятую')}
                        />
                        <button type="submit" className="btn btn-secondary" disabled={!input.trim()}>
                            {text('添加', 'Add', 'Добавить')}
                        </button>
                    </form>
                    {store.words.length > 0 ? (
                        <div className="quick-words-chips">
                            {store.words.map(word => (
                                <WordChip
                                    key={word.text}
                                    word={word.text}
                                    removeTitle={text('删掉', 'Remove', 'Удалить')}
                                    onRemove={() => removeOwnWord(word.text)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="quick-words-empty">
                            {text('还没有。可以点上面的按钮让 AI 找，或者自己加。', 'None yet. Let AI find some above, or add your own.', 'Пока пусто. Попросите ИИ найти слова или добавьте свои.')}
                        </div>
                    )}
                </div>

                <div className="quick-words-section">
                    <div className="quick-words-section-title">
                        {text(`设定集里的名字（${visibleSettingsWords.length}，自动跟着设定集更新）`, `Names from your settings (${visibleSettingsWords.length}, kept in sync automatically)`, `Имена из настроек (${visibleSettingsWords.length}, обновляются автоматически)`)}
                    </div>
                    {visibleSettingsWords.length > 0 ? (
                        <div className="quick-words-chips">
                            {visibleSettingsWords.map(word => (
                                <WordChip
                                    key={word.text}
                                    word={word.text}
                                    removeTitle={text('不提示这个', "Don't suggest this", 'Не подсказывать')}
                                    onRemove={() => hideSettingsWord(word.text)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="quick-words-empty">
                            {text('设定集里还没有人物、地点或物品。', 'No characters, places or items in your settings yet.', 'В настройках пока нет персонажей, мест или предметов.')}
                        </div>
                    )}
                    {hiddenSettingsWords.length > 0 && (
                        <div className="quick-words-hidden">
                            <button type="button" className="quick-words-link" onClick={() => setShowHidden(v => !v)}>
                                {text(`已不提示 ${hiddenSettingsWords.length} 个`, `${hiddenSettingsWords.length} turned off`, `Отключено: ${hiddenSettingsWords.length}`)}
                            </button>
                            <button type="button" className="quick-words-link" onClick={unhideAll}>
                                {text('全部恢复', 'Restore all', 'Вернуть все')}
                            </button>
                            {showHidden && (
                                <div className="quick-words-chips">
                                    {hiddenSettingsWords.map(word => <WordChip key={word.text} word={word.text} muted />)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
