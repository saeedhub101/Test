from pathlib import Path
import re
p=Path('assets/avatar.html')
s=p.read_text(encoding='utf-8')
old=s
# Send the real Y-up height from the loaded GLB to native sizing.
s,n=re.subn(r"chrome\.webview\.postMessage\(\{type:'character_bounds',sizeX:size\.x,sizeZ:size\.z,([^}]*)\}\)",
             "chrome.webview.postMessage({type:'character_bounds',sizeX:size.x,sizeY:size.y,sizeZ:size.z,\\1})",s,count=1)
print('bounds replacements',n)
# Add a high-DPI resize pass without depending on the exact formatting of the callback.
if 'renderer.setPixelRatio(dpr);renderer.setSize(window.innerWidth,window.innerHeight,false)' not in s:
    s=s.replace("window.addEventListener('resize',()=>{",
                "window.addEventListener('resize',()=>{try{const dpr=Math.min(Math.max(window.devicePixelRatio||1,1),2.5);if(typeof renderer!=='undefined'&&renderer){renderer.setPixelRatio(dpr);renderer.setSize(window.innerWidth,window.innerHeight,false);}if(typeof camera!=='undefined'&&camera){camera.aspect=Math.max(.1,window.innerWidth/Math.max(1,window.innerHeight));camera.updateProjectionMatrix();}}catch{}",
                1)
# If the page has a renderer creation site, force a crisp initial pixel ratio there too.
s=s.replace("renderer.setPixelRatio(Math.min(devicePixelRatio,2));",
            "renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio||1,1),2.5));")
p.write_text(s,encoding='utf-8')
print('changed',s!=old)
