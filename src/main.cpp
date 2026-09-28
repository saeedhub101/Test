#include <windows.h>
#include <windowsx.h>
#include <shellscalingapi.h>
#include <commdlg.h>
#include <shellapi.h>
#include <shobjidl.h>
#include <commctrl.h>
#include <wrl.h>
#include <WebView2.h>
#include <winhttp.h>
#include <mmdeviceapi.h>
#include <endpointvolume.h>
#include <wincrypt.h>
#include <wincodec.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <propkey.h>
#include <propvarutil.h>
#include <shlwapi.h>
#include <sapi.h>
#pragma comment(lib,"sapi.lib")
#pragma comment(lib,"comctl32.lib")
#include <cctype>
#include <tlhelp32.h>
#include <nlohmann/json.hpp>
#include "agent_core2.hpp"

#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <fstream>
#include <filesystem>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include <chrono>
#include <stdexcept>
#include <utility>
#include <iomanip>
#include <ctime>
#include <cstdio>
#include <cmath>

#pragma comment(lib,"shlwapi.lib")

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
using json=nlohmann::json;
#ifndef SAEED_VERSION
#define SAEED_VERSION "2.0"
#endif
#ifndef SAEED_BUILD_NUMBER
#define SAEED_BUILD_NUMBER 0
#endif

