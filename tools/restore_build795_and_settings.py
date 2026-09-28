from pathlib import Path
import subprocess, re, json

ROOT=Path(__file__).resolve().parents[1]
BASE="1912a041240268f9ad1f68994c8f6d3dfc19fbc1"

def git_show(path):
    return subprocess.check_output(["git","show",f"{BASE}:{path}"],text=True,encoding="utf-8")

def replace_once(s, old, new, label):
    if old not in s:
        raise RuntimeError("missing pattern: "+label)
    return s.replace(old,new,1)

# Restore the proven Build 795 display implementation before applying the new Settings UI.
main=git_show("src/main.cpp")
avatar=git_show("assets/avatar.html")

# Build-795 desktop character sizing: fixed, predictable framing instead of GLB-bound resizing.
# Remove the MIC: off pill; the microphone action remains available without noisy status text.
avatar=avatar.replace('<span id="micStatus" class="statusPill mic">MIC: starting</span>','')
avatar=avatar.replace(' const l=$(\'micStatus\');if(l){l.textContent=active?\'MIC: listening\':\'MIC: off\';l.className=\'statusPill mic\'+(active?\' active\':\'\');}','')
avatar=avatar.replace('if(d.type===\'speech_error\'){speechActive=false;renderMic();$(\'micStatus\').textContent=\'MIC: error\';',
                    'if(d.type===\'speech_error\'){speechActive=false;renderMic();')
# Keep the Build-795 interaction model: clicking/double-clicking the character immediately faces the user.
avatar=avatar.replace('interactionBusy=true;interactionHoldUntil=now+180000;','')
avatar=avatar.replace('if(performance.now()<window.__saeedLastDragClickUntil) return;','if(performance.now()<window.__saeedLastDragClickUntil) return;')

# Add Settings WebView2 state.
main=replace_once(main,
'''HWND g_settingsHwnd=nullptr;
HWND g_chatHwnd=nullptr;''',
'''HWND g_settingsHwnd=nullptr;
HWND g_chatHwnd=nullptr;
ComPtr<ICoreWebView2Controller> g_settingsController;
ComPtr<ICoreWebView2> g_settingsWebView;
std::string g_settingsInitialTab="general";''',
"settings webview globals")

# Forward declarations.
main=replace_once(main,
'''void OpenSettingsWindow(const std::string& tab="general");
void OpenChatWindow();''',
'''void OpenSettingsWindow(const std::string& tab="general");
void OpenChatWindow();
static void InitSettingsWebView();
static void ResizeSettingsWebView();
static void SendSettingsLoad();
static void HandleSettingsWebMessage(const json& j);''',
"settings declarations")

