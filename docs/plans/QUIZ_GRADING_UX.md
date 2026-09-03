# Quiz grading UX — implementation plan

Settled 2026-09-03 via grill session. Four independent PRs, all branched off `main`, all targeting `main`. Land in the order below; PRs 2–4 do not depend on each other.

Decisions recorded here are final. Do not re-open them during implementation; if a decision proves unworkable, stop and surface it.

---

## PR 1 — FRQ stats bar shows average score, not % graded

### Problem

`QuestionsScreen` in `components/widgets/QuizWidget/components/QuizResults.tsx` (accumulator ~L2000–2062, bar value ~L2076–2088) treats free-response questions as "graded / total" and draws that as the bar. Points are never read. The header `%` chip (~L2117) is gated on `showAuto`, so FRQ questions show a bar with no number and no label. Mixed questions (auto primary + manual addendum) show only the auto part. The Sheets export "Question Analysis" tab (`utils/quizDriveService.ts` ~L686–770) has the same defect: `% Correct` is all-or-nothing for FRQ.

### Semantics (decided)

- Bar value for any question with a manually graded part = mean over graded, non-excused responses of `pointsEarned / pointsMax`, where `pointsMax` is the question's base `q.points ?? 1`. Rubric overrides do not change the denominator (matches grader and scoreboard today).
- Ungraded responses drop out of the mean; they never count as zero.
- Mixed auto + addendum questions use the combined ratio.
- `%` chip renders for FRQ questions too. Bar gets an accessible label. A caption "n of m graded" sits beside the chip. When n = 0: empty bar, caption "Not graded yet".
- Sheets export: FRQ rows report average percent; auto rows keep `# Correct / # Answered / % Correct`.
- All new strings go through i18n (`locales/en.json`, `de.json`, `es.json`, `fr.json`). The rest of `QuestionsScreen` stays hardcoded; do not retro-translate it in this PR.

### Implementation

1. **Reuse, don't rewrite the math.** `components/widgets/QuizWidget/utils/quizScoreboard.ts` already folds a response's answer through `gradeAnswer(q, answer, manualGrade)` and `applyMediaSlots(q, r, …)` into `GradeResult { pointsEarned, pointsMax, state, excused }` (see `getEarnedPoints` ~L51–127). Extract a pure helper:
   ```ts
   // utils/quizQuestionStats.ts
   export interface QuestionStat {
     autoTotal: number;
     correct: number; // unchanged
     manualTotal: number;
     graded: number; // unchanged
     scoredCount: number;
     ratioSum: number; // new
     averagePct: number | null; // scoredCount ? round(ratioSum/scoredCount*100) : null
   }
   export function computeQuestionStats(
     quiz,
     responses,
     gradeFn
   ): Map<questionId, QuestionStat>;
   ```
   Per response per question: get `GradeResult`; if `excused` → skip; if `state === 'scored'` → `scoredCount++`, `ratioSum += pointsEarned / max(pointsMax, 1)`; if `awaiting-grade` → counted in `manualTotal` only. Keep the existing auto/manual counters so the count chips keep working.
2. Replace the inline `questionStats` memo in `QuizResults.tsx` with a call to the helper.
3. Bar value: `pct = stats.autoTotal > 0 && stats.manualTotal === 0 ? autoPct : (stats.averagePct ?? 0)`. Note: for pure-auto questions `averagePct` equals `autoPct` already, so simply `pct = stats.averagePct ?? 0` is correct everywhere; prefer that and delete `gradedPct`.
4. Chip: render `{pct}%` whenever `stats.averagePct !== null` (drop the `showAuto` gate). Caption when `showManual`: `t('quizResults.stats.gradedOf', { n: stats.graded, m: stats.manualTotal })`; when `averagePct === null` and `showManual`: `t('quizResults.stats.notGradedYet')`.
5. Bar: add `role="img"` and `aria-label={t('quizResults.stats.barLabel', { pct })}` on the outer div.
6. Export: in `quizDriveService.ts` Question Analysis, call the same helper; for FRQ rows write `averagePct` into a renamed column `Avg %`, leave `# Correct` blank for FRQ rows.
7. Locale keys (all four files): `quizResults.stats.gradedOf`, `quizResults.stats.notGradedYet`, `quizResults.stats.barLabel`, `quizResults.stats.avgPercentColumn`.

