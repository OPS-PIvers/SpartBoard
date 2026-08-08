import json, re, collections, random
from score2 import esp_phones, cmu_phones, VOW, ed
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
def stresspat(seq): return [st for p,st in seq if p in VOW]

def ev(words,label,keep=False):
    n=0;a=b=c=d=0;pe=pt=0;res=[]
    for w in words:
        if w not in CMUP or w not in esp: continue
        n+=1; h=esp_phones(esp[w]); R=CMUP[w]
        a+= any([x for x,_ in h]==[x for x,_ in r] for r in R)
        okc=any(conv(h)==conv(r) for r in R); b+=okc
        okr=any(redu(conv(h))==redu(conv(r)) for r in R); c+=okr
        d+= any(stresspat(h)==stresspat(r) for r in R)
        if keep and not okr: res.append((w,' '.join(x for x,_ in h),' '.join(x for x,_ in R[0])))
        H=conv(h); m=min((ed(H,conv(r)),len(conv(r))) for r in R); pe+=m[0]; pt+=m[1]
    if n==0:
        print(f"{label:40s} n=     0 | no words matched. Are cmu.json and espeak.json built?")
        return res
    print(f"{label:40s} n={n:6d} | literal {a/n*100:5.1f}% | segments {b/n*100:5.1f}% | segments+reduction {c/n*100:5.1f}% | stress {d/n*100:5.1f}% | PER {pe/pt*100:4.1f}%")
    return res

freq=[w.strip() for w in open('g10k.txt') if w.strip()]; freq=[w for w in freq if w in CMUP]
fs=set(freq); allw=sorted(CMUP)
print("segments = phone-sequence match, STRESS IGNORED, 5 notation conventions normalised")
print("segments+reduction = additionally AH/IH/IY/UH/ER treated as one reduced class")
print("stress = stress pattern (primary/secondary/none per vowel) matches exactly\n")
ev(allw,'ALL CMUDict (117k, surname-heavy)')
ev(freq[:1000],'Top 1000 frequency')
ev(freq[:3000],'Top 3000 frequency')
r=ev(freq[:5000],'Top 5000 frequency',keep=True)
ev(freq,'Top ~10000 frequency')
ev([x for x in allw if x not in fs],'CMUDict minus top-10k')
print(f"\nresidual (segments+reduction failures) in top-5000: {len(r)}")
print("--- residual sample 60 ---")
random.seed(11)
for x in random.sample(r,min(60,len(r))): print(f'  {x[0]:18s} espeak={x[1]:32s} cmu={x[2]}')
json.dump(r,open('resid_final.json','w'))
