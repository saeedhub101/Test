const fs=require("fs"),path=require("path");
class Memory{
 constructor(){
  this.file=path.join(require("electron").app.getPath("userData"),"memory.json");
  try{this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,"utf8")):[]}catch{this.data=[]}
  if(!Array.isArray(this.data))this.data=[];
 }
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.data,null,2),"utf8")}
 add(text,tags=[]){const value=String(text||"").trim();if(!value)return null;const existing=this.search(value).find(x=>x.text.toLowerCase()===value.toLowerCase());if(existing)return existing;const item={id:Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,6),text:value,tags:Array.isArray(tags)?tags.map(String):[],created:new Date().toISOString(),updated:new Date().toISOString()};this.data.push(item);this.save();return item}
 search(q){const raw=String(q||"").trim().toLowerCase(),words=raw.split(/\s+/).filter(w=>w.length>1);if(!words.length)return[];return this.data.map(x=>{const hay=(String(x.text)+" "+(Array.isArray(x.tags)?x.tags.join(" "):"")).toLowerCase();const score=words.reduce((n,w)=>n+(hay.includes(w)?1:0),0)+(raw&&hay.includes(raw)?2:0);return{...x,_score:score}}).filter(x=>x._score>0).sort((a,b)=>(b._score-a._score)||String(b.updated||b.created).localeCompare(String(a.updated||a.created))).slice(0,20).map(({_score,...x})=>x)}
 list(limit=50){return this.data.slice(-Math.max(1,Math.min(200,Number(limit)||50))).reverse()}
 forget(query){const q=String(query||"").trim().toLowerCase();if(!q)return{removed:0};const before=this.data.length;this.data=this.data.filter(x=>String(x.id).toLowerCase()!==q&&!String(x.text).toLowerCase().includes(q));const removed=before-this.data.length;if(removed)this.save();return{removed}}
 clear(){const count=this.data.length;this.data=[];this.save();return{removed:count}}
}
module.exports={Memory};
