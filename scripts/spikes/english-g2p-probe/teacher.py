import json
from score2 import esp_phones, cmu_phones, VOW
cmu=json.load(open('cmu.json')); esp=json.load(open('espeak.json'))
CMUP={w:[cmu_phones(v) for v in vs] for w,vs in cmu.items()}
RED={'AH','IH','IY','UH','ER'}
def conv(seq):
    p=[x for x,_ in seq]; o=[]
    for i,ph in enumerate(p):
        n=p[i+1] if i+1<len(p) else ''
        if ph=='NG' and n in ('K','G'): ph='N'
        if ph in ('T','D'): ph='TD'
        if ph in ('AA','AO'): ph='LOT'
        if ph in ('OW','LOT') and n=='R': ph='OHR'
        if o and ((o[-1]=='ER' and ph=='R') or (o[-1]==ph=='R')): continue
        o.append(ph)
    return o
def redu(s): return ['RED' if x in RED else x for x in s]

CORPUS = """
hello goodbye please thank you welcome sorry yes no maybe morning afternoon evening night
one two three four five six seven eight nine ten eleven twelve thirteen twenty thirty hundred thousand
red blue green yellow orange purple black white brown pink gray
mother father sister brother family baby grandmother grandfather aunt uncle cousin friend
head hair eyes ears nose mouth teeth hand arm leg foot knee shoulder finger stomach back
apple bread milk water rice beans cheese chicken fish meat egg soup salad fruit vegetable
breakfast lunch dinner hungry thirsty eat drink cook taste sweet salty spicy
shirt pants shoes socks hat coat dress skirt jacket gloves scarf
house kitchen bedroom bathroom window door table chair bed floor wall roof garden
school teacher student classroom pencil paper book notebook desk backpack scissors glue ruler
homework lesson question answer read write listen speak learn practice study test grade
dog cat bird horse cow pig sheep rabbit mouse elephant lion tiger bear monkey snake
tree flower grass leaf river mountain ocean beach forest sky sun moon star cloud rain snow wind
hot cold warm cool sunny cloudy rainy snowy windy weather season spring summer autumn winter
monday tuesday wednesday thursday friday saturday sunday today tomorrow yesterday week month year
happy sad angry tired excited scared nervous bored surprised proud shy calm
big small tall short long fat thin new old young fast slow easy hard clean dirty
walk run jump swim dance sing play sleep work help open close start stop give take
city town street park store market hospital library museum restaurant bank airport station
car bus train bicycle airplane boat truck taxi
doctor nurse police farmer chef driver artist singer engineer scientist
computer phone television radio camera clock money ticket letter map
before after during always never sometimes often usually first next last because
where when what who why how which whose
taco burrito salsa fiesta piñata tortilla amigo siesta
croissant baguette cafe ballet buffet garage genre bouquet
karaoke sushi origami tsunami karate
pizza spaghetti opera piano violin
kindergarten pretzel bratwurst
"""
words=[w for w in CORPUS.split() if w]
inc=[w for w in words if w in CMUP]; miss=[w for w in words if w not in CMUP]
print(f"corpus size {len(words)}; in CMUDict {len(inc)} ({len(inc)/len(words)*100:.1f}%); MISSING {len(miss)}: {miss}\n")
n=a=b=st=0; res=[]
for w in inc:
    n+=1; h=esp_phones(esp[w]) if w in esp else None
    if h is None: continue
    R=CMUP[w]
    lit=any([x for x,_ in h]==[x for x,_ in r] for r in R)
    okc=any(conv(h)==conv(r) for r in R)
    okr=any(redu(conv(h))==redu(conv(r)) for r in R)
    ss=any([s for p,s in h if p in VOW]==[s for p,s in r if p in VOW] for r in R)
    a+=okc; b+=okr; st+=ss
    if not okr: res.append((w,' '.join(x for x,_ in h),' | '.join(' '.join(x for x,_ in r) for r in R)))
print(f"espeak-ng vs CMUDict on this corpus (n={n}):")
print(f"  segment match (conventions normalised, stress ignored): {a/n*100:.1f}%")
print(f"  + vowel-reduction tolerance:                            {b/n*100:.1f}%")
print(f"  stress pattern match:                                   {st/n*100:.1f}%")
print(f"\nEVERY residual mismatch ({len(res)}):")
for x in res: print(f"  {x[0]:16s} espeak={x[1]:30s} cmu={x[2]}")
