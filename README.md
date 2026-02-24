**English** | [简体中文](README.zh.md)

# ✍️ Author — AI-Powered Creative Writing Platform

> An AI-powered writing studio for novelists, screenwriters, and storytellers.

**Author** is an AI-assisted creative writing tool designed for fiction writers. It brings together a professional rich text editor, an intelligent AI writing assistant, and a complete worldbuilding management system — all in one seamless experience.

🌐 **Live Demo**: [author-delta.vercel.app](https://author-delta.vercel.app)

📦 **Gitee Mirror (国内镜像)**: [gitee.com/yuanshijilong/author](https://gitee.com/yuanshijilong/author)

---

## 💬 Why I Built This

I've been using AI for a while now — from the early days of ChatGPT 3.5, to Gemini 2.0 Exp Thinking, and eventually settling on Gemini 2.5 Pro Thinking after the ChatGPT o1 era.

As a novelist, I care deeply about AI's ability to handle language. Novels are long, so I need models with strong context windows and high recall. But what truly moved me about Gemini was its characters — there were moments when the words on screen made me want to cry. That's emotional resonance. I need writing that embraces the full complexity of being human.

Then the coding-focused trend took over. Every company started optimizing for code. I thought it was a good thing — until Gemini 3.1 Pro started describing its characters in biological and psychological terminology. Code-optimized models had begun deconstructing humans into biological components. Claude Opus 4.6 was even worse: every character spoke with peak efficiency — concise, economical, not like a human, but like a machine wearing a human mask.

**I could no longer see the models understanding human complexity. They didn't care about what humans *do* — only what humans *are*. They stopped showing personality through behavior and emotion, and instead slapped simple definitions onto human beings.**

I watched the versatility of these models being gutted. I don't want us to live in a cold world of code. I built this project so that AI can preserve **our own language** — beyond the mechanical operators.

> To all the authors, screenwriters, hobbyists, readers, and players who use this project: I hope you can bring out the best of your craft, create works with a human touch, and keep the flame of our language alive. 🔥

---

## ✨ Features

### 📝 Professional Editor
- Rich text editor powered by **Tiptap** — bold, italic, headings, lists, code blocks, and more
- **Word-style pagination** with WYSIWYG layout
- **KaTeX** math formula support
- Customizable fonts, font size, line height, and colors
- Real-time word / character / paragraph count

### 🤖 AI Writing Assistant
- **Multi-provider support**: ZhipuAI GLM-4 / DeepSeek / OpenAI / Google Gemini
- **Continue / Rewrite / Polish / Expand** — one-click generation
- **Ghost Text** streaming preview — see AI output in real-time like Cursor, with accept/reject
- **Free chat mode** — discuss plot, characters, and settings with AI
- **Context engine** — AI automatically reads your character profiles, worldbuilding, and previous chapters to maintain story consistency

### 📚 Worldbuilding Manager
- **Tree-structured** management for characters, locations, items, outlines, and writing rules
- Three writing modes: **Web Novel** / **Literary Fiction** / **Screenplay**, each with dedicated fields
- Color-coded categories with glassmorphism design
- Settings automatically injected into AI context

### 💾 Data Management
- **Local-first** — all data stored in browser IndexedDB, never uploaded to servers
- **Snapshot system** — manual/auto versioning with one-click rollback
- **Project import/export** — full project JSON backup
- **Markdown export** — single chapter or entire book

### 🌐 Internationalization
- 🇨🇳 简体中文 / 🇺🇸 English / 🇷🇺 Русский

### 🎨 User Experience
- Eye-comfort warm tones / dark mode toggle
- Interactive onboarding tour
- Help panel with keyboard shortcuts

---

## 💻 Desktop Client

**No Node.js required!** Download the pre-built installer:

- 📥 [Download Author Setup (Windows)](https://github.com/YuanShiJiLoong/author/releases/latest)

Just install and start writing. All features work out of the box.

> 💡 To build the desktop app from source: `npm run build && npx electron-builder --win`

---

## 🚀 Getting Started

### Requirements
- **Node.js** 18+
- **npm** 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/YuanShiJiLoong/author.git
# Or use Gitee mirror (faster in China)
# git clone https://gitee.com/yuanshijilong/author.git
cd author

# Install dependencies
npm install

# Configure environment variables (optional)
cp .env.example .env.local
# Edit .env.local with your API keys
# You can also configure them in the app's Settings panel
```

### Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start writing.

### Production Build

```bash
npm run build
npm start
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YuanShiJiLoong/author)

---

## 🔄 Updating

### Desktop Client Users

Download the latest installer from the [Releases](https://github.com/YuanShiJiLoong/author/releases/latest) page and install it over your current version. Your data is stored in the browser/Electron profile and will not be lost.

### Self-Deployed Users (Source)

```bash
git pull origin main
npm install
npm run dev
```

### Vercel Users

If you deployed via Vercel fork, just sync your fork with upstream on GitHub — Vercel will automatically redeploy.

---

## ⚙️ AI Configuration

Author supports multiple AI providers. Configure via **environment variables** or **in-app settings**:

| Provider | Env Variable | Get API Key |
|----------|-------------|-------------|
| ZhipuAI (GLM-4) | `ZHIPU_API_KEY` | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| Google Gemini | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| DeepSeek | In-app config | [platform.deepseek.com](https://platform.deepseek.com/) |
| OpenAI / Compatible | In-app config | [platform.openai.com](https://platform.openai.com/) |

> 💡 **No API key required** for most editing features. AI features need at least one provider configured.

---

## 🔒 Privacy & Data Security

### Local Storage (Safe)
- All creative data (chapters, settings, snapshots) is **stored 100% locally in your browser (IndexedDB)** — never uploaded to any server
- API Keys are stored in browser localStorage

### ⚠️ Data Flow When Using AI Features

When using AI features (continue, rewrite, chat, etc.), the following data passes through the **deployer's server** on its way to the AI provider:
- Your **API Key**
- The **text content** you send to AI

```
Your Browser → Deployer's Server → AI Provider (ZhipuAI/Gemini/DeepSeek/etc.)
```

**If you're using someone else's deployed public instance**, while the deployer promises not to inspect logs, the technical capability to intercept data exists. Therefore:

1. ✅ You can use a public instance for a **quick trial**
2. ⚠️ After trying it, **immediately destroy your API Key at your provider's website**
3. 🔐 **For real use, fork and deploy your own private instance** — then all data only passes through your own server

> 💡 Deploying your own instance is easy: Fork this repo → One-click deploy to Vercel → Done. Takes less than 5 minutes.

---

## 📄 License

This project is licensed under [AGPL-3.0](LICENSE).

**In short**:
- ✅ Free to use, modify, and distribute
- ✅ Personal and commercial use allowed (as long as you open-source your changes)
- ⚠️ Modified versions must also be open-sourced under AGPL-3.0 (including network services / SaaS)
- ⚠️ Original copyright notice must be preserved
- ❌ Closed-source commercial use is NOT allowed

---

## 🙏 Acknowledgments

- [Google Antigravity](https://antigravity.google/) — AI programming partner
- [Tiptap](https://tiptap.dev/) — Editor framework
- [Next.js](https://nextjs.org/) — React full-stack framework
- [Zustand](https://zustand-demo.pmnd.rs/) — State management
- [KaTeX](https://katex.org/) — Math rendering
