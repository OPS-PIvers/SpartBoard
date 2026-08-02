# Multilingual Pronunciation Engine — Exploration Map

**Status:** Exploration — one blocking decision unresolved (D1)
**Author:** ops-pivers + Claude
**Branch:** `claude/multilingual-pronunciation-engine-whug9x`

Adds spoken-response items to the SpartBoard quiz: a student records audio on
their own device, and the response is scored by comparing the phonemes they
actually produced against the phonemes the target text requires. Output is a
sound-by-sound breakdown (correct / substituted / omitted) plus an accuracy
score. Gated to a named set of language and EL teachers.

This document is a **decision map**, not an implementation plan. It records
what was verified against the codebase, which decisions are settled, and which
one is blocking. No feature code has been written.

---

## 1. Goals & non-goals

**Goals**

- A quiz can contain items where the student's answer is _spoken_, not typed.
- Scoring is phoneme-level and diagnostic: a teacher can see _which sound_ went
  wrong, not just a percentage.
- Teachers choose per assignment whether a spoken item counts toward a grade.
- The feature is invisible to staff who don't teach language — it is highly
  content-specific and should not appear in every teacher's quiz editor.

**Non-goals (explicit)**

- Fluency, prosody, rhythm, or intonation scoring beyond Mandarin lexical tone.
- Open-ended speech ("describe your weekend"). Target text is always known.
- Mandarin at first ship. See D5 — it is a materially different problem.
- Replacing teacher judgment. See D6.

---

## 2. Grounding: what was verified in the codebase

Anchors, not speculation:

- **Question types** — `types.ts:3000`, `QuizQuestionType = 'MC' | 'FIB' |
'Matching' | 'Ordering' | 'short' | 'essay'`. `QuizQuestion` (`types.ts:3016`)
  documents `correctAnswer` per-type and carries type-specific optional fields
  (`matchingDistractors`, `maxWords`). A `'Speak'` type fits this shape.
- **Per-type grading divergence already exists** — `isWrittenQuestionType()`
  (`types.ts:3012`) is the precedent for "this type does not use the standard
  auto-grader."
- **Per-assignment teacher settings** — `QuizAssignmentSettings`
  (`types.ts:3980`) already carries `attemptLimit`, `dueAt`, `sessionOptions`,
  and is surfaced by the existing assignment settings modal.
- **Sub-widget feature gating** — `GlobalFeature` (`types.ts:6341`) +
  `global_permissions/{featureId}`, resolved in `AuthContext.tsx:2464`, with
  `accessLevel: 'beta'` + `betaUsers[]` for per-user visibility, plus
  `buildings[]` and `minTier`. Defaults are declared in
  `config/featureDefaults.ts` (typed `Record<GlobalFeature, …>`, so the compiler
  refuses a new union member without an entry).
- **Precedent for a gated, quota-limited audio AI feature** —
  `transcribeVideoWithGemini` (`functions/src/aiGeneration.ts:1762`): `onCall`,
  1GiB / 300s, gated on `global_permissions/video-activity-audio-transcription`,
  independent daily limit carried in the permission doc's `config` blob,
  disabled by default.
- **No student-side audio capture exists today.** The only `MediaRecorder`
  usage is `hooks/useScreenRecord.ts` and GuidedLearning's `ScreenCaptureModal`
  — both teacher-side screen capture. Student mic capture is net-new.
- **`assignment-modes` is not the graded/ungraded toggle.** It is
  `'submissions' | 'view-only'` (`utils/assignmentModesConfig.ts`), set
  org-wide by an admin per widget key.

---

## 3. Decision map

| #      | Decision                                             | Status                                  |
| ------ | ---------------------------------------------------- | --------------------------------------- |
| **D1** | Where does acoustic (audio → phoneme) inference run? | **BLOCKING** — spike built, not yet run |
| D2     | Student voice data: privacy, retention, COPPA        | Blocked by D1                           |
| D3     | Gate granularity                                     | **Resolved**                            |
| D4     | `'Speak'` question type vs separate activity type    | Open                                    |
| D5     | G2P language scope and sequencing                    | Largely resolved by findings in §5      |
| D6     | Does a pronunciation score reach the gradebook?      | **Resolved**                            |
| D7     | 30 students recording concurrently                   | Open, depends on D1                     |

---

## 4. D1 — the blocking decision

### The question

A pronunciation scorer must report what the student **actually said**. An LLM
that is told the target text knows what the word is _supposed_ to sound like,
and may normalize toward it — silently erasing the exact errors the feature
exists to catch. The failure is invisible in casual testing: a biased scorer
tells nearly every student "great job."

