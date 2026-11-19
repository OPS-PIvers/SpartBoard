# 014 — Give shared buttons press feedback and soften the Dock's press

- **Status**: TODO
- **Commit**: 9ac6534
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 6 files, about 10 class strings, plus 2 small tests

## Problem

Teachers run SpartBoard on touch-screen classroom displays, where `hover:` styles never show. A button with no `:active` style gives a finger tap no visual response at all.

`IconButton` (every widget toolbar button, about 17 uses in `components/common/DraggableWindow.tsx`, and icon buttons app-wide) has no press state:

```tsx
// components/common/IconButton.tsx:40-41 — current
const baseStyles =
  'relative touch-target-expand flex items-center justify-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed';
```

`Button` has a press state on one of its eight variants (`hero`) only:

```tsx
// components/common/Button.tsx:34-35 — current
const baseStyles =
  'transition flex items-center justify-center gap-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed';

// components/common/Button.tsx:48 — current
hero: 'bg-brand-blue-primary text-white shadow-lg shadow-brand-blue-primary/30 hover:bg-brand-blue-dark active:scale-95 hover:-translate-y-1',
```

Dock items do have a press state, but it shrinks them by 10%, which is outside the subtle 0.95 to 0.98 range and reads as a lurch on the most-tapped control in the app. Seven places use it:

