# Plan 006: A video activity resumes where the student was, and its question card works with a keyboard and screen reader

- **Priority**: P2 · **Effort**: M · **Risk**: MED · **Depends on**: none
- **Category**: bug (resume, accessibility, touch)
- **Planned at**: commit `9a9dd678`, 2026-11-14

## Why this matters

A student who refreshes mid-video starts again at 0:00 with no scrubber, and
must rewatch everything to reach the next unanswered question, although their
answers are kept. The question card that appears over the video is a plain
`div`: screen readers are not told it appeared, options do not report whether
they are selected, and the right/wrong result is not announced before the
video resumes. Graded multi-select options differ by colour only. The PIN
field uses 14px text (iPhone zoom), has no programmatic label, and says
"Roster PIN" where the quiz says "Your PIN".

## Current state

- `components/videoActivity/VideoActivityStudentApp.tsx`: `answeredQuestionIds` is a memo `new Set((myResponse?.answers ?? []).map((answer) => answer.questionId))`; `sortedQuestions` is the question list sorted by `timestamp` (seconds). The player state comes from `selfPacedPlayerReducer` (`utils/videoActivityState.ts`), which has an event `{ type: 'rewind'; time: number; nonce: number }` that sets `seekRequest: { time, nonce }`. Find the existing `dispatchPlayer({ type: 'rewind', ...` call to see how `nonce` is produced and copy that. `playheadRef` (passed to `<VideoPlayer playheadRef=...>`) holds the current time in seconds.
- `components/videoActivity/VideoPlayer.tsx`: applies a seek in this effect, which silently drops a request that arrives before the player exists:

  ```tsx
  useEffect(() => {
    if (!seekRequest || !playerRef.current) return;
    if (lastSeekNonceRef.current === seekRequest.nonce) return;

    lastSeekNonceRef.current = seekRequest.nonce;
    triggeredRef.current.clear();
    playerRef.current.seekTo(Math.max(0, seekRequest.time), true);

    // Only auto-resume if a question overlay is not currently visible.
    if (!questionVisibleRef.current) {
      playerRef.current.playVideo();
    }
  }, [seekRequest]);
  ```

  The anti-skip guard pulls the playhead back when `currentTime > maxAllowedRef.current`; the time of the last answered question is never past that limit.

- `components/videoActivity/QuestionOverlay.tsx`: the card root is a `div` whose class includes `max-h-full overflow-y-auto`. Multiple-choice options are `button`s; multi-select options are `button`s with a check box drawn inside. The result banner contains `✓ Correct! Resuming video…` / `✗ Incorrect. Rewinding section…`. Single-choice graded rows already show `CheckCircle2` / `XCircle` icons; multi-select graded rows only change border and background.
- `components/videoActivity/NoteOverlay.tsx` is the model: `role="dialog"` with a label and `autoFocus` on its button.
- These files are hard-coded English (no `t()`); keep new strings in English.

## Scope

**In scope**: `components/videoActivity/VideoActivityStudentApp.tsx`,
`components/videoActivity/VideoPlayer.tsx`,
`components/videoActivity/QuestionOverlay.tsx`,
`components/videoActivity/VideoPlayer.test.tsx`,
`tests/components/videoActivity/QuestionOverlay.test.tsx`, and a new test file
under `tests/components/videoActivity/` for resume.

**Out of scope**: `utils/videoActivityState.ts`, `hooks/useVideoActivitySession.ts`,
`VideoActivityLiveStudent.tsx`, `NoteOverlay.tsx`, the player's `playerVars`,
captions and a control bar, the teacher widget
(`components/widgets/VideoActivityWidget/`), translating this area.

## Steps

### Step 1: The player applies a seek that arrived before it was ready

In `VideoPlayer.tsx`:

