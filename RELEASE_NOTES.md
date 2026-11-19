## v1.2.63 — 作品打不开时可以一键恢复，同步不再扩散损坏的数据

### 中文

#### 桌面端与网页版

- **作品打不开时不再当成空作品**：以前章节记录读不出来时，会显示成一部空作品，之后的保存可能用空内容盖掉原来的记录，自动存档也会存下空内容。现在会停下来，不覆盖任何东西。
- **新的恢复页面**：作品打不开时直接显示。程序会比较同步账号、WebDAV 和本机自动存档，把最新的版本放在最前面，点「恢复这个版本」就能恢复，其他版本收在下面备选。读不出的原记录会另外保留，不会删除。从同步账号恢复时只恢复这一部作品，其他作品还没上传的修改不受影响。
- **自动存档更省心**：内容没有变化时不再重复存档，长时间开着不写，也不会把旧存档挤掉。
- **时光机**：作品打不开时也能直接恢复到某个存档；新增「导出此版本的章节（Markdown）」。
- **同步更稳**：本机某部作品的记录损坏时，不会再上传它，也不会把它当成"所有章节都删除了"同步到其他设备。WebDAV 和局域网同步同样不会推送损坏的记录，也不会用远端的损坏数据覆盖本机。
- **导出存档**：某部作品打不开时，其余作品照常导出，并提示少了哪一部；设定读不出时，不再用默认设定顶替。
- 桌面端崩溃提示不再承诺"文字不会丢失"，改为提醒重启后核对章节。
- 帮助页补充了作品打不开时如何恢复的说明。

#### 安卓端

- **随时能找回最新内容**：每次保存时，会把每章的最新正文另存一份在本机。作品打不开时，可以找回到最后一次保存的内容。副本只在本机，不参与同步。
- **新的恢复页面**：作品打不开时直接显示，自动比较本机备份、同步账号、WebDAV 和历史版本，把最新的放在最前面，一键恢复。
- **修复"显示已保存，其实没保存上"**：章节记录读不出时，编辑器自动保存和专注写作的「保存并离开」现在会明确提示没保存成功，刚写的文字留在编辑器里。
- **同步更稳**：损坏的记录不会被上传，也不会被当成删除同步到其他设备。

---

### English

#### Desktop and Web

- **A work that can't be read is no longer treated as empty**: previously, when a work's chapter record couldn't be read, it showed up as an empty work, later saves could overwrite the original record with empty content, and auto-saves could store the empty state. It now stops and overwrites nothing.
- **New recovery page**: shown when a work can't be opened. It compares your sync account, WebDAV, and this device's auto-saves, puts the newest version first, and restores it with **Restore this version**; other versions are listed below. The unreadable record is kept aside, never deleted. Restoring from your sync account restores only that work, so unsynced edits to other works are untouched.
- **Smarter auto-saves**: no new auto-save is made when nothing has changed, so leaving the app open won't push older saves out.
- **Time Machine**: you can restore a snapshot even when the work can't be opened, and export a snapshot's chapters as Markdown.
- **Safer sync**: if a work's local record is damaged, it is no longer uploaded, and it is never synced to other devices as "all chapters deleted". WebDAV and LAN sync likewise don't push damaged records or overwrite local data with damaged remote data.
- **Project export**: if one work can't be opened, the others are still exported, with a note about which one was left out; unreadable settings are no longer replaced with defaults.
- The desktop crash dialog no longer promises that text is safe; it now asks you to check your chapters after restarting.
- The Help page explains how to recover a work that can't be opened.

#### Android

- **Always able to recover the latest text**: every save also keeps a copy of each chapter's latest text on the device, so a work that can't be opened can be recovered up to the last save. The copy stays on the device and is not synced.
- **New recovery page**: shown when a work can't be opened. It compares the on-device copy, your sync account, WebDAV, and version history, puts the newest version first, and restores it with one tap.
- **Fixed "saved" when nothing was saved**: when the chapter record can't be read, editor autosave and **Save and leave** in focus mode now say the save failed, and your text stays in the editor.
- **Safer sync**: damaged records are not uploaded and are never synced to other devices as deletions.
