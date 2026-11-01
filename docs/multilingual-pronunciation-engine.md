# Pronunciation Practice — Plan

**Status:** Live plan, **built behind `flashcards-speak`** (S0-S13 merged into `dev-paul` by 2026-10-20; the S11 scorer rebuild may still be landing).

- **History.** Grilled 2026-10-13 (G1–G22, kept for the quiz type in §13). Redirected 2026-10-19 to a Flashcards **Speak** study mode (F-decisions, §3). Strictness re-grilled the same day to mirror Write mode (§4).
- **Built so far:** the whole Speak mode: editor settings and card review, save-time lookup (editor and connector), the player, the Speaking results view, and the end-to-end test (`tests/e2e/flashcards-speak.spec.ts` on `/flashcards-speak-dev`). The flag starts fail-closed, admins included.
- **Next step:** Paul's §10 actions (P1, P2 prod upload at release, P5), then open the flag at Admin Settings > Access > Previews. Move this doc to `docs/plans/shipped/` once S11 lands; follow-ups are in `PAUL_TODO.md` and `AGENT_BACKLOG.md`.

**Owner:** Paul (OPS-PIvers) + Claude

**Tickets:** [Wayfinder Map #2331](https://github.com/OPS-PIvers/SpartBoard/issues/2331). The map body predates this doc; **this doc wins** where they differ.

**Scoring contracts:** `scripts/spikes/*/DECISIONS.md` (`alignment-engine` A1–A13, `stress-detection` S1–S5, `stress-reference` R1–R5, `token-runs` T1–T5). This doc wins where it says it does (§4 replaces the numeric pass marks).

**Source spec:** [`multilingual-pronunciation-engine-spec.md`](multilingual-pronunciation-engine-spec.md), the original proposal, kept as written.

A Flashcards study mode where the student **says** a card's term and gets the same kind of answer Write mode gives for typing: **Exact**, **Accepted** (close enough, with what was forgiven named), or **Not yet**, plus **Couldn't hear you** when the audio can't be judged.

Scoring runs on the student's device and the audio never leaves it. The teacher sees per-card pronunciation mastery and the sounds each student and the class miss. It is for world-language and EL teachers and is invisible to everyone else.

---

## 0. Where we are (2026-10-19)

- **Done:**
  - the Chromebook gate: passed for single words, CPU only (§11.5, #2350);
  - the scoring engine, stress detection and espeak tokenizer, with tests (`utils/pronunciation/`, `991ce03`);
  - the `/pronunciation-dev` page;
  - the five engine calls under §12.2, **accepted by Paul 2026-10-19**.
- **Waiting on Paul, not blocking the build:**
  - the counsel brief on espeak's licence (G19); the flag stays admin-only until counsel answers;
  - running the model upload script on both projects (§10, P2);
  - the Chromebook recheck at the Speak capture settings (§10, P3).
- **Known risks, each with a fallback:**
  - espeak running in Cloud Functions is unproven; S3 starts with a go/no-go and a Cloud Run fallback (P7);
  - Wikimedia rate-limits cloud sessions; S4's fetch throttles, and Paul runs it locally if needed (P6).
- **Open, settled by the build itself:**
  - the scorer's thresholds and confusion lists are calibrated by the corpus gate (S11, §8), no longer guessed;
  - the German `??` token question is answered by the same corpus run.

---

## 1. The bar: what "professional" means here

A teacher who has used Write mode already knows how Speak judges. A student never sees a verdict the system can't explain. Every number in the shipped defaults came from a measurement checked into the repo.

Concretely:

1. **One strictness language across Flashcards.** Speak has the same **Strict** switch and the same three results as Write mode (`utils/flashcardMatch.ts:205-253`: `exact` / `accepted` / `wrong`). Lenient forgives _named_ near-misses, as Write forgives accents and articles.
2. **Accepted is always explained.** "Your _rr_ was a tap. Your teacher is OK with that for now." It is never a silent pass.
3. **The system doesn't blame the student for its own blind spots.**
   - Audio it can't judge reads **Couldn't hear you** and costs nothing.
   - Known recognizer confusions (#2379) are tolerated, never charged as errors.
4. **Feedback a 12-year-old can act on.** A word verdict first, at most two highlighted sounds, letters rather than IPA, a model to hear, and a replay of their own try.
5. **Measured, not guessed.** A committed native-speaker corpus gates the scorer in CI. The literature's own validation method (§8) supplies the error clips.
6. **Teachers tune by sound group, not by number.** Course-level presets and per-group overrides, and district defaults from admins (§4.3).

Research basis (2026-10-19 review, primary sources):

- **Same model, same restriction.** Parikh et al. (Interspeech 2025, [arXiv 2506.02080](https://arxiv.org/html/2506.02080)) score with this exact model, `wav2vec2-xlsr-53-espeak-cv-ft`, and limit substitutions to a hand-built confusion map. They report F1 0.41, AUC 0.92 on speechocean762.
- **Raters have a middle level.** speechocean762's human rubric scores each phone 2 / 1 / 0 (correct / accented / wrong), and raters accept several reference pronunciations ([arXiv 2104.01378](https://arxiv.org/abs/2104.01378)). That middle level is our _Accepted_.
- **Errors weigh differently.** Functional load: high-load contrasts hurt comprehensibility more, and consonants more than vowels ([Frontiers 2021](https://frontiersin.org/journals/communication/articles/10.3389/fcomm.2021.627378/full)).
- **Validating without learner audio.** Thresholds tuned on artificial errors in native speech transfer to real learners ([Kanters et al. 2009](https://www.isca-archive.org/slate_2009/kanters09_slate.html)).
- **Feedback works, stress less so.** ASR pronunciation training has a medium effect (g = 0.69). Explicit feedback works, and the effect is large for segments and small for stress ([Ngo et al. 2024](https://resolve.cambridge.org/core/journals/recall/article/effectiveness-of-automatic-speech-recognition-in-eslefl-pronunciation-a-metaanalysis/A915444CF252B61D14961D2FE733822D)).
- **Children are harder.** Zero-shot recognizers degrade badly on child speech ([Fan et al. 2024](https://arxiv.org/html/2406.10507v1)), so lenient is the default.

---

## 2. Goals and non-goals

**Goals**

- Spoken practice on a flashcard set, auto-judged on the device, with a model and immediate per-sound feedback.
- Per-student, per-card **pronunciation mastery** on its own spaced schedule, visible in Study results.
- Diagnostics: which sounds a student and the class miss, and which are being _forgiven_.
- No student audio is uploaded, stored or written anywhere (F3).
- Hidden from staff who don't teach language.

**Non-goals (v1)**

- **Grading.** Speak never reaches Check, Publish scores, Classroom, Schoology or LTI (F9). The graded route is the quiz type (§13).
- **Prosody beyond lexical stress;** open-ended speech; phrases. The target is one known word (G1).
- **Mandarin.** Also French, Italian and other set languages; the mode is hidden for them.
- **Mastery across assignments or the year** (F14).
- **Voiceprints, speaker ID or any biometric template** (RR-04).

---

## 3. Product decisions (Flashcards Speak)

F-numbers from the 2026-10-19 redirect are kept. **F6 is superseded by §4** (strictness, unclear, presets). F21–F30 are new in this rewrite.

### 3.1 The mode

- **F1 — Surface.** A fourth `FlashcardMode`, `'speak'`, beside flashcards, write and test.
  - Shown on the **public link** (`/flashcards/:shareId`, `PublicFlashcardsPage.tsx`, `LocalFlashcardAdapter`).
  - Shown in **assigned Study** (`/flashcards/a/:id`, `TrackedPlayer` in `FlashcardAssignmentPage.tsx:192-218`).
  - Shown on the closed-assignment `UntrackedPlayer` (`:244-265`).
  - **Not** in the widget's Present player (`Widget.tsx:543-561`, `allowedModes={['flashcards']}`).
  - **Not in Check.** `functions/src/flashcardCheck.ts:15` keeps its own three-mode type, unchanged.
- **F2 — What is spoken.** The **term** side, in the set's `termLanguage`.
  - **Up to four words per card** (Paul, 2026-10-21; first shipped as one word). Every answer variant is looked up (`functions/src/pronunciation/spokenVariants.ts`), up to four of them: `el/la guía` gives _el guía_ and _la guía_, `el/la mesero/a` gives _el mesero_ and _la mesera_, a trailing `...` blank is skipped, and a variant over four words is dropped. A variant other than the first is stored on its reference as `text`.
  - **Phrases** are phonemized whole, so espeak keeps connected speech (_la cama ðoβle_), then split per word for letter spans and `wordEnds`, where word-final group pairs also apply. A phrase is not stress-judged (`stress: []`).
  - Also unavailable: a reference that failed (#2383 `unrenderable` / `untokenizable`). The card reads "Not available to speak" and is skipped.
  - **Languages:** the mode is offered only when the primary subtag of `termLanguage` is `es`, `de` or `en`. Teachers type `es`, `es-US`, `es-MX` and so on; the presets in `flashcardLanguages.ts:4-12` give `es-US`.
- **F3 — No recording is kept.** Audio is held in memory for the decode and for "Play my attempt", then dropped when the card changes.
  - Nothing is uploaded, archived or written to Firestore.
  - `useAudioRecording` is reused for capture only (it writes nothing unless `commit()` is called, `hooks/useAudioRecording.ts`). Its upload path and `RecordingConsentNotice` are not used.
  - **No consent notice** (Paul, 2026-10-19).
- **F4 — Dialects and references.**
  - The set stores its accepted dialects, prefilled from `termLanguage` with G4's defaults: `es` → `es-419` + `es-ES`, `de` → `de-DE`, `en` → `en-US`.
  - Each card stores one reference per dialect, computed on save by the lookup callable (S3), plus `g2pVersion` and a review status.
  - The student is judged against the dialect that gives the best verdict.
- **F5 — Attempts.** Up to N scored attempts per card per round: 1–10, default 3, set per set and lockable per assignment.
  - **Couldn't hear you** never uses an attempt (§4.4).
  - The card **passes the round** on an Exact or Accepted attempt, and fails if all N attempts are Not yet.

### 3.2 Tracking mastery

- **F7 — Per-card speak progress, on its own schedule.** Knowing a word and saying it are different skills, so Speak has its own record and its own round counter:
  - `FlashcardStudyState.speak?: Record<cardId, FlashcardSpeakProgress>` and `speakRound?: number` (§5).
  - The pass or fail feeds the existing `recordFlashcardAnswer` (`utils/flashcardSchedule.ts:30-46`), so `ROUND_GAPS` spacing and the streak are identical. The queue is built from `speak` with `speakRound`, not from `cards`/`round`.
  - **Mastered aloud** = streak at or above the session's mastery threshold. Study sessions have none today and use `DEFAULT_FLASHCARD_MASTERY_THRESHOLD = 3` (`flashcardSchedule.ts:7`); Speak uses the same value.
- **F8 — Sound tallies, not utterances.** Per student, `speakSounds?: Record<token, { n; m; f }>`:
  - `n` = attempted, `m` = missed (unforgiven substitution or omission), `f` = forgiven (§4).
  - Counted from the **deciding attempt** of each round (the passing one, else the last).
  - The recognized phoneme string is **never stored**.
  - Bounded by the 392-token vocabulary.

### 3.3 Teacher side

- **F9 — Not a grade.** Speak progress is client-written with no recording behind it, so it is an indicator only.
- **F10 — Study results.** A **Speaking** view beside recall:
  - **Per student:** words mastered aloud, in progress, not started, and the top three missed sounds by plain name. A student whose device never ran Speak shows "—", not 0.
  - **Per class:**
    - **sounds most often missed**;
    - **sounds most often forgiven**, so a teacher can see the class taps every _rr_ and tighten the group;
    - **words to check**: at least 5 students tried and at least 60% failed their last round. A word most students fail is more likely a scorer problem than a teaching one.
  - PLC tallies are not in v1.
- **F11 — Authoring.** Inside `FlashcardEditor`:
  - the **Speak settings** panel (§4.3);
  - per card, a status chip (ready / needs review / not available) and a "Hear it" button;
  - flagged cards listed once at the top of a large set;
  - IPA and stress in an **Advanced** panel, validated by `tokenizeIpa`.
  - A flag never blocks saving. An unconfirmed stress reference is simply not stress-judged (R1–R5). The connector triggers the same save-time lookup (S10).

### 3.4 Platform

- **F12 — Unsupported device.** Speak is shown **disabled with the reason**, one of:
  - no microphone;
  - microphone blocked;
  - **inside a frame that blocks the microphone** (`isFramed()` on the public page; LMS iframes rarely grant `allow="microphone"`), with an "Open in a new tab" link;
  - model blocked or failed to download;
  - device too slow (a first decode over 15 s).

  There is no "score later". The rest of the set works as today.

- **F13 — Validation before the flag opens beyond admins:**
  - the CI corpus gate (§8) is green;
  - the class-wide **words to check** list (F10) has been reviewed during the admin-only period;
  - counsel has signed off espeak (G19).

  Student audio is never used to tune the scorer.

- **F14 — Scope of mastery.** Per assignment, like recall (Paul, 2026-10-19). Year-long tracking is its own future plan, with a per-student store.
- **F15 — Gate.** A new `GlobalFeature` `'flashcards-speak'` in `config/featureDefaults.ts`:
  - `stage: 'preview'`, `afterLaunch: 'keep'`, `widget: 'flashcards'`, `icon: Mic`;
  - `defaultAccessLevel: 'admin'`, `defaultEnabled: false`, `missingDocPublic: false`, `failClosedForAdmins: true`, like `quiz-media-response` at `:387-400`;
  - **not** added to `functions/src/featureMissingDoc.ts`, which holds only admin-preview flags (`isAdminPreviewFeature = !missingDocPublic && !failClosedForAdmins`, `featureDefaults.ts:1260-1263`);
  - no `requires`.

  Language and EL teachers get it through the `global_permissions` doc's `betaUsers`. Admin path: Admin Settings > Access > Previews.

- **F21 — Students can't evaluate the flag, so the teacher's save stamps it.** `canAccessFeature` is teacher-auth only (`context/AuthContext.tsx:3159`). Assigned students run under `StudentAuthProvider`, and the public page mounts no providers at all.
  - Wherever Speak can appear, the teacher's client stamps a resolved `speak` block when the teacher passes `canAccessFeature('flashcards-speak')` and the language is supported, and omits it otherwise. The stamp goes on:
    - the set;
    - the public snapshot (`toPublicSnapshot`);
    - every Study session payload (`useFlashcardAssignments.ts:167-191`);
    - the open-session rewrite (`rewriteOpenStudySessions`).
  - Student surfaces show Speak **iff the stamp is present**.
  - Revoking the flag takes effect on the teacher's next save, which re-stamps.
- **F22 — Admin defaults reach students through the stamp, not a read.** Students never read `admin_settings` (admin-only unless a doc has its own `signedIn()` read, `firestore.rules:977-979`, pattern `:995-998`).
  - The teacher's client reads `admin_settings/flashcardsSpeak` (given a `signedIn()` read rule) at save time.
  - It resolves the effective settings into the stamp.
- **F23 — "Hear it" uses the device's speech synthesis.** No flashcard TTS callable exists: `synthesizeQuizAudioV1` is quiz-only and has no es-ES voice (`config/quizReadAloud.ts:9-58`).
  - Use `window.speechSynthesis` with a voice whose `lang` matches the card's dialect, falling back to its primary subtag. Copy the `speechAvailable()` pattern from `components/widgets/GuidedLearning/components/player/useReadAloud.ts`.
  - Hide the button when no voice matches.
  - On-device, free, anonymous-safe; ChromeOS ships Google es/de/en voices.
  - A teacher-recorded example stays deferred.
- **F24 — Play my attempt.** After each attempt the student can replay their own take from memory, beside "Hear it". Record-and-compare is standard CAPT practice. The blob URL is revoked when the card changes.
- **F25 — Capture settings for Speak.**
  - `useAudioRecording` hard-codes 32 kbps Opus (`hooks/useAudioRecording.ts:77-84`), but the Chromebook gate measured the default bitrate. Speak passes a new optional `audioBitsPerSecond: 128000`.
  - It also passes `constraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }`, since noise suppression smears consonants.
  - Both options default to today's behaviour, so quiz recording is unchanged. P3 confirms the choice on a Chromebook.
- **F26 — The Worker boundary.**
  - `decodeToModelRate` needs `OfflineAudioContext`, which workers lack (`utils/pronunciation/audio.ts:4-18`). So decode, resample and `trimSilence` run on the main thread.
  - The 16 kHz `Float32Array` is **transferred** to a module Worker that owns the ONNX session, single-threaded WASM, CPU only.
  - The Worker pattern is `utils/imageProcessing.ts:6-25`.
  - The main thread never runs the model.
- **F27 — Model hosting (G18).**
  - The pinned q4 file goes to Cloud Storage at `pronunciation-models/<id>/model_q4.onnx` in each project's default bucket, uploaded with `Cache-Control: public, max-age=31536000, immutable`.
  - Anyone may read it (`storage.rules`), with a committed CORS config for the hosting origins.
  - The loader verifies byte size and the md5 prefix in `config/pronunciationModel.ts` before caching, in Cache Storage `spartboard-pronunciation-models`.
  - Hugging Face is a dev-only fallback.
  - Licences: model Apache-2.0; confirm the `qnighy` export's licence and add `NOTICE` text in S2.
- **F28 — Model download UX.**
  - The first time Speak opens on a device, a one-tap "Get Speak ready (240 MB, once per device)" with progress.
  - Later opens show "Getting ready…" for the ~3.6 s cache read and session start.
  - Never auto-download on a metered or `saveData` connection; ask first.
- **F29 — The microphone permission flow.** A pre-prompt explains why before the browser asks. A denied permission lands on F12's "Microphone blocked", with ChromeOS-specific steps.
- **F30 — Live tours.**
  - New teacher controls get `tourAttr` anchors registered in `config/tourAnchors.ts`:
    - the editor's Speak panel, presets, group rows, Hear it, review list;
    - the assign stepper's Speak step;
    - the results Speaking view.
  - New anchor-rendering files go on `config/tourSurfaces/library.ts`.
  - The student player is not a tour surface; its controls carry `no-tour-anchor: student player` comments, matching the existing modes.

---

## 4. Strictness: mirror Write mode (Paul, 2026-10-19)

This replaces G7/F6's Loose / Close / Exact numeric marks (60/80/95, #2342) for Flashcards Speak. The 0–100 accuracy is still computed, for progress and results, but **it never decides the verdict.**

### 4.1 The verdict

A take is aligned against each accepted dialect's reference, using the existing `evaluatePronunciation` alignment (A1–A13, T1–T5). Each non-correct entry is then **classified**:

| Classification            | When                                                                                                       | Counts as                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `tolerated`               | The pair is on the **recognizer-tolerance** list (§4.2, not teacher-adjustable)                            | correct; not tallied            |
| `forgiven`                | The pair is in a sound group whose effective setting is _forgive_                                          | Accepted, named; tallied as `f` |
| `error`                   | Any other substitution, any omission, any non-`held` insertion, or a group pair whose setting is _require_ | Not yet; tallied as `m`         |
| stress `forgiven`/`error` | Confirmed stress reference and detected index not accepted; forgiven or required per the `stress` group    | as above                        |

Then, per dialect:

- **Exact:** no `forgiven` and no `error` entries.
- **Accepted:** at least one `forgiven` and no `error`.
- **Not yet:** any `error`.

The best verdict across dialects wins (Exact > Accepted > Not yet), with ties broken by accuracy. **Lenient has no typo budget.** Only named groups are forgiven (Paul, 2026-10-19), so every Accepted is explainable.

### 4.2 Sound groups

The data lives in `config/pronunciationGroups.ts`, owned by S0.

- Every pair is `target token → spoken tokens` from the 392-token vocabulary (`xlsr53EspeakVocab.json`). A test fails if a token is not in it; `ʏ`, `ər`, `ɪə` and `g` are not.
- `final` marks a pair that applies only at the last position.
- The labels below are draft English. S5 writes the final copy in all four locales.

**Spanish (`es`)**

| Group id          | Teacher label (draft)                  | Pairs (target → spoken)                         |
| ----------------- | -------------------------------------- | ----------------------------------------------- |
| `es-trill`        | Rolled r (_perro_)                     | `r → ɾ`, `r → ɹ`                                |
| `es-tap`          | Tapped r (_pero_)                      | `ɾ → ɹ`, `ɾ → d`                                |
| `es-soft-bdg`     | Soft b, d, g (_lobo, nada, lago_)      | `β → b`, `ð → d`, `ɣ → ɡ` and the reverse three |
| `es-aspiration`   | No puff of air on p, t, k              | `p → pʰ`, `t → tʰ`, `k → kʰ`                    |
| `es-vowel-glide`  | Pure vowels (_e_, _o_ without a glide) | `e → eɪ`, `o → oʊ`                              |
| `es-vowel-reduce` | Full unstressed vowels (_casa_)        | `a → ə`, `e → ə`, `o → ə`                       |
| `es-jota`         | The _j_ sound (_jota_)                 | `x → h`                                         |
| `stress`          | Stressed syllable                      | (stress, §4.1)                                  |

**German (`de`)**

| Group id          | Teacher label (draft)                         | Pairs                                                                 |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `de-r`            | German r (_rot_)                              | `r → ɹ`, `ɾ → ɹ`                                                      |
| `de-ich-ach`      | _ch_ sounds (_ich_, _ach_)                    | `ç → ʃ`, `ç → x`, `x → k`, `x → h`                                    |
| `de-umlaut`       | _ü_ and _ö_                                   | `yː → uː`, `yː → iː`, `øː → oː`, `øː → eː`, `œ → ɔ`, `œ → ɛ`          |
| `de-vowel-length` | Long and short vowels (_Staat_, _Stadt_)      | `ɑː → a`, `eː → ɛ`, `iː → ɪ`, `oː → ɔ`, `uː → ʊ` and the reverse five |
| `de-final`        | Final _b, d, g_ sound like _p, t, k_ (_Hund_) | `t → d`, `p → b`, `k → ɡ` (final)                                     |
| `de-endings`      | Unstressed endings (_-er_, _-e_)              | `ɜ → ɜː`, `ɜ → ɚ`, `ə → ɛ`, `ə → e`                                   |
| `stress`          | Stressed syllable                             | (stress)                                                              |

**English (`en`)**

| Group id           | Teacher label (draft)         | Pairs                                       |
| ------------------ | ----------------------------- | ------------------------------------------- |
| `en-th`            | _th_ sounds (_think_, _this_) | `θ → t`, `θ → f`, `θ → s`, `ð → d`, `ð → z` |
| `en-r`             | English r (_red_)             | `ɹ → ɾ`, `ɹ → r`, `ɹ → ʁ`                   |
| `en-vowel-length`  | _ship_ and _sheep_            | `iː → ɪ`, `ɪ → iː`, `uː → ʊ`, `ʊ → uː`      |
| `en-reduced`       | Weak vowels (_about_)         | `ə → ʌ`, `ə → ɐ`, `ɚ → ɜː`                  |
| `en-final-voicing` | Final _z, d, v_ (_dogs_)      | `z → s`, `d → t`, `v → f` (final)           |
| `stress`           | Stressed syllable             | (stress)                                    |

Targets were checked against real espeak output on 2026-10-19 (S1, `config/pronunciationGroups.espeak.test.ts`): German writes r as `r`/`ɾ`, _-er_ as `ɜ` and long a as `ɑː`, and en-us never marks aspiration, so `en-aspiration` was dropped.

**Recognizer tolerance (always on, never shown as an error, not tallied):**

- `es`: `ɾ → r` (#2379: a correct tap reads as a trill and confidence can't separate them);
- `es`: `ʝ ↔ j ↔ ʎ` (yeísmo, a dialect difference, not a learner error).

S11 may add pairs **only** when the corpus shows natives produce them in at least 10% of clips. Each addition is recorded in §8's results table and needs Paul's yes.

### 4.3 Settings, presets and defaults

- **Per set** (`FlashcardSet.speak`, §5): `strict` (default off), `preset`, `groups` overrides, `attempts`, `example`.
  - Each group is **Follow Strict switch** (default), **Always forgive** or **Always require**.
  - Effective forgive = `forgive`, or `follow` with Strict off.
  - Changing one group row moves `preset` to `custom`.
- **Presets** (Paul, 2026-10-19) fill `strict` and `groups`:

| Preset       | Strict | Forgive                                                                                                                                                                      | Require                                                                                                                      |
| ------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Beginner     | off    | `es-trill`, `es-tap`, `es-aspiration`, `es-soft-bdg`, `es-jota`, `de-r`, `de-ich-ach`, `de-final`, `de-endings`, `en-r`, `en-th`, `en-final-voicing`, `en-reduced`, `stress` | every other group (the vowel groups: `es-vowel-glide`, `es-vowel-reduce`, `de-umlaut`, `de-vowel-length`, `en-vowel-length`) |
| Intermediate | off    | `es-aspiration`, `es-soft-bdg`, `de-endings`, `en-final-voicing`, `en-reduced`, `stress`                                                                                     | every other group                                                                                                            |
| Advanced     | on     | —                                                                                                                                                                            | every group (all `follow`, and Strict is on)                                                                                 |

A preset writes an explicit setting for **every** group of the language (Beginner and Intermediate write `forgive`/`require`; Advanced writes `follow`), so a preset's meaning never depends on the Strict switch's later state. Beginner encodes Paul's example: vowels strict, the trill forgiven. Recognizer-tolerance pairs (§4.2) apply under every preset.

- **District defaults** (Paul, 2026-10-19): `admin_settings/flashcardsSpeak` holds, per language, a default preset and group overrides, plus the default attempts and the `unclear` confidence cut-off (§4.4).
  - It is edited in a new Admin Settings panel, copying `quiz-read-aloud`'s normalizer (`config/quizReadAloud.ts:89-121`) and panel (`components/admin/QuizReadAloudConfigurationPanel.tsx`).
  - It prefills a set the first time Speak settings are saved.
  - Afterwards the set's own values win.
- **Per assignment:** the assign stepper gains a **Speak** step for Study assignments (none exists today: `buildFlashcardAssignKindFields` returns `{kind:'study'}` only, `flashcardAssign.ts:121-136`).
  - The teacher can lock the set's Speak settings for that assignment. A lock is stamped as `speak.locked: true` on the session.
  - Locked settings render read-only in the player, as `lockedSettings` do for Checks (`FlashcardPlayer.tsx:780-811`).

### 4.4 Couldn't hear you

Checked before scoring, in this order:

1. after `trimSilence`, under 150 ms of voiced audio;
2. no non-blank CTC token;
3. mean max-posterior over non-blank frames below `unclearConfidence`. The default is calibrated by S11 as the 2nd percentile of native clips; the admin can tune it.

The result: "Couldn't hear you — try again". It uses no attempt and is not tallied. After three in a row, the player shows a microphone check (level meter, "Say _hola_").

A student saying a _different_ word is **Not yet**, not unclear.

### 4.5 What the student sees

1. The card's term, a big mic button, "Hear it" (F23), and the attempt dots.
2. While recording: a live level meter. While deciding: "Checking…", with the Worker running and the UI responsive.
3. The verdict, in Write's visual language: Exact (advance), Accepted (emerald panel, `role=status`) or Not yet (rose panel).
   - Marks differ by **shape and label**, not colour alone (G16, WCAG AA).
4. The term's letters, mapped from the reference's `letterSpans`, marked correct / changed / missed / extra.
   - **At most two marks are emphasised**, chosen by consonant-before-vowel and group order. The rest are visible but quiet.
   - Tapping a mark shows a plain hint from the sound-name table (S5), e.g. "Roll the r: let your tongue flutter." No IPA is shown to students.
   - When a reference has no `letterSpans`, the marks fall back to sound chips with plain names.
5. "Play my attempt" (F24), "Try again" (while attempts remain), "Continue".
6. Stress feedback is one line ("Stress the second part: ca-**SA**"). It is modest by design, because the evidence for stress feedback is weaker.

---

## 5. Contracts (frozen by S0; changing one is an orchestrator decision)

```ts
// types.ts
export type FlashcardMode = 'flashcards' | 'write' | 'test' | 'speak';
export type SpeakLanguage = 'es' | 'de' | 'en';
export type SpeakDialect = 'es-419' | 'es-ES' | 'de-DE' | 'en-US';
export type SpeakGroupSetting = 'follow' | 'forgive' | 'require';
export type SpeakPreset = 'beginner' | 'intermediate' | 'advanced' | 'custom';
export type SpeakVerdict = 'exact' | 'accepted' | 'wrong' | 'unclear';

export interface FlashcardSpeakSettings {
  dialects: SpeakDialect[]; // >= 1, all of the set's language
  preset: SpeakPreset;
  strict: boolean;
  groups: Partial<Record<string, SpeakGroupSetting>>; // keys: config/pronunciationGroups.ts ids
  attempts: number; // 1-10
  example: boolean; // "Hear it" shown
}

export interface FlashcardSpeakReference {
  dialect: SpeakDialect;
  tokens: string[]; // 392-vocab tokens, non-empty
  stress: number[]; // accepted 0-based syllable indices; [] = not stress-judged
  letterSpans?: number[]; // flat [start, end) pairs per token into the spoken variant (Firestore can't nest arrays)
}

export type FlashcardSpeakStatus = 'ready' | 'needs-review' | 'unavailable';
export type FlashcardSpeakReason =
  | 'multi-word'
  | 'unrenderable'
  | 'untokenizable'
  | 'g2p-disagree'
  | 'stress-disagree'
  | 'language-switch'
  | 'lookup-failed';

export interface FlashcardCardSpeak {
  term: string; // the term the refs were computed for; a changed term invalidates them
  refs: FlashcardSpeakReference[];
  g2pVersion: string;
  status: FlashcardSpeakStatus;
  reasons?: FlashcardSpeakReason[];
  confirmedAt?: number; // teacher confirmed a needs-review card
  ipaOverride?: Partial<Record<SpeakDialect, string>>; // Advanced panel
}

// FlashcardCard gains:      speak?: FlashcardCardSpeak
// FlashcardSet gains:       speak?: FlashcardSpeakSettings      (F21 stamp source)
// PublicFlashcardSet gains: speak?: FlashcardSpeakSettings      (present = Speak shown)
// FlashcardSession gains:   speak?: FlashcardSpeakSettings & { locked: boolean }

export interface FlashcardSpeakProgress extends FlashcardCardProgress {
  best: number; // 0-100 accuracy, best deciding attempt
  last: number; // 0-100, last deciding attempt
  tries: number; // scored attempts used in the last round (1-10)
}
// FlashcardStudyState gains (so Local, Memory and Tracked adapters all carry them):
//   speak?: Record<string, FlashcardSpeakProgress>; speakRound?: number;
//   speakSounds?: Record<string, { n: number; m: number; f: number }>

// admin_settings/flashcardsSpeak
export interface FlashcardsSpeakAdminConfig {
  languages: Partial<
    Record<
      SpeakLanguage,
      {
        preset: Exclude<SpeakPreset, 'custom'>;
        groups: Partial<Record<string, SpeakGroupSetting>>;
      }
    >
  >;
  attempts: number;
  unclearConfidence: number; // 0-1
}
```

```ts
// utils/pronunciation/verdict.ts (S1): pure, no I/O
export interface SpeakJudgeInput {
  refs: readonly FlashcardSpeakReference[];
  spoken: readonly string[]; // recognized tokens
  // Stress depends on each dialect's alignment, so the caller supplies it per alignment (wraps detectStress); keeps verdict.ts pure.
  stressFor: (
    ref: FlashcardSpeakReference,
    alignment: readonly AlignmentEntry[]
  ) => number | null;
  confidence: number; // mean max-posterior over non-blank frames
  voicedMs: number;
  language: SpeakLanguage;
  settings: Pick<FlashcardSpeakSettings, 'strict' | 'groups'>;
  unclearConfidence: number;
}
export interface SpeakJudgeEntry extends AlignmentEntry {
  kind: 'correct' | 'held' | 'tolerated' | 'forgiven' | 'error';
  groupId?: string;
}
export interface SpeakJudgement {
  verdict: SpeakVerdict;
  dialect: SpeakDialect | null; // null when unclear
  accuracy: number; // 0-100, segment score (A-series), for progress only
  entries: SpeakJudgeEntry[];
  stress: 'correct' | 'forgiven' | 'error' | 'not-judged';
  forgivenGroups: string[];
  tally: Record<string, { n: number; m: number; f: number }>; // this attempt's F8 delta
}
export function judgeSpeech(input: SpeakJudgeInput): SpeakJudgement;
export function effectiveGroupSettings(
  language: SpeakLanguage,
  settings: Pick<FlashcardSpeakSettings, 'strict' | 'groups'>
): Record<string, 'forgive' | 'require'>;
```

```ts
// utils/pronunciation/recognizer.ts (S2)
export type RecognizerState =
  | { kind: 'idle' }
  | { kind: 'needs-download'; bytes: number }
  | { kind: 'downloading'; loaded: number; total: number }
  | { kind: 'starting' }
  | { kind: 'ready' }
  | {
      kind: 'unsupported';
      reason:
        'no-wasm' | 'no-worker' | 'download-failed' | 'integrity' | 'too-slow';
    };
export interface RecognizeResult {
  tokens: CtcToken[]; // with frame timing, for stress
  confidence: number;
  voicedMs: number;
  audio16k: Float32Array; // trimmed, for measureNuclei
  decodeMs: number;
}
export interface Recognizer {
  state(): RecognizerState;
  subscribe(cb: (s: RecognizerState) => void): () => void;
  prepare(opts: { allowMetered: boolean }): Promise<void>;
  recognize(audio: Blob): Promise<RecognizeResult>;
}
export function getRecognizer(): Recognizer; // singleton per page
// Tests and the e2e fixture inject a fake via setRecognizerForTests(r: Recognizer | null).
```

```ts
// functions/src/pronunciation/lookup.ts (S3): callable lookupSpeakReferencesV1
// in:  { language: SpeakLanguage; dialects: SpeakDialect[]; terms: Array<{ cardId: string; term: string; ipaOverride?: Partial<Record<SpeakDialect,string>> }> } (<= 500)
// out: { g2pVersion: string; cards: Record<cardId, FlashcardCardSpeak> }
// auth: signed-in teacher; server-side gate via isGlobalFeatureGranted (functions/src/quizMediaArchive.ts:598); students rejected.
```

**i18n key list:** S0 commits the full `flashcards.speak.*` key list with draft English into `locales/en.json`. S5 fills `es`, `de` and `fr` and finalises the English. No other session edits locale files; a missing key is reported to the orchestrator. `tests/i18n/flashcardsLocales.test.ts` requires parity across all four locales.

---

## 6. Integration map (verified against code, 2026-10-19)

**Fields are stripped in six places.** Each rebuilds cards as `{id, term, definition}` or drops set-level keys, and each must carry `speak` through (S7):

- `hooks/useFlashcardSets.ts:89-93` `normalizeSet`;
- `:98-109` `toPublicSnapshot`;
- `:43-80` `rewriteOpenStudySessions`;
- `functions/src/mcp/flashcardStore.ts:37-55` `normalizeSet`;
- `:58-72` `mergeCards`, which keeps the old `speak` when the term is unchanged and drops it when the term changes;
- `:94-103`, the snapshot mirror;
- `functions/src/subLaunchAssignment.ts:502-521` `fcCardsFromBundle`;
- the session payload in `useFlashcardAssignments.ts:167-191`.

**Rules** (all in S7). Rules can't iterate maps, so the checks are `is map` plus `size()`.

- **Progress** `fcValidProgress` (`firestore.rules:6504-6520`): add `speak`, `speakRound`, `speakSounds` to `hasOnly`, with `optMap` + `size() <= 500`, an optional int, and `optMap` + `size() <= 392`.
- **Public snapshot** `hasOnly` (`:6378-6394`) gains `speak`.
- **PLC set keys** `plcFlashcardSetKeysOk` (`:2719-2725`) gains `speak`.
- The session create rule has no key whitelist (`:6455-6463`).
- `admin_settings/flashcardsSpeak` gets a `signedIn()` read.
- **Size:** measured after S11a, a 500-card Spanish set with eight distinct voice readings per card is about 0.4 to 0.8 MB of Speak data for ordinary words, and over 4 MB at 64-letter words, where espeak refs alone pass 1 MiB. `fitSpeakToDoc` (client and connector saves) keeps the set doc under 900 KiB by dropping voice readings, then letter spans, then a card's refs, from the last card back.

**Player** (`components/flashcards/FlashcardPlayer.tsx`):

- the mode list is at `:96-104`, and `allowedModes` defaults to all (`:114`);
- the render chain is at `:509-683`;
- settings are merged at `:126-135`;
- `record` is at `:239-242`, `nextRound` at `:259-261`, `noteMode` at `:196-198`;
- the settings drawer is at `:780-811`.

**Adapters** (`components/flashcards/adapters.ts`):

- `sanitizeFlashcardStudyState`/`cloneState` (`:37-89`) would drop `speak`;
- `record` writes `cards` only (`:109-128`);
- `TrackedFlashcardAdapter` diffs `cards` only (`:276-294`, `:385-414`).

S7 adds `recordSpeak(cardId, passed, accuracy, tries, tally)` to the adapter interface, implements it on Local, Memory and Tracked, and covers it with the existing round-trip tests.

**Results:** `utils/flashcardResults.ts` (`FlashcardResultRecord` `:23-42`, `buildStudyRows` `:136-161`, `hardestFlashcards` `:187-212`); `FlashcardStudyResults.tsx` (copy is hardcoded English, so keep that convention); `hooks/useFlashcardResults.ts:108-152` spreads raw progress, so new fields arrive without changes.

**Connector:** `functions/src/mcp/tools.ts` (`cardInput` `:95-98`, `create_flashcard_set` `:393-450`, `update_flashcard_set` `:453-506`); store in `functions/src/mcp/flashcardStore.ts`.

**Hosting:** `firebase.json:101-109` sets COOP `same-origin-allow-popups` and no COEP, so the site is not cross-origin isolated and WASM runs single-threaded. There is no cache rule for `.onnx`/`.wasm`; the model goes to Storage (F27), the wasm stays a Vite asset.

**Runtime:** `onnxruntime-web-1-31` (`package.json`) is the alias the harness uses; reuse it. `1.21.0` stays for imgly. `pitchy` is **not** installed; `stress.ts` measures pitch in-house.

**Tests to model on:**

- `components/flashcards/FlashcardPlayer.test.tsx` (LocalFlashcardAdapter + userEvent);
- `tests/rules/flashcardsAssignments.test.ts` (`progress()` fixture `:73-82`, progress block `:296-451`);
- `tests/rules/flashcardsLibrary.test.ts` and `tests/rules/plcFlashcards.test.ts`.

**Anchors:** flashcards anchors are at `config/tourAnchors.ts:9246-9390` and `:12583-12620`. Surfaces are in `config/tourSurfaces/library.ts:221-280`.

**Corrected stale anchors from the old doc:** `GlobalFeature` is at `types.ts:9961`, `canAccessFeature` at `AuthContext.tsx:3159`, `quiz-media-response` at `featureDefaults.ts:387`, `QuizAssignmentSettings` at `types.ts:6578`.

---

## 7. Professional-quality checklist (every UI session owns its rows)

- **States designed, not defaulted:** first-run download, getting ready, armed, recording, checking, each verdict, unclear, mic check, every F12 reason, a card unavailable, a whole set unavailable, offline after the model is cached.
- **Keyboard:**
  - Space starts and stops recording;
  - Enter continues;
  - R replays my try;
  - H plays Hear it;
  - all with visible focus.
  - The verdict is announced through `role=status`.
- **Motion** follows `components/CLAUDE.md`: the level meter and verdict panel use the Write panel's existing transitions, and `prefers-reduced-motion` turns the meter into a static indicator.
- **Copy:** no IPA, "AI", "model", or "error" in student copy. "Not yet", not "Wrong". Teacher copy names sound groups in plain words with an example word. Run `pauls-skills:deslop --writing` on new strings.
- **Worst case** (`break-ui`):
  - a 500-card set;
  - a 40-letter German compound;
  - a term with an article (_der Hund_, a two-word phrase) and one over four words (unavailable);
  - every card unavailable;
  - `es-MX` / `es` / `ES-us` tags;
  - a 10-attempt setting;
  - the student denying the mic mid-round.
- **Performance:**
  - no main-thread long task over 200 ms during a decode (Performance API in the e2e);
  - the player's first render doesn't import onnxruntime (the Worker chunk is lazy).

---

## 8. Verification (thresholds agreed with Paul, 2026-10-19)

**The corpus** (S4): native single-word recordings from **Lingua Libre** on Wikimedia Commons, CC BY-SA.

- **Size:** es/de/en, 60 words per language, at least 3 speakers per language, at least 2 clips per word where available. Words are chosen to cover every §4.2 group's target tokens and every stress position.
- **Pinning:** `scripts/pronunciation-corpus/fetch.mjs` pins each clip by Commons file name and SHA-1 in `manifest.json` and writes `CREDITS.md` (author, licence, URL).
- **Storage:** clips are converted to 16 kHz mono FLAC under `tests/fixtures/pronunciation-corpus/`, about 15 MB. If the repo size policy objects, the orchestrator moves them to dev Storage and the gate fetches by SHA-1.
- **Silence and noise controls:** 20 synthetic clips (silence, room tone, a cough, clipping).

**Error clips without learner audio:** mutated references, after Kanters et al. Each native clip is judged against copies of its reference with one token changed. The change is either a high-functional-load substitution (e.g. `l→n`, `s→ʃ`, `p→b`, `i→e`) or a §4.2 group pair. The clip now really mismatches the reference at a known position.

**The gate** (`scripts/pronunciation-corpus/gate.mjs`, workflow `.github/workflows/pronunciation-gate.yml`):

- It runs on PRs touching `utils/pronunciation/**`, `config/pronunciation*.ts` or the corpus.
- It runs the real model in Node through `onnxruntime-web-1-31`, with the model cached in Actions cache, keyed by md5.
- It writes `docs/pronunciation-gate-results.md` (per-language tables) on every run.
- It decodes each clip once and caches the token output, then judges every preset and mutated reference from that cache; the job's budget is 30 minutes.

| Check                                                                | Pass threshold                                 |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| Native clips, Beginner preset: verdict Exact or Accepted             | **≥ 95%** per language                         |
| Native clips, Advanced preset (Strict on): Exact or Accepted         | **≥ 85%** per language                         |
| Native clips judged unclear                                          | **≤ 2%**                                       |
| Silence and noise controls judged unclear                            | **100%**                                       |
| Mutated references, high-load pairs: Not yet at the mutated position | **≥ 80%** recall per language                  |
| Mutated references, group pairs under _require_: Not yet             | **≥ 80%**; and under _forgive_: Accepted ≥ 90% |
| Browser vs Node decode agreement on 10 harness clips                 | ≥ 9/10 identical token strings (as #2350)      |
| `judgeSpeech` unit property tests                                    | all pass (S1)                                  |

**Calibration** (S11, once): S11 sets `unclearConfidence` and records the native confusion counts. It proposes any recognizer-tolerance pair (§4.2) or default-preset change with the numbers, and Paul approves each. A gate failure is fixed in the scorer or groups, **never** by lowering a threshold without Paul.

**On device** (P3, Paul):

- a Chromebook run of `/pronunciation-dev` on the Speak capture path (F25);
- decode at most 6 s for a 1.5 s trimmed take;
- no main-thread long task over 200 ms;
- results recorded in §11.5.

**Before Public** (F13):

- the gate is green;
- the admin-only period's **words to check** list has been reviewed;
- a separate child-voice spot check: 20 Lingua Libre or consented clips, reported, not gated;
- counsel has signed off.

---

## 9. Implementation: orchestrator, waves and sessions

### 9.1 The orchestrator

- **Model:** Opus 5.5, effort **medium**. It only spins up sessions, hands each its slice from this section verbatim, watches PRs, merges between waves and answers contract questions. **It writes no feature code.**
- **Each session:**
  - branches from the latest `dev-paul`;
  - opens one draft PR into `dev-paul`, titled `Speak S<n>: <slice>`;
  - runs `/ship`, which waits for CI and the Claude review, fixes, and merges on green.
- **Wave gate:** a wave starts only after every PR of the previous wave is merged into `dev-paul`.
- **File ownership** (§9.3) is exclusive within a wave, with two **append-only shared** exceptions: `config/tourAnchors.ts` / `config/tourSurfaces/library.ts` (each session adds its own entries in its own block, never edits another's) and `functions/src/index.ts` export lines. The orchestrator merges a wave's PRs one at a time, and a session whose PR then conflicts merges `dev-paul` in and re-pushes. A session that needs a change in a file it doesn't own stops and asks the orchestrator, which either assigns a follow-up to the owner or amends the contract.
- **Local checks per CLAUDE.md:**
  - `pnpm exec vitest related --run <files>`;
  - the pre-commit hook for lint and format;
  - `pnpm run type-check` once, only in S0 and S7 (shared types);
  - rules tests with `pnpm run test:rules` scoped to the touched file.
  - **No session runs full `validate`/`lint`/`test`.**
- **Every slice prompt includes:**
  - "Read `docs/multilingual-pronunciation-engine.md` §1, §4, §5 and your slice";
  - "Contracts in §5 are frozen";
  - "No comments longer than one line";
  - "Tour anchors per F30".

### 9.2 Sessions

| Wave | Session | Slice                                             | Model, effort                               | Depends on |
| ---- | ------- | ------------------------------------------------- | ------------------------------------------- | ---------- |
| 0    | S0      | Contracts, groups, flag, key list                 | Opus 5.5, high                              | —          |
| 1    | S1      | Verdict engine                                    | Opus 5.5, xhigh                             | S0         |
| 1    | S2      | Recognizer runtime, Worker, model host            | Opus 5.5, high                              | S0         |
| 1    | S3      | Phoneme lookup callable                           | Opus 5.5, high                              | S0         |
| 1    | S4      | Corpus fetch and gate harness                     | Sonnet 5.5, high                            | S0         |
| 1    | S5      | Sound names and all locale copy                   | Sonnet 5.5, high                            | S0         |
| 1    | S6      | Admin defaults panel                              | Sonnet 5.5, medium                          | S0         |
| 1    | S7      | Persistence: rules, adapters, strip sites, stamps | Opus 5.5, high                              | S0         |
| 2    | S8      | Editor: Speak settings and card review            | Sonnet 5.5, high                            | W1         |
| 2    | S9      | Speak player                                      | Opus 5.5, high                              | W1         |
| 2    | S10     | Connector + assign stepper Speak step             | Sonnet 5.5, medium                          | W1         |
| 2    | S11     | Gate run and calibration                          | Opus 5.5, high                              | W1         |
| 3    | S12     | Study results Speaking view                       | Sonnet 5.5, high                            | W2         |
| 3    | S13     | End-to-end, polish and release wiring             | Opus 5.5, high; Haiku 5.5 low for docs/TODO | W2         |

S12 is in wave 3 only because it reads real progress written by S9; it can start against fixtures in wave 2 if the orchestrator wants the time back.

### 9.3 Slice specs

Each slice lists **owns** (exclusive files), **does**, and **done when**.

**S0 — Contracts (Opus, high).**

- **Owns:** `types.ts` (Speak additions only), `config/pronunciationGroups.ts`, `config/featureDefaults.ts`, `locales/en.json` (`flashcards.speak.*` only).
- **Does:**
  - writes the §5 types verbatim;
  - writes the §4.2 groups and tolerance lists and the §4.3 presets as data;
  - adds a test that every token is in `xlsr53EspeakVocab.json` and every preset names only real groups;
  - adds the `flashcards-speak` `GlobalFeature` id and the F15 entry, and does **not** touch `featureMissingDoc.ts`;
  - commits the full `flashcards.speak.*` English key list (draft copy) and the matching `es`/`de`/`fr` keys as English placeholders, so the parity test stays green;
  - runs `pnpm run type-check`.
- **Done when:** type-check, the groups test and the feature-defaults tests pass, and the PR is merged.

**S1 — Verdict engine (Opus, xhigh).**

- **Owns:** `utils/pronunciation/verdict.ts`, `verdict.test.ts`, `utils/pronunciation/score.ts` (additive only).
- **Does:**
  - implements §4.1 and §4.4 exactly over `evaluatePronunciation`'s alignment, with dialect selection and `effectiveGroupSettings`;
  - writes stress through `detectStress` results passed in;
  - computes the F8 tally delta.
- **Done when:** the tests cover:
  - every row of §4.1;
  - every preset × group setting;
  - `final` pairs at and away from the end;
  - tolerance pairs never tallied;
  - Exact beating Accepted across dialects, and the accuracy tie-break;
  - each unclear rule;
  - a different word reading Not yet;
  - a fast-check property: forgiving a group never makes a verdict worse, and requiring never makes it better.

**S2 — Recognizer runtime (Opus, high).**

- **Owns:**
  - `utils/pronunciation/recognizer.ts`, `recognizer.worker.ts`, `modelCache.ts`;
  - `hooks/useAudioRecording.ts` (additive `audioBitsPerSecond`/`constraints` options only);
  - `components/dev/PronunciationDevHarness.tsx`;
  - `config/pronunciationModel.ts`, `storage.rules`, `storage.cors.json`;
  - `scripts/upload-pronunciation-model.mjs`, `NOTICE`.
- **Does:**
  - implements the §5 `Recognizer` with the F26 boundary;
  - fetches with progress, verifies integrity and caches (F27, F28);
  - probes `too-slow` on the first decode;
  - computes confidence and voicedMs;
  - ports the harness onto it, keeping the harness's model-URL override;
  - adds F25's options with defaults unchanged.
- **Done when:**
  - unit tests cover the state machine, integrity failure and the metered prompt rule;
  - a harness run on localhost decodes the committed retroflex clips identically to before;
  - `useAudioRecording` tests pass unchanged.

**S3 — Phoneme lookup callable (Opus, high).**

- **Owns:** `functions/src/pronunciation/**`, the export line in `functions/src/index.ts`, `functions/package.json` (espeak dependency only).
- **Does:**
  - implements `lookupSpeakReferencesV1` per §5;
  - **First step, a go/no-go before anything else in S3: prove an espeak-ng build runs in Node 24 Cloud Functions without apt.**
    - The candidate is `@echogarden/espeak-ng-emscripten` (0.3.5 on npm, GPL-3.0-only, checked 2026-10-19). Pin the exact version.
    - **Go** means all four hold:
      - it loads and phonemizes in a deployed dev function, not only locally, with es-419, es-ES, de-DE and en-US voices;
      - its IPA matches espeak-ng 1.51 (the spikes' version) on the spike word lists, or every difference is listed and none changes a token after `tokenizeIpa`;
      - a cold start plus a 500-term batch finishes inside the callable timeout;
      - memory stays within a 1 GiB function.
    - **No-go fallback:** a minimal Cloud Run service on the dev project (`Dockerfile` with `apt-get install espeak-ng`, pinned to 1.51) behind an authenticated internal endpoint that only `lookupSpeakReferencesV1` calls. It has the same GPL posture (server-side, only IPA output stored), so G19's counsel brief is unchanged.
    - The S3 PR states which path was taken and the measured numbers. **If the fallback is taken, S3 stops and the orchestrator asks Paul before building it**, because it adds a deployed service and a deploy step to `plan-deploy.sh`.
  - mirrors `tokenizeIpa` (as `functions/src/flashcardMatch.ts` mirrors its client file), with a test that the two agree;
  - runs the CMUDict cross-check for `en` (committed dictionary with its licence);
  - computes stress references per R1–R5 (Spanish by spelling rule, from `scripts/spikes/stress-reference/reference.ts`);
  - computes `letterSpans` with a per-language grapheme↔phoneme DP aligner seeded by a small pair table, omitting spans when the alignment cost exceeds a bound;
  - maps every #2383 failure to `FlashcardSpeakReason`;
  - batches up to 500 terms within the callable timeout;
  - checks the server-side feature gate with `isGlobalFeatureGranted` (`functions/src/quizMediaArchive.ts:598`), moved to a shared module if S3 needs it outside that file.
- **Done when:**
  - function tests cover each reason and a 500-term batch time;
  - `letterSpans` is present for at least 95% of a 200-word es/de/en sample;
  - the GPL note is recorded in the PR for G19.

**S4 — Corpus and gate harness (Sonnet, high).**

- **Owns:** `scripts/pronunciation-corpus/**`, `tests/fixtures/pronunciation-corpus/**`, `.github/workflows/pronunciation-gate.yml`.
- **Does:**
  - builds the §8 fetch with manifest, credits and FLAC conversion;
  - **respects Wikimedia's rate limits.** The Commons API returned HTTP 429 from a cloud session on 2026-10-19. The fetch:
    - sends a descriptive `User-Agent` with a contact address, per Wikimedia's policy;
    - makes one request at a time, with at least 1 s between requests;
    - honours `Retry-After` and backs off exponentially on 429/503;
    - batches metadata lookups (`titles=` up to 50 per call);
    - can resume from a partial `manifest.json`.
  - **If cloud sessions stay rate-limited:** S4 commits the script and a 5-clip smoke subset, and Paul runs the full fetch once from his machine (P6). The clips are committed, so CI and S11 never call Wikimedia.
  - writes the controls;
  - builds the mutated-reference generator;
  - writes `gate.mjs` against the §5 `judgeSpeech` and a Node recognizer path (it imports S2's pure decode helpers once merged; until then it builds against the contract);
  - writes the workflow with model caching.
- **Done when:**
  - the fetch is reproducible from the manifest;
  - the gate runs end to end on a 5-clip smoke subset;
  - the full run is S11's.

**S5 — Sound names and copy (Sonnet, high).**

- **Owns:** `config/pronunciationSoundNames.ts` (#2361), and `locales/{en,es,de,fr}.json` (`flashcards.speak.*` and admin panel keys).
- **Does:**
  - for every token reachable in es/de/en references and every group, writes a plain name, an example word and a one-line articulation hint in all four UI locales;
  - finalises all §4.5/F12/F28/F29 copy against the §7 copy rules;
  - runs `deslop --writing`.
- **Done when:**
  - a test asserts coverage of every token in `xlsr53Nuclei.json` plus every group pair's tokens for the three languages;
  - the locale parity test passes.

**S6 — Admin defaults (Sonnet, medium).**

- **Owns:** `config/flashcardsSpeakAdmin.ts` (normalizer), `components/admin/FlashcardsSpeakConfigurationPanel.tsx`, and its registration in the Admin Settings widget-config list.
- **Does:**
  - implements F22 and §4.3's district defaults with the `quiz-read-aloud` pattern;
  - adds tour anchors per F30;
  - adds the panel to the scroll-padding e2e if it is a tabbed panel (CLAUDE.md).
- **Done when:** the normalizer tests (bad input → defaults) and a render test pass.

**S7 — Persistence (Opus, high).**

- **Owns:**
  - `firestore.rules` and the `tests/rules/flashcards*.test.ts` and `plcFlashcards.test.ts` files;
  - `components/flashcards/adapters.ts`;
  - `utils/flashcardSchedule.ts` (a `buildSpeakRoundQueue` helper);
  - the strip sites in §6: `hooks/useFlashcardSets.ts`, `functions/src/mcp/flashcardStore.ts`, `functions/src/subLaunchAssignment.ts`;
  - `hooks/useFlashcardAssignments.ts` and `components/widgets/Flashcards/utils/flashcardAssign.ts` (the F21 stamp builder `buildSpeakStamp(set, canSpeak, adminConfig, lock)`).
- **Does:**
  - all §6 rules changes with tests (allowed shapes, oversize maps rejected, PLC and snapshot keys);
  - `recordSpeak` on all adapters, and sanitize/clone/diff of the new fields;
  - carries `speak` through every strip site, with `mergeCards` invalidating on a term change;
  - stamping on save, snapshot, open-session rewrite and assign;
  - runs `node scripts/releaseFirestoreRules.mjs spartboard-dev` and `pnpm run check:rules-size`;
  - runs `pnpm run type-check`.
- **Done when:**
  - the rules tests and adapter round-trip tests pass;
  - there is a test that saving a set without the flag removes the stamp from the snapshot and open sessions;
  - the rules size check passes.

**S8 — Editor (Sonnet, high).**

- **Owns:** `components/widgets/Flashcards/FlashcardEditor.tsx` and new files under `components/widgets/Flashcards/speak/`, plus their anchors in `config/tourAnchors.ts` and `config/tourSurfaces/library.ts`.
- **Does:**
  - F11 and §4.3 UI: the Speak panel (dialects, preset picker, Strict, Advanced group rows with example words, attempts, Hear it toggle);
  - per-card status chips and Hear it;
  - the top review list;
  - Advanced IPA override validated by `tokenizeIpa`;
  - calls `lookupSpeakReferencesV1` on save for new or changed terms only, with progress and a non-blocking failure (`lookup-failed`, retry on next save);
  - gates everything on `canAccessFeature('flashcards-speak')`.
- **Done when:**
  - editor tests cover preset → custom, flags not blocking save, and only changed terms re-looked-up;
  - `/show-me` screenshots of the panel at both widths are in the PR.

**S9 — Speak player (Opus, high).**

- **Owns:** `components/flashcards/SpeakMode.tsx`, `components/flashcards/speak/**`, and `components/flashcards/FlashcardPlayer.tsx` (Speak integration only).
- **Does:**
  - F1, F5, F12, §4.4, F23, F24, F28, F29 and §4.5;
  - mode availability from the stamp and the language;
  - its own queue via `buildSpeakRoundQueue`/`speakRound`;
  - attempts, with unclear free;
  - decides on the deciding attempt, then `adapter.recordSpeak`;
  - locked settings read-only;
  - keyboard map and states per §7;
  - capture through `useAudioRecording` with F25 options and `onTakeReady`;
  - the recognizer via `getRecognizer()`.
- **Done when:**
  - `FlashcardPlayer.test.tsx`-style tests with a fake recognizer (`setRecognizerForTests`) cover Exact / Accepted / Not yet / unclear ×3 → mic check, attempts exhausted, an unavailable card skipped, locked settings, every F12 reason, and progress written to `speak` (not `cards`);
  - `break-ui` worst cases pass;
  - `/show-me` screenshots of every verdict are in the PR.

**S10 — Connector and assign step (Sonnet, medium).**

- **Owns:** `functions/src/mcp/tools.ts` (flashcard tools only), `components/widgets/Flashcards/FlashcardAssignStepper.tsx`, and a new `FlashcardsSpeakStep.tsx`, with its anchors.
- **Does:**
  - connector `create_`/`update_flashcard_set` accept optional `speak` settings, and run the lookup server-side by calling S3's function directly, so needs-review cards wait for the teacher;
  - the Study **Speak** step (show, lock) per §4.3.
- **Done when:** the connector tests and the stepper tests pass.

**S11 — Gate run and calibration (Opus, high).**

- **Owns:** `docs/pronunciation-gate-results.md`, default values in `config/pronunciationGroups.ts` (tolerance list and presets only, with Paul's yes), and `unclearConfidence` defaults in `config/flashcardsSpeakAdmin.ts`.
- **Does:**
  - runs the full gate;
  - calibrates per §8;
  - fixes scorer or group-table causes, coordinating with the S1 owner through the orchestrator;
  - answers the German `??` question from the corpus;
  - posts the results table in the PR.
- **Done when:** every §8 CI row is at or above its threshold, or the PR states which is not and asks Paul.

**S12 — Study results (Sonnet, high).**

- **Owns:** `utils/flashcardResults.ts` (speak rows), `components/widgets/Flashcards/results/**` (Speaking view), and anchors.
- **Does:**
  - F10 per-student and class views, using `config/pronunciationSoundNames.ts`;
  - "—" for never-ran;
  - **words to check**.
- **Done when:**
  - unit tests on rows and aggregates (including the 5-student / 60% rule) pass;
  - `/show-me` screenshots are in the PR.

**S13 — End to end and release (Opus, high; Haiku, low for the docs lines).**

- **Owns:** `tests/e2e/flashcards-speak.spec.ts`, `docs/AI_MODELS.md` (G21 section), the `CLAUDE.md` one-liner under Layout, `PAUL_TODO.md`, `AGENT_BACKLOG.md`, and this doc's status block.
- **Does:**
  - Playwright on `vite-harness` with the fake recognizer: teacher saves a Speak set, assigns Study with a lock, student practises to mastery aloud, teacher sees the Speaking view;
  - the long-task check from §7;
  - `pnpm run check:tour-anchors` and `tests/tourAnchorRoutes.test.ts`;
  - `verify-spartboard` proof;
  - the PR description states the flag, its starting access, and the admin path (CLAUDE.md release rule);
  - Haiku writes the G21 docs and TODO lines from S13's notes.
- **Done when:** the e2e is green in CI, the anchors check passes, and the docs are merged.

---

## 10. Paul-only actions

- **P1.** Send the espeak counsel brief (G19). S3's PR includes the facts it needs: server-side only, IPA output stored, no distribution to clients.
- **P2.** After S2 merges: `node scripts/upload-pronunciation-model.mjs --project dev`, and at release `--project prod`.
- **P3.** The Chromebook recheck on the Speak capture path (§8), after S2.
- **P4.** Yes or no on any S11 calibration proposal (tolerance pairs, preset defaults).
- **P5.** Review **words to check** during the admin-only period; flip the flag per the release rule.
- **P6.** Only if S4 reports cloud rate-limiting: run `node scripts/pronunciation-corpus/fetch.mjs` once locally and push the clips it writes.
- **P7.** Only if S3 reports no-go: approve or decline the Cloud Run fallback.

---

## 11. Evidence on hand

### 11.1 Bias probe (`pronunciation-bias-probe/`, #2332, #2344)

- Gemini `3.5-flash-lite` showed no bias toward the target and caught the tap error 20/20.
- Once Spanish is named, it never reports English `ɹ` (0/40), and it falsely passes `ɹ` as a trill 15% of the time.
- Not used (D1). It is the fallback if on-device fails.

### 11.2 Retroflex screen (`retroflex-confusion/`, #2355)

- `ɹ` survives every quantization at about 0.79 posterior.
- **A correct Spanish tap reads as a trill** (#2379, open), hence §4.2's tolerance pair.
- A held trill reads as `rr`, hence T1.

### 11.3 Reference phonemes and stress

| Language | Result                                               |
| -------- | ---------------------------------------------------- |
| English  | espeak scores 94.1% / 97.1% on a K-12 word list      |
| Spanish  | Stress from spelling rules agrees with espeak 99.65% |
| German   | Stress rule tops out at about 81–86%                 |

### 11.4 Never tested (the S11 corpus answers the first two for natives)

- Learner speech: no child and no L2 speaker has been decoded.
- Stress cue weights against real audio (#2366).
- German final devoicing and ü in audio.

### 11.5 Chromebook runtime (#2350, measured 2026-10-14)

District Chromebook (ChromeOS 14541, Chrome 151, 8 cores, 4 GB), q4 model, `onnxruntime-web` 1.30, single thread.

| Measure                     | Result                                                   |
| --------------------------- | -------------------------------------------------------- |
| First download (241 MB)     | 14.7 s, then 4.7 s to start the session                  |
| Reopen from Cache Storage   | 2.1 s read + 1.5 s session                               |
| JS heap after load          | about 270 MB                                             |
| CPU decode, 0.7–0.85 s clip | 4.2–4.9 s, about 6× real time; warm is no faster         |
| CPU decode, 2.8 s mic take  | 12.5 s untrimmed                                         |
| Agreement with Python q4    | 9 of 10; trill 3 reads `pero` for `perro`, same under T1 |
| WebGPU                      | session loads, then the first decode never returns       |

**Decision (Paul, 2026-10-14):** pass for single words, CPU in a Worker, silence trimmed, WebGPU off. P3 adds the Speak capture path here.

---

## 12. Settled engine decisions

### 12.1 August 2026 tickets

| #      | Decision               | Verdict                                                                                                                                                          | Ticket       |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **D1** | Where recognition runs | On the student's device: a CTC phoneme model through `onnxruntime-web`. Reference phonemes are computed on the server at save.                                   | #2333        |
| —      | Model                  | `facebook/wav2vec2-xlsr-53-espeak-cv-ft`, `qnighy` ONNX export, pinned q4 (241 MB), 392 tokens, no stress marks. Call the model directly, never `pipeline()`.    | #2349        |
| D3     | Gate                   | A `GlobalFeature`.                                                                                                                                               | —            |
| D5     | Languages              | Spanish, German, English.                                                                                                                                        | —            |
| —      | English references     | espeak with a CMUDict cross-check; disagreement → review flag (5.9% of items).                                                                                   | #2336        |
| —      | Alignment              | A1–A13: insertions get real entries; PER internal; an unknown level or an empty reference throws; ties go to substitution; no prose from the engine.             | #2335        |
| —      | Held sounds            | T1–T3: a repeat of the neighbouring recognized token costs 0 and is `held`.                                                                                      | #2380        |
| —      | Stress                 | S1–S5: one syllable index per word from four cues; pitch measured in-house (no `pitchy`). R1–R5: two reference sources per language; disagreement → unconfirmed. | #2359, #2360 |

The spike code lags its decisions (`alignment-engine/engine.ts` has four statuses). Feature code follows `DECISIONS.md` and `utils/pronunciation/`.

### 12.2 Engine port calls (accepted by Paul, 2026-10-19)

- **T1 is charged once per run:** `p o` heard as `p r r o` is one insertion plus one `held`.
- **A held vowel is one syllable for stress.** A doubled vowel that the reference also doubles stays two (T4).
- **The tokenizer picks the fewest tokens, and no token spans a stress mark.** Run on 34,000 es/de/en words, it never failed and gave every polysyllable its primary stress.
- **Failure returns no tokens:**
  - `?` → `unrenderable` (116 of 12,000 German words);
  - no tokenization → `untokenizable` with its position;
  - `(en)…(de)` spans keep the English phonemes and return `languageSwitches`, shown to the teacher (136 German words).
- **The `??` vocab token** stays refused by the tokenizer until S11's corpus shows what the model emits for German _durch_/_wurde_.

---

## 13. The graded quiz `'speak'` type (later, its own decision)

The 2026-10-13 grill (G1–G22) designed a graded quiz item. It follows once Speak has classroom evidence, behind `quiz-speak-questions` (G20: `widget: 'quiz'`, `group: 'questions'`, `requires: 'quiz-media-response'`).

It reuses S1–S3 and S9's capture and feedback pieces. When it starts, revisit:

- G7's numeric marks versus §4's verdicts. A grade probably wants Speak's verdict plus `points × best accuracy` (G6).
- G9: the deciding attempt archived to teacher Drive.
- G10: the notice variant.
- G12: teacher override with a reason.
- G14: tampering flags.
- G17: score later.

**Carried into Speak:** G1, G4, G5, G15, G16, G18, G19, G21, G22, in the adapted form recorded in §3. **Superseded for Speak:** G7 (by §4), G8 (by F23), G11 (by §8).

---

## 14. Spike inventory

| Spike                       | Ticket | Status                                                  |
| --------------------------- | ------ | ------------------------------------------------------- |
| `pronunciation-bias-probe/` | #2332  | Run; deletable per its README (D1 is recorded)          |
| `alignment-engine/`         | #2335  | Accepted; code lags T1–T5                               |
| `english-g2p-probe/`        | #2336  | Run (Python)                                            |
| `retroflex-confusion/`      | #2355  | Run; browser check owed (S2's harness run covers it)    |
| `stress-detection/`         | #2359  | Accepted; cue weights untested (S11)                    |
| `stress-reference/`         | #2360  | Accepted; S3 ports `reference.ts`                       |
| `token-runs/`               | #2380  | Accepted; implemented in `utils/pronunciation/score.ts` |

The TypeScript spikes run under `pnpm test` (`vitest.config.ts` does not exclude `scripts/spikes`).
