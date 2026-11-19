const { app, BrowserWindow, shell, dialog, ipcMain, safeStorage, session } = require('electron');
const path = require('path');
const { createHmac, randomBytes, timingSafeEqual } = require('crypto');
const http = require('http');
const net = require('net');
const fs = require('fs');
const {
    STABLE_DESKTOP_HOST,
    getDesktopServerUrl,
    isTrustedDesktopUrl,
    selectStableDesktopPort,
} = require('./origin-policy.cjs');
const { createExitController } = require('./exit-controller.cjs');
const { createLanShareGateway } = require('./lan-share-gateway.cjs');

// 加载 .env.local（轻量实现，无需 dotenv 依赖）
(function loadEnvFile() {
    const envPaths = [
        path.join(__dirname, '..', '.env.local'),
        path.join(__dirname, '..', '.env'),
    ];
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            const lines = fs.readFileSync(envPath, 'utf8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx === -1) continue;
                const key = trimmed.slice(0, eqIdx).trim();
                const value = trimmed.slice(eqIdx + 1).trim();
                if (key && !process.env[key]) {
                    process.env[key] = value;
                }
            }
            break; // 只加载第一个找到的文件
        }
    }
})();

const MAX_LOG_MESSAGE_LENGTH = 12000;
const MAX_RENDERER_BREADCRUMBS = 120;
const PUBLIC_IPV4_RE = /\b(?!(?:127|10|0|169\.254|192\.168)\.)(?!(?:172\.(?:1[6-9]|2\d|3[0-1]))\.)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

function truncateLogText(value, maxLength = MAX_LOG_MESSAGE_LENGTH) {
    const text = String(value ?? '');
    return text.length > maxLength ? `${text.slice(0, maxLength)}…[truncated ${text.length - maxLength} chars]` : text;
}

function sanitizeLogText(value, maxLength = null) {
    const text = String(value ?? '')
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/\b(sk|rk|pk|ak)-[A-Za-z0-9_\-]{16,}\b/g, '$1-[REDACTED]')
        .replace(/\bAIza[0-9A-Za-z_\-]{20,}\b/g, 'AIza[REDACTED]')
        .replace(/("?(?:api[_-]?key|authorization|token|password|secret)"?\s*[:=]\s*)"[^"]+"/gi, '$1"[REDACTED]"')
        .replace(/((?:api[_-]?key|authorization|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
        .replace(PUBLIC_IPV4_RE, '[REDACTED_IP]');
    return maxLength ? truncateLogText(text, maxLength) : text;
}

function sanitizeDiagnosticValue(value, depth = 0) {
    if (depth > 4) return '[MaxDepth]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return sanitizeLogText(value, 1000);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 40).map(item => sanitizeDiagnosticValue(item, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value).slice(0, 60)) {
            if (/api[_-]?key|authorization|token|password|secret/i.test(key)) {
                out[key] = '[REDACTED]';
            } else {
                out[sanitizeLogText(key, 120)] = sanitizeDiagnosticValue(item, depth + 1);
            }
        }
        return out;
    }
    return sanitizeLogText(String(value), 1000);
}

// 日志文件 - 写到操作系统的 UserData 目录（避免 C 盘权限问题被静默拦截）
const logFile = path.join(app.getPath('userData'), 'author-debug.log');
const secureStoreFile = path.join(app.getPath('userData'), 'author-secure-store.json');
function log(msg) {
    const safeMessage = sanitizeLogText(msg, MAX_LOG_MESSAGE_LENGTH);
    const line = `[${new Date().toISOString()}] ${safeMessage}\n`;
    console.log(safeMessage);
    try { fs.appendFileSync(logFile, line); } catch (e) { }
}

