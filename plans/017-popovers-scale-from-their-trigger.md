# 017 — Make two anchored popovers scale from their trigger

- **Status**: TODO
- **Commit**: 3dcc1cd
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files, 2 class strings

## Problem

A popover that grows with `zoom-in-95` and no `origin-*` class scales from its own centre, so it appears to swell in place and not to come from the control that opened it. Ten popovers in the app do this. This plan fixes the two whose placement is fixed in their class string, so the correct origin can be stated exactly.

```tsx
// components/classes/RestrictionsPicker.tsx:102 — current (drops down from the right edge of its button)
className =
  'absolute top-full right-0 mt-1 w-72 max-h-80 flex flex-col z-popover rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200';
```

```tsx
// components/common/WidgetAnnotateToolbar.tsx:112-113 — current (sits above its button, centred)
const popoverClass =
  'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max flex flex-wrap items-center justify-center gap-1.5 p-1.5 bg-white shadow-lg rounded-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150';
```

## Target

Add the origin that matches the placement.

```tsx
// RestrictionsPicker.tsx — target (adds `origin-top-right`)
className =
  'absolute top-full right-0 mt-1 w-72 max-h-80 flex flex-col z-popover rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl overflow-hidden origin-top-right animate-in fade-in zoom-in-95 duration-200';
```

```tsx
// WidgetAnnotateToolbar.tsx — target (adds `origin-bottom`)
const popoverClass =
  'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max flex flex-wrap items-center justify-center gap-1.5 p-1.5 bg-white shadow-lg rounded-2xl border border-slate-200 origin-bottom animate-in fade-in zoom-in-95 duration-150';
```

## Repo conventions to follow

- Exemplar: `components/widgets/stickers/DraggableSticker.tsx` (`absolute top-full right-0 mt-2 w-40 origin-top-right py-1`).
- Comments are one short line at most. No new dependencies.

## Steps

1. Add `origin-top-right` to the class string in `components/classes/RestrictionsPicker.tsx` as shown.
2. Add `origin-bottom` to `popoverClass` in `components/common/WidgetAnnotateToolbar.tsx` as shown.
3. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Do NOT change placement, size, duration or any other class.
- Do NOT add origins to the other eight popovers. Their placement is computed at runtime (`components/layout/BoardBackgroundMenu.tsx` and `components/boardsModal/BoardContextMenu.tsx` through `useCardMenu`; `components/common/FloatingPanel.tsx` through its callers; `components/widgets/TextWidget/FormattingToolbar.tsx`, `components/common/library/PeriodSelector.tsx`, `components/widgets/GuidedLearning/components/interactions/TooltipInteraction.tsx` and `components/common/WidgetWhatsNewNotice.tsx` through inline styles or props), so each needs its own reading before an origin can be chosen. List in your report any you notice are trivially static.
- Modals are exempt from this rule (centre is correct for them). Do not add origins to modals.
- No feature flag, no changelog entry.
- If either excerpt does not match, STOP and report.

## Verification

- **Mechanical**: `pnpm exec vitest related --run components/classes/RestrictionsPicker.tsx components/common/WidgetAnnotateToolbar.tsx`. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite, `tsc` or `pnpm run validate`.
- **Feel check**: at 10% playback, the restrictions picker grows from its top-right corner, under the button that opened it, and the annotate toolbar popover grows upward from its bottom edge. Confirm `getComputedStyle(el).transformOrigin` resolves to the right edge / top (`100% 0%` in pixels) and to the bottom centre respectively.
- **Done when**: both computed origins are confirmed and neither popover's resting position has moved.
