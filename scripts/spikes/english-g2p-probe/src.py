import subprocess, json, collections, random
freq=[w.strip() for w in open('g10k.txt') if w.strip()]
cmu=json.load(open('cmu.json'))
freq=[w for w in freq if w in cmu]
def source(words):
    # One subprocess per word, deliberately. Unlike run_espeak.py's batched `--ipa`
    # call (one output line per word), `-X` emits a multi-line rule trace, so batching
    # would interleave traces and make per-word attribution rest on assuming exactly
    # one marker per word in order. Slow and correct beats fast and fragile here.
    c=collections.Counter(); per={}
    for w in words:
        p=subprocess.run(['espeak-ng','-v','en-us','-q','-X'],input=w,capture_output=True,text=True)
        t=p.stdout
        # Without this an espeak failure yields t='', which silently classifies as
        # 'other' and quietly skews the dictionary-vs-rules split.
        if not t.strip():
            raise RuntimeError(f"espeak-ng produced no trace for {w!r} (rc={p.returncode}): {p.stderr.strip()[:200]!r}")
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
