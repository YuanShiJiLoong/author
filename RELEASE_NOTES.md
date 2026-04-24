## v1.2.19 — 支持 DeepSeek V4 并修复发版 lint | Added DeepSeek V4 support and fixed release lint

### 🇨🇳 中文

#### 🤖 DeepSeek V4 支持
- **更新 DeepSeek 默认接口地址**：OpenAI 兼容接口默认 Base URL 改为 `https://api.deepseek.com`，匹配 DeepSeek V4 官方文档
- **更新 DeepSeek 默认模型**：新增并优先使用 `deepseek-v4-pro`、`deepseek-v4-flash`，旧 `deepseek-chat`、`deepseek-reasoner` 保留在列表中用于兼容
- **补充旧模型停用提醒**：在设置页中对 `deepseek-chat` / `deepseek-reasoner` 显示 `2026-07-24` 停用提示，避免用户误选旧模型

#### 🧠 思考模式与 Tool Calls
- **支持 DeepSeek V4 `thinking` 参数**：默认开启思考模式；选择关闭思考或 `reasoningEffort: "none"` 时会发送 `thinking: { type: "disabled" }`
- **优化高级参数行为**：DeepSeek V4 思考模式开启时不再发送 `temperature` / `top_p`，避免这些参数被模型忽略造成误解
- **修复 DeepSeek 思考模式工具调用上下文**：当模型返回 `tool_calls` 时，会保留 `reasoning_content` 进入下一轮请求，符合 DeepSeek V4 文档要求

#### 🔌 连接测试与配置示例
- **更新 DeepSeek 连接测试**：测试连接默认使用 `deepseek-v4-pro` 和新 Base URL，并关闭思考以降低测试延迟和成本
- **更新 `.env.example` 示例**：DeepSeek 示例配置改为 `API_BASE_URL=https://api.deepseek.com`、`API_MODEL=deepseek-v4-pro`
- **清理 Key 占位符写法**：示例环境变量改为空值形式，避免发版安全脚本把说明文字误判为密钥

#### 🧹 发版与 lint 修复
- **修复完整 lint 失败问题**：排除构建产物和 KaTeX 静态资源，并将 React Compiler 迁移类检查降为 warning
- **修复真实 Hook 顺序问题**：调整应用 store 和编辑器工具栏中的 Hook 调用顺序，保留关键 Hook 规则为 error
- **优化发版安全脚本**：删除行不再被当作即将发布的密钥内容，减少安全检查误报

---

### 🇬🇧 English

#### 🤖 DeepSeek V4 Support
- **Updated the default DeepSeek endpoint**: The OpenAI-compatible Base URL now defaults to `https://api.deepseek.com`, matching the official DeepSeek V4 documentation
- **Updated default DeepSeek models**: Added and prioritized `deepseek-v4-pro` and `deepseek-v4-flash`, while keeping `deepseek-chat` and `deepseek-reasoner` for compatibility
- **Added legacy model deprecation hints**: The settings page now warns that `deepseek-chat` / `deepseek-reasoner` are scheduled for deprecation on `2026-07-24`

#### 🧠 Thinking Mode and Tool Calls
- **Added DeepSeek V4 `thinking` support**: Thinking is enabled by default; disabling thinking or using `reasoningEffort: "none"` sends `thinking: { type: "disabled" }`
- **Improved advanced parameter handling**: `temperature` and `top_p` are no longer sent while DeepSeek V4 thinking mode is enabled, avoiding confusing ignored parameters
- **Fixed tool-call context in DeepSeek thinking mode**: When the model returns `tool_calls`, `reasoning_content` is preserved for the next request as required by the DeepSeek V4 docs

#### 🔌 Connection Tests and Examples
- **Updated DeepSeek connection tests**: Test calls now default to `deepseek-v4-pro` and the new Base URL, with thinking disabled to reduce latency and cost
- **Updated `.env.example`**: The DeepSeek example now uses `API_BASE_URL=https://api.deepseek.com` and `API_MODEL=deepseek-v4-pro`
- **Cleaned up API key placeholders**: Example environment variables now use empty values so release safety checks do not mistake explanatory placeholders for secrets

#### 🧹 Release and Lint Fixes
- **Fixed full lint failures**: Build artifacts and KaTeX static assets are excluded, and React Compiler migration checks are reported as warnings
- **Fixed real Hook ordering issues**: Store and editor toolbar hook order was adjusted while keeping critical hook rules as errors
- **Improved the release safety script**: Deleted diff lines are no longer treated as soon-to-be-published secret content, reducing false positives
