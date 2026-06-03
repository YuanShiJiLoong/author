'use client';

const STORAGE_KEY = 'author-diagnostic-log-v1';
const MAX_ENTRIES = 1200;
const MAX_TEXT_LENGTH = 4000;
const MAX_METADATA_LENGTH = 12000;
const PUBLIC_IPV4_RE = /\b(?!(?:127|10|0|169\.254|192\.168)\.)(?!(?:172\.(?:1[6-9]|2\d|3[0-1]))\.)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const MIRRORED_BREADCRUMB_EVENTS = new Set([
    'app.diagnostics.ready',
    'page.lifecycle',
    'page.visibility',
    'ui.blocked-pointer',
    'ui.click',
    'ui.dragstart',
    'ui.drop',
    'ui.keydown',
    'ui.overlay.warning',
]);
const OVERLAY_SELECTORS = [
    '.modal-overlay',
    '.settings-panel-overlay',
    '.login-modal-overlay',
    '.welcome-modal-overlay',
    '.tour-portal',
    '.tour-overlay-bg',
    '.cloud-sync-menu-backdrop',
    '.field-expand-overlay',
    '.color-picker-popover',
    '.typeset-popover',
    '.inline-ai-popover',
    '.mobile-download-popover',
    '.category-popover-panel',
    '.settings-category-popover',
    '[data-blocking-overlay="true"]',
];
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const OVERLAY_WARNING_COOLDOWN_MS = 30 * 1000;
const FULLSCREEN_OVERLAY_RATIO = 0.55;
const LONG_TASK_THRESHOLD_MS = 250;
const KEYBOARD_GUARD_KEY = '__authorDiagnosticsKeyboardEventGuard';

