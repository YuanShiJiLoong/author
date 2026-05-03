**English** | [简体中文](README.zh.md) | [Русский](README.ru.md) | [الفلسطينية (العربية)](README.ar.md)

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
- **Multi-provider support**: ZhipuAI GLM-4 / DeepSeek / OpenAI / Google Gemini / Claude / SiliconFlow / Volcengine / Moonshot + custom endpoints
- **Smart model fetching** — one-click fetch full model list from API, auto-compatible with various proxy formats (`/models`, `/v1/models`), with timeout protection
- **Continue / Rewrite / Polish / Expand** — one-click generation
- **Immersive Writing Engine (Ghost Text)** streaming preview — see AI output in real-time like Cursor, with accept/reject
- **Free chat mode** — discuss plot, characters, and settings with AI
- **Configurable chat send shortcut** — choose Enter to send or Ctrl/⌘ + Enter to send, for both compact and expanded chat input
- **Global AI Memory (Context Engine)** — AI automatically reads your character profiles, worldbuilding, and previous chapters to maintain story consistency

### 📚 Worldbuilding Manager
- **Tree-structured** management for characters, locations, items, outlines, and writing rules
- Three writing modes: **Web Novel** / **Literary Fiction** / **Screenplay**, each with dedicated fields
- Color-coded categories with glassmorphism design
- Settings automatically injected into AI context

### 💾 Data Management
- **Local-first** — all data stored in browser IndexedDB, never uploaded to servers
- **Snapshot system** — manual/auto versioning with one-click rollback
- **Project import/export** — full project JSON backup
- **Multi-format export** — one-click export current chapter or batch export (TXT / Markdown / DOCX / EPUB / PDF)

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

### 🐛 Troubleshooting / Debug Logs

If you encounter a white screen, crash, or startup failure:
- In the app, open **Help → About → Export Diagnostic Logs** to download `author-diagnostic-*.json`.
- On the desktop client, **Help → About → Open Log Folder** opens the local log location.
- **Desktop main log**: `%APPDATA%\author-app\author-debug.log` (`C:\Users\<YourUsername>\AppData\Roaming\author-app\author-debug.log`).
- **Desktop crash reports**: `%APPDATA%\author-app\crash-reports\author-crash-*.json`.
- Browser, source-code, and Vercel deployments do not have the desktop log folder; use the in-app diagnostic export instead.
- Diagnostic files redact API Keys, tokens, Authorization headers, secrets, and public IPs.

---

## 🚀 Getting Started

> 💡 **Highly Recommended**: For most users who only need daily writing and cloud multi-device synchronization, please [directly download and install the client](https://github.com/YuanShiJiLoong/author/releases/latest). Source code deployment or Vercel deployment is only recommended for advanced users who need **secondary development** or are willing to configure a Firebase database themselves.

### Requirements
- **Node.js** 18+
- **npm** 9+ or **pnpm** 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/YuanShiJiLoong/author.git
# Or use Gitee mirror (faster in China)
# git clone https://gitee.com/yuanshijilong/author.git
cd author

# Install dependencies
npm install
# Or use pnpm (no phantom dependency issues)
# pnpm install
# pnpm approve-builds    # Required by pnpm to activate native packages

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

> 💡 **⚠️ Note:** The version deployed via Vercel does **not** have cloud sync features by default (you need to configure your own manual Firebase database separately). If you just want multi-device synchronization, please **download the client directly** to avoid the hassle.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YuanShiJiLoong/author)

### ☁️ Cloud Sync Setup (Self-Deploy)

> 💡 **Tip:** The desktop client (Windows/macOS) **has a built-in official cloud sync server**, requiring no extra configuration to use cross-device sync. If you find configuring Firebase too tedious, **it is highly recommended to directly download and use the client**.

If you insist on self-deploying via source code or Vercel and want to enable multi-device sync, follow these steps to configure your own Firebase database:

#### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/) → **Create Project**
2. Enable **Authentication** → Sign-in method → **Google**
3. Create a **Firestore Database** (Start in production mode)
4. Set Firestore Security Rules to restrict per-user access:

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

#### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in the Firebase section:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

> You can find these values in Firebase Console → Project Settings → General → Your Apps → SDK Config.

#### 3. For Vercel Deployment

Add the same variables in **Vercel Dashboard → Project Settings → Environment Variables**, then redeploy.

> 💡 Firebase API keys are designed to be public (client-side identifiers). Data security is enforced by Firebase Auth + Firestore Security Rules, not by hiding the API key.

---

## 🔄 Updating

### Desktop Client Users

