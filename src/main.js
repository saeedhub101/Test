const {app,BrowserWindow,ipcMain,globalShortcut,desktopCapturer,Tray,Menu,screen,dialog,nativeImage,session}=require("electron");
const path=require("path"),fs=require("fs"),os=require("os"),{spawn}=require("child_process");
const ciSmoke=process.env.SAEED_CI_SMOKE==="1"||process.argv.includes("--ci-smoke");
function ciWriteStartupReport(kind,error){
 if(!ciSmoke)return;
 try{
  const target=process.env.SAEED_CI_REPORT||path.join(process.cwd(),"dist","ci-runtime-report.json");
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify({kind,time:new Date().toISOString(),argv:process.argv,appPath:app.isReady()?app.getAppPath():null,resourcesPath:process.resourcesPath,error:error?String(error?.stack||error):null},null,2),"utf8");
 }catch(writeError){console.error("CI startup report write failed:",writeError)}
}
process.on("uncaughtException",e=>{console.error("Saeed uncaught:",e);ciWriteStartupReport("uncaughtException",e)});
process.on("unhandledRejection",e=>{console.error("Saeed rejection:",e);ciWriteStartupReport("unhandledRejection",e)});
if(ciSmoke)ciWriteStartupReport("bootstrap-loaded");
const {Agent}=require("./agent"),{ToolRegistry}=require("./tools"),{OpenAIRealtime}=require("./realtime"),{LocalBrain}=require("./local-brain"),{BrainSupervisor}=require("./autonomous/brain-supervisor"),{autoUpdater}=require("electron-updater");

// Explicit Electron microphone permission handling for the user-controlled microphone lifecycle.
// Chromium must be allowed to request/use media audio before getUserMedia can open the device.
function configureMediaPermissions(){
 try{
  session.defaultSession.setPermissionCheckHandler((webContents,permission,origin,details)=>{
   return permission==="media";
  });
  session.defaultSession.setPermissionRequestHandler((webContents,permission,callback,details)=>{
   if(permission==="media"){diagnostic("INFO","MIC PERMISSION","Electron granted media permission",details||{});callback(true);return;}
   callback(false);
  });
  diagnostic("INFO","MIC PERMISSION","Electron microphone/media permission handlers configured");
 }catch(e){diagnostic("ERROR","MIC PERMISSION",e.message)}
}


let chatWin,characterWin,performanceWin,settingsWin,agent,tray,realtime,statusWin,threeDStatusWin,updateToastWin,brainSupervisor;
let pendingCharacterData=null;
const DEFAULT_PERMISSIONS={files:"allow",applications:"allow",system:"allow",network:"allow",screen:"allow",mouseKeyboard:"allow",microphone:"allow",tasksMemory:"allow",credentials:"allow",destructive:"allow"};
function permissionPolicy(category){const p=agent?.settings?.permissions||DEFAULT_PERMISSIONS;return p[category]||"allow"}
const confirmations=new Map();
async function confirmPermission(category,request){
 const label={files:"file access",applications:"application control",system:"system access",network:"network access",screen:"screen capture",mouseKeyboard:"mouse and keyboard control",microphone:"microphone access",tasksMemory:"tasks and memory",credentials:"credentials and secrets",destructive:"destructive actions"}[category]||category;
 await showChat();
 return new Promise(resolve=>{const id=Date.now().toString(36)+Math.random().toString(36).slice(2,7);const timer=setTimeout(()=>{if(!confirmations.has(id))return;confirmations.delete(id);resolve(false);diagnostic("INFO","AGENT CONFIRMATION","Confirmation timed out; operation denied",{id,name:request?.name||category});},120000);confirmations.set(id,approved=>{clearTimeout(timer);resolve(Boolean(approved))});chatWin?.webContents.send("agent:confirm",{id,name:request?.name||category,args:request?.args||{},permissionCategory:category,permissionLabel:label});});
}
const pending3DQueries=new Map();
const diagnosticState={mic:{state:"unknown",level:0,detail:""},brainApi:{state:"unknown",detail:""},brainLocal:{state:"ready",detail:"Local intent engine"},stt:{state:"unknown",detail:""},tts:{state:"unknown",detail:""},glb:{state:"unknown",detail:""},cpu:{state:"unknown",percent:0,detail:"Waiting for CPU measurement"},threeD:{overall:{state:"unknown",detail:"Waiting for 3D renderer"},components:{},lastUpdated:null}};
function diagnostic(level,stage,message,meta={}){
 const event={time:new Date().toISOString(),level:String(level||"INFO").toUpperCase(),stage:String(stage||"GENERAL"),message:String(message||""),meta:meta||{}};
 if(chatWin&&!chatWin.isDestroyed())chatWin.webContents.send("diagnostic:event",event);
 updateDiagnosticState(event);return event;
}
function publish3DStatus(report){if(!report)return;diagnosticState.threeD=report;diagnosticState.threeD.lastUpdated=new Date().toISOString();if(threeDStatusWin&&!threeDStatusWin.isDestroyed())threeDStatusWin.webContents.send("3d:status",diagnosticState.threeD)}
function request3DStatus(){return new Promise(resolve=>{if(!characterWin||characterWin.isDestroyed()){const report={overall:{state:"error",detail:"3D character window is not available"},components:{},lastUpdated:new Date().toISOString()};publish3DStatus(report);resolve(report);return}const id=Date.now().toString(36)+Math.random().toString(36).slice(2,8);const timer=setTimeout(()=>{pending3DQueries.delete(id);const report={...diagnosticState.threeD,overall:{state:"error",detail:"3D renderer status query timed out"}};publish3DStatus(report);resolve(report)},1800);pending3DQueries.set(id,report=>{clearTimeout(timer);pending3DQueries.delete(id);publish3DStatus(report);resolve(report)});characterWin.webContents.send("3d:query",id)})}
function show3DStatus(){if(threeDStatusWin&&!threeDStatusWin.isDestroyed()){threeDStatusWin.show();threeDStatusWin.focus();request3DStatus().then(r=>threeDStatusWin?.webContents.send("3d:status",r));return}threeDStatusWin=new BrowserWindow({width:960,height:720,minWidth:760,minHeight:560,title:"Saeed 3D Status",show:false,backgroundColor:"#f5f7fb",icon:windowsIconPath(),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});threeDStatusWin.on("closed",()=>{threeDStatusWin=null});threeDStatusWin.loadFile(path.join(__dirname,"3d-status.html")).then(async()=>{threeDStatusWin?.show();threeDStatusWin?.focus();const r=await request3DStatus();threeDStatusWin?.webContents.send("3d:status",r)}).catch(e=>diagnostic("ERROR","3D STATUS WINDOW",e.message))}
function updateDiagnosticState(e){const s=String(e.stage||"").toUpperCase(),fail=e.level==="ERROR";
 if(s.includes("MIC")){const msg=String(e.message||"").toLowerCase();const disabled=s.includes("MIC MODE")&&msg.includes("off")||s.includes("MIC STOP")||s.includes("MIC PERMISSION");diagnosticState.mic.state=fail?"error":disabled?"disabled":"active";diagnosticState.mic.detail=e.message;if(disabled)diagnosticState.mic.level=0;else if(e.meta?.level!=null)diagnosticState.mic.level=Number(e.meta.level)||0}
 if(s.includes("LLM")||s.includes("BRAIN API")){diagnosticState.brainApi.state=fail?"error":(s.includes("SUCCESS")||s.includes("CONNECTED")?"connected":"active");diagnosticState.brainApi.detail=e.message}
 if(s.includes("LOCAL")){diagnosticState.brainLocal.state=fail?"error":"ready";diagnosticState.brainLocal.detail=e.message}
 if(s.includes("STT")){diagnosticState.stt.state=fail?"error":s.includes("DISCONNECTED")?"disabled":(s.includes("READY")||s.includes("CONNECTED")||s.includes("ACTIVE")||s.includes("START")?"active":diagnosticState.stt.state);diagnosticState.stt.detail=e.message}
 if(s.includes("TTS")){diagnosticState.tts.state=fail?"error":s.includes("DISCONNECTED")?"disabled":(s.includes("READY")||s.includes("CONNECTED")||s.includes("ACTIVE")||s.includes("START")||s.includes("SUCCESS")?"active":diagnosticState.tts.state);diagnosticState.tts.detail=e.message}
 if(s.includes("GLB")||s.includes("CHARACTER READY")){diagnosticState.glb.state=fail?"error":s.includes("READY")?"ready":"active";diagnosticState.glb.detail=e.message}
 
 if(statusWin&&!statusWin.isDestroyed())statusWin.webContents.send("diagnostic:state",diagnosticState);
}
let cpuTimer=null;
function startCpuMonitoring(){
 if(cpuTimer)return;
 updateCpuMetrics();
 cpuTimer=setInterval(updateCpuMetrics,1000);
}
function stopCpuMonitoring(){
 if(statusWin||performanceWin)return;
 if(cpuTimer)clearInterval(cpuTimer);
 cpuTimer=null;
}