function readSecureStore() {
    try {
        if (!fs.existsSync(secureStoreFile)) return {};
        const parsed = JSON.parse(fs.readFileSync(secureStoreFile, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeSecureStore(store) {
    try {
        fs.mkdirSync(path.dirname(secureStoreFile), { recursive: true });
        fs.writeFileSync(secureStoreFile, JSON.stringify(store, null, 2), 'utf8');
    } catch (err) {
        log('Secure store write failed: ' + err.message);
        throw err;
    }
}

function normalizeSecureStoreKey(key) {
    const safeKey = String(key || '').trim();
    const allowed = safeKey === 'ai-credentials'
        || safeKey === 'cloud-session-tokens'
        || safeKey === 'webdav-password'
        || /^tts\.(?:openai-compatible|gemini|anthropic-custom|custom)\.apiKey$/.test(safeKey);
    if (!allowed) {
        throw new Error('Invalid secure store key');
    }
    return safeKey;
}

function encryptSecret(value) {
    const text = String(value || '');
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Operating system secure storage is unavailable');
    }
    return {
        encrypted: true,
        value: safeStorage.encryptString(text).toString('base64'),
    };
}

function decryptSecret(entry) {
    if (!entry?.value) return '';
    if (!entry.encrypted || !safeStorage.isEncryptionAvailable()) {
        throw new Error('Secret is not protected by operating system secure storage');
    }
    const buffer = Buffer.from(entry.value, 'base64');
    return safeStorage.decryptString(buffer);
}

function readLogTail(filePath, maxBytes = 2 * 1024 * 1024) {
    try {
        if (!fs.existsSync(filePath)) return { content: '', truncated: false };
        const stat = fs.statSync(filePath);
        const start = Math.max(0, stat.size - maxBytes);
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(stat.size - start);
        fs.readSync(fd, buffer, 0, buffer.length, start);
        fs.closeSync(fd);
        return {
            content: buffer.toString('utf8'),
            truncated: start > 0,
            size: stat.size,
        };
    } catch (err) {
        return { content: '', truncated: false, error: err.message };
    }
}

// Windows 按 AppUserModelID 认应用，须与安装器写入快捷方式的 appId 一致，
// 否则“钉到任务栏的快捷方式”与“运行中的窗口”会被当成两个任务栏图标；也用于系统通知归属。
if (process.platform === 'win32') {
    app.setAppUserModelId('com.yuanshijilong.author');
}

// 防止多开
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    log('Another instance is running, quitting.');
    app.quit();
    process.exit(0);
}

let mainWindow;
let splashWindow;
let serverProcess;
const exitController = createExitController(() => mainWindow);

const isDev = process.argv.includes('--dev');
const BASE_PORT = parseInt(process.env.PORT, 10) || 3000;
const desktopCapability = isDev
    ? String(process.env.AUTHOR_DESKTOP_CAPABILITY || '')
    : randomBytes(32).toString('base64url');
let actualPort = BASE_PORT;
let loadRetries = 0;
const MAX_LOAD_RETRIES = 10;
let serverReady = false; // 追踪服务器是否真正就绪
let serverCrashed = false; // 追踪子进程是否已崩溃
let latestCrashReportPath = null;
let rendererBreadcrumbs = [];
let serverIdentityVerified = false;
const APP_WINDOW_TITLE = 'Author';
const DESKTOP_CAPABILITY_COOKIE = 'author-desktop-capability';
// 内置服务只对本机开放；局域网分享另走这个只认分享码的网关，用到时才开。
const lanShareGateway = createLanShareGateway({
    getUpstream: () => ({ port: actualPort, capability: desktopCapability }),
    log: (message) => log(message),
});

function getServerUrl(host = STABLE_DESKTOP_HOST) {
    return getDesktopServerUrl(actualPort, host);
}

function isTrustedAppUrl(rawUrl) {
    return isTrustedDesktopUrl(rawUrl, actualPort);
}

function assertTrustedIpcSender(event) {
    const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
    const trusted = serverIdentityVerified
        && mainWindow
        && !mainWindow.isDestroyed()
        && event?.sender === mainWindow.webContents
        && isTrustedAppUrl(senderUrl);
    if (!trusted) {
        log(`[Security] Rejected IPC from ${sanitizeLogText(senderUrl, 300) || 'unknown sender'}`);
        throw new Error('Untrusted renderer');
    }
}

function rememberRendererDiagnostic(entry, senderUrl) {
    const safeEntry = {
        ts: sanitizeLogText(entry?.ts || new Date().toISOString(), 80),
        level: sanitizeLogText(entry?.level || 'info', 40),
        event: sanitizeLogText(entry?.event || 'renderer', 120),
        message: sanitizeLogText(entry?.message || '', 1000),
        path: sanitizeLogText(entry?.path || '', 240),
        senderUrl: sanitizeLogText(senderUrl || '', 300),
        metadata: sanitizeDiagnosticValue(entry?.metadata || {}),
    };
    rendererBreadcrumbs.push(safeEntry);
    rendererBreadcrumbs = rendererBreadcrumbs.slice(-MAX_RENDERER_BREADCRUMBS);
    return safeEntry;
}

function shouldLogRendererDiagnostic(entry) {
    const level = String(entry?.level || '');
    const eventName = String(entry?.event || '');
    return ['error', 'warn'].includes(level)
        || /error|rejection|crash/i.test(eventName);
}

function buildMainDiagnosticBundle() {
    const mainLog = readLogTail(logFile);
    return {
        logFile,
        appVersion: app.getVersion(),
        isPackaged: app.isPackaged,
        platform: `${process.platform} ${process.arch}`,
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
        serverReady,
        serverCrashed,
        actualPort,
        latestCrashReportPath,
        rendererBreadcrumbs: rendererBreadcrumbs.slice(-MAX_RENDERER_BREADCRUMBS),
        mainLog: {
            ...mainLog,
            content: sanitizeLogText(mainLog.content || ''),
        },
    };
}

function writeCrashReport(eventName, details = {}) {
    try {
        const reportDir = path.join(app.getPath('userData'), 'crash-reports');
        fs.mkdirSync(reportDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(reportDir, `author-crash-${stamp}.json`);
        const report = {
            type: 'author-crash-report',
            version: 1,
            generatedAt: new Date().toISOString(),
            event: eventName,
            details: sanitizeLogText(JSON.stringify(details || {})),
            diagnostics: buildMainDiagnosticBundle(),
        };
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
        latestCrashReportPath = reportPath;
        log(`[CrashReport] Saved: ${reportPath}`);
        return reportPath;
    } catch (err) {
        log(`[CrashReport] Failed: ${err.message}`);
        return null;
    }
}

function showLogFileInFolder(filePath = logFile) {
    try {
        shell.showItemInFolder(filePath);
    } catch {
        shell.openPath(path.dirname(filePath)).catch(() => { });
    }
}

process.on('uncaughtException', (err) => {
    log(`[MainProcess] uncaughtException: ${err.message}`);
    if (err.stack) log(`[MainProcess] stack: ${err.stack}`);
    const reportPath = writeCrashReport('main-uncaughtException', { message: err.message, stack: err.stack });
    dialog.showErrorBox('Author 主进程异常', `已自动保存诊断报告:\n${reportPath || logFile}`);
});

process.on('unhandledRejection', (reason) => {
    const message = reason?.message || String(reason);
    log(`[MainProcess] unhandledRejection: ${message}`);
    if (reason?.stack) log(`[MainProcess] stack: ${reason.stack}`);
    writeCrashReport('main-unhandledRejection', { message, stack: reason?.stack });
});

app.on('child-process-gone', (event, details) => {
    log(`[ChildProcessGone] type=${details.type || 'unknown'} reason=${details.reason || 'unknown'} exitCode=${details.exitCode ?? ''}`);
    if (/gpu/i.test(String(details.type || ''))) {
        writeCrashReport('gpu-process-gone', details);
    }
});

ipcMain.handle('write-diagnostic-log', async (event, entry) => {
    assertTrustedIpcSender(event);
    const safeEntry = rememberRendererDiagnostic(entry, event.senderFrame?.url);
    if (shouldLogRendererDiagnostic(safeEntry)) {
        let metadata = '';
        try {
            metadata = JSON.stringify(safeEntry.metadata || {});
        } catch { }
        log(`[Renderer:${safeEntry.level}] ${safeEntry.event} ${safeEntry.message}${metadata ? ' ' + sanitizeLogText(metadata, 4000) : ''}`);
    }
    return { success: true };
});

ipcMain.handle('get-diagnostic-bundle', async (event) => {
    assertTrustedIpcSender(event);
    return buildMainDiagnosticBundle();
});

ipcMain.handle('get-app-version', async (event) => {
    assertTrustedIpcSender(event);
    return app.getVersion();
});

ipcMain.handle('open-diagnostic-log-file', async (event) => {
    assertTrustedIpcSender(event);
    try {
        showLogFileInFolder(latestCrashReportPath || logFile);
        return { success: true, logFile };
    } catch (err) {
        return { success: false, error: err.message, logFile };
    }
});

ipcMain.handle('lan-share-gateway-open', async (event, share) => {
    assertTrustedIpcSender(event);
    return await lanShareGateway.open({ token: share?.token, expiresAt: share?.expiresAt });
});

ipcMain.handle('secure-store-set', async (event, key, value) => {
    assertTrustedIpcSender(event);
    const safeKey = normalizeSecureStoreKey(key);
    const store = readSecureStore();
    store[safeKey] = encryptSecret(value);
    writeSecureStore(store);
    return { success: true, encrypted: !!store[safeKey].encrypted };
});

ipcMain.handle('secure-store-get', async (event, key) => {
    assertTrustedIpcSender(event);
    const safeKey = normalizeSecureStoreKey(key);
    const store = readSecureStore();
    if (!store[safeKey]) return '';
    return decryptSecret(store[safeKey]);
});

ipcMain.handle('secure-store-delete', async (event, key) => {
    assertTrustedIpcSender(event);
    const safeKey = normalizeSecureStoreKey(key);
    const store = readSecureStore();
    delete store[safeKey];
    writeSecureStore(store);
    return { success: true };
});

ipcMain.on('ai-credential-bundle-get', (event) => {
    try {
        assertTrustedIpcSender(event);
        const store = readSecureStore();
        event.returnValue = {
            success: true,
            value: store['ai-credentials'] ? decryptSecret(store['ai-credentials']) : '',
        };
    } catch (error) {
        event.returnValue = { success: false, error: error?.message || 'Secure storage unavailable' };
    }
});

ipcMain.on('ai-credential-bundle-set', (event, value) => {
    try {
        assertTrustedIpcSender(event);
        const serialized = String(value || '');
        if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024) {
            throw new Error('Credential bundle is too large');
        }
        const parsed = JSON.parse(serialized || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Invalid credential bundle');
        }
        const store = readSecureStore();
        store['ai-credentials'] = encryptSecret(serialized);
        writeSecureStore(store);
        event.returnValue = { success: true, encrypted: true };
    } catch (error) {
        event.returnValue = { success: false, error: error?.message || 'Secure storage unavailable' };
    }
});

ipcMain.on('cloud-session-tokens-get', (event) => {
    try {
        assertTrustedIpcSender(event);
        const store = readSecureStore();
        event.returnValue = {
            success: true,
            value: store['cloud-session-tokens'] ? decryptSecret(store['cloud-session-tokens']) : '',
        };
    } catch (error) {
        event.returnValue = { success: false, error: error?.message || 'Secure storage unavailable' };
    }
});

ipcMain.on('cloud-session-tokens-set', (event, value) => {
    try {
        assertTrustedIpcSender(event);
        const serialized = String(value || '');
        if (Buffer.byteLength(serialized, 'utf8') > 128 * 1024) {
            throw new Error('Cloud session token bundle is too large');
        }
        const parsed = JSON.parse(serialized || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Invalid cloud session token bundle');
        }
        const store = readSecureStore();
        store['cloud-session-tokens'] = encryptSecret(serialized);
        writeSecureStore(store);
        event.returnValue = { success: true, encrypted: true };
    } catch (error) {
        event.returnValue = { success: false, error: error?.message || 'Secure storage unavailable' };
    }
});

ipcMain.on('cloud-session-tokens-delete', (event) => {
    try {
        assertTrustedIpcSender(event);
        const store = readSecureStore();
        delete store['cloud-session-tokens'];
        writeSecureStore(store);
        event.returnValue = { success: true };
    } catch (error) {
        event.returnValue = { success: false, error: error?.message || 'Secure storage unavailable' };
    }
});

function createWindow() {
    const openExternalHttpUrl = (rawUrl) => {
        try {
            const parsed = new URL(rawUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) return false;
            shell.openExternal(parsed.toString()).catch(err => log(`[OpenExternal] ${err?.message || err}`));
            return true;
        } catch {
            return false;
        }
    };

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: APP_WINDOW_TITLE,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webviewTag: false,
            navigateOnDragDrop: false,
        },
        autoHideMenuBar: false,
        backgroundColor: '#faf8f5',
        show: false,
    });

    mainWindow.loadURL(getServerUrl());

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // 开发模式下允许 F12 打开开发者工具。
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (isDev && input.key === 'F12') {
                mainWindow.webContents.toggleDevTools();
            }
        });
    });

    // 加载失败时有限次重试
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        loadRetries++;
        log(`Load failed (${loadRetries}/${MAX_LOAD_RETRIES}): ${errorDescription}`);
        if (loadRetries < MAX_LOAD_RETRIES) {
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.loadURL(getServerUrl());
                }
            }, 2000);
        } else {
            mainWindow.show();
            dialog.showErrorBox(
                'Author 启动失败',
                '无法连接到内置服务器。\n\n' +
                '查看日志: ' + logFile
            );
        }
    });

    // 只有真正加载了已经验证的内置服务页面才重置重试计数器。
    mainWindow.webContents.on('did-finish-load', () => {
        const url = mainWindow.webContents.getURL();
        if (isTrustedAppUrl(url)) {
            log('Page loaded successfully: ' + url);
            loadRetries = 0;
            if (!mainWindow.isDestroyed() && mainWindow.getTitle() !== APP_WINDOW_TITLE) {
                mainWindow.setTitle(APP_WINDOW_TITLE);
            }
        }
    });

    mainWindow.webContents.on('page-title-updated', (event) => {
        event.preventDefault();
        if (!mainWindow.isDestroyed() && mainWindow.getTitle() !== APP_WINDOW_TITLE) {
            mainWindow.setTitle(APP_WINDOW_TITLE);
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (!isTrustedAppUrl(url)) openExternalHttpUrl(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (isTrustedAppUrl(url)) return;
        event.preventDefault();
        openExternalHttpUrl(url);
    });

    mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
    mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        const levelNames = ['verbose', 'info', 'warning', 'error'];
        const levelName = typeof level === 'number' ? (levelNames[level] || String(level)) : String(level || 'log');
        if (!/warn|error|assert/i.test(levelName)) return;
        log(`[RendererConsole:${levelName}] ${message} (${sourceId || 'unknown'}:${line || 0})`);
    });

    mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
        log(`[PreloadError] ${preloadPath}: ${error?.message || error}`);
        if (error?.stack) log(`[PreloadError] stack: ${error.stack}`);
    });

    // 确保下载文件使用正确的文件名（而非 blob UUID）
    mainWindow.webContents.session.on('will-download', (event, item) => {
        const suggestedName = item.getFilename();
        // 如果文件名看起来像 UUID（没有扩展名或是 blob hash），尝试用 Content-Disposition
        if (suggestedName && !suggestedName.match(/^[0-9a-f-]{36}/i)) {
            // 文件名正常，不需要干预
            return;
        }
        // Electron 有时已经能从 a.download 获取到正确名称，这里做兜底
        log(`[Download] Original filename: ${suggestedName}`);
    });

    // 捕获底层渲染线程崩溃（如内存溢出 OOM、GPU 崩溃等导致的突然白屏）
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        log(`[Crash] Renderer process gone. Reason: ${details.reason}, Code: ${details.exitCode}`);
        if (details.reason !== 'clean-exit') {
            const crashReportPath = writeCrashReport('render-process-gone', details);
            const options = {
                type: 'error',
                title: '程序意外退出了',
                message: '程序意外退出了',
                // 先说用户该做什么；排查用的原因、代码和日志位置放在最后。
                detail: `最近的编辑可能还没保存。重启后请核对章节，也可以在时光机里找回历史版本。\n\n排查用：原因 ${details.reason}，代码 ${details.exitCode}\n日志：${crashReportPath || logFile}`,
                buttons: ['立即重启', '打开日志目录', '结束应用'],
                defaultId: 0,
                cancelId: 2,
            };
            const btnIdx = dialog.showMessageBoxSync(mainWindow, options);
            exitController.approveNativeExit();
            if (btnIdx === 0) {
                app.relaunch();
                app.quit();
            } else if (btnIdx === 1) {
                showLogFileInFolder(crashReportPath || logFile);
                app.quit();
            } else {
                app.quit();
            }
        }
    });

    // 网页长时间无响应
    mainWindow.webContents.on('unresponsive', () => {
        log('[Crash] Renderer process became unresponsive.');
        const options = {
            type: 'warning',
            title: '进程失去响应',
            message: '由于高负荷运算或资源挤占，程序目前暂时无法响应。',
            detail: '您可以耐心等待系统恢复，也可以先导出诊断报告再反馈。',
            buttons: ['继续等待', '打开日志目录', '强制重启'],
            defaultId: 0,
            cancelId: 0,
        };
        const btnIdx = dialog.showMessageBoxSync(mainWindow, options);
        if (btnIdx === 1) {
            const reportPath = writeCrashReport('renderer-unresponsive', { url: mainWindow.webContents.getURL() });
            showLogFileInFolder(reportPath || logFile);
        } else if (btnIdx === 2) {
            writeCrashReport('renderer-force-restart', { url: mainWindow.webContents.getURL() });
            exitController.approveNativeExit();
            app.relaunch();
            app.quit();
        }
    });

    mainWindow.webContents.on('responsive', () => {
        log('[Health] Renderer process became responsive again.');
    });

    // 拦截关闭事件，询问是否需要同步
    mainWindow.on('close', exitController.handleClose);

    ipcMain.on('allow-close', (event) => {
        try { assertTrustedIpcSender(event); } catch { return; }
        exitController.approve();
    });

    // 用户在退出弹窗点击"取消"时，重置状态，允许下次再弹窗
    ipcMain.on('cancel-close', (event) => {
        try { assertTrustedIpcSender(event); } catch { return; }
        exitController.cancel();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// 检测端口是否可用
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
    });
}

