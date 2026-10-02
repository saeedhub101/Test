import * as THREE from "../node_modules/three/build/three.module.js";
import {GLTFLoader} from "./three/GLTFLoader.js";
if(window.saeed3DBootstrap){window.saeed3DBootstrap.moduleLoaded=true;window.saeed3DBootstrap.error=null;window.saeed3DBootstrap.rejection=null;}

const canvas=document.getElementById("avatar");
const runtime3D={version:THREE.REVISION,overall:{state:"starting",detail:"Initializing 3D renderer"},components:{moduleBootstrap:{state:"ready",detail:"avatar.js module executed successfully"},threeJs:{state:"ready",detail:`Three.js r${THREE.REVISION}`},webgl:{state:"unknown",detail:""},renderer:{state:"unknown",detail:""},scene:{state:"unknown",detail:""},camera:{state:"unknown",detail:""},lights:{state:"unknown",detail:""},canvas:{state:"unknown",detail:""},renderLoop:{state:"unknown",detail:"",frames:0,fps:0,lastRenderAt:null},gltfLoader:{state:"ready",detail:"GLTFLoader module loaded"},sceneContent:{state:"unknown",detail:""},selectedGlb:{state:"not-tested",detail:"No external GLB selected",name:"",size:0,displayed:false}},metrics:{drawCalls:0,triangles:0,points:0,lines:0,geometries:0,textures:0},viewport:{width:0,height:0,pixelRatio:Math.min(devicePixelRatio||1,2)},lastError:"",lastUpdated:null};
function refreshOverall(){const required=["threeJs","webgl","renderer","scene","camera","lights","canvas","renderLoop","sceneContent"];const hasError=required.some(k=>runtime3D.components[k]?.state==="error")||Boolean(runtime3D.lastError);const ready=required.every(k=>["ready","rendered","active"].includes(runtime3D.components[k]?.state));runtime3D.overall=hasError?{state:"error",detail:runtime3D.lastError||"One or more 3D components failed"}:ready&&runtime3D.components.sceneContent.state==="rendered"?{state:"ready",detail:"Three.js + WebGL + loaded 3D scene are rendering"}:{state:"starting",detail:"3D renderer is initializing"};runtime3D.lastUpdated=new Date().toISOString()}
function set3DState(key,state,detail,extra={}){if(runtime3D.components[key])runtime3D.components[key]={...runtime3D.components[key],state,detail,...extra};refreshOverall()}
set3DState("gltfLoader","starting","Bundled GLTFLoader is available in the renderer module");let scene;try{scene=new THREE.Scene();set3DState("scene","ready","THREE.Scene created");}catch(e){set3DState("scene","error",e.message);runtime3D.lastError=e.message;throw e}
let camera;try{camera=new THREE.PerspectiveCamera(32,1,.1,100);camera.position.set(0,0,5);camera.lookAt(0,0,0);set3DState("camera","ready","Fixed PerspectiveCamera created");}catch(e){set3DState("camera","error",e.message);runtime3D.lastError=e.message;throw e}
let renderer;try{const gl2=canvas.getContext("webgl2");const gl=gl2||canvas.getContext("webgl");if(!gl)throw new Error("WebGL/WebGL2 context unavailable");set3DState("webgl","ready",gl2?"WebGL2 context available":"WebGL context available",{version:gl2?"WebGL2":"WebGL"});renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:"high-performance"});set3DState("renderer","ready","THREE.WebGLRenderer created",{antialias:false,alpha:true,powerPreference:"high-performance"});}catch(e){set3DState("webgl","error",e.message);set3DState("renderer","error",e.message);runtime3D.lastError=e.message;throw e}
const renderScale=1;renderer.setPixelRatio(Math.min(Math.max(1,devicePixelRatio||1)*renderScale,1.5));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
try{scene.add(new THREE.HemisphereLight(0xffffff,0x334455,2.2));const key=new THREE.DirectionalLight(0xffffff,2.5);key.position.set(2,4,3);scene.add(key);set3DState("lights","ready","Hemisphere + directional lights added");}catch(e){set3DState("lights","error",e.message);runtime3D.lastError=e.message;throw e}