settings_impl=r'''
static json SettingsUiDefaults(){
    return {
      {"general",{{"theme","dark"},{"startWithWindows",true},{"minimizeToTray",true},{"alwaysOnTop",true},{"hotkey","Ctrl+Shift+S"}}},
      {"ai",{{"provider","OpenAI"},{"baseUrl","https://api.openai.com/v1"},{"apiKey",""},{"model","gpt-4o-mini"},{"temperature",0.7},{"maxTokens",2048},{"systemPrompt","You are Saeed, a helpful desktop AI assistant."},{"memoryLength",50}}},
      {"mic",{{"inputDevice","default"},{"sensitivity",0.65},{"noiseSuppression",true},{"inputMode","vad"},{"pushToTalkHotkey","Space"},{"language","en-US"}}},
      {"voice",{{"outputDevice","default"},{"volume",0.85},{"ttsEngine","System"},{"voice","default"},{"speed",1.0},{"pitch",1.0},{"interruptWhenSpeak",true}}},
      {"character",{{"modelFile",""},{"scale",1.0},{"positionX",0},{"positionY",0},{"rotation",0},{"background","transparent"},{"backgroundColor","#101114"},{"backgroundImage",""},{"lighting",1.0},{"eyeFollowsMouse",true}}},
      {"animation",{{"idle","idle"},{"autoBlink",true},{"breathing",true},{"lipSync",true},{"lipSyncSensitivity",0.7},{"emotion",{{"happy",true},{"sad",true},{"thinking",true},{"surprised",true}}},{"gestureFrequency",0.5}}},
      {"advanced",{{"fps",60},{"renderQuality","High"},{"antiAliasing",true},{"lowPowerWhenMinimized",true},{"developerMode",false},{"version",SAEED_VERSION}}}
    };
}
static json SettingsUiPayload(){
    json d=SettingsUiDefaults(), s=LoadSettings();
    if(s.is_object()){
        for(const char* k:{"general","ai","mic","voice","character","animation","advanced"})
            if(s.contains(k)&&s[k].is_object()) d[k].merge_patch(s[k]);
        if(s.contains("provider"))d["ai"]["provider"]=s["provider"];
        if(s.contains("baseUrl"))d["ai"]["baseUrl"]=s["baseUrl"];
        if(s.contains("model"))d["ai"]["model"]=s["model"];
        if(s.contains("apiKey"))d["ai"]["apiKey"]=s["apiKey"];
        if(s.contains("maxSteps"))d["ai"]["maxTokens"]=s["maxSteps"];
    }
    std::string key=d["ai"].value("apiKey","");
    if(!key.empty()){
        if(key.size()>4)d["ai"]["apiKey"]="****"+key.substr(key.size()-4);
        else d["ai"]["apiKey"]="****";
    }else d["ai"]["apiKey"]="";
    return d;
}
static void ResizeSettingsWebView(){
    if(!g_settingsController||!g_settingsHwnd)return;
    RECT r{};GetClientRect(g_settingsHwnd,&r);
    g_settingsController->put_Bounds(r);
}
static void PostSettingsJson(const json& j){
    if(g_settingsWebView)g_settingsWebView->PostWebMessageAsJson(Wide(j.dump()).c_str());
}
static void SendSettingsLoad(){PostSettingsJson({{"type","loadSettings"},{"settings",SettingsUiPayload()}});}
static bool SetJsonPath(json& root,const std::string& path,const json& value){
    std::vector<std::string> p;std::stringstream ss(path);std::string x;
    while(std::getline(ss,x,'.'))if(!x.empty())p.push_back(x);
    if(p.empty())return false;
    json* cur=&root;
    for(size_t i=0;i+1<p.size();++i){if(!(*cur)[p[i]].is_object())(*cur)[p[i]]=json::object();cur=&(*cur)[p[i]];}
    (*cur)[p.back()]=value;return true;
}
static json SettingsToStored(json ui){
    json old=LoadSettings();
    if(!old.is_object())old=json::object();
    if(ui.contains("ai")){
        old["provider"]=ui["ai"].value("provider","OpenAI");
        old["baseUrl"]=ui["ai"].value("baseUrl","https://api.openai.com/v1");
        old["model"]=ui["ai"].value("model","gpt-4o-mini");
        if(ui["ai"].contains("apiKey")){
            std::string k=ui["ai"].value("apiKey","");
            if(k.find("****")==std::string::npos)old["apiKey"]=k;
        }
        old["maxSteps"]=ui["ai"].value("maxTokens",2048);
    }
    for(const char* k:{"general","ai","mic","voice","character","animation","advanced"})
        if(ui.contains(k))old[k]=ui[k];
    return old;
}
static void HandleSettingsWebMessage(const json& j){
    const std::string type=j.value("type","");
    if(type=="ready"){SendSettingsLoad();return;}
    if(type=="settingChanged"){
        const std::string path=j.value("path","");
        json s=SettingsToStored(SettingsUiPayload());
        json v=j.value("value",nullptr);
        if(path=="ai.apiKey" && v.is_string() && v.get<std::string>().find("****")!=std::string::npos)return;
        SetJsonPath(s,path,v);
        if(path=="ai.provider")s["provider"]=v;
        if(path=="ai.baseUrl")s["baseUrl"]=v;
        if(path=="ai.model")s["model"]=v;
        if(path=="ai.maxTokens")s["maxSteps"]=v;
        if(path=="general.startWithWindows")SetStartupEnabled(v.get<bool>());
        if(path=="general.alwaysOnTop"&&g_settingsHwnd)
            SetWindowPos(g_settingsHwnd,v.get<bool>()?HWND_TOPMOST:HWND_NOTOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
        SaveSettings(s);return;
    }
    if(type=="saveSettings"){SaveSettings(SettingsToStored(j.value("settings",SettingsUiDefaults())));SendSettingsLoad();return;}
    if(type=="resetSection"){
        json d=SettingsUiDefaults(),s=LoadSettings(),v=d.value(j.value("tab","general"),json::object());
        const std::string tab=j.value("tab","general");
        if(tab=="memory"){s["memory"]=json::array();SaveSettings(s);return;}
        s[tab]=v;SaveSettings(s);SendSettingsLoad();return;
    }
    if(type=="resetAll"){SaveSettings(SettingsToStored(SettingsUiDefaults()));SendSettingsLoad();return;}
    if(type=="recordHotkey"){PostSettingsJson({{"type","hotkeyRecorded"},{"combo",j.value("combo","")}});return;}
    if(type=="openLogsFolder"){
        wchar_t local[MAX_PATH]{};SHGetFolderPathW(nullptr,CSIDL_LOCAL_APPDATA,nullptr,SHGFP_TYPE_CURRENT,local);
        std::wstring p=std::wstring(local)+L"\\Saeed";ShellExecuteW(nullptr,L"open",p.c_str(),nullptr,nullptr,SW_SHOWNORMAL);return;
    }
    if(type=="checkUpdates"){OpenUpdateWindow();CheckForUpdateAsync();return;}
    if(type=="exportSettings"){
        wchar_t file[MAX_PATH]=L"Saeed-settings.json";OPENFILENAMEW ofn{sizeof(ofn)};ofn.hwndOwner=g_settingsHwnd;ofn.lpstrFile=file;ofn.nMaxFile=MAX_PATH;ofn.lpstrFilter=L"JSON files (*.json)\0*.json\0All files\0*.*\0";ofn.Flags=OFN_OVERWRITEPROMPT;
        if(GetSaveFileNameW(&ofn)){std::ofstream f(Utf8(file));f<<SettingsUiPayload().dump(2);}return;
    }
    if(type=="importSettings"){
        wchar_t file[MAX_PATH]{};OPENFILENAMEW ofn{sizeof(ofn)};ofn.hwndOwner=g_settingsHwnd;ofn.lpstrFile=file;ofn.nMaxFile=MAX_PATH;ofn.lpstrFilter=L"JSON files (*.json)\0*.json\0All files\0*.*\0";ofn.Flags=OFN_FILEMUSTEXIST;
        if(GetOpenFileNameW(&ofn)){try{std::ifstream f(Utf8(file));json j;f>>j;SaveSettings(SettingsToStored(j));SendSettingsLoad();PostSettingsJson({{"type","importResult"},{"ok",true},{"settings",SettingsUiPayload()}});}catch(...){PostSettingsJson({{"type","importResult"},{"ok",false},{"settings",SettingsUiPayload()}});}}return;
    }
    if(type=="testApiConnection"){
        const std::string provider=j.value("provider",""),base=j.value("baseUrl","");
        json stored=LoadSettings();std::string key=stored.value("apiKey","");
        std::thread([provider,base,key](){
            bool ok=false;std::string msg="Connection failed";
            std::wstring url=Wide(base.empty()?"https://api.openai.com/v1/models":base+"/models");
            URL_COMPONENTSW c{};c.dwStructSize=sizeof(c);c.dwSchemeLength=(DWORD)-1;c.dwHostNameLength=(DWORD)-1;c.dwUrlPathLength=(DWORD)-1;c.dwExtraInfoLength=(DWORD)-1;
            if(WinHttpCrackUrl(url.c_str(),0,0,&c)){
                std::wstring host(c.lpszHostName,c.dwHostNameLength),path(c.lpszUrlPath?c.lpszUrlPath:L"/models",c.dwUrlPathLength);
                if(path.empty()||path.back()!=L'/')path+=L"/models";
                HINTERNET ses=WinHttpOpen(L"Saeed AI",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
                HINTERNET con=ses?WinHttpConnect(ses,host.c_str(),c.nPort,0):nullptr;
                DWORD flags=(c.nScheme==INTERNET_SCHEME_HTTPS)?WINHTTP_FLAG_SECURE:0;
                HINTERNET req=con?WinHttpOpenRequest(con,L"GET",path.c_str(),nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,flags):nullptr;
                if(req){
                    std::wstring headers;
                    if(!key.empty() && provider!="Ollama/Local"){
                        if(provider=="Anthropic")headers=L"x-api-key: "+Wide(key)+L"\\r\\nanthropic-version: 2023-06-01\\r\\n";
                        else headers=L"Authorization: Bearer "+Wide(key)+L"\\r\\n";
                    }
                    if(WinHttpSendRequest(req,headers.empty()?WINHTTP_NO_ADDITIONAL_HEADERS:headers.c_str(),headers.empty()?0:(DWORD)-1,WINHTTP_NO_REQUEST_DATA,0,0,0)&&WinHttpReceiveResponse(req,nullptr)){
                        DWORD status=0,size=sizeof(status);WinHttpQueryHeaders(req,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,nullptr);ok=status>=200&&status<500;msg=ok?"Server responded (HTTP "+std::to_string(status)+")":"Server error (HTTP "+std::to_string(status)+")";
                    }else msg="Network request failed";
                }else msg="Could not open HTTP request";
                if(req)WinHttpCloseHandle(req);if(con)WinHttpCloseHandle(con);if(ses)WinHttpCloseHandle(ses);
            }else msg="Invalid Base URL";
            PostSettingsJson({{"type","apiTestResult"},{"ok",ok},{"message",msg}});
        }).detach();
        return;
    }
}
static void InitSettingsWebView(){
    if(!g_settingsHwnd||g_settingsController)return;
    auto makeController=[&](ICoreWebView2Environment* env){
        if(!env)return;
        env->CreateCoreWebView2Controller(g_settingsHwnd,Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
            [](HRESULT hr,ICoreWebView2Controller* c)->HRESULT{
                if(FAILED(hr)||!c)return hr;
                g_settingsController=c;
                g_settingsController->get_CoreWebView2(&g_settingsWebView);
                if(g_settingsWebView){
                    ComPtr<ICoreWebView2Settings> st;g_settingsWebView->get_Settings(&st);
                    if(st){st->put_IsWebMessageEnabled(TRUE);st->put_IsStatusBarEnabled(FALSE);st->put_AreDefaultContextMenusEnabled(FALSE);}
                    g_settingsWebView->add_WebMessageReceived(Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                        [](ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs* a)->HRESULT{
                            LPWSTR raw=nullptr;if(SUCCEEDED(a->get_WebMessageAsJson(&raw))&&raw){try{HandleSettingsWebMessage(json::parse(Utf8(raw)));}catch(...){ }CoTaskMemFree(raw);}return S_OK;
                        }).Get(),nullptr);
                    std::wstring p=AppDirectory()+L"\\assets\\settings.html";std::replace(p.begin(),p.end(),L'\\',L'/');g_settingsWebView->Navigate((L"file:///"+p).c_str());ResizeSettingsWebView();
                }
                return S_OK;
            }).Get());
    };
    if(g_webviewEnv)makeController(g_webviewEnv.Get());
    else CreateCoreWebView2EnvironmentWithOptions(nullptr,nullptr,nullptr,Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
        [makeController](HRESULT hr,ICoreWebView2Environment* env)->HRESULT{if(SUCCEEDED(hr))makeController(env);return hr;}).Get());
}
'''
# Insert implementation before OpenSettingsWindow.
main=replace_once(main,
'''void OpenSettingsWindow(const std::string& tab){ CreateNativeUtilityWindow(UTILITY_SETTINGS,tab); }''',
settings_impl+'''void OpenSettingsWindow(const std::string& tab){ g_settingsInitialTab=tab; CreateNativeUtilityWindow(UTILITY_SETTINGS,tab); }''',
"settings implementation")

