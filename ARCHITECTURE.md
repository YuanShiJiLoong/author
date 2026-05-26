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

## 五、后台架构 / Firebase 角色

> **关键认知：本项目没有传统意义上的"后端服务器"，是 BaaS（Backend-as-a-Service）架构。**

### 5.1 整体形态

```
┌────────────────────────────────────────────────────────────┐
│            客户端（浏览器 / Electron / Android）             │
│      IndexedDB（本地数据 = 唯一可信副本，离线可用）          │
└──────────┬─────────────────────────────┬───────────────────┘
           │                             │
           │ 写作时调 AI                   │ 登录后双向同步
           ▼                             ▼
┌──────────────────────────┐  ┌──────────────────────────────┐
│   Next.js API Routes     │  │          Firebase            │
│   （无状态代理层）         │  │      （真正的"后台"）          │
│   ──────────────────     │  │      ────────────────         │
│   /api/ai/*    AI 转发    │  │   • Auth         登录系统     │
│   /api/embed   向量化      │  │   • Firestore    云端数据库   │
│   /api/tools/search 搜索  │  │   • Analytics    埋点统计     │
│   /api/parse-file 解析    │  │                              │
│   ❗不存任何用户数据        │  │   托管在 Google 云            │
└──────────┬───────────────┘  └──────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│  外部 AI Provider                              │
│  OpenAI / Claude / Gemini / DeepSeek / …      │
└──────────────────────────────────────────────┘
```

### 5.2 Next.js API Routes 不是后端，是"代理层"

这层完全无状态，**不存任何用户数据**，只做 4 件事：

| 路由 | 职责 |
|------|------|
| `/api/ai/*` | 转发到 OpenAI/Claude/Gemini，主要是为了藏 API Key + SSE 流式转发 |
| `/api/embed` | 转发向量化请求 |
| `/api/tools/search` | 转发 Google/Bing/Tavily 搜索 |
| `/api/parse-file` | 解析 PDF/DOCX 成纯文本（一次性，不持久化） |

请求一来一回就结束了，没有数据库连接、没有用户态、没有 Session。

### 5.3 Firebase 是真正的"后台"

Firebase 在项目里扮演 4 个角色：

#### ① Auth — 用户登录系统（`lib/auth.js`）
- 邮箱密码注册 / 登录
- Google OAuth 一键登录
- 账号会话管理（`onAuthStateChanged`）
- 本地缓存最近 5 个登录过的账号，方便快速切换

#### ② Firestore — 云端数据库（`lib/firestore-sync.js`，**最核心用途**）

承担"用户数据的云端备份 + 多端同步通道"。数据结构：

```
users/{userId}/data/{key}                ← 每个 key 一个 document
                                            例：chapters / settings / sessions

users/{userId}/data/{key}/chunks/{00001} ← 大文档自动分片
                                            单 doc > 850KB 时拆为多个 700KB 块
```

工作机制：

| 机制 | 说明 |
|------|------|
| **本地优先** | 所有写入先落 IndexedDB，立即生效 |
| **5 分钟节流** | 本地变化后启动定时器，5 分钟内合并多次写入再推云端 |
| **空闲停机** | 5 分钟无变化就停掉同步器，省流量 |
| **隐私策略** | `sync-key-policy.js` — API Key 等敏感配置默认不上云 |
| **安全规则** | `firestore.rules` 硬性约束 `request.auth.uid == userId` |
| **大文档分片** | 单 doc 超 850KB 自动拆块（Firestore 单文档 1MB 上限） |

#### ③ Analytics — 埋点统计（`lib/firebase.js` + `components/FirebaseAnalytics.js`）
- 页面访问统计
- 区分 `web` / `desktop_client` 来源
- 自定义事件埋点
- 未配置 `measurementId` 时自动禁用，完全可选

#### ④ DAU/MAU 心跳（`lib/heartbeat.js`）
- 登录用户每天向 `users/{uid}/data/heartbeat` 写一次时间戳
- 同一天 localStorage 防重复
- 用于统计日活/月活用户数

### 5.4 为什么这么设计

