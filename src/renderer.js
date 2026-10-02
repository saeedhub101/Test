const $=id=>document.getElementById(id),messages=$("messages");
let chatDragging=false,chatLastX=0,chatLastY=0;
const chatHeader=document.querySelector(".chatHeader");
chatHeader?.addEventListener("mousedown",e=>{if(e.button!==0||e.target.closest("button,.micBadge"))return;chatDragging=true;chatLastX=e.screenX;chatLastY=e.screenY;e.preventDefault()});
window.addEventListener("mousemove",e=>{if(!chatDragging)return;const dx=e.screenX-chatLastX,dy=e.screenY-chatLastY;chatLastX=e.screenX;chatLastY=e.screenY;window.saeed.moveChatBy?.(dx,dy)});
window.addEventListener("mouseup",()=>{chatDragging=false});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function markdown(s){let x=escapeHtml(s);x=x.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>").split("\n").join("<br>");return x}
function add(role,text){const d=document.createElement("div");d.className="msg "+role;d.innerHTML=role==="assistant"?markdown(text):escapeHtml(text).split("\n").join("<br>");messages.appendChild(d);messages.scrollTop=messages.scrollHeight}
function welcomeHtml(){return '<div class="welcome"><div class="suggestions"><button data-prompt="Open File Explorer">Open File Explorer</button><button data-prompt="Show my computer information">Computer info</button><button data-prompt="Check my computer health">Computer health</button><button data-prompt="What is the local time?">Local time</button></div></div>'}
function bindSuggestions(){document.querySelectorAll(".suggestions button").forEach(b=>b.onclick=()=>{$("input").value=b.dataset.prompt||"";send()})}
function resetMessages(){messages.innerHTML=welcomeHtml();bindSuggestions()}
function renderHistory(history=[]){messages.innerHTML="";if(!history.length){resetMessages();return}for(const m of history){if((m?.role==="user"||m?.role==="assistant")&&typeof m.content==="string")add(m.role,m.content)}}
async function refreshChatTabs(){
 const chats=await window.saeed.listChats();const current=await window.saeed.getCurrentChat();const host=$("chatTabs");if(!host)return;
 host.innerHTML="";const b=document.createElement("button");b.className="chatTab new";b.textContent="+ New Chat";b.onclick=async()=>{const r=await window.saeed.newChat();if(r){renderHistory([]);renderChatTabsFrom(r.chat);}};host.appendChild(b);
 for(const chat of chats.slice(0,12)){const tab=document.createElement("button");tab.className="chatTab"+(current?.id===chat.id?" active":"");tab.textContent=chat.title||"New Chat";tab.title=tab.textContent;tab.onclick=async()=>{const r=await window.saeed.selectChat(chat.id);if(r){renderHistory(r.history||[]);renderChatTabsFrom(r.chat);}};host.appendChild(tab)}
}
function renderChatTabsFrom(active){
 window.saeed.listChats().then(chats=>{const host=$("chatTabs"),current=active||null;if(!host)return;host.innerHTML="";const b=document.createElement("button");b.className="chatTab new";b.textContent="+ New Chat";b.onclick=async()=>{const r=await window.saeed.newChat();if(r){renderHistory([]);renderChatTabsFrom(r.chat)}};host.appendChild(b);for(const chat of chats.slice(0,12)){const tab=document.createElement("button");tab.className="chatTab"+(current?.id===chat.id?" active":"");tab.textContent=chat.title||"New Chat";tab.onclick=async()=>{const r=await window.saeed.selectChat(chat.id);if(r){renderHistory(r.history||[]);renderChatTabsFrom(r.chat)}};host.appendChild(tab)}})
}
let busy=false,pendingImage=null,attachments=[];
let realtimeConnected=false;
async function send(){
 if(busy)return;let t=$("input").value.trim();if(!t&&!attachments.length)return;
 if(attachments.length){t=(t?t+"\n\n":"")+"[مرفقات]\n"+attachments.map(a=>"--- "+a.name+" ---\n"+a.text).join("\n");attachments=[];renderAttachments()}
 busy=true;$("input").value="";add("user",t);$("status").textContent="يفكر...";
 const image=pendingImage;pendingImage=null;
 try{const answer=await window.saeed.chat(t,image);if(answer?.error)add("assistant","حدث خطأ: "+answer.error);else if(answer)add("assistant",answer);}
 catch(e){add("assistant","حدث خطأ: "+e.message)}
 finally{busy=false;$("status").textContent="جاهز";refreshChatTabs()}
}
function renderAttachments(){$("attachments").textContent=attachments.length?attachments.map(a=>a.name).join(" • "):""}
$("send").onclick=send;
$("togglePanel").onclick=()=>window.saeed.minimizeChat();
const chatPanel=$("panel");window.saeed.setChatMousePassthrough(false);$("input").ondblclick=()=>window.saeed.showChat();
$("input").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}};
$("closeChat").onclick=()=>window.saeed.closeChat();window.saeed.onDiagnostic(e=>{if(e.level==="ERROR")add("tool","[DIAGNOSTIC] ERROR | "+e.stage+" | "+e.message)});window.saeed.onCharacterSelected(data=>window.saeedAvatarLoadData?.(data));
$("capture").onclick=async()=>{try{pendingImage=await window.saeed.capture();add("tool",pendingImage?"تم التقاط الشاشة. اكتب الآن ما تريد تحليله.":"تعذر التقاط الشاشة.")}catch(e){add("tool","تعذر التقاط الشاشة: "+e.message)}};
window.saeed.onScreenCapture(data=>{if(data){pendingImage=data;add("tool","التقاط الشاشة جاهز للرسالة التالية.")}});
window.saeed.onShowChat(()=>{$("panel").classList.remove("collapsed");$("panel").classList.add("visible");refreshChatTabs()});

