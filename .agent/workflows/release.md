---
description: 发版流程 — 提交代码、更新版本号、打 tag、推送触发自动构建
---

# 发版流程 / Release Workflow

## 文档与引导检查

**【必须在所有流程之前完成】**

1. 先运行发版预检脚本，确认本流程文件可见，并明确本次是完整发版还是移动端紧急修复：

```powershell
.\scripts\release-preflight.ps1

# 如果是只刷新移动端 APK 的紧急修复，必须显式声明：
.\scripts\release-preflight.ps1 -MobileOnlyHotfix
```

脚本通过不代表可以跳过本文档；它只负责防止遗漏隐藏流程文件，并提醒必须先阅读本发版流程。

2. 检查帮助页面（HelpPanel.js）和开局引导（WelcomeModal.js / TourOverlay.js）以及所有语言的readme部分是否需要更新：
   - 本版本是否新增/修改了用户可感知的功能？
   - 帮助页面是否覆盖了新功能的说明？
   - 引导流程是否需要调整步骤？
   - readme部分是否需要调整？
   - 有没有几个语言的readme存在信息不同步，版本不一样的问题？
   
   **如果需要更新，和用户讨论后再决定是否修改。** 
   确认无需更新或已更新完毕后，才可继续后续安全检查。

## 前置安全检查

以下检查必须覆盖**一切**与计划、方案、敏感信息相关的文件，不限于固定列表。

**原则：语义审查优先于脚本匹配。** 不要因为脚本没有命中就认定安全；每次发版都必须主动判断
本次改动里是否出现新命名、新目录、新产物、新设计文件、移动端资产或私有方案材料。固定规则只
能拦截已知高风险项，不能替代人工/模型对上下文含义的判断。

必须按固定顺序执行：**先跑脚本，再从零复查**。脚本负责先拦截已知高风险项；复查负责按本
次改动的实际含义继续判断是否有新命名、新目录或新资产泄漏。

// turbo
3. 先运行辅助脚本统一执行主要阻断项检查：

```powershell
.\scripts\release-safety-check.ps1
```

脚本失败必须先修复阻断项。脚本通过不代表可以跳过下面的人工核实，也不能作为"可以发版"的
最终结论；它只用于提前拦截移动端私有资产、`docs/`、密钥关键词和忽略规则缺口。若本次出现
脚本规则未覆盖的新资产或新命名，必须按语义继续审查并补充规则。

// turbo
4. 脚本通过后，重新检查 `.gitignore` 是否覆盖了敏感目录和文件类型：
```bash
cat .gitignore
```
确认以下类型均被忽略（如有遗漏需先补上）：
- 环境变量文件（`.env*`，`.env.local` 等）
- 日志文件（`*.log`，`firebase-debug.log` 等）
- 内部文档目录（至少 `docs/`；临时计划、草稿、内部说明统一放这里）
- 密钥和凭证文件的明确类型（`*.key`，`*.pem` 等）
- 构建产物（`dist/`，`.next/` 等）

注意：`.gitignore` 保持保守，不要为了省事加入过宽的名字匹配（如 `*secret*`、`*credential*`），以免把本来应该提交的特殊文件也一起忽略。对于临时计划、草稿、内部说明，优先移动到 `docs/`，而不是扩大全局忽略规则。

// turbo
5. 全面扫描已追踪文件中是否有敏感文件：
```bash
git ls-files | findstr /i "secret credential key\.pem env\.local plan 方案 计划 doc 草稿 draft private internal debug\.log"
```
除 `.env.example`、`README` 类说明文档、源码中合理使用的文件外，不应有任何敏感文件。**发现可疑文件必须逐个核实。** 如果是临时计划、草稿、内部说明，优先移入 `docs/`，不要临时往 `.gitignore` 里追加过宽规则。

// turbo
6. **【关键】移动端私有资产泄漏扫描**（此项目的移动端为闭源私有仓库，绝对不可泄露到本开源仓库）：
```bash
git ls-files | findstr /i "\.dart mobile flutter home_screen pubspec\.yaml podfile stitch"
```
**必须无匹配结果。** 如果有任何 `.dart` 文件、`mobile/` 目录下文件、Flutter 配置文件、或移动端 UI 设计稿（如 `home_screen.html`）被追踪，必须立即用 `git rm --cached <file>` 移除追踪并确认 `.gitignore` 已覆盖。**此项为硬性阻断项，不通过则禁止继续发版。**