namespace {
HWND g_hwnd=nullptr;
NOTIFYICONDATAW g_tray{};
bool g_trayReady=false;
constexpr UINT WM_SAEED_TRAY=WM_APP+10;
constexpr UINT WM_SAEED_INIT_TRAY=WM_APP+11;
constexpr UINT WM_SAEED_APPLY_SIZE=WM_APP+52;
constexpr UINT WM_SAEED_OPEN_CHAT=WM_APP+53;
constexpr UINT ID_TRAY_SHOW=1001;
constexpr UINT ID_TRAY_HIDE=1002;
constexpr UINT ID_TRAY_EXIT=1003;
constexpr UINT ID_TRAY_STARTUP=1004;
constexpr UINT ID_TRAY_RESET_POSITION=1005;
constexpr UINT ID_TRAY_CHAT=1006;
constexpr UINT ID_TRAY_ACCOUNTS=1007;
constexpr UINT ID_TRAY_SETTINGS=1008;
constexpr UINT ID_TRAY_MUTE=1009;
constexpr UINT ID_TRAY_PAUSE=1010;
constexpr UINT ID_TRAY_ABOUT=1011;
constexpr UINT ID_TRAY_UPDATE=1012;
constexpr UINT ID_TRAY_CHARACTER=1013;
constexpr UINT ID_TRAY_PERFORMANCE=1014;
constexpr UINT ID_TRAY_SIZE_SMALL=1015;
constexpr UINT ID_TRAY_SIZE_MEDIUM=1016;
constexpr UINT ID_TRAY_SIZE_LARGE=1017;
constexpr UINT ID_SAEED_WALK_TIMER=7101;
constexpr UINT ID_SAEED_OVERLAY_TIMER=7102;
constexpr UINT ID_SAEED_EYE_TIMER=7103;
constexpr int ID_SAEED_HOTKEY=7001;
constexpr UINT WM_SAEED_SPEECH=WM_APP+30;
ISpRecognizer* g_speechRecognizer=nullptr;
ISpRecoContext* g_speechContext=nullptr;
ISpRecoGrammar* g_speechGrammar=nullptr;
std::atomic_bool g_speechRunning{false};
ComPtr<ICoreWebView2Controller> g_controller;
ComPtr<ICoreWebView2> g_webview;
ComPtr<ICoreWebView2Environment> g_webviewEnv;

// Real Windows utility windows: Settings and Chat are separate, movable,
// resizable top-level windows rather than overlays inside the avatar window.
enum UtilityWindowKind { UTILITY_SETTINGS=1, UTILITY_CHAT=2, UTILITY_UPDATE=3, UTILITY_PERFORMANCE=4 };
HWND g_settingsHwnd=nullptr;
HWND g_chatHwnd=nullptr;
ComPtr<ICoreWebView2Controller> g_settingsController;
ComPtr<ICoreWebView2> g_settingsWebView;
std::string g_settingsInitialTab="general";
HWND g_updateHwnd=nullptr;
HWND g_performanceHwnd=nullptr;

// Native Win32 utility UI. Chat and Settings are native C++ windows;
// WebView2 remains dedicated to the 3D avatar surface only.
constexpr int ID_NATIVE_CHAT_HISTORY=8101;
constexpr int ID_NATIVE_CHAT_INPUT=8102;
constexpr int ID_NATIVE_CHAT_SEND=8103;
constexpr int ID_NATIVE_CHAT_CANCEL=8104;
constexpr int ID_NATIVE_CHAT_STATUS=8105;
constexpr int ID_NATIVE_SETTINGS_BACK=8200;
constexpr int ID_NATIVE_SETTINGS_OK=8215;
constexpr int ID_NATIVE_SETTINGS_PROVIDER=8201;
constexpr int ID_NATIVE_SETTINGS_BASEURL=8202;
constexpr int ID_NATIVE_SETTINGS_MODEL=8203;
constexpr int ID_NATIVE_SETTINGS_KEY=8204;
constexpr int ID_NATIVE_SETTINGS_VOICE=8205;
constexpr int ID_NATIVE_SETTINGS_SAVE=8206;
constexpr int ID_NATIVE_SETTINGS_CANCEL=8207;
constexpr int ID_NATIVE_SETTINGS_GOOGLE=8210;
constexpr int ID_NATIVE_SETTINGS_MICROSOFT=8211;
constexpr int ID_NATIVE_SETTINGS_FACEBOOK=8212;
constexpr int ID_NATIVE_SETTINGS_EMAIL=8213;
constexpr int ID_NATIVE_SETTINGS_UPDATE=8214;
constexpr int ID_NATIVE_SETTINGS_UPDATE_STATUS=8216;
constexpr int ID_NATIVE_SETTINGS_CHARACTER=8217;
constexpr int ID_NATIVE_SETTINGS_RESTORE_CHARACTER=8218;
constexpr int ID_NATIVE_SETTINGS_PROVIDERS=8219;
constexpr int ID_NATIVE_SETTINGS_APIKEY_SAVE=8220;
constexpr int ID_NATIVE_UPDATE_PROGRESS=8301;
constexpr int ID_NATIVE_UPDATE_NOW=8302;
constexpr int ID_NATIVE_UPDATE_LATER=8303;
constexpr int ID_NATIVE_UPDATE_CLOSE=8304;
constexpr int IDI_SAEED_ICON=101;
HWND g_nativeChatHistory=nullptr;
HWND g_nativeChatInput=nullptr;
HWND g_nativeChatStatus=nullptr;
HWND g_nativeSettingsProvider=nullptr;
HWND g_nativeSettingsBaseUrl=nullptr;
HWND g_nativeSettingsModel=nullptr;
HWND g_nativeSettingsKey=nullptr;
HWND g_nativeSettingsVoice=nullptr;
HWND g_nativeSettingsUpdateStatus=nullptr;
HWND g_nativeSettingsProviders=nullptr;
HWND g_nativeUpdateTitle=nullptr;
HWND g_nativeUpdateVersion=nullptr;
HWND g_nativeUpdateDate=nullptr;
HWND g_nativeUpdateSize=nullptr;
HWND g_nativeUpdateStatus=nullptr;
HWND g_nativeUpdateProgress=nullptr;
std::string g_pendingUpdateUrl;
std::string g_pendingUpdateVersion;
uint64_t g_pendingUpdateSize=0;
std::string g_pendingUpdateDate;
ComPtr<ITaskbarList3> g_taskbarList;
UINT g_taskbarButtonCreated=0;
HICON g_taskbarOverlayIcon=nullptr;
std::atomic_int g_notificationCount{0};
HFONT g_nativeUiFont=nullptr;
HBRUSH g_nativeUiBrush=nullptr;
HBRUSH g_utilityBgBrush=nullptr;
HBRUSH g_utilityInputBrush=nullptr;
std::mutex g_confirmMutex;
std::mutex g_confirmRequestMutex;
std::condition_variable g_confirmCv;
std::string g_confirmId;
bool g_confirmValue=false;
std::atomic_uint64_t g_requestId{0};
std::atomic_bool g_shuttingDown{false};
std::atomic_bool g_agentCancel{false};
std::atomic_uint64_t g_agentTaskSerial{0};
std::atomic_bool g_agentRunning{false};
std::string g_agentTaskId;
std::mutex g_characterStateMutex;
std::mutex g_characterStateRequestMutex;
std::condition_variable g_characterStateCv;
std::string g_characterStateId;
json g_characterStateResult;
uint64_t g_characterStateRequestSerial=0;
// Autonomous desktop travel: the character window itself moves, so the avatar can
// cross the whole work area without ever being clipped by a fixed corner container.
bool g_walkActive=false;
bool g_overlayOpen=false;
ULONGLONG g_walkStart=0;
ULONGLONG g_walkDuration=0;
POINT g_walkFrom{0,0};
POINT g_walkTo{0,0};

void ResizeWebView();
void KeepOnCurrentWorkArea();
static void CheckForUpdateAsync();
void OpenSettingsWindow(const std::string& tab="general");
void OpenChatWindow();
static void InitSettingsWebView();
static void ResizeSettingsWebView();
static void SendSettingsLoad();
static void HandleSettingsWebMessage(const json& j);
LRESULT CALLBACK UtilityWndProc(HWND h,UINT msg,WPARAM wp,LPARAM lp);
bool TryLocalCommand(const std::string& original);
void RunAgent(std::string text);
json LoadSettings();
void SaveSettings(const json& j);
void AppendNativeChat(const std::wstring& text, bool assistant=false);
void HandleNativeUtilityMessage(const json& j);
void ChooseCharacterFile();
void OpenUpdateWindow();
void SetTaskbarNotificationCount(int count);
void ShowTaskbarContextMenu(POINT p);
static void CreateNativeUtilityWindow(UtilityWindowKind kind,const std::string& initialTab);
static void NativeCreateUpdateControls(HWND h);

bool InterruptibleSleep(DWORD milliseconds){
    const DWORD slice=100;
    DWORD elapsed=0;
    while(elapsed<milliseconds){
        if(g_agentCancel.load()) return false;
        DWORD step=std::min(slice,milliseconds-elapsed);
        Sleep(step);
        elapsed+=step;
    }
    return !g_agentCancel.load();
}




HICON CreateNotificationOverlayIcon(int count){
    if(count<=0)return nullptr;
    const int s=32;
    HDC screen=GetDC(nullptr),mem=CreateCompatibleDC(screen);
    HBITMAP bmp=CreateCompatibleBitmap(screen,s,s),old=(HBITMAP)SelectObject(mem,bmp);
    HBRUSH bg=CreateSolidBrush(RGB(220,40,40));
    HBRUSH oldBrush=(HBRUSH)SelectObject(mem,bg);
    HPEN pen=CreatePen(PS_NULL,0,0),oldPen=(HPEN)SelectObject(mem,pen);
    Ellipse(mem,0,0,s,s);
    SelectObject(mem,oldBrush);DeleteObject(bg);
    SelectObject(mem,oldPen);DeleteObject(pen);
    SetBkMode(mem,TRANSPARENT);SetTextColor(mem,RGB(255,255,255));
    HFONT font=CreateFontW(19,0,0,0,FW_BOLD,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH|FF_SWISS,L"Segoe UI");
    HFONT oldFont=(HFONT)SelectObject(mem,font);
    std::wstring label=count>9?L"+9":std::to_wstring(count);
    RECT r{0,0,s,s};DrawTextW(mem,label.c_str(),-1,&r,DT_CENTER|DT_VCENTER|DT_SINGLELINE);
    ICONINFO ii{};ii.fIcon=TRUE;ii.hbmColor=bmp;ii.hbmMask=CreateBitmap(s,s,1,1,nullptr);
    HICON icon=CreateIconIndirect(&ii);
    DeleteObject(ii.hbmMask);SelectObject(mem,oldFont);DeleteObject(font);
    SelectObject(mem,old);DeleteObject(bmp);DeleteDC(mem);ReleaseDC(nullptr,screen);
    return icon;
}
void SetTaskbarNotificationCount(int count){
    count=std::clamp(count,0,99);
    g_notificationCount.store(count);
    if(!g_taskbarList||!g_taskbarButtonCreated)return;
    if(g_taskbarOverlayIcon){DestroyIcon(g_taskbarOverlayIcon);g_taskbarOverlayIcon=nullptr;}
    if(count>0){
        g_taskbarOverlayIcon=CreateNotificationOverlayIcon(count);
        if(g_taskbarOverlayIcon)g_taskbarList->SetOverlayIcon(g_hwnd,g_taskbarOverlayIcon,count>9?L"More than 9 notifications":L"Notifications");
    }else{
        g_taskbarList->SetOverlayIcon(g_hwnd,nullptr,L"");
    }
}
static void AddTaskbarJumpItem(IObjectCollection* collection,const std::wstring& title,const std::wstring& args,const std::wstring& description){
    if(!collection)return;
    ComPtr<IShellLinkW> link;
    if(FAILED(CoCreateInstance(CLSID_ShellLink,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&link)))||!link)return;
    wchar_t exe[MAX_PATH]{};
    GetModuleFileNameW(nullptr,exe,MAX_PATH);
    link->SetPath(exe);
    link->SetArguments(args.c_str());
    link->SetDescription(description.c_str());
    link->SetIconLocation(exe,0);
    ComPtr<IPropertyStore> store;
    if(SUCCEEDED(link.As(&store))){
        PROPVARIANT pv; PropVariantInit(&pv);
        if(SUCCEEDED(InitPropVariantFromString(title.c_str(),&pv))){
            store->SetValue(PKEY_Title,pv);
            store->Commit();
            PropVariantClear(&pv);
        }
    }
    collection->AddObject(link.Get());
}
static void UpdateTaskbarJumpList(){
    ComPtr<ICustomDestinationList> list;
    if(FAILED(CoCreateInstance(CLSID_DestinationList,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&list)))||!list)return;
    UINT slots=0;
    ComPtr<IObjectArray> removed;
    if(FAILED(list->BeginList(&slots,IID_PPV_ARGS(&removed))))return;
    ComPtr<IObjectCollection> collection;
    if(FAILED(CoCreateInstance(CLSID_EnumerableObjectCollection,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&collection)))){list->AbortList();return;}
    AddTaskbarJumpItem(collection.Get(),L"Update",L"--saeed-taskbar-update",L"Check for and install Saeed AI updates");
    AddTaskbarJumpItem(collection.Get(),L"Chat with Saeed",L"--saeed-taskbar-chat",L"Open Saeed AI chat");
    AddTaskbarJumpItem(collection.Get(),L"Settings",L"--saeed-taskbar-settings",L"Open Saeed AI settings");
    AddTaskbarJumpItem(collection.Get(),L"Performance",L"--saeed-taskbar-performance",L"Open Saeed AI performance");
    AddTaskbarJumpItem(collection.Get(),L"Small size",L"--saeed-taskbar-size-small",L"Resize Saeed to small");
    AddTaskbarJumpItem(collection.Get(),L"Medium size",L"--saeed-taskbar-size-medium",L"Resize Saeed to medium");
    AddTaskbarJumpItem(collection.Get(),L"Large size",L"--saeed-taskbar-size-large",L"Resize Saeed to large");
    ComPtr<IObjectArray> array;
    if(SUCCEEDED(collection.As(&array)))
        list->AppendCategory(L"Saeed AI",array.Get());
    list->CommitList();
}
void InitializeTaskbarIntegration(){
    if(!g_taskbarButtonCreated)return;
    if(!g_taskbarList){
        CoCreateInstance(CLSID_TaskbarList,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&g_taskbarList));
        if(g_taskbarList)g_taskbarList->HrInit();
    }
    SetTaskbarNotificationCount(g_notificationCount.load());
    UpdateTaskbarJumpList();
}
void IncrementNotificationCount(int amount=1){
    const int next=std::min(99,g_notificationCount.load()+std::max(1,amount));
    SetTaskbarNotificationCount(next);
    try{json s=LoadSettings();s["notificationCount"]=next;SaveSettings(s);}catch(...){}
}
void ShowNativeNotification(const std::wstring& title,const std::wstring& message){
    if(!g_trayReady)return;
    NOTIFYICONDATAW n=g_tray;
    n.cbSize=sizeof(n);
    n.uFlags=NIF_INFO;
    wcsncpy_s(n.szInfoTitle,title.c_str(),_TRUNCATE);
    wcsncpy_s(n.szInfo,message.c_str(),_TRUNCATE);
    n.dwInfoFlags=NIIF_WARNING;
    Shell_NotifyIconW(NIM_MODIFY,&n);
}
void RemoveTrayIcon(){
    if(!g_trayReady)return;
    Shell_NotifyIconW(NIM_DELETE,&g_tray);
    g_trayReady=false;
}
void RegisterSaeedHotkey(){
    // Ctrl+Shift+S toggles Saeed visibility without stealing focus while hidden.
    RegisterHotKey(g_hwnd,ID_SAEED_HOTKEY,MOD_CONTROL|MOD_SHIFT,'S');
}
void UnregisterSaeedHotkey(){
    UnregisterHotKey(g_hwnd,ID_SAEED_HOTKEY);
}
void ToggleSaeedVisibility(){
    if(IsWindowVisible(g_hwnd)){
        ShowWindow(g_hwnd,SW_HIDE);
    }else{
        ShowWindow(g_hwnd,SW_SHOWNOACTIVATE);
        SetWindowPos(g_hwnd,HWND_TOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
    }
}
void AddTrayIcon(){
    if(g_trayReady)return;
    ZeroMemory(&g_tray,sizeof(g_tray));
    g_tray.cbSize=sizeof(g_tray);
    g_tray.hWnd=g_hwnd;
    g_tray.uID=1;
    g_tray.uFlags=NIF_MESSAGE|NIF_ICON|NIF_TIP;
    g_tray.uCallbackMessage=WM_SAEED_TRAY;
    g_tray.hIcon=LoadIconW(GetModuleHandleW(nullptr),MAKEINTRESOURCEW(IDI_SAEED_ICON));
    if(!g_tray.hIcon) g_tray.hIcon=LoadIconW(nullptr,IDI_APPLICATION);
    wcscpy_s(g_tray.szTip,L"Saeed AI");
    g_trayReady=Shell_NotifyIconW(NIM_ADD,&g_tray)!=FALSE;
}
bool IsStartupEnabled(){
    HKEY key=nullptr;
    if(RegOpenKeyExW(HKEY_CURRENT_USER,L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",0,KEY_QUERY_VALUE,&key)!=ERROR_SUCCESS)return false;
    DWORD type=0,size=0;
    LONG rc=RegQueryValueExW(key,L"SaeedAI",nullptr,&type,nullptr,&size);
    RegCloseKey(key);
    return rc==ERROR_SUCCESS && type==REG_SZ;
}
bool SetStartupEnabled(bool enabled){
    HKEY key=nullptr;
    if(RegCreateKeyExW(HKEY_CURRENT_USER,L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",0,nullptr,0,KEY_SET_VALUE,nullptr,&key,nullptr)!=ERROR_SUCCESS)return false;
    LONG rc=ERROR_SUCCESS;
    if(enabled){
        wchar_t path[MAX_PATH]{};
        DWORD n=GetModuleFileNameW(nullptr,path,MAX_PATH);
        if(!n || n>=MAX_PATH){RegCloseKey(key);return false;}
        std::wstring command=L"\\\""+std::wstring(path,n)+L"\\\"";
        rc=RegSetValueExW(key,L"SaeedAI",0,REG_SZ,reinterpret_cast<const BYTE*>(command.c_str()),static_cast<DWORD>((command.size()+1)*sizeof(wchar_t)));
    }else{
        rc=RegDeleteValueW(key,L"SaeedAI");
        if(rc==ERROR_FILE_NOT_FOUND)rc=ERROR_SUCCESS;
    }
    RegCloseKey(key);
    return rc==ERROR_SUCCESS;
}

void PostJson(const json& j);
std::string Utf8(const std::wstring& s);
std::wstring Wide(const std::string& s);
std::wstring AppDirectory();
void StopNativeSpeech(){
    g_speechRunning.store(false);
    if(g_speechGrammar){g_speechGrammar->SetDictationState(SPRS_INACTIVE);g_speechGrammar->Release();g_speechGrammar=nullptr;}
    if(g_speechContext){g_speechContext->SetNotifyWindowMessage(nullptr,0,0,0);g_speechContext->Release();g_speechContext=nullptr;}
    if(g_speechRecognizer){g_speechRecognizer->Release();g_speechRecognizer=nullptr;}
    if(g_webview) PostJson({{"type","speech_status"},{"active",false}});
}
HRESULT StartNativeSpeech(){
    StopNativeSpeech();
    if(!g_hwnd) return E_FAIL;
    HRESULT hr=CoCreateInstance(CLSID_SpInprocRecognizer,nullptr,CLSCTX_INPROC_SERVER,IID_ISpRecognizer,reinterpret_cast<void**>(&g_speechRecognizer));
    if(FAILED(hr)){PostJson({{"type","speech_error"},{"message","Windows Speech Recognition engine is not available on this PC."}});return hr;}
    hr=g_speechRecognizer->SetInput(nullptr,TRUE);
    if(FAILED(hr)){StopNativeSpeech();PostJson({{"type","speech_error"},{"message","Windows could not open the default microphone."}});return hr;}
    hr=g_speechRecognizer->CreateRecoContext(&g_speechContext);
    if(FAILED(hr)){StopNativeSpeech();PostJson({{"type","speech_error"},{"message","Could not create the Windows speech recognition context."}});return hr;}
    hr=g_speechContext->SetNotifyWindowMessage(g_hwnd,WM_SAEED_SPEECH,0,0);
    if(FAILED(hr)){StopNativeSpeech();return hr;}
    ULONGLONG interest=SPFEI(SPEI_RECOGNITION);
    hr=g_speechContext->SetInterest(interest,interest);
    if(FAILED(hr)){StopNativeSpeech();return hr;}
    hr=g_speechContext->CreateGrammar(1,&g_speechGrammar);
    if(FAILED(hr)){StopNativeSpeech();return hr;}
    hr=g_speechGrammar->LoadDictation(nullptr,SPLO_STATIC);
    if(FAILED(hr)){StopNativeSpeech();PostJson({{"type","speech_error"},{"message","The installed Windows speech language engine could not be loaded."}});return hr;}
    hr=g_speechGrammar->SetDictationState(SPRS_ACTIVE);
    if(FAILED(hr)){StopNativeSpeech();PostJson({{"type","speech_error"},{"message","Windows Speech Recognition could not be activated. Check Windows speech settings."}});return hr;}
    g_speechRunning.store(true);
    PostJson({{"type","speech_status"},{"active",true},{"engine","windows-sapi"}});
    return S_OK;
}

bool SetDefaultEndpointVolume(float delta,bool mute){
    ComPtr<IMMDeviceEnumerator> enumerator;
    ComPtr<IMMDevice> device;
    ComPtr<IAudioEndpointVolume> volume;
    HRESULT hr=CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator));
    if(SUCCEEDED(hr))hr=enumerator->GetDefaultAudioEndpoint(eRender,eConsole,&device);
    if(SUCCEEDED(hr))hr=device->Activate(__uuidof(IAudioEndpointVolume),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(volume.GetAddressOf()));
    if(FAILED(hr)||!volume)return false;
    if(mute)return SUCCEEDED(volume->SetMute(TRUE,nullptr));
    float current=0.0f;
    if(FAILED(volume->GetMasterVolumeLevelScalar(&current)))return false;
    current=std::clamp(current+delta,0.0f,1.0f);
    return SUCCEEDED(volume->SetMasterVolumeLevelScalar(current,nullptr));
}
static std::string LocalCommandLower(std::string s){
    std::transform(s.begin(),s.end(),s.begin(),[](unsigned char c){return static_cast<char>(std::tolower(c));});
    return s;
}
static bool LocalContainsAny(const std::string& s,std::initializer_list<const char*> words){
    for(const char* w:words)if(s.find(w)!=std::string::npos)return true;
    return false;
}
static bool OpenKnownWindowsTarget(const std::string& command){
    std::wstring target;
    if(LocalContainsAny(command,{"calculator","calc","حاسبة","آلة حاسبة"}))target=L"calc.exe";
    else if(LocalContainsAny(command,{"notepad","المفكرة","الملاحظات"}))target=L"notepad.exe";
    else if(LocalContainsAny(command,{"explorer","file explorer","open file","open files","مستكشف الملفات","الملفات","افتح ملف","افتح الملفات"}))target=L"explorer.exe";
    else if(LocalContainsAny(command,{"chrome","كروم"}))target=L"chrome.exe";
    else if(LocalContainsAny(command,{"edge","مايكروسوفت إيدج","إيدج"}))target=L"msedge.exe";
    else return false;
    HINSTANCE r=ShellExecuteW(nullptr,L"open",target.c_str(),nullptr,nullptr,SW_SHOWNORMAL);
    return reinterpret_cast<INT_PTR>(r)>32;
}
static bool OpenSpecialFolder(const std::string& command){
    wchar_t path[MAX_PATH]{};
    if(LocalContainsAny(command,{"downloads","download","التنزيلات","التنزيل"})){
        if(FAILED(SHGetFolderPathW(nullptr,CSIDL_PERSONAL,nullptr,SHGFP_TYPE_CURRENT,path)))return false;
        std::filesystem::path p(path);p/=L"Downloads";
        if(std::filesystem::exists(p))wcscpy_s(path,p.wstring().c_str());
        else return false;
    }else if(LocalContainsAny(command,{"documents","document","المستندات","الوثائق"})){
        if(FAILED(SHGetFolderPathW(nullptr,CSIDL_PERSONAL,nullptr,SHGFP_TYPE_CURRENT,path)))return false;
    }else if(LocalContainsAny(command,{"desktop","سطح المكتب"})){
        if(FAILED(SHGetFolderPathW(nullptr,CSIDL_DESKTOPDIRECTORY,nullptr,SHGFP_TYPE_CURRENT,path)))return false;
    }else return false;
    HINSTANCE r=ShellExecuteW(nullptr,L"open",path,nullptr,nullptr,SW_SHOWNORMAL);
    return reinterpret_cast<INT_PTR>(r)>32;
}

static bool OpenFileBySpokenName(const std::string& command){
    const std::string lower=LocalCommandLower(command);
    std::string candidate;
    const size_t filePos=lower.find("file ");
    const size_t openPos=lower.find("open ");
    const size_t arFile=lower.find("ملف ");
    if(filePos!=std::string::npos) candidate=command.substr(filePos+5);
    else if(arFile!=std::string::npos) candidate=command.substr(arFile+5);
    else if(openPos!=std::string::npos) candidate=command.substr(openPos+5);
    else return false;
    while(!candidate.empty() && (candidate.front()==' ' || candidate.front()=='"' || candidate.front()=='\'')) candidate.erase(candidate.begin());
    while(!candidate.empty() && (candidate.back()==' ' || candidate.back()=='"' || candidate.back()=='\'' || candidate.back()=='.')) candidate.pop_back();
    if(candidate.empty()) return false;
    std::string pathUtf8=candidate;
    std::replace(pathUtf8.begin(),pathUtf8.end(),'/','\\');
    const std::wstring direct=Wide(pathUtf8);
    if(direct.size()>2 && (direct[1]==L':' || direct.rfind(L"\\\\",0)==0) && std::filesystem::exists(direct)){
        HINSTANCE r=ShellExecuteW(nullptr,L"open",direct.c_str(),nullptr,nullptr,SW_SHOWNORMAL);
        return reinterpret_cast<INT_PTR>(r)>32;
    }
    const std::wstring wanted=Wide(candidate);
    if(wanted.empty()) return false;
    wchar_t profile[MAX_PATH]{};
    if(FAILED(SHGetFolderPathW(nullptr,CSIDL_PROFILE,nullptr,SHGFP_TYPE_CURRENT,profile))) return false;
    const std::filesystem::path home(profile);
    std::vector<std::filesystem::path> roots={home/L"Desktop",home/L"Documents",home/L"Downloads",home/L"Music",home/L"Pictures",home/L"Videos",AppDirectory()};
    std::error_code ec;
    for(const auto& root:roots){
        if(!std::filesystem::exists(root,ec)) continue;
        try{
            size_t checked=0;
            for(const auto& entry:std::filesystem::recursive_directory_iterator(root,std::filesystem::directory_options::skip_permission_denied,ec)){
                if(ec){ec.clear();continue;}
                if(++checked>15000) break;
                if(!entry.is_regular_file(ec)){ec.clear();continue;}
                if(_wcsicmp(entry.path().filename().c_str(),wanted.c_str())==0){
                    HINSTANCE r=ShellExecuteW(nullptr,L"open",entry.path().wstring().c_str(),nullptr,nullptr,SW_SHOWNORMAL);
                    return reinterpret_cast<INT_PTR>(r)>32;
                }
            }
        }catch(...){}
    }
    return false;
}
static bool OpenMyComputer(){
    HINSTANCE r=ShellExecuteW(nullptr,L"open",L"::{20D04FE0-3AEA-1069-A2D8-08002B30309D}",nullptr,nullptr,SW_SHOWNORMAL);
    return reinterpret_cast<INT_PTR>(r)>32;
}
static bool PlayFirstLocalMusic(){
    wchar_t music[MAX_PATH]{};
    if(FAILED(SHGetFolderPathW(nullptr,CSIDL_MYMUSIC,nullptr,SHGFP_TYPE_CURRENT,music)))return false;
    const std::filesystem::path root(music);
    if(!std::filesystem::exists(root))return false;
    static const std::vector<std::wstring> exts={L".mp3",L".wav",L".m4a",L".aac",L".wma",L".flac"};
    try{
        int checked=0;
        for(const auto& e:std::filesystem::recursive_directory_iterator(root,std::filesystem::directory_options::skip_permission_denied)){
            if(++checked>1000)break;
            if(!e.is_regular_file())continue;
            auto ext=e.path().extension().wstring();
            std::transform(ext.begin(),ext.end(),ext.begin(),::towlower);
            if(std::find(exts.begin(),exts.end(),ext)!=exts.end()){
                HINSTANCE r=ShellExecuteW(nullptr,L"open",e.path().wstring().c_str(),nullptr,nullptr,SW_SHOWNORMAL);
                return reinterpret_cast<INT_PTR>(r)>32;
            }
        }
    }catch(...){}
    return false;
}
bool HandleOfflineSpeechCommand(const std::string& phrase){
    const std::string c=LocalCommandLower(phrase);
    if(c.empty())return false;
    if(LocalContainsAny(c,{"my computer","this pc","computer","جهاز الكمبيوتر","هذا الكمبيوتر","الكمبيوتر"})){
        const bool ok=OpenMyComputer();
        PostJson({{"type","native_command_result"},{"success",ok},{"message",ok?"Opened This PC.":"Could not open This PC."}});
        return true;
    }
    if(LocalContainsAny(c,{"open file","open the file","افتح ملف","افتح الملف"})){
        const bool ok=OpenFileBySpokenName(c);
        PostJson({{"type","native_command_result"},{"success",ok},{"message",ok?"Opened the requested file.":"I could not find that file in Desktop, Documents, Downloads, Music, Pictures, Videos, or the Saeed folder."}});
        return true;
    }
    if(LocalContainsAny(c,{"volume down","lower volume","turn down volume","decrease volume","خفض الصوت","اخفض الصوت","وطي الصوت","وطي"})){
        const bool ok=SetDefaultEndpointVolume(-0.10f,false);
        PostJson({{"type","native_command_result"},{"success",ok},{"message",ok?"Volume lowered.":"Could not change Windows volume."}});
        return true;
    }
    if(LocalContainsAny(c,{"volume up","increase volume","turn up volume","raise volume","رفع الصوت","ارفع الصوت","علي الصوت","علّي الصوت"})){
        const bool ok=SetDefaultEndpointVolume(0.10f,false);
        PostJson({{"type","native_command_result"},{"success",ok},{"message",ok?"Volume increased.":"Could not change Windows volume."}});
        return true;
    }
    if(LocalContainsAny(c,{"mute","silence","كتم الصوت","اكتم الصوت"})){
        const bool ok=SetDefaultEndpointVolume(0.0f,true);
        PostJson({{"type","native_command_result"},{"success",ok},{"message",ok?"System audio muted.":"Could not mute Windows audio."}});
        return true;
    }
    if(LocalContainsAny(c,{"play music","play a song","play song","شغل اغنية","شغل أغنية","شغل موسيقى","شغّل اغنية","شغّل أغنية","شغّل موسيقى"})){
        const bool ok=PlayFirstLocalMusic();
        PostJson({{"type","native_command_result"},{"success",ok},{"message",ok?"Playing local music.":"No local music file was found in the Music folder."}});
        return true;
    }
    if(OpenKnownWindowsTarget(c)){
        PostJson({{"type","native_command_result"},{"success",true},{"message","Opened the requested Windows application."}});
        return true;
    }
    if(OpenSpecialFolder(c)){
        PostJson({{"type","native_command_result"},{"success",true},{"message","Opened the requested Windows folder."}});
        return true;
    }
    return false;
}

void HandleNativeSpeechEvent(){
    if(!g_speechContext)return;
    SPEVENT evts[8]{};ULONG fetched=0;
    while(SUCCEEDED(g_speechContext->GetEvents(8,evts,&fetched)) && fetched){
        for(ULONG i=0;i<fetched;i++){
            if(evts[i].eEventId!=SPEI_RECOGNITION || !evts[i].lParam)continue;
            auto* recoResult=reinterpret_cast<ISpRecoResult*>(evts[i].lParam);
            wchar_t* text=nullptr;
            if(SUCCEEDED(recoResult->GetText(SP_GETWHOLEPHRASE,SP_GETWHOLEPHRASE,TRUE,&text,nullptr)) && text){
                const std::string phrase=Utf8(text);
                CoTaskMemFree(text);
                if(!phrase.empty()){ if(!HandleOfflineSpeechCommand(phrase)) PostJson({{"type","speech_result"},{"text",phrase}}); }
            }
            recoResult->Release();
        }
        fetched=0;
    }
}
void TrayCommand(const char* command){
    if(!g_webview)return;
    PostJson({{"type","native_command"},{"command",command}});
}
static void ApplySaeedSizePreset(int preset){
    if(!g_hwnd)return;
    HMONITOR m=MonitorFromWindow(g_hwnd,MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi{sizeof(mi)};
    if(!GetMonitorInfoW(m,&mi))return;
    const RECT a=mi.rcWork;
    int w=360,h=520;
    if(preset==0){w=300;h=420;} else if(preset==2){w=440;h=650;}
    const int workW=static_cast<int>(a.right-a.left), workH=static_cast<int>(a.bottom-a.top);
    const int maxW=std::max(260,workW-40), maxH=std::max(380,workH-40);
    w=std::min(w,maxW); h=std::min(h,maxH);
    RECT wr{};GetWindowRect(g_hwnd,&wr);
    const int cx=(wr.left+wr.right)/2, cy=(wr.top+wr.bottom)/2;
    const int x=std::max(static_cast<int>(a.left),std::min(cx-w/2,static_cast<int>(a.right-w)));
    const int y=std::max(static_cast<int>(a.top),std::min(cy-h/2,static_cast<int>(a.bottom-h)));
    SetWindowPos(g_hwnd,HWND_TOPMOST,x,y,w,h,SWP_NOACTIVATE|SWP_SHOWWINDOW);
    ResizeWebView();
    try{json s=LoadSettings();s["characterSize"]=preset;SaveSettings(s);}catch(...){}
}
void ShowTaskbarContextMenu(POINT p){
    HMENU menu=CreatePopupMenu();
    AppendMenuW(menu,MF_STRING,ID_TRAY_UPDATE,L"Check for Updates");
    AppendMenuW(menu,MF_STRING,ID_TRAY_CHAT,L"Chat with Saeed");
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
    if(cmd==ID_TRAY_UPDATE){SetTaskbarNotificationCount(0);OpenUpdateWindow();CheckForUpdateAsync();}
    else if(cmd==ID_TRAY_CHAT)OpenChatWindow();
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
void ShowTrayMenu(){
    POINT p{};GetCursorPos(&p);
    HMENU menu=CreatePopupMenu();
    AppendMenuW(menu,MF_STRING,ID_TRAY_SHOW,L"Show Saeed");
    AppendMenuW(menu,MF_STRING,ID_TRAY_HIDE,L"Hide Saeed");
    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
    AppendMenuW(menu,MF_STRING,ID_TRAY_CHARACTER,L"Change Character");
    AppendMenuW(menu,MF_STRING,ID_TRAY_UPDATE,L"Check for Updates");
    AppendMenuW(menu,MF_STRING,ID_TRAY_CHAT,L"Chat with Saeed");
    AppendMenuW(menu,MF_STRING,ID_TRAY_SETTINGS,L"Settings");
    AppendMenuW(menu,MF_STRING,ID_TRAY_PERFORMANCE,L"Performance");
    HMENU sizeMenu=CreatePopupMenu();
    AppendMenuW(sizeMenu,MF_STRING,ID_TRAY_SIZE_SMALL,L"Small");
    AppendMenuW(sizeMenu,MF_STRING,ID_TRAY_SIZE_MEDIUM,L"Medium");
    AppendMenuW(sizeMenu,MF_STRING,ID_TRAY_SIZE_LARGE,L"Large");
    AppendMenuW(menu,MF_POPUP,reinterpret_cast<UINT_PTR>(sizeMenu),L"Size");
    AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
    AppendMenuW(menu,MF_STRING,ID_TRAY_MUTE,L"Mute");
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
    else if(cmd==ID_TRAY_CHAT)OpenChatWindow();
    else if(cmd==ID_TRAY_CHARACTER)ChooseCharacterFile();
    else if(cmd==ID_TRAY_UPDATE){SetTaskbarNotificationCount(0);OpenUpdateWindow();CheckForUpdateAsync();}
    else if(cmd==ID_TRAY_SETTINGS)OpenSettingsWindow("general");
    else if(cmd==ID_TRAY_MUTE)TrayCommand("mute");
    else if(cmd==ID_TRAY_PAUSE)TrayCommand("pause_listening");
    else if(cmd==ID_TRAY_ABOUT){ShowWindow(g_hwnd,SW_SHOWNOACTIVATE);TrayCommand("about");}
    else if(cmd==ID_TRAY_RESET_POSITION){SetWindowPos(g_hwnd,HWND_TOPMOST,100,100,0,0,SWP_NOSIZE|SWP_NOACTIVATE);KeepOnCurrentWorkArea();ResizeWebView();}
    else if(cmd==ID_TRAY_EXIT){RemoveTrayIcon();DestroyWindow(g_hwnd);}
}
void ShowAvatarContextMenu(){
    POINT p{};GetCursorPos(&p);
    HMENU menu=CreatePopupMenu();
    AppendMenuW(menu,MF_STRING,ID_TRAY_SHOW,L"Show Saeed");
    AppendMenuW(menu,MF_STRING,ID_TRAY_HIDE,L"Hide Saeed");
    AppendMenuW(menu,MF_STRING,ID_TRAY_MUTE,L"Toggle Mute");
    AppendMenuW(menu,MF_STRING,ID_TRAY_SETTINGS,L"Settings");
    SetForegroundWindow(g_hwnd);
    const UINT cmd=TrackPopupMenu(menu,TPM_RETURNCMD|TPM_NONOTIFY|TPM_RIGHTBUTTON,p.x,p.y,0,g_hwnd,nullptr);
    DestroyMenu(menu);
    if(cmd==ID_TRAY_SHOW){ShowWindow(g_hwnd,SW_SHOWNOACTIVATE);SetWindowPos(g_hwnd,HWND_TOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);}
    else if(cmd==ID_TRAY_HIDE)ShowWindow(g_hwnd,SW_HIDE);
    else if(cmd==ID_TRAY_MUTE)TrayCommand("mute");
    else if(cmd==ID_TRAY_SETTINGS)OpenSettingsWindow("general");
}
void PostJson(const json& j);
std::wstring Wide(const std::string& s);
std::string Utf8(const std::wstring& s);
void WriteLog(const std::string& message);
std::wstring AppDirectory(){
    wchar_t b[MAX_PATH]{};
    DWORD n=GetModuleFileNameW(nullptr,b,MAX_PATH);
    std::wstring p(b,n);
    auto i=p.find_last_of(L"\\/");
    return i==std::wstring::npos?L".":p.substr(0,i);
}

static int CompareVersions(std::string a,std::string b){
    auto parse=[](std::string s){
        if(!s.empty()&&(s[0]=='v'||s[0]=='V'))s.erase(0,1);
        std::vector<int> out;std::stringstream ss(s);std::string part;
        while(std::getline(ss,part,'.')){try{out.push_back(std::stoi(part));}catch(...){out.push_back(0);}}
        while(out.size()<3)out.push_back(0);
        return out;
    };
    auto x=parse(a),y=parse(b);
    for(int i=0;i<3;i++)if(x[i]!=y[i])return x[i]<y[i]?-1:1;
    return 0;
}
struct ReleaseBuildInfo{
    std::string version;
    uint64_t build=0;
};
static ReleaseBuildInfo ParseReleaseTag(std::string tag){
    if(!tag.empty()&&(tag[0]=='v'||tag[0]=='V'))tag.erase(0,1);
    ReleaseBuildInfo out;
    const std::string marker="-build.";
    const auto p=tag.find(marker);
    out.version=(p==std::string::npos)?tag:tag.substr(0,p);
    if(p!=std::string::npos){
        try{out.build=std::stoull(tag.substr(p+marker.size()));}catch(...){out.build=0;}
    }
    return out;
}
static bool IsReleaseNewer(const std::string& tag){
    const auto rel=ParseReleaseTag(tag);
    const int versionCmp=CompareVersions(SAEED_VERSION,rel.version);
    if(versionCmp<0)return true;
    if(versionCmp>0)return false;
    return rel.build>static_cast<uint64_t>(SAEED_BUILD_NUMBER);
}
static std::string HttpGetText(const std::wstring& host,const std::wstring& path){
    HINTERNET s=WinHttpOpen(L"Saeed AI/1.0",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,nullptr,nullptr,0);
    if(!s)throw std::runtime_error("WinHTTP unavailable");
    HINTERNET c=WinHttpConnect(s,host.c_str(),INTERNET_DEFAULT_HTTPS_PORT,0);
    if(!c){WinHttpCloseHandle(s);throw std::runtime_error("Update server connection failed");}
    HINTERNET r=WinHttpOpenRequest(c,L"GET",path.c_str(),nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE);
    if(!r){WinHttpCloseHandle(c);WinHttpCloseHandle(s);throw std::runtime_error("Update request failed");}
    WinHttpSetTimeouts(r,5000,5000,10000,10000);
    const std::wstring headers=L"User-Agent: Saeed-AI/" + Wide(SAEED_VERSION) + L"\r\nAccept: application/vnd.github+json\r\n";
    if(!WinHttpSendRequest(r,headers.c_str(),static_cast<DWORD>(-1L),nullptr,0,0,0)||!WinHttpReceiveResponse(r,nullptr)){
        WinHttpCloseHandle(r);WinHttpCloseHandle(c);WinHttpCloseHandle(s);throw std::runtime_error("Update request failed");
    }
    DWORD status=0,statusSize=sizeof(status);
    if(!WinHttpQueryHeaders(r,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&statusSize,nullptr)||status<200||status>=300){
        WinHttpCloseHandle(r);WinHttpCloseHandle(c);WinHttpCloseHandle(s);
        throw std::runtime_error("Update server returned HTTP status "+std::to_string(status));
    }
    std::string out;DWORD avail=0;
    while(WinHttpQueryDataAvailable(r,&avail)&&avail){
        std::string buf(avail,'\0');DWORD got=0;
        if(!WinHttpReadData(r,buf.data(),avail,&got)||!got)break;
        buf.resize(got);out+=buf;
    }
    WinHttpCloseHandle(r);WinHttpCloseHandle(c);WinHttpCloseHandle(s);
    return out;
}
static std::wstring TempUpdatePath(){
    wchar_t b[MAX_PATH]{};GetTempPathW(MAX_PATH,b);
    return (std::filesystem::path(b)/(L"Saeed-AI-Update-"+std::to_wstring(GetTickCount64())+L".exe")).wstring();
}
static void DownloadUpdate(const std::string& url,const std::wstring& out){
    URL_COMPONENTSW uc{};uc.dwStructSize=sizeof(uc);
    wchar_t host[512]{},path[4096]{},extra[4096]{};
    uc.lpszHostName=host;uc.dwHostNameLength=512;uc.lpszUrlPath=path;uc.dwUrlPathLength=4096;
    uc.lpszExtraInfo=extra;uc.dwExtraInfoLength=4096;
    if(!WinHttpCrackUrl(Wide(url).c_str(),0,0,&uc))throw std::runtime_error("Invalid update URL");
    HINTERNET s=WinHttpOpen(L"Saeed AI/1.0",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,nullptr,nullptr,0);
    if(!s)throw std::runtime_error("WinHTTP unavailable");
    HINTERNET c=WinHttpConnect(s,uc.lpszHostName,uc.nPort,0);
    if(!c){WinHttpCloseHandle(s);throw std::runtime_error("Update download connection failed");}
    std::wstring req=std::wstring(uc.lpszUrlPath,uc.dwUrlPathLength)+std::wstring(uc.lpszExtraInfo?uc.lpszExtraInfo:L"",uc.dwExtraInfoLength);
    HINTERNET r=WinHttpOpenRequest(c,L"GET",req.c_str(),nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,uc.nScheme==INTERNET_SCHEME_HTTPS?WINHTTP_FLAG_SECURE:0);
    if(!r){WinHttpCloseHandle(c);WinHttpCloseHandle(s);throw std::runtime_error("Update download request failed");}
    WinHttpSetTimeouts(r,5000,5000,15000,30000);
    const std::wstring headers=L"User-Agent: Saeed-AI/" + Wide(SAEED_VERSION) + L"\r\nAccept: application/octet-stream\r\n";
    if(!WinHttpSendRequest(r,headers.c_str(),static_cast<DWORD>(-1L),nullptr,0,0,0)||!WinHttpReceiveResponse(r,nullptr)){
        WinHttpCloseHandle(r);WinHttpCloseHandle(c);WinHttpCloseHandle(s);throw std::runtime_error("Update download failed");
    }
    DWORD status=0,statusSize=sizeof(status);
    if(!WinHttpQueryHeaders(r,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&statusSize,nullptr)||status<200||status>=300){
        WinHttpCloseHandle(r);WinHttpCloseHandle(c);WinHttpCloseHandle(s);
        throw std::runtime_error("Update download server returned HTTP status "+std::to_string(status));
    }
    std::ofstream f(Utf8(out),std::ios::binary);if(!f){WinHttpCloseHandle(r);WinHttpCloseHandle(c);WinHttpCloseHandle(s);throw std::runtime_error("Cannot create update file");}
    DWORD contentLength=0, contentLengthSize=sizeof(contentLength);
    WinHttpQueryHeaders(r,WINHTTP_QUERY_CONTENT_LENGTH|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&contentLength,&contentLengthSize,nullptr);
    uint64_t downloaded=0;
    DWORD avail=0;
    while(WinHttpQueryDataAvailable(r,&avail)&&avail){
        std::vector<char>buf(avail);DWORD got=0;
        if(!WinHttpReadData(r,buf.data(),avail,&got)||!got)break;
        f.write(buf.data(),got);
        downloaded+=got;
        PostJson({{"type","update_progress"},{"downloaded",downloaded},{"total",static_cast<uint64_t>(contentLength)}});
    }
    f.close();WinHttpCloseHandle(r);WinHttpCloseHandle(c);WinHttpCloseHandle(s);
    if(!std::filesystem::exists(out)||std::filesystem::file_size(out)<100000)throw std::runtime_error("Downloaded update is invalid");
}
static void ApplyUpdateHelper(const std::wstring& installer,DWORD parentPid){
    if(parentPid){
        HANDLE p=OpenProcess(SYNCHRONIZE,FALSE,parentPid);
        if(p){WaitForSingleObject(p,30000);CloseHandle(p);}
    }
    std::wstring cmd=L"\""+installer+L"\" /SILENT /CLOSEAPPLICATIONS /NORESTART";
    STARTUPINFOW si{sizeof(si)};PROCESS_INFORMATION pi{};
    if(!CreateProcessW(nullptr,cmd.data(),nullptr,nullptr,FALSE,0,nullptr,nullptr,&si,&pi))return;
    WaitForSingleObject(pi.hProcess,INFINITE);
    DWORD code=1;GetExitCodeProcess(pi.hProcess,&code);
    CloseHandle(pi.hThread);CloseHandle(pi.hProcess);
    std::error_code ec;std::filesystem::remove(installer,ec);
    if(code==0){
        std::filesystem::path app=std::filesystem::path(AppDirectory())/L"Saeed.exe";
        ShellExecuteW(nullptr,L"open",app.wstring().c_str(),nullptr,nullptr,SW_SHOWNOACTIVATE);
    }
}
static void CheckForUpdateAsync(){
    std::thread([](){
        try{
            PostJson({{"type","update_status"},{"text","Connecting to GitHub...","state","checking_update","phase","connect"}});
            const auto raw=HttpGetText(L"api.github.com",L"/repos/saeedhub101/Saeed-AI/releases/latest");
            PostJson({{"type","update_status"},{"text","Reading the latest Saeed AI release...","state","checking_update","phase","release"}});
            const auto rel=json::parse(raw);
            const std::string latest=rel.value("tag_name","");
            const std::string publishedAt=rel.value("published_at","");
            const auto releaseInfo=ParseReleaseTag(latest);
            const uint64_t remoteBuild=releaseInfo.build;
            if(latest.empty()){
                PostJson({{"type","update_status"},{"text","GitHub did not return a release version.","state","update_error"}});
                return;
            }

            std::string asset;
            uint64_t assetSize=0;
            std::string assetDigest;
            for(const auto&a:rel.value("assets",json::array())){
                if(a.value("name","")=="Saeed-AI-Setup-x64.exe"){
                    asset=a.value("browser_download_url","");
                    assetSize=a.value("size",0ULL);
                    assetDigest=a.value("digest","");
                    break;
                }
            }

            const bool newer=IsReleaseNewer(latest);
            if(newer){
                try{
                    json settings=LoadSettings();
                    const std::string notified=settings.value("lastNotifiedUpdateTag","");
                    if(notified!=latest){
                        IncrementNotificationCount(1);
                        settings["lastNotifiedUpdateTag"]=latest;
                        SaveSettings(settings);
                        ShowNativeNotification(L"Saeed AI Update",Wide("A new update "+latest+" is available."));
                    }
                }catch(...){ IncrementNotificationCount(1); }
            }
            if(!newer){
                PostJson({{"type","update_status"},
                          {"text","You are up to date.","state","up_to_date","phase","complete"},
                          {"current",SAEED_VERSION},
                          {"currentBuild",SAEED_BUILD_NUMBER},
                          {"latest",latest},
                          {"latestBuild",remoteBuild}});
                return;
            }

            if(asset.empty()){
                PostJson({{"type","update_status"},
                          {"text","A newer version was found, but its Windows installer is not available yet.","state","update_error"},
                          {"latest",latest},{"latestBuild",remoteBuild}});
                return;
            }

            PostJson({{"type","update_available"},
                      {"version",releaseInfo.version.empty()?latest:releaseInfo.version},
                      {"tag",latest},
                      {"url",asset},
                      {"current",SAEED_VERSION},
                      {"build",remoteBuild},
                      {"size",assetSize},
                      {"digest",assetDigest},{"publishedAt",publishedAt}});
        }catch(const std::exception&e){
            WriteLog(std::string("Update check failed: ")+e.what());
            PostJson({{"type","update_status"},
                      {"text",std::string("Update check failed: ")+e.what()},
                      {"state","update_error"},
                      {"phase","error"}});
        }catch(...){
            WriteLog("Update check failed");
            PostJson({{"type","update_status"},{"text","Update check failed for an unknown reason.","state","update_error","phase","error"}});
        }
    }).detach();
}
static void StartUpdateDownload(const std::string& url,const std::string& version){
    std::thread([url,version](){
        try{
            if(url.empty())throw std::runtime_error("No Windows installer URL was provided.");
            PostJson({{"type","update_status"},{"text","Preparing the update...","state","downloading_update","phase","prepare"}});
            const std::wstring installer=TempUpdatePath();
            PostJson({{"type","update_status"},{"text","Downloading the new installer...","state","downloading_update","phase","download"}});
            DownloadUpdate(url,installer);
            PostJson({{"type","update_status"},{"text","Download complete. Verifying the installer...","state","verifying_update","phase","verify"}});
            if(!std::filesystem::exists(installer)||std::filesystem::file_size(installer)<100000)
                throw std::runtime_error("Downloaded installer is missing or incomplete.");
            PostJson({{"type","update_status"},{"text","Starting the update installer...","state","installing_update","phase","install"}});
            std::wstring exe=(std::filesystem::path(AppDirectory())/L"Saeed.exe").wstring();
            std::wstring cmd=L"\""+exe+L"\" --saeed-apply-update \""+installer+L"\" "+std::to_wstring(GetCurrentProcessId());
            STARTUPINFOW si{sizeof(si)};PROCESS_INFORMATION pi{};
            if(!CreateProcessW(exe.c_str(),cmd.data(),nullptr,nullptr,FALSE,0,nullptr,nullptr,&si,&pi))
                throw std::runtime_error("Could not start integrated update helper.");
            CloseHandle(pi.hThread);CloseHandle(pi.hProcess);
            PostJson({{"type","update_status"},{"text","The installer is ready. Saeed will close and install the update now.","state","installing_update","phase","restart"}});
            PostMessageW(g_hwnd,WM_CLOSE,0,0);
        }catch(const std::exception&e){
            PostJson({{"type","update_status"},{"text",std::string("Update failed: ")+e.what(),"state","update_error","phase","error"}});
        }
    }).detach();
}
std::wstring HistoryPath(){wchar_t b[MAX_PATH]{};GetEnvironmentVariableW(L"APPDATA",b,MAX_PATH);return std::wstring(b)+L"\\Saeed\\history.json";}
std::wstring AgentTasksPath(){wchar_t b[MAX_PATH]{};GetEnvironmentVariableW(L"APPDATA",b,MAX_PATH);return std::wstring(b)+L"\\Saeed\\agent_tasks.json";}
json LoadArrayFile(const std::wstring& p);
bool SaveArrayFile(const std::wstring& p,const json& j);
std::string WallClockIso();



void RecordAgentEvent(const std::string& taskId,const std::string& state,const std::string& text,int step=0,const std::string& tool=""){
    try{
        auto events=LoadArrayFile(AgentTasksPath());
        if(!events.is_array()) events=json::array();
        events.push_back({{"time",WallClockIso()},{"taskId",taskId},{"state",state},{"text",text},{"step",step},{"tool",tool}});
        if(events.size()>300) events.erase(events.begin(),events.begin()+(events.size()-300));
        SaveArrayFile(AgentTasksPath(),events);
    }catch(...){}
}

std::wstring AgentTaskStatePath(){
    wchar_t b[MAX_PATH]{};
    GetEnvironmentVariableW(L"APPDATA",b,MAX_PATH);
    return std::wstring(b)+L"\\Saeed\\agent_task_state.json";
}

void UpdateAgentTaskState(const std::string& taskId,const std::string& goal,const std::string& state,
                          int step=0,int maxSteps=0,const std::string& phase="",
                          const std::string& tool="",int attempt=0,const std::string& message=""){
    try{
        json s={
            {"taskId",taskId},{"goal",goal},{"state",state},{"step",step},
            {"maxSteps",maxSteps},{"phase",phase},{"tool",tool},{"attempt",attempt},
            {"message",message},{"updatedAt",WallClockIso()}
        };
        SaveArrayFile(AgentTaskStatePath(),s);
    }catch(...){}
}

std::wstring SaeedDataRoot(){
    wchar_t b[MAX_PATH]{};
    GetEnvironmentVariableW(L"APPDATA",b,MAX_PATH);
    std::filesystem::path p=std::filesystem::path(b)/L"Saeed";
    std::error_code ec; std::filesystem::create_directories(p,ec);
    return p.wstring();
}
std::wstring LinkedAccountsPath(){ return (std::filesystem::path(SaeedDataRoot())/L"linked_accounts.json").wstring(); }
std::wstring AccountSessionDir(const std::string& provider,const std::string& accountId){
    std::wstring safe=Wide(provider+"_"+accountId);
    for(auto& ch:safe) if(ch==L'/'||ch==L'\\'||ch==L':'||ch==L'?'||ch==L'*'||ch==L'\"'||ch==L'<'||ch==L'>'||ch==L'|') ch=L'_';
    return (std::filesystem::path(SaeedDataRoot())/L"accounts"/safe).wstring();
}
void RemoveDirectoryTreeSafe(const std::wstring& path){
    std::error_code ec;
    if(std::filesystem::exists(path,ec)) std::filesystem::remove_all(path,ec);
    WriteLog("Linked account session removed: "+Utf8(path));
}
void SignOutLinkedAccount(const std::string& provider,const std::string& accountId){
    if(provider.empty()||accountId.empty()) return;
    auto dir=AccountSessionDir(provider,accountId);
    RemoveDirectoryTreeSafe(dir);
    auto accounts=LoadArrayFile(LinkedAccountsPath());
    if(!accounts.is_array()) accounts=json::array();
    json kept=json::array();
    for(const auto& a:accounts){
        if(a.value("provider","")==provider && a.value("accountId","")==accountId) continue;
        kept.push_back(a);
    }
    SaveArrayFile(LinkedAccountsPath(),kept);
    PostJson({{"type","account_signed_out"},{"provider",provider},{"accountId",accountId}});
}
void SaveLinkedAccountSession(const json& account,const json& importedData){
    const std::string provider=account.value("provider","");
    const std::string accountId=account.value("accountId","");
    if(provider.empty()||accountId.empty()) throw std::runtime_error("Invalid linked account");
    auto dir=AccountSessionDir(provider,accountId);
    std::error_code ec; std::filesystem::create_directories(dir,ec);
    if(ec) throw std::runtime_error("Cannot create account session directory");
    {
        std::ofstream f(Utf8((std::filesystem::path(dir)/L"session.json").wstring()),std::ios::binary|std::ios::trunc);
        if(!f) throw std::runtime_error("Cannot save account session");
        f<<account.dump(2); f.flush();
        if(!f) throw std::runtime_error("Cannot write account session");
    }
    {
        std::ofstream f(Utf8((std::filesystem::path(dir)/L"imported_data.json").wstring()),std::ios::binary|std::ios::trunc);
        if(!f) throw std::runtime_error("Cannot save imported account data");
        f<<importedData.dump(2); f.flush();
        if(!f) throw std::runtime_error("Cannot write imported account data");
    }
    auto accounts=LoadArrayFile(LinkedAccountsPath());
    if(!accounts.is_array()) accounts=json::array();
    bool found=false;
    for(auto& a:accounts) if(a.value("provider","")==provider && a.value("accountId","")==accountId){a=account;found=true;break;}
    if(!found) accounts.push_back(account);
    SaveArrayFile(LinkedAccountsPath(),accounts);
}
void ClearAllLinkedAccountSessions(){
    auto root=std::filesystem::path(SaeedDataRoot())/L"accounts";
    std::error_code ec;
    if(std::filesystem::exists(root,ec)) std::filesystem::remove_all(root,ec);
    SaveArrayFile(LinkedAccountsPath(),json::array());
}

std::wstring MemoryPath(){wchar_t b[MAX_PATH]{};GetEnvironmentVariableW(L"APPDATA",b,MAX_PATH);return std::wstring(b)+L"\\Saeed\\memory.json";}
std::wstring SettingsPath(){
    wchar_t b[MAX_PATH]{};
    GetEnvironmentVariableW(L"APPDATA",b,MAX_PATH);
    return std::wstring(b)+L"\\Saeed\\settings.json";
}

std::string Utf8(const std::wstring& s){
    if(s.empty()) return {};
    int n=WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),nullptr,0,nullptr,nullptr);
    std::string r(n,'\0');
    WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),r.data(),n,nullptr,nullptr);
    return r;
}

void WriteLog(const std::string& message);
void CheckForUpdateAsync();

LONG WINAPI SaeedUnhandledException(EXCEPTION_POINTERS* info){
    std::string msg="Unhandled native exception";
    if(info&&info->ExceptionRecord){
        msg+=" code=0x"+std::to_string(static_cast<unsigned long long>(info->ExceptionRecord->ExceptionCode));
    }
    WriteLog(msg);
    return EXCEPTION_EXECUTE_HANDLER;
}

void WriteLog(const std::string& message){
    try{
        wchar_t b[MAX_PATH]{};
        GetEnvironmentVariableW(L"LOCALAPPDATA",b,MAX_PATH);
        std::filesystem::path fp=std::filesystem::path(b)/L"Saeed"/L"saeed.log";
        std::filesystem::create_directories(fp.parent_path());
        std::ofstream f(Utf8(fp.wstring()),std::ios::app);
        if(f) f<<message<<"\n";
    }catch(...){}
}

std::wstring Wide(const std::string& s){
    if(s.empty()) return {};
    int n=MultiByteToWideChar(CP_UTF8,0,s.data(),(int)s.size(),nullptr,0);
    std::wstring r(n,L'\0'); MultiByteToWideChar(CP_UTF8,0,s.data(),(int)s.size(),r.data(),n); return r;
}

std::string Base64Encode(const std::vector<BYTE>& data){
    if(data.empty()) return {};
    DWORD need=0;
    if(!CryptBinaryToStringA(data.data(),(DWORD)data.size(),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,nullptr,&need)) return {};
    std::string out(need,'\0');
    if(!CryptBinaryToStringA(data.data(),(DWORD)data.size(),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,out.data(),&need)) return {};
    if(!out.empty()&&out.back()=='\0')out.pop_back();
    return out;
}
struct MonitorCaptureContext{int wanted=-1;int index=0;RECT rect{};bool found=false;};
BOOL CALLBACK FindMonitorForCapture(HMONITOR m,HDC,LPRECT,LPARAM lp){
    auto* c=reinterpret_cast<MonitorCaptureContext*>(lp);
    if(c->wanted<0||c->index++==c->wanted){MONITORINFO mi{sizeof(mi)};if(GetMonitorInfoW(m,&mi)){c->rect=mi.rcMonitor;c->found=true;return FALSE;}}
    return TRUE;
}
std::string CaptureMonitorJpeg(int monitorIndex){
    // Limit capture size to keep vision requests practical on 4K/8K monitors.
    MonitorCaptureContext ctx;ctx.wanted=monitorIndex;
    EnumDisplayMonitors(nullptr,nullptr,FindMonitorForCapture,reinterpret_cast<LPARAM>(&ctx));
    if(!ctx.found) return {};
    int w=ctx.rect.right-ctx.rect.left,h=ctx.rect.bottom-ctx.rect.top;
    HDC screen=GetDC(nullptr),mem=CreateCompatibleDC(screen);
    if(!screen||!mem){if(mem)DeleteDC(mem);if(screen)ReleaseDC(nullptr,screen);return {};}
    const int maxWidth=1920;
    const int maxHeight=1080;
    int capW=w, capH=h;
    double scale=std::min(1.0,std::min((double)maxWidth/w,(double)maxHeight/h));
    capW=std::max(1,(int)(w*scale)); capH=std::max(1,(int)(h*scale));
    HBITMAP bmp=CreateCompatibleBitmap(screen,capW,capH);
    if(!bmp){DeleteDC(mem);ReleaseDC(nullptr,screen);return {};}
    HGDIOBJ old=SelectObject(mem,bmp);
    SetStretchBltMode(mem,HALFTONE);
    BOOL copied=StretchBlt(mem,0,0,capW,capH,screen,ctx.rect.left,ctx.rect.top,w,h,SRCCOPY|CAPTUREBLT);
    SelectObject(mem,old);ReleaseDC(nullptr,screen);
    if(!copied){DeleteObject(bmp);DeleteDC(mem);return {};}
    HRESULT ci=CoInitializeEx(nullptr,COINIT_MULTITHREADED);
    bool uninit=SUCCEEDED(ci);
    ComPtr<IWICImagingFactory> factory;
    HRESULT hr=CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory));
    ComPtr<IWICBitmap> wb;
    if(SUCCEEDED(hr))hr=factory->CreateBitmapFromHBITMAP(bmp,nullptr,WICBitmapUseAlpha,&wb);
    DeleteObject(bmp);DeleteDC(mem);
    if(FAILED(hr)){if(uninit)CoUninitialize();return {};}
    IStream* rawStream=SHCreateMemStream(nullptr,0);
    if(!rawStream){if(uninit)CoUninitialize();return {};}
    ComPtr<IStream> stream;stream.Attach(rawStream);
    ComPtr<IWICBitmapEncoder> enc;
    hr=factory->CreateEncoder(GUID_ContainerFormatJpeg,nullptr,&enc);
    if(SUCCEEDED(hr))hr=enc->Initialize(stream.Get(),WICBitmapEncoderNoCache);
    ComPtr<IWICBitmapFrameEncode> frame;
    ComPtr<IPropertyBag2> props;
    if(SUCCEEDED(hr))hr=enc->CreateNewFrame(&frame,&props);
    if(SUCCEEDED(hr))hr=frame->Initialize(props.Get());
    if(SUCCEEDED(hr))hr=frame->SetSize((UINT)capW,(UINT)capH);
    if(SUCCEEDED(hr)){WICPixelFormatGUID fmt=GUID_WICPixelFormat24bppBGR;hr=frame->SetPixelFormat(&fmt);}
    if(SUCCEEDED(hr))hr=frame->WriteSource(wb.Get(),nullptr);
    if(SUCCEEDED(hr))hr=frame->Commit();
    if(SUCCEEDED(hr))hr=enc->Commit();
    if(FAILED(hr)){if(uninit)CoUninitialize();return {};}
    STATSTG st{};hr=stream->Stat(&st,STATFLAG_NONAME);
    if(FAILED(hr)||st.cbSize.HighPart!=0){if(uninit)CoUninitialize();return {};}
    ULONG size=(ULONG)st.cbSize.LowPart;
    LARGE_INTEGER zero{};stream->Seek(zero,STREAM_SEEK_SET,nullptr);
    std::vector<BYTE> bytes(size);ULONG read=0;
    hr=stream->Read(bytes.data(),size,&read);
    if(uninit)CoUninitialize();
    if(FAILED(hr)||read!=size)return {};
    return Base64Encode(bytes);
}
std::string ProtectSecret(const std::string& plain){
    if(plain.empty()) return {};
    DATA_BLOB in{(DWORD)plain.size(),(BYTE*)plain.data()}, out{};
    if(!CryptProtectData(&in,L"Saeed API Key",nullptr,nullptr,nullptr,CRYPTPROTECT_UI_FORBIDDEN,&out)) return plain;
    DWORD need=0; CryptBinaryToStringA(out.pbData,out.cbData,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,nullptr,&need);
    std::string b64(need,'\0'); CryptBinaryToStringA(out.pbData,out.cbData,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,b64.data(),&need);
    LocalFree(out.pbData); if(!b64.empty() && b64.back()=='\0') b64.pop_back(); return "DPAPI:"+b64;
}
std::string UnprotectSecret(const std::string& stored){
    if(stored.rfind("DPAPI:",0)!=0) return stored;
    std::string b64=stored.substr(6); DWORD bytes=0;
    if(!CryptStringToBinaryA(b64.c_str(),0,CRYPT_STRING_BASE64,nullptr,&bytes,nullptr,nullptr)) return {};
    std::vector<BYTE> buf(bytes); if(!CryptStringToBinaryA(b64.c_str(),0,CRYPT_STRING_BASE64,buf.data(),&bytes,nullptr,nullptr)) return {};
    DATA_BLOB in{bytes,buf.data()}, out{};
    if(!CryptUnprotectData(&in,nullptr,nullptr,nullptr,nullptr,CRYPTPROTECT_UI_FORBIDDEN,&out)) return {};
    std::string plain((char*)out.pbData,out.cbData); LocalFree(out.pbData); return plain;
}

