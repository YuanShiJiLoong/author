## v1.2.37 — 完善移动端章节概要中心与夜间模式

### 中文

#### 桌面端 / Web

- 修正章节概要中心列表行操作：缺概要章节可直接生成，已有概要可直接进入编辑，重新生成会显示对应章节的生成中状态。
- 生成、编辑、锁定按钮在单章概要生成期间会正确禁用，避免切换章节时把草稿或锁定状态写到错误章节。
- 保持单章概要“AI 生成草稿后再保存”的确认流程，与移动端新概要中心同步。

#### Android 端

- Android 版本更新为 `1.2.37+1237`。
- 章节列表新增概要入口与概要状态展示，可在移动端查看每章已概要、缺概要、锁定等状态。
- 新增移动端章节概要中心，包含单章概要、多章概要、概要分组、已保存四个视图，并与桌面端的 `synopsis` 和多章概要组存储结构对齐。
- 单章概要支持 AI 生成、手写编辑、结尾状态、锁定、保存；生成只填入草稿，保存后才同步写入章节。
- 多章概要支持选择章节、AI 生成草稿、保存为概要分组；概要分组会写入桌面端同一个 `author-chapter-memory-groups-{workId}` 数据键。
- 夜间模式下设定相关页面、输入框、卡片和浮层改用统一暗色 token，修复浅色块内文字过淡、字号不适配和内容溢出的问题。
- 新增水墨、科幻、血迹三类概要主题素材资源，为后续进度动画和状态视觉提供统一资产基础。

---

### English

#### Desktop / Web

- Fixed row-level actions in the Chapter Synopsis Center: missing chapters can generate directly, saved chapters enter edit mode directly, and regeneration shows progress on the exact chapter row.
- Disabled generation, edit, and lock actions consistently while a single-chapter synopsis is being generated, preventing drafts or lock state from landing on the wrong chapter.
- Kept the confirm-before-save flow for AI-generated single-chapter synopsis drafts, matching the new mobile center.

#### Android

- Android is now version `1.2.37+1237`.
- Added a chapter synopsis entry and per-chapter synopsis status display to the mobile chapter list.
- Added a mobile Chapter Synopsis Center with Single, Multi, Groups, and Saved views, aligned with the desktop `synopsis` field and multi-chapter group storage.
- Single-chapter synopsis now supports AI generation, manual editing, ending state, locking, and explicit save; generation fills a draft and only syncs after saving.
- Multi-chapter synopsis now supports chapter selection, AI draft generation, and saving as a synopsis group using the same `author-chapter-memory-groups-{workId}` key as desktop.
- Dark mode lore/settings pages, inputs, cards, and sheets now use unified dark color tokens, fixing overly bright surfaces, faint text, font sizing, and overflow issues.
- Added ink, sci-fi, and blood-style synopsis theme assets as the visual foundation for future status and progress animations.
