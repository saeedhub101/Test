#include "agent_core2.hpp"
#include <cstdlib>
#include <filesystem>

namespace {
struct AgentCoreBootstrap {
    AgentCoreBootstrap() {
#ifdef _WIN32
        wchar_t* p=nullptr; size_t n=0;
        if(_wdupenv_s(&p,&n,L"APPDATA")==0 && p){
            std::filesystem::path root=std::filesystem::path(p)/L"Saeed"/L"agent-core";
            delete[] p;
            SaeedAgentCore2 core(root);
            core.journal("system","initialized","Agent Core 2.0 initialized.");
        }
#endif
    }
};
AgentCoreBootstrap g_agentCoreBootstrap;
}