const root=new THREE.Group();scene.add(root);


let mixer=null,clips=[],actions=new Map(),activeAction=null,clock=new THREE.Clock();
let avatarState="idle",moveTimer=null,moveEnd=0,moveDirection=1,bodyYaw=0,bodyYawTarget=0,gestureTimer=null;
let behaviorConfig={breathing:true,blinking:true,expressions:true,speechFace:true};
let facialTime=0,blinkUntil=0,nextBlink=2+Math.random()*4,expression={smile:0,jawopen:0};
let visemeValues={aa:0,ee:0,oo:0,oh:0,fv:0,mbp:0},visemeTargets={aa:0,ee:0,oo:0,oh:0,fv:0,mbp:0},visemeTimer=null;
let model=null,bones=new Map(),boneBase=new Map(),loader=null,frameWindowStart=performance.now(),frameWindowCount=0;
let gltfLoaderPromise=null,loadGeneration=0,activeGlbLoad=false,pendingGlbLoad=null;
function ensureGLTFLoader(){if(loader)return Promise.resolve(loader);try{runtime3D.components.gltfLoader.state="loading";runtime3D.components.gltfLoader.detail="Initializing bundled GLTFLoader";loader=new GLTFLoader();set3DState("gltfLoader","ready","Bundled GLTFLoader initialized without dynamic import");return Promise.resolve(loader)}catch(e){set3DState("gltfLoader","error","GLTFLoader initialization failed: "+e.message);return Promise.resolve(null)}}
const lookTarget=new THREE.Vector3(0,1.5,1);

const aliases={
 idle:["idle","stand","breathing"],walk:["walk","walking","locomotion"],talk:["talk","talking","speak"],
 think:["think","thinking"],happy:["happy","wave"],sad:["sad"],alert:["alert","surprised"]
};
function findClip(name){
 const q=String(name||"").toLowerCase(),names=aliases[q]||[q];
 return clips.find(x=>names.some(n=>x.name.toLowerCase().includes(n)));
}
function configuredRenderWakeMs(){return Number(window.saeedAnimationController?.getRenderWakeMs?.())||1200}
function playAnimation(name,{loop=true,crossFade=.18}={}){
 if(!mixer)return false;
 const clip=findClip(name);if(!clip)return false;
 let action=actions.get(clip.uuid);
 if(!action){action=mixer.clipAction(clip);actions.set(clip.uuid,action)}
 if(activeAction&&activeAction!==action)activeAction.fadeOut(crossFade);
 action.reset().fadeIn(crossFade);action.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);
 if(!loop)action.clampWhenFinished=true;action.play();activeAction=action;wakeRender(loop?Number.POSITIVE_INFINITY:Math.max(configuredRenderWakeMs(),120));return true;
}

