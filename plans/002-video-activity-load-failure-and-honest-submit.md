# Plan 002: A video activity student is told when the video can't play, sees "submitted" only once it is, and always has a next step

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan
> in `plans/README.md`, unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat db70831b..HEAD -- components/videoActivity/ utils/youtube.ts utils/videoActivityState.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Line numbers below are from commit
> `db70831b`; always locate code by the quoted text, not the number.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `db70831b`, 2026-11-14

## Why this matters

A Video Activity plays a YouTube video that stops to ask questions. Three
things go wrong for students today:

1. If the video cannot load (YouTube blocked by the school filter, the video
   removed or set private, embedding turned off, or a link that is not a
   YouTube link), the student sees a black rectangle forever. Nothing says
   what happened or what to do, and the teacher never hears about it.
2. When the video ends, the screen says "Results submitted to your teacher"
   before the submit has been saved. On a weak connection the student closes
   the tab believing the work is in. If the save fails they are sent back to
   the video with an unexplained "Finish activity" button.
3. The finished screen and the error screens have no button. A signed-in
   student has a "Back to my assignments" button after a quiz but not after a
   video, and an error screen says "please refresh" with nothing to press.

## Current state

Files:

- `components/videoActivity/VideoPlayer.tsx` (427 lines): wraps the YouTube
  IFrame player. Shared by the student app and the teacher's widget.
- `components/videoActivity/VideoActivityStudentApp.tsx` (1,424 lines): join,
  player page, finished screen, and the `ErrorScreen` helper.
- `utils/youtube.ts`: loads the YouTube IFrame API script once and declares
  the `window.YT` types (which already include `onError`).
- `utils/videoActivityState.ts`: the self-paced player reducer.
- `components/videoActivity/VideoPlayer.test.tsx` and
  `tests/components/videoActivity/VideoActivityStudentApp.failedCompletion.test.tsx`:
  test patterns to follow.

The player setup effect (`VideoPlayer.tsx`, about line 302). Note there is no
`onError` handler and nothing happens when the id is missing or the API never
calls back:

```tsx
  useEffect(() => {
    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId || !containerRef.current) return;

    let destroyed = false;
    ...
    load(() => {
      if (destroyed || !containerRef.current) return;
      ...
      playerRef.current = new YT.Player(inPopup ? div : divId, {
        ...
        events: {
          onReady: () => {
            if (autoPlayRef.current && !pausedRef.current) {
              playerRef.current?.playVideo();
            }
            startPolling();
          },
          onStateChange: (event: { data: number }) => {
```

What the component renders (end of `VideoPlayer.tsx`):

```tsx
return (
  <div className="relative w-full h-full bg-black">
    <div
      ref={containerRef}
      className="w-full h-full [&>div]:w-full [&>div]:h-full [&_iframe]:w-full [&_iframe]:h-full"
    />
  </div>
);
```

The script loader (`utils/youtube.ts`, about line 23) appends the tag with no
`onerror`:

```ts
const tag = document.createElement('script');
tag.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(tag);
```

The reducer (`utils/videoActivityState.ts`, about line 320):

```ts
  /** finishing and finished show the completion screen; retry offers Finish activity. */
  finish: 'watching' | 'finishing' | 'finished' | 'retry';
...
/** The video reached its end and the completion screen shows (the old `videoEnded` flag). */
export const selfPacedVideoEnded = (state: SelfPacedPlayerState): boolean =>
  state.finish === 'finishing' || state.finish === 'finished';
```

In `VideoActivityStudentApp.tsx`, inside the component that receives
`isStudentRole` as a prop (about line 300):

```tsx
const videoEnded = selfPacedVideoEnded(player);
const finishPending = player.finish === 'retry';
```

Live (teacher-paced) completion state, same component (about line 641):

```tsx
const liveNeedsComplete =
  liveEnded &&
  joinStatus === 'joined' &&
  !isViewOnly &&
  myResponse != null &&
  !isVaResponseCompleted(myResponse);
```

