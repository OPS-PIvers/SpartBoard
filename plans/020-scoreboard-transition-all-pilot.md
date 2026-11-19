# 020 — Measure whether `transition-all` makes widget contents lag on resize, and fix Scoreboard if so

- **Status**: DONE
- **Commit**: 3dcc1cd
- **Severity**: MEDIUM (unconfirmed until step 1)
- **Category**: Performance
- **Estimated scope**: 2 files, 8 class strings, plus a measurement

## Problem

About 167 elements inside widgets combine `transition-all` with inline sizes in container-query units (`cqmin`). Example:

```tsx
// components/widgets/Scoreboard/components/ScoreboardRowItem.tsx:80-85 — current
className={`flex items-center ${colorClass} text-white rounded-xl border border-white/20 shadow-xs transition-all`}
style={{
  padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
  gap: 'min(8px, 2cqmin)',
}}
```

When a widget is resized, maximized or snapped, the computed `padding`, `gap` and `font-size` of such an element change, and `transition-all` should make each of them ease over 150ms instead of following the widget. The contents would visibly trail the frame while a teacher drags a corner, and every frame of the drag would start new layout animations.

**This has not been observed.** It follows from how CSS transitions work, but nobody has measured it. This plan measures it on one widget and fixes that widget only if the lag is real. The result decides whether a repo-wide sweep is worth doing.

The eight `transition-all` sites in the Scoreboard:

- `components/widgets/Scoreboard/components/ScoreboardRowItem.tsx` lines 64, 80, 199, 216
- `components/widgets/Scoreboard/components/ScoreboardItem.tsx` lines 159, 171, 299, 330

Locate them with `rg -n 'transition-all' components/widgets/Scoreboard/components/ScoreboardRowItem.tsx components/widgets/Scoreboard/components/ScoreboardItem.tsx`. Six are buttons with `hover:bg-slate-50 active:scale-95`; line 80 is the row container shown above; line 171 is the card container with `hover:shadow-md`.

## Target

If step 1 confirms the lag, replace `transition-all` with plain `transition` at all eight sites.

In Tailwind v4, `transition` covers colours, opacity, box-shadow, `transform`, `translate`, `scale`, `rotate` and filters. It does not include `padding`, `gap`, `font-size`, `width` or `height`. So hover colours, hover shadows and the `active:scale-95` press all keep easing, and sizes follow the widget immediately.

If step 1 does not confirm the lag, change nothing in the source.

## Repo conventions to follow

- Widget contents scale with container queries; see `components/widgets/CLAUDE.md`. Do not change any inline `style` value.
- Comments are one short line at most. No new dependencies.

## Steps

1. Measure before editing. Start the bypass dev server (`vite-verify` entry in `.claude/launch.json`). Add a Scoreboard widget with at least two teams. Pick the row or card container (`ScoreboardRowItem.tsx:80` or `ScoreboardItem.tsx:171`, whichever layout renders) and one score button. With Playwright:
   - Start a `requestAnimationFrame` sampler recording, per frame: the widget frame's width, and the container's computed `paddingLeft` and the button's computed `fontSize` (or `width`, whichever its inline style sets in `cqmin`).
   - Drag the widget's resize handle so the widget roughly doubles in width over about 300ms, then hold still for 400ms.
   - The lag is confirmed if, after the widget's width stops changing, `paddingLeft` or the button's size keeps changing for more than two further frames (it should take about 150ms to settle). It is absent if they settle on the same frame as the width.
   - Record the numbers either way: frames and milliseconds between the width settling and the last padding or size change.
2. If the lag is absent, STOP. Change no source. Mark this plan `REJECTED (measured: no lag)` here and in `plans/README.md`, with the numbers.
3. If the lag is confirmed, replace `transition-all` with `transition` at the eight sites.
4. Repeat the measurement. Sizes should now settle on the same frame as the width.
5. Mark this plan DONE here and in `plans/README.md`, and put both sets of numbers in your report. State plainly whether the result justifies a sweep of the other widgets.

## Boundaries

- Scoreboard only. Do NOT touch `transition-all` in any other widget, even ones with the same shape; that is a separate, larger change that depends on this result.
- Do NOT change inline styles, colours, markup, the count-up animation (`components/widgets/Scoreboard/useCountUp.ts`) or any `tourAttr` anchor.
- No feature flag, no changelog entry.
- If the search does not return exactly eight sites, STOP and report.

## Verification

- **Mechanical**: `pnpm exec vitest related --run components/widgets/Scoreboard/components/ScoreboardRowItem.tsx components/widgets/Scoreboard/components/ScoreboardItem.tsx`. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite, `tsc` or `pnpm run validate`.
- **Feel check** (only if edited): drag a corner of the Scoreboard quickly back and forth; the rows, text and buttons should stay locked to the frame with no rubber-band trailing. Hover a score button: its background still eases. Press it: it still shrinks to 95% and returns. Hover a card in the grid layout: the shadow still eases.
- **Done when**: before and after measurements are reported, and either the eight sites are changed or the plan is marked REJECTED with the reason.
