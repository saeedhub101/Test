const {app,BrowserWindow,ipcMain,globalShortcut,desktopCapturer,Tray,Menu,screen,dialog,nativeImage}=require("electron");
const path=require("path"),fs=require("fs"),crypto=require("crypto"),{pathToFileURL}=require("url"),{spawn}=require("child_process"),{Agent}=require("./agent"),{ToolRegistry}=require("./tools"),{EmailService}=require("./email");

process.on("uncaughtException",e=>console.error("Saeed uncaught:",e));
process.on("unhandledRejection",e=>console.error("Saeed rejection:",e));

let win,settingsWin,characterWin,agent,tray,realtime,localSttProcess=null,localSpeechProcess=null,emailService=null;
let characterWelcomed=false;
const confirmations=new Map();
const WINDOW={width:760,height:480,minWidth:360,minHeight:260};

async function captureScreen(){
 const sources=await desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:1920,height:1080}});
 return sources[0]?.thumbnail.toDataURL()||null;
}
function displayForWindow(){
 if(!win)return screen.getPrimaryDisplay();
 const [x,y]=win.getPosition();
 const [w,h]=win.getSize();
 return screen.getDisplayMatching({x,y,width:w,height:h})||screen.getDisplayNearestPoint({x:x+w/2,y:y+h/2})||screen.getPrimaryDisplay();
}
function fitWindowToDisplay(display=displayForWindow(),{bottomRight=false}={}){
 if(!win)return;
 const area=display.workArea;
 const width=Math.min(WINDOW.width,Math.max(WINDOW.minWidth,area.width));
 const height=Math.min(WINDOW.height,Math.max(WINDOW.minHeight,area.height));
 if(win.getSize()[0]!==width||win.getSize()[1]!==height)win.setSize(width,height,false);
 const margin=18;
 const [x0,y0]=win.getPosition();
 const x=bottomRight?area.x+Math.max(0,area.width-width-margin):Math.max(area.x,Math.min(x0,area.x+Math.max(0,area.width-width)));
 const y=bottomRight?area.y+Math.max(0,area.height-height-margin):Math.max(area.y,Math.min(y0,area.y+Math.max(0,area.height-height)));
 win.setPosition(Math.round(x),Math.round(y),false);
}
function placeCharacterBottomRight(){
 if(!characterWin)return;
 const display=screen.getPrimaryDisplay(),area=display.workArea;
 const [w,h]=characterWin.getSize();
 characterWin.setPosition(Math.max(area.x,area.x+area.width-w-18),Math.max(area.y,area.y+area.height-h-12),false);
}
function placeBottomRight(){
 if(!win)return;
 const display=screen.getPrimaryDisplay();
 fitWindowToDisplay(display,{bottomRight:true});
}
function keepWindowVisible(){
 if(!win)return;
 const display=displayForWindow();
 fitWindowToDisplay(display);
}
async function showChat(){
 if(!win)await createChatWindow();
 if(!win)return;
 keepWindowVisible();win.show();win.focus();win.webContents.send("chat:show");
}
function showCharacter(){if(characterWin&&!characterWin.isDestroyed()){characterWin.show();characterWin.focus();}}
function hideCharacter(){characterWin?.hide();}
function speakWelcome(){
 const s=agent?.settings||{};
 if((s.realtimeApiKey||s.apiKey)&&s.provider!=="ollama"){
  try{if(startRealtime({welcome:true})){setTimeout(()=>{try{realtime?.text("Say exactly: Hello. I am Saeed.")}catch{}},900);return}}catch{}
 }
 if(process.platform==="win32"){try{spawn("powershell.exe",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-Command","Add-Type -AssemblyName System.Speech; $v=New-Object System.Speech.Synthesis.SpeechSynthesizer; $v.Speak('Hello. I am Saeed.'); $v.Dispose()"],{windowsHide:true,stdio:"ignore",detached:true}).unref()}catch{}}
}
function showSettings(){
 if(settingsWin&&!settingsWin.isDestroyed()){settingsWin.show();settingsWin.focus();return}
 settingsWin=new BrowserWindow({title:"Saeed AI — Settings",width:900,height:680,minWidth:720,minHeight:560,backgroundColor:"#f5f7fb",show:false,icon:windowsIconPath(),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});
 settingsWin.setMenuBarVisibility(false);
 settingsWin.on("closed",()=>{settingsWin=null});
 settingsWin.loadFile(path.join(__dirname,"settings-new.html")).then(()=>settingsWin?.show());
}
async function setMicMode(mode){
 if(!agent||!["always","push","off"].includes(mode))return;
 agent.settings={...agent.settings,micMode:mode,alwaysListening:mode==="always"};
 await configureVoiceAndEmail();
 win?.webContents.send("mic:mode",mode);
 rebuildTrayMenu();
 win?.webContents.send("mic:mode",mode);
 rebuildTrayMenu();
}

async function fetchLatestRelease(){
 return new Promise((resolve,reject)=>{
  const https=require("https");
  const req=https.get("https://api.github.com/repos/saeedhub101/Saeed-AI/releases/latest",{headers:{"User-Agent":"Saeed-AI","Accept":"application/vnd.github+json"}},res=>{
   let body="";res.setEncoding("utf8");res.on("data",d=>body+=d);res.on("end",()=>{
    try{
     if(res.statusCode!==200)throw new Error("GitHub returned HTTP "+res.statusCode);
     const r=JSON.parse(body),tag=String(r.tag_name||"").replace(/^v/i,""),current=String(app.getVersion()||"0.0.0");
     const parse=v=>String(v).replace(/^v/i,"").split("-")[0].split(".").map(x=>Number.parseInt(x,10)||0);
     const a=parse(current),b=parse(tag);let cmp=0;for(let i=0;i<3;i++){if(a[i]!==b[i]){cmp=a[i]<b[i]?-1:1;break}}
     const asset=(r.assets||[]).find(x=>/\.exe$/i.test(String(x.name||""))&&!/\.blockmap$|\.sha256$/i.test(String(x.name||"")));
     resolve({currentVersion:current,latestVersion:tag,newer:cmp<0,releaseName:r.name||tag,publishedAt:r.published_at||"",notes:r.body||"",releaseUrl:r.html_url||"",assetUrl:asset?.browser_download_url||"",assetName:asset?.name||"",size:Number(asset?.size||0),digest:asset?.digest||""});
    }catch(e){reject(e)}
   });
  });
  req.on("error",reject);req.setTimeout(10000,()=>req.destroy(new Error("Update check timed out")));
 });
}
function formatBytes(n){if(!Number.isFinite(n)||n<=0)return "Unknown size";const u=["B","KB","MB","GB"];let i=0,x=n;while(x>=1024&&i<u.length-1){x/=1024;i++}return x.toFixed(i?1:0)+" "+u[i]}
async function checkForUpdates(options={}){
 const info=await fetchLatestRelease();
 if(options.showDialog){
  await dialog.showMessageBox(settingsWin||win,{type:"info",title:"Saeed AI Updates",message:info.newer?"A new version is available: v"+info.latestVersion:"Saeed AI is up to date.",detail:info.newer?("Current: v"+info.currentVersion+"\nNew: v"+info.latestVersion+"\nSize: "+formatBytes(info.size)):("Current version: v"+info.currentVersion)});
 }
 return info;
}
function downloadUpdateFile(url,out,onProgress){
 return new Promise((resolve,reject)=>{
  const https=require("https");
  const request=(target,redirects=0)=>{
   if(redirects>5)return reject(new Error("Too many update redirects"));
   const req=https.get(target,{headers:{"User-Agent":"Saeed-AI","Accept":"application/octet-stream"}},res=>{
    if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.resume();return request(new URL(res.headers.location,target).toString(),redirects+1)}
    if(res.statusCode!==200){res.resume();return reject(new Error("Update download returned HTTP "+res.statusCode))}
    const total=Number(res.headers["content-length"]||0);let done=0;
    const file=fs.createWriteStream(out);
    res.on("data",chunk=>{done+=chunk.length;onProgress?.(done,total)});
    res.pipe(file);
    file.on("finish",()=>file.close(()=>resolve({total:done,declared:total})));
    res.on("error",e=>{try{file.destroy()}catch{};reject(e)});
    file.on("error",reject);
   });
   req.on("error",reject);req.setTimeout(120000,()=>req.destroy(new Error("Update download timed out")));
  };
  request(url);
 });
}
async function installUpdate(info){
 if(!info?.assetUrl)throw new Error("No Windows installer is available for this release.");
 const out=path.join(app.getPath("temp"),"Saeed-AI-update-"+Date.now()+".exe");
 settingsWin?.webContents.send("update:status",{state:"downloading",phase:"prepare",text:"Preparing the update…",downloaded:0,total:info.size});
 try{
  const result=await downloadUpdateFile(info.assetUrl,out,(downloaded,total)=>settingsWin?.webContents.send("update:progress",{downloaded,total:total||info.size}));
  settingsWin?.webContents.send("update:status",{state:"verifying",phase:"verify",text:"Download complete. Verifying the installer…",downloaded:result.total,total:info.size});
  if(!fs.existsSync(out)||fs.statSync(out).size<100000)throw new Error("Downloaded installer is missing or incomplete.");
  if(info.digest&&/^sha256:/i.test(info.digest)){
   const hash=crypto.createHash("sha256").update(fs.readFileSync(out)).digest("hex");
   if(hash.toLowerCase()!==String(info.digest).replace(/^sha256:/i,"").toLowerCase())throw new Error("Installer integrity verification failed.");
  }
  settingsWin?.webContents.send("update:status",{state:"installing",phase:"install",text:"Installer verified. Starting installation…",downloaded:result.total,total:info.size});
  const child=spawn(out,["/SILENT","/CLOSEAPPLICATIONS","/NORESTART"],{detached:true,windowsHide:true,stdio:"ignore"});
  child.unref();
  settingsWin?.webContents.send("update:status",{state:"installing",phase:"restart",text:"Installation started. Saeed will close now.",downloaded:result.total,total:info.size});
  setTimeout(()=>app.quit(),700);
  return {ok:true};
 }catch(e){
  try{if(fs.existsSync(out))fs.unlinkSync(out)}catch{}
  settingsWin?.webContents.send("update:status",{state:"error",phase:"error",text:"Update failed: "+e.message});
  throw e;
 }
}
function windowsIconPath(){
 const ico=path.join(__dirname,"..","assets","saeed.ico");
 const png=path.join(__dirname,"..","assets","saeed.png");
 return fs.existsSync(ico)?ico:png;
}
function trayIcon(){
 return nativeImage.createFromPath(windowsIconPath());
}
function setCharacterSize(size){
 if(!characterWin||characterWin.isDestroyed())return;
 const sizes={small:[170,235],medium:[215,295],large:[270,365]};
 const [w,h]=sizes[size]||sizes.medium;
 characterWin.setResizable(false);
 characterWin.setSize(w,h,false);
 characterWin.setContentSize(w,h,false);
 placeCharacterBottomRight();
 characterWin.webContents.send("character:size",size);
 if(agent){agent.settings={...agent.settings,characterSize:size};}
}
function rebuildTrayMenu(){
 if(!tray||!agent)return;
 const mode=agent.settings?.micMode||"off";
 tray.setContextMenu(Menu.buildFromTemplate([
  {label:"Show Saeed",click:showCharacter},
  {label:"Chat",click:showChat},
  {type:"separator"},
  {label:"Always Listening",type:"radio",checked:mode==="always",click:()=>setMicMode("always")},
  {label:"Push to Talk",type:"radio",checked:mode==="push",click:()=>setMicMode("push")},
  {label:"Mic Off",type:"radio",checked:mode==="off",click:()=>setMicMode("off")},
  {type:"separator"},
  {label:"Saeed Size",submenu:[
   {label:"Small",click:()=>setCharacterSize("small")},
   {label:"Medium",click:()=>setCharacterSize("medium")},
   {label:"Large",click:()=>setCharacterSize("large")}
  ]},
  {label:"Check for Updates",click:()=>checkForUpdates({showDialog:true}).catch(e=>dialog.showErrorBox("Saeed AI Updates",e.message))},
  {label:"Settings",click:showSettings},
  {label:"Close Saeed",click:()=>app.quit()}
 ]));
}
function contextMenu(target=win){
 const menu=Menu.buildFromTemplate([
  {label:"Chat",click:showChat},
  {label:"Hide Saeed",click:hideCharacter},
  {type:"separator"},
  {label:"Capture Screen",click:async()=>{const image=await captureScreen();await showChat();win?.webContents.send("screen:capture",image)}},
  {label:"Settings",click:showSettings},
  {type:"separator"},
  {label:"Close Saeed",click:()=>app.quit()}
 ]);
 menu.popup({window:target||win});
}
async function createChatWindow(){
 if(win&&!win.isDestroyed())return win;
 win=new BrowserWindow({
  name:"saeed-main",icon:windowsIconPath(),title:"Saeed AI — Chat",
  width:WINDOW.width,height:WINDOW.height,minWidth:WINDOW.minWidth,minHeight:WINDOW.minHeight,
  frame:false,transparent:false,alwaysOnTop:false,show:false,hasShadow:false,resizable:true,skipTaskbar:false,
  webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}
 });
 win.setIcon(windowsIconPath());
 if(process.platform==="win32")win.setAppDetails({appId:"ai.saeed.desktop",appIconPath:windowsIconPath(),appIconIndex:0,relaunchCommand:process.execPath,relaunchDisplayName:"Saeed AI"});
 win.setAlwaysOnTop(false);
 win.on("close",e=>{if(!app.isQuitting){e.preventDefault();win.destroy()}});
 win.on("closed",()=>{win=null});
 win.webContents.on("context-menu",()=>contextMenu(win));
 win.on("move",keepWindowVisible);
 await win.loadFile(path.join(__dirname,"chat.html"));
 placeBottomRight();
 return win;
}
async function createWindow(){
 const registry=new ToolRegistry({captureScreen,userDataPath:app.getPath("userData")});
 registry.confirm=({name,args})=>new Promise(resolve=>{
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,7);confirmations.set(id,resolve);
  showChat().then(()=>win?.webContents.send("agent:confirm",{id,name,args}));
 });
 agent=new Agent({registry,onEvent:e=>win?.webContents.send("agent:event",e)});
 registry.setPermissions(agent.settings.permissions);
 characterWin=new BrowserWindow({
  name:"saeed-character",width:215,height:295,minWidth:150,minHeight:200,
  frame:false,transparent:true,alwaysOnTop:true,show:false,resizable:false,skipTaskbar:true,hasShadow:false,
  backgroundColor:"#00000000",
  webPreferences:{preload:path.join(__dirname,"character-preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}
 });
 characterWin.setAlwaysOnTop(true,"floating");
 characterWin.on("closed",()=>{characterWin=null});
 characterWin.webContents.on("context-menu",()=>contextMenu(characterWin));
 characterWin.webContents.on("did-fail-load",(_,code,desc)=>console.error("Saeed character load failed:",code,desc));
 characterWin.once("ready-to-show",()=>{setCharacterSize(agent?.settings?.characterSize||"medium");placeCharacterBottomRight();characterWin.show()});
 characterWin.loadFile(path.join(__dirname,"character.html")).catch(e=>console.error("Saeed character startup failed:",e));
}
app.whenReady().then(async()=>{
 app.setAppUserModelId("ai.saeed.desktop");
 try{await createWindow();await configureVoiceAndEmail()}catch(e){console.error("Saeed startup failed:",e);app.quit();return}
 try{
  tray=new Tray(trayIcon());
  tray.setToolTip("Saeed AI");
  rebuildTrayMenu();
 }catch(e){console.error("Tray failed:",e)}
 globalShortcut.register("CommandOrControl+Shift+M",showChat);
 globalShortcut.register("CommandOrControl+Shift+S",async()=>{
  try{const image=await captureScreen();await showChat();win?.webContents.send("screen:capture",image)}
  catch(e){console.error("Screen capture failed:",e)}
 });
 const refresh=()=>{if(win)fitWindowToDisplay(displayForWindow())};
 screen.on("display-added",refresh);
 screen.on("display-removed",()=>{if(win)keepWindowVisible()});
 screen.on("display-metrics-changed",refresh);
});
ipcMain.handle("chat",async(_,payload)=>{
 if(!agent)return {ok:false,error:"Saeed is still starting."};
 const data=typeof payload==="string"?{text:payload}:payload||{};
 try{
  const result=await agent.run(String(data.text||""),data.image||null,data.attachment||null);
  if(result)await speakText(result);
  return result;
 }catch(e){
  const message="لا أستطيع تنفيذ الطلب الآن. "+String(e?.message||e);
  await speakText(message,{forceLocal:true});
  return {error:message};
 }
});
ipcMain.handle("settings:get",()=>agent?.publicSettings()||null);
ipcMain.handle("character:select",async()=>{
 const result=await dialog.showOpenDialog(settingsWin||win,{title:"Choose Saeed character",filters:[{name:"GLB character",extensions:["glb"]}],properties:["openFile"]});
 if(result.canceled||!result.filePaths[0])return null;
 const source=result.filePaths[0], dir=path.join(app.getPath("userData"),"characters");
 fs.mkdirSync(dir,{recursive:true});
 const safe=path.basename(source).replace(/[^a-zA-Z0-9._-]/g,"_");
 const dest=path.join(dir,Date.now()+"-"+safe);
 fs.copyFileSync(source,dest);
 agent.settings={...agent.settings,characterPath:dest};
 characterWin?.webContents.send("character:path",pathToFileURL(dest).href);
 return {name:safe,path:dest};
});
ipcMain.handle("character:current",()=>agent?.settings?.characterPath||"");
ipcMain.handle("attachment:pick",async()=>{
 const result=await dialog.showOpenDialog(win,{title:"Attach file to Saeed",properties:["openFile"],filters:[{name:"Documents",extensions:["txt","md","json","csv","html","xml","pdf"]},{name:"Images",extensions:["png","jpg","jpeg","webp"]},{name:"All files",extensions:["*"]}]});
 if(result.canceled||!result.filePaths[0])return null;
 const filePath=result.filePaths[0],stat=fs.statSync(filePath),name=path.basename(filePath),ext=path.extname(name).toLowerCase();
 let text=null,image=null;
 if(stat.size<=2*1024*1024&&[".txt",".md",".json",".csv",".html",".xml"].includes(ext))text=fs.readFileSync(filePath,"utf8");
 if(stat.size<=8*1024*1024&&[".png",".jpg",".jpeg",".webp"].includes(ext))image="data:image/"+ext.slice(1).replace("jpg","jpeg")+";base64,"+fs.readFileSync(filePath).toString("base64");
 return {name,size:stat.size,path:filePath,text,image};
});
ipcMain.handle("settings:set",async(_,s)=>{
 if(!agent)throw new Error("Saeed is still starting.");
 agent.settings={...(s||{})};
 agent.registry.setPermissions(agent.settings.permissions);
 await configureVoiceAndEmail();
 setCharacterSize(agent.settings.characterSize||"medium");
 rebuildTrayMenu();
 return agent.publicSettings();
});
ipcMain.handle("realtime:start",async(_,options={})=>{if(agent?.settings?.sttProvider==="local"){startLocalStt();win?.webContents.send("realtime:state","local-listening");return true}startRealtime(options);return true});
ipcMain.handle("realtime:stop",()=>{stopRealtime();stopLocalStt();return true});
ipcMain.handle("realtime:audio",(_,base64)=>{realtime?.appendAudio(String(base64||""));return true});
ipcMain.handle("realtime:text",(_,text)=>{const t=String(text||"");agent?.registry.setRequestIntent(/(screen|screenshot|capture|desktop|window|mouse|keyboard|type|click|press|open|close|launch|start|focus|move|computer|pc|file|folder|application|app|settings|شاشة|سكرين|لقطة|صورة الشاشة|نافذة|ماوس|فأرة|كيبورد|اكتب|اضغط|انقر|افتح|اغلق|أغلق|شغل|شغّل|حرك|ملف|مجلد|تطبيق|حاسوب|كمبيوتر|إعدادات)/i.test(t),t);return realtime?.text(t)||false});
ipcMain.handle("realtime:cancel",()=>{realtime?.cancel();return true});
ipcMain.handle("capture",()=>captureScreen());
ipcMain.handle("email:check",async()=>emailService?emailService.checkNow():{ok:false,error:"Email is not configured."});
ipcMain.handle("email:signout",async()=>{if(emailService){await emailService.signOut();emailService=null;}if(agent){agent.settings={...agent.settings,emailEnabled:false};}return true});
ipcMain.handle("agent:confirm-response",(_,id,approved)=>{const resolve=confirmations.get(id);if(!resolve)return false;confirmations.delete(id);resolve(Boolean(approved));return true;});
ipcMain.handle("history:get",()=>agent?{activeId:agent.activeConversationId,conversations:agent.listConversations(),messages:agent.history}:null);
ipcMain.handle("history:new",()=>{if(!agent)return false;agent.newConversation();win?.webContents.send("history:changed",{activeId:agent.activeConversationId,conversations:agent.listConversations(),messages:agent.history});return true});
ipcMain.handle("history:open",(_,id)=>{if(!agent||!agent.openConversation(id))return false;win?.webContents.send("history:changed",{activeId:agent.activeConversationId,conversations:agent.listConversations(),messages:agent.history});return true});
ipcMain.handle("history:clear",()=>{if(!agent)return false;agent.newConversation();win?.webContents.send("history:changed",{activeId:agent.activeConversationId,conversations:agent.listConversations(),messages:agent.history});return true});
ipcMain.handle("history:delete",()=>{if(!agent)return false;const ok=agent.deleteConversation(agent.activeConversationId);if(ok)win?.webContents.send("history:changed",{activeId:agent.activeConversationId,conversations:agent.listConversations(),messages:agent.history});return ok});

async function configureVoiceAndEmail(){
 if(!agent)return;
 const s=agent.settings||{};
 if(s.emailEnabled&&s.email?.incoming?.host){
  if(!emailService)emailService=new EmailService({onMail:mail=>win?.webContents.send("email:new",mail)});
  await emailService.configure(s.email);
 }else if(emailService){await emailService.signOut();emailService=null}
 if(s.micMode==="off"){stopRealtime();stopLocalStt();win?.webContents.send("realtime:state","disconnected");return}
 if(s.sttProvider==="local"){stopRealtime();startLocalStt();win?.webContents.send("realtime:state","local-listening");return}
 stopLocalStt();startRealtime();
}
function powershellEncoded(command){return Buffer.from(String(command),"utf16le").toString("base64")}
async function speakText(text,{forceLocal=false}={}){
 const s=agent?.settings||{},value=String(text||"").trim();if(!value)return;
 if(!forceLocal&&s.ttsProvider==="api"&&s.ttsApiKey){
  try{
   const res=await fetch((s.ttsBaseUrl||"https://api.openai.com/v1").replace(/\/$/,"")+"/audio/speech",{method:"POST",headers:{"Authorization":"Bearer "+s.ttsApiKey,"Content-Type":"application/json"},body:JSON.stringify({model:s.ttsModel||"gpt-4o-mini-tts",voice:s.ttsVoice||"alloy",input:value,response_format:"wav"})});
   if(res.ok){const buf=Buffer.from(await res.arrayBuffer()),out=path.join(app.getPath("temp"),"saeed-speech-"+Date.now()+".wav");fs.writeFileSync(out,buf);playWav(out);return}
  }catch{}
 }
 try{
  if(localSpeechProcess&&!localSpeechProcess.killed)localSpeechProcess.kill();
  const script="$ErrorActionPreference='SilentlyContinue';Add-Type -AssemblyName System.Speech;$v=New-Object System.Speech.Synthesis.SpeechSynthesizer;$v.Rate=0;$v.Volume=100;$v.Speak([Console]::In.ReadToEnd());$v.Dispose()";
  localSpeechProcess=spawn("powershell.exe",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-EncodedCommand",powershellEncoded(script)],{windowsHide:true,stdio:["pipe","ignore","ignore"]});
  localSpeechProcess.stdin.end(value);
 }catch(e){console.error("Local TTS failed:",e)}
}
function playWav(file){
 try{
  const script="$p=New-Object System.Media.SoundPlayer -ArgumentList ([Console]::In.ReadToEnd());$p.PlaySync();$p.Dispose()";
  const p=spawn("powershell.exe",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-EncodedCommand",powershellEncoded(script)],{windowsHide:true,stdio:["pipe","ignore","ignore"]});
  p.stdin.end(file);
 }catch{}
}
function startLocalStt(){
 if(localSttProcess||!agent)return;
 const script="Add-Type -AssemblyName System.Speech;$e=New-Object System.Speech.Recognition.SpeechRecognitionEngine;$e.SetInputToDefaultAudioDevice();$g=New-Object System.Speech.Recognition.DictationGrammar;$e.LoadGrammar($g);$e.add_SpeechRecognized({param($s,$x)if($x.Result -and $x.Result.Text){[Console]::Out.WriteLine('TEXT:'+ $x.Result.Text);[Console]::Out.Flush()}});$e.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple);while($true){Start-Sleep -Milliseconds 500}";
 localSttProcess=spawn("powershell.exe",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-EncodedCommand",powershellEncoded(script)],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
 localSttProcess.stdout.on("data",chunk=>String(chunk).split(/\r?\n/).forEach(line=>{if(line.startsWith("TEXT:"))handleSpokenText(line.slice(5).trim())}));
 localSttProcess.stderr.on("data",d=>console.error("Local STT:",String(d)));
 localSttProcess.on("exit",()=>{localSttProcess=null});
}
function stopLocalStt(){try{localSttProcess?.kill()}catch{}localSttProcess=null}
async function handleSpokenText(text){
 if(!text||!agent)return;
 win?.webContents.send("realtime:user-final",text);
 try{const answer=await agent.run(text);if(answer)await speakText(answer)}catch(e){await speakText("لا أستطيع الوصول إلى العقل الآن. "+e.message,{forceLocal:true})}
}
function stopRealtime(){
 if(realtime){realtime.stop();realtime=null}
 win?.webContents.send("realtime:state","disconnected");
}
function startRealtime(options={}){
 const s=agent?.settings||{};
 const key=s.realtimeApiKey||s.apiKey||"";
 if(!key || s.provider==="ollama"){win?.webContents.send("realtime:state","not-configured","OpenAI API key is not configured.");return false}
 if(realtime) realtime.stop();
 const registry=agent?.registry;
 const realtimeTools=(registry?.schemas?.()||[]).map(t=>({
  type:"function",
  name:t.function?.name,
  description:t.function?.description||"",
  parameters:t.function?.parameters||{type:"object",properties:{},required:[]}
 })).filter(t=>t.name);
 const {OpenAIRealtime}=require("./realtime");
 realtime=new OpenAIRealtime({
  state:(state,message)=>{win?.webContents.send("realtime:state",state,message);if(state==="error"&&message) speakText("لا أستطيع الوصول إلى خدمة الصوت الآن.",{forceLocal:true}).catch(()=>{})},
  event:async(event)=>{
   if(event.type==="response.output_audio.delta"&&event.delta)win?.webContents.send("realtime:audio",event.delta);
   else if(event.type==="response.output_audio_transcript.delta"&&event.delta)win?.webContents.send("realtime:assistant-delta",event.delta);
   else if(event.type==="response.output_audio_transcript.done"&&event.transcript)win?.webContents.send("realtime:assistant-final",event.transcript);
   else if(event.type==="conversation.item.input_audio_transcription.delta"&&event.delta)win?.webContents.send("realtime:user-delta",event.delta);
   else if(event.type==="conversation.item.input_audio_transcription.completed"&&event.transcript){agent?.registry.setRequestIntent(/(screen|screenshot|capture|desktop|window|mouse|keyboard|type|click|press|open|close|launch|start|focus|move|computer|pc|file|folder|application|app|settings|شاشة|سكرين|لقطة|صورة الشاشة|نافذة|ماوس|فأرة|كيبورد|اكتب|اضغط|انقر|افتح|اغلق|أغلق|شغل|شغّل|حرك|ملف|مجلد|تطبيق|حاسوب|كمبيوتر|إعدادات)/i.test(String(event.transcript)),String(event.transcript));win?.webContents.send("realtime:user-final",event.transcript);}
   else if(event.type==="response.function_call_arguments.done"&&event.call_id){
    const name=String(event.name||"");
    let args={};
    try{args=JSON.parse(event.arguments||"{}")}catch{args={}};
    win?.webContents.send("agent:event",{type:"tool",name,args,source:"realtime"});
    let out;
    try{out=await registry.call(name,args)}catch(e){out={ok:false,error:e.message}};
    if(out?.ok===false)win?.webContents.send("agent:event",{type:"tool_error",name,error:out.error||"Tool failed",source:"realtime"});
    else win?.webContents.send("agent:event",{type:"tool_result",name,result:out,source:"realtime"});
    realtime?.toolResult(event.call_id,out||{ok:false,error:"Tool returned no result"});
   }
   else if(event.type==="response.done")win?.webContents.send("realtime:done",event.response?.status||"completed");
   else if(event.type==="error")win?.webContents.send("realtime:error",event.error?.message||"Realtime API error");
  }
 });
 realtime.start(key,{model:s.realtimeModel||"gpt-realtime-2.1",voice:s.realtimeVoice||"marin",tools:realtimeTools});
 return true;
}
ipcMain.on("window:move-by",(_,dx,dy)=>{
 const target=characterWin&&!characterWin.isDestroyed()?characterWin:win;
 if(!target)return;
 const [x,y]=target.getPosition(),[w,h]=target.getSize();
 const nextX=x+Math.round(Number(dx)||0),nextY=y+Math.round(Number(dy)||0);
 const center={x:nextX+w/2,y:nextY+h/2};
 const d=screen.getDisplayNearestPoint(center)||screen.getPrimaryDisplay();
 const a=d.workArea;
 const nx=Math.max(a.x,Math.min(nextX,a.x+Math.max(0,a.width-w)));
 const ny=Math.max(a.y,Math.min(nextY,a.y+Math.max(0,a.height-h)));
 target.setPosition(nx,ny,true);
});
ipcMain.on("character:move-by",(_,dx,dy)=>{
 if(!characterWin||characterWin.isDestroyed())return;
 const [x,y]=characterWin.getPosition(),[w,h]=characterWin.getSize();
 const nextX=x+Math.round(Number(dx)||0),nextY=y+Math.round(Number(dy)||0);
 const d=screen.getDisplayNearestPoint({x:nextX+w/2,y:nextY+h/2})||screen.getPrimaryDisplay();
 const a=d.workArea;
 const nx=Math.max(a.x,Math.min(nextX,a.x+Math.max(0,a.width-w)));
 const ny=Math.max(a.y,Math.min(nextY,a.y+Math.max(0,a.height-h)));
 characterWin.setPosition(nx,ny,true);
});
ipcMain.on("window:show-chat",showChat);
ipcMain.on("character:ready",()=>{if(!characterWelcomed){characterWelcomed=true;speakWelcome()}});
ipcMain.on("window:open-settings",showSettings);
ipcMain.on("window:minimize",()=>win?.minimize());
ipcMain.on("window:hide",()=>win?.hide());
ipcMain.on("app:quit",()=>app.quit());
ipcMain.on("settings:close",()=>settingsWin?.close());
ipcMain.handle("updates:check",()=>checkForUpdates());
ipcMain.handle("updates:install",(_,info)=>installUpdate(info));
app.on("activate",()=>{showCharacter()});
app.on("window-all-closed",()=>{});
app.on("before-quit",()=>{app.isQuitting=true;try{stopRealtime()}catch{};try{stopLocalStt()}catch{};try{localSpeechProcess?.kill()}catch{};try{emailService?.signOut()}catch{};try{characterWin?.destroy()}catch{};try{win?.destroy()}catch{};try{settingsWin?.destroy()}catch{};try{tray?.destroy()}catch{}});
app.on("will-quit",()=>globalShortcut.unregisterAll());