let facialMeshes=[];
let morphBindings=new Map();
const RESTORE_SLOTS=["leftUpperArm","rightUpperArm","leftForeArm","rightForeArm","leftThigh","rightThigh","leftShin","rightShin","leftFoot","rightFoot","spine","chest"];
const visemeAliases={
 aa:["viseme_aa","aa","jawopen","mouthopen"],ee:["viseme_ee","ee"],oo:["viseme_oo","oo","ou"],
 oh:["viseme_oh","oh"],fv:["viseme_fv","fv"],mbp:["viseme_mbp","mbp","closed"],
 smile:["smile"],blink:["blink","eyeclose"]
};
function mapHumanoidBones(model){
 bones.clear();boneBase.clear();
 const aliases={
  hips:["hips","pelvis","root"],spine:["spine","spine1","spine2","chest"],chest:["chest","upperchest"],
  neck:["neck"],head:["head"],jaw:["jaw","jawbone"],
  leftUpperArm:["leftarm","leftupperarm","upperarm_l","lupperarm"],rightUpperArm:["rightarm","rightupperarm","upperarm_r","rupperarm"],
  leftForeArm:["leftforearm","leftlowerarm","forearm_l","lowerarm_l"],rightForeArm:["rightforearm","rightlowerarm","forearm_r","lowerarm_r"],
  leftHand:["lefthand","hand_l"],rightHand:["righthand","hand_r"],
  leftThigh:["leftupleg","leftthigh","thigh_l","upperleg_l"],rightThigh:["rightupleg","rightthigh","thigh_r","upperleg_r"],
  leftShin:["leftleg","leftlowerleg","calf_l","shin_l"],rightShin:["rightleg","rightlowerleg","calf_r","shin_r"],
  leftFoot:["leftfoot","foot_l"],rightFoot:["rightfoot","foot_r"]
 };
 const all=[];model.traverse(o=>{if(o.isBone)all.push([o.name.toLowerCase().replace(/[^a-z0-9]/g,""),o])});
 for(const [slot,names] of Object.entries(aliases)){
  const hit=all.find(([n])=>names.some(a=>n.includes(a.replace(/[^a-z0-9]/g,""))));
  if(hit){bones.set(slot,hit[1]);boneBase.set(slot,{x:hit[1].rotation.x,y:hit[1].rotation.y,z:hit[1].rotation.z})}
 }
 return Object.fromEntries([...bones].map(([k,b])=>[k,b.name]));
}
function restoreBone(slot){
 const b=bones.get(slot),base=boneBase.get(slot);if(b&&base)b.rotation.set(base.x,base.y,base.z);
}
function addBoneRotation(slot,x=0,y=0,z=0){
 const b=bones.get(slot),base=boneBase.get(slot);if(!b||!base)return;
 b.rotation.x=base.x+x;b.rotation.y=base.y+y;b.rotation.z=base.z+z;
}
function proceduralBody(t){
 if(!bones.size)return;
 const moving=Boolean(moveTimer&&performance.now()<moveEnd),talking=avatarState==="talk"&&behaviorConfig.speechFace,w=moving?Math.sin(t*10.5):0,sway=Math.sin(t*1.7);
 RESTORE_SLOTS.forEach(restoreBone);
 if(moving){
  addBoneRotation("leftThigh",w*.65);addBoneRotation("rightThigh",-w*.65);
  addBoneRotation("leftShin",-Math.max(0,-w)*.8);addBoneRotation("rightShin",Math.max(0,w)*.8);
  addBoneRotation("leftFoot",Math.max(0,-w)*.45);addBoneRotation("rightFoot",Math.max(0,w)*.45);
  addBoneRotation("leftUpperArm",-w*.28);addBoneRotation("rightUpperArm",w*.28);
 }
 if(behaviorConfig.breathing){addBoneRotation("spine",0,0,sway*.018);addBoneRotation("chest",0,0,sway*.025);}
 if(talking){
  const p=Math.sin(t*7.5),q=Math.sin(t*5.1+.8);
  addBoneRotation("leftUpperArm",-.12,0,p*.08);addBoneRotation("rightUpperArm",-.12,0,-p*.08);
  addBoneRotation("leftForeArm",q*.12);addBoneRotation("rightForeArm",-q*.12);
 }
}
function collectFacialMeshes(model){
 facialMeshes=[];morphBindings=new Map();
 model.traverse(o=>{if(!o.isMesh||!o.morphTargetDictionary||!o.morphTargetInfluences)return;facialMeshes.push(o);
  for(const [name,keys] of Object.entries(visemeAliases))for(const key of keys){const i=o.morphTargetDictionary[key];if(i===undefined)continue;const list=morphBindings.get(name)||[];list.push([o,i]);morphBindings.set(name,list)}
 });
}
function setMorph(name,value){
 const v=Math.max(0,Math.min(1,Number(value)||0));
 const bindings=morphBindings.get(name);
 if(bindings){for(const [mesh,index] of bindings)mesh.morphTargetInfluences[index]=v;return}
 const keys=visemeAliases[name]||[name];
 for(const mesh of facialMeshes)for(const key of keys){const i=mesh.morphTargetDictionary[key];if(i!==undefined)mesh.morphTargetInfluences[i]=v}
}
function setViseme(name,value){const k=String(name||"").toLowerCase();if(visemeTargets[k]!==undefined)visemeTargets[k]=Math.max(0,Math.min(1,Number(value)||0));else setMorph(k,value)}
function playVisemeTimeline(timeline){
 if(!Array.isArray(timeline)||!timeline.length)return false;
 if(visemeTimer)clearTimeout(visemeTimer);
 resetVisemes();
 const started=performance.now();
 const items=timeline.map(x=>({timeMs:Math.max(0,Number(x.timeMs)||0),durationMs:Math.max(30,Number(x.durationMs)||80),viseme:String(x.viseme||"aa").toLowerCase(),value:Math.max(0,Math.min(1,Number(x.value)==null?0.8:Number(x.value)))})).sort((a,b)=>a.timeMs-b.timeMs);
 let i=0;
 const tick=()=>{
  const elapsed=performance.now()-started;
  while(i<items.length&&items[i].timeMs<=elapsed){
   const item=items[i++];
   setViseme(item.viseme,item.value);
   setTimeout(()=>setViseme(item.viseme,0),item.durationMs);
  }
  if(i<items.length)visemeTimer=setTimeout(tick,Math.max(12,Math.min(40,items[i].timeMs-elapsed)));
  else visemeTimer=null;
 };
 tick();return true;
}
function setExpression(name,value){expression[String(name).toLowerCase()]=Math.max(0,Math.min(1,Number(value)||0));setMorph(name,value);return true}
function blink(){setMorph("blink",1);blinkUntil=facialTime+.14;return true}
function resetVisemes(){["aa","ee","oo","oh","fv","mbp"].forEach(v=>{visemeTargets[v]=0;visemeValues[v]=0;setMorph(v,0)});return true}