json LoadSettings(){
    std::ifstream f(Utf8(SettingsPath()));
    if(!f) return {{"provider","openrouter"},{"baseUrl","https://openrouter.ai/api/v1"},{"model","openai/gpt-5.1"},{"apiKey",""},{"sttProvider","Local Windows"},{"sttBaseUrl",""},{"sttModel",""},{"sttApiKey",""},{"maxSteps",12}};
    try { json j; f>>j; if(j.contains("apiKey")) j["apiKey"]=UnprotectSecret(j.value("apiKey","")); if(j.contains("sttApiKey")) j["sttApiKey"]=UnprotectSecret(j.value("sttApiKey","")); if(!j.contains("sttProviderUserSet")){ j["sttProvider"]="Local Windows"; j["sttBaseUrl"]=""; j["sttModel"]=""; } return j; } catch(...) { return {{"provider","openrouter"},{"baseUrl","https://openrouter.ai/api/v1"},{"model","openai/gpt-5.1"},{"apiKey",""},{"sttProvider","OpenAI"},{"sttBaseUrl","https://api.openai.com/v1"},{"sttModel","whisper-1"},{"sttApiKey",""},{"maxSteps",12}}; }
}
json LoadArrayFile(const std::wstring& p){
    std::ifstream f(Utf8(p));if(!f)return json::array();
    try{json j;f>>j;return j.is_array()?j:json::array();}catch(...){return json::array();}
}
bool SaveArrayFile(const std::wstring& p,const json& j){
    try{
        size_t slash=p.find_last_of(L"\\/");
        if(slash!=std::wstring::npos)std::filesystem::create_directories(std::filesystem::path(p).parent_path());
        std::ofstream f(Utf8(p),std::ios::trunc);
        if(!f)return false;
        f<<j.dump(2);
        f.flush();
        return f.good();
    }catch(...){
        return false;
    }
}
std::string WallClockIso(){
    using namespace std::chrono;
    const auto now=system_clock::now();
    const auto ms=duration_cast<milliseconds>(now.time_since_epoch())%1000;
    const std::time_t tt=system_clock::to_time_t(now);
    std::tm utc{};
    gmtime_s(&utc,&tt);
    std::ostringstream out;
    out<<std::put_time(&utc,"%Y-%m-%dT%H:%M:%S")<<'.'
       <<std::setfill('0')<<std::setw(3)<<ms.count()<<"Z";
    return out.str();
}
void SaveSettings(const json& j){
    std::wstring p=SettingsPath();
    size_t slash=p.find_last_of(L"\\/");
    if(slash!=std::wstring::npos) std::filesystem::create_directories(std::filesystem::path(p).parent_path());
    json out=j; if(out.contains("apiKey")) out["apiKey"]=ProtectSecret(out.value("apiKey","")); if(out.contains("sttApiKey")) out["sttApiKey"]=ProtectSecret(out.value("sttApiKey","")); std::ofstream f(Utf8(p)); f<<out.dump(2);
}
std::wstring CharacterDirectory(){
    wchar_t b[MAX_PATH]{};
    GetEnvironmentVariableW(L"APPDATA",b,MAX_PATH);
    return std::wstring(b)+L"\\Saeed\\Characters";
}
std::string UrlPathSegment(const std::wstring& value){
    const std::string bytes=Utf8(value);
    static const char hex[]="0123456789ABCDEF";
    std::string out;
    for(unsigned char ch:bytes){
        const bool safe=(ch>='a'&&ch<='z')||(ch>='A'&&ch<='Z')||(ch>='0'&&ch<='9')||ch=='-'||ch=='_'||ch=='.'||ch=='~';
        if(safe) out.push_back((char)ch);
        else { out.push_back('%'); out.push_back(hex[(ch>>4)&0xF]); out.push_back(hex[ch&0xF]); }
    }
    return out;
}
std::string CharacterVirtualUrl(const std::wstring& p){
    return "https://saeed-characters.local/"+UrlPathSegment(std::filesystem::path(p).filename().wstring());
}
void SendCharacterSelection(){
    json s=LoadSettings();
    std::wstring p;
    if(s.contains("characterPath")&&s["characterPath"].is_string())
        p=std::filesystem::path(s["characterPath"].get<std::string>()).wstring();
    if(p.empty()||!std::filesystem::exists(p)){
        PostJson({{"type","character_selected"},{"name","Saeed"},{"path","./saeed_AI-3D.glb"},{"builtin",true}});
        return;
    }
    PostJson({{"type","character_selected"},{"name",Utf8(std::filesystem::path(p).stem().wstring())},{"path",CharacterVirtualUrl(p)},{"builtin",false}});
}
void ChooseCharacterFile(){
    wchar_t file[MAX_PATH*4]{};
    OPENFILENAMEW ofn{};
    ofn.lStructSize=sizeof(ofn); ofn.hwndOwner=g_hwnd;
    ofn.lpstrFile=file; ofn.nMaxFile=static_cast<DWORD>(std::size(file));
    ofn.lpstrFilter=L"GLB Character (*.glb)\\0*.glb\\0All Files (*.*)\\0*.*\\0";
    ofn.Flags=OFN_FILEMUSTEXIST|OFN_PATHMUSTEXIST|OFN_HIDEREADONLY;
    if(!GetOpenFileNameW(&ofn))return;
    try{
        std::filesystem::create_directories(CharacterDirectory());
        std::filesystem::path src(file);
        std::filesystem::path dst=std::filesystem::path(CharacterDirectory())/(src.stem().wstring()+L".glb");
        std::filesystem::copy_file(src,dst,std::filesystem::copy_options::overwrite_existing);
        json s=LoadSettings();
        s["characterPath"]=Utf8(dst.wstring());
        SaveSettings(s);
        SendCharacterSelection();
    }catch(const std::exception& e){
        PostJson({{"type","character_error"},{"text",std::string("تعذر إضافة الشخصية: ")+e.what()}});
    }
}
void ResizeWebView(){if(!g_controller)return;RECT r{};GetClientRect(g_hwnd,&r);g_controller->put_Bounds(r);}
void ApplyDpiSuggestedRect(LPARAM lp){
    if(!g_hwnd||!lp)return;
    const RECT* suggested=reinterpret_cast<const RECT*>(lp);
    if(suggested){
        SetWindowPos(g_hwnd,nullptr,suggested->left,suggested->top,
                     suggested->right-suggested->left,suggested->bottom-suggested->top,
                     SWP_NOZORDER|SWP_NOACTIVATE);
    }
}
void KeepOnCurrentWorkArea(){
    HMONITOR m=MonitorFromWindow(g_hwnd,MONITOR_DEFAULTTONEAREST); MONITORINFO mi{sizeof(mi)};
    if(!GetMonitorInfoW(m,&mi))return; RECT r=mi.rcWork,w{};GetWindowRect(g_hwnd,&w);
    int ww=w.right-w.left,hh=w.bottom-w.top,margin=24;
    int x=std::clamp(w.left,r.left,r.right-ww);
    int y=std::clamp(w.top,r.top,r.bottom-hh);
    // Default/fresh placement remains bottom-right, but existing travel positions are preserved.
    if(w.left==100 && w.top==100){x=std::clamp(r.right-ww-margin,r.left,r.right-ww);y=std::clamp(r.bottom-hh-margin,r.top,r.bottom-hh);}
    SetWindowPos(g_hwnd,HWND_TOPMOST,x,y,ww,hh,SWP_NOACTIVATE|SWP_SHOWWINDOW);
}
void StartCharacterTravel(double nx,double ny,int durationMs){
    if(!g_hwnd)return;
    HMONITOR m=MonitorFromWindow(g_hwnd,MONITOR_DEFAULTTONEAREST);MONITORINFO mi{sizeof(mi)};
    if(!GetMonitorInfoW(m,&mi))return;
    RECT a=mi.rcWork,w{};GetWindowRect(g_hwnd,&w);
    const int ww=w.right-w.left,hh=w.bottom-w.top;
    const int maxX=std::max(a.left,a.right-ww),maxY=std::max(a.top,a.bottom-hh);
    const double x=std::clamp(nx,0.0,1.0),y=std::clamp(ny,0.0,1.0);
    g_walkFrom={w.left,w.top};g_walkTo={static_cast<LONG>(std::lround(a.left+x*(maxX-a.left))),static_cast<LONG>(std::lround(a.top+y*(maxY-a.top)))};
    g_walkStart=GetTickCount64();g_walkDuration=static_cast<ULONGLONG>(std::clamp(durationMs,700,30000));g_walkActive=true;
    SetTimer(g_hwnd,ID_SAEED_WALK_TIMER,16,nullptr);
}
void PostJson(const json& j){
    if(!g_hwnd)return;
    try{
        const std::string type=j.value("type","");
        if(type=="error"||type=="speech_error"||type=="character_error"||type=="startup_diagnostic"||type=="runtime_diagnostic")
            WriteLog("DIAGNOSTIC["+type+"]: "+j.dump());
    }catch(...){WriteLog("DIAGNOSTIC: failed to serialize event");}
    auto* p=new std::wstring(Wide(j.dump()));
    if(!PostMessageW(g_hwnd,WM_APP+1,0,reinterpret_cast<LPARAM>(p))) delete p;
}
void AskConfirmation(const std::string& name,const json& args){
    const std::string id=std::to_string(++g_requestId);
    {
        std::lock_guard<std::mutex> l(g_confirmMutex);
        g_confirmId=id; g_confirmValue=false;
    }
    PostJson({{"type","status"},{"text","بانتظار موافقتك"},{"state","waiting_confirmation"},{"requestId",id},{"taskId",g_agentTaskId},{"tool",name}});
    PostJson({{"type","confirm"},{"id",id},{"name",name},{"args",args}});
    std::unique_lock<std::mutex> l(g_confirmMutex);
    g_confirmCv.wait(l,[&]{return g_confirmId!=id;});
}
bool WaitConfirmation(const std::string& name,const json& args){
    std::unique_lock<std::mutex> requestLock(g_confirmRequestMutex);
    const std::string id=std::to_string(++g_requestId);
    {
        std::lock_guard<std::mutex> l(g_confirmMutex);
        g_confirmId=id; g_confirmValue=false;
    }
    PostJson({{"type","status"},{"text","بانتظار موافقتك"},{"state","waiting_confirmation"},{"requestId",id},{"taskId",g_agentTaskId},{"tool",name}});
    PostJson({{"type","confirm"},{"id",id},{"name",name},{"args",args}});
    std::unique_lock<std::mutex> l(g_confirmMutex);
    if(!g_confirmCv.wait_for(l,std::chrono::seconds(60),[&]{return g_confirmId!=id || g_agentCancel.load();})){
        g_confirmId="timeout";
        PostJson({{"type","status"},{"text","انتهت مهلة الموافقة"},{"state","confirmation_timeout"},{"requestId",id},{"taskId",g_agentTaskId},{"tool",name}});
        return false;
    }
    if(g_agentCancel.load()){ g_confirmId="cancelled"; return false; }
    return g_confirmValue;
}

std::string TranscribeSpeechWebm(const std::string& base64Data,const std::string& mimeType){
    json settings=LoadSettings();
    const std::string apiKey=settings.value("sttApiKey",settings.value("apiKey",""));
    if(apiKey.empty()) throw std::runtime_error("No Speech-to-Text API key is configured. Open Settings → AI / Brain → Speech-to-Text and add a key.");
    DWORD bytes=0;
    if(!CryptStringToBinaryA(base64Data.c_str(),0,CRYPT_STRING_BASE64,nullptr,&bytes,nullptr,nullptr))
        throw std::runtime_error("Invalid speech audio payload.");
    std::vector<BYTE> audio(bytes);
    if(!CryptStringToBinaryA(base64Data.c_str(),0,CRYPT_STRING_BASE64,audio.data(),&bytes,nullptr,nullptr))
        throw std::runtime_error("Could not decode speech audio payload.");
    if(audio.empty()) throw std::runtime_error("Empty speech audio payload.");
    const std::string boundary="----SaeedSpeechBoundary7F3A";
    std::string body;
    auto addField=[&](const std::string& name,const std::string& value){
        body+="--"+boundary+"\r\n";
        body+="Content-Disposition: form-data; name=\""+name+"\"\r\n\r\n";
        body+=value+"\r\n";
    };
    addField("model","whisper-1");
    body+="--"+boundary+"\r\n";
    body+="Content-Disposition: form-data; name=\"file\"; filename=\"speech.webm\"\r\n";
    body+="Content-Type: "+(mimeType.empty()?"audio/webm":mimeType)+"\r\n\r\n";
    body.append(reinterpret_cast<const char*>(audio.data()),audio.size());
    body+="\r\n--"+boundary+"--\r\n";
    HINTERNET ses=WinHttpOpen(L"Saeed/1.0",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,nullptr,nullptr,0);
    if(!ses) throw std::runtime_error("WinHTTP unavailable for speech transcription.");
    HINTERNET con=WinHttpConnect(ses,L"api.openai.com",INTERNET_DEFAULT_HTTPS_PORT,0);
    if(!con){WinHttpCloseHandle(ses);throw std::runtime_error("Could not connect to speech transcription service.");}
    HINTERNET req=WinHttpOpenRequest(con,L"POST",L"/v1/audio/transcriptions",nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE);
    if(!req){WinHttpCloseHandle(con);WinHttpCloseHandle(ses);throw std::runtime_error("Could not create speech transcription request.");}
    WinHttpSetTimeouts(req,15000,15000,30000,30000);
    std::wstring headers=L"Content-Type: multipart/form-data; boundary="+Wide(boundary)+L"\r\nAuthorization: Bearer "+Wide(apiKey)+L"\r\n";
    BOOL ok=WinHttpSendRequest(req,headers.c_str(),(DWORD)-1L,(LPVOID)body.data(),(DWORD)body.size(),(DWORD)body.size(),0);
    if(ok) ok=WinHttpReceiveResponse(req,nullptr);
    if(!ok){WinHttpCloseHandle(req);WinHttpCloseHandle(con);WinHttpCloseHandle(ses);throw std::runtime_error("Speech transcription request failed.");}
    DWORD status=0,statusSize=sizeof(status);
    if(!WinHttpQueryHeaders(req,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,WINHTTP_HEADER_NAME_BY_INDEX,&status,&statusSize,WINHTTP_NO_HEADER_INDEX)){
        WinHttpCloseHandle(req);WinHttpCloseHandle(con);WinHttpCloseHandle(ses);throw std::runtime_error("Could not read speech transcription response.");
    }
    std::string out;DWORD avail=0;
    while(WinHttpQueryDataAvailable(req,&avail)&&avail){
        std::vector<char> buf(avail);DWORD n=0;
        if(!WinHttpReadData(req,buf.data(),avail,&n)||!n)break;
        out.append(buf.data(),n);
    }
    WinHttpCloseHandle(req);WinHttpCloseHandle(con);WinHttpCloseHandle(ses);
    if(status<200||status>=300){
        std::string detail;
        try{json e=json::parse(out);detail=e.value("error",json::object()).value("message","");}catch(...){}
        throw std::runtime_error("Speech transcription HTTP "+std::to_string(status)+(detail.empty()?"":": "+detail));
    }
    try{return json::parse(out).value("text","");}
    catch(...){throw std::runtime_error("Speech transcription returned invalid JSON.");}
}

