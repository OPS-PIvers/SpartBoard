# 018 — Board toasts: ease in with a transition and ease out before they are removed

- **Status**: TODO
- **Commit**: 3dcc1cd
- **Severity**: MEDIUM
- **Category**: Interruptibility (also Cohesion)
- **Estimated scope**: 4 files (`types.ts`, `context/DashboardContext.tsx`, `components/common/ToastContainer.tsx`, one test), about 40 lines
- **Depends on**: nothing unmerged (`ease-out-strong` is in `index.css`)

## Problem

The board's toast stack enters with a keyframe and has no exit. A toast slides in over 300ms, then vanishes in a single frame when it times out or is dismissed. Keyframes also cannot be reversed, and toasts are the classic case of rapidly triggered UI.

```tsx
// components/common/ToastContainer.tsx:76 — current
className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border pointer-events-auto cursor-pointer animate-in slide-in-from-right duration-300 ${getStyles()}`}
```

Removal is immediate, from the context:

```tsx
// context/DashboardContext.tsx:1303-1305 — current
const removeToast = useCallback((id: string) => {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}, []);
```

```tsx
// context/DashboardContext.tsx:1316-1334 — current
const addToast = useCallback(
  (message: string, type: Toast['type'] = 'info', action?: Toast['action']) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type, action }]);
    if (action?.persist) return;
    // If there's an action, keep it longer (10s) so the user has time to click
    const duration = action ? 10000 : 3000;
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(timer);
      removeToast(id);
    }, duration);
    toastTimersRef.current.add(timer);
  },
  [removeToast]
);
```

```ts
// types.ts:11649-11663 — current
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'loading';
  action?: { ... };
}
```

## Target

**Entry** is a CSS transition from a starting style, using Tailwind v4's `starting:` variant (`@starting-style`): the toast fades in and moves in 16px from the right over `200ms` on `cubic-bezier(0.23, 1, 0.32, 1)`.

**Exit** is the same transition run backwards over the same `200ms`: `removeToast` marks the toast as leaving, the container applies the hidden classes, and the toast is dropped from state 200ms later.

**Reduced motion**: opacity only, no movement.

```ts
// types.ts — target: one optional field added to Toast
/** Set while the toast eases out, just before it is removed. */
leaving?: boolean;
```

```tsx
// context/DashboardContext.tsx — target
const TOAST_EXIT_MS = 200; // module scope, next to the other constants at the top of the file

const removeToast = useCallback((id: string) => {
  setToasts((prev) =>
    prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
  );
  const timer = setTimeout(() => {
    toastTimersRef.current.delete(timer);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, TOAST_EXIT_MS);
  toastTimersRef.current.add(timer);
}, []);
```

`toastTimersRef` is declared just below `removeToast` today (line 1307). Move the `toastTimersRef` declaration and its cleanup `useEffect` (lines 1307-1314) above `removeToast` so the ref exists when the callback is defined. Do not change that effect's body. `addToast` is unchanged: it still calls `removeToast(id)` from its timer.

```tsx
// components/common/ToastContainer.tsx — target class expression
className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border cursor-pointer transition-[opacity,translate] duration-200 ease-out-strong starting:opacity-0 starting:translate-x-4 motion-reduce:transition-opacity motion-reduce:starting:translate-x-0 ${
  toast.leaving
    ? 'pointer-events-none opacity-0 translate-x-4 motion-reduce:translate-x-0'
    : 'pointer-events-auto opacity-100 translate-x-0'
} ${getStyles()}`}
```

Exact values: `200ms` in and out, `cubic-bezier(0.23, 1, 0.32, 1)`, 16px (`translate-x-4`) of travel, opacity 0 to 1.

## Repo conventions to follow

- **`useEffect` is an escape hatch** (root `CLAUDE.md`, "Architecture gotchas"). Do not add an effect. The exit timer is started inside `removeToast`, an event-driven callback, and is tracked in the existing `toastTimersRef` so the existing unmount cleanup clears it.
- Never read or write `ref.current` during render. The ref is only touched inside callbacks here.
- `types.ts` and `context/DashboardContext.tsx` are shared across the app, so run `pnpm run type-check` once after the edits (the repo allows one run per PR for shared type changes).
- Tests live in `tests/` mirroring the source path; look for an existing toast test with `rg -l 'removeToast|ToastContainer' tests components --glob '*.test.*'` and add to it.
- Comments are one short line at most. No new dependencies.

## Steps

1. Confirm the `starting:` variant works in this build before anything else, because nothing in the repo uses it yet. Make step 4's edit first, start the bypass dev server (`vite-verify` entry in `.claude/launch.json`), load the board, and check that the compiled CSS contains an `@starting-style` rule: in the page, walk `document.styleSheets` and look for a rule whose `cssText` includes `@starting-style`. If there is none, Tailwind did not emit it: revert the edit, STOP and report. Do not fall back to a keyframe.
2. Add the `leaving?: boolean` field to `Toast` in `types.ts` with its one-line comment.
3. In `context/DashboardContext.tsx`, add `TOAST_EXIT_MS`, move the `toastTimersRef` declaration and its cleanup effect above `removeToast`, and replace `removeToast` with the target.
4. In `components/common/ToastContainer.tsx`, replace the class expression on the toast `<div>` with the target.
5. Add a test with fake timers: add a toast, call `removeToast`, assert the toast is still in `toasts` with `leaving: true`; advance 200ms; assert it is gone.
6. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Do NOT touch `components/common/Toast.tsx` (the standalone bottom-right toast used by admin screens), the undo toasts in `components/gradebook/`, `components/layout/UpdateNotification.tsx` or `components/admin/Organization/components/primitives.tsx`. Unifying those is a separate change.
- Do NOT animate the remaining toasts closing the gap when one is removed. They will still jump up; that needs a layout animation and is out of scope.
- Do NOT change toast durations (3s, 10s with an action), roles, `aria-live`, the dismiss button, `data-toast-stack` or the container's position.
- Do NOT change `addToast`'s signature or `DashboardContextValue`'s `removeToast` signature.
- No feature flag, no changelog entry.
- If any excerpt does not match, STOP and report.

## Verification

- **Mechanical**: `pnpm exec vitest related --run components/common/ToastContainer.tsx` plus the test file you edited, then `pnpm run type-check` once. Do NOT run `vitest related` on `context/DashboardContext.tsx` or `types.ts` (nearly the whole suite depends on them); CI covers that. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite or `pnpm run validate`.
- **Feel check**, in the browser at 10% playback:
  - Trigger a toast (for example create a board): it fades in and moves in 16px from the right. Sample `getComputedStyle(toast).translate` and `opacity` per frame to confirm both pass through intermediate values.
  - Click it: it fades and moves out over 200ms, then is removed from the DOM. It must not be clickable while leaving.
  - Let one time out: same exit.
  - Trigger three quickly and dismiss the middle one: the others jump up after it leaves (expected, out of scope) and none of them replays its entrance.
  - A toast with an action: clicking the action runs it once and the toast eases out.
  - With `prefers-reduced-motion: reduce`: fade only, `translate` stays `0px`/`none`.
  - Live tours read the toast stack (`body:has([data-tour-bar]) [data-toast-stack]` in `index.css`); start any live tour and confirm toasts still appear clear of the tour bar.
- **Done when**: entry and exit both ease, the new test passes and the type-check is clean.
