const APP_ALIASES={
notepad:"notepad.exe",calculator:"calc.exe",calc:"calc.exe",paint:"mspaint.exe",
explorer:"explorer.exe","file explorer":"explorer.exe","task manager":"taskmgr.exe",
"control panel":"control.exe",settings:"ms-settings:",cmd:"cmd.exe","command prompt":"cmd.exe",
powershell:"powershell.exe",terminal:"wt.exe",edge:"msedge.exe",chrome:"chrome.exe",
firefox:"firefox.exe",word:"winword.exe",excel:"excel.exe",outlook:"outlook.exe",
"visual studio code":"code.exe",vscode:"code.exe",spotify:"spotify.exe"
};
const WEBSITE_ALIASES={
google:"https://www.google.com",youtube:"https://www.youtube.com",facebook:"https://www.facebook.com",
github:"https://github.com",gmail:"https://mail.google.com",outlook:"https://outlook.live.com",
whatsapp:"https://web.whatsapp.com",chatgpt:"https://chatgpt.com"
};
class LocalBrain{
constructor(registry,onEvent){this.registry=registry;this.onEvent=typeof onEvent==="function"?onEvent:()=>{}}
async call(name,args,answer){const actionText=name==="open_url"?"Okay, I’ll open that.":name==="open_application"?"Okay, I’ll open it.":name==="web_search"?"Okay, I’ll look that up.":"Okay, I’ll do that.";this.onEvent({type:"speech-status",text:actionText});const out=await this.registry.call(name,args);return out?.ok===false?"I could not complete that: "+out.error:answer(out)}
cleanTarget(s){return String(s||"").trim().replace(/[.?!؟،]+$/,"").replace(/^(my|the|this)\s+/i,"").trim()}
async handle(text){
const t=String(text||"").trim(),l=t.toLowerCase();if(!t)return null;
if(/(?:what(?:'s| is)\s+)?(?:the\s+)?(?:time|current time)|what time is it|كم الساعة|الساعة كم|الوقت الآن/i.test(l))
return "The local time is "+new Date().toLocaleTimeString()+" on "+new Date().toLocaleDateString()+".";
if(/(?:today'?s date|what date is it|what day is it|تاريخ اليوم|ما هو تاريخ اليوم)/i.test(l))
return "Today is "+new Date().toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"})+".";
if(/^(who are you|what can you do|من انت|ماذا تستطيع)/i.test(l))
return "I am Saeed, your local Windows computer agent. Offline I can work with applications, websites, folders, system information, windows, processes, disks, network, screenshots, tasks and memory.";
const open=t.match(/^(?:please\s+)?(?:open|launch|start|show|run|go to|visit|افتح|شغل|تشغيل|اذهب إلى)\s+(.+)$/i);
if(open){
const target=this.cleanTarget(open[1]),key=target.toLowerCase();
if(WEBSITE_ALIASES[key])return this.call("open_url",{url:WEBSITE_ALIASES[key]},()=> "Opened "+target+".");
if(APP_ALIASES[key])return this.call("open_application",{application:APP_ALIASES[key]},()=> "Opened "+target+".");
if(/^(this pc|my computer|computer|file explorer|جهاز الكمبيوتر|الكمبيوتر|مستكشف الملفات)$/i.test(target))
return this.call("open_application",{application:"explorer.exe"},()=> "Opened File Explorer.");
return this.call("open_application",{application:target},()=> "Opened "+target+".");
}
if(/(?:documents folder|open documents|my documents|افتح المستندات)/i.test(l))
return this.call("open_application",{application:require("path").join(process.env.USERPROFILE||".","Documents")},()=> "Opened Documents.");
if(/(?:downloads folder|open downloads|my downloads|افتح التنزيلات)/i.test(l))
return this.call("open_application",{application:require("path").join(process.env.USERPROFILE||".","Downloads")},()=> "Opened Downloads.");
if(/(?:show|list|browse|what(?:'s| is) in).*(?:files|folder|directory|مجلد|ملفات)/i.test(l)){
const m=t.match(/(?:in|of|at)\s+(.+)$/i),dir=m?.[1]?.trim()||process.env.USERPROFILE||".";
return this.call("list_directory",{directory:dir},o=> "I found "+(o.files?.length||0)+" items in "+dir+".");
}
if(/(?:computer info|system info|pc info|system information|specifications|specs|معلومات الجهاز|مواصفات الجهاز)/i.test(l))
return this.call("system_info",{},o=> "Windows system: "+o.arch+", "+o.cpu+" CPU threads, "+(o.totalMemory/1073741824).toFixed(1)+" GB RAM.");
if(/(?:diagnose|diagnostic|health check|check my computer|computer problem|why is my computer slow|slow computer|تشخيص|فحص الجهاز|الجهاز بطيء|افحص الكمبيوتر)/i.test(l))
return this.call("diagnose_computer",{},o=> "Computer check completed. CPU load: "+(o.diagnostics?.cpuLoad??"unknown")+"%.");
if(/(?:disk|storage|free space|drive space|hard drive|مساحة القرص|مساحة التخزين|الهارد)/i.test(l))
return this.call("disk_info",{},o=> "I found "+(o.drives?.length||0)+" local drives.");
if(/(?:network|internet connection|ip address|wifi|ethernet|الشبكة|الانترنت|عنوان ip|الواي فاي)/i.test(l))
return this.call("network_info",{},o=> "Network inspection found "+(o.adapters?.length||0)+" adapter entries.");
if(/(?:running processes|processes|what is running|cpu usage|programs running|البرامج التي تعمل|العمليات|استهلاك المعالج)/i.test(l))
return this.call("process_list",{},o=> "There are "+(o.processes?.length||0)+" process entries.");
if(/(?:active window|current window|what window|focused window|النافذة الحالية|ما هي النافذة)/i.test(l))
return this.call("active_window",{},o=> "The active window is "+(o.window?.title||"unknown")+".");
if(/(?:list windows|open windows|windows open|visible windows|النوافذ المفتوحة)/i.test(l))
return this.call("list_windows",{},o=> "I found "+(Array.isArray(o.windows)?o.windows.length:0)+" visible windows.");
if(/(?:screenshot|screen shot|capture my screen|take a screenshot|صورة للشاشة|لقطة شاشة|التقط الشاشة)/i.test(l))
return this.call("screenshot",{},()=> "I captured the current screen.");
if(/(?:remember|save this|don't forget|تذكر|احفظ|لا تنس)/i.test(l))
return this.call("remember",{fact:t.replace(/^(remember|save this|don't forget|تذكر|احفظ|لا تنس)\s*/i,"")},()=> "I saved that to local memory.");
if(/(?:recall|what did i tell you|تذكر ماذا قلت|ماذا قلت لك)/i.test(l))
return this.call("recall",{query:t},o=> "I found "+(o.matches?.length||0)+" matching memories.");
if(/(?:my tasks|list tasks|show tasks|what are my tasks|مهامي|قائمة المهام)/i.test(l))
return this.call("list_tasks",{},o=> "You have "+(o.tasks?.length||0)+" saved tasks.");
const add=t.match(/^(?:add|create|make)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i);
if(add)return this.call("add_task",{title:add[1]},()=> "Task added: "+add[1]+".");
return null;
}}
module.exports={LocalBrain};
