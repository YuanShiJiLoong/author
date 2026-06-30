'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '../lib/useI18n';
import { localizeApiError } from '../lib/api-error-i18n';
import { stepLabel } from './UpdateBanner';
import { REPO, LEGAL_LANGUAGES, legalDocUrl } from '../lib/constants';
import { downloadDiagnosticReport, recordDiagnosticEvent } from '../lib/diagnostics';

const HELP_SECTIONS = [
    {
        id: 'quickstart',
        title: '🚀 快速开始',
        content: `
## 欢迎使用 Author

Author 是一款面向小说创作者的 **AI 辅助写作平台**，集成智能续写、设定集管理、上下文感知等专业功能，为你打造沉浸式创作体验。

### 第一步：配置 AI
1. 点击左侧边栏底部的 **⚙️ 设定** 按钮
2. 在「API 配置」中填写你的 AI 服务信息
3. 支持 **OpenAI 兼容接口** 和 **Claude 兼容接口**
4. 点击「测试连接」确认配置正确

### 第二步：开始创作
1. 在左侧边栏点击 **＋ 新建** 创建章节
2. 在编辑器中直接开始写作
3. 使用顶部工具栏调整格式

### 第三步：AI 辅助
- **内联 AI**：按 **Ctrl+J** 在光标处唤起 AI，直接在编辑器中续写
- **AI 聊天**：点击右上角 **✦ AI** 打开侧边栏，与 AI 对话讨论剧情
- AI 会自动参考你的设定集、前文内容和写作模式

### 界面概览
| 区域 | 功能 |
|------|------|
| **左侧边栏** | 章节管理、字数统计（可查看 Token 缓存命中）、导出、存档/读档、导入作品、设定集、云同步、主题 |
| **顶部工具栏** | 文字格式、对齐、列表、公式、排版、一键排版 |
| **编辑区域** | 所见即所得的富文本编辑，分页预览 |
| **右侧 AI 栏** | AI 聊天对话、上下文参考管理、联网搜索 |
| **底部状态栏** | 写作模式、页数、全书字数统计 |
| **左下角导航** | 云同步状态、社区/GitHub 入口 |
| **右上角** | 账号管理、多设备登录、头像指示器 |
    `,
    },
    {
        id: 'ai-inline',
        title: '✦ 内联 AI 写作',
        content: `
## 内联 AI 写作助手

在编辑器内直接使用 AI，类似 Cursor 的体验。

### 唤起方式
按下 **Ctrl+J**（Mac: **⌘+J**）在光标位置弹出 AI 面板。

### AI 模式

| 模式 | 功能 | 需要选中文字 |
|------|------|:----:|
| ✦ 续写 | 从光标处自然续写故事 | ✗ |
| ✎ 润色 | 提升文字质量和流畅度 | ✓ |
| ⊕ 扩写 | 丰富细节与描写 | ✓ |
| ⊖ 精简 | 浓缩核心内容 | ✓ |

### 使用步骤
1. 将光标放在要续写的位置，或选中要修改的文字
2. 按 **Ctrl+J** 打开 AI 面板
3. 选择所需模式
4. （可选）在输入框中补充指示，如"写一段打斗场景"
5. 按 **Enter** 或点击 **✦ 生成** 开始
6. AI 会以 **沉浸式写作引擎（Ghost Text）** 效果出现在编辑器中
7. 点击 **✓ 接受** 确认采用，或 **✕ 拒绝** 撤销

已接受、已拒绝或重新生成时放弃的 AI 文本会进入 AI 助手的「存档」Tab，之后可从存档重新插入正文，也可复制或删除不再需要的记录。

### 上下文感知
AI 会自动参考：
- **前文内容**：自动采集前文上下文
- **设定集**：角色设定、世界观、情节大纲等
- **写作模式**：网文/纯文学/剧本不同风格

> 提示：在设定集中配置角色和世界观，AI 生成内容会更贴合你的故事。
    `,
    },
    {
        id: 'ai-chat',
        title: '💬 AI 聊天侧栏',
        content: `
## AI 聊天侧栏

与 AI 进行多轮对话，讨论剧情、角色、世界观，甚至让 AI 直接管理你的设定集。

### 打开方式
点击编辑器右上角的 **✦ AI** 按钮，或使用快捷键。

### 核心功能

#### 多轮对话
- 支持完整的多轮对话历史
- AI 回复支持 **Markdown 渲染**（代码块、表格、列表等）
- 可以编辑已发送的消息重新生成

#### 上下文参考（参考 Tab）
切换到「参考」标签页，勾选要注入的上下文：
- 人物设定、世界观、地点、物品、大纲、写作规则
- 勾选的内容会作为 AI 的背景知识

#### 会话管理
- **新建会话**：开启全新对话
- **切换会话**：在多个对话间切换
- **重命名/删除**：右键管理会话

#### AI 管理设定集
对话中 AI 可以生成 **设定操作卡片**，你可以一键应用：
- **添加**：AI 建议新角色/设定，点击「✅ 应用」直接写入设定集
- **更新**：AI 修改已有设定（按名称自动匹配）
- **删除**：直接告诉 AI「删除XXX」，AI 会按名称查找并生成删除操作
- **查找**：问 AI「有哪些角色/设定」，AI 知道全部条目（包括已禁用的）
- 点击卡片标题栏 **▼ 展开** 可以查看完整内容

#### 消息变体
- 对 AI 回复点击「重新生成」可获取不同版本
- 使用 < 1/3 > 导航切换不同变体
- **全屏沉浸输入**：点击输入框右下角的放大图标，即可切入全屏写作面板，轻松撰写超长 Prompt。
- **发送快捷键**：在「设定集 → 偏好设置 → AI 对话发送快捷键」可选择 Enter 发送，或 Ctrl/⌘ + Enter 发送；设置会同时作用于小输入框和全屏输入面板。
    `,
    },
    {
        id: 'settings',
        title: '⚙️ 设定集系统',
        content: `
## 设定集管理

设定集是 AI 创作的"记忆"，帮助 AI 深入理解你的故事世界，生成更贴合的内容。

### 打开方式
点击侧栏底部的 **⚙️** 按钮。

### API 配置与模型设置
这是 AI 助理运作的基石。所有写入的 API 密钥都在 **本地浏览器存储**，绝对安全。
| 设置项 | 说明 |
|------|------|
| **API 提供商** | 支持智谱、DeepSeek、OpenAI、Gemini、SiliconFlow、Moonshot 等，也可自定义接入 |
| **API Key** | 你的大模型服务凭证。保存在本地，必需配置。**负载均衡 / Key池**：支持填入多个Key（用英文逗号 \`,\` 分隔，例如 \`sk-1,sk-2\`），系统会随机轮询发流，避免限频 |
| **Base URL** | 接口地址（切换提供商时会自动填写默认地址） |
| **模型选择** | 点击「从 API 拉取模型列表」自动更新当前可用的大模型库供你选择；已保存但本次未返回的模型会标记为「未返回」，可手动清理 |
| **独立向量API** | 开启专用的 Embedding 模型，为百万字长篇提供精准的 RAG 设定检索能力 |
| **高级模型参数** | 支持开启并独立覆盖 Temperature、Top P、推理思考强度 (Reasoning Effort) 等高级调度参数 |

### ⚡ Token 级智能缓存
系统底层接入了官方的 Prompt Caching 技术（目前支持 Anthropic 与 Gemini）。系统会自动将设定集和前文加入缓存机制。
点击右侧大模型对话旁的「统计」Tab，或悬浮在文章字数上，即可实时查看 **缓存命中 Tokens**，极大节省创作成本并加速响应。

### 偏好设置 (Preferences)
在设定集的最后一栏，你可以随时：
- 切换语言界面（简体中文、English、Русский）
- 切换工作台视觉主题（经典纸张 / 现代玻璃）
- 设置 AI 对话发送快捷键（Enter 发送 / Ctrl 或 ⌘ + Enter 发送）

### 多作品管理
支持在一个项目中管理多个作品的设定集：
- 创建多个作品，每个作品拥有独立的设定树
- 在左侧下拉列表中切换当前作品
- 删除作品会同时删除其下所有设定节点

### 书籍信息
设置书名、类型、简介——帮助 AI 了解整体方向。

### 设定树
在左侧树形结构中添加和管理各类设定：
- **顶层分类重命名**：在完整设定集面板的分类卡片上，或左侧设定集弹出菜单的编辑模式中点击铅笔，可为当前作品单独修改顶层分类名称。

| 分类 | 图标 | 可设置字段 |
|------|------|----------|
| **角色设定** | User | 类型、性别、年龄、外貌、性格、说话风格、背景、动机、能力、关系 |
| **世界观** | Globe | 描述、备注 |
| **地点/空间** | MapPin | 描述、场景标题、感官细节（视觉/听觉/嗅觉）、氛围 |
| **物品/道具** | Gem | 描述、类型、品阶、持有者、数值属性、象征意义 |
| **剧情大纲** | ClipboardList | 状态（计划中/写作中/已完成）、描述、备注 |
| **写作规则** | Ruler | 规则描述（AI 严格遵守） |

### 额外字段
AI 生成的非标准字段会自动出现在 **✨ AI 生成的额外字段** 分组中，可查看和编辑。

### 设定集导入/导出
支持多种格式的设定集导入和导出：
- **导出**：JSON、TXT、Markdown、DOCX、PDF
- **导入**：JSON（完整数据）、TXT / MD / DOCX / PDF（智能解析分类和条目）

#### 导入冲突解决
导入设定集时，如果有同名条目已存在，会弹出 **冲突解决弹窗**：
- **保留已有** — 保持当前版本不变
- **使用导入** — 用导入版本覆盖
- **🤖 AI 智能合并** — AI 将两个版本合并，保留所有有价值信息
- AI 合并支持 **结果轮播**：多次合并时可用 ◀ 1/N ▶ 切换不同版本

### 写作模式
| 模式 | 特点 |
|------|------|
| 📱 网文模式 | 节奏紧凑、对话多、爽点密集 |
| 📖 纯文学模式 | 叙述细腻、描写丰富、注重意境 |
| 🎬 剧本模式 | 标准剧本格式 |
    `,
    },
    {
        id: 'chapters',
        title: '📚 章节管理',
        content: `
## 章节管理

### 创建章节
点击侧栏中的 **＋ 新建章节** 按钮，自动创建带有递增编号的新章节（如「第一章」→「第二章」，支持中文数字和阿拉伯数字）。
悬停章节行时，点击章节右侧的 **＋** 可直接在该章节后插入空白章节。

### 特殊章节
编辑器工具栏的 **特殊章节** 或章节行右侧的 **特** 可将当前章节设为特殊章节；重排章节编号时会自动跳过这类章节。

### 切换章节
点击侧栏中的章节名称切换到该章节，编辑器会加载其内容。

### 右键操作
在章节名称上 **右键单击** 可以：
- **✎ 重命名** — 修改章节标题
- **↓ 导出 Markdown** — 将当前章节导出为 .md 文件
- **特殊章节** — 切换重排编号时是否忽略该章节
- **✕ 删除章节** — 删除该章节（需确认）

### 拖拽排序
长按章节名称可以拖拽重新排列顺序。

### 字数统计
- 每个章节旁显示本章字数
- 侧栏底部显示全书总字数

### 分页预览
编辑器以类似 Word/Google Docs 的分页视图呈现，白色纸张卡片 + 灰色画布背景，底部状态栏显示当前页数。
    `,
    },
    {
        id: 'toolbar',
        title: '🎨 工具栏功能',
        content: `
## 工具栏一览

### 撤销 / 重做
↩ 撤销最近的操作，↪ 恢复已撤销的操作。

### 字体与字号
- 下拉选择字体：默认（正文默认）、宋体、黑体、楷体、仿宋、Serif、Monospace
- 下拉选择字号：从 12px 到 32px

### 文字格式
| 按钮 | 功能 | 快捷键 |
|------|------|--------|
| **B** | 加粗 | Ctrl+B |
| *I* | 斜体 | Ctrl+I |
| U | 下划线 | Ctrl+U |
| ~~S~~ | 删除线 | — |
| X² | 上标 | — |
| X₂ | 下标 | — |
| 备注 | 给选中文字添加备注 / 批注 | — |

### 颜色
- **A▾** — 文字颜色选择器
- **高亮▾** — 背景高亮色选择器

### 备注 / 批注
选中文字后点击工具栏或气泡菜单里的 **备注** 按钮，即可给一句话添加纸页侧注。备注不会混入正文；导出时可以选择正文版或批注版，其中 DOCX 批注版会生成 Word / WPS 可识别的原生批注。

### 文字朗读与专注辅助
- 编辑器底部状态栏的 **朗读** 按钮会优先朗读选中文字，否则朗读当前章节；可暂停、继续、停止，并切换音色和语速。
- 朗读设置支持系统语音，也可在弹出的音源设置中配置兼容的云端 TTS 服务；失败时可打开并复制详细诊断信息。
- 在 **设定 → 偏好设置** 中启用“当前段落高亮”，可用淡色标出正在编辑的段落，并在编辑器失焦后保留细光标位置。

### 标题与对齐
- H1/H2/H3 — 一级/二级/三级标题
- 左对齐/居中/右对齐/两端对齐

### 排版调节
点击 **Aa▾** 调节全局字号（14-24px）和行距（1.4-2.6），可一键恢复默认。

### 列表与块元素
| 按钮 | 功能 |
|------|------|
| • 列 | 无序列表 |
| 1. 列 | 有序列表 |
| ☑ 任 | 任务列表 |
| ❝ 引 | 引用块 |
| </> | 代码块 |
| ∑ | LaTeX 公式 |
| —— | 水平分割线 |

### 一键排版
点击工具栏右侧的 **✨ 魔术棒** 按钮（Auto Format），可一键整理文档格式：
- 删除段首多余空格和全角空格
- 清除空段落
- 保留所有格式标记（加粗、斜体等）
- 操作可撤销（Ctrl+Z）
    `,
    },
    {
        id: 'data',
        title: '💾 数据管理',
        content: `
## 数据管理

### 自动保存
编辑内容会 **实时自动保存** 到浏览器的 localStorage，无需手动保存。

### 左侧导航栏按钮

| 图标 | 功能 |
|------|------|
| ☀ / 眼 / 🌙 | 在亮色、护眼、暗色模式间循环 |
| 🕒 | **时光机** — 版本历史，回溯到之前的快照 |
| 📂 | **读档** — 从 JSON 文件恢复完整项目 |
| 💾 | **存档** — 将整个项目（所有章节 + 设定集）导出为 JSON 文件；不包含 API 配置和 AI 对话 |
| 📥 | **导入作品** — 从文件导入章节（支持多种格式） |
| 📤 | **导出** — 点击弹出下拉菜单，可导出本章（TXT/Markdown/DOCX/EPUB/PDF）或打开「导出更多」批量选择 |
| ☁️ | **云同步** — 登录后实时同步数据到云端（详见「☁️ 云同步」章节） |
| ⚙️ | **更多** — API 配置、偏好设置、帮助、社区 |

### 多格式导入
支持从以下格式导入作品（自动识别章节）：
- **TXT** — 纯文本
- **Markdown (.md)** — Markdown 格式
- **EPUB** — 电子书
- **DOCX** — Word 文档
- **DOC** — 旧版 Word 文档
- **PDF** — PDF 文件

#### 智能章节合并
导入到已有作品时，系统会智能比对章节编号：
- 自动识别多种编号格式（如 "第三十三章"、"33"、"三十三" 视为同一章）
- **无冲突** → 按编号自动排序合并
- **有冲突** → 弹出冲突解决弹窗，可勾选保留哪些章节
- 导入到空白作品 → 直接导入

### 多格式导出
点击导航栏的「导出」按钮，在下拉菜单中选择：
- **导出本章** — 将当前选中章节导出为 TXT / Markdown / DOCX / EPUB / PDF
- **导出更多** — 打开弹窗，自由勾选要导出的章节和格式

「导出更多」弹窗支持按分组批量勾选章节，方便部分导出；内容可选择 **正文** 或 **批注版**。正文版会剥离备注，批注版会保留备注内容，DOCX 会使用 Word 原生批注。

### 桌面客户端 (Electron)
如果你使用的是 Windows 桌面客户端：
- **内置官方云同步服务器**，无需手动配置 Firebase
- 支持一键检查更新和自动安装
- 数据存储在系统用户目录中，不受浏览器清理影响
- 调试日志位于 \`%APPDATA%\\author-app\\author-debug.log\`

### 故障诊断日志
如果使用时出现白屏、卡死或崩溃：
- 打开 **帮助 → 关于 → 导出诊断日志**，会下载一个 \`author-diagnostic-*.json\`
- 桌面客户端可在 **帮助 → 关于 → 打开日志目录** 查看本地日志位置
- 白屏/崩溃错误页也会显示 **导出诊断日志** 按钮
- 桌面客户端主日志位于 \`%APPDATA%\\author-app\\author-debug.log\`
- 如果桌面客户端已经崩溃退出，会自动写入 \`%APPDATA%\\author-app\\crash-reports\\author-crash-*.json\`，崩溃弹窗可直接打开日志目录
- 浏览器 / 源码 / Vercel 部署没有桌面日志目录，但仍可通过「导出诊断日志」下载当前浏览器本地诊断报告
- 日志会包含最近的错误、警告、点击/拖拽、顶层遮罩、长任务卡顿等线索和桌面客户端主进程日志
- API Key、Token、Authorization、公网 IP 等敏感字段会自动脱敏

### 重要提醒
- 所有数据存储在 **浏览器本地**，不会上传到任何服务器
- **清除浏览器数据** 会丢失所有未导出的内容（桌面客户端不受影响）
- **API Key** 存储在本地 localStorage 中
- 建议定期使用 💾 存档功能备份作品，或开启 **☁️ 云同步** 同步章节与设定集

### ⚠️ AI 功能的隐私须知
使用 AI 功能时（续写、改写、对话等），你的 **API Key** 和 **发送给 AI 的文字内容** 会经过部署者的服务器转发给 AI 供应商。

如果你正在使用他人部署的公开实例：
- 可以先**简单体验**功能
- 体验完毕后，**务必到 API 提供商网站及时销毁你的 Key**
- **正式使用请自行 Fork 并部署私有实例**
    `,
    },
    {
        id: 'markdown',
        title: '📝 Markdown',
        content: `
## Markdown 自动渲染

在编辑器中输入 Markdown 语法会 **自动转换** 为富文本格式。

### 支持的语法
| 输入 | 效果 |
|------|------|
| \`**加粗**\` | **加粗** |
| \`*斜体*\` | *斜体* |
| \`~~删除线~~\` | ~~删除线~~ |
| \`# 标题\` | 一级标题 |
| \`## 标题\` | 二级标题 |
| \`### 标题\` | 三级标题 |
| \`- 列表\` | 无序列表 |
| \`1. 列表\` | 有序列表 |
| \`> 引用\` | 引用块 |
| \`---\` | 分割线 |

### AI 聊天中的 Markdown
AI 聊天侧栏中的回复支持完整的 Markdown 渲染，包括代码块、表格、链接等。
    `,
    },
    {
        id: 'shortcuts',
        title: '⌨️ 快捷键',
        content: `
## 键盘快捷键

### 编辑
| 快捷键 | 功能 |
|--------|------|
| Ctrl+Z | 撤销 |
| Ctrl+Y | 重做 |
| Ctrl+A | 全选 |

### 格式
| 快捷键 | 功能 |
|--------|------|
| Ctrl+B | 加粗 |
| Ctrl+I | 斜体 |
| Ctrl+U | 下划线 |

### AI
| 快捷键 | 功能 |
|--------|------|
| Ctrl+J | 打开/关闭内联 AI 面板 |
| Enter | 开始 AI 生成 |
| Esc | 关闭 AI 面板 / 取消生成 |

### Markdown 快捷输入
| 输入 | 触发 |
|------|------|
| \`# \` + 空格 | 一级标题 |
| \`## \` + 空格 | 二级标题 |
| \`- \` + 空格 | 无序列表 |
| \`1. \` + 空格 | 有序列表 |
| \`> \` + 空格 | 引用块 |
| \`---\` + 回车 | 分割线 |

### 斜杠命令 (Slash Commands)
在编辑器中输入 \`/\` 可呼出快捷命令菜单：
| 命令 | 功能 |
|------|------|
| /h1, /h2, /h3 | 插入标题 |
| /bullet | 无序列表 |
| /ordered | 有序列表 |
| /todo | 任务列表 |
| /quote | 引用块 |
| /code | 代码块 |
| /hr | 水平分割线 |
| /math | LaTeX 公式 |
    `,
    },
    {
        id: 'theme',
        title: '🎭 主题 & 排版',
        content: `
## 主题与偏好排版

### 双旗舰主题引擎
目前 Author 提供两套深度打磨的主题集，可在设定集 -> **偏好设置** 中无缝切换：
- 📜 **经典纸张 (Warm Classic)**: 采用高级护眼的复古暖灰色调，所有卡片呈现日记本般的实体拟物反馈。
- 🧊 **现代通透 (Modern Glass)**: 苹果 macOS 风格，纯白与冷灰基底，带有极其剔透的毛玻璃 (\`backdrop-filter\`) 层级架构，追求极致的干净。

*注：你可以随时点击侧栏右下角的主题按钮，在亮色、护眼、暗色三种模式间循环。*

### 排版引擎调节
在顶部工具栏点击 **Aa▾** 按钮：
- **字号**：滑块无极调节 14px ~ 24px（默认 17px）
- **行距**：滑块无极调节 1.4 ~ 2.6（默认 1.9）
- **恢复默认**：一键重置排版参数

### 字体选择
| 字体 | 适合场景 |
|------|---------|
| 默认（正文默认） | 跟随偏好设置里的正文默认字体 |
| 宋体 | 正文写作 |
| 黑体 | 标题 |
| 楷体 | 古风文 |
| 仿宋 | 公文风格 |
| Serif | 英文衬线体 |
| Monospace | 等宽字体 |

需要改整篇正文的默认字体时，到 **偏好设置 → 正文默认字体** 调整；工具栏字体下拉只会给当前选区或后续输入添加显式字体。

### 排版建议
下表只影响编辑器里的阅读舒适度，不会改变正文内容、字数统计或导出的章节结构。

| 场景 | 推荐设置 | 说明 |
|------|----------|------|
| 长篇日常写作 | 字号 17px，行距 1.9 | 默认平衡设置，适合长时间输入 |
| 密集校对 | 字号 15-16px，行距 1.6-1.8 | 同屏显示更多文本，便于查错 |
| 沉浸阅读 / 大屏写作 | 字号 18-20px，行距 2.0-2.2 | 留出更多呼吸感，适合回读和润色 |
    `,
    },
    {
        id: 'about',
        title: 'ℹ️ 关于',
        content: `
## 关于 Author

**Author** 是一款 AI 驱动的小说创作工具，旨在为网文作者和文学创作者提供专业、高效的写作体验。

### 核心特色
- 🤖 **AI 智能写作** — 内联续写 + 聊天讨论，双模式辅助创作
- 📖 **上下文感知** — AI 自动参考角色设定、世界观、前文内容
- 🎭 **设定集管理** — 树形结构管理角色、世界观、大纲、写作规则
- ✦ **沉浸式写作引擎（Ghost Text）** — 类似 Cursor 的幽灵文字预览，接受/拒绝一键操作
- 📄 **分页视图** — 类 Word/Google Docs 的白纸分页排版
- 🌙 **深色模式** — 护眼的暗色主题
- 💾 **本地优先** — 所有数据存储在本地，隐私安全
- ☁️ **云同步** — 可选的多设备实时同步，登录即用
- 🧠 **向量化检索 (RAG)** — 大设定集智能检索，告别"AI 遗忘"
- 🔍 **联网搜索** — AI 对话时一键联网获取实时信息
- ✨ **一键排版** — 自动清理空格空段，标准化格式
- 📦 **存档/读档** — 一键导出/导入完整项目
- 📱 **移动端** — Android 原生应用，支持 Google 登录云同步
- 🖥️ **桌面客户端** — Windows 安装包，内置官方云同步服务器

### 数据安全
- 所有创作内容存储在你的浏览器本地
- API Key 存储在本地浏览器中
- 支持一键导出全部数据

### ⚠️ 隐私须知
使用 AI 功能时，API Key 和文字内容会经过**部署者的服务器**转发给 AI 供应商。使用他人部署的实例时，体验后请及时销毁 Key，正式使用请自行 Fork 部署。

### 技术栈
Next.js + Tiptap 编辑器 + AI API（OpenAI 兼容 / Gemini）

### 致谢与参考

#### 🤖 AI 伙伴
- [ChatGPT 5.5](https://openai.com/chatgpt/) (xhigh) — 主力推理与编程模型
- [Claude Opus 4.6](https://www.anthropic.com/) (Thinking) — 架构、实现、调试协作
- [Gemini 3.1 Pro](https://deepmind.google/technologies/gemini/) (High) — UI 审查、截图分析、设计迭代
- [Gemini 3 Flash](https://deepmind.google/technologies/gemini/) — 内置浏览器自动化工具

#### 🛠️ AI 编程 IDE
- [Antigravity](https://antigravity.google/) — AI 编程伙伴
- [Codex](https://openai.com/codex/) — 主力 AI 编程工具

#### 🔌 MCP 工具
- [Chrome DevTools MCP](https://developer.chrome.com/) — 浏览器测试、性能分析、DOM 检查
- [Firebase MCP](https://firebase.google.com/) — 云数据库管理、安全规则验证
- [GitHub MCP](https://github.com/) — 仓库管理、自动化发布

#### 🌟 灵感与参考
Author 的多提供商 API 配置体验参考了 RikkaHub、Cherry Studio 等开源 AI 客户端在 Provider、模型、Base URL 与本地密钥管理上的产品思路。

- Cherry Studio: [github.com/CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio)
- RikkaHub: [github.com/rikkahub/rikkahub](https://github.com/rikkahub/rikkahub)
- 本项目未包含 RikkaHub、Cherry Studio 的源码、素材或二进制文件；如未来直接引用其代码，应另行遵守 RikkaHub、Cherry Studio 当前许可证或取得相应授权。

### 开源项目
Author 是一个开源项目，采用 **AGPL-3.0** 协议。

🔗 **GitHub**: [github.com/YuanShiJiLoong/author](${REPO.github})

欢迎 Star ⭐、提 Issue、贡献代码！

### 📜 法律文档
使用 Author 即表示您同意我们的隐私政策和服务条款：

| 文档 | GitHub | Gitee 镜像（国内可达） |
|------|--------|----------------------|
${LEGAL_LANGUAGES.map(l => [
`| ${l.privacy} ${l.label.split(' ')[0]} | [GitHub](${legalDocUrl('github', 'PRIVACY', l.code)}) | [Gitee](${legalDocUrl('gitee', 'PRIVACY', l.code)}) |`,
`| ${l.terms} ${l.label.split(' ')[0]} | [GitHub](${legalDocUrl('github', 'TERMS', l.code)}) | [Gitee](${legalDocUrl('gitee', 'TERMS', l.code)}) |`,
].join('\n')).join('\n')}

> 💡 如果 GitHub 访问受限，请使用 Gitee 镜像链接。法律文档也随桌面版安装包一同分发。
    `,
    },
    {
        id: 'cloud-sync',
        title: '☁️ 云同步',
        content: `
## 多设备云同步

Author 支持 Firebase、WebDAV 和局域网临时分享三种同步方式，让你在不同设备上无缝切换创作。同步范围采用隐私优先 allowlist。

### 快速开始
1. 点击左下角导航栏的 **☁️ 同步** 图标
2. 使用 **Google 账号** 登录
3. 登录后数据将 **自动同步** 到云端

也可以在 **偏好设置 → 云同步** 中启用 WebDAV，填写坚果云、123 云盘或自建 NAS/Nextcloud 的 WebDAV 地址；局域网同步适合同一 Wi-Fi 下临时迁移数据。

### 同步范围
| 数据类型 | 是否同步 |
|----------|:--------:|
| 章节内容 | ✓ |
| 设定集 | ✓ |
| AI 对话记录 | ✗ (仅本地) |
| 快照历史 | ✗ (仅本地) |
| API 密钥/偏好 | ✗ (仅本地) |

> 注：AI 对话记录、快照、API 配置、token 统计和本地偏好仅保存在当前设备，不参与云同步。

### 账号管理
- 点击右上角 **头像** 可查看当前登录状态
- 支持切换账号、退出登录
- 多个 Google 账号可管理不同项目

### 桌面客户端 vs 自部署
| 特性 | 桌面客户端 | 自部署 (Vercel/源码) |
|------|:---------:|:------------------:|
| Firebase 同步 | ✓ 内置 | 需配置 Firebase |
| WebDAV 同步 | ✓ 可选 | ✓ 可选 |
| 局域网同步 | ✓ 可选 | ✓ 可选 |
| 配置难度 | 无需配置 | 需创建 Firebase 项目 |
| 数据归属 | Firebase 或用户自选 WebDAV | 自建 Firebase 或用户自选 WebDAV |

> 💡 桌面客户端已内置官方云同步服务器，无需额外配置 Firebase，登录即用。

### 冲突处理
同步采用 **最后写入优先** 策略。建议同一时间只在一台设备上编辑，避免覆盖。
    `,
    },
    {
        id: 'embedding',
        title: '🧠 向量化检索',
        content: `
## 向量化检索 (Embedding / RAG)

当你的设定集条目很多（>20 个）时，向量化检索可以让 AI 只获取最相关的设定，避免超出上下文限制。

### 原理
1. 每个设定条目被转换为一个数学向量
2. AI 对话时，将用户输入也向量化
3. 通过 **余弦相似度** 计算，只取出最相关的 Top-K 条设定注入上下文

### 何时启用
| 场景 | 建议 |
|------|------|
| 设定条目 < 20 个 | 无需开启 |
| 设定条目 20~100 个 | 建议开启 |
| 设定条目 > 100 个 | 强烈建议 |

### 配置方法
1. 打开 **设定集** → **API 配置**
2. 启用「独立向量 API」
3. 填写 Embedding API Key、Base URL、模型名称

### 推荐模型
| 供应商 | 模型 | 特点 |
|--------|------|------|
| OpenAI | text-embedding-3-small | 性价比高 |
| OpenAI | text-embedding-3-large | 精度最高 |
| 智谱 AI | embedding-3 | 中文优化 |
| SiliconFlow | BAAI/bge-m3 | 多语言免费 |

### 自动机制
- 设定条目修改后 **自动防抖 3 秒** 触发向量化
- 仅增量更新已修改的条目
- 向量数据存储在本地 IndexedDB

### 手动重建
切换 Embedding 模型后，需在 API 配置中点击 **「重建向量索引」** 按钮。
    `,
    },
];