function prepareSceneContent(){runtime3D.components.sceneContent={state:"loading",detail:"Waiting for the selected Saeed GLB"};set3DState("scene","loading","Waiting for the selected Saeed GLB");refreshOverall()}
function fitLoadedModel(){if(!model)return;model.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(model,true);const rawSize=box.getSize(new THREE.Vector3());const targetHeight=3.75;const scale=targetHeight/Math.max(rawSize.y,0.001);model.scale.setScalar(scale);model.updateWorldMatrix(true,true);const fitted=new THREE.Box3().setFromObject(model,true);const size=fitted.getSize(new THREE.Vector3());const center=fitted.getCenter(new THREE.Vector3());model.position.x-=center.x;model.position.z-=center.z;model.position.y-=fitted.min.y;model.updateWorldMatrix(true,true);const box3=new THREE.Box3().setFromObject(model,true);const finalSize=box3.getSize(new THREE.Vector3());const finalCenter=box3.getCenter(new THREE.Vector3());const aspect=Math.max(.1,(canvas.clientWidth||430)/(canvas.clientHeight||520));camera.fov=30;const verticalFov=THREE.MathUtils.degToRad(camera.fov*.5);const horizontalFov=2*Math.atan(Math.tan(verticalFov)*aspect);const halfVertical=finalSize.y*.5;const halfHorizontal=finalSize.x*.5;const depthHalf=finalSize.z*.5;const verticalDistance=halfVertical/Math.max(Math.tan(verticalFov),.001);const horizontalDistance=halfHorizontal/Math.max(Math.tan(horizontalFov*.5),.001);const requiredCenterDistance=Math.max(verticalDistance,horizontalDistance);const fitPadding=0.82;const distance=Math.max(requiredCenterDistance*fitPadding+depthHalf,1.10);const cameraElevationDeg=4;const cameraElevation=Math.tan(THREE.MathUtils.degToRad(cameraElevationDeg))*distance;camera.position.set(0,finalCenter.y+cameraElevation,distance);camera.near=Math.max(.01,finalSize.length()/1000);camera.far=Math.max(100,finalSize.length()*12);camera.lookAt(finalCenter.x,finalCenter.y,finalCenter.z);camera.updateProjectionMatrix();}function disposeObject3D(object){if(!object)return;object.traverse(o=>{if(o.geometry?.dispose)o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){if(!m)continue;for(const key of ["map","normalMap","roughnessMap","metalnessMap","emissiveMap","aoMap","alphaMap"]){const tex=m[key];if(tex?.dispose)tex.dispose()}if(m.dispose)m.dispose()}})}
async function displaySelectedGlb(parsed,name,size){if(!parsed?.scene)throw new Error("Selected GLB contains no scene");if(model){disposeObject3D(model);model=null}root.clear();model=parsed.scene;root.add(model);set3DState("scene","ready","Saeed GLB loaded into the Three.js scene");clips=Array.isArray(parsed.animations)?parsed.animations:[];mixer=clips.length?new THREE.AnimationMixer(model):null;actions.clear();activeAction=null;collectFacialMeshes(model);mapHumanoidBones(model);fitLoadedModel();const idle=playAnimation("idle")||playAnimation("stand")||playAnimation("breathing");runtime3D.components.sceneContent={state:"rendered",detail:"Saeed GLB is the displayed 3D object"};runtime3D.components.selectedGlb={...runtime3D.components.selectedGlb,state:"ready",detail:"Saeed GLB parsed and displayed in the character window",size,name,parsed:true,displayed:true,animations:clips.map(x=>x.name),bones:Object.keys(mapHumanoidBones(model))};refreshOverall();renderNow("character-loaded")}
async function prepareSceneStatus(){try{prepareSceneContent()}catch(e){console.error("3D scene initialization failed:",e);runtime3D.lastError=e.message;runtime3D.components.sceneContent.state="error";runtime3D.components.sceneContent.detail="3D scene initialization failed: "+e.message;refreshOverall()}}
void ensureGLTFLoader();
async function processGlbLoad(data,requestGeneration){activeGlbLoad=true;try{const gltf=await ensureGLTFLoader();if(!gltf)throw new Error("GLTFLoader unavailable; see 3D Status");
 let bytes=data;
 if(data instanceof Uint8Array){bytes=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}
 else if(data instanceof ArrayBuffer){bytes=data}
 else if(data?.buffer instanceof ArrayBuffer){const view=new Uint8Array(data.buffer,data.byteOffset||0,data.byteLength||data.buffer.byteLength);bytes=view.buffer.slice(view.byteOffset,view.byteOffset+view.byteLength)}
 else throw new Error("Selected GLB data is not an ArrayBuffer/Uint8Array");
 const size=bytes.byteLength;runtime3D.components.selectedGlb={...runtime3D.components.selectedGlb,state:"loading",detail:"One GLB load is active; newer selections are queued",size};refreshOverall();const started=performance.now();const parsed=await gltf.parseAsync(bytes,"");if(requestGeneration===loadGeneration)await displaySelectedGlb(parsed,"Selected Character",size);runtime3D.components.selectedGlb.loadMs=Math.round(performance.now()-started);}catch(e){if(requestGeneration===loadGeneration)runtime3D.components.selectedGlb={...runtime3D.components.selectedGlb,state:"error",detail:"Selected GLB parse failed: "+e.message,displayed:false};}finally{activeGlbLoad=false;const next=pendingGlbLoad;pendingGlbLoad=null;if(next)void processGlbLoad(next.data,next.generation);else refreshOverall()}}