| 选择 | 原因 |
|------|------|
| 不自建后端 | 个人项目，省服务器成本和运维 |
| Firebase 做数据层 | 免费额度够用，自带多端同步、权限控制、Auth |
| Next.js API 只做代理 | 唯一刚需是藏 API Key + SSE 流式转发 |
| 本地优先 | 离线可用、响应快、用户随时能拉走自己的数据 |
| Firestore 规则强隔离 | 用户数据天然隔离，不需要服务端鉴权代码 |

### 5.5 演进预留

`firebase.js` 中有几个注释掉的导入，是未来可能引入的 Firebase 全家桶能力：

```js
// import { getVertexAI } from 'firebase/vertexai';   // 阶段4：Firebase 内置 AI
// import { getAnalytics } from 'firebase/analytics';  // 阶段4：完整分析
// import { getMessaging } from 'firebase/messaging';  // 阶段3：移动端 FCM 推送
```

说明项目可能进一步把后台能力收敛到 Firebase（用 Vertex AI 替代部分外部 Provider 调用、用 FCM 做移动端推送）。

---

## 六、前端架构详解

### 6.1 渲染模式：客户端 SPA on Next.js

虽然项目用了 Next.js 16 App Router，但**整个应用本质上是一个 SPA（单页应用）**：

| 路由 | 类型 | 说明 |
|------|------|------|
| `/` (`app/page.js`) | Client Component | 唯一的应用入口，标记 `'use client'` |
| `/api/*` | Server Route Handler | 仅作为 AI/工具代理，无 SSR 页面 |

**为什么不用 SSR？**
- 编辑器内容、设定集都存在 IndexedDB / localStorage，服务端拿不到用户数据
- Tiptap 依赖 `window` / `document`，不能在服务端渲染
- AI 流式响应需要持久的客户端连接

**怎么处理 SSR 限制：**

```js
// app/page.js — 所有重组件都用 dynamic import + ssr: false
const Editor = dynamic(() => import('./components/Editor'), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: 'var(--bg-canvas)' }} />,
});
const Sidebar = dynamic(() => import('./components/Sidebar'), { ssr: false });
const AiSidebar = dynamic(() => import('./components/AiSidebar'), { ssr: false });
// ... 共 18 个动态加载组件
```

**收益：**
- 首屏 HTML 极小，TTI 快
- Tiptap / KaTeX / firebase 等大依赖按需分包
- 弹窗类组件（Login / Account / Welcome / Tour）只在打开时才加载

### 6.2 Next.js 配置要点（`next.config.mjs`）

```js
{
  output: 'standalone',           // Electron / Docker 都用这个产物
  devIndicators: false,           // 关闭右下角 Next.js 指示器
  serverExternalPackages: [       // pdf-parse / word-extractor 不打进 bundle
    'pdf-parse', 'word-extractor'
  ],
  outputFileTracingExcludes: {    // standalone 产物排除移动端/文档/草稿
    '*': ['mobile/**/*', 'docs/**/*', '.agent/**/*', ...]
  },
  experimental: {
    serverActions: { bodySizeLimit: '50mb' }  // 大 PDF 上传不返回 413
  },
  env: { NEXT_PUBLIC_APP_VERSION: version }   // 注入版本号
}
```

### 6.3 React 19 特性使用

- **并发渲染**：`useTransition` 用于切章节/搜索时保持 UI 响应
- **`use` hook**：暂未广泛使用（保留迁移空间）
- **Server Components**：仅 API Route 用，UI 全部 Client Component
- **自动批处理**：Zustand 多次 set 在同一事件中会自动合并

### 6.4 状态管理：Zustand 单 Store（`store/useAppStore.js`）

**架构选择理由：**
- 比 Redux 轻：无 reducer / dispatch / provider 嵌套
- 比 Context 强：组件订阅特定字段时不会因无关字段变化而重渲染
- 与 SSR 兼容：`typeof window !== 'undefined'` 守卫读取 localStorage

**Store 划分（按职责分组，共一个 store）：**

