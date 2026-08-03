"""Can Spanish get a second stress source WITHOUT a lexicon?

Claim under test, stated before the answer is known:
  Spanish primary stress is recoverable from spelling alone by the standard
  three-part orthographic rule, accurately enough to serve as the independent
  cross-check that CMUDict provides for English.

If it holds, es gets #2360's disagreement-flag mechanism for free, from ~30
lines of rules and no data file. If it doesn't, es has one source and the
never-penalize-a-correct-dialect rule has nothing to bite on.

Scored against espeak's own `ˈ`, counted in the model's nucleus space.
"""
import json, re, subprocess, collections, unicodedata

N = json.load(open('/home/user/SpartBoard/scripts/spikes/stress-detection/nuclei.json'))
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

# ---- the orthographic rule ----
STRONG, WEAK = set('aeoáéó'), set('iuíúü')
ACC = {'á':'a','é':'e','í':'i','ó':'o','ú':'u'}

def syllabify_nuclei(w):
    """Return the list of vowel-group nuclei, each as (start, has_written_accent).
    Spanish diphthong rules: strong+weak or weak+weak fuse into one nucleus;
    strong+strong are two; an ACCENTED weak vowel breaks the diphthong."""
    out, i = [], 0
    V = STRONG | WEAK
    while i < len(w):
        if w[i] not in V: i += 1; continue
        j, acc = i, w[i] in ACC
        while j + 1 < len(w) and w[j+1] in V:
            a, b = w[j], w[j+1]
            # accented weak vowel never fuses (país, día, continúa)
            if b in ('í','ú') or a in ('í','ú'): break
            if a in STRONG and b in STRONG: break          # hiatus: ae, eo, oa
            j += 1
            if w[j] in ACC: acc = True
        out.append((i, acc))
        i = j + 1
    return out

def rule_stress(w):
    nuc = syllabify_nuclei(w)
    if not nuc: return None, 0
    for k, (_, acc) in enumerate(nuc):
        if acc: return k + 1, len(nuc)                     # written accent wins
    if len(nuc) == 1: return 1, 1
    last = w[-1]
    if last in 'aeiouáéíóú' or last in 'ns':
        return len(nuc) - 1, len(nuc)                      # llana / penultimate
    return len(nuc), len(nuc)                              # aguda / final

words = []
for line in open('es_50k.txt', encoding='utf-8'):
    w = line.split()[0]
    if re.fullmatch(r"[a-záéíóúüñ]+", w) and len(w) > 1:
        words.append(w)
words = words[:12000]

p = subprocess.run(['espeak-ng','-v','es','-q','--ipa=3'],
                   input='\n'.join(words), capture_output=True, text=True)
lines = [l.strip().replace(ZWJ,'') for l in p.stdout.split('\n')]
lines = [l for l in lines if l]
assert len(lines) == len(words), f'desync {len(lines)} vs {len(words)}'

cnt_ok = cnt_bad = 0; s_ok = s_bad = 0; skipped = 0
ex_cnt, ex_str = [], []
bycat = collections.Counter()
for w, ip in zip(words, lines):
    en, ep = scan(ip)
    rp, rn = rule_stress(w)
    if ep is None or rp is None or en < 2: skipped += 1; continue
    if en != rn:
        cnt_bad += 1
        if len(ex_cnt) < 20: ex_cnt.append((w, ip, en, rn))
        continue
    cnt_ok += 1
    if ep == rp: s_ok += 1
    else:
        s_bad += 1
        if len(ex_str) < 25: ex_str.append((w, ip, ep, rp))
        bycat[w[-1]] += 1

print(f'polysyllabic words compared: {cnt_ok+cnt_bad}   (skipped {skipped})')
print(f'  syllable COUNT agrees rule-vs-espeak : {cnt_ok} ({cnt_ok/(cnt_ok+cnt_bad)*100:.2f}%)')
print(f'  of those, stress POSITION agrees     : {s_ok}/{cnt_ok} ({s_ok/cnt_ok*100:.3f}%)')
print(f'  disagreements                        : {s_bad}')
print('\ncount mismatches (tokenizer or real):'); [print('   ',e) for e in ex_cnt]
print('\nSTRESS disagreements:'); [print('   ',e) for e in ex_str]
print('\ndisagreements by final letter:', bycat.most_common(10))
