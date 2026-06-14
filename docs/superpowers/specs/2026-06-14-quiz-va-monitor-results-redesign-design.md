# Quiz / Video Activity — Monitor & Results redesign

**Date:** 2026-06-14
**Status:** Approved (design); pending implementation plan
**Author:** Paul Ivers (+ Claude)
**Related:** PR #1932 `ui(library): modernize unified library/in-progress/archive views` (commit `84d81cd8`) — the reference design language this work extends.

## Goal

Bring the teacher-facing **Monitor** and **Results** views of the Quiz and Video Activity widgets up to the professional polish of the recently-modernized **Library** view. Four views in scope:

- `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`
- `components/widgets/QuizWidget/components/QuizResults.tsx`
- `components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx`
- `components/widgets/VideoActivityWidget/components/Results.tsx`

## Decisions (locked)

1. **Scope/sequencing:** All four views in one pass.
2. **Architecture:** Hybrid — extract a small set of shared atoms into `components/common/sessionViews/`, then restyle each view to consume them. No single rigid "shell" (Quiz has features VA lacks: scoreboard, podium, question-advance, MC distribution).
3. **Score colors:** Unify to a single 80/60 scale via a shared helper. This changes only the **color banding** teachers see on Video Activity (was 70/40) — it never changes the numeric score, accuracy math, or any grade pushed to Google Classroom / Schoology.
4. **Verification:** Build a DEV-only `/session-views-dev` harness (gated like `/library-dev`) seeded with mock sessions/responses to verify every view × state without booting Firestore.

## Non-goals / guardrails

- **Visual + information-architecture only.** No changes to data model, Firestore reads/writes, scoring math, or grade-push logic.
- The **only** behavior-visible changes are: (a) VA score _coloring_ shifts to the 80/60 scale, and (b) the Results headers move overflowing secondary actions into an overflow menu.
- Guided Learning and Mini App managers already consume the library primitives and are **out of scope**.
- All new UI must follow the project's container-query scaling rule (`min(px, Ncqmin)`, never hardcoded Tailwind size classes in scaled content).

## Design language (imported from the library primitives)

Source of truth: `components/common/library/` (`LibraryShell`, `AssignmentArchiveCard`, `LibraryItemCard`, `LibraryToolbar`, `LibraryGrid`).

- **Glassmorphism surfaces:** cards = `bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm transition-shadow hover:shadow-md`. Header/chrome = `bg-white/60 backdrop-blur-sm border-b border-slate-200/70`. Recessed panels/toolbars = `bg-white/40`.
- **Hairline list rows:** gapless container (`flex flex-col`); each row carries `border-b border-slate-200/60` + `last:border-b-0`, `rounded-lg`, transient `hover:bg-white/60`. No per-row card box, no shadow. Reserved status-dot slot (`width: min(8px, 2cqmin)`) and aligned columns (fixed-width badge, uniform action width, kebab spacer).
- **Segmented-pill tabs:** nav = `flex items-center rounded-xl bg-slate-200/50` with inner `padding: min(3px, 0.8cqmin)`; tab button `rounded-lg font-bold`, active = `bg-white text-brand-blue-dark shadow-sm`, inactive = `text-slate-500 hover:text-slate-800`; optional count badge `rounded-full`, active `bg-brand-blue-primary text-white` / inactive `bg-slate-200/70 text-slate-600`.
- **Semantic tone badges:** `rounded-full font-bold uppercase tracking-wide`, fixed `minWidth: min(60px, 14cqmin)` for column alignment. Tones:
  - success `bg-emerald-100 text-emerald-700` / dot `bg-emerald-500`
  - warn `bg-amber-100 text-amber-700` / dot `bg-amber-500`
  - info `bg-blue-100 text-blue-700` / dot `bg-blue-500`
  - neutral `bg-slate-200 text-slate-500` / dot `bg-slate-400`
  - danger `bg-red-100 text-red-700` / dot `bg-red-500`
- **Buttons:** primary = `bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-xl font-bold shadow-sm active:scale-95`; secondary = `bg-white/70 backdrop-blur-sm border border-brand-blue-primary/20 text-brand-blue-primary hover:bg-brand-blue-lighter/40`; danger = brand-red equivalents. All `disabled:opacity-50 disabled:cursor-not-allowed`.
- **Overflow menu:** `min-w-[176px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg`; items `px-3 py-1.5 font-medium`, destructive `text-brand-red-dark hover:bg-brand-red-lighter/30`.
- **Typography:** titles `font-black text-slate-800`; metadata `font-medium text-slate-600`; labels/badges `font-bold uppercase tracking-wide`. Sizing via `min(px, Ncqmin)` (titles ~`min(15px,4.8cqmin)`, body ~`min(12px,3.5cqmin)`, labels ~`min(10px,3cqmin)`).
- **Empty states:** shared `ScaledEmptyState`.

