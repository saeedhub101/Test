const fs=require("fs"),path=require("path"),{shell}=require("electron");

function abs(p){return path.resolve(String(p||""));}

function schemas(){return[
 {type:"function",function:{name:"list_directory",description:"List files and folders in a directory. Use this to locate a requested local file without opening or reading it.",parameters:{type:"object",properties:{directory:{type:"string"},limit:{type:"integer"}},required:["directory"]}}},
 {type:"function",function:{name:"read_file",description:"Read a UTF-8 text file when its contents are actually needed.",parameters:{type:"object",properties:{filePath:{type:"string"}},required:["filePath"]}}},
 {type:"function",function:{name:"write_file",description:"Write or replace a UTF-8 text file only when the user requested a file change.",parameters:{type:"object",properties:{filePath:{type:"string"},content:{type:"string"}},required:["filePath","content"]}}},
 {type:"function",function:{name:"open_file",description:"Open a specific local file with its Windows-associated application. Do not read the file first unless the user asked to inspect its contents.",parameters:{type:"object",properties:{filePath:{type:"string"}},required:["filePath"]}}},
 {type:"function",function:{name:"reveal_file",description:"Show a specific local file in Windows File Explorer without opening it.",parameters:{type:"object",properties:{filePath:{type:"string"}},required:["filePath"]}}}
]}

async function call(name,a){
 const p=abs(a?.filePath);
 if(name==="list_directory"){
  const d=abs(a?.directory||"."); if(!fs.existsSync(d))return{ok:false,error:"Directory not found: "+d};
  const all=fs.readdirSync(d,{withFileTypes:true});const limit=Math.max(1,Math.min(1000,Number(a?.limit)||300));return{ok:true,path:d,files:all.slice(0,limit).map(x=>({name:x.name,directory:x.isDirectory(),path:path.join(d,x.name)})),truncated:all.length>limit,total:all.length};
 }
 if(name==="read_file"){if(!fs.existsSync(p))return{ok:false,error:"File not found: "+p};return{ok:true,path:p,type:"text",content:fs.readFileSync(p,"utf8").slice(0,200000)}}
 if(name==="write_file"){fs.mkdirSync(path.dirname(p),{recursive:true});const content=String(a?.content??"");fs.writeFileSync(p,content,"utf8");return{ok:true,path:p,bytes:Buffer.byteLength(content)}}
 if(name==="open_file"){if(!fs.existsSync(p))return{ok:false,error:"File not found: "+p};const error=await shell.openPath(p);if(error)return{ok:false,error};return{ok:true,path:p,opened:true}}
 if(name==="reveal_file"){if(!fs.existsSync(p))return{ok:false,error:"File not found: "+p};shell.showItemInFolder(p);return{ok:true,path:p,revealed:true}}
 return null;
}
module.exports={schemas,call};