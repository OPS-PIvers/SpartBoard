# 013 — Board switch: no animation from the keyboard, a short slide otherwise

- **Status**: DONE
- **Commit**: 9ac6534
- **Severity**: HIGH
- **Category**: Purpose & frequency (also Easing & duration, Interruptibility, Accessibility)
- **Estimated scope**: 2 files, about 30 changed lines, plus one new test
- **Depends on**: plan 010 (it defines `--ease-out-strong`)

## Problem

A teacher with one board per class section switches boards many times a day. Every switch plays a half-second animation in which the new board travels the full width of the screen. The old board is hidden with `display: none`, so it simply vanishes while the new one is still travelling.

```css
/* index.css:257-278 — current */
/* Dashboard Transitions */
@keyframes slideLeftIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideRightIn {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

```css
/* index.css:309-323 — current */
.animate-slide-left-in {
  animation: slideLeftIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.animate-slide-right-in {
  animation: slideRightIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.animate-slide-left-out {
  animation: slideLeftOut 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.animate-fade-in {
  animation: fadeIn 0.5s ease-out forwards;
}
```

```tsx
// components/layout/DashboardView.tsx:906-918 — current
// Compute animation class by comparing current index with the previous one
// tracked in our ref. This correctly evaluates the direction during the render
// where the index changed.
const animationClass = useMemo(() => {
  // eslint-disable-next-line react-hooks/refs -- previous index drives the slide direction
  const prevIndex = prevIndexRef.current;
  if (prevIndex === -1 || currentIndex === -1 || prevIndex === currentIndex) {
    return 'animate-fade-in';
  }
  return currentIndex > prevIndex
    ? 'animate-slide-left-in'
    : 'animate-slide-right-in';
}, [currentIndex]);
```

```tsx
// components/layout/DashboardView.tsx:1216-1231 — current (keyboard shortcut)
// Alt + Left/Right: Navigate boards (with wrap-around)
// Guard: Alt + ArrowLeft/Right is word-navigation in text fields on
// macOS and many Linux keyboard layouts. Don't intercept it there.
if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
  if (isTypingFieldActive()) return;

  e.preventDefault();
  if (dashboards.length > 1) {
    const nextIdx =
      e.key === 'ArrowLeft'
        ? (currentIndex - 1 + dashboards.length) % dashboards.length
        : (currentIndex + 1) % dashboards.length;
    loadDashboard(dashboards[nextIdx].id);
  }
}
```

Four things are wrong:

1. **Keyboard switches animate.** Alt+Left/Right is a keyboard-initiated, repeatable action. It should have no animation at all. Holding or tapping the shortcut restarts a 500ms keyframe from `translateX(100%)` on every press.
2. **500ms is over the 300ms budget** for UI.
3. **The curve `cubic-bezier(0.4, 0, 0.2, 1)` is an in-out curve** on an entrance. Entrances use ease-out.
4. **No reduced-motion branch.** A full-viewport horizontal slide plays for motion-sensitive users.

## Target

- **Keyboard (Alt+Left/Right):** the board changes instantly. `animationClass` is the empty string.
- **Every other way of switching** (sidebar, boards modal, two-finger swipe): the new board fades in over `200ms` while moving in from `2%` of its own width on the side it came from, on `cubic-bezier(0.23, 1, 0.32, 1)`. The direction still tells the teacher which way they moved; the distance no longer costs half a second.
- **First load / same index:** a `200ms` fade.
- **Reduced motion:** the slide classes fade only, with no movement.

```css
/* index.css — target for the two keyframes (slideLeftOut, fadeIn, fadeOut stay as they are) */
@keyframes slideLeftIn {
  from {
    transform: translateX(2%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideRightIn {
  from {
    transform: translateX(-2%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

```css
/* index.css — target for the classes */
.animate-slide-left-in {
  animation: slideLeftIn 200ms var(--ease-out-strong) forwards;
}

.animate-slide-right-in {
  animation: slideRightIn 200ms var(--ease-out-strong) forwards;
}

.animate-slide-left-out {
  animation: slideLeftOut 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.animate-fade-in {
  animation: fadeIn 200ms ease-out forwards;
}

@media (prefers-reduced-motion: reduce) {
  .animate-slide-left-in,
  .animate-slide-right-in {
    animation-name: fadeIn;
  }
}
```

`.animate-slide-left-out` is unchanged: it and `.animate-fade-out` are used by Guided Learning (`components/widgets/GuidedLearning/components/GuidedLearningStage.tsx:1073-1075`), not by the board switch.

```tsx
// components/layout/DashboardView.tsx — target

// next to the other board-switch state (after line 569, `const [isMinimized, setIsMinimized] = ...`)
const [keyboardSwitchId, setKeyboardSwitchId] = React.useState<string | null>(
  null
);

// animationClass (replaces lines 909-918)
const animationClass = useMemo(() => {
  if (keyboardSwitchId !== null && activeDashboardId === keyboardSwitchId) {
    return '';
  }
  // eslint-disable-next-line react-hooks/refs -- previous index drives the slide direction
  const prevIndex = prevIndexRef.current;
  if (prevIndex === -1 || currentIndex === -1 || prevIndex === currentIndex) {
    return 'animate-fade-in';
  }
  return currentIndex > prevIndex
    ? 'animate-slide-left-in'
    : 'animate-slide-right-in';
}, [currentIndex, activeDashboardId, keyboardSwitchId]);
```

where `activeDashboardId` is `activeDashboard?.id`, declared once just above the memo:

```tsx
const activeDashboardId = activeDashboard?.id;
```

```tsx
// keyboard handler — target (only the setKeyboardSwitchId line is new)
if (dashboards.length > 1) {
  const nextIdx =
    e.key === 'ArrowLeft'
      ? (currentIndex - 1 + dashboards.length) % dashboards.length
      : (currentIndex + 1) % dashboards.length;
  setKeyboardSwitchId(dashboards[nextIdx].id);
  loadDashboard(dashboards[nextIdx].id);
}
```

The marker is cleared when the active board changes to any board the keyboard did not pick, so a later pointer switch back to the same board animates normally. This goes in the existing "adjust state while rendering" block:

```tsx
// components/layout/DashboardView.tsx:971-979 — current
if (activeDashboard?.id !== lastDashboardId) {
  setLastDashboardId(activeDashboard?.id);
  if (isMinimized) {
    setIsMinimized(false);
  }
  if (panOffset.x !== 0 || panOffset.y !== 0) {
    setPanOffset({ x: 0, y: 0 });
  }
}

// target (one `if` added)
if (activeDashboard?.id !== lastDashboardId) {
  setLastDashboardId(activeDashboard?.id);
  if (keyboardSwitchId !== null && activeDashboard?.id !== keyboardSwitchId) {
    setKeyboardSwitchId(null);
  }
  if (isMinimized) {
    setIsMinimized(false);
  }
  if (panOffset.x !== 0 || panOffset.y !== 0) {
    setPanOffset({ x: 0, y: 0 });
  }
}
```

## Repo conventions to follow

- **`useEffect` is an escape hatch.** Do not add an effect to track or clear `keyboardSwitchId`. Use state set in the event handler and the existing adjust-during-render block, as shown.
- **Never read or write `ref.current` during render in new code.** The existing `prevIndexRef.current` read keeps its existing `eslint-disable-next-line` comment; do not add another ref.
- The keyboard handler lives inside a `useEffect` whose dependency array begins at about line 1236 (`undoWidgets, redoWidgets, ...`). State setters are stable, so `setKeyboardSwitchId` does not need to be added to it. If ESLint asks for it, add it.
- The board element that receives the class is `components/layout/BoardCanvas.tsx:162`. Tests already pass `animationClass=""` (`tests/components/layout/MountedBoardsLayer.test.tsx:37`, `tests/perf/dashboardPerf.test.tsx:1021`), so the empty string is a supported value.
- Comments are one short line at most. Do not add multi-line comment blocks.
- Tests live in `tests/` mirroring the source path, for example `tests/components/layout/DashboardView.test.tsx`.

## Steps

1. Confirm plan 010 is merged: `index.css` must contain `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);`. If it does not, STOP.
2. In `index.css`, change the `from` transforms of `slideLeftIn` (line 260) to `translateX(2%)` and of `slideRightIn` (line 271) to `translateX(-2%)`.
3. In `index.css`, replace the `.animate-slide-left-in`, `.animate-slide-right-in` and `.animate-fade-in` rules with the targets, and add the `@media (prefers-reduced-motion: reduce)` block directly after `.animate-fade-in`. Leave `.animate-slide-left-out`, `.animate-disclosure-expand`, `.animate-fade-out` and every other rule untouched.
4. In `components/layout/DashboardView.tsx`, add the `keyboardSwitchId` state after line 569.
5. Add `const activeDashboardId = activeDashboard?.id;` directly above the `animationClass` memo and replace the memo with the target.
6. Add the clearing `if` to the block at lines 971-979 as shown.
7. Add `setKeyboardSwitchId(dashboards[nextIdx].id);` to the Alt+Arrow handler directly before its `loadDashboard` call (about line 1229). Do not touch the two `loadDashboard` calls in the swipe handler (about lines 757 and 762).
8. Add a test to `tests/components/layout/DashboardView.test.tsx` following that file's existing setup: with two boards, fire `keydown` with `altKey: true, key: 'ArrowRight'` on `window` and assert the active board's canvas element has neither `animate-slide-left-in` nor `animate-slide-right-in` in its class. If the file's mocks make `loadDashboard` a no-op that cannot change the active board, STOP and report rather than restructuring the mocks.

## Boundaries

- Do NOT touch `components/layout/BoardCanvas.tsx` or `components/layout/MountedBoardsLayer.tsx`. The leftover `transition-opacity duration-500 ease-in-out` on the canvas is dead code and out of scope.
- Do NOT touch the two-finger swipe detection, `SWIPE_MIN_DISTANCE_PX`, or the toast it shows. A code comment at `DashboardView.tsx:741-744` documents why velocity is not used.
- Do NOT touch `slideLeftOut`, `fadeOut`, `.animate-slide-left-out` or `.animate-fade-out`: Guided Learning uses them.
- Do NOT move keyframes into `tailwind.config.js` and do NOT edit the reduced-motion plugin there. `tests/utils/reducedMotion.test.ts:84` asserts that plugin's selector does not contain `.animate-fade-in`.
- Do NOT add an exit animation for the outgoing board.
- Do NOT add new dependencies, a feature flag or a changelog entry: this is a styling tweak.
- If any excerpt does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: run `pnpm exec vitest related --run components/layout/DashboardView.tsx index.css tests/components/layout/DashboardView.test.tsx tests/utils/reducedMotion.test.ts` and expect it to pass, including the new test. Commit; the pre-commit hook is the lint gate. Do not run full lint, full tests, `tsc` or `pnpm run validate`.
- **Feel check**: start `vite-dev` (port 3000), sign in, and make sure the account has at least three boards.
  - Press Alt+Right several times quickly. Each board must appear on the very next frame with no fade and no movement.
  - Switch boards from the sidebar. The new board should fade in and settle from slightly to the right (moving to a later board) or slightly to the left (moving to an earlier one), and be finished in about a fifth of a second.
  - In the DevTools Animations panel set playback to 10% and switch from the sidebar. The board should start about 2% of the screen width off-centre, never a full screen away, and should cover most of the distance early.
  - Press Alt+Right to reach a board, then switch away and back to that same board from the sidebar. The return must animate (the keyboard marker was cleared).
  - Reload the page: the first board fades in over about a fifth of a second.
  - Start a timer widget on one board, switch away and back by both methods, and confirm the timer kept running (boards stay mounted).
  - Toggle `prefers-reduced-motion: reduce` in the Rendering panel and switch from the sidebar: the board fades with no horizontal movement.
  - The 2% offset is a starting value. If it reads as too timid or too busy on a classroom display, report that to the reviewer instead of tuning it.
- **Done when**: keyboard switches show no animation, pointer switches take 200ms with a 2% offset, reduced motion shows a fade only, and the new test passes.
