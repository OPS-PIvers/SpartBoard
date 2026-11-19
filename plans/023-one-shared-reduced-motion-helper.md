# 023 — One shared reduced-motion helper in `hooks/`

- **Status**: TODO
- **Commit**: 3dcc1cd
- **Severity**: LOW
- **Category**: Accessibility (also Cohesion)
- **Estimated scope**: 1 file moved, 4 import paths updated, 7 private copies replaced

## Problem

The repo has one good reduced-motion module, but it lives under the tours folder, so other code does not find it and re-implements the check:

```ts
// components/tours/usePrefersReducedMotion.ts — current (whole file, 22 lines)
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const media = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;

const subscribe = (onChange: () => void) => {
  const mq = media();
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
};

const getSnapshot = () => media()?.matches ?? false;

/** `prefers-reduced-motion: reduce` right now, for event handlers and effects. */
export const prefersReducedMotion = getSnapshot;

/** Live `prefers-reduced-motion: reduce`. */
export const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);
```

Seven files carry a private copy of the one-shot check. Five are module-level helper functions called from handlers and effects:

```ts
// components/widgets/WidgetRenderer.tsx:92-94
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// components/widgets/QuizWidget/components/game/GameBoard.tsx:32-37
function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

// components/widgets/QuizWidget/components/present/PresentPodium.tsx:61-66
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

// components/flashcards/speak/LevelMeter.tsx:5-8  and  components/settings/useSettingsDrawerCamera.ts:13-16
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Two read the media query during render, once, and never update if the setting changes:

```tsx
// components/widgets/SmartNotebook/components/PageCanvas.tsx:82-84  and  PageEditor.tsx:325-327
const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
```

## Target

- The module lives at `hooks/usePrefersReducedMotion.ts` with the same contents and exports.
- The five helper copies are deleted and those files import `prefersReducedMotion` from `@/hooks/usePrefersReducedMotion`. In `GameBoard.tsx`, where the local function is called `reducedMotion`, import it as `import { prefersReducedMotion as reducedMotion } from '@/hooks/usePrefersReducedMotion';` so no call site changes.
- The two render-time reads become `const reducedMotion = usePrefersReducedMotion();`, which is live and safe to call during render.
- The four existing importers point at the new path.

## Repo conventions to follow

- There is no `src/`. Shared hooks live in the root-level `hooks/` folder and are imported as `@/hooks/...`.
- `extension/` is a separate package that imports app code through the `@/` alias; `extension/src/overlay/OverlayRoot.tsx:27` already imports this module that way.
- Never read `ref.current` or an external store directly during render; `useSyncExternalStore` (inside `usePrefersReducedMotion`) is the sanctioned way, which is why the two SmartNotebook sites move to the hook.
- Comments are one short line at most. No new dependencies.

## Steps

1. `git mv components/tours/usePrefersReducedMotion.ts hooks/usePrefersReducedMotion.ts`. Do not change its contents.
2. Update the four importers (`rg -n "usePrefersReducedMotion'" components extension --glob '*.{ts,tsx}'`):
   - `components/tours/LiveTourRunner.tsx:142`: `'./usePrefersReducedMotion'` becomes `'@/hooks/usePrefersReducedMotion'`.
   - `components/tours/TourStageTransition.tsx:8`: same.
   - `components/tours/TourStageTransition.test.tsx:13`: the `vi.mock('./usePrefersReducedMotion', ...)` path becomes `'@/hooks/usePrefersReducedMotion'`.
   - `extension/src/overlay/OverlayRoot.tsx:27`: `'@/components/tours/usePrefersReducedMotion'` becomes `'@/hooks/usePrefersReducedMotion'`.
3. In each of the five helper files, delete the private function and add the import. Before deleting, confirm the function body is exactly one of the excerpts above. If a body differs (extra conditions, a cached value, a listener), leave that file untouched and report it.
4. In `PageCanvas.tsx` and `PageEditor.tsx`, replace the three-line `const reducedMotion = ...` with `const reducedMotion = usePrefersReducedMotion();` and add the import. The hook call must stay at the top level of the component, in the same position.
5. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Do NOT touch the listener-based or inline checks, which have their own shapes: `components/widgets/Scoreboard/useCountUp.ts`, `components/widgets/QuizWidget/components/MatchingOrderingEditor.tsx`, `components/widgets/QuizWidget/components/RubricGradingPanel.tsx`, `components/widgets/GuidedLearning/components/GuidedLearningStage.tsx`, `components/tours/useAnchorElement.ts`, `components/tours/editor/shell/TourEditorShell.tsx`, `components/sparty/spartyRender.ts`.
- Do NOT leave a re-export shim at the old path.
- Do NOT change behaviour: no call site should pass or receive a different value.
- No feature flag, no changelog entry.

## Verification

- **Mechanical**: this moves a module imported across folders and by the extension, so run `pnpm run type-check:all` once (it includes the extension). Then `pnpm exec vitest related --run hooks/usePrefersReducedMotion.ts components/tours/TourStageTransition.test.tsx`. Confirm nothing still imports the old path: `rg -n "tours/usePrefersReducedMotion|'\./usePrefersReducedMotion'" components extension hooks` returns nothing. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite or `pnpm run validate`.
- **Behaviour check**, in a browser context with `reducedMotion: 'reduce'`: start a live tour and confirm widgets jump to their tour layout without gliding (`WidgetRenderer`); open a Smart Notebook page and zoom, confirming it behaves as it did before under reduced motion. In a default context, confirm the same two things animate as before.
- **Done when**: the type-check is clean, the old path has no importers, and seven private copies are gone (or any left are reported with the reason).