## Shared atoms — `components/common/sessionViews/`

All atoms are fully container-query scaled and theme-consistent with the library.

| File                    | Responsibility                                                                                                                                               | Key props (sketch)                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `SessionViewHeader.tsx` | Standard view header: back button, live/paused/ended status pulse + label, title/subtitle, right-aligned actions slot.                                       | `onBack`, `status?: 'live'\|'paused'\|'ended'\|'none'`, `title`, `subtitle?`, `actions?: ReactNode` |
| `SegmentedTabs.tsx`     | The pill tab group (extracted from `LibraryShell`).                                                                                                          | `tabs: {key,label,icon?,count?}[]`, `value`, `onChange`, `labelsHidden?`                            |
| `StatTile.tsx`          | KPI / overview stat tile. Optional interactive (expandable name list) + selected state.                                                                      | `icon`, `value`, `label`, `tone`, `interactive?`, `selected?`, `onClick?`, `children?`              |
| `SessionBadge.tsx`      | Tone-based status/info badge (icon, dot, uppercase, fixed-width option).                                                                                     | `tone`, `label`, `icon?`, `dot?`, `fixedWidth?`                                                     |
| `ScorePill.tsx`         | Score chip colored via the shared `scoreColor` helper.                                                                                                       | `score`, `display: 'percent'\|'count'\|'hidden'`, `count?`, `total?`, `gamified?`                   |
| `SessionRow.tsx`        | Hairline row shell: container + reserved status-dot slot + optional score-band wash + hover + trailing action/overflow slot. Content is passed by each view. | `dot?`, `tintTone?`, `children`, `trailing?`                                                        |
| `OverflowMenu.tsx`      | Generalized kebab menu (lifted from the inline library implementation) for header secondary actions.                                                         | `items: {label,icon?,onClick,destructive?,disabled?}[]`, `trigger?`                                 |
| `ActionButton.tsx`      | Primary/secondary/danger button matching library treatment; label collapses to icon-only under a width threshold.                                            | `variant`, `icon?`, `label`, `onClick`, `disabled?`, `labelHidden?`                                 |

### `utils/scoreColor.ts`

Single source of truth for the unified scale.

- `scoreTone(score: number): 'success' | 'warn' | 'danger'` — `>= 80 → success`, `>= 60 → warn`, else `danger`.
- `scoreColorClasses(score, opts?): { text, bg, border }` — Tailwind class fragments for each tone (e.g. success `text-emerald-600` / `bg-emerald-50` / `border-emerald-200`).
- Consumed by `ScorePill`, both monitors (row tint + score), and both results views (student scores, question accuracy, distribution buckets).

## `SegmentedTabs` extraction (approved)

Extract the pill-tab markup currently embedded in `LibraryShell.tsx` into the standalone `SegmentedTabs` atom, and refactor `LibraryShell` to consume it — so the library, Quiz Results, and VA Results share one tab component (zero drift). The two-stage label-collapse stays in `LibraryShell` (it owns width measurement) and is passed down via the `labelsHidden` prop. Safety net: `/library-dev` harness + existing library tests must remain green. (Fallback if regression risk proves too high: keep `LibraryShell` as-is and ship a standalone `SegmentedTabs` that mirrors its tokens — not the chosen path.)

## Per-view changes (all functionality preserved)

### QuizLiveMonitor.tsx

- Header → `SessionViewHeader` (actions = pause/resume, end, scoreboard toggle).
- KPIs (`StatBox`/`InteractiveStatBox`) → `StatTile`.
- Student list → gapless hairline `SessionRow` + `SessionBadge` + `ScorePill`; score-band tint preserved as a subtle row wash via `tintTone`.
- Glass surfaces for join-code bar, question hero, MC distribution, podium, scoreboard setup popup. Unified `scoreColor`.
- **Preserve:** pause/resume, end, advance, reveal answer on board, scoreboard config (name/PIN, completion/per-question), period filter, unlock student, unlock results, remove student, score-display cycle, colors toggle, tab-warning toggle, audio mute, MC distribution, podium.

### VideoActivityLiveMonitor.tsx

- Header → `SessionViewHeader` (actions = pause/resume, end).
- KPIs (`StatTile`-local) → shared `StatTile`.
- Student list → hairline `SessionRow` + `SessionBadge` + `ScorePill`; per-question correctness strip restyled for higher-contrast glanceability.
- Keeps existing `ScaledEmptyState`.
- **Preserve:** pause/resume, end, unlock student, tab-warning toggle, per-question correctness strip, per-student answered/last-time detail.