std::string HttpPostJson(const std::string& url,const std::string& apiKey,const json& body){
    std::wstring wurl=Wide(url);
    size_t scheme=wurl.find(L"://"); if(scheme==std::wstring::npos)throw std::runtime_error("Invalid API URL");
    bool https=wurl.substr(0,scheme)==L"https";
    size_t hs=scheme+3, slash=wurl.find(L'/',hs);
    std::wstring host=(slash==std::wstring::npos?wurl.substr(hs):wurl.substr(hs,slash-hs));
    std::wstring path=(slash==std::wstring::npos?L"/":wurl.substr(slash));
    INTERNET_PORT port=https?INTERNET_DEFAULT_HTTPS_PORT:INTERNET_DEFAULT_HTTP_PORT;
    size_t colon=host.rfind(L':');
    if(colon!=std::wstring::npos){port=(INTERNET_PORT)std::stoi(host.substr(colon+1));host=host.substr(0,colon);}
    HINTERNET ses=WinHttpOpen(L"Saeed/1.0",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,nullptr,nullptr,0);
    if(!ses)throw std::runtime_error("WinHTTP unavailable");
    HINTERNET con=WinHttpConnect(ses,host.c_str(),port,0);
    if(!con){WinHttpCloseHandle(ses);throw std::runtime_error("Cannot connect to AI provider");}
    HINTERNET req=WinHttpOpenRequest(con,L"POST",path.c_str(),nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,https?WINHTTP_FLAG_SECURE:0);
    if(!req){WinHttpCloseHandle(con);WinHttpCloseHandle(ses);throw std::runtime_error("Cannot create HTTP request");}
    // Bound network waits so a stalled provider cannot hold an Agent task forever.
    DWORD timeoutMs=15000;
    WinHttpSetTimeouts(req,(int)timeoutMs,(int)timeoutMs,(int)timeoutMs,(int)timeoutMs);
    std::wstring headers=L"Content-Type: application/json\r\nAuthorization: Bearer "+Wide(apiKey)+L"\r\n";
    std::string data=body.dump();
    BOOL ok=WinHttpSendRequest(req,headers.c_str(),(DWORD)-1L,(LPVOID)data.data(),(DWORD)data.size(),(DWORD)data.size(),0);
    if(!ok||!WinHttpReceiveResponse(req,nullptr)){WinHttpCloseHandle(req);WinHttpCloseHandle(con);WinHttpCloseHandle(ses);throw std::runtime_error("AI request failed");}
    DWORD status=0,statusSize=sizeof(status);
    if(!WinHttpQueryHeaders(req,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,WINHTTP_HEADER_NAME_BY_INDEX,&status,&statusSize,WINHTTP_NO_HEADER_INDEX)){
        WinHttpCloseHandle(req);WinHttpCloseHandle(con);WinHttpCloseHandle(ses);throw std::runtime_error("Cannot read AI response status");
    }
    std::string out;DWORD avail=0;
    while(WinHttpQueryDataAvailable(req,&avail)&&avail){
        if(g_agentCancel.load()){WinHttpCloseHandle(req);WinHttpCloseHandle(con);WinHttpCloseHandle(ses);throw std::runtime_error("Agent task cancelled by user.");}
        if(!avail)break;
        char buf[8192];DWORD n=0;
        if(!WinHttpReadData(req,buf,(DWORD)std::min<DWORD>(avail,sizeof(buf)),&n))break;
        out.append(buf,n);
    }
    WinHttpCloseHandle(req);WinHttpCloseHandle(con);WinHttpCloseHandle(ses);
    if(status<200||status>=300){
        try{json e=json::parse(out);std::string msg=e.value("error",json{{"message","AI provider HTTP error"}}).value("message","AI provider HTTP error");throw std::runtime_error("AI provider HTTP "+std::to_string(status)+": "+msg);}catch(const json::parse_error&){throw std::runtime_error("AI provider HTTP "+std::to_string(status));}
    }
    return out;
}

json ToolSchemas(){
    return json::parse(R"JSON([
      {"type":"function","function":{"name":"cancel_agent","description":"Cancel the currently running Saeed agent task. Use only when the user asks to stop/cancel the current task.","parameters":{"type":"object","properties":{}}}},
      {"type":"function","function":{"name":"local_command_info","description":"Local commands such as time, date, volume, opening Windows apps, files, folders and URLs are handled by the native C++ command engine without an AI provider.","parameters":{"type":"object","properties":{}}}},
      {"type":"function","function":{"name":"system_info","description":"Get Windows computer information.","parameters":{"type":"object","properties":{}}}},
      {"type":"function","function":{"name":"active_window","description":"Get the currently focused Windows window.","parameters":{"type":"object","properties":{}}}},
      {"type":"function","function":{"name":"window_geometry","description":"Get the exact screen rectangle, state and monitor of a visible Windows window by part of its title. Use before coordinate-based GUI actions.","parameters":{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}}},
      {"type":"function","function":{"name":"list_windows","description":"List visible Windows applications.","parameters":{"type":"object","properties":{}}}},
      {"type":"function","function":{"name":"focus_window","description":"Bring a visible Windows window to the foreground by part of its title. Requires confirmation.","parameters":{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}}},
      {"type":"function","function":{"name":"close_window","description":"Close a visible Windows window by part of its title. Requires confirmation.","parameters":{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}}},
      {"type":"function","function":{"name":"minimize_window","description":"Minimize a visible Windows window by part of its title. Requires confirmation.","parameters":{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}}},
      {"type":"function","function":{"name":"maximize_window","description":"Maximize a visible Windows window by part of its title. Requires confirmation.","parameters":{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}}},
      {"type":"function","function":{"name":"monitor_info","description":"Get all connected monitor work areas, sizes and primary monitor information.","parameters":{"type":"object","properties":{}}}},
      {"type":"function","function":{"name":"screen_capture","description":"Capture a JPEG screenshot of a connected monitor so the AI can visually inspect the current desktop. Use monitor index from monitor_info; -1 captures the primary monitor.","parameters":{"type":"object","properties":{"monitor":{"type":"integer","description":"Zero-based monitor index. Use -1 for primary monitor."}},"required":["monitor"]}}},
      {"type":"function","function":{"name":"wait","description":"Wait briefly for a Windows UI transition to finish before inspecting or taking the next action. Maximum 5000 milliseconds.","parameters":{"type":"object","properties":{"milliseconds":{"type":"integer","minimum":100,"maximum":5000}},"required":["milliseconds"]}}},
      {"type":"function","function":{"name":"open_application","description":"Open a Windows application or executable. Requires confirmation.","parameters":{"type":"object","properties":{"application":{"type":"string"}},"required":["application"]}}},
      {"type":"function","function":{"name":"open_url","description":"Open a URL in the default Windows browser. Requires confirmation.","parameters":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}}},
      {"type":"function","function":{"name":"list_directory","description":"List files and folders in a directory.","parameters":{"type":"object","properties":{"directory":{"type":"string"}},"required":["directory"]}}},
      {"type":"function","function":{"name":"file_operation","description":"Copy, move, rename or delete a file or folder. Requires confirmation.","parameters":{"type":"object","properties":{"operation":{"type":"string","enum":["copy","move","rename","delete"]},"source":{"type":"string"},"destination":{"type":"string"}},"required":["operation","source"]}}},
      {"type":"function","function":{"name":"process_list","description":"List running Windows processes with names and process IDs.","parameters":{"type":"object","properties":{}}}},
      {"type":"function","function":{"name":"read_file","description":"Read a UTF-8 text file up to 200KB.","parameters":{"type":"object","properties":{"filePath":{"type":"string"}},"required":["filePath"]}}},
      {"type":"function","function":{"name":"write_file","description":"Write a UTF-8 text file. Requires confirmation.","parameters":{"type":"object","properties":{"filePath":{"type":"string"},"content":{"type":"string"}},"required":["filePath","content"]}}},
      {"type":"function","function":{"name":"mouse_move","description":"Move the mouse to screen coordinates.","parameters":{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"integer"}},"required":["x","y"]}}},
      {"type":"function","function":{"name":"mouse_click","description":"Click at screen coordinates. Requires confirmation. For GUI tasks, set verify_after=true to wait briefly and automatically capture the same monitor so the AI can visually verify the result.","parameters":{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"integer"},"button":{"type":"string","enum":["left","right"]},"verify_after":{"type":"boolean","description":"Wait and capture the target monitor after the click for visual verification."},"monitor":{"type":"integer","description":"Monitor index for verification capture. Use -1 for primary monitor."}},"required":["x","y"]}}},
      {"type":"function","function":{"name":"type_text","description":"Type text into the focused application. Requires confirmation.","parameters":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}}},
      {"type":"function","function":{"name":"key_press","description":"Press a Windows key or shortcut such as ENTER, ESC, CTRL+C, CTRL+V, CTRL+A, ALT+F4, WIN+D or arrows. Requires confirmation.","parameters":{"type":"object","properties":{"key":{"type":"string"}},"required":["key"]}}},
      {"type":"function","function":{"name":"remember","description":"Store a fact in Saeed's persistent long-term memory when the user explicitly asks you to remember it. Optional category and importance improve future retrieval.","parameters":{"type":"object","properties":{"fact":{"type":"string"},"category":{"type":"string","enum":["personal","preference","project","task","technical","general"]},"importance":{"type":"integer","minimum":1,"maximum":5}},"required":["fact"]}}},
      {"type":"function","function":{"name":"recall","description":"Search Saeed's persistent memory for relevant facts.","parameters":{"type":"object","properties":{"query":{"type":"string"},"category":{"type":"string","enum":["personal","preference","project","task","technical","general"]}},"required":["query"]}}},
      {"type":"function","function":{"name":"forget","description":"Remove a persistent memory entry by its ID, or by an exact case-sensitive fact query when no ID is supplied. Use only when the user explicitly asks to forget or remove a memory.","parameters":{"type":"object","properties":{"id":{"type":"string"},"query":{"type":"string"}}}}},
      {"type":"function","function":{"name":"set_eye_rotation","description":"Control both Saeed eye bones. X and Z are strictly limited to -15..+15 degrees.","parameters":{"type":"object","properties":{"x":{"type":"number","minimum":-15,"maximum":15},"z":{"type":"number","minimum":-15,"maximum":15}},"required":["x","z"]}}},
      {"type":"function","function":{"name":"set_head_rotation","description":"Control Saeed head orientation. X, Y and Z are limited to -15..+15 degrees.","parameters":{"type":"object","properties":{"x":{"type":"number","minimum":-15,"maximum":15},"y":{"type":"number","minimum":-15,"maximum":15},"z":{"type":"number","minimum":-15,"maximum":15}},"required":["x","y","z"]}}},
      {"type":"function","function":{"name":"reset_character_pose","description":"Return Saeed's controller to its neutral state.","parameters":{"type":"object","properties":{}}}}},
      {"type":"function","function":{"name":"character_control","description":"Advanced non-destructive Saeed avatar controller. Controls eyes, head, neck, spine, shoulders, arms, forearms, wrists, facial morphs, blinking, breathing, talking, natural behavior and short gestures. Eye X/Z and head X/Y/Z are hard-limited to -15..+15 degrees; spine and limbs have their own safe limits.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["eyes","head","spine","neck","shoulders","wrists","arms","legs","face","emotion","blink","gesture","breathing","talking","behavior","reset"]},"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"},"left":{"type":"number"},"right":{"type":"number"},"leftForearm":{"type":"number"},"rightForearm":{"type":"number"},"leftThigh":{"type":"number"},"rightThigh":{"type":"number"},"leftShin":{"type":"number"},"rightShin":{"type":"number"},"leftFoot":{"type":"number"},"rightFoot":{"type":"number"},"gesture":{"type":"string","enum":["idle","nod","wave","agree","disagree","think","greet"]},"duration":{"type":"integer","minimum":100,"maximum":10000},"enabled":{"type":"boolean"},"blink":{"type":"number","minimum":0,"maximum":1},"smile":{"type":"number","minimum":0,"maximum":1},"brow":{"type":"number","minimum":-1,"maximum":1},"emotion":{"type":"string","enum":["neutral","happy","sad","surprised","angry","thinking","greeting","speaking"]},"autoBlink":{"type":"boolean"},"eyeSaccades":{"type":"boolean"},"speechGestures":{"type":"boolean"}},"required":["action"]}}}},{"type":"function","function":{"name":"character_state","description":"Read Saeed's live avatar controller state directly from the 3D character. Use this to verify eye/head/limb/facial/behavior settings after changes.","parameters":{"type":"object","properties":{}}}}
    ])JSON");
}

bool IsProtectedWritePath(const std::wstring& raw){
    try{
        if(raw.empty()) return false;
        std::filesystem::path p=std::filesystem::weakly_canonical(std::filesystem::path(raw));
        std::wstring s=p.wstring();
        std::transform(s.begin(),s.end(),s.begin(),[](wchar_t ch){return (wchar_t)towlower(ch);});
        auto under=[&](const std::wstring& root){
            if(root.empty()) return false;
            std::wstring r=root;
            std::transform(r.begin(),r.end(),r.begin(),[](wchar_t ch){return (wchar_t)towlower(ch);});
            while(!r.empty() && r.back()==L'\\') r.pop_back();
            return !r.empty() && (s==r || (s.size()>r.size() && s.rfind(r+L"\\",0)==0));
        };
        wchar_t b[MAX_PATH]{};
        GetWindowsDirectoryW(b,MAX_PATH); if(under(std::wstring(b))) return true;
        GetSystemDirectoryW(b,MAX_PATH); if(under(std::wstring(b))) return true;
        DWORD n=GetEnvironmentVariableW(L"ProgramFiles",b,MAX_PATH); if(n&&under(std::wstring(b))) return true;
        n=GetEnvironmentVariableW(L"ProgramFiles(x86)",b,MAX_PATH); if(n&&under(std::wstring(b))) return true;
        return false;
    }catch(...){ return false; }
}

json ExecuteFileOperationCore(const json& a){
    const std::filesystem::path src=Wide(a.value("source",""));
    const std::string op=a.value("operation","");
    try{
        if(op=="delete"){
            if(!std::filesystem::exists(src)) return {{"ok",false},{"error","Source does not exist"},{"source",a.value("source","")}};
            const auto removed=std::filesystem::remove_all(src);
            if(removed==0||std::filesystem::exists(src)) return {{"ok",false},{"error","Delete operation could not be verified"},{"source",a.value("source","")}};
            return {{"ok",true},{"operation",op},{"source",a.value("source","")},{"removed_count",(uint64_t)removed},{"verified",true}};
        }
        const std::filesystem::path dst=Wide(a.value("destination",""));
        if(op=="copy"){
            if(!std::filesystem::exists(src)) return {{"ok",false},{"error","Source does not exist"}};
            if(std::filesystem::is_directory(src)) std::filesystem::copy(src,dst,std::filesystem::copy_options::recursive|std::filesystem::copy_options::overwrite_existing);
            else std::filesystem::copy_file(src,dst,std::filesystem::copy_options::overwrite_existing);
        }else if(op=="move"||op=="rename"){
            std::filesystem::rename(src,dst);
        }else return {{"ok",false},{"error","Unsupported file operation"}};
        if(!std::filesystem::exists(dst)) return {{"ok",false},{"error","File operation completed without a verifiable destination"}};
        if((op=="move"||op=="rename")&&std::filesystem::exists(src)) return {{"ok",false},{"error","Source still exists after operation"}};
        return {{"ok",true},{"operation",op},{"source",a.value("source","")},{"destination",a.value("destination","")},{"verified",true}};
    }catch(const std::exception& e){ return {{"ok",false},{"error",e.what()}}; }
}

json ExecuteWriteFileCore(const json& a){
    const std::wstring p=Wide(a.value("filePath",""));
    try{
        size_t slash=p.find_last_of(L"\\/");
        if(slash!=std::wstring::npos) std::filesystem::create_directories(std::filesystem::path(p).parent_path());
    }catch(const std::exception& e){ return {{"ok",false},{"error",e.what()}}; }
    std::ofstream f(Utf8(p),std::ios::trunc);
    if(!f) return {{"ok",false},{"error","Cannot open destination"}};
    const std::string content=a.value("content","");
    f<<content; f.flush();
    if(!f.good()) return {{"ok",false},{"error","Failed while writing destination"}};
    return {{"ok",true},{"path",a.value("filePath","")},{"bytes",(int64_t)content.size()},{"verified",true}};
}

json RunElevatedFileOperation(const json& request){
    wchar_t tempPath[MAX_PATH]{};
    GetTempPathW(MAX_PATH,tempPath);
    wchar_t tempName[MAX_PATH]{};
    if(!GetTempFileNameW(tempPath,L"SAD",0,tempName)) return {{"ok",false},{"error","Could not create elevation request file"}};
    std::wstring requestPath=tempName, resultPath=requestPath+L".result";
    try{
        std::ofstream rf(Utf8(requestPath),std::ios::trunc);
        if(!rf) throw std::runtime_error("request");
        rf<<request.dump(2); rf.flush();
        if(!rf.good()) throw std::runtime_error("request");
    }catch(...){
        DeleteFileW(requestPath.c_str());
        return {{"ok",false},{"error","Could not prepare elevation request"}};
    }
    std::wstring params=L"--saeed-elevated-op \""+requestPath+L"\"";
    SHELLEXECUTEINFOW sei{sizeof(sei)};
    sei.fMask=SEE_MASK_NOCLOSEPROCESS; sei.hwnd=g_hwnd; sei.lpVerb=L"runas";
    sei.lpFile=AppDirectory().c_str(); sei.lpParameters=params.c_str(); sei.nShow=SW_SHOWNORMAL;
    if(!ShellExecuteExW(&sei)){
        DWORD err=GetLastError();
        DeleteFileW(requestPath.c_str()); DeleteFileW(resultPath.c_str());
        if(err==ERROR_CANCELLED) return {{"ok",false},{"error","Windows UAC permission was denied by the user"},{"uac_denied",true}};
        return {{"ok",false},{"error","Could not request Windows administrator elevation"},{"win32_error",(uint32_t)err}};
    }
    DWORD wait=WaitForSingleObject(sei.hProcess,120000);
    if(wait==WAIT_TIMEOUT){
        TerminateProcess(sei.hProcess,1); CloseHandle(sei.hProcess);
        DeleteFileW(requestPath.c_str()); DeleteFileW(resultPath.c_str());
        return {{"ok",false},{"error","Elevated operation timed out"}};
    }
    CloseHandle(sei.hProcess);
    json result={{"ok",false},{"error","Elevated helper did not return a result"}};
    std::ifstream out(Utf8(resultPath));
    if(out){try{out>>result;}catch(...){result={{"ok",false},{"error","Invalid elevated operation result"}};}}
    DeleteFileW(requestPath.c_str()); DeleteFileW(resultPath.c_str());
    result["elevated"]=true;
    return result;
}

void RunElevatedOperationEntry(const std::wstring& requestPath){
    try{
        std::ifstream f(Utf8(requestPath));
        if(!f) ExitProcess(2);
        json request; f>>request; json result;
        const std::string kind=request.value("kind","");
        if(kind=="file_operation") result=ExecuteFileOperationCore(request);
        else if(kind=="write_file") result=ExecuteWriteFileCore(request);
        else result={{"ok",false},{"error","Unsupported elevated operation"}};
        std::ofstream out(Utf8(requestPath+L".result"),std::ios::trunc);
        if(out){out<<result.dump(2);out.flush();}
        ExitProcess(result.value("ok",false)?0:1);
    }catch(...){
        std::ofstream out(Utf8(requestPath+L".result"),std::ios::trunc);
        if(out) out<<R"({"ok":false,"error":"Elevated helper failed"})";
        ExitProcess(1);
    }
}

