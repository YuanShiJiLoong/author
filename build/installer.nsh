; Custom NSIS installer script for Author
; electron-builder handles the default install/uninstall flow. We add one
; optional uninstaller section so users can wipe local drafts and settings when
; they really mean to remove all local data.

!macro customUnInstallSection
  ; 双语标签：安装包未配置多语言字符串，中文写死会让英文/俄文系统的用户
  ; 面对一个看不懂、但后果是删光全部作品的勾选项。默认不勾（/o）。
  ; 名字必须带 un. 前缀，否则 NSIS 会把它算成「安装器」的组件 —— 卸载时看不到，
  ; 反而在安装 Author 时冒出一个「删除本地数据」的勾选框。前缀只用于归属判定，
  ; 界面显示时会被 NSIS 自动剥离，用户看到的仍是下面这行文字。
  Section /o "un.删除本地数据：作品、设置、登录状态 / Delete local data: works, settings, sign-in" SEC_DELETE_AUTHOR_USER_DATA

    ; 勾选之后再确认一次。这一步永久删除用户的全部作品，没有回收站可捞，
    ; 误勾一次就是不可逆的损失，值得多问一句。
    ; /SD IDNO：静默卸载（无人值守）时默认「否」，绝不在没人确认的情况下删数据。
    MessageBox MB_YESNO|MB_ICONEXCLAMATION \
      "确定要删除 Author 的全部本地数据吗？$\n作品、设置与登录状态将被永久删除，无法恢复。$\n$\nDelete all Author local data? Your works, settings and sign-in will be permanently removed and cannot be recovered." \
      /SD IDNO IDYES author_wipe_confirmed
    Return
    author_wipe_confirmed:

    DetailPrint "Removing Author local user data..."

    ; Electron stores Chromium profile data (IndexedDB/localStorage), logs, and
    ; secure-store values under the per-user Roaming app data directory.
    RMDir /r "$APPDATA\author-app"

    ; Update downloads are cached separately from the app profile.
    RMDir /r "$LOCALAPPDATA\author-app-updater"
  SectionEnd
!macroend
