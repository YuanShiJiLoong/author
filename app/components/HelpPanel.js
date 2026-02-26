'use client';

import { useState } from 'react';
import { useI18n } from '../lib/useI18n';

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
3. 支持 **OpenAI 兼容接口** 和 **Google Gemini 原生接口**
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
| **左侧边栏** | 章节管理、字数统计、存档/读档、导入/导出、设定集、主题 |
| **顶部工具栏** | 文字格式、对齐、列表、公式、排版 |
| **编辑区域** | 所见即所得的富文本编辑，分页预览 |
| **右侧 AI 栏** | AI 聊天对话、上下文参考管理 |
| **底部状态栏** | 写作模式、页数、字数统计 |
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
6. AI 会以 **Ghost Text**（幽灵文字）效果出现在编辑器中
7. 点击 **✓ 接受** 确认采用，或 **✕ 拒绝** 撤销

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
- **删除**：AI 建议删除某项设定
- 点击卡片标题栏 **▼ 展开** 可以查看完整内容

#### 消息变体
- 对 AI 回复点击「重新生成」可获取不同版本
- 使用 < 1/3 > 导航切换不同变体
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
| **API 提供商** | 支持智谱、DeepSeek、OpenAI、Gemini、Kimi网络等，也可选自定义接入 |
| **API Key** | 你的大模型服务凭证。必须配置才能唤醒光标 AI |
| **Base URL** | 接口地址（切换提供商时会自动填写官方地址） |
| **模型选择** | 点击「从API拉取模型列表」自动更新当前可用的大模型库供你选择 |
| **独立向量API** | 高级功能。允许你用专用的 Embedding 模型解决长篇巨著的“记忆遗忘”问题 |

### 偏好设置 (Preferences)
在设定集的最后一栏，你可以随时：
- 切换语言界面（简体中文、English、Русский）
- 切换工作台视觉主题（经典纸张 / 现代玻璃）

### 书籍信息
设置书名、类型、简介——帮助 AI 了解整体方向。

### 设定树
在左侧树形结构中添加和管理各类设定：

| 分类 | 图标 | 可设置字段 |
|------|------|---------|
| **角色设定** | 🎭 | 类型、性别、年龄、外貌、性格、说话风格、背景、动机、能力、关系 |
| **世界观** | 🌍 | 描述、备注 |
| **地点/空间** | 📍 | 描述、场景标题、感官细节（视觉/听觉/嗅觉）、氛围 |
| **物品/道具** | 📦 | 描述、类型、品阶、持有者、数值属性、象征意义 |
| **剧情大纲** | 📋 | 状态（计划中/写作中/已完成）、描述、备注 |
| **写作规则** | ✍️ | 规则描述（AI 严格遵守） |

### 额外字段
AI 生成的非标准字段会自动出现在 **✨ AI 生成的额外字段** 分组中，可查看和编辑。

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
点击侧栏中的 **＋ 新建** 按钮，输入章节标题即可创建。

### 切换章节
点击侧栏中的章节名称切换到该章节，编辑器会加载其内容。

### 右键操作
在章节名称上 **右键单击** 可以：
- **✎ 重命名** — 修改章节标题
- **↓ 导出 Markdown** — 将当前章节导出为 .md 文件
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
- 下拉选择字体：默认（宋体）、黑体、楷体、仿宋、Serif、Monospace
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

### 颜色
- **A▾** — 文字颜色选择器
- **高亮▾** — 背景高亮色选择器

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
    `,
    },
    {
        id: 'data',
        title: '💾 数据管理',
        content: `
## 数据管理

### 自动保存
编辑内容会 **实时自动保存** 到浏览器的 localStorage，无需手动保存。

### 侧栏底部按钮
底部图标栏的功能（悬停可查看说明）：

| 图标 | 功能 |
|------|------|
| 🕒 | **时光机** — 版本历史，回溯到之前的快照 |
| 💾 | **存档** — 将整个项目（所有章节 + 设定集 + AI 对话）导出为 JSON 文件 |
| 📂 | **读档** — 从 JSON 文件恢复完整项目 |
| 📥 | **导入作品** — 从文件导入章节（支持多种格式） |
| 📤 | **导出作品** — 将当前作品所有章节导出（支持多种格式） |

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
点击 📤 按钮，选择导出格式：
- **TXT** — 纯文本
- **Markdown** — .md 格式
- **DOCX** — Word 文档
- **EPUB** — 电子书
- **PDF** — 打印为 PDF

