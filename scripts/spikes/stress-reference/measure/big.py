"""Same question as stress_source.py, at n=10k instead of n=158.
Batched espeak (one word per input line -> one output line), validated by the
#2336 harness. Also splits the disagreements by whether espeak used its
exception dictionary or its letter-to-sound rules."""
import json, re, subprocess, collections

N = json.load(open('/home/user/SpartBoard/scripts/spikes/stress-detection/nuclei.json'))
NUCLEI = sorted(N['nuclei'], key=len, reverse=True)
ZWJ = '‍'

def scan(ipa):
    i, n, prim, sec = 0, 0, None, []
    while i < len(ipa):
        c = ipa[i]
        if c == 'ˈ': prim = n + 1; i += 1; continue
        if c == 'ˌ': sec.append(n + 1); i += 1; continue
        for t in NUCLEI:
            if ipa.startswith(t, i): n += 1; i += len(t); break
        else: i += 1
    return n, prim, sec

ent = collections.defaultdict(list)
for line in open('cmudict.dict', encoding='utf-8'):
    line = line.split('#')[0].strip()
    if not line: continue
    w, _, rest = line.partition(' ')
    ent[re.sub(r'\(\d+\)$', '', w)].append(rest.split())

def csyl(ph): return [p for p in ph if p[-1].isdigit()]
def cprim(ph):
    s = csyl(ph)
    for i, p in enumerate(s):
        if p[-1] == '1': return i + 1
    return None

words = [w.strip() for w in open('g10k.txt') if w.strip()]
words = [w for w in words if w in ent]
print('words matched to CMUDict:', len(words), flush=True)

p = subprocess.run(['espeak-ng', '-v', 'en-us', '-q', '--ipa=3'],
                   input='\n'.join(words), capture_output=True, text=True)
lines = [l.strip().replace(ZWJ, '') for l in p.stdout.split('\n')]
lines = [l for l in lines if l]
assert len(lines) == len(words), f'batching desync: {len(lines)} vs {len(words)}'

same = listed = notlisted = skipped = 0
multi_cmu = 0
ex_listed, ex_not = [], []
for w, ip in zip(words, lines):
    en, ep, _ = scan(ip)
    if ep is None or en < 2: skipped += 1; continue
    if en != len(csyl(ent[w][0])): skipped += 1; continue
    cps = {cprim(v) for v in ent[w]} - {None}
    if not cps: skipped += 1; continue
    if len(cps) > 1: multi_cmu += 1
    if ep in cps and len(cps) == 1: same += 1
    elif ep in cps:
        listed += 1
        if len(ex_listed) < 15: ex_listed.append((w, ep, sorted(cps)))
    else:
        notlisted += 1
        if len(ex_not) < 30: ex_not.append((w, ip, ep, sorted(cps)))

tot = same + listed + notlisted
diff = listed + notlisted
print(f'\ncomparable polysyllabic words: {tot}   (skipped {skipped})')
print(f'  CMUDict itself lists >1 primary position : {multi_cmu} ({multi_cmu/tot*100:.2f}%)')
print(f'  espeak matches CMUDict\'s sole reading    : {same} ({same/tot*100:.1f}%)')
print(f'  espeak DISAGREES                         : {diff} ({diff/tot*100:.1f}%)')
if diff:
    print(f'     both attested (in CMUDict variants)   : {listed} ({listed/diff*100:.1f}% of disagreements)')
    print(f'     espeak reading absent from CMUDict    : {notlisted} ({notlisted/diff*100:.1f}% of disagreements)')
print('\nBOTH ATTESTED:');  [print('   ', e) for e in ex_listed]
print('\nespeak ONLY (not attested by CMUDict):'); [print('   ', e) for e in ex_not]