This matters because the codebase's instinct points one way and the spec points
the other. `transcribeVideoWithGemini` is already the shape of "gated,
quota-limited, server-side Gemini audio feature" — the path of least
resistance. The spec instead calls for a client-side CTC phoneme model,
which is chosen precisely because it is a _dumb_ listener: it reports
frame-by-frame acoustics with no notion of the expected answer.

### Options

| Option                     | Upside                                                                                      | Cost / risk                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Client-side CTC** (spec) | Unbiased listener; voice never leaves device (collapses D2); no per-use cost; works offline | 80–150MB first load per device; new dependency; Chromebook + school-wifi risk                   |
| **Server-side Gemini**     | Matches existing precedent exactly; no new deps; reuses quota/gating machinery              | Likely target-bias (unproven); per-use cost; voice leaves device (D2 becomes heavy)             |
| **Hybrid**                 | Degrades gracefully on low-spec devices                                                     | Two scoring paths that must agree, or identical speech scores differently on different hardware |

### The spike (built, awaiting an API key)

`bias-probe.mjs` — see §8 for status. Design avoids needing a phonetician by
holding the **audio constant** and varying only the **claimed target**. Ground
truth is irrelevant: if reported phonemes move when only the prompt moves, that
shift _is_ the bias.

|       | Audio            | Told target | Honest answer                   |
| ----- | ---------------- | ----------- | ------------------------------- |
| A     | trill (`perro`)  | "perro"     | `r`                             |
| **B** | **tap (`pero`)** | **"perro"** | `ɾ` — reporting `r` proves bias |
| C     | tap (`pero`)     | "pero"      | `ɾ`                             |
| D     | tap (`pero`)     | _nothing_   | `ɾ`                             |

**Verdict rule:** compare B against D — identical bytes, one primed to expect a
trill, one unprimed. If B reports `/r/` where D reports `/ɾ/`, the model is
answering from the prompt rather than the waveform, and the server-side path is
disqualified. Each condition runs 5× so a single sample cannot be mistaken for
a trend.

**Caveat, load-bearing:** the clips are espeak-ng synthesis, not real learner
speech. The tap/trill contrast is unambiguously clean, which makes this a
_conservative_ test — a model that fails here certainly fails on messy
classroom audio. **A pass is necessary but not sufficient**; re-run with real
learner recordings, and add German final-devoicing and Mandarin tone contrasts,
before trusting the server-side path.

---

## 5. D5 — G2P findings (espeak-ng evaluation)

espeak-ng 1.51 was installed and tested directly against the spec's own cited
examples. It reproduces most of the proposed G2P layer:

| Language     | Result                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spanish**  | `pero` → `pˈeɾo` vs `perro` → `pˈero` — the exact tap/trill contrast the spec's worked example depends on. Also `ch`→`tʃ`, `ll`→`ʎ`, `qu`→`k`, silent `h`, soft/hard `c`/`g`.                     |
| **German**   | `Tag` → `tˈɑːk` (final devoicing, as specced); `Bach` → `bˈax` vs `ich` → `ˈɪç` (the ach/ich split the "Exact" tier needs); `Stein` → `ʃtˈaɪn`; `Häuser` → `hˈɔøzɜ`.                              |
| **English**  | `rough` → `ɹˈʌf` and `through` → `θɹˈuː` — _both_ spec examples, correct, **without CMUDict or a fallback neural G2P**. That is an entire subsystem the spec budgets for that may be unnecessary. |
| **Mandarin** | **Broken.** `马` → `(en)ma5θɹˈiː5(cmn)`; garbage via both hanzi and pinyin. The bundled voice is named "Chinese\_(Mandarin,\_latin_as_English)".                                                  |

### Two findings that change the spec

**1. Dialect is a required field, not a constant.** `cielo` → `θjˈelo` under
`es` (Castilian) but `sjˈelo` under `es-419` (Latin American seseo). Shipping
one default means marking Spanish-speaking students **wrong for pronouncing
correctly**. Dialect must be teacher-selectable per question or per assignment.
The spec's flat `languageCode: 'es'` is insufficient.

**2. espeak-ng is GPL-3.** Bundling a WASM build into the client bundle is a
genuine copyleft problem for a proprietary application. Invoking the binary
server-side from a Cloud Function is a materially different situation, since
GPLv3 is not AGPL. **This needs a real legal read, not an engineering guess** —
and note it cuts _against_ the client-side path that D1 may otherwise force.
Alternative: use espeak-ng output only as _reference data_ to build and validate
independently-written rule tables (Spanish and German are genuinely rule-based
and small; this is the tractable path).

**Recommended sequencing:** Spanish → German → English → Mandarin, with
Mandarin scoped as its own project. Its tone contours have no espeak-ng path
here and represent a second acoustic problem (pitch contour), not a second
vocabulary.

