from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]


def edit(path, fn):
    p=ROOT/path
    s=p.read_text(encoding='utf-8')
    n=fn(s)
    if n!=s:
        p.write_text(n,encoding='utf-8')
        print('patched',path)
    else:
        print('unchanged',path)

# ---------------- C++ ----------------
def patch_main(s):
    # Remove accidental duplicate ToggleMicrophoneMute function from the first repair pass.
    pat=r'(static void ToggleMicrophoneMute\(\)\{.*?\n\}\n)\1'
    s=re.sub(pat,r'\1',s,flags=re.S)

    # Cleanly replace the taskbar context menu with one authoritative implementation.
    a=s.find('void ShowTaskbarContextMenu(POINT p){')
    b=s.find('void ShowTrayMenu(){',a)
    if a>=0 and b> a:
        block=r'''void ShowTaskbarContextMenu(POINT p){
    HMENU menu=CreatePopupMenu();
    AppendMenuW(menu,MF_STRING,ID_TRAY_CHAT,L"Chat");
    AppendMenuW(menu,MF_STRING,ID_TRAY_MUTE,g_micMuted.load()?L"Unmute":L"Mute");
    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
    AppendMenuW(menu,MF_STRING,ID_TRAY_UPDATE,L"Update");
    AppendMenuW(menu,MF_STRING,ID_TRAY_SETTINGS,L"Settings");
    AppendMenuW(menu,MF_STRING,ID_TRAY_PERFORMANCE,L"Performance");
    HMENU sizeMenu=CreatePopupMenu();
    AppendMenuW(sizeMenu,MF_STRING,ID_TRAY_SIZE_SMALL,L"Small");
    AppendMenuW(sizeMenu,MF_STRING,ID_TRAY_SIZE_MEDIUM,L"Medium");
    AppendMenuW(sizeMenu,MF_STRING,ID_TRAY_SIZE_LARGE,L"Large");
    AppendMenuW(menu,MF_POPUP,reinterpret_cast<UINT_PTR>(sizeMenu),L"Size");
    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
    AppendMenuW(menu,MF_STRING,ID_TRAY_CHARACTER,L"Change character");
    AppendMenuW(menu,MF_STRING,ID_TRAY_SHOW,L"Show Saeed");
    AppendMenuW(menu,MF_STRING,ID_TRAY_HIDE,L"Hide Saeed");
    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
    AppendMenuW(menu,MF_STRING,ID_TRAY_EXIT,L"Exit");
    SetForegroundWindow(g_hwnd);
    UINT cmd=TrackPopupMenu(menu,TPM_RETURNCMD|TPM_NONOTIFY|TPM_RIGHTBUTTON,p.x,p.y,0,g_hwnd,nullptr);
    DestroyMenu(menu);
    if(cmd==ID_TRAY_CHAT)OpenChatWindow();
    else if(cmd==ID_TRAY_MUTE)ToggleMicrophoneMute();
    else if(cmd==ID_TRAY_UPDATE){SetTaskbarNotificationCount(0);OpenUpdateWindow();CheckForUpdateAsync();}
    else if(cmd==ID_TRAY_SETTINGS)OpenSettingsWindow("general");
    else if(cmd==ID_TRAY_PERFORMANCE)CreateNativeUtilityWindow(UTILITY_PERFORMANCE,"performance");
    else if(cmd==ID_TRAY_SIZE_SMALL)ApplySaeedSizePreset(0);
    else if(cmd==ID_TRAY_SIZE_MEDIUM)ApplySaeedSizePreset(1);
    else if(cmd==ID_TRAY_SIZE_LARGE)ApplySaeedSizePreset(2);
    else if(cmd==ID_TRAY_CHARACTER)ChooseCharacterFile();
    else if(cmd==ID_TRAY_SHOW){ShowWindow(g_hwnd,SW_SHOWNOACTIVATE);SetWindowPos(g_hwnd,HWND_TOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);}
    else if(cmd==ID_TRAY_HIDE)ShowWindow(g_hwnd,SW_HIDE);
    else if(cmd==ID_TRAY_EXIT){RemoveTrayIcon();DestroyWindow(g_hwnd);}
}
'''
        s=s[:a]+block+s[b:]

    # Replace notification-area menu implementation as well.
    a=s.find('void ShowTrayMenu(){')
    b=s.find('void PostJson(const json& j);',a)
    if a>=0 and b>a:
        block=r'''void ShowTrayMenu(){
    POINT p{};GetCursorPos(&p);
    HMENU menu=CreatePopupMenu();
    AppendMenuW(menu,MF_STRING,ID_TRAY_SHOW,L"Show Saeed");
    AppendMenuW(menu,MF_STRING,ID_TRAY_HIDE,L"Hide Saeed");
    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
    AppendMenuW(menu,MF_STRING,ID_TRAY_CHARACTER,L"Change Character");
    AppendMenuW(menu,MF_STRING,ID_TRAY_CHAT,L"Chat");
    AppendMenuW(menu,MF_STRING,ID_TRAY_UPDATE,L"Check for Updates");
    AppendMenuW(menu,MF_STRING,ID_TRAY_SETTINGS,L"Settings");
    AppendMenuW(menu,MF_STRING,ID_TRAY_PERFORMANCE,L"Performance");
    HMENU sizeMenu=CreatePopupMenu();
    AppendMenuW(sizeMenu,MF_STRING,ID_TRAY_SIZE_SMALL,L"Small");
    AppendMenuW(sizeMenu,MF_STRING,ID_TRAY_SIZE_MEDIUM,L"Medium");
    AppendMenuW(sizeMenu,MF_STRING,ID_TRAY_SIZE_LARGE,L"Large");
    AppendMenuW(menu,MF_POPUP,reinterpret_cast<UINT_PTR>(sizeMenu),L"Size");
    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
    AppendMenuW(menu,MF_STRING,ID_TRAY_MUTE,g_micMuted.load()?L"Unmute":L"Mute");
    AppendMenuW(menu,MF_STRING,ID_TRAY_PAUSE,L"Pause Listening");
    AppendMenuW(menu,MF_STRING,ID_TRAY_ABOUT,L"About Saeed");
    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
    AppendMenuW(menu,MF_STRING,ID_TRAY_RESET_POSITION,L"Reset Saeed Position");
    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
    AppendMenuW(menu,MF_STRING,ID_TRAY_EXIT,L"Exit");
    SetForegroundWindow(g_hwnd);
    UINT cmd=TrackPopupMenu(menu,TPM_RETURNCMD|TPM_NONOTIFY,p.x,p.y,0,g_hwnd,nullptr);
    DestroyMenu(menu);
    if(cmd==ID_TRAY_SHOW){ShowWindow(g_hwnd,SW_SHOWNOACTIVATE);SetWindowPos(g_hwnd,HWND_TOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);}
    else if(cmd==ID_TRAY_HIDE)ShowWindow(g_hwnd,SW_HIDE);
    else if(cmd==ID_TRAY_CHARACTER)ChooseCharacterFile();
    else if(cmd==ID_TRAY_CHAT)OpenChatWindow();
    else if(cmd==ID_TRAY_MUTE)ToggleMicrophoneMute();
    else if(cmd==ID_TRAY_UPDATE){SetTaskbarNotificationCount(0);OpenUpdateWindow();CheckForUpdateAsync();}
    else if(cmd==ID_TRAY_SETTINGS)OpenSettingsWindow("general");
    else if(cmd==ID_TRAY_PERFORMANCE)CreateNativeUtilityWindow(UTILITY_PERFORMANCE,"performance");
    else if(cmd==ID_TRAY_SIZE_SMALL)ApplySaeedSizePreset(0);
    else if(cmd==ID_TRAY_SIZE_MEDIUM)ApplySaeedSizePreset(1);
    else if(cmd==ID_TRAY_SIZE_LARGE)ApplySaeedSizePreset(2);
    else if(cmd==ID_TRAY_PAUSE)TrayCommand("pause_listening");
    else if(cmd==ID_TRAY_ABOUT){ShowWindow(g_hwnd,SW_SHOWNOACTIVATE);TrayCommand("about");}
    else if(cmd==ID_TRAY_RESET_POSITION){SetWindowPos(g_hwnd,HWND_TOPMOST,100,100,0,0,SWP_NOSIZE|SWP_NOACTIVATE);KeepOnCurrentWorkArea();ResizeWebView();}
    else if(cmd==ID_TRAY_EXIT){RemoveTrayIcon();DestroyWindow(g_hwnd);}
}
'''
        s=s[:a]+block+s[b:]

    # Correct GLB axis and make all three presets clearly distinct.
    s=re.sub(r'static void ApplyCharacterBoundsSize\(double sizeX,double sizeZ\)\{.*?\n\}',r'''static void ApplyCharacterBoundsSize(double sizeX,double sizeY){
    const double safeX=std::max(0.1,std::abs(sizeX));
    const double safeY=std::max(0.1,std::abs(sizeY));
    g_characterNaturalHeight=std::clamp(static_cast<int>(std::lround((safeY+2.0)*18.0)),280,560);
    g_characterNaturalWidth=std::clamp(static_cast<int>(std::lround((safeX+2.0)*18.0)),220,460);
    ApplySaeedSizePreset(g_characterSizePreset);
}''',s,count=1,flags=re.S)
    s=s.replace('ApplyCharacterBoundsSize(j.value("sizeX",1.0),j.value("sizeZ",1.0));','ApplyCharacterBoundsSize(j.value("sizeX",1.0),j.value("sizeY",j.value("sizeZ",1.0)));')
    s=s.replace('const double scale=(g_characterSizePreset==0)?0.78:(g_characterSizePreset==2?1.22:1.0);','const double scale=(g_characterSizePreset==0)?0.62:(g_characterSizePreset==2?1.38:1.0);')
    s=s.replace('w=std::clamp(w,240,std::max(240,workW-24));\n    h=std::clamp(h,300,std::max(300,workH-24));','w=std::clamp(w,210,std::max(210,workW-24));\n    h=std::clamp(h,260,std::max(260,workH-24));')

    # Narrow Settings and make Chat real.
    s=s.replace('const int width=kind==UTILITY_SETTINGS?620:(kind==UTILITY_UPDATE?640:(kind==UTILITY_PERFORMANCE?620:820));','const int width=kind==UTILITY_SETTINGS?470:(kind==UTILITY_UPDATE?640:(kind==UTILITY_PERFORMANCE?620:820));')
    s=s.replace('const int height=kind==UTILITY_SETTINGS?190:(kind==UTILITY_UPDATE?350:(kind==UTILITY_PERFORMANCE?420:700));','const int height=kind==UTILITY_SETTINGS?170:(kind==UTILITY_UPDATE?350:(kind==UTILITY_PERFORMANCE?420:700));')
    s=s.replace('else if(h==g_settingsHwnd){m->ptMinTrackSize.x=420;m->ptMinTrackSize.y=150;}','else if(h==g_settingsHwnd){m->ptMinTrackSize.x=420;m->ptMinTrackSize.y=140;}')
    s=s.replace('void OpenChatWindow(){ /* Chat remains disabled as requested; use the avatar/taskbar later. */ }','void OpenChatWindow(){ CreateNativeUtilityWindow(UTILITY_CHAT,"chat"); }')

    # Better light WhatsApp-like chat surface.
    s=s.replace('NativeLabel(h,L"●  Saeed AI",18,14,330,34);\n    NativeLabel(h,L"Online • Desktop Assistant",18,40,330,20);','NativeLabel(h,L"Saeed AI",18,12,330,30);\n    NativeLabel(h,L"Online - Desktop Assistant",18,38,330,20);')
    s=s.replace('NativeSetText(g_nativeChatHistory,L"Today\\r\\n\\r\\nSaeed AI\\r\\nHello. I am Saeed, your desktop AI companion.\\r\\n\\r\\n");','NativeSetText(g_nativeChatHistory,L"Today\\r\\n\\r\\nSaeed AI\\r\\nHello. I am Saeed, your desktop AI companion.\\r\\n\\r\\n");\n    SendMessageW(g_nativeChatHistory,EM_SETBKGNDCOLOR,0,RGB(247,247,247));\n    SendMessageW(g_nativeChatInput,EM_SETBKGNDCOLOR,0,RGB(255,255,255));')

    # Update window: fresh state and authoritative result labels.
    old='void OpenUpdateWindow(){ CreateNativeUtilityWindow(UTILITY_UPDATE,"update"); }'
    new='''void OpenUpdateWindow(){
    g_pendingUpdateUrl.clear();g_pendingUpdateVersion.clear();g_pendingUpdateSize=0;g_pendingUpdateDate.clear();
    CreateNativeUtilityWindow(UTILITY_UPDATE,"update");
    if(g_nativeUpdateTitle)NativeSetText(g_nativeUpdateTitle,L"Checking for updates...");
    if(g_nativeUpdateVersion)NativeSetText(g_nativeUpdateVersion,Wide("Current version: "+std::string(SAEED_VERSION)));
    if(g_nativeUpdateDate)NativeSetText(g_nativeUpdateDate,L"Release date: checking...");
    if(g_nativeUpdateSize)NativeSetText(g_nativeUpdateSize,L"Download size: checking...");
    if(g_nativeUpdateStatus)NativeSetText(g_nativeUpdateStatus,L"Checking...");
    if(g_nativeUpdateProgress)SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);
}'''
    s=s.replace(old,new)
    old='''        const std::string state=j.value("state","");
        if(g_nativeUpdateProgress && (state=="checking_update"||state=="up_to_date"))SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);'''
    new='''        const std::string state=j.value("state","");
        if(state=="up_to_date"){
            NativeSetText(g_nativeUpdateTitle,L"You have the latest Saeed AI update");
            if(g_nativeUpdateVersion)NativeSetText(g_nativeUpdateVersion,Wide("Current version: "+std::string(SAEED_VERSION)));
            if(g_nativeUpdateDate)NativeSetText(g_nativeUpdateDate,L"Status: No newer release is available");
            if(g_nativeUpdateSize)NativeSetText(g_nativeUpdateSize,L"Download size: 0 MB");
            if(g_nativeUpdateProgress)SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);
            if(g_updateHwnd)EnableWindow(GetDlgItem(g_updateHwnd,ID_NATIVE_UPDATE_NOW),FALSE);
        }else if(state=="update_error"){
            NativeSetText(g_nativeUpdateTitle,L"Could not complete the update check");
            if(g_nativeUpdateProgress)SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);
            if(g_updateHwnd)EnableWindow(GetDlgItem(g_updateHwnd,ID_NATIVE_UPDATE_NOW),FALSE);
        }else if(state=="checking_update"){
            NativeSetText(g_nativeUpdateTitle,L"Checking for updates...");
            if(g_nativeUpdateProgress)SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);
            if(g_updateHwnd)EnableWindow(GetDlgItem(g_updateHwnd,ID_NATIVE_UPDATE_NOW),FALSE);
        }'''
    s=s.replace(old,new)

    # Recognition timeout is diagnostic only; don't leave MIC in an endless "listening" state.
    old='''            if(wp==ID_SAEED_SPEECH_POLL){
                if(g_speechRunning.load()) HandleNativeSpeechEvent();
                return 0;
            }'''
    new='''            if(wp==ID_SAEED_SPEECH_POLL){
                if(g_speechRunning.load()){
                    HandleNativeSpeechEvent();
                    if(g_speechStartedTick && GetTickCount64()-g_speechStartedTick>8000){
                        WriteLog("SAPI listening timeout: no recognition event received.");
                        StopNativeSpeech();
                        PostJson({{"type","speech_no_input"},{"message","I did not hear anything. Please try again."}});
                    }
                }
                return 0;
            }'''
    s=s.replace(old,new)
    return s