json ExecuteTool(const std::string& name,const json& a){
    if(name=="character_state"){
        // Serialize live-avatar queries so concurrent agent/tool calls cannot
        // overwrite the global request slot or consume each other's response.
        std::unique_lock<std::mutex> requestLock(g_characterStateRequestMutex);
        const std::string id=std::to_string(++g_requestId);
        {
            std::lock_guard<std::mutex> lock(g_characterStateMutex);
            g_characterStateId=id;
            g_characterStateResult=json{{"ok",false},{"error","Character state request timed out"}};
        }
        PostJson({{"type","character_state_request"},{"id",id}});
        std::unique_lock<std::mutex> lock(g_characterStateMutex);
        if(!g_characterStateCv.wait_for(lock,std::chrono::seconds(3),[&]{return g_characterStateId!=id;})){
            return g_characterStateResult;
        }
        return g_characterStateResult;
    }
    if(name=="cancel_agent"){
        g_agentCancel.store(true);
        PostJson({{"type","status"},{"text","تم طلب إيقاف المهمة"},{"state","cancelling"},{"taskId",g_agentTaskId}});
        return {{"ok",true},{"cancelling",true},{"message","Cancellation requested; the active task will report its final cancelled state."}};
    }
    if(name=="system_info"){
        SYSTEM_INFO si{};GetSystemInfo(&si);MEMORYSTATUSEX ms{sizeof(ms)};GlobalMemoryStatusEx(&ms);
        return {{"ok",true},{"processors",si.dwNumberOfProcessors},{"memoryGB",ms.ullTotalPhys/1024.0/1024.0/1024.0},{"memoryFreeGB",ms.ullAvailPhys/1024.0/1024.0/1024.0}};
    }
    if(name=="active_window"){
        HWND h=GetForegroundWindow();wchar_t title[512]{};GetWindowTextW(h,title,512);DWORD pid=0;GetWindowThreadProcessId(h,&pid);
        return {{"ok",true},{"title",Utf8(title)},{"pid",pid}};
    }
    if(name=="window_geometry"){
        std::string needle=a.value("title","");
        if(needle.empty()) return {{"ok",false},{"error","Window title is empty"}};
        std::wstring wn=Wide(needle);
        HWND found=nullptr;
        std::pair<std::wstring,HWND> ctx{wn,nullptr};
        EnumWindows([](HWND h,LPARAM lp)->BOOL{
            auto* c=reinterpret_cast<std::pair<std::wstring,HWND>*>(lp);
            if(!IsWindowVisible(h)) return TRUE;
            wchar_t title[512]{};GetWindowTextW(h,title,512);std::wstring t(title),n=c->first;
            std::transform(t.begin(),t.end(),t.begin(),[](wchar_t ch){return (wchar_t)towlower(ch);});
            std::transform(n.begin(),n.end(),n.begin(),[](wchar_t ch){return (wchar_t)towlower(ch);});
            if(!n.empty()&&t.find(n)!=std::wstring::npos){c->second=h;return FALSE;} return TRUE;
        },reinterpret_cast<LPARAM>(&ctx));
        found=ctx.second;
        if(!found)return {{"ok",false},{"error","Window not found"}};
        RECT r{};GetWindowRect(found,&r);DWORD pid=0;GetWindowThreadProcessId(found,&pid);
        HMONITOR mon=MonitorFromWindow(found,MONITOR_DEFAULTTONEAREST);MONITORINFO mi{sizeof(mi)};GetMonitorInfoW(mon,&mi);
        return {{"ok",true},{"title",Utf8([&](){wchar_t t[512]{};GetWindowTextW(found,t,512);return std::wstring(t);}())},{"pid",pid},
                {"x",r.left},{"y",r.top},{"width",r.right-r.left},{"height",r.bottom-r.top},
                {"minimized",IsIconic(found)!=FALSE},{"maximized",IsZoomed(found)!=FALSE},
                {"monitorX",mi.rcMonitor.left},{"monitorY",mi.rcMonitor.top},
                {"monitorWidth",mi.rcMonitor.right-mi.rcMonitor.left},{"monitorHeight",mi.rcMonitor.bottom-mi.rcMonitor.top}};
    }
    if(name=="list_windows"){
        json arr=json::array();
        EnumWindows([](HWND h,LPARAM lp)->BOOL{if(!IsWindowVisible(h))return TRUE;wchar_t t[512]{};GetWindowTextW(h,t,512);if(!t[0])return TRUE;auto* a=reinterpret_cast<json*>(lp);DWORD pid=0;GetWindowThreadProcessId(h,&pid);a->push_back({{"title",Utf8(t)},{"pid",pid}});return TRUE;},reinterpret_cast<LPARAM>(&arr));
        return {{"ok",true},{"windows",arr}};
    }
    if(name=="monitor_info"){
        json arr=json::array();
        struct Ctx{json* out;};
        Ctx ctx{&arr};
        EnumDisplayMonitors(nullptr,nullptr,[](HMONITOR m,HDC,LPRECT,LPARAM lp)->BOOL{
            MONITORINFO mi{sizeof(mi)};if(!GetMonitorInfoW(m,&mi))return TRUE;
            auto* out=reinterpret_cast<Ctx*>(lp)->out;
            RECT r=mi.rcMonitor,w=mi.rcWork;
            out->push_back({{"primary",(mi.dwFlags&MONITORINFOF_PRIMARY)!=0},
                            {"x",r.left},{"y",r.top},{"width",r.right-r.left},{"height",r.bottom-r.top},
                            {"workX",w.left},{"workY",w.top},{"workWidth",w.right-w.left},{"workHeight",w.bottom-w.top}});
            return TRUE;
        },reinterpret_cast<LPARAM>(&ctx));
        return {{"ok",true},{"monitors",arr}};
    }
    if(name=="wait"){
        int ms=std::clamp(a.value("milliseconds",500),100,5000);
        if(!InterruptibleSleep((DWORD)ms)) return {{"ok",false},{"cancelled",true},{"error","Agent task cancelled by user"}};
        return {{"ok",true},{"waited_ms",ms}};
    }
    if(name=="screen_capture"){
        int requested=a.value("monitor",-1);
        if(requested<0){
            HMONITOR primary=MonitorFromWindow(g_hwnd,MONITOR_DEFAULTTOPRIMARY);
            json monitors=json::array();
            EnumDisplayMonitors(nullptr,nullptr,[](HMONITOR m,HDC,LPRECT,LPARAM lp)->BOOL{
                auto* out=reinterpret_cast<json*>(lp);MONITORINFO mi{sizeof(mi)};
                if(GetMonitorInfoW(m,&mi)){out->push_back({{"primary",(mi.dwFlags&MONITORINFOF_PRIMARY)!=0}});}
                return TRUE;
            },reinterpret_cast<LPARAM>(&monitors));
            requested=0;for(size_t i=0;i<monitors.size();++i)if(monitors[i].value("primary",false)){requested=(int)i;break;}
        }
        std::string b64=CaptureMonitorJpeg(requested);
        if(b64.empty())return {{"ok",false},{"error","Screen capture failed"}};
        return {{"ok",true},{"monitor",requested},{"mime","image/jpeg"},{"image_base64",b64}};
    }
    if(name=="focus_window"){
        if(!WaitConfirmation(name,a))return {{"ok",false},{"error","User denied action"}};
        std::string q=a.value("title","");
        HWND found=nullptr;
        std::pair<std::string,HWND*> search{q,&found};
        EnumWindows([](HWND h,LPARAM lp)->BOOL{
            auto* p=reinterpret_cast<std::pair<std::string,HWND*>*>(lp);
            if(!IsWindowVisible(h))return TRUE;
            wchar_t t[512]{};GetWindowTextW(h,t,512);std::string title=Utf8(t);
            std::string hay=title, needle=p->first;
            std::transform(hay.begin(),hay.end(),hay.begin(),[](char c){return (char)tolower((unsigned char)c);});
            std::transform(needle.begin(),needle.end(),needle.begin(),[](char c){return (char)tolower((unsigned char)c);});
            if(!needle.empty()&&hay.find(needle)!=std::string::npos){*p->second=h;return FALSE;} return TRUE;
        },reinterpret_cast<LPARAM>(&search));
        if(!found)return {{"ok",false},{"error","Window not found"}};
        ShowWindow(found,SW_RESTORE);SetForegroundWindow(found);
        Sleep(150);
        HWND fg=GetForegroundWindow();
        DWORD targetPid=0,fgPid=0;GetWindowThreadProcessId(found,&targetPid);GetWindowThreadProcessId(fg,&fgPid);
        return {{"ok",fg==found||fgPid==targetPid},{"verified",fg==found||fgPid==targetPid},{"title",q}};
    }
    if(name=="close_window"||name=="minimize_window"||name=="maximize_window"){
        if(!WaitConfirmation(name,a))return {{"ok",false},{"error","User denied action"}};
        std::string q=a.value("title","");
        HWND found=nullptr;
        std::pair<std::string,HWND*> search{q,&found};
        EnumWindows([](HWND h,LPARAM lp)->BOOL{
            auto* p=reinterpret_cast<std::pair<std::string,HWND*>*>(lp);
            if(!IsWindowVisible(h))return TRUE;
            wchar_t t[512]{};GetWindowTextW(h,t,512);std::string title=Utf8(t);
            std::string hay=title,needle=p->first;
            std::transform(hay.begin(),hay.end(),hay.begin(),[](char c){return (char)tolower((unsigned char)c);});
            std::transform(needle.begin(),needle.end(),needle.begin(),[](char c){return (char)tolower((unsigned char)c);});
            if(!needle.empty()&&hay.find(needle)!=std::string::npos){*p->second=h;return FALSE;}
            return TRUE;
        },reinterpret_cast<LPARAM>(&search));
        if(!found)return {{"ok",false},{"error","Window not found"}};
        if(name=="close_window") PostMessageW(found,WM_CLOSE,0,0);
        else if(name=="minimize_window") ShowWindow(found,SW_MINIMIZE);
        else ShowWindow(found,SW_MAXIMIZE);
        Sleep(150);
        bool verified=false;
        if(name=="close_window") verified=!IsWindow(found)||!IsWindowVisible(found);
        else if(name=="minimize_window") verified=IsIconic(found);
        else verified=IsZoomed(found);
        return {{"ok",verified},{"verified",verified},{"title",a.value("title","")},{"action",name}};
    }
    if(name=="open_application"){
        if(!WaitConfirmation(name,a))return {{"ok",false},{"error","User denied action"}};
        std::string application=a.value("application","");
        if(application.empty())return {{"ok",false},{"error","Application is empty"}};
        HINSTANCE r=ShellExecuteW(nullptr,L"open",Wide(application).c_str(),nullptr,nullptr,SW_SHOWNORMAL);
        if((INT_PTR)r<=32)return {{"ok",false},{"error","Windows could not launch the application"}};
        Sleep(1200);
        HWND fg=GetForegroundWindow(); DWORD pid=0; if(fg)GetWindowThreadProcessId(fg,&pid);
        wchar_t title[512]{}; if(fg)GetWindowTextW(fg,title,512);
        if(!fg) return {{"ok",false},{"application",application},{"error","Application launched but no foreground window was detected"}};
        return {{"ok",true},{"application",application},{"foregroundTitle",Utf8(std::wstring(title))},{"foregroundPid",pid},{"verified",fg!=nullptr}};
    }
    if(name=="open_url"){
        if(!WaitConfirmation(name,a))return {{"ok",false},{"error","User denied action"}};
        std::string url=a.value("url","");
        if(url.rfind("https://",0)!=0 && url.rfind("http://",0)!=0)return {{"ok",false},{"error","Only http/https URLs are allowed"}};
        HINSTANCE r=ShellExecuteW(nullptr,L"open",Wide(url).c_str(),nullptr,nullptr,SW_SHOWNORMAL);
        if((INT_PTR)r<=32)return {{"ok",false},{"error","Windows could not open the URL"}};
        Sleep(1200);
        HWND fg=GetForegroundWindow(); wchar_t title[512]{}; if(fg)GetWindowTextW(fg,title,512);
        if(!fg) return {{"ok",false},{"url",url},{"error","URL launch returned but no foreground window was detected"}};
        return {{"ok",true},{"url",url},{"foregroundTitle",Utf8(std::wstring(title))},{"verified",fg!=nullptr}};
    }
    if(name=="list_directory"){
        std::string dir=a.value("directory",".");json arr=json::array();
        try{for(auto& p:std::filesystem::directory_iterator(Wide(dir))){arr.push_back({{"name",Utf8(p.path().filename().wstring())},{"directory",p.is_directory()}});}return {{"ok",true},{"files",arr}};}
        catch(const std::exception& e){return {{"ok",false},{"error",e.what()}};}
    }
    if(name=="process_list"){
        json arr=json::array();
        HANDLE snap=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);
        if(snap==INVALID_HANDLE_VALUE)return {{"ok",false},{"error","Cannot enumerate processes"}};
        PROCESSENTRY32W pe{sizeof(pe)};
        if(Process32FirstW(snap,&pe)){do{arr.push_back({{"name",Utf8(pe.szExeFile)},{"pid",pe.th32ProcessID}});}while(Process32NextW(snap,&pe));}
        CloseHandle(snap); return {{"ok",true},{"processes",arr}};
    }
    if(name=="file_operation"){
        if(!WaitConfirmation(name,a))return {{"ok",false},{"error","User denied action"}};
        const std::wstring sourcePath=Wide(a.value("source",""));
        const std::wstring destinationPath=Wide(a.value("destination",""));
        if(IsProtectedWritePath(sourcePath)||(!destinationPath.empty()&&IsProtectedWritePath(destinationPath))){
            json request=a; request["kind"]="file_operation";
            return RunElevatedFileOperation(request);
        }
        return ExecuteFileOperationCore(a);
    }
    if(name=="read_file"){
        std::ifstream f(Utf8(Wide(a.value("filePath",""))));if(!f)return {{"ok",false},{"error","File not found or cannot be opened"}};
        std::ostringstream ss;ss<<f.rdbuf();std::string text=ss.str();if(text.size()>200000)text.resize(200000);
        return {{"ok",true},{"content",text}};
    }
    if(name=="write_file"){
        if(!WaitConfirmation(name,a))return {{"ok",false},{"error","User denied action"}};
        std::wstring p=Wide(a.value("filePath",""));
        if(IsProtectedWritePath(p)){
            json request=a; request["kind"]="write_file";
            return RunElevatedFileOperation(request);
        }
        return ExecuteWriteFileCore(a);
    }
    if(name=="mouse_move"){
        int x=a.value("x",0),y=a.value("y",0);
        BOOL moved=SetCursorPos(x,y); POINT p{}; BOOL read=GetCursorPos(&p);
        bool verified=moved!=FALSE&&read!=FALSE&&p.x==x&&p.y==y;
        return {{"ok",verified},{"x",x},{"y",y},{"actualX",p.x},{"actualY",p.y},{"verified",verified}};
    }
    if(name=="mouse_click"){
        if(!WaitConfirmation(name,a))return {{"ok",false},{"error","User denied action"}};
        int x=a.value("x",0),y=a.value("y",0); BOOL moved=SetCursorPos(x,y); POINT p{}; BOOL read=GetCursorPos(&p);
        if(!moved||!read||p.x!=x||p.y!=y)return {{"ok",false},{"error","Windows could not position the cursor"},{"x",x},{"y",y},{"actualX",p.x},{"actualY",p.y}};
        bool right=a.value("button","left")=="right";INPUT in[2]{};in[0].type=in[1].type=INPUT_MOUSE;in[0].mi.dwFlags=right?MOUSEEVENTF_RIGHTDOWN:MOUSEEVENTF_LEFTDOWN;in[1].mi.dwFlags=right?MOUSEEVENTF_RIGHTUP:MOUSEEVENTF_LEFTUP;UINT sent=SendInput(2,in,sizeof(INPUT));
        if(sent!=2)return {{"ok",false},{"error","Windows rejected the mouse input"}};
        if(a.value("verify_after",false)){ if(!InterruptibleSleep(350)) return {{"ok",false},{"cancelled",true},{"error","Agent task cancelled by user"}}; int mon=a.value("monitor",-1); if(mon<0){HMONITOR hm=MonitorFromPoint(POINT{a.value("x",0),a.value("y",0)},MONITOR_DEFAULTTONEAREST);json monitors=json::array();EnumDisplayMonitors(nullptr,nullptr,[](HMONITOR m,HDC,LPRECT,LPARAM lp)->BOOL{auto* out=reinterpret_cast<json*>(lp);MONITORINFO mi{sizeof(mi)};if(GetMonitorInfoW(m,&mi))out->push_back({{"handle",(uint64_t)(uintptr_t)m}});return TRUE;},reinterpret_cast<LPARAM>(&monitors));for(size_t i=0;i<monitors.size();++i)if(monitors[i].value("handle",0ULL)==(uint64_t)(uintptr_t)hm){mon=(int)i;break;}}
            std::string shot=CaptureMonitorJpeg(mon); if(!shot.empty())return {{"ok",true},{"verified",true},{"monitor",mon},{"mime","image/jpeg"},{"image_base64",shot}}; }
        return {{"ok",true},{"verified",false}};
    }
    if(name=="type_text"){
        if(!WaitConfirmation(name,a))return {{"ok",false},{"error","User denied action"}};
        HWND before=GetForegroundWindow(); DWORD beforePid=0; GetWindowThreadProcessId(before,&beforePid);
        std::wstring text=Wide(a.value("text",""));std::vector<INPUT> in;
        for(wchar_t ch:text){INPUT i{};i.type=INPUT_KEYBOARD;i.ki.wScan=ch;i.ki.dwFlags=KEYEVENTF_UNICODE;in.push_back(i);i.ki.dwFlags=KEYEVENTF_UNICODE|KEYEVENTF_KEYUP;in.push_back(i);}
        if(!in.empty()){
            UINT sent=SendInput((UINT)in.size(),in.data(),sizeof(INPUT));
            if(sent!=in.size())return {{"ok",false},{"error","Windows rejected some text input"},{"sent",sent},{"expected",(UINT)in.size()}};
        }
        // Re-check the foreground window after input; this is only transport
        // verification, while the Agent can request screen_capture for visual verification.
        HWND after=GetForegroundWindow(); DWORD afterPid=0; GetWindowThreadProcessId(after,&afterPid);
        return {{"ok",true},{"sent",in.size()},{"verified",after==before||afterPid==beforePid},{"foreground_pid",afterPid}};
    }
    if(name=="key_press"){
        if(!WaitConfirmation(name,a))return {{"ok",false},{"error","User denied action"}};
        std::string k=a.value("key","");
        std::transform(k.begin(),k.end(),k.begin(),[](char ch){return (char)toupper((unsigned char)ch);});
        auto vk=[&](const std::string& s)->WORD{
            if(s=="ENTER")return VK_RETURN;if(s=="ESC"||s=="ESCAPE")return VK_ESCAPE;if(s=="TAB")return VK_TAB;
            if(s=="SPACE")return VK_SPACE;if(s=="BACKSPACE")return VK_BACK;if(s=="DELETE"||s=="DEL")return VK_DELETE;
            if(s=="UP")return VK_UP;if(s=="DOWN")return VK_DOWN;if(s=="LEFT")return VK_LEFT;if(s=="RIGHT")return VK_RIGHT;
            if(s=="HOME")return VK_HOME;if(s=="END")return VK_END;if(s=="PGUP")return VK_PRIOR;if(s=="PGDN")return VK_NEXT;
            if(s=="CTRL"||s=="CONTROL")return VK_CONTROL;if(s=="ALT")return VK_MENU;if(s=="SHIFT")return VK_SHIFT;
            if(s=="WIN"||s=="WINDOWS")return VK_LWIN;
            if(s.size()==1)return (WORD)s[0]; return 0;
        };
        std::vector<std::string> parts; size_t pos=0;
        while(true){size_t p=k.find('+',pos);parts.push_back(k.substr(pos,p==std::string::npos?k.size()-pos:p-pos));if(p==std::string::npos)break;pos=p+1;}
        std::vector<WORD> keys;for(auto& p:parts){WORD x=vk(p);if(!x)return {{"ok",false},{"error","Unsupported key: "+p}};keys.push_back(x);}
        std::vector<INPUT> in;for(WORD x:keys){INPUT i{};i.type=INPUT_KEYBOARD;i.ki.wVk=x;in.push_back(i);}
        for(auto it=keys.rbegin();it!=keys.rend();++it){INPUT i{};i.type=INPUT_KEYBOARD;i.ki.wVk=*it;i.ki.dwFlags=KEYEVENTF_KEYUP;in.push_back(i);}
        UINT sent=SendInput((UINT)in.size(),in.data(),sizeof(INPUT));
        if(sent!=in.size())return {{"ok",false},{"error","Windows rejected some key input"},{"sent",sent},{"expected",(UINT)in.size()}};
        // Key delivery is verified at the OS transport level. For UI state changes,
        // the Agent should follow with screen_capture/window_geometry and verify the result.
        HWND after=GetForegroundWindow(); DWORD afterPid=0; GetWindowThreadProcessId(after,&afterPid);
        return {{"ok",true},{"sent",sent},{"verified",afterPid!=0},{"foreground_pid",afterPid}};
    }
    if(name=="remember"){
        auto mem=LoadArrayFile(MemoryPath());
        std::string fact=a.value("fact","");
        if(fact.empty()) return {{"ok",false},{"error","Memory fact is empty"}};
        std::string category=a.value("category","general");
        int importance=std::clamp(a.value("importance",3),1,5);
        const std::string now=WallClockIso();
        std::string id=now+"-"+std::to_string(++g_requestId);
        mem.push_back({{"id",id},{"fact",fact},{"category",category},{"importance",importance},{"time",now}});
        if(!SaveArrayFile(MemoryPath(),mem)) return {{"ok",false},{"error","Failed to save memory"}};
        return {{"ok",true},{"saved",fact},{"category",category},{"importance",importance}};
    }
    if(name=="forget"){
        auto mem=LoadArrayFile(MemoryPath());
        std::string id=a.value("id","");
        std::string query=a.value("query","");
        if(id.empty()&&query.empty()) return {{"ok",false},{"error","Memory id or query is required"}};
        size_t before=mem.size();
        mem.erase(std::remove_if(mem.begin(),mem.end(),[&](const json& x){
            if(!id.empty()) return x.value("id","")==id;
            std::string fact=x.value("fact","");
            return !query.empty()&&fact.find(query)!=std::string::npos;
        }),mem.end());
        if(mem.size()==before)return {{"ok",false},{"error","Memory entry not found"}};
        if(!SaveArrayFile(MemoryPath(),mem))return {{"ok",false},{"error","Failed to save memory"}};
        return {{"ok",true},{"removed",(int)(before-mem.size())}};
    }
    if(name=="recall"){
        auto mem=LoadArrayFile(MemoryPath());
        std::string q=a.value("query","");
        std::string category=a.value("category","");
        std::vector<std::pair<int,std::string>> ranked;
        auto lower=[](std::string s){std::transform(s.begin(),s.end(),s.begin(),[](unsigned char ch){return (char)std::tolower(ch);});return s;};
        std::string lq=lower(q);
        std::vector<std::string> terms; std::string term;
        for(unsigned char ch:lq){
            if(std::isalnum(ch) || ch>=128) term.push_back((char)ch);
            else if(!term.empty()){terms.push_back(term);term.clear();}
        }
        if(!term.empty())terms.push_back(term);
        for(auto& x:mem){
            std::string fact=x.value("fact","");
            std::string cat=x.value("category","general");
            if(!category.empty() && cat!=category) continue;
            std::string lf=lower(fact);
            int importance=std::clamp(x.value("importance",3),1,5);
            if(q.empty()){ranked.push_back({importance,fact});continue;}
            int score=(lf.find(lq)!=std::string::npos?100:0)+importance;
            for(const auto& t:terms) if(t.size()>1 && lf.find(t)!=std::string::npos) score+=2;
            if(score>importance) ranked.push_back({score,fact});
        }
        std::sort(ranked.begin(),ranked.end(),[](const auto& a,const auto& b){return a.first>b.first;});
        json matches=json::array();
        for(size_t i=0;i<ranked.size() && i<12;i++) matches.push_back(ranked[i].second);
        return {{"ok",true},{"matches",matches},{"count",matches.size()}};
    }
    if(name=="character_control"){
        std::string action=a.value("action","");
        if(action=="eyes"){
            double x=std::clamp(a.value("x",0.0),-15.0,15.0), z=std::clamp(a.value("z",0.0),-15.0,15.0);
            PostJson({{"type","character"},{"action","eye_rotation"},{"x",x},{"z",z}});
            return {{"ok",true},{"action",action},{"x",x},{"z",z},{"limits","eye X/Z: -15..+15 degrees"}};
        }
        if(action=="head"){
            double x=std::clamp(a.value("x",0.0),-15.0,15.0), y=std::clamp(a.value("y",0.0),-15.0,15.0), z=std::clamp(a.value("z",0.0),-15.0,15.0);
            PostJson({{"type","character"},{"action","head_rotation"},{"x",x},{"y",y},{"z",z}});
            return {{"ok",true},{"action",action},{"x",x},{"y",y},{"z",z},{"limits","head X/Y/Z: -15..+15 degrees"}};
        }
        if(action=="spine"){
            double x=std::clamp(a.value("x",0.0),-8.0,8.0), y=std::clamp(a.value("y",0.0),-8.0,8.0), z=std::clamp(a.value("z",0.0),-8.0,8.0);
            PostJson({{"type","character"},{"action","spine"},{"x",x},{"y",y},{"z",z}});
            return {{"ok",true},{"action",action},{"x",x},{"y",y},{"z",z}};
        }
        if(action=="neck"){
            double x=std::clamp(a.value("x",0.0),-15.0,15.0), y=std::clamp(a.value("y",0.0),-15.0,15.0), z=std::clamp(a.value("z",0.0),-15.0,15.0);
            PostJson({{"type","character"},{"action","neck"},{"x",x},{"y",y},{"z",z}});
            return {{"ok",true},{"action",action},{"x",x},{"y",y},{"z",z},{"limits","neck X/Y/Z: -15..+15 degrees"}};
        }
        if(action=="shoulders"){
            double l=std::clamp(a.value("left",0.0),-15.0,15.0), r=std::clamp(a.value("right",0.0),-15.0,15.0);
            PostJson({{"type","character"},{"action","shoulders"},{"left",l},{"right",r}});
            return {{"ok",true},{"action",action},{"left",l},{"right",r}};
        }
        if(action=="wrists"){
            double l=std::clamp(a.value("left",0.0),-25.0,25.0), r=std::clamp(a.value("right",0.0),-25.0,25.0);
            PostJson({{"type","character"},{"action","wrists"},{"left",l},{"right",r}});
            return {{"ok",true},{"action",action},{"left",l},{"right",r}};
        }
        if(action=="legs"){
            double lt=std::clamp(a.value("leftThigh",0.0),-25.0,25.0);
            double rt=std::clamp(a.value("rightThigh",0.0),-25.0,25.0);
            double ls=std::clamp(a.value("leftShin",0.0),-30.0,30.0);
            double rs=std::clamp(a.value("rightShin",0.0),-30.0,30.0);
            double lf=std::clamp(a.value("leftFoot",0.0),-20.0,20.0);
            double rf=std::clamp(a.value("rightFoot",0.0),-20.0,20.0);
            PostJson({{"type","character"},{"action","legs"},{"leftThigh",lt},{"rightThigh",rt},{"leftShin",ls},{"rightShin",rs},{"leftFoot",lf},{"rightFoot",rf}});
            return {{"ok",true},{"action","legs"},{"leftThigh",lt},{"rightThigh",rt},{"leftShin",ls},{"rightShin",rs},{"leftFoot",lf},{"rightFoot",rf}};
        }
        if(action=="face"){
            double blink=std::clamp(a.value("blink",0.0),0.0,1.0), smile=std::clamp(a.value("smile",0.0),0.0,1.0), brow=std::clamp(a.value("brow",0.0),-1.0,1.0);
            PostJson({{"type","character"},{"action","face"},{"blink",blink},{"smile",smile},{"brow",brow}});
            return {{"ok",true},{"action",action},{"blink",blink},{"smile",smile},{"brow",brow}};
        }
        if(action=="emotion"){
            const std::string emotion=a.value("emotion","neutral");
            const std::vector<std::string> allowed={"neutral","happy","sad","surprised","angry","thinking","greeting","speaking"};
            if(std::find(allowed.begin(),allowed.end(),emotion)==allowed.end()) return {{"ok",false},{"error","Unknown facial emotion"}};
            int duration=std::clamp(a.value("duration",280),0,10000);
            PostJson({{"type","character"},{"action","emotion"},{"emotion",emotion},{"duration",duration}});
            return {{"ok",true},{"action",action},{"emotion",emotion},{"duration",duration}};
        }
        if(action=="blink"){
            int duration=std::clamp(a.value("duration",140),80,500);
            PostJson({{"type","character"},{"action","blink"},{"duration",duration}});
            return {{"ok",true},{"action",action},{"duration",duration}};
        }
        if(action=="arms"){
            double l=std::clamp(a.value("left",0.0),-20.0,20.0),r=std::clamp(a.value("right",0.0),-20.0,20.0),lf=std::clamp(a.value("leftForearm",0.0),-25.0,25.0),rf=std::clamp(a.value("rightForearm",0.0),-25.0,25.0);
            PostJson({{"type","character"},{"action","arms"},{"left",l},{"right",r},{"leftForearm",lf},{"rightForearm",rf}});
            return {{"ok",true},{"action",action}};
        }
        if(action=="gesture"){
            std::string g=a.value("gesture","idle");int duration=std::clamp(a.value("duration",900),100,10000);
            PostJson({{"type","character"},{"action","gesture"},{"gesture",g},{"duration",duration}});
            return {{"ok",true},{"action",action},{"gesture",g},{"duration",duration}};
        }
        if(action=="breathing"||action=="talking"){
            bool enabled=a.value("enabled",true);
            PostJson({{"type","character"},{"action",action},{"enabled",enabled}});
            return {{"ok",true},{"action",action},{"enabled",enabled}};
        }
        if(action=="behavior"){
            bool enabled=a.value("enabled",true);
            bool autoBlink=a.value("autoBlink",true);
            bool eyeSaccades=a.value("eyeSaccades",true);
            bool speechGestures=a.value("speechGestures",true);
            PostJson({{"type","character"},{"action","behavior"},{"enabled",enabled},{"autoBlink",autoBlink},{"eyeSaccades",eyeSaccades},{"speechGestures",speechGestures}});
            return {{"ok",true},{"action","behavior"},{"enabled",enabled},{"autoBlink",autoBlink},{"eyeSaccades",eyeSaccades},{"speechGestures",speechGestures}};
        }
        if(action=="reset"){
            PostJson({{"type","character"},{"action","reset"}});
            return {{"ok",true},{"action","reset"}};
        }
        return {{"ok",false},{"error","Unknown character controller action"}};
    }
    if(name=="set_eye_rotation"){
        double x=std::clamp(a.value("x",0.0),-15.0,15.0);
        double z=std::clamp(a.value("z",0.0),-15.0,15.0);
        PostJson({{"type","character"},{"action","eye_rotation"},{"x",x},{"z",z}});
        return {{"ok",true},{"x",x},{"z",z},{"limits","-15..+15 degrees"}};
    }
    if(name=="set_head_rotation"){
        double x=std::clamp(a.value("x",0.0),-15.0,15.0);
        double y=std::clamp(a.value("y",0.0),-15.0,15.0);
        double z=std::clamp(a.value("z",0.0),-15.0,15.0);
        PostJson({{"type","character"},{"action","head_rotation"},{"x",x},{"y",y},{"z",z}});
        return {{"ok",true},{"x",x},{"y",y},{"z",z},{"limits","-15..+15 degrees"}};
    }
    if(name=="reset_character_pose"){
        PostJson({{"type","character"},{"action","reset"}});
        return {{"ok",true}};
    }
    return {{"ok",false},{"error","Unknown tool"}};
}


