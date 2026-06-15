# F1 — WCAG AA contrast sweep for muted text on dark surfaces

**Dimension:** ux-a11y · **Impact:** 7 · **Effort:** medium · **Risk:** medium ·
**Behavior change:** yes (visual) — **needs design sign-off from Paul before merge.**

## Problem

Muted slate text (`text-slate-300` / `text-slate-400` / `text-slate-500`) is used
for real, user-facing label/metadata text on the dark dashboard surface
(`slate-900`, `#0f172a`). On that background `text-slate-400` (`#94a3b8`) lands at
~2.8:1 — below the WCAG AA minimum of 4.5:1 for normal text. This fails the
project's own "Accessibility Baseline" and "Glanceable at distance" principles
(text must be legible on a washed-out classroom projector), and it's systemic
rather than a one-off.

This is the merged form of three explore findings (the original
ScaledEmptyState-specific and GuidedLearningResults-specific findings are
subsumed here).

## Current-state evidence

- `components/common/ScaledEmptyState.tsx:33-35` — default `titleClassName` /
  `subtitleClassName` / `iconClassName` use `text-slate-500` / `text-slate-400` /
  `text-slate-300`. This is the **fallback UI for 60+ widgets**, so it's the
  highest-reach instance.
- `components/widgets/GuidedLearning/components/GuidedLearningResults.tsx:201,232,240,248,255`
  — `text-slate-300/400` for "Total / Done / Avg Score" stat labels teachers read
  at a glance.
- `components/widgets/GuidedLearning/components/GuidedLearningManager.tsx:773,1013,1103,1166,1221,1341,1350`
  — same pattern across the manager UI.
- Broader: ~1300 `text-slate-300/400` occurrences exist repo-wide, but **many are
  legitimate** (decorative icons, or text on _light_ admin/student surfaces). This
  task is not a blind find-replace.

## Proposed approach

1. **Triage, don't bulk-replace.** Categorize each muted-text usage on a
   **dark** surface into: (a) decorative/icon (add `aria-hidden`, leave color),
   (b) real text on dark bg (upgrade contrast), (c) text on light bg (leave).
2. **Start with the highest-reach, lowest-risk node:** `ScaledEmptyState`
   defaults. Bump `text-slate-500` → `text-slate-200`, `text-slate-400` →
   `text-slate-300`, verify ≥4.5:1 on `slate-900`. This alone fixes the empty
   state across 60+ widgets.
3. Then the GuidedLearning results/manager labels.
4. Consider introducing semantic tokens (e.g. a `text-muted-on-dark` utility, or
   a documented pair in `config/` / tailwind theme) so future code has a
   contrast-correct default instead of reaching for raw `slate-400`. This avoids
   re-introducing the problem.

## Risks

- Over-correcting text on **light** surfaces would make _those_ too low-contrast.
  Verify each change against its actual rendered background, not globally.
- `ScaledEmptyState` is rendered over user-chosen backgrounds in some widgets;
  confirm the readability surface behind it still gives AA contrast.
- Purely visual change — get Paul's design nod (brand wants "calm, restrained";
  don't over-darken into heavy blocks).

## Acceptance criteria

- All _text_ (not decorative icons) on the dark dashboard surface meets ≥4.5:1
  (normal) / ≥3:1 (large, ≥18pt or 14pt bold).
- `ScaledEmptyState` defaults verified at AA on `slate-900`.
- No regression on light/student/login surfaces.
- Icon-only muted glyphs that are decorative carry `aria-hidden`.
- A short note in CLAUDE.md (Widget Appearance Standard) on the contrast-safe
  muted-text token, if one is introduced.

## Kickoff prompt

> Implement F1 from `docs/optimize-pass/01-accessibility-contrast.md`: fix
> sub-AA muted slate text on the dark dashboard surface, starting with
> `ScaledEmptyState` defaults (highest reach) then GuidedLearningResults/Manager
> labels. Triage each usage by its actual background — do NOT blind-replace
> `text-slate-400` globally, since many instances are decorative icons or sit on
> light surfaces. Verify ≥4.5:1 on `slate-900`. This is a visual change; keep it
> restrained per the brand's "calm/restrained" direction and surface before/after
> swatches for review. Add a contrast-safe muted-text token if it prevents
> regressions, and document it in CLAUDE.md.
