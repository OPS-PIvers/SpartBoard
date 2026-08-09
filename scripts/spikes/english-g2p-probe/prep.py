import re, collections, json
ent = collections.defaultdict(list)
for line in open('cmudict.dict', encoding='utf-8'):
    line=line.split('#')[0].strip()
    if not line: continue
    parts=line.split()
    w=parts[0]; ph=parts[1:]
    base=re.sub(r'\(\d+\)$','',w)
    if not re.fullmatch(r"[a-z']+", base): continue
    if "'" in base: continue     # keep it simple: alphabetic only
    ent[base].append(ph)
words=sorted(ent)
print('alphabetic headwords:', len(words))
print('total variants:', sum(len(v) for v in ent.values()))
json.dump({w:ent[w] for w in words}, open('cmu.json','w'))
open('words.txt','w').write('\n'.join(words)+'\n')