The finished screen (about line 1100). It shows for `videoEnded`, a completed
response, the attempt cap, or `liveEnded`:

```tsx
                  <h2 className="text-emerald-700 font-black text-xl">
                    Activity Complete!
                  </h2>
...
                  <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Results submitted to your teacher
                  </div>
```

The retry overlay on the player page (about line 1350):

```tsx
{
  finishPending && !periodPaused && (
    <div className="absolute inset-0 z-30 bg-slate-900/80 flex items-center justify-center p-6">
      <button
        onClick={() => void handleVideoEnd()}
        className="px-8 py-4 bg-white text-slate-900 font-bold rounded-xl active:scale-95 transition-transform"
      >
        Finish activity
      </button>
    </div>
  );
}
```

The error helper (end of the file) and its two uses:

```tsx
const ErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-linear-to-b from-white to-slate-100 flex flex-col items-center justify-center gap-3 p-6">
    <AlertCircle className="w-8 h-8 text-red-500" />
    <p className="text-slate-700 text-sm text-center">{message}</p>
  </div>
);
```

- About line 219, in the outer component that owns `const [isStudentRole, setIsStudentRole] = useState(false);`:
  `<ErrorScreen message="Unable to connect. Please refresh and try again." />`
- About line 932, in the inner component that has the `isStudentRole` prop:
  `return <ErrorScreen message={error ?? ssoAutoJoinError ?? ''} />;`

Repo conventions that apply:

- **Comments are one short line at most.**
- **`useEffect` only to sync with an external system** (the YouTube player and timers qualify). Derived values are computed during render.
- **New code never reads or writes `ref.current` during render.**
- **UI copy**: no em dashes, no "Tip:" or "Note:", under 30 words per string. The Video Activity student screens are hard-coded English today (no `t()`); keep new strings in English in the code to match. Translating this area is separate work.
- **Every new control needs a tour anchor or an opt-out comment** on the line above it: `// no-tour-anchor: student screen; live tours walk teachers.` Inside JSX use `{/* no-tour-anchor: student screen; live tours walk teachers. */}`.
- **Tap targets are at least 44px tall** (`min-h-[44px]`).
- **Never run** `pnpm run validate`, full `pnpm run lint`, full `pnpm run test` or `tsc`.

## Commands you will need

| Purpose                                     | Command                                          | Expected on success |
| ------------------------------------------- | ------------------------------------------------ | ------------------- |
| Install (only if `node_modules` is missing) | `pnpm run install:all`                           | exit 0              |
| One test file                               | `pnpm exec vitest run <path>`                    | all pass            |
| Tests for changed files                     | `pnpm exec vitest related --run <changed files>` | all pass            |
| Copy rules                                  | `pnpm exec vitest run tests/copyGuard.test.ts`   | all pass            |
| Tour anchors                                | `pnpm run check:tour-anchors`                    | exit 0              |
| Types (once, at the end)                    | `pnpm run type-check`                            | exit 0              |

Do not put `--` between the script name and its flags.

## Scope

**In scope** (the only files you should modify):

- `components/videoActivity/VideoPlayer.tsx`
- `components/videoActivity/VideoPlayer.test.tsx`
- `components/videoActivity/VideoActivityStudentApp.tsx`
- `utils/youtube.ts`
- `tests/components/videoActivity/VideoActivityStudentApp.failedCompletion.test.tsx`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- `utils/videoActivityState.ts`: the reducer and `selfPacedVideoEnded` stay as they are. Other code and tests depend on `finishing` counting as ended.
- `hooks/useVideoActivitySession.ts`, `firestore.rules`, `functions/`.
- `components/videoActivity/QuestionOverlay.tsx`, `NoteOverlay.tsx`, `VideoActivityLiveStudent.tsx`.
- The player's `playerVars` (`controls: 0`, `fs: 0`, `disablekb: 1`). They stop students skipping ahead; do not change them.
- Resuming the video position after a refresh, captions and player controls. Separate work.
- `components/widgets/MusicWidget*`, which also uses `utils/youtube.ts`. Your change to that file must not alter what existing callers see.

