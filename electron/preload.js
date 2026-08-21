const { contextBridge, ipcRenderer } = require('electron');

// 预加载脚本 — 安全隔离，通过 contextBridge 暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    // ---- 自动更新 (electron-updater) ----
    checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    downloadAndInstallUpdate: () => ipcRenderer.invoke('download-and-install-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    // 监听更新事件
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (event, data) => callback(data));
    },
    onUpdateProgress: (callback) => {
        ipcRenderer.on('update-download-progress', (event, data) => callback(data));
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', (event, data) => callback(data));
    },
    onUpdateError: (callback) => {
        ipcRenderer.on('update-error', (event, data) => callback(data));
    },
    // ---- 退出确认 ----
    onExitSyncRequest: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('confirm-exit-sync', listener);
        return () => ipcRenderer.removeListener('confirm-exit-sync', listener);
    },
    allowClose: () => {
        ipcRenderer.send('allow-close');
    },
    cancelClose: () => {
        ipcRenderer.send('cancel-close');
    },
    // ---- 诊断日志 ----
    writeDiagnosticLog: (entry) => ipcRenderer.invoke('write-diagnostic-log', entry),
    getDiagnosticBundle: () => ipcRenderer.invoke('get-diagnostic-bundle'),
    openDiagnosticLogFile: () => ipcRenderer.invoke('open-diagnostic-log-file'),
    // ---- 本机安全存储（WebDAV 应用密码等）----
    secureSet: (key, value) => ipcRenderer.invoke('secure-store-set', key, value),
    secureGet: (key) => ipcRenderer.invoke('secure-store-get', key),
    secureDelete: (key) => ipcRenderer.invoke('secure-store-delete', key),
});
