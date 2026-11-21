# 015 — Sidebar panels: slide on ease-out in 200ms, and make the main panel slide at all

- **Status**: DONE
- **Commit**: 3dcc1cd
- **Severity**: MEDIUM
- **Category**: Easing & duration (also Performance, Accessibility)
- **Estimated scope**: 5 files, 5 class strings

## Problem

The sidebar swaps between a main panel and four sub-panels (Classes, Google Drive, Boards, PLCs). Teachers do this many times a day. All five panels use `ease-in-out` at 300ms. They are entering and leaving, so they should use ease-out, and 300ms is the top of the budget for something this frequent.

Four of the five use `transition-all`, which animates every property:

```tsx
// components/layout/sidebar/SidebarClasses.tsx:519-524 — current
// (identical class expression at SidebarGoogleDrive.tsx:65-70 and SidebarPlcs.tsx:329-334)
className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
  isVisible
    ? 'translate-x-0 opacity-100 visible'
    : 'translate-x-full opacity-0 invisible'
}`}
```

```tsx
// components/layout/sidebar/SidebarBoardsActive.tsx:32-37 — current
className={`absolute inset-0 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${
  isVisible
    ? 'translate-x-0 opacity-100 visible'
    : 'translate-x-full opacity-0 invisible'
}`}
```

The main panel names its properties, but names the wrong one:

```tsx
// components/layout/sidebar/Sidebar.tsx:549-554 — current
className={`absolute inset-0 pt-3 pb-3 flex flex-col overflow-y-auto transition-[transform,opacity] duration-300 ease-in-out ${
  activeSection === 'main'
    ? 'translate-x-0 opacity-100 visible'
    : '-translate-x-full opacity-0 invisible'
}`}
```

In Tailwind v4 the `translate-x-*` utilities set the CSS `translate` property, not `transform`. A transition list of `transform, opacity` therefore does not animate the slide, and it does not cover `visibility` either, so the main panel should vanish the instant it is hidden and only fade when it returns, while its four siblings slide. This was derived from the code: step 1 confirms it.

None of the five has a reduced-motion variant, and each travels the full width of the sidebar.

## Target

All five panels transition `translate`, `opacity` and `visibility` only, over `200ms`, on `cubic-bezier(0.23, 1, 0.32, 1)` (the `ease-out-strong` utility defined in `index.css`). Under reduced motion they fade in place.

`visibility` must stay in the list: it flips at the start when a panel is shown and at the end when it is hidden, which is what keeps the outgoing panel on screen while it slides away.

For the four sub-panels, replace `transition-all duration-300 ease-in-out` with:

```
transition-[translate,opacity,visibility] duration-200 ease-out-strong motion-reduce:transition-[opacity,visibility] motion-reduce:translate-x-0
```

For the main panel in `Sidebar.tsx`, replace `transition-[transform,opacity] duration-300 ease-in-out` with the same string.

The state classes (`translate-x-0 opacity-100 visible`, `translate-x-full opacity-0 invisible`, `-translate-x-full opacity-0 invisible`) do not change.

## Repo conventions to follow

- `ease-out-strong` comes from the `@theme static` block near the top of `index.css` (`--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);`).
- Exemplar of this exact shape, already merged: the Dock's expanded view in `components/layout/Dock.tsx` uses `transition-[opacity,scale,translate] duration-200 ease-out-strong motion-reduce:transition-opacity`.
- No motion library. Tailwind utilities only. Comments are one short line at most.

## Steps

1. Reproduce the main-panel defect. Start the bypass dev server (`vite-verify` entry in `.claude/launch.json`), open the sidebar, and with DevTools Animations playback at 10% click a section such as Classes, then its back button. Watch the main panel: if it slides out and back like the sub-panels, note that in your report and continue anyway (the easing, duration and reduced-motion changes still apply). Read `getComputedStyle(nav).transitionProperty` on the main panel's `<nav>` and record it.
2. In `components/layout/sidebar/SidebarClasses.tsx`, `SidebarGoogleDrive.tsx`, `SidebarPlcs.tsx` and `SidebarBoardsActive.tsx`, replace the fragment `transition-all duration-300 ease-in-out` with the target string. One site per file; locate it with `rg -n 'duration-300 ease-in-out' components/layout/sidebar`.
3. In `components/layout/sidebar/Sidebar.tsx`, replace `transition-[transform,opacity] duration-300 ease-in-out` on the main `<nav>` with the target string.
4. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Do NOT touch the sidebar drawer itself (`animate-in slide-in-from-left duration-300` in `Sidebar.tsx`) or its backdrop.
- Do NOT change the state classes, the markup, the `isVisible` logic or any `tourAttr` anchor.
- Do NOT touch the two 500ms status colour fades further down `Sidebar.tsx`.
- Do NOT add dependencies, a feature flag or a changelog entry: this is a styling tweak.
- If the search in step 2 returns anything other than five lines across those five files, STOP and report.

## Verification

- **Mechanical**: `pnpm exec vitest related --run` on the five files; expect it to pass. Commit; the Husky pre-commit hook is the lint gate. Never run full lint, the full test suite, `tsc` or `pnpm run validate`.
- **Feel check**, in the browser:
  - On each of the five panels, `getComputedStyle(el).transitionProperty` is `translate, opacity, visibility`, `transitionDuration` is `0.2s` and `transitionTimingFunction` is `cubic-bezier(0.23, 1, 0.32, 1)`.
  - At 10% playback, open Classes: the main panel slides out to the left while Classes slides in from the right, and both stay visible until they finish. Press back: the reverse.
  - Click a section and press back before it finishes: the panels reverse from where they are with no jump.
  - With `prefers-reduced-motion: reduce`, the panels cross-fade with no horizontal movement.
- **Done when**: all five computed values match and the main panel slides like its siblings.