### 章节导出
- **导出本章** — 将当前章节导出为 Markdown 文件
- **导出全部** — 将所有章节合并导出为一个 Markdown 文件

### 重要提醒
- 所有数据存储在 **浏览器本地**，不会上传到任何服务器
- **清除浏览器数据** 会丢失所有未导出的内容
- **API Key** 存储在本地 localStorage 中
- 建议定期使用 💾 存档功能备份

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

*注：你可以随时点击侧栏右下角的 🌙 / ☀️ 切换对应主题下的深色/浅色模式。*

### 排版引擎调节
在顶部工具栏点击 **Aa▾** 按钮：
- **字号**：滑块无极调节 14px ~ 24px（默认 17px）
- **行距**：滑块无极调节 1.4 ~ 2.6（默认 1.9）
- **恢复默认**：一键重置排版参数

### 字体选择
| 字体 | 适合场景 |
|------|---------|
| 默认（宋体） | 正文写作 |
| 黑体 | 标题 |
| 楷体 | 古风文 |
| 仿宋 | 公文风格 |
| Serif | 英文衬线体 |
| Monospace | 等宽字体 |

### 排版建议
| 场景 | 推荐设置 |
|------|---------| 
| 网文写作 | 字号 16-17px，行距 1.8-2.0 |
| 纯文学 | 字号 17-18px，行距 2.0-2.2 |
| 校对审稿 | 字号 14-15px，行距 1.6 |
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
- ✦ **Ghost Text** — 类似 Cursor 的幽灵文字预览，接受/拒绝一键操作
- 📄 **分页视图** — 类 Word/Google Docs 的白纸分页排版
- 🌙 **深色模式** — 护眼的暗色主题
- 💾 **本地优先** — 所有数据存储在本地，隐私安全
- 📦 **存档/读档** — 一键导出/导入完整项目

### 数据安全
- 所有创作内容存储在你的浏览器本地
- API Key 存储在本地浏览器中
- 支持一键导出全部数据

### ⚠️ 隐私须知
使用 AI 功能时，API Key 和文字内容会经过**部署者的服务器**转发给 AI 供应商。使用他人部署的实例时，体验后请及时销毁 Key，正式使用请自行 Fork 部署。

### 技术栈
Next.js + Tiptap 编辑器 + AI API（OpenAI 兼容 / Gemini）

### 开源项目
Author 是一个开源项目，采用 **AGPL-3.0** 协议。

🔗 **GitHub**: [github.com/YuanShiJiLoong/author](https://github.com/YuanShiJiLoong/author)

欢迎 Star ⭐、提 Issue、贡献代码！
    `,
    },
];

export default function HelpPanel({ open, onClose }) {
    const [activeSection, setActiveSection] = useState('quickstart');
    const { t } = useI18n();

    if (!open) return null;

    const currentSection = HELP_SECTIONS.find(s => s.id === activeSection);

    return (
        <div className="help-overlay" onClick={onClose}>
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
                        {HELP_SECTIONS.map(section => (
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
                    </div>
                </div>
            </div>
        </div>
    );
}

// 简单的 Markdown → HTML 转换（仅用于帮助文档静态内容）
function renderSimpleMarkdown(md) {
    let html = md.trim();

    // 表格
    html = html.replace(/^(\|.+\|)\n(\|[-: |]+\|)\n((?:\|.+\|\n?)*)/gm, (_, header, sep, body) => {
        const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
        const aligns = sep.split('|').filter(c => c.trim()).map(c => {
            if (c.trim().startsWith(':') && c.trim().endsWith(':')) return 'center';
            if (c.trim().endsWith(':')) return 'right';
            return 'left';
        });
        const rows = body.trim().split('\n').map(row => {
            const tds = row.split('|').filter(c => c.trim()).map((c, i) =>
                `<td style="text-align:${aligns[i] || 'left'}">${c.trim()}</td>`
            ).join('');
            return `<tr>${tds}</tr>`;
        }).join('');
        return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

    // Bold, italic, strikethrough, code
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Blockquote
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // List items  
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

    // Paragraphs (lines that don't start with < )
    html = html.replace(/^(?!<[a-z/]|$)(.+)$/gm, '<p>$1</p>');

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
}