static std::string LocalLower(std::string s){
    std::transform(s.begin(),s.end(),s.begin(),[](unsigned char c){return (char)std::tolower(c);});
    return s;
}
static bool LocalContainsAny(const std::string& s,const std::vector<std::string>& terms){
    for(const auto& t:terms) if(s.find(t)!=std::string::npos) return true;
    return false;
}
static std::string LocalTrim(std::string s){
    const auto a=s.find_first_not_of(" \t\r\n");
    if(a==std::string::npos)return "";
    const auto b=s.find_last_not_of(" \t\r\n");
    return s.substr(a,b-a+1);
}
static bool LocalOpen(const std::string& target){
    if(target.empty())return false;
    HINSTANCE r=ShellExecuteW(nullptr,L"open",Wide(target).c_str(),nullptr,nullptr,SW_SHOWNORMAL);
    return (INT_PTR)r>32;
}
static bool LocalOpenApplication(const std::string& app){
    if(app.empty())return false;
    HINSTANCE r=ShellExecuteW(nullptr,L"open",Wide(app).c_str(),nullptr,nullptr,SW_SHOWNORMAL);
    return (INT_PTR)r>32;
}
static bool LocalSetVolume(double percent){
    percent=std::clamp(percent,0.0,100.0);
    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr=CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator));
    if(FAILED(hr)||!enumerator)return false;
    ComPtr<IMMDevice> device;
    hr=enumerator->GetDefaultAudioEndpoint(eRender,eMultimedia,&device);
    if(FAILED(hr)||!device)return false;
    ComPtr<IAudioEndpointVolume> volume;
    hr=device->Activate(__uuidof(IAudioEndpointVolume),CLSCTX_ALL,nullptr,(void**)&volume);
    if(FAILED(hr)||!volume)return false;
    return SUCCEEDED(volume->SetMasterVolumeLevelScalar((float)(percent/100.0),nullptr));
}
static std::string LocalTimeText(){
    SYSTEMTIME st{};GetLocalTime(&st);
    char b[64]{};std::snprintf(b,sizeof(b),"%02u:%02u:%02u",(unsigned)st.wHour,(unsigned)st.wMinute,(unsigned)st.wSecond);
    return b;
}
static std::string LocalDateText(){
    SYSTEMTIME st{};GetLocalTime(&st);
    char b[64]{};std::snprintf(b,sizeof(b),"%04u-%02u-%02u",(unsigned)st.wYear,(unsigned)st.wMonth,(unsigned)st.wDay);
    return b;
}
static bool TryLocalCommand(const std::string& original){
    const std::string raw=LocalTrim(original);
    if(raw.empty())return false;
    const std::string q=LocalLower(raw);

    // Core local identity response: this works with no Internet and no API key.
    if(q=="hello"||q=="hi"||q=="hey"||q=="hello saeed"||q=="hi saeed"||q=="hey saeed"||q=="مرحبا"||q=="مرحبا سعيد"||q=="اهلا"||q=="أهلا"||q=="السلام عليكم"){
        PostJson({{"type","answer"},{"text","Hello! How can I help you?"},{"local",true},{"brain","local"}});
        return true;
    }

    // Common direct Windows commands. These never require an AI provider/API.
    if(LocalContainsAny(q,{"what time","current time","time is it","كم الساعة","الساعة كم","الوقت كم","الوقت الآن"})){
        const std::string answer="الوقت الآن "+LocalTimeText();
        PostJson({{"type","answer"},{"text",answer},{"local",true}});
        return true;
    }
    if(LocalContainsAny(q,{"what date","today's date","todays date","date today","what day","ما تاريخ اليوم","تاريخ اليوم","اليوم كم"})){
        const std::string answer="تاريخ اليوم "+LocalDateText();
        PostJson({{"type","answer"},{"text",answer},{"local",true}});
        return true;
    }

    // Volume: "set volume to 50", "volume 30%", "اجعل الصوت 50%".
    if(LocalContainsAny(q,{"set volume","volume to","volume ","الصوت","ارفع الصوت","اخفض الصوت","مستوى الصوت"})){
        size_t pos=q.find_last_of("0123456789");
        if(pos!=std::string::npos){
            size_t start=pos;
            while(start>0 && std::isdigit((unsigned char)q[start-1]))--start;
            try{
                int pct=std::clamp(std::stoi(q.substr(start,pos-start+1)),0,100);
                if(LocalSetVolume(pct)){
                    const std::string answer="تم ضبط صوت الكمبيوتر إلى "+std::to_string(pct)+"%.";
                    PostJson({{"type","answer"},{"text",answer},{"local",true}});
                }else{
                    PostJson({{"type","error"},{"text","تعذر تغيير مستوى صوت Windows."}});
                }
                return true;
            }catch(...){}
        }
    }

    if(LocalContainsAny(q,{"my computer","this pc","computer","file explorer","explorer","جهاز الكمبيوتر","هذا الكمبيوتر","الكمبيوتر","مستكشف الملفات"})){
        HINSTANCE r=ShellExecuteW(nullptr,L"open",L"explorer.exe",L"shell:MyComputerFolder",nullptr,SW_SHOWNORMAL);
        if((INT_PTR)r>32){
            const std::string answer=(INT_PTR)r>32?"حسناً، تم فتح جهاز الكمبيوتر.":"تعذر فتح جهاز الكمبيوتر.";
            PostJson({{"type","answer"},{"text",answer},{"local",true}});
        }else PostJson({{"type","error"},{"text","تعذر فتح مستكشف الملفات."}});
        return true;
    }

    std::string url;
    if(q.find("yahoo")!=std::string::npos){
        url="https://www.yahoo.com/";
    }else if(q.find("google")!=std::string::npos){
        url="https://www.google.com/";
    }else if(q.find("youtube")!=std::string::npos){
        url="https://www.youtube.com/";
    }
    if(!url.empty() && LocalContainsAny(q,{"open","go to","visit","website","browse","ادخل","افتح","اذهب","موقع","المتصفح"})){
        if(LocalOpen(url)) PostJson({{"type","answer"},{"text","تم فتح "+url+".","local",true}});
        else PostJson({{"type","error"},{"text","تعذر فتح الموقع في المتصفح الافتراضي."}});
        return true;
    }

    if(LocalContainsAny(q,{"open browser","open chrome","open edge","افتح المتصفح","افتح كروم","افتح إيدج"})){
        std::string app;
        if(q.find("chrome")!=std::string::npos||q.find("كروم")!=std::string::npos)app="chrome.exe";
        else if(q.find("edge")!=std::string::npos||q.find("إيدج")!=std::string::npos)app="msedge.exe";
        else app="msedge.exe";
        if(LocalOpenApplication(app))PostJson({{"type","answer"},{"text","تم فتح المتصفح.","local",true}});
        else PostJson({{"type","error"},{"text","تعذر تشغيل المتصفح."}});
        return true;
    }

    // Explicit local path: open any existing file/folder with its Windows association.
    if((raw.size()>2 && (raw[1]==':' || raw.rfind("\\\\",0)==0 || raw.rfind("/",0)==0))){
        std::error_code ec;
        if(std::filesystem::exists(Wide(raw),ec)){
            if(LocalOpen(raw))PostJson({{"type","answer"},{"text","تم فتح "+raw+".","local",true}});
            else PostJson({{"type","error"},{"text","تعذر فتح "+raw+"."}});
            return true;
        }
    }
    return false;
}

void RunAgent(std::string text){
    if(g_agentRunning.exchange(true)){
        PostJson({{"type","status"},{"text","سعيد مشغول بمهمة أخرى"},{"state","busy"}});
        return;
    }
    const std::string taskId="task-"+std::to_string(++g_agentTaskSerial);
    g_agentTaskId=taskId;
    g_agentCancel.store(false);
    PostJson({{"type","status"},{"text","بدأت مهمة جديدة"},{"state","running"},{"taskId",taskId}});
    RecordAgentEvent(taskId,"running","بدأت مهمة جديدة");
    UpdateAgentTaskState(taskId,text,"running",0,0,"plan","",0,"بدأت المهمة؛ سيتم إنشاء خطوات التنفيذ أثناء التقدم.");

    try{
        std::thread([text=std::move(text),taskId]() mutable{
        try{
            SaeedAgentCore2 core(std::filesystem::path(SaeedDataRoot())/L"agent-core");
            auto plan=core.makePlan(text);
            core.savePlan(plan);
            core.setGoal(text,"active");
            core.journal(taskId,"planned","Agent Core 2.0 created the execution plan.");
            json settings=LoadSettings();
            std::string key=settings.value("apiKey",""); if(key.empty())throw std::runtime_error("ضع API key في الإعدادات أولاً.");
            std::string base=settings.value("baseUrl","https://openrouter.ai/api/v1");while(!base.empty()&&base.back()=='/')base.pop_back();
            std::string url=base+"/chat/completions";
            json history=LoadArrayFile(HistoryPath());
            json messages=json::array();
            messages.push_back({{"role","system"},{"content","You are Saeed, a persistent Windows desktop AI agent and companion. You have a reasoning loop, tools, visual perception, long-term memory, and the ability to execute multi-step tasks. Detect the language of each user message automatically. Always understand and respond in the same language as the user's latest message, including when the user switches languages between turns; never require a language setting and never translate unless the user asks. Do not merely explain how to do something when the user asks you to do it: inspect the computer, make a plan internally, execute safe steps, verify outcomes, recover from errors, and continue until the goal is complete or a real blocker exists. Use active_window, monitor_info and screen_capture before GUI actions when visual state matters. Use recall when the request may depend on prior user preferences or facts, and remember only facts the user explicitly asks you to remember. Maintain continuity across turns using conversation history and memory. Never claim success unless a tool result or verification supports it. Ask for confirmation only for actions marked as requiring it; never bypass confirmation. Avoid destructive actions unless explicitly requested and confirmed. When executing a multi-step task, treat tool failures as evidence, not as success: inspect the returned error/state, change the approach when needed, and stop repeating an identical failed action after the retry limit. Before a final answer, ensure the requested goal is actually verified; if it is not, clearly report the blocker instead of claiming completion."}});
            if(history.is_array()){ size_t start=history.size()>20?history.size()-20:0; for(size_t i=start;i<history.size();++i){ if(history[i].is_object()&&history[i].contains("role")&&history[i].contains("content")) messages.push_back({{"role",history[i]["role"]},{"content",history[i]["content"]}}); } }
            // Automatically surface relevant long-term memory for every user turn.
            // This does not save anything; it only provides existing memories as context.
            {
                auto mem=LoadArrayFile(MemoryPath());
                std::string q=text, lq=q;
                std::transform(lq.begin(),lq.end(),lq.begin(),[](unsigned char ch){return (char)std::tolower(ch);});
                std::vector<std::pair<int,std::string>> ranked;
                for(auto& x:mem){
                    std::string fact=x.value("fact","");
                    std::string lf=fact;
                    std::transform(lf.begin(),lf.end(),lf.begin(),[](unsigned char ch){return (char)std::tolower(ch);});
                    int score=std::clamp(x.value("importance",3),1,5);
                    if(lq.size()>2 && lf.find(lq)!=std::string::npos) score+=100;
                    std::vector<std::string> terms; std::string t;
                    for(unsigned char ch:lq){
                        if(std::isalnum(ch) || ch>=128) t.push_back((char)ch);
                        else if(!t.empty()){terms.push_back(t);t.clear();}
                    }
                    if(!t.empty())terms.push_back(t);
                    for(const auto& term:terms){
                        if(term.size()>1 && lf.find(term)!=std::string::npos) score+=3;
                    }
                    if(score>3) ranked.push_back({score,fact});
                }
                std::sort(ranked.begin(),ranked.end(),[](const auto& a,const auto& b){return a.first>b.first;});
                if(!ranked.empty()){
                    json context=json::array();
                    for(size_t i=0;i<ranked.size()&&i<8;i++) context.push_back(ranked[i].second);
                    messages.push_back({{"role","system"},{"content","Relevant long-term memory for this turn (use only when relevant; do not claim these facts if they conflict with the user's current message):\\n"+context.dump()}});
                }
            }
            messages.push_back({{"role","user"},{"content",text}});
            int maxSteps=std::clamp(settings.value("maxSteps",12),1,32);
            const int maxToolRetries=2;
            std::unordered_map<std::string,int> toolFailures;
            for(int step=0;step<maxSteps;step++){
                if(g_agentCancel.load()) throw std::runtime_error("Agent task cancelled by user.");
                PostJson({{"type","status"},{"text","سعيد يفكر..."},{"state","thinking"},{"taskId",taskId},{"step",step+1},{"maxSteps",maxSteps}});
                UpdateAgentTaskState(taskId,text,"thinking",step+1,maxSteps,"plan","",0,"تحليل الخطوة التالية والتحقق من حالة المهمة.");
                json req={{"model",settings.value("model","openai/gpt-5.1")},{"messages",messages},{"tools",ToolSchemas()},{"tool_choice","auto"}};
                json resp=json::parse(HttpPostJson(url,key,req));
                if(!resp.contains("choices"))throw std::runtime_error(resp.value("error",json{{"message","AI provider returned no choices"}}).value("message","AI error"));
                json msg=resp["choices"][0]["message"];
                if(msg.contains("tool_calls")&&!msg["tool_calls"].empty()){
                    messages.push_back(msg);
                    for(auto& tc:msg["tool_calls"]){
                        std::string name=tc["function"].value("name","");
                        json args=json::parse(tc["function"].value("arguments","{}"));
                        PostJson({{"type","status"},{"text","ينفذ: "+name},{"state","tool"},{"taskId",taskId},{"tool",name},{"step",step+1}});
                        RecordAgentEvent(taskId,"tool","تنفيذ الأداة",step+1,name);
                        UpdateAgentTaskState(taskId,text,"executing",step+1,maxSteps,"execute",name,0,"تنفيذ خطوة المهمة.");
                        json result=ExecuteTool(name,args);
                        core.journal(taskId,"tool",result.value("ok",false)?"Tool completed":"Tool failed",name);
                        if(core.permissionRequired(name)) core.journal(taskId,"permission","Sensitive action classified for confirmation",name);
                        if(!result.value("ok",false)){
                            const std::string failureKey=name+"|"+args.dump();
                            const int failures=++toolFailures[failureKey];
                            PostJson({{"type","status"},{"text","حدث خطأ، يحاول Saeed التعافي"},{"state","recovering"},{"taskId",taskId},{"tool",name},{"step",step+1},{"attempt",failures},{"maxAttempts",maxToolRetries+1}});
                            RecordAgentEvent(taskId,"recovering",result.value("error",std::string("tool failed")),step+1,name);
                            UpdateAgentTaskState(taskId,text,"recovering",step+1,maxSteps,"recover",name,failures,result.value("error",std::string("tool failed")));
                            result["agent_recovery_hint"]="The tool failed. Inspect the error and reconsider the target/state.";
                            if(failures>maxToolRetries){
                                result["retry_exhausted"]=true;
                                result["agent_recovery_hint"]="This exact tool/action has failed too many times. Do not repeat it unchanged. Inspect state and choose a different safe approach, or report a real blocker.";
                                PostJson({{"type","status"},{"text","استنفدت محاولات هذه العملية؛ يبحث Saeed عن طريقة أخرى"},{"state","recovery_exhausted"},{"taskId",taskId},{"tool",name},{"step",step+1}});
                            } else result["retry_allowed"]=true;
                        }
                        if(result.value("ok",false) && result.contains("image_base64")){
                            std::string b64=result.value("image_base64","");
                            result.erase("image_base64");
                            result["note"]="A visual screenshot is attached for verification.";
                            messages.push_back({{"role","tool"},{"tool_call_id",tc.value("id","")},{"content",result.dump()}});
                            messages.push_back({{"role","user"},{"content",json::array({
                                {{"type","text"},{"text","Here is the current desktop screenshot captured by screen_capture. Inspect it visually and use it to decide the next action."}},
                                {{"type","image_url"},{"image_url",{{"url","data:image/jpeg;base64,"+b64}}}}
                            })}});
                        }else{
                            messages.push_back({{"role","tool"},{"tool_call_id",tc.value("id","")},{"content",result.dump()}});
                        }
                    }
                    continue;
                }
                std::string answer=msg.value("content","");
                // A text-only response is considered a completion only when the
                // model is not still describing an unfinished action.
                // Keep the execution journal explicit for diagnostics/recovery.
                RecordAgentEvent(taskId,"decision","Agent produced a final response",step+1);
                auto h=LoadArrayFile(HistoryPath()); h.push_back({{"role","user"},{"content",text}}); h.push_back({{"role","assistant"},{"content",answer}}); if(h.size()>40) h.erase(h.begin(),h.begin()+(h.size()-40)); SaveArrayFile(HistoryPath(),h);
                PostJson({{"type","answer"},{"text",answer},{"state","completed"},{"taskId",taskId}});
                core.journal(taskId,"completed",answer);
                RecordAgentEvent(taskId,"completed",answer);
                UpdateAgentTaskState(taskId,text,"completed",step+1,maxSteps,"verify","",0,"تم الوصول إلى إجابة نهائية بعد دورة التنفيذ.");
                g_agentRunning.store(false);
                return;
            }
            throw std::runtime_error("تم الوصول إلى حد خطوات الوكيل.");
        }catch(const std::exception& e){
            const bool cancelled=g_agentCancel.load();
            const std::string err=e.what();
            if(!cancelled && (err.find("API key")!=std::string::npos || err.find("api key")!=std::string::npos)){
                PostJson({{"type","answer"},{"text","يرجى ربط API حتى أستطيع الإجابة عن هذا السؤال."},{"state","completed"},{"taskId",taskId}});
                RecordAgentEvent(taskId,"completed","API connection is required for this request.");
            }else{
                PostJson({{"type",cancelled?"status":"error"},{"text",cancelled?"تم إلغاء المهمة":err},{"state",cancelled?"cancelled":"error"},{"taskId",taskId}});
                RecordAgentEvent(taskId,"cancelled","cancelled");
            }
        }
        g_agentRunning.store(false);
    }).detach();
    }catch(const std::exception& e){
        g_agentRunning.store(false);
        PostJson({{"type","error"},{"text",std::string("تعذر بدء مهمة Saeed: ")+e.what()},{"state","error"},{"taskId",taskId}});
    }
}


static void ResizeUtilityWebView(HWND h, ICoreWebView2Controller* controller){
    if(!h||!controller)return;
    RECT r{}; GetClientRect(h,&r); controller->put_Bounds(r);
}

static void CloseUtilityWindow(UtilityWindowKind kind){
    HWND h=(kind==UTILITY_SETTINGS)?g_settingsHwnd:(kind==UTILITY_UPDATE?g_updateHwnd:(kind==UTILITY_PERFORMANCE?g_performanceHwnd:g_chatHwnd));
    if(h && IsWindow(h)) DestroyWindow(h);
}

static 
void AppendNativeChat(const std::wstring& text, bool assistant){
    if(!g_nativeChatHistory)return;
    const int oldLen=GetWindowTextLengthW(g_nativeChatHistory);
    std::wstring current(static_cast<size_t>(oldLen),L'\0');
    if(oldLen>0)GetWindowTextW(g_nativeChatHistory,current.data(),oldLen+1);
    std::wstring line=(assistant?L"Saeed: ":L"You: ")+text+L"\r\n\r\n";
    current+=line;
    SetWindowTextW(g_nativeChatHistory,current.c_str());
    SendMessageW(g_nativeChatHistory,EM_SETSEL,static_cast<WPARAM>(current.size()),static_cast<LPARAM>(current.size()));
    SendMessageW(g_nativeChatHistory,EM_SCROLLCARET,0,0);
}

static HWND NativeLabel(HWND parent,const wchar_t* text,int x,int y,int w,int h){
    return CreateWindowExW(0,L"STATIC",text,WS_CHILD|WS_VISIBLE,x,y,w,h,parent,nullptr,GetModuleHandleW(nullptr),nullptr);
}
static HWND NativeButton(HWND parent,const wchar_t* text,int id,int x,int y,int w,int h){
    return CreateWindowExW(0,L"BUTTON",text,WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
        x,y,w,h,parent,reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)),GetModuleHandleW(nullptr),nullptr);
}
static HWND NativeEdit(HWND parent,int id,int x,int y,int w,int h,DWORD style=0){
    return CreateWindowExW(WS_EX_CLIENTEDGE,L"EDIT",L"",WS_CHILD|WS_VISIBLE|WS_TABSTOP|style,
        x,y,w,h,parent,reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)),GetModuleHandleW(nullptr),nullptr);
}
static void ApplyNativeFont(HWND h){
    if(h&&g_nativeUiFont)SendMessageW(h,WM_SETFONT,reinterpret_cast<WPARAM>(g_nativeUiFont),TRUE);
}
static std::wstring NativeGetText(HWND h){
    if(!h)return {};
    const int n=GetWindowTextLengthW(h);
    std::wstring s(static_cast<size_t>(n),L'\0');
    if(n)GetWindowTextW(h,s.data(),n+1);
    return s;
}
static void NativeSetText(HWND h,const std::wstring& s){if(h)SetWindowTextW(h,s.c_str());}

static void NativeCreateChatControls(HWND h){
    // WhatsApp-inspired native desktop chat: compact header, conversation surface,
    // composer at the bottom, and clear green send action. It remains a completely
    // independent top-level window from the 3D avatar.
    NativeLabel(h,L"●  Saeed AI",18,14,330,34);
    NativeLabel(h,L"Online • Desktop Assistant",18,40,330,20);

    g_nativeChatHistory=CreateWindowExW(WS_EX_CLIENTEDGE,L"EDIT",L"",
        WS_CHILD|WS_VISIBLE|WS_VSCROLL|ES_MULTILINE|ES_READONLY|ES_AUTOVSCROLL,
        18,72,784,420,h,reinterpret_cast<HMENU>(ID_NATIVE_CHAT_HISTORY),GetModuleHandleW(nullptr),nullptr);

    g_nativeChatInput=CreateWindowExW(WS_EX_CLIENTEDGE,L"EDIT",L"",
        WS_CHILD|WS_VISIBLE|WS_TABSTOP|ES_MULTILINE|ES_AUTOVSCROLL|ES_WANTRETURN,
        18,510,650,72,h,reinterpret_cast<HMENU>(ID_NATIVE_CHAT_INPUT),GetModuleHandleW(nullptr),nullptr);
    HWND send=NativeButton(h,L"Send",ID_NATIVE_CHAT_SEND,680,510,122,34);
    HWND cancel=NativeButton(h,L"Stop",ID_NATIVE_CHAT_CANCEL,680,548,122,34);
    g_nativeChatStatus=NativeLabel(h,L"Ready",18,590,650,24);

    for(HWND c:{g_nativeChatHistory,g_nativeChatInput,send,cancel,g_nativeChatStatus})ApplyNativeFont(c);
    NativeSetText(g_nativeChatHistory,L"Today\r\n\r\nSaeed AI\r\nHello. I am Saeed, your desktop AI companion.\r\n\r\n");
    SetFocus(g_nativeChatInput);
}