const HELP_SECTIONS_EN = [
    {
        id: 'quickstart',
        title: '🚀 Quick Start',
        content: `
## Welcome to Author

Author is an **AI-assisted writing platform** for fiction writers. It integrates intelligent continuation, lore management, context awareness, import/export, snapshots, and cloud sync into an immersive writing workspace.

### Step 1: Configure AI
1. Click the **Settings** button at the bottom of the left sidebar.
2. Fill in your AI service information under **API Config**.
3. Author supports **OpenAI-compatible APIs** and **Claude-compatible APIs**.
4. Click **Test Connection** to confirm the configuration.

### Step 2: Start Writing
1. Click **+ New** in the left sidebar to create a chapter.
2. Write directly in the editor.
3. Use the top toolbar to adjust formatting.

### Step 3: Use AI
- **Inline AI**: press **Ctrl+J** at the cursor to continue or edit inside the editor.
- **AI Chat**: click **✦ AI** in the upper-right corner to open the sidebar and discuss plot.
- AI automatically references your lore, previous context, and writing mode.

### Interface Overview
| Area | Function |
|------|----------|
| **Left Sidebar** | Chapter management, word count, token cache hits, export, archive/load, import, lore, cloud sync, theme |
| **Top Toolbar** | Text style, alignment, lists, formulas, layout, auto format |
| **Editor** | WYSIWYG rich-text editing with paged preview |
| **Right AI Sidebar** | AI chat, reference context management, web search |
| **Bottom Status Bar** | Writing mode, page count, total word count |
| **Lower-left Navigation** | Cloud sync status and community/GitHub entry |
| **Upper-right** | Account management, multi-device login, avatar indicator |
        `,
    },
    {
        id: 'ai-inline',
        title: '✦ Inline AI Writing',
        content: `
## Inline AI Writing Assistant

Use AI directly inside the editor, similar to a Cursor-style writing flow.

### How to Open
Press **Ctrl+J** (Mac: **⌘+J**) at the cursor to open the inline AI panel.

### AI Modes

| Mode | Function | Requires Selection |
|------|----------|:--:|
| ✦ Continue | Naturally continue the story from the cursor | ✗ |
| ✎ Polish | Improve quality and fluency | ✓ |
| ⊕ Expand | Add details and description | ✓ |
| ⊖ Condense | Compress to the core meaning | ✓ |

### Steps
1. Place the cursor where you want continuation, or select text to revise.
2. Press **Ctrl+J** to open the AI panel.
3. Choose the mode you need.
4. Optionally add instructions, such as "write a fight scene".
5. Press **Enter** or click **✦ Generate**.
6. AI appears in the editor as **Ghost Text**.
7. Click **✓ Accept** to keep it, or **✕ Reject** to discard it.

Accepted, rejected, or abandoned regenerated AI text is saved to the AI Assistant **Archive** tab. You can later reinsert, copy, or delete archived generations.

### Context Awareness
AI automatically references:
- **Previous text**: collected from earlier context.
- **Lore**: characters, worldbuilding, plot outline, and more.
- **Writing mode**: web novel, literary prose, or screenplay style.

> Tip: Configure characters and worldbuilding in the lore system so AI output fits your story more closely.
        `,
    },
    {
        id: 'ai-chat',
        title: '💬 AI Chat Sidebar',
        content: `
## AI Chat Sidebar

Use multi-turn AI chat to discuss plot, characters, worldbuilding, and even let AI help manage your lore database.

### How to Open
Click the **✦ AI** button in the upper-right corner of the editor, or use the shortcut.

### Core Features

#### Multi-turn Dialogue
- Keeps full conversation history.
- AI replies support **Markdown rendering** including code blocks, tables, and lists.
- Sent messages can be edited and regenerated.

#### Context Reference (Reference Tab)
Switch to the **Reference** tab and check the context you want to inject:
- Characters, worldbuilding, places, items, outline, writing rules.
- Checked entries become background knowledge for AI.

#### Session Management
- **New Session**: start a clean conversation.
- **Switch Session**: move between multiple conversations.
- **Rename/Delete**: right-click to manage sessions.

#### AI-managed Lore
AI can generate **setting action cards** in chat. You can apply them with one click:
- **Add**: AI suggests a new character or setting, then writes it into the lore database.
- **Update**: AI modifies an existing entry, matched by name.
- **Delete**: tell AI to delete an item; it finds the matching entry and proposes an action.
- **Search**: ask what characters/settings exist; AI can see all entries, including disabled ones.
- Click **▼** on the card header to view the full content.

#### Message Variants
- Click **Regenerate** on an AI reply to get another version.
- Use **< 1/3 >** navigation to switch between variants.
- **Immersive fullscreen input**: click the expand icon in the lower-right of the input box to write long prompts comfortably.
- **Send shortcut**: in **Lore -> Preferences -> AI chat send shortcut**, choose Enter to send or Ctrl/⌘+Enter to send. The setting applies to both compact and fullscreen input.
        `,
    },
    {
        id: 'settings',
        title: '⚙️ Lore System',
        content: `
## Lore Management

The lore system is AI's "memory" for your work. It helps AI understand your story world and generate more consistent output.

### How to Open
Click the **Settings** button at the bottom of the sidebar.

### API Config and Model Settings
This is the foundation of the AI assistant. API keys are stored in **local browser storage**.

| Setting | Description |
|--------|-------------|
| **API Provider** | Supports Zhipu, DeepSeek, OpenAI, Gemini, SiliconFlow, Moonshot, and custom providers |
| **API Key** | Your model service credential. Required and stored locally. **Load balancing / key pool**: enter multiple keys separated by English commas, such as \`sk-1,sk-2\`, and Author will randomly rotate requests to avoid rate limits |
| **Base URL** | API endpoint. Switching provider fills the default address automatically |
| **Model Selection** | Click **Fetch model list from API** to refresh available models. Saved models missing from the latest response are marked **Not returned** and can be cleared manually |
| **Independent Vector API** | Enable a dedicated embedding model for precise RAG retrieval in very long works |
| **Advanced Model Params** | Independently override Temperature, Top P, Reasoning Effort, and other advanced parameters |

### Token-level Smart Cache
Author integrates provider prompt caching where supported (currently Anthropic and Gemini). Lore and previous context are automatically included in the cache flow.

Open the **Stats** tab next to the AI chat, or hover over the word-count area, to view **cached hit tokens** in real time. This can reduce cost and speed up responses.

### Preferences
In the last lore panel, you can:
- Switch UI language: Simplified Chinese, English, Russian.
- Switch workspace visual theme: Warm Classic / Modern Glass.
- Set AI chat send shortcut: Enter or Ctrl/⌘+Enter.

### Multi-work Management
- Manage multiple works in one project.
- Each work has an independent lore tree.
- Switch the current work from the left dropdown.
- Deleting a work also deletes all of its setting nodes.

### Book Info
Set title, genre, and synopsis so AI understands the overall direction.

### Lore Tree
Add and manage settings in a tree structure:
- **Rename top-level categories**: in the full lore panel category cards, or in edit mode from the sidebar lore popover, click the pencil to rename a top-level category for the current work only.

| Category | Icon | Fields |
|----------|------|--------|
| **Characters** | User | Type, gender, age, appearance, personality, speaking style, background, motivation, abilities, relationships |
| **Worldbuilding** | Globe | Description, notes |
| **Places / Spaces** | MapPin | Description, scene title, sensory details (visual/audio/smell), atmosphere |
| **Items / Props** | Gem | Description, type, grade, holder, numeric attributes, symbolism |
| **Plot Outline** | ClipboardList | Status (planned/writing/done), description, notes |
| **Writing Rules** | Ruler | Rule description that AI must strictly follow |

### Extra Fields
Non-standard fields generated by AI are placed under **AI-generated extra fields**, where you can view and edit them.

### Lore Import / Export
Supported formats:
- **Export**: JSON, TXT, Markdown, DOCX, PDF
- **Import**: JSON (full data), TXT / MD / DOCX / PDF (intelligent parsing of categories and entries)

#### Import Conflict Resolution
When an imported entry has the same name as an existing one, Author opens a **conflict resolution modal**:
- **Keep Existing**: preserve the current version.
- **Use Imported**: overwrite with the imported version.
- **AI Smart Merge**: AI merges both versions and preserves valuable information.
- AI merge supports **result carousel**: when merging multiple times, use ◀ 1/N ▶ to switch between generated versions.

### Writing Modes
| Mode | Style |
|------|-------|
| 📱 Web Novel | Fast pacing, more dialogue, dense payoff beats |
| 📖 Literary | Delicate narration, richer description, mood and imagery |
| 🎬 Screenplay | Standard screenplay format |
        `,
    },
    {
        id: 'chapters',
        title: '📚 Chapter Management',
        content: `
## Chapter Management

### Create Chapters
Click **+ New Chapter** in the sidebar to create a chapter with an incrementing title, such as "Chapter 1" -> "Chapter 2".

When hovering over a chapter row, click the **+** on the right to insert a blank chapter immediately after it.

### Special Chapters
Use **Special Chapter** in the editor toolbar, or the **S** button on the chapter row, to mark the current chapter as special. Renumbering skips special chapters automatically.

### Switch Chapters
Click a chapter title in the sidebar to load it in the editor.

### Right-click Actions
Right-click a chapter title to:
- **Rename**: edit the chapter title.
- **Export Markdown**: export the current chapter as a .md file.
- **Special Chapter**: toggle whether renumbering ignores this chapter.
- **Delete Chapter**: delete it after confirmation.

### Drag Sort
Hold and drag a chapter title to reorder chapters.

### Word Count
- Each chapter row shows the chapter word count.
- The sidebar footer shows total book word count.

### Paged Preview
The editor uses a Word / Google Docs-like paged layout: white paper cards on a gray canvas, with current page count shown in the bottom status bar.
        `,
    },
    {
        id: 'toolbar',
        title: '🎨 Toolbar',
        content: `
## Toolbar Overview

### Undo / Redo
Undo the latest operation, or restore an undone operation.

### Font and Size
- Font dropdown: Default, Songti, Heiti, Kaiti, Fangsong, Serif, Monospace.
- Size dropdown: 12px to 32px.

### Text Formatting
| Button | Function | Shortcut |
|--------|----------|----------|
| **B** | Bold | Ctrl+B |
| *I* | Italic | Ctrl+I |
| U | Underline | Ctrl+U |
| ~~S~~ | Strikethrough | — |
| X² | Superscript | — |
| X₂ | Subscript | — |
| Remark | Add a side note / comment to selected text | — |

### Colors
- **A▾**: text color picker.
- **Highlight▾**: background highlight picker.

### Remarks / Comments
Select text and click **Remark** in the toolbar or bubble menu to add a page-side note. Remarks do not mix into the body text. During export, choose body-only or annotated output. DOCX annotated export creates native Word / WPS comments.

### Text to Speech and Focus Aids
- The **Read** control in the editor status bar reads the selection first, or the current chapter when nothing is selected. It supports pause, resume, stop, voice selection, and playback speed.
- Use a system voice or configure a compatible cloud TTS service from the voice popover. When playback fails, open and copy the detailed diagnostics.
- Enable **Current Paragraph Highlight** under **Settings → Preferences** to tint the paragraph being edited and retain a thin caret after the editor loses focus.

### Headings and Alignment
- H1/H2/H3: heading levels.
- Align left / center / right / justify.

### Layout Adjustment
Click **Aa▾** to adjust global editor font size (14-24px) and line height (1.4-2.6), or reset to defaults.

### Lists and Blocks
| Button | Function |
|--------|----------|
| Bullets | Unordered list |
| 1. List | Ordered list |
| Task | Task list |
| Quote | Blockquote |
| </> | Code block |
| ∑ | LaTeX formula |
| — | Horizontal rule |

### Auto Format
Click the **magic wand** button on the right side of the toolbar to tidy document format:
- Remove extra leading spaces and full-width spaces.
- Clear empty paragraphs.
- Preserve formatting marks such as bold and italic.
- Undoable with Ctrl+Z.
        `,
    },
    {
        id: 'data',
        title: '💾 Data Management',
        content: `
## Data Management

### Auto Save
Editor content is **auto-saved in real time** to browser localStorage. No manual save is required.

### Left Navigation Buttons
| Icon | Function |
|------|----------|
| Sun / Eye / Moon | Cycle through Light, Eye Comfort, and Dark mode |
| History | **Time Machine**: version history and snapshots |
| Folder | **Load**: restore a full project from JSON |
| Save | **Archive**: export the full project as JSON; API config and AI chat are not included |
| Import | **Import Work**: import chapters from files |
| Export | Export current chapter as TXT / Markdown / DOCX / EPUB / PDF, or open **More Export** for batch selection |
| Cloud | **Cloud Sync** after sign-in |
| More | API config, preferences, help, community |

### Multi-format Import
Supported formats:
- **TXT**
- **Markdown (.md)**
- **EPUB**
- **DOCX**
- **DOC**
- **PDF**

#### Smart Chapter Merge
When importing into an existing work, Author compares chapter numbers intelligently:
- Recognizes multiple numbering styles as the same chapter.
- **No conflict**: merge and sort by number automatically.
- **Conflict**: show a conflict modal where you choose which chapters to keep.
- Importing into an empty work imports directly.

### Multi-format Export
From the export menu:
- **Export current chapter** as TXT / Markdown / DOCX / EPUB / PDF.
- **More Export** opens a modal where you freely select chapters and formats.

The More Export modal supports batch selection by group. Content can be exported as **Body** or **Annotated**. Body removes remarks; annotated output preserves them, and DOCX uses native Word comments.

### Desktop Client (Electron)
On the Windows desktop client:
- Built-in official cloud sync server; no manual Firebase setup.
- One-click update check and automatic installation.
- Data is stored in the system user directory, not affected by browser cleanup.
- Debug log: \`%APPDATA%\\author-app\\author-debug.log\`

### Diagnostic Logs
If the app white-screens, freezes, or crashes:
- Open **Help -> About -> Export Diagnostic Logs** to download \`author-diagnostic-*.json\`.
- Desktop client can open the local log folder from **Help -> About -> Open Log Folder**.
- The white-screen/crash page also includes **Export Diagnostic Logs**.
- Main desktop log: \`%APPDATA%\\author-app\\author-debug.log\`
- If the desktop app crashed and exited, crash reports are written to \`%APPDATA%\\author-app\\crash-reports\\author-crash-*.json\`.
- Browser / source / Vercel deployments do not have a desktop log directory, but can still export the current browser diagnostic report.
- Logs include recent errors, warnings, clicks/drags, top overlays, long tasks, and desktop main-process clues.
- API keys, tokens, Authorization headers, public IPs, and similar sensitive fields are automatically redacted.

### Important Notes
- Creative content is stored **locally in your browser** unless cloud sync is enabled.
- **Clearing browser data** deletes unexported content. Desktop client data is not affected in the same way.
- **API keys** are stored in localStorage.
- Regularly archive your work, or enable **Cloud Sync** for chapters and lore.

### AI Privacy Notice
When using AI features such as continuation, rewriting, and chat, your **API key** and **text sent to AI** pass through the deployment server before being forwarded to the AI provider.

If you are using someone else's public deployment:
- Try features briefly if needed.
- Destroy your key on the provider website after testing.
- For serious use, fork and deploy your own private instance.
        `,
    },
    {
        id: 'markdown',
        title: '📝 Markdown',
        content: `
## Markdown Auto-rendering

Markdown syntax typed in the editor is **automatically converted** into rich text.

### Supported Syntax
| Input | Result |
|------|--------|
| \`**bold**\` | **bold** |
| \`*italic*\` | *italic* |
| \`~~strike~~\` | ~~strike~~ |
| \`# Heading\` | H1 |
| \`## Heading\` | H2 |
| \`### Heading\` | H3 |
| \`- List\` | Unordered list |
| \`1. List\` | Ordered list |
| \`> Quote\` | Blockquote |
| \`---\` | Divider |

### Markdown in AI Chat
AI replies in the sidebar support full Markdown rendering, including code blocks, tables, links, and more.
        `,
    },
    {
        id: 'shortcuts',
        title: '⌨️ Shortcuts',
        content: `
## Keyboard Shortcuts

### Editing
| Shortcut | Function |
|----------|----------|
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+A | Select all |

### Formatting
| Shortcut | Function |
|----------|----------|
| Ctrl+B | Bold |
| Ctrl+I | Italic |
| Ctrl+U | Underline |

### AI
| Shortcut | Function |
|----------|----------|
| Ctrl+J | Open / close inline AI panel |
| Enter | Start AI generation |
| Esc | Close AI panel / cancel generation |

### Markdown Quick Input
| Input | Trigger |
|------|---------|
| \`# \` + Space | H1 |
| \`## \` + Space | H2 |
| \`- \` + Space | Unordered list |
| \`1. \` + Space | Ordered list |
| \`> \` + Space | Quote |
| \`---\` + Enter | Divider |

### Slash Commands
Type \`/\` in the editor to open the command menu:
| Command | Function |
|---------|----------|
| /h1, /h2, /h3 | Insert headings |
| /bullet | Unordered list |
| /ordered | Ordered list |
| /todo | Task list |
| /quote | Quote block |
| /code | Code block |
| /hr | Horizontal rule |
| /math | LaTeX formula |
        `,
    },
    {
        id: 'theme',
        title: '🎭 Theme & Layout',
        content: `
## Theme and Typography Preferences

### Two Flagship Theme Engines
Author currently provides two polished theme families, switchable in **Preferences**:
- **Warm Classic**: an eye-friendly warm-gray paper tone with tangible diary-like cards.
- **Modern Glass**: macOS-inspired white/cool-gray base with translucent glass layers.

You can always click the theme button in the lower-right sidebar to cycle through Light, Eye Comfort, and Dark modes.

### Typography Engine
Click **Aa▾** in the toolbar:
- **Font size**: 14px - 24px, default 17px.
- **Line height**: 1.4 - 2.6, default 1.9.
- **Reset default**: restore typography parameters.

### Font Selection
| Font | Best For |
|------|----------|
| Default | Follow the default body font in Preferences |
| Songti | Body writing |
| Heiti | Headings |
| Kaiti | Classical style |
| Fangsong | Formal document style |
| Serif | English serif text |
| Monospace | Fixed-width text |

To change the default font for the whole body, use **Preferences -> Default body font**. The toolbar font dropdown only applies explicit font styling to the current selection or following input.

### Layout Suggestions
These settings affect editor reading comfort only. They do not change body text, word count, or exported chapter structure.

| Scenario | Recommended Setting | Notes |
|----------|---------------------|-------|
| Long daily writing | 17px, line height 1.9 | Balanced default for long sessions |
| Dense proofreading | 15-16px, line height 1.6-1.8 | More text on screen for checking |
| Immersive reading / large screen | 18-20px, line height 2.0-2.2 | More breathing room for rereading and polishing |
        `,
    },
    {
        id: 'about',
        title: 'ℹ️ About',
        content: `
## About Author

**Author** is an AI-driven fiction writing tool designed to provide a professional and efficient writing experience for web novel authors and literary creators.

### Core Features
- **AI writing**: inline continuation plus chat discussion.
- **Context awareness**: AI references characters, worldbuilding, and previous text.
- **Lore management**: tree-structured characters, worldbuilding, outline, and writing rules.
- **Ghost Text engine**: Cursor-like preview with accept/reject actions.
- **Paged view**: Word / Google Docs-like white paper layout.
- **Dark mode**: eye-friendly dark theme.
- **Local-first**: data is stored locally for privacy.
- **Cloud sync**: optional multi-device sync after sign-in.
- **Vector retrieval (RAG)**: intelligent retrieval for large lore databases.
- **Web search**: AI chat can fetch real-time information.
- **Auto format**: clean spaces and empty paragraphs.
- **Archive / load**: import/export full projects.
- **Mobile**: native Android app with Google-login cloud sync.
- **Desktop**: Windows installer with built-in official cloud sync server.

### Data Safety
- Creative content is stored locally in your browser.
- API keys are stored in your local browser.
- All data can be exported with one click.

### Privacy Notice
When using AI, API keys and text content pass through the **deployment server** and are forwarded to the AI provider. If using someone else's deployment, destroy your key after testing and deploy your own instance for serious use.

### Tech Stack
Next.js + Tiptap editor + AI APIs (OpenAI-compatible / Gemini)

### Acknowledgements and References

#### AI Partners
- [ChatGPT 5.5](https://openai.com/chatgpt/) (xhigh): main reasoning and coding model.
- [Claude Opus 4.6](https://www.anthropic.com/) (Thinking): architecture, implementation, and debugging.
- [Gemini 3.1 Pro](https://deepmind.google/technologies/gemini/) (High): UI review, screenshot analysis, design iteration.
- [Gemini 3 Flash](https://deepmind.google/technologies/gemini/): built-in browser automation tools.

#### AI Coding IDEs
- [Antigravity](https://antigravity.google/): AI coding partner.
- [Codex](https://openai.com/codex/): main AI coding tool.

#### MCP Tools
- [Chrome DevTools MCP](https://developer.chrome.com/): browser testing, performance analysis, DOM inspection.
- [Firebase MCP](https://firebase.google.com/): cloud database management and security-rule validation.
- [GitHub MCP](https://github.com/): repository management and automated releases.

#### Inspiration
Author's multi-provider API configuration experience references product ideas from open-source AI clients such as RikkaHub and Cherry Studio around providers, models, Base URL, and local key management.

- Cherry Studio: [github.com/CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio)
- RikkaHub: [github.com/rikkahub/rikkahub](https://github.com/rikkahub/rikkahub)
- This project does not include source code, assets, or binaries from RikkaHub or Cherry Studio. Any future direct code use should comply with their current licenses or obtain authorization.

### Open Source
Author is open source under **AGPL-3.0**.

GitHub: [github.com/YuanShiJiLoong/author](${REPO.github})

Stars, issues, and contributions are welcome.

### Legal Documents
By using Author, you agree to the privacy policy and terms of service:

| Document | GitHub | Gitee Mirror |
|----------|--------|--------------|
${LEGAL_LANGUAGES.map(l => [
`| ${l.privacy} ${l.label.split(' ')[0]} | [GitHub](${legalDocUrl('github', 'PRIVACY', l.code)}) | [Gitee](${legalDocUrl('gitee', 'PRIVACY', l.code)}) |`,
`| ${l.terms} ${l.label.split(' ')[0]} | [GitHub](${legalDocUrl('github', 'TERMS', l.code)}) | [Gitee](${legalDocUrl('gitee', 'TERMS', l.code)}) |`,
].join('\n')).join('\n')}

> If GitHub is inaccessible, use the Gitee mirror. Legal documents are also distributed with the desktop installer.
        `,
    },
    {
        id: 'cloud-sync',
        title: '☁️ Cloud Sync',
        content: `
## Multi-device Cloud Sync

Author supports Firebase, WebDAV, and temporary LAN sharing so you can switch between devices. Sync uses a privacy-first allowlist.

### Quick Start
1. Click the **Cloud Sync** icon in the lower-left navigation.
2. Sign in with a **Google account**.
3. After login, data syncs to the cloud automatically.

You can also enable WebDAV in **Preferences -> Cloud Sync** and fill in a WebDAV address from Jianguoyun, 123 cloud drive, NAS, or Nextcloud. LAN sync is suitable for temporary migration on the same Wi-Fi.

### Sync Scope
| Data Type | Synced |
|-----------|:--:|
| Chapters | ✓ |
| Lore | ✓ |
| AI chat history | ✗ local only |
| Snapshot history | ✗ local only |
| API keys / preferences | ✗ local only |

AI chats, snapshots, API config, token stats, and local preferences stay on the current device and are not included in cloud sync.

### Account Management
- Click the **avatar** in the upper-right corner to view login status.
- Supports account switching and logout.
- Multiple Google accounts can manage different projects.

### Desktop Client vs Self-hosted
| Feature | Desktop Client | Self-hosted (Vercel / source) |
|---------|:--:|:--:|
| Firebase sync | Built in | Requires Firebase setup |
| WebDAV sync | Optional | Optional |
| LAN sync | Optional | Optional |
| Setup difficulty | No setup | Create Firebase project |
| Data ownership | Firebase or your WebDAV | Your Firebase or WebDAV |

The desktop client includes the official cloud sync server. No extra Firebase setup is needed.

### Conflict Handling
Sync uses a **last write wins** strategy. Edit on one device at a time when possible to avoid overwriting.
        `,
    },
    {
        id: 'embedding',
        title: '🧠 Vector Retrieval',
        content: `
## Vector Retrieval (Embedding / RAG)

When you have many lore entries (more than 20), vector retrieval lets AI receive only the most relevant settings and avoids exceeding context limits.

### How It Works
1. Each lore entry is converted into a mathematical vector.
2. During AI chat, the user input is also embedded.
3. Author uses **cosine similarity** to retrieve the most relevant Top-K entries and inject them into context.

### When to Enable
| Scenario | Recommendation |
|----------|----------------|
| Fewer than 20 entries | Not needed |
| 20-100 entries | Recommended |
| More than 100 entries | Strongly recommended |

### Configuration
1. Open **Lore -> API Config**.
2. Enable **Independent Vector API**.
3. Fill in Embedding API Key, Base URL, and model name.

### Recommended Models
| Provider | Model | Notes |
|----------|-------|-------|
| OpenAI | text-embedding-3-small | Cost-effective |
| OpenAI | text-embedding-3-large | Highest accuracy |
| Zhipu AI | embedding-3 | Optimized for Chinese |
| SiliconFlow | BAAI/bge-m3 | Multilingual and free tier |

### Automatic Mechanism
- After a setting entry changes, embedding starts automatically after a 3-second debounce.
- Only changed entries are updated incrementally.
- Vector data is stored locally in IndexedDB.

### Manual Rebuild
After changing the embedding model, click **Rebuild Vector Index** in API Config.
        `,
    },
];