## Git workflow

- Branch from `origin/dev-paul`: `git fetch origin dev-paul && git checkout -b claude/va-load-failure-honest-submit origin/dev-paul`.
- Commit message style from `git log`: `Quiz editor: drag a file or paste an image onto a question's stimuli`. Use `Video activity: ...`.
- Pull requests target `dev-paul`, never `main`. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Let the script loader report a failed load

In `utils/youtube.ts`, change `loadYouTubeApi` to accept an optional second argument and call it when the script tag fails. Existing one-argument callers must behave exactly as before.

```ts
const ytErrorCallbacks: (() => void)[] = [];

export const loadYouTubeApi = (
  callback: () => void,
  onError?: () => void
): void => {
  if (window.YT?.Player) {
    callback();
    return;
  }
  ytPendingCallbacks.push(callback);
  if (onError) ytErrorCallbacks.push(onError);
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    ...existing handler setup, unchanged...
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => ytErrorCallbacks.splice(0).forEach((cb) => cb());
    document.head.appendChild(tag);
  }
};
```

Also clear `ytErrorCallbacks` (`ytErrorCallbacks.length = 0`) inside the existing `window.onYouTubeIframeAPIReady` handler, after the pending callbacks run. Leave `loadYouTubeApiIn` alone.

**Verify**: `pnpm exec vitest related --run utils/youtube.ts` → all pass.

### Step 2: Show a card in the player when the video can't play

In `components/videoActivity/VideoPlayer.tsx`:

1. Add `useState` to the React import. Add state: `const [failed, setFailed] = useState(false);`
2. Add a module constant: `const PLAYER_READY_TIMEOUT_MS = 15000;`
3. In the setup effect quoted in "Current state":
   - Keep the first two lines as they are (an empty or invalid link returns early; that case is handled in render, item 4).
   - Right after `let destroyed = false;` start a timer:
     `const readyTimer = window.setTimeout(() => { if (!destroyed) setFailed(true); }, PLAYER_READY_TIMEOUT_MS);`
   - For the non-popup loader, pass a failure callback. Replace the `load` const with:
     ```tsx
     const fail = () => {
       if (!destroyed) setFailed(true);
     };
     const load = inPopup
       ? (cb: () => void) => loadYouTubeApiIn(hostWin, cb)
       : (cb: () => void) => loadYouTubeApi(cb, fail);
     ```
   - In `onReady`, as its first two statements: `window.clearTimeout(readyTimer); setFailed(false);`
   - Add to `events`: `onError: () => { window.clearTimeout(readyTimer); fail(); },`
   - In the effect's cleanup function (find the `return () => {` that sets `destroyed = true`), add `window.clearTimeout(readyTimer);`
4. Compute during render, above the `return`:
   `const badLink = youtubeUrl.trim() !== '' && !extractYouTubeId(youtubeUrl);`
5. Change the returned JSX to:

   ```tsx
   return (
     <div className="relative w-full h-full bg-black">
       <div
         ref={containerRef}
         className="w-full h-full [&>div]:w-full [&>div]:h-full [&_iframe]:w-full [&_iframe]:h-full"
       />
       {(failed || badLink) && (
         <div
           role="alert"
           className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center"
         >
           <p className="text-base font-bold text-white">
             This video won&rsquo;t play here.
           </p>
           <p className="text-sm text-slate-200">Tell your teacher.</p>
           {/* no-tour-anchor: video failure card; live tours walk teachers. */}
           <button
             type="button"
             onClick={() => window.location.reload()}
             className="min-h-[44px] rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-slate-900"
           >
             Try again
           </button>
         </div>
       )}
     </div>
   );
   ```

The existing mock of `@/utils/youtube` in `VideoPlayer.test.tsx` defines `loadYouTubeApi: (callback) => mockLoadYouTubeApi(callback)`. Update it to pass the second argument through so tests can call it.

