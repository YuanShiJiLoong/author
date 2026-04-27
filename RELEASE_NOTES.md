## v1.2.20 — 修复粘贴排版 & 聊天记录快照 | Paste formatting fix & chat session snapshots

### 🇨🇳 中文

#### 📋 编辑器粘贴排版修复
- **修复从对话中复制 Markdown 粘贴后出现大片空白的问题**：从 AI 聊天或其他对话窗口复制含 Markdown 格式的文本粘贴到编辑器时，连续空行会被解析为多个空段落，导致段落间产生过大的间距
- **新增粘贴内容清理**：HTML 粘贴时自动合并连续空段落；纯文本粘贴时压缩多余空行后再进行 Markdown 解析
- **CSS 安全兜底**：即使已有内容中存在连续空段落，也会被自动折叠为零高度，不再产生视觉空白

#### 💬 AI 聊天记录持久化与快照
- **聊天会话纳入快照系统**：创建快照时会同步保存当前所有 AI 聊天会话和消息，恢复快照时一并还原聊天记录
- **聊天会话自动持久化**：聊天数据变更后自动防抖保存，页面隐藏或关闭前立即刷盘，避免聊天记录丢失
- **快照云同步精简**：优化上传到云端的快照数据结构，仅包含必要字段

#### 🗂️ 设置分类管理优化
- **防止拖拽循环依赖**：拖拽移动设置项时，检测目标位置是否会形成父子循环引用，阻止无效拖拽操作
- **修复子节点计数中的潜在无限循环**：递归统计子节点数量时增加环路检测保护

---

### 🇬🇧 English

#### 📋 Editor Paste Formatting Fix
- **Fixed large blank gaps when pasting Markdown from conversations**: Copying Markdown-formatted text from AI chat or other dialogue windows and pasting it into the editor would parse consecutive blank lines as multiple empty paragraphs, creating excessive spacing
- **Added paste content cleanup**: HTML pastes now auto-merge consecutive empty paragraphs; plain-text pastes compress extra blank lines before Markdown parsing
- **CSS safety net**: Consecutive empty paragraphs already in content are collapsed to zero height, preventing visual gaps

#### 💬 AI Chat Session Persistence & Snapshots
- **Chat sessions included in snapshots**: Creating a snapshot now saves all AI chat sessions and messages; restoring a snapshot also restores the chat history
- **Auto-persist chat sessions**: Chat data is automatically saved with debounce after changes, and immediately flushed when the page is hidden or before unload, preventing data loss
- **Streamlined cloud snapshot data**: Optimized the snapshot payload uploaded to the cloud to include only essential fields

#### 🗂️ Settings Category Management Improvements
- **Prevented drag-drop circular dependencies**: Dragging settings items now checks if the target position would create a parent-child cycle, blocking invalid drops
- **Fixed potential infinite loop in child counting**: Added cycle detection to the recursive child-count function
