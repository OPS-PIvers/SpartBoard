import subprocess, sys, json
words=[w.strip() for w in open('words.txt') if w.strip()]
out={}
CH=400
bad=0
for i in range(0,len(words),CH):
    chunk=words[i:i+CH]
    p=subprocess.run(['espeak-ng','-v','en-us','-q','--ipa'],
                     input='\n'.join(chunk), capture_output=True, text=True)
    toks=p.stdout.split()
    if len(toks)!=len(chunk):
        bad+=1
        for w in chunk:
            q=subprocess.run(['espeak-ng','-v','en-us','-q','--ipa'],input=w,capture_output=True,text=True)
            t=q.stdout.split()
            out[w]=t[0] if len(t)==1 else ''.join(t)
    else:
        for w,t in zip(chunk,toks): out[w]=t
    if i % 20000 == 0: print(i, file=sys.stderr, flush=True)
print('chunks needing fallback:', bad, file=sys.stderr)
json.dump(out, open('espeak.json','w'))
