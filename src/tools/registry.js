const path=require("path"),{Computer}=require("../computer");
const domains=[require("./files"),require("./office"),require("./image"),require("./windows"),require("./web"),require("./interaction"),require("./memory-tasks")];
class ToolRegistry{
 constructor({captureScreen,userDataPath,confirm,permissionPolicy}={}){this.computer=new Computer();this.memory=null;this.tasks=null;this.userDataPath=userDataPath||process.cwd();this.captureScreen=captureScreen||(()=>null);this.confirm=confirm|| (async()=>false);this.permissionPolicy=permissionPolicy||(()=>"allow");this.tasksFile=path.join(this.userDataPath,"tasks.json")}
 schemas(){return domains.flatMap(d=>d.schemas())}
 categoryFor(name){
  if(["system_info","diagnose_computer","active_window","list_windows","focus_window","process_list","disk_info"].includes(name))return"system";
  if(["list_directory","read_file","write_file","open_file","reveal_file","inspect_document","extract_pdf_text","read_excel","calculate_excel","write_excel"].includes(name))return"files";
  if(name==="open_application")return"applications";
  if(["open_url","web_search","fetch_web_page","network_info"].includes(name))return"network";
  if(["screenshot","ocr_image","extract_image_table","inspect_image"].includes(name))return"screen";
  if(["mouse_move","mouse_click","type_text","key_press"].includes(name))return"mouseKeyboard";
  if(["add_task","list_tasks","complete_task","remember","recall","list_memory","forget"].includes(name))return"tasksMemory";
  if(name==="remove_task")return"destructive";
  return"system";
 }
 async authorize(category,request){const p=this.permissionPolicy(category);if(p==="allow")return true;if(p==="deny")return false;return this.confirm({...request,permissionCategory:category})}
 async call(name,args={}){
  try{const category=this.categoryFor(name);if(!(await this.authorize(category,{name,args})))return{ok:false,error:"Permission denied for "+category};
   const context={computer:this.computer,captureScreen:this.captureScreen,userDataPath:this.userDataPath,memory:this.memory,tasks:this.tasks,tasksFile:this.tasksFile};
   for(const d of domains){const out=await d.call(name,args,context);if(out!==null){this.memory=context.memory;this.tasks=context.tasks;this.tasksFile=context.tasksFile;return out}}
   return{ok:false,error:"Unknown tool: "+name};
  }catch(e){return{ok:false,error:e.message}}
 }
}
module.exports={ToolRegistry};