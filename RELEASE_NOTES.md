## v1.2.61 — 支持 DeepSeek 内置联网，搜索来源改到回复末尾

### 中文

#### 桌面端与网页版

- **DeepSeek 内置联网**：服务商选 DeepSeek、模型用 deepseek-flash 时，开启联网搜索后由 DeepSeek 直接搜索和读取网页，不用另配搜索 Key，回答更快。
  - 设置里可以在「内置搜索 / 外部搜索」之间切换；想用 Tavily、Exa 等其他来源，选「外部搜索」即可。
  - 其他 DeepSeek 模型暂不支持内置联网，会自动改用外部搜索，设置面板里会有提示。
  - 「允许 AI 读取网页全文」开关同样适用于内置联网。按次收费：每 1000 次搜索或读网页各 0.75 美元，从 DeepSeek 账户余额扣。
- **搜索来源改到回复末尾**：同一网页只显示一次，平时只列标题；鼠标悬停时显示站点和完整网址。来源超过 4 条时，可以在「来源」标题行点「全部」展开。
- **生成时可以往上翻**：AI 输出过程中往上滚动，不会再被拉回底部；滚回底部或发送新消息后，恢复自动跟随。
- **代理工具导致连接失败时提示原因**：自行部署或从源码运行时，如果代理工具开着 TUN / fake-ip 模式，API 域名会被解析成代理给的假地址，被安全检查当成内网地址拦截。以前只提示"检查 API 地址和 Key"，现在会说明原因和解决办法。桌面版不受影响。
- 更新了 DeepSeek 搜索的限额说明，帮助页和各语言 README 的联网搜索部分同步更新。

#### 安卓端

- 本版没有功能改动，只更新版本号。

---

### English

#### Desktop and Web

- **DeepSeek built-in web search**: with DeepSeek as the provider and the deepseek-flash model, web search is now done by DeepSeek itself, including reading pages. No extra search key is needed, and answers come faster.
  - Settings let you switch between **Built-in** and **External** search; choose External to use Tavily, Exa or other sources.
  - Other DeepSeek models do not support built-in web tools yet and automatically fall back to external search, with a note in settings.
  - The **Let AI read full web pages** switch also applies to built-in search. Billed per use: $0.75 per 1,000 searches and $0.75 per 1,000 page reads, charged to your DeepSeek balance.
- **Sources moved to the end of replies**: each page appears only once and only its title is listed; hover to see the site and full URL. With more than 4 sources, click **All** next to the "Sources" heading to expand.
- **Scroll up while the AI is writing**: scrolling up during generation no longer snaps back to the bottom; auto-follow resumes when you scroll back down or send a new message.
- **Clearer message when a proxy tool blocks connections**: when self-hosting or running from source with a proxy tool in TUN / fake-ip mode, API domains resolve to placeholder addresses from the proxy and get blocked as private addresses. Instead of only "check the API address and Key", the message now explains why and how to fix it. The desktop app is not affected.
- Updated the DeepSeek search rate-limit text, and the web search sections of the help page and every README.

#### Android

- No functional changes in this release; version number update only.
