# Pronunciation Questions — Plan

**Status:** Live plan, refreshed 2026-10-13 after ten weeks dormant. No feature code exists.
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

A quiz item where the student **says** a known word or phrase and gets scored on
the sounds they actually produced. The result is a sound-by-sound breakdown
(correct / substituted / omitted / inserted / held), a stress check and an
accuracy score. It is for world-language and EL teachers and is invisible to
everyone else.

---

## 1. Goals & non-goals

**Goals**

- A quiz item whose answer is spoken and is **auto-scored**, without waiting on the teacher.
- Diagnostic output: the teacher sees _which sound_ went wrong, not just a percentage.
- The teacher decides whether a spoken item counts toward the grade.
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
| D2     | Voice data                 | Collapsed by D1: "no transmission, no retention". **Reopened by §3.1.**                                                                                                                                                                                                                                                                                                                                                                                                | —                                                                                                                            |
| D3     | Gate                       | A `GlobalFeature`, not a widget permission.                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                            |
| **D4** | Type surface               | `'Speak'` as a new `QuizQuestionType`. The student's device writes the recognized phoneme string into `answer`. `gradeAnswer()` recomputes the score from it, so no score is stored. The question gains `referencePhonemes`, `phonemesConfirmed` and `g2pVersion`. The pass mark is a global default that an assignment can override. **Challenged by §3.2.**                                                                                                          | [#2334](https://github.com/OPS-PIvers/SpartBoard/issues/2334)                                                                |
| D5     | Languages                  | Spanish, German and English. Mandarin is out.                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                            |
| —      | English reference phonemes | espeak-derived rules, with CMUDict as a cross-check. When they disagree, a teacher-review flag is raised; that happens on 5.9% of items. No neural fallback.                                                                                                                                                                                                                                                                                                           | [#2336](https://github.com/OPS-PIvers/SpartBoard/issues/2336)                                                                |
| D6     | Graded or not              | The teacher chooses per assignment. How that affects points and grade push is still open (#2340).                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                            |
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
product question; see Q2.

### 3.2 Response modes became something a question carries, not a type

Rich response decided (RR-01) that audio is a mode that rides on a question:
`QuizQuestion.recording?: RecordingConfig`. It is not a new type, and the union
deliberately did not grow. A **teacher-graded** spoken item already exists today,
as `free-response` + `recording`. D4's "seventh type" was decided before that
precedent existed; see Q1.

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
- **The browser runtime**: `onnxruntime-web` on a district Chromebook, covering load time, memory and inference time.
- **Any latency number at all.**
- **Stress cue weights against real audio** (#2366).
- **German contrasts in audio**: final devoicing and ü.

The thresholds of 60/80/95 for Loose/Close/Exact are still the spec author's
guess (#2342).

---

## 5. Open questions (the grill list)

Ordered so each answer unblocks the next. Ticket numbers are the existing homes.

| Q   | Question                                                                                                                                                                                                                                                                                                                                                               | Ticket          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Q0  | **Is this still worth building, and for whom first?** Who are the named teachers, which languages, what kind of practice? Is a teacher-graded "say it" item (free-response + recording, available today) already enough for some of them?                                                                                                                              | —               |
| Q1  | **New type, or an auto-scored mode on a question?** D4's `'Speak'` type, versus a `pronunciation` config that sits on a question next to `recording`. Either way it is a third grading category, auto-scored by the device rather than by string matching, that `isFreeResponseType` / `questionNeedsManualGrading` cannot express.                                    | #2334 (reopen?) |
| Q2  | **Does the recording get kept?** Device-only (D1 as decided), or also archived to the teacher's Drive through the shipped pipeline, so the teacher can listen and override a wrong score (#2379)? If kept: does the Tennessen notice need to mention automated scoring (its test forbids mentioning AI today), and how does the RR-04 "no voiceprints" statement read? | D2              |
| Q3  | **Teacher override.** When the scorer is wrong, what does the teacher do? Regrade the slot through `FreeResponseGrader`, mark a single sound correct, or excuse the item?                                                                                                                                                                                              | #2362           |
| Q4  | **Language and dialect: where do they live?** Reuse quiz-level `QuizData.language` (already BCP-47, already picks the read-aloud voice), or add a per-question override? Which dialects ship (es-419/es-US vs es-ES, de-DE, en-US)? Is the "never penalize a correct dialect" rule enforced by storing several accepted references?                                    | #2338, #2342    |
| Q5  | **GPL-3 espeak on the server.** Route a brief to counsel, or avoid espeak entirely (CMU Flite / Epitran / hand-written Spanish rules)? Spanish could ship on about 30 lines of in-house rules without espeak.                                                                                                                                                          | #2337, #2339    |
| Q6  | **Can a Chromebook carry it?** A 241 MB first load, its cache behaviour across managed profiles, 30 devices on one access point, inference time. This needs a real-hardware test before anything else is built on D1. What happens when `state: 'unsupported'`: fall back to teacher-graded recording?                                                                 | #2350, #2353    |
| Q7  | **Graded or practice.** Per-assignment toggle (D6), or reuse `excused` / `workKind: 'resource'`? How does an ungraded spoken item leave `quizMaxPoints` and the LMS pushes?                                                                                                                                                                                            | #2340           |
| Q8  | **Pass marks.** Is a Loose/Close/Exact preset per question or per assignment, and is the scale numeric or descriptive? Does v1 ship with stress weight `w = 0` until #2366 validates the cues?                                                                                                                                                                         | #2342, #2366    |
| Q9  | **Authoring.** How does the teacher check the generated phonemes: show IPA, or play it back with read-aloud TTS? How do they handle flagged heteronyms and the stress picker? Can Claude author Speak items through the connector?                                                                                                                                     | #2341           |
| Q10 | **Student experience.** One take or several (reuse `takeLimit`)? Show the result instantly or after submit? A "hear the model" button via read-aloud TTS? Which sounds' names does a student see (#2361)?                                                                                                                                                              | #2351, #2361    |
| Q11 | **Learner audio before launch.** Is a consented learner corpus (#2352) a prerequisite, or does the flag-on-for-Paul period double as the validation set?                                                                                                                                                                                                               | #2352, #2356    |
| Q12 | **Other consumers.** Does Flashcards' deferred "Speak" mode share the engine in v1 or later? Does the engine live in `utils/pronunciation/` as a client module, with the server half for reference phonemes in `functions/`?                                                                                                                                           | —               |
| Q13 | **Gate and rollout.** `GlobalFeature` id (e.g. `pronunciation-questions`), `stage: 'preview'`, admin-only. Does it `requires` `quiz-media-response`? Is an on-device model exempt from the "every AI call goes through `generateAi`" rule (it is not a server call), and is that recorded in `docs/AI_MODELS.md`?                                                      | —               |

---

## 6. Safe to build now (independent of the open questions)

1. **Port the scoring engine into real code.** That means a pure TypeScript module with A1–A13 + T1–T5 (`held`) + S1–S5 combination, ported from the spikes with their tests. It is pure, has no dependencies, and is needed by every answer to Q1–Q13.
2. **Symbol normalization (#2383):** a tokenizer from espeak IPA into the model's 392 tokens. It needs backtracking for `juː` and must strip the `(en)` markers and the zero-width joiners.
3. **The Chromebook measurement (#2350):** a `/pronunciation-dev` harness page that loads the q4 model in `onnxruntime-web` and decodes the five committed clips. It reports load time, memory and inference time. This is the single biggest unknown and only needs Paul and a Chromebook.

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
