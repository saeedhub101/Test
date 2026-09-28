const fs=require("fs"),path=require("path");
class Memory{
 constructor(){
  this.file=path.join(require("electron").app.getPath("userData"),"memory.json");
  this.data=null;
 }
 ensureLoaded(){
  if(this.data!==null)return;
  try{this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,"utf8")):[]}catch{this.data=[]}
  if(!Array.isArray(this.data))this.data=[];
 }
 save(){this.ensureLoaded();fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.data,null,2),"utf8")}
 add(text,tags=[]){this.ensureLoaded();this.data.push({id:Date.now().toString(),text:String(text),tags:Array.isArray(tags)?tags:[],created:new Date().toISOString()});this.save();return this.data.at(-1)}
 search(q){this.ensureLoaded();const words=String(q||"").toLowerCase().split(/\s+/).filter(Boolean);if(!words.length)return[];return this.data.filter(x=>words.some(w=>(String(x.text)+" "+(Array.isArray(x.tags)?x.tags.join(" "):"")).toLowerCase().includes(w))).slice(-20)}
}
module.exports={Memory};
