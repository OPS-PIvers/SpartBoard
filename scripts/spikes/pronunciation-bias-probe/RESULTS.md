# D1 bias probe — run record

First and so far only execution of `bias-probe.mjs`. Recorded here rather than
left in a comment because the whole point of committing this spike was that D1
should not rest on a screenshot.

- **Date:** 2026-08-02
- **Model:** `gemini-2.5-flash` (script default)
- **Runs:** 10 per condition (script default; not reduced)
- **Key source:** `GEMINI_API_KEY (shell)`
- **Ticket:** [Run the D1 bias probe and record the verdict](https://github.com/OPS-PIvers/SpartBoard/issues/2332)

## Headline

**The probe returned `NO RESULT`.** Its verdict rule compares B against D, and
condition D produced **zero usable samples** — not through API errors, but
because the unprimed model did not transcribe the clip as Spanish at all.

## Run 1 — `node bias-probe.mjs`

```
key source: GEMINI_API_KEY (shell)
model: gemini-2.5-flash   runs: 10

A  trill audio, told "perro"  ->  {"ɾ":8,"r":2}
     e.g. [p ɛ ɾ o]
B  TAP audio,   told "perro"  ->  {"ɾ":8,"r":2}
     e.g. [p e ɾ o]
C  TAP audio,   told "pero"   ->  {"ɾ":9,"other":1}
     e.g. [p e ɾ o]
D  TAP audio,   told nothing  ->  {"none":10}
     e.g. [m eɪ l]

--- VERDICT ---
B (primed "perro") reported the true tap: 8/10 (80%)
D (unprimed)       reported the true tap: 0/0 (n/a)  [excluded: 10 no rhotic reporteds]

NO RESULT. At least one condition produced zero usable samples — every
call errored. Fix the API errors above and re-run; there is nothing to
interpret here.
```

> Note: the `NO RESULT` text says "every call errored". That is inaccurate —
> **zero** API errors occurred in this run. Every D slot was `none` (no rhotic
> reported). The `line()` output immediately above it is correct. Worth fixing
> if the script is kept, since the message sends a reader to debug the wrong
> thing.

## Diagnostic runs

The probe prints only `samples[0]`, which is not enough to characterise the D
collapse. Three throwaway replays followed, each reusing the committed audio
and the script's exact prompt/schema. They are **diagnostics, not part of the
verdict** — the scripts were deleted after use.

### D replayed, all 10 samples (unprimed, tap clip)

```
 1. [b ɛ l ə]        6. [b ɛ n oʊ]
 2. [m eɪ f ɔː l]    7. [b eɪ ə n ɛ t]
 3. [b eɪ n]         8. [b eɪ]
 4. [b eɪ n]         9. [b eɪ]
 5. [ɹ eɪ n b oʊ]   10. [m eɪ l]
```

Nine `none`, one `other`. Not one sample has the `/p/` onset. The model is
transcribing English word-shapes — _bella, may-fall, bane, rainbow, bayonet,
bay, male_ — off a Spanish clip. The collapse reproduces.

### B replayed, all 10 samples (primed "perro", tap clip)

```
 1. [p e r o]   6. [p e ɾ o]
 2. [p e ɾ o]   7. [p e r o]
 3. [p e ɾ o]   8. [p e r o]
 4. [p e ɾ o]   9. [p e ɾ o]
 5. [p e ɾ o]  10. [p e ɾ o]
```

`{ɾ:7, r:3}` — 70%, against 80% in run 1.

### A replayed, all 10 samples (primed "perro", **trill** clip)

```
 1. [p e r o]   6. [p e ɾ o]
 2. [p e ɾ o]   7. [p e r o]
 3. [p e r o]   8. [p e ɾ o]
 4. [p e r o]   9. [p e r o]
 5. [p e r o]  10. [p e ɾ o]
```

`{r:6, ɾ:4}` — against `{ɾ:8, r:2}` in run 1. The identical A/B tally in run 1
was coincidence; it did not reproduce.

### Trill clip, unprimed

```
 1. [ɛ ɹ oʊ]     6. [ɛ r oʊ]
 2. [eɪ ɾ i]     7. [ɛ ɹ i əl]
 3. [oʊ]         8. [h ɛ l oʊ]
 4. [ɛ r]        9. [h ɛ l oʊ]
 5. [e ə r oʊ]  10. [ɛə ɹ oʊ]
```

`{r:3, other:3, ɾ:1, none:3}` — _arrow, aerial, hello_. The unprimed collapse is
not specific to the tap clip; it happens on both.

### Repaired baseline — language named, word never named (tap clip)

Prompt: _"This is a recording of a single Spanish word. Transcribe what the
speaker actually said into IPA phonemes…"_ — still a valid unprimed baseline
for the bias comparison, since it never names the word.

```
 1. [p e ɾ o]   6. [p e ɾ o]
 2. [p e ɾ o]   7. [p e r o]
 3. [p e "ɾ o]  8. [p e ɾ o]
 4. [p e ɾ o]   9. [p e ɾ o]
 5. [p e ɾ o]  10. [p e ɾ o]
```

`{ɾ:9, r:1}` — 90%. **Condition D is a harness defect, not a dead end.** One
sentence of language context restores a usable baseline.

## Pooled counts

| Condition | Audio | Told           | Samples | tap `ɾ` | trill `r` | other | none |
| --------- | ----- | -------------- | ------- | ------- | --------- | ----- | ---- |
| A         | trill | "perro"        | 20      | 12      | 8         | 0     | 0    |
| B         | tap   | "perro"        | 20      | 15      | 5         | 0     | 0    |
| C         | tap   | "pero"         | 10      | 9       | 0         | 1     | 0    |
| D         | tap   | nothing        | 20      | 0       | 0         | 1     | 19   |
| D′        | tap   | _Spanish word_ | 10      | 9       | 1         | 0     | 0    |

Zero API errors across all 80 calls.

## Reading

1. **The designed verdict (B vs D) is uncomputable.** D holds no observation of
   the rhotic.
2. **Against the repaired baseline D′, no prompt bias is detectable** —
   B 75% tap vs D′ 90% tap, a delta of 0.15 against the script's 0.40 screening
   threshold. But B's own tap rate (75% pooled; 80% and 70% across runs)
   straddles the script's 0.80 pass gate, so this lands on the boundary between
   the script's _no bias_ and _inconclusive_ branches depending on which run you
   read. It is not a pass.
3. **The load-bearing failure is elsewhere: the model barely discriminates the
   minimal pair.** On genuinely trilled audio (A) it reported the trill only
   **8/20**, calling correct speech an untrilled tap 12/20. A scorer built on
   this would fail correctly-rolled r's most of the time. But A's two runs
   disagree sharply (2/10 then 6/10 trill), and A vs B on trill-reports is
   8/20 vs 5/20 — Fisher two-tailed p ≈ 0.5, i.e. **not separable from noise at
   this n**. Directionally alarming, not established.

## Caveats

- Per the ticket and the script header, the clips are espeak-ng synthesis with
  an unusually clean contrast. That makes the probe conservative for _bias_.
- It also makes the _discrimination_ finding softer than it looks: espeak-ng's
  synthetic trill is an approximation, and how trill-like `perro_trill.wav`
  actually sounds is unverified here. The two clips differ by 84 ms
  (1.030 s vs 0.946 s, 22.05 kHz mono), which is consistent with a real added
  trill but is not a phonetic verification.
- One model, one contrast, one language.
