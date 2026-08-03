import subprocess, sys, json
words=[w.strip() for w in open('words.txt') if w.strip()]
out={}
CH=400
bad=0
for i in range(0,len(words),CH):
    chunk=words[i:i+CH]
    p=subprocess.run(['espeak-ng','-v','en-us','-q','--ipa'],
                     input='\n'.join(chunk), capture_output=True, text=True)
    # Fail loudly. A missing binary already raises FileNotFoundError, but espeak-ng
    # exits 0 even on an unrecognised option, so empty stdout -- not returncode -- is
    # the reliable signal. Without this the per-word fallback below writes '' for every
    # word and the scorers report 0% against a full-looking espeak.json.
    if p.returncode!=0 or not p.stdout.strip():
        raise RuntimeError(f"espeak-ng batch failed (rc={p.returncode}): {p.stderr.strip()[:200]!r}")
    toks=p.stdout.split()
    if len(toks)!=len(chunk):
        bad+=1
        for w in chunk:
            q=subprocess.run(['espeak-ng','-v','en-us','-q','--ipa'],input=w,capture_output=True,text=True)
            t=q.stdout.split()
            # Joined with '' rather than ' ' when espeak splits a word into several
            # tokens. The separator is irrelevant downstream: esp_phones() segments by
            # character/digraph and falls through anything unrecognised, so ' ' is
            # discarded anyway -- esp_phones('ˈɛspɪk') == esp_phones('ˈɛ spɪk'). Worth
            # knowing if this output is ever consumed by something expecting space-
            # delimited phones. (4 of ~294 chunks took this path; 0 values in the
            # resulting espeak.json contain a space and 0 are empty.)
            ipa=t[0] if len(t)==1 else ''.join(t)
            if not ipa:
                raise RuntimeError(f"espeak-ng produced no output for {w!r} (rc={q.returncode}): {q.stderr.strip()[:200]!r}")
            out[w]=ipa
    else:
        for w,t in zip(chunk,toks): out[w]=t
    if i % 20000 == 0: print(i, file=sys.stderr, flush=True)
print('chunks needing fallback:', bad, file=sys.stderr)
json.dump(out, open('espeak.json','w'))
