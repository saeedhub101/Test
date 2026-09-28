from pathlib import Path
import re
p=Path('src/main.cpp')
s=p.read_text(encoding='utf-8')
# Keep exactly one ToggleMicrophoneMute definition.
pat=r'static void ToggleMicrophoneMute\(\)\{.*?\n\}'
blocks=list(re.finditer(pat,s,re.S))
if len(blocks)>1:
    first=blocks[0].group(0)
    # Rebuild from the first definition and remove every later definition.
    out=[];pos=0
    for i,m in enumerate(blocks):
        if i==0:
            out.append(s[pos:m.end()])
        else:
            out.append(s[pos:m.start()])
        pos=m.end()
    out.append(s[pos:])
    s=''.join(out)
p.write_text(s,encoding='utf-8')
print('ToggleMicrophoneMute definitions:',len(list(re.finditer(pat,s,re.S))))
