import json
from score2 import esp_phones, cmu_phones
cmu=json.load(open('cmu.json')); esp=json.load(open('espeak.json'))
CMUP={w:[cmu_phones(v) for v in vs] for w,vs in cmu.items()}
RED={'AH','IH','IY','UH','ER'}
def conv(seq):
    p=[x for x,_ in seq]; o=[]
    for i,ph in enumerate(p):
        nxt=p[i+1] if i+1<len(p) else ''
        if ph=='NG' and nxt in ('K','G'): ph='N'
        if ph in ('T','D'): ph='TD'
        if ph in ('AA','AO'): ph='LOT'
        if ph in ('OW','LOT') and nxt=='R': ph='OHR'
        if o and ((o[-1]=='ER' and ph=='R') or (o[-1]==ph=='R')): continue
        o.append(ph)
    return o
def redu(s): return ['RED' if x in RED else x for x in s]
src={}
for f in ['src_top-1000.json','src_rank_1000-3000.json','src_rank_5000-10000.json']:
    src.update(json.load(open(f)))
for kind in ['letter-to-sound rules','dictionary entry']:
    ws=[w for w,k in src.items() if k==kind]
    n=a=b=0
    for w in ws:
        if w not in CMUP: continue
        n+=1; h=esp_phones(esp[w]); R=CMUP[w]
        a+=any(conv(h)==conv(r) for r in R)
        b+=any(redu(conv(h))==redu(conv(r)) for r in R)
    print(f"{kind:24s} n={n:5d}  segments={a/n*100:5.1f}%  segments+reduction={b/n*100:5.1f}%")
