## v1.2.50 — 修复 DeepSeek 连接测试 404，并明确官网部署边界

### 中文

#### 桌面端 / Web

- 修复切换 AI 供应商后顶层 `providerType` 可能残留为旧供应商的问题。此前可能出现 `provider: deepseek`、`providerType: claude` 的矛盾配置，导致 DeepSeek 测试连接误走 Anthropic `/v1/messages` 接口并显示 404。
- DeepSeek 使用默认地址 `https://api.deepseek.com` 即可连接，不再需要通过添加 `/anthropic` 后缀绕过错误协议分支。
- 供应商切换时同步更新 `provider` 与 `providerType`；测试请求也会携带一致的供应商类型，服务端对旧浏览器配置增加兼容处理。
- 官方网页版的 DeepSeek 连接测试优先使用与实际对话一致的浏览器直连链路；自定义代理、桌面端、普通自部署或直连失败时仍使用原有服务端测试路由。
- 连接探测改为最小请求，不再为 DeepSeek V4 强制附加思考模式参数，避免非必要参数干扰基础连通性判断。
- 新增显式 `official-web` 构建目标。`NEXT_PUBLIC_BASE_PATH` 只负责子路径路由，不再被用来推断部署身份；开源、桌面和普通自部署版本默认行为不变。
- 中、英、俄、阿四种 README 与开源边界文档同步说明公共源码、官网私有配置及部署职责，防止备案、云服务配置或私有部署资产混入开源仓库。

#### Android 端

- 同步版本号为 `1.2.50+1250`；本次没有 Android 功能改动。

---

### English

#### Desktop / Web

- Fixed stale top-level `providerType` values after switching AI providers. A mismatched configuration such as `provider: deepseek` with `providerType: claude` could previously route a DeepSeek connection test to the Anthropic `/v1/messages` endpoint and surface a 404.
- DeepSeek now works with the default `https://api.deepseek.com` base URL; adding an `/anthropic` suffix is no longer needed as a workaround for the wrong protocol branch.
- Provider changes now synchronize both `provider` and `providerType`; connection tests send a consistent provider type, and the server tolerates legacy browser configurations.
- On the official web app, DeepSeek connection tests prefer the same browser-direct path used by real conversations. Custom proxies, desktop builds, ordinary self-hosted deployments, and direct-connect failures continue to use the existing server-side test route.
- Connection probes now use a minimal request and no longer force a thinking-mode parameter for DeepSeek V4, keeping basic connectivity checks free of unrelated options.
- Added an explicit `official-web` build target. `NEXT_PUBLIC_BASE_PATH` now represents subpath routing only and is no longer treated as deployment identity; open-source, desktop, and ordinary self-hosted defaults remain unchanged.
- Updated the Chinese, English, Russian, and Arabic READMEs and the open-core boundary documentation to separate shared source code from official private configuration and deployment responsibilities.

#### Android

- Synchronized the version to `1.2.50+1250`; this release contains no Android feature changes.