static void ApplyProviderPreset(HWND h){
    if(!g_nativeSettingsProvider)return;
    int i=static_cast<int>(SendMessageW(g_nativeSettingsProvider,CB_GETCURSEL,0,0));
    const wchar_t* base=L"https://openrouter.ai/api/v1"; const wchar_t* model=L"openai/gpt-5.1";
    switch(i){
      case 1: base=L"https://api.openai.com/v1"; model=L"gpt-5.1"; break;
      case 2: base=L"https://api.anthropic.com"; model=L"claude-sonnet-4-5"; break;
      case 3: base=L"https://generativelanguage.googleapis.com/v1beta"; model=L"gemini-2.5-pro"; break;
      case 4: base=L"https://api.groq.com/openai/v1"; model=L"llama-3.3-70b-versatile"; break;
      case 5: base=L"https://api.mistral.ai/v1"; model=L"mistral-large-latest"; break;
      case 6: base=L"https://api.x.ai/v1"; model=L"grok-4"; break;
      case 7: base=L"https://api.deepseek.com/v1"; model=L"deepseek-chat"; break;
      case 8: base=L"https://api.cohere.com/v2"; model=L"command-a-03-2025"; break;
      case 9: base=L"https://api.together.xyz/v1"; model=L"meta-llama/Llama-3.3-70B-Instruct-Turbo"; break;
      case 10: return;
      default: break;
    }
    NativeSetText(g_nativeSettingsBaseUrl,base);
    NativeSetText(g_nativeSettingsModel,model);
}
static void NativeSaveSettings(HWND){ /* Settings is currently an experimental informational screen. */ }
static void NativeCreateSettingsControls(HWND,const std::string&){ }
static void NativeCreatePerformanceControls(HWND h){
    NativeLabel(h,L"This is a Performance experimental screen.",30,55,440,42);
    NativeButton(h,L"Cancel",ID_NATIVE_SETTINGS_CANCEL,270,175,95,34);
    NativeButton(h,L"OK",ID_NATIVE_SETTINGS_OK,375,175,95,34);
}
void HandleNativeUtilityMessage(const json& j){
    const std::string type=j.value("type","");
    if(type=="answer"){ AppendNativeChat(Wide(j.value("text","")),true); if(g_nativeChatStatus)NativeSetText(g_nativeChatStatus,L"Saeed is speaking"); }
    else if(type=="status"){ if(g_nativeChatStatus)NativeSetText(g_nativeChatStatus,Wide(j.value("text","Saeed ready"))); }
    else if(type=="tool"){ if(g_nativeChatStatus)NativeSetText(g_nativeChatStatus,Wide("Running: "+j.value("name","tool"))); }
    else if(type=="error"){ AppendNativeChat(Wide("Error: "+j.value("text","")),true); if(g_nativeChatStatus)NativeSetText(g_nativeChatStatus,L"Error"); }
    else if(type=="native_command_result"){ AppendNativeChat(Wide(j.value("message","")),true); }
    else if(type=="update_status"){
        const std::wstring text=Wide(j.value("text",""));
        if(g_nativeSettingsUpdateStatus)NativeSetText(g_nativeSettingsUpdateStatus,text);
        if(g_nativeUpdateStatus)NativeSetText(g_nativeUpdateStatus,text);
        const std::string state=j.value("state","");
        if(g_nativeUpdateProgress && (state=="checking_update"||state=="up_to_date"))SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);
    }else if(type=="update_progress"){
        const uint64_t done=j.value("downloaded",0ULL),total=j.value("total",0ULL);
        if(g_nativeUpdateProgress && total>0)SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,static_cast<WPARAM>(std::clamp(100.0*static_cast<double>(done)/static_cast<double>(total),0.0,100.0)),0);
        if(g_nativeUpdateStatus)NativeSetText(g_nativeUpdateStatus,total?Wide("Downloading "+std::to_string(done/1048576ULL)+" MB of "+std::to_string(total/1048576ULL)+" MB"):L"Downloading update...");
    }else if(type=="update_available"){
        g_pendingUpdateUrl=j.value("url","");
        g_pendingUpdateVersion=j.value("version",j.value("tag",""));
        g_pendingUpdateSize=j.value("size",0ULL);
        g_pendingUpdateDate=j.value("date",j.value("publishedAt",""));
        if(g_nativeUpdateTitle)NativeSetText(g_nativeUpdateTitle,L"A new Saeed AI update is available");
        if(g_nativeUpdateVersion)NativeSetText(g_nativeUpdateVersion,Wide("Version: "+g_pendingUpdateVersion));
        if(g_nativeUpdateSize)NativeSetText(g_nativeUpdateSize,g_pendingUpdateSize?Wide("Download size: "+std::to_string(g_pendingUpdateSize/1048576.0).substr(0,6)+" MB"):L"Download size: calculating...");
        if(g_nativeUpdateDate)NativeSetText(g_nativeUpdateDate,g_pendingUpdateDate.empty()?L"Release date: —":Wide("Release date: "+g_pendingUpdateDate));
        if(g_nativeUpdateStatus)NativeSetText(g_nativeUpdateStatus,L"Ready to download.");
        if(g_nativeUpdateProgress)SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);
    }
}
static void CreateNativeUtilityWindow(UtilityWindowKind kind,const std::string& initialTab){
    HWND& slot=(kind==UTILITY_SETTINGS)?g_settingsHwnd:(kind==UTILITY_UPDATE?g_updateHwnd:(kind==UTILITY_PERFORMANCE?g_performanceHwnd:g_chatHwnd));
    if(slot && IsWindow(slot)){ ShowWindow(slot,SW_SHOWNORMAL); SetForegroundWindow(slot); if(kind==UTILITY_SETTINGS){InitSettingsWebView();ResizeSettingsWebView();} return; }
    const wchar_t* cls=L"SaeedNativeUtilityWindow";
    WNDCLASSEXW wc{sizeof(wc)}; wc.hInstance=GetModuleHandleW(nullptr); wc.lpfnWndProc=UtilityWndProc;
    wc.lpszClassName=cls; wc.hCursor=LoadCursorW(nullptr,IDC_ARROW); wc.hbrBackground=CreateSolidBrush(RGB(238,242,246));
    static bool registered=false;
    if(!registered){ if(!RegisterClassExW(&wc) && GetLastError()!=ERROR_CLASS_ALREADY_EXISTS)return; registered=true; }
    const wchar_t* title=kind==UTILITY_SETTINGS?L"Saeed AI Settings":(kind==UTILITY_UPDATE?L"Saeed AI Update":(kind==UTILITY_PERFORMANCE?L"Saeed AI Performance":L"Saeed AI Chat"));
    const int width=kind==UTILITY_SETTINGS?900:(kind==UTILITY_UPDATE?820:(kind==UTILITY_PERFORMANCE?520:820));
    const int height=kind==UTILITY_SETTINGS?700:(kind==UTILITY_UPDATE?400:(kind==UTILITY_PERFORMANCE?260:700));
    slot=CreateWindowExW(WS_EX_APPWINDOW,cls,title,WS_OVERLAPPEDWINDOW|WS_CLIPCHILDREN|WS_VISIBLE,
        CW_USEDEFAULT,CW_USEDEFAULT,width,height,nullptr,nullptr,GetModuleHandleW(nullptr),nullptr);
    if(!slot)return;
    SetWindowLongPtrW(slot,GWLP_ID,kind);
    if(!g_utilityBgBrush)g_utilityBgBrush=CreateSolidBrush(RGB(238,242,246));
    if(!g_utilityInputBrush)g_utilityInputBrush=CreateSolidBrush(RGB(255,255,255));
    ShowWindow(slot,SW_SHOWNORMAL); UpdateWindow(slot);
    if(kind==UTILITY_SETTINGS){ NativeCreateSettingsControls(slot,initialTab); InitSettingsWebView(); }
    else if(kind==UTILITY_UPDATE)NativeCreateUpdateControls(slot);
    else if(kind==UTILITY_PERFORMANCE)NativeCreatePerformanceControls(slot);
    else NativeCreateChatControls(slot);
}
static void NativeCreateUpdateControls(HWND h){
    NativeLabel(h,L"Saeed AI — Windows Update",28,24,700,34);
    g_nativeUpdateTitle=NativeLabel(h,L"Checking for updates...",28,76,760,30);
    g_nativeUpdateVersion=NativeLabel(h,L"Version: —",28,112,760,24);
    g_nativeUpdateDate=NativeLabel(h,L"Release date: —",28,140,760,24);
    g_nativeUpdateSize=NativeLabel(h,L"Download size: —",28,168,760,24);
    g_nativeUpdateProgress=CreateWindowExW(0,PROGRESS_CLASSW,L"",WS_CHILD|WS_VISIBLE,28,210,760,18,h,reinterpret_cast<HMENU>(ID_NATIVE_UPDATE_PROGRESS),GetModuleHandleW(nullptr),nullptr);
    SendMessageW(g_nativeUpdateProgress,PBM_SETRANGE,0,MAKELPARAM(0,100));
    SendMessageW(g_nativeUpdateProgress,PBM_SETPOS,0,0);
    g_nativeUpdateStatus=NativeLabel(h,L"Checking...",28,246,760,44);
    NativeButton(h,L"Update now",ID_NATIVE_UPDATE_NOW,28,320,130,38);
    NativeButton(h,L"Later",ID_NATIVE_UPDATE_LATER,170,320,100,38);
    NativeButton(h,L"Close",ID_NATIVE_UPDATE_CLOSE,680,320,108,38);
    for(HWND x:{g_nativeUpdateTitle,g_nativeUpdateVersion,g_nativeUpdateDate,g_nativeUpdateSize,g_nativeUpdateProgress,g_nativeUpdateStatus,
                GetDlgItem(h,ID_NATIVE_UPDATE_NOW),GetDlgItem(h,ID_NATIVE_UPDATE_LATER),GetDlgItem(h,ID_NATIVE_UPDATE_CLOSE)})ApplyNativeFont(x);
    if(!g_pendingUpdateVersion.empty()){
        NativeSetText(g_nativeUpdateTitle,Wide("A new Saeed AI update is available"));
        NativeSetText(g_nativeUpdateVersion,Wide("Version: "+g_pendingUpdateVersion));
        NativeSetText(g_nativeUpdateSize,g_pendingUpdateSize?Wide("Download size: "+std::to_string(g_pendingUpdateSize/1048576.0).substr(0,5)+" MB"):L"Download size: calculating...");
        NativeSetText(g_nativeUpdateDate,g_pendingUpdateDate.empty()?L"Release date: available from GitHub":Wide("Release date: "+g_pendingUpdateDate));
        NativeSetText(g_nativeUpdateStatus,L"Ready to download.");
    }
}
void OpenUpdateWindow(){ CreateNativeUtilityWindow(UTILITY_UPDATE,"update"); }

