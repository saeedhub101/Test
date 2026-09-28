#pragma once
#include <nlohmann/json.hpp>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>
#include <mutex>
#include <chrono>
#include <algorithm>
#include <cctype>

using SaeedJson = nlohmann::json;

class SaeedAgentCore2 {
public:
    struct Step { std::string id; std::string goal; std::string state="pending"; int attempts=0; };
    struct Plan { std::string goal; std::vector<Step> steps; int revision=0; };

    explicit SaeedAgentCore2(std::filesystem::path root): root_(std::move(root)) {
        std::error_code ec; std::filesystem::create_directories(root_,ec);
        load();
    }

    Plan makePlan(const std::string& goal) {
        Plan p; p.goal=goal;
        std::string s=goal, token;
        auto flush=[&](){ if(token.empty()) return; Step st; st.id="step-"+std::to_string(p.steps.size()+1); st.goal=token; p.steps.push_back(st); token.clear(); };
        for(char ch:s){
            if(ch=='.'||ch=='\n'||ch==';'){flush();continue;}
            token.push_back(ch);
            if(token.size()>420){flush();}
        }
        flush();
        if(p.steps.empty()) p.steps.push_back({"step-1",goal,"pending",0});
        p.revision=++planRevision_;
        return p;
    }

    void savePlan(const Plan& p) {
        SaeedJson j={{"goal",p.goal},{"revision",p.revision},{"steps",SaeedJson::array()}};
        for(const auto& s:p.steps) j["steps"].push_back({{"id",s.id},{"goal",s.goal},{"state",s.state},{"attempts",s.attempts}});
        write("current_plan.json",j);
    }

    void journal(const std::string& task,const std::string& state,const std::string& message,const std::string& tool="") {
        std::lock_guard<std::mutex> lock(mu_);
        SaeedJson a=read("execution_journal.json",SaeedJson::array());
        if(!a.is_array()) a=SaeedJson::array();
        a.push_back({{"time",now()},{"taskId",task},{"state",state},{"message",message},{"tool",tool}});
        while(a.size()>1000) a.erase(a.begin());
        write("execution_journal.json",a);
    }

    bool permissionRequired(const std::string& tool) const {
        static const std::vector<std::string> high={"delete","remove","format","shutdown","restart","send_email","purchase","payment","credential","password","account"};
        std::string x=tool; std::transform(x.begin(),x.end(),x.begin(),[](unsigned char c){return (char)std::tolower(c);});
        return std::any_of(high.begin(),high.end(),[&](const auto& k){return x.find(k)!=std::string::npos;});
    }

    bool shouldRetry(const std::string& key,int attempts) const {
        return attempts<3 && !key.empty();
    }

    std::string routeModel(const std::string& task) const {
        std::string x=task; std::transform(x.begin(),x.end(),x.begin(),[](unsigned char c){return (char)std::tolower(c);});
        if(x.find("image")!=std::string::npos||x.find("screen")!=std::string::npos||x.find("screenshot")!=std::string::npos) return "vision";
        if(x.find("code")!=std::string::npos||x.find("program")!=std::string::npos||x.find("github")!=std::string::npos) return "coding";
        return "general";
    }

    void setGoal(const std::string& goal,const std::string& state="active") {
        SaeedJson goals=read("goals.json",SaeedJson::array());
        if(!goals.is_array()) goals=SaeedJson::array();
        goals.push_back({{"id","goal-"+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count())},{"goal",goal},{"state",state},{"updatedAt",now()}});
        while(goals.size()>200) goals.erase(goals.begin());
        write("goals.json",goals);
    }

    void addSchedule(const SaeedJson& item) {
        SaeedJson a=read("scheduler.json",SaeedJson::array());
        if(!a.is_array()) a=SaeedJson::array(); a.push_back(item); write("scheduler.json",a);
    }

    bool evaluateSmoke() const {
        std::error_code ec;
        return std::filesystem::exists(root_,ec);
    }

    void load() {
        auto c=read("context.json",SaeedJson::object());
        if(!c.is_object()) c=SaeedJson::object();
        c["agentCore"]="2.0"; c["loadedAt"]=now(); write("context.json",c);
    }

private:
    std::filesystem::path root_;
    mutable std::mutex mu_;
    int planRevision_=0;
    std::string now() const { return std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count()); }
    SaeedJson read(const char* name,const SaeedJson& fallback) const {
        try { std::ifstream f(root_/name); if(!f) return fallback; SaeedJson j; f>>j; return j; } catch(...) { return fallback; }
    }
    void write(const char* name,const SaeedJson& j) const {
        try { std::ofstream f(root_/name,std::ios::trunc); f<<j.dump(2); } catch(...) {}
    }
};
