# SpartBoard Unifier — Nightly Consistency Memory

_Run count: 2_
_Last run: 2026-05-27_
_Base branch: dev-paul_

---

## Project Commands

| Purpose             | Command                                             |
| ------------------- | --------------------------------------------------- |
| Install             | `pnpm run install:all`                              |
| **Validate (gate)** | `pnpm run validate` — must be green before any work |
| Type-check only     | `pnpm exec tsc --noEmit`                            |
| Lint only           | `pnpm exec eslint <file> --max-warnings 0`          |
| Format check        | `pnpm exec prettier --check <file>`                 |
| Build               | `pnpm run build`                                    |

---

## Existing Dimension Journals

These dimensions are already tracked by scheduled-tasks journals. The unifier does NOT re-audit them — read those files directly before touching related code.

| Journal                                       | Path                                               | Cadence    | Last Audited |
| --------------------------------------------- | -------------------------------------------------- | ---------- | ------------ |
| CSS Scaling (cqmin patterns)                  | `docs/scheduled-tasks/css-scaling.md`              | Daily      | 2026-05-24   |
| UI Unification (appearance, hardcoded colors) | `docs/scheduled-tasks/ui-unification.md`           | Weekly Wed | 2026-05-22   |
| Widget Registry consistency                   | `docs/scheduled-tasks/widget-registry.md`          | Daily      | 2026-05-24   |
| TypeScript & ESLint health                    | `docs/scheduled-tasks/typescript-eslint.md`        | Daily      | 2026-05-24   |
| Admin Config & Settings alignment             | `docs/scheduled-tasks/admin-settings-alignment.md` | Weekly Thu | 2026-05-24   |

---

## Unifier Dimensions

Five dimensions not covered by the journals above.

### D1 — Widget Empty States

**Scope:** Widget front-face content — the "no data" / "add items to begin" state shown when a widget has no content to display.

**Canon:** Use `<ScaledEmptyState icon={IconName} title="..." subtitle="..." />` from `components/common/ScaledEmptyState.tsx`. Never hand-roll a centered div with an icon and text. The shared component handles container-query scaling, icon sizing, and consistent visual tone automatically.

**Reference usage:**

```tsx
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Clock } from 'lucide-react';

<ScaledEmptyState
  icon={Clock}
  title="No Schedule"
  subtitle="Flip to add schedule items."
/>;
```

**Key distinction:** Info-only panels (e.g., First5/Settings.tsx) that are always shown and not triggered by missing data are NOT empty states — leave them alone.

---

### D2 — Brand Color CSS Variables in Inline Styles

**Scope:** Any widget or component that sets brand blue/red as a background or foreground color via an inline `style={{}}` prop.

**Canon:** Use `var(--spart-primary, #2d3f89)` for brand blue and `var(--spart-accent, #ad2122)` for brand red. The fallback value preserves the existing color if the admin has not customized the theme. Hardcoding `#2d3f89` in an inline style bypasses the admin's global style configuration.

**Set by:** `DashboardView.tsx` reads admin config and writes `--spart-primary` / `--spart-accent` as CSS custom properties on the root dashboard container.

**Key distinction:** User-configurable color picker defaults (e.g., Countdown `eventColor = '#2d3f89'`, MaterialsWidget `titleColor = '#2d3f89'`) are correct as-is — they are user-owned values, not theme references. Color palette arrays (NextUp/Settings color picker, CollectionColorPicker) are swatch definitions, not theme references. CSS gradient stops in design components (BannerInteraction) are intentional. Only fix inline `backgroundColor` / `color` that should visually track the admin's theme.

---

### D3 — Settings Panel Label Primitives

**Scope:** Labels above form controls in widget Settings components (back-face flip panel).

**Canon:** Use `<SettingsLabel>Label Text</SettingsLabel>` from `components/common/SettingsLabel.tsx`. This encapsulates `text-xxs font-black text-slate-400 uppercase tracking-widest block mb-2` into a single component. Do not hand-roll this class combination.

**Optional icon:** `<SettingsLabel icon={Clock}>Label</SettingsLabel>` for labeled sections with icons.
**HTML for:** `<SettingsLabel htmlFor="my-input">Label</SettingsLabel>` when labeling a form input.

**Key distinction:** Descriptive body text and help text (`text-xs text-slate-400` explanatory paragraphs) are NOT SettingsLabel — leave them as `<p>` tags. Only the small uppercase section/field labels should use SettingsLabel. Button text (`font-black uppercase tracking-widest` on `<button>` elements) is NOT SettingsLabel — leave it alone.

---

### D4 — Import Path Convention (Cross-Directory)

**Scope:** Import statements that reference modules in a different directory from the importing file.