window.saeedAvatarLoadData=async (data,generation)=>{const requestGeneration=Number(generation)||++loadGeneration;loadGeneration=Math.max(loadGeneration,requestGeneration);if(activeGlbLoad){pendingGlbLoad={data,generation:requestGeneration};runtime3D.components.selectedGlb={...runtime3D.components.selectedGlb,state:"queued",detail:"Current GLB is still loading; only the newest selection will load next",displayed:false};refreshOverall();return}return processGlbLoad(data,requestGeneration)};
window.saeedAvatar={get3DStatus:()=>{refreshOverall();return JSON.parse(JSON.stringify(runtime3D))}};
prepareSceneStatus();

function smoothTurnTo(yaw){
 bodyYawTarget=Number(yaw)||0;
}
function setState(state){
 const next=String(state||"idle").toLowerCase();avatarState=next;
 if(next==="stop"){avatarState="idle";return playAnimation("idle")}
 return playAnimation(next)||playAnimation("idle");
}
function move(direction="forward",duration=1200){
 const d=String(direction).toLowerCase();
 moveDirection=(d==="left"||d==="backward"||d==="back")?-1:1;
 smoothTurnTo(d==="left"?-Math.PI/2:d==="right"?Math.PI/2:d==="backward"||d==="back"?Math.PI:bodyYawTarget);
 playAnimation("walk");wakeRender(Number(duration)||1200);
 const ms=Math.max(150,Number(duration)||1200);moveEnd=performance.now()+ms;
 if(moveTimer)clearTimeout(moveTimer);
 moveTimer=setTimeout(()=>{moveTimer=null;avatarState="idle";playAnimation("idle")},ms);
 return true;
}
function gesture(name="happy"){
 if(gestureTimer)clearTimeout(gestureTimer);
 const ok=playAnimation(name,{loop:false,crossFade:.15});
 gestureTimer=setTimeout(()=>{playAnimation(avatarState==="talk"?"talk":"idle");wakeRender(250)},1200);wakeRender(1250);return ok;
}
function lookAt(x=0,y=1.5,z=1){
 lookTarget.set(Number(x)||0,Number(y)||1.5,Number(z)||1);
 const dx=lookTarget.x-root.position.x,dz=lookTarget.z-root.position.z;
 if(Math.abs(dx)+Math.abs(dz)>.05)smoothTurnTo(Math.atan2(dx,dz));
 return true;
}
function turn(direction){
 const d=String(direction).toLowerCase();
 const yaw=d==="left"?bodyYaw-Math.PI/2:d==="right"?bodyYaw+Math.PI/2:d==="back"||d==="backward"?bodyYaw+Math.PI:Number(direction)||0;
 smoothTurnTo(yaw);return true;
}
function nod(){
 wakeRender(300);
 const head=bones.get("head"),baseBone=boneBase.get("head");
 if(head&&baseBone){head.rotation.x=baseBone.x+.12;setTimeout(()=>{head.rotation.set(baseBone.x,baseBone.y,baseBone.z);wakeRender(120)},180);return true;}
 const baseRoot=root.rotation.x;root.rotation.x=baseRoot+.12;setTimeout(()=>{root.rotation.x=baseRoot;wakeRender(120)},180);return true;
}
window.saeedAvatar={
 setState,move,turn,gesture,lookAt,nod,
 get3DStatus:()=>{refreshOverall();return JSON.parse(JSON.stringify(runtime3D))},
 
 stop(){if(moveTimer){clearTimeout(moveTimer);moveTimer=null}avatarState="idle";return playAnimation("idle")},
  setMood(mood){root.rotation.z=0;root.scale.setScalar(mood==="excited"?1.04:mood==="sad"?.97:1);if(mood==="alert")root.rotation.z=.02},
 setBehaviorConfig(config){behaviorConfig={...behaviorConfig,...(config||{})};return {...behaviorConfig}},
 play(name,options){return playAnimation(name,options)},
 hasAnimation(name){return Boolean(findClip(name))},
 getAnimations(){return clips.map(c=>c.name)},
 getBones(){return Object.fromEntries([...bones].map(([k,b])=>[k,b.name]))},
 walk(){const ok=playAnimation("walk");wakeRender(1200);return ok},idle(){return playAnimation("idle")},talk(){const ok=playAnimation("talk");wakeRender(1200);return ok},think(){const ok=playAnimation("think");wakeRender(1200);return ok},
 setViseme,playVisemeTimeline,resetVisemes,setExpression,blink,setMorph,
 wakeRender,getFacialTargets(){return facialMeshes.flatMap(m=>Object.keys(m.morphTargetDictionary||{}))}
};