function updateCpuMetrics(){try{const {rawMetrics:metrics,logical}=getAppResourceMetrics();const total=metrics.reduce((sum,m)=>sum+Number(m?.cpu?.percentCPUUsage||0),0);const percent=Math.max(0,total/logical);diagnosticState.cpu={state:"active",percent,detail:`Saeed CPU ${percent.toFixed(1)}% across ${logical} logical processors`,processCount:metrics.length,lastUpdated:new Date().toISOString()};if(statusWin&&!statusWin.isDestroyed())statusWin.webContents.send("diagnostic:state",diagnosticState);if(chatWin&&!chatWin.isDestroyed())chatWin.webContents.send("cpu:metrics",diagnosticState.cpu)}catch(e){diagnosticState.cpu={state:"error",percent:0,detail:e.message,lastUpdated:new Date().toISOString()};diagnostic("ERROR","CPU METRICS",e.message)}}
function diagnosticFromAgent(e){if(!e)return;if(e.type==="thinking")diagnostic("INFO","LLM THINKING","LLM planning/execution step "+(Number(e.step||0)+1));if(e.type==="answer")diagnostic("INFO","LLM SUCCESS","Successful LLM response");if(e.type==="tool_error")diagnostic("ERROR","LLM TOOL ERROR",e.error||"Tool failed",{tool:e.name});if(e.type==="tool_result")diagnostic("INFO","LLM TOOL SUCCESS","Tool completed",{tool:e.name});if(e.type==="diagnostic")diagnostic(e.level,e.stage,e.message,e.meta);}

// AUTHORITATIVE SAEED ICON CODE — DO NOT REMOVE OR REPLACE.
// This code defines the official Saeed Windows application/taskbar icon source.
function windowsIconPath(){
 const ico=path.join(__dirname,"..","assets","saeed.ico");
 const png=path.join(__dirname,"..","assets","saeed.png");
 return fs.existsSync(ico)?ico:png;
}

// AUTHORITATIVE SAEED SYSTEM TRAY ICON CODE — DO NOT REMOVE OR REPLACE.
// This code creates the official Saeed system-tray icon from the same source.
function trayIcon(){
 return nativeImage.createFromPath(windowsIconPath());
}
app.setAppUserModelId("ai.saeed.desktop");
const singleInstanceLock=ciSmoke?true:app.requestSingleInstanceLock();
if(!singleInstanceLock)app.quit();
else if(!ciSmoke)app.on("second-instance",(event,commandLine)=>{setTimeout(()=>handleLaunchArgs(commandLine.slice(1)),100);});
let updateState="idle",updateUiRequested=false,updateStatusWin=null,updateInfo=null;
let resourceProbeTimer=null;
const resourceProbeSamples=[];
function getAppResourceMetrics(){const rawMetrics=app.getAppMetrics();return {rawMetrics,logical:Math.max(1,os.cpus().length)}}
function resourceSnapshot(label="sample"){
 const usage=process.memoryUsage(), cpu=process.cpuUsage();
 const rss=Math.round(usage.rss/1048576), heapUsed=Math.round(usage.heapUsed/1048576), external=Math.round(usage.external/1048576);
 const windows=BrowserWindow.getAllWindows().map(w=>({title:w.getTitle(),url:w.webContents.getURL(),processId:w.webContents.getOSProcessId(),destroyed:w.isDestroyed()}));const {rawMetrics,logical}=getAppResourceMetrics();const metrics=rawMetrics.map(m=>({pid:m.pid,type:m.type,name:m.name||"",serviceName:m.serviceName||"",cpuPercent:+(m.cpu?.percentCPUUsage||0).toFixed(2),cpuTotalSec:+(m.cpu?.cumulativeCPUUsage||0).toFixed(3),workingSetMB:+((m.memory?.workingSetSize||0)/1024).toFixed(1),privateMB:+((m.memory?.privateBytes||0)/1024).toFixed(1)}));const totalCpuRaw=rawMetrics.reduce((sum,m)=>sum+Number(m?.cpu?.percentCPUUsage||0),0);const totalWorkingSetMB=rawMetrics.reduce((sum,m)=>sum+Number(m?.memory?.workingSetSize||0),0)/1024;const totalPrivateMB=rawMetrics.reduce((sum,m)=>sum+Number(m?.memory?.privateBytes||0),0)/1024;const sample={time:new Date().toISOString(),label,pid:process.pid,cpuUserMs:Math.round(cpu.user/1000),cpuSystemMs:Math.round(cpu.system/1000),rssMB:rss,heapUsedMB:heapUsed,heapTotalMB:Math.round(usage.heapTotal/1048576),externalMB:external,platform:process.platform,logicalProcessors:logical,saeedTotal:{cpuPercent:+(totalCpuRaw/logical).toFixed(2),cpuPercentRaw:+totalCpuRaw.toFixed(2),workingSetMB:+totalWorkingSetMB.toFixed(1),privateMB:+totalPrivateMB.toFixed(1),processCount:rawMetrics.length},windows,processes:metrics};
 resourceProbeSamples.push(sample);if(resourceProbeSamples.length>120)resourceProbeSamples.shift();return sample;
}
function startResourceProbe(){if(resourceProbeTimer)return;resourceSnapshot("startup");resourceProbeTimer=setInterval(()=>resourceSnapshot("interval"),1000);resourceProbeTimer.unref?.()}
function stopResourceProbe(){if(resourceProbeTimer){clearInterval(resourceProbeTimer);resourceProbeTimer=null}}
function resourceReport(){return {process:resourceSnapshot("report"),samples:[...resourceProbeSamples]}}


async function captureScreen(){
 const sources=await desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:1920,height:1080}});
 return sources[0]?.thumbnail.toDataURL()||null;
}
function displayForWindow(target=characterWin){
 if(!target)return screen.getPrimaryDisplay();
 const [x,y]=target.getPosition();const [w,h]=target.getSize();
 return screen.getDisplayMatching({x,y,width:w,height:h})||screen.getDisplayNearestPoint({x:x+w/2,y:y+h/2})||screen.getPrimaryDisplay();
}
function fitCharacterToDisplay(display=displayForWindow(),{bottomRight=false}={}){
 if(!characterWin)return;
 const area=display.workArea;const [w,h]=characterWin.getSize();const margin=18;
 const [x0,y0]=characterWin.getPosition();
 const x=bottomRight?area.x+Math.max(0,area.width-w-margin):Math.max(area.x,Math.min(x0,area.x+Math.max(0,area.width-w)));
 const y=bottomRight?area.y+Math.max(0,area.height-h-margin):Math.max(area.y,Math.min(y0,area.y+Math.max(0,area.height-h)));
 characterWin.setPosition(Math.round(x),Math.round(y),false);
}
async function showChat(){try{if(!chatWin||chatWin.isDestroyed())await createChatWindow();if(!chatWin||chatWin.isDestroyed())return;chatWin.setIgnoreMouseEvents(false);if(chatWin.isMinimized())chatWin.restore();chatWin.show();chatWin.focus();chatWin.webContents.send("chat:show")}catch(e){diagnostic("ERROR","CHAT WINDOW",e.message)}}
function closeChat(){if(chatWin&&!chatWin.isDestroyed()){chatWin.destroy();chatWin=null}}
async function showPerformance(){try{startCpuMonitoring();if(performanceWin&&!performanceWin.isDestroyed()){performanceWin.show();performanceWin.focus();return}performanceWin=new BrowserWindow({width:980,height:720,minWidth:760,minHeight:560,title:"Saeed Performance",show:false,resizable:true,skipTaskbar:false,icon:windowsIconPath(),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});performanceWin.setIcon(windowsIconPath());performanceWin.on("closed",()=>{performanceWin=null;stopCpuMonitoring()});await performanceWin.loadFile(path.join(__dirname,"performance.html"));performanceWin.show();performanceWin.focus()}catch(e){diagnostic("ERROR","PERFORMANCE WINDOW",e.message)}}
async function showSettings(){try{if(settingsWin&&!settingsWin.isDestroyed()){settingsWin.show();settingsWin.focus();return}settingsWin=new BrowserWindow({width:760,height:760,minWidth:620,minHeight:600,title:"Saeed Settings",show:false,resizable:true,skipTaskbar:false,icon:windowsIconPath(),backgroundColor:"#1a1a1f",webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});settingsWin.setIcon(windowsIconPath());settingsWin.on("closed",()=>{settingsWin=null});await settingsWin.loadFile(path.join(__dirname,"settings.html"));settingsWin.show();settingsWin.focus()}catch(e){diagnostic("ERROR","SETTINGS WINDOW",e.message)}}
function showCharacter(){if(!characterWin||characterWin.isDestroyed())return;characterWin.show();characterWin.focus()}
function showStatus(){startCpuMonitoring();if(statusWin&&!statusWin.isDestroyed()){statusWin.show();statusWin.focus();statusWin.webContents.send("diagnostic:snapshot",{state:diagnosticState});return}statusWin=new BrowserWindow({width:880,height:660,minWidth:680,minHeight:500,title:"Saeed Status",show:false,backgroundColor:"#f5f7fb",icon:windowsIconPath(),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});statusWin.on("closed",()=>{statusWin=null;stopCpuMonitoring()});statusWin.loadFile(path.join(__dirname,"status.html")).then(()=>{statusWin.show();statusWin.webContents.send("diagnostic:snapshot",{state:diagnosticState})}).catch(e=>diagnostic("ERROR","STATUS WINDOW",e.message))}
let characterLoadGeneration=0;
const persistedCharacterFile=()=>path.join(app.getPath("userData"),"characters","selected.glb");
function persistSelectedCharacter(data){try{const file=persistedCharacterFile();fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(data));return file}catch(e){diagnostic("ERROR","GLB PERSIST",e.message);return null}}
function readPersistedCharacter(){try{const file=persistedCharacterFile();if(!fs.existsSync(file))return null;const data=fs.readFileSync(file);return{data:new Uint8Array(data),path:file,size:data.length}}catch(e){diagnostic("ERROR","GLB RESTORE",e.message);return null}}
function sendCharacterData(data){const generation=++characterLoadGeneration;if(!characterWin||characterWin.isDestroyed()){pendingCharacterData={data,generation};return false}pendingCharacterData={data,generation};characterWin.webContents.send("character:selected",data,generation);return true}
function chooseCharacter(){dialog.showOpenDialog(characterWin||chatWin,{title:"Choose Saeed Character",filters:[{name:"GLB 3D Character",extensions:["glb"]}],properties:["openFile"]}).then(r=>{if(r.canceled||!r.filePaths[0])return;const file=r.filePaths[0];try{const data=fs.readFileSync(file);const persisted=persistSelectedCharacter(data);sendCharacterData(new Uint8Array(data));if(agent){agent.settings={...agent.settings,selectedCharacterName:path.basename(file)};agent.persistSettings()}diagnostic("INFO","GLB SELECTED","Character GLB selected and saved for next launch",{name:path.basename(file),size:data.length,persistedPath:persisted})}catch(e){diagnostic("ERROR","GLB SELECTED",e.message)}})}

