"""Can German get a second stress source from morphology alone, as Spanish
does from orthography?

Claim under test, stated before the answer is known:
  German primary stress is recoverable from word shape (stem-initial, minus a
  closed set of unstressed prefixes, plus a closed set of stress-attracting
  loanword suffixes) accurately enough to serve as an independent cross-check.

Scored against espeak's `ˈ`. Same protocol as spanish.py: syllabify the
ORTHOGRAPHY independently, require the syllable count to agree with espeak's
nucleus count, then compare stress position only where the counts agree.
Words where the counts disagree are excluded and reported, not silently
scored.
"""
import subprocess, re, collections, json

import pathlib
N = json.load(
    open(pathlib.Path(__file__).parent.parent.parent / 'stress-detection/nuclei.json')
)
NUCLEI = sorted(N['nuclei'], key=len, reverse=True)
ZWJ = '‍'

def scan(ipa):
    i, n, prim = 0, 0, None
    while i < len(ipa):
        c = ipa[i]
        if c == 'ˈ': prim = n + 1; i += 1; continue
        if c == 'ˌ': i += 1; continue
        for t in NUCLEI:
            if ipa.startswith(t, i): n += 1; i += len(t); break
        else: i += 1
    return n, prim

# --- German orthographic syllabification: vowel groups, digraphs first ---
DIG = ['schau','eau','ieh','aah','ieu','ai','au','äu','eu','ei','ie','aa','ee','oo',
       'ah','eh','ih','oh','uh','äh','öh','üh','ay','ey','oi','ui']
V = set('aeiouäöü')
def nuclei_of(w):
    out, i = [], 0
    while i < len(w):
        for d in DIG:
            if w.startswith(d, i):
                # 'ie' in -ieren/-ie is a nucleus; 'ei','au' etc all single
                out.append(i); i += len(d); break
        else:
            if w[i] in V:
                out.append(i); i += 1
            else:
                i += 1
    return out

UNSTRESSED_PREFIX = ['ver','ent','emp','zer','be','ge','er','miss']
SEPARABLE = ['durch','wieder','zurück','herunter','zusammen','auseinander',
             'über','unter','gegen','zwischen','voran','vorbei','hinaus','heraus',
             'auf','aus','ein','mit','ab','an','vor','nach','zu','her','hin','um','bei','fest','frei','los','statt','teil','weg','zurecht']
# suffixes that pull primary stress onto themselves (loanword morphology)
SUF_STRESS = ['ieren', 'ierung', 'ität', 'tion', 'sion', 'ismus', 'istik', 'istisch',
              'ent', 'ant', 'anz', 'enz', 'ur', 'eur', 'ös', 'iv', 'al', 'ell', 'abel',
              'ibel', 'ade', 'age', 'ei', 'ie', 'ist', 'at', 'ät', 'on', 'ar', 'är', 'esk']

def rule_stress(w):
    nuc = nuclei_of(w)
    if not nuc: return None, 0
    if len(nuc) == 1: return 1, 1
    # 1. stress-attracting loanword suffix wins
    for s in sorted(SUF_STRESS, key=len, reverse=True):
        if w.endswith(s) and len(w) > len(s) + 2:
            start = len(w) - len(s)
            for k, p in enumerate(nuc):
                if p >= start: return k + 1, len(nuc)
    # 2. separable prefix is stressed (it is initial, so syllable 1)
    for p in sorted(SEPARABLE, key=len, reverse=True):
        if w.startswith(p) and len(w) > len(p) + 2:
            return 1, len(nuc)
    # 3. unstressed prefix pushes stress to the stem's first syllable
    for p in sorted(UNSTRESSED_PREFIX, key=len, reverse=True):
        if w.startswith(p) and len(w) > len(p) + 2:
            for k, pos in enumerate(nuc):
                if pos >= len(p): return k + 1, len(nuc)
    # 4. default: stem-initial
    return 1, len(nuc)

words = []
for line in open('de_50k.txt', encoding='utf-8'):
    t = line.split()
    if t and re.fullmatch(r"[a-zäöüß]+", t[0]) and len(t[0]) > 2:
        words.append(t[0])
words = words[:12000]

p = subprocess.run(['espeak-ng','-v','de','-q','--ipa=3'],
                   input='\n'.join(words), capture_output=True, text=True)
lines = [l.strip().replace(ZWJ,'') for l in p.stdout.split('\n')]
lines = [l for l in lines if l]
assert len(lines) == len(words), f'desync {len(lines)} vs {len(words)}'

cok = cbad = sok = sbad = skip = 0
ex_c, ex_s = [], []
for w, ip in zip(words, lines):
    en, ep = scan(ip)
    rp, rn = rule_stress(w)
    if ep is None or rp is None or en < 2: skip += 1; continue
    if en != rn:
        cbad += 1
        if len(ex_c) < 15: ex_c.append((w, ip, en, rn))
        continue
    cok += 1
    if ep == rp: sok += 1
    else:
        sbad += 1
        if len(ex_s) < 30: ex_s.append((w, ip, ep, rp))

print(f'polysyllabic German words: {cok+cbad}  (skipped {skip})')
print(f'  syllable COUNT agrees rule-vs-espeak : {cok} ({cok/(cok+cbad)*100:.2f}%)')
print(f'  of those, stress POSITION agrees     : {sok}/{cok} ({sok/cok*100:.2f}%)')
print(f'\n--- for comparison: Spanish scored 99.65% on the same protocol ---')
print('\ncount mismatches:'); [print('   ',e) for e in ex_c]
print('\nSTRESS disagreements:'); [print('   ',e) for e in ex_s]
