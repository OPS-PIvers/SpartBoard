# Stress detection — decisions

Resolves [#2359 — Detecting stress without the phoneme model](https://github.com/OPS-PIvers/SpartBoard/issues/2359),
a decision ticket on the [Wayfinder Map: Multilingual Pronunciation Engine](https://github.com/OPS-PIvers/SpartBoard/issues/2331).

**Status:** accepted. **Supersedes A10b** in
[`../alignment-engine/DECISIONS.md`](../alignment-engine/DECISIONS.md), and
narrows the shape of `StressInput` there — see [What changed in the alignment
contract](#what-changed-in-the-alignment-contract).

**Contents.** `stress.ts` is a reference implementation, `stress.test.ts` the
executable form of every decision below, `deriveNuclei.mjs` regenerates
`nuclei.json` from the committed model vocabulary. Neither is wired into the
app nor imported by feature code — a spike directory, like
`alignment-engine/` and `english-g2p-probe/`. It runs under `pnpm test`, so a
later change that violates one of these decisions fails CI.

**Scope guard.** This detects **lexical stress only** — which syllable of a
known word carries prominence. Fluency, rhythm and intonation remain out of
scope on the map. Nothing here may grow into general prosody scoring.

---

## What we checked before deciding

Two premises the discussion was resting on turned out to be wrong in opposite
directions. Both took under a minute to settle by reading the artifact.

### Frame timings exist, but not where you would look for them

The obvious call, `pipeline('automatic-speech-recognition')`, routes wav2vec2
to `_call_wav2vec2`, which returns `{ text }` and **discards all timing**. The
function is marked `// TODO use kwargs` and warns that options are ignored;
`return_timestamps` is read only by the Whisper branch. Taking the documented
happy path therefore forecloses stress detection entirely, silently.

But `Wav2Vec2ForCTC` is a publicly exported class returning raw `logits`
shaped `[1, frames, 392]`. Owning the argmax + CTC collapse ourselves yields a
frame span per emitted symbol at the model's ~20 ms stride.

**Consequence: no second model download, and no forced aligner.** Syllable
positions come from the phoneme stream we already produce. The map's
"a second artifact may now join it" note under _Where the model artifact is
served from_ can be struck.

### The vocabulary decides what a syllable is

`nuclei.json` is derived from the chosen model's own `vocab.json` (committed
here) by `deriveNuclei.mjs`. Of 387 sound tokens, **244 can carry a syllable**:

| Class               | Count | Why it matters                                                                 |
| ------------------- | ----- | ------------------------------------------------------------------------------ |
| Vowel-headed        | 239   | Includes diphthongs as **single tokens** — `aɪ`, `aʊ`, `eɪ`, `ɔɪ`, `əʊ`, `eə`. |
| Syllabic consonants | 3     | `n̩`, `l̩`, `r̩` — nuclei with no vowel in them.                                  |
| Glide-initial       | 2     | `ja`, `ju` — whole syllables that begin with a consonant.                      |

Three traps a hand-written rule falls into:

- **"Count the vowels" undercounts German systematically.** `n̩`, `l̩`, `r̩` are
  syllable nuclei containing no vowel, and German's reducing `-en` ending
  (`gehen`, `Wagen`, `haben`) is full of them.
- **"The first character is a vowel" drops `ja` and `ju`** — both ordinary
  German words, so the loss would be frequent and silent.

- **A textbook IPA vowel list is not this vocabulary's vowel list.** Four
  vowels sit outside the familiar inventory, and two of them are load-bearing
  for English: **`ɚ`** (r-coloured schwa — `better`, `water`, `teacher`) and
  **`ᵻ`** (espeak's own reduced high vowel — `roses`, `wanted`), plus `ä` and
  `ũ`. Omitting `ɚ` and `ᵻ` costs those words a syllable outright, **which
  shifts every stress index after it.**

  These were found by auditing the heads of the tokens the rule _rejected_ —
  not by re-reading the list. That audit is the check worth repeating if the
  label set ever changes; `ʲ` (palatalization modifier) and `ɫ` (dark l) look
  similar in that listing and are correctly excluded, the syllabic form of l
  being the separate token `l̩`.

Because diphthongs are single tokens, English `time` is `t aɪ m`: one nucleus,
one syllable. No diphthong-merging rule is needed.

---

## Decisions

### S1 — The detector reports one syllable index, not a per-syllable pattern

Stress is encoded as **the 1-based index of the stressed syllable** — "the 2nd
of 3" — not a vector like `[0,1,0]`.

Detection is then a purely **relative** judgement: rank the nuclei of one word
and take the most prominent. Nothing needs an absolute threshold, which is
what the map's deferred-calibration rule demands. Spanish lexical stress _is_
this property, and it is the property teachers correct.

Rejected, and why:

- **Stressed/unstressed per syllable.** Every syllable then needs an
  independent yes/no judgement, and that needs a threshold — the calibration
  we deliberately deferred.
- **Primary/secondary/none.** Matches what espeak writes, so
  [#2360](https://github.com/OPS-PIvers/SpartBoard/issues/2360) could source
  the reference directly from espeak's stress marks. Rejected because the
  engine compares for equality: if acoustic detection cannot reliably separate
  secondary stress from unstressed — and there is no reason to think it can —
  **every multi-syllable German and English word mismatches**.

Accepted cost: words that genuinely carry two stresses cannot be expressed.
This is a real loss in German and English compounds, taken knowingly.

**This is what [#2360](https://github.com/OPS-PIvers/SpartBoard/issues/2360)
must write its reference in:** a list of acceptable syllable indices per
question, not a list of vectors.

### S2 — Syllables come from the phoneme stream, not a separate stage

A syllable nucleus is any token in the derived 244-token set. Its extent is
the token's frame span, from the CTC decode.

No forced alignment, no second model, no extra download. See
[What we checked](#the-vocabulary-decides-what-a-syllable-is) — the nucleus
set is generated from the model's vocabulary rather than asserted, and
regenerating it is one command.

### S3 — Prominence is mapped onto the _target_ syllable through the alignment

The detector reports a nucleus of what the student **said**. The engine then
carries it to the syllable of the word they were **asked** to say, using the
alignment it has already computed.

This dissolves the syllable-count problem rather than answering it. There is
no comparison of counts anywhere, so a student who produces four syllables
against a three-syllable word has nothing to mismatch.

**Supersedes A10b**, which measured agreement over the longer of the two
patterns and charged a student for the difference. A10b's own stated risk was
that noisy segmentation would manufacture errors the student did not make;
that risk is now structurally absent, not merely bounded by a low weight.

It also stops the stress dimension **double-charging** an error the segment
score already counts: an extra syllable is already docked as insertions under
A5/A6.

**The detector stays independent.** It reports in its own index space; the
_engine_ performs the mapping, because the engine is what holds the alignment.
A9's separate-channel shape survives — the engine gains a mapping step, the
detector gains no dependency.

#### S3a — A prominent nucleus that is an insertion is absent evidence

When the winning nucleus aligns to an `inserted` entry it has **no target
counterpart**, so there is no syllable it could have stressed. This takes the
degradation path (S5), not a zero.

_Decided without asking_ — it follows from S3 but was not raised in the
session. Flagged for review.

### S4 — Four cues, all compared within the word

| Cue                          | Source                          | Cost                                 |
| ---------------------------- | ------------------------------- | ------------------------------------ |
| Syllable duration            | CTC frame spans we already hold | Free                                 |
| Loudness                     | Energy over the nucleus window  | A sum over samples already in memory |
| Pitch                        | f0 tracked per frame            | One small library, or ~100 lines     |
| The vowel the model reported | The phoneme stream              | Free                                 |

Because ranking is relative within a single word, **recording level and
microphone distance cancel out** and no absolute threshold is introduced.

Two refinements the harness pins:

- **Reduced vowels are an English-only cue.** English reduces unstressed
  vowels to `ə`, so a reduced nucleus is near-proof of "not stressed" — and it
  is already in the phoneme stream at no measurement cost. Spanish does not
  reduce vowels at all and German barely, so applying it there would penalise
  a legitimately stressed vowel. The tests pin the same input resolving under
  `en` and degrading under `es`.
- **Untracked pitch redistributes its weight rather than scoring zero.** Pitch
  contributes only when tracked for _every_ nucleus in the word. Scoring an
  untracked syllable as pitch-zero would read as "this syllable had no pitch"
  instead of "we did not measure it", and would rank a partially-voiced word
  on inconsistent evidence.

> **Licensing landmine, same family as the espeak GPL-3 read.** The obvious
> pitch library, `pitchfinder` (229 KB), is **GPL-3**, as is `node-pitchfinder`.
> Bundling either reintroduces exactly the client-bundle problem D1 removed by
> moving G2P server-side. **`pitchy` is MIT, 33 KB**, and is the clean choice;
> writing the tracker in-house is also viable. Do not reach for the top search
> result.

> **Unmeasured, per the map's rule 4.** No cue weighting here has been checked
> against real audio. The weights ship tunable, and validating them against
> the human clips in `pronunciation-bias-probe/` is the natural next spike —
> see [What this hands on](#what-this-hands-to-other-tickets). Pitch
> declination in particular means the first syllable of an isolated word reads
> as high regardless, and whether that needs correcting is an open empirical
> question.

### S5 — Uncertainty is reported by saying nothing, never by an empty value

Below a tunable prominence margin — two syllables too close to call, no nuclei
found, measurement mismatch, or S3a's insertion case — the detector returns
**nothing at all**, and the caller omits the `stress` field entirely. That is
A9's existing degradation path: weight collapses to 0, result is sounds-only.

Rejected: **a confidence number scaling the weight.** It ships an uncalibrated
number straight into a grade when calibration is explicitly deferred, and it
makes identical spoken performance score differently by microphone — which no
teacher can explain to a student. S1 also makes the stress score binary, so a
sliding weight would invent precision the underlying judgement does not have.

> **The trap this closes**, raised in review of PR #2358 and recorded on
> #2359: `accepted: []` means _absent evidence_ and degrades (A10a), but an
> empty **detected** value against a populated `accepted` means _the student
> matched none of it_ and scores 0 at full weight. They are opposite. The
> reference implementation makes them unconfusable by having no empty detected
> state to return — every unreadable path yields `null`.
>
> Getting this backwards silently fails every student whose audio simply could
> not be read, and because no score persists (D4 recomputes on every read), it
> would apply **retroactively to every historical response**.

---

## What changed in the alignment contract

`StressInput` in `../alignment-engine/engine.ts` currently reads:

```ts
interface StressInput {
  detected: number[]; // per-syllable pattern
  accepted: number[][]; // list of patterns
}
```

Under S1 and S3 it becomes:

```ts
interface StressInput {
  detected: number; // 1-based TARGET syllable index
  accepted: number[]; // acceptable target syllable indices
}
```

`scoreStress` correspondingly collapses from partial per-syllable agreement to
`accepted.includes(detected) ? 100 : 0`.

**The #2335 spike is deliberately left as-is.** It is the accepted record of
that ticket and its 27 tests are the pinned form of A1–A13; rewriting them
would erase the record and break CI for no gain, since neither spike is
imported by feature code. A10 and A10b there carry a pointer to this file.
**Feature implementation takes the shape above, not the one in that spike.**

A9, A10 and A10a are unaffected:

- **A9** — the combined-score formula and the collapse-to-zero-weight
  degradation path are unchanged; S5 decides when to invoke them.
- **A10** — full credit for any accepted regional variant survives exactly.
  `accepted` became a list of indices instead of a list of vectors, and the
  never-penalize-a-correct-dialect rule ([#2342](https://github.com/OPS-PIvers/SpartBoard/issues/2342))
  binds as before.
- **A10a** — an empty accepted list is still absent evidence, still degrades.

---

## What this hands to other tickets

| Ticket                                                                                   | What it inherits                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#2360 — accepted stress patterns](https://github.com/OPS-PIvers/SpartBoard/issues/2360) | The reference is **a list of acceptable syllable indices per question**, not vectors (S1). espeak's `ˈ`/`ˌ` marks remain a viable source — take the primary mark's syllable position and discard the secondary. Once it lands, A9's weight can leave 0. |
| [#2341 — teacher authoring UX](https://github.com/OPS-PIvers/SpartBoard/issues/2341)     | Accepted stress indices need a confirmation affordance, and syllable count is derivable from the stored reference phonemes via the 244-token nucleus set — so the picker can show real syllables rather than asking a teacher to count.                 |
| [#2354 — Firestore response shape](https://github.com/OPS-PIvers/SpartBoard/issues/2354) | Accepted stress indices are a per-question stored field: `number[]`, not `number[][]`.                                                                                                                                                                  |
| [#2342 — thresholds & dialect](https://github.com/OPS-PIvers/SpartBoard/issues/2342)     | Two more tunables join the set: the three cue weights (S4) and the prominence margin (S5).                                                                                                                                                              |
| [#2362 — teacher results UI](https://github.com/OPS-PIvers/SpartBoard/issues/2362)       | Stress is present, absent, or wrong — never partially right (S1, S5). "Stress not assessed" is a normal, frequent state and needs a real presentation, not an error.                                                                                    |
| Model artifact hosting (map fog)                                                         | **No second artifact.** Stress adds no model download (S2); the only new bundle cost is an MIT pitch tracker measured in tens of KB.                                                                                                                    |
| Feature implementation (post-spec)                                                       | **Do not use `pipeline('automatic-speech-recognition')`.** Its wav2vec2 branch discards the frame timings stress detection depends on. Use `Wav2Vec2ForCTC` directly and own the decode.                                                                |
