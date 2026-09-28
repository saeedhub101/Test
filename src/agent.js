const fs=require("fs"),path=require("path"),{safeStorage,app}=require("electron");

class Agent{
 constructor({registry,onEvent}){
  this.registry=registry;this.onEvent=onEvent;this.dir=app.getPath("userData");
  this.file=path.join(this.dir,"settings.json");this.historyFile=path.join(this.dir,"conversation.json");
  fs.mkdirSync(this.dir,{recursive:true});
  const raw=this.readJson(this.file,{provider:"openai",baseUrl:"https://api.openai.com/v1",model:"gpt-5",apiKey:"",maxSteps:12,alwaysListening:true,micMode:"always",brainMode:"auto",sttProvider:"local",sttModel:"gpt-4o-mini-transcribe",sttLanguage:"en",ttsProvider:"local",ttsModel:"gpt-4o-mini-tts",ttsVoice:"alloy",voiceProfile:"saeed",showSpeechText:false,speakResponses:true,language:"en",localModel:"llama3.2",ttsBaseUrl:"https://api.openai.com/v1",characterSize:"medium",characterPath:"",emailEnabled:false,email:{incoming:{protocol:"imap",host:"",port:993,secure:true,user:"",password:"",mailbox:"INBOX"},smtp:{host:"",port:465,secure:true,user:"",password:""}},realtimeModel:"gpt-realtime-2.1",realtimeVoice:"marin",micMode:"always",permissions:{}});
  this._settings={...raw,maxSteps:Math.min(24,Math.max(1,Number(raw.maxSteps)||12)),
   apiKey:this.decryptKey(raw.apiKey),
   sttApiKey:this.decryptKey(raw.sttApiKey),
   ttsApiKey:this.decryptKey(raw.ttsApiKey),
   realtimeApiKey:this.decryptKey(raw.realtimeApiKey),
   email:{...(raw.email||{}),incoming:{...(raw.email?.incoming||{}),password:this.decryptKey(raw.email?.incoming?.password)},smtp:{...(raw.email?.smtp||{}),password:this.decryptKey(raw.email?.smtp?.password)}},
   permissions:{...(raw.permissions||{})}
  };
  const stored=this.readJson(this.historyFile,null);
  if(stored&&Array.isArray(stored.conversations)){
   this.conversations=stored.conversations.filter(x=>x&&x.id&&Array.isArray(x.messages)).slice(0,7);
   this.activeConversationId=String(stored.activeConversationId||this.conversations[0]?.id||"");
  }else{
   const legacy=Array.isArray(stored)?stored:[];
   const id=this.newConversationId();
   this.conversations=[{id,title:this.titleFromMessages(legacy),createdAt:Date.now(),updatedAt:Date.now(),messages:legacy.slice(-200)}];
   this.activeConversationId=id;
   this.saveHistory();
  }
  if(!this.conversations.length){
   const id=this.newConversationId();
   this.conversations=[{id,title:"New conversation",createdAt:Date.now(),updatedAt:Date.now(),messages:[]}];
   this.activeConversationId=id;
   this.saveHistory();
  }
  if(!this.conversations.some(x=>x.id===this.activeConversationId))this.activeConversationId=this.conversations[0].id;
 }
 readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}}
 providerDefaults(name){
  return {
   openai:{baseUrl:"https://api.openai.com/v1",model:"gpt-5"},
   anthropic:{baseUrl:"https://api.anthropic.com/v1",model:"claude-sonnet-4-5"},
   gemini:{baseUrl:"https://generativelanguage.googleapis.com/v1beta/openai",model:"gemini-2.5-pro"},
   "openai-compatible":{baseUrl:"",model:""},
   ollama:{baseUrl:"http://localhost:11434/v1",model:"llama3.2"}
  }[name]||{};
 }
 encryptKey(key){try{return key&&safeStorage.isEncryptionAvailable()?safeStorage.encryptString(String(key)).toString("base64"):String(key||"")}catch{return String(key||"")}}
 decryptKey(v){try{return v&&safeStorage.isEncryptionAvailable()?safeStorage.decryptString(Buffer.from(v,"base64")):String(v||"")}catch{return String(v||"")}}
 publicSettings(){const email={...(this._settings.email||{}),incoming:{...(this._settings.email?.incoming||{}),password:""},smtp:{...(this._settings.email?.smtp||{}),password:""}};return{...this._settings,email,apiKey:"",sttApiKey:"",ttsApiKey:"",realtimeApiKey:"",hasApiKey:Boolean(this._settings.apiKey),hasSttApiKey:Boolean(this._settings.sttApiKey),hasTtsApiKey:Boolean(this._settings.ttsApiKey),hasRealtimeApiKey:Boolean(this._settings.realtimeApiKey),hasEmailIncomingPassword:Boolean(this._settings.email?.incoming?.password),hasEmailSmtpPassword:Boolean(this._settings.email?.smtp?.password)}}
 set settings(v){
  const previous=this._settings||{},input=v||{},providerChanged=input.provider&&input.provider!==previous.provider;
  this._settings={...previous,...input,email:{...(previous.email||{}),...(input.email||{}),incoming:{...(previous.email?.incoming||{}),...(input.email?.incoming||{})},smtp:{...(previous.email?.smtp||{}),...(input.email?.smtp||{})}}};
  if(input.clearLlmKey){this._settings.apiKey="";delete this._settings.clearLlmKey}
  if(input.clearAllApiKeys){this._settings.apiKey="";this._settings.sttApiKey="";this._settings.ttsApiKey="";this._settings.realtimeApiKey="";delete this._settings.clearAllApiKeys}
  if(input.apiKey==="")this._settings.apiKey=previous.apiKey||"";
  if(input.sttApiKey==="")this._settings.sttApiKey=previous.sttApiKey||"";
  if(input.ttsApiKey==="")this._settings.ttsApiKey=previous.ttsApiKey||"";
  if(input.realtimeApiKey==="")this._settings.realtimeApiKey=previous.realtimeApiKey||"";
  if(input.email?.incoming?.password==="")this._settings.email.incoming.password=previous.email?.incoming?.password||"";
  if(input.email?.smtp?.password==="")this._settings.email.smtp.password=previous.email?.smtp?.password||"";
  const p=this.providerDefaults(this._settings.provider);
  if(providerChanged){
   if(input.baseUrl===undefined||input.baseUrl===previous.baseUrl)this._settings.baseUrl=p.baseUrl;
   if(input.model===undefined||input.model===previous.model)this._settings.model=p.model;
  }
  if(!this._settings.baseUrl)this._settings.baseUrl=p.baseUrl;
  if(!this._settings.model)this._settings.model=p.model;
  this.persistSettings();
 }
 get settings(){return this._settings}
 persistSettings(){try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify({...this._settings,
   apiKey:this.encryptKey(this._settings.apiKey),
   sttApiKey:this.encryptKey(this._settings.sttApiKey),
   ttsApiKey:this.encryptKey(this._settings.ttsApiKey),
   realtimeApiKey:this.encryptKey(this._settings.realtimeApiKey),email:{...(this._settings.email||{}),incoming:{...(this._settings.email?.incoming||{}),password:this.encryptKey(this._settings.email?.incoming?.password)},smtp:{...(this._settings.email?.smtp||{}),password:this.encryptKey(this._settings.email?.smtp?.password)}}
  },null,2))}catch(e){console.error("Settings save failed:",e)}}
 get activeConversation(){return this.conversations.find(x=>x.id===this.activeConversationId)||this.conversations[0]}
 get history(){return this.activeConversation?.messages||[]}
 set history(v){if(this.activeConversation)this.activeConversation.messages=Array.isArray(v)?v:[]}
 newConversationId(){return "c_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8)}
 titleFromMessages(messages){const first=messages?.find(x=>x.role==="user"&&typeof x.content==="string");const t=String(first?.content||"New conversation").replace(/\s+/g," ").trim();return t.slice(0,52)||( "New conversation")}
 saveHistory(){try{fs.writeFileSync(this.historyFile,JSON.stringify({version:2,activeConversationId:this.activeConversationId,conversations:this.conversations.slice(0,7).map(x=>({...x,messages:x.messages.slice(-200)}))},null,2))}catch(e){console.error("History save failed:",e)}}
 listConversations(){return this.conversations.slice(0,7).map(x=>({id:x.id,title:x.title||"New conversation",updatedAt:x.updatedAt||x.createdAt||0,messageCount:x.messages?.length||0,active:x.id===this.activeConversationId}))}
 newConversation(){const id=this.newConversationId();const now=Date.now();this.conversations.unshift({id,title:"New conversation",createdAt:now,updatedAt:now,messages:[]});this.conversations=this.conversations.slice(0,7);this.activeConversationId=id;this.saveHistory();return this.activeConversation}
 openConversation(id){const found=this.conversations.find(x=>x.id===String(id));if(!found)return false;this.activeConversationId=found.id;found.updatedAt=Date.now();this.saveHistory();return found}
 deleteConversation(id){const target=String(id||"");const index=this.conversations.findIndex(x=>x.id===target);if(index<0)return false;this.conversations.splice(index,1);if(!this.conversations.length){const created=this.newConversation();this.activeConversationId=created.id}else if(this.activeConversationId===target){this.activeConversationId=this.conversations[0].id}this.saveHistory();return true}
 async run(text,image=null,attachment=null){
  const explicitComputerRequest=/(screen|screenshot|capture|desktop|window|mouse|keyboard|type|click|press|open|close|launch|start|focus|move|computer|pc|file|folder|application|app|powershell|settings|شاشة|سكرين|لقطة|صورة الشاشة|نافذة|ماوس|فأرة|كيبورد|لوحة المفاتيح|اكتب|اضغط|انقر|افتح|اغلق|أغلق|شغل|شغّل|حرك|ملف|مجلد|تطبيق|حاسوب|كمبيوتر|إعدادات)/i.test(String(text||""))||Boolean(image);
  this.registry.setRequestIntent(explicitComputerRequest,String(text||""));
  const s=this.settings;if(!String(text).trim())return "اكتب لي المهمة التي تريد تنفيذها.";
  const brainMode=["auto","local","api"].includes(s.brainMode)?s.brainMode:"auto";
  const useLocal=brainMode==="local"||(brainMode==="auto"&&!s.apiKey);
  const provider=useLocal?"ollama":s.provider;
  const apiKey=useLocal?"":s.apiKey;
  if(!useLocal&&!apiKey)return "افتح الإعدادات وأدخل API key أو اختر Local Brain.";
  let userContent=String(text);
if(image)userContent=[{type:"text",text:String(text)},{type:"image_url",image_url:{url:image}}];
if(attachment?.text)userContent=String(userContent)+"\n\n[Attached file: "+attachment.name+"]\n"+attachment.text.slice(0,120000);
else if(attachment?.name)userContent=String(userContent)+"\n\n[Attached file: "+attachment.name+" ("+attachment.size+" bytes)]";
  const messages=[{role:"system",content:"You are Saeed, a desktop AI agent. Complete the user's explicit request and stay focused on it. IMPORTANT: never inspect, screenshot, analyze the screen, open/focus/close applications, move/click the mouse, type or press keys, or otherwise control Windows unless the user explicitly requested that computer action in the current request. Do not perform exploratory computer actions just to decide what to do. If the user did not request a computer action, answer without computer tools. When a computer action is explicitly requested, use the minimum required tools, verify the result, and stop when the request is complete. Never claim success without evidence. Follow the permission policy configured in Saeed Settings."},...this.history.slice(-6),{role:"user",content:userContent}];
  for(let step=0;step<(Math.min(100,Math.max(1,Number(s.maxSteps)||32)));step++){
   this.onEvent({type:"thinking",step});
   const d=this.providerDefaults(provider),base=(useLocal?"http://localhost:11434/v1":(s.baseUrl||d.baseUrl||"")).replace(/\/$/,"");
   const headers={"Content-Type":"application/json"};if(apiKey)headers.Authorization="Bearer "+apiKey;
   const body={model:useLocal?(s.localModel||d.model||"llama3.2"):(s.model||d.model),messages,tools:this.registry.schemas(),tool_choice:"auto"};
   let r;
   try{r=await fetch(base+"/chat/completions",{method:"POST",headers,body:JSON.stringify(body)})}
   catch(e){throw new Error("تعذر الاتصال بمزود الذكاء الاصطناعي: "+e.message)}
   if(!r.ok)throw new Error(await r.text());
   const m=(await r.json()).choices?.[0]?.message;if(!m)throw new Error("No model response");
   if(!m.tool_calls?.length){
    const answer=m.content||"";
    this.history.push({role:"user",content:String(text)},{role:"assistant",content:answer});this.activeConversation.title=this.titleFromMessages(this.history);this.activeConversation.updatedAt=Date.now();this.saveHistory();this.onEvent({type:"answer",text:answer});return answer;
   }
   messages.push(m);
   for(const c of m.tool_calls||[]){
    let a={};try{a=JSON.parse(c.function.arguments||"{}")}catch{messages.push({role:"tool",tool_call_id:c.id,content:JSON.stringify({ok:false,error:"Invalid tool arguments"})});continue}
    this.onEvent({type:"tool",name:c.function.name,args:a});
    let out;try{out=await this.registry.call(c.function.name,a)}catch(e){out={ok:false,error:e.message}}
    if(out?.ok===false)this.onEvent({type:"tool_error",name:c.function.name,error:out.error||"Tool failed"});
    else this.onEvent({type:"tool_result",name:c.function.name,result:out});
    if(c.function.name==="screenshot"&&out.ok&&out.image){
     messages.push({role:"tool",tool_call_id:c.id,content:JSON.stringify({ok:true,description:"Screenshot captured."})});
     messages.push({role:"user",content:[{type:"text",text:"Inspect this current screen image and continue the task."},{type:"image_url",image_url:{url:out.image}}]});
    }else messages.push({role:"tool",tool_call_id:c.id,content:JSON.stringify(out)});
   }
  }
  const answer="توقفت دورة التنفيذ عند الحد الآمن للخطوات. يمكن متابعة المهمة دون فقدان الذاكرة.";
  this.history.push({role:"user",content:String(text)},{role:"assistant",content:answer});this.activeConversation.title=this.titleFromMessages(this.history);this.activeConversation.updatedAt=Date.now();this.saveHistory();return answer;
 }
}
module.exports={Agent};