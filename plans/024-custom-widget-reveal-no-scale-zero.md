# 024 — Custom Widget reveal: grow from 95% with a fade, not from nothing

- **Status**: DONE
- **Commit**: 3dcc1cd
- **Severity**: LOW
- **Category**: Physicality & origin
- **Estimated scope**: 1 file, 1 element

## Problem

The reveal block in a Custom Widget shows its content by scaling it from zero over 500ms through `transition-all`, with no change in opacity. Nothing in the physical world appears from a point, and half a second is long for a reveal the teacher triggered with a click.

```tsx
// components/widgets/CustomWidget/BlockRenderer.tsx:298-304 — current
<div
  className="transition-all duration-500"
  style={{
    transform: isRevealed ? 'scale(1)' : 'scale(0)',
    fontSize: 'min(48px, 20cqmin)',
  }}
>
```

## Target

The content fades in while growing from 95%, over `200ms`, on `cubic-bezier(0.23, 1, 0.32, 1)` (the `ease-out-strong` utility in `index.css`). Only `transform` and `opacity` transition. Under reduced motion it only fades.

```tsx
// target
<div
  className="transition-[transform,opacity] duration-200 ease-out-strong motion-reduce:transition-opacity"
  style={{
    transform: isRevealed ? 'scale(1)' : 'scale(0.95)',
    opacity: isRevealed ? 1 : 0,
    fontSize: 'min(48px, 20cqmin)',
  }}
>
```

The scale here is an inline `transform`, not a Tailwind `scale-*` utility, so `transform` is the correct property to name in the transition list.

Under reduced motion the inline `transform` still changes between `scale(0.95)` and `scale(1)`, but with `motion-reduce:transition-opacity` it changes instantly while opacity fades, which is the intended result.

## Repo conventions to follow

- `ease-out-strong` comes from the `@theme static` block near the top of `index.css`.
- The inline `fontSize` in `cqmin` is how widget content scales; leave it exactly as it is.
- Comments are one short line at most. No new dependencies.

## Steps

1. Read the surrounding block first (`BlockRenderer.tsx` from about line 280 to 310) and work out what is visible before the reveal. If the hidden content must not be reachable or readable before it is revealed (for example a cover sits over it), opacity 0 keeps it invisible, which matches the current `scale(0)`. If the block relies on the hidden content taking no space, note that `scale(0)` never changed layout either, so nothing changes there.
2. Replace the element's `className` and `style` with the target.
3. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Do NOT touch the flip card earlier in the same file (line 203); plan 022 owns it.
- Do NOT change the reveal's trigger, the `dispatch` call, or the block's markup.
- No feature flag, no changelog entry.
- If the excerpt does not match, STOP and report.

## Verification

- **Mechanical**: `pnpm exec vitest related --run components/widgets/CustomWidget/BlockRenderer.tsx`. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite, `tsc` or `pnpm run validate`.
- **Feel check**: build or open a Custom Widget with a reveal block (the Custom Widget editor in the bypass app; if you cannot reach one, say so). Click to reveal at 10% playback: the content fades in and grows only slightly, never from a point. Before the reveal, `getComputedStyle(el).opacity` is `0`. Click again if the block toggles: it fades out. With `prefers-reduced-motion: reduce`, it fades with no visible scaling.
- **Done when**: the hidden state is `scale(0.95)` at opacity 0, and the computed transition is `transform, opacity` over `0.2s`.
