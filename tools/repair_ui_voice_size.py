from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path, old, new, count=1):
    p = ROOT / path
    s = p.read_text(encoding='utf-8')
    if old not in s:
        print(f'[{path}] pattern not found: {old[:90]!r}')
        return False
    p.write_text(s.replace(old, new, count), encoding='utf-8')
    print(f'[{path}] patched')
    return True

# ---------- native C++ ----------
replace('src/main.cpp',
'''std::atomic_bool g_speechRunning{false};\nint g_characterSizePreset=1;''',
'''std::atomic_bool g_speechRunning{false};\nstd::atomic_bool g_micMuted{false};\nULONGLONG g_speechStartedTick=0;\nint g_characterSizePreset=1;''')

# Explicitly select the Windows default microphone instead of relying only on SAPI's implicit input.
replace('src/main.cpp',
'''    hr=g_speechRecognizer->SetInput(nullptr,TRUE);\n    WriteLog("SAPI SetInput HRESULT="+std::to_string((long)hr));''',
'''    ISpObjectToken* audioInputToken=nullptr;\n    hr=SpGetDefaultTokenFromCategoryId(SPCAT_AUDIOIN,&audioInputToken,nullptr);\n    WriteLog("SAPI default audio input token HRESULT="+std::to_string((long)hr));\n    if(SUCCEEDED(hr)&&audioInputToken){\n        hr=g_speechRecognizer->SetInput(audioInputToken,TRUE);\n        audioInputToken->Release();\n    }else{\n        hr=g_speechRecognizer->SetInput(nullptr,TRUE);\n    }\n    WriteLog("SAPI SetInput HRESULT="+std::to_string((long)hr));''')

replace('src/main.cpp',
'''    g_speechRunning.store(true);\n    SetTimer(g_hwnd,ID_SAEED_SPEECH_POLL,100,nullptr);''',
'''    g_speechRunning.store(true);\n    g_speechStartedTick=GetTickCount64();\n    SetTimer(g_hwnd,ID_SAEED_SPEECH_POLL,100,nullptr);''')

replace('src/main.cpp',
'''void TrayCommand(const char* command){''',
'''static void ToggleMicrophoneMute(){\n    const bool mute=!g_micMuted.load();\n    g_micMuted.store(mute);\n    if(mute){\n        StopNativeSpeech();\n        PostJson({{"type","speech_status"},{"active",false},{"muted",true},{"engine","windows-sapi"}});\n        PostJson({{"type","answer"},{"text","Microphone muted."},{"local",true}});\n    }else{\n        HRESULT hr=StartNativeSpeech();\n        if(FAILED(hr)) PostJson({{"type","speech_error"},{"message","I could not activate the microphone."}});\n        else PostJson({{"type","speech_status"},{"active",true},{"muted",false},{"engine","windows-sapi"}});\n    }\n}\nvoid TrayCommand(const char* command){''')

# Correct the GLB bounds axis: Three.js/GLTF is Y-up. Keep Z only as depth.
replace('src/main.cpp',
'''static void ApplyCharacterBoundsSize(double sizeX,double sizeZ){\n    // The GLB is measured before any runtime normalization. Z is used as the\n    // requested vertical axis and X defines the desktop companion width.\n    const double safeX=std::max(0.1,std::abs(sizeX));\n    const double safeZ=std::max(0.1,std::abs(sizeZ));\n    // 20 GLB units -> about 414 px (20 + 3 units of framing at 18 px/unit).\n    // This keeps the desktop companion compact while preserving the model ratio.\n    g_characterNaturalHeight=std::clamp(static_cast<int>(std::lround((safeZ+3.0)*18.0)),300,520);\n    g_characterNaturalWidth=std::clamp(static_cast<int>(std::lround((safeX+2.0)*18.0)),240,420);\n    ApplySaeedSizePreset(g_characterSizePreset);\n}''',
'''static void ApplyCharacterBoundsSize(double sizeX,double sizeY){\n    // GLTF/Three.js uses Y-up. X is the horizontal span; Y is the actual height.\n    const double safeX=std::max(0.1,std::abs(sizeX));\n    const double safeY=std::max(0.1,std::abs(sizeY));\n    g_characterNaturalHeight=std::clamp(static_cast<int>(std::lround((safeY+2.0)*18.0)),280,560);\n    g_characterNaturalWidth=std::clamp(static_cast<int>(std::lround((safeX+2.0)*18.0)),220,460);\n    ApplySaeedSizePreset(g_characterSizePreset);\n}''')

