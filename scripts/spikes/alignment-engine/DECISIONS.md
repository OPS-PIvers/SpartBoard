# Alignment & scoring behaviour — decisions

Resolves [#2335 — Define correct alignment & scoring behaviour](https://github.com/OPS-PIvers/SpartBoard/issues/2335),
a decision ticket on the [Wayfinder Map: Multilingual Pronunciation Engine](https://github.com/OPS-PIvers/SpartBoard/issues/2331).

**Status:** accepted. Where this file and
`docs/multilingual-pronunciation-engine-spec.md` §4–§6 disagree, this file wins.

**Contents.** `engine.ts` is a reference implementation, `engine.test.ts` the
executable form of every decision below. Neither is wired into the app and
neither is imported by feature code — this is a spike directory, in the same
sense as `pronunciation-bias-probe/` and `english-g2p-probe/`. It runs under
`pnpm test`, so a later change that violates one of these decisions fails CI.

The ticket prescribed the method (source doc §9.1): **write the review notes
as tests before deciding how to fix them**, because each note is a behavioural
claim with a concrete input, and choosing the assertion _is_ the decision.
That is what happened here, and it immediately paid for itself — see
[Findings](#findings-from-writing-the-tests).

---

## Decisions

### A1 — Stress is scored, from a separate detection stage

Stress is **in scope** and **does affect the grade**. It does **not** come from
the phoneme model.

The phoneme model cannot supply it. Verified directly against the vocabulary
files of both models selected in
[#2349](https://github.com/OPS-PIvers/SpartBoard/issues/2349):

| Model                                              | Vocab size | Primary stress `ˈ` | Secondary stress `ˌ` |
| -------------------------------------------------- | ---------- | ------------------ | -------------------- |
| `facebook/wav2vec2-xlsr-53-espeak-cv-ft` (chosen)  | 392        | absent             | absent               |
| `facebook/wav2vec2-lv-60-espeak-cv-ft` (runner-up) | 392        | absent             | absent               |

The 85 digit-bearing tokens (`a1`, `iou4`, …) are **Mandarin tone numbers**,
and Mandarin is out of scope on the map. They are not stress.

This is not bad luck in model selection. A survey of 16 phoneme-recognition
models across the top ~80 on Hugging Face — wav2vec2, WavLM, HuBERT and
Whisper-based IPA models — found **15 emit no stress at all**. The single
exception, `mrrubino/wav2vec2-large-xlsr-53-l2-arctic-phoneme`, carries only
the _secondary_ mark `ˌ` with no primary `ˈ` in a 40-token vocabulary, which is
a labelling artifact rather than stress modelling, and it is English-only so it
fails the Spanish/German requirement regardless.

The reason is structural: stress is **suprasegmental** — it lives in pitch,
loudness and duration spread across a syllable — while a CTC model assigns each
audio frame one segment label. There is no place in that output for stress.

So stress is measured by its own stage, from pitch, intensity and syllable
duration, and reaches the engine as a separate channel (`StressInput`).

> **Scope consequence.** The map lists _"Fluency, prosody, rhythm, and
> intonation scoring"_ under **Out of scope**. A dedicated stress-detection
> stage crosses that line, so the map's destination is being **redrawn** to
> admit stress specifically — not prosody generally. Fluency, rhythm and
> intonation stay out. Tracked as its own ticket.

### A2 — The stored reference is narrow, exactly as the model emits it

The reference string stores what the model's 392-symbol espeak label set
actually produces — the American flap in _water_, allophony and all — rather
than an idealized broad-phonemic form.

Both sides of the comparison then live in one alphabet and nothing needs
converting. The alternative required a per-language allophone-to-phoneme
collapse table that does not exist, where every rule is a new way to mark a
correct student wrong.

Accepted cost: the reference is literal, so a student producing a different but
still-correct allophone is scored as a substitution. That is the same problem
A10 solves for stress, and it is why the never-penalize-a-correct-dialect rule
in [#2342](https://github.com/OPS-PIvers/SpartBoard/issues/2342) matters as
much as it does.

The engine itself is alphabet-agnostic — it compares strings — so a future
change of label set needs no engine change.

### A3 — The payload always carries the detected sound

`alignment[].spokenIPA` is always populated on a substitution. The engine is a
pure function over two token arrays; it has no way to know how the detected
sounds were produced, so withholding them is not its call to make.

**Whether a human is shown that symbol is a UI gate, not an engine contract.**
[#2344](https://github.com/OPS-PIvers/SpartBoard/issues/2344) established that
under a _server-side_ path the detected phoneme is a target-language
approximation and would be wrong to display. D1 moved inference on-device,
which is expected to remove that distortion — but
[#2355](https://github.com/OPS-PIvers/SpartBoard/issues/2355) has not measured
it yet. **The teacher results UI must not name the detected sound until #2355
resolves.** Substitution _presence_ is safe today; substitution _identity_ is
not.

### A4 — No prose in the engine

The `diagnostic` field is **removed**. The engine returns `position`,
`targetIPA`, `spokenIPA`, `status` and nothing else.

The reference implementation baked an English sentence into every entry
(`Expected /r/, detected /ɹ/`). SpartBoard ships in English, German, Spanish
and French — a hard-coded English string would be read by exactly the German
and Spanish classes this feature exists for. Composing the sentence is the
results UI's job, through i18n.

### A5 — Extra sounds get a real entry

An inserted sound produces an `alignment[]` entry with `status: 'inserted'`,
`targetIPA: null`, and the detected sound in `spokenIPA`. The reference
implementation counted insertions but emitted nothing, which made an insertion
badge literally unrenderable — the reason the teacher results UI is listed as
blocked on this ticket.

**Contract change:** `position` is **no longer unique**. An inserted entry
carries the position of the target sound it follows (`0` when it precedes the
whole word), so it shares a position with its neighbour. Consumers must render
`alignment` **in array order**, which is utterance order, and must not sort or
key by `position`.

### A6 — The error rate keeps its standard definition

`PER = (substitutions + omissions + insertions) / N`, where `N` is the target
sound count. It is **not** clamped and **not** renormalized, so it can exceed
1 — a student who adds twelve extra sounds to a six-sound word scores 2.0.

That is the standard definition used in speech-recognition research, which
keeps our numbers comparable to published error rates, including the ones
[#2336](https://github.com/OPS-PIvers/SpartBoard/issues/2336) measured. The
score already clamps at 0, so nothing downstream breaks.

**Rule that follows: PER is an internal metric. Never show it to a teacher as
a percentage.** The teacher-facing number is `score`.

### A7 — An unconfigured strictness level is rejected, never guessed

`THRESHOLDS[matchLevel] || 80` is gone. An unknown level throws
`InvalidMatchLevelError`, naming the levels that _are_ configured. The
authoring path validates before saving, and the picker prevents typos at the
UI layer.

A picker alone is not sufficient, because the value does not arrive from the
picker at grading time — it arrives from Firestore. The project has **no
runtime schema validation** (no `zod`; Firestore documents are read with bare
`as SomeType` assertions, which guarantee nothing), thresholds ship **tunable**
so the valid names are admin-configurable and can change _after_ a question is
authored, PLC sharing moves quizzes between buildings with different presets,
and D4 established that no score is stored — points are recomputed on every
read. A question naming a renamed or foreign preset is therefore a normal
state, not a typo.

> **Landmine, inherited from [D4](https://github.com/OPS-PIvers/SpartBoard/issues/2334).**
> `gradeAnswer()` ends in a catch-all returning zero. A caller that swallows
> `InvalidMatchLevelError` converts a loud, fixable failure into a silent 0 for
> an entire class, permanently, including in the archive. **This error must
> surface.**

### A8 — Ties are broken toward a substitution, deliberately

When a substitution and an omission are both optimal, the substitution wins.

This is the same outcome the reference implementation produced, but there it
was an accident of `else if` ordering. It is now a decision, on two grounds: it
keeps one entry per expected sound so the breakdown lines up with the word, and
_"you said X instead of Y"_ is more useful to a student than _"you skipped Y
and also added X"_.

Rejected: breaking ties by phonetic similarity. Better feedback, but it needs a
phonetic distance table per language that does not exist and is a substantial
build of its own.

### A9 — Stress folds into one combined score, at a tunable weight

```
score = round((1 − w) × segmentScore + w × stressScore)
```

`w` is admin-tunable and expected to default low (10–15%), matching the
project's standing rule that thresholds ship tunable rather than hard-coded. A
building that finds regional stress variation failing correct students can dial
it to zero.

**Degradation is explicit:** with no stress evidence the applied weight
collapses to `0` and the result is sounds-only, with `stressScore: null`. A
stress stage that is unavailable, still downloading, or not configured must
never score every student 0.

### A10 — Any accepted stress variant scores full credit

A question stores **every regionally acceptable stress pattern**, and matching
any one of them scores 100 on the stress dimension. Partial agreement scores
the best per-syllable match across the variants.

This is how stress satisfies the never-penalize-a-correct-dialect rule in
[#2342](https://github.com/OPS-PIvers/SpartBoard/issues/2342), which binds at
every strictness level.

> **Dependency this creates.** It needs per-dialect accepted stress patterns
> for Spanish, German and English, which do not exist and must be built or
> sourced. Tracked as its own ticket. Until that reference exists, A9's weight
> should default to 0.

### A11 — Human-readable sound names are in scope, but do not gate the spec

The spec's example shows _"Expected trilled /r/, detected English retroflex
/ɹ/"_ where the code produces _"Expected /r/, detected /ɹ/"_. A full
human-readable name table **is in scope** for this effort — all symbols the
model can emit, in all four interface languages.

It does **not** block spec acceptance. This decision fixes where the names live
(the UI's i18n layer, per A4, not the engine) and what shape they take; writing
roughly 392 entries × 4 languages is a bulk translation job that no other
decision depends on. Tracked as its own ticket.

### A12 — What this ticket ships

This directory: the decision record, a reference implementation, and a test
suite that runs in CI. **No feature code**, consistent with the map's
plan-don't-do rule and with the fact that the dialect surface
([#2338](https://github.com/OPS-PIvers/SpartBoard/issues/2338)), the Firestore
response shape
([#2354](https://github.com/OPS-PIvers/SpartBoard/issues/2354)) and the
recording UX ([#2351](https://github.com/OPS-PIvers/SpartBoard/issues/2351))
are all still open.

---

## Findings from writing the tests

### The spec's canonical worked example is arithmetically wrong

Spec §6.2 gives `El perro` spoken with an English retroflex as
`score: 75, passed: false` alongside `per: 0.166`. Under the formula the spec
itself states in §5.1 — `Accuracy = max(0, round((1 − PER) × 100))` — one
substitution in six target sounds is:

```
PER   = 1 / 6      = 0.167
Score = round(83.3) = 83     →  83 ≥ 80, so it PASSES at Close
```

A score of 75 would require PER 0.25, i.e. two errors in eight sounds, not one
in six. **The spec's canonical illustration of a failure is actually a pass.**

This matters beyond the arithmetic: it is the example the whole effort has been
pointing at as the first unit test, and anyone calibrating thresholds against
it would have been calibrating against a number the stated formula cannot
produce. Pinned in `engine.test.ts` as
`'scores 83 and PASSES at Close — not the 75/failed the spec shows'`.

The tap/trill contrast still fails at `Exact` (95), which is the profile that
matches the pedagogical intent of the example.

### `—` was doing double duty

The reference used the em dash `'—'` as `spokenIPA` on an omission. With A5
adding insertions, both sides of an entry can now be absent, and a display
character in a data field is a trap for the results UI. Both are `null`;
rendering is the UI's business.

---

## What this hands to other tickets

| Ticket                                                                                     | What it inherits                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teacher results UI (map fog)                                                               | Four statuses to render, including insertions (A5). Must render in array order, not by `position` (A5). Must not name the detected sound until #2355 (A3). Composes all text via i18n (A4). Never displays PER (A6). |
| [#2342 — thresholds & dialect](https://github.com/OPS-PIvers/SpartBoard/issues/2342)       | The stress weight `w` joins the tunable set (A9). Stress inherits the never-penalize rule via accepted variants (A10).                                                                                               |
| [#2354 — Firestore response shape](https://github.com/OPS-PIvers/SpartBoard/issues/2354)   | Accepted stress variants and the narrow reference string are per-question stored fields (A2, A10).                                                                                                                   |
| [#2341 — teacher authoring UX](https://github.com/OPS-PIvers/SpartBoard/issues/2341)       | Strictness is a picker, and the value is validated before save (A7). Accepted stress variants need a confirmation affordance (A10).                                                                                  |
| [#2355 — retroflex confusion matrix](https://github.com/OPS-PIvers/SpartBoard/issues/2355) | Now gates a UI affordance rather than the engine contract (A3).                                                                                                                                                      |
| Server-side symbol normalization (map fog)                                                 | Must project G2P output into the model's 392-symbol set, narrow rather than broad (A2).                                                                                                                              |