1. Keep the latest request in a ref: `const seekRequestRef = useRef(seekRequest);` and assign `seekRequestRef.current = seekRequest;` inside one of the existing `useLayoutEffect` blocks that mirror props into refs (add `seekRequest` to that effect's dependency list), or a new `useLayoutEffect(() => { seekRequestRef.current = seekRequest; }, [seekRequest]);`.
2. In `onReady`, before the `autoPlayRef` check, apply a pending request once:

   ```tsx
   const pending = seekRequestRef.current;
   if (pending && lastSeekNonceRef.current !== pending.nonce) {
     lastSeekNonceRef.current = pending.nonce;
     playerRef.current?.seekTo(Math.max(0, pending.time), true);
   }
   ```

   Do not call `playVideo()` here; the existing `autoPlay` line below decides that.

Tests in `VideoPlayer.test.tsx` (it has a mock player and controls when `onReady` fires): a `seekRequest` present before ready → `seekTo` called once with that time when ready fires; the same nonce is not applied again by the existing effect afterwards.

**Verify**: `pnpm exec vitest run --maxWorkers=2 components/videoActivity/VideoPlayer.test.tsx` → all pass.

### Step 2: Resume at the last answered question

In the self-paced player component of `VideoActivityStudentApp.tsx` (the one that owns `dispatchPlayer`, `answeredQuestionIds`, `sortedQuestions` and `playheadRef`), add one effect that runs the resume once per mount:

```tsx
const resumeDoneRef = useRef(false);
useEffect(() => {
  if (resumeDoneRef.current || answeredQuestionIds.size === 0) return;
  resumeDoneRef.current = true;
  const time = sortedQuestions.reduce(
    (latest, q) =>
      answeredQuestionIds.has(q.id) ? Math.max(latest, q.timestamp) : latest,
    0
  );
  if (time > (playheadRef.current ?? 0) + 2) {
    dispatchPlayer({ type: 'rewind', time, nonce: <same nonce source as the existing rewind call> });
  }
}, [answeredQuestionIds, sortedQuestions]);
```

This is a sync with the external video player, so an effect is correct. It
fires once: on a rejoin (answers arrive, playhead near 0) it seeks forward; on
a fresh attempt the first answer happens with the playhead already at that
question, so the `+ 2` check skips the seek and the one-shot is spent.

Guards to add to the first `if`: do nothing in live (teacher-paced) mode, in
preview mode, or when the response is already completed. Use the flags this
component already has for those (for example `liveEnded` / the live-mode
boolean, `previewKey`, `isVaResponseCompleted(myResponse)`); if you cannot
identify the live-mode flag with certainty, STOP.

Check the `playheadRef` declaration type before reading it; if it is not a
ref to a number, adapt the read and say so in NOTES.

Tests (new file under `tests/components/videoActivity/`, copying the mocks from
`VideoActivityStudentApp.failedCompletion.test.tsx`, where `VideoPlayer` is
mocked): render with a response that already has an answer to a question at
`timestamp: 120`; assert the mocked `VideoPlayer` received a `seekRequest`
with `time: 120`. Render with no answers; assert `seekRequest` is null/absent.

**Verify**: `pnpm exec vitest run --maxWorkers=2 tests/components/videoActivity` → all pass.

### Step 3: Question card is a real dialog, results are announced

In `QuestionOverlay.tsx`:

1. Card root: add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the question text element (give that element an `id` from `useId()` and `tabIndex={-1}` plus class `focus:outline-hidden`).
2. Move focus into the card when it appears: a ref on the question text element and an effect with an empty dependency list that calls `.focus({ preventScroll: true })`, unless the question type renders an input with `autoFocus` (fill-in and short answer do; keep their `autoFocus` and skip the manual focus for those types).
3. Multiple-choice option buttons: add `aria-pressed={selected}` (use the boolean the button already uses for its selected style).
4. Multi-select option buttons: add `role="checkbox"` and `aria-checked={checked}`.
5. Result banner (the element containing `Correct! Resuming video…` / `Incorrect. Rewinding section…`): add `role="status"`.
6. Graded multi-select rows: add an icon so the outcome is not colour-only, reusing the icons the single-choice rows use: `CheckCircle2` on a correct option the student picked, `XCircle` on a wrong option the student picked, and when the correct answers are revealed and the student missed one, `CheckCircle2` plus the visually hidden text `<span className="sr-only">missed</span>`. Give each icon `aria-hidden="true"` and add `<span className="sr-only">correct</span>` / `<span className="sr-only">incorrect</span>` beside it. Only render these when the row is in its graded state (use the same condition that switches its graded colours).
7. Dimmed graded options that use `text-slate-400` for the option text: change to `text-slate-600`.

Tests in `tests/components/videoActivity/QuestionOverlay.test.tsx` (existing file; follow its render helper): the card has `role="dialog"`; a selected MC option has `aria-pressed="true"`; a multi-select option has `role="checkbox"` and toggles `aria-checked`; after a graded multi-select result the wrong pick's row contains the text `incorrect`; the result banner has `role="status"`.

**Verify**: `pnpm exec vitest run --maxWorkers=2 tests/components/videoActivity/QuestionOverlay.test.tsx` → all pass.

### Step 4: PIN field

In `VideoActivityStudentApp.tsx`, the PIN form: change the label text `Roster PIN` to `Your PIN`; give the input `id` (from `useId()`) and the label a matching `htmlFor`; change the input's `text-sm` to `text-base`. Change nothing else on the form.

Update any existing test that looks the field up by `Roster PIN`.

**Verify**: `pnpm exec vitest run --maxWorkers=2 tests/components/videoActivity components/videoActivity tests/copyGuard.test.ts` → all pass. `grep -rn "Roster PIN" components/videoActivity` → no matches.

## Done criteria

- [ ] `pnpm exec vitest run --maxWorkers=2 tests/components/videoActivity components/videoActivity components/widgets/VideoActivityWidget tests/copyGuard.test.ts` exits 0 with the new tests present.
- [ ] `pnpm run check:tour-anchors` exits 0.
- [ ] `git diff 9a9dd678 -- utils/videoActivityState.ts hooks/useVideoActivitySession.ts` is empty.
- [ ] `git status --short` shows only in-scope files.

## STOP conditions

- The live-mode flag for Step 2 cannot be identified with certainty.
- `QuestionOverlay` is also rendered by the teacher widget in a way these attribute changes would break (attributes alone should not; a focus steal on the teacher's board would: if the overlay is used there, skip the focus effect when it is and say so in NOTES).
- Any test in `VideoActivityStudentApp.live.test.tsx` or `.periodAccess.test.tsx` fails.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Resume lands on the last answered question, not the exact second the student left. Storing the playhead would need a write per interval and a rules change.
- With autoplay off, a resumed video is positioned but waits for the student to press play, as before.