static json SettingsUiDefaults(){
    return {
      {"general",{{"theme","dark"},{"startWithWindows",true},{"minimizeToTray",true},{"alwaysOnTop",true},{"hotkey","Ctrl+Shift+S"}}},
      {"ai",{{"provider","OpenAI"},{"baseUrl","https://api.openai.com/v1"},{"apiKey",""},{"model","gpt-4o-mini"},{"temperature",0.7},{"maxTokens",2048},{"systemPrompt","You are Saeed, a helpful desktop AI assistant."},{"memoryLength",50},{"sttProvider","Local Windows"},{"sttBaseUrl",""},{"sttModel",""},{"sttApiKey",""}}},
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
        if(s.contains("sttProvider"))d["ai"]["sttProvider"]=s["sttProvider"];
        if(s.contains("sttBaseUrl"))d["ai"]["sttBaseUrl"]=s["sttBaseUrl"];
        if(s.contains("sttModel"))d["ai"]["sttModel"]=s["sttModel"];
        if(s.contains("sttApiKey"))d["ai"]["sttApiKey"]=s["sttApiKey"];
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
    if(old.contains("ai")&&old["ai"].is_object()){old["ai"].erase("apiKey");old["ai"].erase("sttApiKey");}
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
        if(path=="ai.apiKey")s["apiKey"]=v;
        else SetJsonPath(s,path,v);
        if(path=="ai.provider")s["provider"]=v;
        if(path=="ai.baseUrl")s["baseUrl"]=v;
        if(path=="ai.model")s["model"]=v;
        if(path=="ai.maxTokens")s["maxSteps"]=v;
        if(path=="ai.sttProvider"){s["sttProvider"]=v;s["sttProviderUserSet"]=true;}
        if(path=="ai.sttBaseUrl")s["sttBaseUrl"]=v;
        if(path=="ai.sttModel")s["sttModel"]=v;
        if(path=="ai.sttApiKey")s["sttApiKey"]=v;
        if(path=="ai.sttProvider"||path=="ai.sttBaseUrl"||path=="ai.sttModel"||path=="ai.sttApiKey"){
            const json mic=s.value("mic",json::object());
            const std::string inputMode=mic.value("inputMode","always");
            const std::string mode=inputMode=="push"?"push":(inputMode=="vad"?"smart":"always");
            PostJson({{"type","voice_settings"},{"voiceMode",mode},{"language",mic.value("language","en-US")},{"sttProvider",s.value("sttProvider","Local Windows")}});
        }
        if(path=="general.startWithWindows")SetStartupEnabled(v.get<bool>());
        if(path=="general.alwaysOnTop"&&g_settingsHwnd)
            SetWindowPos(g_settingsHwnd,v.get<bool>()?HWND_TOPMOST:HWND_NOTOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
        SaveSettings(s);
        if(path=="mic.inputMode"||path=="mic.language"){
            const json mic=s.value("mic",json::object());
            const std::string inputMode=mic.value("inputMode","always");
            const std::string mode=inputMode=="push"?"push":(inputMode=="vad"?"smart":"always");
            PostJson({{"type","voice_settings"},{"voiceMode",mode},{"language",mic.value("language","en-US")},{"sttProvider",s.value("sttProvider","Local Windows")}});
        }
        return;
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
            std::string endpoint=base.empty()?"https://api.openai.com/v1":base;
            while(!endpoint.empty()&&endpoint.back()=='/')endpoint.pop_back();
            std::wstring url=Wide(endpoint+"/models");
            URL_COMPONENTSW c{};c.dwStructSize=sizeof(c);c.dwSchemeLength=(DWORD)-1;c.dwHostNameLength=(DWORD)-1;c.dwUrlPathLength=(DWORD)-1;c.dwExtraInfoLength=(DWORD)-1;
            if(WinHttpCrackUrl(url.c_str(),0,0,&c)){
                std::wstring host(c.lpszHostName,c.dwHostNameLength),path(c.lpszUrlPath?c.lpszUrlPath:L"/models",c.dwUrlPathLength);
                if(path.empty())path=L"/models";
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
                        DWORD status=0,size=sizeof(status);WinHttpQueryHeaders(req,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,nullptr);ok=status>=200&&status<300;msg=ok?"Connection verified (HTTP "+std::to_string(status)+")":"Provider rejected the request (HTTP "+std::to_string(status)+")";
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
void OpenSettingsWindow(const std::string& tab){ g_settingsInitialTab=tab; CreateNativeUtilityWindow(UTILITY_SETTINGS,tab); }
void OpenChatWindow(){ CreateNativeUtilityWindow(UTILITY_CHAT,"chat"); }

void InitializeWebView(){
    wchar_t local[MAX_PATH]{};
    GetEnvironmentVariableW(L"LOCALAPPDATA",local,MAX_PATH);
    std::wstring data=std::wstring(local)+L"\\Saeed\\WebView2Data";
    WriteLog("WebView2 environment creation starting");
    CreateCoreWebView2EnvironmentWithOptions(nullptr,data.c_str(),nullptr,Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>([](HRESULT hr,ICoreWebView2Environment* env)->HRESULT{
        WriteLog("WebView2 environment callback received. HRESULT="+std::to_string((long)hr));
        if(FAILED(hr)||!env){
            const std::string msg="WebView2 Runtime is required but could not be initialized. HRESULT="+std::to_string((long)hr);
            WriteLog(msg);
            const std::wstring detail=L"Saeed cannot start the 3D interface.\n\nMicrosoft Edge WebView2 Runtime is missing, blocked, or incompatible.\n\nPlease run the Saeed installer again so it can install WebView2 Runtime, then restart Saeed.\n\nDiagnostic code: "+Wide(std::to_string((long)hr));
            MessageBoxW(g_hwnd,detail.c_str(),L"Saeed AI - Startup Error",MB_OK|MB_ICONERROR);
            return hr;
        }
        g_webviewEnv=env;
        WriteLog("WebView2 environment is ready; requesting controller creation");
        HRESULT controllerRequestHr = env->CreateCoreWebView2Controller(g_hwnd,Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>([](HRESULT hr,ICoreWebView2Controller* c)->HRESULT{
            WriteLog("WebView2 controller callback received. HRESULT="+std::to_string((long)hr));
            if(FAILED(hr)||!c){
                const std::string msg="WebView2 controller initialization failed: "+std::to_string((long)hr);
                WriteLog(msg);
                const std::wstring detail=L"Saeed could not create the 3D rendering window.\n\nWebView2 started but its controller could not be created.\nCheck Windows graphics/driver settings and the diagnostic log at %LOCALAPPDATA%\\Saeed\\saeed.log.\n\nDiagnostic code: "+Wide(std::to_string((long)hr));
                MessageBoxW(g_hwnd,detail.c_str(),L"Saeed AI - Startup Error",MB_OK|MB_ICONERROR);
                return hr;
            }
            WriteLog("WebView2 controller object received; storing controller");
            g_controller=c;
            ComPtr<ICoreWebView2Controller2> c2;
            if(SUCCEEDED(c->QueryInterface(IID_PPV_ARGS(&c2)))&&c2){
                const HRESULT bgHr=c2->put_DefaultBackgroundColor(COREWEBVIEW2_COLOR{0,0,0,0});
                WriteLog("WebView2 transparent background configured. HRESULT="+std::to_string((long)bgHr));
            }
            WriteLog("Requesting CoreWebView2 interface from controller");
            const HRESULT coreHr=c->get_CoreWebView2(&g_webview);
            WriteLog("CoreWebView2 interface result. HRESULT="+std::to_string((long)coreHr));
            if(FAILED(coreHr)||!g_webview){
                const std::string msg="WebView2 CoreWebView2 interface could not be obtained. HRESULT="+std::to_string((long)coreHr);
                WriteLog(msg);
                MessageBoxW(g_hwnd,Wide("Saeed could not initialize the WebView2 browser interface.\n\nDiagnostic code: "+std::to_string((long)coreHr)).c_str(),L"Saeed AI - Startup Error",MB_OK|MB_ICONERROR);
                return FAILED(coreHr)?coreHr:E_FAIL;
            }
            if(g_webview){
                // Saeed is a packaged desktop application, not a browser page.
                // Disable browser-only affordances so right-click cannot expose
                // Save Image / Inspect / DevTools or browser accelerators.
                ComPtr<ICoreWebView2Settings> settings;
                const HRESULT settingsHr=g_webview->get_Settings(&settings);
                WriteLog("WebView2 settings query. HRESULT="+std::to_string((long)settingsHr));
                if(SUCCEEDED(settingsHr) && settings){
                    settings->put_AreDefaultContextMenusEnabled(FALSE);
                    settings->put_AreDevToolsEnabled(FALSE);
                    settings->put_IsStatusBarEnabled(FALSE);
                    settings->put_IsZoomControlEnabled(FALSE);
                    WriteLog("WebView2 browser chrome/context menus/devtools disabled");
                }
                WriteLog("Registering WebView2 microphone permission handler");
                const HRESULT permissionHr=g_webview->add_PermissionRequested(Callback<ICoreWebView2PermissionRequestedEventHandler>([](ICoreWebView2*,ICoreWebView2PermissionRequestedEventArgs* args)->HRESULT{
                    COREWEBVIEW2_PERMISSION_KIND kind{};
                    if(SUCCEEDED(args->get_PermissionKind(&kind))&&kind==COREWEBVIEW2_PERMISSION_KIND_MICROPHONE){
                        args->put_State(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
                    }
                    return S_OK;
                }).Get(),nullptr);
                WriteLog("WebView2 microphone permission handler registered. HRESULT="+std::to_string((long)permissionHr));
            }
            WriteLog("Making WebView2 controller visible");
            const HRESULT visibleHr=c->put_IsVisible(TRUE);
            WriteLog("WebView2 controller visibility set. HRESULT="+std::to_string((long)visibleHr));
            ResizeWebView();
            WriteLog("WebView2 controller resized");
            WriteLog("Registering WebView2 message handler");
            const HRESULT messageHr=g_webview->add_WebMessageReceived(Callback<ICoreWebView2WebMessageReceivedEventHandler>([](ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs* args)->HRESULT{
                LPWSTR raw=nullptr;if(FAILED(args->get_WebMessageAsJson(&raw)))return S_OK;
                try{
                    json j=json::parse(Utf8(raw));CoTaskMemFree(raw);raw=nullptr;
                    std::string type=j.value("type","");
                    if(type=="startup_diagnostic"||type=="runtime_diagnostic"){
                        const std::string message=j.value("message","Unknown diagnostic error");
                        const std::string details=j.value("details","");
                        const bool fatal=j.value("fatal",false);
                        WriteLog(std::string(type=="startup_diagnostic"?"STARTUP_ERROR: ":"RUNTIME_ERROR: ")+message+(details.empty()?"":" | "+details));
                        if(fatal){
                            std::string combined="Saeed diagnostic error.\n\n"+message;
                            if(!details.empty()) combined+="\n\nDetails: "+details;
                            MessageBoxW(g_hwnd,Wide(combined).c_str(),L"Saeed AI - Diagnostic Error",MB_OK|MB_ICONERROR);
                        }
                    } else if(type=="startup_ready"){
                        WriteLog("STARTUP_READY: WebView2 + WebGL + GLB character loaded. renderer="+j.value("renderer","unknown")+" vendor="+j.value("vendor","unknown"));
                     } else if(type=="check_update"){PostJson({{"type","update_status"},{"text","Checking for updates...","state","checking_update"}});CheckForUpdateAsync();}
                    else if(type=="character_travel"){StartCharacterTravel(j.value("x",0.5),j.value("y",0.5),j.value("duration",5000));}
                    else if(type=="stop_character_travel"){
                        g_walkActive=false;
                        KillTimer(g_hwnd,ID_SAEED_WALK_TIMER);
                    } else if(type=="avatar_context_menu"){ShowAvatarContextMenu();}
                    else if(type=="overlay_state"){g_overlayOpen=j.value("open",false);if(g_overlayOpen)SetTimer(g_hwnd,ID_SAEED_OVERLAY_TIMER,300,nullptr);else KillTimer(g_hwnd,ID_SAEED_OVERLAY_TIMER);}
                    else if(type=="dismiss_overlays"){g_overlayOpen=false;KillTimer(g_hwnd,ID_SAEED_OVERLAY_TIMER);PostJson({{"type","dismiss_overlays"}});}
                    else if(type=="apply_update"){StartUpdateDownload(j.value("url",""),j.value("version",""));}
                     else if(type=="choose_character"){ChooseCharacterFile();}
                    else if(type=="request_settings"){
                        json st=LoadSettings();
                        std::string mode=st.value("voiceMode","always"),language="en-US";
                        if(st.contains("mic")&&st["mic"].is_object()){
                            language=st["mic"].value("language",language);
                            const std::string inputMode=st["mic"].value("inputMode","");
                            if(inputMode=="push")mode="push";
                            else if(inputMode=="vad")mode="smart";
                            else if(inputMode=="always")mode="always";
                        }
                        PostJson({{"type","settings_data"},{"apiKeyConfigured",!st.value("apiKey","").empty()},{"voiceMode",mode},{"language",language}});
                    } else if(type=="native_command"){
                        const std::string command=j.value("command","");
                        if(command=="open_settings")OpenSettingsWindow("general");
                        else if(command=="open_accounts")OpenSettingsWindow("accounts");
                        else if(command=="open_chat")OpenChatWindow();
                        else if(command=="open_controller")OpenSettingsWindow("character");
                        else PostJson({{"type","native_command"},{"command",command}});
                    } else if(type=="restore_default_character"){
                        try{
                            json s=LoadSettings();
                            s.erase("characterPath");
                            SaveSettings(s);
                            PostJson({{"type","character_selected"},{"name","Saeed"},{"path","./saeed_AI-3D.glb"},{"builtin",true}});
                        }catch(const std::exception& e){
                            PostJson({{"type","character_error"},{"text",std::string("Could not restore the default character: ")+e.what()}});
                        }
                    } else if(type=="open_settings_window"){OpenSettingsWindow(j.value("tab","general"));}
                    else if(type=="open_chat_window"){OpenChatWindow();}
                    else if(type=="window_drag"){
                        ReleaseCapture();
                        SendMessageW(g_hwnd,WM_NCLBUTTONDOWN,HTCAPTION,0);
                    } else if(type=="chat"){
                        const std::string text=j.value("text","");
                        if(!text.empty()&&g_chatHwnd)AppendNativeChat(Wide(text),false);
                        if(!TryLocalCommand(text))RunAgent(text);
                    } else if(type=="speech_audio"){
                        const std::string audio=j.value("data","");
                        const std::string mime=j.value("mime","audio/webm");
                        if(audio.empty()) PostJson({{"type","speech_error"},{"message","Empty microphone audio was received."}});
                        else std::thread([audio,mime](){
                            try{
                                PostJson({{"type","speech_status"},{"active",true},{"processing",true}});
                                const std::string text=TranscribeSpeechWebm(audio,mime);
                                if(text.empty()) throw std::runtime_error("Speech transcription returned no text. The microphone captured audio, but no words were recognized.");
                                WriteLog("Speech transcription succeeded; forwarding transcript to Saeed brain.");
                                PostJson({{"type","speech_result"},{"text",text},{"engine","openai-transcription"}});
                                PostJson({{"type","speech_status"},{"active",true},{"processing",false}});
                            }catch(const std::exception& e){
                                WriteLog(std::string("Speech transcription failed: ")+e.what());
                                PostJson({{"type","speech_error"},{"message",std::string("Speech transcription failed: ")+e.what()}});
                            }
                        }).detach();
                    } else if(type=="speech_start"){ StartNativeSpeech(); } else if(type=="speech_stop"){ StopNativeSpeech(); }
                    else if(type=="cancel_agent"){
                        g_agentCancel.store(true);
                        PostJson({{"type","status"},{"text","تم طلب إيقاف المهمة"},{"state","cancelling"}});
                    } else if(type=="confirm"){
                        std::lock_guard<std::mutex> l(g_confirmMutex);
                        const std::string responseId=j.value("id","");
                        if(responseId.empty() || responseId!=g_confirmId) return S_OK;
                        g_confirmValue=j.value("approved",false);
                        g_confirmId="done";
                        PostJson({{"type","status"},{"text",g_confirmValue?"تمت الموافقة، أتابع التنفيذ":"تم رفض العملية"},{"state",g_confirmValue?"approved":"denied"},{"taskId",g_agentTaskId}});
                        g_confirmCv.notify_all();
                    } else if(type=="character_state_response"){
                        std::lock_guard<std::mutex> l(g_characterStateMutex);
                        const std::string responseId=j.value("id","");
                        if(responseId.empty() || responseId!=g_characterStateId) return S_OK;
                        g_characterStateResult=j.value("state",json{{"ok",false},{"error","Invalid character state response"}});
                        g_characterStateId="done";
                        g_characterStateCv.notify_all();
                    } else if(type=="account_list"){
                        auto accounts=LoadArrayFile(LinkedAccountsPath()); if(!accounts.is_array()) accounts=json::array(); PostJson({{"type","account_list"},{"accounts",accounts}});
                    } else if(type=="email_received"){
                        IncrementNotificationCount();
                        ShowNativeNotification(L"Saeed AI",L"New email received");
                    } else if(type=="exit_app"){
                        RemoveTrayIcon(); DestroyWindow(g_hwnd);
                    } else if(type=="account_signout"){
                        SignOutLinkedAccount(j.value("provider",""),j.value("accountId",""));
                    } else if(type=="account_session_save"){
                        try{ SaveLinkedAccountSession(j.value("account",json::object()),j.value("importedData",json::object())); PostJson({{"type","account_session_saved"},{"provider",j.value("account",json::object()).value("provider","")},{"accountId",j.value("account",json::object()).value("accountId","")}}); }
                        catch(const std::exception& e){ PostJson({{"type","error"},{"text",std::string("فشل حفظ جلسة الحساب: ")+e.what()}}); }
                    } else if(type=="account_signout_all"){
                        ClearAllLinkedAccountSessions(); PostJson({{"type","account_signed_out_all"}});
                    } else if(type=="settings"){
                        json s=LoadSettings();s["provider"]=j.value("provider",s.value("provider","openrouter"));s["baseUrl"]=j.value("baseUrl",s.value("baseUrl","https://openrouter.ai/api/v1"));s["model"]=j.value("model",s.value("model","openai/gpt-5.1"));s["maxSteps"]=j.value("maxSteps",12);s["voiceMode"]=j.value("voiceMode",s.value("voiceMode","always"));if(j.contains("apiKey")&&!j["apiKey"].get<std::string>().empty())s["apiKey"]=j["apiKey"];SaveSettings(s);PostJson({{"type","settingsSaved"}});
                    }
                }catch(...){if(raw)CoTaskMemFree(raw);}
                return S_OK;
            }).Get(),nullptr);
            WriteLog("WebView2 message handler registered. HRESULT="+std::to_string((long)messageHr));
            WriteLog("Registering WebView2 navigation handler");
            const HRESULT navigationHandlerHr=g_webview->add_NavigationCompleted(Callback<ICoreWebView2NavigationCompletedEventHandler>([](ICoreWebView2*,ICoreWebView2NavigationCompletedEventArgs*)->HRESULT{
                WriteLog("WebView2 navigation completed; sending character selection and checking updates");
                SendCharacterSelection();
                CheckForUpdateAsync();
                // Ask the page directly for a deterministic module/runtime diagnostic.
            // This runs after NavigationCompleted and therefore distinguishes a native
            // WebView2 problem from a page/module/import problem.
            // NavigationCompleted can fire before an ES module graph finishes evaluating.
            // Do not probe __saeedModulesReady here; avatar.html reports startup_ready only
            // after Three.js, GLTFLoader, WebGL, and the GLB character are initialized.
            WriteLog("WebView2 navigation completed; waiting for page startup_ready");
                return S_OK;
            }).Get(),nullptr);
            WriteLog("WebView2 navigation handler registered. HRESULT="+std::to_string((long)navigationHandlerHr));
            WriteLog("Configuring WebView2 virtual host mapping for local avatar assets");
            ComPtr<ICoreWebView2_3> webview3;
            const HRESULT webview3Hr=g_webview->QueryInterface(IID_PPV_ARGS(&webview3));
            WriteLog("WebView2 ICoreWebView2_3 query result. HRESULT="+std::to_string((long)webview3Hr));
            if(FAILED(webview3Hr)||!webview3){
                const std::string msg="WebView2 virtual host mapping is unavailable. HRESULT="+std::to_string((long)webview3Hr);
                WriteLog(msg);
                MessageBoxW(g_hwnd,Wide("Saeed could not prepare the local 3D asset host.\n\nDiagnostic code: "+std::to_string((long)webview3Hr)).c_str(),L"Saeed AI - Startup Error",MB_OK|MB_ICONERROR);
                return FAILED(webview3Hr)?webview3Hr:E_NOINTERFACE;
            }
            const std::wstring appDir=AppDirectory();
            const HRESULT mapHr=webview3->SetVirtualHostNameToFolderMapping(L"saeed.local",appDir.c_str(),COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);
            WriteLog("WebView2 application virtual host mapping result. HRESULT="+std::to_string((long)mapHr));
            if(FAILED(mapHr))return mapHr;
            const std::wstring characterDir=CharacterDirectory();
            std::error_code characterDirEc;
            std::filesystem::create_directories(characterDir,characterDirEc);
            if(characterDirEc) WriteLog("Character directory creation warning: "+characterDirEc.message());
            const HRESULT characterMapHr=webview3->SetVirtualHostNameToFolderMapping(L"saeed-characters.local",characterDir.c_str(),COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);
            WriteLog("WebView2 character virtual host mapping result. HRESULT="+std::to_string((long)characterMapHr));
            if(FAILED(characterMapHr))return characterMapHr;
            std::wstring url=L"https://saeed.local/assets/avatar.html";
            WriteLog("Navigating WebView2 to avatar.html via virtual host");
            HRESULT nav=g_webview->Navigate(url.c_str());
            WriteLog("WebView2 navigation request returned HRESULT="+std::to_string((long)nav));
            if(FAILED(nav)) WriteLog("Avatar navigation failed: "+std::to_string((long)nav));
            return S_OK;
        }).Get());
        WriteLog("WebView2 controller creation request returned HRESULT="+std::to_string((long)controllerRequestHr));
        return controllerRequestHr;
    }).Get());
}

LRESULT CALLBACK UtilityWndProc(HWND h,UINT msg,WPARAM wp,LPARAM lp){
    switch(msg){
        case WM_CTLCOLORSTATIC:
        case WM_CTLCOLORBTN:{
            HDC dc=reinterpret_cast<HDC>(wp);
            SetBkColor(dc,RGB(238,242,246));
            SetTextColor(dc,RGB(25,35,45));
            return reinterpret_cast<LRESULT>(g_utilityBgBrush);
        }
        case WM_CTLCOLOREDIT:
        case WM_CTLCOLORLISTBOX:{
            HDC dc=reinterpret_cast<HDC>(wp);
            SetBkColor(dc,RGB(255,255,255));
            SetTextColor(dc,RGB(25,35,45));
            return reinterpret_cast<LRESULT>(g_utilityInputBrush);
        }
        case WM_GETMINMAXINFO:{
            auto* m=reinterpret_cast<MINMAXINFO*>(lp);
            if(m){
                m->ptMinTrackSize.x=(h==g_chatHwnd)?620:760;
                m->ptMinTrackSize.y=(h==g_chatHwnd)?560:(h==g_updateHwnd?420:720);
            }
            return 0;
        }
        case WM_SIZE:{
            RECT r{};GetClientRect(h,&r);
            const int w=r.right-r.left, hh=r.bottom-r.top;
            if(h==g_updateHwnd){
                if(g_nativeUpdateTitle)MoveWindow(g_nativeUpdateTitle,28,76,std::max(300,w-56),30,TRUE);
                if(g_nativeUpdateVersion)MoveWindow(g_nativeUpdateVersion,28,112,std::max(300,w-56),24,TRUE);
                if(g_nativeUpdateDate)MoveWindow(g_nativeUpdateDate,28,140,std::max(300,w-56),24,TRUE);
                if(g_nativeUpdateSize)MoveWindow(g_nativeUpdateSize,28,168,std::max(300,w-56),24,TRUE);
                if(g_nativeUpdateProgress)MoveWindow(g_nativeUpdateProgress,28,210,std::max(300,w-56),18,TRUE);
                if(g_nativeUpdateStatus)MoveWindow(g_nativeUpdateStatus,28,246,std::max(300,w-56),44,TRUE);
                HWND now=GetDlgItem(h,ID_NATIVE_UPDATE_NOW),later=GetDlgItem(h,ID_NATIVE_UPDATE_LATER),close=GetDlgItem(h,ID_NATIVE_UPDATE_CLOSE);
                if(now)MoveWindow(now,28,320,130,38,TRUE);
                if(later)MoveWindow(later,170,320,100,38,TRUE);
                if(close)MoveWindow(close,std::max(300,w-140),320,108,38,TRUE);
            }else if(h==g_chatHwnd){
                if(g_nativeChatHistory)MoveWindow(g_nativeChatHistory,18,72,std::max(300,w-36),std::max(180,hh-245),TRUE);
                if(g_nativeChatInput)MoveWindow(g_nativeChatInput,18,std::max(180,hh-165),std::max(220,w-170),72,TRUE);
                HWND send=GetDlgItem(h,ID_NATIVE_CHAT_SEND),cancel=GetDlgItem(h,ID_NATIVE_CHAT_CANCEL);
                if(send)MoveWindow(send,std::max(230,w-140),std::max(180,hh-165),122,34,TRUE);
                if(cancel)MoveWindow(cancel,std::max(230,w-140),std::max(218,hh-127),122,34,TRUE);
                if(g_nativeChatStatus)MoveWindow(g_nativeChatStatus,18,std::max(230,hh-55),std::max(300,w-36),24,TRUE);
            }else if(h==g_settingsHwnd){
                ResizeSettingsWebView();
                // Settings controls follow the native window size instead of fixed HTML coordinates.
                if(g_nativeSettingsBaseUrl)MoveWindow(g_nativeSettingsBaseUrl,190,110,std::max(300,w-214),28,TRUE);
                if(g_nativeSettingsModel)MoveWindow(g_nativeSettingsModel,190,154,std::max(300,w-214),28,TRUE);
                if(g_nativeSettingsKey)MoveWindow(g_nativeSettingsKey,190,198,std::max(300,w-214),28,TRUE);
                HWND email=GetDlgItem(h,ID_NATIVE_SETTINGS_EMAIL);
                if(email)MoveWindow(email,std::max(650,w-150),300,120,34,TRUE);
                HWND apply=GetDlgItem(h,ID_NATIVE_SETTINGS_SAVE),ok=GetDlgItem(h,ID_NATIVE_SETTINGS_OK),cancel=GetDlgItem(h,ID_NATIVE_SETTINGS_CANCEL);
                if(cancel)MoveWindow(cancel,std::max(10,w-305),std::max(10,hh-52),95,36,TRUE);
                if(apply)MoveWindow(apply,std::max(10,w-200),std::max(10,hh-52),95,36,TRUE);
                if(ok)MoveWindow(ok,std::max(10,w-95),std::max(10,hh-52),95,36,TRUE);
                if(g_nativeSettingsUpdateStatus)MoveWindow(g_nativeSettingsUpdateStatus,220,424,std::max(260,w-240),28,TRUE);
            }else if(h && GetWindowLongPtrW(h,GWLP_ID)==UTILITY_UPDATE){
                if(g_nativeUpdateTitle)MoveWindow(g_nativeUpdateTitle,28,76,std::max(300,w-56),30,TRUE);
                if(g_nativeUpdateVersion)MoveWindow(g_nativeUpdateVersion,28,112,std::max(300,w-56),24,TRUE);
                if(g_nativeUpdateDate)MoveWindow(g_nativeUpdateDate,28,140,std::max(300,w-56),24,TRUE);
                if(g_nativeUpdateSize)MoveWindow(g_nativeUpdateSize,28,168,std::max(300,w-56),24,TRUE);
                if(g_nativeUpdateProgress)MoveWindow(g_nativeUpdateProgress,28,210,std::max(300,w-56),18,TRUE);
                if(g_nativeUpdateStatus)MoveWindow(g_nativeUpdateStatus,28,246,std::max(300,w-56),44,TRUE);
                HWND now=GetDlgItem(h,ID_NATIVE_UPDATE_NOW),later=GetDlgItem(h,ID_NATIVE_UPDATE_LATER),close=GetDlgItem(h,ID_NATIVE_UPDATE_CLOSE);
                if(now)MoveWindow(now,28,std::max(300,hh-60),130,38,TRUE);
                if(later)MoveWindow(later,170,std::max(300,hh-60),100,38,TRUE);
                if(close)MoveWindow(close,std::max(300,w-136),std::max(300,hh-60),108,38,TRUE);
            }
            return 0;
        }
        case WM_COMMAND:{
            const int id=LOWORD(wp);
            if(h==g_settingsHwnd && id==ID_NATIVE_SETTINGS_PROVIDER && HIWORD(wp)==CBN_SELCHANGE){
                ApplyProviderPreset(h);
                return 0;
            }
            if(h==g_updateHwnd && id==ID_NATIVE_UPDATE_NOW){
                if(!g_pendingUpdateUrl.empty()) StartUpdateDownload(g_pendingUpdateUrl,g_pendingUpdateVersion);
                return 0;
            }
            if(h==g_updateHwnd && (id==ID_NATIVE_UPDATE_LATER || id==ID_NATIVE_UPDATE_CLOSE)){ DestroyWindow(h); return 0; }
            if(h==g_chatHwnd && id==ID_NATIVE_CHAT_SEND){
                const std::wstring wtext=NativeGetText(g_nativeChatInput);
                const std::string text=Utf8(wtext);
                if(!text.empty()){
                    AppendNativeChat(wtext,false);
                    NativeSetText(g_nativeChatInput,L"");
                    if(g_nativeChatStatus)NativeSetText(g_nativeChatStatus,L"Saeed is working...");
                    if(!TryLocalCommand(text))RunAgent(text);
                }
                return 0;
            }
            if(h==g_chatHwnd && id==ID_NATIVE_CHAT_CANCEL){
                g_agentCancel.store(true);
                if(g_nativeChatStatus)NativeSetText(g_nativeChatStatus,L"Cancellation requested.");
                PostJson({{"type","status"},{"text","Cancellation requested."},{"state","cancelling"}});
                return 0;
            }
            if(h && GetWindowLongPtrW(h,GWLP_ID)==UTILITY_UPDATE){
                if(id==ID_NATIVE_UPDATE_NOW){ if(!g_pendingUpdateUrl.empty()) StartUpdateDownload(g_pendingUpdateUrl,g_pendingUpdateVersion); return 0; }
                if(id==ID_NATIVE_UPDATE_LATER){DestroyWindow(h);return 0;}
                if(id==ID_NATIVE_UPDATE_CLOSE){DestroyWindow(h);return 0;}
            }
            if(h==g_updateHwnd){
                if(id==ID_NATIVE_UPDATE_NOW){
                    if(g_pendingUpdateUrl.empty()){ CheckForUpdateAsync(); return 0; }
                    StartUpdateDownload(g_pendingUpdateUrl,g_pendingUpdateVersion);
                    return 0;
                }
                if(id==ID_NATIVE_UPDATE_LATER || id==ID_NATIVE_UPDATE_CLOSE){ DestroyWindow(h); return 0; }
            }
            if(h==g_settingsHwnd && (id==ID_NATIVE_SETTINGS_BACK || id==ID_NATIVE_SETTINGS_CANCEL || id==ID_NATIVE_SETTINGS_OK)){ DestroyWindow(h); return 0; }
            if(h==g_performanceHwnd && (id==ID_NATIVE_SETTINGS_CANCEL || id==ID_NATIVE_SETTINGS_OK)){ DestroyWindow(h); return 0; }
            break;
        }
        case WM_KEYDOWN:
            if(wp==VK_ESCAPE){DestroyWindow(h);return 0;}
            break;
        case WM_CLOSE:
            DestroyWindow(h);return 0;
        case WM_DESTROY:
            if(h==g_settingsHwnd){
                if(g_settingsController)g_settingsController->Close();
                g_settingsWebView.Reset();g_settingsController.Reset();
                g_settingsHwnd=nullptr;
                g_nativeSettingsProvider=nullptr;g_nativeSettingsBaseUrl=nullptr;
                g_nativeSettingsModel=nullptr;g_nativeSettingsKey=nullptr;g_nativeSettingsVoice=nullptr;g_nativeSettingsUpdateStatus=nullptr;
            }
            if(h==g_updateHwnd){g_updateHwnd=nullptr;}
            if(h==g_chatHwnd){g_chatHwnd=nullptr;g_nativeChatHistory=nullptr;g_nativeChatInput=nullptr;g_nativeChatStatus=nullptr;}
            if(h && GetWindowLongPtrW(h,GWLP_ID)==UTILITY_UPDATE){
                g_nativeUpdateTitle=nullptr;g_nativeUpdateVersion=nullptr;g_nativeUpdateDate=nullptr;g_nativeUpdateSize=nullptr;g_nativeUpdateStatus=nullptr;g_nativeUpdateProgress=nullptr;
            }
            return 0;
    }
    return DefWindowProcW(h,msg,wp,lp);
}

LRESULT CALLBACK WndProc(HWND h,UINT msg,WPARAM wp,LPARAM lp){
    if(g_taskbarButtonCreated && msg==g_taskbarButtonCreated){ InitializeTaskbarIntegration(); return 0; }
    if(msg==WM_CONTEXTMENU){
        POINT p{GET_X_LPARAM(lp),GET_Y_LPARAM(lp)};
        RECT wr{};GetWindowRect(h,&wr);
        if(!PtInRect(&wr,p)){ShowTaskbarContextMenu(p);return 0;}
    }
    if(msg==WM_APP+50){ OpenUpdateWindow(); CheckForUpdateAsync(); return 0; }
    if(msg==WM_APP+51){ OpenSettingsWindow("general"); return 0; }
    if(msg==WM_SAEED_APPLY_SIZE){ ApplySaeedSizePreset(static_cast<int>(wp)); return 0; }
    if(msg==WM_SAEED_OPEN_CHAT){ OpenChatWindow(); return 0; }
        if(msg==WM_QUERYENDSESSION){
        // Allow Windows logoff/shutdown/restart to proceed; the app will
        // receive WM_ENDSESSION and clean up its native resources.
        return TRUE;
    }
    if(msg==WM_ENDSESSION){
        if(wp){
            g_shuttingDown=true;
            RemoveTrayIcon();
            UnregisterSaeedHotkey();
        }
        return 0;
    }

    if(msg==g_taskbarButtonCreated){ InitializeTaskbarIntegration(); return 0; }
    if(msg==WM_SYSCOMMAND){
        const UINT cmd=static_cast<UINT>(wp)&0xFFF0u;
        if(cmd==ID_TRAY_UPDATE){ SetTaskbarNotificationCount(0); OpenUpdateWindow(); CheckForUpdateAsync(); return 0; }
        if(cmd==ID_TRAY_SETTINGS){ OpenSettingsWindow("general"); return 0; }
        if(cmd==ID_TRAY_CHARACTER){ ChooseCharacterFile(); return 0; }
    }
    if(msg==WM_SAEED_INIT_TRAY){
        AddTrayIcon();
        RegisterSaeedHotkey();
        return 0;
    }
    if(msg==WM_HOTKEY && wp==ID_SAEED_HOTKEY){
        ToggleSaeedVisibility();
        return 0;
    }
    if(msg==WM_SAEED_TRAY){
        if(lp==WM_LBUTTONDBLCLK){
            ShowWindow(h,SW_SHOWNOACTIVATE);
            SetWindowPos(h,HWND_TOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
        }else if(lp==WM_RBUTTONUP){
            ShowTrayMenu();
        }
        return 0;
    }

    switch(msg){
        case WM_SAEED_SPEECH: HandleNativeSpeechEvent(); return 0;
        case WM_APP+1:{
            auto* p=reinterpret_cast<std::wstring*>(lp);
            if(p){
                try{HandleNativeUtilityMessage(json::parse(Utf8(*p)));}catch(...){}
                if(g_webview)g_webview->PostWebMessageAsJson(p->c_str());
                delete p;
            }
            return 0;
        }
        case WM_GETMINMAXINFO:{
            auto* m=reinterpret_cast<MINMAXINFO*>(lp);
            if(m){
                // Keep the desktop companion within a sensible native window range.
                m->ptMinTrackSize.x=300;
                m->ptMinTrackSize.y=420;
                m->ptMaxTrackSize.x=520;
                m->ptMaxTrackSize.y=820;
            }
            return 0;
        }
        case WM_ERASEBKGND:return 1;
        case WM_NCHITTEST:return HTCLIENT;
        case WM_MOUSEACTIVATE:return MA_NOACTIVATE;
        case WM_DISPLAYCHANGE:
            KeepOnCurrentWorkArea();ResizeWebView();return 0;
        case WM_DPICHANGED:
            ApplyDpiSuggestedRect(lp);KeepOnCurrentWorkArea();ResizeWebView();return 0;
        case WM_SETTINGCHANGE:
            KeepOnCurrentWorkArea();ResizeWebView();return 0;
        case WM_SIZE:ResizeWebView();return 0;
        case WM_TIMER:
            if(wp==ID_SAEED_OVERLAY_TIMER && g_overlayOpen){
                HWND fg=GetForegroundWindow();
                if(fg && fg!=h){g_overlayOpen=false;KillTimer(h,ID_SAEED_OVERLAY_TIMER);PostJson({{"type","dismiss_overlays"}});}
                return 0;
            }
            if(wp==ID_SAEED_EYE_TIMER){
                POINT p{};
                if(GetCursorPos(&p)){
                    RECT r{}; GetWindowRect(h,&r);
                    const double cx=(static_cast<double>(r.left)+r.right)*0.5;
                    const double cy=(static_cast<double>(r.top)+r.bottom)*0.5;
                    const double hw=std::max(1.0,static_cast<double>(r.right-r.left)*0.5);
                    const double hh=std::max(1.0,static_cast<double>(r.bottom-r.top)*0.5);
                    const double ez=std::clamp((p.x-cx)/hw*15.0,-15.0,15.0);
                    const double ex=std::clamp(-(p.y-cy)/hh*15.0,-15.0,15.0);
                    PostJson({{"type","mouse_eye_target"},{"x",ex},{"z",ez}});
                }
                return 0;
            }
            if(wp==ID_SAEED_WALK_TIMER && g_walkActive){
                const ULONGLONG elapsed=GetTickCount64()-g_walkStart;
                const double t=g_walkDuration?std::min(1.0,static_cast<double>(elapsed)/static_cast<double>(g_walkDuration)):1.0;
                const double e=t*t*t*(t*(t*6.0-15.0)+10.0); // quintic smootherstep: smooth acceleration and deceleration
                const int x=static_cast<int>(std::lround(g_walkFrom.x+(g_walkTo.x-g_walkFrom.x)*e));
                const int y=static_cast<int>(std::lround(g_walkFrom.y+(g_walkTo.y-g_walkFrom.y)*e));
                SetWindowPos(h,HWND_TOPMOST,x,y,0,0,SWP_NOSIZE|SWP_NOACTIVATE);
                if(t>=1.0){g_walkActive=false;KillTimer(h,ID_SAEED_WALK_TIMER);}
            }
            return 0;
        case WM_CLOSE:
            // Closing Saeed must terminate the process, not merely hide the
            // companion window. The tray remains only while the process lives.
            DestroyWindow(h);
            return 0;
        case WM_DESTROY:
            StopNativeSpeech();
            if(g_settingsHwnd&&IsWindow(g_settingsHwnd))DestroyWindow(g_settingsHwnd);
            if(g_updateHwnd&&IsWindow(g_updateHwnd))DestroyWindow(g_updateHwnd);
            if(g_performanceHwnd&&IsWindow(g_performanceHwnd))DestroyWindow(g_performanceHwnd);
            if(g_chatHwnd&&IsWindow(g_chatHwnd))DestroyWindow(g_chatHwnd);
            if(g_updateHwnd&&IsWindow(g_updateHwnd))DestroyWindow(g_updateHwnd);
            g_shuttingDown=true;
            UnregisterSaeedHotkey();
            KillTimer(g_hwnd,ID_SAEED_EYE_TIMER);
            RemoveTrayIcon();
            if(g_taskbarOverlayIcon){DestroyIcon(g_taskbarOverlayIcon);g_taskbarOverlayIcon=nullptr;}
            g_taskbarList.Reset();
            if(g_nativeUiFont){DeleteObject(g_nativeUiFont);g_nativeUiFont=nullptr;}
            if(g_nativeUiBrush){DeleteObject(g_nativeUiBrush);g_nativeUiBrush=nullptr;}
            if(g_utilityBgBrush){DeleteObject(g_utilityBgBrush);g_utilityBgBrush=nullptr;}
            if(g_utilityInputBrush){DeleteObject(g_utilityInputBrush);g_utilityInputBrush=nullptr;}
            g_webview.Reset();
            g_controller.Reset();
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(h,msg,wp,lp);
}
}
void RestoreLastVisibility(){
    // Keep startup behavior predictable: a fresh launch always shows Saeed.
    // Visibility can then be toggled through the tray or global hotkey.
    ShowWindow(g_hwnd,SW_SHOWNOACTIVATE);
    SetWindowPos(g_hwnd,HWND_TOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
}

int APIENTRY wWinMain(HINSTANCE inst,HINSTANCE,LPWSTR,int){
    NONCLIENTMETRICSW ncm{sizeof(ncm)};
    if(SystemParametersInfoW(SPI_GETNONCLIENTMETRICS,sizeof(ncm),&ncm,0)) g_nativeUiFont=CreateFontIndirectW(&ncm.lfMessageFont);
    // WebView2 environment creation requires COM on the UI thread.
    // Without explicit COM initialization, CreateCoreWebView2EnvironmentWithOptions
    // can fail with CO_E_NOTINITIALIZED (0x800401F0) even when WebView2 is installed.
    const HRESULT comHr=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
    if(FAILED(comHr) && comHr!=RPC_E_CHANGED_MODE){
        WriteLog("COM initialization failed before WebView2 startup. HRESULT="+std::to_string((long)comHr));
        return 3;
    }
    const bool comInitialized=SUCCEEDED(comHr);
    SetUnhandledExceptionFilter(SaeedUnhandledException);
    bool taskbarUpdateRequested=false, taskbarSettingsRequested=false, taskbarPerformanceRequested=false, taskbarChatRequested=false;
    int taskbarSizeRequested=-1;
    int argc=0; LPWSTR* argv=CommandLineToArgvW(GetCommandLineW(),&argc);
    if(argv){
        for(int i=1;i<argc;i++){
            if(std::wstring(argv[i])==L"--saeed-taskbar-update"){ taskbarUpdateRequested=true; continue; }
            if(std::wstring(argv[i])==L"--saeed-taskbar-settings"){ taskbarSettingsRequested=true; continue; }
            if(std::wstring(argv[i])==L"--saeed-taskbar-performance"){ taskbarPerformanceRequested=true; continue; }
            if(std::wstring(argv[i])==L"--saeed-taskbar-chat"){ taskbarChatRequested=true; continue; }
            if(std::wstring(argv[i])==L"--saeed-taskbar-size-small"){ taskbarSizeRequested=0; continue; }
            if(std::wstring(argv[i])==L"--saeed-taskbar-size-medium"){ taskbarSizeRequested=1; continue; }
            if(std::wstring(argv[i])==L"--saeed-taskbar-size-large"){ taskbarSizeRequested=2; continue; }
            if(std::wstring(argv[i])==L"--saeed-apply-update" && i+2<argc){
                std::wstring installer=argv[i+1];
                DWORD parentPid=0;try{parentPid=std::stoul(argv[i+2]);}catch(...){}
                ApplyUpdateHelper(installer,parentPid);
                LocalFree(argv);
                return 0;
            }
        }
    }
    if(argv){
        for(int i=1;i<argc;i++){
            if(std::wstring(argv[i])==L"--saeed-elevated-op" && i+1<argc) RunElevatedOperationEntry(argv[i+1]);
        }
        LocalFree(argv);
    }
    // Prevent accidental duplicate Saeed instances. If one is already running,
    // bring its avatar window to the foreground and exit this launch.
    HANDLE singleInstance=CreateMutexW(nullptr,TRUE,L"Local\\SaeedAI.SingleInstance");
    if(!singleInstance)return 1;
    if(GetLastError()==ERROR_ALREADY_EXISTS){
        HWND existing=FindWindowW(L"SaeedNativeWindow",L"Saeed AI");
        if(existing){
            if(taskbarUpdateRequested) PostMessageW(existing,WM_APP+50,0,0);
            if(taskbarSettingsRequested) PostMessageW(existing,WM_APP+51,0,0);
            if(taskbarChatRequested) PostMessageW(existing,WM_SAEED_OPEN_CHAT,0,0);
            if(taskbarSizeRequested>=0) PostMessageW(existing,WM_SAEED_APPLY_SIZE,static_cast<WPARAM>(taskbarSizeRequested),0);
            ShowWindow(existing,SW_SHOWNOACTIVATE);
            SetWindowPos(existing,HWND_TOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
            SetForegroundWindow(existing);
        }
        CloseHandle(singleInstance);
        return 0;
    }
    SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE);
    g_taskbarButtonCreated=RegisterWindowMessageW(L"TaskbarButtonCreated");
    const wchar_t* cn=L"SaeedNativeWindow";WNDCLASSEXW wc{sizeof(wc)};wc.hInstance=inst;wc.lpfnWndProc=WndProc;wc.lpszClassName=cn;wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);
    wc.hIcon=LoadIconW(inst,MAKEINTRESOURCEW(IDI_SAEED_ICON));
    wc.hIconSm=LoadIconW(inst,MAKEINTRESOURCEW(IDI_SAEED_ICON));
    if(!RegisterClassExW(&wc))return 1;
    // Give the avatar enough vertical space for the complete body while keeping it compact.
    // The WebView2 camera performs final model-fit calculations from the actual GLB bounds.
    g_hwnd=CreateWindowExW(WS_EX_APPWINDOW|WS_EX_NOACTIVATE|WS_EX_TOPMOST,cn,L"Saeed AI",WS_POPUP,100,100,440,700,nullptr,nullptr,inst,nullptr);
    if(!g_hwnd)return 2;
    if(HMENU sys=GetSystemMenu(g_hwnd,FALSE)){
        AppendMenuW(sys,MF_SEPARATOR,0,nullptr);
        AppendMenuW(sys,MF_STRING,ID_TRAY_UPDATE,L"Update");
        AppendMenuW(sys,MF_STRING,ID_TRAY_SETTINGS,L"Settings");
        AppendMenuW(sys,MF_STRING,ID_TRAY_CHARACTER,L"Change Character");
    }
    // WebView2 owns the transparent rendering surface. Do not make the host
    // HWND a layered window: that combination can suppress WebView2 GPU
    // composition and produce the historical "shadow only" symptom.
    // The controller itself is configured with a fully transparent background.
    RestoreLastVisibility();
    if(taskbarSizeRequested>=0)ApplySaeedSizePreset(taskbarSizeRequested);
    UpdateWindow(g_hwnd);
    // Do not touch the Windows notification-area shell synchronously during
    // startup. On headless/CI desktops Shell_NotifyIcon can block for many
    // seconds and prevent WebView2 UI-thread callbacks from being processed.
    // The tray is initialized once the message loop is running.
    WriteLog("Saeed C++ starting");
    WriteLog("Saeed native window created");
    try{
        json st=LoadSettings();
        g_notificationCount.store(std::clamp(st.value("notificationCount",0),0,99));
    }catch(...){g_notificationCount.store(0);}
    // Saeed is designed to start with Windows. The registry entry is repaired
    // on every launch so reinstall/upgrade cannot accidentally disable startup.
    SetStartupEnabled(true);
    KeepOnCurrentWorkArea();
    WriteLog("Saeed work area positioned");
    InitializeWebView();
    WriteLog("Saeed WebView2 initialization requested");
    // The renderer owns the continuous microphone capture. Native SAPI is not started
    // here because opening the same default input device would race the WebView2 listener.
    WriteLog("Continuous renderer microphone listener will initialize after WebView2 permission.");
    if(taskbarUpdateRequested){ OpenUpdateWindow(); CheckForUpdateAsync(); }
    if(taskbarSettingsRequested){ OpenSettingsWindow("general"); }
    if(taskbarChatRequested){ OpenChatWindow(); }
    PostMessageW(g_hwnd,WM_SAEED_INIT_TRAY,0,0);
    SetTimer(g_hwnd,ID_SAEED_EYE_TIMER,33,nullptr);
    MSG msg{};while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}
    CloseHandle(singleInstance);
    if(comInitialized) CoUninitialize();
    return (int)msg.wParam;}
