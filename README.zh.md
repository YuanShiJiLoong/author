[English](README.md) | **简体中文** | [Русский](README.ru.md) | [الفلسطينية (العربية)](README.ar.md)

# ✍️ Author — AI-Powered Creative Writing Platform

> AI 驱动的网文创作平台 | AI-Powered Web Novel Writing Studio

**Author** 是一款面向小说作者的 AI 辅助创作工具。它将专业的富文本编辑器、智能 AI 写作助手和完整的世界观管理系统整合在一起，为创作者提供一站式写作体验。

🌐 **在线体验**：[author-delta.vercel.app](https://author-delta.vercel.app)

📦 **Gitee 镜像（国内加速）**：[gitee.com/yuanshijilong/author](https://gitee.com/yuanshijilong/author)

---

## 💬 为什么做这个项目

我使用 AI 已经有一段日子了，各家公司的模型基本上都用过——从最开始的 ChatGPT 3.5，到 Gemini 2.0 Exp Thinking，接着从 ChatGPT o1 时代之后，彻底转入 Gemini 2.5 Pro Thinking。

我本人是写小说的，对 AI 的文字能力比较看重。小说的文本很长，因此我对模型的上下文以及召回率有很高的要求。当然，Gemini 最触动我的点还是祂笔下的人物——总会有那么一瞬间，让我有种想要落泪的冲动。这是情感共鸣。我需要这种接受了人类本身复杂性的文字。

然而，随着代码趋势的兴起，所有公司都开始往这个方向死磕。我本来觉得是好事，但当 Gemini 3.1 Pro 第一次将笔下的人物描述成生物学和心理学的术语时，我发现我错了——代码方向的模型将人类本身解构成一堆生物学零件。特别是 Claude Opus 4.6，这个模型笔下的所有人物都在某种心理学定义的性格里达成了极致的效率：说话言简意赅、惜字如金，不像人类，像个人机。

**我看不到模型对人类本身复杂性的理解。模型不在乎人类做了什么，只在乎人类是什么。模型不从人的行为去体现人的性格和情感，反而直接对人类本身下一个很简单的定义。**

我看到模型的通用性在被阉割。我不希望我们活在冰冷的代码世界。建立这个项目，是为了让 AI 能够在那些机械算符之外，**保留我们人类自己的语言**。

> 希望所有使用该项目的作者、编剧、爱好者，甚至读者、玩家，能够发挥自己的长处，创建出有人味儿的作品，保住我们自己语言的火种。🔥

---

## ✨ 核心功能

### 📝 专业编辑器
- 基于 **Tiptap** 的富文本编辑器，支持加粗、斜体、标题、列表、代码块等
- **Word 风格分页**排版，所见即所得
- **正文备注 / 批注** — 选中句子即可添加纸页侧注，DOCX 批注版会导出为 Word 原生批注
- **KaTeX** 数学公式支持
- 字体、字号、行距、颜色自定义
- 实时字数/字符/段落统计

### 🤖 AI 写作助手
- **多 AI 供应商**：智谱 GLM-4 / DeepSeek / OpenAI / Google Gemini / Claude / SiliconFlow / 火山引擎 / 阿里云百炼 / MiniMax / Moonshot + 自定义端点
- **智能模型拉取** — 一键从 API 拉取完整模型列表；供应商不再返回的已保存模型仍可管理和清理
- **续写 / 改写 / 润色 / 扩写**，一键生成
- **沉浸式写作引擎（Ghost Text）** 流式预览 — 像 Cursor 一样实时显示 AI 生成内容，支持接受/拒绝
- **自由对话模式** — 与 AI 讨论剧情、角色、设定
- **AI 对话发送快捷键** — 可选择 Enter 发送，或 Ctrl/⌘ + Enter 发送，同时作用于小输入框和全屏输入面板
- **AI 全局记忆（Context Engine）** — AI 自动感知你的角色设定、世界观、前文，保持剧情连贯
- **API 格式切换** — 阿里云百炼和 MiniMax 同时支持 OpenAI 和 Anthropic 两种 API 格式

### 📚 设定集管理
- **树形结构**管理角色、地点、物品、大纲、写作规则
- 三种写作模式：**网文** / **传统文学** / **剧本**，每种模式有专属字段
- 分类配色 + glassmorphism 视觉风格
- 设定内容自动注入 AI 上下文

### 💾 数据管理
- **本地优先** — 所有数据存储在浏览器 IndexedDB，不上传服务器
- **快照系统** — 手动/自动版本存档，支持一键回滚
- **项目导入导出** — 完整项目 JSON 备份
- **多格式导出** — 导航栏一键导出本章或批量导出（TXT / Markdown / DOCX / EPUB / PDF），可选择正文版或批注版

### 🌐 国际化
- 🇨🇳 简体中文 / 🇺🇸 English / 🇷🇺 Русский

### 🎨 界面体验
- 护眼暖色调 / 深色模式切换
- 新手引导教程
- 帮助面板 + 快捷键说明

---

## 💻 桌面客户端

**无需安装 Node.js！** 直接下载安装包：

- 📥 [下载 Author 安装包（Windows）](https://github.com/YuanShiJiLoong/author/releases/latest)
- 💬 无法访问 GitHub？[加入 QQ 交流群：1087016949](https://qm.qq.com/q/wjRDkotw0E)，群文件中下载

安装即用，所有功能开箱即得。

> 💡 从源码构建桌面应用：`npm run build && npx electron-builder --win`

### 🐛 常见问题排查 / Debug 日志

如果遇到白屏、卡死、崩溃或程序无法正常启动：
- 应用内打开 **帮助 → 关于 → 导出诊断日志**，会下载 `author-diagnostic-*.json`
- 桌面客户端可在 **帮助 → 关于 → 打开日志目录** 直接查看本地日志位置
- **桌面主日志**：`%APPDATA%\author-app\author-debug.log`（完整路径示例：`C:\Users\<您的用户名>\AppData\Roaming\author-app\author-debug.log`）
- **桌面崩溃报告**：`%APPDATA%\author-app\crash-reports\author-crash-*.json`
- 浏览器 / 源码 / Vercel 部署没有桌面日志目录，请使用应用内「导出诊断日志」
- 诊断文件会自动脱敏 API Key、Token、Authorization、Secret、公网 IP 等敏感信息

---

## 🚀 快速开始

> 💡 **强烈建议**：对于只需满足日常写作和云端多设备同步需求的大多数用户，请[直接下载安装客户端](https://github.com/YuanShiJiLoong/author/releases/latest)使用。源码部署或 Vercel 部署仅建议需要进行**二次开发**，或愿意自行配置 Firebase 数据库的高级用户使用。

### 环境要求
- **Node.js** 18+
- **npm** 9+ 或 **pnpm** 8+

### 安装

```bash
# 克隆仓库
git clone https://github.com/YuanShiJiLoong/author.git
# 国内用户推荐使用 Gitee 镜像（更快）
# git clone https://gitee.com/yuanshijilong/author.git
cd author

# 安装依赖
npm install
# 或使用 pnpm（无幽灵依赖问题）
# pnpm install
# pnpm approve-builds    # pnpm 需要手动激活原生构建包

# 配置环境变量（可选）
cp .env.example .env.local
# 编辑 .env.local 填入你的 API Key
# 也可以在应用内「设置」面板中配置
```

### 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

### 生产构建

```bash
npm run build
npm start
```

### 部署到 Vercel

> 💡 **⚠️ 注意：** 通过 Vercel 部署的版本默认**没有**云同步等功能（需要单独配置你自己的 Firebase 数据库）。如果你只想要多设备同步，请**直接下载客户端**，无需折腾。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YuanShiJiLoong/author)

### ☁️ 云同步配置（自部署用户）

> 💡 **提示：** 桌面客户端（Windows/macOS）**已内置官方云同步服务器**，无需任何额外配置即可直接使用跨端同步。如果你觉得配置 Firebase 过于繁琐，**强烈建议直接下载客户端使用**。

如果你坚持通过源码或 Vercel 自部署，并希望开启多端同步，需按照以下步骤配置你自己的 Firebase 数据库：

#### 1. 创建 Firebase 项目

1. 前往 [Firebase 控制台](https://console.firebase.google.com/) → **创建项目**
2. 启用 **Authentication** → 登录方式 → **Google**
3. 创建 **Firestore Database**（生产模式）
4. 设置 Firestore 安全规则，限制每个用户只能访问自己的数据：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

#### 2. 配置环境变量

将 `.env.example` 复制为 `.env.local`，填入 Firebase 配置：

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=你的_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=你的项目.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=你的项目ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=你的项目.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=你的sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=你的app_id
```

> 这些值可在 Firebase 控制台 → 项目设置 → 常规 → 你的应用 → SDK 配置 中找到。

#### 3. Vercel 部署

在 **Vercel 控制面板 → 项目设置 → Environment Variables** 中添加相同的变量，然后重新部署。

> 💡 Firebase API Key 设计上就是公开的（客户端标识符）。数据安全由 Firebase Auth + Firestore 安全规则保障，而非隐藏 API Key。

---

## 🔄 更新

### 桌面客户端用户

前往 [Releases](https://github.com/YuanShiJiLoong/author/releases/latest) 页面下载最新版本安装包，覆盖安装即可。你的数据存储在浏览器/Electron 用户配置中，不会丢失。

> 💬 无法访问 GitHub？[加入 QQ 交流群：1087016949](https://qm.qq.com/q/wjRDkotw0E)，群文件中下载最新版本。

### 源码部署用户

#### 方式一：应用内一键更新

打开 **帮助面板 → 关于 → 检查更新**，点击「一键更新」即可自动执行 `git pull → npm install → npm run build`。

> ⚠️ **更新完成后必须重启服务才能生效**，应用内会显示重启步骤指引。

#### 方式二：手动更新

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖（如有新增）
npm install
# 或: pnpm install && pnpm approve-builds

# 3. 重新构建（生产模式需要）
npm run build

# 4. 重启服务
# 开发模式：先 Ctrl+C 停止，再启动
npm run dev

# 生产模式：先 Ctrl+C 停止，再启动
npm start

# 使用 PM2 管理：
pm2 restart author
```

> ⚠️ **只执行 `git pull` 而不重启服务，新版本不会生效。** Running 的 Node.js 进程仍然使用旧代码。

### Vercel 部署用户

如果你通过 Fork 部署到 Vercel，只需在 GitHub 上将你的 Fork 与上游同步（Sync fork），Vercel 会自动重新部署。

---

## ⚙️ AI 配置

Author 支持多种 AI 供应商，你可以通过 **环境变量** 或 **应用内设置** 来配置：

| 供应商 | 环境变量 | 获取 API Key |
|--------|---------|-------------|
| 智谱 AI (GLM-4) | `ZHIPU_API_KEY` | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| Google Gemini（原生格式） | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| Google Gemini（OpenAI 兼容） | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| DeepSeek | 应用内配置 | [platform.deepseek.com](https://platform.deepseek.com/) |
| OpenAI | 应用内配置 | [platform.openai.com](https://platform.openai.com/) |
| OpenAI Responses | 应用内配置 | [platform.openai.com](https://platform.openai.com/) |
| Claude (Anthropic) | `CLAUDE_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| SiliconFlow (硅基流动) | 应用内配置 | [siliconflow.cn](https://siliconflow.cn/) |
| 火山引擎 (豆包) | 应用内配置 | [console.volcengine.com](https://console.volcengine.com/) |
| Moonshot (Kimi) | 应用内配置 | [platform.moonshot.cn](https://platform.moonshot.cn/) |
| 自定义（OpenAI 兼容） | 应用内配置 | 任何 OpenAI 兼容端点 |
| 自定义（Gemini 格式） | 应用内配置 | 任何 Gemini 兼容端点 |
| 自定义（Claude 格式） | 应用内配置 | 任何 Claude 兼容端点 |

> 💡 **提示：** 所有的 API Key 输入框都支持填写**多个 Key**（构建 Key 池）。只需用**逗号 `,` 或空格**分隔多个 Key，系统将会在每次请求时自动轮询（池化），有效防止单一 Key 触发并发或频控限制（Rate Limit）。

> 💡 **无需 API Key 也能使用**大部分编辑功能。AI 功能需要至少配置一个供应商。

---

## 🔍 联网搜索配置

Author 支持让 AI 联网搜索实时信息。不同供应商的搜索方式不同：

| 供应商 | 搜索方式 | 额外配置 |
|--------|---------|---------|
| Gemini（原生格式） | 内置 Google Search | 无需额外配置 |
| OpenAI / OpenAI Responses | 内置 Web Search | 无需额外配置（需搜索模型） |
| DeepSeek / 智谱 / 硅基 / 其他 | 外部搜索 API | **需配置搜索引擎 Key** |

对于不支持内置搜索的供应商，你需要选择一个搜索引擎并填入 API Key：

### Tavily（推荐，最简单）

1. 访问 [tavily.com](https://tavily.com)，注册账号
2. 登录后在 Dashboard 页面即可看到 API Key（格式：`tvly-...`）
3. 在 Author 设置 → 联网搜索 → 选择 **Tavily** → 粘贴 Key

> 免费额度：**1000 次/月**

### Exa（语义搜索）

1. 访问 [exa.ai](https://exa.ai)，注册账号
2. 在 [Dashboard](https://dashboard.exa.ai/api-keys) 获取 API Key
3. 在 Author 设置 → 联网搜索 → 选择 **Exa** → 粘贴 Key

> 免费额度：**1000 次/月**　｜　支持语义搜索，AI 场景下搜索质量更高

### 自定义搜索 API 地址（中转号池）

如果你搭建了 Tavily/Exa 的中转号池代理，可以在搜索配置中填写**自定义 API 地址**：

1. 在 Author 设置 → 联网搜索 → 搜索引擎配置区域
2. 找到「🔗 自定义 API 地址（可选）」输入框
3. 填入你的中转地址，如 `https://your-proxy.com`
4. 留空则使用官方默认地址

> 💡 系统会自动在你的地址后拼接 `/search` 路径，无需手动添加

---

## 🧠 向量化 (Embedding) 与 RAG 设定检索

> 💡 此功能适用于设定集条目较多（>20 个）的长篇巨著。普通短篇创作通常不需要配置。

### 什么是向量化？

传统方式下，AI 对话时会将设定集的**所有条目**注入上下文。当条目数量庞大时，会超出模型的上下文长度限制。

**向量化检索（RAG）** 的做法是：将每个设定条目转化为一个数学向量，对话时 AI 自动计算语义相似度，只取出**最相关的几条设定**注入上下文，而不是全量塞入。

### 何时需要？

| 场景 | 建议 |
|------|------|
| 设定条目 < 20 个 | 无需开启，全量注入即可 |
| 设定条目 20~100 个 | 建议开启，提升召回精度 |
| 设定条目 > 100 个 | 强烈建议开启，重要设定不再被遗忘 |

### 如何配置

1. 打开**设定集** → **API 配置**
2. 找到「独立向量 API」开关并启用
3. 填写以下信息：

| 配置项 | 说明 |
|--------|------|
| **Embedding API Key** | 向量化模型的 API 密钥（可与对话模型共用同一供应商的 Key） |
| **Embedding Base URL** | 接口地址（如 `https://api.openai.com/v1`） |
| **Embedding Model** | 模型名称（见下方推荐） |

#### 推荐模型

| 供应商 | 模型名称 | 特点 |
|--------|---------|------|
| OpenAI | `text-embedding-3-small` | 性价比高，1536 维 |
| OpenAI | `text-embedding-3-large` | 精度更高，3072 维 |
| 智谱 AI | `embedding-3` | 中文优化，2048 维 |
| SiliconFlow | `BAAI/bge-m3` | 多语言，免费额度 |

### 自动向量化机制

- **自动触发**：设定集条目发生变化后，系统自动防抖 3 秒再触发向量化，不干扰写作心流。
- **增量更新**：只对修改过的条目进行更新重建，不会全量重建，极致节省 API 额度与时间。
- **本地存储**：向量数据储存在本地浏览器 IndexedDB 中，不会上传到任何非你配置的服务器，保护知识产权。
- **自动初始化**：在导入设定集或多端同步拉取数据时，如果发现本地缺少向量索引，系统会自动后台构建。

### 手动重建向量

如果切换了 Embedding 模型、或向量索引出现异常，可以手动重建：

1. 打开**设定集** → **API 配置**
2. 点击「**重建向量索引**」按钮
3. 等待所有条目重新向量化完成

### 工作流程

```
用户编辑设定条目 → 自动防抖 3 秒 → 调用 Embedding API 获取向量
                                          ↓
                                   存储到本地 IndexedDB
                                          ↓
AI 对话时 → 将用户输入向量化 → 余弦相似度匹配 → 取 Top-K 相关设定注入上下文
```

---

## 设定集导入格式说明

Author 支持从多种格式导入设定集：**JSON / Markdown / TXT / DOCX / PDF**。

### 核心结构：四个层级

导入系统使用**结构性标记**来严格区分以下四个层级。无论使用哪种格式，都必须遵循此套娃结构：
`分类（Category）→ 条目（Entry）→ 字段（Field）→ 值（Value，可多行）`

因此，**任意自定义分类、自定义标签、自定义字段都能被正确识别**并无损还原。

### 格式可靠性与层级标记对照表

| 等级 | 格式 | 分类 | 条目 | 字段 | 续行 |
|------|------|---------|---------|---------|---------|
| ⭐⭐⭐⭐⭐ (无损) | **JSON** | `category` | `name` | `content` 键值对 | `\n` 换行符 |
| ⭐⭐⭐⭐⭐ (无损) | **MD** | `## 分类名` | `### 条目名` | `**标签**：值` | 缩进内容 |
| ⭐⭐⭐⭐ (无损) | **TXT** | `│ 分类名` | `【条目名】` | `〈标签〉：值` | 缩进内容 |
| ⭐⭐⭐ (高保真) | **DOCX** | Heading 1 | Heading 2 | **加粗**标签+冒号 | 缩进段落 |
| ⭐⭐ (高保真) | **PDF** | `■ 分类名` | `◆ 条目名` | `▸ 标签：值` | 缩进内容 |

---

### Markdown 格式模板（推荐）

用 `##` 标记分类，`###` 标记条目名，`**标签**：内容` 填写字段：

```markdown
## 任何自定义分类

### 张三

**角色**：主角
**背景故事**：出生于大山深处。
  从小跟着爷爷学武。
  师父说："你必须自己找到答案。"
**自定义血统**：半龙血脉

### 苏雨晴
**性别**：女
**性格**：活泼开朗，心思细腻
```

## 空间/地点

### 天剑宗
描述：坐落于青云山巅的修仙门派，云雾缭绕
视觉描写：白色建筑群隐于云海之中，剑光时常划破天际
氛围基调：庄严肃穆与仙气飘渺并存
危险等级：安全区域

## 物品/道具

### 玄冰剑
描述：上古神兵，寒气逼人
物品类型：武器
品阶：天阶
持有者：林逸

## 世界观/设定

### 灵气体系
描述：天地间充斥灵气，修士通过吸收灵气突破境界。境界分为：练气、筑基、金丹、元婴、化神。

## 大纲

### 第一卷：踏入修仙路
状态：已完成
描述：林逸被天剑宗收为弟子，开始修炼之路，在宗门大比中崭露头角

## 写作规则

### 文风要求
描述：用古风韵味的现代文写作，避免过于白话。战斗场面要有画面感，不使用数值化描述。
```

---

### TXT 格式模板

使用 `│` 标记分类框，`【】` 标记条目名，`〈标签〉：` 标记字段：

```
┌──────────────────────────
│ 任何自定义分类
└──────────────────────────

【张三】
〈性别〉：男
〈背景故事〉：出生于大山深处。
  从小跟着爷爷学武。
  师父说："你必须自己找到答案。"
〈自定义血统〉：半龙血脉
```

---

### DOCX 格式模板

在 Word 中使用**标题样式与加粗**来标记结构：
- **标题 1 (H1)** → 分类名（如"任何自定义分类"）
- **标题 2 (H2)** → 条目名（如"张三"）
- **正文首段** → **加粗字段名**：内容（如 **自定义血统**：半龙血脉）
- **正文续段** → 带有首行缩进的多行内容

---

### 各分类支持的字段

<details>
<summary>点击展开完整字段列表</summary>

#### 人物设定 (character)
`姓名` `性别` `年龄` `外貌` `性格` `背景故事` `动机` `能力` `说话风格` `人物关系` `成长弧线` `备注`

#### 空间/地点 (location)
`描述` `场景标题` `视觉描写` `听觉描写` `嗅觉/触觉` `氛围基调` `危险等级` `备注`

#### 物品/道具 (object)
`描述` `物品类型` `品阶` `持有者` `数值属性` `象征意义` `备注`

#### 世界观/设定 (world)
`描述` `备注`

#### 大纲 (plot)
`状态` `描述` `备注`

#### 写作规则 (rules)
`描述` `备注`

> 💡 字段名支持多种别名，例如"性格"也可以写成"个性"或"人格"。系统会自动识别并映射到对应字段。

</details>

---

### 💡 兼容性设计与注意事项

1. **自动标签回退 (向后兼容)** — TXT/Markdown 中如果遇到无专用结构符（如只有 `姓名：张三` 而不是 `**姓名**：张三`），只要 `姓名` 属于已知的核心字段集，系统仍会自动兼容解析该字段。但想要 100% 确保触发并提取自定义字段，请务必加上结构符号。
2. **多行值处理** — 每当你使用了 `**标签**：` 或 `〈标签〉：` 起头后，所有接下来**带有 2 格缩进的行**都会被被视为该字段的正文（多行值提取），直到遇到下一个结构性标签为止。
3. **DOCX / PDF 解析限制** — PDF 使用专门设计的 `▸` 标识符提取，如果导入并非本系统生成的 PDF / DOCX 文件，系统会触发启发式解析尝试尽可能提取内容，但保真度无法达到 100%。
4. **JSON 最完整** — JSON 毫无疑问是最严谨、能够 100% 迁移所有属性（包括写入模式、作品配置信息）的格式。如果仅仅是为了更换创作设备，强烈建议首选 JSON 导入导出。

---

## �🔒 隐私与数据安全

### 本地存储（安全）
- 章节内容、设定集、快照等创作数据 **100% 存储在浏览器本地（IndexedDB）**，不会上传到任何服务器
- API Key 存储在浏览器 localStorage 中

### ⚠️ AI 功能的数据流向

使用 AI 功能时（续写、改写、对话等），以下数据会经过**部署者的服务器**转发给 AI 供应商：
- 你的 **API Key**
- 你发送给 AI 的**文字内容**

```
你的浏览器 → 部署者的服务器 → AI 供应商（智谱/Gemini/DeepSeek等）
```

**如果你正在使用他人部署的公开实例**，虽然部署者承诺不会窥视日志，但技术上存在被截获的可能。因此：

1. ✅ 可以先用公开实例**简单体验**功能
2. ⚠️ 体验完毕后，**务必到 API 提供商网站及时销毁你的 Key**
3. 🔐 **正式使用请自行 Fork 并部署私有实例**，这样数据只经过你自己的服务器

> 💡 部署自己的实例非常简单：Fork 本项目 → 在 Vercel 一键部署 → 完成。全程不到 5 分钟。

---

##  开源协议

本项目采用 [AGPL-3.0](LICENSE) 协议开源。

**简单说**：
- ✅ 你可以自由使用、修改、分发
- ✅ 允许个人和商业使用（前提是修改后的代码也必须开源）
- ⚠️ 修改后的版本（包括基于此搭建的网络服务）必须同样以 AGPL-3.0 开源
- ⚠️ 必须保留原始版权声明
- ❌ 不可闭源后用于商业用途

---

## 💬 社区交流

- [QQ 交流群：1087016949（Author交流群）](https://qm.qq.com/q/wjRDkotw0E)
- [GitHub Issues](https://github.com/YuanShiJiLoong/author/issues) — 问题反馈与功能建议

---

## 📜 法律文档

使用 Author 即表示您同意我们的 **隐私政策** 和 **服务条款**。这些文档提供多种语言版本：

| 文档 | English | 中文 | Русский | العربية |
|------|---------|------|---------|---------|
| 隐私政策 | [PRIVACY.md](PRIVACY.md) | [PRIVACY.zh.md](PRIVACY.zh.md) | [PRIVACY.ru.md](PRIVACY.ru.md) | [PRIVACY.ar.md](PRIVACY.ar.md) |
| 服务条款 | [TERMS.md](TERMS.md) | [TERMS.zh.md](TERMS.zh.md) | [TERMS.ru.md](TERMS.ru.md) | [TERMS.ar.md](TERMS.ar.md) |

> 💡 **中国大陆用户提示**：如果 GitHub 访问受限，可通过 [Gitee 镜像](https://gitee.com/yuanshijilong/author) 查阅上述文档。法律文档也随桌面版安装包一同分发，可在应用内离线查看。

---

## 🙏 致谢

### 🤖 AI 伙伴
| 名称 | 作用 |
|------|------|
| [Claude Opus 4.6](https://www.anthropic.com/)（Thinking） | 主力编程助手 — 架构设计、功能实现、调试 |
| [Gemini 3.1 Pro](https://deepmind.google/technologies/gemini/)（High） | UI 审查、截图分析、设计迭代 |
| [Gemini 3 Flash](https://deepmind.google/technologies/gemini/) | 内置浏览器自动化工具 |
| [ChatGPT 5.4](https://openai.com/chatgpt/) | 主力编程助手 |

### 🛠️ AI 编程 IDE
- [Antigravity](https://antigravity.google/) — AI 编程伙伴
- [Codex](https://openai.com/codex/) — AI 编程伙伴

### 🔌 MCP 工具
- [Chrome DevTools MCP](https://developer.chrome.com/) — 浏览器测试、性能分析、DOM 检查
- [Firebase MCP](https://firebase.google.com/) — 云数据库管理、安全规则验证、项目配置
- [GitHub MCP](https://github.com/) — 仓库管理、自动化发版、代码搜索

### ☁️ 后端与数据库
- [Firebase Firestore](https://firebase.google.com/docs/firestore) — 多端云同步、NoSQL 数据存储
- [Firebase Hosting / Vercel](https://vercel.com/) — 全栈服务端托管

### 📦 前端与开源组件
- [Next.js](https://nextjs.org/) — React 全栈框架
- [Tiptap](https://tiptap.dev/) — 核心编辑器框架
- [Zustand](https://zustand-demo.pmnd.rs/) — 状态管理
- [KaTeX](https://katex.org/) — 本地数学公式渲染

### 🌟 灵感参考
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — API 多供应商配置架构与对话管理参考
- [RikkaHub](https://github.com/RikkaApps/RikkaHub) — Token 用量计算与统计展示参考

### 🔤 字体鸣谢
- [霞鹜文楷 (LXGW WenKai)](https://github.com/lxgw/LxgwWenKai) — 优雅的本地中文阅读字体
- [Inter](https://fonts.google.com/specimen/Inter) — 界面英文字体
