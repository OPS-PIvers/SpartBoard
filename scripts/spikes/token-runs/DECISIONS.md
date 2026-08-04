# Repeated tokens and the held trill — accepted decisions

Resolves [#2380 — _A held trill emits several `r` tokens where the reference
holds one — does the scorer dock it?_](https://github.com/OPS-PIvers/SpartBoard/issues/2380).

Authoritative over [`alignment-engine/DECISIONS.md`](../alignment-engine/DECISIONS.md)
A5/A6 **where they conflict**, which is in exactly one place: the cost of an
insertion that repeats its neighbour. Everything else in A5/A6 stands.

---

## The problem

[#2355](https://github.com/OPS-PIvers/SpartBoard/issues/2355) found it while
measuring something else. espeak's reference for `perro` is `pˈero` — four
tokens, **the trill written as a single `r`** — but a trill is physically
several tongue contacts, and CTC emits a peak per contact. So the same
correct trill decodes differently depending on how long it was held and which
quantization ran it:

| clip                  | fp32                 | q4 (the pinned build)   |
| --------------------- | -------------------- | ----------------------- |
| `perro_trill_human_1` | `pero` — exact match | `perro` — one insertion |
| `perro_trill_human_3` | `pero` — exact match | `perro` — one insertion |

Under A5/A6 as written, **holding a correct trill a beat longer costs points,
and whether it costs points is an artifact of a compression choice.**

---

## What was measured first

Per the ticket, and per map rule 9: before designing a collapse rule, find out
whether a _reference_ already contains adjacent identical tokens. If it never
does, blanket collapsing is free and the decision is five lines.

`measure/runs.py` tokenizes espeak `--ipa=3` output into the acoustic model's
own 392-token vocabulary and counts words whose token sequence repeats.

| language          | words  | references with a repeat | …where the repeat is a rhotic |
| ----------------- | ------ | ------------------------ | ----------------------------- |
| Spanish (`es`)    | 12,000 | 161 (1.34%)              | **0**                         |
| German (`de`)     | 12,000 | 60 (0.50%)               | **0**                         |
| English (`en-us`) | 9,974  | 14 (0.14%)               | **0**                         |

**So the cheap branch half-fires.** Repeats are not absent — but not one
reference in 34,000 words doubles a rhotic. Longest run observed: 2 tokens
(3 in English, from initialisms like `ieee` → `ˌaɪˌiːˌiːˈiː`).

Reading the sets matters more than the percentages:

- **Spanish's 161 are overwhelmingly English proper nouns**, because the
  frequency list is subtitle-derived: _jimmy, danny, johnny, scott, miss,
  jessica, hollywood_. `mˈiss` is espeak reading an English spelling with the
  Spanish voice, not a Spanish geminate. The genuinely Spanish members are
  **vowel hiatus across a prefix** — _alcohol_ → `ˌalkoˈol`, _cooperación_,
  _microondas_, _zoológico_, _coordenadas_.
- **Real Spanish `-nn-` does double**, and is simply too rare for a top-12k
  list. Probed directly: _innato_ `innˈato`, _innecesario_, _perenne_,
  _connotación_, _innovación_, _innegable_, _ennoblecer_, _sinnúmero_ — 8/8
  produce a doubled `n`, 0/8 appear in the 12,000.
- **German's 60 are real and are exactly the words a teacher assigns** —
  prefix and compound boundaries: _enttäuscht_, _zurückkommen_, _unnötig_,
  _einnehmen_, _auffallen_, _aufführung_, _mitteilen_, and _ehemann_
  `ˈeːeːmˌan`.
- **English's 14 are nearly all initialisms** — _ceo_, _ieee_, _ntsc_, _kde_.

---

## Decisions

### T1 — A repeated extra sound is free. No collapsing anywhere.

Neither the stored reference nor the recognized stream is rewritten. The
alignment runs on both strings exactly as produced. One rule changes in the
cost function:

> **An insertion whose token is equal to the token of an immediately adjacent
> entry in the _recognized_ stream costs zero.**

Everything else about A5's edit accounting is unchanged.

**Why not collapse.** Collapsing was the ticket's named candidate and it is
rejected on the measurement:

- _Collapse everything, both sides_ makes genuine doubled sounds unscoreable
  in 1.34% / 0.50% / 0.14% of es / de / en words — and German's are the real
  ones. It also **shifts syllable indices**: _ehemann_'s `eː eː` is two
  nuclei in the 244-token nucleus space collapsing to one, which moves every
  S1 stress index after it. That is the index-shift bug class that has
  already caught this map twice (the ZWJ-in-diphthong finding, and the
  `ɚ`/`ᵻ` omission at [#2359](https://github.com/OPS-PIvers/SpartBoard/issues/2359)).
- _Collapse rhotics only_ is measured-safe on the reference side — zero cost
  across all 34,000 words — but it is a narrow rule needing its own
  justification, it helps only rhotics, and the moment the model is found to
  over-emit some other token we are writing a second exception. Only five
  clips have ever been decoded, so that is not a remote possibility.

**Why T1 is better than either.** It is asymmetric, and the asymmetry is
correct:

| case                        | reference     | recognized    | outcome               |
| --------------------------- | ------------- | ------------- | --------------------- |
| trill held longer           | `p e r o`     | `p e r r o`   | extra `r` **free**    |
| trill held much longer      | `p e r o`     | `p e r r r o` | both extras **free**  |
| geminate produced           | `i n n a t o` | `i n n a t o` | match                 |
| geminate **under**-produced | `i n n a t o` | `i n a t o`   | **deletion, charged** |

Over-production of a sound the student is already producing correctly is not
an error. **Under**-production of a doubled sound is — and it is the actual
learner error for a geminate. Collapsing forgives both; T1 forgives only the
first. T1 therefore scores _more_ correctly than the collapse rules on the
very cases that made collapsing look risky.

**Adjacency is measured on the recognized side, not the reference side.**
This matters, and it is not a detail:

> Reference `p e ɾ o` (tap), recognized `p e r r o` — the student trilled
> _and_ held it. Alignment yields one substitution `ɾ→r` plus one insertion
> `r`. Under recognized-side adjacency the insertion is free and the student
> is charged **once** for one wrong gesture. Under reference-side adjacency
> the insertion's neighbour is `ɾ ≠ r`, so it is charged and the student pays
> **twice** for the same mistake.

Double-charging one production across two dimensions is the same fault S3
already corrected for stress, and it is corrected the same way here.

**T1 is token-generic, with no exception list.** It is not a rhotic rule. The
measurement justifies rhotics specifically (0 doublings in 34,000 references)
but the asymmetry argument justifies the general case, so no allowlist is
maintained and no language-specific table is needed.

### T2 — The free entry carries its own status, `held`, not `inserted`.

A5 requires every insertion to produce a real `alignment[]` entry, and that
requirement stands — the entry is not dropped. But it must not carry
`inserted`, because [#2362](https://github.com/OPS-PIvers/SpartBoard/issues/2362)
renders a badge per status, and **a teacher reads any badge as "something
went wrong"** regardless of the score printed beside it. A correct, well-held
trill must not render as an error.

So the status set grows from four to **five**: `correct`, `substituted`,
`omitted`, `inserted`, `held`.

- `held` scores zero and is not an error.
- Whether #2362 renders it as a neutral observation or renders nothing is
  that ticket's call. T2 only guarantees the information survives to it.
- Adding the fifth member now is cheap because #2362 has not been built yet.
  It is expensive later.
- Dropping the entry outright was rejected: the engine would be silently
  discarding a real observation, and if
  [#2379](https://github.com/OPS-PIvers/SpartBoard/issues/2379) resolves badly
  that discarded data is exactly what we would want back.

Per A4 the engine still emits no prose — `held` is a status, and any wording
is composed by the UI through i18n.

### T3 — `held` entries are not edits, and do not contribute to PER.

A6 keeps PER as `edits/N`, internal, never shown to a teacher, and permitted
to exceed 1. A `held` entry is not an edit for that purpose.

The reason is consistency, not tidiness: PER and `score` must not disagree
about whether something was an error. An internal metric that counts a held
trill as an error will eventually be read by someone as evidence the student
made one. The denominator `N` is unchanged, because the reference is
unchanged — which is one of the things T1's no-collapse stance buys.

### T4 — S1/S3 syllable and stress indices need no revision.

The ticket asked for this to be _verified, not assumed_. It follows directly
from T1: no collapsing means the token streams the stress stage indexes into
are byte-identical to what it indexes into today, so nucleus positions cannot
move. Had T1 gone the other way this would have needed real work — _ehemann_
alone proves the collapse path moves indices.

### T5 — This does not touch, mask, or resolve [#2379](https://github.com/OPS-PIvers/SpartBoard/issues/2379).

#2379 is about phoneme **identity** — a correct tap reported as a trill. That
is a substitution, not an insertion, so T1 never applies to it and cannot
hide it. The worked case above shows the two interacting correctly: the
substitution is still charged in full, and only the redundant extra token is
forgiven.

---

## What this does not settle

- **Whether the model over-emits tokens other than rhotics.** Five clips have
  been decoded, all Spanish rhotic minimal pairs. T1 is written to be
  token-generic partly because that question is open.
- **The reference side is measured; the model-output side is not.** These
  numbers describe what espeak writes, not what the model hears.
- **Browser-runtime parity.** Like every other acoustic number on this map,
  the decode evidence came from Python `onnxruntime` on CPU, not
  `onnxruntime-web`.

---

## Two findings that are not about this ticket

Both came from auditing what the tokenizer **rejected** rather than what it
accepted (map rule 8), and both are concrete members of the map's open
server-side symbol-normalization step.

### Greedy longest-match is the wrong projector, and it fails silently

`juː` is **not** in the model's 392-token vocabulary. `ju`, `j` and `uː` all
are. So a greedy longest-match tokenizer consumes `ju`, then finds no token
starting at `ː`, and strands the length mark:

```
espeak: jˈuː  ("you")
greedy: ['j','u'] + orphan 'ː'      <-- WRONG, and silently so
correct: ['j','uː']
```

The correct tokenization exists; greedy matching simply cannot find it,
because it never backtracks out of a longer prefix. Measured incidence:

| language          | words  | words with a stranded length mark |
| ----------------- | ------ | --------------------------------- |
| English (`en-us`) | 9,974  | **273 (2.74%)**                   |
| German (`de`)     | 12,000 | 45 (0.38%)                        |
| Spanish (`es`)    | 12,000 | 0                                 |

Every one is the same cause. The affected English words are not exotic —
_you, use, music, human, unit, few, view, computer, student, usually,
beautiful_. A projector built this way stores a reference that has dropped a
length distinction, on one English word in thirty-six, with no error raised.

**The normalization step needs a stated tokenization algorithm** (maximal
munch with backtracking, or a longest-match-that-completes search), and it
needs to **fail loudly** when no valid tokenization exists rather than
emitting a best-effort prefix.

### espeak writes language-switch markers into the IPA stream

espeak emits literal `(en)` … `(de)` spans when it decides a word belongs to
another language:

```
baby  ->  (en)bˈeɪbi(de)
party ->  (en)pˈɑːti(de)
team  ->  (en)tˈiːm(de)
```

**136 of 12,000 German words (1.13%)**; zero in Spanish and zero in English
with their own voices. This is the same class as R1b's literal-`?` finding at
[#2360](https://github.com/OPS-PIvers/SpartBoard/issues/2360): not IPA needing
mapping down, but an annotation a projector that only rewrites known symbols
will pass straight through into a stored reference.

It has a sharper edge than `?` did. The affected words — _baby, job, party,
cool, team, show, lady_ — are exactly the English loanwords a German teacher
would set as vocabulary. And the marker is not merely noise: it is espeak
telling us it switched to **English G2P for a German lesson**, which is a
pedagogical question, not just a parsing one.

---

## Reproducing the measurements

`measure/` holds the harnesses. Wordlists are downloaded, not committed
(~3 MB); the `.gitignore` lists them. Requires `espeak-ng` 1.51
(`apt-get install -y --no-install-recommends espeak-ng`) and Python 3 — no
numpy, no venv.

```sh
cd measure
curl -sSL -o g10k.txt    https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt
curl -sSL -o es_50k.txt  https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt
curl -sSL -o de_50k.txt  https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt

python3 runs.py    # adjacent identical tokens, per language, with the reject audit
python3 audit.py   # the three follow-ups: Spanish set, orphan length marks, (en) spans
```

Per the map's note on unpinned corpora, these lists are not versioned and the
counts may drift by a word or two; the findings do not turn on the third
decimal place.
