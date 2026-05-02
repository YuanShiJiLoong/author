'use client';

const STORAGE_KEY = 'author-diagnostic-log-v1';
const MAX_ENTRIES = 1200;
const MAX_TEXT_LENGTH = 4000;
const MAX_METADATA_LENGTH = 12000;

let installed = false;
let originalConsole = null;
let entriesCache = [];

function nowIso() {
    return new Date().toISOString();
}

function truncate(text, max = MAX_TEXT_LENGTH) {
    const str = String(text ?? '');
    return str.length > max ? `${str.slice(0, max)}…[truncated ${str.length - max} chars]` : str;
}

function sanitizeText(value) {
    return truncate(String(value ?? '')
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/\b(sk|rk|pk|ak)-[A-Za-z0-9_\-]{16,}\b/g, '$1-[REDACTED]')
        .replace(/\bAIza[0-9A-Za-z_\-]{20,}\b/g, 'AIza[REDACTED]')
        .replace(/("?(?:api[_-]?key|authorization|token|password|secret)"?\s*[:=]\s*)"[^"]+"/gi, '$1"[REDACTED]"')
        .replace(/((?:api[_-]?key|authorization|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]'));
}

function serializeError(error) {
    if (!error) return null;
    if (typeof error === 'string') return { message: sanitizeText(error) };
    return {
        name: sanitizeText(error.name || 'Error'),
        message: sanitizeText(error.message || String(error)),
        stack: sanitizeText(error.stack || ''),
        cause: error.cause ? serializeError(error.cause) : undefined,
    };
}

function safeSerialize(value, depth = 0) {
    if (depth > 4) return '[MaxDepth]';
    if (value instanceof Error) return serializeError(value);
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return sanitizeText(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (Array.isArray(value)) return value.slice(0, 60).map(item => safeSerialize(item, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value).slice(0, 80)) {
            if (/api[_-]?key|authorization|token|password|secret/i.test(key)) {
                out[key] = '[REDACTED]';
            } else {
                out[key] = safeSerialize(item, depth + 1);
            }
        }
        return out;
    }
    return sanitizeText(String(value));
}

function readEntries() {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeEntries(entries) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    } catch {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-Math.floor(MAX_ENTRIES / 2))));
        } catch { }
    }
}

function formatConsoleArg(arg) {
    if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
    if (typeof arg === 'string') return arg;
    try {
        return JSON.stringify(safeSerialize(arg));
    } catch {
        return String(arg);
    }
}

function describeElement(target) {
    if (!target || target.nodeType !== 1) return null;
    const el = target.closest?.('button,a,input,textarea,select,[role="button"],[data-node-id],[data-tree-list],[contenteditable="true"]') || target;
    const classes = typeof el.className === 'string'
        ? el.className.split(/\s+/).filter(Boolean).slice(0, 5).join('.')
        : '';
    const attrs = {
        tag: el.tagName?.toLowerCase(),
        id: el.id || undefined,
        className: classes || undefined,
        role: el.getAttribute?.('role') || undefined,
        title: sanitizeText(el.getAttribute?.('title') || ''),
        ariaLabel: sanitizeText(el.getAttribute?.('aria-label') || ''),
        dataNodeId: sanitizeText(el.getAttribute?.('data-node-id') || ''),
    };
    if (['button', 'a'].includes(attrs.tag)) {
        attrs.text = sanitizeText((el.innerText || el.textContent || '').trim().slice(0, 80));
    }
    return Object.fromEntries(Object.entries(attrs).filter(([, value]) => value));
}