**Canon:** Use the `@/` alias for all cross-directory imports. The alias maps to the repo root. Examples:

- `import { WidgetLayout } from '@/components/widgets/WidgetLayout'` ✓
- `import { Toggle } from '@/components/common/Toggle'` ✓
- `import { useDashboard } from '@/context/useDashboard'` ✓

Relative `'../foo'` imports are acceptable ONLY within a flat sibling context (same directory, e.g., `import { X } from './helper'`). Multi-level `'../foo'` reaching into a different feature directory is the anti-pattern.

**Key distinction:** True same-directory imports (`./`) and direct parent sibling (`'../WidgetLayout'` from inside a widget subfolder) sit in a gray zone. The dominant pattern for WidgetLayout is `@/components/widgets/WidgetLayout` — prefer that form on new code and when touching a file anyway.

---

### D5 — Toast Architecture in Admin Components

**Scope:** Admin panels, configuration modals, and other components that surface in-app notifications.

**Canon:** `addToast(message, type)` via `useDashboard()` — the centralized toast queue rendered by DashboardView's ToastContainer.

**Acceptable exception (local Toast component):** Several admin modal components use `<Toast message="..." type="..." />` from `components/common/Toast` with local `useState`. This pattern is acceptable when:

1. The component may render outside a DashboardProvider context (e.g., student-facing or subs routes), OR
2. The notification is inline within the modal body rather than a global overlay.

**Do not unify the local Toast pattern blindly** — confirm whether `useDashboard()` is available in the component's render tree before replacing with `addToast`. If it is available, prefer `addToast`.

---

## The Canon

| Dimension          | Canonical Form                                             | Anti-Pattern                                                                                      |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| D1 Empty States    | `<ScaledEmptyState icon={X} title="..." subtitle="..." />` | Hand-rolled `<div className="h-full flex flex-col items-center justify-center">` with icon + text |
| D2 Brand Colors    | `backgroundColor: 'var(--spart-primary, #2d3f89)'`         | `backgroundColor: '#2d3f89'` in inline styles that should track admin theme                       |
| D3 Settings Labels | `<SettingsLabel>LABEL</SettingsLabel>`                     | `<p className="text-xxs font-black text-slate-400 uppercase tracking-widest block mb-2">`         |
| D4 Import Paths    | `import { X } from '@/components/...'`                     | `import { X } from '../common/...'` for cross-directory references                                |
| D5 Toast (admin)   | `addToast(msg, type)` from `useDashboard()`                | Local `useState` + `<Toast />` when DashboardContext is available in tree                         |

---

## Intentional Exceptions — DO NOT UNIFY

These variations look like snowflakes but are deliberate — never auto-unify them.

| ID    | Pattern                                                                                         | Reason                                                                           |
| ----- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| D1-E1 | `First5/Settings.tsx` info panel                                                                | Always-visible information display, not a missing-data state                     |
| D1-E2 | Loading spinners and skeleton states mid-fetch                                                  | Not an empty state; data may still be loading                                    |
| D1-E3 | `ConceptWeb/Widget.tsx` — no explicit empty state when `nodes.length === 0`                     | Blank canvas IS the intended zero state; "+ Add Node" button is sufficient UX    |
| D2-E1 | `Countdown/Widget.tsx` `eventColor = '#2d3f89'`                                                 | User-configurable color — default to brand blue intentionally                    |
| D2-E2 | `MaterialsWidget/Settings.tsx` `titleColor = '#2d3f89'`                                         | User-configurable color                                                          |
| D2-E3 | `NextUp/Settings.tsx` color picker palette, `CollectionColorPicker.tsx`                         | Swatch definitions, not theme references                                         |
| D2-E4 | `BannerInteraction.tsx` gradient color stops                                                    | Pure design, not theme-coupled                                                   |
| D2-E5 | `MusicWidget/Widget.tsx` station fallback color                                                 | Per-station fallback, distinct from widget chrome                                |
| D3-E1 | Button text styled `font-black uppercase tracking-widest` on `<button>` elements                | Button labels, not settings section labels — leave them alone                    |
| D3-E2 | Collapsible section header buttons in Schedule/Settings (lines ~621, ~694)                      | Interactive controls, not label primitives                                       |
| D4-E1 | True same-file sibling imports `'./helper'`                                                     | Same directory — relative is unambiguous and fine                                |
| D4-E2 | `'../WidgetLayout'` already in committed working code                                           | Touch only when editing the file for another reason                              |
| D5-E1 | Local `Toast` in admin modals/configs that may render outside DashboardProvider                 | Justified isolation pattern                                                      |
| D5-E2 | `GlobalPermissionsManager`, `CalendarConfigurationModal`, etc. local Toast                      | As above — these are inside AdminSettings which may have edge-case Provider gaps |

