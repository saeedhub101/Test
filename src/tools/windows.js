const os=require("os");
function schemas(){return[
 {type:"function",function:{name:"system_info",description:"Inspect CPU, memory, Windows version, architecture and uptime.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"diagnose_computer",description:"Run a combined Windows health check for OS, CPU, memory, disks and processes.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"active_window",description:"Inspect the currently focused Windows window and process.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"list_windows",description:"List visible Windows application windows.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"focus_window",description:"Focus a visible Windows application by process id.",parameters:{type:"object",properties:{pid:{type:"integer"}},required:["pid"]}}},
 {type:"function",function:{name:"process_list",description:"Inspect running Windows processes and resource usage.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"disk_info",description:"Inspect Windows drive capacity and free space.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"network_info",description:"Inspect active Windows network adapters and IP addresses.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"open_application",description:"Open a Windows application. Use a specific file tool for opening a document/file.",parameters:{type:"object",properties:{application:{type:"string"}},required:["application"]}}}
]}
async function call(name,a,c){
 if(name==="system_info")return{ok:true,platform:process.platform,release:os.release(),arch:process.arch,cpu:os.cpus().length,totalMemory:os.totalmem(),freeMemory:os.freemem(),uptime:os.uptime()};
 if(name==="diagnose_computer")return c.computer.diagnose();
 if(name==="active_window")return c.computer.activeWindow();
 if(name==="list_windows")return c.computer.listWindows();
 if(name==="focus_window")return c.computer.focusWindow(a.pid);
 if(name==="process_list")return c.computer.processes();
 if(name==="disk_info"){const r=await c.computer.powershell('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select DeviceID,Size,FreeSpace | ConvertTo-Json -Compress');try{return{ok:true,drives:JSON.parse(r.stdout)}}catch{return{ok:true,drives:[]}}}
 if(name==="network_info"){const r=await c.computer.powershell('Get-NetIPConfiguration | Select InterfaceAlias,IPv4Address,IPv6Address,DNSServer | ConvertTo-Json -Compress');try{return{ok:true,adapters:JSON.parse(r.stdout)}}catch{return{ok:true,adapters:[]}}}
 if(name==="open_application")return c.computer.openApp(a.application);
 return null;
}
module.exports={schemas,call};