edit('src/main.cpp',patch_main)

# ---------------- GLB page ----------------
def patch_avatar(s):
    s=s.replace("try{chrome.webview.postMessage({type:'character_bounds',sizeX:size.x,sizeZ:size.z,minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z});}catch{}",
                "try{chrome.webview.postMessage({type:'character_bounds',sizeX:size.x,sizeY:size.y,sizeZ:size.z,minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y,minZ:bounds.min.z,maxZ:bounds.max.z});}catch{}")
    # The existing resize callback may be compact. Inject a single high-DPI pass before its body.
    needle="window.addEventListener('resize',()=>{"
    inject="""window.addEventListener('resize',()=>{\n  try{\n    const dpr=Math.min(Math.max(window.devicePixelRatio||1,1),2.5);\n    if(typeof renderer!=='undefined'&&renderer){renderer.setPixelRatio(dpr);renderer.setSize(window.innerWidth,window.innerHeight,false);}\n    if(typeof camera!=='undefined'&&camera){camera.aspect=Math.max(.1,window.innerWidth/Math.max(1,window.innerHeight));camera.updateProjectionMatrix();}\n  }catch{}"""
    if needle in s and 'const dpr=Math.min(Math.max(window.devicePixelRatio||1,1),2.5)' not in s:
        s=s.replace(needle,inject,1)
    return s

edit('assets/avatar.html',patch_avatar)
print('FINAL_REPAIR_DONE')
