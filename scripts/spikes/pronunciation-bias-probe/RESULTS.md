# D1 bias probe — run record

Recorded here rather than left in a comment because the whole point of
committing this spike was that D1 should not rest on a screenshot.

- **Date:** 2026-08-02
- **Model:** `gemini-3.5-flash-lite` (version `3.5-flash-lite-07-2026`)
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

## Verdict — PROVISIONAL PASS on bias

**`NO BIAS DETECTED`.** Priming the model with the wrong target text did not
move what it reported. **This is provisional**, for two independent reasons —
the stimulus caveat the ticket required, and a second one this run surfaced.
See [Why the pass is weaker than it looks](#why-the-pass-is-weaker-than-it-looks).

## Run at `--runs 30`

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

## Why the pass is weaker than it looks

**1. The ticket's stimulus caveat still stands.** The clips are espeak-ng
synthesis with a clean contrast, not real learner speech. A model that fails
here would certainly fail on classroom audio, so a pass is **necessary and not
sufficient**. Re-testing on real learner recordings — plus German
final-devoicing — is a precondition before the server-side path is trusted.

**2. A second reason the ticket did not anticipate: this model reports `ɾ` on
almost everything.** Across both clips it answered tap in **76 of 80** primed
samples. On genuinely _trilled_ audio (condition A) it reported the trill only
**4/40 — 10%**.

That matters because it is exactly how a model that ignores the audio would
also pass. The bias test asks whether priming _moves_ the output; an output
that never moves cannot be moved by priming. B and D agreeing at ~100% is
consistent with an honest listener **and** with a model that always says "tap."
The probe cannot tell those apart, because it was built to vary the prompt,
not the audio.

The comparison that separates them is **A vs B** — same prompt, different
audio. If the report followed the waveform, A would report the trill. It does
not: 4/40 versus 0/40, which is not even a statistically distinguishable
difference (Fisher two-tailed p ≈ 0.12).

**But this is confounded, and the confound is not resolved here.** Two
explanations fit:

- the model cannot hear the tap/trill contrast, or
- `perro_trill.wav` does not actually contain a convincing trill.

espeak-ng's synthetic Spanish trill is an approximation, and the README's claim
that the contrast is "unambiguously clean" is an assertion, not a measurement.
A crude 5 ms RMS envelope comparison was inconclusive at that resolution — the
clips differ by 84 ms (1.030 s vs 0.946 s, 22.05 kHz mono), consistent with an
added trill but not a phonetic verification. One weak cross-model hint that the
clip is not simply untrilled: `gemini-2.5-flash` reported the trill on the same
clip 8/20 times, where this model reports 4/40.

**Validating the stimulus is a prerequisite for reading condition A at all**,
and until it is done, the discrimination question — which matters more to D1
than bias does — is open.

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

Two notes from that run that remain worth acting on:

- Its `NO RESULT` message says "every call errored". That is wrong — **zero**
  API errors occurred; every D slot was `none`. The message sends a reader to
  debug the wrong thing, and is worth fixing if the script is kept.
- The probe prints only `samples[0]` per condition, which was not enough to
  diagnose the collapse; four throwaway replays were needed. Printing a tally
  of distinct outputs would have made the cause visible immediately.
