const $=id=>document.getElementById(id);
let state={};let settings={};
let apiResults={};let apiBusy=false;
const apiNames={brain:"Brain API",tts:"TTS API",stt:"STT API",realtime:"Realtime API"};
function renderApi(){const el=$("apiCards");if(!el)return;el.innerHTML=["brain","tts","stt","realtime"].map(k=>{const v=apiResults[k]||{};const ok=v.connected===true,known=Object.keys(v).length>0;return '<div class="apiCard"><div class="row"><i class="dot '+(known?(ok?"ok":"err"):"warn")+'"></i><span class="name">'+apiNames[k]+'</span><span class="state">'+(known?(ok?"CONNECTED":"FAILED"):"NOT TESTED")+'</span></div><div class="apiLine"><b>Provider</b><span>'+esc(v.provider||"—")+'</span></div><div class="apiLine"><b>Model</b><span>'+esc(v.model||"—")+'</span></div><div class="apiLine"><b>Endpoint</b><span>'+esc(v.endpoint||"—")+'</span></div>'+(v.latencyMs!=null?'<div class="apiLine"><b>Latency</b><span>'+esc(v.latencyMs)+" ms</span></div>":"")+'<div class="apiDetail '+(known?(ok?"good":"bad"):"")+'">'+esc(v.detail||"Click Test All APIs")+'</div><button class="apiTest" data-service="'+k+'" '+(apiBusy?"disabled":"")+'>Test '+apiNames[k]+'</button></div>'}).join("");el.querySelectorAll(".apiTest").forEach(b=>b.onclick=()=>testApi(b.dataset.service));}
async function testApi(service){if(apiBusy)return;apiBusy=true;renderApi();try{apiResults[service]=await window.saeed.testApiConnection(service)}catch(e){apiResults[service]={connected:false,provider:"Status test",model:"—",endpoint:"—",detail:e.message}}finally{apiBusy=false;renderApi()}}
async function testAllApis(){if(apiBusy)return;apiBusy=true;renderApi();try{const rows=await window.saeed.testAllApiConnections();apiResults={};rows.forEach(x=>apiResults[x.service]=x)}catch(e){console.error(e)}finally{apiBusy=false;renderApi()}}

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const label={unknown:"UNKNOWN",ready:"READY",active:"ACTIVE",connected:"CONNECTED",error:"ERROR",disconnected:"DISCONNECTED",disabled:"DISABLED"};
function cls(v){if(v==="error")return"err";if(v==="connected"||v==="active"||v==="ready")return"ok";return"warn"}
function render(){
 const items=[["mic","Microphone"],["cpu","CPU"],["brainApi","Brain API"],["brainLocal","Brain Local"],["stt","STT"],["tts","TTS"],["glb","GLB / Character"]];
 $("cards").innerHTML=items.map(([k,n])=>{const v=state[k]||{};const level=k==="mic"?Math.max(0,Math.min(1,Number(v.level||0))):0;return `<div class="card"><div class="row"><i class="dot ${cls(v.state)}"></i><span class="name">${n}</span><span class="state">${esc(label[v.state]||String(v.state||"UNKNOWN").toUpperCase())}</span></div><div class="detail">${esc(v.detail||"No verified state yet")}</div>${k==="mic"?`<div class="meter"><i style="width:${Math.round(level*100)}%"></i></div><div class="levelText">Input level ${Math.round(level*100)}%</div>`:k==="cpu"?`<div class="meter"><i style="width:${Math.min(100,Math.max(0,Number(v.percent||0)))}%"></i></div><div class="levelText">CPU ${Number(v.percent||0).toFixed(1)}%</div>`:""}</div>`}).join("");
 $("modeValue").textContent="Auto — Local first, API on demand";$("micValue").textContent=settings.micMode==="on"?"Mic ON":"Mic OFF";
}
function add(e){return;}async function refresh(){try{const x=await window.saeed.getDiagnosticSnapshot();state=x?.state||{};render();const s=await window.saeed.getSettings();settings=s||{};render()}catch(e){add({time:new Date().toISOString(),level:"ERROR",stage:"STATUS",message:e.message})}}
$("refresh").onclick=refresh;
$("testAllApis").onclick=()=>testAllApis();
renderApi();
async function setMic(mode){
 try{await window.saeed.setMicMode(mode);await refresh()}
 catch(e){console.error("Microphone control failed:",e);add({time:new Date().toISOString(),level:"ERROR",stage:"MIC CONTROL",message:e.message})}
}
$("micOn").onclick=()=>setMic("on");
$("micOff").onclick=()=>setMic("off");
window.saeed.onStatusSnapshot(x=>{state=x?.state||{};render()});
window.saeed.onMicMode?.(mode=>{
 settings={...settings,micMode:String(mode||"off")};
 state.mic={...(state.mic||{}),state:String(mode||"off")==="on"?"active":"disabled",detail:String(mode||"off")==="on"?"Microphone ON":"Microphone OFF",level:String(mode||"off")==="on"?(state.mic?.level||0):0};
 render();
});
window.saeed.onMicLevel?.(level=>{
 state.mic={...(state.mic||{}),level:Number(level)||0,state:Number(level)>0?"active":(settings.micMode==="on"?"active":"disabled")};
 render();
});
window.saeed.onDiagnosticState(x=>{state=x||{};render()});
refresh();