# Make the Settings window large enough for the seven-tab UI.
main=main.replace('const int width=kind==UTILITY_SETTINGS?820:(kind==UTILITY_UPDATE?820:(kind==UTILITY_PERFORMANCE?520:820));',
                  'const int width=kind==UTILITY_SETTINGS?900:(kind==UTILITY_UPDATE?820:(kind==UTILITY_PERFORMANCE?520:820));')
main=main.replace('const int height=kind==UTILITY_SETTINGS?260:(kind==UTILITY_UPDATE?400:(kind==UTILITY_PERFORMANCE?260:700));',
                  'const int height=kind==UTILITY_SETTINGS?700:(kind==UTILITY_UPDATE?400:(kind==UTILITY_PERFORMANCE?260:700));')
main=main.replace('if(kind==UTILITY_SETTINGS)NativeCreateSettingsControls(slot,initialTab);',
                  'if(kind==UTILITY_SETTINGS){ NativeCreateSettingsControls(slot,initialTab); InitSettingsWebView(); }')

# When an already-created Settings window is requested, make sure its WebView is alive and resized.
main=main.replace('if(slot && IsWindow(slot)){ ShowWindow(slot,SW_SHOWNORMAL); SetForegroundWindow(slot); return; }',
                  'if(slot && IsWindow(slot)){ ShowWindow(slot,SW_SHOWNORMAL); SetForegroundWindow(slot); if(kind==UTILITY_SETTINGS){InitSettingsWebView();ResizeSettingsWebView();} return; }',1)

