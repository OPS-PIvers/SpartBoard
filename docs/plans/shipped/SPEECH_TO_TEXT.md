# Speech to text: a dictation accommodation

Approved by Paul 2026-11-19 (grilling session, cloud). Both PRs are built (#6291 and the paid extras); what is left is Paul's testing, tracked in PAUL_TODO.md. Glossary term: **Speech to text** (`GLOSSARY.md`, Student work). Two PRs, each built by parallel agents on separate files after one shared contract commit.

## Problem

A student who can't type well has no way to answer a written question in SpartBoard. Read aloud covers reading; nothing covers writing. No speech recognition exists anywhere in the app: Flashcards Speak's on-device model outputs phonemes, not words, so it can't be reused.

## Decisions

### What it is

- **D1. Speech to text is a per-student accommodation**, a new `speechToText` key on `StudentOverride` beside `readAloud`. A student who has it gets a **Dictate** button on written answers.
- **D2. Teachers set it in three places:** My Classes > Roster > Accommodations, the assign stepper's modifications step (all six steppers that use `ModificationsView`), and as a modification group rule. There is no assignment-wide "everyone can dictate" switch.
- **D3. Students dictate in Quiz and Writing only:** quiz short answer, essay and fill-in-the-blank (a compact mic that takes one short phrase), and the Writing editor. Video Activity, Flashcards, Activity Wall and Mini Apps are out of this plan.
- **D4. Name.** "Speech to text" on the accommodation row, chips and admin settings. "Dictate" on the student's button. "Dictated" on the teacher's marker.

### Engines

- **D5. The free engine is the browser's built-in recognition wrapped in our own layer.** On a Chromebook that is Google's server recogniser at no cost. Our layer adds: words shown live, automatic restart after the browser's pause timeout, the browser's `unspokenPunctuation` where it exists (Chrome 151+), spoken punctuation ("period", "comma", "new line") and local capitalisation where it doesn't, and "undo that". Detect every capability at runtime; never sniff the browser.
- **D6. Where the browser has no recognition, the Dictate button is hidden.** No on-device model, no new model download.
- **D7. Every engine sits behind one interface** (`utils/speechToText/`), so the paid engine in PR 2 is a second implementation and nothing else changes.
- **D8. The paid engine is a hybrid, admin-gated and off by default.** The free engine still shows live words. Each time the student pauses, that clip goes through `generateAi` to Gemini's non-live transcription model, and the returned text replaces the preview. We send speech only, so silence is never billed. No live socket, no relay service.
- **D9. AI tidy-up is admin-gated and off by default.** The student taps "Tidy up" on a passage they just dictated. The model may add only punctuation, capitals and paragraph breaks. The function rejects the result if the sequence of words differs from the input. The student sees before and after and can undo.
- **D10. Each paid piece has its own monthly cap.** Past the cap, dictation carries on with the free engine with no message to the student, and the Tidy up button disappears. Admins see usage against the cap.

- **D8a. The paid engine's model is the admin's pick on the AI tab.** The default is the standard Gemini model, which takes our "exact words, natural punctuation" instruction. Gemini 3.5 Transcribe can be picked instead (audio features only). It takes no instructions, so the AI router sends it only the audio, the language and a mode.
- **D8b. The admin chooses that model's mode** (Paul, 2026-11-19): Exact words (the default; no punctuation from the model, so the client keeps the free engine's punctuation where the words line up) or Smart (punctuates, but also fixes grammar and drops repeats).

### Rules of use

- **D11. The recording is never stored.** Audio lives in memory while it is transcribed. Only text is kept.
- **D12. Languages:** English, plus the student's translation language (`StudentOverride.language`: Spanish, Somali, Hmong, Russian today) when the engine recognises it, with a switch on the mic. When the engine reports the language as unsupported, the student dictates in English and the teacher's accommodation row says dictation isn't available in that language.
- **D13. Dictation works when copy and paste are blocked.** An accommodation is not overridden by Focus mode or Writing's paste approval. Dictated text is never recorded as a paste.
- **D14. The teacher can see what was dictated.** Quiz answers get a "Dictated" chip in the grader and results. In Writing, dictated text is its own edit kind in the Writing record, with its own count in the summary and its own label in playback.
- **D15. Eligibility.** The free engine works for any student whose assignment carries the accommodation, PIN joiners included wherever their overrides already reach them. The paid engine and tidy-up need a signed-in student so usage is metered against a real account.

### Rollout

- **D16. One flag: `speech-to-text`**, `stage: 'preview'`, `defaultAccessLevel: 'admin'`, `afterLaunch: 'keep'`. It gates the teacher's control (so only flagged teachers can grant it) and is checked by the student app through the override it reads. The paid engine and tidy-up each have their own admin setting on top, both off in both projects.
- **D17. Two PRs.** PR 1 is the whole free accommodation. PR 2 is the paid engine, tidy-up, admin panel and caps. PR 2 can start once PR 1's contract commit is on `dev-paul`.
- **D18. No changelog entry until the flag opens to everyone.**

## Cost

