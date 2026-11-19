# 016 — Fix transition lists that name `transform` but animate `translate` or `scale`

- **Status**: DONE
- **Commit**: 3dcc1cd
- **Severity**: MEDIUM
- **Category**: Interruptibility (broken transitions)
- **Estimated scope**: 3 files, 3 class strings

## Problem

In Tailwind v4, `translate-*` utilities set the CSS `translate` property and `scale-*` utilities set `scale`. Neither sets `transform`. An arbitrary transition list such as `transition-[opacity,transform]` therefore does not animate them: the movement snaps while the other listed properties ease. Three components are written this way. (A fourth, the sidebar's main panel, is handled by plan 015.)

This was found while writing plans, by reading the code. It was confirmed indirectly: the Dock change that shipped in `components/layout/Dock.tsx` had to list `opacity, scale, translate` and its measured `scale` moved from 0.95 to 1. Step 1 confirms each site directly.

```tsx
// components/settings/SettingsDrawer.tsx:564-570 — current (widget settings drawer, opened many times a day)
className={`fixed flex flex-col bg-white shadow-2xl border-slate-200 transition-[opacity,transform] duration-150 motion-reduce:transition-opacity ${
  isSheet ? 'border-t rounded-t-2xl' : 'border-l'
} ${
  isVisible
    ? 'opacity-100 translate-x-0 translate-y-0'
    : `opacity-0 ${hiddenTransform}`
} motion-reduce:translate-x-0 motion-reduce:translate-y-0`}
```

`hiddenTransform` is `translate-y-4`, `translate-x-4` or `-translate-x-4` (`SettingsDrawer.tsx:366-370`), so the 16px slide is meant to ease with the fade.

```tsx
// components/layout/dock/DockIcon.tsx:19 — current (every Dock icon)
'relative w-10 h-10 md:w-12 md:h-12 rounded-2xl text-white shadow-lg transition-[transform,background-color] duration-200',
```

Callers add `group-hover:scale-110` to this element (for example `components/layout/dock/ToolDockItem.tsx`), so the hover grow is meant to ease over 200ms.

```tsx
// components/common/DraggableWindow.tsx:3082-3086 — current (control bar on a maximized widget)
className={`absolute inset-x-0 top-0 z-widget-control mx-auto flex w-fit flex-col items-center gap-2 pt-3 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none focus-within:pointer-events-auto focus-within:trans… ${
  maxBarVisible || showMaxMenu
    ? 'pointer-events-auto translate-y-0 opacity-100'
    : 'pointer-events-none -translate-y-full opacity-0'
}`}
```

(The class string on that line is longer than shown; only the `transition-[transform,opacity]` fragment changes.)

## Target

Name the property the utilities actually set.

| File                                     | Current fragment                          | Target fragment                       |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------- |
| `components/settings/SettingsDrawer.tsx` | `transition-[opacity,transform]`          | `transition-[opacity,translate]`      |
| `components/layout/dock/DockIcon.tsx`    | `transition-[transform,background-color]` | `transition-[scale,background-color]` |
| `components/common/DraggableWindow.tsx`  | `transition-[transform,opacity]`          | `transition-[translate,opacity]`      |

Durations, easing classes and reduced-motion classes stay exactly as they are (`duration-150`, `duration-200`, `ease-out`, `motion-reduce:transition-opacity`, `motion-reduce:transition-none`).

## Repo conventions to follow

- Exemplar already merged: `components/layout/Dock.tsx` uses `transition-[opacity,scale,translate]` on the Dock's expanded and collapsed views.
- Comments are one short line at most. No new dependencies.

## Steps

1. Reproduce before editing. Start the bypass dev server (`vite-verify` entry in `.claude/launch.json`). For each site, sample the property per animation frame across the state change:
   - Settings drawer: add a widget, open its settings, and sample `getComputedStyle(drawer).translate` and `opacity`. The defect is present if `translate` jumps straight from `16px`/`-16px` to `0px` (or `none`) while opacity eases.
   - Dock icon: hover a Dock tool and sample `getComputedStyle(icon).scale`. The defect is present if it jumps from `1` to `1.1` in one frame.
   - Maximized widget bar: maximize a widget, move the pointer to the top edge, and sample `translate` on the `[data-max-bar]` element.
     Record what you saw for each. Fix only the sites where the jump is confirmed; if a site already eases, leave it and say so.
2. Make the confirmed replacements from the Target table. Locate each with `rg -n 'transition-\[[^]]*transform[^]]*\]' components --glob '!*.test.*'`; apart from `components/layout/sidebar/Sidebar.tsx` (plan 015) that search should return exactly these three lines.
3. Re-run the sampling and confirm each fixed property now passes through intermediate values.
4. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Do NOT change durations, easing, reduced-motion classes, state classes or markup.
- Do NOT touch `components/layout/sidebar/Sidebar.tsx`; plan 015 owns it.
- Do NOT rewrite `transition-transform` (the plain utility) anywhere: in v4 it already covers `transform, translate, scale, rotate`.
- No feature flag, no changelog entry.
- If the search in step 2 returns other sites, STOP and report them without editing them.

## Verification

- **Mechanical**: `pnpm exec vitest related --run components/settings/SettingsDrawer.tsx components/layout/dock/DockIcon.tsx components/common/DraggableWindow.tsx`. `DraggableWindow` has many dependents, so expect a large related set; it must pass. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite, `tsc` or `pnpm run validate`.
- **Feel check**: at 10% playback, the settings drawer slides 16px as it fades in and out; a Dock icon grows smoothly on hover; the maximized widget's bar slides down from the top edge. With `prefers-reduced-motion: reduce`, the drawer only fades and the maximized bar appears without sliding.
- **Done when**: before and after samples are reported for all three sites and every fixed property eases.