let installed = false;
let originalConsole = null;
let entriesCache = [];
let healthTimer = null;
let longTaskObserver = null;
let lastOverlayWarningAt = 0;
let cleanupFns = [];

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
        .replace(/((?:api[_-]?key|authorization|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
        .replace(PUBLIC_IPV4_RE, '[REDACTED_IP]'));
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

function getConsoleMessage(args) {
    return args.map(formatConsoleArg).join(' ');
}

function isFirestoreOfflineConsoleError(message) {
    return /@firebase\/firestore/i.test(message)
        && /Could not reach Cloud Firestore backend|client will operate in offline mode|Backend didn't respond/i.test(message);
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

function rectSnapshot(rect) {
    if (!rect) return null;
    return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
    };
}

function describeVisualElement(target) {
    if (typeof window === 'undefined' || !target || target.nodeType !== 1) return null;
    const rect = target.getBoundingClientRect?.();
    const style = window.getComputedStyle?.(target);
    const base = describeElement(target) || {};
    const className = typeof target.className === 'string'
        ? target.className.split(/\s+/).filter(Boolean).slice(0, 8).join('.')
        : base.className;
    return Object.fromEntries(Object.entries({
        ...base,
        tag: target.tagName?.toLowerCase() || base.tag,
        id: target.id || base.id,
        className: className || undefined,
        position: style?.position,
        zIndex: style?.zIndex,
        pointerEvents: style?.pointerEvents,
        display: style?.display,
        visibility: style?.visibility,
        opacity: style?.opacity,
        rect: rectSnapshot(rect),
    }).filter(([, value]) => value !== undefined && value !== ''));
}

function isVisibleElement(el) {
    if (typeof window === 'undefined' || !el || el.nodeType !== 1) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const opacity = Number.parseFloat(style.opacity || '1');
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && opacity > 0.01
        && rect.width > 1
        && rect.height > 1;
}

function getVisibleOverlaySnapshot(limit = 12) {
    if (typeof document === 'undefined') return [];
    const seen = new Set();
    const elements = [];
    for (const selector of OVERLAY_SELECTORS) {
        document.querySelectorAll(selector).forEach((el) => {
            if (!seen.has(el) && isVisibleElement(el)) {
                seen.add(el);
                elements.push(el);
            }
        });
    }
    return elements
        .map((el) => describeVisualElement(el))
        .filter(Boolean)
        .sort((a, b) => {
            const aIndex = Number.parseInt(a.zIndex, 10);
            const bIndex = Number.parseInt(b.zIndex, 10);
            return (Number.isFinite(bIndex) ? bIndex : 0) - (Number.isFinite(aIndex) ? aIndex : 0);
        })
        .slice(0, limit);
}

function getLargeBlockingOverlays(overlays) {
    if (typeof window === 'undefined') return [];
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    return overlays.filter((overlay) => {
        const rect = overlay.rect || {};
        const area = Math.max(0, rect.width || 0) * Math.max(0, rect.height || 0);
        return overlay.pointerEvents !== 'none' && area / viewportArea >= FULLSCREEN_OVERLAY_RATIO;
    });
}

function elementsSharePath(a, b) {
    if (!a || !b || a.nodeType !== 1 || b.nodeType !== 1) return false;
    return a === b || a.contains?.(b) || b.contains?.(a);
}

function getPointerDiagnostics(event) {
    const topElementNode = document.elementFromPoint?.(event.clientX, event.clientY);
    const overlays = getVisibleOverlaySnapshot();
    return {
        pointer: {
            x: Math.round(event.clientX),
            y: Math.round(event.clientY),
            button: event.button,
            buttons: event.buttons,
            pointerType: event.pointerType,
        },
        target: describeElement(event.target),
        topElement: describeVisualElement(topElementNode),
        targetDiffersFromTopElement: !!topElementNode && !elementsSharePath(event.target, topElementNode),
        overlays,
        largeBlockingOverlays: getLargeBlockingOverlays(overlays),
    };
}

function getMemorySnapshot() {
    if (typeof performance === 'undefined') return null;
    const memory = performance?.memory;
    if (!memory) return null;
    return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
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
        document: {
            readyState: document.readyState,
            visibilityState: document.visibilityState,
            hasFocus: document.hasFocus?.(),
        },
        bodyClassName: sanitizeText(document.body?.className || ''),
        activeElement: describeElement(document.activeElement),
        overlays: getVisibleOverlaySnapshot(8),
        memory: getMemorySnapshot(),
        localTime: new Date().toString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
}

function mirrorToElectron(entry) {
    if (typeof window === 'undefined' || !window.electronAPI?.writeDiagnosticLog) return;
    const shouldMirror = MIRRORED_BREADCRUMB_EVENTS.has(entry.event)
        || ['error', 'warn'].includes(entry.level)
        || entry.event?.includes('error')
        || entry.event?.includes('rejection')
        || entry.event?.includes('crash');
    if (!shouldMirror) return;
    window.electronAPI.writeDiagnosticLog(entry).catch(() => { });
}

function addDiagnosticListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    cleanupFns.push(() => {
        try { target.removeEventListener(type, listener, options); } catch { }
    });
}

function normalizeEventKey(event) {
    return typeof event?.key === 'string' ? event.key : '';
}

function installKeyboardEventGuard() {
    if (typeof window === 'undefined' || window[KEYBOARD_GUARD_KEY]) return;
    const listener = (event) => {
        if (!event || typeof event.key === 'string') return;
        try {
            Object.defineProperty(event, 'key', { configurable: true, value: '' });
        } catch {
            event.stopImmediatePropagation?.();
        }
    };
    window.addEventListener('keydown', listener, { capture: true });
    window[KEYBOARD_GUARD_KEY] = listener;
}

function cleanupInstalledDiagnostics() {
    cleanupFns.forEach(cleanup => cleanup());
    cleanupFns = [];
    if (healthTimer) {
        window.clearInterval(healthTimer);
        healthTimer = null;
    }
    if (longTaskObserver) {
        try { longTaskObserver.disconnect(); } catch { }
        longTaskObserver = null;
    }
    installed = false;
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
            const message = getConsoleMessage(args);
            if (method === 'error' && isFirestoreOfflineConsoleError(message)) {
                originalConsole.warn?.(...args);
                recordDiagnosticEvent('firebase.firestore.offline', message, {}, 'warn');
                return;
            }
            originalConsole[method](...args);
            recordDiagnosticEvent('console', message, {}, method === 'error' ? 'error' : method === 'warn' ? 'warn' : 'debug');
        };
    }
}

function installGlobalErrorCapture() {
    addDiagnosticListener(window, 'error', (event) => {
        recordDiagnosticEvent('window.error', event.message || 'Unhandled error', {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: serializeError(event.error),
        }, 'error');
    });

    addDiagnosticListener(window, 'unhandledrejection', (event) => {
        recordDiagnosticEvent('window.unhandledrejection', event.reason?.message || String(event.reason || 'Unhandled rejection'), {
            reason: serializeError(event.reason) || safeSerialize(event.reason),
        }, 'error');
    });

    addDiagnosticListener(window, 'pagehide', () => {
        recordDiagnosticEvent('page.lifecycle', 'pagehide', { persisted: false }, 'debug');
    });

    addDiagnosticListener(document, 'visibilitychange', () => {
        recordDiagnosticEvent('page.visibility', document.visibilityState, {}, 'debug');
    });
}

