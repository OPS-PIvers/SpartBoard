import json, re, collections, random

DI = {'tʃ':'CH','dʒ':'JH','eɪ':'EY','aɪ':'AY','aʊ':'AW','ɔɪ':'OY','oʊ':'OW'}
UNI = {'p':'P','b':'B','t':'T','d':'D','k':'K','ɡ':'G','f':'F','v':'V','θ':'TH','ð':'DH',
 's':'S','z':'Z','ʃ':'SH','ʒ':'ZH','h':'HH','m':'M','n':'N','ŋ':'NG','l':'L',
 'ɹ':'R','r':'R','w':'W','j':'Y','ɾ':'T','ʔ':'T','x':'K','ɬ':'L',
 'i':'IY','ɪ':'IH','ɛ':'EH','e':'EH','æ':'AE','ɑ':'AA','ɔ':'AO','ʊ':'UH','u':'UW',
 'ʌ':'AH','ə':'AH','ɐ':'AH','ɜ':'ER','ɚ':'ER','ᵻ':'IH','a':'AE','o':'OW'}
VOW={'IY','IH','EH','AE','AA','AO','UH','UW','AH','ER','EY','OW','AY','AW','OY'}
DROP=set('ː̩̃ʲ')

def esp_phones(s):
    """returns list of (phone, stress) ; stress 1/2/0"""
    out=[]; i=0; pend=0
    while i<len(s):
        c=s[i]
        if c=='ˈ': pend=1; i+=1; continue
        if c=='ˌ': pend=2; i+=1; continue
        if c in DROP: i+=1; continue
        if s[i:i+2] in DI: p=DI[s[i:i+2]]; i+=2
        elif c in UNI: p=UNI[c]; i+=1
        else: i+=1; continue
        if p in VOW: out.append((p,pend)); pend=0
        else: out.append((p,0))
    return out

def cmu_phones(ph):
    out=[]
    for p in ph:
        m=re.match(r'([A-Z]+)(\d)?$',p)
        # Never fires on real CMUDict -- 0 of 799,783 tokens -- but a named error beats
        # `AttributeError: 'NoneType' object has no attribute 'group'` if this is ever
        # pointed at another lexicon. Reports the whole entry, not just the token:
        # cmu_phones() receives only the phone list, so that is as close as it can get
        # to naming the offending word.
        if m is None:
            raise ValueError(f"Unrecognised CMUDict phoneme {p!r} in entry {ph!r}")
        out.append((m.group(1), int(m.group(2)) if m.group(2) else 0))
    return out

FLAP={'T':'TD','D':'TD'}
LOT={'AA':'LOT','AO':'LOT'}
def practice(seq):
    """metric relevant to pronunciation practice:
       - unstressed vowels all collapse to one reduced class
       - intervocalic T/D flap collapsed
       - cot-caught merger collapsed"""
    o=[]
    for p,st in seq:
        if p in VOW:
            o.append('V0' if st==0 else LOT.get(p,p))
        else:
            o.append(FLAP.get(p,p))
    return o
def plain(seq): return [p for p,_ in seq]
def stresspat(seq): return [st for p,st in seq if p in VOW]

def ed(a,b):
    m,n=len(a),len(b); prev=list(range(n+1))
    for i in range(1,m+1):
        cur=[i]+[0]*n
        for j in range(1,n+1):
            cur[j]=min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]!=b[j-1]))
        prev=cur
    return prev[n]

# Everything below runs only when this file is executed directly. The other
# scorers do `from score2 import esp_phones, cmu_phones, VOW, ed`, so importing
# must not touch cmu.json / espeak.json — they may not exist yet.
if __name__ == "__main__":
    cmu=json.load(open('cmu.json')); esp=json.load(open('espeak.json'))
    CMUP={w:[cmu_phones(v) for v in vs] for w,vs in cmu.items()}

    def ev(words,label,collect=False):
        n=ex=pr=stx=0; pe=pt=0; wrong=[]
        for w in words:
            if w not in CMUP or w not in esp: continue
            n+=1
            h=esp_phones(esp[w]); refs=CMUP[w]
            okx=any(plain(h)==plain(r) for r in refs)
            okp=any(practice(h)==practice(r) for r in refs)
            oks=any(stresspat(h)==stresspat(r) for r in refs)
            ex+=okx; pr+=okp; stx+=oks
            if collect and not okp: wrong.append((w,' '.join(plain(h)),' '.join(plain(refs[0]))))
            b=min((ed(plain(h),plain(r)),len(r)) for r in refs)
            pe+=b[0]; pt+=b[1]
        if n==0:
            print(f"{label:44s} n=      0  -- no words matched. Are cmu.json and espeak.json built?")
            return wrong
        print(f"{label:44s} n={n:7d}  exact={ex/n*100:5.1f}%  practice={pr/n*100:5.1f}%  stress={stx/n*100:5.1f}%  PER={pe/pt*100:4.1f}%")
        return wrong

    allw=sorted(CMUP)
    freq=[w.strip() for w in open('g10k.txt') if w.strip()]
    freq=[w for w in freq if w in CMUP]
    print("METRIC KEY: exact = exact ARPAbet phone match ignoring stress; practice = unstressed vowels")
    print("collapsed + T/D flap collapsed + cot-caught merged; stress = stress pattern match; PER = phone edit rate\n")
    ev(allw,'ALL CMUDict headwords (117k, name-heavy)')
    ev(freq[:1000],'Top 1000 frequency words')
    ev(freq[:2000],'Top 2000 frequency words')
    ev(freq[:5000],'Top 5000 frequency words')
    w=ev(freq[:10000],'Top ~10000 frequency words',collect=True)
    tail=[x for x in allw if x not in set(freq)]
    ev(tail,'CMUDict MINUS top-10k (rare words + surnames)')
    print("\n--- mismatches (practice metric) inside top-10k frequency band, sample 45 ---")
    random.seed(3)
    for a,b,c in random.sample(w,min(45,len(w))): print(f'  {a:18s} espeak={b:34s} cmu={c}')
    print(f'\ntotal practice-metric mismatches in top-10k band: {len(w)}')
    json.dump(w,open('wrong_freq.json','w'))
