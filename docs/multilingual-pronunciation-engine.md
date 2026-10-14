# Pronunciation Questions — Plan

**Status:** Live plan. Refreshed and grilled 2026-10-13 (decisions G1–G22 in §5). No feature code exists.
**Owner:** Paul (OPS-PIvers) + Claude
**Tickets:** [Wayfinder Map #2331](https://github.com/OPS-PIvers/SpartBoard/issues/2331)
(29 sub-issues, 11 closed). The map body was last edited 2026-08-04 and predates
everything in §3. Until it is refreshed, **this doc is the up-to-date picture** and
the tickets hold the detailed evidence.
**Scoring contracts (authoritative over the spec):** `scripts/spikes/*/DECISIONS.md`:
`alignment-engine` (A1–A13), `stress-detection` (S1–S5), `stress-reference`
(R1–R5), `token-runs` (T1–T5).
**Source spec:** [`multilingual-pronunciation-engine-spec.md`](multilingual-pronunciation-engine-spec.md)
is the original proposal, kept as written. Where the two disagree, this doc wins.

A quiz item where the student **says** a known word and gets scored on
the sounds they actually produced. The result is a sound-by-sound breakdown
(correct / substituted / omitted / inserted / held), a stress check and an
accuracy score. It is for world-language and EL teachers and is invisible to
everyone else.

---

## 1. Goals & non-goals

**Goals**

- A quiz item whose answer is spoken and is **auto-scored**, without waiting on the teacher.
- Diagnostic output: the teacher sees _which sound_ went wrong, not just a percentage.
- The student gets N attempts, with an example, to say it correctly for credit (G5–G6).
- Hidden from staff who don't teach language.

**Non-goals**

- Fluency, rhythm and intonation. **Lexical stress is in scope** (A1, #2359); prosody beyond it is not.
- Open-ended speech. The target text is always known.
- Mandarin. Tone is a second acoustic problem; it comes back as its own effort.
- Replacing teacher judgment. The scorer has known blind spots (§4.4), so the teacher needs a way to override it.
- Voiceprints, speaker identification or any biometric template (RR-04, `docs/rich-response-wayfinder.md:1011`).

---

## 2. What is settled (August 2026 tickets)

| #      | Decision                   | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ticket                                                                                                                       |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Where recognition runs     | **On the student's device**, using a CTC phoneme model through `onnxruntime-web`. Server-side and hybrid are closed. The deciding reason was the rule "voice stays on the device", not bias: Gemini passed the bias probe (§4.1). Reference phonemes are computed **on the server when the teacher saves the question** and stored on the question. The interface is `recognize(audio: Blob, dialect) → phonemes[]` plus `state: ready \| downloading \| unsupported`. | [#2333](https://github.com/OPS-PIvers/SpartBoard/issues/2333)                                                                |
| —      | Model                      | `facebook/wav2vec2-xlsr-53-espeak-cv-ft`, from the `qnighy` ONNX export, pinned to **q4 (241 MB)**. It has 392 espeak-IPA tokens and no stress marks. Call `Wav2Vec2ForCTC` directly, never `pipeline()`, which discards frame timing.                                                                                                                                                                                                                                 | [#2349](https://github.com/OPS-PIvers/SpartBoard/issues/2349)                                                                |
| D2     | Voice data                 | Collapsed by D1, then reopened by §3.1. **Superseded by G9–G11.**                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                            |
| D3     | Gate                       | A `GlobalFeature`, not a widget permission.                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                            |
| **D4** | Type surface               | `'Speak'` as a new `QuizQuestionType`. The student's device writes the recognized phoneme string into `answer`. `gradeAnswer()` recomputes the score from it, so no score is stored. The question gains `referencePhonemes`, `phonemesConfirmed` and `g2pVersion`. The pass mark is a global default that an assignment can override. **Type kept (G2); pass mark is per question instead (G7).**                                                                      | [#2334](https://github.com/OPS-PIvers/SpartBoard/issues/2334)                                                                |
| D5     | Languages                  | Spanish, German and English. Mandarin is out.                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                            |
| —      | English reference phonemes | espeak-derived rules, with CMUDict as a cross-check. When they disagree, a teacher-review flag is raised; that happens on 5.9% of items. No neural fallback.                                                                                                                                                                                                                                                                                                           | [#2336](https://github.com/OPS-PIvers/SpartBoard/issues/2336)                                                                |
| D6     | Graded or not              | **Dropped.** Points work like any other question (G6).                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                            |
| —      | Alignment & scoring        | A1–A13: insertions get real entries; PER is internal and unclamped; an unknown level or an empty reference throws; ties go to substitution; the engine returns no prose; `score = round((1−w)·segment + w·stress)`.                                                                                                                                                                                                                                                    | [#2335](https://github.com/OPS-PIvers/SpartBoard/issues/2335)                                                                |
| —      | Held sounds                | T1–T3: an insertion that repeats the neighbouring recognized token costs 0 and gets the status `held`. A held trill no longer reads as an error.                                                                                                                                                                                                                                                                                                                       | [#2380](https://github.com/OPS-PIvers/SpartBoard/issues/2380)                                                                |
| —      | Stress                     | S1–S5: one syllable index per word, scored 100 or 0, from four cues within the word. The pitch library is `pitchy` (MIT). R1–R5: two reference sources per language; a disagreement is flagged and not stress-scored until the teacher confirms it. German has one source, an accepted weakening.                                                                                                                                                                      | [#2359](https://github.com/OPS-PIvers/SpartBoard/issues/2359), [#2360](https://github.com/OPS-PIvers/SpartBoard/issues/2360) |

**Spike code lags its own decisions.** `alignment-engine/engine.ts` still has four
statuses and the old `StressInput`; `held` and T1 exist only in prose. Feature code
follows the `DECISIONS.md` files, not `engine.ts`.

---

## 3. What changed since August (and what it reopens)

### 3.1 Student audio capture shipped, through a different door

Rich response (`quiz-media-response`, `docs/plans/shipped/rich-response/`) shipped
student recording on quiz questions:

- **Capture:** `hooks/useAudioRecording.ts`, with prep, takes and review, in `components/quiz/recording/`.
- **Consent:** the Minnesota Tennessen notice, `RecordingConsentNotice.tsx`, stored as `noticeAckedAt`. Its test asserts the notice **does not mention AI**.
- **Upload:** to `quiz_response_media/…` (5 MB, `audio/*`).
- **Archive:** `archiveQuizMediaArtifact` transcodes to M4A and stores it in the **teacher's Drive** under the student's name.
- **Playback** for teacher and student, plus an org-admin delete tool. An end-of-year retention sweep is not built.
- **Firestore:** `QuizResponseAnswer.artifacts[]`, `takeIndex`, `unresponded`, server-owned `artifactArchive`, and grades keyed `qid` / `qid::addendum`.

So D1's premise that "the voice never leaves the device" is now a **choice**, not
a property of the platform. The district has already accepted recordings of
student voices stored in teacher Drive, with notice. That reopens D2 as a
product question, answered by G9–G11.

### 3.2 Response modes became something a question carries, not a type

Rich response decided (RR-01) that audio is a mode that rides on a question:
`QuizQuestion.recording?: RecordingConfig`. It is not a new type, and the union
deliberately did not grow. A **teacher-graded** spoken item already exists today,
as `free-response` + `recording`. D4's "seventh type" was decided before that
precedent existed. It was kept anyway (G2).

### 3.3 Codebase drift: every §2 anchor of the old doc moved

| Old claim                                | Now                                                                                                                                                                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QuizQuestionType` with `short`/`essay`  | `types.ts:4064`: `'MC' \| 'FIB' \| 'Matching' \| 'Ordering' \| 'MA' \| 'free-response'`                                                                                                                                                             |
| `isWrittenQuestionType()`                | Now `isFreeResponseType()` (`types.ts:4068`). Plus a slot layer: `questionNeedsManualGrading` (`utils/quizScoreOnSubmit.ts:23`, server mirror at `functions/src/quizScoreOnSubmit.ts:66`) and `slotNeedsManualGrading` (`utils/mediaGrading.ts:66`) |
| Grade states                             | `GradeResult.state: 'scored' \| 'awaiting-grade' \| 'not-attempted'`, plus `excused` (`types.ts:4453`)                                                                                                                                              |
| `QuizAssignmentSettings` at :3980        | `types.ts:6446`. Still **no graded/ungraded flag**. The nearest equivalents are a per-slot `excused` (kept out of the gradebook and both LMS pushes) and `workKind: 'resource'`                                                                     |
| `GlobalFeature` / `canAccessFeature`     | `types.ts:9801` / `context/AuthContext.tsx:3155`. Template: the `quiz-media-response` entry in `config/featureDefaults.ts:391` (`stage: 'preview'`, `failClosedForAdmins`). New ids also go in `functions/src/featureMissingDoc.ts`                 |
| `transcribeVideoWithGemini` as precedent | Moot: there is no server inference. Every AI call now goes through `generateAi` (`functions/src/aiRouter.ts`), and the Claude path cannot read audio                                                                                                |
| Language                                 | `QuizData.language` (BCP-47, quiz-level, picks the read-aloud voice: `en-US`, `es-US`, `de-DE`, …) already exists. There is **no per-question language**. Flashcards have `termLanguage`/`definitionLanguage`                                       |
| New runtime dependency                   | `onnxruntime-web@1.21.0` is **already in the lockfile**, pulled in by `@imgly/background-removal`. transformers.js is not                                                                                                                           |
| Grade push files                         | Per-student builders: `utils/classroomGradePush.ts:78`, `utils/ltiGradePush.ts`, `utils/schoologyToolColumns.ts`, `functions/src/gradebookCore.ts`                                                                                                  |
| Claude connector                         | `functions/src/mcp/quizStore.ts` / `quizTools.ts` map the six types. A new type, or new fields, needs a decision on whether the connector can author it                                                                                             |

Also new since August: the dev Firebase project (`spartboard-dev`) and the
"behind a flag, on for Paul first" release rule. Read-aloud TTS shipped too, so a
"hear it first" model pronunciation is now available.

### 3.4 Stale lines in the old doc, now corrected

- D1 and D4 are not open.
- §5 claimed English needs no dictionary. espeak resolves 22.9% of the top 1,000 words from its own exception dictionary.
- The GPL concern no longer "cuts against client-side". Only the server-side subprocess question remains (#2337).
- The first-load size is 241 MB, not 80–150 MB.
- The statuses are now five, not three.

---

## 4. Evidence on hand (spikes, all run August 2026)

### 4.1 Bias probe

`pronunciation-bias-probe/`, #2332 / #2344.

- Gemini `3.5-flash-lite` showed **no bias toward the target**, and the tap error was caught 20/20.
- But once the prompt names Spanish it **never reports English `ɹ` (0/40)**, and it falsely passes `ɹ` as a trill 15% of the time.
- Not used, since D1 went on-device. It is still the fallback if on-device proves infeasible.

### 4.2 Retroflex screen

`retroflex-confusion/`, #2355. This is the only decode of real audio by the chosen model: CPU onnxruntime, n=1 per clip, one adult speaker.

- `ɹ` survives every quantization at about 0.79 posterior, so per-sound diagnostics work.
- **A correct Spanish tap reads as a trill** (#2379, open), and model confidence cannot tell that error apart from a correct answer.
- A held trill reads as `rr`, which led to T1.

### 4.3 English reference phonemes and stress

`english-g2p-probe/`, `stress-reference/`.

| Language | Result                                               |
| -------- | ---------------------------------------------------- |
| English  | espeak scores 94.1% / 97.1% on a K-12 word list      |
| Spanish  | Stress from spelling rules agrees with espeak 99.65% |
| German   | Stress rule tops out at about 81–86%                 |

### 4.4 What has never been tested

- **Learner speech**: no child and no L2 speaker has been decoded.
- **Stress cue weights against real audio** (#2366).
- **German contrasts in audio**: final devoicing and ü.

The thresholds of 60/80/95 for Loose/Close/Exact are still the spec author's
guess (#2342).

### 4.5 Chromebook runtime (#2350, measured 2026-10-14)

`/pronunciation-dev` on a district Chromebook (ChromeOS 14541, Chrome 151, 8 cores, 4 GB), q4 model, `onnxruntime-web` 1.30, single thread (the site is not cross-origin isolated).

| Measure                       | Result                                                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| First download (241 MB)       | 14.7 s, then 4.7 s to start the session                                |
| Reopen from Cache Storage     | 2.1 s read + 1.5 s session                                             |
| JS heap after load            | about 270 MB                                                           |
| CPU (WASM) decode, 0.7–0.85 s | 4.2–4.9 s per clip, about 6× real time; warm is no faster              |
| CPU decode, 2.8 s mic take    | 12.5 s (untrimmed; reads `perro`)                                      |
| Agreement with Python q4      | 9 of 10 decodes; trill 3 reads `pero` for `perro`, same score under T1 |
| WebGPU                        | Session loads, then the first decode never returns                     |

The likely cause of the trill 3 difference is the browser resampling the 22.05 kHz clips differently from Python.

**Decision (Paul, 2026-10-14): pass for single words.**

- Scoring runs on the CPU in a Web Worker, so the page never freezes during the 4–5 s decode. The student sees a "Checking…" state.
- Silence is trimmed before decoding (`trimSilence`).
- Long takes and slow devices fall back to G17 (score later).
- WebGPU is off for the q4 file. An fp16/fp32 export on WebGPU, or threads via cross-origin isolation on the student routes, is a later option for phrases.

---

## 5. Product decisions (grill with Paul, 2026-10-13)

These supersede D2, D4 (in part) and D6 in §2. G-numbers are cited from code and tickets.

### The item

- **G1 — Scope.** Spanish, German and English in v1. **One word per item** (narrowed 2026-10-14 by the Chromebook result in §4.5). Short phrases wait for a faster runtime path.
- **G2 — Type.** A new `'speak'` member of `QuizQuestionType`, which keeps D4. It reuses the shipped recording pieces (`useAudioRecording`, `AudioResponseCapture`, the consent notice). A speak item is a third grading category, auto-scored on the device. It is **not** added to `isFreeResponseType` or `questionNeedsManualGrading`.
- **G3 — Language.** Each item stores its own dialect set, prefilled from the quiz's `QuizData.language`. So a copied or banked item keeps its language.
- **G4 — Dialects.** Each item stores reference phonemes for **every accepted dialect**, and the student is scored against the closest one.
  - Defaults: Spanish `es-419` + `es-ES`, German `de-DE`, English `en-US`.
  - The teacher can untick a dialect to require one.
  - This settles #2338 and the dialect half of #2342.

### Attempts and credit

- **G5 — Attempts.** "Say it correctly within N attempts, with an example."
  - N is set per question, 1–10, default 3. It is separate from rich response's `takeLimit`.
  - Every attempt is scored on the device and shown at once, so there is no "show result" switch.
- **G6 — Credit.** The first attempt that clears the strictness mark ends the item with full points. If no attempt clears it, the item gets `points × best accuracy`.
  - There is no practice/0-point mode and no assignment-level graded toggle; D6 is dropped. Points work like any other question.
  - This settles #2340. Today's editor clamps points to at least 1, and the student projection drops a 0, so neither needs to change.
- **G7 — Strictness.** Loose, Close or Exact per question, default Close.
  - The 60/80/95 marks are admin-tunable globals.
  - **Stress counts from v1** at `w` = 10–15%, which is also admin-tunable. This is Paul's call: it accepts that the cue weights are unvalidated (#2366).
- **G8 — Example.** By default the example is read-aloud TTS in the item's dialect.
  - The teacher may record their own example in the editor, stored with the quiz, and it replaces the TTS.
  - The teacher can turn the example off per item, for assessment.

### Recording, privacy and validation

- **G9 — Recording kept.** Scoring happens on the device, but **only the deciding attempt** is archived through the shipped pipeline to teacher Drive: the passing attempt, or the best one if none passed.
  - Each attempt's score and the attempt count are stored as data.
  - D2 is now answered by the rich-response posture: Tennessen notice, teacher Drive, admin delete, no voiceprints.
- **G10 — Notice.** Speak items get their own purpose line in the existing four-part notice, roughly: "Your device listens to your recording and checks each sound. The recording is also saved so your teacher can listen and change the score."
  - The test that asserts the notice never mentions AI is relaxed for this one variant only.
- **G11 — Validation.** Student recordings are **never** used to tune the scorer, because their stated purpose is grading. Before the flag opens beyond admins, two things are needed:
  - a consented corpus of 10–15 adult L2 speakers covering es, de and en (Route B, #2352);
  - the teacher-override rate measured during the admin-only period.

### Teacher side

- **G12 — Override.** The teacher sets the item score in the existing grading slot (`QuizResponse.grading[qid]`), and a teacher score always wins.
  - A **reason is required**, and overrides are logged per sound as calibration data for #2379 and #2342.
  - The auto score stays visible next to the teacher's.
- **G13 — Results (#2362).** Per student per item: the deciding audio, letter highlights, attempts used, the auto score and any override. Plus a **class "sounds most often missed"** view built from the stored alignments.
- **G14 — Tampering.** The server flags an item, so the teacher can listen, when:
  - the archived recording is missing;
  - its duration is implausible for the target length;
  - the reported phonemes equal the reference byte-for-byte on every item.

  Server-side re-scoring is out, because D1 rules out server inference.

- **G15 — Authoring (#2341).**
  - A "Hear it" button plays the example; flagged words show inline with a picker; IPA and stress sit in an **Advanced** panel.
  - The Claude connector can create speak items: it sets text, dialect set, strictness, N and points. Phoneme lookup runs server-side on save, the same as in the editor, and flagged words wait for teacher confirmation in SpartBoard.

### Student side

- **G16 — Feedback display (#2351).** Each sound is mapped back to the target text's letters and marked correct, changed, missed or extra.
  - Marks differ by shape and label, not colour alone (WCAG AA).
  - Tapping a marked letter shows a plain hint in the UI language from the sound-name table (#2361). There is no IPA for students.
- **G17 — Unsupported device.** The student still records and submits, and the item reads "awaiting score". It is scored later on a capable device, either the student's or the teacher's (decoded from the Drive M4A). Failing that, the teacher grades it by ear. No student is ever blocked from submitting.

### Platform

- **G18 — Model hosting.** The pinned q4 file is self-hosted on our own Firebase Hosting or Storage with immutable cache headers, and kept in Cache Storage after the first load. Two reasons:
  - school filters often block huggingface.co;
  - the CDN sits outside our vendor agreements.

  Confirm the model's licence allows redistribution before shipping.

- **G19 — espeak licence (#2337).** espeak-ng runs **server-side** in the save-time phoneme-lookup callable, and only its IPA output is stored. Build with it on dev. A short brief goes to district counsel, and the flag stays admin-only until they confirm. Spanish uses in-house spelling rules regardless.
- **G20 — Gate.** A new `GlobalFeature` `'quiz-speak-questions'`:
  - `stage: 'preview'`, `afterLaunch: 'keep'`, `widget: 'quiz'`, `group: 'questions'`;
  - admin default, `missingDocPublic: false`, `failClosedForAdmins: true`;
  - `requires: 'quiz-media-response'`.

  Named language/EL teachers get it through `betaUsers`.

- **G21 — AI rule.** On-device models are a documented exception to "every AI call goes through `generateAi`". `docs/AI_MODELS.md` and `CLAUDE.md` gain a short section: pinned files served from our hosting, listed in config with version and licence.
- **G22 — Shared engine.** The engine lives in `utils/pronunciation/` and knows nothing about quizzes. The phoneme-lookup callable is generic too. Flashcards' Speak mode follows quiz v1 behind its own flag.

---

## 6. Build order

1. **Gate: Chromebook measurement (#2350). Passed for single words, 2026-10-14 (§4.5).** CPU only, in a Web Worker, with silence trimming.
2. **In parallel with step 1** (these survive either outcome):
   - ~~port the scoring engine (A1–A13, T1–T5 `held`, S1–S5) out of `scripts/spikes` into `utils/pronunciation/`, with its tests~~ — done 2026-10-14: `score.ts`, `stress.ts` (now with in-house energy and pitch measurement), see the notes below;
   - ~~write the espeak→392-token symbol tokenizer (#2383)~~ — done 2026-10-14: `tokenizeIpa.ts`, see the notes below;
   - send the counsel brief (G19).

   **Engine port notes (2026-10-14).** These settle points the spikes left open; Paul can reverse any of them.
   - **T1 is charged once per run.** An extra token is free only when it repeats the recognized token _before_ it. So `p o` heard as `p r r o` scores one insertion plus one `held`. Under the literal "either neighbour" wording, both `r`s would be free.
   - **A held vowel is one syllable for stress.** A `held` repeat extends the nucleus before it. Without this, a long stressed vowel would split into two half-length syllables and lose the ranking. A doubled vowel that the reference also doubles (_ehemann_) stays two syllables, as T4 requires.
   - **The tokenizer picks the fewest tokens for the whole string, and no token may span a stress mark.** Run on 34,000 espeak words (es/de/en top lists), it found:
     - no word it couldn't tokenize, so no stranded length marks;
     - every polysyllabic word got its primary stress.
   - **The #2383 failure contract.** Failure returns no tokens at all, so nothing partial can be stored:
     - espeak's `?` gives `unrenderable`, with no reference (116 of 12,000 German words, mirroring R1b);
     - a string with no valid tokenization gives `untokenizable`, naming where it stopped;
     - `(en)…(de)` spans keep the English phonemes and return `languageSwitches: ['en']`, which the editor shows for teacher confirmation (G15). That was 136 German words.
   - **The vocab holds a `??` token**, so the model was trained on espeak's `?` and may emit it for German UR. The tokenizer still refuses `?` for now. Scoring those words is possible later, once a decode shows what the model emits for _durch_.
   - The tokenizer lives in `utils/pronunciation/` so the editor's Advanced IPA field can validate input. The step 3 callable gets a mirror, as `functions/src/flashcardMatch.ts` does.

3. The phoneme-lookup callable: espeak with the dialect set, the CMUDict cross-check, and the stress references from R1–R5.
4. The `'speak'` type, the editor (G15), student capture and attempts (G5, G16, G17), archiving the deciding attempt (G9), and the notice variant (G10). All behind `quiz-speak-questions`.
5. Results, override and the class summary (G12–G14), plus connector support (G15).
6. Before the flag opens: the adult L2 corpus and the override-rate review (G11), and counsel sign-off (G19).

---

## 7. Spike inventory

| Spike                       | Ticket | Status                                                         |
| --------------------------- | ------ | -------------------------------------------------------------- |
| `pronunciation-bias-probe/` | #2332  | Run; can be deleted per its README once D1 is recorded (it is) |
| `alignment-engine/`         | #2335  | Accepted; code lags T1–T5                                      |
| `english-g2p-probe/`        | #2336  | Run (Python harness)                                           |
| `retroflex-confusion/`      | #2355  | Run; browser check owed                                        |
| `stress-detection/`         | #2359  | Accepted; cue weights untested                                 |
| `stress-reference/`         | #2360  | Accepted                                                       |
| `token-runs/`               | #2380  | Accepted; no code                                              |

The three TypeScript spikes run under `pnpm test`, because `vitest.config.ts` does
not exclude `scripts/spikes`.