```tsx
// components/layout/dock/ToolDockItem.tsx:281 — current
className={`group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 relative ${

// components/layout/dock/FolderItem.tsx:330 — current
className={`group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 relative ${

// components/layout/dock/SavedWidgetDockItem.tsx:94 — current
className={`group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 relative ${

// components/layout/Dock.tsx:1609 — current
className="group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 touch-pan-x relative focus-visible:outline-hidden"

// components/layout/Dock.tsx:1712 — current
className="group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 touch-pan-x shrink-0"

// components/layout/Dock.tsx:1785 — current
className="group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 touch-pan-x shrink-0"

// components/layout/Dock.tsx:1845 — current (the round "open tools" button)
className={`w-14 h-14 flex items-center justify-center bg-brand-blue-primary text-white active:scale-90 transition shadow-xl shadow-brand-blue-primary/40 ${
```

## Target

Press feedback everywhere is a small scale-down over `160ms` with `ease-out`:

- Shared `Button` and `IconButton`: `scale(0.97)` while pressed, only when the button is enabled.
- Dock items: `scale(0.95)` while pressed (they are larger, icon-shaped targets, so the top of the range reads better than 0.97).

In Tailwind v4 the `scale-*` utilities set the CSS `scale` property. The plain `transition` utility includes `scale` in its property list, and `transition-transform` covers `transform, translate, scale, rotate`. `transition-colors` does not include `scale`, so `IconButton` moves to plain `transition`.

```tsx
// components/common/IconButton.tsx — target
const baseStyles =
  'relative touch-target-expand flex items-center justify-center transition duration-160 ease-out enabled:active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed';
```

```tsx
// components/common/Button.tsx — target
const baseStyles =
  'transition duration-160 ease-out enabled:active:scale-[0.97] flex items-center justify-center gap-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed';

// hero loses its own active:scale-95 so every variant presses the same amount
hero: 'bg-brand-blue-primary text-white shadow-lg shadow-brand-blue-primary/30 hover:bg-brand-blue-dark hover:-translate-y-1',
```

```tsx
// Dock items — target: in each of the six `transition-transform active:scale-90` strings,
// replace exactly that fragment with:
transition-transform duration-160 ease-out active:scale-95

// components/layout/Dock.tsx:1845 — target: replace `active:scale-90 transition` with:
active:scale-95 transition duration-160 ease-out
```

Exact values: pressed scale `0.97` (shared buttons) and `0.95` (Dock items); duration `160ms`; timing function Tailwind's `ease-out`, `cubic-bezier(0, 0, 0.2, 1)`.

Press feedback is kept under `prefers-reduced-motion`: a 3% to 5% scale is feedback, not movement across the screen. Do not add `motion-reduce:` variants.

## Repo conventions to follow

- Arbitrary numeric durations are written as bare numbers, for example `duration-900` in `components/widgets/QuizWidget/components/FreeResponseGrader.tsx:1982`. Write `duration-160`, not `duration-[160ms]`.
- Sub-5% press scales are written with brackets: `active:scale-[0.98]` is used 16 times in the repo. Write `enabled:active:scale-[0.97]`.
- Exemplar of a Dock control that already presses in range: `components/layout/dock/QuickAccessButton.tsx:25` (`active:scale-95`).
- Both shared components pass `disabled` to a real `<button>`, so the `enabled:` variant works.
- Component tests sit next to these two components: `components/common/Button.test.tsx` and `components/common/IconButton.test.tsx`, asserting classes with `toHaveClass` / `className.toContain`.
- Comments are one short line at most.

## Steps

1. In `components/common/IconButton.tsx` line 41, replace `transition-colors` with `transition duration-160 ease-out enabled:active:scale-[0.97]`.
2. In `components/common/Button.tsx` line 35, replace the leading `transition` with `transition duration-160 ease-out enabled:active:scale-[0.97]`.
3. In `components/common/Button.tsx` line 48, remove `active:scale-95 ` from the `hero` variant.
4. In `components/layout/dock/ToolDockItem.tsx:281`, `components/layout/dock/FolderItem.tsx:330`, `components/layout/dock/SavedWidgetDockItem.tsx:94` and `components/layout/Dock.tsx` lines 1609, 1712 and 1785, replace `transition-transform active:scale-90` with `transition-transform duration-160 ease-out active:scale-95`.
5. In `components/layout/Dock.tsx:1845`, replace `active:scale-90 transition` with `active:scale-95 transition duration-160 ease-out`.
6. Add one test to `components/common/Button.test.tsx` asserting a default `Button` has the class `enabled:active:scale-[0.97]`, and one to `components/common/IconButton.test.tsx` asserting the same on a default `IconButton`. Follow the assertion style already used in each file.

## Boundaries

- Do NOT change the other `active:scale-90` sites in the repo (there are about 15 outside the Dock) or any `active:scale-95` site. Only the seven Dock locations listed.
- Do NOT touch `group-hover:scale-110` on `DockIcon` children or `components/layout/dock/DockIcon.tsx`.
- Do NOT add press feedback to the hand-rolled buttons in `components/common/DialogContainer.tsx`. Converting them to the shared `Button` is a separate change.
- Do NOT change colours, sizes, focus rings, `touch-target-expand`, markup or `tourAttr` anchors.
- Do NOT touch the Dock expand and collapse transition (plan 011) or Dock popovers (plan 012). All three plans edit `components/layout/Dock.tsx` at different lines; if they are open at once, rebase rather than resolving by hand-merging class strings.
- Do NOT add new dependencies, a feature flag or a changelog entry: this is a styling tweak.
- If any excerpt does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: run `pnpm exec vitest related --run components/common/Button.tsx components/common/IconButton.tsx components/common/Button.test.tsx components/common/IconButton.test.tsx components/layout/Dock.tsx components/layout/dock/ToolDockItem.tsx components/layout/dock/FolderItem.tsx components/layout/dock/SavedWidgetDockItem.tsx` and expect it to pass. Both shared components are imported across many folders but their exported signatures do not change, so do not run `pnpm run type-check`. Commit; the pre-commit hook is the lint gate. Do not run full lint, full tests, `tsc` or `pnpm run validate`.
- **Feel check**: start `vite-dev` (port 3000), sign in, open a board with a widget on it. In DevTools turn on device emulation with touch, or use a real touch screen.
  - Press and hold a widget toolbar button (an `IconButton`): it should shrink very slightly while held and return on release. It must not look like it jumps.
  - Press and hold a text button in a modal (a `Button`, for example Cancel in a confirm dialog): same.
  - Find a disabled `Button` and press it: no scale change.
  - Press and hold a Dock icon, a Dock folder and the round open-tools button: each shrinks to 95%, clearly less than before.
  - Select an `IconButton` in DevTools, force the `:active` state, and confirm Computed > `scale` is `0.97`, `transition-duration` is `0.16s` and `transition-timing-function` is `cubic-bezier(0, 0, 0.2, 1)`.
  - Hover a `ghost` `IconButton` with a mouse: the background colour change still animates (it now runs through `transition` instead of `transition-colors`).
  - Add a Random widget to the board and find its large `hero` button (`components/widgets/random/RandomWidget.tsx:2290` and `:2465`): it still lifts on hover and now presses to 97%.
  - Drag a widget by its toolbar area and resize it: pressing toolbar buttons must not interfere with dragging.
- **Done when**: every shared `Button` and `IconButton` shows a 0.97 press when enabled, the seven Dock locations press to 0.95, and both new tests pass.
