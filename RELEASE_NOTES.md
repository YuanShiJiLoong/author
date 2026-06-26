## v1.2.46 — 统一字数口径，改进向量模型获取与移动端长回复稳定性

### 中文

#### 桌面端 / Web

- 统一桌面端与移动端的字数统计口径：仅计汉字、字母和数字，标点与空格不计；编辑器状态栏、字数显示与项目导入的字数全部改用同一规则，确保跨端一致。
- 改进向量（Embedding）模型获取：区分“拉取失败”与“已连通但无可用嵌入模型”两种情况，结果就近显示在向量模型区下方，并在更换向量 Key、地址或服务商后自动复位，可用新配置重新拉取。
- AI 上下文中的设定字段标签（角色档案、世界观、大纲等）随界面语言切换中、英、俄，不再固定中文；AI 侧栏“生成设定”的默认目标分类名也跟随界面语言。
- 新增桌面端应用图标。

#### Android 端

- 修复 AI 对话在长回复时逐渐卡顿、最终可能崩溃的问题：流式渲染改为节流刷新，并在生成过程中使用轻量文本，待回复结束后再呈现完整排版与可应用的设定卡片。
- Android 版本号更新为 `1.2.46+1246`。

---

### English

#### Desktop / Web

- Unified the word-count rule across desktop and mobile: only letters, digits, and CJK characters are counted while punctuation and spaces are excluded, applied consistently to the editor status bar, the word display, and project import counts.
- Improved embedding model discovery: distinguish a failed request from a connected provider that simply has no embedding models, show the outcome directly under the embedding section, and reset it after changing the embedding key, endpoint, or provider so a new configuration can re-fetch.
- Setting field labels sent in the AI context (character profiles, worldbuilding, outline, and so on) now follow the interface language across Chinese, English, and Russian instead of being fixed in Chinese; the default destination categories in the AI sidebar’s Generate Settings also follow the interface language.
- Added a desktop application icon.

#### Android

- Fixed AI chat becoming progressively laggy and potentially crashing on long replies: streaming now throttles UI refreshes and uses lightweight text while generating, then renders the full formatting and applicable setting cards once the reply completes.
- Android is now version `1.2.46+1246`.