const HELP_SECTIONS_RU = [
    {
        id: 'quickstart',
        title: '🚀 Быстрый старт',
        content: `
## Добро пожаловать в Author

Author — **платформа письма с ИИ** для авторов прозы. Она объединяет умное продолжение, управление лором, контекстный ИИ, импорт/экспорт, снимки и облачную синхронизацию.

### Шаг 1: настройте ИИ
1. Нажмите **Настройки** внизу левой панели.
2. В разделе **API** заполните данные сервиса ИИ.
3. Поддерживаются **OpenAI-совместимые API** и **Claude-совместимые API**.
4. Нажмите **Проверить соединение**.

### Шаг 2: начните писать
1. Нажмите **+ Новая** в левой панели, чтобы создать главу.
2. Пишите прямо в редакторе.
3. Используйте верхнюю панель для форматирования.

### Шаг 3: помощь ИИ
- **Встроенный ИИ**: **Ctrl+J** у курсора.
- **AI Assistant**: кнопка **✦ AI** справа сверху для обсуждения сюжета.
- ИИ автоматически учитывает лор, предыдущий контекст и режим письма.

### Обзор интерфейса
| Область | Функция |
|--------|---------|
| **Левая панель** | Главы, статистика слов, token cache, экспорт, архив/загрузка, импорт, лор, синхронизация, тема |
| **Верхняя панель** | Формат текста, выравнивание, списки, формулы, макет, автоформат |
| **Редактор** | WYSIWYG-редактор с постраничным предпросмотром |
| **Правая панель ИИ** | Чат, управление справочным контекстом, веб-поиск |
| **Нижняя строка** | Режим письма, страницы, общий счетчик слов |
| **Нижняя левая навигация** | Статус синхронизации, сообщество/GitHub |
| **Верхний правый угол** | Аккаунт, вход на нескольких устройствах, аватар |
        `,
    },
    {
        id: 'ai-inline',
        title: '✦ Встроенный ИИ',
        content: `
## Встроенный ИИ для письма

Используйте ИИ прямо в редакторе, в стиле Cursor.

### Открытие
Нажмите **Ctrl+J** (Mac: **⌘+J**) у курсора.

### Режимы
| Режим | Функция | Нужно выделение |
|------|---------|:--:|
| ✦ Продолжить | Естественно продолжает текст от курсора | ✗ |
| ✎ Полировка | Улучшает качество и плавность текста | ✓ |
| ⊕ Расширить | Добавляет детали и описание | ✓ |
| ⊖ Сжать | Сокращает до сути | ✓ |

### Шаги
1. Поставьте курсор в место продолжения или выделите текст.
2. Нажмите **Ctrl+J**.
3. Выберите режим.
4. При необходимости добавьте инструкцию, например "напиши сцену боя".
5. Нажмите **Enter** или **✦ Сгенерировать**.
6. ИИ появится в редакторе как **Ghost Text**.
7. Нажмите **✓ Принять** или **✕ Отклонить**.

Принятый, отклоненный или брошенный при регенерации текст попадает во вкладку **Архив** AI Assistant. Его можно вставить снова, скопировать или удалить.

### Контекст
ИИ автоматически учитывает:
- **Предыдущий текст**.
- **Лор**: персонажи, мир, план и т.д.
- **Режим письма**: веб-роман, литературная проза, сценарий.
        `,
    },
    {
        id: 'ai-chat',
        title: '💬 AI Assistant',
        content: `
## Боковая панель AI Assistant

Многоходовой чат для обсуждения сюжета, персонажей, мира и управления базой лора.

### Открытие
Нажмите **✦ AI** в правом верхнем углу редактора.

### Основные возможности
#### Диалог
- Полная история диалога.
- Ответы ИИ рендерятся как **Markdown**: код, таблицы, списки.
- Отправленные сообщения можно редактировать и генерировать заново.

#### Reference
Во вкладке **Reference** выберите, какой контекст отправлять ИИ:
- Персонажи, мир, места, предметы, план, правила письма.
- Отмеченные элементы становятся фоновыми знаниями ИИ.

#### Сессии
- **Новая сессия**: чистый диалог.
- **Переключение**: несколько параллельных диалогов.
- **Переименовать/удалить**: управление через правый клик.

#### Управление лором через ИИ
ИИ может создавать **карточки действий**:
- **Добавить**: новый персонаж/элемент.
- **Обновить**: изменить существующий элемент по имени.
- **Удалить**: найти и предложить удаление.
- **Поиск**: ИИ знает все элементы, включая отключенные.
- Нажмите **▼**, чтобы открыть полное содержимое карточки.

#### Варианты сообщений
- **Regenerate** создает другой вариант ответа.
- Навигация **< 1/3 >** переключает варианты.
- Полноэкранный ввод удобен для длинных prompt.
- Горячую клавишу отправки можно выбрать в **Лор -> Предпочтения**.
        `,
    },
    {
        id: 'settings',
        title: '⚙️ Система лора',
        content: `
## Управление лором

Лор — это "память" ИИ о произведении. Он помогает ИИ понимать мир и писать согласованнее.

### API и модели
| Параметр | Описание |
|---------|----------|
| **Провайдер API** | Zhipu, DeepSeek, OpenAI, Gemini, SiliconFlow, Moonshot и пользовательские провайдеры |
| **API Key** | Ключ сервиса. Хранится локально. Можно ввести несколько ключей через запятую, например \`sk-1,sk-2\`, для ротации |
| **Base URL** | Адрес API; при смене провайдера заполняется автоматически |
| **Модель** | Список моделей можно подтянуть из API; сохраненные, но не вернувшиеся модели помечаются отдельно |
| **Отдельный Vector API** | Embedding-модель для RAG-поиска в больших произведениях |
| **Расширенные параметры** | Temperature, Top P, Reasoning Effort и другие настройки |

### Token cache
Author использует prompt caching там, где провайдер поддерживает это (Anthropic и Gemini). Лор и предыдущий контекст автоматически включаются в механизм кэша. Во вкладке **Stats** можно видеть cached hit tokens.

### Предпочтения
- Язык интерфейса: 中文 / English / Русский.
- Тема: Warm Classic / Modern Glass.
- Горячая клавиша отправки в AI-чате.

### Несколько произведений
- У каждого произведения отдельное дерево лора.
- Переключение через левый список.
- Удаление произведения удаляет его узлы.

### Дерево лора
| Категория | Поля |
|----------|------|
| **Персонажи** | Тип, пол, возраст, внешность, характер, речь, биография, мотивация, способности, отношения |
| **Мир** | Описание, заметки |
| **Места** | Описание, сенсорные детали, атмосфера |
| **Предметы / реквизит** | Описание, тип, ранг, владелец, свойства, символика |
| **План** | Статус, описание, заметки |
| **Правила письма** | Правила, которые ИИ должен строго соблюдать |

Верхние категории можно переименовать для текущего произведения. Нестандартные поля ИИ попадают в группу **AI-generated extra fields**.

### Импорт / экспорт лора
- **Экспорт**: JSON, TXT, Markdown, DOCX, PDF.
- **Импорт**: JSON, TXT / MD / DOCX / PDF с умным разбором категорий.

При конфликте имен можно сохранить текущую версию, использовать импортированную или выполнить **AI smart merge** с каруселью результатов.

### Режимы письма
| Режим | Особенности |
|------|-------------|
| 📱 Web Novel | Быстрый темп, больше диалогов, плотные payoff-сцены |
| 📖 Literary | Тонкое повествование, богатое описание, атмосфера |
| 🎬 Screenplay | Формат сценария |
        `,
    },
    {
        id: 'chapters',
        title: '📚 Главы',
        content: `
## Управление главами

### Создание
Кнопка **+ Новая глава** создает главу с возрастающим номером. При наведении на строку главы кнопка **+** справа вставляет пустую главу после нее.

### Особые главы
Кнопка **Special Chapter** в панели редактора или **S** в строке главы отмечает главу как особую. При перенумерации такие главы пропускаются.

### Переключение и действия
Нажмите название главы для открытия. Правый клик позволяет переименовать, экспортировать Markdown, переключить особую главу или удалить.

### Сортировка и статистика
Главы можно перетаскивать. У каждой главы показывается счетчик слов, а внизу панели — общий счетчик книги.

### Постраничный предпросмотр
Редактор показывает страницы в стиле Word / Google Docs: белые листы на сером фоне и номер текущей страницы внизу.
        `,
    },
    {
        id: 'toolbar',
        title: '🎨 Панель инструментов',
        content: `
## Панель инструментов

### Отмена / повтор
Отменяет последнее действие или возвращает отмененное.

### Шрифт и размер
Доступны Default, Songti, Heiti, Kaiti, Fangsong, Serif, Monospace и размеры 12-32px.

### Форматирование
| Кнопка | Функция | Горячая клавиша |
|-------|---------|-----------------|
| **B** | Жирный | Ctrl+B |
| *I* | Курсив | Ctrl+I |
| U | Подчеркивание | Ctrl+U |
| ~~S~~ | Зачеркивание | — |
| X² / X₂ | Верхний / нижний индекс | — |
| Remark | Комментарий к выделению | — |

### Цвета, заголовки и блоки
Есть цвет текста, подсветка, H1/H2/H3, выравнивание, списки, задачи, цитаты, код, LaTeX и разделитель.

### Комментарии
Комментарии не смешиваются с основным текстом. При экспорте можно выбрать body-only или annotated; DOCX annotated создает нативные комментарии Word/WPS.

### Озвучивание и фокус
- Кнопка **Читать** в строке состояния сначала озвучивает выделенный текст, а если выделения нет — текущую главу. Доступны пауза, продолжение, остановка, выбор голоса и скорости.
- Можно использовать системный голос или настроить совместимый облачный TTS во всплывающем окне. При ошибке доступны подробности, которые можно скопировать.
- Включите **Подсветку текущего абзаца** в **Настройки → Предпочтения**, чтобы отметить редактируемый абзац и сохранить тонкий курсор после потери фокуса.

### Aa и автоформат
**Aa▾** меняет общий размер и межстрочный интервал. **Magic wand** очищает лишние пробелы и пустые абзацы, сохраняя форматирование; действие можно отменить.
        `,
    },
    {
        id: 'data',
        title: '💾 Данные',
        content: `
## Управление данными

### Автосохранение
Текст сохраняется автоматически в localStorage.

### Импорт и экспорт
Импорт поддерживает TXT, Markdown, EPUB, DOCX, DOC и PDF. При импорте в существующее произведение Author распознает номера глав, объединяет без конфликтов и показывает окно выбора при конфликтах.

Экспорт текущей главы доступен в TXT / Markdown / DOCX / EPUB / PDF. **More Export** позволяет выбрать несколько глав, формат и вариант: body или annotated.

### Desktop Client
В Windows-клиенте есть встроенный официальный сервер синхронизации, автообновление, хранение данных вне браузера и лог \`%APPDATA%\\author-app\\author-debug.log\`.

### Диагностика
При белом экране, зависании или crash:
- **Help -> About -> Export Diagnostic Logs** скачивает \`author-diagnostic-*.json\`.
- Desktop может открыть папку логов.
- Crash reports пишутся в \`%APPDATA%\\author-app\\crash-reports\`.
- API keys, tokens, Authorization, публичные IP и похожие поля автоматически маскируются.

### Важно
- Данные хранятся локально, если синхронизация не включена.
- Очистка браузера может удалить неэкспортированную работу.
- Регулярно архивируйте проект или включите Cloud Sync.

### Приватность ИИ
При использовании ИИ API Key и текст проходят через сервер развертывания и отправляются провайдеру. На чужих публичных инстансах тестируйте осторожно и затем уничтожайте ключ.
        `,
    },
    {
        id: 'markdown',
        title: '📝 Markdown',
        content: `
## Автоматический Markdown

Markdown в редакторе автоматически превращается в rich text.

| Ввод | Результат |
|-----|-----------|
| \`**bold**\` | жирный |
| \`*italic*\` | курсив |
| \`~~strike~~\` | зачеркивание |
| \`# Heading\` | H1 |
| \`## Heading\` | H2 |
| \`- List\` | список |
| \`> Quote\` | цитата |
| \`---\` | разделитель |

Ответы ИИ в чате также поддерживают Markdown: код, таблицы, ссылки и списки.
        `,
    },
    {
        id: 'shortcuts',
        title: '⌨️ Горячие клавиши',
        content: `
## Горячие клавиши

### Редактирование
| Клавиша | Функция |
|--------|---------|
| Ctrl+Z | Отмена |
| Ctrl+Y | Повтор |
| Ctrl+A | Выделить все |

### Формат
| Клавиша | Функция |
|--------|---------|
| Ctrl+B | Жирный |
| Ctrl+I | Курсив |
| Ctrl+U | Подчеркивание |

### ИИ
| Клавиша | Функция |
|--------|---------|
| Ctrl+J | Открыть/закрыть встроенный ИИ |
| Enter | Начать генерацию |
| Esc | Закрыть панель / отменить |

### Slash Commands
Введите \`/\` для меню команд: /h1, /h2, /h3, /bullet, /ordered, /todo, /quote, /code, /hr, /math.
        `,
    },
    {
        id: 'theme',
        title: '🎭 Тема и макет',
        content: `
## Темы и типографика

### Две темы
- **Warm Classic**: теплый бумажный стиль, комфортный для глаз.
- **Modern Glass**: macOS-подобная светлая стеклянная архитектура.

Кнопка темы в боковой панели переключает Light, Eye Comfort и Dark.

### Типографика
**Aa▾** меняет размер 14-24px и межстрочный интервал 1.4-2.6, с быстрым сбросом.

### Шрифты
Default следует настройке body font. Панель шрифтов применяет явный шрифт к выделению или дальнейшему вводу.

| Сценарий | Рекомендация |
|---------|--------------|
| Долгая ежедневная работа | 17px, line height 1.9 |
| Плотная корректура | 15-16px, line height 1.6-1.8 |
| Иммерсивное чтение | 18-20px, line height 2.0-2.2 |
        `,
    },
    {
        id: 'about',
        title: 'ℹ️ О программе',
        content: `
## Об Author

**Author** — инструмент для прозы с ИИ, рассчитанный на web novel и литературных авторов.

### Основное
- ИИ-письмо: inline continuation + chat.
- Контекст: персонажи, мир, предыдущий текст.
- Дерево лора.
- Ghost Text с accept/reject.
- Постраничный вид.
- Темная тема.
- Local-first хранение.
- Облачная синхронизация.
- RAG-поиск по лору.
- Веб-поиск.
- Автоформат.
- Архив/загрузка.
- Android и Windows-клиент.

### Безопасность
Контент и API Key хранятся локально. Все данные можно экспортировать.

### Приватность
ИИ-запросы проходят через сервер развертывания к провайдеру. Для серьезного использования лучше собственное развертывание.

### Стек
Next.js + Tiptap + AI API (OpenAI-compatible / Gemini)

### Open Source
Author открыт по **AGPL-3.0**.

GitHub: [github.com/YuanShiJiLoong/author](${REPO.github})

### Юридические документы
| Документ | GitHub | Gitee |
|----------|--------|-------|
${LEGAL_LANGUAGES.map(l => [
`| ${l.privacy} ${l.label.split(' ')[0]} | [GitHub](${legalDocUrl('github', 'PRIVACY', l.code)}) | [Gitee](${legalDocUrl('gitee', 'PRIVACY', l.code)}) |`,
`| ${l.terms} ${l.label.split(' ')[0]} | [GitHub](${legalDocUrl('github', 'TERMS', l.code)}) | [Gitee](${legalDocUrl('gitee', 'TERMS', l.code)}) |`,
].join('\n')).join('\n')}
        `,
    },
    {
        id: 'cloud-sync',
        title: '☁️ Облачная синхронизация',
        content: `
## Синхронизация между устройствами

Author поддерживает Firebase, WebDAV и временный LAN-share. Синхронизация использует privacy-first allowlist.

### Быстрый старт
1. Нажмите **Cloud Sync** в нижней левой навигации.
2. Войдите через **Google account**.
3. После входа данные синхронизируются автоматически.

WebDAV включается в **Preferences -> Cloud Sync**. LAN подходит для временной миграции в одной Wi-Fi сети.

### Что синхронизируется
| Данные | Sync |
|-------|:--:|
| Главы | ✓ |
| Лор | ✓ |
| История AI-чата | ✗ локально |
| Снимки | ✗ локально |
| API keys / preferences | ✗ локально |

### Desktop vs Self-hosted
| Функция | Desktop | Self-hosted |
|--------|:--:|:--:|
| Firebase | встроено | нужна настройка |
| WebDAV | опционально | опционально |
| LAN | опционально | опционально |

Конфликты решаются стратегией **last write wins**. Лучше редактировать одновременно только на одном устройстве.
        `,
    },
    {
        id: 'embedding',
        title: '🧠 Векторный поиск',
        content: `
## Embedding / RAG

Когда элементов лора больше 20, векторный поиск отправляет ИИ только самые релевантные записи и экономит контекст.

### Как работает
1. Каждый элемент лора превращается в вектор.
2. Пользовательский запрос тоже превращается в вектор.
3. По **cosine similarity** выбираются Top-K записи.

### Когда включать
| Ситуация | Совет |
|---------|-------|
| < 20 элементов | не нужно |
| 20-100 | рекомендуется |
| > 100 | настоятельно рекомендуется |

### Настройка
Откройте **Lore -> API Config**, включите **Independent Vector API**, заполните API Key, Base URL и модель.

### Модели
| Провайдер | Модель | Особенность |
|----------|--------|-------------|
| OpenAI | text-embedding-3-small | выгодно |
| OpenAI | text-embedding-3-large | точнее |
| Zhipu AI | embedding-3 | китайский язык |
| SiliconFlow | BAAI/bge-m3 | мультиязычно |

После смены embedding-модели нажмите **Rebuild Vector Index**.
        `,
    },
];

