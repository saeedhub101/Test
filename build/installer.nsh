; Saeed AI — Windows NSIS cleanup
; electron-builder's standard uninstaller removes $INSTDIR, which is the
; actual installation directory selected by the user.
; This macro additionally removes Saeed's per-user runtime and update data.

!macro customUnInstall
  RMDir /r "$APPDATA\\Saeed AI"
  RMDir /r "$LOCALAPPDATA\\Saeed AI"
  RMDir /r "$LOCALAPPDATA\\Saeed AI-updater"
  RMDir /r "$APPDATA\\Saeed AI-updater"
  RMDir /r "$APPDATA\\saeed-ai"
  RMDir /r "$LOCALAPPDATA\\saeed-ai-updater"
!macroend
