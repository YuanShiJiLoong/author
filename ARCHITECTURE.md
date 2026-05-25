# Author — 项目架构文档

> 版本：v1.2.33 | 最后更新：2025-05

---

## 一、项目概述

**Author** 是一款面向小说/剧本创作者的 AI 辅助写作工具。核心理念是 **"本地优先 + AI 增强"**：所有创作数据保存在用户本地（IndexedDB），可选开启 Firebase 云同步；AI 功能通过服务端代理对接多家大模型 Provider。

### 部署形态

| 形态 | 技术 | 说明 |
|------|------|------|
| **Web** | Next.js (Vercel / 自托管) | 纯浏览器访问 |
| **桌面端** | Electron + Next.js standalone | Windows 安装包 (.exe) |
| **Docker** | 多阶段构建 + Caddy 反代 | 私有部署 |
| **移动端** | Flutter (独立闭源仓库) | Android APK |

---

## 二、技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Next.js 16 (App Router) + React 19 |
| UI 样式 | Tailwind CSS 4 |
| 状态管理 | Zustand 5 |
| 富文本编辑器 | Tiptap 3 (ProseMirror) |
| 本地持久化 | IndexedDB (`idb-keyval`) / localStorage |
| 云同步 | Firebase (Firestore + Auth) |
| AI 通信 | 服务端 SSE 流式代理 (Node.js Runtime) |
| 桌面端 | Electron 35 + electron-builder + electron-updater |
| 包管理 | npm (lockfile v3) |
| 代码检查 | ESLint 9 (flat config) |
| CI/CD | GitHub Actions (docker-publish / electron-build) |
| 容器化 | Docker 多阶段构建 + Caddy 反代 |
| 向量检索 | 可选 RAG (Gemini / OpenAI Embedding API) |
| 数学排版 | KaTeX |

---

## 三、目录结构