| 状态组 | 字段示例 | 持久化策略 |
|--------|----------|-----------|
| **章节状态** | `chapters` / `activeChapterId` / `activeWorkId` | IndexedDB |
| **侧栏 UI** | `sidebarOpen` / `aiSidebarOpen` / `sidebarPushMode` | localStorage |
| **弹窗状态** | `showSettings` / `showLoginModal` / `showAccountModal` / `showSnapshots` | 内存 |
| **主题/语言** | `theme` / `visualTheme` / `language` | localStorage + Firestore |
| **写作模式** | `writingMode` (webnovel/literature/screenplay) | IndexedDB |
| **快捷键偏好** | `chatSendShortcutMode` (enter / ctrlEnter) | localStorage |

**关键模式：**

```js
// 1. 持久化字段在 setter 中同步写存储
setLanguage: (lang) => set(() => {
  localStorage.setItem('author-lang', lang);
  persistSet('author-lang', lang).catch(() => {});  // 异步同步云端
  return { language: lang };
}),

// 2. _hydrateSidebarModes() 在客户端挂载后从 localStorage 回填
//    解决 SSR 时 window undefined 的问题
```

### 6.5 编辑器架构：Tiptap 3（ProseMirror）

**为什么选 Tiptap：**
- 基于 ProseMirror —— 文档结构化、协同编辑友好、扩展模型清晰
- React 集成成熟（`@tiptap/react`）
- 扩展系统适合做 AI 流式预览、批注、分页等定制需求

**扩展层次（`Editor.js` 中按需注册）：**

```
StarterKit (段落/标题/列表/加粗/斜体/…)
    │
    ├── 排版扩展
    │   ├── Underline / Subscript / Superscript
    │   ├── TextAlign / FontFamily / Color / Highlight
    │   ├── TaskList / TaskItem
    │   └── CharacterCount (实时字数统计)
    │
    ├── 自定义扩展（项目独有）
    │   ├── GhostMark         AI 流式生成的 "幽灵文字" 预览
    │   ├── AiDiffDeleteMark  AI 修改对比时的删除标记
    │   ├── RemarkMark        批注/备注高亮
    │   ├── PageBreakExtension 分页符（导出 DOCX 用）
    │   ├── MathExtension     LaTeX 公式 (KaTeX 渲染)
    │   ├── SearchHighlight   全文搜索结果高亮
    │   └── SlashCommands     输入 / 触发命令菜单
    │
    └── 交互扩展
        ├── BubbleMenu        选中文本的浮动工具条
        ├── Placeholder       空段落占位提示
        └── tiptap-markdown   Markdown 双向转换
```

**关键交互：**
- **AI 流式插入**：`GhostMark` 接收 SSE chunk，逐字渲染为半透明文字，用户接受/拒绝时再固化
- **斜杠命令**：`@tiptap/suggestion` 监听 `/` 输入，弹出命令菜单（生成/续写/重写/翻译…）
- **气泡菜单**：选中文本后浮现 AI 操作按钮（润色/扩写/缩写/对话）

### 6.6 组件组织：39 个 Component 按用途分组

```
components/
│
├── 编辑核心（5）
│   ├── Editor.js                 主编辑器 + Tiptap 实例
│   ├── EditorBubbleMenu.js       浮动工具栏
│   ├── MiniMarkdownEditor.js     轻量 Markdown 编辑器（用于设定项）
│   ├── ChatMarkdown.js           AI 对话消息渲染
│   └── icons/                    SVG 图标组件库
│
├── Tiptap 扩展（7）
│   ├── GhostMark.js / AiDiffDeleteMark.js / RemarkMark.js
│   ├── MathExtension.js / PageBreakExtension.js
│   └── SearchHighlightExtension.js / SlashCommands.js
│
├── 侧栏 / 面板（6）
│   ├── Sidebar.js                章节/卷/作品树
│   ├── AiSidebar.js              AI 对话侧栏
│   ├── SettingsPanel.js          设定集面板
│   ├── SettingsTree.js           设定树
│   ├── SettingsCategoryPanel.js / SettingsCategoryPopover.js
│   └── BookInfoPanel.js          作品信息面板
│
├── 弹窗 / 模态（10）
│   ├── LoginModal / RegisterModal / AccountModal
│   ├── WelcomeModal / SyncGuideModal
│   ├── ExitSyncModal / SyncConfirmModal / SettingsConflictModal
│   ├── CategorySettingsModal / SettingsItemEditor
│   └── SnapshotManager
│
├── 引导 / 帮助（3）
│   ├── HelpPanel.js
│   ├── TourOverlay.js            新手引导高亮
│   └── WelcomeModal.js
│
├── 工具 / 状态指示（5）
│   ├── ModelPicker.js            AI 模型选择器
│   ├── CloudSyncIndicator.js     云同步状态
│   ├── UpdateBanner.js           更新提示
│   ├── AndroidDownloadMenu.js    APK 下载入口
│   └── RadarStatsChart.js        统计雷达图
│
├── 第三方（1）
│   └── FirebaseAnalytics.js      埋点
│
└── 通用原子（ui/）
    ├── Tooltip.js
    └── IconButton.js
```

