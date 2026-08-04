# Retroflex confusion screen — does the on-device model report `ɹ`, or collapse it?

Resolves [#2355](https://github.com/OPS-PIvers/SpartBoard/issues/2355) on the
[Multilingual Pronunciation Engine map](https://github.com/OPS-PIvers/SpartBoard/issues/2331).

**Verdict: the retroflex survives. `ɹ` is reported cleanly, at every quantization,
with the correct answer 25–40× ahead of its nearest rival — so per-phoneme
diagnostic feedback is not disqualified, and the spec's worked example is
reproducible on-device.**

**Two problems the ticket did not anticipate, both pointing the other way: a
_correct_ Spanish tap is reported as a trill in all four quantizations, and a
_correct_ trill's token count is not stable, so holding it longer buys an
insertion penalty.**

Measured with **onnxruntime 1.28.0** against
[`qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX`](https://huggingface.co/qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX),
all four exported quantizations, and **espeak-ng 1.51** (`es-419`, Ubuntu package)
for the references. Stimuli are the five human clips already committed at
`../pronunciation-bias-probe/audio/`.

---

## First: the ticket asked for a measurement its stimuli cannot produce

#2355 specifies "a **3×3 confusion matrix** over {`ɹ`, `ɾ`, `r`} at the target
rhotic position, **n ≥ 30 per cell**", and a pass criterion of "`ɹ` reported
**≥ 70%**" on the Anglo clips.

That design was inherited from the Gemini bias probe, where the 40-observation
cells came from **re-running a sampling model ten to thirty times over one
file**. The variance lived in the model.

**This model has no such variance.** Greedy CTC decoding is `argmax` over a
fixed graph: same bytes in, same string out. Verified rather than assumed —
three consecutive runs of the Anglo clip returned `peɹo` identically.

So one clip is one observation, permanently, and the corpus holds **exactly one
Anglo-`ɹ` clip**. The load-bearing cell could only ever read 0% or 100%. The
`≥ 70%` criterion is not merely unmet; it is unevaluable.

What follows is therefore a **necessary-condition screen**, not the matrix. It
refutes far better than it confirms: a collapse appearing here would be real,
while its absence rests on one speaker.

## What was measured

|               |                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Model         | `qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX`, vocab 392 tokens                                                              |
| Rhotic tokens | `ɹ`=27, `ɾ`=15, `r`=31 — three distinct entries, as [#2349](https://github.com/OPS-PIvers/SpartBoard/issues/2349) required |
| Decode        | Own argmax + CTC collapse (per S1 — the convenience API discards timing)                                                   |
| Audio         | 22 050 Hz mono, resampled to the model's 16 kHz; zero-mean unit-variance normalization                                     |
| Frame stride  | ~20.2 ms measured, matching S1's assumption                                                                                |

Model files, sizes and md5(12) — **not committed**, see _Reproducing_ below:

| file                | size          | md5(12)        |
| ------------------- | ------------- | -------------- |
| `model.onnx` (fp32) | 1 263 763 411 | `eabcc597e3a4` |
| `model_fp16.onnx`   | 632 071 092   | `9cb5d9fbc219` |
| `model_q4.onnx`     | 241 430 967   | `b9e69f089908` |
| `model_q4f16.onnx`  | 196 651 670   | `2ed0b7407c29` |

All five fixture md5s were re-checked against the table in
`../pronunciation-bias-probe/README.md` and match, so this measured the same
bytes the Gemini probe did.

## References, and why the trill is one token

```
espeak-ng -v es-419 -q --ipa=3 pero    ->  pˈeɾo
espeak-ng -v es-419 -q --ipa=3 perro   ->  pˈero
```

Both are **four tokens** after stress-mark removal. The Spanish trill is a
single `r` in the reference even though it is several tongue contacts in the
mouth — which is the root of the second finding below.

## Results

Edit distance from the espeak reference, in the units the alignment engine
charges. `0` is an exact match.

| clip                  | intended                                  | fp32  | fp16  | q4    | q4f16 |
| --------------------- | ----------------------------------------- | ----- | ----- | ----- | ----- |
| `pero_anglo_r_human`  | English retroflex — the learner **ERROR** | 1     | 1     | 1     | 1     |
| `pero_tap_human`      | Spanish tap — **CORRECT**                 | 3     | 3     | 1     | 1     |
| `perro_trill_human_1` | trill, weakest — **CORRECT**              | 0     | 0     | 1     | 1     |
| `perro_trill_human_2` | trill, middle — **CORRECT**               | 2     | 2     | 2     | 2     |
| `perro_trill_human_3` | trill, strongest — **CORRECT**            | 0     | 1     | 1     | 1     |
| **exact / 5**         |                                           | **2** | **1** | **0** | **0** |
| **total edits**       |                                           | **6** | **7** | **6** | **6** |

### 1. The retroflex survives — this is the finding the ticket exists for

The Anglo clip decodes as `peɹo` against a `peɾo` reference: **one edit,
`sub ɾ→ɹ`**, identically in all four quantizations.

That is _precisely_ the spec's worked example — expected `/ɾ/`, detected `/ɹ/`.
[#2344](https://github.com/OPS-PIvers/SpartBoard/issues/2344) found that example
**irreproducible server-side**: once the prompt named Spanish, Gemini returned
`ɹ` in **0 of 40** samples. On-device it comes back first try, and the margin is
not marginal:

| clip             | top-3 posteriors at the rhotic frame  |
| ---------------- | ------------------------------------- |
| retroflex (fp32) | `ɹ`=0.799 · `<pad>`=0.119 · `r`=0.032 |
| retroflex (q4)   | `ɹ`=0.788 · `<pad>`=0.140 · `r`=0.018 |

The nearest competing _phoneme_ is 25–40× behind. On this evidence the property
[D1](https://github.com/OPS-PIvers/SpartBoard/issues/2333) assumed — that a CTC
model with no language-ID input reports the phone it heard rather than the one
the language expects — **holds for this contrast**, and per-phoneme diagnostics
are not disqualified.

### 2. A correct tap is reported as a trill, in every quantization

`pero_tap_human` yields `sub ɾ→r` in all four variants: a student who taps
correctly is marked **wrong**, and a diagnostic UI would tell them "you produced
a trill" when they produced a tap. That is the same class of failure #2344
documented server-side, pointing the opposite way.

**Confidence does not separate this from the good case:**

| clip       | top-3 posteriors at the rhotic frame  |
| ---------- | ------------------------------------- |
| tap (fp32) | `r`=0.488 · `<pad>`=0.316 · `ɾ`=0.060 |
| tap (q4)   | `r`=0.402 · `ɾ`=0.320 · `d`=0.101     |

fp32 is confidently wrong — the correct `ɾ` is 8× behind. q4 is nearly a
coin-flip. **A confidence gate on whether to name the detected phoneme would
not have caught this**, because the wrong answer on the tap is about as
confident as the right answer on the retroflex. That is a direct input to
[#2362](https://github.com/OPS-PIvers/SpartBoard/issues/2362).

**Confounded, and it must not be over-read.** The clip is one speaker
deliberately producing a tap, and `../pronunciation-bias-probe/RESULTS.md`
records that the speaker's L1 is nowhere documented. A deliberate tap by an
unknown speaker is weak ground truth. This is the first thing the expansion
below should settle.

### 3. A held trill decodes as more than one `r`

A trill is several tongue contacts; CTC emits a peak per contact; the reference
holds exactly **one** `r`. So the same correct trill decodes differently
depending on how long it was held and which quantization ran it:

- fp32: trills 1 and 3 → `pero` (exact match), trill 2 → `erɹo`
- q4: trills 1 and 3 → `perro` (**one insertion each**), trill 2 → `erɹo`

Nothing in A5/A6 or S1 addresses this, and A5/A6 **dock insertions** — so a
student holding a correct trill a beat longer loses points for it. The fix is
plausibly a collapse rule before alignment, but that is a scoring-design
decision, not a measurement, and it is ticketed separately.

### 4. Quantization does not eat the contrast — the q4 pinning stands

The ticket's fourth criterion ("no cell differs by more than ~10 points")
**passes**. The rhotic _identity_ is identical across all four variants on all
five clips; only spurious insertions and deletions move.

Exact-match count appears to favour fp32 (2 vs 0), but that metric is
misleading at n=5: **total edit distance is 6 / 7 / 6 / 6**, and the direction
reverses by clip — fp32 is better on the trills, q4 is better on the tap. There
is no evidence here for revisiting
[#2349](https://github.com/OPS-PIvers/SpartBoard/issues/2349)'s `q4` choice,
which matters because q4 is 241 MB against fp32's 1.26 GB and
[#2350](https://github.com/OPS-PIvers/SpartBoard/issues/2350) has to move that
over one school access point.

### 5. The retired synthetic tap emits no rhotic at all

`perro_tap.wav` (espeak-ng synthesis, retired by the Gemini probe) decodes as
`peːho` — **no rhotic token in any variant**. Independent corroboration of that
probe's decision to retire it, and of map rule 2. It also shows the model does
not hallucinate a rhotic where none is heard.

## What this does not cover

Say it in the test, per the map's rule about sweeps that look like they prove
more than they do:

- **n = 1 per condition, one speaker, deliberate productions.** Not a confusion
  matrix. Finding 1 is the sturdiest — wide margin, stable across four
  quantizations — but it is still one clip.
- **No real learner speech.** A student failing to trill produces an unstable
  in-between articulation, not a clean retroflex. Inherited verbatim from the
  Gemini probe's own caveats.
- **One word, one language, one dialect.** `pero`/`perro`, `es-419`. Nothing
  here speaks to German or English contrasts.
- **No browser parity run.** Everything ran under `onnxruntime` (Python) on CPU.
  #2355 asked for a confirming `onnxruntime-web` run to prove the shipping path
  agrees; that is still owed, and it is a different risk (operator coverage and
  the single-threaded WASM constraint) from anything measured here.
- **`<pad>` ranks second on two of the four reported cells.** Whether a
  posterior that close to the blank should count as a detection at all is
  unexamined.

## Expanding this — how to get the measurement #2355 actually asked for

Recorded deliberately so a later session does not rediscover any of the above.
Both routes were scoped in this session; neither was taken.

### Route A — L2-ARCTIC (best annotation, needs a human step and a licence call)

[L2-ARCTIC](https://psi.engr.tamu.edu/l2-arctic-corpus/) is 24 non-native
English speakers, **4 of them L1 Spanish** (2M/2F), with **14,098 phone
substitutions annotated by hand**. Annotations are TextGrid, and a substitution
is written `CPL,PPL,s` — _the phoneme the word wanted, the phoneme the speaker
produced_. That is ground truth of exactly the right shape.

It gives the **mirror** of our question: Spanish speakers putting taps and
trills into English words, rather than English speakers putting retroflexes
into Spanish ones. That mirroring matters less than it first appears — this
model is given no target text and no language ID, so there is no supplied
expectation for it to normalize toward; the residual worry is a statistical
leaning learned in training, which the mirror probes just as well.

To use it:

1. **A human must request it.** The download is behind a form (name, email,
   affiliation, plus a checkbox accepting CC BY-NC 4.0); the link arrives by
   email as a Google Drive URL. An agent must not accept that licence on
   someone's behalf.
2. **Route the licence question.** CC BY-**NC**, used to validate a district
   product. Nothing from the corpus would be committed — only the harness and
   the numbers, as the sibling spikes already do with their data — but
   "measurement output is not the corpus" is a call for a human, per the map's
   Notes on non-engineering decisions.
3. Restrict to the 4 Spanish-L1 speakers, keep TextGrid intervals whose
   annotation involves a rhotic, map each interval onto CTC frames via the
   ~20 ms stride (`decode.py` already returns frame spans), and ask the one
   question that matters: **does the model report the phoneme the annotator
   heard, or the one the word wanted?**
4. Only ~150 utterances per speaker are hand-annotated, so budget on roughly
   600 annotated Spanish-L1 utterances, not the full 27 hours.

### Route B — record English speakers ourselves (right stimulus, no licence)

The direct test, and the only route that fills the Anglo-`ɹ` cell with known
ground truth: 10–15 L1-English adults reading a Spanish word list. Published L2
Spanish rhotic studies exist but **none release audio** — this data does not
exist off the shelf.

- The existing clips were cut from one phone recording with `ffmpeg`; the
  method is proven and in `../pronunciation-bias-probe/README.md`.
- **Record the speaker's L1 this time**, and the consent basis. Finding 2 is
  confounded precisely because the current corpus records neither, and that gap
  was knowingly accepted on 2026-08-02 — do not re-accept it by default.
- Adults reading a word list is a far lighter consent question than
  [#2352](https://github.com/OPS-PIvers/SpartBoard/issues/2352)'s student audio,
  and does not depend on it.
- Include deliberate taps **and** deliberate trills from the same speakers, so
  finding 2 can be attributed to the model rather than to one voice.

### Route C — Common Voice Spanish (breadth for the tap/trill cells only)

[Common Voice](https://commonvoice.mozilla.org/) Spanish is **CC-0**, so unlike
Route A its clips could be committed. Thousands of speakers with accent
metadata, which would give findings 2 and 3 the speaker variety they lack. Two
limits: it contains no Anglo-`ɹ`-in-Spanish material, and its IPA is derived
from the sentence text rather than the audio — it says what the sentence should
have sounded like, not what the speaker did, so it is not ground truth for a
substitution.

## Reproducing

```bash
sudo apt-get install -y --no-install-recommends espeak-ng   # 1.51
python3 -m venv venv && ./venv/bin/pip install onnxruntime numpy scipy

mkdir -p model && cd model
BASE=https://huggingface.co/qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX/resolve/main
curl -sSLO $BASE/vocab.json
curl -sSLO $BASE/preprocessor_config.json
for v in model.onnx model_fp16.onnx model_q4.onnx model_q4f16.onnx; do
  curl -sSL -o $v $BASE/onnx/$v
done
cd ..

MODEL_DIR=./model ./venv/bin/python measure/compare.py     # the table above
MODEL_DIR=./model ./venv/bin/python measure/decode.py model_q4.onnx \
  ../pronunciation-bias-probe/audio/*.wav                  # strings + posteriors
```

The four `.onnx` files total ~2.3 GB and are **not committed** — see
`.gitignore`.

## Scope

Spike code, not production code. Committed so the #2355 result is auditable and
so the expansion routes above survive the session that found them.
