# D1 bias probe — run record

Recorded here rather than left in a comment because the whole point of
committing this spike was that D1 should not rest on a screenshot.

- **Date:** 2026-08-02
- **Model:** `gemini-3.5-flash-lite` (version `3.5-flash-lite-07-2026`)
- **Audio:** espeak-ng tap + **human trill recording** (the synthetic trill was discarded — see below)
- **Runs:** 10 per condition, then 30 per condition
- **Key source:** `GEMINI_API_KEY (shell)`
- **Ticket:** [Run the D1 bias probe and record the verdict](https://github.com/OPS-PIvers/SpartBoard/issues/2332)

> **Read this first.** The probe was first run on `gemini-2.5-flash` — the
> script's then-default, which is long superseded. That run returned
> `NO RESULT`, and the `NO RESULT` was **an artifact of the model, not a fact
> about the audio or the design**. The stale-model run is preserved in the
> appendix because the contrast between the two is itself a finding: this
> experiment's outcome is strongly model-dependent, so a run that does not
> name its model is worthless. The script default has since been updated.

## Verdict — PROVISIONAL PASS on bias, in both directions

**`NO BIAS DETECTED`.** Priming the model with the wrong target text did not
move what it reported — tested both ways round:

| Audio           | Told       | Honest answer | Reported        |
| --------------- | ---------- | ------------- | --------------- |
| synthetic tap   | "perro"    | tap `ɾ`       | tap **40/40**   |
| **human trill** | **"pero"** | **trill `r`** | **trill 27/30** |

The second row is the direction that matters most for grading — a student who
trilled correctly being marked as having tapped — and the original probe never
tested it. It came from the real-audio extension below.

**Still provisional**: neither clip is real _learner_ speech, and the untrilled
error has only ever been tested on synthetic audio. See
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

## What is still missing

- **Real audio of the error.** Every test of the untrilled case — the
  false-positive direction, where a scorer wrongly passes a student who did not
  trill — has used the synthetic tap clip. Given that the synthetic _trill_ was
  a broken stimulus, the synthetic tap deserves the same suspicion until a human
  "pero" is tested. This is the single biggest open gap.
- **A and B no longer share a recording chain** (human iPhone capture vs espeak
  synthesis), so an A-vs-B difference can no longer be attributed to the rhotic
  alone. Fixed by the same human tap recording.
- **Real _learner_ speech.** A speaker deliberately trilling is cleaner than a
  student struggling to. The original caveat is softened, not discharged.
- **German final-devoicing**, and one speaker / one word / one language
  throughout.

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
