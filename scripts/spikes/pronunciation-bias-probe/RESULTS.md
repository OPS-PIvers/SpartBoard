# D1 bias probe — run record

Recorded here rather than left in a comment because the whole point of
committing this spike was that D1 should not rest on a screenshot.

- **Date:** 2026-08-02
- **Model:** `gemini-3.5-flash-lite` (version `3.5-flash-lite-07-2026`)
- **Audio:** all-human fixtures, one speaker (the synthetic trill was discarded; the synthetic tap retired after human audio corroborated it)
- **Runs:** 10 per condition, then 30 per condition
- **Key source:** `GEMINI_API_KEY (shell)`
- **Ticket:** [Run the D1 bias probe and record the verdict](https://github.com/OPS-PIvers/SpartBoard/issues/2332)

> **Fixture provenance is undocumented, and that is a known accepted gap.** The
> five `*_human*.wav` clips are one adult speaker; who recorded them, when, and
> under what consent is not recorded here, and this repository is public. Raised
> in review on [#2343](https://github.com/OPS-PIvers/SpartBoard/pull/2343) and
> accepted as-is for now rather than fixed.
>
> It is written down because the feature this spike serves is about **capturing
> student audio** — so "how are voice fixtures sourced, consented, and retained"
> is a question this project has to answer properly, not a spike-grade detail.
> Carried to [#2344](https://github.com/OPS-PIvers/SpartBoard/issues/2344), and
> it belongs to D2 (voice data: privacy, retention, COPPA) on the
> [wayfinder map](https://github.com/OPS-PIvers/SpartBoard/issues/2331).
>
> ### If you are here to collect more audio, stop and read this
>
> These fixtures are **one consenting-by-assumption adult**. Every reason this
> gap was tolerable stops applying the moment the recording is a **student's**:
> a minor's voice engages COPPA, district agreements, and parental consent, and
> none of that can be arranged retroactively once the file is committed to a
> public repository.
>
> The standing recommendation, raised independently by three reviewers on
> [#2343](https://github.com/OPS-PIvers/SpartBoard/pull/2343): **no learner-audio
> collection should begin until D2 is answered** — not until the feature ships,
> but before the first recording is made. That recommendation is not yet a
> ratified project policy; it is awaiting a decision from @OPS-PIvers. Treat it
> as binding until told otherwise, because the failure is irreversible and the
> cost of waiting is not.
>
> **Do not treat this file's precedent as the project's answer.** "We committed
> undocumented voice recordings once" is the working norm this note exists to
> stop from forming.

> **Read this first.** The probe was first run on `gemini-2.5-flash` — the
> script's then-default, which is long superseded. That run returned
> `NO RESULT`, and the `NO RESULT` was **an artifact of the model, not a fact
> about the audio or the design**. The stale-model run is preserved in the
> appendix because the contrast between the two is itself a finding: this
> experiment's outcome is strongly model-dependent, so a run that does not
> name its model is worthless. The script default has since been updated.

## Verdict — PROVISIONAL PASS on bias; one real defect found

All fixtures are now human, one speaker. Three separate questions, three
answers:

| Question                                                      | Result                                               |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| **Bias** — does the stated target move the report?            | **No.** `NO BIAS DETECTED`, both directions          |
| **Discrimination** — does the report follow the audio?        | **Yes.** trill clip 24/30 trill vs tap clip 0/30     |
| **False pass** — does it invent the trill on untrilled audio? | **Spanish tap: never (0/20). Anglo `ɹ`: 3/20 (15%)** |

Bias was the question this ticket was built to answer, and it passes. The
defect worth carrying forward is the third row, which the probe was never
designed to look for.

**And a fourth finding that affects the spec more than any of them: the model
never reports the English retroflex `ɹ` once it knows the language is Spanish
(0/40).** See [The retroflex is invisible](#the-retroflex-is-invisible).

**Still provisional**: no clip is real _learner_ speech — a speaker
deliberately producing an error is not a student failing to avoid one — and
German final-devoicing is untested. See
[What is still missing](#what-is-still-missing).

## Run at `--runs 30`

> Condition **A** in both blocks below used the **espeak synthetic trill**,
> which has since been discarded as a broken stimulus and replaced by the human
> recording. Read A's numbers here as a measurement of that bad clip, not of the
> model. B, C and D are unaffected — they use the tap clip, which is unchanged.

```
key source: GEMINI_API_KEY (shell)
model: gemini-3.5-flash-lite   runs: 30

A  trill audio, told "perro"  ->  {"ɾ":27,"r":3}
     e.g. [p e ɾ o]
B  TAP audio,   told "perro"  ->  {"ɾ":30}
     e.g. [p e ɾ o]
C  TAP audio,   told "pero"   ->  {"ɾ":30}
     e.g. [p e ɾ o]
D  TAP audio,   told nothing  ->  {"r":1,"ɾ":22,"none":6,"other":1}
     e.g. [p e r o]

--- VERDICT ---
B (primed "perro") reported the true tap: 30/30 (100%)
D (unprimed)       reported the true tap: 22/24 (92%)  [excluded: 6 no rhotic reporteds; 1 other rhotic (counted, not a tap)]

! DEGRADED: 24 usable samples in the smallest compared condition
  (of 30 requested). Rates above are over usable samples only.

NO BIAS DETECTED on this contrast. Gemini reported the true tap even when
primed to expect a trill. Server-side stays viable — but this is synthetic
audio and ONE contrast. Re-run with real learner recordings and add German
final-devoicing + Mandarin tone contrasts before committing.
```

## Run at `--runs 10` (same model, earlier)

```
A  trill audio, told "perro"  ->  {"r":1,"ɾ":9}
B  TAP audio,   told "perro"  ->  {"ɾ":10}
C  TAP audio,   told "pero"   ->  {"ɾ":10}
D  TAP audio,   told nothing  ->  {"ɾ":7,"none":3}

B (primed "perro") reported the true tap: 10/10 (100%)
D (unprimed)       reported the true tap: 7/7 (100%)

! UNDER-POWERED (7 usable samples)
NO BIAS DETECTED on this contrast.
```

The script flagged this one under-powered — D lost 3 samples to `none` — which
is why it was re-run at 30. The two runs agree.

## Pooled counts (both runs, n=40 per condition)

| Condition | Audio | Told    | Samples | tap `ɾ` | trill `r` | other | none |
| --------- | ----- | ------- | ------- | ------- | --------- | ----- | ---- |
| A         | trill | "perro" | 40      | 36      | 4         | 0     | 0    |
| B         | tap   | "perro" | 40      | 40      | 0         | 0     | 0    |
| C         | tap   | "pero"  | 40      | 40      | 0         | 0     | 0    |
| D         | tap   | nothing | 40      | 29      | 1         | 1     | 9    |

Zero API errors across all 160 calls.

## The scare that wasn't: the synthetic trill was a broken stimulus

The synthetic run raised a worry bigger than bias. On the espeak "trill" clip
(condition A) the model reported the trill only **4/40 — 10%**, answering tap in
**76 of 80** primed samples across both clips. That is exactly how a model that
ignores the audio would also pass a bias test: the bias test asks whether
priming _moves_ the output, and an output that never moves cannot be moved.

Two explanations fit, pointing opposite ways:

1. the model cannot hear the tap/trill contrast, or
2. `perro_trill.wav` does not actually contain a convincing trill.

**A human recording settled it: explanation 2.** The model hears trills fine.
espeak-ng's Spanish `/r/` is the thing that is not convincingly trilled, and it
has been removed from the fixtures.

This is the load-bearing methodological lesson of the spike: a synthesized
stimulus was silently wrong, and it produced a confident, alarming, false
reading about the model. Check acoustic claims against human audio before
believing them.

## Real-audio extension

Human recording, one adult speaker, three utterances of "perro" with trill
strength increasing across them by the speaker's own account. Same model, same
prompts and rhotic classifier as the probe, 10 runs per cell.

**The honest answer in every cell is the trill `/r/`.**

```
--- utterance 1 (weakest trill) ---
  P  told "perro" -> {"r":9,"ɾ":1}    e.g. [p e r o]
  T  told "pero"  -> {"r":8,"ɾ":2}    e.g. [p e r o]
  U  unprimed     -> {"r":10}         e.g. [p e r r o]
--- utterance 2 ---
  P  told "perro" -> {"r":9,"ɾ":1}    e.g. [p e r o]
  T  told "pero"  -> {"r":10}         e.g. [p e r o]
  U  unprimed     -> {"r":10}         e.g. [p e r o]
--- utterance 3 (strongest trill) ---
  P  told "perro" -> {"r":7,"ɾ":3}    e.g. [p e r o]
  T  told "pero"  -> {"r":9,"ɾ":1}    e.g. [p e r r o]
  U  unprimed     -> {"r":10}         e.g. [p e r r o]
```

**Trill reported in 82 of 90 samples.** Two things follow:

- **The model discriminates the contrast.** It reports `r` on real trills and
  `ɾ` on taps. The discrimination worry is dissolved, not deferred.
- **No bias toward the stated target, in the direction that matters most.**
  Condition T primes it toward the _tap_ on genuinely trilled audio; it still
  reported the trill 27/30. A student who rolls the r correctly is not marked
  down for it.

**No dose-response appeared** — the strongest trill drew the _most_ tap reports
(3/10 under P). At 10 samples per cell that is noise, and it is recorded here
rather than smoothed over precisely so nobody reads a trend into it later.

## All-human run — the error direction, at last

Two more clips from the same speaker: "pero" with the Spanish tap, and "pero"
with the English retroflex `ɹ` (the actual L1-English learner error, and the
substitution in the spec's own worked example). The synthetic tap is retired;
every condition below is human audio.

```
A  TRILL audio, told "perro"  ->  {"ɾ":1,"r":9}
B  tap audio,   told "perro"  ->  {"ɾ":10}
C  tap audio,   told "pero"   ->  {"ɾ":10}
D  tap audio,   told nothing  ->  {"ɾ":8,"r":2}
E  ANGLO-r aud, told "perro"  ->  {"ɾ":9,"r":1}

--- VERDICT ---            NO BIAS DETECTED (B 10/10 vs D 8/10)
--- DISCRIMINATION ---     DISCRIMINATES (A 9/10 trill vs B 0/10)
--- FALSE PASS ---         E reported a trill 1/10; a non-trill rhotic 0/10
```

**The false-positive cell passes on the Spanish tap.** Told the student was
asked to say "perro", on audio containing a plain tap, the model reported the
tap — **20/20 across runs, never once inventing the trill.** This was the last
thing standing between D1 and a decision, and it holds.

**The synthetic tap was vindicated.** It gave 40/40; the human tap gives 20/20.
Unlike the trill, espeak's tap was a faithful stimulus — which is the only
reason any synthetic audio in this spike retains any credibility.

### The one real defect: the Anglo `ɹ` sometimes passes

On the retroflex clip, told the target was "perro", the model reported a trill
**3/20 (15%)** — marking as correct a student who did not trill.

That is small but it is not nothing, and it lands on the **most common error in
a US Spanish classroom**. The Spanish tap and the Anglo r are not
interchangeable stand-ins for "the untrilled error": the model handles the tap
perfectly and the retroflex imperfectly. A probe that only tested the tap —
as this one did for its entire life until now — would have reported a clean
pass and missed this.

Whether 15% is acceptable is a product decision, not a spike finding. It is a
per-attempt chance of telling a student they rolled an r they did not roll.

### The retroflex is invisible

Bigger than the false-pass rate: **the model never reported `ɹ` at all under any
Spanish-framed prompt — 0 out of 40 samples.** It maps the English retroflex
onto `ɾ` (or occasionally `r`) and reports it as Spanish phonology.

Removing the language framing partly restores it:

| Prompt framing                                                                       | non-trill rhotic reported |
| ------------------------------------------------------------------------------------ | ------------------------- |
| `Transcribe this audio into IPA phonemes.` (no language)                             | **4/10**                  |
| ...plus "speaker may be non-native, include sounds from outside the target language" | 0/10                      |
| `This is a recording of a single Spanish word.`                                      | 0/10                      |
| `A Spanish student was asked to say "perro"...`                                      | 0/20                      |

The column counts the classifier's `other` bucket — any rhotic that is neither
the tap nor the trill. It is not a dedicated `ɹ` counter, so read the 4/10 as
"a non-Spanish rhotic was reported", corroborated by `ɹ` appearing in the
printed samples (e.g. `[p ɛ ɹ o]`) rather than by the count alone. **The zeros
are exact either way**: no `ɹ` can hide in a bucket of zero, so "never reported
the retroflex under a Spanish-framed prompt" holds without qualification.

Note the middle row: **explicitly asking for out-of-language sounds did not
help** — it still names "the target language", which appears to anchor the
model just as hard. Only dropping the language entirely recovered the
retroflex, and only 4/10 even then.

This is normalization, but not the kind the probe was built to catch. It is
conditioned on the **language**, not on the target word — which is why the bias
verdict is clean and this still happens.

**Consequences:**

- **Scoring outcomes mostly survive.** `ɾ` ≠ target `r`, so the student is
  still marked wrong — the right outcome, 85% of the time.
- **Diagnostic feedback does not.** The engine would tell that student "you
  produced a tap" when they produced an English r. Those need different
  corrective instruction.
- **The spec's worked example is not reproducible through this path.** It
  assumes expected `/r/`, detected `/ɹ/`. Via server-side Gemini with a
  language-framed prompt, `/ɹ/` is never detected. Anything in the design that
  keys off L1-interference phonemes appearing in `alignment[]` needs revisiting
  — which makes this a live input to
  [Define correct alignment & scoring behaviour](https://github.com/OPS-PIvers/SpartBoard/issues/2335).
- Dropping the language from the prompt is **not** an obvious fix: it recovers
  the retroflex only 4/10, and on `gemini-2.5-flash` the same unframed prompt
  made the model hallucinate English words entirely.

## What is still missing

- **Real _learner_ speech.** Every clip is one adult speaker deliberately
  producing a target sound. A student failing to trill is not the same signal —
  it is likelier to be an unstable in-between articulation than a clean
  retroflex or a clean tap. The caveat this ticket insisted on is softened, not
  discharged.
- **One speaker, one word, one language.** German final-devoicing untested;
  no per-dialect check.
- **The 15% false pass needs a power run** — 3/20 has a wide confidence
  interval, and the number matters for the product decision.
- **Whether the retroflex blindness generalises** to other L1-interference
  substitutions (Spanish `b`/`v`, German `ü`), or is specific to rhotics.

## Appendix — the superseded `gemini-2.5-flash` run

Kept as evidence that the outcome is model-dependent. **Do not cite these
numbers as a result**; cite them only for that point.

```
model: gemini-2.5-flash   runs: 10

A  trill audio, told "perro"  ->  {"ɾ":8,"r":2}
B  TAP audio,   told "perro"  ->  {"ɾ":8,"r":2}
C  TAP audio,   told "pero"   ->  {"ɾ":9,"other":1}
D  TAP audio,   told nothing  ->  {"none":10}

B (primed "perro") reported the true tap: 8/10 (80%)
D (unprimed)       reported the true tap: 0/0 (n/a)  [excluded: 10 no rhotic reporteds]

NO RESULT. At least one condition produced zero usable samples...
```

Condition D collapsed because that model does not transcribe the clips as
Spanish when unprompted — it returns English word-shapes. All ten samples:

```
 1. [b ɛ l ə]        6. [b ɛ n oʊ]
 2. [m eɪ f ɔː l]    7. [b eɪ ə n ɛ t]
 3. [b eɪ n]         8. [b eɪ]
 4. [b eɪ n]         9. [b eɪ]
 5. [ɹ eɪ n b oʊ]   10. [m eɪ l]
```

_bella, may-fall, bane, rainbow, bayonet, bay, male_ — and not one sample with
the `/p/` onset. Same on the trill clip (_arrow, aerial, hello_). On
`gemini-3.5-flash-lite` condition D needs no repair: it returns `[p e ɾ o]`
unprompted.

Two notes from that run:

- **Fixed.** Its `NO RESULT` message said "every call errored". That was wrong —
  **zero** API errors occurred; every D slot was `none`. The message sent a
  reader to debug the wrong thing. It now counts `ERR` and `none` separately and
  names whichever actually caused the collapse, matching the exclusion
  breakdown `line()` already printed.
- **Still open.** The probe prints only `samples[0]` per condition, which was not
  enough to diagnose the collapse; four throwaway replays were needed. Printing
  a tally of distinct outputs would have made the cause visible immediately.
