## v1.2.48 — 自建账号云同步上线，隐私政策与服务条款全面更新

### 中文

#### 桌面端 / Web

- 全新 Author 账号云同步（自建服务）：支持邮箱验证码注册与登录，替代旧版 Google Firebase 同步；旧账号可通过迁移向导完成数据迁移（登录旧账号取回数据 → 注册 / 登录新账号 → 上传，全程数据只增不删）。旧版 Firebase 同步计划于 2026 年 7 月底停止服务。
- 官方网页版上线：国内用户的账号注册与云同步统一在官方网页版 `free.author2.com/app` 提供。开源 / 桌面版会显示一条可关闭的公告并引导前往；自托管用户仍可在登录窗口填写自己的服务器地址。
- 隐私默认加固：开源与桌面构建不再内置任何同步服务器地址——未显式配置服务器时，应用不会连接任何后端。
- 《用户服务协议》与《隐私政策》全面重写（自 2026 年 7 月 5 日起生效），覆盖中、英、俄、阿四种语言：明确 AI 客户端定位（不内置、不训练、不托管任何模型）、数据收集清单、未成年人保护、账号注销与数据导出等条款。
- 登录与注册新增条款同意勾选；政策发生实质更新后，已登录用户会收到确认弹窗——同意后继续使用，不同意可退出登录并导出数据。
- 法律文档改为应用内置页面：构建时自动从政策原文生成带排版的 HTML，点击即开、离线可读，不再依赖外部链接。
- 官方网页版的 AI 请求默认由浏览器直接连接你选择的服务商（提示词与 API Key 不经过官方服务器）；仅代理、联网搜索或个别不支持直连的服务商会自动回落到服务器转发。
- 修复：法律文档生成脚本的 markdown-it 依赖未声明；欢迎引导"云同步"卡片文字未居中；登录弹窗若干样式细节。

#### Android 端

- 登录页与云同步页新增引导：账号注册与国内云同步请前往官方网页版（App 暂时无法直接连接国内云同步服务器）；本地写作、WebDAV / 局域网同步不受影响。
- 与桌面端一致的隐私默认：App 不再内置云同步服务器地址（自托管构建可用 `--dart-define=AUTHOR_CLOUD_URL` 注入）。
- 新增政策更新确认弹窗：条款更新后，已登录用户需重新阅读并同意，不同意可退出登录。
- 内置《用户服务协议》《隐私政策》同步更新为四语最新版本。
- 修复云同步页"前往官方网页版"按钮文字被裁剪、卡片内开关水波纹被背景遮挡的问题。
- Android 版本号更新为 `1.2.48+1248`。

---

### English

#### Desktop / Web

- Brand-new Author account cloud sync (self-hosted service): register and sign in with email verification codes, replacing the legacy Google Firebase sync. Existing users can migrate via the built-in wizard (sign in to the old account to pull data → register / sign in to the new account → upload; data is only added, never deleted, throughout). Legacy Firebase sync is scheduled to shut down at the end of July 2026.
- Official web app launched: for users in mainland China, account registration and cloud sync are now provided on the official web app at `free.author2.com/app`. Open-source and desktop builds show a dismissible notice guiding you there; self-hosters can still enter their own server address in the sign-in dialog.
- Stronger privacy defaults: open-source and desktop builds no longer embed any sync server address — with no server explicitly configured, the app connects to no backend at all.
- Fully rewritten Terms of Service and Privacy Policy (effective July 5, 2026) in Chinese, English, Russian, and Arabic: clarifying Author's role as a pure AI client (no built-in, trained, or hosted models), the data-collection inventory, minor protection, account deletion, and data export.
- Sign-in and registration now require ticking a consent checkbox; after any material policy update, signed-in users see a confirmation dialog — agree to continue, or disagree to sign out and export your data.
- Legal documents are now bundled in-app: nicely formatted HTML pages are generated from the policy sources at build time, open instantly, and work offline — no external links required.
- On the official web app, AI requests connect directly from your browser to your chosen provider by default (prompts and API keys never touch the official server); only proxies, web search, or the few providers that block browser connections fall back to server relay automatically.
- Fixes: undeclared markdown-it dependency of the legal-docs build script; off-center text on the onboarding "Cloud Sync" cards; assorted sign-in dialog style details.

#### Android

- New guidance on the sign-in and cloud-sync pages: please use the official web app for account registration and China-hosted cloud sync (the mobile app cannot connect to the domestic sync server yet); local writing and WebDAV / LAN sync are unaffected.
- Same privacy default as desktop: the app no longer embeds a cloud sync server address (self-hosted builds can inject one via `--dart-define=AUTHOR_CLOUD_URL`).
- Added a policy-update confirmation dialog: after terms are updated, signed-in users must review and agree again, or sign out.
- Bundled Terms of Service and Privacy Policy updated to the latest four-language versions.
- Fixed the clipped "Open the web app" button text on the cloud-sync page and switch ink ripples being hidden by the card background.
- Android is now version `1.2.48+1248`.