function getEnvironmentSnapshot() {
    if (typeof window === 'undefined') return {};
    return {
        href: sanitizeText(window.location.href),
        userAgent: sanitizeText(navigator.userAgent),
        language: navigator.language,
        platform: navigator.platform,
        viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
        online: navigator.onLine,
        electron: !!window.electronAPI?.isElectron,
        localTime: new Date().toString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
}

function mirrorToElectron(entry) {
    if (typeof window === 'undefined' || !window.electronAPI?.writeDiagnosticLog) return;
    const shouldMirror = ['error', 'warn'].includes(entry.level) || entry.event?.includes('error') || entry.event?.includes('rejection') || entry.event?.includes('crash');
    if (!shouldMirror) return;
    window.electronAPI.writeDiagnosticLog(entry).catch(() => { });
}

export function recordDiagnosticEvent(event, message, metadata = {}, level = 'info') {
    if (typeof window === 'undefined') return null;
    const entry = {
        ts: nowIso(),
        level,
        event,
        message: sanitizeText(message),
        path: sanitizeText(window.location?.pathname || ''),
        metadata: safeSerialize(metadata),
    };
    try {
        const metadataText = JSON.stringify(entry.metadata);
        if (metadataText.length > MAX_METADATA_LENGTH) {
            entry.metadata = { truncated: true, preview: sanitizeText(metadataText.slice(0, MAX_METADATA_LENGTH)) };
        }
    } catch { }
    entriesCache.push(entry);
    entriesCache = entriesCache.slice(-MAX_ENTRIES);
    writeEntries(entriesCache);
    mirrorToElectron(entry);
    return entry;
}

function installConsoleCapture() {
    if (originalConsole) return;
    originalConsole = {};
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
        originalConsole[method] = console[method]?.bind(console) || (() => { });
        console[method] = (...args) => {
            originalConsole[method](...args);
            recordDiagnosticEvent('console', args.map(formatConsoleArg).join(' '), {}, method === 'error' ? 'error' : method === 'warn' ? 'warn' : 'debug');
        };
    }
}

function installGlobalErrorCapture() {
    window.addEventListener('error', (event) => {
        recordDiagnosticEvent('window.error', event.message || 'Unhandled error', {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: serializeError(event.error),
        }, 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
        recordDiagnosticEvent('window.unhandledrejection', event.reason?.message || String(event.reason || 'Unhandled rejection'), {
            reason: serializeError(event.reason) || safeSerialize(event.reason),
        }, 'error');
    });

    window.addEventListener('pagehide', () => {
        recordDiagnosticEvent('page.lifecycle', 'pagehide', { persisted: false }, 'debug');
    });

    document.addEventListener('visibilitychange', () => {
        recordDiagnosticEvent('page.visibility', document.visibilityState, {}, 'debug');
    });
}

function installInteractionBreadcrumbs() {
    const capture = { capture: true, passive: true };
    document.addEventListener('click', (event) => {
        recordDiagnosticEvent('ui.click', 'click', { target: describeElement(event.target) }, 'debug');
    }, capture);
    document.addEventListener('dragstart', (event) => {
        recordDiagnosticEvent('ui.dragstart', 'dragstart', { target: describeElement(event.target) }, 'debug');
    }, capture);
    document.addEventListener('drop', (event) => {
        recordDiagnosticEvent('ui.drop', 'drop', { target: describeElement(event.target) }, 'debug');
    }, capture);
    document.addEventListener('keydown', (event) => {
        if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) return;
        recordDiagnosticEvent('ui.keydown', 'shortcut', {
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            target: describeElement(event.target),
        }, 'debug');
    }, capture);
}

export function initDiagnostics() {
    if (typeof window === 'undefined' || installed) return;
    installed = true;
    entriesCache = readEntries();
    installConsoleCapture();
    installGlobalErrorCapture();
    installInteractionBreadcrumbs();
    recordDiagnosticEvent('app.diagnostics.ready', 'Diagnostics initialized', getEnvironmentSnapshot(), 'info');
}

async function getElectronDiagnostics() {
    if (typeof window === 'undefined' || !window.electronAPI?.getDiagnosticBundle) return null;
    try {
        return await window.electronAPI.getDiagnosticBundle();
    } catch (error) {
        return { error: serializeError(error) };
    }
}

export async function buildDiagnosticReport(extra = {}) {
    const electron = await getElectronDiagnostics();
    return {
        type: 'author-diagnostic-report',
        version: 1,
        generatedAt: nowIso(),
        environment: getEnvironmentSnapshot(),
        extra: safeSerialize(extra),
        logs: readEntries(),
        electron,
    };
}

export async function downloadDiagnosticReport(extra = {}) {
    recordDiagnosticEvent('diagnostics.export', 'Diagnostic report exported', extra, 'info');
    const report = await buildDiagnosticReport(extra);
    const text = JSON.stringify(report, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `author-diagnostic-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return report;
}

export function clearDiagnosticLog() {
    entriesCache = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch { }
}
