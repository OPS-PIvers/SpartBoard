# 010 — Add easing tokens and give every `animate-in` entrance a strong ease-out

- **Status**: DONE
- **Commit**: 9ac6534
- **Severity**: HIGH
- **Category**: Easing & duration (also Cohesion & tokens)
- **Estimated scope**: 2 files, about 20 added lines

## Problem

About 150 elements enter with the `tailwindcss-animate` classes `animate-in fade-in zoom-in-95 slide-in-from-*`: every modal, dialog, popover menu, dock popover and toast. The plugin's `.animate-in` rule sets only the animation name and duration, so the browser default timing function, `ease`, applies. `ease` is too weak for an entrance: it starts slowly, which is the moment the teacher is watching.

```js
// node_modules/tailwindcss-animate/index.js:14-16 — current (do not edit, shown for context)
".animate-in": {
	animationName: "enter",
	animationDuration: theme("animationDuration.DEFAULT"),
```

```tsx
// components/common/FloatingPanel.tsx:20-21 — a typical site, no ease class
const baseStyles =
  'z-popover animate-in fade-in zoom-in-95 duration-200 border shadow-xl';
```

The repo also has no shared easing tokens. Seven `cubic-bezier` values are typed by hand in different files, and plans 011 and 013 need a shared curve to point at.

```css
/* index.css:12-15 — current, the only @theme block */
/* Keeps Tailwind v3's preflight defaults that v4 changed (border, ring and placeholder colours, field backgrounds, button cursor). */
@theme {
  --default-ring-color: rgb(59 130 246 / 0.5);
}
```

## Target

Three easing tokens exist as Tailwind v4 theme variables, and `.animate-in` / `.animate-out` use the strong ease-out by default. Any element that already carries an `ease-*` utility keeps its own curve, because the new rule sits in the `base` layer and utilities win over it.

```css
/* index.css — add directly after the existing @theme block (after line 15) */

/* Motion curves. `static` keeps them in the build even when no utility uses them. */
@theme static {
  --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}

/* tailwindcss-animate sets no timing function, so entrances and exits would run on bare `ease`. */
@layer base {
  .animate-in,
  .animate-out {
    animation-timing-function: var(--ease-out-strong);
  }
}
```

Because `--ease-*` is a Tailwind v4 theme namespace, these tokens also produce the utilities `ease-out-strong`, `ease-in-out-strong` and `ease-drawer` for `transition-*` classes. Plans 011 and 013 use `ease-out-strong` and `var(--ease-out-strong)`.

One element must keep constant-speed motion. The long-press ring on the board grows while the teacher holds a finger down, so it is a progress indicator and gets `ease-linear`:

```tsx
// components/layout/BoardMenuHost.tsx:406 — current
className =
  'fixed z-popover pointer-events-none w-16 h-16 -ml-8 -mt-8 rounded-full border-4 border-brand-blue-primary/70 bg-white/30 shadow-lg animate-in fade-in zoom-in-50 duration-500 delay-200 fill-mode-both';

// target (only `ease-linear` added, before `fill-mode-both`)
className =
  'fixed z-popover pointer-events-none w-16 h-16 -ml-8 -mt-8 rounded-full border-4 border-brand-blue-primary/70 bg-white/30 shadow-lg animate-in fade-in zoom-in-50 duration-500 delay-200 ease-linear fill-mode-both';
```

## Repo conventions to follow

- Tailwind is v4.3.5, loaded in `index.css` with `@import 'tailwindcss';` and `@config "./tailwind.config.js";`. Theme variables go in `@theme` in `index.css`.
- CSS comments in `index.css` are one short line. Do not write multi-line comment blocks.
- Exemplar of an explicit ease class overriding the animation curve: `components/groupReminders/GroupReminderLayer.tsx:157` (`animate-in slide-in-from-bottom-full fade-in duration-1000 ease-out`). It must keep its own `ease-out` after this change.
- pnpm only. Never `npm install`.

## Steps

1. In `index.css`, directly after the closing `}` of the `@theme` block on line 15, add the `@theme static` block and the `@layer base` block exactly as shown in Target, each preceded by its one-line comment.
2. In `components/layout/BoardMenuHost.tsx` line 406, add `ease-linear` to the class string as shown in Target.
3. Do not edit any other `animate-in` site. The global rule covers them.

## Boundaries

- Do NOT edit `node_modules/` or `tailwind.config.js`.
- Do NOT rename, move or delete any existing keyframes or classes in `index.css`.
- Do NOT replace the seven hand-typed `cubic-bezier` values elsewhere in the repo with the new tokens. That is a separate consolidation.
- Do NOT change any duration.
- Do NOT add new dependencies.
- Do NOT add a feature flag or a `public/changelog.json` entry: this is a styling tweak.
- If `index.css` lines 12 to 15 or `BoardMenuHost.tsx` line 406 do not match the excerpts above, STOP and report instead of improvising.

## Verification

- **Mechanical**: stage the two files and commit. The Husky pre-commit hook runs ESLint and Prettier on staged files, and a successful commit is the lint gate. Run `pnpm exec vitest related --run index.css components/layout/BoardMenuHost.tsx tests/utils/reducedMotion.test.ts` and expect it to pass. Do not run `pnpm run validate`, full lint, full tests or `tsc`.
- **Feel check**: start the `vite-dev` server (port 3000), sign in, and open a board.
  - Open any modal (for example the widget library from the Dock). In DevTools, select the modal panel that has the class `animate-in` and read Computed > `animation-timing-function`. It must be `cubic-bezier(0.23, 1, 0.32, 1)`. If it is `ease`, the tokens were not emitted: STOP and report.
  - In the DevTools Animations panel set playback to 10% and open a popover menu (right-click the board background). The panel should cover most of its distance in the first third of the animation and then settle. It must not start slowly.
  - Trigger a group reminder if one is available, or inspect `GroupReminderLayer` in the element tree: its entrance must still compute to Tailwind's `ease-out` (`cubic-bezier(0, 0, 0.2, 1)`), not the strong curve.
  - Press and hold on the board background. The ring must grow at a constant speed for its whole 500ms.
  - Toggle `prefers-reduced-motion: reduce` in the Rendering panel and confirm modals still fade in (entrances are deliberately kept under reduced motion in this repo).
- **Done when**: the computed timing function of an `animate-in` element with no `ease-*` class is `cubic-bezier(0.23, 1, 0.32, 1)`, the long-press ring is linear, and the commit succeeds.
