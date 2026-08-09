import json, re, sys, collections

DI = {'tʃ':'CH','dʒ':'JH','eɪ':'EY','aɪ':'AY','aʊ':'AW','ɔɪ':'OY','oʊ':'OW'}
UNI = {
 'p':'P','b':'B','t':'T','d':'D','k':'K','ɡ':'G','f':'F','v':'V','θ':'TH','ð':'DH',
 's':'S','z':'Z','ʃ':'SH','ʒ':'ZH','h':'HH','m':'M','n':'N','ŋ':'NG','l':'L',
 'ɹ':'R','r':'R','w':'W','j':'Y','ɾ':'T','ʔ':'T','x':'K','ɬ':'L',
 'i':'IY','ɪ':'IH','ɛ':'EH','e':'EH','æ':'AE','ɑ':'AA','ɔ':'AO','ʊ':'UH','u':'UW',
 'ʌ':'AH','ə':'AH','ɐ':'AH','ɜ':'ER','ɚ':'ER','ᵻ':'IH','a':'AE','o':'OW',
}
DROP = set('ˈˌː̩̃ʲ')
unmapped = collections.Counter()

def to_arpa(s):
    out=[]; i=0
    while i < len(s):
        if s[i] in DROP: i+=1; continue
        if s[i:i+2] in DI: out.append(DI[s[i:i+2]]); i+=2; continue
        c=s[i]
        if c in UNI: out.append(UNI[c])
        else: unmapped[c]+=1
        i+=1
    return out

def strip_stress(ph): return [re.sub(r'\d','',p) for p in ph]

# lenient equivalence classes for genuinely ambiguous contrasts
LEN = {'T':'TD','D':'TD','AH':'RED','IH':'RED','AA':'LOT','AO':'LOT','UH':'RED2','UW':'RED2'}
def leni(ph): return [LEN.get(p,p) for p in ph]

def ed(a,b):
    m,n=len(a),len(b)
    prev=list(range(n+1))
    for i in range(1,m+1):
        cur=[i]+[0]*n
        for j in range(1,n+1):
            cur[j]=min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]!=b[j-1]))
        prev=cur
    return prev[n]

cmu=json.load(open('cmu.json')); esp=json.load(open('espeak.json'))

def evaluate(words, label):
    n=exact=lenient=0; pe=pt=0; wrong=[]
    for w in words:
        if w not in cmu or w not in esp: continue
        n+=1
        hyp=to_arpa(esp[w])
        refs=[strip_stress(r) for r in cmu[w]]
        if any(hyp==r for r in refs): exact+=1; lenient+=1
        elif any(leni(hyp)==leni(r) for r in refs): lenient+=1
        else: wrong.append((w,' '.join(hyp),' '.join(refs[0])))
        best=min((ed(hyp,r),len(r)) for r in refs)
        pe+=best[0]; pt+=best[1]
    if n==0:
        print(f"\n=== {label} — 0 words matched. Are cmu.json and espeak.json built? ===")
        return wrong
    print(f"\n=== {label} (n={n}) ===")
    print(f"  word accuracy, exact ARPAbet match (no stress): {exact/n*100:.1f}%   WER {100-exact/n*100:.1f}%")
    print(f"  word accuracy, lenient (T/D flap, AH~IH reduction, AA~AO merger, UH~UW): {lenient/n*100:.1f}%   WER {100-lenient/n*100:.1f}%")
    print(f"  phoneme error rate (edit dist / ref len): {pe/pt*100:.1f}%")
    return wrong

allw=sorted(cmu)
wrong=evaluate(allw,'FULL CMUDict headwords (alphabetic)')
print('\nunmapped espeak chars:', dict(unmapped))
print('\nsample of 40 mismatches:')
import random; random.seed(1)
for w,h,r in random.sample(wrong,min(40,len(wrong))): print(f'  {w:22s} espeak={h:38s} cmu={r}')
json.dump(wrong, open('wrong_all.json','w'))
