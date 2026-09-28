const {ipcRenderer}=require("electron");
const path=require("path"),fs=require("fs"),{pathToFileURL}=require("url");
function mark(name,value=true){try{document.documentElement.dataset[name]=String(value)}catch{}}
function fail(message){mark("saeedCharacterError",message);console.error("Saeed character:",message)}
window.addEventListener("DOMContentLoaded",async()=>{
 mark("saeedWebglReady",false);mark("saeedRendererReady",false);mark("saeedGltfReady",false);
 try{
  const threeUrl=pathToFileURL(path.join(__dirname,"..","node_modules","three","build","three.module.js")).href;
  const packagedLoader=path.join(process.resourcesPath,"three","examples","jsm","loaders","GLTFLoader.js");
  const sourceLoader=path.join(__dirname,"..","node_modules","three","examples","jsm","loaders","GLTFLoader.js");
  const loaderUrl=pathToFileURL(fs.existsSync(packagedLoader)?packagedLoader:sourceLoader).href;
  const THREE=await import(threeUrl);
  const {GLTFLoader}=await import(loaderUrl);
  const canvas=document.getElementById("c");
  const gl=canvas.getContext("webgl2",{alpha:true,antialias:false,preserveDrawingBuffer:false})||canvas.getContext("webgl",{alpha:true,antialias:false,preserveDrawingBuffer:false});
  if(!gl)throw new Error("WebGL unavailable");
  mark("saeedWebglReady",true);
  const renderer=new THREE.WebGLRenderer({canvas,context:gl,alpha:true,antialias:false,powerPreference:"low-power"});
  renderer.setPixelRatio(1);renderer.setClearColor(0,0);mark("saeedRendererReady",true);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(28,1,.01,100);
  scene.add(new THREE.HemisphereLight(0xffffff,0x777777,1.2));
  const key=new THREE.DirectionalLight(0xffffff,1.2);key.position.set(2,4,3);scene.add(key);
  let root=null,mixer=null,clock=new THREE.Clock(),timer=null,lastW=0,lastH=0;
  function resize(){const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);if(w===lastW&&h===lastH)return;lastW=w;lastH=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
  function frame(object){const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),max=Math.max(size.x,size.y,size.z)||1;camera.position.set(center.x,center.y+size.y*.015,center.z+max*1.28);camera.lookAt(center.x,center.y,center.z);camera.near=Math.max(.001,max/1000);camera.far=max*20;camera.updateProjectionMatrix()}
  function render(){if(!root){timer=setTimeout(render,500);return}const dt=Math.min(clock.getDelta(),.1);if(mixer)mixer.update(dt);resize();renderer.render(scene,camera);timer=setTimeout(render,250)}
  async function characterUrl(){try{const p=await ipcRenderer.invoke("character:current");return p?pathToFileURL(p).href:"../assets/Saeed_AI-3D.glb"}catch{return "../assets/Saeed_AI-3D.glb"}}
  const url=await characterUrl();
  new GLTFLoader().load(url,gltf=>{
    root=gltf.scene;scene.add(root);frame(root);mark("saeedGltfReady",true);
    if(gltf.animations?.length){mixer=new THREE.AnimationMixer(root);const idle=gltf.animations.find(a=>/idle|stand|breath|rest|default/i.test(a.name))||gltf.animations[0];mixer.clipAction(idle).play()}
    ipcRenderer.send("character:ready",{animations:gltf.animations?.map(a=>a.name)||[]});
  },undefined,e=>fail("3D character failed to load: "+(e?.message||e)));
  resize();render();
 }catch(e){fail(e?.message||String(e))}
});

// Desktop companion drag: left-button drag moves the actual character window.
window.addEventListener("DOMContentLoaded",()=>{
 const canvas=document.getElementById("c");
 if(!canvas)return;
 let dragging=false,lastX=0,lastY=0;
 canvas.addEventListener("mousedown",e=>{if(e.button!==0)return;dragging=true;lastX=e.screenX;lastY=e.screenY;e.preventDefault();});
 window.addEventListener("mousemove",e=>{if(!dragging)return;const dx=e.screenX-lastX,dy=e.screenY-lastY;lastX=e.screenX;lastY=e.screenY;if(dx||dy)ipcRenderer.send("character:move-by",dx,dy);});
 window.addEventListener("mouseup",()=>{dragging=false;});
});

ipcRenderer.on("character:path",(_,p)=>{if(p)location.reload()});
\nwindow.saeedCharacter={openChat:()=>ipcRenderer.send("window:show-chat"),openSettings:()=>ipcRenderer.send("window:open-settings")};\n