function checkTcpReady(host, port, timeout = 1000) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host, port });
        let done = false;
        const finish = (ready) => {
            if (done) return;
            done = true;
            socket.destroy();
            resolve(ready);
        };
        socket.on('connect', () => finish(true));
        socket.on('error', () => finish(false));
        socket.setTimeout(timeout, () => finish(false));
    });
}

function waitForServer(port, maxRetries = 30) {
    return new Promise((resolve) => {
        let retries = 0;
        const hosts = ['127.0.0.1', 'localhost'];
        const check = () => {
            // 如果子进程已经崩溃，立即返回失败
            if (serverCrashed) {
                log(`[waitForServer] Server process already crashed, aborting wait`);
                resolve(false);
                return;
            }
            if (retries > 0 && retries % 5 === 0) {
                log(`[waitForServer] Still waiting for server... attempt ${retries}/${maxRetries}`);
                updateSplashText(`正在启动服务... (${retries}/${maxRetries})`);
            }
            let settled = false;
            let failedHosts = 0;
            const finishAttempt = () => {
                if (settled) return;
                failedHosts++;
                if (failedHosts < hosts.length) return;
                retries++;
                if (retries >= maxRetries) {
                    log(`[waitForServer] Timed out after ${maxRetries} retries`);
                    resolve(false);
                } else {
                    setTimeout(check, 1000);
                }
            };

            for (const host of hosts) {
                checkTcpReady(host, port).then((ready) => {
                    if (!ready || settled) return;
                    settled = true;
                    log(`[waitForServer] TCP ready on ${host}:${port}`);
                    resolve(true);
                });

                let requestDone = false;
                const failHost = () => {
                    if (requestDone) return;
                    requestDone = true;
                    finishAttempt();
                };
                const req = http.get(`http://${host}:${port}`, (res) => {
                    if (settled) {
                        res.resume();
                        return;
                    }
                    requestDone = true;
                    settled = true;
                    res.resume();
                    log(`[waitForServer] HTTP ready on ${host}:${port} status=${res.statusCode}`);
                    resolve(true);
                });
                req.on('error', failHost);
                req.setTimeout(3000, () => {
                    req.destroy();
                    failHost();
                });
            }
        };
        check();
    });
}

