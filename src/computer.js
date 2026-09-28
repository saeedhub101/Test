const {execFile}=require("child_process"),{promisify}=require("util"),run=promisify(execFile),{clipboard}=require("electron");

class Computer{
 async powershell(command){
  const r=await run("powershell.exe",["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-Command",String(command)],{windowsHide:true,maxBuffer:8*1024*1024});
  return {ok:true,stdout:r.stdout,stderr:r.stderr};
 }
 esc(s){return String(s).replace(/'/g,"''");}
 async openApp(app){return this.powershell("$p='"+this.esc(app)+"';Start-Process -FilePath $p");}
 async mouseMove(x,y){
  const X=Math.round(Number(x)),Y=Math.round(Number(y));if(!Number.isFinite(X)||!Number.isFinite(Y))return{ok:false,error:"Invalid coordinates"};
  const code='using System;using System.Runtime.InteropServices;public static class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int X,int Y);}';
  return this.powershell("$sig='"+code+"';Add-Type $sig;[M]::SetCursorPos("+X+","+Y+")");
 }
 async mouseClick(x,y,button="left"){
  const X=Math.round(Number(x)),Y=Math.round(Number(y));if(!Number.isFinite(X)||!Number.isFinite(Y))return{ok:false,error:"Invalid coordinates"};
  const down=button==="right"?"0x0008":"0x0002",up=button==="right"?"0x0010":"0x0004";
  const code='using System;using System.Runtime.InteropServices;public static class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int X,int Y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint dx,uint dy,uint data,UIntPtr e);}';
  return this.powershell("$sig='"+code+"';Add-Type $sig;[M]::SetCursorPos("+X+","+Y+");[M]::mouse_event("+down+",0,0,0,[UIntPtr]::Zero);[M]::mouse_event("+up+",0,0,0,[UIntPtr]::Zero)");
 }
 async typeText(text){
  const value=String(text),previous=clipboard.readText();
  try{
   clipboard.writeText(value);
   const r=await this.powershell('$ws=New-Object -ComObject WScript.Shell;$ws.SendKeys("^v")');
   return r;
  }finally{
   try{clipboard.writeText(previous)}catch{}
  }
 }
 async keyPress(key){
  const k=String(key).replace(/"/g,"").toUpperCase();
  const map={ENTER:"{ENTER}",ESC:"{ESC}",ESCAPE:"{ESC}",TAB:"{TAB}",BACKSPACE:"{BACKSPACE}",DELETE:"{DELETE}",DEL:"{DELETE}",SPACE:" ",UP:"{UP}",DOWN:"{DOWN}",LEFT:"{LEFT}",RIGHT:"{RIGHT}",HOME:"{HOME}",END:"{END}",PGUP:"{PGUP}",PGDN:"{PGDN}",CTRL:"^",ALT:"%",SHIFT:"+",WIN:"^{ESC}",F1:"{F1}",F2:"{F2}",F3:"{F3}",F4:"{F4}",F5:"{F5}",F6:"{F6}",F7:"{F7}",F8:"{F8}",F9:"{F9}",F10:"{F10}",F11:"{F11}",F12:"{F12}"};
  const seq=k.split("+").map(x=>map[x]||x).join("");
  return this.powershell('$ws=New-Object -ComObject WScript.Shell;$ws.SendKeys("'+seq.replace(/"/g,'""')+'")');
 }
 async activeWindow(){
  const ps='Add-Type @\'using System;using System.Text;using System.Runtime.InteropServices;public static class W{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}\'@;$h=[W]::GetForegroundWindow();$s=New-Object Text.StringBuilder 1024;[W]::GetWindowText($h,$s,1024)|Out-Null;$p=0;[W]::GetWindowThreadProcessId($h,[ref]$p)|Out-Null;[pscustomobject]@{title=$s.ToString();pid=$p}|ConvertTo-Json -Compress';
  const r=await this.powershell(ps);try{return{ok:true,window:JSON.parse(r.stdout)}}catch{return{ok:true,window:{raw:r.stdout}}}
 }
 async listWindows(){
  const r=await this.powershell('Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object Id,ProcessName,MainWindowTitle,MainWindowHandle | ConvertTo-Json -Compress');
  try{return{ok:true,windows:JSON.parse(r.stdout)}}catch{return{ok:true,windows:[]}}
 }
 async focusWindow(pid){
  const p=Math.round(Number(pid));if(!Number.isFinite(p))return{ok:false,error:"Invalid pid"};
  return this.powershell('$p=Get-Process -Id '+p+' -ErrorAction Stop;Add-Type -AssemblyName Microsoft.VisualBasic;[Microsoft.VisualBasic.Interaction]::AppActivate($p.Id)');
 }
 async processes(){
  const r=await this.powershell('Get-Process | Sort-Object CPU -Descending | Select-Object -First 100 Id,ProcessName,CPU,WorkingSet,Responding | ConvertTo-Json -Compress');
  try{return{ok:true,processes:JSON.parse(r.stdout)}}catch{return{ok:true,processes:[]}}
 }
 async diagnose(){
  const result={ok:true,timestamp:new Date().toISOString()};
  try{
   const info=await this.powershell('$os=Get-CimInstance Win32_OperatingSystem;$cpu=Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average;$disks=Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select DeviceID,Size,FreeSpace;$top=Get-Process | Sort-Object CPU -Descending | Select-Object -First 12 Id,ProcessName,CPU,WorkingSet,Responding;[pscustomobject]@{os=$os.Caption;version=$os.Version;lastBoot=$os.LastBootUpTime;cpuLoad=[math]::Round($cpu.Average,1);memoryTotal=$os.TotalVisibleMemorySize*1KB;memoryFree=$os.FreePhysicalMemory*1KB;disks=$disks;topProcesses=$top} | ConvertTo-Json -Depth 5 -Compress');
   return {ok:true,diagnostics:JSON.parse(info.stdout)};
  }catch(e){return{ok:false,error:e.message}};
 }
}
module.exports={Computer};
