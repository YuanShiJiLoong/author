'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Copy, Pause, Play, RefreshCw, Settings2, ShieldCheck, Square, Volume2, X } from 'lucide-react';
import { useI18n } from '../lib/useI18n';
import { apiPath } from '../lib/api-base';

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2];
const RATE_STORAGE_KEY = 'author-tts-rate';
const VOICE_STORAGE_KEY_PREFIX = 'author-tts-voice-';
const LOCAL_CONFIG_KEY = 'author-tts-local-config-v1';
const SESSION_SECRET_PREFIX = 'author-tts-session-secret-';
const GEMINI_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];

const DEFAULT_CONFIG = {
    activeProvider: 'system',
    providers: {
        'openai-compatible': {
            endpoint: '',
            model: 'tts-1',
            voice: 'alloy',
            responseFormat: 'mp3',
            proxyUrl: '',
            discoveredModels: [],
            discoveredVoices: [],
            licenseConfirmed: false,
        },
        gemini: {
            baseUrl: '',
            model: 'gemini-3.1-flash-tts-preview',
            voice: 'Kore',
            proxyUrl: '',
            discoveredModels: [],
            discoveredVoices: [],
            licenseConfirmed: false,
        },
        'anthropic-custom': {
            endpoint: '',
            model: '',
            voice: '',
            proxyUrl: '',
            responseMode: 'binary',
            audioPath: 'audio',
            contentType: 'audio/mpeg',
            discoveredModels: [],
            discoveredVoices: [],
            licenseConfirmed: false,
        },
        custom: {
            endpoint: '',
            model: '',
            voice: '',
            proxyUrl: '',
            authType: 'bearer',
            responseMode: 'binary',
            audioPath: 'audio',
            contentType: 'audio/mpeg',
            discoveredModels: [],
            discoveredVoices: [],
            licenseConfirmed: false,
        },
    },
};

function uniqueStrings(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))];
}

function copyConfig(config) {
    return JSON.parse(JSON.stringify(config));
}

function loadLocalConfig() {
    if (typeof window === 'undefined') return copyConfig(DEFAULT_CONFIG);
    try {
        const stored = JSON.parse(localStorage.getItem(LOCAL_CONFIG_KEY) || '{}');
        const provider = ['system', 'openai-compatible', 'gemini', 'anthropic-custom', 'custom'].includes(stored.activeProvider)
            ? stored.activeProvider
            : 'system';
        const providers = Object.fromEntries(Object.entries(DEFAULT_CONFIG.providers).map(([key, value]) => [
            key,
            { ...value, ...(stored.providers?.[key] || {}) },
        ]));
        return { activeProvider: provider, providers };
    } catch {
        return copyConfig(DEFAULT_CONFIG);
    }
}

function splitForSpeech(value, maxLength = 220) {
    const source = String(value || '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\t\u00a0]+/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim();
    if (!source) return [];

    const segments = source.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n+/g) || [source];
    const chunks = [];
    let current = '';
    const flush = () => {
        const trimmed = current.trim();
        if (trimmed) chunks.push(trimmed);
        current = '';
    };

    for (const rawSegment of segments) {
        const segment = rawSegment.trim();
        if (!segment) {
            flush();
        } else if (segment.length > maxLength) {
            flush();
            for (let start = 0; start < segment.length; start += maxLength) {
                chunks.push(segment.slice(start, start + maxLength));
            }
        } else {
            if (current && current.length + segment.length > maxLength) flush();
            current += segment;
        }
    }
    flush();
    return chunks;
}

function languageTag(language) {
    if (language === 'en') return 'en-US';
    if (language === 'ru') return 'ru-RU';
    return 'zh-CN';
}

function voiceStorageKey(language) {
    return VOICE_STORAGE_KEY_PREFIX + (language || 'zh');
}

function secureStorageKey(provider) {
    return `tts.${provider}.apiKey`;
}

async function readLocalSecret(provider) {
    if (typeof window === 'undefined' || provider === 'system') return '';
    if (window.electronAPI?.secureGet) {
        return await window.electronAPI.secureGet(secureStorageKey(provider));
    }
    return sessionStorage.getItem(SESSION_SECRET_PREFIX + provider) || '';
}

async function writeLocalSecret(provider, value) {
    if (typeof window === 'undefined' || provider === 'system') return;
    if (window.electronAPI?.secureSet) {
        if (value) await window.electronAPI.secureSet(secureStorageKey(provider), value);
        else await window.electronAPI.secureDelete?.(secureStorageKey(provider));
        return;
    }
    if (value) sessionStorage.setItem(SESSION_SECRET_PREFIX + provider, value);
    else sessionStorage.removeItem(SESSION_SECRET_PREFIX + provider);
}

function providerNeedsKey(provider, config) {
    if (provider === 'system') return false;
    if (provider === 'custom') return (config?.authType || 'bearer') !== 'none';
    return true;
}

function providerIsComplete(provider, config) {
    if (provider === 'system') return true;
    if (!config?.licenseConfirmed) return false;
    if (provider === 'gemini') return Boolean(config.baseUrl && config.model && config.voice);
    if (provider === 'openai-compatible') return Boolean(config.endpoint && config.model && config.voice);
    return Boolean(config.endpoint);
}

