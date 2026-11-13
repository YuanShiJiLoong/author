## v1.2.62 — 安卓端：修复切到设定卡顿，支持 DeepSeek 内置联网，全新首屏

### 中文

#### 桌面端与网页版

- 本版没有功能改动，只更新版本号。

#### 安卓端

- **修复从 AI 切到「设定」时的卡顿**：以前每次切到设定页都会把全部设定重新读取、解析一遍，设定一多就会明显卡住。现在设定没有变化时直接复用，切换基本不再等待；设定页统计各分类条目也更快了。
- **DeepSeek 内置联网**：服务商选 DeepSeek、模型用 deepseek-flash 时，开启联网搜索后由 DeepSeek 直接搜索和读取网页，不用另配搜索工具。其他模型仍可使用独立搜索模型或 Tavily、Exa 等外部搜索。
- **搜索来源改版**：来源显示在回复末尾，同一网页只出现一次，只列标题，不显示网址；长按某条来源可以看到完整网址。来源超过 4 条时，可在标题行点「全部」展开。
- **全新首次启动页**：原来的三页介绍换成一页，一句小说开头逐字写在稿纸上，下面用三行说明本机写作、设定和 AI 建议，点「开始写作」即可进入。
- 构建工具升级到 Flutter 3.50，并更新了部分依赖。

---

### English

#### Desktop and Web

- No functional changes in this release; version number update only.

#### Android

- **No more lag when switching from AI to Lore**: the Lore tab used to reload and re-parse every entry each time it opened, which stalled noticeably with a lot of lore. Unchanged lore is now reused, so switching is near-instant, and per-category counts on the Lore page are faster too.
- **DeepSeek built-in web search**: with DeepSeek as the provider and the deepseek-flash model, web search is done by DeepSeek itself, including reading pages, with no separate search tool needed. Other models can still use a separate search model or external search such as Tavily and Exa.
- **Redesigned sources**: sources appear at the end of the reply, each page only once, as titles without URLs; long-press a source to see its full URL. With more than 4 sources, tap **All** next to the heading to expand.
- **New welcome screen**: the three intro slides are replaced by a single page, with an opening line written onto manuscript paper, three short points about local writing, lore and AI suggestions, and a **Start writing** button.
- Build tools updated to Flutter 3.50, along with some dependencies.
