## v1.2.52 — 安全与稳定性更新

### 中文

#### 桌面端 / Web

- 加强外部 API 地址校验，阻止异常连接访问本机、内网或其他非公网资源。
- 改进模型、嵌入、语音、搜索和 WebDAV 请求的错误处理，减少连接信息出现在日志或错误提示中。
- 官方网页端仅允许安全的公网 API 地址；支持的 AI 服务仍优先由浏览器直连，自定义代理继续在桌面端和自部署环境使用。
- 文档解析新增 50 MB 单文件限制，降低超大文件造成页面或服务异常的风险。
- 加强桌面端窗口导航、权限和嵌入内容隔离，并升级基础组件以修复已知安全问题。

#### Android 端

- 同步版本号为 `1.2.52+1252`；本次没有 Android 功能改动。

---

### English

#### Desktop / Web

- Strengthened external API address validation to block abnormal connections to local, private-network, or other non-public resources.
- Improved error handling for model, embedding, speech, search, and WebDAV requests so connection details are less likely to appear in logs or error messages.
- The official web app now accepts only safe public API addresses. Supported AI services still prefer direct browser connections, while custom proxies remain available in desktop and self-hosted environments.
- Added a 50 MB per-file limit for document parsing to reduce failures caused by excessively large uploads.
- Hardened desktop window navigation, permissions, and embedded-content isolation, and upgraded core components to address known security issues.

#### Android

- Synchronized the version to `1.2.52+1252`; this release contains no Android feature changes.