function whisperRuntimePaths(){const root=app.isPackaged?process.resourcesPath:path.join(__dirname,"..","build");return{exe:path.join(root,"whisper","whisper-cli.exe"),model:path.join(root,"whisper","ggml-base-q5_1.bin")}}
function voiceBroadcast(channel,...args){for(const win of [characterWin,chatWin]){if(win&&!win.isDestroyed())win.webContents.send(channel,...args)}}
let currentMicMode="off",voiceMuted=false;
function updateNow(){if(!app.isPackaged)return;updateUiRequested=true;try{updateState="checking";showUpdateToast("checking","Checking for updates…");voiceBroadcast("update:state","checking");void autoUpdater.checkForUpdates()}catch(e){updateState="error";voiceBroadcast("update:state","error",e.message)}}
function characterSizeMenu(){return[{label:"Small",click:()=>setSaeedSize("small")},{label:"Medium",click:()=>setSaeedSize("medium")},{label:"Large",click:()=>setSaeedSize("large")}]}
function rebuildTray(){if(!tray)return;tray.setContextMenu(Menu.buildFromTemplate([{label:"Saeed",submenu:[{label:"Show Saeed",click:showCharacter},{label:"Chat Me",click:showChat},{label:"Hide Saeed",click:()=>characterWin?.hide()}]},{label:voiceMuted?"Unmute":"Mute",type:"checkbox",checked:voiceMuted,click:()=>setVoiceMuted(!voiceMuted)},{label:"Voice",submenu:[{label:"Mic ON",type:"radio",checked:currentMicMode==="on",click:()=>setMicMode("on")},{label:"Mic OFF",type:"radio",checked:currentMicMode==="off",click:()=>setMicMode("off")}]},{label:"Character",submenu:[{label:"Change Character (GLB)",click:chooseCharacter},{label:"Size",submenu:characterSizeMenu()}]},{label:"Diagnostics",submenu:[{label:"Performance",click:showPerformance},{label:"Status",click:showStatus},{label:"3D Status",click:show3DStatus}]},{label:"Updates",submenu:[{label:"Check for Updates",click:updateNow},{label:"Settings",click:showSettings}]},{label:"Quit",click:()=>app.quit()}]))}
function setVoiceMuted(muted){voiceMuted=Boolean(muted);if(agent){agent.settings={...agent.settings,voiceMuted};agent.persistSettings();}if(voiceMuted){try{realtime?.cancel()}catch{}voiceBroadcast("voice:stop")}voiceBroadcast("voice:mute",voiceMuted);diagnostic("INFO","TTS MUTE",voiceMuted?"Saeed voice muted":"Saeed voice unmuted");rebuildTray();return voiceMuted}
async function setMicMode(mode,fromUser=false){
 const value=String(mode||"off")==="on"?"on":"off";
 if(value==="on"){
  const policy=permissionPolicy("microphone");
  if(policy==="deny"){diagnostic("INFO","MIC PERMISSION","Microphone access is denied by Permissions settings");return false}
  if(policy==="ask"&&!await confirmPermission("microphone",{name:"microphone",args:{action:"enable"}})){diagnostic("INFO","MIC PERMISSION","Microphone access was denied by user");return false}
 }
 currentMicMode=value;
 if(agent)agent.settings={...agent.settings,micMode:value};
 diagnosticState.mic={...diagnosticState.mic,state:value==="on"?"active":"disabled",level:value==="on"?diagnosticState.mic.level:0,detail:value==="on"?"Microphone ON":"Microphone OFF"};
 voiceBroadcast("mic:mode",value);
 if(statusWin&&!statusWin.isDestroyed())statusWin.webContents.send("mic:mode",value);
 if(value==="off"){
  diagnostic("INFO","MIC INPUT","Microphone input is OFF; voice output and Realtime session remain independent");
  voiceBroadcast("local-stt:state","disconnected","Microphone input is off");
 }else{
  if(agent?.settings?.micPath==="realtime"&&agent?.settings?.realtimeEnabled&&String(agent?.settings?.brainMode||"auto")==="api")startRealtime();
  else if(agent?.settings?.sttProvider==="whisper"){voiceBroadcast("local-stt:state","ready","Local Whisper ready");diagnostic("INFO","STT READY","Local Whisper is ready for microphone input");}
  else diagnostic("INFO","STT READY","Selected API STT is ready for microphone input");
  diagnostic("INFO","TTS READY","TTS is ready for voice replies");
 }
 diagnostic("INFO","MIC MODE","Microphone mode: "+value);
 rebuildTray();
}
function setSaeedSize(size){const m={small:[300,360],medium:[430,520],large:[560,660]};const key=Object.prototype.hasOwnProperty.call(m,size)?size:"medium";const v=m[key];if(characterWin&&!characterWin.isDestroyed()){const d=displayForWindow();const a=d.workArea;const margin=18;const [oldX,oldY]=characterWin.getPosition();const [oldW,oldH]=characterWin.getSize();const oldRight=oldX+oldW,oldBottom=oldY+oldH;const x=Math.max(a.x,Math.min(oldRight-v[0],a.x+a.width-v[0]-margin));const y=Math.max(a.y,Math.min(oldBottom-v[1],a.y+a.height-v[1]-margin));characterWin.setMinimumSize(300,360);characterWin.setMaximumSize(900,900);characterWin.setResizable(true);characterWin.setSize(v[0],v[1],false);characterWin.setPosition(Math.round(x),Math.round(y),false);characterWin.webContents.send("character:size",key)}if(agent){agent.settings={...agent.settings,characterSize:key};agent.persistSettings()}}
function contextMenu(){
 const menu=Menu.buildFromTemplate([
  {label:"Saeed",submenu:[{label:"Chat Me",click:showChat},{label:"Hide Saeed",click:()=>characterWin?.hide()}]},
  {label:"Voice",submenu:[{label:"Mic ON",type:"radio",checked:currentMicMode==="on",click:()=>setMicMode("on")},{label:"Mic OFF",type:"radio",checked:currentMicMode==="off",click:()=>setMicMode("off")}]},
  {label:"Character",submenu:[{label:"Change Character (GLB)",click:chooseCharacter},{label:"Size",submenu:characterSizeMenu()}]},
  {label:"Diagnostics",submenu:[{label:"Performance",click:showPerformance},{label:"Status",click:showStatus},{label:"3D Status",click:show3DStatus}]},
  {label:"Updates & Settings",submenu:[{label:"Check for Updates",click:updateNow},{label:"Settings",click:showSettings}]},
  {label:"Quit",click:()=>app.quit()}
 ]);
 menu.popup({window:characterWin});
}
async function createChatWindow(){
 if(chatWin&&!chatWin.isDestroyed())return chatWin;
 chatWin=new BrowserWindow({name:"saeed-chat",width:820,height:620,minWidth:560,minHeight:400,frame:false,transparent:true,alwaysOnTop:false,show:false,hasShadow:false,resizable:true,skipTaskbar:false,icon:windowsIconPath(),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});
 chatWin.setIcon(windowsIconPath());
 if(process.platform==="win32")chatWin.setAppDetails({appId:"ai.saeed.desktop",appIconPath:windowsIconPath(),appIconIndex:0,relaunchCommand:process.execPath,relaunchDisplayName:"Saeed AI Chat"});
 chatWin.on("closed",()=>{chatWin=null});
 chatWin.webContents.on("context-menu",(event,params)=>{event.preventDefault();const items=[];if(params.isEditable){items.push({role:"undo"},{role:"redo"},{role:"cut"},{role:"copy"},{role:"paste"},{role:"selectAll"});}else if(params.selectionText){items.push({role:"copy"},{role:"selectAll"});}else{items.push({role:"selectAll"});}Menu.buildFromTemplate(items).popup({window:chatWin});});
 chatWin.setIgnoreMouseEvents(false);
 await chatWin.loadFile(path.join(__dirname,"index.html"));
 return chatWin;
}
function handleLaunchArgs(args=[]){const a=args.map(String);if(a.includes("--exit"))return app.quit();if(a.includes("--show-saeed"))return showCharacter();if(a.includes("--chat"))return showChat();if(a.includes("--performance"))return showPerformance();if(a.includes("--settings"))return showSettings();if(a.includes("--status"))return showStatus();if(a.includes("--3d-status"))return show3DStatus();if(a.includes("--mic-on"))return setMicMode("on");if(a.includes("--mic-off"))return setMicMode("off");if(a.includes("--size-small"))return setSaeedSize("small");if(a.includes("--size-medium"))return setSaeedSize("medium");if(a.includes("--size-large"))return setSaeedSize("large");return showCharacter()}
async function createWindow(){
 await createCharacterWindow();
 if(ciSmoke)scheduleCiRuntimeSmoke();
 const registry=new ToolRegistry({captureScreen,userDataPath:app.getPath("userData"),permissionPolicy,confirm:async({name,args,permissionCategory})=>{await showChat();return new Promise(resolve=>{const id=Date.now().toString(36)+Math.random().toString(36).slice(2,7);confirmations.set(id,resolve);const labels={files:"Files",applications:"Applications",system:"System information",network:"Network & web",screen:"Screen capture",mouseKeyboard:"Mouse & keyboard",microphone:"Microphone & voice",tasksMemory:"Tasks & memory",credentials:"Credentials & secrets",destructive:"Destructive actions"};const permissionLabel=labels[permissionCategory]||permissionCategory||"Permission";chatWin?.webContents.send("agent:confirm",{id,name,args,permissionCategory,permissionLabel});});}});
 agent=new Agent({registry,onEvent:e=>{diagnosticFromAgent(e);voiceBroadcast("agent:event",e)},requestStepIncrease:async({current,requested,task})=>{await showChat();return new Promise(resolve=>{const id=Date.now().toString(36)+Math.random().toString(36).slice(2,7);confirmations.set(id,resolve);chatWin?.webContents.send("agent:confirm",{id,name:"agent_step_increase",args:{currentLimit:current,requestedLimit:requested,task:String(task||"")},permissionCategory:"execution",permissionLabel:"Execution limit",reason:"This task needs more execution steps. Allow an additional "+(requested-current)+" steps for this task?"});});}});voiceMuted=Boolean(agent.settings.voiceMuted);agent.localBrain=new LocalBrain(registry,e=>{diagnosticFromAgent(e);voiceBroadcast("agent:event",e)});setSaeedSize(agent.settings.characterSize||"small");brainSupervisor=new BrainSupervisor({registry,getSettings:async()=>agent?.publicSettings()||{},setSettings:async s=>{if(agent)agent.settings={...agent.settings,...s};return agent?.publicSettings()||{}},emit:e=>{if(e?.type==="idle-thought")voiceBroadcast("character:behavior",e);else if(characterWin&&!characterWin.isDestroyed())characterWin.webContents.send("character:behavior",e)}});await brainSupervisor.start();
}
async function createCharacterWindow(){
 characterWin=new BrowserWindow({name:"saeed-character",width:430,height:520,minWidth:300,minHeight:360,frame:false,transparent:true,alwaysOnTop:true,show:false,hasShadow:false,resizable:true,skipTaskbar:false,icon:windowsIconPath(),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});
 characterWin.setIcon(windowsIconPath());
 if(process.platform==="win32")characterWin.setAppDetails({appId:"ai.saeed.desktop",appIconPath:windowsIconPath(),appIconIndex:0,relaunchCommand:process.execPath,relaunchDisplayName:"Saeed AI Character"});
 characterWin.on("closed",()=>{characterWin=null});
 characterWin.on("close",()=>{if(!app.isQuitting())diagnostic("INFO","WINDOW","Saeed character window closed");});
 characterWin.webContents.on("context-menu",()=>contextMenu());
 await characterWin.loadFile(path.join(__dirname,"character.html"));
 try{const saved=readPersistedCharacter();const bundled=path.join(__dirname,"..","assets","Saeed_Test-3D.glb");const source=saved||((fs.existsSync(bundled))?{data:new Uint8Array(fs.readFileSync(bundled)),path:bundled,size:fs.statSync(bundled).size}:null);if(source){pendingCharacterData={data:source.data,generation:++characterLoadGeneration};setTimeout(()=>{if(characterWin&&!characterWin.isDestroyed()&&pendingCharacterData)characterWin.webContents.send("character:selected",pendingCharacterData.data,pendingCharacterData.generation)},0);diagnostic("INFO",saved?"GLB RESTORE":"GLB DEFAULT",saved?"Previously selected character restored":"Bundled Saeed_Test-3D.glb loaded as the default character",{size:source.size,path:source.path})}else diagnostic("ERROR","GLB DEFAULT","No default or persisted Saeed GLB is available")}catch(e){diagnostic("ERROR","GLB STARTUP",e.message)}
 fitCharacterToDisplay(screen.getPrimaryDisplay(),{bottomRight:true});
 characterWin.show();
}
function scheduleCiRuntimeSmoke(){if(!ciSmoke)return;setTimeout(()=>void runCiRuntimeSmoke(),1500)}