```
author/
├── app/                        # Next.js App Router 主目录
│   ├── api/                    # 服务端 API 路由（Node.js Runtime）
│   │   ├── ai/                 # AI 代理层（多 Provider）
│   │   │   ├── route.js        #   OpenAI 兼容 (DeepSeek/智谱/Moonshot…)
│   │   │   ├── claude/         #   Anthropic Messages API
│   │   │   ├── gemini/         #   Gemini 原生 API
│   │   │   ├── responses/      #   OpenAI Responses API
│   │   │   ├── models/         #   模型列表查询
│   │   │   └── test/           #   连通性测试
│   │   ├── embed/              # 文本向量化
│   │   ├── tools/search/       # Function Calling 搜索 (Google/Bing/Tavily)
│   │   ├── parse-file/         # DOC/PDF 解析
│   │   ├── balance/            # API 余额查询
│   │   ├── storage/            # 服务端文件存储 (Electron 场景)
│   │   ├── app-version/        # 版本号查询
│   │   ├── check-update/       # 客户端更新检测
│   │   ├── android-download/   # Android APK 下载链接
│   │   ├── update-source/      # 源码热更新（Docker 场景）
│   │   └── update-source-stream/ # 源码热更新（流式）
│   │
│   ├── components/             # React 组件 (39 个)
│   │   ├── Editor.js           #   Tiptap 编辑器主体
│   │   ├── AiSidebar.js        #   AI 对话侧栏
│   │   ├── Sidebar.js          #   章节/目录侧边栏
│   │   ├── SettingsPanel.js    #   设定集面板
│   │   ├── SnapshotManager.js  #   快照版本管理
│   │   ├── BookInfoPanel.js    #   作品信息面板
│   │   ├── TourOverlay.js      #   新手引导
│   │   ├── WelcomeModal.js     #   欢迎弹窗
│   │   ├── CloudSyncIndicator.js # 云同步状态指示
│   │   ├── ModelPicker.js      #   模型选择器
│   │   ├── GhostMark.js        #   AI 流式预览标记
│   │   ├── SlashCommands.js    #   / 斜杠命令
│   │   ├── icons/              #   SVG 图标组件
│   │   └── ui/                 #   通用 UI 原子组件 (Tooltip, IconButton)
│   │
│   ├── lib/                    # 核心业务逻辑模块 (25 个)
│   │   ├── context-engine.js   #   上下文收集引擎 (RAG + 规则)
│   │   ├── storage.js          #   章节 CRUD (本地持久化)
│   │   ├── persistence.js      #   持久化适配器 (IndexedDB ↔ 文件系统)
│   │   ├── settings.js         #   设定集管理 (叙事引擎架构)
│   │   ├── settings-io.js      #   设定集多格式导入/导出
│   │   ├── firestore-sync.js   #   Firestore 双向同步层
│   │   ├── firebase.js         #   Firebase 初始化
│   │   ├── auth.js             #   Firebase Auth 封装
│   │   ├── sync-key-policy.js  #   云同步隐私策略
│   │   ├── snapshots.js        #   快照版本系统
│   │   ├── chat-sessions.js    #   AI 多会话管理
│   │   ├── generation-archive.js # AI 生成存档
│   │   ├── embeddings.js       #   向量化 + 余弦相似度
│   │   ├── token-stats.js      #   Token 用量统计
│   │   ├── keyRotator.js       #   多 API Key 轮询
│   │   ├── proxy-fetch.js      #   代理 fetch (undici ProxyAgent)
│   │   ├── content-safety.js   #   内容安全策略
│   │   ├── project-io.js       #   项目导出/导入
│   │   ├── chapter-number.js   #   章节编号归一化
│   │   ├── diagnostics.js      #   诊断日志系统
│   │   ├── heartbeat.js        #   用户活跃心跳 (DAU/MAU)
│   │   ├── useI18n.js          #   国际化 Hook (zh/en/ru)
│   │   ├── useAuthAction.js    #   认证操作 Hook
│   │   ├── promptInput.js      #   自定义输入弹窗
│   │   └── constants.js        #   全局常量
│   │
│   ├── store/                  # Zustand 全局状态
│   │   └── useAppStore.js      #   UI 状态 + 章节状态 + 主题/语言
│   │
│   ├── locales/                # 国际化翻译文件
│   │   ├── zh.json
│   │   ├── en.json
│   │   └── ru.json
│   │
│   ├── page.js                 # 应用入口页 (SPA)
│   ├── layout.js               # 根布局
│   └── globals.css             # 全局样式
│
├── electron/                   # Electron 桌面端
│   ├── main.js                 #   主进程 (窗口管理/IPC/日志脱敏)
│   └── preload.js              #   预加载脚本 (contextBridge API)
│
├── public/                     # 静态资源
│   ├── author-logo.png
│   ├── icon.ico / icon.png
│   ├── provider-icons/         #   AI Provider 图标
│   ├── avatars/                #   用户头像
│   └── katex/                  #   KaTeX 字体/CSS
│
├── build/                      # Electron 构建资源
│   └── installer.nsh           #   NSIS 安装脚本
│
├── scripts/                    # 运维脚本
│   └── release-safety-check.ps1 # 发版安全扫描
│
├── .agent/workflows/           # AI Agent 工作流定义
│   └── release.md              #   发版流程文档
│
├── .github/workflows/          # CI/CD
│   ├── docker-publish.yml      #   Docker 镜像构建 + 推送
│   └── electron-build.yml      #   Electron 安装包构建 + Release
│
├── next.config.mjs             # Next.js 配置 (standalone 输出)
├── package.json                # 依赖 & 构建脚本
├── Dockerfile                  # 多阶段 Docker 构建
├── Caddyfile                   # Caddy 反代配置
├── docker-compose.yml          # Docker Compose 编排
├── firebase.json               # Firebase 项目配置
├── firestore.rules             # Firestore 安全规则
└── firestore.indexes.json      # Firestore 索引定义
```

---

## 四、核心架构分层

```
┌────────────────────────────────────────────────────────────┐
│                      用户界面层 (UI)                         │
│  React 19 + Tiptap 3 + Tailwind CSS                        │
│  组件：Editor / AiSidebar / Sidebar / SettingsPanel / …     │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│                      状态管理层                              │
│  Zustand (useAppStore) — UI 状态 / 章节 / 主题 / 语言       │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│                    业务逻辑层 (lib/)                         │
│  context-engine / settings / storage / snapshots /          │
│  chat-sessions / token-stats / embeddings / …              │
└────────┬──────────────────┬───────────────────┬────────────┘
         │                  │                   │
    ┌────▼────┐     ┌──────▼──────┐    ┌──────▼───────┐
    │ 持久化层 │     │  云同步层    │    │  AI 代理层    │
    │IndexedDB│     │ Firestore   │    │ /api/ai/*    │
    │  /文件   │     │ Auth+Sync   │    │ SSE 流式转发  │
    └─────────┘     └─────────────┘    └──────┬───────┘
                                              │
                              ┌────────────────▼────────────────┐
                              │       外部 AI Provider           │
                              │  OpenAI / Claude / Gemini /      │
                              │  DeepSeek / 智谱 / Moonshot / …  │
                              └─────────────────────────────────┘
```

