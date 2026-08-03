"""How often does espeak emit MORE THAN ONE primary stress mark in a single word?

This is not the disagreement case (two sources, one mark each). It is one
source emitting two `ˈ` for one word. S1 assumed a word has one primary
stress; if espeak routinely says otherwise, "take espeak's ˈ" is ambiguous
and the ambiguity is silent.

Run across all three in-scope languages.
"""
import subprocess, re, collections
ZWJ = '‍'

def load(path, pat, n):
    out = []
    for line in open(path, encoding='utf-8'):
        w = line.split()[0] if line.split() else ''
        if re.fullmatch(pat, w) and len(w) > 1: out.append(w)
        if len(out) >= n: break
    return out

CASES = [
    ('es', 'es_50k.txt', r"[a-záéíóúüñ]+", 12000),
    ('de', 'de_50k.txt', r"[a-zäöüß]+",   12000),
    ('en', 'g10k.txt',   r"[a-z]+",       10000),
]

for voice, path, pat, n in CASES:
    words = load(path, pat, n)
    p = subprocess.run(['espeak-ng','-v',voice,'-q','--ipa=3'],
                       input='\n'.join(words), capture_output=True, text=True)
    lines = [l.strip().replace(ZWJ,'') for l in p.stdout.split('\n')]
    lines = [l for l in lines if l]
    if len(lines) != len(words):
        print(f'{voice}: DESYNC {len(lines)} vs {len(words)} — skipping'); continue
    c = collections.Counter()
    multi, sec = [], 0
    for w, ip in zip(words, lines):
        k = ip.count('ˈ')
        c[k] += 1
        if 'ˌ' in ip: sec += 1
        if k > 1 and len(multi) < 18: multi.append((w, ip))
    tot = len(words)
    m = sum(v for k, v in c.items() if k > 1)
    print(f'\n=== {voice}  (n={tot}) ===')
    print(f'  0 primary marks : {c[0]:6}  ({c[0]/tot*100:5.2f}%)')
    print(f'  1 primary mark  : {c[1]:6}  ({c[1]/tot*100:5.2f}%)')
    print(f'  2+ primary marks: {m:6}  ({m/tot*100:5.2f}%)   <-- ambiguous under S1')
    print(f'  carries a secondary mark (discarded): {sec} ({sec/tot*100:.2f}%)')
    print('  examples:', )
    for w, ip in multi: print(f'      {w:22} {ip}')
    # what do the multi-mark words look like morphologically?
    if voice == 'es':
        allm = [w for w, ip in zip(words, lines) if ip.count('ˈ') > 1]
        mente = sum(1 for w in allm if w.endswith('mente'))
        print(f'  of the {len(allm)} multi-mark es words, {mente} end in -mente ({mente/max(len(allm),1)*100:.0f}%)')
