const {shell}=require("electron");
function schemas(){return[
 {type:"function",function:{name:"open_url",description:"Open an HTTP/HTTPS URL in the default browser.",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"]}}},
 {type:"function",function:{name:"web_search",description:"Search the web for current information.",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}},
 {type:"function",function:{name:"fetch_web_page",description:"Fetch readable content from a web page when its contents are needed.",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"]}}}
]}
async function call(name,a,c){
 if(name==="open_url"){if(!/^https?:\/\//i.test(a.url))return{ok:false,error:"Only HTTP/HTTPS URLs are allowed"};await shell.openExternal(a.url);return{ok:true,url:a.url}}
 if(name==="web_search"){const q=encodeURIComponent(a.query);const r=await fetch("https://html.duckduckgo.com/html/?q="+q,{headers:{"User-Agent":"SaeedAI/1.0"}});const html=await r.text();return{ok:true,results:[...html.matchAll(/result__a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].slice(0,8).map(m=>({url:m[1],title:m[2].replace(/<[^>]+>/g,"")}))}}
 if(name==="fetch_web_page"){if(!/^https?:\/\//i.test(a.url))return{ok:false,error:"Only HTTP/HTTPS URLs are allowed"};const r=await fetch(a.url,{headers:{"User-Agent":"SaeedAI/1.0"}});if(!r.ok)return{ok:false,error:"HTTP "+r.status};const html=await r.text();return{ok:true,url:a.url,text:html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,200000)}}
 return null;
}
module.exports={schemas,call};