function requestDesktopHandshake(challenge, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            hostname: '127.0.0.1',
            port: actualPort,
            path: `/api/desktop-handshake?challenge=${encodeURIComponent(challenge)}`,
            headers: { Accept: 'application/json' },
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => {
                if (body.length < 4096) body += chunk;
            });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Desktop handshake returned ${res.statusCode}`));
                    return;
                }
                try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid desktop handshake response')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => req.destroy(new Error('Desktop handshake timed out')));
    });
}

async function establishDesktopServerTrust() {
    // Existing external dev servers cannot inherit a freshly generated secret.
    // Production builds always require the authenticated handshake.
    if (!desktopCapability) {
        if (isDev) {
            log('[Security] Development server identity handshake is disabled');
            serverIdentityVerified = true;
            return true;
        }
        return false;
    }

    try {
        const challenge = randomBytes(32).toString('base64url');
        const response = await requestDesktopHandshake(challenge);
        const expected = createHmac('sha256', desktopCapability).update(challenge).digest();
        const actual = Buffer.from(String(response?.proof || ''), 'hex');
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
            throw new Error('Desktop server identity proof did not match');
        }

        await session.defaultSession.cookies.set({
            url: getServerUrl(),
            name: DESKTOP_CAPABILITY_COOKIE,
            value: desktopCapability,
            path: '/',
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
        });
        serverIdentityVerified = true;
        log('[Security] Desktop server identity verified');
        return true;
    } catch (error) {
        serverIdentityVerified = false;
        log(`[Security] Desktop server identity verification failed: ${error?.message || error}`);
        return false;
    }
}

function startNextServer() {
    return new Promise(async (resolve) => {
        if (isDev) {
            log('Dev mode — connecting to existing dev server...');
            resolve(true);
            return;
        }

        const isPackaged = app.isPackaged;
        let standaloneDir;

        if (isPackaged) {
            standaloneDir = path.join(process.resourcesPath, 'standalone');
        } else {
            standaloneDir = path.join(__dirname, '..', '.next', 'standalone');
        }

        const serverPath = path.join(standaloneDir, 'server.js');

        log(`isPackaged: ${isPackaged}`);
        log(`resourcesPath: ${process.resourcesPath}`);
        log(`standaloneDir: ${standaloneDir}`);
        log(`serverPath: ${serverPath}`);
        log(`serverExists: ${fs.existsSync(serverPath)}`);

        // 检查关键目录
        const staticDir = path.join(standaloneDir, '.next', 'static');
        const publicDir = path.join(standaloneDir, 'public');
        log(`staticDir exists: ${fs.existsSync(staticDir)}`);
        log(`publicDir exists: ${fs.existsSync(publicDir)}`);

        if (!fs.existsSync(serverPath)) {
            const msg = '找不到 server.js\n路径: ' + serverPath;
            log('ERROR: ' + msg);
            dialog.showErrorBox('Author 启动失败', msg);
            resolve(false);
            return;
        }

        // 浏览器存储按 Origin（含端口）隔离。为避免升级或端口竞争让作品
        // 看起来“消失”，桌面端只使用既有的稳定端口，不静默切换端口。
        actualPort = await selectStableDesktopPort(BASE_PORT, isPortAvailable);
        if (!actualPort) {
            const msg = `端口 ${BASE_PORT} 已被占用。为保护本地作品数据，Author 不会自动切换到其他端口。\n\n请关闭占用该端口的程序后重试。`;
            log('ERROR: ' + msg);
            dialog.showErrorBox('Author 启动失败', msg);
            resolve(false);
            return;
        }

        log(`Using port: ${actualPort}`);

        // ===== 策略1：尝试子进程模式（5 秒超时预检） =====
        const childProcessOk = await tryChildProcessMode(standaloneDir, serverPath);
        if (childProcessOk) {
            log('[Strategy] Child process mode succeeded');
            const ready = await waitForServer(actualPort);
            serverReady = ready;
            log(`Server ready: ${ready}`);
            resolve(ready);
            return;
        }

        // ===== 策略2：主进程内直接加载 server.js =====
        log('[Strategy] Falling back to in-process server mode...');
        updateSplashText('正在以兼容模式启动...');

        const inProcessOk = await tryInProcessMode(standaloneDir, serverPath);
        if (inProcessOk) {
            log('[Strategy] In-process mode succeeded');
            const ready = await waitForServer(actualPort);
            serverReady = ready;
            log(`Server ready: ${ready}`);
            resolve(ready);
            return;
        }

        log('[Strategy] All strategies failed');
        resolve(false);
    });
}

// ===== 策略1：子进程模式 =====
function tryChildProcessMode(standaloneDir, serverPath) {
    return new Promise(async (resolve) => {
        const nodeExecutable = process.execPath;
        log(`[ChildProcess] Node executable: ${nodeExecutable}`);

        updateSplashText('正在检测运行环境...');

        // 预检：验证 ELECTRON_RUN_AS_NODE 是否生效（5 秒超时）
        const preflightOk = await new Promise((preResolve) => {
            const { spawn: spawnProcess } = require('child_process');
            log('[Preflight] Testing ELECTRON_RUN_AS_NODE...');
            let resolved = false;
            const testProc = spawnProcess(nodeExecutable, ['-e', 'console.log("PREFLIGHT_OK:" + process.version)'], {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });
            let testOutput = '';
            let testErr = '';
            testProc.stdout.on('data', (d) => { testOutput += d.toString(); });
            testProc.stderr.on('data', (d) => { testErr += d.toString(); });
            testProc.on('close', (code) => {
                if (resolved) return;
                resolved = true;
                log(`[Preflight] exit code: ${code}, stdout: ${testOutput.trim()}, stderr: ${testErr.trim()}`);
                preResolve(testOutput.includes('PREFLIGHT_OK'));
            });
            testProc.on('error', (err) => {
                if (resolved) return;
                resolved = true;
                log(`[Preflight] error: ${err.message}`);
                preResolve(false);
            });
            // 5 秒超时（不再等 10 秒）
            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                log('[Preflight] Timed out after 5s — ELECTRON_RUN_AS_NODE likely blocked');
                try { testProc.kill(); } catch (e) { }
                preResolve(false);
            }, 5000);
        });

        if (!preflightOk) {
            log('[ChildProcess] Preflight failed, skipping child process mode');
            resolve(false);
            return;
        }
        log('[ChildProcess] Preflight passed');

        // 启动服务子进程
        updateSplashText('正在启动内置服务...');
        serverCrashed = false;

        const serverPathEscaped = serverPath.replace(/\\/g, '\\\\');
        const wrapperScript = [
            `process.on('uncaughtException', (e) => { console.error('UNCAUGHT_EXCEPTION:', e.stack || e); process.exit(1); });`,
            `process.on('unhandledRejection', (e) => { console.error('UNHANDLED_REJECTION:', e && e.stack ? e.stack : e); process.exit(1); });`,
            `console.log('WRAPPER: Starting server.js at ' + new Date().toISOString());`,
            `try { require('${serverPathEscaped}'); } catch(e) { console.error('WRAPPER_LOAD_ERROR:', e.stack || e); process.exit(1); }`,
        ].join('\n');

        try {
            const { spawn: spawnProcess } = require('child_process');
            serverProcess = spawnProcess(nodeExecutable, ['-e', wrapperScript], {
                cwd: standaloneDir,
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    PORT: String(actualPort),
                    HOSTNAME: '127.0.0.1',
                    BODY_SIZE_LIMIT: '52428800',
                    AUTHOR_DESKTOP_CAPABILITY: desktopCapability,
                    ELECTRON_RUN_AS_NODE: '1',
                },
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });

            log(`[ChildProcess] Spawned PID: ${serverProcess.pid}`);

            if (!serverProcess.pid) {
                log('[ChildProcess] ERROR: No PID');
                resolve(false);
                return;
            }

            serverProcess.stdout.on('data', (data) => {
                log('[Next.js stdout] ' + data.toString().trim());
            });
            serverProcess.stderr.on('data', (data) => {
                log('[Next.js stderr] ' + data.toString().trim());
            });
            serverProcess.on('error', (err) => {
                log('[Server process error] ' + err.message);
                serverCrashed = true;
                serverIdentityVerified = false;
            });
            serverProcess.on('exit', (code, signal) => {
                log(`[Server process exit] code: ${code}, signal: ${signal}`);
                serverReady = false;
                serverCrashed = true;
                serverIdentityVerified = false;
            });
            serverProcess.on('close', (code, signal) => {
                log(`[Server process closed] code: ${code}, signal: ${signal}`);
                serverReady = false;
                serverIdentityVerified = false;
            });

            // 等 3 秒检查是否还活着
            await new Promise(r => setTimeout(r, 3000));
            if (serverCrashed) {
                log('[ChildProcess] Process crashed during startup');
                resolve(false);
                return;
            }

            log('[ChildProcess] Process alive, waiting for HTTP...');
            updateSplashText('等待服务就绪...');
            resolve(true);

        } catch (spawnErr) {
            log(`[ChildProcess] Spawn error: ${spawnErr.message}`);
            resolve(false);
        }
    });
}

// ===== 策略2：主进程内直接加载 =====
function tryInProcessMode(standaloneDir, serverPath) {
    return new Promise(async (resolve) => {
        log('[InProcess] Loading server.js directly in main process...');
        log(`[InProcess] Setting CWD to: ${standaloneDir}`);
        log(`[InProcess] PORT=${actualPort}`);

        // 保存原始 CWD 和环境变量
        const originalCwd = process.cwd();

        try {
            // 设置环境变量（server.js 会读取这些）
            process.env.NODE_ENV = 'production';
            process.env.PORT = String(actualPort);
            process.env.HOSTNAME = '127.0.0.1';
            process.env.BODY_SIZE_LIMIT = '52428800';
            process.env.AUTHOR_DESKTOP_CAPABILITY = desktopCapability;

            // 切换工作目录到 standalone（server.js 需要相对路径找 .next 文件）
            process.chdir(standaloneDir);
            log('[InProcess] CWD changed to: ' + process.cwd());

            // 加载 server.js
            require(serverPath);
            log('[InProcess] server.js loaded successfully (sync)');

            // 等待 2 秒让服务完成异步初始化
            await new Promise(r => setTimeout(r, 2000));

            updateSplashText('等待服务就绪...');
            resolve(true);

        } catch (err) {
            log(`[InProcess] FAILED: ${err.message}`);
            log(`[InProcess] Stack: ${err.stack}`);
            // 恢复 CWD
            try { process.chdir(originalCwd); } catch (e) { }
            resolve(false);
        }
    });
}

// ==================== 启动闪屏窗口 ====================

function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 400,
        height: 200,
        frame: false,
        transparent: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        show: true,
        backgroundColor: '#1a1a2e',
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webviewTag: false,
            navigateOnDragDrop: false,
        },
    });

    const splashHtml = `
    <html>
    <head><meta charset="utf-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #e0e0e0;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            height: 100vh; user-select: none; -webkit-app-region: drag;
        }
        .title { font-size: 28px; font-weight: 700; color: #fff; margin-bottom: 16px; letter-spacing: 2px; }
        .status { font-size: 14px; color: #a0a8c0; margin-bottom: 20px; transition: opacity 0.3s; }
        .spinner {
            width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.15);
            border-top-color: #e94560; border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    </head>
    <body>
        <div class="title">Author</div>
        <div class="status" id="status">正在初始化...</div>
        <div class="spinner"></div>
    </body>
    </html>`;

    splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));

    splashWindow.on('closed', () => {
        splashWindow = null;
    });
}

function updateSplashText(text) {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.executeJavaScript(
            `document.getElementById('status').textContent = ${JSON.stringify(text)};`
        ).catch(() => { });
    }
}

function closeSplashWindow() {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
    }
}

function cleanupBundledNonRuntimeFiles() {
    if (!app.isPackaged) return;

    const standaloneDir = path.join(process.resourcesPath, 'standalone');
    const removableEntries = [
        'docs',
        '.agent',
    ];

    try {
        if (!fs.existsSync(standaloneDir)) {
            log(`[Cleanup] standalone dir not found, skip: ${standaloneDir}`);
            return;
        }

        for (const entry of removableEntries) {
            const targetPath = path.join(standaloneDir, entry);
            if (fs.existsSync(targetPath)) {
                fs.rmSync(targetPath, { recursive: true, force: true });
                log(`[Cleanup] Removed stale bundled path: ${targetPath}`);
            }
        }

        const topLevelEntries = fs.readdirSync(standaloneDir, { withFileTypes: true });
        const staleDirPatterns = [/^方案/i, /^计划/i, /草稿/i, /draft/i];
        for (const entry of topLevelEntries) {
            const targetPath = path.join(standaloneDir, entry.name);
            if (entry.isDirectory()) {
                if (!staleDirPatterns.some((pattern) => pattern.test(entry.name))) continue;

                fs.rmSync(targetPath, { recursive: true, force: true });
                log(`[Cleanup] Removed stale bundled path: ${targetPath}`);
                continue;
            }

            if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.log') continue;

            fs.rmSync(targetPath, { force: true });
            log(`[Cleanup] Removed stale bundled path: ${targetPath}`);
        }
    } catch (err) {
        log(`[Cleanup] Failed to remove stale bundled files: ${err.message}`);
    }
}

app.whenReady().then(async () => {
    log('=== Author Desktop Starting ===');
    log(`Electron version: ${process.versions.electron}`);
    log(`Node version: ${process.versions.node}`);
    log(`Platform: ${process.platform} ${process.arch}`);
    log(`App path: ${app.getAppPath()}`);
    log(`Exe path: ${process.execPath}`);

    cleanupBundledNonRuntimeFiles();

    // 立即显示启动窗口，让用户知道程序在运行
    if (!isDev) {
        createSplashWindow();
    }

    const ready = await startNextServer();

    if (!ready) {
        closeSplashWindow();
        log('Server failed to start. Showing error dialog.');
        dialog.showErrorBox(
            'Author 启动失败',
            '内置服务器无法启动。\n\n' +
            '可能原因：\n' +
            '1. 端口被其他程序占用\n' +
            '2. 缺少运行文件\n' +
            '3. 防火墙或杀毒软件拦截\n\n' +
            '请检查日志: ' + logFile
        );
        app.quit();
        return;
    }

    const trustedServer = await establishDesktopServerTrust();
    if (!trustedServer) {
        closeSplashWindow();
        log('Desktop server identity verification failed.');
        dialog.showErrorBox(
            'Author 安全校验失败',
            '内置服务未能通过身份校验。为防止连接到伪造的本地服务，应用已停止启动。\n\n请检查日志: ' + logFile
        );
        app.quit();
        return;
    }

    updateSplashText('加载界面中...');
    createWindow();

    // 主窗口显示后关闭 splash
    mainWindow.once('ready-to-show', () => {
        closeSplashWindow();
    });

    // 兜底：5 秒后无论如何关闭 splash
    setTimeout(closeSplashWindow, 5000);

    setupAutoUpdater();
});

// ==================== 自动更新 (electron-updater) ====================

function setupAutoUpdater() {
    // electron-updater 仅在打包后可用
    if (isDev || !app.isPackaged) {
        log('Dev mode — skipping auto-updater setup');
        return;
    }

    let autoUpdater;
    try {
        autoUpdater = require('electron-updater').autoUpdater;
    } catch (err) {
        log('Failed to load electron-updater: ' + err.message);
        return;
    }

    // 配置
    autoUpdater.autoDownload = false;        // 不自动下载，等用户确认
    autoUpdater.autoInstallOnAppQuit = true;  // 退出时自动安装已下载的更新
    autoUpdater.logger = { info: log, warn: log, error: log, debug: log };

    let installingUpdate = false;
    const requestUpdateInstall = () => exitController.request(() => {
        installingUpdate = true;
        try {
            autoUpdater.quitAndInstall(false, true);
        } catch (error) {
            autoUpdater.emit('error', error);
        }
    });

    // ---- 事件转发到渲染进程 ----
    autoUpdater.on('update-available', (info) => {
        log(`Update available: v${info.version}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-available', {
                version: info.version,
                releaseDate: info.releaseDate,
            });
        }
    });

    autoUpdater.on('update-not-available', () => {
        log('No update available');
    });

    autoUpdater.on('download-progress', (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-download-progress', {
                progress: Math.floor(progress.percent),
                bytesPerSecond: progress.bytesPerSecond,
                downloaded: progress.transferred,
                total: progress.total,
            });
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        log(`Update downloaded: v${info.version}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-downloaded', {
                version: info.version,
            });
        }
    });

    autoUpdater.on('error', (err) => {
        if (installingUpdate) {
            installingUpdate = false;
            exitController.cancel();
        }
        log('Auto-updater error: ' + err.message);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-error', {
                error: err.message,
            });
        }
    });

    // ---- IPC 处理 ----
    ipcMain.handle('check-for-update', async (event) => {
        assertTrustedIpcSender(event);
        try {
            const result = await autoUpdater.checkForUpdates();
            return { success: true, version: result?.updateInfo?.version };
        } catch (err) {
            log('Check update error: ' + err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('download-update', async (event) => {
        assertTrustedIpcSender(event);
        try {
            await autoUpdater.downloadUpdate();
            return { success: true };
        } catch (err) {
            log('Download update error: ' + err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('download-and-install-update', async (event) => {
        assertTrustedIpcSender(event);
        try {
            log('download-and-install-update: starting download...');
            await autoUpdater.downloadUpdate();
            log('download-and-install-update: download complete, requesting saved exit...');
            requestUpdateInstall();
            return { success: true };
        } catch (err) {
            log('download-and-install-update error: ' + err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('quit-and-install', (event) => {
        assertTrustedIpcSender(event);
        log('User requested quit-and-install');
        requestUpdateInstall();
    });

    // 窗口显示后 5 秒自动检查一次更新
    setTimeout(() => {
        log('Auto-checking for updates...');
        autoUpdater.checkForUpdates().catch(err => {
            log('Auto-check update failed: ' + err.message);
        });
    }, 5000);
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.on('window-all-closed', () => {
    app.quit();
});

// before-quit runs before the cancelable close/save handshake. Stop the backend
// only after all windows have closed, so cancel/save/sync IPC stays trusted.
app.on('will-quit', () => {
    lanShareGateway.close();
    const stoppedServer = serverProcess;
    serverProcess = null;
    if (stoppedServer) stoppedServer.kill();
});