---

## Inconsistency Backlog

Ordered roughly by severity. Pick the top OPEN item per dimension each night. One unification per dimension per run.

### D1 — Widget Empty States

| Severity | Status          | File                                               | Detail                                                                                                      |
| -------- | --------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| MEDIUM   | CLOSED (run 1)  | `components/widgets/InstructionalRoutines/Widget.tsx:217` | Step badge color → var(--spart-primary) — shipped                                                      |
| MEDIUM   | SHIPPED (run 2) | `components/widgets/MaterialsWidget/index.tsx:180` | Hand-rolled focused-empty state → ScaledEmptyState — PR #1704                                              |
| MEDIUM   | OPEN            | `components/widgets/SmartNotebook/Widget.tsx`      | Library component may have hand-rolled no-notebooks state — investigate Library.tsx sub-component           |
| LOW      | CLOSED          | `components/widgets/ConceptWeb/Widget.tsx`         | Blank canvas IS the intended zero state (D1-E3 exception added)                                             |
| LOW      | OPEN            | `components/widgets/GuidedLearning/Widget.tsx:778` | Custom "no sets" message div                                                                                |

### D2 — Brand Color CSS Variables

| Severity | Status          | File                                                      | Detail                                                                                                                                           |
| -------- | --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| LOW      | SHIPPED (run 1) | `components/widgets/InstructionalRoutines/Widget.tsx:217` | Step badge `#2d3f89` → `var(--spart-primary, #2d3f89)`                                                                                           |
| LOW      | SHIPPED (run 2) | `components/widgets/LunchCount/Widget.tsx:583`            | Hot-lunch display text `color: '#2d3f89'` → `var(--spart-primary, #2d3f89)` — PR #1705                                                           |
| LOW      | OPEN            | Audit needed                                              | Sweep for any remaining hardcoded `#ad2122` (brand red) in inline styles not already using `var(--spart-accent)` — next audit pass                |

### D3 — Settings Panel Label Primitives

| Severity | Status          | File                                                  | Detail                                                                                                                                             |
| -------- | --------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| MEDIUM   | SHIPPED (run 2) | `components/widgets/Schedule/Settings.tsx`            | 2 section heading labels → SettingsLabel — PR #1706                                                                                               |
| MEDIUM   | OPEN            | `components/widgets/VideoActivityWidget/Settings.tsx` | Hand-rolled uppercase labels — check and fix                                                                                                       |
| LOW      | OPEN            | `components/widgets/Calendar/Settings.tsx`            | 3+ label instances `text-xxs text-slate-400 uppercase tracking-widest` — candidates for SettingsLabel                                              |
| LOW      | OPEN            | `components/widgets/random/RandomSettings.tsx`        | 6 instances `text-xxs text-slate-400 uppercase tracking-widest mb-3 block` — all SettingsLabel candidates                                          |
| LOW      | OPEN            | `components/widgets/LunchCount/Settings.tsx`          | 4 instances — same pattern                                                                                                                         |
| LOW      | OPEN            | `components/widgets/SpecialistSchedule/Settings.tsx`  | 3 instances with exact canonical classes — easiest conversion                                                                                      |
| LOW      | STALE           | `components/widgets/PollWidget/Settings.tsx`          | Already uses SettingsLabel — remove from backlog                                                                                                   |

### D4 — Import Path Convention

| Severity | Status          | File                                           | Detail                                                                                            |
| -------- | --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| LOW      | SHIPPED (run 2) | `layout/Dock.tsx`, `layout/RemoteControlMenu.tsx`, `widgets/WidgetRenderer.tsx`, `student/StudentApp.tsx` | 5 imports fixed → @/ alias — PR #1707                              |
| LOW      | OPEN            | `components/admin/` — ~29 instances, ~16 files | `'../common/Toggle'`, `'../common/Toast'`, `'../common/Modal'` etc. → `'@/components/common/...'` |
| LOW      | OPEN            | `components/plc/` — ~18 instances              | Relative imports within plc/ subtree crossing subdirectory boundaries                             |
| LOW      | OPEN            | `components/settingsModal/sections/` — 4 files | `'../SettingsSectionHeader'` → @/ alias                                                           |
| LOW      | OPEN            | `hooks/`, `context/`, `utils/` — 43/54/22     | Relative root-sibling imports; large pass, requires care around test tsconfig resolution           |

### D5 — Toast Architecture