Add tests to `components/videoActivity/VideoPlayer.test.tsx`, using its existing `MockYTPlayer` and mock helpers:

- A link `extractYouTubeId` returns `null` for renders `This video won't play here.` (match with a regex such as `/won.t play here/`).
- An empty `youtubeUrl` renders no failure card.
- When the mocked player's `events.onError` is called, the card appears.
- With fake timers, when `onReady` is never called, the card appears after 15,000 ms; when `onReady` is called first, it does not.
- When the script failure callback (second argument to `loadYouTubeApi`) is called, the card appears.

**Verify**: `pnpm exec vitest run components/videoActivity/VideoPlayer.test.tsx` → all pass, including the new cases.

### Step 3: Say "submitting" until the submit has saved

In `components/videoActivity/VideoActivityStudentApp.tsx`:

1. Next to `const finishPending = player.finish === 'retry';` add:
   `const finishSaving = player.finish === 'finishing';`
2. Find the JSX block with `Results submitted to your teacher`. Replace that one `<div>` with:

   ```tsx
   {
     finishSaving || liveNeedsComplete ? (
       <div
         role="status"
         className="flex items-center justify-center gap-2 text-slate-600 text-sm font-bold"
       >
         <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
         Submitting your results. Keep this tab open.
       </div>
     ) : (
       <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm font-bold">
         <CheckCircle2 className="w-4 h-4" />
         Results submitted to your teacher
       </div>
     );
   }
   ```

   `Loader2` is already imported in this file (it is used by `FullPageLoader`). `liveNeedsComplete` is declared earlier in the same component; if it is not in scope at this JSX, STOP.

3. In the retry overlay (the block with the `Finish activity` button), make the container a column and add one line above the button:

   ```tsx
   <div className="absolute inset-0 z-30 bg-slate-900/80 flex flex-col items-center justify-center gap-4 p-6 text-center">
     <p role="alert" className="text-sm font-bold text-white">
       Couldn&rsquo;t submit. Check your connection.
     </p>
     <button ...unchanged...>Finish activity</button>
   </div>
   ```

Add to `tests/components/videoActivity/VideoActivityStudentApp.failedCompletion.test.tsx`, modelled on its two existing tests:

- While the mocked `completeActivity` promise is still pending, the screen shows `Submitting your results` and does not show `Results submitted to your teacher`.
- After it resolves, `Results submitted to your teacher` shows.
- After it rejects, `Couldn't submit. Check your connection.` shows above `Finish activity` (match the apostrophe with a regex such as `/Couldn.t submit/`).

**Verify**: `pnpm exec vitest run tests/components/videoActivity` → all pass.

### Step 4: Give the finished and error screens a next step

1. Change `ErrorScreen` to take an optional prop and render buttons:

   ```tsx
   const ErrorScreen: React.FC<{
     message: string;
     backToAssignments?: boolean;
   }> = ({ message, backToAssignments = false }) => (
     <div className="min-h-screen bg-linear-to-b from-white to-slate-100 flex flex-col items-center justify-center gap-3 p-6">
       <AlertCircle className="w-8 h-8 text-red-500" />
       <p className="text-slate-700 text-sm text-center">{message}</p>
       {/* no-tour-anchor: student error screen; live tours walk teachers. */}
       <button
         type="button"
         onClick={() => window.location.reload()}
         className="min-h-[44px] rounded-full bg-brand-blue-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-blue-dark"
       >
         Try again
       </button>
       {backToAssignments && (
         // no-tour-anchor: student error screen; live tours walk teachers.
         <a
           href="/my-assignments"
           className="inline-flex min-h-[44px] items-center px-5 text-sm font-bold text-brand-blue-primary"
         >
           Back to my assignments
         </a>
       )}
     </div>
   );
   ```