### QuizResults.tsx

- Header → `SessionViewHeader`. Action buttons: **Grade Written + Push Grades visible** (Push Grades = whichever push applies — Google Classroom or Schoology); remaining secondary actions (Export / Re-export Sheet, Open Sheet, Send to Scoreboard) move into `OverflowMenu`.
- Tab strip → `SegmentedTabs` (Overview / Questions / Students / PLC).
- Overview: stat cards → `StatTile` (drop the colored top-bar); distribution chart on a glass surface; buckets colored via `scoreColor`.
- Questions: hairline rows; accuracy bar restyled; manual-grading marker → `SessionBadge`.
- Students: hairline `SessionRow` list (replace spaced cards); `ScorePill`; tab-warning / results-locked → `SessionBadge`; Unlock/Delete as inline actions or row overflow.
- Period filter restyled to match.
- **Preserve:** export to Sheets, grade written responses, push grades (Classroom + Schoology), send to scoreboard, period filter, delete response, unlock results, schema-mismatch recovery.

### Results.tsx (Video Activity)

- Header → `SessionViewHeader`. Actions: **Push Grades visible** (Google Classroom or Schoology, whichever applies); Export / Open Sheet move into `OverflowMenu`. (VA has no written-response grading, so there is no Grade Written button here.) Fix the odd outlined "Open Sheet" button to match the system.
- Tab strip → `SegmentedTabs` (Overview / Questions / Students).
- Overview: 3 stat cards → `StatTile`.
- Questions: hairline rows; accuracy bar.
- Students: hairline `SessionRow`; `ScorePill` (now unified 80/60); `SessionBadge`.
- **Preserve:** export to Sheets, push grades (Classroom + Schoology), per-question accuracy, per-student detail.

## Dev harness

- `components/dev/SessionViewsDevHarness.tsx`, route `/session-views-dev`, registered in `App.tsx` under the same DEV-only gating as `/library-dev` and `/notebook-editor-dev`.
- Seeds realistic mock `QuizSession` + `QuizResponse[]` and `VideoActivitySession` + `VideoActivityResponse[]`.
- Toggles for **view × state**:
  - Monitor: waiting · live (teacher-paced) · live (self-paced) · paused · ended.
  - Results: overview · questions · students; empty + populated.
- No Firestore/Drive dependency.

## Testing & verification

- Unit tests: `scoreColor` (threshold boundaries 0/59/60/79/80/100), and each shared atom (render + key states), mirroring `tests/components/common/library/`.
- Existing suites stay green — especially library tests and `QuizManager`/`LibraryGrid`/`AssignmentArchiveCard` after the `LibraryShell` refactor.
- Visual pass through `/session-views-dev` with the preview tools for every state.
- `pnpm run validate` (type-check + lint + format-check + tests) before any push. Zero TS errors, zero lint warnings, formatted.

## File manifest

**New**

- `components/common/sessionViews/SessionViewHeader.tsx`
- `components/common/sessionViews/SegmentedTabs.tsx`
- `components/common/sessionViews/StatTile.tsx`
- `components/common/sessionViews/SessionBadge.tsx`
- `components/common/sessionViews/ScorePill.tsx`
- `components/common/sessionViews/SessionRow.tsx`
- `components/common/sessionViews/OverflowMenu.tsx`
- `components/common/sessionViews/ActionButton.tsx`
- `utils/scoreColor.ts`
- `components/dev/SessionViewsDevHarness.tsx`
- Tests under `tests/components/common/sessionViews/` and `tests/utils/scoreColor.test.ts`

**Modified**

- `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`
- `components/widgets/QuizWidget/components/QuizResults.tsx`
- `components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx`
- `components/widgets/VideoActivityWidget/components/Results.tsx`
- `components/common/library/LibraryShell.tsx` (consume `SegmentedTabs`)
- `App.tsx` (register `/session-views-dev`)

## Risks & mitigations

- **LibraryShell regression** (main risk): clean extraction; covered by `/library-dev` harness + existing library tests; behavior kept identical (label-collapse stays in the shell).
- **VA color shift** is intentional and called out; no numeric/grade impact.
- **Large monolithic files** (Quiz monitor ~3.3k lines, results ~2.4k): atom extraction reduces per-file size; keep existing memoization (e.g. `StudentRow` memo) intact.
- **Header IA change** (overflow menu) is the only layout reflow; all actions remain reachable.
