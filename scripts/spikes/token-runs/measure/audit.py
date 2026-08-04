"""Follow-ups on what runs.py turned up, in three parts.

1. Are the Spanish repeats real Spanish, or imported spellings? The es list is
   built from film subtitles, so it is full of English proper nouns. `mˈiss`
   for "miss" is espeak reading an English spelling with the Spanish voice --
   not a Spanish geminate. Print the whole set so it can be read, and probe a
   hand-picked set of genuine Spanish `nn` words separately, since those turn
   out to be too rare to reach a top-12k subtitle frequency list at all.
   (An earlier version of this tried to split the set by whether the source
   spelling contained `nn`/`cc`/`ll`/`rr`. That is worthless: it classifies
   `danny` and `hollywood` as Spanish. There is no cheap automatic test here,
   so the set is printed for reading instead of scored.)

2. What are the orphan length marks? runs.py found `ː` matching no vocabulary
   token 273 times in 10k English words and 45 times in 12k German. Greedy
   matching consumed the vowel and left the length mark stranded, which means
   the length-marked vowel is NOT a vocabulary token. Report which vowel each
   orphan follows.

3. What are the parenthesised spans in German? 272 `(` and 272 `)`. espeak
   writes `(en)` / `(de)` language-switch markers into the IPA stream when it
   decides a word belongs to another language.

Parts 2 and 3 are not about #2380. They are concrete members of the map's
open server-side symbol-normalization step, found by auditing what the
tokenizer rejected rather than what it accepted.
"""

import collections
import json
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).parent
VOCAB_PATH = HERE.parent.parent / 'stress-detection' / 'vocab.json'
ZWJ = '‍'
SPECIAL = {'<s>', '<pad>', '</s>', '<unk>'}

with open(VOCAB_PATH, encoding='utf-8') as fh:
    VOCAB = json.load(fh)
TOKENS = sorted((t for t in VOCAB if t not in SPECIAL), key=len, reverse=True)


def load(path, pat, n):
    out = []
    with open(HERE / path, encoding='utf-8') as fh:
        for line in fh:
            parts = line.split()
            w = parts[0] if parts else ''
            if re.fullmatch(pat, w) and len(w) > 1:
                out.append(w)
            if len(out) >= n:
                break
    return out


def phonemize(voice, words):
    p = subprocess.run(
        ['espeak-ng', '-v', voice, '-q', '--ipa=3'],
        input='\n'.join(words), capture_output=True, text=True, check=True,
    )
    return [ln.strip() for ln in p.stdout.split('\n') if ln.strip()]


def tokenize(ipa):
    ipa = ipa.replace(ZWJ, '').replace('ˈ', '').replace('ˌ', '')
    toks, orphans, i = [], [], 0
    while i < len(ipa):
        for t in TOKENS:
            if ipa.startswith(t, i):
                toks.append(t)
                i += len(t)
                break
        else:
            orphans.append((ipa[i], toks[-1] if toks else None))
            i += 1
    return toks, orphans


def has_repeat(toks):
    return any(a == b for a, b in zip(toks, toks[1:]))


print('=' * 68)
print('PART 1 -- are the Spanish repeats Spanish?')
print('=' * 68)
words = load('es_50k.txt', r'[a-záéíóúüñ]+', 12000)
lines = phonemize('es', words)
hits = [(w, ipa) for w, ipa in zip(words, lines)
        if has_repeat(tokenize(ipa)[0])]
print(f'  es words with a repeated token: {len(hits)} of {len(words)}')
print('  the full set, for reading:')
for i in range(0, len(hits), 4):
    print('      ' + '  '.join(f'{w}' for w, _ in hits[i:i + 4]))

# Spanish orthography doubles almost nothing: `rr` is a single `r` token, `ll`
# is `ʎ`, `cc` is `kθ`. `nn` is the only doubling that can reach the token
# stream as a repeat -- and those words are rare enough to miss a top-12k
# subtitle list, so probe them directly.
NATIVE_NN = ['innato', 'innecesario', 'perenne', 'connotación', 'innovación',
             'innegable', 'ennoblecer', 'sinnúmero']
nn_out = phonemize('es', NATIVE_NN)
print('\n  genuine Spanish -nn- words, probed directly:')
for w, ipa in zip(NATIVE_NN, nn_out):
    toks, _ = tokenize(ipa)
    print(f'      {w:16} /{ipa:20}/ repeat? {has_repeat(toks)}')
    print(f'      {"":16}  in top-12k list? {w in set(words)}')

print()
print('=' * 68)
print('PART 2 -- orphan length marks: which vowels are not in the vocabulary?')
print('=' * 68)
for label, voice, path, pat, n in [
    ('en', 'en-us', 'g10k.txt', r'[a-z]+', 10000),
    ('de', 'de', 'de_50k.txt', r'[a-zäöüß]+', 12000),
    ('es', 'es', 'es_50k.txt', r'[a-záéíóúüñ]+', 12000),
]:
    ws = load(path, pat, n)
    ls = phonemize(voice, ws)
    prev = collections.Counter()
    ex = collections.defaultdict(list)
    for w, ipa in zip(ws, ls):
        _, orph = tokenize(ipa)
        for ch, before in orph:
            if ch == 'ː':
                prev[before] += 1
                if len(ex[before]) < 3:
                    ex[before].append((w, ipa))
    tot = sum(prev.values())
    print(f'  {label}: {tot} orphan length marks in {len(ws)} words')
    for v, c in prex if (prex := prev.most_common()) else []:
        combined = (v or '') + 'ː'
        inv = combined in VOCAB
        s = ', '.join(f'{w} /{ipa}/' for w, ipa in ex[v][:2])
        print(f'      after {v!r:6} x{c:4}  -> {combined!r} in vocab? {inv}   {s}')

print()
print('=' * 68)
print('PART 3 -- parenthesised language-switch markers (German)')
print('=' * 68)
ws = load('de_50k.txt', r'[a-zäöüß]+', 12000)
ls = phonemize('de', ws)
span = re.compile(r'\([^)]*\)')
hits, tags = [], collections.Counter()
for w, ipa in zip(ws, ls):
    found = span.findall(ipa.replace(ZWJ, ''))
    if found:
        hits.append((w, ipa))
        for f in found:
            tags[f] += 1
print(f'  German words carrying a parenthesised span: {len(hits)} of {len(ws)} '
      f'({len(hits) / len(ws) * 100:.2f}%)')
print(f'  distinct spans: {dict(tags.most_common(10))}')
for w, ipa in hits[:12]:
    print(f'      {w:20} /{ipa}/')
for label, voice, path, pat, n in [
    ('es', 'es', 'es_50k.txt', r'[a-záéíóúüñ]+', 12000),
    ('en', 'en-us', 'g10k.txt', r'[a-z]+', 10000),
]:
    ws2 = load(path, pat, n)
    ls2 = phonemize(voice, ws2)
    c = sum(1 for ipa in ls2 if span.search(ipa.replace(ZWJ, '')))
    print(f'  {label}: {c} of {len(ws2)} ({c / len(ws2) * 100:.2f}%)')