### Tests

- Extend `tests/components/widgets/QuizResults.questionStats.test.tsx`: assert bar `style.width` and chip text for (a) FRQ 3 graded at 8/10, 6/10, ungraded → 70%, caption "2 of 3 graded"; (b) FRQ none graded → chip absent, "Not graded yet"; (c) excused response excluded; (d) mixed auto+addendum combined ratio.
- New `utils/quizQuestionStats.test.ts` for the pure helper.
- Extend `tests/utils/assignmentExportShared.test.ts` (or the quizDriveService test if one exists) for the `Avg %` column.

### Verification

`pnpm vitest run tests/components/widgets/QuizResults.questionStats.test.tsx utils/quizQuestionStats.test.ts`, then `pnpm run lint`, `pnpm run type-check`, `pnpm run format:check`.

---

## PR 2 — Grader auto-save, auto-advance, By-Student mode

All in `components/widgets/QuizWidget/components/FreeResponseGrader.tsx` (1257 lines) plus `components/common/EditorModalShell.tsx`, `context/AuthContext.tsx`, `context/AuthContextValue.ts`. Mount sites unchanged: `QuizResults.tsx` ~L1854 and `components/classroomAddon/TeacherReviewRoute.tsx` ~L629; both pass `onSaveGrade` / `onClearGrade` and inherit everything below.

### 2a. Persistence layer: grade completion + write queue

**Definition of "complete".** A grade for the current target is complete when:

- rubric present and every criterion has a selected level, OR
- no rubric (or override mode `'points'`) and the points input parses to a finite number in `[0, maxPoints]`, OR
- `excused === true`.

Implement as `isGradeComplete(draft, rubric, maxPoints): boolean` in a new `utils/gradeDraft.ts` alongside a `buildGradeFromDraft(...)` extracted from the current `handleSave` (~L521–651) so the validation logic exists once.

**Write policy (decided: no draft flag, no schema change).**

- Complete grade → write immediately (one `onSaveGrade` call). No debounce needed; completion is the event.
- Incomplete grade → held in component state only. Flushed via the same validation `handleSave` uses today (partial rubric banks the running sum; comment-only with no score is _not_ written) when the teacher navigates away from the target or closes the modal.
- Re-edit of a complete grade (e.g. tweaking the comment after the rubric is done) → debounce 800 ms via `hooks/useDebouncedCallback.ts`, flush on navigate/close.

**Write queue with retry.** New hook `hooks/useGradeWriteQueue.ts`:

```ts
enqueue(responseKey, targetKey, grade)   // dedupes by responseKey+targetKey, latest wins
status: 'idle' | 'saving' | 'saved' | 'error'
failed: Array<{ responseKey; targetKey; studentName; error }>
retryAll(); flushAll(): Promise<void>
```

Backoff 1s, 3s, 9s then park in `failed`. Navigation is never blocked. On close: if `failed.length > 0`, `window.confirm` naming the affected students; otherwise close immediately. Remove `confirmDiscardMessage` usage and the `go()` dirty-guard (~L462–469).

**Shell changes** (`EditorModalShell.tsx`): add `hideSaveButton?: boolean` and render `headerExtras` as-is. Keep the Save button for other consumers. Grader passes `hideSaveButton` and renders a status chip in `headerExtras`:

- `saving` → spinner + "Saving…"
- `saved` → check + "Saved" (fades after 2 s)
- `error` → red "Couldn't save · Retry" button → `retryAll()`

Keyboard: Escape → same close path as the X button.

### 2b. Auto-advance

State: `advanceArmedAt: number | null`. A single `useEffect` owns one `setTimeout(ADVANCE_DELAY_MS = 900)`; clearing it on any cancel.

**Arming rules:**

- Rubric question: arm when `isGradeComplete` flips `false → true` for this target during this visit. Track `wasCompleteOnEnterRef` per target; if the grade was already complete when the teacher landed here, never arm (decided: re-grading does not advance).
- Points-only question: arm on `Enter` in the points input, or when typing goes idle for `POINTS_IDLE_MS = 1500` with a complete value. Any further keystroke resets the idle timer and cancels an armed advance.
- Excuse button: write immediately and arm.
- Undo excuse: write, do not arm.