# Resize the WebView with the native Settings window.
main=replace_once(main,
'''            if(h==g_settingsHwnd){
                // Settings controls follow the native window size instead of fixed HTML coordinates.''',
'''            if(h==g_settingsHwnd){
                ResizeSettingsWebView();
                // Settings controls follow the native window size instead of fixed HTML coordinates.''',
"settings resize hook")

# Release the Settings WebView on window destruction.
main=replace_once(main,
'''            if(h==g_settingsHwnd){
                g_settingsHwnd=nullptr;
                g_nativeSettingsProvider=nullptr;''',
'''            if(h==g_settingsHwnd){
                if(g_settingsController)g_settingsController->Close();
                g_settingsWebView.Reset();g_settingsController.Reset();
                g_settingsHwnd=nullptr;
                g_nativeSettingsProvider=nullptr;''',
"settings cleanup")

# Native placeholder stays harmless behind the WebView.
main=replace_once(main,
'''static void NativeCreateSettingsControls(HWND h,const std::string& initialTab){
    (void)initialTab;
    NativeLabel(h,L"This is a Settings experimental screen.",40,70,700,42);
}''',
'''static void NativeCreateSettingsControls(HWND,const std::string&){ }''',
"native settings placeholder")

# Ensure the Settings window has a reasonable minimum size.
main=main.replace('m->ptMinTrackSize.x=420;m->ptMinTrackSize.y=150;',
                  'm->ptMinTrackSize.x=800;m->ptMinTrackSize.y=600;')

(ROOT/"src/main.cpp").write_text(main,encoding="utf-8")
(ROOT/"assets/avatar.html").write_text(avatar,encoding="utf-8")
print("RESTORE_795_AND_SETTINGS_DONE")