---

## 6. Resolved decisions

### D3 — gate granularity → `GlobalFeature`

Use a new `GlobalFeature` member (e.g. `'pronunciation-practice'`) with a
`config/featureDefaults.ts` entry using `missingDocPublic: false`. Shipping the
code should not light the feature up for everyone.

Widget-level `FeaturePermission` is the **wrong** tool: it is keyed by
`WidgetType` and would hide the entire quiz widget from everyone not on the
list. The `GlobalFeature` path gates a feature _inside_ a widget, which is the
actual requirement, and `betaUsers[]` is literally the "specific users" control
requested. `video-activity-audio-transcription` is the closest precedent.

### D6 — graded vs ungraded → teacher-selectable per assignment

Per the product decision: the teacher chooses at assignment time. This belongs
as an additive field on `QuizAssignmentSettings` (`types.ts:3980`), alongside
`attemptLimit` and `dueAt`, surfaced in the existing assignment settings modal.
No new infrastructure.

Interaction to resolve during implementation: when ungraded, spoken items must
be excluded from `quizMaxPoints` and suppressed from Schoology / Google
Classroom grade push (`utils/publishGradePush.ts`,
`utils/runClassroomGradePush.ts`), rather than pushed as zero.

---

## 7. Open decisions

**D2 — voice data.** Recording minors' voices raises retention, consent, and
third-party-transfer questions. Largely collapses if D1 lands client-side and
audio never leaves the device. If server-side: where does audio live (Storage?
ephemeral?), for how long, and is it covered by existing district agreements?
Needs a non-engineering review.

**D4 — `'Speak'` question type vs separate activity.** Adding to
`QuizQuestionType` inherits assignment, roster targeting, grade push, and PLC
sharing for free, but touches every exhaustive `switch` over the union
(`utils/quizShuffle.ts`, `utils/quizMaxPoints.ts`, `hooks/useQuizSession.ts`,
student renderers). A separate activity type isolates the blast radius but
duplicates all that machinery. Lean: extend the union — the compiler will
enumerate the work.

**D7 — concurrency.** 30 students recording simultaneously. Client-side: 30
parallel model downloads on one AP is the risk, and caching behavior across
managed Chromebook profiles needs testing. Server-side: 30 concurrent 1GiB
function invocations plus per-use cost is the risk. Cannot be resolved before
D1.

---

## 8. Spike status

Built and syntax-verified, **not yet run** — this container has no
`GEMINI_API_KEY`. The key lives in Secret Manager via Firebase `defineSecret`
(`functions/src/secrets.ts`, consumed at `aiGeneration.ts:548`) and is only
materialized inside deployed functions; the container has no gcloud, no ADC,
and no firebase login.

**To run it:** set `GEMINI_API_KEY` in the Claude Code environment settings
(not in chat — it would be persisted in the transcript). Environment variable
changes apply to **new** sessions. Then:

```
GEMINI_API_KEY=... node bias-probe.mjs --runs 5
```

Artifacts currently live in the session scratchpad, not in the repo:

- `bias-probe.mjs` — the four-condition harness, with verdict logic
- `audio/perro_trill.wav` — espeak-ng `es-419`, correct trilled `perro`
- `audio/perro_tap.wav` — espeak-ng `es-419`, untrilled `pero` (the L1-English error)

Regenerate the clips with:

```
espeak-ng -v es-419 -s 130 -w perro_trill.wav "perro"
espeak-ng -v es-419 -s 130 -w perro_tap.wav   "pero"
```

---

## 9. What is safe to build before D1 resolves

None of this is invalidated by either D1 outcome:

1. **`PhonemeAlignmentEngine`** — Levenshtein alignment, backtrace, PER and
   accuracy scoring. A pure function with zero dependencies, identical whether
   phonemes arrive from a CTC model or an API. Fully unit-testable today,
   including the spec's own `El perro` worked example.
2. **Spanish and German G2P rule tables**, plus the dialect field from §5.
3. **Type surface** — `'Speak'` on `QuizQuestionType`, the graded/ungraded flag
   on `QuizAssignmentSettings`, the `GlobalFeature` member and its
   `FEATURE_DEFAULTS` entry.

The acoustic layer should sit behind a single-method interface
(`recognize(audio, languageCode) → phonemes[]`) so D1 swaps an implementation
rather than a design.

---

## 10. Next actions

1. Set `GEMINI_API_KEY` in environment settings; start a fresh session.
2. Run the bias probe; record the verdict in §4.
3. Resolve D1, which unblocks D2 and D7.
4. Get a legal read on the espeak-ng GPL-3 question (§5) if any espeak-derived
   code is to be shipped rather than used as reference data.
5. Begin §9 in parallel at any time.
