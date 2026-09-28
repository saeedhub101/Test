const os=require("os"),fs=require("fs"),path=require("path"),{Computer}=require("./computer"),{Memory}=require("./memory");
const {shell}=require("electron");

class ToolRegistry{
 constructor({captureScreen,userDataPath}){this.computer=new Computer();this.captureScreen=captureScreen;this.userDataPath=userDataPath||process.cwd();this.memory=new Memory();this.taskFile=path.join(this.userDataPath,"tasks.json");this.tasks=this.loadTasks();this.permissions={};this.confirm=null;this.requestIntent=false;this.requestText=""}
 setPermissions(p){const input=p&&typeof p==="object"?p:{};const keys=["fileWrite","screenCapture","screenInspection","mouseControl","keyboardControl","taskDelete","applicationControl","network","memoryWrite"];this.permissions={};for(const key of keys){const value=input[key];this.permissions[key]=value==="allow"||value==="deny"||value==="ask"?value:"allow"}}
 setRequestIntent(enabled,text=""){this.requestIntent=Boolean(enabled);this.requestText=String(text||"")}
 permission(name){return this.permissions[name]||"allow"}
 async authorize(name,args){const patterns={screenCapture:/(screen|screenshot|screen shot|capture|visual|شاشة|سكرين|لقطة|صورة)/i,screenInspection:/(screen|screenshot|window|active window|visible|شاشة|سكرين|نافذة)/i,mouseControl:/(mouse|click|cursor|move the mouse|ماوس|فأرة|انقر|حرك الماوس)/i,keyboardControl:/(keyboard|type|press|key|write|كيبورد|لوحة المفاتيح|اكتب|اضغط)/i,applicationControl:/(open|close|launch|start|focus|application|app|settings|برنامج|تطبيق|افتح|أغلق|اغلق|شغل|إعدادات)/i};const mode=this.permission(name);if(mode==="deny")return false;if(mode==="allow")return true;if(mode==="ask"){if(patterns[name]&&!this.requestIntent)return false;if(patterns[name]&&this.requestText&&!patterns[name].test(this.requestText))return false;return this.confirm?this.confirm({name,args}):false}return false}
 loadTasks(){try{return JSON.parse(fs.readFileSync(this.taskFile,"utf8"))}catch{return[]}}
 saveTasks(){fs.mkdirSync(this.userDataPath,{recursive:true});fs.writeFileSync(this.taskFile,JSON.stringify(this.tasks,null,2),"utf8")}
 schemas(){return[
 {type:"function",function:{name:"system_info",description:"Inspect CPU, memory, Windows version, architecture and uptime.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"diagnose_computer",description:"Run a combined Windows health check: OS, CPU load, memory, disks, and top processes. Use this first for broad 'why is my computer slow/problem' requests.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"active_window",description:"Inspect the currently focused Windows window and process id.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"list_windows",description:"List visible Windows application windows.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"focus_window",description:"Focus a visible Windows application by process id.",parameters:{type:"object",properties:{pid:{type:"integer"}},required:["pid"]}}},
 {type:"function",function:{name:"process_list",description:"Inspect running Windows processes and resource usage.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"disk_info",description:"Inspect Windows drive capacity and free space.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"network_info",description:"Inspect active Windows network adapters and IP addresses.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"list_directory",description:"List a directory.",parameters:{type:"object",properties:{directory:{type:"string"}},required:["directory"]}}},
 {type:"function",function:{name:"read_file",description:"Read a UTF-8 text file.",parameters:{type:"object",properties:{filePath:{type:"string"}},required:["filePath"]}}},
 {type:"function",function:{name:"write_file",description:"Write or replace a UTF-8 text file. Use only when the user requested a file change.",parameters:{type:"object",properties:{filePath:{type:"string"},content:{type:"string"}},required:["filePath","content"]}}},
 {type:"function",function:{name:"add_task",description:"Persist a task.",parameters:{type:"object",properties:{title:{type:"string"}},required:["title"]}}},
 {type:"function",function:{name:"list_tasks",description:"List saved tasks.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"complete_task",description:"Complete a task.",parameters:{type:"object",properties:{id:{type:"string"}},required:["id"]}}},
 {type:"function",function:{name:"remove_task",description:"Remove a saved task by id.",parameters:{type:"object",properties:{id:{type:"string"}},required:["id"]}}},
 {type:"function",function:{name:"open_application",description:"Open a Windows application requested by the user.",parameters:{type:"object",properties:{application:{type:"string"}},required:["application"]}}},
 {type:"function",function:{name:"reveal_file",description:"Open File Explorer and reveal a local file.",parameters:{type:"object",properties:{filePath:{type:"string"}},required:["filePath"]}}},
 {type:"function",function:{name:"open_url",description:"Open an HTTP/HTTPS URL.",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"]}}},
 {type:"function",function:{name:"web_search",description:"Search the web for current information.",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}},
 {type:"function",function:{name:"screenshot",description:"Capture the current screen for visual inspection.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"mouse_move",description:"Move the mouse to screen coordinates.",parameters:{type:"object",properties:{x:{type:"number"},y:{type:"number"}},required:["x","y"]}}},
 {type:"function",function:{name:"mouse_click",description:"Click at screen coordinates for a requested action.",parameters:{type:"object",properties:{x:{type:"number"},y:{type:"number"},button:{type:"string",enum:["left","right"]}},required:["x","y"]}}},
 {type:"function",function:{name:"type_text",description:"Type text into the currently focused application.",parameters:{type:"object",properties:{text:{type:"string"}},required:["text"]}}},
 {type:"function",function:{name:"key_press",description:"Press Windows keyboard keys. Examples: ENTER, ESC, CTRL+C, CTRL+V, ALT+F4.",parameters:{type:"object",properties:{key:{type:"string"}},required:["key"]}}},
 {type:"function",function:{name:"remember",description:"Remember a fact explicitly requested by the user.",parameters:{type:"object",properties:{fact:{type:"string"}},required:["fact"]}}},
 {type:"function",function:{name:"recall",description:"Search persistent memory.",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}}
 ]}
 async call(n,a){try{
  if(n==="system_info")return{ok:true,platform:process.platform,release:os.release(),arch:process.arch,cpu:os.cpus().length,totalMemory:os.totalmem(),freeMemory:os.freemem(),uptime:os.uptime()};
  if(n==="diagnose_computer")return this.computer.diagnose();
  if(n==="active_window"){if(!(await this.authorize("screenInspection",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return this.computer.activeWindow();}
  if(n==="list_windows"){if(!(await this.authorize("screenInspection",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return this.computer.listWindows();}
  if(n==="focus_window"){if(!(await this.authorize("applicationControl",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return this.computer.focusWindow(a.pid);}
  if(n==="process_list")return this.computer.processes();
  if(n==="disk_info"){const r=await this.computer.powershell("Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select DeviceID,Size,FreeSpace | ConvertTo-Json -Compress");try{return{ok:true,drives:JSON.parse(r.stdout)}}catch{return{ok:true,drives:[]}}}
  if(n==="network_info"){const r=await this.computer.powershell("Get-NetIPConfiguration | Select InterfaceAlias,IPv4Address,IPv6Address,DNSServer | ConvertTo-Json -Compress");try{return{ok:true,adapters:JSON.parse(r.stdout)}}catch{return{ok:true,adapters:[]}}}
  if(n==="list_directory")return{ok:true,files:fs.readdirSync(path.resolve(a.directory||"."),{withFileTypes:true}).map(x=>({name:x.name,directory:x.isDirectory()}))};
  if(n==="read_file")return{ok:true,content:fs.readFileSync(path.resolve(a.filePath),"utf8").slice(0,200000)};
  if(n==="write_file"){if(!(await this.authorize("fileWrite",a)))return{ok:false,error:"Permission denied by Saeed Settings."};const p=path.resolve(a.filePath);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,String(a.content),"utf8");return{ok:true,path:p,bytes:Buffer.byteLength(String(a.content))}};
  if(n==="add_task"){const t={id:Date.now().toString(),title:String(a.title),done:false,created:new Date().toISOString()};this.tasks.push(t);this.saveTasks();return{ok:true,task:t}};
  if(n==="list_tasks")return{ok:true,tasks:this.tasks};
  if(n==="complete_task"){const t=this.tasks.find(x=>x.id===a.id);if(!t)return{ok:false,error:"Task not found"};t.done=true;t.completed=new Date().toISOString();this.saveTasks();return{ok:true,task:t}};
  if(n==="remove_task"){if(!(await this.authorize("taskDelete",a)))return{ok:false,error:"Permission denied by Saeed Settings."};const before=this.tasks.length;this.tasks=this.tasks.filter(x=>x.id!==a.id);this.saveTasks();return{ok:this.tasks.length!==before}};
  if(n==="open_application"){if(!(await this.authorize("applicationControl",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return this.computer.openApp(a.application)}
  if(n==="reveal_file"){const p=path.resolve(a.filePath);if(!fs.existsSync(p))return{ok:false,error:"File not found"};shell.showItemInFolder(p);return{ok:true,path:p}}
  if(n==="open_url"){if(!(await this.authorize("network",a)))return{ok:false,error:"Permission denied by Saeed Settings."};if(!/^https?:\/\//i.test(a.url))return{ok:false,error:"Only HTTP/HTTPS URLs are allowed"};await require("electron").shell.openExternal(a.url);return{ok:true,url:a.url}};
  if(n==="web_search"){if(!(await this.authorize("network",a)))return{ok:false,error:"Permission denied by Saeed Settings."};const q=encodeURIComponent(a.query);const r=await fetch("https://html.duckduckgo.com/html/?q="+q,{headers:{"User-Agent":"SaeedAI/1.0"}});const html=await r.text();const out=[...html.matchAll(/result__a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].slice(0,8).map(m=>({url:m[1],title:m[2].replace(/<[^>]+>/g,"")}));return{ok:true,results:out}};
  if(n==="screenshot"){if(!(await this.authorize("screenCapture",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return{ok:true,image:await this.captureScreen()};}
  if(n==="mouse_move"){if(!(await this.authorize("mouseControl",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return this.computer.mouseMove(a.x,a.y);}
  if(n==="mouse_click"){if(!(await this.authorize("mouseControl",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return this.computer.mouseClick(a.x,a.y,a.button||"left");}
  if(n==="type_text"){if(!(await this.authorize("keyboardControl",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return this.computer.typeText(a.text);}
  if(n==="key_press"){if(!(await this.authorize("keyboardControl",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return this.computer.keyPress(a.key);}
  if(n==="remember"){if(!(await this.authorize("memoryWrite",a)))return{ok:false,error:"Permission denied by Saeed Settings."};return{ok:true,saved:this.memory.add(a.fact)}}
  if(n==="recall")return{ok:true,matches:this.memory.search(a.query)};
  return{ok:false,error:"Unknown tool"};
 }catch(e){return{ok:false,error:e.message}}}
}
module.exports={ToolRegistry};