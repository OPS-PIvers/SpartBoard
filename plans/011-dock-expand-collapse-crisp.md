# 011 — Make the Dock expand and collapse fast, with no bounce

- **Status**: TODO
- **Commit**: acb225c
- **Severity**: HIGH
- **Category**: Easing & duration (also Cohesion, Performance, Accessibility)
- **Estimated scope**: 1 file, 2 class strings
- **Depends on**: plan 010 (it defines the `ease-out-strong` utility)

## Problem

The Dock is the most-used control in the app. Opening and closing it takes 500ms on an overshoot curve (the `1.56` in the curve pushes the scale past 1 and back), through `transition-all`, with no reduced-motion variant. The repo's own rule in `components/CLAUDE.md` is "nothing bounces, jiggles, or pulses unless it's communicating urgency", and a control used this often should take about 200ms.

```tsx
// components/layout/Dock.tsx:1187-1199 — current (expanded view)
<div
  className={`transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
    isExpanded
      ? 'scale-100 opacity-100'
      : `scale-50 opacity-0 pointer-events-none absolute ${
          dockPosition === 'left'
            ? '-translate-x-12'
            : dockPosition === 'right'
              ? 'translate-x-12'
              : 'translate-y-12'
        }`
  }`}
>
```

```tsx
// components/layout/Dock.tsx:1806-1812 — current (collapsed floating icon)
<div
  className={`transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
    !isExpanded
      ? 'scale-100 opacity-100'
      : 'scale-150 opacity-0 pointer-events-none absolute'
  }`}
>
```

Problems, in order of how much they hurt:

1. 500ms is over the 300ms budget for UI, on something opened many times a day.
2. The overshoot curve bounces, in both directions.
3. The hidden states are `scale-50` and `scale-150`, far from the subtle 0.9 to 0.97 range, so the motion is large.
4. `transition-all` animates every property, not only the three that change.
5. There is no `motion-reduce:` variant.

## Target

Both views transition only `opacity`, `scale` and `translate`, over 200ms, on the strong ease-out `cubic-bezier(0.23, 1, 0.32, 1)` (the `ease-out-strong` utility from plan 010). Hidden states are close to full size. Under reduced motion only opacity changes.

In Tailwind v4 the `scale-*` and `translate-*` utilities set the CSS `scale` and `translate` properties, not `transform`, so the transition list names those properties.

```tsx
// components/layout/Dock.tsx — target (expanded view)
<div
  className={`transition-[opacity,scale,translate] duration-200 ease-out-strong motion-reduce:transition-opacity ${
    isExpanded
      ? 'scale-100 opacity-100'
      : `scale-95 opacity-0 pointer-events-none absolute motion-reduce:scale-100 motion-reduce:translate-x-0 motion-reduce:translate-y-0 ${
          dockPosition === 'left'
            ? '-translate-x-2'
            : dockPosition === 'right'
              ? 'translate-x-2'
              : 'translate-y-2'
        }`
  }`}
>
```

```tsx
// components/layout/Dock.tsx — target (collapsed floating icon)
<div
  className={`transition-[opacity,scale,translate] duration-200 ease-out-strong motion-reduce:transition-opacity ${
    !isExpanded
      ? 'scale-100 opacity-100'
      : 'scale-105 opacity-0 pointer-events-none absolute motion-reduce:scale-100'
  }`}
>
```

Exact values: duration `200ms`; curve `cubic-bezier(0.23, 1, 0.32, 1)`; hidden expanded view `scale(0.95)` with an 8px (`0.5rem`) offset toward the dock's screen edge; hidden collapsed icon `scale(1.05)`.

## Repo conventions to follow

- No motion library. Use Tailwind utilities and CSS transitions only.
- Reduced-motion variants are written inline with `motion-reduce:`. Exemplar: `components/settings/SettingsDrawer.tsx:564-570`, which uses `transition-[opacity,transform] duration-150 motion-reduce:transition-opacity` and `motion-reduce:translate-x-0 motion-reduce:translate-y-0`.
- Comments are one short line at most. Do not add explanatory comment blocks.
- `components/layout/dock/WidgetLibrary.tsx:347-350` listens for `transitionend` on the Dock root element (the `fixed ... z-dock` div at `Dock.tsx:975`), not on these two divs. Leave that listener and the root's classes alone.

## Steps

1. Confirm plan 010 is merged: `index.css` must contain `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);`. If it does not, STOP.
2. In `components/layout/Dock.tsx`, replace the class expression at lines 1188-1198 with the expanded-view target above. The surrounding `<div` and its children stay as they are.
3. In the same file, replace the class expression at lines 1807-1811 with the collapsed-icon target above.
4. Change nothing else in the file.

## Boundaries

- Do NOT touch the Dock root div at `Dock.tsx:975-977` (`transition-all duration-300 ... ease-out`) or the drag-to-collapse handlers at lines 415-480.
- Do NOT change the `absolute` toggle on the hidden views, the markup, or any `tourAttr` anchor.
- Do NOT change `active:scale-90` on dock buttons here. Plan 014 owns press feedback.
- Do NOT touch dock popovers. Plan 012 owns them.
- Do NOT add new dependencies, a feature flag or a changelog entry: this is a styling tweak.
- If either excerpt does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: run `pnpm exec vitest related --run components/layout/Dock.tsx` and expect it to pass. Commit; the pre-commit hook is the lint gate. Do not run full lint, full tests, `tsc` or `pnpm run validate`.
- **Feel check**: start `vite-dev` (port 3000), sign in, open a board.
  - Click the round blue button to expand the Dock, then drag the Dock toward its screen edge to collapse it. Each direction should finish in about a fifth of a second with no overshoot and no wobble at the end.
  - In the DevTools Animations panel set playback to 10% and expand the Dock. The Dock should grow only slightly (from 95%) and rise 8px. At no frame should it be larger than its final size.
  - Click expand and, before it finishes, trigger collapse. The motion must reverse from where it is, with no jump.
  - Move the Dock to the left and right edges (Settings > Dock > Position, `components/settingsModal/sections/DockSection.tsx`) and repeat: the 8px offset should come from the left or right edge.
  - Open the widget library from the Dock and confirm it still clears the Dock (the `transitionend` measurement in `WidgetLibrary.tsx` still fires from the root).
  - Toggle `prefers-reduced-motion: reduce` in the Rendering panel: the Dock should fade in and out with no scaling and no movement.
  - Select the expanded-view div and confirm Computed > `transition-timing-function` is `cubic-bezier(0.23, 1, 0.32, 1)` and `transition-property` is `opacity, scale, translate`.
- **Done when**: both class strings match the targets, the computed values above are confirmed, and nothing bounces at 10% playback.
