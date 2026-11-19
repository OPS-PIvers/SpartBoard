# 025 — One entrance duration for modals and their backdrops

- **Status**: TODO
- **Commit**: 3dcc1cd
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 3 files, 6 class strings

## Problem

The shared modal sets the pattern: the backdrop fades and the panel zooms from 95%, both over 200ms.

```tsx
// components/common/Modal.tsx:162 and :170 — the pattern to match
animate-in fade-in duration-200      // backdrop
animate-in zoom-in-95 duration-200   // panel
```

Three other modal surfaces drift from it, so the same kind of surface opens at three different speeds, and in two of them the backdrop and the panel finish at different times.

```tsx
// components/layout/dock/WidgetLibrary.tsx:614 — backdrop, 200ms (already correct)
className={`fixed inset-0 z-modal flex items-center justify-center p-4 animate-in fade-in duration-200 pointer-events-none ${dockClearance}`}

// components/layout/dock/WidgetLibrary.tsx:632 — panel, 300ms
className={`w-full overflow-hidden flex flex-col p-0 shadow-2xl animate-in zoom-in-95 duration-300 select-none pointer-events-auto max-w-7xl h-fu…
```

```tsx
// components/common/DialogContainer.tsx:509 — backdrop, 150ms (its panels at lines 129 and 333 are 200ms)
className =
  'fixed inset-0 z-dialog flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150';
```

```tsx
// components/admin/Organization/components/primitives.tsx:750 and :817 — backdrops, 150ms
className =
  'fixed inset-0 z-modal-deep flex items-center justify-center p-4 bg-[rgba(29,42,93,0.45)] animate-in fade-in duration-150';
className =
  'fixed inset-0 z-modal-nested flex items-center justify-center p-4 bg-[rgba(29,42,93,0.45)] animate-in fade-in duration-150';

// components/admin/Organization/components/primitives.tsx:757 and :824 — panels, `animate-in zoom-in-95 duration-150`
```

The audit also reported that keyframes and the reduced-motion lists are split between `tailwind.config.js` and `index.css`. On a closer read that needs no fix: both lists apply globally, so every listed animation is switched off whichever file names it, and two test files (`tests/utils/reducedMotion.test.ts`, `tests/indexCss.reducedMotion.test.ts`) guard each list. That part of the finding is withdrawn.

## Target

Every site above uses `duration-200`.

| File                                                      | Line     | Change                                                      |
| --------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| `components/layout/dock/WidgetLibrary.tsx`                | 632      | `zoom-in-95 duration-300` becomes `zoom-in-95 duration-200` |
| `components/common/DialogContainer.tsx`                   | 509      | `fade-in duration-150` becomes `fade-in duration-200`       |
| `components/admin/Organization/components/primitives.tsx` | 750, 817 | `fade-in duration-150` becomes `fade-in duration-200`       |
| `components/admin/Organization/components/primitives.tsx` | 757, 824 | `zoom-in-95 duration-150` becomes `zoom-in-95 duration-200` |

Easing is not set per site: `.animate-in` takes `cubic-bezier(0.23, 1, 0.32, 1)` from the base rule in `index.css`.

## Repo conventions to follow

- Exemplar: `components/common/Modal.tsx:162` and `:170`.
- Comments are one short line at most. No new dependencies.

## Steps

1. Locate the six sites with `rg -n 'zoom-in-95 duration-(150|300)|fade-in duration-150' components/layout/dock/WidgetLibrary.tsx components/common/DialogContainer.tsx components/admin/Organization/components/primitives.tsx`. Expect exactly six lines.
2. Change each duration to `duration-200` as in the table.
3. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Modals only. Do NOT change popover menus, context menus (`duration-100` in `components/layout/BoardBackgroundMenu.tsx` and `components/boardsModal/BoardContextMenu.tsx` is deliberate for small menus), toasts or drawers.
- Do NOT add `ease-*`, `origin-*` or `slide-in-*` classes, and do NOT add exit animations.
- Do NOT move keyframes between `tailwind.config.js` and `index.css` or edit either reduced-motion list.
- No feature flag, no changelog entry.
- If the search does not return exactly six lines, STOP and report.

## Verification

- **Mechanical**: `pnpm exec vitest related --run components/layout/dock/WidgetLibrary.tsx components/common/DialogContainer.tsx components/admin/Organization/components/primitives.tsx`. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite, `tsc` or `pnpm run validate`.
- **Feel check**: open the widget library from the Dock, a confirm dialog (for example delete a board), and an Organization admin modal. In each, `getComputedStyle(el).animationDuration` is `0.2s` on both backdrop and panel, and at 10% playback the two finish together.
- **Done when**: all six sites read `duration-200`.