同时检查暂存区（staged）中是否混入移动端文件：
```bash
git diff --cached --name-only | findstr /i "\.dart mobile flutter home_screen pubspec\.yaml"
```
同样必须无匹配结果。

// turbo
7. 扫描本次改动中是否有密钥、API Key 或敏感信息泄露：
```bash
git diff -- . ":(exclude)package-lock.json" | findstr /i "api_key apikey secret_key token password credential private_key firebase_api sk- Bearer"
```
应该无匹配结果。如有匹配，必须逐条审查是否为真正的密钥泄露。

// turbo
8. 检查是否有不应提交的文件被暂存（重点关注非代码文件）：
```bash
git status --short
```

9. **【必须】向用户汇报安全检查结果**，包括：
   - `.gitignore` 是否完整覆盖敏感文件
   - 临时计划/草稿/内部说明是否已统一放入 `docs/`
   - 是否有意外追踪的敏感文件
   - **移动端/Flutter 私有资产是否完全隔离（第 5 步结果）**
   - 本次是否出现固定规则未覆盖的新命名/新资产，以及语义审查结论
   - diff 中是否存在密钥泄露
   - 本次待提交的文件清单
   - 任何可疑发现的详细说明
   等待用户确认通过后，才可继续后续步骤。

## 撰写发版文案（非常重要）

**【强制规范】每次推送代码前，都必须全面更新以下两个文件！**

10. **【必须】** 更新或创建 `RELEASE_NOTES.md`，用作 GitHub Release 的详细双语更新日志：
   - 梳理完整的中、英双语更新日志，内容涵盖**本版本与上一版本之间的所有改动**。
   - **常规版本升级**：总结新旧两个版本间的核心功能差异。
   - **紧急修复（版本号不变）**：不可覆盖已有日志！在现有内容基础上**追加**本次修复的简要说明。
   - 如果丢失了原文件结构，请沿用上一版的排版格式。

11. **【必须】** 更新或创建 `RELEASE_TITLE.txt`，用作 GitHub Release 的精简标题：
   - 根据上一步写好的详细日志，**提炼出一句话总结**。
   - **格式规范：必须采用 `中文标题 | 英文标题`（中间用竖线隔开）的结构。**
   - 示例：`修复了云端断网时的卡顿崩溃 | Fixed stuttering crash in offline cloud modes`
   - 注意：只写标题正文即可，**切勿带版本号前缀**（例如不要写 `Author vX.Y.Z — ...`，构建脚本会自动拼接版本号）。

> **⚠️ 紧急修复（版本号不变）的特殊流程：** 写完上述两个文件后，跳过下方的"更新版本号"步骤，直接进入"提交与推送"。打 tag 时使用 `git tag -f vX.Y.Z` 强制覆盖旧 tag，推送时使用 `git push origin vX.Y.Z -f`。

## 更新版本号

> 如果是不改版本号的紧急修复，跳过此步骤。

12. 更新 `package.json` 中的版本号（替换 `X.Y.Z` 为目标版本）：
```bash
npm version X.Y.Z --no-git-tag-version
```

13. **【必须】同步更新移动端版本号**（`mobile/pubspec.yaml`）：
    - 版本格式：`X.Y.Z+VCODE`，其中 `VCODE = major × 1000 + minor × 100 + patch`
    - 例如：`1.2.28` → `1.2.28+1228`，`1.3.0` → `1.3.0+1300`，`2.0.0` → `2.0.0+2000`
    - versionCode 必须严格递增，Android 系统依赖此数字判断新旧版本
    - CI workflow 会从 pubspec.yaml 读取此值，确保本地和 CI 构建一致

## 提交与推送

14. 暂存并提交所有改动（包括文案与版本号）：
```bash
git add -A
git commit -m "vX.Y.Z: 简要描述本次更新内容"
```

15. 打 git tag（如果版本号不变则强制覆盖旧 tag）：
```bash
# 新版本号：
git tag vX.Y.Z

# 或版本号不变的紧急修复（强制覆盖）：
git tag -f vX.Y.Z
```

16. 推送代码和 tag（如果版本号不变则强制推送 tag）：
```bash
# 新版本号：
git push origin main && git push origin vX.Y.Z

# 或版本号不变的紧急修复（强制推送）：
git push origin main && git push origin vX.Y.Z -f
```