let renderLoopStarted=false,lastRenderTime=0,rendererActive=true,renderFrameId=0,renderUntil=0;
let lastActiveFrame=0;
function wakeRender(ms=1200){const duration=Number(ms);const now=performance.now();const until=duration===Number.POSITIVE_INFINITY?Number.POSITIVE_INFINITY:now+Math.max(80,duration||1200);renderUntil=duration===Number.POSITIVE_INFINITY?Number.POSITIVE_INFINITY:(renderUntil===Number.POSITIVE_INFINITY?until:Math.max(renderUntil,until));if(!renderFrameId&&!document.hidden)renderFrameId=requestAnimationFrame(renderFrame)}
function renderFrame(now=performance.now()){renderFrameId=0;if(document.hidden||!rendererActive)return;if(now<=renderUntil){const idleFrameInterval=avatarState==="idle"&&!moveTimer?66:33;if(now-lastActiveFrame>=idleFrameInterval){lastActiveFrame=now;renderNow("active-behavior")}if(now<=renderUntil&&!document.hidden&&rendererActive)renderFrameId=requestAnimationFrame(renderFrame)}}
function resize(){try{const r=canvas.getBoundingClientRect(),w=Math.max(1,Math.min(4096,r.width)),h=Math.max(1,Math.min(4096,r.height));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();runtime3D.viewport={width:Math.round(w),height:Math.round(h),pixelRatio:renderer.getPixelRatio()};set3DState("canvas","ready",`Canvas ${Math.round(w)}×${Math.round(h)}`);renderNow("resize");}catch(e){runtime3D.lastError=e.message;set3DState("canvas","error",e.message);}}try{new ResizeObserver(resize).observe(canvas);resize();}catch(e){runtime3D.lastError=e.message;set3DState("canvas","error",e.message);}

