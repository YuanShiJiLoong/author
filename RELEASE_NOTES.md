## v1.2.51 — 加强数据安全并优化手机端体验

### 中文

#### 桌面端 / Web

- 旧版云同步（Firebase / Google 登录）将于 2026 年 8 月 15 日停止服务；应用内迁移提醒、帮助页和多语言 README 已同步更新，请在停服前完成数据迁移。本地写作数据、WebDAV 与局域网同步不受影响。
- 优化手机网页底部备案栏，只常驻展示必要备案信息，减少小屏幕上的换行与内容遮挡。
- 加强自部署文件存储安全：默认关闭未经认证的服务端文件存储，启用时必须显式配置独立数据目录，并增加路径、请求大小和缓存控制保护。
- 生产构建现在会自动检查运行包，避免把本地数据、环境文件、日志或工作目录带入安装包和服务端产物。
- 完善子路径部署与自托管说明，并修复 Windows 特殊仓库所有权环境下发版预检可能误报的问题。

#### Android 端

- 同步版本号为 `1.2.51+1251`；本次没有 Android 功能改动。

---

### English

#### Desktop / Web

- Legacy cloud sync (Firebase / Google sign-in) will shut down on August 15, 2026. Migration notices, help content, and multilingual READMEs now use the same deadline. Local writing data, WebDAV, and LAN sync are unaffected.
- Improved the mobile web footer so only required registration links remain persistently visible, reducing wrapping and obstruction on small screens.
- Hardened self-hosted file storage: unauthenticated server-side storage is disabled by default, enabling it requires an explicit external data directory, and requests now receive stronger path, size, and cache protections.
- Production builds now verify their runtime bundle automatically so local data, environment files, logs, and workspace directories are not included in installers or server artifacts.
- Clarified subpath and self-hosting documentation, and fixed release preflight failures on Windows repositories with special ownership settings.

#### Android

- Synchronized the version to `1.2.51+1251`; this release contains no Android feature changes.
