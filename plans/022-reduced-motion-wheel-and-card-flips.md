# 022 — Respect reduced motion on the random wheel and on card flips

- **Status**: TODO
- **Commit**: 3dcc1cd
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 3 files, 4 class strings

## Problem

The repo's global reduced-motion rule (`tailwind.config.js`, `reducedMotionPlugin`) switches off looping decorative animations and deliberately keeps functional transitions. Three large movements slip through because they are transitions, not listed animations, and have no `motion-reduce:` variant of their own.

**The random wheel** rotates a large SVG through several full turns for four seconds on a classroom display:

```tsx
// components/widgets/random/RandomWheel.tsx:54 — current
className =
  'w-[95%] h-[95%] drop-shadow-2xl transition-transform duration-4000 cubic-bezier(0.15, 0, 0.15, 1)';
```

(Plan 019 changes the last token on this line to `ease-[cubic-bezier(0.15,0,0.15,1)]`. Either form may be present; this plan adds one class and does not depend on which.)

**Reveal Grid cards** flip 180 degrees in 3D, in a grid of many cards, at two sites:

```tsx
// components/widgets/RevealGrid/Widget.tsx:253-257 and 331-335 — current (identical)
className={`w-full h-full transition-all duration-500 ${
  revealMode === 'flip'
    ? `preserve-3d ${card.isRevealed ? 'rotate-y-180' : ''}`
    : ''
}`}
```

**Custom Widget flip cards** do the same:

```tsx
// components/widgets/CustomWidget/BlockRenderer.tsx:203 — current
className = 'w-full h-full relative transition-transform duration-500';
```

## Target

Under `prefers-reduced-motion: reduce`, each of these changes state instantly: the wheel lands on its result without spinning, and a card shows its other face without rotating through the flip. The state change itself is still visible, so no information is lost.

```tsx
// RandomWheel.tsx — target: add `motion-reduce:transition-none` after `duration-4000`
className =
  'w-[95%] h-[95%] drop-shadow-2xl transition-transform duration-4000 motion-reduce:transition-none cubic-bezier(0.15, 0, 0.15, 1)';
```

```tsx
// RevealGrid/Widget.tsx, both sites — target: name the property and add the guard
className={`w-full h-full transition-transform duration-500 motion-reduce:transition-none ${
```

`transition-all` becomes `transition-transform` here because only the rotation changes on this element, and in Tailwind v4 `transition-transform` covers `transform, translate, scale, rotate`.

```tsx
// CustomWidget/BlockRenderer.tsx — target
className =
  'w-full h-full relative transition-transform duration-500 motion-reduce:transition-none';
```

## Repo conventions to follow

- Reduced-motion guards are written inline with `motion-reduce:`. Exemplar on a flip: `components/flashcards/FlashcardsMode.tsx` around line 210, which swaps its flip for a fade under reduced motion. That richer treatment is not required here; an instant change is enough.
- Exemplar of the plain guard: `components/widgets/PollWidget/Widget.tsx` line 488 (`transition-all duration-500 motion-reduce:transition-none`).
- Comments are one short line at most. No new dependencies.

## Steps

1. `RandomWheel.tsx:54`: insert `motion-reduce:transition-none` directly after `duration-4000`.
2. `RevealGrid/Widget.tsx`: at both sites (`rg -n 'transition-all duration-500' components/widgets/RevealGrid/Widget.tsx` should return exactly two lines that are followed by `revealMode === 'flip'`), replace `transition-all duration-500` with `transition-transform duration-500 motion-reduce:transition-none`.
3. `CustomWidget/BlockRenderer.tsx:203`: append `motion-reduce:transition-none`.
4. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Do NOT change the wheel's duration or the JavaScript wait in `components/widgets/random/RandomWidget.tsx` (the result still appears after four seconds under reduced motion; shortening that wait is a behaviour change for a later decision). Say in the PR description that this delay remains.
- Do NOT touch the Reveal Grid's non-flip reveal modes, the card faces (`backface-hidden rotate-y-180`), or the `scale(0)` reveal block lower in `BlockRenderer.tsx` (plan 024 owns it).
- Do NOT touch the Breathing widget. Its motion is the exercise the teacher started on purpose, so it is treated as essential and left running.
- Do NOT edit `tailwind.config.js` or the reduced-motion lists.
- No feature flag, no changelog entry.
- If any excerpt does not match, STOP and report.

## Verification

- **Mechanical**: `pnpm exec vitest related --run components/widgets/random/RandomWheel.tsx components/widgets/RevealGrid/Widget.tsx components/widgets/CustomWidget/BlockRenderer.tsx`. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite, `tsc` or `pnpm run validate`.
- **Feel check**, in two browser contexts (default, and `reducedMotion: 'reduce'`):
  - Default: the wheel spins for four seconds and cards flip over 500ms, exactly as before.
  - Reduced: `getComputedStyle(el).transitionDuration` is `0s` on the wheel SVG, on a Reveal Grid card wrapper and on a Custom Widget flip card. Spin the wheel: it is at its final angle on the next frame, and the result still shows. Click a Reveal Grid card in flip mode: the other face shows on the next frame with no rotation.
- **Done when**: all three report `0s` under reduced motion and are unchanged without it.