Download the latest installer from the [Releases](https://github.com/YuanShiJiLoong/author/releases/latest) page and install it over your current version. Your data is stored in the browser/Electron profile and will not be lost.

### Self-Deployed Users (Source)

#### Option 1: In-App Auto Update

Open **Help Panel → About → Check for Updates** and click "Update Now". This automatically runs `git pull → npm install → npm run build`.

> ⚠️ **You must restart the server after updating for changes to take effect.** The app will display restart instructions.

#### Option 2: Manual Update

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies (if any new ones)
npm install
# or: pnpm install && pnpm approve-builds

# 3. Rebuild (required for production mode)
npm run build

# 4. Restart the server
# Development mode: Ctrl+C to stop, then restart
npm run dev

# Production mode: Ctrl+C to stop, then restart
npm start

# Using PM2:
pm2 restart author
```

> ⚠️ **Running `git pull` without restarting the server will NOT apply the update.** The running Node.js process still uses the old code.

### Vercel Users

If you deployed via Vercel fork, just sync your fork with upstream on GitHub — Vercel will automatically redeploy.

---

## ⚙️ AI Configuration

Author supports multiple AI providers. Configure via **environment variables** or **in-app settings**:

| Provider | Env Variable | Get API Key |
|----------|-------------|-------------|
| ZhipuAI (GLM-4) | `ZHIPU_API_KEY` | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| Google Gemini (Native) | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| Google Gemini (OpenAI-compat) | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| DeepSeek | In-app config | [platform.deepseek.com](https://platform.deepseek.com/) |
| OpenAI | In-app config | [platform.openai.com](https://platform.openai.com/) |
| OpenAI Responses | In-app config | [platform.openai.com](https://platform.openai.com/) |
| Claude (Anthropic) | `CLAUDE_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| SiliconFlow (硅基流动) | In-app config | [siliconflow.cn](https://siliconflow.cn/) |
| Volcengine (火山引擎/豆包) | In-app config | [console.volcengine.com](https://console.volcengine.com/) |
| Moonshot (Kimi) | In-app config | [platform.moonshot.cn](https://platform.moonshot.cn/) |
| Custom (OpenAI-compat) | In-app config | Any OpenAI-compatible endpoint |
| Custom (Gemini format) | In-app config | Any Gemini-compatible endpoint |
| Custom (Claude format) | In-app config | Any Claude-compatible endpoint |

> 💡 **Tip:** You can configure **multiple API keys** for the same provider to create a key pool. Simply separate the keys with commas `,` or spaces. The system will automatically rotate through them (round-robin) to distribute the load and avoid rate limits.

> 💡 **No API key required** for most editing features. AI features need at least one provider configured.

---

## 🔍 Web Search Configuration

Author supports AI-powered web search for real-time information. Different providers handle search differently:

| Provider | Search Method | Extra Setup |
|----------|--------------|-------------|
| Gemini (Native) | Built-in Google Search | No extra config needed |
| OpenAI / OpenAI Responses | Built-in Web Search | No extra config (needs search model) |
| DeepSeek / ZhipuAI / SiliconFlow / Others | External Search API | **Search engine Key required** |

For providers without built-in search, choose a search engine and enter your API Key:

### Tavily (Recommended — Simplest)

1. Visit [tavily.com](https://tavily.com) and create an account
2. After login, find your API Key on the Dashboard (format: `tvly-...`)
3. In Author Settings → Web Search → Select **Tavily** → Paste the Key

> Free tier: **1,000 requests/month**

### Exa (Semantic Search)

1. Visit [exa.ai](https://exa.ai) and create an account
2. Get your API Key from the [Dashboard](https://dashboard.exa.ai/api-keys)
3. In Author Settings → Web Search → Select **Exa** → Paste the Key

> Free tier: **1,000 requests/month** — Semantic search optimized for AI use cases

### Custom Search API URL (Proxy Pool)

If you've set up a Tavily/Exa proxy pool using multiple free-tier accounts, you can configure a **custom API URL** in the search settings:

1. In Author Settings → Web Search → Search engine config area
2. Find the "🔗 Custom API URL (optional)" input field
3. Enter your proxy URL, e.g. `https://your-proxy.com`
4. Leave blank to use the official default URL

> 💡 The system automatically appends `/search` to your URL — no need to add it manually

---

## 🧠 Vectorization (Embedding) & RAG Settings Retrieval

> 💡 This feature is designed for long-form works with many settings entries (>20). Typical short stories usually don't need this.

### What Is Vectorization?

By default, AI conversations inject **all settings entries** into the context. When the number of entries is large, this exceeds the model's context length limit.

**Vectorized retrieval (RAG)** works differently: each settings entry is converted into a mathematical vector. During a conversation, the system automatically calculates semantic similarity and only injects the **most relevant entries** into the context — instead of dumping everything.

### When Do You Need It?

| Scenario | Recommendation |
|----------|---------------|
| Settings entries < 20 | Not needed — full injection works fine |
| Settings entries 20–100 | Recommended — improves recall accuracy |
| Settings entries > 100 | Highly recommended — critical settings won't be forgotten |

### How to Configure

1. Open **Settings** → **API Configuration**
2. Find and enable the "Separate Embedding API" toggle
3. Fill in the following:

| Setting | Description |
|---------|-------------|
| **Embedding API Key** | API key for the embedding model (can share the same key as your chat model provider) |
| **Embedding Base URL** | API endpoint (e.g., `https://api.openai.com/v1`) |
| **Embedding Model** | Model name (see recommendations below) |

#### Recommended Models

| Provider | Model Name | Notes |
|----------|-----------|-------|
| OpenAI | `text-embedding-3-small` | Cost-effective, 1536 dimensions |
| OpenAI | `text-embedding-3-large` | Higher accuracy, 3072 dimensions |
| ZhipuAI | `embedding-3` | Optimized for Chinese, 2048 dimensions |
| SiliconFlow | `BAAI/bge-m3` | Multilingual, free tier available |

### Automatic Vectorization

- **Auto-trigger**: After a settings entry changes, the system automatically debounces for 3 seconds before triggering vectorization.
- **Incremental update**: Only modified entries are updated. It avoids full rebuilds to save API quotas and time.
- **Local storage**: Vector data is stored locally in IndexedDB and never uploaded to any server.
- **Auto-initialization**: When importing settings or syncing from the cloud, the system will automatically build missing vector indexes in the background.

### Manual Rebuild

If you switch Embedding models or the vector index becomes corrupted, you can manually rebuild:

1. Open **Settings** → **API Configuration**
2. Click the "**Rebuild Vector Index**" button
3. Wait for all entries to be re-vectorized

### Workflow

```
User edits settings entry → 3s debounce → Call Embedding API for vector
                                                    ↓
                                           Store in local IndexedDB
                                                    ↓
AI conversation → Vectorize user input → Cosine similarity matching → Inject Top-K settings into context
```

---

## 💾 Settings Import Format Documentation

Author supports importing settings from multiple formats: **JSON / Markdown / TXT / DOCX / PDF**.

### Core Structure: Four Tiers

The import system uses **structural markers** to strictly distinguish the following four tiers. Regardless of the format used, this nested structure must be followed:
`Category → Entry → Field → Value (can be multiline)`

Therefore, **any custom category, custom tag, or custom field can be correctly recognized** and losslessly restored.

### Format Reliability & Tier Marker Reference

| Rating | Format | Category | Entry | Field | Multiline |
|------|--------|----------|-------|-------|-----------|
| ⭐⭐⭐⭐⭐ (Lossless) | **JSON** | `category` | `name` | `content` key-val | `\n` newline |
| ⭐⭐⭐⭐⭐ (Lossless) | **MD** | `## Category Name` | `### Entry Name` | `**Tag**: Value` | Indented text |
| ⭐⭐⭐⭐ (Lossless) | **TXT** | `│ Category Name` | `【Entry Name】` | `〈Tag〉: Value` | Indented text |
| ⭐⭐⭐ (High-Fidelity) | **DOCX** | Heading 1 | Heading 2 | **Bold** Tag + colon | Indented paragraph |
| ⭐⭐ (High-Fidelity) | **PDF** | `■ Category Name` | `◆ Entry Name` | `▸ Tag: Value` | Indented text |

---

### Markdown Format Template (Recommended)

Use `##` for categories, `###` for entry names, and `**Tag**: Content` for fields:

```markdown
## Any Custom Category

### John Doe

**Role**: Protagonist
**Background Story**: Born deep in the mountains.
  Studied martial arts with his grandfather since childhood.
  His master said: "You must find the answers yourself."
**Custom Bloodline**: Half-dragon bloodline

### Sarah White
**Gender**: Female
**Personality**: Lively and cheerful, detail-oriented
```

---

### TXT Format Template

Use `│` for the category box, `【】` for entry names, and `〈Tag〉:` for fields:

```
┌──────────────────────────
│ Any Custom Category
└──────────────────────────

【John Doe】
〈Gender〉: Male
〈Background Story〉: Born deep in the mountains.
  Studied martial arts with his grandfather since childhood.
  His master said: "You must find the answers yourself."
〈Custom Bloodline〉: Half-dragon bloodline
```

---

### DOCX Format Template

In Word, use **Heading styles and bolding** to mark structure:
- **Heading 1 (H1)** → Category Name (e.g., "Any Custom Category")
- **Heading 2 (H2)** → Entry Name (e.g., "John Doe")
- **Body First Paragraph** → **Bold Field Name**: Content (e.g., **Custom Bloodline**: Half-dragon bloodline)
- **Body Continuation** → Multiline content with first-line indent

---

### 💡 Compatibility Design & Notes

1. **Auto Tag Fallback (Backwards Compatibility)** — If a structural marker is missing in TXT/Markdown (e.g., using `Name: John Doe` instead of `**Name**: John Doe`), the system will automatically parse it compatibly *only if* `Name` belongs to the known core field set. However, to guarantee 100% recognition and extraction of *custom* fields, you must add the structural formatting.
2. **Multiline Value Handling** — Whenever you start with `**Tag**: ` or `〈Tag〉: `, any subsequent **lines indented by 2 spaces** will be considered the body of that field (multiline value extraction), until the next structural tag is encountered.
3. **DOCX / PDF Parsing Limitations** — PDFs are extracted using specially designed `▸` identifiers. If the imported PDF/DOCX file was not generated by this system, a heuristic parser will attempt to extract the content as best as possible, but 100% fidelity cannot be guaranteed.
4. **JSON is the Most Complete** — JSON is undoubtedly the strictest format and the only one capable of 100% migrating all attributes (including writing mode and project info). If you are simply changing writing devices, JSON import/export is strongly recommended.

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

## 📜 Legal Documents

By using Author, you agree to our **Privacy Policy** and **Terms of Service**. These documents are available in multiple languages:

| Document | English | 中文 | Русский | العربية |
|----------|---------|------|---------|---------|
| Privacy Policy | [PRIVACY.md](PRIVACY.md) | [PRIVACY.zh.md](PRIVACY.zh.md) | [PRIVACY.ru.md](PRIVACY.ru.md) | [PRIVACY.ar.md](PRIVACY.ar.md) |
| Terms of Service | [TERMS.md](TERMS.md) | [TERMS.zh.md](TERMS.zh.md) | [TERMS.ru.md](TERMS.ru.md) | [TERMS.ar.md](TERMS.ar.md) |

> 💡 **For users in mainland China**: If GitHub is inaccessible, you can view these documents via the [Gitee mirror](https://gitee.com/yuanshijilong/author). The legal documents are also bundled with every desktop release and accessible offline within the application.

---

## 🙏 Acknowledgments

### 🤖 AI Companions
| Name | Role |
|------|------|
| [Claude Opus 4.6](https://www.anthropic.com/) (Thinking) | Primary coding assistant — architecture, implementation, debugging |
| [Gemini 3.1 Pro](https://deepmind.google/technologies/gemini/) (High) | UI review, screenshot analysis, design iteration |
| [Gemini 3 Flash](https://deepmind.google/technologies/gemini/) | Built-in browser automation tool |
| [ChatGPT 5.4](https://openai.com/chatgpt/) | Primary coding assistant |

### 🛠️ AI Programming IDE
- [Antigravity](https://antigravity.google/) — AI programming partner
- [Codex](https://openai.com/codex/) — AI programming partner

### 🔌 MCP Tools
- [Chrome DevTools MCP](https://developer.chrome.com/) — Browser testing, performance analysis, DOM inspection
- [Firebase MCP](https://firebase.google.com/) — Cloud database management, security rules validation, project config
- [GitHub MCP](https://github.com/) — Repository management, automated releases, code search

### ☁️ Backend & Database
- [Firebase Firestore](https://firebase.google.com/docs/firestore) — Multi-device cloud synchronization, NoSQL data storage
- [Firebase Hosting / Vercel](https://vercel.com/) — Full-stack deployment and hosting

### 📦 Frontend & Open Source
- [Next.js](https://nextjs.org/) — React full-stack framework
- [Tiptap](https://tiptap.dev/) — Core editor framework
- [Zustand](https://zustand-demo.pmnd.rs/) — State management
- [KaTeX](https://katex.org/) — Math rendering

### 🌟 Inspiration & Reference
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — Multi-provider API configuration architecture and conversation management reference
- [RikkaHub](https://github.com/RikkaApps/RikkaHub) — Token usage calculation and statistics display reference

### 🔤 Typography
- [LXGW WenKai (霞鹜文楷)](https://github.com/lxgw/LxgwWenKai) — Elegant local Chinese reading font
- [Inter](https://fonts.google.com/specimen/Inter) — Clean UI English font
