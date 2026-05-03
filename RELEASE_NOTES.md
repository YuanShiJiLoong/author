## v1.2.22 — 提升快照可靠性与崩溃诊断安全性 | Improved snapshot reliability and crash diagnostics safety

### 🇨🇳 中文

#### 🕒 快照可靠性修复
- **降低自动快照写入内存峰值**：快照仍保留完整章节、设定集和 AI 对话数据，但存储方式改为“轻量索引 + 单份完整快照分开保存”，新增快照时不再反复重写整份历史快照数组
- **兼容旧版快照数据**：已有 `author-snapshots` 会在读取时迁移到新的分片存储结构，保留历史快照列表与回滚能力
- **减少快照写入失败导致的恢复落后**：修复大型项目或长时间使用后，自动快照可能因 IndexedDB 单次写入过大而失败的问题

#### 🧰 崩溃诊断增强
- **崩溃报告包含最近操作链**：桌面端会在主进程中保留最近的页面生命周期、点击、拖拽、drop、快捷键和错误摘要；即使渲染进程直接崩溃，crash report 也能带上崩溃前线索
- **避免主日志被普通操作刷屏**：普通操作只进入主进程内存环形缓冲，warn/error 仍会写入主日志，兼顾诊断完整性与日志体积
- **增强脱敏与截断**：诊断日志继续脱敏 API Key、Bearer Token、Authorization、password/secret/token 等字段，并增加公网 IP 脱敏和超长日志截断

#### 🔒 发布与 Docker 安全
- **补强 Docker 构建上下文排除规则**：排除日志、压缩包、crash report 和诊断导出文件，防止临时排查材料误进入 Docker 构建上下文
- **补齐缺失翻译**：补充 AI 输入展开和云同步指南相关多语言文案，减少无意义的缺失翻译日志噪声

---

### 🇬🇧 English

#### 🕒 Snapshot Reliability Fixes
- **Reduced peak memory usage for auto snapshots**: Snapshots still preserve full chapter, settings, and AI chat data, but storage now uses a lightweight index plus one complete record per snapshot instead of rewriting the entire snapshot history array
- **Backward-compatible migration**: Existing `author-snapshots` data is migrated on read to the new split-storage layout while keeping the snapshot list and rollback flow intact
- **Fewer stale restores after failed snapshots**: Fixes cases where large projects or long sessions could fail an IndexedDB snapshot write because a single write became too large

#### 🧰 Crash Diagnostics Improvements
- **Crash reports now include recent interaction breadcrumbs**: The desktop main process keeps recent page lifecycle events, clicks, drag/drop actions, shortcuts, and error summaries so crash reports can still show what happened before a hard renderer crash
- **Avoided noisy main logs**: Regular interaction breadcrumbs stay in a bounded in-memory buffer, while warnings and errors continue to be written to the main log
- **Stronger redaction and truncation**: Diagnostic logs continue to redact API keys, Bearer tokens, Authorization values, password/secret/token fields, and now also redact public IP addresses and truncate overly long log entries

#### 🔒 Release & Docker Safety
- **Hardened Docker build context exclusions**: Logs, archives, crash reports, and diagnostic export files are now excluded from Docker build contexts to prevent temporary troubleshooting material from being copied accidentally
- **Filled missing translations**: Added missing labels for expanded AI input and cloud sync guide text to reduce noisy missing-translation warnings

---

## v1.2.22 追加更新 — AI 对话发送快捷键与诊断入口 | Follow-up: AI chat shortcuts and diagnostic access

### 🇨🇳 中文

#### 💬 AI 对话体验
- **新增发送快捷键设置**：可在「设定集 → 偏好设置」选择 Enter 发送，或 Ctrl/⌘ + Enter 发送
- **统一小窗与全屏输入行为**：AI 对话小输入框和全屏输入面板共享同一发送/换行规则，减少长 Prompt 编辑时误发送
- **补齐多语言文案**：新增中文、英文、俄文界面文案，确保设置项和输入提示一致

#### 🧰 诊断日志说明
- **帮助页新增日志位置入口**：桌面端「帮助 → 关于」新增“打开日志目录”，可直接定位本地日志
- **校正桌面日志路径说明**：文档统一为 `%APPDATA%\author-app\author-debug.log` 和 `%APPDATA%\author-app\crash-reports\author-crash-*.json`
- **更新 README 多语言说明**：补充诊断日志查看、导出、崩溃报告位置，以及浏览器 / 源码 / Vercel 部署与桌面端的差异

---

### 🇬🇧 English

#### 💬 AI Chat Experience
- **Added configurable chat send shortcuts**: Choose Enter to send, or Ctrl/⌘ + Enter to send from Settings → Preferences
- **Unified compact and expanded input behavior**: The compact AI chat input and expanded prompt editor now share the same send/newline rules to reduce accidental sends while writing long prompts
- **Completed locale text**: Added Chinese, English, and Russian labels for the new setting and input hints

#### 🧰 Diagnostic Log Guidance
- **Added a desktop log location entry point**: The desktop Help → About panel now includes “Open Log Folder” for quick access to local logs
- **Corrected desktop log path documentation**: Docs now use `%APPDATA%\author-app\author-debug.log` and `%APPDATA%\author-app\crash-reports\author-crash-*.json`
- **Updated multilingual README guidance**: Added how to view/export diagnostics, where crash reports live, and how browser/source/Vercel deployments differ from the desktop client
