const { contextBridge, ipcRenderer } = require('electron');

// 预加载脚本 — 安全隔离，通过 contextBridge 暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    // 自动下载并安装更新
    downloadAndInstallUpdate: () => ipcRenderer.invoke('download-and-install-update'),
    // 监听下载进度
    onUpdateProgress: (callback) => {
        ipcRenderer.on('update-download-progress', (event, data) => callback(data));
    },
});