- **PR 1 costs nothing.** No function calls, no Storage, no model download.
- **Paid engine:** Gemini 3.5 Transcribe is listed at $2 per million audio input tokens (25 tokens per second) and $12 per million output tokens, about half a cent per minute of speech; the live model is $3.50 and $21. Thirty students dictating ten minutes a week for a school year is roughly $55. These are Google AI Studio's list prices; Vertex prices may differ.
- **Tidy-up:** one short text call per tap, on the cheapest text tier.

## Facts the build depends on

Checked 2026-11-19; re-check before relying on a line number.

- `StudentOverride` is at `types.ts:7339`. Roster defaults live in the roster's Drive JSON (`ClassRoster.defaultOverridesByStudentId`), parsed by `parseStudentOverride` (`hooks/useRosters.ts:234`). **A key the parser doesn't list is dropped on reload.**
- At assign time roster defaults are copied into per-student overrides (`utils/studentTargetRef.ts`), cleaned by `sanitizeOverride` in `functions/src/studentAssignmentTargets.ts` (which has its own copy of the type) and written to the student's pointer doc. The student app reads it with `hooks/useStudentAssignmentPointer.ts`. Only the server writes pointers, so the new key needs no rules change.
- One contenteditable, `components/quiz/WrittenResponseEditor.tsx`, serves quiz short answer, quiz essay and the Writing editor. Fill-in-the-blank is `components/quiz/FibMultiBlankInput.tsx`.
- Writing cancels unapproved paste, drop and yank in a `beforeinput` listener (`hooks/useWritingPiece.ts`) and logs every edit with a `WritingEditKind` (`utils/writingLog.ts`: `typed`, `pasted`, `sync`, `restored`, `format`).
- The Writing summary's keys are fixed by `wrSummaryOk` in `firestore.rules`. New summary keys need a rules change; read `.claude/rules/firestore-rules.md` first.
- Quiz responses carry a loosely validated per-attempt `inputSignals` map (`signalsOk` in `firestore.rules`), shown by `components/common/InputSignalsPopover.tsx`.
- The microphone gate already exists (`components/quiz/recording/MicrophoneGate.tsx`).
- An audio AI integration already exists as a pattern: `plc-meeting-transcribe` in `functions/src/aiIntegrations.ts` and `config/aiIntegrations.ts`.
- Read aloud's admin panel, settings doc and monthly counter (`components/admin/QuizReadAloudConfigurationPanel.tsx`, `config/quizReadAloud.ts`, `functions/src/quizReadAloud.ts`) are the model for PR 2's panel and caps.

## PR 1: the free accommodation

### Contract commit (one agent, first, alone)

Everything two agents would otherwise both touch. After this commit the four agents below never edit the same file.

- `types.ts`: `StudentOverride.speechToText?: boolean`; `GlobalFeature` gains `'speech-to-text'`; the quiz input signal for a dictated answer.
- `functions/src/studentAssignmentTargets.ts`: the type copy and `sanitizeOverride`, with a test in `studentAssignmentTargets.test.ts`.
- `hooks/useRosters.ts` `parseStudentOverride`: keep `speechToText`, with a test. Check whether dropping `spellingHelp`, `answerChoices`, `supports` and `modifiedQuestions` there is intended; if it is a bug, file it, don't fix it here.
- `config/featureDefaults.ts` and `functions/src/featureMissingDoc.ts`: the flag (D16).
- `utils/speechToText/types.ts`: the engine interface (start, stop, interim and final text events, error and unsupported-language events, capability flags) and the `useDictation` hook's signature, with a stub hook that reports "unsupported".
- `components/quiz/WrittenResponseEditor.tsx`: only the new optional `dictation` prop's type, not its behaviour.
- `utils/writingLog.ts`: add `'dictated'` to `WritingEditKind`.
- `locales/{en,es,fr,de}.json`: every string this PR needs, so no agent edits a locale file.
- `config/tourAnchors.ts` and the matching `config/tourSurfaces/` entries: anchors for the accommodation checkbox, the group rule and the Dictate button.

### Agent A: the teacher's side

`components/common/library/OverrideEditorRow.tsx`, `components/classes/RosterAccommodationsList.tsx`, `RosterEditorModal.tsx`, `SidebarClasses.tsx`, `assignStepper/ModificationsView.tsx` and helpers, `modificationGroups.ts`, `ModificationGroupsStep.tsx`, `AssignTargetingSection.tsx`, the six assign steppers, `utils/studentOverrideSummary.ts`, and their tests.

- A "Speech to text" checkbox beside Read aloud, shown only with the flag. It appears in the Quiz and Writing steppers' rows and on the roster; the other four steppers carry the key through untouched so a roster default is not lost, but show no control (D3).
- The group rule, its label and its chip.
- The "not available in this language" note (D12) on the row. The supported-language list comes from Agent B's module.

### Agent B: the engine and the Dictate control

`utils/speechToText/*` (except `types.ts`), `components/common/dictate/*`, a `/*-dev` harness page, and tests.