replace('src/main.cpp',
'''                        ApplyCharacterBoundsSize(j.value("sizeX",1.0),j.value("sizeZ",1.0));''',
'''                        ApplyCharacterBoundsSize(j.value("sizeX",1.0),j.value("sizeY",j.value("sizeZ",1.0)));''')

# Make size presets visibly different and never collapse into the same minimum size.
replace('src/main.cpp',
'''    const double scale=(g_characterSizePreset==0)?0.78:(g_characterSizePreset==2?1.22:1.0);''',
'''    const double scale=(g_characterSizePreset==0)?0.62:(g_characterSizePreset==2?1.38:1.0);''')
replace('src/main.cpp',
'''    w=std::clamp(w,240,std::max(240,workW-24));\n    h=std::clamp(h,300,std::max(300,workH-24));''',
'''    w=std::clamp(w,210,std::max(210,workW-24));\n    h=std::clamp(h,260,std::max(260,workH-24));''')

# Settings narrower.
replace('src/main.cpp',
'''    const int width=kind==UTILITY_SETTINGS?620:(kind==UTILITY_UPDATE?640:(kind==UTILITY_PERFORMANCE?620:820));\n    const int height=kind==UTILITY_SETTINGS?190:(kind==UTILITY_UPDATE?350:(kind==UTILITY_PERFORMANCE?420:700));''',
'''    const int width=kind==UTILITY_SETTINGS?470:(kind==UTILITY_UPDATE?640:(kind==UTILITY_PERFORMANCE?620:820));\n    const int height=kind==UTILITY_SETTINGS?170:(kind==UTILITY_UPDATE?350:(kind==UTILITY_PERFORMANCE?420:700));''')
replace('src/main.cpp',
'''else if(h==g_settingsHwnd){m->ptMinTrackSize.x=420;m->ptMinTrackSize.y=150;}''',
'''else if(h==g_settingsHwnd){m->ptMinTrackSize.x=420;m->ptMinTrackSize.y=140;}''')

# Real chat window instead of the previous disabled stub.
replace('src/main.cpp',
'''void OpenChatWindow(){ /* Chat remains disabled as requested; use the avatar/taskbar later. */ }''',
'''void OpenChatWindow(){ CreateNativeUtilityWindow(UTILITY_CHAT,"chat"); }''')

# Improve native chat to a WhatsApp-like light conversation layout.
replace('src/main.cpp',
'''    NativeLabel(h,L"●  Saeed AI",18,14,330,34);\n    NativeLabel(h,L"Online • Desktop Assistant",18,40,330,20);''',
'''    NativeLabel(h,L"Saeed AI",18,12,330,30);\n    NativeLabel(h,L"Online - Desktop Assistant",18,38,330,20);''')
replace('src/main.cpp',
'''        18,72,784,420,h,reinterpret_cast<HMENU>(ID_NATIVE_CHAT_HISTORY),GetModuleHandleW(nullptr),nullptr);''',
'''        18,70,784,420,h,reinterpret_cast<HMENU>(ID_NATIVE_CHAT_HISTORY),GetModuleHandleW(nullptr),nullptr);''')

# Update screen state must be terminal: up-to-date, available, error, or checking only while request is running.
replace('src/main.cpp',
'''    HWND title=NativeLabel(h,L"Saeed AI - Windows Update",24,18,580,32);\n    g_nativeUpdateTitle=NativeLabel(h,L"Checking for updates...",24,58,580,28);''',
'''    HWND title=NativeLabel(h,L"Saeed AI - Windows Update",24,18,580,32);\n    g_nativeUpdateTitle=NativeLabel(h,L"Checking for updates...",24,58,580,28);''')

replace('src/main.cpp',
'''    if(type=="answer"){ AppendNativeChat(Wide(j.value("text","")),true); if(g_nativeChatStatus)NativeSetText(g_nativeChatStatus,L"Saeed is speaking"); }''',
'''    if(type=="answer"){ AppendNativeChat(Wide(j.value("text","")),true); if(g_nativeChatStatus)NativeSetText(g_nativeChatStatus,L"Saeed is speaking"); }''')