### 6.7 样式系统：Tailwind CSS 4 + CSS 变量主题

**为什么不用 styled-components / CSS-in-JS：**
- Tailwind 4 零运行时，性能好
- CSS 变量切主题成本最低（无需重新渲染）

**主题方案：**

```css
/* globals.css —— 三套视觉主题通过 [data-visual] 切换 */
[data-visual='light']   { --bg-canvas: #ffffff; --text-primary: #1a1a1a; ... }
[data-visual='dark']    { --bg-canvas: #1e1e1e; --text-primary: #e5e5e5; ... }
[data-visual='paper']   { --bg-canvas: #f5f0e6; --text-primary: #2a2418; ... }

/* 组件中 */
.editor { background: var(--bg-canvas); color: var(--text-primary); }
```

**响应式：**
- Tailwind 默认断点（`sm md lg xl 2xl`）
- 桌面端为主，移动端有独立 Flutter 仓库，所以 Web 不做深度移动适配

### 6.8 国际化：自研轻量方案（`lib/useI18n.js`）

**没用 `next-intl` / `react-i18next` 的原因：**
- 应用是纯 SPA，无需 SSR i18n
- 翻译键不多（zh/en/ru 三套），自研够用、零依赖

**机制：**

```js
// 1. 翻译文件：app/locales/{zh,en,ru}.json （扁平 key-value）
// 2. Hook：const { t, lang, setLang } = useI18n();
// 3. 使用：<button>{t('settings.save')}</button>
// 4. 自动检测：首次访问读 navigator.language，之后读 localStorage
// 5. 同步云端：登录后 language 字段会同步到 Firestore
```

### 6.9 性能优化策略

| 策略 | 实现 |
|------|------|
| **代码分割** | 18 个组件 `dynamic({ ssr: false })` 按需加载 |
| **依赖外部化** | `pdf-parse` / `word-extractor` 不打进 bundle |
| **懒加载弹窗** | Login/Account/Welcome/Tour 仅在 `show=true` 时挂载 |
| **Zustand 选择器** | 组件只订阅需要的字段，避免无关重渲染 |
| **Tiptap 增量更新** | ProseMirror 只 diff 变化的节点 |
| **本地存储节流** | 编辑器内容防抖 1s 后才写 IndexedDB |
| **云同步节流** | 5 分钟合并多次写入再推 Firestore |
| **Token 估算前置** | `tokenx` 在客户端先估，超限直接拒绝调 AI 省费用 |

### 6.10 入口文件流程（`app/page.js`）

```
组件挂载
  │
  ├── 1. _hydrateSidebarModes() — 从 localStorage 回填 UI 偏好
  │
  ├── 2. initPersistence() — 探测 Electron 文件系统 / IndexedDB
  │
  ├── 3. migrateGlobalChapters() — 旧版数据迁移到 workId 隔离结构
  │
  ├── 4. getChapters() → setChapters() — 加载当前作品章节
  │
  ├── 5. chooseActiveChapterForWork() — 恢复上次编辑位置
  │
  ├── 6. loadSessionStore() — 加载 AI 会话历史
  │
  ├── 7. initDiagnostics() — 启动诊断日志（Electron 写文件 / Web 写 IndexedDB）
  │
  └── 8. firestore-sync 启动（如果已登录）
```

---

## 七、核心模块详解

### 7.1 AI 代理层 (`app/api/ai/`)

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

### 7.2 上下文引擎 (`lib/context-engine.js`)

