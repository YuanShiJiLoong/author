const { contextBridge } = require('electron');

// 最小预加载脚本 — 安全隔离
// 如果将来需要从渲染进程调用 Node.js API，可以通过 contextBridge 暴露
contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
});
