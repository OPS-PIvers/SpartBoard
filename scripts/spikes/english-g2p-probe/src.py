import subprocess, json, collections, random
freq=[w.strip() for w in open('g10k.txt') if w.strip()]
cmu=json.load(open('cmu.json'))
freq=[w for w in freq if w in cmu]
def source(words):
    c=collections.Counter(); per={}
    CH=200
    for i in range(0,len(words),CH):
        ch=words[i:i+CH]
        for w in ch:
            p=subprocess.run(['espeak-ng','-v','en-us','-q','-X'],input=w,capture_output=True,text=True)
            t=p.stdout
            if 'Found:' in t: k='dictionary entry'
            elif 'Translate' in t: k='letter-to-sound rules'
            else: k='other'
            c[k]+=1; per[w]=k
    return c,per
for lab,ws in [('top-1000',freq[:1000]),('rank 1000-3000',freq[1000:3000]),('rank 5000-10000',freq[5000:10000])]:
    c,per=source(ws)
    tot=sum(c.values())
    print(lab, {k:f"{v} ({v/tot*100:.1f}%)" for k,v in c.most_common()})
    json.dump(per,open(f'src_{lab.replace(" ","_")}.json','w'))