- The built-in engine implementation and everything in D5.
- The language map from translation codes to recognition locales, and the runtime unsupported-language path (D12).
- `DictateButton` in two sizes (full and the compact fill-in-the-blank one), with listening, error and mic-blocked states, reusing `MicrophoneGate`.
- Unit tests for the punctuation and capitalisation rules, restart and undo, against a fake engine.

### Agent C: Quiz

`components/quiz/WrittenResponseEditor.tsx`, `FibMultiBlankInput.tsx`, `QuizStudentApp.tsx`, `StudentAccommodationBar.tsx`, `components/common/InputSignalsPopover.tsx`, and the shared grader and results shells under `components/widgets/QuizWidget/components/` (read `.claude/rules/assignment-shells.md` first).

- The editor's `dictation` behaviour: insert at the caret, show interim text without saving it, and let dictated text through when `blockClipboard` is on (D13).
- The compact mic in a focused blank.
- Record the dictated signal on the response and show the "Dictated" chip (D14). Check `signalsOk` accepts the new signal; if it doesn't, the rules change belongs to Agent D, who owns `firestore.rules` in this PR.

### Agent D: Writing

`components/widgets/**/Writing*` student files (`WritingAssignmentPage.tsx`, `WritingStudentShell.tsx`), `hooks/useWritingPiece.ts`, `utils/writingSaveFlow.ts`, `utils/writingLog.ts` (beyond the type), `components/common/WritingRecord.tsx`, `WritingPlayback.tsx`, `firestore.rules`, `tests/rules/`, and `docs/plans/WRITING_ASSIGNMENT.md`.

- Pass `dictation` to the editor when the override has `speechToText`.
- Log dictated insertions as `dictated`, never `typed`, `pasted` or `sync`, and never cancel them in the `beforeinput` guard (D13).
- Add dictated count and characters to the summary, `wrSummaryOk`, the Writing record and playback (D14), with rules tests. Stay inside the rules size budget.
- In `WRITING_ASSIGNMENT.md`, remove "Voice typing" from the non-goals and point to this plan.

### Finishing PR 1

The orchestrating session merges the four agents' work, runs `pnpm exec vitest related --run` on the changed files and `pnpm run type-check` once (shared types changed), then verifies on `vite-dev`: grant the accommodation on a roster, assign a quiz and a Writing piece, dictate as the mock class student, and check the chip and the Writing record. The PR description names the flag and its admin path (Admin Settings > Access > Previews), and adds the flag's row to the `PAUL_TODO.md` flags table.

## PR 2: the paid extras

### Contract commit

- `functions/src/aiIntegrations.ts` and `config/aiIntegrations.ts`: `speech-to-text-transcribe` (audio) and `speech-to-text-tidy` (text). Confirm the router's model list includes Gemini's non-live transcription model; add it if not (`docs/AI_MODELS.md`).
- `types.ts` and `config/speechToText.ts`: the settings shape (engine choice, tidy-up on or off, the two caps), the `admin_settings` doc id, the monthly usage doc id, and defaults with everything off.
- `config/rolloutSwitches.ts` if the settings count as an org-wide switch.
- `functions/codebases.json` if the new function goes in a non-default codebase.
- Locale strings and tour anchors for the panel and the Tidy up button.

### Agent E: the functions

`functions/src/speechToText.ts` and its tests.

- A callable that takes one short clip, checks the caller is a signed-in student whose pointer carries `speechToText` (D15), checks the setting and the cap, calls `generateAi`, counts usage, and returns text or "use the free engine" (D10).
- A tidy-up callable with the same checks and the word-sequence comparison (D9).
- Bound the clip length and size per call and the calls per student per minute.

### Agent F: the student's side

`utils/speechToText/hybridEngine.ts`, `components/common/dictate/TidyUp*`, and tests.

- The hybrid engine (D8): record while the built-in engine listens, cut a clip at each pause, replace the preview with the returned text, and fall back silently on any refusal or error.
- The Tidy up button with before, after and undo.
- How the student app learns the setting: follow how Read aloud's settings reach `useQuizReadAloud`.

### Agent G: the admin's side

`components/admin/SpeechToTextConfigurationPanel.tsx`, its registration in Admin Settings, `firestore.rules` for the settings and usage docs, `tests/rules/`.

- Engine choice, the tidy-up switch, both caps and this month's usage, modelled on the Read aloud panel.
- Both settings ship off in both projects.

### Finishing PR 2

Verify on `vite-dev` with the settings switched on in dev: dictate with the hybrid engine, tap Tidy up, then set a cap of zero and confirm dictation continues on the free engine and the button disappears.

## Checks only Paul can do

Tracked as PT-264. On a district Chromebook, on the dev site after PR 1 deploys:

1. Is pause-based punctuation active on ChromeOS, or does the student have to say "period"?
2. Is Somali recognised? Is Hmong?
3. Does the district's microphone policy allow the site, or does IT need to add it?
4. How accurate is it for a student's voice in a classroom with background noise? This decides whether the paid engine is worth switching on.

## Not in this plan

- Video Activity, Flashcards, Activity Wall and Mini Apps.
- An on-device model, a live streaming connection to Gemini, or storing audio.
- AI that changes a student's words.
- An assignment-wide dictation switch.