# Make update status text authoritative and stop the perpetual checking appearance.
replace('src/main.cpp',
'''        const std::string state=j.value("state","");\n        if(g_nativeUpdateProgress && (state=="checking_update"||state=="up_to_date"))SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);''',
'''        const std::string state=j.value("state","");\n        if(state=="up_to_date"){\n            NativeSetText(g_nativeUpdateTitle,L"You have the latest Saeed AI update");\n            if(g_nativeUpdateVersion)NativeSetText(g_nativeUpdateVersion,Wide("Current version: "+std::string(SAEED_VERSION)));\n            if(g_nativeUpdateDate)NativeSetText(g_nativeUpdateDate,L"Status: No newer release is available");\n            if(g_nativeUpdateSize)NativeSetText(g_nativeUpdateSize,L"Download size: 0 MB");\n            if(g_nativeUpdateProgress)SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);\n            if(g_updateHwnd)EnableWindow(GetDlgItem(g_updateHwnd,ID_NATIVE_UPDATE_NOW),FALSE);\n        }else if(state=="update_error"){\n            NativeSetText(g_nativeUpdateTitle,L"Could not complete the update check");\n            if(g_nativeUpdateProgress)SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);\n            if(g_updateHwnd)EnableWindow(GetDlgItem(g_updateHwnd,ID_NATIVE_UPDATE_NOW),FALSE);\n        }else if(g_nativeUpdateProgress && state=="checking_update"){\n            SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);\n            if(g_updateHwnd)EnableWindow(GetDlgItem(g_updateHwnd,ID_NATIVE_UPDATE_NOW),FALSE);\n        }''')

# Make the update window start a fresh check and never display stale download state.
replace('src/main.cpp',
'''void OpenUpdateWindow(){ CreateNativeUtilityWindow(UTILITY_UPDATE,"update"); }''',
'''void OpenUpdateWindow(){\n    g_pendingUpdateUrl.clear();\n    g_pendingUpdateVersion.clear();\n    g_pendingUpdateSize=0;\n    g_pendingUpdateDate.clear();\n    CreateNativeUtilityWindow(UTILITY_UPDATE,"update");\n    if(g_nativeUpdateTitle)NativeSetText(g_nativeUpdateTitle,L"Checking for updates...");\n    if(g_nativeUpdateVersion)NativeSetText(g_nativeUpdateVersion,Wide("Current version: "+std::string(SAEED_VERSION)));\n    if(g_nativeUpdateDate)NativeSetText(g_nativeUpdateDate,L"Release date: checking...");\n    if(g_nativeUpdateSize)NativeSetText(g_nativeUpdateSize,L"Download size: checking...");\n    if(g_nativeUpdateStatus)NativeSetText(g_nativeUpdateStatus,L"Checking...");\n    if(g_nativeUpdateProgress)SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);\n}''')

# Add Chat and dynamic Mute/Unmute to the taskbar context menu.
replace('src/main.cpp',
'''    AppendMenuW(menu,MF_STRING,ID_TRAY_UPDATE,L"Update");\n    AppendMenuW(menu,MF_STRING,ID_TRAY_SETTINGS,L"Settings");\n    AppendMenuW(menu,MF_STRING,ID_TRAY_PERFORMANCE,L"Performance");''',
'''    AppendMenuW(menu,MF_STRING,ID_TRAY_CHAT,L"Chat");\n    AppendMenuW(menu,MF_STRING,ID_TRAY_MUTE,g_micMuted.load()?L"Unmute":L"Mute");\n    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);\n    AppendMenuW(menu,MF_STRING,ID_TRAY_UPDATE,L"Update");\n    AppendMenuW(menu,MF_STRING,ID_TRAY_SETTINGS,L"Settings");\n    AppendMenuW(menu,MF_STRING,ID_TRAY_PERFORMANCE,L"Performance");''', 1)
replace('src/main.cpp',
'''    if(cmd==ID_TRAY_UPDATE){SetTaskbarNotificationCount(0);OpenUpdateWindow();CheckForUpdateAsync();}\n    else if(cmd==ID_TRAY_SETTINGS)OpenSettingsWindow("general");''',
'''    if(cmd==ID_TRAY_CHAT)OpenChatWindow();\n    else if(cmd==ID_TRAY_MUTE)ToggleMicrophoneMute();\n    else if(cmd==ID_TRAY_UPDATE){SetTaskbarNotificationCount(0);OpenUpdateWindow();CheckForUpdateAsync();}\n    else if(cmd==ID_TRAY_SETTINGS)OpenSettingsWindow("general");''', 1)