function sanitizeTtsErrorText(value) {
    return String(value || '')
        .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[已隐藏密钥]')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[已隐藏密钥]')
        .replace(/((?:api[ _-]?key|x-goog-api-key|access[ _-]?token|authorization|secret)[\s"'=:\-]+)([A-Za-z0-9_.-]{8,})/gi, '$1[已隐藏密钥]')
        .slice(0, 4000);
}

function sanitizeTtsEndpoint(value) {
    try {
        const url = new URL(String(value || '').trim());
        url.username = '';
        url.password = '';
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) {
            if (/key|token|secret|auth|password/i.test(key)) url.searchParams.set(key, '[已隐藏]');
        }
        return url.toString();
    } catch {
        return sanitizeTtsErrorText(value);
    }
}

function getTtsErrorHint(status, provider, text) {
    if (status === 400) {
        return provider === 'gemini'
            ? text('请求参数不被接受。请重点检查 Gemini Base URL、TTS 模型名和音色；Base URL 通常应以 /v1beta 结尾。', 'The request was rejected. Check the Gemini Base URL, TTS model, and voice; the base URL usually ends in /v1beta.', 'Запрос отклонен. Проверьте Base URL Gemini, модель TTS и голос; обычно URL заканчивается на /v1beta.')
            : text('请求参数不被接受。请检查接口地址、模型名、音色和响应格式。', 'The request was rejected. Check the endpoint, model, voice, and response format.', 'Запрос отклонен. Проверьте endpoint, модель, голос и формат ответа.');
    }
    if (status === 401 || status === 403) return text('鉴权失败。请检查本机 API Key、密钥权限以及平台接口是否已启用。', 'Authentication failed. Check the local API key, its permissions, and whether the API is enabled.', 'Ошибка авторизации. Проверьте локальный API-ключ, права и доступность API.');
    if (status === 404) return text('接口或模型不存在。请检查 Base URL、完整端点和模型名。', 'The endpoint or model was not found. Check the base URL, full endpoint, and model name.', 'Endpoint или модель не найдены. Проверьте Base URL, полный endpoint и имя модели.');
    if (status === 429) return text('请求被限流或额度不足。请稍后重试，并检查平台配额与余额。', 'The request was rate-limited or quota is exhausted. Retry later and check provider quota or balance.', 'Лимит запросов или квота исчерпаны. Повторите позже и проверьте квоту или баланс.');
    if (status >= 500) return text('音源服务暂时异常。可稍后重试，并检查代理或服务端状态。', 'The voice service is temporarily unavailable. Retry later and check the proxy or provider status.', 'Сервис голосов временно недоступен. Повторите позже и проверьте прокси или статус провайдера.');
    return text('请根据下方原始错误检查音源配置；错误详情中不会包含 API Key。', 'Use the original error below to check the voice configuration. API keys are excluded from the details.', 'Проверьте настройки по исходной ошибке ниже. API-ключ не включается в сведения.');
}

export default function DesktopTtsControls({ editor, chapterId }) {
    const { text, language } = useI18n();
    const rateRef = useRef(1);
    const runRef = useRef({ id: 0, chunks: [], index: 0 });
    const audioRef = useRef(null);
    const audioUrlRef = useRef('');
    const audioResolverRef = useRef(null);
    const abortRef = useRef(null);

    const [supported, setSupported] = useState(false);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [errorDetails, setErrorDetails] = useState(null);
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);
    const [errorCopied, setErrorCopied] = useState(false);
    const [voices, setVoices] = useState([]);
    const [config, setConfig] = useState(loadLocalConfig);
    const [draft, setDraft] = useState(() => copyConfig(loadLocalConfig()));
    const [secret, setSecret] = useState('');
    const [secretLoaded, setSecretLoaded] = useState(false);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [saveState, setSaveState] = useState('idle');
    const [connectionState, setConnectionState] = useState({ status: 'idle', message: '' });
    const [voiceSelections, setVoiceSelections] = useState(() => {
        if (typeof window === 'undefined') return {};
        return {
            zh: localStorage.getItem(voiceStorageKey('zh')) || '',
            en: localStorage.getItem(voiceStorageKey('en')) || '',
            ru: localStorage.getItem(voiceStorageKey('ru')) || '',
        };
    });
    const [rate, setRate] = useState(() => {
        if (typeof window === 'undefined') return 1;
        const stored = Number(localStorage.getItem(RATE_STORAGE_KEY));
        return RATE_OPTIONS.includes(stored) ? stored : 1;
    });

    const activeProvider = config.activeProvider;
    const activeConfig = useMemo(
        () => config.providers[activeProvider] || {},
        [activeProvider, config.providers],
    );
    const voiceUri = voiceSelections[language] || '';
    const draftProvider = draft.activeProvider;
    const draftProviderConfig = draft.providers[draftProvider] || {};
    const modelCandidates = useMemo(() => uniqueStrings(draftProviderConfig.discoveredModels), [draftProviderConfig.discoveredModels]);
    const voiceCandidates = useMemo(() => uniqueStrings([
        ...(draftProvider === 'gemini' ? GEMINI_VOICES : []),
        ...(Array.isArray(draftProviderConfig.discoveredVoices) ? draftProviderConfig.discoveredVoices : []),
    ]), [draftProvider, draftProviderConfig.discoveredVoices]);
    const discoveryAddress = draftProvider === 'gemini' ? draftProviderConfig.baseUrl : draftProviderConfig.endpoint;
    const canDiscover = secretLoaded
        && Boolean(String(discoveryAddress || '').trim())
        && (!providerNeedsKey(draftProvider, draftProviderConfig) || Boolean(secret.trim()));

    const reportTtsError = useCallback((details = {}) => {
        const message = sanitizeTtsErrorText(details.message || details.detail || 'TTS 请求失败');
        setErrorMessage(message);
        setErrorDetails({
            ...details,
            message,
            detail: sanitizeTtsErrorText(details.detail || message),
            endpoint: sanitizeTtsEndpoint(details.endpoint),
            occurredAt: new Date().toISOString(),
        });
        setErrorCopied(false);
        setErrorDialogOpen(true);
        setStatus('error');
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSupported('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!supported) return undefined;
        const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
        loadVoices();
        window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    }, [supported]);

    useEffect(() => {
        rateRef.current = rate;
        localStorage.setItem(RATE_STORAGE_KEY, String(rate));
    }, [rate]);

    useEffect(() => {
        if (!popoverOpen) return undefined;
        let current = true;
        setConnectionState({ status: 'idle', message: '' });
        setSecret('');
        setSecretLoaded(draftProvider === 'system');
        if (draftProvider !== 'system') {
            readLocalSecret(draftProvider)
                .then(value => {
                    if (current) {
                        setSecret(value);
                        setSecretLoaded(true);
                    }
                })
                .catch(() => {
                    if (current) setSecretLoaded(true);
                });
        }
        return () => {
            current = false;
        };
    }, [draftProvider, popoverOpen]);


    const compatibleVoices = useMemo(() => {
        const prefix = languageTag(language).slice(0, 2).toLowerCase();
        const matches = voices.filter(voice => String(voice.lang || '').toLowerCase().startsWith(prefix));
        const source = matches.length > 0 ? matches : voices;
        return [...source].sort((a, b) => Number(b.default) - Number(a.default) || a.name.localeCompare(b.name));
    }, [language, voices]);

    const selectedVoice = useMemo(
        () => voices.find(voice => voice.voiceURI === voiceUri) || null,
        [voiceUri, voices],
    );

    const releaseAudio = useCallback(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
        }
        audioRef.current = null;
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = '';
    }, []);

    const cancel = useCallback(() => {
        runRef.current = { id: runRef.current.id + 1, chunks: [], index: 0 };
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
        abortRef.current?.abort();
        abortRef.current = null;
        audioResolverRef.current?.(false);
        audioResolverRef.current = null;
        releaseAudio();
    }, [releaseAudio]);

    const stop = useCallback(() => {
        cancel();
        setErrorMessage('');
        setErrorDetails(null);
        setErrorDialogOpen(false);
        setErrorCopied(false);
        setStatus('idle');
    }, [cancel]);

    useEffect(() => {
        cancel();
        const timer = window.setTimeout(() => {
            setStatus('idle');
            setErrorMessage('');
            setErrorDetails(null);
            setErrorDialogOpen(false);
            setErrorCopied(false);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [activeProvider, cancel, chapterId, language]);

    useEffect(() => cancel, [cancel]);

    const playSystem = useCallback((chunks, runId) => {
        runRef.current = { id: runId, chunks, index: 0 };
        const next = () => {
            const run = runRef.current;
            if (run.id !== runId) return;
            if (run.index >= run.chunks.length) {
                runRef.current = { id: runId, chunks: [], index: 0 };
                setStatus('idle');
                return;
            }
            const utterance = new SpeechSynthesisUtterance(run.chunks[run.index]);
            utterance.lang = selectedVoice?.lang || languageTag(language);
            utterance.rate = rateRef.current;
            if (selectedVoice) utterance.voice = selectedVoice;
            utterance.onend = () => {
                if (runRef.current.id !== runId) return;
                runRef.current.index += 1;
                next();
            };
            utterance.onerror = event => {
                if (runRef.current.id === runId && event.error !== 'canceled' && event.error !== 'interrupted') {
                    reportTtsError({
                        message: text('系统朗读失败', 'System speech failed', 'Ошибка системного чтения'),
                        detail: event.error || 'SpeechSynthesis error',
                        provider: 'system',
                        stage: 'speech-synthesis',
                        chunkIndex: run.index + 1,
                        chunkTotal: run.chunks.length,
                    });
                }
            };
            window.speechSynthesis.speak(utterance);
        };
        next();
    }, [language, reportTtsError, selectedVoice, text]);

    const playRemote = useCallback(async (chunks, provider, providerConfig, apiKey, runId) => {
        runRef.current = { id: runId, chunks, index: 0 };
        try {
            while (runRef.current.id === runId && runRef.current.index < chunks.length) {
                const controller = new AbortController();
                abortRef.current = controller;
                const response = await fetch(apiPath('/api/tts'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    signal: controller.signal,
                    body: JSON.stringify({
                        input: chunks[runRef.current.index],
                        provider,
                        apiKey,
                        config: {
                            ...providerConfig,
                            speed: rateRef.current,
                            language: languageTag(language),
                        },
                    }),
                });
                abortRef.current = null;
                if (!response.ok) {
                    const raw = await response.text().catch(() => '');
                    let data = {};
                    try {
                        data = JSON.parse(raw);
                    } catch {
                        data = {};
                    }
                    const detail = sanitizeTtsErrorText(data.error || data.message || raw || `TTS HTTP ${response.status}`);
                    const requestError = new Error(detail);
                    requestError.ttsDetails = {
                        stage: 'request',
                        detail,
                        httpStatus: response.status,
                        httpStatusText: response.statusText,
                        upstreamCode: data?.details?.status || data?.details?.code || '',
                        requestId: data?.details?.requestId || response.headers.get('x-request-id') || response.headers.get('request-id') || '',
                    };
                    throw requestError;
                }
                const blob = await response.blob();
                if (runRef.current.id !== runId) return;
                const audioUrl = URL.createObjectURL(blob);
                audioUrlRef.current = audioUrl;
                const audio = new Audio(audioUrl);
                audioRef.current = audio;
                const completed = await new Promise((resolve, reject) => {
                    audioResolverRef.current = resolve;
                    audio.onended = () => resolve(true);
                    audio.onerror = () => reject(new Error('音频格式无法播放'));
                    audio.play().catch(reject);
                });
                audioResolverRef.current = null;
                releaseAudio();
                if (!completed || runRef.current.id !== runId) return;
                runRef.current.index += 1;
            }
            if (runRef.current.id === runId) {
                runRef.current = { id: runId, chunks: [], index: 0 };
                setStatus('idle');
            }
        } catch (error) {
            abortRef.current = null;
            releaseAudio();
            if (runRef.current.id !== runId || error?.name === 'AbortError') return;
            const requestDetails = error?.ttsDetails || {};
            reportTtsError({
                ...requestDetails,
                message: requestDetails.stage === 'request'
                    ? text('远程音源请求失败', 'Remote voice request failed', 'Ошибка запроса к удаленному голосу')
                    : text('音频播放失败', 'Audio playback failed', 'Ошибка воспроизведения аудио'),
                detail: requestDetails.detail || error?.message || 'TTS 请求失败',
                provider,
                model: providerConfig.model || '',
                voice: providerConfig.voice || '',
                endpoint: provider === 'gemini' ? providerConfig.baseUrl : providerConfig.endpoint,
                chunkIndex: Math.min(runRef.current.index + 1, chunks.length),
                chunkTotal: chunks.length,
            });
        }
    }, [language, releaseAudio, reportTtsError, text]);


    const start = useCallback(async () => {
        if (!editor || editor.isDestroyed) return;
        if (activeProvider === 'system' && !supported) {
            reportTtsError({
                message: text('系统不支持文字朗读', 'System text-to-speech is unavailable', 'Системный синтез речи недоступен'),
                detail: text('当前 Windows 或浏览器没有可用的 SpeechSynthesis 接口。', 'No SpeechSynthesis API is available in the current Windows or browser environment.', 'В текущей среде Windows или браузера недоступен SpeechSynthesis API.'),
                provider: 'system',
                stage: 'availability',
            });
            return;
        }
        if (!providerIsComplete(activeProvider, activeConfig)) {
            setDraft(copyConfig(config));
            setSaveState('idle');
            setErrorMessage(text('请先完成本机音源配置并确认授权', 'Complete the local voice setup and confirm authorization', 'Настройте локальный голос и подтвердите права'));
            setPopoverOpen(true);
            return;
        }

        let apiKey = '';
        if (providerNeedsKey(activeProvider, activeConfig)) {
            apiKey = await readLocalSecret(activeProvider).catch(() => '');
            if (!apiKey) {
                setDraft(copyConfig(config));
                setSaveState('idle');
                setErrorMessage(text('请先填写此音源的 API Key', 'Enter the API key for this voice', 'Введите API-ключ для этого голоса'));
                setPopoverOpen(true);
                return;
            }
        }

        const { from, to, empty } = editor.state.selection;
        const selected = empty ? '' : editor.state.doc.textBetween(from, to, '\n', ' ').trim();
        const chunks = splitForSpeech(selected || editor.getText(), activeProvider === 'system' ? 220 : 1000);
        if (chunks.length === 0) {
            setStatus('empty');
            return;
        }

        cancel();
        const runId = runRef.current.id;
        setErrorMessage('');
        setErrorDetails(null);
        setErrorDialogOpen(false);
        setErrorCopied(false);
        setStatus('speaking');
        if (activeProvider === 'system') playSystem(chunks, runId);
        else void playRemote(chunks, activeProvider, activeConfig, apiKey, runId);
    }, [activeConfig, activeProvider, cancel, config, editor, playRemote, playSystem, reportTtsError, supported, text]);

    const toggle = () => {
        if (status === 'speaking') {
            if (activeProvider === 'system') window.speechSynthesis.pause();
            else audioRef.current?.pause();
            setStatus('paused');
        } else if (status === 'paused') {
            if (activeProvider === 'system') window.speechSynthesis.resume();
            else audioRef.current?.play().catch(error => reportTtsError({
                message: text('音频播放失败', 'Audio playback failed', 'Ошибка воспроизведения аудио'),
                detail: error?.message || 'Audio playback failed',
                provider: activeProvider,
                model: activeConfig.model || '',
                voice: activeConfig.voice || '',
                endpoint: activeProvider === 'gemini' ? activeConfig.baseUrl : activeConfig.endpoint,
                stage: 'playback',
            }));
            setStatus('speaking');
        } else {
            void start();
        }
    };

    const changeVoice = event => {
        const nextVoiceUri = event.target.value;
        stop();
        setVoiceSelections(previous => ({ ...previous, [language]: nextVoiceUri }));
        localStorage.setItem(voiceStorageKey(language), nextVoiceUri);
    };

    const updateDraftProvider = (field, value) => {
        setDraft(previous => ({
            ...previous,
            providers: {
                ...previous.providers,
                [previous.activeProvider]: {
                    ...previous.providers[previous.activeProvider],
                    [field]: value,
                },
            },
        }));
        setSaveState('idle');
        if (['endpoint', 'baseUrl', 'proxyUrl', 'authType'].includes(field)) {
            setConnectionState({ status: 'idle', message: '' });
        }
    };

    const connectAndDiscover = async () => {
        if (!canDiscover) {
            setConnectionState({ status: 'error', message: text('请先填写接口地址和 API Key', 'Enter the endpoint URL and API key first', 'Сначала укажите endpoint и API key') });
            return;
        }
        setConnectionState({ status: 'loading', message: text('正在连接并读取模型、音色…', 'Connecting and fetching models and voices…', 'Подключение и загрузка моделей и голосов…') });
        try {
            const response = await fetch(apiPath('/api/tts/discover'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify({ provider: draftProvider, apiKey: secret, config: draftProviderConfig }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            const discoveredModels = uniqueStrings(data.models);
            const discoveredVoices = uniqueStrings(data.voices);
            setDraft(previous => ({
                ...previous,
                providers: {
                    ...previous.providers,
                    [draftProvider]: {
                        ...previous.providers[draftProvider],
                        discoveredModels,
                        discoveredVoices,
                        model: previous.providers[draftProvider]?.model || discoveredModels[0] || '',
                        voice: previous.providers[draftProvider]?.voice || discoveredVoices[0] || '',
                    },
                },
            }));
            const discoveryUnavailable = data.discoveryAvailable === false;
            const fallbackNote = data.voiceSource === 'known' && !discoveryUnavailable
                ? text('；接口未提供音色目录，已列出常见候选', '; the endpoint has no voice catalog, so common candidates are shown', '; endpoint не вернул каталог голосов, показаны типовые варианты')
                : '';
            setConnectionState({
                status: discoveryUnavailable ? 'warning' : 'success',
                message: discoveryUnavailable
                    ? (data.warning || text(
                        '当前服务没有开放模型/音色目录；已保留手动模型和常见音色，可保存后试播。',
                        'This service does not expose model/voice catalogs. Manual model and common voice options remain available.',
                        'Сервис не предоставляет каталоги моделей и голосов; доступны ручная модель и типовые голоса.',
                    ))
                    : text(
                        `连接成功，获取 ${discoveredModels.length} 个模型、${discoveredVoices.length} 个音色${fallbackNote}`,
                        `Connected: ${discoveredModels.length} models and ${discoveredVoices.length} voices${fallbackNote}`,
                        `Подключено: моделей ${discoveredModels.length}, голосов ${discoveredVoices.length}${fallbackNote}`,
                    ),
            });
        } catch (error) {
            setConnectionState({ status: 'error', message: error?.message || text('连接失败', 'Connection failed', 'Ошибка подключения') });
        }
    };

    const saveLocalConfig = async () => {
        if (draftProvider !== 'system' && !draftProviderConfig.licenseConfirmed) {
            setSaveState('license');
            return;
        }
        try {
            await writeLocalSecret(draftProvider, secret);
            const next = copyConfig(draft);
            localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(next));
            stop();
            setConfig(next);
            setSaveState('saved');
            window.setTimeout(() => setPopoverOpen(false), 350);
        } catch {
            setSaveState('error');
        }
    };

    const providerLabel = provider => {
        if (provider === 'openai-compatible') return text('OpenAI 兼容', 'OpenAI-compatible', 'Совместимо с OpenAI');
        if (provider === 'gemini') return text('Gemini 兼容', 'Gemini-compatible', 'Совместимо с Gemini');
        if (provider === 'anthropic-custom') return text('Claude 兼容', 'Claude-compatible', 'Совместимо с Claude');
        if (provider === 'custom') return text('自建兼容 HTTP', 'Custom compatible HTTP', 'Свой совместимый HTTP');
        return text('系统音源', 'System voice', 'Системный голос');
    };

    const errorHint = errorDetails ? getTtsErrorHint(Number(errorDetails.httpStatus) || 0, errorDetails.provider, text) : '';
    const errorReport = errorDetails ? [
        `[Author TTS] ${errorDetails.message}`,
        `${text('时间', 'Time', 'Время')}: ${new Date(errorDetails.occurredAt).toLocaleString()}`,
        `${text('音源', 'Provider', 'Провайдер')}: ${providerLabel(errorDetails.provider)}`,
        errorDetails.httpStatus ? `HTTP: ${errorDetails.httpStatus} ${errorDetails.httpStatusText || ''}`.trim() : '',
        errorDetails.upstreamCode ? `${text('上游错误码', 'Upstream code', 'Код upstream')}: ${errorDetails.upstreamCode}` : '',
        errorDetails.requestId ? `Request ID: ${errorDetails.requestId}` : '',
        errorDetails.model ? `${text('模型', 'Model', 'Модель')}: ${errorDetails.model}` : '',
        errorDetails.voice ? `${text('音色', 'Voice', 'Голос')}: ${errorDetails.voice}` : '',
        errorDetails.endpoint ? `Endpoint: ${errorDetails.endpoint}` : '',
        errorDetails.chunkTotal ? `${text('分段', 'Segment', 'Сегмент')}: ${errorDetails.chunkIndex || 1}/${errorDetails.chunkTotal}` : '',
        '',
        `${text('原始错误', 'Original error', 'Исходная ошибка')}:`,
        errorDetails.detail,
        '',
        `${text('排查建议', 'Suggestion', 'Рекомендация')}:`,
        errorHint,
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n') : '';

    const copyErrorReport = async () => {
        if (!errorReport) return;
        try {
            await navigator.clipboard.writeText(errorReport);
            setErrorCopied(true);
            window.setTimeout(() => setErrorCopied(false), 1600);
        } catch {
            setErrorCopied(false);
        }
    };

    const openSettingsFromError = () => {
        setErrorDialogOpen(false);
        setDraft(copyConfig(config));
        setSaveState('idle');
        setConnectionState({ status: 'idle', message: '' });
        setPopoverOpen(true);
    };

    const providerSummary = activeProvider === 'system'
        ? ''
        : `${providerLabel(activeProvider)} · ${activeConfig.voice || activeConfig.model || text('未配置', 'Not configured', 'Не настроено')}`;
    const active = status === 'speaking' || status === 'paused';
    const title = status === 'speaking'
        ? text('暂停朗读', 'Pause reading', 'Приостановить чтение')
        : status === 'paused'
            ? text('继续朗读', 'Resume reading', 'Продолжить чтение')
            : status === 'empty'
                ? text('没有可朗读的文字', 'No text to read', 'Нет текста для чтения')
                : status === 'error'
                    ? (errorMessage || text('朗读失败，点击重试', 'Reading failed; click to retry', 'Ошибка чтения; нажмите для повтора'))
                    : text('朗读选中文字或当前章节', 'Read selection or current chapter', 'Прочитать выделение или текущую главу');
    const rateIndex = RATE_OPTIONS.indexOf(rate);

    return (
        <div className="status-tts-controls" data-popover-open={popoverOpen ? 'true' : 'false'} aria-label={text('文字朗读', 'Text to speech', 'Синтез речи')} onPointerDown={event => event.stopPropagation()}>
            <button type="button" className={'status-tts-button' + (active ? ' active' : '')} onClick={status === 'error' && errorDetails ? () => setErrorDialogOpen(true) : toggle} title={title}>
                {status === 'speaking' ? <Pause size={14} /> : status === 'paused' ? <Play size={14} /> : <Volume2 size={14} />}
            </button>
            {active && (
                <button type="button" className="status-tts-button" onClick={stop} title={text('停止朗读', 'Stop reading', 'Остановить чтение')}>
                    <Square size={12} />
                </button>
            )}
            {activeProvider === 'system' ? (
                <select className="status-tts-voice" value={voiceUri} onChange={changeVoice} disabled={!supported || compatibleVoices.length === 0} title={text('朗读音源', 'Reading voice', 'Голос чтения')} aria-label={text('朗读音源', 'Reading voice', 'Голос чтения')}>
                    <option value="">{text('系统默认音源', 'System default voice', 'Системный голос')}</option>
                    {compatibleVoices.map(voice => (
                        <option key={voice.voiceURI + voice.name} value={voice.voiceURI}>
                            {voice.name} · {voice.lang}
                        </option>
                    ))}
                </select>
            ) : (
                <button type="button" className="status-tts-provider" onClick={() => {
                    setDraft(copyConfig(config));
                    setSaveState('idle');
                    setErrorMessage('');
                    setPopoverOpen(previous => !previous);
                }} title={providerSummary}>
                    {providerSummary}
                </button>
            )}
            <button type="button" className="status-tts-rate" onClick={() => setRate(RATE_OPTIONS[(rateIndex + 1) % RATE_OPTIONS.length])} title={text('朗读语速', 'Reading speed', 'Скорость чтения')}>
                {rate}×
            </button>
            <button type="button" className="status-tts-button" onClick={() => {
                setDraft(copyConfig(config));
                setSaveState('idle');
                setErrorMessage('');
                setPopoverOpen(previous => !previous);
            }} title={text('本机音源设置', 'Local voice settings', 'Локальные настройки голоса')}>
                <Settings2 size={13} />
            </button>

            {popoverOpen && createPortal(
                <div className="tts-config-backdrop" onPointerDown={event => {
                    if (event.target === event.currentTarget) setPopoverOpen(false);
                }}>
                    <div className="tts-config-popover" role="dialog" aria-modal="true" aria-label={text('本机 TTS 音源设置', 'Local TTS voice settings', 'Локальные настройки TTS')} onPointerDown={event => event.stopPropagation()}>
                        <div className="tts-config-header">
                            <div className="tts-config-heading">
                                <span className="tts-config-heading-icon"><Settings2 size={16} /></span>
                                <div>
                                    <strong>{text('本机音源设置', 'Local voice settings', 'Локальные настройки голоса')}</strong>
                                    <span>{text('选择协议兼容端点，不内置国外平台直连地址', 'Choose protocol-compatible endpoints; no direct foreign-provider URLs are built in', 'Выберите совместимый endpoint без встроенных прямых адресов')}</span>
                                </div>
                            </div>
                            <button type="button" onClick={() => setPopoverOpen(false)} aria-label={text('关闭', 'Close', 'Закрыть')}><X size={16} /></button>
                        </div>

                        <div className="tts-config-body">
                            <div className="tts-privacy-notice">
                                <ShieldCheck size={15} />
                                <span>{text('配置与密钥仅保存在当前设备，不进入作品数据和云同步。', 'Configuration and keys stay on this device and never enter project data or cloud sync.', 'Настройки и ключи хранятся только на этом устройстве.')}</span>
                            </div>

                            {errorMessage && <div className="tts-config-message error">{errorMessage}</div>}

                            <div className="tts-provider-section">
                                <div className="tts-section-label">{text('音源协议', 'Voice protocol', 'Протокол голоса')}</div>
                                <div className="tts-provider-grid">
                                    {[
                                        { key: 'system', label: text('系统音源', 'System', 'Системный'), description: text('免费 · 无需密钥', 'Free · no key', 'Бесплатно · без ключа') },
                                        { key: 'openai-compatible', label: text('OpenAI 兼容', 'OpenAI-compatible', 'OpenAI-compatible'), description: '/v1/audio/speech' },
                                        { key: 'gemini', label: text('Gemini 兼容', 'Gemini-compatible', 'Gemini-compatible'), description: 'generateContent' },
                                        { key: 'anthropic-custom', label: text('Claude 兼容', 'Claude-compatible', 'Claude-compatible'), description: text('自建 TTS', 'Custom TTS', 'Свой TTS') },
                                        { key: 'custom', label: text('自建兼容', 'Custom compatible', 'Свой compatible'), description: text('自定义鉴权与响应', 'Custom auth and response', 'Своя авторизация') },
                                    ].map(option => (
                                        <button
                                            key={option.key}
                                            type="button"
                                            className={'tts-provider-choice' + (draftProvider === option.key ? ' active' : '')}
                                            onClick={() => {
                                                setDraft(previous => ({ ...previous, activeProvider: option.key }));
                                                setSaveState('idle');
                                                setConnectionState({ status: 'idle', message: '' });
                                            }}
                                        >
                                            <strong>{option.label}</strong>
                                            <span>{option.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {draftProvider === 'system' ? (
                                <div className="tts-config-note">
                                    {text('调用 Windows 或浏览器已安装的声音，不需要网络密钥，也不会产生平台费用。', 'Uses voices installed in Windows or the browser. No network key or provider charge.', 'Использует установленные системные голоса без сетевого ключа и оплаты.')}
                                </div>
                            ) : (
                                <>
                                    {draftProvider === 'openai-compatible' && (
                                        <>
                                            <label className="tts-config-field">
                                                <span>{text('完整接口地址', 'Full endpoint URL', 'Полный URL endpoint')}</span>
                                                <input value={draftProviderConfig.endpoint || ''} onChange={event => updateDraftProvider('endpoint', event.target.value)} placeholder="https://example.com/v1/audio/speech" />
                                            </label>
                                            <div className="tts-config-grid">
                                                <label className="tts-config-field">
                                                    <span>{text('模型', 'Model', 'Модель')}</span>
                                                    <input list="tts-discovered-models" value={draftProviderConfig.model || ''} onChange={event => updateDraftProvider('model', event.target.value)} placeholder="tts-1" />
                                                </label>
                                                <label className="tts-config-field">
                                                    <span>{text('声音 ID', 'Voice ID', 'ID голоса')}</span>
                                                    <input list="tts-discovered-voices" value={draftProviderConfig.voice || ''} onChange={event => updateDraftProvider('voice', event.target.value)} placeholder="alloy" />
                                                </label>
                                            </div>
                                            <label className="tts-config-field">
                                                <span>{text('音频格式', 'Audio format', 'Формат аудио')}</span>
                                                <select value={draftProviderConfig.responseFormat || 'mp3'} onChange={event => updateDraftProvider('responseFormat', event.target.value)}>
                                                    <option value="mp3">MP3</option>
                                                    <option value="wav">WAV</option>
                                                    <option value="opus">Opus</option>
                                                    <option value="aac">AAC</option>
                                                    <option value="flac">FLAC</option>
                                                </select>
                                            </label>
                                        </>
                                    )}

                                    {draftProvider === 'gemini' && (
                                        <>
                                            <label className="tts-config-field">
                                                <span>API Base URL</span>
                                                <input value={draftProviderConfig.baseUrl || ''} onChange={event => updateDraftProvider('baseUrl', event.target.value)} placeholder="https://your-relay.example.com/v1beta" />
                                            </label>
                                            <div className="tts-config-grid">
                                                <label className="tts-config-field">
                                                    <span>{text('模型', 'Model', 'Модель')}</span>
                                                    <input list="tts-discovered-models" value={draftProviderConfig.model || ''} onChange={event => updateDraftProvider('model', event.target.value)} placeholder="gemini-3.1-flash-tts-preview" />
                                                </label>
                                                <label className="tts-config-field">
                                                    <span>{text('声音 ID', 'Voice ID', 'ID голоса')}</span>
                                                    <input list="tts-discovered-voices" value={draftProviderConfig.voice || ''} onChange={event => updateDraftProvider('voice', event.target.value)} placeholder="Kore" />
                                                </label>
                                            </div>
                                        </>
                                    )}

                                    {(draftProvider === 'anthropic-custom' || draftProvider === 'custom') && (
                                        <>
                                            <label className="tts-config-field">
                                                <span>{text('完整接口地址', 'Full endpoint URL', 'Полный URL endpoint')}</span>
                                                <input value={draftProviderConfig.endpoint || ''} onChange={event => updateDraftProvider('endpoint', event.target.value)} placeholder="https://example.com/v1/audio/speech" />
                                            </label>
                                            <div className="tts-config-grid">
                                                <label className="tts-config-field">
                                                    <span>{text('模型', 'Model', 'Модель')}</span>
                                                    <input list="tts-discovered-models" value={draftProviderConfig.model || ''} onChange={event => updateDraftProvider('model', event.target.value)} />
                                                </label>
                                                <label className="tts-config-field">
                                                    <span>{text('声音 ID', 'Voice ID', 'ID голоса')}</span>
                                                    <input list="tts-discovered-voices" value={draftProviderConfig.voice || ''} onChange={event => updateDraftProvider('voice', event.target.value)} />
                                                </label>
                                            </div>
                                        </>
                                    )}

                                    <datalist id="tts-discovered-models">
                                        {modelCandidates.map(model => <option key={model} value={model} />)}
                                    </datalist>
                                    <datalist id="tts-discovered-voices">
                                        {voiceCandidates.map(voice => <option key={voice} value={voice} />)}
                                    </datalist>

                                    <div className="tts-connect-row">
                                        <label className="tts-config-field tts-key-field">
                                            <span>API Key</span>
                                            <input
                                                className="tts-secret-input"
                                                type="text"
                                                name={`tts-local-token-${draftProvider}`}
                                                autoComplete="one-time-code"
                                                autoCapitalize="none"
                                                autoCorrect="off"
                                                spellCheck={false}
                                                data-form-type="other"
                                                data-lpignore="true"
                                                data-1p-ignore="true"
                                                value={secret}
                                                disabled={!secretLoaded}
                                                onChange={event => {
                                                    setSecret(event.target.value);
                                                    setConnectionState({ status: 'idle', message: '' });
                                                }}
                                                placeholder={secretLoaded ? text('仅保存在本机', 'Stored locally only', 'Только локально') : text('正在读取本机密钥…', 'Loading local key…', 'Загрузка локального ключа…')}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            className="tts-discover-button"
                                            disabled={!canDiscover || connectionState.status === 'loading'}
                                            onClick={() => void connectAndDiscover()}
                                        >
                                            <RefreshCw size={13} className={connectionState.status === 'loading' ? 'spinning' : ''} />
                                            {connectionState.status === 'loading'
                                                ? text('连接中…', 'Connecting…', 'Подключение…')
                                                : text('连接并获取', 'Connect & fetch', 'Подключить и загрузить')}
                                        </button>
                                    </div>

                                    {connectionState.status !== 'idle' && (
                                        <div className={`tts-discovery-message ${connectionState.status}`}>
                                            {connectionState.message}
                                        </div>
                                    )}

                                    {draftProvider === 'custom' && (
                                        <label className="tts-config-field">
                                            <span>{text('鉴权方式', 'Authentication', 'Авторизация')}</span>
                                            <select value={draftProviderConfig.authType || 'bearer'} onChange={event => updateDraftProvider('authType', event.target.value)}>
                                                <option value="bearer">Authorization: Bearer</option>
                                                <option value="x-api-key">x-api-key</option>
                                                <option value="x-goog-api-key">x-goog-api-key</option>
                                                <option value="none">{text('无鉴权', 'No authentication', 'Без авторизации')}</option>
                                            </select>
                                        </label>
                                    )}

                                    {(draftProvider === 'anthropic-custom' || draftProvider === 'custom') && (
                                        <>
                                            <label className="tts-config-field">
                                                <span>{text('响应格式', 'Response format', 'Формат ответа')}</span>
                                                <select value={draftProviderConfig.responseMode || 'binary'} onChange={event => updateDraftProvider('responseMode', event.target.value)}>
                                                    <option value="binary">{text('直接返回音频二进制', 'Raw audio binary', 'Аудио в бинарном виде')}</option>
                                                    <option value="json-base64">JSON Base64</option>
                                                </select>
                                            </label>
                                            {draftProviderConfig.responseMode === 'json-base64' && (
                                                <div className="tts-config-grid">
                                                    <label className="tts-config-field">
                                                        <span>{text('音频字段路径', 'Audio field path', 'Путь поля аудио')}</span>
                                                        <input value={draftProviderConfig.audioPath || ''} onChange={event => updateDraftProvider('audioPath', event.target.value)} placeholder="audio" />
                                                    </label>
                                                    <label className="tts-config-field">
                                                        <span>Content-Type</span>
                                                        <input value={draftProviderConfig.contentType || ''} onChange={event => updateDraftProvider('contentType', event.target.value)} placeholder="audio/mpeg" />
                                                    </label>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <label className="tts-config-field">
                                        <span>{text('代理地址（可选）', 'Proxy URL (optional)', 'Прокси URL (необязательно)')}</span>
                                        <input value={draftProviderConfig.proxyUrl || ''} onChange={event => updateDraftProvider('proxyUrl', event.target.value)} placeholder="http://127.0.0.1:7890" />
                                    </label>

                                    <label className="tts-license-confirm">
                                        <input type="checkbox" checked={Boolean(draftProviderConfig.licenseConfirmed)} onChange={event => updateDraftProvider('licenseConfirmed', event.target.checked)} />
                                        <span>{text('我确认拥有该音源及生成输出的使用授权，并遵守对应平台条款。', 'I confirm I have rights to use this voice and its output and will follow the provider terms.', 'Я подтверждаю права на голос и его результаты и соблюдаю условия провайдера.')}</span>
                                    </label>
                                </>
                            )}
                        </div>

                        <div className="tts-config-footer">
                            {saveState === 'license' && <span className="tts-save-error">{text('请先确认授权', 'Confirm authorization first', 'Сначала подтвердите права')}</span>}
                            {saveState === 'error' && <span className="tts-save-error">{text('本机保存失败', 'Local save failed', 'Ошибка локального сохранения')}</span>}
                            <button type="button" className="tts-config-save" onClick={() => void saveLocalConfig()}>
                                {saveState === 'saved' ? <Check size={14} /> : null}
                                {saveState === 'saved' ? text('已保存', 'Saved', 'Сохранено') : text('保存到本机', 'Save locally', 'Сохранить локально')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {errorDialogOpen && errorDetails && createPortal(
                <div className="tts-error-backdrop" onPointerDown={event => {
                    if (event.target === event.currentTarget) setErrorDialogOpen(false);
                }}>
                    <div className="tts-error-dialog" role="dialog" aria-modal="true" aria-label={text('朗读错误详情', 'Speech error details', 'Подробности ошибки озвучивания')} onPointerDown={event => event.stopPropagation()}>
                        <div className="tts-error-header">
                            <span className="tts-error-icon"><AlertTriangle size={18} /></span>
                            <div className="tts-error-heading">
                                <strong>{text('朗读失败', 'Speech failed', 'Ошибка озвучивания')}</strong>
                                <span>
                                    {providerLabel(errorDetails.provider)}
                                    {errorDetails.httpStatus ? ` · HTTP ${errorDetails.httpStatus}` : ''}
                                </span>
                            </div>
                            <button type="button" onClick={() => setErrorDialogOpen(false)} aria-label={text('关闭', 'Close', 'Закрыть')}><X size={16} /></button>
                        </div>

                        <div className="tts-error-body">
                            <div className="tts-error-summary">{errorDetails.message}</div>

                            <div className="tts-error-meta">
                                {errorDetails.httpStatus ? <div><span>HTTP</span><strong>{errorDetails.httpStatus} {errorDetails.httpStatusText || ''}</strong></div> : null}
                                {errorDetails.model ? <div><span>{text('模型', 'Model', 'Модель')}</span><strong>{errorDetails.model}</strong></div> : null}
                                {errorDetails.voice ? <div><span>{text('音色', 'Voice', 'Голос')}</span><strong>{errorDetails.voice}</strong></div> : null}
                                {errorDetails.chunkTotal ? <div><span>{text('失败分段', 'Failed segment', 'Сегмент')}</span><strong>{errorDetails.chunkIndex || 1}/{errorDetails.chunkTotal}</strong></div> : null}
                                {errorDetails.upstreamCode ? <div><span>{text('上游错误码', 'Upstream code', 'Код upstream')}</span><strong>{errorDetails.upstreamCode}</strong></div> : null}
                                {errorDetails.requestId ? <div><span>Request ID</span><strong>{errorDetails.requestId}</strong></div> : null}
                                {errorDetails.endpoint ? <div className="wide"><span>Endpoint</span><strong>{errorDetails.endpoint}</strong></div> : null}
                            </div>

                            <div className="tts-error-section">
                                <span>{text('原始错误', 'Original error', 'Исходная ошибка')}</span>
                                <pre>{errorDetails.detail}</pre>
                            </div>

                            <div className="tts-error-hint">
                                <strong>{text('排查建议', 'Suggestion', 'Рекомендация')}</strong>
                                <span>{errorHint}</span>
                            </div>

                            <div className="tts-error-privacy">
                                <ShieldCheck size={13} />
                                <span>{text('错误详情已过滤 API Key，可安全复制给开发者排查。', 'API keys are filtered from these details, so they can be copied safely for debugging.', 'API-ключи отфильтрованы; сведения можно безопасно скопировать для диагностики.')}</span>
                            </div>
                        </div>

                        <div className="tts-error-footer">
                            <button type="button" className="tts-error-copy" onClick={() => void copyErrorReport()}>
                                {errorCopied ? <Check size={14} /> : <Copy size={14} />}
                                {errorCopied ? text('已复制', 'Copied', 'Скопировано') : text('复制详情', 'Copy details', 'Копировать')}
                            </button>
                            {errorDetails.provider !== 'system' ? (
                                <button type="button" onClick={openSettingsFromError}>{text('音源设置', 'Voice settings', 'Настройки голоса')}</button>
                            ) : null}
                            <button type="button" onClick={() => setErrorDialogOpen(false)}>{text('关闭', 'Close', 'Закрыть')}</button>
                            <button type="button" className="primary" onClick={() => {
                                setErrorDialogOpen(false);
                                void start();
                            }}>{text('重试', 'Retry', 'Повторить')}</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