export default function HelpPanel({ open, onClose }) {
    const [activeSection, setActiveSection] = useState('quickstart');
    const { t, text, language } = useI18n();
    const [updateChecking, setUpdateChecking] = useState(false);
    const [updateResult, setUpdateResult] = useState(null); // { status: 'latest'|'available'|'error', current, latest, isSourceDeploy }
    const [updating, setUpdating] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(null); // { progress, downloaded, total }
    const [updateDone, setUpdateDone] = useState(null); // { success, message, logs }
    const [sourceProgress, setSourceProgress] = useState(null); // { step, total, label, status }
    const [exportingLogs, setExportingLogs] = useState(false);
    const [currentAppVersion, setCurrentAppVersion] = useState('');

    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

    useEffect(() => {
        if (!open || typeof window === 'undefined') return;
        let cancelled = false;
        const loadCurrentVersion = async () => {
            try {
                if (window.electronAPI?.getAppVersion) {
                    const version = await window.electronAPI.getAppVersion();
                    if (!cancelled) setCurrentAppVersion(version || '');
                    return;
                }

                const res = await fetch('/api/app-version', { cache: 'no-store' });
                if (!res.ok) throw new Error('version api failed');
                const data = await res.json();
                if (!cancelled) {
                    setCurrentAppVersion(data.version || '');
                }
            } catch {
                if (!cancelled) setCurrentAppVersion('');
            }
        };
        loadCurrentVersion();
        return () => { cancelled = true; };
    }, [open, isElectron]);

    // 监听 Electron 下载进度
    useEffect(() => {
        if (isElectron && window.electronAPI?.onUpdateProgress) {
            window.electronAPI.onUpdateProgress((data) => {
                setDownloadProgress(data);
            });
        }
    }, [isElectron]);

    const checkForUpdates = async () => {
        setUpdateChecking(true);
        setUpdateResult(null);
        setUpdateDone(null);
        try {
            const res = await fetch('/api/check-update', { cache: 'no-store' });
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            if (data.hasUpdate && data.latest) {
                setUpdateResult({ status: 'available', current: data.current, latest: data.latest, isSourceDeploy: data.isSourceDeploy });
            } else {
                setUpdateResult({ status: 'latest', current: data.current, latest: data.latest || data.current });
            }
        } catch {
            setUpdateResult({ status: 'error' });
        } finally {
            setUpdateChecking(false);
        }
    };

    // Electron 客户端：自动下载安装
    const handleElectronUpdate = async () => {
        setUpdating(true);
        setUpdateDone(null);
        setDownloadProgress({ progress: 0, downloaded: 0, total: 0 });
        try {
            const result = await window.electronAPI.downloadAndInstallUpdate();
            if (!result.success) {
                setUpdateDone({ success: false, message: t('update.updateFailed') + ': ' + (result.error || '') });
                setDownloadProgress(null);
            }
        } catch (err) {
            setUpdateDone({ success: false, message: t('update.updateFailed') + ': ' + err.message });
            setDownloadProgress(null);
        } finally {
            setUpdating(false);
        }
    };

    // 源码部署：SSE 流式更新
    const handleSourceUpdate = async () => {
        setUpdating(true);
        setUpdateDone(null);
        setSourceProgress(null);
        try {
            const res = await fetch('/api/update-source-stream', { method: 'POST' });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const block of lines) {
                    const dataLine = block.split('\n').find(l => l.startsWith('data: '));
                    if (!dataLine) continue;
                    const data = JSON.parse(dataLine.slice(6));

                    if (data.done) {
                        if (data.success) {
                            if (data.needRestart) {
                                const ver = data.diskVersion ? ` v${data.diskVersion}` : '';
                                setUpdateDone({ success: true, message: text(`代码已更新到${ver}，请重启服务生效`, `Code updated to${ver}. Restart the service to apply it.`, `Код обновлен до${ver}. Перезапустите сервис, чтобы применить изменения.`), needRestart: true });
                            } else if (data.alreadyUpToDate) {
                                setUpdateDone({ success: true, message: t('update.alreadyLatest') });
                            } else {
                                setUpdateDone({ success: true, message: t('update.updateSuccess') });
                            }
                        } else {
                            setUpdateDone({ success: false, message: t('update.updateFailed') + ': ' + (localizeApiError(data, text) || '') });
                        }
                        setSourceProgress(null);
                    } else {
                        setSourceProgress(data);
                    }
                }
            }
        } catch (err) {
            setUpdateDone({ success: false, message: t('update.updateFailed') + ': ' + err.message });
            setSourceProgress(null);
        } finally {
            setUpdating(false);
        }
    };

    const handleUpdate = () => {
        if (isElectron) {
            handleElectronUpdate();
        } else if (updateResult?.isSourceDeploy) {
            handleSourceUpdate();
        }
    };

    const handleExportDiagnostics = async () => {
        setExportingLogs(true);
        try {
            recordDiagnosticEvent('diagnostics.export.requested', 'User requested diagnostic export from help panel', { section: activeSection }, 'info');
            await downloadDiagnosticReport({ source: 'help-panel', section: activeSection });
        } finally {
            setExportingLogs(false);
        }
    };

    const handleOpenDiagnosticsLocation = async () => {
        if (!window.electronAPI?.openDiagnosticLogFile) return;
        recordDiagnosticEvent('diagnostics.location.opened', 'User opened desktop diagnostic log location from help panel', { section: activeSection }, 'info');
        const result = await window.electronAPI.openDiagnosticLogFile();
        if (!result?.success) {
            alert(text(`打开日志目录失败：${result?.error || '未知错误'}`, `Failed to open log folder: ${result?.error || 'Unknown error'}`, `Не удалось открыть папку логов: ${result?.error || 'Неизвестная ошибка'}`));
        }
    };

    const canAutoUpdate = isElectron || updateResult?.isSourceDeploy;

    if (!open) return null;

    const helpSections = language === 'en' ? HELP_SECTIONS_EN : language === 'ru' ? HELP_SECTIONS_RU : HELP_SECTIONS;
    const currentSection = helpSections.find(s => s.id === activeSection) || helpSections[0];

    return (
        <div className="help-overlay" onMouseDown={e => { e.currentTarget._mouseDownTarget = e.target; }} onClick={e => { if (e.currentTarget._mouseDownTarget === e.currentTarget) onClose(); }}>
            <div className="help-panel" onClick={e => e.stopPropagation()}>
                {/* 顶栏 */}
                <div className="help-header">
                    <h2>{t('help.title')}</h2>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            className="tour-btn ghost"
                            style={{ padding: '6px 12px', fontSize: '13px' }}
                            onClick={() => {
                                localStorage.removeItem('author-onboarding-done');
                                window.location.reload();
                            }}
                        >
                            {t('help.btnRetour')}
                        </button>
                        <button className="help-close-btn" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="help-body">
                    {/* 左侧导航 */}
                    <nav className="help-nav">
                        {helpSections.map(section => (
                            <button
                                key={section.id}
                                className={`help-nav-item ${activeSection === section.id ? 'active' : ''}`}
                                onClick={() => setActiveSection(section.id)}
                            >
                                {section.title}
                            </button>
                        ))}
                    </nav>

                    {/* 右侧内容 */}
                    <div className="help-content">
                        <div
                            className="help-markdown"
                            dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(currentSection?.content || '') }}
                        />

                        {/* 关于页面 - 检查更新按钮 */}
                        {activeSection === 'about' && (
                            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-light)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {currentAppVersion && (
                                    <div style={{
                                        flexBasis: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        fontSize: 13,
                                        color: 'var(--text-secondary)',
                                        marginBottom: 2,
                                    }}>
                                        <span>{t('update.currentVersion') || '当前版本'}:</span>
                                        <strong style={{ color: 'var(--text-primary)' }}>v{currentAppVersion}</strong>
                                    </div>
                                )}
                                <button
                                    onClick={checkForUpdates}
                                    disabled={updateChecking}
                                    style={{
                                        padding: '10px 24px',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 8,
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-primary)',
                                        cursor: updateChecking ? 'wait' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        opacity: updateChecking ? 0.7 : 1,
                                    }}
                                >
                                    {updateChecking ? t('update.checking') : t('update.checkForUpdates')}
                                </button>
                                <button
                                    onClick={handleExportDiagnostics}
                                    disabled={exportingLogs}
                                    style={{
                                        padding: '10px 24px',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 8,
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-primary)',
                                        cursor: exportingLogs ? 'wait' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        opacity: exportingLogs ? 0.7 : 1,
                                    }}
                                >
                                    {exportingLogs ? '正在导出日志...' : '导出诊断日志'}
                                </button>
                                {isElectron && (
                                    <button
                                        onClick={handleOpenDiagnosticsLocation}
                                        style={{
                                            padding: '10px 24px',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            border: '1px solid var(--border-light)',
                                            borderRadius: 8,
                                            background: 'var(--bg-card)',
                                            color: 'var(--text-primary)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        打开日志目录
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 检查更新结果弹窗 */}
            {updateResult && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 10001,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                    }}
                    onClick={(e) => { e.stopPropagation(); if (!updating) { setUpdateResult(null); setUpdateDone(null); } }}
                >
                    <div
                        style={{
                            background: 'var(--bg-card)',
                            borderRadius: 16,
                            padding: '32px 36px',
                            minWidth: 340,
                            maxWidth: 480,
                            boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
                            textAlign: 'center',
                            color: 'var(--text-primary)',
                            animation: 'fadeInScale 0.2s ease',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 状态图标 */}
                        <div style={{ fontSize: 48, marginBottom: 16 }}>
                            {updateDone
                                ? (updateDone.success ? (updateDone.needRestart ? '⚠️' : '✅') : '❌')
                                : updating ? '⏳'
                                    : updateResult.status === 'available' ? '🎉' : updateResult.status === 'latest' ? '✅' : '⚠️'
                            }
                        </div>

                        {/* 状态文字 */}
                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                            {updateDone
                                ? updateDone.message
                                : updating
                                    ? t('update.updating')
                                    : updateResult.status === 'available'
                                        ? t('update.updateAvailable').replace('{version}', `v${updateResult.latest}`)
                                        : updateResult.status === 'latest'
                                            ? t('update.noUpdateAvailable')
                                            : t('update.checkFailed')
                            }
                        </div>

                        {/* 版本信息 */}
                        {updateResult.current && !updateDone && !updating && (
                            <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 20 }}>
                                {t('update.currentVersion')}: v{updateResult.current}
                                {updateResult.status === 'available' && (
                                    <span> → v{updateResult.latest}</span>
                                )}
                            </div>
                        )}

                        {/* Electron 下载进度条 */}
                        {updating && downloadProgress && downloadProgress.total > 0 && (
                            <div style={{ margin: '16px 0' }}>
                                <div style={{
                                    width: '100%', height: 8, background: 'var(--bg-secondary)',
                                    borderRadius: 4, overflow: 'hidden',
                                }}>
                                    <div style={{
                                        width: `${downloadProgress.progress}%`, height: '100%',
                                        background: 'var(--accent)', borderRadius: 4,
                                        transition: 'width 0.3s ease',
                                    }} />
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
                                    ⬇️ {downloadProgress.progress}%
                                </div>
                            </div>
                        )}

                        {/* 源码更新进度条 */}
                        {updating && sourceProgress && (
                            <div style={{ margin: '16px 0' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, opacity: 0.8 }}>
                                    {stepLabel(sourceProgress)}
                                    <span style={{ opacity: 0.5, marginLeft: 8 }}>
                                        ({sourceProgress.step}/{sourceProgress.total})
                                    </span>
                                </div>
                                <div style={{
                                    width: '100%', height: 8, background: 'var(--bg-secondary)',
                                    borderRadius: 4, overflow: 'hidden',
                                }}>
                                    <div style={{
                                        width: `${(sourceProgress.step / sourceProgress.total) * 100}%`,
                                        height: '100%',
                                        background: sourceProgress.status === 'error' ? '#ef4444' : 'var(--accent)',
                                        borderRadius: 4,
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* 源码部署更新日志 */}
                        {updateDone?.logs && updateDone.logs.length > 0 && (
                            <div style={{
                                background: 'var(--bg-secondary)', padding: '10px 14px',
                                borderRadius: 8, fontSize: 11,
                                fontFamily: 'var(--font-mono, monospace)',
                                color: 'var(--text-secondary)',
                                maxHeight: 120, overflowY: 'auto',
                                lineHeight: 1.6, textAlign: 'left',
                                marginBottom: 16,
                            }}>
                                {updateDone.logs.map((l, i) => (
                                    <div key={i}>{l.msg}</div>
                                ))}
                            </div>
                        )}

                        {/* 操作按钮 */}
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                            {/* 有更新且未完成、未正在更新 */}
                            {updateResult.status === 'available' && !updateDone && !updating && (
                                <>
                                    {canAutoUpdate && (
                                        <button
                                            onClick={handleUpdate}
                                            style={{
                                                padding: '8px 22px', fontSize: 14, fontWeight: 600,
                                                borderRadius: 8,
                                                background: 'var(--accent)',
                                                color: '#fff', border: 'none',
                                                cursor: 'pointer',
                                                transition: 'opacity 0.15s',
                                            }}
                                        >
                                            {t('update.updateNow')}
                                        </button>
                                    )}
                                    {!canAutoUpdate && (
                                        <>
                                            <a
                                                href="https://github.com/YuanShiJiLoong/author/releases/latest"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    padding: '8px 22px', fontSize: 14, fontWeight: 600,
                                                    borderRadius: 8, textDecoration: 'none',
                                                    background: 'var(--accent)',
                                                    color: '#fff', border: 'none', cursor: 'pointer',
                                                    transition: 'opacity 0.15s',
                                                }}
                                            >
                                                {t('update.downloadClient')}
                                            </a>
                                            <a
                                                href="https://github.com/YuanShiJiLoong/author"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    padding: '8px 22px', fontSize: 14, fontWeight: 600,
                                                    borderRadius: 8, textDecoration: 'none',
                                                    border: '1px solid var(--border-light)',
                                                    background: 'transparent',
                                                    color: 'var(--text-primary)',
                                                    cursor: 'pointer',
                                                    transition: 'opacity 0.15s',
                                                }}
                                            >
                                                {t('update.viewSource')}
                                            </a>
                                        </>
                                    )}
                                </>
                            )}

                            {/* 更新完成后 */}
                            {updateDone?.success && !updateDone.message.includes(t('update.alreadyLatest')) && (
                                updateDone.needRestart ? (
                                    <div style={{
                                        fontSize: 13, color: 'var(--text-secondary)',
                                        background: 'rgba(251, 191, 36, 0.1)',
                                        border: '1px solid rgba(251, 191, 36, 0.3)',
                                        borderRadius: 8, padding: '12px 16px',
                                        textAlign: 'left', lineHeight: 1.7,
                                        marginBottom: 8, width: '100%',
                                    }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6, color: '#fbbf24' }}>📋 重启步骤：</div>
                                        <div>1. 停止当前运行的服务（Ctrl+C）</div>
                                        <div>2. 运行 <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4 }}>npm start</code> 或 <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4 }}>npm run dev</code></div>
                                        <div>3. 刷新浏览器页面</div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => window.location.reload()}
                                        style={{
                                            padding: '8px 22px', fontSize: 14, fontWeight: 600,
                                            borderRadius: 8,
                                            background: 'var(--accent)',
                                            color: '#fff', border: 'none', cursor: 'pointer',
                                            transition: 'opacity 0.15s',
                                        }}
                                    >
                                        {t('update.refreshNow')}
                                    </button>
                                )
                            )}

                            {/* 关闭按钮（更新中时不显示） */}
                            {!updating && (
                                <button
                                    onClick={() => { setUpdateResult(null); setUpdateDone(null); }}
                                    style={{
                                        padding: '8px 22px', fontSize: 14, fontWeight: 600,
                                        borderRadius: 8,
                                        border: '1px solid var(--border-light)',
                                        background: 'transparent',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        transition: 'opacity 0.15s',
                                    }}
                                >
                                    {t('update.close')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// 简单的 Markdown → HTML 转换（仅用于帮助文档静态内容）
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSimpleMarkdown(md) {
    let html = md.trim();

    // 表格
    html = html.replace(/^(\|.+\|)\n(\|[-: |]+\|)\n((?:\|.+\|\n?)*)/gm, (_, header, sep, body) => {
        const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${escapeHtml(c.trim())}</th>`).join('');
        const aligns = sep.split('|').filter(c => c.trim()).map(c => {
            if (c.trim().startsWith(':') && c.trim().endsWith(':')) return 'center';
            if (c.trim().endsWith(':')) return 'right';
            return 'left';
        });
        const rows = body.trim().split('\n').map(row => {
            const tds = row.split('|').filter(c => c.trim()).map((c, i) =>
                `<td style="text-align:${aligns[i] || 'left'}">${escapeHtml(c.trim())}</td>`
            ).join('');
            return `<tr>${tds}</tr>`;
        }).join('');
        return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // Headers
    html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold, italic, strikethrough, code
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
    html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);

    // Blockquote
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Links [text](url) — 仅允许 http/https/mailto 协议，拒绝 javascript:/data: 等可执行协议
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
        const trimmedUrl = String(url || '').trim();
        if (/^(https?:|mailto:)/i.test(trimmedUrl)) {
            return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
        // 非白名单协议：去掉可执行性，仅保留可见文字
        return text;
    });

    // List items  
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

    // Paragraphs (lines that don't start with < )
    html = html.replace(/^(?!<[a-z/]|$)(.+)$/gm, '<p>$1</p>');

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
}
