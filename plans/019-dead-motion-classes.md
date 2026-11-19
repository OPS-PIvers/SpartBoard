# 019 — Fix or remove four motion classes that do nothing

- **Status**: TODO
- **Commit**: 3dcc1cd
- **Severity**: MEDIUM
- **Category**: Easing & duration (dead motion)
- **Estimated scope**: 3 files, 5 class strings

## Problem

Four places declare motion that never runs. Each looks intentional in the source, so the next person to read it will assume it works.

**1. The random wheel's deceleration curve is not a class.** A bare `cubic-bezier(...)` in a class string is not a Tailwind utility, so the 4-second spin runs on Tailwind's default `cubic-bezier(0.4, 0, 0.2, 1)` and not the long deceleration that was intended.

```tsx
// components/widgets/random/RandomWheel.tsx:54 — current
className =
  'w-[95%] h-[95%] drop-shadow-2xl transition-transform duration-4000 cubic-bezier(0.15, 0, 0.15, 1)';
```

**2. `animate-pulse-slow` is defined nowhere.** It is not in `tailwind.config.js` or `index.css`, so the Music widget's album art never pulses while playing. The repo's rule (`components/CLAUDE.md`) is that nothing pulses unless it signals urgency, so the right fix is to delete the dead class, not to define it.

```tsx
// components/widgets/MusicWidget/Widget.tsx:457 — current
className={`w-full h-full rounded-xl object-cover shadow-lg transition-all duration-500 ${isPlaying ? 'animate-pulse-slow' : ''}`}

// components/widgets/MusicWidget/Widget.tsx:603 — current
className={`w-full h-full rounded-2xl object-cover shadow-2xl transition-all duration-500 group-hover:scale-105 ${isPlaying ? 'animate-pulse-slow' : ''}`}
```

**3. The spotlight dimming overlay's fade cannot play.** The overlay is mounted and unmounted, and its opacity never changes while mounted, so `transition-opacity duration-500 ease-in-out` has nothing to transition. The dim appears in a single frame.

```tsx
// components/layout/DashboardView.tsx:1956-1957 — current
<div
  className="fixed inset-0 z-backdrop bg-slate-900/80 transition-opacity duration-500 ease-in-out"
```

**4. The dashboard root carries a one-second `transition-all`.** The only things that change on this element are `fontClass` (font family, which cannot be transitioned) and the CSS variables in `cssVars` (unregistered custom properties, which cannot be transitioned either). The board background sits on a child. So the transition animates nothing useful, and `transition-all` on the app root is a standing invitation for a slow accidental animation.

```tsx
// components/layout/DashboardView.tsx:1696 — current
className={`relative h-screen w-screen overflow-hidden transition-all duration-1000 ${fontClass}`}
```

## Target

```tsx
// RandomWheel.tsx — target: the curve becomes a real utility
className =
  'w-[95%] h-[95%] drop-shadow-2xl transition-transform duration-4000 ease-[cubic-bezier(0.15,0,0.15,1)]';
```

```tsx
// MusicWidget/Widget.tsx:457 — target: dead class removed, transition narrowed
className = 'w-full h-full rounded-xl object-cover shadow-lg';

// MusicWidget/Widget.tsx:603 — target: dead class removed; the hover scale keeps its transition
className =
  'w-full h-full rounded-2xl object-cover shadow-2xl transition-[scale] duration-500 group-hover:scale-105';
```

Line 457 has no hover or state class left once `animate-pulse-slow` goes, so it needs no transition at all. Line 603 keeps `group-hover:scale-105`; in Tailwind v4 that sets the `scale` property, so the list is `transition-[scale]`.

```tsx
// DashboardView.tsx spotlight overlay — target: an entrance that actually runs
<div
  className="fixed inset-0 z-backdrop bg-slate-900/80 animate-in fade-in duration-200"
```

`animate-in` gets the strong ease-out from the base rule in `index.css`. There is still no exit fade; adding one needs delayed unmounting and is out of scope.

```tsx
// DashboardView.tsx root — target: dead transition removed
className={`relative h-screen w-screen overflow-hidden ${fontClass}`}
```

## Repo conventions to follow

- Arbitrary easing is written `ease-[cubic-bezier(a,b,c,d)]` with no spaces, as in `components/layout/Dock.tsx` before it moved to a token.
- Backdrops fade with `animate-in fade-in duration-200`: exemplar `components/common/Modal.tsx:162`.
- Comments are one short line at most. No new dependencies.

## Steps

1. `RandomWheel.tsx:54`: replace `cubic-bezier(0.15, 0, 0.15, 1)` with `ease-[cubic-bezier(0.15,0,0.15,1)]`.
2. `MusicWidget/Widget.tsx`: replace the two class expressions with the targets. If `isPlaying` becomes unused in either scope after the edit, leave the variable alone unless ESLint reports it; if it does, remove only the unused binding.
3. `DashboardView.tsx`: replace `transition-opacity duration-500 ease-in-out` on the spotlight overlay with `animate-in fade-in duration-200`.
4. `DashboardView.tsx`: remove `transition-all duration-1000 ` from the root `className`.
5. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Do NOT change the wheel's 4-second duration. `components/widgets/random/RandomWidget.tsx:1319` waits the same `4000` ms in JavaScript before showing the result.
- Do NOT define `animate-pulse-slow`.
- Do NOT touch `components/student/StudentApp.tsx` (its roots also carry `transition-all duration-1000`, but there the background classes do change; that needs its own look).
- Do NOT touch the dead `transition-opacity duration-500 ease-in-out` on `components/layout/BoardCanvas.tsx`; the board-switch work owns that file.
- No feature flag, no changelog entry.
- If any excerpt does not match, STOP and report.

## Verification

- **Mechanical**: `pnpm exec vitest related --run components/widgets/random/RandomWheel.tsx components/widgets/MusicWidget/Widget.tsx components/layout/DashboardView.tsx`. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite, `tsc` or `pnpm run validate`.
- **Feel check**, in the browser:
  - Random widget in wheel mode: `getComputedStyle(svg).transitionTimingFunction` is `cubic-bezier(0.15, 0, 0.15, 1)`. Spin it: the wheel should get up to speed quickly and spend most of the four seconds slowing down, landing as the result appears. This is a visible change in how the spin feels; describe it in your report so the reviewer knows to look.
  - Music widget: album art is steady while playing; in the larger layout the art still grows slightly on hover.
  - Spotlight a widget (widget toolbar): the dim fades in over 200ms. Clicking the dim still clears the spotlight.
  - Change the board font in settings and switch boards: nothing on the board animates over a second. Compare a screenshot of the board before and after the change to confirm the root looks identical at rest.
- **Done when**: the wheel's computed timing function is the intended curve, the two dead classes are gone, the overlay fades in, and the root has no transition.
