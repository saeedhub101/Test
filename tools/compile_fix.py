from pathlib import Path
import re
p=Path('src/main.cpp')
s=p.read_text(encoding='utf-8')
# SAPI helper is not exposed by the installed SDK headers used by the build. Keep the reliable default SAPI input path.
s=s.replace('''    ISpObjectToken* audioInputToken=nullptr;\n    hr=SpGetDefaultTokenFromCategoryId(SPCAT_AUDIOIN,&audioInputToken,nullptr);\n    WriteLog("SAPI default audio input token HRESULT="+std::to_string((long)hr));\n    if(SUCCEEDED(hr)&&audioInputToken){\n        hr=g_speechRecognizer->SetInput(audioInputToken,TRUE);\n        audioInputToken->Release();\n    }else{\n        hr=g_speechRecognizer->SetInput(nullptr,TRUE);\n    }\n    WriteLog("SAPI SetInput HRESULT="+std::to_string((long)hr));''',
'''    hr=g_speechRecognizer->SetInput(nullptr,TRUE);\n    WriteLog("SAPI SetInput HRESULT="+std::to_string((long)hr));''')
# Native EDIT controls already receive light backgrounds through WM_CTLCOLOREDIT; EM_SETBKGNDCOLOR is not an EDIT control message.
s=re.sub(r'\s*SendMessageW\(g_nativeChatHistory,EM_SETBKGNDCOLOR,0,RGB\(247,247,247\)\);\s*SendMessageW\(g_nativeChatInput,EM_SETBKGNDCOLOR,0,RGB\(255,255,255\)\);','',s)
p.write_text(s,encoding='utf-8')
print('compile fixes applied')
