# Accepted stress patterns — decisions

Resolves [#2360 — Where do accepted stress patterns come from for es, de and en?](https://github.com/OPS-PIvers/SpartBoard/issues/2360),
a decision ticket on the [Wayfinder Map: Multilingual Pronunciation Engine](https://github.com/OPS-PIvers/SpartBoard/issues/2331).

**Status:** accepted. Builds on [`../stress-detection/DECISIONS.md`](../stress-detection/DECISIONS.md)
(S1–S5) and supplies the reference that lets **A9's stress weight leave 0**.

**Contents.** `reference.ts` is a reference implementation, `reference.test.ts`
the executable form of every decision below (44 tests), `measure/` the
harnesses that produced every number quoted here. Neither is wired into the
app nor imported by feature code — a spike directory, like its four
siblings. It runs under `pnpm test`, so a later change that violates one of
these decisions fails CI.

**Scope guard.** Only **primary** stress is represented, per S1. `ˌ` is parsed
and discarded everywhere. This is not a step toward prosody scoring.

---

## What we checked before deciding

Four premises the ticket was resting on turned out to be wrong. All four were
settled by reading an artifact rather than arguing.

### The problem is about half the size the ticket assumed

[#2336](https://github.com/OPS-PIvers/SpartBoard/issues/2336) measured stress
as the largest disagreement class between two phoneme sources at **8.5%** of a
K-12 corpus, and this ticket was opened on that number. That figure compares
**full stress patterns, secondary marks included**. S1 stores only the primary
position. Comparing only what we store, espeak and CMUDict disagree on
**5.1%** of the top-10k (332 of 6,561 comparable polysyllabic words).

### "Sources disagree" is not a synonym for "both readings are attested"

The ticket assumed the accepted-variant list is load-bearing for roughly one
word in twelve. Measured against CMUDict's own variant entries:

|                                                                                                       | rate      |
| ----------------------------------------------------------------------------------------------------- | --------- |
| Top-10k words where CMUDict itself lists two primary-stress positions                                 | **2.50%** |
| All 126,052 headwords with two attested primary positions                                             | **0.82%** |
| …with _identical segments_, differing only in stress (`abstract`, `adverse`, `automobile`, `anchovy`) | **0.18%** |

And of the 332 espeak-vs-CMUDict disagreements, only **48.8%** are readings
CMUDict itself lists. The other **51.2%** are espeak being wrong — and they
are not scattered, they are two nameable classes:

- **Initialisms.** `pm tv pc hp ip usb php ibm ac vs eu dj hr th cnet` —
  espeak spells them out and stresses the final letter; CMUDict stresses the
  first.
- **Compounds.** `outside outdoor email magazine overall anime engineering` —
  espeak systematically prefers late stress.

So a disagreement is a coin flip, and treating it as evidence of dialect would
have quietly recorded our own uncertainty as linguistic fact.

### The obvious German source has no stress in it

[wikipron](https://github.com/CUNY-CL/wikipron) is the natural candidate: one
uniform Wiktionary-derived lexicon covering all three languages, Apache-2.0
tooling. Its published scrapes contain **zero stress marks in 333,536 entries
across four files** (`deu_latn_broad`, `deu_latn_narrow`, `spa_latn_ca_broad`,
`eng_latn_us_broad`) — `grep -c 'ˈ'` returns 0 on every one.

The data is there upstream (`de.wiktionary.org` gives `Wagen → ˈvaːɡn̩`, syllabic
`n̩` and all), so a re-scrape is possible — but that is a scraping project, and
Wiktionary's data carries **CC-BY-SA** share-alike terms, unlike the Apache-2.0
tooling wrapping it. Checked before building on it, per the map's rule 7.

### Trying to fix the German rule made it worse

Spanish stress is recoverable from spelling; German's, on the same protocol,
is not. And the gap is a ceiling, not a bug — the audit that established this
is the one worth repeating:

|                                                | syllable count agrees | **stress position agrees** |
| ---------------------------------------------- | --------------------- | -------------------------- |
| Spanish orthographic rule vs espeak (n=11,331) | 96.94%                | **99.65%**                 |
| German morphological rule vs espeak (n=10,059) | 93.10%                | **86.24%**                 |
| German, after fixing every named failure class | 93.10%                | **81.15%** ⬇               |

The tuning pass added pronominal adverbs (`darum`, `wofür`), extra loanword
suffixes, and a stem-vs-prefix heuristic — and **cost five points**. Each fix
traded one error class for another, which is what a ceiling looks like from
the inside.

The residue says why: `gehen`, `geben`, `gegen`, `gestern`, `besser`, `beide`
require knowing that an initial `ge-`/`be-` is stem material rather than a
prefix, and that is a lexical fact, not a fact about word shape. It is Black,
Lenzo & Pagel's finding about English — stress "cannot in general be done from
the letter context alone" — reproduced in German.

---

## Decisions

### R1 — Two sources per language; disagreement is accepted **and** flagged

Where a language has an independent second source, a disagreement stores the
**union** of both readings and raises an uncertainty flag.

The union satisfies the never-penalize-a-correct-dialect rule
([#2342](https://github.com/OPS-PIvers/SpartBoard/issues/2342)) unconditionally
— no student is ever marked down for the reading their source of truth
teaches. The flag exists because, measured, half of these are not dialect at
all but espeak being wrong, and without it the `accepted` list silently
becomes a record of our uncertainty rather than of real variation.

Sources per language:

|        | second source           | espeak agreement | resulting flag rate |
| ------ | ----------------------- | ---------------- | ------------------- |
| **en** | CMUDict variant entries | 94.9%            | **5.1%**            |
| **es** | orthographic rule (R3)  | 99.65%           | **0.35%**           |
| **de** | none (R4)               | —                | 0%                  |

Rejected: **union with no flag** (stress on exactly the compounds a teacher
most wants scored becomes permanently unscoreable — both readings pass);
**store nothing on disagreement** (honest, but ~5% of words lose stress
scoring with nothing surfacing that they did); **CMUDict wins outright**
(most accurate for English, but bakes American stress into a dialect-neutral
engine and gives English a mechanism the other two languages cannot have).

#### R1a — A syllable-count mismatch yields no opinion, not a disagreement

When the two sources disagree about **how many** syllables a word has, their
indices are not comparable and the cross-check is simply unavailable — the
reference falls back to espeak alone, unflagged. Manufacturing a disagreement
from two different index spaces would flag words nobody disagrees about.

espeak's count is authoritative because it _is_ the detector's index space
(S2). Measured frequency: **3.08%** (en), **3.06%** (es), **6.90%** (de) —
mostly real pronunciation differences, like espeak syncopating `camera` to two
nuclei.

_Decided without asking_ — it follows from R1 but was not raised in the
session. Flagged for review, as S3a and S3b were.

#### R1b — An unrenderable espeak symbol yields no reference at all

**espeak writes a literal `?` where one of its internal phonemes has no entry
in its IPA translation table.** Measured across the same corpora as everything
else above:

|        | words whose espeak IPA contains `?` |
| ------ | ----------------------------------- |
| **de** | **117 / 12,000 — 0.97%**            |
| es     | 0 / 12,000                          |
| en     | 0 / 9,974                           |

It is the `UR` phoneme — `durch` is `d'URC` in espeak's own scheme and
**`dˈ??ç`** in IPA — and it hits a common word class: _wurde, durch, kurz,
geburt, sturm, urteil, ursache, geburtstag, verurteilt_.

When this happens **both the syllable count and every index derived from it
are untrustworthy**, so the derivation returns nothing and flags. Dropping
just the bad index is not enough: `geburt → ɡəbˈ??t` scans as **one** nucleus,
which would take the monosyllable path and assert stress on syllable 1 of a
word whose vowel was never rendered.

It **flags** rather than silently degrading, so R2's affordance surfaces it.
Note this is **the only flag German can ever raise**, since R4 leaves it
without a cross-check — and it is a German-only defect, which is a second
independent reason German is the weakest of the three languages here.

> **Does this contaminate R4's 86.24%?** No. Only **1 of the 9,365** scored
> German words contains a `?`: losing a vowel changes the syllable count, so
> R1a's count guard already excluded 46 of the 47 that reached scoring range.
> Maximum swing **0.01pp**, against a 13-point gap. Worth checking rather than
> assuming — the defect was found _after_ the decision was made.

**The syllable count is UNKNOWN, not zero.** An unrenderable reference stores
`syllableCount: null`. Storing the surviving-nuclei count would be actively
misleading rather than merely wrong: `durch → dˈ??ç` leaves **zero** nuclei, so
no index could ever be confirmed, and `geburt → ɡəbˈ??t` leaves **one** for a
two-syllable word, so a teacher who correctly wants syllable 2 would be
rejected as out of range — against a reference that looks perfectly valid.
That is the same category error S5 closed: a value meaning "we do not know"
must not be spelled as a value that means something else.

Consequently `confirmReference` **requires the true count as an argument** when
the stored one is `null`. The obligation is in the type rather than left as an
implicit contract, because [#2341](https://github.com/OPS-PIvers/SpartBoard/issues/2341)
is the code that has to satisfy it: **rescuing an unrenderable word means the
authoring UI supplying the syllable count from outside this reference.**

**Related invariant, same cause:** `parseEspeak` encodes a mark as "the next
nucleus is primary", so a trailing bare `ˈ` would yield an index one past the
end. Out-of-range is the worst value available — it can never match a detected
syllable, so it scores every student 0 while `accepted` stays non-empty and
therefore never degrades. `confirmReference` already rejected such indices on
the teacher path; **the derivation path must not be able to produce what
confirmation forbids**, so out-of-range marks are dropped and a test asserts
the invariant across every fixture in the suite.

_Surfaced in review of [PR #2365](https://github.com/OPS-PIvers/SpartBoard/pull/2365),
where the reported risk was a trailing bare mark and was judged academic
because "espeak never does this." Measuring it found a different, real cause
producing the same bad value — see the map's rule 4._

### R2 — An unconfirmed flag degrades, and says so on the item

A flagged reference contributes **nothing** to grading until a human confirms
it: `effectiveAccepted()` returns `[]`, which A10a already defines as absent
evidence, so A9's stress weight collapses to 0 and that word scores
sounds-only. Confirming switches stress scoring on.

The uncertainty is surfaced **inline on the question at authoring time**, not
only in a separate review queue. This is the load-bearing half of the
decision: stress adds a 5.1% flag rate on top of #2336's 5.9% for segments, so
roughly **one authored English word in ten** carries some flag, and "the
teacher will get to it" is a claim rather than a given. A queue that is
skipped turns a degradation path into a silent one.

Rejected: **advisory only** (a wrong stress then passes forever on the ~2.6%
where espeak is simply wrong); **block the question until confirmed** (a
20-word set typically hits 1–2 blockers, which risks teachers avoiding Speak
items altogether).

**This lands a requirement on
[#2341](https://github.com/OPS-PIvers/SpartBoard/issues/2341):** an inline,
per-question stress affordance showing the syllables and which are accepted —
not a badge, and not a queue entry.

#### R2a — A confirmation must name at least one syllable

`confirmReference(ref, [])` throws. An empty confirmation sets
`confirmed: true, flagged: false`, which turns `needsAuthoringPrompt()` off
and **removes the affordance R2 depends on, permanently** — the question then
reads as settled while scoring `null` for stress forever, indistinguishable
from a question nobody flagged. This is A13's failure mode exactly: nobody
investigates a question that looks finished. It is strictly worse than the
out-of-range index the reference already rejected, because it does not look
wrong.

There is deliberately **no "confirm that stress should not be scored here"
path.** If teachers want one it is an authoring decision for #2341, and it
needs a state of its own rather than an empty list that mimics absent
evidence — the same collision S5 closed between an empty `accepted` and an
empty `detected`.

_Surfaced in review of [PR #2365](https://github.com/OPS-PIvers/SpartBoard/pull/2365)
as reachable but unguarded._

### R3 — Spanish cross-checks against its own orthography, with no data file

Spanish gets its second source from ~30 lines of rules and no lexicon:
written accent wins; otherwise penultimate if the word ends in a vowel, `n` or
`s`; otherwise final. Diphthong handling follows the standard strong/weak
rules, with an accented weak vowel breaking the diphthong.

Measured at **99.65%** agreement with espeak on 10,984 comparable words. The
39 disagreements are two categories, neither of them Spanish stress being
hard: **`-mente` adverbs** (handled by R5) and **English proper names**
(`sarah`, `adam`, `hannah`, `noah`, `graham`, `lincoln`, `reynolds`,
`roberts`, `rogers`) plus interjections (`ooh`, `yeah`, `boom`).

The residual flag rate is therefore ~0.35%, and dominated by words that are
not Spanish.

> Known bug in the harness, not the decision: the rule does not treat the `u`
> in `qu`/`gu` as silent, which costs it syllable-count agreement on words like
> `aquí`. It affects the _count_ column (96.94%), not the stress column, because
> count-mismatched words are excluded before stress is compared. Fix before
> reusing the rule in feature code.

### R4 — German has one source, and that is the recorded cost

German uses espeak's mark alone: `accepted` always has exactly one member,
nothing is ever flagged, nothing degrades.

The measurement above kills the rule-based alternative. But the decisive
argument does not depend on the number: **a cross-check is only worth having
if its disagreements are informative.** For English, a disagreement is
espeak-vs-a-real-lexicon, so half of them are genuine attested variants worth
accepting. For German, a disagreement between espeak and a hand-rule is almost
always the rule being wrong — so flagging on it would flag 1 in 7 German
words, degrade each to unscored under R2, and flood the affordance with noise.
That is "teacher confirms every German item" arrived at by accident, and worse
than admitting German has one source.

**Accepted cost, taken knowingly: when espeak is wrong in German, it is
silently wrong,** and no accepted-variant list protects a German student. This
is a real weakening of #2342 for one of the three languages. A teacher can
still override any reference by hand.

Rejected: **re-scraping Wiktionary with stress preserved** — it buys a third
mechanism where two already work, drags CC-BY-SA share-alike onto
redistributed data, and inherits Wiktionary's noise (it lists _haben_ as
`h a m`). It remains the obvious move if German stress later proves to be a
real classroom problem; see the map's fog.

### R5 — Two primary marks from one source, handled per language

espeak sometimes emits **two `ˈ` marks in a single word** — not two sources
disagreeing, but one source calling both syllables primary. S1 assumed one
primary per word, so "take the primary mark's position" was undefined here.

Measured rate, and what the words are:

|        | 2+ primary marks | character                                                                                                                     |
| ------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **es** | **1.01%**        | 89% are `-mente` adverbs — `realmente`, `simplemente`, `completamente`, `exactamente`. The commonest adverbs in the language. |
| **en** | 0.34%            | overwhelmingly initialisms — `cnet`, `xbox`, `mpeg`, `jpeg`, `pmid`                                                           |
| **de** | 0.17%            | initialisms and foreign names — `mckay`, `mccoy`, `lloyd`                                                                     |

**Spanish takes both marks silently; English and German flag.** This follows
what each language's multi-mark set actually contains: `-mente` adverbs
genuinely carry both stresses and a student placing either is correct, whereas
en/de multi-mark words are concentrated in exactly the initialism class
already known to be espeak's weak spot.

Note this is narrow: an _ordinary_ Spanish disagreement still flags. Only a
single source emitting two marks is exempt, and only in Spanish.

Rejected: **take the last mark** (correct for `-mente`, but asserts one answer
for a word that genuinely has two, marking down a defensible reading of
`rápidamente`); **flag everywhere** (the commonest Spanish adverbs then ship
unscored, over a question rule-governed enough that a teacher would find it
pointless).

---

## The index space is the model's, not a teacher's

Not a decision — a property that falls out of S2 and that the authoring UI
must respect, surfaced here because it is easy to get silently wrong.

Syllable indices are counted in the **model's 244-token nucleus space**, which
is not how a human counts syllables:

- English `aɪə` is one vocabulary token, so **_lion_, _tired_ and _fire_ have
  one nucleus here and two syllables to a teacher.**
- Spanish writes `ue` as two tokens, so **_luego_ and _prueba_ have three
  nuclei here and two syllables to a Spanish teacher.**

The index space **must** be this one, because it is the space the detector
ranks prominence in. The consequence is for
[#2341](https://github.com/OPS-PIvers/SpartBoard/issues/2341): a stress picker
has to render syllables **from the stored phoneme stream**, never from
spelling and never by asking a teacher to count. A picker that shows "syllable
2 of 2" for _lion_ while the engine scores in a 1-syllable space would be
wrong in a way nobody could see.

---

## What this hands to other tickets

| Ticket                                                                                   | What it inherits                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#2341 — teacher authoring UX](https://github.com/OPS-PIvers/SpartBoard/issues/2341)     | **An inline per-question stress affordance is now required** (R2), not optional — flagged references are unscored until it is used. It must render syllables from the phoneme stream, not spelling (see above), and must let a teacher accept _several_ indices, not just pick one. |
| [#2354 — Firestore response shape](https://github.com/OPS-PIvers/SpartBoard/issues/2354) | Per-question stored fields: `acceptedStress: number[]`, `stressFlagged: boolean`, `stressConfirmed: boolean`, `stressSource: ReferenceSource`. Not `number[][]`.                                                                                                                    |
| [#2342 — thresholds & dialect](https://github.com/OPS-PIvers/SpartBoard/issues/2342)     | **A9's stress weight can now leave 0** for en and es. R4 is an explicit, recorded weakening of the never-penalize-a-correct-dialect rule for German.                                                                                                                                |
| [#2362 — teacher results UI](https://github.com/OPS-PIvers/SpartBoard/issues/2362)       | "Stress not assessed" now has a second, more common cause than S5's unreadable audio: an unconfirmed flag (R2). The two need distinguishing — one is fixable by the teacher, the other is not.                                                                                      |
| Server-side symbol normalization (map fog)                                               | espeak `--ipa=3` writes a **ZWJ inside diphthongs** (`a‍ʊ`) where the model's vocabulary holds bare tokens (`aʊ`). Stripping it is part of the projection step, and without it every diphthong miscounts a syllable.                                                                |
| Re-derivation when tables change (map fog)                                               | `stressConfirmed` is a **human decision that must survive re-derivation.** Re-deriving a confirmed question silently discards a teacher's judgement and, because D4 persists no score, re-scores every historical response against a reference the teacher rejected.                |

---

## Reproducing the measurements

`measure/` holds the harnesses. Data files are downloaded, not committed
(~10 MB); the `.gitignore` lists them. Requires `espeak-ng` 1.51
(`apt-get install -y --no-install-recommends espeak-ng`) and Python 3.

```sh
cd measure
curl -sSLO https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
curl -sSL -o g10k.txt https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt
curl -sSL -o es_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt
curl -sSL -o de_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt
python3 -c "import re;s=open('../../english-g2p-probe/teacher.py').read();open('corpus.txt','w').write(re.search(r'CORPUS = \"\"\"(.*?)\"\"\"',s,re.S).group(1))"

python3 cmu_stress.py      # CMUDict's own multi-variant rate
python3 stress_source.py   # espeak vs CMUDict on the K-12 corpus (n=158)
python3 big.py             # espeak vs CMUDict on the top-10k (n=6,561)
python3 spanish.py         # the Spanish orthographic rule (n=11,331)
python3 german.py          # the German morphological rule (n=10,059)
python3 multi.py           # multi-primary-mark rates across es/de/en
```

Per the map's note on unpinned corpora: these lists are not versioned
upstream, so expect single-digit membership drift and record the download
date. Downloaded **2026-08-03**.