function installInteractionBreadcrumbs() {
    const capture = { capture: true, passive: true };
    addDiagnosticListener(document, 'pointerdown', (event) => {
        const diagnostics = getPointerDiagnostics(event);
        if (diagnostics.largeBlockingOverlays.length > 0 || diagnostics.targetDiffersFromTopElement) {
            recordDiagnosticEvent('ui.blocked-pointer', 'Pointer down may be intercepted by an overlay or a different top element', diagnostics, 'warn');
        } else {
            recordDiagnosticEvent('ui.pointerdown', 'pointerdown', {
                pointer: diagnostics.pointer,
                target: diagnostics.target,
                topElement: diagnostics.topElement,
            }, 'debug');
        }
    }, capture);
    addDiagnosticListener(document, 'pointerup', (event) => {
        recordDiagnosticEvent('ui.pointerup', 'pointerup', {
            target: describeElement(event.target),
            pointer: {
                x: Math.round(event.clientX),
                y: Math.round(event.clientY),
                button: event.button,
                pointerType: event.pointerType,
            },
        }, 'debug');
    }, capture);
    addDiagnosticListener(document, 'click', (event) => {
        const topElement = document.elementFromPoint?.(event.clientX, event.clientY);
        recordDiagnosticEvent('ui.click', 'click', {
            target: describeElement(event.target),
            topElement: describeVisualElement(topElement),
        }, 'debug');
    }, capture);
    addDiagnosticListener(document, 'dragstart', (event) => {
        recordDiagnosticEvent('ui.dragstart', 'dragstart', { target: describeElement(event.target) }, 'debug');
    }, capture);
    addDiagnosticListener(document, 'drop', (event) => {
        recordDiagnosticEvent('ui.drop', 'drop', { target: describeElement(event.target) }, 'debug');
    }, capture);
    addDiagnosticListener(document, 'keydown', (event) => {
        const key = normalizeEventKey(event);
        const hasShortcutModifier = Boolean(event?.ctrlKey || event?.metaKey || event?.altKey);
        const isPlainPrintableKey = !hasShortcutModifier && /^[\s\S]$/.test(key);
        if (isPlainPrintableKey) return;
        recordDiagnosticEvent('ui.keydown', 'shortcut', {
            key,
            ctrlKey: !!event?.ctrlKey,
            metaKey: !!event?.metaKey,
            altKey: !!event?.altKey,
            shiftKey: !!event?.shiftKey,
            target: describeElement(event?.target),
        }, 'debug');
    }, capture);
}

function installHealthMonitor() {
    if (healthTimer) return;
    healthTimer = window.setInterval(() => {
        const overlays = getVisibleOverlaySnapshot(10);
        const largeBlockingOverlays = getLargeBlockingOverlays(overlays);
        const payload = {
            readyState: document.readyState,
            visibilityState: document.visibilityState,
            hasFocus: document.hasFocus?.(),
            activeElement: describeElement(document.activeElement),
            bodyClassName: sanitizeText(document.body?.className || ''),
            overlays,
            largeBlockingOverlays,
            memory: getMemorySnapshot(),
        };
        if (largeBlockingOverlays.length > 0) {
            const now = Date.now();
            if (now - lastOverlayWarningAt > OVERLAY_WARNING_COOLDOWN_MS) {
                lastOverlayWarningAt = now;
                recordDiagnosticEvent('ui.overlay.warning', 'Large pointer-enabled overlay is visible during heartbeat', payload, 'warn');
            }
            return;
        }
        recordDiagnosticEvent('app.health', 'heartbeat', payload, 'debug');
    }, HEARTBEAT_INTERVAL_MS);
}

function installPerformanceDiagnostics() {
    if (typeof PerformanceObserver === 'undefined' || longTaskObserver) return;
    try {
        longTaskObserver = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
                if (entry.duration < LONG_TASK_THRESHOLD_MS) return;
                recordDiagnosticEvent('app.longtask', 'Main thread long task detected', {
                    name: entry.name,
                    startTime: Math.round(entry.startTime),
                    duration: Math.round(entry.duration),
                }, entry.duration >= 1000 ? 'warn' : 'debug');
            });
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch { }
}

export function initDiagnostics() {
    if (typeof window === 'undefined' || installed) return;
    installKeyboardEventGuard();
    window.__authorDiagnosticsCleanup?.();
    installed = true;
    entriesCache = readEntries();
    installConsoleCapture();
    installGlobalErrorCapture();
    installInteractionBreadcrumbs();
    installHealthMonitor();
    installPerformanceDiagnostics();
    window.__authorDiagnostics = {
        snapshot: getEnvironmentSnapshot,
        export: downloadDiagnosticReport,
        record: recordDiagnosticEvent,
    };
    window.__authorDiagnosticsCleanup = cleanupInstalledDiagnostics;
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
