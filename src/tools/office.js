const fs=require("fs"),path=require("path");
let XLSX=null,pdfParser=null;
function xlsx(){if(XLSX===null){try{XLSX=require("xlsx")}catch{XLSX=false}}return XLSX||null}
function pdf(){if(pdfParser===null){try{pdfParser=require("pdf-parse")}catch{pdfParser=false}}return pdfParser||null}
function abs(p){return path.resolve(String(p||""))}
function schemas(){return[
 {type:"function",function:{name:"inspect_document",description:"Inspect a supported local document. Use before summarizing document content.",parameters:{type:"object",properties:{filePath:{type:"string"}},required:["filePath"]}}},
 {type:"function",function:{name:"extract_pdf_text",description:"Extract readable text from a local PDF.",parameters:{type:"object",properties:{filePath:{type:"string"}},required:["filePath"]}}},
 {type:"function",function:{name:"read_excel",description:"Read an Excel workbook for analysis. Return worksheet metadata and rows only when content is required.",parameters:{type:"object",properties:{filePath:{type:"string"},sheetName:{type:"string"},maxRows:{type:"integer"},maxCols:{type:"integer"}},required:["filePath"]}}},
 {type:"function",function:{name:"calculate_excel",description:"Perform deterministic calculations on an Excel column locally. Use for sums, averages, minimums, maximums and counts instead of asking the language model to calculate.",parameters:{type:"object",properties:{filePath:{type:"string"},sheetName:{type:"string"},column:{type:"string"},operation:{type:"string",enum:["sum","average","min","max","count"]},headerRow:{type:"integer"}},required:["filePath","column","operation"]}}},
 {type:"function",function:{name:"write_excel",description:"Create or update an Excel workbook from structured rows.",parameters:{type:"object",properties:{filePath:{type:"string"},rows:{type:"array",items:{}},sheetName:{type:"string"},append:{type:"boolean"}},required:["filePath","rows"]}}}
]}
function book(file){const x=xlsx();if(!x)return{error:"Excel support is not installed."};const p=abs(file);if(!fs.existsSync(p))return{error:"File not found: "+p};return{x,book:x.readFile(p,{cellDates:true}),path:p}}
async function call(name,a){
 if(name==="extract_pdf_text"||name==="inspect_document"){
  const p=abs(a.filePath);if(!fs.existsSync(p))return{ok:false,error:"File not found: "+p};
  const ext=path.extname(p).toLowerCase();
  if(ext!==".pdf"&&name==="inspect_document"){if([".txt",".md",".log",".json",".xml",".html",".htm"].includes(ext))return{ok:true,path:p,type:"text",text:fs.readFileSync(p,"utf8").slice(0,400000)};return{ok:false,error:"Unsupported document type: "+ext}}
  const parser=pdf();if(!parser)return{ok:false,error:"PDF support is not installed."};const data=await parser(fs.readFileSync(p));return{ok:true,path:p,type:"pdf",pages:data.numpages||0,text:String(data.text||"").slice(0,400000),info:data.info||{}};
 }
 if(["read_excel","calculate_excel","write_excel"].includes(name)){
  const r=name==="write_excel"?null:book(a.filePath);if(name!=="write_excel"&&r?.error)return{ok:false,error:r.error};
  if(name==="read_excel"){const names=r.book.SheetNames||[],selected=a.sheetName&&names.includes(a.sheetName)?a.sheetName:names[0];if(!selected)return{ok:false,error:"The workbook contains no worksheets."};const all=r.x.utils.sheet_to_json(r.book.Sheets[selected],{header:1,defval:""});const maxRows=Math.max(1,Math.min(1000,Number(a.maxRows)||200));const maxCols=Math.max(1,Math.min(100,Number(a.maxCols)||50));const rows=all.slice(0,maxRows).map(row=>row.slice(0,maxCols));return{ok:true,path:r.path,type:"xlsx",sheet:selected,sheets:names,rows,truncated:all.length>rows.length||all.some(row=>row.length>maxCols),totalRows:all.length}}
  if(name==="calculate_excel"){
   const names=r.book.SheetNames||[],selected=a.sheetName&&names.includes(a.sheetName)?a.sheetName:names[0];if(!selected)return{ok:false,error:"The workbook contains no worksheets."};
   const rows=r.x.utils.sheet_to_json(r.book.Sheets[selected],{header:1,defval:""});const h=Math.max(0,Number(a.headerRow||1)-1);const headers=rows[h]||[];let idx=Number(a.column);if(!Number.isInteger(idx)){idx=headers.findIndex(v=>String(v).trim().toLowerCase()===String(a.column).trim().toLowerCase())}if(idx<0||!Number.isInteger(idx))return{ok:false,error:"Column not found: "+a.column};
   const vals=rows.slice(h+1).map(row=>typeof row[idx]==="number"?row[idx]:Number(String(row[idx]??"").replace(/[^0-9.+-]/g,""))).filter(Number.isFinite);if(!vals.length)return{ok:false,error:"No numeric values found in column "+a.column};
   let value=vals.length;if(a.operation==="sum")value=vals.reduce((x,y)=>x+y,0);else if(a.operation==="average")value=vals.reduce((x,y)=>x+y,0)/vals.length;else if(a.operation==="min")value=Math.min(...vals);else if(a.operation==="max")value=Math.max(...vals);
   return{ok:true,path:r.path,sheet:selected,column:a.column,operation:a.operation,count:vals.length,value};
  }
  const x=xlsx();if(!x)return{ok:false,error:"Excel support is not installed."};const p=abs(a.filePath);fs.mkdirSync(path.dirname(p),{recursive:true});let b=a.append&&fs.existsSync(p)?x.readFile(p):x.utils.book_new();const rows=Array.isArray(a.rows)?a.rows:[];const name=a.sheetName||"Sheet1";let sheet;if(b.SheetNames.includes(name)){const old=x.utils.sheet_to_json(b.Sheets[name],{header:1,defval:""});sheet=x.utils.aoa_to_sheet(old.concat(rows.map(v=>Array.isArray(v)?v:Object.values(v||{}))));b.Sheets[name]=sheet}else{x.utils.book_append_sheet(b,x.utils.aoa_to_sheet(rows.map(v=>Array.isArray(v)?v:Object.values(v||{}))),name)}x.writeFile(b,p);return{ok:true,path:p,sheet:name,rowCount:x.utils.sheet_to_json(b.Sheets[name],{header:1,defval:""}).length};
 }
 return null;
}
module.exports={schemas,call};