import json, re, collections, random
from score2 import esp_phones, cmu_phones, VOW, ed

cmu=json.load(open('cmu.json')); esp=json.load(open('espeak.json'))
CMUP={w:[cmu_phones(v) for v in vs] for w,vs in cmu.items()}

def norm(seq, reduce_vowels):
    """Normalise away KNOWN systematic espeak-vs-CMUDict transcription conventions."""
    p=[x for x,_ in seq]; st=[s for _,s in seq]
    o=[];os_=[]
    for i,(ph,s) in enumerate(zip(p,st)):
        nxt=p[i+1] if i+1<len(p) else ''
        if ph=='NG' and nxt in ('K','G'): ph='N'          # velar nasal assimilation
        if ph in ('T','D'): ph='TD'                        # flapping
        if ph in ('AA','AO'): ph='LOT'                     # cot-caught
        if ph in ('OW','LOT') and nxt=='R': ph='OHR'       # north/force merger
        o.append(ph); os_.append(s)
    # collapse ER R -> ER, R R -> R, and any doubled identical phone
    o2=[];s2=[]
    for ph,s in zip(o,os_):
        if o2 and ((o2[-1]=='ER' and ph=='R') or (o2[-1]==ph=='R')): continue
        o2.append(ph); s2.append(s)
    if reduce_vowels:
        o2=['V0' if (ph in VOW or ph in('LOT','OHR')) and s==0 else ph for ph,s in zip(o2,s2)]
    return o2

def ev(words,label):
    n=0; raw=0; nseg=0; nred=0; pe=pt=0; resid=[]
    for w in words:
        if w not in CMUP or w not in esp: continue
        n+=1
        h=esp_phones(esp[w]); refs=CMUP[w]
        if any([x for x,_ in h]==[x for x,_ in r] for r in refs): raw+=1
        okS=any(norm(h,False)==norm(r,False) for r in refs)
        okR=any(norm(h,True)==norm(r,True) for r in refs)
        nseg+=okS; nred+=okR
        if not okR: resid.append((w,' '.join(x for x,_ in h),' '.join(x for x,_ in refs[0])))
        H=norm(h,False); b=min((ed(H,norm(r,False)),len(norm(r,False))) for r in refs)
        pe+=b[0]; pt+=b[1]
    if n==0:
        print(f"{label:42s} n=      0 | no words matched. Are cmu.json and espeak.json built?")
        return resid
    print(f"{label:42s} n={n:7d} | raw={raw/n*100:5.1f}% | +conventions={nseg/n*100:5.1f}% | +vowel-reduction={nred/n*100:5.1f}% | PER={pe/pt*100:4.1f}%")
    return resid

allw=sorted(CMUP)
freq=[w.strip() for w in open('g10k.txt') if w.strip()]; freq=[w for w in freq if w in CMUP]
fs=set(freq)
print("raw = literal ARPAbet match | +conventions = after normalising 5 systematic espeak/CMUDict")
print("notation differences (velar-nasal, flap, cot-caught, north-force, ER+R) | +vowel-reduction =")
print("additionally treating all unstressed vowels as one reduced class\n")
ev(allw,'ALL CMUDict headwords (name-heavy)')
ev(freq[:1000],'Top 1000 frequency')
ev(freq[:2000],'Top 2000 frequency')
r5=ev(freq[:5000],'Top 5000 frequency')
r10=ev(freq,'Top ~10000 frequency')
ev([x for x in allw if x not in fs],'CMUDict minus top-10k (rare + surnames)')
print(f"\nresidual errors in top-5000 band: {len(r5)}; in top-10k band: {len(r10)}")
print("\n--- residual sample (top-5000 band), 50 ---")
random.seed(7)
for a,b,c in random.sample(r5,min(50,len(r5))): print(f'  {a:18s} espeak={b:32s} cmu={c}')
json.dump(r10,open('resid10.json','w')); json.dump(r5,open('resid5.json','w'))