**Cancel rules:** any `pointerdown` or `keydown` inside the right rail while armed → cancel. Implement with a single capture-phase listener on the rail container; ignore the event that armed it (compare timestamps).

**Visual:** the Next button in the right rail gets a CSS fill animation (`transform: scaleX` on an inner overlay, `animation-duration: 900ms`, `motion-reduce` → instant fill with no animation but same delay). On fire → call `advance()`.

**Auto-advance switch:** in the header next to the mode toggle. Off → nothing arms; Next/Enter still work manually.

### 2c. Traversal model + By-Student mode

Replace `questionIdx` / `studentIdx` / `slotName` navigation with a flat ordered list of targets:

```ts
interface GradeTarget { questionId; responseKey; studentUid; studentName; targetKey; slot; isGraded: boolean }
buildTraversal(mode: 'question' | 'student', questions, responses): GradeTarget[]
```

- `'question'`: for each question → for each student in queue order (today's `buildQueue` order) → slots.
- `'student'`: for each student → for each question → slots.

Position = index into that list. `advance()` (used by auto-advance, Next button, Enter, `ArrowRight`/`j`) moves to the next target with `isGraded === false`; if none remain after the current position, wrap search from 0; if still none, stay and show an inline "All graded" pill next to Next for 2 s. `retreat()` mirrors it. Header chevrons and the left-rail list are _manual_ moves that ignore `isGraded`.

Left rail: student list in both modes (decided). In `'student'` mode the center column gains a question stepper (label "Q3 of 7", prev/next) and the header chevrons switch from question-prev/next to student-prev/next.

`isGraded` derives from `readSlotGrade(response.grading, questionId, slot)` (utils/mediaGrading.ts:54) recomputed from props on every render; do not cache.

### 2d. Preferences

Two new fields on `/users/{uid}/userProfile/profile`, mirroring `quizMonitorScoreDisplay` (`context/AuthContext.tsx` ~L341 state, ~L1682 hydration, ~L2044/2058/2068 update path, `context/AuthContextValue.ts` ~L194):

- `quizGraderMode: 'question' | 'student'` default `'question'`
- `quizGraderAutoAdvance: boolean` default `true`

Type-guard on hydration; `{ merge: true }` on write (DashboardContext co-owns the doc). Grader reads them from `useAuth()` and writes via `updateAccountPreferences` on toggle. Classroom add-on route already sits under `AuthProvider`, so it gets them for free.

### Tests

- `tests/context/AuthContext.quizGraderPrefs.test.tsx` — copy the six invariants in `AuthContext.quizMonitorPrefs.test.tsx` for both fields.
- `utils/gradeDraft.test.ts` — completion rules incl. partial rubric, override mode `'points'`, excused.
- `utils/gradeTraversal.test.ts` — both orders, skip-graded, wrap, all-graded.
- `tests/components/quiz/FreeResponseGrader.autosave.test.tsx` — complete rubric → one write; rubric clicked slowly → still one write; comment tweak after completion → debounced second write; navigate with partial → flush; failed write → chip + retry + no navigation block; close with failed → confirm.
- `tests/components/quiz/FreeResponseGrader.autoAdvance.test.tsx` — fake timers: arms on last criterion, fires at 900 ms, click in rail cancels, Enter arms, "1" then "5" within 1.5 s does not split, already-complete grade never arms, switch off never arms, excuse arms.
- `tests/components/quiz/FreeResponseGrader.studentMode.test.tsx` — traversal order, stepper, chevrons, j/k follow mode.
- Update existing six grader test files for the removed Save button / confirm dialog (`FreeResponseGrader.escape.portal.test.tsx` in particular).

### Verification

Unit suites above, then `MediaGradingDevView` (`components/dev/MediaGradingDevView.tsx`, dev-only harness) via the `vite-dev` launch config for a manual click-through and screenshot of: status chip states, fill animation, mode toggle, student-mode stepper.

---

## PR 3 — Audio waveform + skip-to-speech

File: `components/widgets/QuizWidget/components/AudioAnnotatedResponseView.tsx`. The hidden `<audio>` (~L143) already receives an object URL resolved in `FreeResponseGrader.tsx` ~L407–439; blobs are ≤ 5 MB (`utils/quizMediaUpload.ts` `MAX_QUIZ_MEDIA_BYTES`). Audio only; video and whiteboard views untouched.

### Implementation

1. **Decode hook** `hooks/useAudioPeaks.ts`:
   ```ts
   useAudioPeaks(src: string | null, buckets = 400): { peaks: Float32Array | null; silent: boolean[] | null; status: 'idle'|'loading'|'ready'|'unsupported' }
   ```
   `fetch(src).arrayBuffer()` → `getAudioCtx().decodeAudioData` (shared singleton from `utils/timeToolAudio.ts`; do not create a new `AudioContext`). Mix channels, split into `buckets` windows, peak = max abs sample, RMS per window for silence. Normalize peaks to `[0,1]`. Silence: `rms < SILENCE_RMS = 0.02` (tune against a real recording; expose as a constant). Abort on `src` change; catch → `'unsupported'`, `logError`, no toast.
2. **Canvas** `components/quiz/recording/WaveformScrubber.tsx`: props `peaks, silent, durationMs, currentMs, markers: {ms, id}[], onSeek(ms), onPointerMark?`. Draw with `devicePixelRatio`; played portion in brand blue, unplayed in slate-400, silent windows shaded slate-700/40. Annotation markers drawn on top (keep existing marker rendering semantics from ~L175 range block). Click/drag → `onSeek`. Keyboard: focusable, ArrowLeft/Right ±2 s, Home/End. `role="slider"` with `aria-valuenow/min/max` in seconds.
3. Replace the `<input type="range">` (~L175) with `WaveformScrubber` when `status === 'ready'`; render the existing range input when `'unsupported'` or `'loading'` (loading shows a thin indeterminate bar above it).
4. **Skip to speech** button next to play/pause: from `currentMs`, find the next window index where `silent[i] === false` after a run of `silent === true`; seek to its start minus 150 ms. Hidden when `status !== 'ready'` or no silent windows exist.
5. Reduced motion: no animated cursor easing; cursor jumps.

### Tests

- `hooks/useAudioPeaks.test.ts` with a mocked `decodeAudioData` returning a synthetic buffer (tone + silence gaps): asserts bucket count, normalization, silence mask, unsupported fallback.
- `tests/components/quiz/WaveformScrubber.test.tsx`: seek on click maps x → ms; keyboard seek; skip-to-speech target computation (extract `nextSpeechStart(silent, fromIdx)` as a pure fn and test it directly).
- Extend `tests/components/quiz/AnnotatedResponseView.test.tsx` for fallback rendering when decode fails.

### Verification

`MediaGradingDevView` with a real `.webm` fixture; screenshot waveform, silence shading, and skip button.

---

## PR 4 — Show attached stimuli in the grader

`FreeResponseGrader.tsx` renders only `question.text` in the center sticky header (~L855). Students see stimuli (`QuizStudentApp.tsx` ~L2838, ~L2913) and the post-publish review uses `CollapsibleStimuli` from `components/quiz/QuizStimulusView.tsx` (~L526).

### Implementation

1. Resolve `resolveStimuli(question.stimulusIds, quiz.stimuli)` (`utils/quizStimuli.ts:119`). The grader receives `quiz` already; confirm `stimuli` is on the object passed from both mount sites (it is `QuizData.stimuli` / `QuizSession.stimuli`; `TeacherReviewRoute` may pass the session — check and thread through).
2. Render `<CollapsibleStimuli stimuli={…} defaultCollapsed />` directly under the question text, collapsed by default, no play limits enforced for the teacher.
3. Doc-shaped stimuli (pdf/gdoc-embed) render inside the same collapsible; no resizable side panel in the grader.

### Tests

- `tests/components/quiz/FreeResponseGrader.stimuli.test.tsx`: renders collapsed header when stimuli exist, nothing when none, expands on click.

### Verification

Unit test plus one screenshot from `MediaGradingDevView` with a fixture question carrying an image stimulus.

---

## Out of scope (explicitly)

- Draft flag on `WrittenAnswerGrade` (rejected: no schema/rules change).
- Per-student rubric override affecting max points (unchanged behaviour).
- Waveform for video or whiteboard responses.
- Translating the rest of `QuestionsScreen`.
- Student-side stimulus rendering (confirmed working).