17. **提交并推送移动端仓库**（确保 CI 能拿到新的 versionCode）：
```bash
cd mobile
git add -A
git commit -m "vX.Y.Z: sync mobile version"
git push origin main
cd ..
```

## 自动构建

推送 `v*` tag 后，GitHub Actions 会自动触发：

- **`electron-build.yml`**：构建 Windows `.exe` 安装包 → 创建 GitHub Release（双语格式）
- **`docker-publish.yml`**：同样由 `v*` tag 触发构建 Docker 镜像 → 推送到 Docker Hub

构建进度：https://github.com/YuanShiJiLoong/author/actions

18. **桌面端 Release 创建成功后**，触发移动端 CI 构建 APK 并上传到同一 Release：
```bash
gh workflow run "Android APK to Author 1.2 Public Release" --repo YuanShiJiLoong/author-mobile -f release_tag=vX.Y.Z
```
- CI 会从 `pubspec.yaml` 读取 versionCode（如 1228），构建签名 APK
- 构建完成后自动上传 `author-mobile-vX.Y.Z.apk` + `author-mobile-latest.apk` 到公开 Release
- 移动端构建进度：https://github.com/YuanShiJiLoong/author-mobile/actions

## 构建完成后

19. 去 [Releases 页面](https://github.com/YuanShiJiLoong/author/releases) 确认：
    - 桌面端安装包文件名版本号正确（如 `author-setup-X.Y.Z.exe`）
    - 移动端 APK 已上传（`author-mobile-vX.Y.Z.apk` + `author-mobile-latest.apk`）
    - Release Notes 格式正确（双语）
    - 所有下载链接可用

20. （可选）下载 `.exe` 发到 QQ 群，或直接分享 Release 链接

## 本地打包（归档 / 离线分发）

21. **【发版流程最后一步】** CI 产物确认无误后，在本地额外打包一份与线上**同版本**的两端安装包，用于离线分发或归档。两端产物均被 `.gitignore` 忽略，不会进仓库：

```powershell
# 桌面端 Electron（清理 dist/.next → next build → electron-builder --win）
npm run electron:build
# 产物：dist\author-setup-X.Y.Z.exe

# 移动端 Android APK（依赖本机 Flutter SDK + mobile/android/key.properties + keystore 签名）
cd mobile
flutter pub get
flutter build apk --release
cd ..
# 产物：mobile\build\app\outputs\flutter-apk\app-release.apk
```

- **版本号校验（必须）**：两端本地产物的版本号必须与本次发版的 `X.Y.Z` 一致 —— 桌面读 `package.json` 的 `version`，移动读 `mobile/pubspec.yaml` 的 `version`。归档时建议把移动端产物重命名为 `author-mobile-vX.Y.Z.apk`。
- 桌面与移动构建可并行（互不依赖）。本地构建依赖本机环境（Node + Flutter SDK + 签名 keystore），产物与 CI 一致；若只需线上分发，用 GitHub Release 的产物即可，此步可跳过。

## 注意事项

- **版本号来源**：桌面端读取 `package.json` 的 `version` 字段，移动端读取 `mobile/pubspec.yaml` 的 `version` 字段。两者的版本号（X.Y.Z 部分）必须与 git tag 一致。
- **移动端 versionCode 规则**：`major × 1000 + minor × 100 + patch`，如 `1.2.28` → `1228`。CI workflow 从 pubspec.yaml 读取此值，本地和 CI 构建保持一致。
- **敏感文件**：`docs/`、`.env`、`firebase-debug.log` 等均被 `.gitignore` 忽略，不会进入 git 仓库和 Release 的 Source code 包。临时计划、草稿、内部说明优先统一放入 `docs/`，不要依赖过宽的名字匹配规则（如 `*secret*`、`*credential*`）来兜底。
- **移动端隔离**：`/mobile` 目录、`*.dart` 文件、`home_screen.html` 等移动端私有资产均被 `.gitignore` 忽略。每次发版前的第 5 步会强制扫描确认无泄漏。此项目的移动端为独立闭源仓库，绝不可混入开源代码。
- **Docker 安全**：Docker 使用多阶段构建，最终镜像只含构建产物（`.next/standalone`），不含源码和配置文件。
- **如果构建失败**：去 Actions 页面查看日志，修复后用 `git tag -f vX.Y.Z && git push origin vX.Y.Z -f` 强制更新 tag 重新触发。
