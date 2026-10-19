# Pronunciation Practice — Plan

**Status:** Live plan, **paused 2026-10-14** (Paul is wrapping up other work). Grilled 2026-10-13 (decisions G1–G22 in §5.2). **Redirected 2026-10-19:** the first surface is a Flashcards **Speak** practice mode, not a quiz question type (decisions F1–F15 in §5.1). The quiz `'speak'` type is deferred until the scorer has classroom evidence. The engine exists in `utils/pronunciation/`, but nothing user-facing does.

**Where we are (2026-10-19):**

- **Done:**
  - the grill (G1–G22), and the Flashcards redirect (F1–F15);
  - the Chromebook gate: **passed for single words**, CPU only (§4.5, #2350);
  - the scoring engine, stress detection and espeak tokenizer, ported with tests (§6 step 2, `991ce03`);
  - the `/pronunciation-dev` test page, now with silence trimming.
- **Waiting on Paul:**
  - the counsel brief on espeak's licence (G19);
  - a yes or no on the five calls recorded under §6 step 2 (T1 per run, a held vowel as one syllable, the tokenizer's search rule, its failure contract, and `(en)` handling).
- **Open checks:** none of these block step 3.
  - Decode one German _durch_/_wurde_ clip to see whether the model emits its `??` token (§6 step 2 notes).
  - The stress cue weights (#2366) and the 60/80/95 marks (#2342) are still guesses.
- **Next, when resumed:** either step 3, the phoneme-lookup callable (§6), or the Web Worker decode in `TODO.md` (small, and needed before any student sees Speak mode). Neither depends on the other. Both are unchanged by the redirect.
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

A Flashcards study mode where the student **says** a card's term and gets
scored on the sounds they actually produced. The result is a sound-by-sound
breakdown (correct / substituted / omitted / inserted / held), a stress check
and an accuracy score. Scoring runs on the student's device and the audio
never leaves it. What is kept is per-card pronunciation mastery and a tally of
missed sounds, which the teacher sees in Study results. It is for
world-language and EL teachers and is invisible to everyone else.

---

## 1. Goals & non-goals

**Goals**

- Spoken practice on a flashcard set, **auto-scored on the device**, with an example and immediate per-sound feedback.
- Per-student, per-card **pronunciation mastery**, tracked with the same spaced streak as recall, and visible to the teacher in Study results.
- Diagnostic output: the teacher sees _which sounds_ a student and the class miss, not just a percentage.
- No student recording is uploaded or stored (F3).
- Hidden from staff who don't teach language.

**Non-goals**

- Grading. Speak mastery never reaches Check, Publish scores or a gradebook push (F9). Graded spoken items are the deferred quiz type (§5.2).
- Fluency, rhythm and intonation. **Lexical stress is in scope** (A1, #2359); prosody beyond it is not.
- Open-ended speech. The target text is always known.
- Mandarin. Tone is a second acoustic problem; it comes back as its own effort.
- Mastery across assignments or the school year. It is per assignment, like recall mastery (F14).
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

## 5. Product decisions

### 5.1 Flashcards Speak (Paul, 2026-10-19)

**Why Flashcards first.** The scorer has never decoded a child or an L2 learner,
reads a correct Spanish tap as a trill (#2379), and runs on guessed thresholds
and stress weights (§4.4). A quiz item puts that score in the gradebook.
Practice puts it in front of a student who can try again. Most of the quiz
plan's weight (G9–G14, G17) exists only because the item is graded and the
recording is the evidence. Practice needs none of it, and G1's one-word item is
already the shape of a flashcard term. The quiz type stays the route to graded
oral assessment, once practice has produced evidence about the scorer.

These supersede G2, G3, G6, G9, G10, G12–G14, G17 and G20 for v1. §5.2 lists
what carries over.

#### The mode

- **F1 — Surface.** A fourth `FlashcardMode`, `'speak'`, beside flashcards, write and test.
  - Available in self-study (public link and widget practice) and in **Study** assignments.
  - **Not in Check** for v1. A graded speak item belongs to the quiz type.
- **F2 — What is spoken.** The **term** side, in the set's `termLanguage`.
  - One word per card (G1). A card whose term is more than one word, or whose reference failed (#2383 `unrenderable` / `untokenizable`), is shown as "not available to speak" and skipped.
  - The mode is offered only when `termLanguage` is Spanish, German or English.
- **F3 — No recording is kept.** Audio is held in memory for the decode and discarded. Nothing is uploaded, archived to Drive or written to Firestore.
  - Rich response's capture pieces (`useAudioRecording`, its take/review UI) are reused for the microphone only, not its upload path or `RecordingConsentNotice`.
  - D1's "voice stays on the device" is a property of this mode again, not a choice.
  - **No consent notice** (Paul, 2026-10-19). Practice scores and sound tallies are no more sensitive than a quiz question response, so Speak mode shows no Tennessen notice.
- **F4 — Dialects and references.** The set stores its accepted dialect set (`speakDialects`), prefilled from `termLanguage` with G4's defaults. Each card stores reference phonemes per dialect, computed on set save by the step 3 callable, plus `g2pVersion` and a confirmed flag. The student is scored against the closest dialect.
- **F5 — Attempts.** Each card shown in a round allows up to N attempts (G5: 1–10, default 3, set per set and lockable per assignment). Every attempt is scored and shown at once. The card **passes the round** if an attempt clears the strictness mark; otherwise it fails the round.
- **F6 — Strictness and example.** G7 carries: Loose / Close / Exact, default Close, admin-tunable marks, stress at `w` = 10–15%. Set per set, lockable per assignment. G8's example is read-aloud TTS in the dialect, with a per-set off switch. A teacher-recorded example is deferred, since it would add teacher audio storage to a set.

#### Tracking mastery

- **F7 — Per-card speak progress.** A second per-card record beside recall, because knowing a word and saying it are different skills:
  - `FlashcardStudyState.speak?: Record<cardId, FlashcardSpeakProgress>`, where `FlashcardSpeakProgress` is the recall shape (`s`, `due`, `c`, `w`) plus `best` and `last` accuracy (0–100) and `tries` on the last round.
  - A round's pass or fail feeds `recordFlashcardAnswer` unchanged, so spacing (`ROUND_GAPS`) and the mastery rule are the same.
  - **Pronunciation mastered** = streak at or above the assignment's `masteryThreshold`, the same threshold as recall.
  - Written by the student's client to the existing progress doc (`flashcard_sessions/{id}/progress/{uid}`) or to local progress for self-study, like recall today. The progress rules gain shape and size checks for the new fields.
- **F8 — Sound tallies, not utterances.** Per student, `speakSounds?: Record<token, { n: number; m: number }>`: how often each reference sound was attempted and missed (substituted or omitted). Counted from the deciding attempt of each round only.
  - The recognized phoneme string is **never stored**. It is the nearest thing to a record of the child's speech, and the tallies give the teacher what they need.
  - The token set is the model's 392-token vocabulary, so the map is bounded.

#### Teacher side

- **F9 — Not a grade.** Speak progress is client-written and has no recording behind it, so it is an indicator. It never appears in Check scores, Publish scores, Classroom, Schoology or LTI pushes.
- **F10 — Study results.** Beside recall mastery, per student: words mastered aloud, words in progress, and their most-missed sounds (from F8, mapped to plain sound names via #2361). Per class:
  - **sounds most often missed**, summed across students (G13's class view, without audio);
  - **words the class can't pass**: a word most students fail is more likely a scorer problem than a teaching one. This is also the evidence G11 needs (F13).
  - A student who never had a working device shows "—", not 0.
  - The PLC result tally (`PlcFlashcardCardTally`) can gain speak counts later; not v1.
- **F11 — Authoring.** G15 carries, inside `FlashcardEditor`: a "Hear it" button per card, flagged references shown inline with a picker, IPA and stress in an **Advanced** panel. A flag never blocks saving; an unconfirmed card is simply not stress-scored (R1–R5). On a large set, flags are listed once at the top rather than per row. The Claude connector's flashcard tools trigger the same save-time lookup.

#### Platform

- **F12 — Unsupported device.** Speak mode is shown disabled with the reason (no microphone, model blocked or too slow to load). There is no "score later" (G17), because there is no audio to score later. The rest of the set works as today.
- **F13 — Validation before the flag opens.** G11's consented adult L2 corpus still applies. The teacher-override rate is replaced by the **class-wide per-word pass rate** from F10, reviewed during the admin-only period. Student audio is still never used to tune the scorer (there is none to use).
- **F14 — Scope of mastery.** Per assignment, like recall. Cross-assignment carry-over stays out of scope, as in `docs/plans/shipped/FLASHCARDS.md` §10. Decide before the F7 shape ships whether year-long tracking per student will be wanted, since it would want a per-student store rather than per-assignment progress.
- **F15 — Gate.** A new `GlobalFeature` `'flashcards-speak'`:
  - `stage: 'preview'`, `afterLaunch: 'keep'`, `widget: 'flashcards'`;
  - admin default, `missingDocPublic: false`, `failClosedForAdmins: true`;
  - **no** `requires: 'quiz-media-response'`, since nothing is uploaded.

  Named language/EL teachers get it through `betaUsers`. Admin path: Admin Settings > Access > Previews.

### 5.2 Quiz type decisions (grill with Paul, 2026-10-13)

These supersede D2, D4 (in part) and D6 in §2. G-numbers are cited from code and tickets.

**Status after the 2026-10-19 redirect.** The engine, platform and authoring
decisions carry into Flashcards Speak. The graded-item decisions are kept as
written for the quiz type that follows it.

| Status in Flashcards Speak          | Decisions                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Carries as written                  | G1 (one word), G4 (dialect defaults), G5 (attempts), G7 (strictness), G16 (feedback display), G18, G19, G21, G22                 |
| Carries, adapted                    | G3 → F4 (set-level, not per item), G8 → F6 (no teacher example yet), G11 → F13, G13 → F10 (no audio), G15 → F11, G20 → F15       |
| Deferred to the quiz `'speak'` type | G2 (type), G6 (credit), G9 (deciding attempt archived), G10 (notice variant), G12 (override), G14 (tampering), G17 (score later) |

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

3. The phoneme-lookup callable: espeak with the dialect set, the CMUDict cross-check, and the stress references from R1–R5. Takes a batch of terms, since a flashcard set saves up to 500 cards at once.
4. Flashcards Speak, behind `flashcards-speak` (F15):
   - set and card fields (`speakDialects`, per-card references), the save-time lookup and the editor (F4, F11);
   - the `'speak'` mode in `FlashcardPlayer`: capture, Web Worker decode, attempts and feedback (F1–F3, F5, F6, G16), and the unsupported state (F12).
5. Mastery tracking and results: `speak` progress and `speakSounds` with their progress rules (F7, F8), the Study results columns and class views (F10), and connector support (F11).
6. Before the flag opens: the adult L2 corpus and the per-word pass-rate review (F13), and counsel sign-off on espeak (G19).
7. **Later, its own decision:** the graded quiz `'speak'` type (§5.2's deferred rows), behind `quiz-speak-questions`, reusing the editor and player pieces from step 4.

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
