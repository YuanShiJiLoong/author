## v1.2.23 — 正文备注批注与失效模型清理 | Inline remarks and stale model cleanup

### 🇨🇳 中文

#### 📝 正文备注 / 批注
- **新增正文备注格式**：选中一句话或一段文字后，可从工具栏或选区气泡菜单添加备注；正文会显示虚线标记，并在宽屏纸页右侧显示侧注卡片
- **备注不混入正文**：备注内容以独立标记保存，正文统计、正文导出和普通阅读不会被备注文字污染
- **支持编辑与删除备注**：再次选中已有备注可修改；在编辑备注时留空即可删除该备注

#### 📤 导出正文 / 批注版
- **导出更多新增内容版本选择**：可选择“正文”或“批注版”
- **正文版自动剥离备注**：TXT、Markdown、DOCX、EPUB、PDF 的正文版都不会带出备注内容
- **DOCX 批注版使用 Word 原生批注**：导出的 DOCX 会写入 `comments.xml` 和批注锚点，Word / WPS / Google Docs 可识别为右侧批注气泡
- **其他格式保留可读批注**：TXT、Markdown、EPUB、PDF 的批注版会以内联 `〔批注：...〕` 方式保留备注内容

#### 🤖 模型列表管理
- **已保存但未返回的模型不再“消失”**：从 API 拉取模型列表时，已加入快切或当前使用的模型会继续显示
- **新增“未返回”标识和清理按钮**：供应商不再返回的模型会标记为“未返回”，可在模型选择弹窗中一键清理
- **覆盖主模型与 Embedding 模型**：对话模型和独立向量模型选择器都支持该清理逻辑
- **DeepSeek 旧模型提示保留**：`deepseek-chat` / `deepseek-reasoner` 继续显示 2026-07-24 停用提醒

#### 📚 文档同步
- **更新帮助页**：补充备注 / 批注、导出正文/批注版、未返回模型清理说明
- **同步多语言 README**：中、英、俄、阿 README 均补充备注批注、DOCX 原生批注导出和模型清理能力

---

### 🇬🇧 English

#### 📝 Inline Remarks / Comments
- **Added an inline remark format**: Select a sentence or text range and add a remark from the toolbar or selection bubble menu; the body text shows a dashed marker and wide layouts render side notes outside the page
- **Remarks do not pollute body text**: Remark content is stored as separate markup, so word counts, body-only exports, and normal reading stay clean
- **Edit and remove remarks**: Select an existing remark to edit it; leave the prompt empty to remove that remark

#### 📤 Body-only and Annotated Exports
- **Export More now supports content variants**: Choose either “Body” or “Annotated”
- **Body exports strip remarks automatically**: TXT, Markdown, DOCX, EPUB, and PDF body exports do not include remark content
- **DOCX annotated exports use native Word comments**: Generated DOCX files include `comments.xml` and comment anchors, so Word / WPS / Google Docs can render them as real side comments
- **Other formats keep readable annotations**: TXT, Markdown, EPUB, and PDF annotated exports preserve remarks inline as `〔批注：...〕`

#### 🤖 Model List Management
- **Saved models no longer disappear when providers stop returning them**: Models already in quick switch lists or currently selected remain visible after fetching the provider model list
- **Added “Not returned” badges and cleanup actions**: Stale provider models are marked and can be removed from the model picker
- **Covers chat and embedding models**: The cleanup logic applies to both primary AI models and dedicated embedding models
- **DeepSeek deprecation hints remain visible**: `deepseek-chat` and `deepseek-reasoner` continue to show the 2026-07-24 retirement notice

#### 📚 Documentation
- **Updated the Help panel**: Added guidance for remarks/comments, body vs annotated exports, and stale model cleanup
- **Updated multilingual READMEs**: Chinese, English, Russian, and Arabic READMEs now mention remarks, native DOCX comments, and model cleanup
