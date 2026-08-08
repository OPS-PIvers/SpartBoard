# English G2P probe — does English need CMUDict + a neural fallback?

Resolves [#2336](https://github.com/OPS-PIvers/SpartBoard/issues/2336) on the
[Multilingual Pronunciation Engine map](https://github.com/OPS-PIvers/SpartBoard/issues/2331).

**Verdict: rules + a teacher-facing confidence affordance. Drop the neural fallback.
Keep CMUDict as a cross-check oracle, not as the primary path.**

Measured with **espeak-ng 1.51** (`en-us`, Ubuntu 24.04 package) against **CMUDict**
(`cmusphinx/cmudict` master, BSD-2-Clause), over all 117,493 alphabetic headwords plus
frequency-banded and hand-built teacher-corpus subsets. Current espeak-ng upstream is
1.52.0; numbers may be marginally better there.

---

## First: a correction to the ticket's premise

The ticket claimed espeak-ng got both of the spec's cited examples right "with no dictionary
and no neural fallback." That is half wrong. Tracing with `espeak-ng -v en-us -q -X`:

| Word                | Resolved by                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `rough` → `ɹˈʌf`    | **Letter-to-sound rule** (`r) ough → [Vf]`, priority 99). Genuine rule win.                                 |
| `through` → `θɹˈuː` | **`Found: 'through' [Tru:]`** — an entry in espeak's bundled exception dictionary (`en_list`, 5,794 lines). |

So espeak-ng English is **not a pure rule engine**. It is already the architecture the spec
proposed — exception dictionary plus fallback rules — in a 166 KB compiled `en_dict`.

Share of lookups resolved by the exception dictionary, by frequency band:

| Band              | Dictionary | Rules |
| ----------------- | ---------- | ----- |
| Top 1,000         | 22.9%      | 77.1% |
| Rank 1,000–3,000  | 12.3%      | 87.7% |
| Rank 5,000–10,000 | 12.1%      | 87.9% |

The real question is therefore not _"rules vs. dictionary"_ but **"is a 166 KB curated
exception list enough, or do you need a 3.6 MB dictionary plus a neural net on top?"**

---

## Accuracy

| Corpus                                 | n       | literal ARPAbet | segments¹ | + vowel reduction² | stress pattern | PER (norm.) |
| -------------------------------------- | ------- | --------------- | --------- | ------------------ | -------------- | ----------- |
| All CMUDict headwords (surname-heavy)  | 117,493 | 56.8%           | 61.5%     | 68.6%              | 72.1%          | 9.7%        |
| Top 1,000 frequency                    | 1,000   | 88.5%           | 93.1%     | 97.1%              | 93.5%          | 1.9%        |
| Top 3,000 frequency                    | 3,000   | 83.6%           | 88.2%     | 95.3%              | 91.1%          | 2.7%        |
| Top 5,000 frequency                    | 5,000   | 81.2%           | 86.3%     | 94.4%              | 89.7%          | 3.0%        |
| Top ~10,000 frequency                  | 9,428   | 78.3%           | 83.8%     | 92.7%              | 87.8%          | 3.5%        |
| CMUDict minus top-10k                  | 108,076 | 54.9%           | 59.6%     | 66.5%              | 70.7%          | 10.2%       |
| **Hand-built K-12 EL practice corpus** | 340     | —               | **94.1%** | **97.1%**          | 91.5%          | —           |

¹ Phone-sequence match, stress ignored, after normalising five _systematic notation_
differences that are not pronunciation errors: velar-nasal assimilation (`IH NG K` vs
`IH N K` in _including_ — espeak is phonetically correct), T/D flapping, the cot–caught
merger, the north–force merger (`F OW R`/`F AO R` for _four_), and `ER`+`R` vs `ER`.

² Additionally treating AH/IH/IY/UH/ER as one reduced class — i.e. not penalising
unstressed-vowel-quality disagreement, which is not a contrast a learner can be scored on.

### Harness validation

The assumption-free **literal** column on full CMUDict (56.8%) lands within one point of
Black, Lenzo & Pagel (1998), who report **57.80% words correct / 91.99% letters correct**
for CART letter-to-sound rules on the same dictionary. Two independent rule systems, 26
years apart, agreeing to within a point is good evidence the mapping and scoring are sound.
Spot-checks confirm it: _island, choir, yacht, colonel, one, said, friend, subtle, women,
busy, laughter, daughter, through, though, thought_ all come out correct.

### Independent reproduction

The whole pipeline was later re-run from scratch — fresh `cmudict.dict` and
`google-10000-english` downloads, corpora rebuilt, espeak re-run over all 117k words — in a
different session from the one that produced the table above. Every rate reproduced
identically, including the practice corpus (94.1% / 97.1% / 91.5%, 340/341 CMUDict coverage
with _piñata_ the sole miss) and the rules-vs-dictionary split (77.1%/22.9% at top-1000).

Two cells drifted, from re-downloading upstream data rather than from the harness: the
top-10k band matched **9,425** words against CMUDict rather than 9,428 (and its stress
figure 87.7% rather than 87.8%), and the complement band 108,068 rather than 108,076. All
accuracy rates were unchanged to 0.1pp. Worth knowing that these corpora are not pinned —
anyone re-running should expect single-digit membership drift and record the download date.

### Rules are not the weak part

Split by espeak's own resolution path:

| Resolved by           | segments | + reduction |
| --------------------- | -------- | ----------- |
| Letter-to-sound rules | 84.0%    | 93.0%       |
| Exception dictionary  | 82.9%    | 90.0%       |

Dictionary entries score _lower_ because they are the residue of irregular words. The rules
are carrying the system competently.

---

## Why the neural fallback is not justified

State-of-the-art neural G2P on **held-out CMUDict** (r-G2P, arXiv:2202.11194 Table 1):

| Model                              | PER   | WER        |
| ---------------------------------- | ----- | ---------- |
| CNN-encoder + BiLSTM               | 4.81% | 25.13%     |
| CNN + NSGD                         | 5.58% | 24.10%     |
| Encoder-decoder + global attention | 5.04% | 21.69%     |
| Transformer 4×4                    | 5.23% | 22.10%     |
| Best r-G2P (adversarial)           | 4.84% | **19.85%** |

A neural fallback exists to handle words a dictionary misses. On the actual corpus those
misses are ~0.3–2.3% and are dominated by abbreviations and loanwords — precisely the class
where published neural G2P _also_ fails (LatPhon names "proper nouns & foreign words" in its
own limitations).

So the fallback would be **wrong roughly one time in five, silently, on exactly the hard
words.** At authoring time, with a human present, a wrong-but-confident phoneme string is
strictly worse than a flag reading _"I'm unsure about this word — here's my guess, confirm
or edit."_ A neural model costs a model artifact, cold-start weight in a Cloud Function, a
training/eval pipeline, and a re-derivation story — to buy a 20%-error guess in place of a
zero-error human confirmation. That trade is negative.

> **Caution on comparing numbers.** The 1.9–3.5% PER measured here on realistic frequency
> bands sits in the same range as neural G2P's ~3.5–5% PER, but the metrics are **not
> directly comparable** — different reference lexicons, different phone sets, and the
> normalization above. The defensible claim is that on _common English vocabulary_
> rule-based G2P is not in a different accuracy class from neural G2P. Only on the long tail
> (names, rare words) does neural roughly double rule performance — and that tail is out of
> corpus here.

---

## Failure taxonomy

Threat level is for **teacher-authored K-12 language-practice vocabulary**, not general text.

| Category                                                   | Examples                                                                                                                                            | Real threat?                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Proper nouns / surnames**                                | _Gonzalez, Napolitano, Habegger, Swineford_                                                                                                         | **Low.** Dominates the full-CMUDict error rate (that corpus is WSJ name-heavy) and is why 117k scores 57% while the practice corpus scores 94%. CMUDict does not fix this — its own name coverage is idiosyncratic and US-biased.                                                                                                                                          |
| **Loanwords**                                              | _salsa, croissant, piñata, edamame, gyro_                                                                                                           | **Moderate — the only genuinely worrying class.** Plausible in an EL classroom. But **CMUDict does not rescue them**: _piñata, jalapeño, quinoa, açaí, naan, pho, edamame_ are all absent from CMUDict. That is an argument for a teacher override field, not for CMUDict.                                                                                                 |
| **Heteronyms**                                             | _read, lead, bass, live, wind, tear, bow, close, object, present, record, desert_                                                                   | **Genuine, and no dictionary solves it.** CMUDict returns 2–3 undifferentiated variants with no selection mechanism; espeak returns exactly one, silently. 6.4% of CMUDict headwords have ≥2 segmentally distinct pronunciations. Black et al.: English lexical stress "cannot in general be done from the letter context alone." **Only solvable by asking the teacher.** |
| **Systematic notation / dialect differences (not errors)** | `ex-` prefix (EH-KS vs IH-KS — ~25% of top-5k residual); `-IY AH` vs `-Y AH` (_billion, opinion_); Mary–marry–merry; syllabic consonants (_button_) | **None.** Both forms are attested American English. These inflate any raw espeak-vs-CMUDict WER and must be normalised out before any threshold is set.                                                                                                                                                                                                                    |
| **Genuine segmental errors**                               | _scissors, husband_ (S vs Z), _species_ (S vs SH), _gnu_                                                                                            | **Low but real** — 3–4 words (~1%) on the practice corpus.                                                                                                                                                                                                                                                                                                                 |
| **Abbreviations / initialisms**                            | _feb, est, ct, sci, urls, tvs_                                                                                                                      | **None.** Not plausible spoken-response targets, and the bulk of CMUDict OOV.                                                                                                                                                                                                                                                                                              |
| **Stress on compounds**                                    | _outside, weekend, payday, notebook, archive_ — segments identical, stress differs                                                                  | **Low, but decide explicitly.** 8.5% of the practice corpus. Moot if scoring is segment-based; the largest disagreement class if stress is scored.                                                                                                                                                                                                                         |

---

## CMUDict facts

- **Size**: 3,618,488 bytes raw / 918,216 gzipped. 135,166 entries; 117,493 alphabetic
  headwords + 8,362 variants. Irrelevant server-side.
- **License**: **BSD-2-Clause**, © Carnegie Mellon University. Compatible with a proprietary
  product; requires only notice retention.
- **Coverage**: 0.5% OOV in top-1,000 web-frequency words, 2.3% in top-3,000, 5.7% in
  top-10,000 — essentially all abbreviations, domain junk, and spam, not vocabulary. On the
  341-word K-12 practice corpus, coverage was **340/341 (99.7%)**; the sole miss was
  _piñata_. **Coverage is a non-problem for this corpus — which is exactly why a fallback
  for coverage failure is unnecessary.**
- **ARPAbet → IPA fidelity**: essentially 1:1, with **two stress-dependent exceptions that
  must not be lost**:
  - `AH` is _both_ /ʌ/ and /ə/ — disambiguated **only** by the stress digit (AH1 → ʌ;
    AH0/AH2 → ə).
  - `ER` splits the same way (ER1 → ɝ, ER0 → ɚ).

  Any pipeline that strips stress digits before mapping **silently destroys the schwa/wedge
  contrast.**

- **No allophony**: CMUDict encodes no flaps, glottalization, velar-nasal assimilation,
  dark-l, or length. espeak's output _does_ carry those (ɾ, ŋ, ɚ). Against a phone-level CTC
  recognizer espeak's narrower transcription is the better-matched reference; against a
  broad-phonemic scorer CMUDict's is. **This choice belongs to the acoustic model's label
  set, not to G2P accuracy.**

---

## The alphabet argument — which may outrank everything above

[#2349](https://github.com/OPS-PIvers/SpartBoard/issues/2349) selected
`facebook/wav2vec2-xlsr-53-espeak-cv-ft`, whose vocabulary is **392 eSpeak phonemes**.

The reference string must therefore be in **espeak's IPA alphabet**. Routing English through
CMUDict ARPAbet→IPA would inject a systematic alphabet mismatch **larger than espeak's own
G2P error rate**. That makes espeak-derived output the _matched_ reference, not merely the
cheap one — and it is an independent argument for the same conclusion.

---

## Recommended source

**espeak-ng's English rule tables as reference data, re-implemented as independent tables —
not the shipped binary.**

| Candidate                    | License                                                                                                                                                 | Verdict                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **espeak-ng** 1.52.0         | **GPL-3.0-or-later** (repo `COPYING`; no separate grant for `dictsource/*`, so treat `en_rules`/`en_list` as GPL-3)                                     | Best rules, and the alphabet that matches the chosen CTC model. Gated on [#2337](https://github.com/OPS-PIvers/SpartBoard/issues/2337).                                                                                                                                                                               |
| **CMU Flite** (`lex_lookup`) | **BSD-like** — "free to use in commercial products… GPL code is only included as part of the build process and does not taint any of the run-time code" | **Strongest license-clean English rule source.** Ships CMUDict-derived lexicon + CART LTS rules — direct descendant of the Black/Lenzo/Pagel work cited above. What Epitran uses for English. **Recommended fallback if GPL-3 is refused** — but note it emits CMU-style output, reintroducing the alphabet mismatch. |
| **CMUDict**                  | BSD-2-Clause                                                                                                                                            | Clean. Use as cross-check oracle.                                                                                                                                                                                                                                                                                     |
| **Phonetisaurus**            | BSD-3-Clause                                                                                                                                            | Clean. WFST G2P trainer — build your own rules from CMUDict with no espeak dependency. Viable clean-room route.                                                                                                                                                                                                       |
| **Epitran**                  | MIT                                                                                                                                                     | Clean, but its English path shells out to Flite, installed separately.                                                                                                                                                                                                                                                |
| **ipa-dict**                 | **MIT overall, mixed per language** — en_US from cmudict-ipa (MIT); **en_UK from ipacards (GPL-3)**; German CC BY-SA                                    | Usable for en_US only. **Do not take en_UK or de.**                                                                                                                                                                                                                                                                   |
| **g2p_en**                   | Apache-2.0                                                                                                                                              | Clean CMUDict + tiny LSTM fallback, if the fallback decision is ever reversed.                                                                                                                                                                                                                                        |
| **DeepPhonemizer**           | MIT                                                                                                                                                     | Clean neural G2P, same caveat.                                                                                                                                                                                                                                                                                        |
| **misaki**                   | Apache-2.0 headline, **but `misaki[en]` pulls `phonemizer-fork` + `espeakng-loader`**                                                                   | **GPL taint via the English extra. Not clean.**                                                                                                                                                                                                                                                                       |
| **LatPhon**                  | MIT "upon acceptance" — not yet released                                                                                                                | Watch, don't plan on it.                                                                                                                                                                                                                                                                                              |

---

## The recommended design

1. Derive expected phonemes with **espeak-derived rules**, server-side at authoring time.
2. Look the word up in **CMUDict** as a second opinion.
3. When they disagree, **flag the item for teacher review** with the derived IPA editable.

On the 341-word practice corpus this flag fires on **5.9%** of items (2.9% under
vowel-reduction tolerance) and catches every genuine espeak error. That is a well-calibrated
review queue, and it needs no neural component.

---

## Known limits of this research

- espeak-ng **1.51** tested; upstream is **1.52.0**.
- The convention-normalization and ARPAbet mapping are **this harness's own design choices**.
  The **literal** column is the assumption-free number, and it independently reproduces the
  published 1998 figure — that is the evidence the harness is sound. The normalized columns
  embed judgment.
- CMUDict is the only reference scored against. It is itself imperfect, General-American
  only, and specifically weak on the loanwords that are the main residual risk. **Some
  fraction of what is counted here as espeak errors are CMUDict errors, and they have not
  been separated.**
- **The 341-word "teacher corpus" is this harness's construction**, informed by standard
  beginner-ESL topical domains — not a sample of real SpartBoard authoring data. **This is
  the weakest link.** If real teacher input is name-heavy or loanword-heavy, the 94%/97%
  figures degrade toward the full-CMUDict numbers. See
  [#2356](https://github.com/OPS-PIvers/SpartBoard/issues/2356).
- No published evaluation of espeak-ng specifically against CMUDict for English was found.
  That gap is why this was measured. Treat these as first-party, reproducible, and
  un-peer-reviewed.

---

## Reproducing

Requires `espeak-ng` and Python 3. Run from this directory; scripts write generated data
(~19 MB) into the working directory and are gitignored.

```sh
apt-get install -y --no-install-recommends espeak-ng

# reference data
curl -LO https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
curl -Lo g10k.txt https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt

python3 prep.py         # cmudict.dict -> cmu.json + words.txt
python3 run_espeak.py   # words.txt    -> espeak.json  (~10 min, 117k words)
python3 score4.py       # the main accuracy table
python3 src.py          # dictionary-vs-rules resolution split
python3 split.py        # accuracy broken down by resolution path
python3 teacher.py      # K-12 practice corpus + CMUDict cross-check flag rate
```

`score2.py` holds the shared ARPAbet/IPA helpers (`esp_phones`, `cmu_phones`, `ed`, `VOW`)
and the other scorers import them directly; its own analysis is behind an
`if __name__ == "__main__":` guard, so importing it does not require `cmu.json` or
`espeak.json` to exist. `score.py` and `score3.py` are earlier iterations kept for
provenance.

## Sources

- Black, Lenzo & Pagel (1998), _Issues in Building General Letter to Sound Rules_ — [ISCA archive](https://www.isca-archive.org/ssw_1998/black98_ssw.pdf)
- _r-G2P: Evaluating and Enhancing Robustness of Grapheme to Phoneme Conversion_ — [arXiv:2202.11194](https://arxiv.org/pdf/2202.11194)
- Yolchuyeva et al. (2019), _Transformer based G2P Conversion_ — [arXiv:2004.06338](https://arxiv.org/abs/2004.06338)
- _LatPhon: Lightweight Multilingual G2P_ — [arXiv:2509.03300](https://arxiv.org/pdf/2509.03300)
- Xu, Baevski & Auli (2021) — [arXiv:2109.11680](https://arxiv.org/abs/2109.11680); [facebook/wav2vec2-lv-60-espeak-cv-ft](https://huggingface.co/facebook/wav2vec2-lv-60-espeak-cv-ft) (392 eSpeak phonemes)
- [espeak-ng](https://github.com/espeak-ng/espeak-ng) ([COPYING](https://raw.githubusercontent.com/espeak-ng/espeak-ng/master/COPYING), [dictionary docs](https://github.com/espeak-ng/espeak-ng/blob/master/docs/dictionary.md))
- [cmusphinx/cmudict](https://github.com/cmusphinx/cmudict) ([LICENSE](https://github.com/cmusphinx/cmudict/blob/master/LICENSE))
- [CMU Flite COPYING](https://raw.githubusercontent.com/festvox/flite/master/COPYING) · [Epitran](https://github.com/dmort27/epitran) · [Phonetisaurus LICENSE](https://github.com/AdolfVonKleist/Phonetisaurus/blob/master/LICENSE) · [ipa-dict](https://github.com/open-dict-data/ipa-dict) · [misaki pyproject](https://raw.githubusercontent.com/hexgrad/misaki/main/pyproject.toml)

> _Note: "Fast, Not Fancy: Rethinking G2P with Rich Data and Rule-Based Models"
> ([arXiv:2505.12973](https://arxiv.org/html/2505.12973v1)) is often cited for "rules
> suffice" but is **Persian-only** (HomoFast eSpeak 6.33% PER vs neural 3.98%). It supports
> the architecture argument, not any English number. Do not cite it as English evidence._