function renderNow(reason="on-demand"){
 if(!rendererActive||document.hidden)return false;
 try{
  const now=performance.now();
  const dt=clock.getDelta();
  facialTime+=dt;
  runtime3D.components.renderLoop.frames++;
  runtime3D.components.renderLoop.lastRenderAt=new Date().toISOString();
  proceduralBody(facialTime);
  Object.keys(visemeTargets).forEach(k=>{visemeValues[k]+=(visemeTargets[k]-visemeValues[k])*Math.min(1,dt*18);setMorph(k,visemeValues[k])});
  if(mixer)mixer.update(dt);
  if(moveTimer&&performance.now()<moveEnd){
   root.position.x+=dt*.22*moveDirection;
   if(root.position.x>.7)root.position.x=-.7;
   if(root.position.x<-.7)root.position.x=.7;
  }
  bodyYaw+=(bodyYawTarget-bodyYaw)*Math.min(1,dt*4);
  root.rotation.y=bodyYaw;
  if(behaviorConfig.blinking&&facialTime>=nextBlink){blink();nextBlink=facialTime+2.5+Math.random()*5}
  if(blinkUntil&&facialTime>=blinkUntil){setMorph("blink",0);blinkUntil=0}
  if(avatarState!=="talk"&&avatarState!=="think"){
   const breathe=(Math.sin(facialTime*1.8)+1)*.5;
   root.position.y+=(breathe*.018-root.position.y)*Math.min(1,dt*2);
  }
  renderer.render(scene,camera);
  lastRenderTime=now;
  runtime3D.metrics={drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,points:renderer.info.render.points,lines:renderer.info.render.lines,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};
  if(!renderLoopStarted){renderLoopStarted=true;set3DState("renderLoop","ready","On-demand rendering is active; no continuous render loop is running")}
  if(runtime3D.components.sceneContent.state==="loading"&&renderer.info.render.calls>0){runtime3D.components.sceneContent.state="rendered";runtime3D.components.sceneContent.detail="Active GLB scene produced WebGL draw calls";refreshOverall()}
  return true;
 }catch(e){
  console.error("Saeed 3D renderer.render failed:",e);
  runtime3D.lastError=e.message;
  set3DState("renderLoop","error",e.message);
  const message=document.getElementById("status");
  if(message)message.textContent="Saeed 3D renderer failed";
  return false;
 }
}
function syncRendererVisibility(){rendererActive=!document.hidden;if(rendererActive&&performance.now()<renderUntil&&!renderFrameId)renderFrameId=requestAnimationFrame(renderFrame);else if(!rendererActive&&renderFrameId){cancelAnimationFrame(renderFrameId);renderFrameId=0}}
document.addEventListener("visibilitychange",syncRendererVisibility);
