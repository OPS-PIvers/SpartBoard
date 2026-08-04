"""How often does an espeak-ng reference already contain ADJACENT IDENTICAL
vocabulary tokens?

The question behind it (#2380): a held Spanish trill makes the CTC model emit
one `r` per tongue contact, while the espeak reference for `perro` holds
exactly one. Collapsing runs of the same token before alignment is the obvious
fix. It is only safe if a *reference* never legitimately contains two of the
same token in a row -- because collapsing destroys that distinction.

So: tokenize espeak `--ipa=3` output into the acoustic model's own 392-token
vocabulary, and count words whose token sequence contains a repeat.

WHAT THIS TEST COVERS, AND WHAT IT DOES NOT
-------------------------------------------
Covers: the REFERENCE side only, for es/de/en, on frequency-ranked wordlists.
It answers "would a collapse rule destroy information that is present in a
stored reference today".

Does NOT cover:
  - the MODEL-OUTPUT side. Whether the model emits spurious runs beyond the
    rhotics is a separate acoustic measurement (n=5 clips exist; see
    ../../retroflex-confusion/RESULTS.md).
  - whether a doubled reference token is PHONETICALLY real. espeak writing
    `n n` for `innato` is a fact about espeak, not proof a Spanish speaker
    produces two distinct nasals. This test measures what the stored string
    contains, which is what the aligner sees -- that is the decision-relevant
    quantity, but it is not a claim about speech.
  - multi-word targets. One word per line, matching every other G2P
    measurement on this map.
  - languages beyond es/de/en, and words outside these frequency lists.

Tokenization is greedy longest-match against the vocabulary, the same shape as
`stress-reference/measure/big.py::scan` but over all sound tokens rather than
just the 244 nuclei. Stress marks are stripped (S1 reads `ˈ` separately) and
the zero-width joiner espeak writes inside diphthongs is removed first -- both
are established normalization steps on this map.

Characters that match no vocabulary token are counted and reported rather than
skipped silently (map rule 8: audit what your rule rejected).
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

# Longest-first so greedy matching prefers `aʊ` over `a`, `eː` over `e`.
TOKENS = sorted((t for t in VOCAB if t not in SPECIAL), key=len, reverse=True)

CASES = [
    ('es', 'es', 'es_50k.txt', r'[a-záéíóúüñ]+', 12000),
    ('de', 'de', 'de_50k.txt', r'[a-zäöüß]+', 12000),
    ('en', 'en-us', 'g10k.txt', r'[a-z]+', 10000),
]


def load(path, pat, n):
    """First `n` words of a frequency list matching `pat`, length > 1."""
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


def tokenize(ipa):
    """(tokens, unmatched_chars) for one espeak IPA string."""
    ipa = ipa.replace(ZWJ, '').replace('ˈ', '').replace('ˌ', '')
    toks, bad, i = [], [], 0
    while i < len(ipa):
        for t in TOKENS:
            if ipa.startswith(t, i):
                toks.append(t)
                i += len(t)
                break
        else:
            bad.append(ipa[i])
            i += 1
    return toks, bad


def phonemize(voice, words):
    p = subprocess.run(
        ['espeak-ng', '-v', voice, '-q', '--ipa=3'],
        input='\n'.join(words), capture_output=True, text=True, check=True,
    )
    lines = [ln.strip() for ln in p.stdout.split('\n')]
    return [ln for ln in lines if ln]


def main():
    grand = collections.Counter()
    for label, voice, path, pat, n in CASES:
        words = load(path, pat, n)
        lines = phonemize(voice, words)
        if len(lines) != len(words):
            print(f'{label}: DESYNC {len(lines)} vs {len(words)} -- skipping')
            continue

        repeats = collections.Counter()   # token -> how many words repeat it
        examples = collections.defaultdict(list)
        unmatched = collections.Counter()
        with_repeat = 0
        rhotic_repeat = 0
        longest_run = 0

        for w, ipa in zip(words, lines):
            toks, bad = tokenize(ipa)
            for ch in bad:
                unmatched[ch] += 1

            seen = set()
            run, best = 1, 1
            for a, b in zip(toks, toks[1:]):
                if a == b:
                    seen.add(a)
                    run += 1
                    best = max(best, run)
                else:
                    run = 1
            if seen:
                with_repeat += 1
                longest_run = max(longest_run, best)
                if seen & {'r', 'ɾ', 'ɹ', 'ʁ'}:
                    rhotic_repeat += 1
                for t in seen:
                    repeats[t] += 1
                    if len(examples[t]) < 6:
                        examples[t].append((w, ipa))

        tot = len(words)
        grand[label] = with_repeat
        print(f'\n=== {label}  (n={tot} words, voice={voice}) ===')
        print(f'  words whose reference contains ADJACENT IDENTICAL tokens: '
              f'{with_repeat} ({with_repeat / tot * 100:.2f}%)')
        print(f'  ... of which the repeated token is a RHOTIC (r ɾ ɹ ʁ): '
              f'{rhotic_repeat} ({rhotic_repeat / tot * 100:.3f}%)')
        print(f'  longest run of one token in any reference: {longest_run}')
        print('  repeated tokens, by how many words carry them:')
        for t, c in repeats.most_common():
            ex = ', '.join(f'{w} /{ipa}/' for w, ipa in examples[t][:4])
            print(f'      {t!r:8} {c:5}  ({c / tot * 100:5.2f}%)   {ex}')
        if unmatched:
            print('  characters matching NO vocabulary token '
                  '(rule 8 -- audit what the rule rejected):')
            for ch, c in unmatched.most_common(12):
                print(f'      {ch!r:8} {c:6}  U+{ord(ch):04X}')
        else:
            print('  every character matched a vocabulary token.')

    print('\n=== summary ===')
    for label, c in grand.items():
        print(f'  {label}: {c} words with a repeated adjacent token')


if __name__ == '__main__':
    main()
