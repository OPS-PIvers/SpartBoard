import re, collections, json, sys

# CMUDict variant entries are "WORD(1) PHONES". Group them back to the base word.
ent = collections.defaultdict(list)
for line in open('cmudict.dict', encoding='utf-8'):
    line = line.split('#')[0].strip()
    if not line: continue
    w, _, rest = line.partition(' ')
    base = re.sub(r'\(\d+\)$', '', w)
    ent[base].append(rest.split())

def syls(ph):
    """ARPAbet vowels are exactly the tokens carrying a stress digit."""
    return [p for p in ph if p[-1].isdigit()]

def primary(ph):
    """1-based index of the primary-stressed syllable, or None."""
    s = syls(ph)
    for i, p in enumerate(s):
        if p[-1] == '1': return i + 1
    return None

multi = 0            # words with >1 variant
seg_same_diff_str = 0  # variants with IDENTICAL segments but different primary index
diff_primary = 0     # words whose variants disagree on primary index at all
no_primary = 0
poly = 0
examples_stress_only = []
examples_any = []

for w, vs in ent.items():
    prims = {primary(v) for v in vs}
    if None in prims:
        no_primary += 1
    if len(syls(vs[0])) > 1:
        poly += 1
    if len(vs) > 1:
        multi += 1
    real = {p for p in prims if p is not None}
    if len(real) > 1:
        diff_primary += 1
        if len(examples_any) < 12: examples_any.append((w, sorted(real)))
        # Now: is there a PAIR whose bare segments are identical?
        bare = collections.defaultdict(set)
        for v in vs:
            key = tuple(re.sub(r'\d$', '', p) for p in v)
            pi = primary(v)
            if pi: bare[key].add(pi)
        if any(len(s) > 1 for s in bare.values()):
            seg_same_diff_str += 1
            if len(examples_stress_only) < 15:
                k = [kk for kk, s in bare.items() if len(s) > 1][0]
                examples_stress_only.append((w, sorted(bare[k]), ' '.join(k)))

tot = len(ent)
print(f"headwords                              {tot}")
print(f"  polysyllabic (>1 syllable)           {poly}  ({poly/tot*100:.1f}%)")
print(f"  with >1 variant entry                {multi}  ({multi/tot*100:.1f}%)")
print(f"  variants disagree on primary index   {diff_primary}  ({diff_primary/tot*100:.2f}%)")
print(f"    ...of those, SAME segments         {seg_same_diff_str}  ({seg_same_diff_str/tot*100:.2f}%)")
print(f"  no primary stress at all             {no_primary}  ({no_primary/tot*100:.1f}%)")
print("\nsame-segments, different primary stress (a real accepted SET):")
for w, s, k in examples_stress_only: print(f"  {w:16} {s}   {k}")
print("\nany disagreement on primary index:")
for w, s in examples_any: print(f"  {w:16} {s}")
