const fs=require("fs"),http=require("http"),{spawn}=require("child_process"),WebSocket=require("ws");
const exe=process.argv[2];if(!exe||!fs.existsSync(exe))throw new Error("Packaged Saeed executable not found: "+exe);
const port=9229,out=fs.openSync("saeed-e2e-stdout.log","w"),err=fs.openSync("saeed-e2e-stderr.log","w");
const child=spawn(exe,[`--remote-debugging-port=${port}`],{stdio:["ignore",out,err]});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function getJson(path){return new Promise((resolve,reject)=>{const req=http.get({host:"127.0.0.1",port,path},res=>{let b="";res.on("data",d=>b+=d);res.on("end",()=>{try{resolve(JSON.parse(b))}catch(e){reject(e)}})});req.on("error",reject);req.setTimeout(3000,()=>req.destroy(new Error("timeout")))})}
async function pages(){return getJson("/json/list")}
async function waitFor(test,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){try{const ps=await pages();const hit=ps.find(test);if(hit)return hit}catch{}await sleep(300)}throw new Error("Timed out waiting for renderer")}
function evaluate(url,expression){return new Promise((resolve,reject)=>{const ws=new WebSocket(url),timer=setTimeout(()=>{try{ws.close()}catch{};reject(new Error("CDP timeout after 60000ms"))},60000);ws.on("open",()=>ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression,returnByValue:true,awaitPromise:true}})));ws.on("message",raw=>{try{const m=JSON.parse(raw);if(m.id===1){clearTimeout(timer);try{ws.close()}catch{};if(m.error)reject(new Error(m.error.message));else resolve(m.result?.result?.value)}}catch{}});ws.on("error",e=>{clearTimeout(timer);reject(e)})})}
async function evaluateTitle(title,expression){
 for(let attempt=0;attempt<5;attempt++){
  try{
   const ps=await pages();
   const target=ps.find(x=>x.type==="page"&&x.title===title&&x.webSocketDebuggerUrl);
   if(!target)throw new Error("CDP target not found: "+title);
   return await evaluate(target.webSocketDebuggerUrl,expression);
  }catch(e){
   if(attempt===4)throw e;
   await sleep(1000);
  }
 }
}
(async()=>{let failed=false;try{
 const char=await waitFor(x=>x.type==="page"&&x.title==="Saeed AI — Character"&&x.webSocketDebuggerUrl,30000);
 await sleep(5000);
 await evaluateTitle("Saeed AI — Character","window.saeedCharacter.openChat();true");
 const chat=await waitFor(x=>x.type==="page"&&x.title==="Saeed AI — Chat"&&x.webSocketDebuggerUrl,30000);
 const charReadyEnd=Date.now()+90000;
 while(Date.now()<charReadyEnd){
  const state=await evaluateTitle("Saeed AI — Character",'({webgl:document.documentElement.dataset.saeedWebglReady==="true",renderer:document.documentElement.dataset.saeedRendererReady==="true",gltf:document.documentElement.dataset.saeedGltfReady==="true",error:document.documentElement.dataset.saeedCharacterError||""})');
  if(state?.error)throw new Error("Character renderer error: "+state.error);
  if(state?.webgl&&state?.renderer&&state?.gltf)break;
  await sleep(1500);
 }
 const checks=[
  ["WebGL marker",'document.documentElement.dataset.saeedWebglReady==="true"'],
  ["3D renderer marker",'document.documentElement.dataset.saeedRendererReady==="true"'],
  ["GLB loaded marker",'document.documentElement.dataset.saeedGltfReady==="true"'],
  ["character no error",'!window.__SAEED_CHARACTER_ERROR__'],
  ["character canvas",'!!document.querySelector("canvas")']
 ];
 for(const [n,e] of checks){if(!(await evaluateTitle("Saeed AI — Character",e)))throw new Error("Character check failed: "+n)}
 const chatChecks=[
  ["chat UI",'!!document.querySelector("#messages")&&!!document.querySelector("#input")&&!!document.querySelector("#send")'],
  ["delete control",'!!document.querySelector("#deleteChat")'],
  ["copy support",'typeof navigator.clipboard!=="undefined"'],
  ["microphone controls",'!!document.querySelector("#modeAlways")&&!!document.querySelector("#modePush")&&!!document.querySelector("#modeOff")']
 ];
 for(const [n,e] of chatChecks){if(!(await evaluateTitle("Saeed AI — Chat",e)))throw new Error("Chat check failed: "+n)}
 if(!(await evaluateTitle("Saeed AI — Chat",'typeof window.saeed.deleteChat==="function"&&typeof window.saeed.hideWindow==="function"')))throw new Error("Chat lifecycle bridge missing");
 await evaluateTitle("Saeed AI — Chat",'window.saeed.openSettings();true');await sleep(700);
 const settings=await waitFor(x=>x.type==="page"&&x.title==="Saeed AI — Settings"&&x.webSocketDebuggerUrl,5000);
 if(!(await evaluate(settings.webSocketDebuggerUrl,'!!document.querySelector("#provider")&&!!document.querySelector("#apply")&&!!document.querySelector("#ok")&&!!document.querySelector("#cancel")')))throw new Error("Settings UI failed");
 await evaluate(settings.webSocketDebuggerUrl,'window.saeed.closeSettings();true');
 console.log("Windows E2E smoke passed: character WebGL+GLB + Chat + Settings + IPC + microphone UI.");
}catch(e){failed=true;console.error("Windows E2E smoke failed:",e.stack||e)}finally{try{child.kill()}catch{};await sleep(1200);try{process.kill(child.pid)}catch{};if(failed)process.exitCode=1}})();