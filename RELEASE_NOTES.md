## v1.2.21 — 完善崩溃诊断日志导出 | Improved crash diagnostics export

### 🇨🇳 中文

#### 🧰 诊断日志与崩溃报告
- **新增诊断日志导出**：在「帮助 → 关于」新增「导出诊断日志」按钮，可下载 `author-diagnostic-*.json`，便于用户反馈白屏、卡死、异常退出前后的线索
- **错误页支持导出日志**：当 React 错误边界仍能渲染时，错误页会显示「导出诊断日志」按钮，用户不再只能截图错误信息
- **客户端崩溃自动落盘**：Windows 桌面端渲染进程崩溃或无响应时，主进程会自动写入 `%APPDATA%\Author\crash-reports\author-crash-*.json`
- **崩溃弹窗可直达日志目录**：渲染进程崩溃弹窗新增「打开日志目录」，即使应用已经无法进入主界面，也能找到诊断报告
- **主进程异常兜底**：Electron 主进程的 `uncaughtException` 和 `unhandledRejection` 会写入 crash report，减少“直接退出但没有线索”的情况

#### 🔎 更完整的排查线索
- **记录前端异常链路**：采集 `window.error`、`unhandledrejection`、`console.warn/error`、React 错误边界等关键错误信息
- **记录最近操作面包屑**：保留最近点击、拖拽、快捷键、页面生命周期变化等操作摘要，方便定位“用户做了什么之后崩溃”
- **桌面端日志桥接**：重要前端错误会同步写入 `%APPDATA%\Author\author-debug.log`，导出的诊断包也会包含主进程日志尾部
- **敏感信息脱敏**：诊断日志会对 API Key、Bearer Token、Authorization、password/secret/token 等字段做脱敏处理

---

### 🇬🇧 English

#### 🧰 Diagnostic Logs & Crash Reports
- **Added diagnostic export**: A new "Export Diagnostic Logs" button is available under Help → About, downloading an `author-diagnostic-*.json` file for white-screen, freeze, and crash reports
- **Error page log export**: When the React error boundary can still render, the error page now exposes an "Export Diagnostic Logs" button instead of relying on screenshots alone
- **Automatic crash reports on desktop**: The Windows desktop client now writes `%APPDATA%\Author\crash-reports\author-crash-*.json` when the renderer crashes or becomes unresponsive
- **Crash dialog opens the log folder**: Renderer crash dialogs now include an "Open Log Folder" action, so users can find the report even when the app can no longer enter the main UI
- **Main-process fallback**: Electron main-process `uncaughtException` and `unhandledRejection` events now write crash reports, reducing cases where the app exits without useful clues

#### 🔎 More Complete Debugging Context
- **Captured frontend error chain**: Records `window.error`, `unhandledrejection`, `console.warn/error`, and React error-boundary failures
- **Recent interaction breadcrumbs**: Keeps summaries of recent clicks, drag-and-drop actions, shortcuts, and page lifecycle changes to help identify what happened before a crash
- **Desktop log bridge**: Important frontend failures are mirrored into `%APPDATA%\Author\author-debug.log`, and diagnostic exports include the tail of the main-process log
- **Sensitive data redaction**: Diagnostic logs redact API keys, Bearer tokens, Authorization values, password/secret/token fields, and similar sensitive values