# Also expose Chat and dynamic Mute in the notification-area menu.
replace('src/main.cpp',
'''    AppendMenuW(menu,MF_STRING,ID_TRAY_UPDATE,L"Check for Updates");\n    AppendMenuW(menu,MF_STRING,ID_TRAY_SETTINGS,L"Settings");''',
'''    AppendMenuW(menu,MF_STRING,ID_TRAY_CHAT,L"Chat");\n    AppendMenuW(menu,MF_STRING,ID_TRAY_UPDATE,L"Check for Updates");\n    AppendMenuW(menu,MF_STRING,ID_TRAY_SETTINGS,L"Settings");''', 1)
replace('src/main.cpp',
'''    AppendMenuW(menu,MF_STRING,ID_TRAY_MUTE,L"Mute");''',
'''    AppendMenuW(menu,MF_STRING,ID_TRAY_MUTE,g_micMuted.load()?L"Unmute":L"Mute");''', 1)
replace('src/main.cpp',
'''    else if(cmd==ID_TRAY_CHARACTER)ChooseCharacterFile();\n    else if(cmd==ID_TRAY_UPDATE){SetTaskbarNotificationCount(0);OpenUpdateWindow();CheckForUpdateAsync();}''',
'''    else if(cmd==ID_TRAY_CHARACTER)ChooseCharacterFile();\n    else if(cmd==ID_TRAY_CHAT)OpenChatWindow();\n    else if(cmd==ID_TRAY_MUTE)ToggleMicrophoneMute();\n    else if(cmd==ID_TRAY_UPDATE){SetTaskbarNotificationCount(0);OpenUpdateWindow();CheckForUpdateAsync();}''', 1)

# Speech polling: no recognition for 8 seconds produces a clear diagnostic response.
replace('src/main.cpp',
'''            if(wp==ID_SAEED_SPEECH_POLL){\n                if(g_speechRunning.load()) HandleNativeSpeechEvent();\n                return 0;\n            }''',
'''            if(wp==ID_SAEED_SPEECH_POLL){\n                if(g_speechRunning.load()){\n                    HandleNativeSpeechEvent();\n                    if(g_speechStartedTick && GetTickCount64()-g_speechStartedTick>8000){\n                        WriteLog("SAPI listening timeout: no recognition event received.");\n                        StopNativeSpeech();\n                        PostJson({{"type","speech_no_input"},{"message","I did not hear anything. Please try again."}});\n                    }\n                }\n                return 0;\n            }''')

# ---------- GLB bounds in avatar.html ----------
replace('assets/avatar.html',
'''try{chrome.webview.postMessage({type:'character_bounds',sizeX:size.x,sizeZ:size.z,minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z});}catch{}''',
'''try{chrome.webview.postMessage({type:'character_bounds',sizeX:size.x,sizeY:size.y,sizeZ:size.z,minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y,minZ:bounds.min.z,maxZ:bounds.max.z});}catch{}''')

# Ensure the renderer redraws at the actual device pixel ratio after every resize.
replace('assets/avatar.html',
'''window.addEventListener('resize',()=>{''',
'''window.addEventListener('resize',()=>{\n  try{\n    const dpr=Math.min(Math.max(window.devicePixelRatio||1,1),2.5);\n    if(typeof renderer!=='undefined'&&renderer){renderer.setPixelRatio(dpr);renderer.setSize(window.innerWidth,window.innerHeight,false);}\n    if(typeof camera!=='undefined'&&camera){camera.aspect=Math.max(.1,window.innerWidth/Math.max(1,window.innerHeight));camera.updateProjectionMatrix();}\n  }catch{}''', 1)

print('repair script complete')
