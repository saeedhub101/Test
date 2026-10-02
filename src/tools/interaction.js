function schemas(){return[
 {type:"function",function:{name:"screenshot",description:"Capture the current screen for visual inspection.",parameters:{type:"object",properties:{},required:[]}}},
 {type:"function",function:{name:"mouse_move",description:"Move the mouse to screen coordinates.",parameters:{type:"object",properties:{x:{type:"number"},y:{type:"number"}},required:["x","y"]}}},
 {type:"function",function:{name:"mouse_click",description:"Click at screen coordinates.",parameters:{type:"object",properties:{x:{type:"number"},y:{type:"number"},button:{type:"string",enum:["left","right"]}},required:["x","y"]}}},
 {type:"function",function:{name:"type_text",description:"Type text into the focused application.",parameters:{type:"object",properties:{text:{type:"string"}},required:["text"]}}},
 {type:"function",function:{name:"key_press",description:"Press Windows keyboard keys.",parameters:{type:"object",properties:{key:{type:"string"}},required:["key"]}}}
]}
async function call(name,a,c){if(name==="screenshot")return{ok:true,image:await c.captureScreen()};if(name==="mouse_move")return c.computer.mouseMove(a.x,a.y);if(name==="mouse_click")return c.computer.mouseClick(a.x,a.y,a.button||"left");if(name==="type_text")return c.computer.typeText(a.text);if(name==="key_press")return c.computer.keyPress(a.key);return null}
module.exports={schemas,call};