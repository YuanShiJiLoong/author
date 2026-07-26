## v1.2.49 — 旧版云同步 8 月 1 日停止服务，三端上线停服公告

> **⚠️ 重要提示 / Important**
>
> - **旧版云同步（Firebase / Google 登录）将于 2026 年 8 月 1 日停止服务**，届时存放在旧版云端的数据将**无法取回**。请在此之前完成迁移。
> - **你的作品保存在本机，不会因此丢失**；WebDAV / 局域网同步同样不受影响。
> - 账号云同步请前往官方网页版：**https://free.author2.com/app**
> - **The legacy cloud sync (Firebase / Google sign-in) shuts down on August 1, 2026.** Data stored in the legacy cloud will no longer be retrievable — please migrate before then.
> - **Your work is stored on this device and will not be lost**; WebDAV / LAN sync is unaffected.
> - For account cloud sync, use the official web app: **https://free.author2.com/app**

### 中文

#### 桌面端 / Web

- 新增旧版云同步停服公告：还登着旧版账号的用户启动时会看到一次弹窗，说明停服日期、云端数据将无法取回，以及本地作品不受影响；关闭后顶部保留常驻横幅并显示倒计时。进入最后 3 天与已停服两个阶段时会各再提醒一次，确保关键节点不会错过。
- 停服公告只找云端可能还有数据的人（当前登着旧版账号，或曾登录过旧版且尚未启用新版账号）；已完成迁移与从未用过云同步的用户不会被打扰。
- 迁移向导适配停服后场景：8 月 1 日之后旧版服务器已关闭，向导会自动跳过"登录旧版账号取回数据"这一步（那时必定失败），直接引导注册新版账号并整批上传本机作品。
- 登录窗口的旧版入口新增停服倒计时提示，避免用户对着一个已经关闭的服务反复尝试登录。
- 帮助文档「☁️ 云同步」章节按停服后的实际情况重写（中 / 英 / 俄三语）：完整保留 WebDAV 与局域网同步说明，账号云同步指向官方网页版；各版本同步能力对照表同步更新。
- README（中 / 英 / 俄 / 阿四语）更正"桌面客户端内置 Firebase 同步"的旧表述；自部署用户配置自有 Firebase 的教程保持不变（自建项目不受本次停服影响）。
- 卸载程序新增可选项「删除本地数据：作品、设置、登录状态」：默认不勾选，勾选后还会再确认一次并说明不可恢复；静默卸载时默认不删除。
- 新增本地数据抢救脚本 `scripts/recover-indexeddb.py`：卸载或重装后应用内看不到作品、但数据文件仍在时，可离线解析 IndexedDB 并把章节正文与快照导出成 txt / html。脚本仅使用 Python 标准库，全程本地运行，不联网。

#### Android 端

- 新增旧版云同步停服弹窗：还登着旧版账号的用户启动时提醒，含倒计时、停服后果与"本机作品不受影响"的说明；确认后本阶段不再打扰，进入最后 3 天与已停服阶段会各再提醒一次。
- 同步页新增常驻停服警告卡，只要还登着旧版账号就一直显示，可一键前往迁移。
- 登录页的旧版（Firebase 邮箱 / Google）入口顶部新增停服倒计时——这个入口在 8 月 1 日之后将无法登录成功。
- 停服文案覆盖中 / 英 / 俄 / 阿四语，与桌面端口径一致。
- Android 版本号更新为 `1.2.49+1249`。

---

### English

#### Desktop / Web

- Added a legacy cloud sync shutdown notice: users still signed in to the legacy account see a dialog on launch explaining the shutdown date, that cloud data will no longer be retrievable, and that local work is unaffected. After dismissing it, a persistent top banner with a countdown remains. The dialog reappears once when entering the final-3-days stage and once after the shutdown, so key moments are never missed.
- The notice only targets people who may still have data in the legacy cloud (currently signed in to it, or previously signed in and not yet using the new account). Users who already migrated, or never used cloud sync, are never interrupted.
- The migration wizard now handles the post-shutdown case: after August 1 the legacy server is gone, so the wizard skips the "sign in to the legacy account to pull data" step (which would always fail) and goes straight to creating a new account and uploading local work in one batch.
- The legacy entry in the sign-in dialog now shows a shutdown countdown, so nobody keeps retrying against a service that has already closed.
- The help center's "Cloud Sync" chapter was rewritten for the post-shutdown reality (Chinese / English / Russian): WebDAV and LAN sync documentation is kept in full, account cloud sync points to the official web app, and the per-edition capability table was updated accordingly.
- READMEs (Chinese / English / Russian / Arabic) corrected the outdated "desktop client includes built-in Firebase sync" claim. Instructions for self-hosters configuring their own Firebase project are unchanged — private projects are unaffected by this shutdown.
- The uninstaller gained an optional "Delete local data: works, settings, sign-in" step: unchecked by default, with a second confirmation spelling out that it cannot be undone, and never deleting anything during a silent uninstall.
- Added a local data recovery script, `scripts/recover-indexeddb.py`: when works are missing in the app after an uninstall or reinstall but the data files are still on disk, it parses IndexedDB offline and exports chapters and snapshots as txt / html. It uses only the Python standard library and never touches the network.

#### Android

- Added the legacy cloud sync shutdown dialog on launch for users still signed in to the legacy account, with a countdown, the consequences of the shutdown, and a clear note that work on the device is unaffected. Once acknowledged it stays quiet for that stage, reappearing once for the final-3-days stage and once after shutdown.
- The sync page now shows a persistent shutdown warning card for as long as the legacy account remains signed in, with a one-tap route to migration.
- The legacy (Firebase email / Google) entry on the sign-in page now carries a shutdown countdown — that entry will stop working after August 1.
- Shutdown copy is available in Chinese, English, Russian, and Arabic, matching the desktop wording.
- Android version bumped to `1.2.49+1249`.