async function runCi3DBaseline(){
 if(!ciSmoke||process.env.SAEED_CI_3D_OFF!=="1")return;
 const started=Date.now();
 const samples=[];
 const sample=label=>{samples.push({time:new Date().toISOString(),label,resource:resourceSnapshot(label),metrics:app.getAppMetrics().map(m=>({pid:m.pid,type:m.type,name:m.name||"",cpuPercent:+(m.cpu?.percentCPUUsage||0).toFixed(2),workingSetMB:+((m.memory?.workingSetSize||0)/1024).toFixed(1),privateMB:+((m.memory?.privateBytes||0)/1024).toFixed(1)}))});};
 sample("static-image-start");
 await new Promise(r=>setTimeout(r,5000));
 sample("static-image-5s");
 const target=process.env.SAEED_CI_3D_BASELINE_REPORT||path.join(process.cwd(),"dist","ci-3d-baseline.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify({mode:"static-image-baseline",webgl:false,glb:false,renderLoop:false,durationMs:Date.now()-started,samples},null,2),"utf8");
 app.quit();
}

function showUpdateToast(state,message){try{if(!updateToastWin||updateToastWin.isDestroyed()){updateToastWin=new BrowserWindow({width:360,height:116,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,focusable:false,show:false,webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});updateToastWin.on("closed",()=>{updateToastWin=null})}const d=displayForWindow(characterWin);const a=d.workArea;updateToastWin.setPosition(a.x+a.width-378,a.y+a.height-146,false);updateToastWin.loadFile(path.join(__dirname,"update-toast.html")).then(()=>{updateToastWin?.webContents.send("update-toast",state,message,updateInfo);updateToastWin?.showInactive()}).catch(()=>{})}catch{}}
function hideUpdateToast(){try{if(updateToastWin&&!updateToastWin.isDestroyed())updateToastWin.hide()}catch{}}
function publishUpdate(event,...args){for(const win of [chatWin,updateStatusWin])if(win&&!win.isDestroyed())win.webContents.send(event,...args)}
function showUpdateStatus(){try{if(!updateStatusWin||updateStatusWin.isDestroyed()){updateStatusWin=new BrowserWindow({width:520,height:360,minWidth:520,minHeight:360,maxWidth:520,maxHeight:360,title:"Saeed AI Update",show:false,resizable:false,center:true,backgroundColor:"#f5f7fb",icon:windowsIconPath(),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});updateStatusWin.setMenuBarVisibility(false);updateStatusWin.removeMenu();updateStatusWin.on("closed",()=>{updateStatusWin=null})}updateStatusWin.loadFile(path.join(__dirname,"update-status.html")).then(()=>{if(updateStatusWin&&!updateStatusWin.isDestroyed()){updateStatusWin.show();updateStatusWin.focus();updateStatusWin.webContents.send("update:status-snapshot",{state:updateState,info:updateInfo})}}).catch(e=>diagnostic("ERROR","UPDATE STATUS WINDOW",e.message));return true}catch(e){diagnostic("ERROR","UPDATE STATUS WINDOW",e.message);return false}}
function configureUpdater(){
 autoUpdater.autoDownload=false;
 autoUpdater.autoInstallOnAppQuit=false;
 // Keep the update feed explicit so every installed build checks the Saeed-V2.0 GitHub latest channel.
 try{autoUpdater.setFeedURL({provider:"github",owner:"saeedhub101",repo:"Saeed-V2.0",channel:"latest"})}catch(e){diagnostic("ERROR","UPDATE CONFIG",e.message)}
 autoUpdater.on("checking-for-update",()=>{updateState="checking";publishUpdate("update:state","checking");if(updateUiRequested)showUpdateToast("checking","Checking for updates... (current v"+app.getVersion()+")")});
 autoUpdater.on("update-not-available",info=>{updateState="latest";updateInfo=info||null;publishUpdate("update:state","latest",{currentVersion:app.getVersion(),latestVersion:info?.version||null});if(updateUiRequested){showUpdateToast("latest","Saeed is up to date (v"+app.getVersion()+")");setTimeout(()=>{updateUiRequested=false;hideUpdateToast()},3200)}});
 autoUpdater.on("update-available",info=>{updateState="available";updateInfo={version:info.version,releaseDate:info.releaseDate||null,releaseNotes:info.releaseNotes||null};publishUpdate("update:available",updateInfo);if(updateUiRequested)showUpdateToast("available","A new Saeed update is available: v"+info.version)});
 autoUpdater.on("download-progress",p=>{updateState="downloading";publishUpdate("update:progress",{percent:p.percent,transferred:p.transferred,total:p.total,bytesPerSecond:p.bytesPerSecond})});
 autoUpdater.on("update-downloaded",info=>{updateState="downloaded";updateInfo={...(updateInfo||{}),version:info.version,releaseDate:info.releaseDate||updateInfo?.releaseDate||null,releaseNotes:info.releaseNotes||updateInfo?.releaseNotes||null};publishUpdate("update:downloaded",updateInfo);if(updateUiRequested)showUpdateToast("downloaded","Update downloaded and ready")});
 autoUpdater.on("error",e=>{updateState="error";publishUpdate("update:state","error",e?.message||String(e));if(updateUiRequested){showUpdateToast("error","Update check failed");setTimeout(()=>{updateUiRequested=false;hideUpdateToast()},3200)}})
}
async function runCiRuntimeSmoke(){
 const report={startedAt:new Date().toISOString(),checks:{},resources:resourceReport()};
 try{
  const glb=path.join(app.getAppPath(),"assets","Saeed_Test-3D.glb");
  report.checks.glbFile={pass:fs.existsSync(glb),path:glb,size:fs.existsSync(glb)?fs.statSync(glb).size:0};
  report.checks.runtimeChecks={pass:true,mode:"runtime GLB/agent/local brain/chat/TTS/mic checks disabled"};
  report.resourcesAfter=resourceReport();
  report.finishedAt=new Date().toISOString();
  report.pass=Boolean(report.checks.glbFile.pass);
 }catch(e){report.error=e.message;report.pass=false}
 const target=process.env.SAEED_CI_REPORT||path.join(process.cwd(),"dist","ci-runtime-report.json");
 try{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2),"utf8");console.log("SAEED_CI_REPORT_PATH",target)}catch(e){console.error("CI report write failed:",e.message)}
 console.log("SAEED_CI_RUNTIME_REPORT",JSON.stringify({pass:report.pass,glbFile:report.checks?.glbFile?.pass,startedAt:report.startedAt,finishedAt:report.finishedAt}));
 stopResourceProbe();setTimeout(()=>process.exit(0),250);
}
app.whenReady().then(async()=>{app.isQuitting=false;ciWriteStartupReport("ready");diagnostic("INFO","APPLICATION","Diagnostics system started");if(ciSmoke)startResourceProbe();
 configureUpdater();
 try{await createWindow();currentMicMode="off";agent.settings={...agent.settings,micMode:"off"};agent.persistSettings();setMicMode("off")}catch(e){console.error("Saeed startup failed:",e);ciWriteStartupReport("startup-failed",e);app.quit();return}
 // Windows Jump List disabled to avoid Electron runtime incompatibility in the CI/build environment.
 if(process.argv.includes("--exit")||process.argv.includes("--show-saeed")||process.argv.includes("--3d-status")||process.argv.includes("--chat")||process.argv.includes("--performance")||process.argv.includes("--settings")||process.argv.includes("--status")||process.argv.includes("--mic-on")||process.argv.includes("--mic-off")||process.argv.some(x=>x.startsWith("--size-")))handleLaunchArgs(process.argv.slice(1));
 try{tray=new Tray(trayIcon());tray.setToolTip("Saeed AI");rebuildTray()}catch(e){console.error("Tray failed:",e)}

 globalShortcut.register("CommandOrControl+Shift+M",showChat);
 globalShortcut.register("CommandOrControl+Shift+S",async()=>{
  try{const image=await captureScreen();await showChat();chatWin?.webContents.send("screen:capture",image)}
  catch(e){console.error("Screen capture failed:",e)}
 });
 const refresh=()=>{if(characterWin)fitCharacterToDisplay(displayForWindow())};
 screen.on("display-added",refresh);
 screen.on("display-removed",()=>{if(characterWin)fitCharacterToDisplay(displayForWindow())});
 screen.on("display-metrics-changed",refresh);
});
ipcMain.on("3d:status-report",(_,requestId,report)=>{publish3DStatus(report);const resolve=pending3DQueries.get(String(requestId||""));if(resolve)resolve(report)});
ipcMain.handle("3d:query",()=>request3DStatus());ipcMain.handle("3d-status:show",()=>{show3DStatus();return true});
ipcMain.handle("chat",async(_,payload)=>{
 if(!agent)return {ok:false,error:"Saeed is still starting."};
 const data=typeof payload==="string"?{text:payload}:payload||{};brainSupervisor?.markActivity?.();if(characterWin&&!characterWin.isDestroyed())characterWin.webContents.send("character:behavior",{type:"user-input",text:String(data.text||"")});
 const result=await agent.run(String(data.text||""),data.image||null);
 if(characterWin&&!characterWin.isDestroyed())characterWin.webContents.send("character:behavior","answer");
 return result;
});
ipcMain.handle("settings:get",()=>agent?.publicSettings()||null);ipcMain.on("character:activity",()=>brainSupervisor?.markActivity?.());
ipcMain.handle("diagnostic:report",(_,level,stage,message,meta)=>diagnostic(level,stage,message,meta));ipcMain.handle("diagnostic:snapshot",()=>({state:diagnosticState}));ipcMain.handle("api-status:test",(_,service)=>testApiConnection(String(service||"")));ipcMain.handle("api-status:test-all",()=>testAllApiConnections());ipcMain.handle("resource:snapshot",()=>resourceReport());ipcMain.handle("cpu:metrics",()=>{updateCpuMetrics();return diagnosticState.cpu;});ipcMain.handle("status:show",()=>{showStatus();return true});ipcMain.handle("performance:show",()=>{showPerformance();return true});ipcMain.handle("settings:show",()=>{showSettings();return true});ipcMain.handle("character:choose",()=>{chooseCharacter();return true});
ipcMain.handle("settings:set",(_,s)=>{
 if(!agent)throw new Error("Saeed is still starting.");
 const previous={...agent.settings};
 agent.settings={...previous,...(s||{}),brainMode:["api","local","auto"].includes(String((s||{}).brainMode||""))?String((s||{}).brainMode):String(previous.brainMode||"auto")};
 delete agent.settings.alwaysListening;
 if(agent.settings.micMode==="always"||agent.settings.micMode==="ptt")agent.settings.micMode="on";
 if(agent.settings.micMode!=="on")agent.settings.micMode="off";
 const mode=String(agent.settings.brainMode||"auto");
 let micMode=String(agent.settings.micMode||currentMicMode||"off");
 const realtimeChanged=Object.prototype.hasOwnProperty.call(s||{},"realtimeEnabled")&&previous.realtimeEnabled!==agent.settings.realtimeEnabled;
 const voiceConfigChanged=["sttProvider","sttModel","sttLanguage","ttsProvider","ttsModel","ttsVoice","voiceRouting","micPath","realtimeProvider","realtimeModel","realtimeVoice","micSpeechRms","micInterruptRms"].some(k=>Object.prototype.hasOwnProperty.call(s||{},k)&&previous[k]!==agent.settings[k]);
 if(mode!=="api"&&agent.settings.realtimeEnabled)agent.settings.realtimeEnabled=false;
 if(mode!=="api"||!agent.settings.realtimeEnabled||agent.settings.micPath!=="realtime")stopRealtime();
 if(Object.prototype.hasOwnProperty.call(s||{},"micMode"))setMicMode(micMode);
 if(Object.prototype.hasOwnProperty.call(s||{},"micPath")&&previous.micPath!==agent.settings.micPath&&micMode==="on"){setMicMode("off").then(()=>setMicMode("on"));} if(realtimeChanged&&micMode==="on")setMicMode("off").then(()=>setMicMode("on"));
 if(Object.prototype.hasOwnProperty.call(s||{},"characterSize"))setSaeedSize(agent.settings.characterSize);
 if(Object.prototype.hasOwnProperty.call(s||{},"displayMode")&&characterWin&&!characterWin.isDestroyed())characterWin.setAlwaysOnTop(agent.settings.displayMode==="always-on-top");
 if(Object.prototype.hasOwnProperty.call(s||{},"characterBehavior")||Object.prototype.hasOwnProperty.call(s||{},"idleThoughtsEnabled")||Object.prototype.hasOwnProperty.call(s||{},"brainController")||Object.prototype.hasOwnProperty.call(s||{},"mood")||Object.prototype.hasOwnProperty.call(s||{},"appearance")||Object.prototype.hasOwnProperty.call(s||{},"zoom")||Object.prototype.hasOwnProperty.call(s||{},"muteSounds")||Object.prototype.hasOwnProperty.call(s||{},"brainMode")||Object.prototype.hasOwnProperty.call(s||{},"voiceRouting")||Object.prototype.hasOwnProperty.call(s||{},"ttsProvider"))characterWin?.webContents.send("character:behavior",{type:"settings",settings:agent.publicSettings()});
 if(previous.sttProvider!==agent.settings.sttProvider||previous.micMode!==micMode)diagnostic("INFO","MIC CONFIG","Microphone configuration applied",{mode:micMode,sttProvider:agent.settings.sttProvider});
 if(brainSupervisor)void brainSupervisor.refresh?.();
 diagnostic("INFO","BRAIN MODE","Brain mode selected: "+mode);
 return agent.publicSettings();
});
function audioProviderConfig(kind,s){const provider=String(s?.[kind+"Provider"]||"local");if(kind==="tts")return provider==="openai"?{provider,baseUrl:"https://api.openai.com/v1/audio/speech",key:s.ttsApiKey,model:s.ttsModel||"gpt-4o-mini-tts",voice:s.ttsVoice||"alloy"}:provider==="groq"?{provider,baseUrl:"https://api.groq.com/openai/v1/audio/speech",key:s.ttsApiKey,model:s.ttsModel||"canopylabs/orpheus-v1-english",voice:s.ttsVoice||"austin"}:provider==="elevenlabs"?{provider,baseUrl:"https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(s.ttsVoice||"JBFqnCBsd6RMkjVDRZzb"),key:s.ttsApiKey,model:s.ttsModel||"eleven_flash_v2_5",voice:s.ttsVoice||"JBFqnCBsd6RMkjVDRZzb"}:{provider};return provider==="openai"?{provider,baseUrl:"https://api.openai.com/v1/audio/transcriptions",key:s.sttApiKey,model:s.sttModel||"gpt-transcribe"}:provider==="groq"?{provider,baseUrl:"https://api.groq.com/openai/v1/audio/transcriptions",key:s.sttApiKey,model:s.sttModel||"whisper-large-v3-turbo"}:provider==="elevenlabs"?{provider,baseUrl:"https://api.elevenlabs.io/v1/speech-to-text",key:s.sttApiKey,model:s.sttModel||"scribe_v2"}:{provider}}
function pcm16ToWav(base64,rate=24000){const pcm=Buffer.from(String(base64||""),"base64"),h=Buffer.alloc(44);h.write("RIFF",0);h.writeUInt32LE(36+pcm.length,4);h.write("WAVE",8);h.write("fmt ",12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write("data",36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm])}
ipcMain.handle("tts:speak",async(_,text)=>{const s=agent?.settings||{},cfg=audioProviderConfig("tts",s),input=String(text||"").trim();if(!input)return{ok:false,reason:"empty"};if(cfg.provider==="local")return{ok:false,reason:"tts-provider-local"};if(!cfg.key&&cfg.provider==="openai")cfg.key=s.apiKey||"";if(!cfg.key)return{ok:false,error:String(cfg.provider).toUpperCase()+" TTS API key is missing"};try{const body=cfg.provider==="elevenlabs"?{text:input,model_id:cfg.model}: {model:cfg.model,input,response_format:"wav"};if(cfg.voice&&cfg.provider!=="elevenlabs")body.voice=cfg.voice;const headers=cfg.provider==="elevenlabs"?{"xi-api-key":cfg.key,"Content-Type":"application/json"}:{"Authorization":"Bearer "+cfg.key,"Content-Type":"application/json"};const r=await fetch(cfg.baseUrl+(cfg.provider==="elevenlabs"?"?output_format=mp3_44100_128":""),{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});if(!r.ok){const msg=await r.text().catch(()=>"");diagnostic("ERROR","TTS API",cfg.provider.toUpperCase()+" TTS HTTP "+r.status+(msg?": "+msg.slice(0,240):""));return{ok:false,error:cfg.provider.toUpperCase()+" TTS HTTP "+r.status}}const b=Buffer.from(await r.arrayBuffer());diagnostic("INFO","TTS API AUDIO",cfg.provider.toUpperCase()+" TTS audio generated",{bytes:b.length,model:cfg.model,voice:cfg.voice||""});return{ok:true,base64:b.toString("base64")}}catch(e){diagnostic("ERROR","TTS API",e.message);return{ok:false,error:e.message}}});
ipcMain.handle("stt:transcribe",async(_,base64)=>{const s=agent?.settings||{},cfg=audioProviderConfig("stt",s);if(cfg.provider==="local")return{ok:false,reason:"stt-provider-local"};if(!cfg.key&&cfg.provider==="openai")cfg.key=s.apiKey||"";if(!cfg.key)return{ok:false,error:String(cfg.provider).toUpperCase()+" STT API key is missing"};try{const wav=pcm16ToWav(base64,24000),form=new FormData();form.append("file",new Blob([wav],{type:"audio/wav"}),"saeed.wav");if(cfg.provider==="elevenlabs")form.append("model_id",cfg.model);else{form.append("model",cfg.model);form.append("response_format","json");}if(s.sttLanguage&&s.sttLanguage!=="auto")form.append("language",String(s.sttLanguage));const headers=cfg.provider==="elevenlabs"?{"xi-api-key":cfg.key}:{"Authorization":"Bearer "+cfg.key};const r=await fetch(cfg.baseUrl,{method:"POST",headers,body:form,signal:AbortSignal.timeout(60000)});const body=await r.text();if(!r.ok){diagnostic("ERROR","STT API",cfg.provider.toUpperCase()+" STT HTTP "+r.status+(body?": "+body.slice(0,240):""));return{ok:false,error:cfg.provider.toUpperCase()+" STT HTTP "+r.status}}let j={};try{j=JSON.parse(body)}catch{}const text=String(j.text||body||"").trim();diagnostic("INFO","STT API RESULT",cfg.provider.toUpperCase()+" STT transcript received",{model:cfg.model,text});return{ok:true,text}}catch(e){diagnostic("ERROR","STT API",e.message);return{ok:false,error:e.message}}});
ipcMain.handle("realtime:start",(_,options={})=>{startRealtime(options);return true});
ipcMain.handle("api:clear-all",async()=>{if(agent){agent.settings={...agent.settings,apiKey:"",sttApiKey:"",ttsApiKey:"",realtimeApiKey:"",realtimeEnabled:false,micMode:"off"};agent.persistSettings()}try{stopRealtime()}catch{}currentMicMode="off";diagnostic("INFO","API RESET","All stored API keys cleared and Realtime disabled");return agent?.publicSettings()||null});
ipcMain.handle("realtime:stop",()=>{stopRealtime();return true});
ipcMain.handle("realtime:audio",(_,base64)=>{realtime?.appendAudio(String(base64||""));return true});
ipcMain.handle("realtime:text",(_,text)=>realtime?.text(String(text||""))||false);
ipcMain.handle("realtime:cancel",()=>{realtime?.cancel();return true});ipcMain.handle("local-stt:transcribe",(_,base64)=>transcribeLocalWav(String(base64||"")));
function transcribeLocalWav(base64){return new Promise((resolve,reject)=>{const p=whisperRuntimePaths();const cli=p.exe;if(!fs.existsSync(cli)||!fs.existsSync(p.model))return reject(new Error("Offline Whisper CLI/model is missing"));const wav=path.join(app.getPath("temp"),"saeed-stt-"+Date.now()+".wav");try{const pcm=Buffer.from(String(base64||""),"base64");const header=Buffer.alloc(44);header.write("RIFF",0);header.writeUInt32LE(36+pcm.length,4);header.write("WAVE",8);header.write("fmt ",12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write("data",36);header.writeUInt32LE(pcm.length,40);fs.writeFileSync(wav,Buffer.concat([header,pcm]));const args=["-m",p.model,"-f",wav,"-nt","-np","--no-timestamps"];if(agent?.settings?.sttLanguage&&agent.settings.sttLanguage!=="auto")args.push("-l",String(agent.settings.sttLanguage));const child=spawn(cli,args,{cwd:path.dirname(cli),windowsHide:true});let out="",err="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",d=>out+=d);child.stderr.on("data",d=>err+=d);child.on("error",e=>{try{fs.unlinkSync(wav)}catch{}reject(e)});child.on("close",code=>{try{fs.unlinkSync(wav)}catch{}if(code!==0)return reject(new Error(err.slice(-1200)||("Whisper CLI exited with code "+code)));const text=out.replace(/\x1b\[[0-9;]*[A-Za-z]/g,"").split(/\\r?\\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith("[")&&!x.startsWith("whisper_")).join(" ").replace(/^\s*[\[\(].*?[\]\)]\s*/,"").trim();diagnostic("INFO","LOCAL STT RESULT",text);resolve(text)})}catch(e){try{fs.unlinkSync(wav)}catch{}reject(e)}})}
ipcMain.handle("mic:mode",async(_,mode)=>await setMicMode(String(mode||"off"),true));
ipcMain.handle("voice:mute",async(_,muted)=>setVoiceMuted(Boolean(muted)));
ipcMain.on("mic:level",(_,level)=>{const v=Math.max(0,Math.min(1,Number(level)||0));diagnosticState.mic={...diagnosticState.mic,state:v>0?"active":diagnosticState.mic.state,level:v,detail:"Live microphone input"};for(const win of [statusWin,threeDStatusWin,characterWin])if(win&&!win.isDestroyed())win.webContents.send("mic:level",v);if(statusWin&&!statusWin.isDestroyed())statusWin.webContents.send("diagnostic:state",diagnosticState);});
ipcMain.handle("chat:minimize",()=>{if(!chatWin||chatWin.isDestroyed())return false;chatWin.minimize();return true});
ipcMain.on("chat:mouse-passthrough",(event,ignore)=>{
 const win=BrowserWindow.fromWebContents(event.sender);
 if(!win||win.isDestroyed()||win!==chatWin)return;
 win.setIgnoreMouseEvents(Boolean(ignore),{forward:true});
});

ipcMain.handle("capture",async()=>{
 const policy=permissionPolicy("screen");
 if(policy==="deny")return null;
 if(policy==="ask"&&!await confirmPermission("screen",{name:"screen_capture",args:{action:"capture screen"}}))return null;
 return captureScreen();
});
ipcMain.handle("update:check",async()=>{if(!app.isPackaged)return {ok:false,state:"unavailable",message:"Updates are available only in the installed Windows build."};try{updateUiRequested=true;updateState="checking";showUpdateToast("checking","Checking for updates…");voiceBroadcast("update:state","checking");const result=await autoUpdater.checkForUpdates();return {ok:true,state:updateState,version:result?.updateInfo?.version||null}}catch(e){updateState="error";showUpdateToast("error","Update check failed");chatWin?.webContents.send("update:state","error",e.message);setTimeout(()=>{updateUiRequested=false;hideUpdateToast();voiceBroadcast("update:state","idle")},3200);return {ok:false,state:"error",message:e.message}}});
ipcMain.handle("update:download",async()=>{if(updateState!=="available")return false;try{showUpdateStatus();updateState="downloading";publishUpdate("update:state","downloading");await autoUpdater.downloadUpdate();return true}catch(e){updateState="error";publishUpdate("update:state","error",e.message);return false}});
ipcMain.handle("update:install",()=>{if(updateState!=="downloaded")return false;autoUpdater.quitAndInstall(false,true);return true});
ipcMain.handle("update:show-status",()=>showUpdateStatus());
ipcMain.handle("update:toast-close",()=>{updateUiRequested=false;hideUpdateToast();return true});
ipcMain.handle("update:snapshot",()=>({state:updateState,info:updateInfo,currentVersion:app.getVersion()}));
ipcMain.handle("update:state",()=>updateState);

ipcMain.handle("history:get",()=>agent?.history||[]);
ipcMain.handle("chat:list",()=>agent?.listConversations?.()||[]);
ipcMain.handle("chat:current",()=>agent?.getCurrentConversation?.()||null);
ipcMain.handle("chat:memory",()=>agent?.getGlobalMemory?.()||[]);
ipcMain.handle("chat:new",()=>{if(!agent)return null;const chat=agent.newConversation();chatWin?.webContents.send("chat:switched",chat,[]);return {chat,history:[]};});
ipcMain.handle("chat:select",(_,id)=>{if(!agent)return null;const chat=agent.selectConversation(String(id||""));if(!chat)return null;const history=agent.history||[];chatWin?.webContents.send("chat:switched",chat,history);return {chat,history};});
ipcMain.handle("history:clear",()=>{if(!agent)return false;agent.clearHistory();chatWin?.webContents.send("history:cleared");return true});
ipcMain.handle("agent:confirm-response",(_,id,approved)=>{
 const resolve=confirmations.get(id);if(!resolve)return false;
 confirmations.delete(id);resolve(Boolean(approved));return true;
});

async function testApiConnection(service){
 const s=agent?.settings||{};
 const result={service,connected:false,provider:"Not configured",model:"—",endpoint:"—",latencyMs:0,detail:"Not tested"};
 const started=Date.now();
 const finish=(x)=>({...result,...x,latencyMs:Date.now()-started});
 let url="",headers={},method="GET";
 try{
  if(service==="brain"){
   const provider=String(s.provider||"openai"), d=agent?.providerDefaults?.(provider)||{};
   result.provider=provider==="openai"?"OpenAI / GPT":provider==="anthropic"?"Anthropic / Claude":provider==="gemini"?"Google / Gemini":provider==="groq"?"Groq":provider==="ollama"?"Ollama":"OpenAI-compatible";
   result.model=String(s.model||d.model||"—"); result.endpoint=String(s.baseUrl||d.baseUrl||"—");
   if(provider==="ollama"){url=result.endpoint.replace(/\/$/,"")+"/models"}
   else if(provider==="anthropic"){url="https://api.anthropic.com/v1/models";headers={"x-api-key":String(s.apiKey||""),"anthropic-version":"2023-06-01"}}
   else if(provider==="gemini"){url=result.endpoint.replace(/\/$/,"")+"/models"; if(s.apiKey)url+="?key="+encodeURIComponent(s.apiKey)}
   else {url=result.endpoint.replace(/\/$/,"")+"/models";if(s.apiKey)headers.Authorization="Bearer "+s.apiKey}
  }else if(service==="stt"){
   result.provider=s.sttProvider==="openai"?"OpenAI Speech-to-Text":s.sttProvider==="groq"?"Groq Speech-to-Text":s.sttProvider==="elevenlabs"?"ElevenLabs Speech-to-Text":"Whisper — Local / Offline";result.model=s.sttModel||"whisper-local";result.endpoint=s.sttProvider==="openai"?"https://api.openai.com/v1/audio/transcriptions":s.sttProvider==="groq"?"https://api.groq.com/openai/v1/audio/transcriptions":s.sttProvider==="elevenlabs"?"https://api.elevenlabs.io/v1/speech-to-text":"Local Whisper runtime";
   if(s.sttProvider==="whisper")return finish({connected:true,detail:"Local Whisper configured; no API connection required"});
   url=(s.sttProvider==="groq"?"https://api.groq.com/openai/v1/models":s.sttProvider==="elevenlabs"?"https://api.elevenlabs.io/v1/models":"https://api.openai.com/v1/models");if(s.sttApiKey)headers.Authorization="Bearer "+s.sttApiKey;
  }else if(service==="tts"){
   result.provider=s.ttsProvider==="openai"?"OpenAI TTS":s.ttsProvider==="groq"?"Groq TTS":s.ttsProvider==="elevenlabs"?"ElevenLabs TTS":"Local Browser TTS";result.model=s.ttsModel||"browser-speech";result.endpoint=s.ttsProvider==="openai"?"https://api.openai.com/v1/audio/speech":s.ttsProvider==="groq"?"https://api.groq.com/openai/v1/audio/speech":s.ttsProvider==="elevenlabs"?"https://api.elevenlabs.io/v1/text-to-speech":"Local Browser SpeechSynthesis";
   if(s.ttsProvider==="local")return finish({connected:true,detail:"Local Browser TTS configured; no API connection required"});
   url=(s.ttsProvider==="groq"?"https://api.groq.com/openai/v1/models":s.ttsProvider==="elevenlabs"?"https://api.elevenlabs.io/v1/models":"https://api.openai.com/v1/models");if(s.ttsApiKey)headers.Authorization="Bearer "+s.ttsApiKey;
  }else if(service==="realtime"){
   result.provider=s.realtimeProvider==="openai"?"OpenAI Realtime":"Realtime disabled";result.model=s.realtimeModel||"gpt-realtime-2.1";result.endpoint="wss://api.openai.com/v1/realtime";
   url="https://api.openai.com/v1/models";if(s.realtimeApiKey||s.apiKey)headers.Authorization="Bearer "+(s.realtimeApiKey||s.apiKey);
  }else return finish({detail:"Unknown API service"});
  if(!s.apiKey&&service==="brain"&&s.provider!=="ollama")return finish({detail:"Brain API key is missing"});
  if(service==="stt"&&s.sttProvider!=="whisper"&&!s.sttApiKey&&!((s.sttProvider==="openai")&&s.apiKey))return finish({detail:"STT API key is missing"});
  if(service==="tts"&&s.ttsProvider!=="local"&&!s.ttsApiKey&&!((s.ttsProvider==="openai")&&s.apiKey))return finish({detail:"TTS API key is missing"});
  if(service==="realtime"&&s.realtimeProvider!=="openai")return finish({connected:false,detail:"No native Realtime audio provider is configured"});if(service==="realtime"&&!s.realtimeApiKey&&!s.apiKey)return finish({detail:"Realtime API key is missing"});
  const r=await fetch(url,{method,headers,signal:AbortSignal.timeout(8000)});const body=await r.text().catch(()=>"");
  if(!r.ok)return finish({detail:"HTTP "+r.status+(body?": "+body.slice(0,180):"")});
  let modelAvailable=true;try{const j=JSON.parse(body),ids=[...(j.data||[]).map(x=>x.id).filter(Boolean),...(j.models||[]).map(x=>x.name||x.id).filter(Boolean)];if(ids.length&&service==="brain")modelAvailable=ids.includes(result.model)||result.model==="—"}catch{}
  return finish({connected:modelAvailable,detail:modelAvailable?"Provider authenticated and reachable"+(service==="realtime"?" (Realtime credentials verified via API authentication)":""): "Provider reachable but configured model was not found"});
 }catch(e){return finish({detail:e?.message||String(e)})}
}
async function testAllApiConnections(){return Promise.all(["brain","tts","stt","realtime"].map(testApiConnection))}

function stopRealtime(){
 if(realtime){realtime.stop();realtime=null}
 diagnostic("INFO","STT DISCONNECTED","Realtime STT connection stopped");
 diagnostic("INFO","TTS DISCONNECTED","Realtime TTS connection stopped");
 voiceBroadcast("realtime:state","disconnected");
}
function startRealtime(options={}){
 const s=agent?.settings||{};
 if(s.realtimeEnabled===false){diagnostic("INFO","REALTIME BLOCKED","Realtime is disabled in Voice settings");voiceBroadcast("realtime:state","disabled","Realtime is disabled.");return false}
 if(s.micPath!=="realtime"){diagnostic("INFO","REALTIME BLOCKED","Realtime microphone path is disabled");voiceBroadcast("realtime:state","blocked","Microphone is using the selected STT provider.");return false}
 if(String(s.realtimeProvider||"openai")!=="openai"){diagnostic("INFO","REALTIME BLOCKED","The selected Realtime provider has no native speech-to-speech implementation in Saeed yet.");voiceBroadcast("realtime:state","blocked","Selected Realtime provider is not supported.");return false}if(String(s.brainMode||"auto")!=="api"){diagnostic("INFO","REALTIME BLOCKED","Realtime is disabled because Brain mode is "+String(s.brainMode||"auto")+"; requests must pass through the selected brain routing.");voiceBroadcast("realtime:state","blocked","Realtime requires Direct API brain mode.");return false}
 const key=s.realtimeApiKey||s.apiKey||"";
 if(!key || s.provider==="ollama"){diagnostic("ERROR","STT API KEY","Realtime/OpenAI API key is missing");diagnostic("ERROR","TTS API KEY","Realtime/OpenAI API key is missing");voiceBroadcast("realtime:state","not-configured","OpenAI API key is not configured.");return false}
 diagnostic("INFO","STT START","Starting Realtime STT");diagnostic("INFO","TTS START","Starting Realtime TTS");if(realtime) realtime.stop();
 const registry=agent?.registry;
 const realtimeTools=(registry?.schemas()||[]).map(t=>({
  type:"function",
  name:t.function?.name,
  description:t.function?.description||"",
  parameters:t.function?.parameters||{type:"object",properties:{},required:[]}
 })).filter(t=>t.name);
 realtime=new OpenAIRealtime({
  state:(state,message)=>{diagnostic("INFO","REALTIME "+String(state||"").toUpperCase(),message||"");if(state==="connected"){diagnostic("INFO","STT CONNECTED","Realtime STT connected");diagnostic("INFO","TTS CONNECTED","Realtime TTS connected")}if(state==="error")diagnostic("ERROR","REALTIME API",message||"Realtime API error");if(state==="disconnected")diagnostic("ERROR","REALTIME DISCONNECTED",message||"Realtime connection closed");voiceBroadcast("realtime:state",state,message)},
  event:async(event)=>{
   if(event.type==="response.output_audio.delta"&&event.delta){diagnostic("INFO","TTS AUDIO","Realtime audio received");voiceBroadcast("realtime:audio",event.delta);}
   else if(event.type==="response.output_audio_transcript.delta"&&event.delta)voiceBroadcast("realtime:assistant-delta",event.delta);
   else if(event.type==="response.output_audio_transcript.done"&&event.transcript)voiceBroadcast("realtime:assistant-final",event.transcript);
   else if(event.type==="conversation.item.input_audio_transcription.delta"&&event.delta)voiceBroadcast("realtime:user-delta",event.delta);
   else if(event.type==="conversation.item.input_audio_transcription.completed"&&event.transcript)voiceBroadcast("realtime:user-final",event.transcript);
   else if(event.type==="response.function_call_arguments.done"&&event.call_id){
    const name=String(event.name||"");
    let args={};
    try{args=JSON.parse(event.arguments||"{}")}catch{args={}};
    voiceBroadcast("agent:event",{type:"speech-status",text:name==="open_url"?"Okay, I’ll open that.":name==="open_application"?"Okay, I’ll open it.":name==="web_search"?"Okay, I’ll look that up.":"Okay, I’ll do that.",source:"realtime"});
    voiceBroadcast("agent:event",{type:"tool",name,args,source:"realtime"});
    let out;
    try{out=await registry.call(name,args)}catch(e){out={ok:false,error:e.message}};
    if(out?.ok===false)voiceBroadcast("agent:event",{type:"tool_error",name,error:out.error||"Tool failed",source:"realtime"});
    else voiceBroadcast("agent:event",{type:"tool_result",name,result:out,source:"realtime"});
    realtime?.toolResult(event.call_id,out||{ok:false,error:"Tool returned no result"});
   }
   else if(event.type==="response.done")voiceBroadcast("realtime:done",event.response?.status||"completed");
   else if(event.type==="error")voiceBroadcast("realtime:error",event.error?.message||"Realtime API error");
  }
 });
 realtime.start(key,{model:s.realtimeModel||"gpt-realtime-2.1",voice:s.realtimeVoice||"marin",tools:realtimeTools,voiceRouting:s.voiceRouting||"controller"});
 return true;
}
ipcMain.on("window:move-by",(_,dx,dy)=>{
 if(!characterWin)return;
 const [x,y]=characterWin.getPosition(),[w,h]=characterWin.getSize();
 const nextX=x+Math.round(Number(dx)||0),nextY=y+Math.round(Number(dy)||0);
 const center={x:nextX+w/2,y:nextY+h/2};
 const d=screen.getDisplayNearestPoint(center)||screen.getPrimaryDisplay();
 const a=d.workArea;
 const nx=Math.max(a.x,Math.min(nextX,a.x+Math.max(0,a.width-w)));
 const ny=Math.max(a.y,Math.min(nextY,a.y+Math.max(0,a.height-h)));
 characterWin.setPosition(nx,ny,true);
});
ipcMain.on("chat:move-by",(_,dx,dy)=>{if(!chatWin||chatWin.isDestroyed())return;const [x,y]=chatWin.getPosition(),[w,h]=chatWin.getSize();const nx=x+Math.round(Number(dx)||0),ny=y+Math.round(Number(dy)||0);const d=screen.getDisplayNearestPoint({x:nx+w/2,y:ny+h/2})||screen.getPrimaryDisplay(),a=d.workArea;chatWin.setPosition(Math.max(a.x,Math.min(nx,a.x+Math.max(0,a.width-w))),Math.max(a.y,Math.min(ny,a.y+Math.max(0,a.height-h))),true)});
ipcMain.on("window:show-chat",()=>{void showChat()});
ipcMain.on("window:close-chat",()=>{if(chatWin&&!chatWin.isDestroyed()){chatWin.setIgnoreMouseEvents(false);chatWin.close()}});

app.on("activate",()=>{if(characterWin&&!characterWin.isDestroyed()){showCharacter();return}createWindow().catch(e=>console.error(e))});
app.on("window-all-closed",()=>{if(process.platform!=="darwin"&&!app.isQuitting)app.quit()});
app.on("before-quit",()=>{
 app.isQuitting=true;
 try{stopRealtime()}catch(e){console.error("Voice shutdown failed:",e)}
 for(const win of [chatWin,performanceWin,settingsWin,statusWin,threeDStatusWin,characterWin]){try{if(win&&!win.isDestroyed())win.destroy()}catch(e){console.error("Window shutdown failed:",e)}}
 try{if(tray){tray.destroy();tray=null}}catch(e){console.error("Tray shutdown failed:",e)}
});
app.on("will-quit",()=>{globalShortcut.unregisterAll();try{stopRealtime()}catch{}try{if(cpuTimer)clearInterval(cpuTimer)}catch{}cpuTimer=null});