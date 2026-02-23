[English](README.md) | **简体中文**

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
- **KaTeX** 数学公式支持
- 字体、字号、行距、颜色自定义
- 实时字数/字符/段落统计

### 🤖 AI 写作助手
- **多 AI 供应商**：智谱 GLM-4 / DeepSeek / OpenAI / Google Gemini
- **续写 / 改写 / 润色 / 扩写**，一键生成
- **Ghost Text** 流式预览 — 像 Cursor 一样实时显示 AI 生成内容，支持接受/拒绝
- **自由对话模式** — 与 AI 讨论剧情、角色、设定
- **上下文引擎** — AI 自动感知你的角色设定、世界观、前文，保持剧情连贯

### 📚 设定集管理
- **树形结构**管理角色、地点、物品、大纲、写作规则
- 三种写作模式：**网文** / **传统文学** / **剧本**，每种模式有专属字段
- 分类配色 + glassmorphism 视觉风格
- 设定内容自动注入 AI 上下文

### 💾 数据管理
- **本地优先** — 所有数据存储在浏览器 IndexedDB，不上传服务器
- **快照系统** — 手动/自动版本存档，支持一键回滚
- **项目导入导出** — 完整项目 JSON 备份
- **Markdown 导出** — 单章或全部导出

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

安装即用，所有功能开箱即得。

> 💡 Gitee 镜像仅提供源码，安装包请从 GitHub Release 下载。

> 💡 从源码构建桌面应用：`npm run build && npx electron-builder --win`

---

## 🚀 快速开始

### 环境要求
- **Node.js** 18+
- **npm** 9+

### 安装

```bash
# 克隆仓库
git clone https://github.com/YuanShiJiLoong/author.git
# 国内用户推荐使用 Gitee 镜像（更快）
# git clone https://gitee.com/yuanshijilong/author.git
cd author

# 安装依赖
npm install

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

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YuanShiJiLoong/author)

---

## ⚙️ AI 配置

Author 支持多种 AI 供应商，你可以通过 **环境变量** 或 **应用内设置** 来配置：

| 供应商 | 环境变量 | 获取 API Key |
|--------|---------|-------------|
| 智谱 AI (GLM-4) | `ZHIPU_API_KEY` | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| Google Gemini | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| DeepSeek | 应用内配置 | [platform.deepseek.com](https://platform.deepseek.com/) |
| OpenAI / 兼容 | 应用内配置 | [platform.openai.com](https://platform.openai.com/) |

> 💡 **无需 API Key 也能使用**大部分编辑功能。AI 功能需要至少配置一个供应商。

---

## 🔒 隐私与数据安全

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
- ✅ 你可以用于个人/商业用途
- ⚠️ 修改后的版本也必须开源（包括网络服务）
- ⚠️ 必须保留原始版权声明

---

## 🙏 致谢

- [Google Antigravity](https://antigravity.google/) — AI 编程伙伴
- [Tiptap](https://tiptap.dev/) — 编辑器框架
- [Next.js](https://nextjs.org/) — React 全栈框架
- [Zustand](https://zustand-demo.pmnd.rs/) — 状态管理
- [KaTeX](https://katex.org/) — 数学公式渲染