---

## 五、核心模块详解

### 5.1 AI 代理层 (`app/api/ai/`)

采用 **服务端 SSE 流式转发** 架构，浏览器 → Next.js API Route → AI Provider，解决了：
- 跨域限制
- API Key 安全（不暴露给前端）
- 多 Key 轮询负载均衡 (`keyRotator.js`)
- 网络代理支持 (`proxy-fetch.js` + undici ProxyAgent)
- 内容安全过滤 (`content-safety.js`)

| 路由 | 对接协议 |
|------|---------|
| `/api/ai` | OpenAI Chat Completions (兼容 DeepSeek/智谱/Moonshot) |
| `/api/ai/claude` | Anthropic Messages API |
| `/api/ai/gemini` | Gemini streamGenerateContent |
| `/api/ai/responses` | OpenAI Responses API |
| `/api/ai/models` | 模型列表查询 |
| `/api/ai/test` | 连通性测试 |

支持 **Function Calling 搜索循环**：AI 请求搜索 → `/api/tools/search` 执行 → 结果回传 AI 继续生成。

### 5.2 上下文引擎 (`lib/context-engine.js`)

每次 AI 调用前自动汇聚创作上下文（类似 Cursor 的 codebase context）：
1. **作品设定** — 人物、世界观、大纲、规则（来自 `settings.js`）
2. **前文脉络** — 当前章节 + 相邻章节内容
3. **RAG 向量检索** — 对设定条目做 Embedding 相似度推荐（可选）
4. **Token 预算控制** — 使用 `tokenx` 估算 token 数，裁剪超限内容

### 5.3 持久化层 (`lib/persistence.js` + `lib/storage.js`)

```
persistence.js  →  统一接口 (persistGet / persistSet / persistDel)
                     ├── Electron: 服务端文件系统 (/api/storage)
                     └── Web: IndexedDB (idb-keyval) + localStorage fallback

storage.js      →  章节 CRUD（按 workId 隔离）
settings.js     →  设定集 CRUD（树状结构，叙事引擎三模式）
```

### 5.4 云同步 (`lib/firestore-sync.js`)

- **本地优先**：数据始终先写本地 IndexedDB，再异步推送云端
- **增量同步**：变化检测 → 5 分钟无变化停止定时器 → 下次变化重启
- **隐私策略** (`sync-key-policy.js`)：API Key 等敏感数据默认不同步
- **数据隔离**：Firestore 路径 `users/{uid}/data/{key}`，安全规则强制 uid 匹配

### 5.5 编辑器扩展 (Tiptap)

| 扩展 | 文件 | 功能 |
|------|------|------|
| Ghost Mark | `GhostMark.js` | AI 流式预览（打字机效果） |
| AI Diff Delete | `AiDiffDeleteMark.js` | AI 修改对比删除标记 |
| Remark Mark | `RemarkMark.js` | 批注/备注高亮 |
| Page Break | `PageBreakExtension.js` | 分页符 |
| Math | `MathExtension.js` | LaTeX 数学公式 (KaTeX) |
| Search Highlight | `SearchHighlightExtension.js` | 搜索高亮 |
| Slash Commands | `SlashCommands.js` | / 斜杠快捷命令 |
| Bubble Menu | `EditorBubbleMenu.js` | 选中文本浮动工具栏 |

### 5.6 Electron 桌面端 (`electron/`)

- **main.js**：窗口管理、IPC Handler、自动更新 (electron-updater)、日志脱敏（正则过滤 Bearer/API Key/IP）、.env 加载
- **preload.js**：`contextBridge` 安全暴露 API（更新检测/下载/退出确认/诊断日志）
- **构建产物**：`next build` → standalone → electron-builder 打包为 NSIS 安装包

### 5.7 快照系统 (`lib/snapshots.js`)

本地版本管理 —— 创建快照时保存完整的 章节 + 设定集 + 会话 到 IndexedDB，支持一键回滚。

---

## 六、数据流

### 6.1 写作 → AI 辅助

```
用户编辑 (Tiptap)
    │
    ▼
光标上下文 + 用户指令
    │
    ▼
context-engine 汇聚
(设定 + 前文 + RAG推荐 + Token 裁剪)
    │
    ▼
前端发起 fetch → /api/ai/* (SSE)
    │
    ▼
服务端: keyRotator 选 key → proxy-fetch → Provider
    │
    ▼
SSE 流式响应 → 前端 ReadableStream → GhostMark 打字机渲染
```

