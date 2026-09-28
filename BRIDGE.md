# Saeed Settings WebView2 Bridge

## JS → C++
Use window.chrome.webview.postMessage({ type, ...payload }).

Types: ready; settingChanged {path,value}; saveSettings {settings}; testApiConnection {provider,model,baseUrl}; resetSection {tab}; resetAll; exportSettings; importSettings; openLogsFolder; checkUpdates; recordHotkey.

## C++ → JS
Use webview->PostWebMessageAsJson(...).

Types: loadSettings {settings}; apiTestResult {ok,message}; hotkeyRecorded {combo}; importResult {ok,settings}.

## API-key rule
The clear API key is never persisted in JS. C++ encrypts it and JS receives only a masked value such as sk-****abcd.

## Lifecycle
1. C++ creates the separate Settings Win32 window and its own WebView2 controller.
2. The controller loads packaged assets/settings.html only.
3. JS sends ready; C++ replies loadSettings.
4. Every setting change is debounced 200 ms and persisted by C++.

## C++ checklist
- Create a second WebView2 controller parented to the Settings HWND.
- Resize it on WM_SIZE.
- Navigate only to local packaged settings.html.
- Handle ready/loadSettings.
- Handle settingChanged and persist.
- Encrypt API key; return masked value.
- Handle testApiConnection and return apiTestResult.
- Handle resetSection/resetAll.
- Handle export/import JSON.
- Handle openLogsFolder/checkUpdates.
- Handle recordHotkey and return hotkeyRecorded.