每次 AI 调用前自动汇聚创作上下文（类似 Cursor 的 codebase context）：
1. **作品设定** — 人物、世界观、大纲、规则（来自 `settings.js`）
2. **前文脉络** — 当前章节 + 相邻章节内容
3. **RAG 向量检索** — 对设定条目做 Embedding 相似度推荐（可选）
4. **Token 预算控制** — 使用 `tokenx` 估算 token 数，裁剪超限内容

### 7.3 持久化层 (`lib/persistence.js` + `lib/storage.js`)

```
persistence.js  →  统一接口 (persistGet / persistSet / persistDel)
                     ├── Electron: 服务端文件系统 (/api/storage)
                     └── Web: IndexedDB (idb-keyval) + localStorage fallback

storage.js      →  章节 CRUD（按 workId 隔离）
settings.js     →  设定集 CRUD（树状结构，叙事引擎三模式）
```

### 7.4 云同步 (`lib/firestore-sync.js`)

- **本地优先**：数据始终先写本地 IndexedDB，再异步推送云端
- **增量同步**：变化检测 → 5 分钟无变化停止定时器 → 下次变化重启
- **隐私策略** (`sync-key-policy.js`)：API Key 等敏感数据默认不同步
- **数据隔离**：Firestore 路径 `users/{uid}/data/{key}`，安全规则强制 uid 匹配

### 7.5 编辑器扩展 (Tiptap)

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

### 7.6 Electron 桌面端 (`electron/`)

- **main.js**：窗口管理、IPC Handler、自动更新 (electron-updater)、日志脱敏（正则过滤 Bearer/API Key/IP）、.env 加载
- **preload.js**：`contextBridge` 安全暴露 API（更新检测/下载/退出确认/诊断日志）
- **构建产物**：`next build` → standalone → electron-builder 打包为 NSIS 安装包

### 7.7 快照系统 (`lib/snapshots.js`)

本地版本管理 —— 创建快照时保存完整的 章节 + 设定集 + 会话 到 IndexedDB，支持一键回滚。

---

## 八、数据流

### 8.1 写作 → AI 辅助

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

### 8.2 本地 → 云同步

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

## 九、构建与部署

### 9.1 开发

```bash
npm run dev           # Next.js 开发服务器 (http://localhost:3000)
npm run electron:dev  # Electron + Next.js 联合开发
```

### 9.2 生产构建

```bash
npm run build              # Next.js standalone 构建
npm run electron:build     # Electron 打包 → dist/author-setup-X.Y.Z.exe
```

### 9.3 Docker

```bash
docker build -t author .
docker compose up -d                          # 默认 :3000
docker compose -f docker-compose.caddy.yml up # Caddy 反代 + HTTPS
```

### 9.4 CI/CD (GitHub Actions)

- **`v*` tag 推送** → `electron-build.yml` → 构建 .exe → 创建 GitHub Release
- **`v*` tag 推送** → `docker-publish.yml` → 构建镜像 → 推送 Docker Hub
- **手动触发** → 移动端仓库 CI → 构建 APK → 上传到同一 Release

---

## 十、国际化 (i18n)

- 翻译文件：`app/locales/{zh,en,ru}.json`
- Hook：`useI18n.js` — 自动检测浏览器语言，支持手动切换
- 持久化：语言偏好存 localStorage + 可选同步到云端

---

## 十一、安全设计

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

## 十二、设定集 & 叙事引擎

支持三种创作模式（`WRITING_MODES`）：

| 模式 | 典型场景 | 预设分类 |
|------|---------|---------|
| `webnovel` | 网络小说 | 人物/世界观/大纲/规则/… |
| `literature` | 传统文学 | 人物/场景/意象/结构/… |
| `screenplay` | 剧本/脚本 | 角色/场景/情节/对白/… |

设定以 **树状结构** 存储，每个节点可包含富文本描述，在 AI 调用时自动注入 System Prompt。

---

## 十三、版本号规则

- **桌面端**：读取 `package.json` → `version` 字段
- **移动端**：读取 `mobile/pubspec.yaml` → `X.Y.Z+VCODE`
- **versionCode 公式**：`major × 1000 + minor × 100 + patch`
- **Git Tag**：`vX.Y.Z`，三端保持一致

---

## 十四、关键依赖说明

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
