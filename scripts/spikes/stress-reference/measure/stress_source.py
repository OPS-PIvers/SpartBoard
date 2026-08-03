"""Does espeak's `ˈ` give the ACCEPTED SET, or only one member of it?

The claim under test, stated before the answer is known:
  H1  When espeak and CMUDict disagree on which syllable takes primary stress,
      CMUDict usually lists espeak's reading as one of its own variants.
      (i.e. the 8.5% disagreement is "both attested", and the job is to
      enumerate a set.)
  H0  It usually does not. (i.e. the disagreement is mostly espeak being
      wrong, and the job is a correction path, not a set.)

Self-check first: the syllable-counting tokenizer is validated against
CMUDict's syllable counts. A stress INDEX is meaningless if the count is wrong.
"""
import json, re, subprocess, sys, collections

N = json.load(open('/home/user/SpartBoard/scripts/spikes/stress-detection/nuclei.json'))
NUCLEI = sorted(N['nuclei'], key=len, reverse=True)   # longest match first
ZWJ = '‍'

def esp(words, voice):
    """One espeak call per word: batching --ipa merges lines unreliably for us."""
    out = []
    for w in words:
        p = subprocess.run(['espeak-ng', '-v', voice, '-q', '--ipa=3'],
                           input=w, capture_output=True, text=True)
        out.append(p.stdout.strip().replace(ZWJ, ''))
    return out

def scan(ipa):
    """-> (n_syllables, primary_index_1based_or_None). Longest-match over the
    vocabulary-derived nucleus set; consonants fall through one char at a time."""
    i, n, prim = 0, 0, None
    while i < len(ipa):
        c = ipa[i]
        if c == 'ˈ':
            prim = n + 1; i += 1; continue
        if c == 'ˌ':
            i += 1; continue
        for t in NUCLEI:
            if ipa.startswith(t, i):
                n += 1; i += len(t); break
        else:
            i += 1
    return n, prim

# ---- CMUDict ----
ent = collections.defaultdict(list)
for line in open('cmudict.dict', encoding='utf-8'):
    line = line.split('#')[0].strip()
    if not line: continue
    w, _, rest = line.partition(' ')
    ent[re.sub(r'\(\d+\)$', '', w)].append(rest.split())

def cmu_syls(ph): return [p for p in ph if p[-1].isdigit()]
def cmu_prim(ph):
    s = cmu_syls(ph)
    for i, p in enumerate(s):
        if p[-1] == '1': return i + 1
    return None

CORPUS = open('corpus.txt').read().split()
words = [w for w in CORPUS if w in ent]
ipas = esp(words, 'en-us')

# ---- self-check: syllable counts ----
agree = mism = 0
bad = []
for w, ip in zip(words, ipas):
    en, _ = scan(ip)
    cn = len(cmu_syls(ent[w][0]))
    if en == cn: agree += 1
    else:
        mism += 1
        if len(bad) < 15: bad.append((w, ip, en, cn))
print(f"SELF-CHECK syllable count espeak-vs-CMUDict: {agree}/{agree+mism} = {agree/(agree+mism)*100:.1f}%")
for b in bad: print("   mismatch", b)

# ---- the actual question ----
same = diff = 0
listed = notlisted = 0
ex_listed, ex_not = [], []
for w, ip in zip(words, ipas):
    en, ep = scan(ip)
    cn = len(cmu_syls(ent[w][0]))
    if ep is None or en != cn or en < 2: continue   # only comparable, polysyllabic
    cps = {cmu_prim(v) for v in ent[w]} - {None}
    if not cps: continue
    if ep in cps and len(cps) == 1:
        same += 1
    elif ep in cps:
        diff += 1; listed += 1
        if len(ex_listed) < 12: ex_listed.append((w, ep, sorted(cps)))
    else:
        diff += 1; notlisted += 1
        if len(ex_not) < 20: ex_not.append((w, ip, ep, sorted(cps)))

tot = same + diff
print(f"\ncomparable polysyllabic words: {tot}")
print(f"  espeak agrees with CMUDict's only reading : {same} ({same/tot*100:.1f}%)")
print(f"  espeak DISAGREES                          : {diff} ({diff/tot*100:.1f}%)")
if diff:
    print(f"      ...CMUDict lists espeak's reading too : {listed} ({listed/diff*100:.1f}% of disagreements)")
    print(f"      ...CMUDict does NOT list it           : {notlisted} ({notlisted/diff*100:.1f}% of disagreements)")
print("\nBOTH ATTESTED (a real accepted set):")
for e in ex_listed: print("   ", e)
print("\nespeak's reading NOT in CMUDict at all:")
for e in ex_not: print("   ", e)