2. Pass `backToAssignments={isStudentRole}` at both call sites (`isStudentRole` is state in the outer component and a prop in the inner one).
3. On the finished screen, directly after the block edited in Step 3 item 2 (still inside the `p-6 flex flex-col gap-4` container), add:

   ```tsx
   {
     isStudentRole && !finishSaving && !liveNeedsComplete && (
       // no-tour-anchor: student finished screen; live tours walk teachers.
       <a
         href="/my-assignments"
         className="inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-brand-blue-primary py-3 font-bold text-white hover:bg-brand-blue-dark"
       >
         Back to my assignments
       </a>
     );
   }
   ```

   The link is hidden while the submit is still saving so the student is not invited to leave early.

Add tests (in the same failed-completion test file, or a new file beside it following the same mocks): with the mocked student role on, the finished screen shows a `Back to my assignments` link whose `href` is `/my-assignments`; with it off (PIN join), no such link.

**Verify**:

- `pnpm exec vitest run tests/components/videoActivity` → all pass.
- `pnpm run check:tour-anchors` → exit 0.
- `pnpm exec vitest run tests/copyGuard.test.ts` → all pass.

### Step 5: Final checks

**Verify**:

- `pnpm exec vitest related --run components/videoActivity/VideoPlayer.tsx components/videoActivity/VideoActivityStudentApp.tsx utils/youtube.ts` → all pass (this also runs the Music widget tests that import `utils/youtube.ts`).
- `pnpm run type-check` → exit 0.
- `git status --short` lists only in-scope files.

## Test plan

Covered per step above. Summary of new tests:

- `VideoPlayer.test.tsx`: bad link, empty link, `onError`, ready timeout (both branches), script failure. Pattern: the existing `describe('VideoPlayer', ...)` tests and their `MockYTPlayer`.
- `VideoActivityStudentApp.failedCompletion.test.tsx`: pending shows "Submitting", success shows "submitted", failure shows the reason; back link present for signed-in students only. Pattern: `offers Finish instead of a false completion screen, and retries`.

## Done criteria

- [ ] `pnpm exec vitest run components/videoActivity/VideoPlayer.test.tsx tests/components/videoActivity` exits 0 with the new tests present.
- [ ] `pnpm exec vitest run tests/copyGuard.test.ts` exits 0.
- [ ] `pnpm run check:tour-anchors` exits 0.
- [ ] `pnpm run type-check` exits 0.
- [ ] `grep -c "onError" components/videoActivity/VideoPlayer.tsx` prints at least `1`.
- [ ] `grep -c "Submitting your results" components/videoActivity/VideoActivityStudentApp.tsx` prints `1`.
- [ ] `git diff db70831b -- utils/videoActivityState.ts` is empty.
- [ ] `git status --short` shows no files outside the in-scope list.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match the live code.
- `liveNeedsComplete` or `isStudentRole` is not in scope where a step uses it.
- An existing test in `tests/components/videoActivity/VideoActivityStudentApp.live.test.tsx` or `.periodAccess.test.tsx` fails and the fix is not a one-line text expectation.
- Any Music widget test fails after Step 1.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to need a change to `utils/videoActivityState.ts` or `hooks/useVideoActivitySession.ts`.

## Maintenance notes

- The failure card also shows in the teacher's Video Activity widget, since the player is shared. That is intended: a teacher previewing a dead link should see it too.
- The 15 second ready timeout can fire on a very slow connection. The card then offers "Try again", and it clears itself if the player becomes ready afterwards. If teachers report false alarms, raise `PLAYER_READY_TIMEOUT_MS`.
- In live mode, if every background retry of the submit fails, the screen stays on "Submitting your results. Keep this tab open." with no manual retry. That is honest but not ideal; a manual retry there needs care with the retry counter and was deferred.
- Deferred: a network failure while joining still reads "This activity session was not found" because `lookupSession` returns `null` for both cases; fixing it means changing the hook's return type. The new "Try again" button reduces the harm.
- Deferred: resume the video position after a refresh, captions and a control bar, screen-reader support for the question card, and translating this area.
- These are bug fixes and added recovery buttons, so no feature flag is planned. State that in the PR description.