| Severity | Status          | File                                                      | Detail                                                                     |
| -------- | --------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| LOW      | SHIPPED (run 2) | `components/admin/WorkSymbolsConfigurationModal.tsx`      | Local Toast → addToast — PR #1708                                          |
| LOW      | CLOSED          | `components/admin/GraphicOrganizerConfigurationModal.tsx` | Already uses addToast — no action needed                                   |
| LOW      | CLOSED (D5-E2)  | `components/admin/GlobalPermissionsManager.tsx`           | Intentional exception confirmed                                            |

---

## Run Log

| Date       | Branch                                              | Dimension          | Action                                                                                                                                              | PR      |
| ---------- | --------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 2026-05-27 | `nightly/unify-empty-states-2026-05-27-clean`       | D1 Empty States    | Shipped — MaterialsWidget/index.tsx:180 hand-rolled focused-empty → ScaledEmptyState                                                                | #1704   |
| 2026-05-27 | `nightly/unify-brand-colors-2026-05-27-clean`       | D2 Brand Colors    | Shipped — LunchCount/Widget.tsx:583 `color: '#2d3f89'` → `var(--spart-primary, #2d3f89)`                                                           | #1705   |
| 2026-05-27 | `nightly/unify-settings-labels-2026-05-27-clean`    | D3 Settings Labels | Shipped — Schedule/Settings.tsx 2 section heading labels → SettingsLabel                                                                            | #1706   |
| 2026-05-27 | `nightly/unify-import-paths-2026-05-27-clean`       | D4 Import Paths    | Shipped — 5 imports fixed in layout/widgets/student (Dock, RemoteControlMenu, WidgetRenderer, StudentApp)                                           | #1707   |
| 2026-05-27 | `nightly/unify-toast-arch-2026-05-27-clean`         | D5 Toast Arch      | Shipped — WorkSymbolsConfigurationModal local Toast → addToast; GraphicOrganizer already clean                                                     | #1708   |
| 2026-05-26 | `nightly/unify-brand-color-2026-05-26`              | D2 Brand Colors    | Shipped — InstructionalRoutines/Widget.tsx:217 step badge `#2d3f89` → `var(--spart-primary, #2d3f89)`                                               | TBD     |
| 2026-05-26 | bootstrap                                           | D1 Empty States    | Audited — 31 widgets use ScaledEmptyState; 4 hand-rolled instances added to backlog                                                                 | —       |
| 2026-05-26 | bootstrap                                           | D2 Brand Colors    | Audited — 2 fixable instances; 1 shipped, 1 needs investigation                                                                                     | —       |
| 2026-05-26 | bootstrap                                           | D3 Settings Labels | Audited — ~105 hand-rolled occurrences; backlog seeded                                                                                              | —       |
| 2026-05-26 | bootstrap                                           | D4 Import Paths    | Audited — 8 relative WidgetLayout imports + 23 relative admin/common/ imports; backlog seeded                                                       | —       |
| 2026-05-26 | bootstrap                                           | D5 Toast           | Audited — addToast is 100% consistent; local Toast in admin modals confirmed as intentional pattern; 3 items to investigate                          | —       |

---

## Notes & Gotchas

- **Validate must be green before any run.** If already red, STOP and report — do not attempt consistency work on a broken baseline.
- **css-scaling.md guidance overrides CLAUDE.md on cqh/cqw:** Some widgets intentionally use `min(Xcqh, Ycqw)` for better aspect-ratio fill. The css-scaling.md journal explicitly marks these as "won't fix." Do not re-flag them.
- **The `--spart-primary` var is scoped to the dashboard container**, not the document root — it will not resolve in portaled elements rendered to `document.body`. Confirm render tree before using it.
- **ScaledEmptyState is `skipScaling: true`-aware** — it uses `cqmin` units internally; no additional scaling needed in the caller.
- **SettingsLabel is for settings back-face only** — never use it in front-face widget content; settings panels do not need container query scaling.
- **Button text with uppercase tracking-widest is NOT SettingsLabel** — only section/field labels above form controls. Collapsible header buttons (e.g., in Schedule/Settings) are explicitly excepted (D3-E1, D3-E2).
- **D4 admin/ files deferred:** The ~29 admin/ instances of relative imports were deferred from run 2. D4 agent reported these as not yet on its worktree HEAD. Prioritize `components/admin/` for next D4 pass.
- **One unification per dimension per night.** Resist the urge to sweep all instances; the goal is preventing regrowth via enforcement, not a one-time manual sweep.
- **PollWidget/Settings.tsx D3 backlog entry is STALE** — file already uses SettingsLabel throughout. Closed in run 2 review.
- **Worktree isolation note (run 2):** Agent worktrees may share changes if one agent's worktree is created after another completes. When cherry-picking commits for clean PRs, verify each commit touches only its dimension's files. D5 commit landed directly on dev-paul (dev-paul push required after unifier run).