window.saeed.onChatSwitched?.((chat,history)=>{renderHistory(history||[]);renderChatTabsFrom(chat);$("status").textContent="Ready"});
window.saeed.onEvent(e=>{if(e.type==="tool")add("tool","تنفيذ: "+e.name);if(e.type==="tool_error")add("tool","فشل: "+e.name+" — "+e.error);if(e.type==="tool_result")$("status").textContent="تحقق من النتيجة...";if(e.type==="thinking"){ $("status").textContent="يخطط / ينفذ..."; window.saeedAvatar?.setState("think"); }if(e.type==="tool"){const n=String(e.name||"");if(n==="mouse_move")window.saeedAvatar?.gesture("happy")}if(e.type==="tool_result"){const n=String(e.name||"");if(n==="open_application"||n==="open_url")window.saeedAvatar?.stop()}if(e.type==="answer"){ $("status").textContent="جاهز"; window.saeedAvatar?.setState("talk"); window.saeedAvatar?.nod(); }});
async function handleDrop(files){let total=attachments.reduce((n,a)=>n+a.size,0);for(const f of [...files]){if(!/^(text\/(plain|csv|markdown)|application\/json|application\/xml)/i.test(f.type)&&!/[.](txt|md|csv|json|xml|log)$/i.test(f.name))continue;if(f.size>256*1024||total+f.size>1024*1024)continue;const text=await f.text();attachments.push({name:f.name,text,size:f.size});total+=f.size}renderAttachments()}
window.saeed.onConfirmation(async e=>{const label={agent_step_increase:"زيادة حد تنفيذ المهمة",write_file:"تعديل ملف",remove_task:"حذف مهمة",mouse_click:"نقرة بالماوس",type_text:"كتابة نص",key_press:"ضغط مفتاح",open_url:"فتح رابط",web_search:"بحث على الويب",screenshot:"التقاط الشاشة",open_application:"فتح تطبيق",reveal_file:"إظهار ملف",focus_window:"تحديد نافذة"}[e.name]||e.name;const category=e.permissionLabel||e.permissionCategory||"Permission";const ok=e.name==="agent_step_increase"?confirm(`تم تجاوز عدد الخطوات المسموح به (${Number(e.args?.currentLimit)||0}). هل تريد زيادتها والمتابعة؟\n\nسيتم زيادة الخطوات مؤقتًا لهذه المهمة فقط، ثم يعود الحد إلى إعداد Performance بعد انتهائها.`):confirm(`سعيد يريد تنفيذ العملية: ${label}\n\nنوع الصلاحية: ${category}\n\nالتفاصيل:\n${JSON.stringify(e.args||{},null,2)}\n\nالسبب: هذه العملية تتطلب موافقتك لأن الصلاحية مضبوطة على Always Ask.\n\nاضغط OK للسماح أو Cancel للرفض.`);await window.saeed.respondConfirmation(e.id,ok);});
let realtimeAssistant="";
window.saeed.onRealtimeState((state,message)=>{const badge=$("micBadge");if(badge)badge.className="micBadge "+state;realtimeConnected=state==="connected";$("status").textContent=state==="connected"?"الصوت متصل":state==="connecting"?"يتصل بالصوت...":state==="not-configured"?"أدخل OpenAI API key":"الصوت: "+state;});
window.saeed.onRealtimeAssistantDelta(t=>{realtimeAssistant+=t;window.saeedAvatar?.play("talk");});
window.saeed.onRealtimeAssistantFinal(t=>{if(t){add("assistant",t);realtimeAssistant="";}});
window.saeed.onRealtimeUserFinal(t=>{if(t){const clean=String(t).replace(/^[\s\.,!?؟،؛:。]+/u,"").trim();if($("input").value.trim()===""&&clean)add("user",clean)}});
window.saeed.onRealtimeError(e=>{window.saeed.reportDiagnostic("ERROR","REALTIME API ERROR",String(e));$("status").textContent="Realtime: "+e});
window.saeed.onMicMode?.(mode=>{const m=String(mode||"off");const badge=$("micBadge");if(badge){badge.className="micBadge "+m;badge.textContent=m==="on"?"MIC ON":"MIC OFF"}$("status").textContent=m==="on"?"Microphone on":"Microphone off"});
window.addEventListener("load",async()=>{try{$("status").textContent="Ready";bindSuggestions();refreshChatTabs();}catch(e){console.warn("Startup:",e);window.saeed.reportDiagnostic("ERROR","STARTUP",e.message)}});

$("clearChat").onclick=async()=>{if(!confirm("Clear this conversation?"))return;try{const ok=await window.saeed.clearHistory();if(ok){resetMessages();refreshChatTabs();$("status").textContent="Conversation cleared"}}catch(e){add("tool","Clear error: "+e.message)}};
