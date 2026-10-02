const fs=require("fs"),path=require("path"),{Memory}=require("../memory");
function schemas(){return[
 {type:"function",function:{name:"add_task",description:"Persist a task.",parameters:{type:"object",properties:{title:{type:"string"}},required:["title"]}}},
 {type:"function",function:{name:"list_tasks",description:"List saved tasks.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"complete_task",description:"Complete a saved task.",parameters:{type:"object",properties:{id:{type:"string"}},required:["id"]}}},
 {type:"function",function:{name:"remove_task",description:"Remove a saved task.",parameters:{type:"object",properties:{id:{type:"string"}},required:["id"]}}},
 {type:"function",function:{name:"remember",description:"Remember a fact explicitly requested by the user.",parameters:{type:"object",properties:{fact:{type:"string"}},required:["fact"]}}},
 {type:"function",function:{name:"recall",description:"Search persistent memory.",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}},
 {type:"function",function:{name:"list_memory",description:"List saved memory items.",parameters:{type:"object",properties:{limit:{type:"integer"}},required:[]}}},
 {type:"function",function:{name:"forget",description:"Forget saved memory matching an id or text fragment.",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}}
]}
function create(c){
 if(!c.memory)c.memory=new Memory();
 if(!c.tasksFile)c.tasksFile=path.join(c.userDataPath,"tasks.json");
 if(!c.tasks){
  try{c.tasks=JSON.parse(fs.readFileSync(c.tasksFile,"utf8"))}
  catch{c.tasks=[]}
 }
}
function save(c){fs.mkdirSync(c.userDataPath,{recursive:true});fs.writeFileSync(c.tasksFile,JSON.stringify(c.tasks,null,2),"utf8")}
function call(name,a,c){create(c);if(name==="add_task"){const t={id:Date.now().toString(),title:String(a.title),done:false,created:new Date().toISOString()};c.tasks.push(t);save(c);return{ok:true,task:t}}if(name==="list_tasks")return{ok:true,tasks:c.tasks};if(name==="complete_task"){const t=c.tasks.find(x=>x.id===a.id);if(!t)return{ok:false,error:"Task not found"};t.done=true;t.completed=new Date().toISOString();save(c);return{ok:true,task:t}}if(name==="remove_task"){const before=c.tasks.length;c.tasks=c.tasks.filter(x=>x.id!==a.id);save(c);return{ok:c.tasks.length!==before}}if(name==="remember")return{ok:true,saved:c.memory.add(a.fact)};if(name==="recall")return{ok:true,matches:c.memory.search(a.query)};if(name==="list_memory")return{ok:true,items:c.memory.list(a.limit)};if(name==="forget")return{ok:true,...c.memory.forget(a.query)};return null}
module.exports={schemas,call};
