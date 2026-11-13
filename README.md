**English** | [简体中文](README.zh.md) | [Русский](README.ru.md) | [الفلسطينية (العربية)](README.ar.md)

# ✍️ Author — AI-Powered Creative Writing Platform

> An AI-powered writing studio for novelists, screenwriters, and storytellers.

**Author** is an AI-assisted creative writing tool designed for fiction writers. It brings together a professional rich text editor, an intelligent AI writing assistant, and a complete worldbuilding management system — all in one seamless experience.

🌐 **Live Demo**: [author-delta.vercel.app](https://author-delta.vercel.app)

📦 **Gitee Mirror (国内镜像)**: [gitee.com/yuanshijilong/author](https://gitee.com/yuanshijilong/author)

---

## 💬 Why I Built This

I have been using AI for a long time. Starting with ChatGPT 3.5, I have written fiction with almost every generation of mainstream models.

<details>
<summary><b>📝 Models I've Used (personal notes, October 2026)</b></summary>

These are my own impressions from writing fiction, not a rigorous benchmark. Models keep changing, and my views will change with them.

**ChatGPT 3.5 → GPT-4o**

I started with ChatGPT 3.5. Then came GPT-4o, which I used continuously for a month or two. It was the first model that made me think, "So this is artificial intelligence."

**Gemini 2.0 Pro → 2.0 Thinking → DeepSeek R1**

Gemini 2.0 Pro had no reasoning yet. It had a 2-million-token context window, but started forgetting things at around 100k. After that I used 2.0 Thinking, and DeepSeek R1 in early 2025.

**Gemini 2.5 Pro: the first model that brought characters to life**

After 2.5 Pro came out, especially the 0325 version from March 2025, I used it almost every day. At the time it was strong at writing and everything else. It had a long context, and it was the first model that could write lively character reactions and real emotion. During that period I didn't use other providers apart from some testing. For example, I used o3 mainly for research work, where it was strong.

**Characters written as biological structures**

After o3, many models tended to write people as a pile of biological parts. DeepSeek had this problem too: how many millimeters the pupils contracted, how many extra heartbeats, the exact pulse rate. By Gemini 3.0 it was obvious, with constant mentions of limbs and spines. Claude Opus 4.6 was the worst at launch, but improved a lot after ten days to two weeks. I don't know whether that came from post-training adjustments.

**Gemini 3.0 / 3.1: exaggerated and extreme**

Gemini's characters tend to be exaggerated and extreme. This is almost common knowledge among writers, and some of it remains in Gemini 4 Argon. Gemini is very popular with role-play users, and under its terms, free-tier data can be used to improve the model. My personal guess is that this affects its writing tendencies, though of course it is only a guess.

**Claude Opus 4.6: the only model that truly cares about foreshadowing**

After that improvement, its detail became very rich. It is a steady model with real weight. Until Opus 5.5 came out, it led in writing.

It is the only model that has written sentences that truly moved me. Several hundred thousand characters into a novel, it would suddenly bring back a line I had never emphasized and tie it to later plot and to a character's response, and the character gained depth. It was also the first model that raised the ceiling of my writing.

It builds characters through extremely rich psychological description and stream of consciousness, supported by actions and dialogue. The weakness is that characters look calm on the surface, with their reactions kept inside. When you act toward a character or speak to them, they may reply with a single word, terse and brief, while their inner life stays rich. Some people say this makes characters feel dead. I disagree. What matters most in a person is the inner life. A rich inner life makes a character feel more alive. What it lacks is only the surface layer.

Gemini is the opposite. It focuses most on the surface, or rather stays on the surface. Its characters react in exaggerated, extreme ways, which makes people feel they are very alive. To me, this kind of characterization is too shallow. Still, for power fantasy (爽文) in the narrow sense, which relies on surface exaggeration for its payoff, it is quite useful.

Since August 2026, Opus 4.6 has been changing, most noticeably from September. Character responses are less cold, but the stream-of-consciousness writing has clearly decreased, and characters have less depth than before. I now mainly use it for foreshadowing, and for daily writing Opus 5.5 works better for me.

**Opus 4.7 → 4.8 → 5: a steady decline**

The generations after 4.6 got noticeably worse. Opus 5 is full of self-invented abbreviations and jargon. Never mind fiction; even programmers can't follow what it writes.

**Opus 5.5: the second model that raised my ceiling**

At first I didn't think much of it. Its language felt comfortable, and clearly a lot of work went into its language, but its ability to expand scenes was not enough. Once I used it in real writing, I found it has a lot to offer. It uses much less stream of consciousness than 4.6, and character reactions are somewhat better, but it sometimes produces several one-word replies like "Mm." in a row, and it hasn't quite found the right balance. It also cares less about foreshadowing than 4.6.

Now I'm more used to 5.5. 4.6 and 5.5 complement each other. Add Gemini's lively reactions, blend the three, and that would be a true generational leap.

**GPT-5 to GPT-6 Ultra: more human now, but rushes the plot and preaches**

From GPT-5 to 5.4, it barely spoke like a human. 5.5 was better, and 5.6 is fairly good. 5.6 and GPT-6 Ultra have much less AI flavor, though it is still there.

GPT has two long-standing problems:

- **It keeps pushing the plot forward.** It doesn't understand foreshadowing or setup, as if it wants to write the ending in chapter one.
- **It preaches through characters.** It doesn't lecture you directly. It quietly rewrites the characters. A gang boss who kills and burns without any limits suddenly develops firm principles in its hands, and the character's mouth is used to tell the author "this is immoral." Fiction inevitably has dark plots, so this seriously gets in the way. Opus 5.5 does this a little too, but less than GPT.

**Gemini 4 Argon: good at power fantasy, saves time**

It is good at East Asian web-fiction power fantasy in the narrow sense. It knows where the plot should go without much effort, and its world knowledge is strong. It describes appearance in a character-portrait style (立绘): concise, punchy, and vivid, and it does this on its own without prompting. Claude won't write that way unless reminded. It also likes to push the plot forward.

Power fantasy in the broader sense, such as the emotional payoff of foreshadowing or deeply written characters, is not its strength. It can save you time, but it can't raise your ceiling. For characters with depth, Opus 4.6 and 5.5 are still the ones to use.

**Open models: usable now, but pacing still lags**

I keep testing open models, and their pacing still falls short. DeepSeek V4.1 is finally usable, but its output is very short (the official explanation is that output was optimized and shortened). After a few rounds it settles at around 300 Chinese characters, which is exhausting for fiction. Its wording is colloquial, but it explains things clearly. Kimi K3 has a great reputation, but its fiction prose is very colloquial, and doggerel-like lines sometimes slip in.

</details>

<details>
<summary><b>💡 AI Flavor, Prompts, and Testing</b></summary>

**What "AI flavor" is**

Many people talk about "AI flavor" and say you should avoid "not X, but Y." AI flavor means putting a correct usage in the wrong place: "not X, but Y," ellipses, em dashes, or combinations like "knuckles turning white." These are all normal human expressions. They become AI flavor only when used in the wrong place. Writing differs from code: change a pause, cut a few words, or reorder a sentence, and the meaning becomes completely different.

AI flavor is also not the measure of writing ability. Today's AI is not AGI, so some AI flavor is normal. Just revise it yourself. If a model's output takes more work to fix than rewriting it yourself, switch to a model that feels better to use and actually saves you time or raises your ceiling.

**No need to buy prompts**

Many people sell prompts online, and with every new model generation people rush to buy them. There is no need. The underlying logic of prompts stays the same. At heart they are a core framework. As long as you can clearly say what you want the model to do, you can have the model write the prompt for you.

My current prompt was first written by GPT-4o, then refined with Gemini 2.5 Pro's Deep Research. I have kept iterating on that framework ever since, and it works with every model generation.

**What matters is in-context correction**

Stuffing a model with rules like "be human," "no AI flavor," or "don't over-stylize" has limited effect. These phrases are subjective. Even people don't share a single standard for them, and the model interprets them differently each time.

For models like Opus 5.5 that understand human language well, few-shot examples and in-context correction work better: when you notice it going off track while writing, correct it right there. With an example to go on, it knows what was wrong and which direction to take, and its understanding gets closer and closer to what you want. Older models still rely more on presets, and in some scenarios such as role-play, presets remain important.

**Do your own testing**

The tests popular on social media, such as 3D scenes or a pelican riding a bicycle, are fine for checking whether a model has gotten worse. Don't use them to judge writing ability. Each company trains in a different direction with different data proportions.

Maintain your own set of tests, write with your own material, and form your own judgment. Don't rely on fully automated tests where the model runs on its own and you only look at the results. Take part and guide it yourself. At first I mainly tested whether a model could write at length, since expansion reflects how well it develops a plot. That worked well for Opus 4.6. By Opus 5.5 it was no longer enough, so I switched to having the models take part in real writing and comparing them systematically.

</details>

### What Good Writing Looks Like

- **Characters should stand on their actions and inner life.** Personality and emotion should come through in what they do, what they say, and what they think. Giving a person a label, or writing only physical reactions, does not produce a real person.
- **Foreshadowing has to pay off.** Several hundred thousand characters in, bring back an unremarkable line from earlier and connect it to the current plot, and the character gains depth.
- **A good model raises the author's ceiling.** One sentence it writes can make you think of a better way to write.

### Author's Direction

The project currently focuses on assisted writing. Today's models are not yet capable enough to create on their own, so human-led, model-assisted writing is an important direction for Author. Of course, this will be weighed and adjusted as model capabilities improve.

### Why Writing Matters

Writing is an important module for measuring a model's generality. Every story is a different world, and every world has its own physical rules. Writing tests a model's understanding of the world, of space and time, and of characters' emotions. It also tests attention, recall, and long-context memory.

The point of artificial general intelligence lies in the word "general."

I'm not a professional writer. I've only written a few web novels, which I think qualifies me to take part in this kind of evaluation. My background is in science and engineering, and I have some interdisciplinary ability, so I believe these views have some reference value. All of the above is my personal opinion.

> I hope everyone who uses this project can write works with human warmth and keep the flame of our language alive. Beyond writers, I hope people in every field will do their part as well. 🔥

---

## ✨ Features

### 📝 Professional Editor
- Rich text editor powered by **Tiptap** — bold, italic, headings, lists, code blocks, and more
- **Word-style pagination** with WYSIWYG layout
- **Inline remarks / comments** — mark any sentence with a side note; DOCX annotated exports use native Word comments
- **KaTeX** math formula support
- Customizable fonts, font size, line height, and colors
- **Text to speech on desktop and Android** — read the selection or current chapter with pause, resume, voice, and speed controls
- **Current paragraph highlight** — optional focus tint plus a retained caret when the editor loses focus
- Real-time word / character / paragraph count

### 🤖 AI Writing Assistant
- **Multi-provider support**: ZhipuAI GLM / DeepSeek / OpenAI / Google Gemini / Claude / SiliconFlow / Volcengine / Alibaba Cloud Bailian / MiniMax / Moonshot + custom endpoints
- **Smart model fetching** — one-click fetch full model list from API, keep saved models manageable even if a provider stops returning them
- **Continue / Rewrite / Polish / Expand** — one-click generation
- **Immersive Writing Engine (Ghost Text)** streaming preview — see AI output in real-time like Cursor, with accept/reject
- **Free chat mode** — discuss plot, characters, and settings with AI
- **Configurable chat send shortcut** — choose Enter to send or Ctrl/⌘ + Enter to send, for both compact and expanded chat input
- **Global AI Memory (Context Engine)** — AI automatically reads your character profiles, worldbuilding, and previous chapters to maintain story consistency
- **Choose AI references by volume** — select whole volumes or individual chapters; clearing all references stays saved
- **Optional strikethrough exclusion** — off by default; AI can skip struck-through text while preserving the original manuscript and formatting

### 📚 Worldbuilding Manager
- **Tree-structured** management for characters, locations, items, outlines, and writing rules
- Three writing modes: **Web Novel** / **Literary Fiction** / **Screenplay**, each with dedicated fields
- Color-coded categories with glassmorphism design
- Rename top-level categories per work from the full settings panel or the sidebar category popover edit mode
- Settings automatically injected into AI context

### 💾 Data Management
- **Local-first** — creative data stays in browser IndexedDB by default; selected data is sent only when you explicitly enable cloud sync, WebDAV, or LAN transfer
- **Snapshot system** — manual/auto versioning with one-click rollback
- **Project import/export** — full project JSON backup
- **Multi-format export** — one-click export current chapter or batch export (TXT / Markdown / DOCX / EPUB / PDF), with body-only or annotated versions

### 📱 Mobile App
- **Android app** — native Flutter app with local-first writing and richer reading mode controls
- Read and write your novels on the go
- Author Cloud account sign-in is available only in the official web app; the mobile app does not provide account sign-in

### 🌐 Internationalization
- 🇨🇳 简体中文 / 🇺🇸 English / 🇷🇺 Русский

### 🎨 User Experience
- Eye-comfort warm tones / dark mode toggle
- Interactive onboarding tour
- Help panel with keyboard shortcuts

---

## 💻 Desktop & Mobile

**No Node.js required!** Download the pre-built installer:

- 📥 [Download Author Setup (Windows)](https://github.com/YuanShiJiLoong/author/releases/latest)
- 📱 [Download Author APK (Android)](https://github.com/YuanShiJiLoong/author/releases/latest)

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

> 💡 **Highly Recommended**: For most users who only need daily writing, please [directly download and install the client](https://github.com/YuanShiJiLoong/author/releases/latest). Source code or Vercel deployment is intended for advanced users who need **secondary development** or want to configure WebDAV or their own Author sync server.

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

### Subpath Deployment

Set `NEXT_PUBLIC_BASE_PATH` only when mounting your self-hosted app below the domain root. For example:

```env
NEXT_PUBLIC_BASE_PATH=/app
```

Keep real domains, registration values, service endpoints, credentials, and operator configuration in your own deployment environment rather than committing them to the repository.

### Deploy to Vercel

> 💡 **⚠️ Note:** A Vercel deployment does not include the official Author Cloud account service. Use local storage, WebDAV/LAN, or your own Author sync server.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YuanShiJiLoong/author)

### ☁️ Sync Options

- Account-based Author Cloud sync is available only in the [official web app](https://free.author2.com/app).
- The desktop client does not connect to the official Author Cloud. It supports WebDAV, temporary LAN transfer, and user-owned Author sync servers under **Preferences → Cloud Sync**.
- The mobile app does not provide Author Cloud account sign-in. Use local backup and export for data portability.
- Source and Vercel deployments do not include the official account service; use WebDAV/LAN or connect your own Author sync server.

---

## 🔄 Updating

### Desktop Client Users

Download the latest installer from the [Releases](https://github.com/YuanShiJiLoong/author/releases/latest) page and install it over your current version. Your data is stored in the browser/Electron profile. Export a backup before upgrading, and keep your existing access address and user-data directory.

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
| ZhipuAI (GLM) | `ZHIPU_API_KEY` | [open.bigmodel.cn](https://open.bigmodel.cn/) |
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

> 🖥️ **Local models (Ollama, LM Studio, …):** choose **Custom compatible endpoint** and enter the model server's address (usually ending with `/v1`). For Docker / NAS setups and troubleshooting, see the [Local Model Guide](LOCAL_MODELS_EN.md).

---

## 🔍 Web Search Configuration

Author supports AI-powered web search for real-time information. Different providers handle search differently:

| Provider | Search Method | Extra Setup |
|----------|--------------|-------------|
| Gemini (Native) | Built-in Google Search | No extra config needed |
| OpenAI / OpenAI Responses | Built-in Web Search | No extra config (needs search model) |
| DeepSeek | Built-in web tools (deepseek-flash); other models use DeepSeek Search (external) | Reuses your DeepSeek API Key |
| ZhipuAI / SiliconFlow / Claude / Others | External Search API | **Search tool Key required** (Tavily, Exa, or DeepSeek) |

For providers without built-in search, choose a search tool (Tavily, Exa, or DeepSeek) and enter its API Key:

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

### DeepSeek Search

1. If DeepSeek is already set up in Author: go to Author Settings → Web Search → select **DeepSeek**. The Key and URL are filled in automatically
2. Otherwise: create an API Key at [platform.deepseek.com](https://platform.deepseek.com/api_keys), select **DeepSeek**, and paste it

- **Read web pages**: with "Let AI read full web pages" on, paste a link in the chat and the AI reads the page before answering (up to 3 pages per answer)
- **Read pages picked from search results** (off by default): the AI picks a few pages from the search results and reads them in full. More detailed, but a few seconds slower

> Pricing: billed per request from Nov 1, 2026. Search and page reading cost $0.75 per 1,000 successful requests, charged to your DeepSeek balance; failed or empty requests are free. Up to 5 requests per second per account

### Custom Search API URL (Proxy Pool)

If you've set up a Tavily/Exa proxy pool using multiple free-tier accounts, you can configure a **custom API URL** in the search settings:

1. In Author Settings → Web Search → Search engine config area
2. Find the "🔗 Custom API URL (optional)" input field
3. Enter your proxy URL, e.g. `https://your-proxy.com`
4. Leave blank to use the official default URL

> 💡 For Tavily / Exa, the system automatically appends `/search` to your URL — no need to add it manually

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

If your embedding service requires no API key, turn off chat-key reuse and leave the embedding key blank.

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
- Creative data (chapters, settings, snapshots) is stored locally in browser IndexedDB by default. If you explicitly enable Author Cloud, WebDAV, or LAN transfer, the selected sync data is sent to the configured service or peer.
- Browser deployments store AI API keys in localStorage; the desktop client protects them with the operating system's secure storage.

### ⚠️ Data Flow When Using AI Features

When the provider supports browser access and no proxy or web search is enabled, the official web app sends your **API key** and **AI request text** directly from your browser to the provider.

For providers that block direct browser access, configured proxy endpoints, web search, or deployments that disable direct calls, the request passes through that deployment's API routes before reaching the provider. The desktop client uses a loopback service on the same computer.

- Enter API keys only in deployments you trust.
- Prefer restricted, revocable provider keys where available.
- Self-host the application if you need full control over the relay environment.

---

## 📄 License

This project is licensed under [AGPL-3.0](LICENSE).

**In short**:
- ✅ Free to use, modify, and distribute
- ✅ Personal and commercial use allowed (as long as you open-source your changes)
- ⚠️ Modified versions must also be open-sourced under AGPL-3.0 (including network services / SaaS)
- ⚠️ Original copyright notice must be preserved
- ❌ Closed-source commercial use is NOT allowed

See [Public Repository Safety Boundary](OPEN_CORE_BOUNDARY.md) for the material that must remain outside public source and releases.

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

### 🛡️ Community Contributors
- [@inliver233](https://github.com/inliver233) — Reported several security issues with reproduction steps and proposed fixes, covering update-endpoint authentication, server-side request address validation, link and export-title escaping, and error-message sanitization. All of them have been fixed

### 🤖 AI Companions
| Name | Role |
|------|------|
| [ChatGPT 5.5](https://openai.com/chatgpt/) (xhigh) | Primary reasoning and coding model |
| [Claude Opus 4.6](https://www.anthropic.com/) (Thinking) | Architecture, implementation, and debugging collaborator |
| [Gemini 3.1 Pro](https://deepmind.google/technologies/gemini/) (High) | UI review, screenshot analysis, design iteration |
| [Gemini 3 Flash](https://deepmind.google/technologies/gemini/) | Built-in browser automation tool |

### 🛠️ AI Programming IDE
- [Antigravity](https://antigravity.google/) — AI programming partner
- [Codex](https://openai.com/codex/) — Primary AI coding tool

### 🔌 MCP Tools
- [Chrome DevTools MCP](https://developer.chrome.com/) — Browser testing, performance analysis, DOM inspection
- [GitHub MCP](https://github.com/) — Repository management, automated releases, code search

### ☁️ Deployment
- [Vercel](https://vercel.com/) — Optional full-stack hosting for self-deployed copies

### 📦 Frontend & Open Source
- [Next.js](https://nextjs.org/) — React full-stack framework
- [Tiptap](https://tiptap.dev/) — Core editor framework
- [Zustand](https://zustand-demo.pmnd.rs/) — State management
- [KaTeX](https://katex.org/) — Math rendering

### 🌟 Inspiration & Reference
Author's multi-provider API configuration experience was inspired by RikkaHub, Cherry Studio and other open-source AI clients in their approach to Provider, model, Base URL, and local key management.

- Cherry Studio: [github.com/CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio)
- RikkaHub: [github.com/RikkaApps/RikkaHub](https://github.com/RikkaApps/RikkaHub)
- This project does not contain any source code, assets, or binaries from RikkaHub or Cherry Studio. If their code is directly referenced in the future, their respective licenses must be observed.

### 🔤 Typography
- [LXGW WenKai (霞鹜文楷)](https://github.com/lxgw/LxgwWenKai) — Elegant local Chinese reading font
- [Inter](https://fonts.google.com/specimen/Inter) — Clean UI English font