### 6.2 本地 → 云同步

```
用户操作 (章节/设定/会话)
    │
    ▼
persistSet() → IndexedDB (立即生效)
    │
    ▼
firestore-sync 检测变化
    │ (防抖 + 增量)
    ▼
Firestore users/{uid}/data/{key}
    │
    ▼
其他设备 onSnapshot 监听 → 合并到本地
```

---

## 七、构建与部署

### 7.1 开发

```bash
npm run dev           # Next.js 开发服务器 (http://localhost:3000)
npm run electron:dev  # Electron + Next.js 联合开发
```

### 7.2 生产构建

```bash
npm run build              # Next.js standalone 构建
npm run electron:build     # Electron 打包 → dist/author-setup-X.Y.Z.exe
```

### 7.3 Docker

```bash
docker build -t author .
docker compose up -d                          # 默认 :3000
docker compose -f docker-compose.caddy.yml up # Caddy 反代 + HTTPS
```

### 7.4 CI/CD (GitHub Actions)

- **`v*` tag 推送** → `electron-build.yml` → 构建 .exe → 创建 GitHub Release
- **`v*` tag 推送** → `docker-publish.yml` → 构建镜像 → 推送 Docker Hub
- **手动触发** → 移动端仓库 CI → 构建 APK → 上传到同一 Release

---

## 八、国际化 (i18n)

- 翻译文件：`app/locales/{zh,en,ru}.json`
- Hook：`useI18n.js` — 自动检测浏览器语言，支持手动切换
- 持久化：语言偏好存 localStorage + 可选同步到云端

---

## 九、安全设计

| 维度 | 措施 |
|------|------|
| API Key | 仅存服务端 `.env`，前端通过代理路由调用 |
| Key 轮询 | `keyRotator.js` 多 Key 轮询 + 失败跳过 |
| 日志脱敏 | Electron 主进程正则过滤 Bearer/sk-/AIza/IP |
| 云端隔离 | Firestore 规则强制 uid 匹配 |
| 同步隐私 | API 配置默认不同步 (`sync-key-policy.js`) |
| 内容安全 | `content-safety.js` 创作伦理前置规则 |
| Docker | 多阶段构建，最终镜像仅含 standalone 产物 |
| 移动端隔离 | Flutter 代码在独立闭源仓库，`.gitignore` 屏蔽 `/mobile` |

---

## 十、设定集 & 叙事引擎

支持三种创作模式（`WRITING_MODES`）：

| 模式 | 典型场景 | 预设分类 |
|------|---------|---------|
| `webnovel` | 网络小说 | 人物/世界观/大纲/规则/… |
| `literature` | 传统文学 | 人物/场景/意象/结构/… |
| `screenplay` | 剧本/脚本 | 角色/场景/情节/对白/… |

设定以 **树状结构** 存储，每个节点可包含富文本描述，在 AI 调用时自动注入 System Prompt。

---

## 十一、版本号规则

- **桌面端**：读取 `package.json` → `version` 字段
- **移动端**：读取 `mobile/pubspec.yaml` → `X.Y.Z+VCODE`
- **versionCode 公式**：`major × 1000 + minor × 100 + patch`
- **Git Tag**：`vX.Y.Z`，三端保持一致

---

## 十二、关键依赖说明

| 包 | 用途 |
|----|------|
| `next` 16 | App Router + standalone 输出 + Server Actions |
| `react` 19 | 并发特性 (Suspense / use) |
| `@tiptap/*` 3 | 块级编辑器引擎 |
| `zustand` 5 | 轻量状态管理 |
| `firebase` 12 | Auth + Firestore |
| `idb-keyval` | IndexedDB 简易封装 |
| `tokenx` | 客户端 Token 估算 |
| `undici` 7 | Node.js HTTP 客户端 (代理支持) |
| `electron` 35 | 桌面端 |
| `electron-builder` | 安装包打包 |
| `electron-updater` | 自动更新 |
| `docx` / `mammoth` / `pdf-parse` / `word-extractor` | 文档解析 |
| `katex` | 数学公式渲染 |
| `jszip` | 项目导出打包 |
| `lucide-react` | 图标库 |

---

*文档由项目源码自动分析生成，如有不准确请以代码为准。*
