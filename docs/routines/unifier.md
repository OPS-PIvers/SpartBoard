# SpartBoard Unifier — Nightly Consistency Memory

_Run count: 7_
_Last run: 2026-06-03_
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

**Status (run 4):** Dimension is ALIGNED. All `#ad2122` instances are intentional exceptions. All `#2d3f89` inline style instances are fixed or intentional exceptions. `MusicWidget/Widget.tsx:348` fallback color is D2-E5; `Countdown/Widget.test.tsx` assertion is a test file, not production code. No further D2 work needed until a new widget introduces the anti-pattern.

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
2. The notification is **inline within the modal body** — the `<Toast>` renders inside the modal's JSX tree, adjacent to content rather than as a global overlay. This is intentional UX because stacked z-index layering means a global `addToast` would appear behind the modal overlay.

**Do not unify the local Toast pattern blindly** — confirm whether `useDashboard()` is available in the component's render tree before replacing with `addToast`. If it is available AND the toast is used as a global overlay (not inline in modal body), prefer `addToast`.

**Status (run 4):** D5 is exhaustively documented. Two new admin components found during run 4 staleness scan — `SaveAsTemplateModal.tsx` (D5-E15) and `Organization/OrganizationPanel.tsx` (D5-E16) — both confirmed intentional exceptions (inline modal body and full-panel manager respectively). No further admin component conversions are expected.

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

| ID     | Pattern                                                                                           | Reason                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| D1-E1  | `First5/Settings.tsx` info panel                                                                  | Always-visible information display, not a missing-data state                                                                  |
| D1-E2  | Loading spinners and skeleton states mid-fetch                                                    | Not an empty state; data may still be loading                                                                                 |
| D1-E3  | `ConceptWeb/Widget.tsx` — no explicit empty state when `nodes.length === 0`                       | Blank canvas IS the intended zero state; "+ Add Node" button is sufficient UX                                                 |
| D1-E4  | `GuidedLearning/Widget.tsx` view-only share results screen (~line 778)                            | Results/confirmation panel with action button — not a missing-data empty state; analogous to D1-E1                            |
| D1-E5  | `stickers/StickerItemWidget.tsx:184` "No Image" placeholder                                       | Sticker-specific pink dashed-border indicator for missing image; in-situ, intentional pink styling distinct from ScaledEmptyState |
| D2-E1  | `Countdown/Widget.tsx` `eventColor = '#2d3f89'`                                                   | User-configurable color — default to brand blue intentionally                                                                 |
| D2-E2  | `MaterialsWidget/Settings.tsx` `titleColor = '#2d3f89'`                                           | User-configurable color                                                                                                       |
| D2-E3  | `NextUp/Settings.tsx` color picker palette, `CollectionColorPicker.tsx`                           | Swatch definitions, not theme references                                                                                      |
| D2-E4  | `BannerInteraction.tsx` gradient color stops                                                      | Pure design, not theme-coupled                                                                                                |
| D2-E5  | `MusicWidget/Widget.tsx` station fallback color                                                   | Per-station fallback, distinct from widget chrome                                                                             |
| D2-E6  | `Analytics/AnalyticsManager.tsx` `accentColor="#ad2122"` on KpiCard, `fill`/`stopColor` on charts | Data-visualization colors — one of many palette entries, not a UI theme reference; coupling to `var(--spart-accent)` is wrong |
| D2-E7  | `admin/NextUpConfigurationPanel.tsx` color palette array                                          | Swatch definition                                                                                                             |
| D2-E8  | `layout/sidebar/StylePanel.tsx` `DEFAULT_ACCENT_COLOR` constant                                   | Default for admin color picker — correctly hardcoded                                                                          |
| D2-E9  | `admin/Organization/views/StudentPageView.tsx` `ACCENT_PRESETS` array                             | Color preset array — swatch definitions                                                                                       |
| D3-E1  | Button text styled `font-black uppercase tracking-widest` on `<button>` elements                  | Button labels, not settings section labels — leave them alone                                                                 |
| D3-E2  | Collapsible section header buttons in Schedule/Settings (lines ~621, ~694)                        | Interactive controls, not label primitives                                                                                    |
| D3-E3  | `LunchCount/Settings.tsx` `<span className="text-xxs text-indigo-700 uppercase tracking-wider">`  | Indigo-themed label for Manual Mode section — different color and tracking, intentionally distinct from slate-400 form labels |
| D3-E4  | `LunchCount/Settings.tsx` `<div className="text-xxs uppercase text-slate-400 tracking-widest">`   | Visual placeholder text inside a dashed-border rosterMode indicator — not a form control label                                |
| D4-E1  | True same-file sibling imports `'./helper'`                                                       | Same directory — relative is unambiguous and fine                                                                             |
| D4-E2  | `'../WidgetLayout'` already in committed working code                                             | Touch only when editing the file for another reason                                                                           |
| D5-E1  | Local `Toast` in admin modals/configs that may render outside DashboardProvider                   | Justified isolation pattern                                                                                                   |
| D5-E2  | `GlobalPermissionsManager`, `CalendarConfigurationModal` local Toast                              | Inline modal notifications; z-index stacking means global addToast would appear behind modal                                  |
| D5-E3  | `GraphicOrganizerConfigurationModal.tsx` local `toastMessage` state                               | Inline validation warning in modal body — not a global notification                                                           |
| D5-E4  | `MiniAppLibraryModal.tsx` local `message` state                                                   | Inline notification within modal body                                                                                         |
| D5-E5  | `VideoActivityConfigurationModal.tsx` local `message` state                                       | Inline notification within modal body                                                                                         |
| D5-E6  | `SpecialistScheduleConfigurationModal.tsx` local `message` state                                  | Inline notification within modal body                                                                                         |
| D5-E7  | `PdfLibraryModal.tsx` local `message` state                                                       | Inline notification within modal body                                                                                         |
| D5-E8  | `BloomsTaxonomyConfigurationModal.tsx` local `message` state                                      | Inline notification within modal body                                                                                         |
| D5-E9  | `FeaturePermissionsManager.tsx` local `message` state                                             | Inline notification within panel body                                                                                         |
| D5-E10 | `StarterPackConfigurationModal.tsx` local `message` state                                         | Inline notification within modal body                                                                                         |
| D5-E11 | `CatalystConfigurationModal.tsx` local `message` state                                            | Inline notification within modal body                                                                                         |
| D5-E12 | `BackgroundManager/index.tsx` local `message` state                                               | Inline notification within panel body                                                                                         |
| D5-E13 | `LinkShortenerManager.tsx` local `toast` state with fixed-positioned wrapper div                  | Full-panel manager; fixed-positioned wrapper approximates global overlay but is acceptable as-is                              |
| D5-E14 | `InstructionalRoutines/LibraryManager.tsx` local Toast for loading state                          | Widget-level local UI, not an admin notification                                                                              |
| D5-E15 | `SaveAsTemplateModal.tsx` local `message` state                                                   | Inline notification within modal body                                                                                         |
| D5-E16 | `Organization/OrganizationPanel.tsx` local `toast` state with custom `OrgToast` component         | Full-panel manager with own toast system + setTimeout auto-dismiss; analogous to D5-E13                                       |

---

## Inconsistency Backlog

Ordered roughly by severity. Pick the top OPEN item per dimension each night. One unification per dimension per run.

### D1 — Widget Empty States

| Severity | Status          | File                                                              | Detail                                                                                       |
| -------- | --------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| MEDIUM   | CLOSED (run 1)  | `components/widgets/InstructionalRoutines/Widget.tsx:217`         | Step badge color → var(--spart-primary) — shipped                                            |
| MEDIUM   | SHIPPED (run 2) | `components/widgets/MaterialsWidget/index.tsx:180`                | Hand-rolled focused-empty state → ScaledEmptyState — PR #1704                                |
| MEDIUM   | SHIPPED (run 3) | `components/widgets/NextUp/Widget.tsx`                            | Hand-rolled "Queue is not active" state → ScaledEmptyState — PR #1721                        |
| MEDIUM   | CLOSED (run 3)  | `components/widgets/SmartNotebook/Widget.tsx`                     | Library.tsx already uses ScaledEmptyState — no action needed                                 |
| MEDIUM   | SHIPPED (run 4) | `components/widgets/VideoActivityWidget/Widget.tsx` lines 324–373 | Two guards → ScaledEmptyState — PR #1746                                                     |
| LOW      | CLOSED (D1-E4)  | `components/widgets/GuidedLearning/Widget.tsx:778`                | View-only share results screen — intentional variation, added as D1-E4                       |
| LOW      | SHIPPED (run 5) | `components/widgets/random/RandomWidget.tsx` lines 1505–1580      | "No Names Provided" / "Everyone Absent Today" → ScaledEmptyState with action prop — PR #1770 |

### D2 — Brand Color CSS Variables

| Severity | Status          | File                                                      | Detail                                                                                 |
| -------- | --------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| LOW      | SHIPPED (run 1) | `components/widgets/InstructionalRoutines/Widget.tsx:217` | Step badge `#2d3f89` → `var(--spart-primary, #2d3f89)`                                 |
| LOW      | SHIPPED (run 2) | `components/widgets/LunchCount/Widget.tsx:583`            | Hot-lunch display text `color: '#2d3f89'` → `var(--spart-primary, #2d3f89)` — PR #1705 |
| LOW      | CLOSED (run 3)  | Audit: `#ad2122` sweep                                    | All instances are intentional exceptions — dimension fully aligned                     |

### D3 — Settings Panel Label Primitives

| Severity | Status          | File                                                  | Detail                                                                                                                                      |
| -------- | --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| MEDIUM   | SHIPPED (run 2) | `components/widgets/Schedule/Settings.tsx`            | 2 section heading labels → SettingsLabel — PR #1706                                                                                         |
| MEDIUM   | CLOSED (run 3)  | `components/widgets/VideoActivityWidget/Settings.tsx` | Already clean — uses `text-sm font-bold text-slate-700` pattern, not the canonical anti-pattern                                             |
| LOW      | SHIPPED (run 3) | `components/widgets/Calendar/Settings.tsx`            | 3 labels → SettingsLabel — PR #1722                                                                                                         |
| LOW      | SHIPPED (run 4) | `components/widgets/random/RandomSettings.tsx`        | 7 instances (6 found + 1 already clean) → SettingsLabel; icon form used for Hash/Puzzle labels — PR #1747                                   |
| LOW      | SHIPPED (run 5) | `components/widgets/LunchCount/Settings.tsx`          | 4 instances → SettingsLabel; 3 intentional variations left alone (D3-E3, D3-E4, colon separator) — PR #1771                                 |
| LOW      | SHIPPED (run 6) | `components/widgets/SpecialistSchedule/Settings.tsx`  | 10 instances (8 `mb-1 block` + 2 icon-flex variants) → SettingsLabel; mb-1→mb-2 and font-black additions are canonical alignment — PR #1783 |
| LOW      | SHIPPED (run 7) | `components/widgets/MathToolInstance/Settings.tsx`    | 6 instances → SettingsLabel; mb-1 dead-code overrides dropped; `text-brand-blue-light` label (~line 59) left alone (intentional) — PR #1822 |
| LOW      | CLOSED (STALE)  | `components/widgets/PollWidget/Settings.tsx`          | Already uses SettingsLabel throughout                                                                                                       |
| LOW      | OPEN            | `components/widgets/NextUp/Settings.tsx`              | 3 instances at lines ~246, ~346, ~397 — standard `text-xxs font-black text-slate-400 uppercase tracking-widest block` anti-pattern          |
| LOW      | OPEN            | `components/widgets/MathTools/Settings.tsx`           | 1 instance at line ~32                                                                                                                      |
| LOW      | OPEN            | `components/widgets/RecessGear/Settings.tsx`          | 1 instance at line ~54                                                                                                                      |
| LOW      | NEEDS REVIEW    | `components/widgets/ExpectationsWidget/Settings.tsx`  | 1 instance at line ~14 — MISSING `font-black`, has `flex items-center gap-2`; may be intentional lighter weight (use SettingsLabel icon form if converting) |
| LOW      | NEEDS REVIEW    | `components/widgets/SoundWidget/Settings.tsx`         | 1 instance at line ~171 — MISSING `font-black`; may be intentional lighter weight                                                           |
| LOW      | NEEDS REVIEW    | `components/widgets/LunchCount/SubmitReportModal.tsx` | Lines 105, 111, 123 are read-only data display `<span>` elements (outside D3 scope); line 196 is `<label htmlFor>` on a textarea in a submit modal — not a settings back-face panel; human decision needed on whether SubmitReportModal labels fall under D3 |

### D4 — Import Path Convention

| Severity | Status          | File                                                                                                      | Detail                                                                                                                                                                                                                  |
| -------- | --------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOW      | SHIPPED (run 2) | `layout/Dock.tsx`, `layout/RemoteControlMenu.tsx`, `widgets/WidgetRenderer.tsx`, `student/StudentApp.tsx` | 5 imports fixed → @/ alias — PR #1707                                                                                                                                                                                   |
| LOW      | SHIPPED (run 3) | `components/admin/` — 15 files, 25 imports                                                                | `'../common/Toggle'`, `'../common/Toast'`, `'../common/Modal'` etc. → `'@/components/common/...'` — PR #1723                                                                                                            |
| LOW      | CLOSED (run 4)  | `components/plc/` (original entry) — overview/, grid/, tabs/                                              | plc/ was substantially restructured on dev-paul (overview/, grid/ deleted; tabs/ changed) between bootstrap and run 4; D4 branch obsolete; re-audited below                                                             |
| LOW      | SHIPPED (run 5) | `components/settingsModal/sections/` — 4 files                                                            | `'../SettingsSectionHeader'` → @/ alias in all 4 section files; no remaining `../` imports in the directory — PR #1772                                                                                                  |
| LOW      | SHIPPED (run 6) | `components/plc/home/cards/` — 4 files                                                                    | `../../sections` (2-level relative to plc root) → `@/components/plc/sections`; clearest anti-pattern in plc/ tree — PR #1782                                                                                            |
| LOW      | SHIPPED (run 7) | `components/plc/tabs/` ↔ `components/plc/bodies/` — 7 files                                               | tabs→bodies (5 files) + bodies→tabs (2 files), 9 cross-subdir imports → `@/components/plc/...`; gray-zone plc-root imports preserved — PR #1823                                                                        |
| LOW      | OPEN            | `components/plc/authoring/` — 2 files                                                                     | `PlcAuthorQuizModal.tsx` and `PlcAuthorVideoActivityModal.tsx`: `'../assignments/PlcAssignmentConfigModal'` (authoring→assignments cross-subdir)                                                                         |
| LOW      | OPEN            | `components/plc/tabs/PlcAssignmentsInProgressSubTab.tsx`                                                   | Line ~26: `'../assignments/PlcAssignmentSessionModal'` (tabs→assignments cross-subdir)                                                                                                                                  |
| LOW      | OPEN            | `hooks/`, `context/`, `utils/` — 43/54/22                                                                 | Relative root-sibling imports; large pass, requires care around test tsconfig resolution                                                                                                                                |

### D5 — Toast Architecture

| Severity | Status          | File                                                                                              | Detail                                                                                                    |
| -------- | --------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| LOW      | SHIPPED (run 2) | `components/admin/WorkSymbolsConfigurationModal.tsx`                                              | Local Toast → addToast — PR #1708                                                                         |
| LOW      | CLOSED          | `components/admin/GraphicOrganizerConfigurationModal.tsx`                                         | Inline validation warning — intentional exception (D5-E3)                                                 |
| LOW      | CLOSED (D5-E2)  | `components/admin/GlobalPermissionsManager.tsx`                                                   | Intentional exception confirmed                                                                           |
| LOW      | SHIPPED (run 3) | `components/admin/InstructionalRoutinesManager.tsx`                                               | Local Toast state → addToast (removes useState/useRef/useEffect/useCallback) — PR #1724                   |
| LOW      | CLOSED (run 3)  | All other admin modal local Toast patterns                                                        | 11 components confirmed as intentional exceptions (D5-E4 through D5-E14) — dimension exhaustively audited |
| LOW      | CLOSED (run 4)  | `components/admin/SaveAsTemplateModal.tsx`, `components/admin/Organization/OrganizationPanel.tsx` | Staleness scan found 2 new files; both confirmed intentional exceptions (D5-E15, D5-E16)                  |

---

## Run Log

| Date       | Branch                                           | Dimension          | Action                                                                                                                                                                                                                           | PR    |
| ---------- | ------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 2026-06-03 | —                                                | D1 Empty States    | Aligned — StickerItemWidget "No Image" placeholder inspected; sticker-specific pink styling, not a missing-data state; classified D1-E5. D1 backlog exhausted.                                                                  | —     |
| 2026-06-03 | —                                                | D2 Brand Colors    | Aligned — no new inline brand color instances. MusicWidget D2-E5 confirmed still the only remaining exception.                                                                                                                   | —     |
| 2026-06-03 | `nightly/unify-settings-labels-2026-06-03`       | D3 Settings Labels | Shipped — MathToolInstance/Settings.tsx 6 hand-rolled labels → SettingsLabel; mb-1 dead-code overrides dropped; text-brand-blue-light label (~line 59) intentionally left alone; validate ✅ 390/3994                            | #1822 |
| 2026-06-03 | `nightly/unify-import-paths-plc-tabs-bodies-2026-06-03` | D4 Import Paths | Shipped — tabs↔bodies cluster (7 files, 9 imports): tabs→bodies (5 files) + bodies→tabs (2 files) converted to @/ alias; gray-zone plc-root imports preserved; validate ✅ 390/3994                                     | #1823 |
| 2026-06-03 | —                                                | D5 Toast Arch      | Aligned — UsersView.tsx `message` state is an email invite form field, not a toast notification. No new D5 violations.                                                                                                           | —     |
| 2026-06-01 | —                                                | D1 Empty States    | Aligned — backlog exhausted (all items shipped or classified as intentional exceptions); no new widgets found with hand-rolled empty states                                                                                      | —     |
| 2026-06-01 | —                                                | D2 Brand Colors    | Aligned — dimension fully enumerated; no new instances                                                                                                                                                                           | —     |
| 2026-06-01 | `nightly/unify-settings-labels-2026-06-01`       | D3 Settings Labels | Shipped — SpecialistSchedule/Settings.tsx 10 hand-rolled labels → SettingsLabel (8 `mb-1 block` + 2 icon-flex variants); mb-1→mb-2 and font-black on icon labels are canonical alignment; validate ✅ 17/336                     | #1783 |
| 2026-06-01 | `nightly/unify-import-paths-plc-2026-06-01`      | D4 Import Paths    | Shipped — plc/home/cards/ 4 files `../../sections` → `@/components/plc/sections`; deepest/clearest anti-pattern in plc/ tree; validate ✅ 17/336                                                                                 | #1782 |
| 2026-06-01 | —                                                | D5 Toast Arch      | Aligned — no new admin components found; dimension exhaustively documented                                                                                                                                                       | —     |
| 2026-05-31 | `nightly/unify-empty-states-2026-05-31`          | D1 Empty States    | Shipped — RandomWidget.tsx hand-rolled "No Names Provided"/"Everyone Absent Today" guard → ScaledEmptyState with action prop (conditional "Update attendance" button)                                                            | #1770 |
| 2026-05-31 | —                                                | D2 Brand Colors    | Aligned — no new production instances; dimension fully enumerated                                                                                                                                                                | —     |
| 2026-05-31 | `nightly/unify-settings-labels-2026-05-31`       | D3 Settings Labels | Shipped — LunchCount/Settings.tsx 4 labels → SettingsLabel; orchestrator repair removed dead className="mb-1.5" overrides (Tailwind mb-2 wins on CSS order); 3 intentional variations left alone (D3-E3, D3-E4, colon separator) | #1771 |
| 2026-05-31 | `nightly/unify-import-paths-2026-05-31`          | D4 Import Paths    | Shipped — settingsModal/sections/ 4 files, '../SettingsSectionHeader' → @/ alias; no remaining ../ imports in directory                                                                                                          | #1772 |
| 2026-05-31 | —                                                | D5 Toast Arch      | Aligned — no new admin components found; dimension exhaustively documented                                                                                                                                                       | —     |
| 2026-05-29 | `nightly/unify-empty-states-2026-05-29`          | D1 Empty States    | Shipped — VideoActivityWidget/Widget.tsx two hand-rolled guard states → ScaledEmptyState; rebase resolved conflict (getVideoActivityBehavior import added on dev-paul)                                                           | #1746 |
| 2026-05-29 | —                                                | D2 Brand Colors    | Aligned — MusicWidget fallback (D2-E5) and test assertion confirmed; no new production instances                                                                                                                                 | —     |
| 2026-05-29 | `nightly/unify-settings-labels-2026-05-29`       | D3 Settings Labels | Shipped — RandomSettings.tsx 7 hand-rolled labels → SettingsLabel (includes icon form for Hash/Puzzle); 4 card-title/button exceptions correctly excluded                                                                        | #1747 |
| 2026-05-29 | —                                                | D4 Import Paths    | Deferred — plc/ was substantially restructured on dev-paul (overview/, grid/ deleted) between bootstrap and run 4; D4 branch discarded; re-audit plc/ new structure next run                                                     | —     |
| 2026-05-29 | —                                                | D5 Toast Arch      | Aligned — 2 new admin components found (SaveAsTemplateModal, OrganizationPanel); both confirmed intentional exceptions (D5-E15, D5-E16)                                                                                          | —     |
| 2026-05-28 | `nightly/unify-empty-states-2026-05-28`          | D1 Empty States    | Shipped — NextUp/Widget.tsx hand-rolled "Queue is not active" state → ScaledEmptyState; SmartNotebook already clean                                                                                                              | #1721 |
| 2026-05-28 | —                                                | D2 Brand Colors    | Aligned — #ad2122 sweep complete, all instances are intentional exceptions; prior fixes already on dev-paul                                                                                                                      | —     |
| 2026-05-28 | `nightly/unify-settings-labels-2026-05-28`       | D3 Settings Labels | Shipped — Calendar/Settings.tsx 3 labels → SettingsLabel; VideoActivityWidget already clean                                                                                                                                      | #1722 |
| 2026-05-28 | `nightly/unify-import-paths-admin-2026-05-28`    | D4 Import Paths    | Shipped — 15 admin files, 25 imports converted from `'../common/...'` and `'../widgets/...'` to @/ alias                                                                                                                         | #1723 |
| 2026-05-28 | `nightly/unify-toast-routines-2026-05-28`        | D5 Toast Arch      | Shipped — InstructionalRoutinesManager local Toast state → addToast; 11 other admin modal patterns confirmed as intentional exceptions                                                                                           | #1724 |
| 2026-05-27 | `nightly/unify-empty-states-2026-05-27-clean`    | D1 Empty States    | Shipped — MaterialsWidget/index.tsx:180 hand-rolled focused-empty → ScaledEmptyState                                                                                                                                             | #1704 |
| 2026-05-27 | `nightly/unify-brand-colors-2026-05-27-clean`    | D2 Brand Colors    | Shipped — LunchCount/Widget.tsx:583 `color: '#2d3f89'` → `var(--spart-primary, #2d3f89)`                                                                                                                                         | #1705 |
| 2026-05-27 | `nightly/unify-settings-labels-2026-05-27-clean` | D3 Settings Labels | Shipped — Schedule/Settings.tsx 2 section heading labels → SettingsLabel                                                                                                                                                         | #1706 |
| 2026-05-27 | `nightly/unify-import-paths-2026-05-27-clean`    | D4 Import Paths    | Shipped — 5 imports fixed in layout/widgets/student (Dock, RemoteControlMenu, WidgetRenderer, StudentApp)                                                                                                                        | #1707 |
| 2026-05-27 | `nightly/unify-toast-arch-2026-05-27-clean`      | D5 Toast Arch      | Shipped — WorkSymbolsConfigurationModal local Toast → addToast; GraphicOrganizer already clean                                                                                                                                   | #1708 |
| 2026-05-26 | `nightly/unify-brand-color-2026-05-26`           | D2 Brand Colors    | Shipped — InstructionalRoutines/Widget.tsx:217 step badge `#2d3f89` → `var(--spart-primary, #2d3f89)`                                                                                                                            | TBD   |
| 2026-05-26 | bootstrap                                        | D1 Empty States    | Audited — 31 widgets use ScaledEmptyState; 4 hand-rolled instances added to backlog                                                                                                                                              | —     |
| 2026-05-26 | bootstrap                                        | D2 Brand Colors    | Audited — 2 fixable instances; 1 shipped, 1 needs investigation                                                                                                                                                                  | —     |
| 2026-05-26 | bootstrap                                        | D3 Settings Labels | Audited — ~105 hand-rolled occurrences; backlog seeded                                                                                                                                                                           | —     |
| 2026-05-26 | bootstrap                                        | D4 Import Paths    | Audited — 8 relative WidgetLayout imports + 23 relative admin/common/ imports; backlog seeded                                                                                                                                    | —     |
| 2026-05-26 | bootstrap                                        | D5 Toast           | Audited — addToast is 100% consistent; local Toast in admin modals confirmed as intentional pattern; 3 items to investigate                                                                                                      | —     |

---

## Notes & Gotchas

- **Validate must be green before any run.** If already red, STOP and report — do not attempt consistency work on a broken baseline.
- **css-scaling.md guidance overrides CLAUDE.md on cqh/cqw:** Some widgets intentionally use `min(Xcqh, Ycqw)` for better aspect-ratio fill. The css-scaling.md journal explicitly marks these as "won't fix." Do not re-flag them.
- **The `--spart-primary` var is scoped to the dashboard container**, not the document root — it will not resolve in portaled elements rendered to `document.body`. Confirm render tree before using it.
- **ScaledEmptyState is `skipScaling: true`-aware** — it uses `cqmin` units internally; no additional scaling needed in the caller.
- **SettingsLabel is for settings back-face only** — never use it in front-face widget content; settings panels do not need container query scaling.
- **Button text with uppercase tracking-widest is NOT SettingsLabel** — only section/field labels above form controls. Collapsible header buttons (e.g., in Schedule/Settings) are explicitly excepted (D3-E1, D3-E2).
- **D2 is fully aligned (run 3):** No remaining actionable inline-style hardcoded brand colors. All `#ad2122` instances are intentional exceptions. Future D2 audits only needed when a new widget is added.
- **D5 admin Toast pattern fully documented (run 3):** All remaining local Toast instances in admin components are intentional exceptions (D5-E2 through D5-E14). The pattern is inline-in-modal-body for z-index reasons — confirmed legitimate UX. `InstructionalRoutinesManager` was the last convertible instance. Future D5 runs should check NEW admin components only.
- **One unification per dimension per night.** Resist the urge to sweep all instances; the goal is preventing regrowth via enforcement, not a one-time manual sweep.
- **PollWidget/Settings.tsx D3 backlog entry is STALE** — file already uses SettingsLabel throughout. Closed in run 2 review.
- **Worktree isolation note (runs 2–5):** Agent worktrees sometimes write changes directly to the main working tree (`/home/user/SpartBoard/`) rather than only to their isolated worktree. After each run, verify the main worktree (`git status` on dev-paul) is clean before ending the session. If changes appear, inspect them: they may be valid dimension work that needs to be committed to a separate branch rather than dev-paul directly.
- **D4 admin/ complete (run 3):** All 15 files with relative `'../common/...'` and `'../widgets/...'` cross-dir imports in `components/admin/` have been fixed. Next D4 target: `components/plc/` (~26 relative imports remaining; see re-audit note below).
- **D4 settingsModal/sections/ complete (run 5):** All 4 files fully converted; no `../` imports remain in the directory. Next D4 target: plc/ re-audit or hooks/context/utils (large pass, requires care).
- **D3 next target (run 7):** No more OPEN items in the backlog. Scan for new instances: `grep -E -rn "text-xxs (font-black )?text-slate-400 uppercase tracking-widest" components/widgets/ --include="*.tsx" | grep -v SettingsLabel` — add any findings to the backlog. Known filed file `PollWidget/Settings.tsx` is already clean.
- **D4 plc/ re-audit (run 6 update):** `home/cards/` (deepest nesting, `../../sections`) shipped in run 6. ~22 relative imports remain across the rest of plc/. Most are 1-level `../` from one subdir to another (e.g., `tabs/ → ../bodies/`, `bodies/ → ../tabs/`, `authoring/ → ../assignments/`). These are cross-subdir but only 1 level deep — confirm they are anti-pattern (not gray-zone) before fixing. Single-level `'../sections'` from `home/` and `resources/` reaching up to plc root sit in the D4-E2 gray zone; leave for now.
- **D1 backlog exhausted (run 5–6):** All known hand-rolled empty states are now shipped or classified as intentional exceptions. D1 future runs should scan for new widgets only: `grep -rn "flex" components/widgets/ --include="*.tsx" | grep "items-center" | grep "justify-center" | grep -v ScaledEmptyState | grep -v settings`.
- **Worktree validate gotcha (run 6):** Running `pnpm run validate` from inside a worktree fails because the worktree doesn't have its own `node_modules` or `functions/node_modules`. Fix: symlink both from the main repo (`ln -sf <path-to-main-repo>/node_modules <worktree>/node_modules` and same for `functions/node_modules`). Alternatively, always run validate from the MAIN REPO after rebasing the branch there — cleaner and doesn't require symlinks.
- **D3 Tailwind specificity gotcha (run 5):** Passing `className="mb-1.5"` to `SettingsLabel` to override the built-in `mb-2` does NOT work. Tailwind's CSS declaration order means `mb-2` (declared later in the stylesheet, higher numeric value) always wins over `mb-1.5`. The `className` override becomes dead code. Always accept `SettingsLabel`'s canonical `mb-2` rather than trying to override it.
- **D5 fully enumerated (run 4):** D5-E15 (SaveAsTemplateModal) and D5-E16 (OrganizationPanel) added. D5 is exhaustively documented across 16 exceptions.
- **D3 next targets (run 8):** NextUp/Settings.tsx (3 instances, ~lines 246/346/397), MathTools/Settings.tsx (1 instance, ~line 32), or RecessGear/Settings.tsx (1 instance, ~line 54). ExpectationsWidget and SoundWidget have borderline patterns (missing `font-black`) — confirm intentionality before converting. LunchCount/SubmitReportModal needs human decision on whether it's in D3 scope.
- **D4 plc/ remaining (run 7 update):** tabs↔bodies cluster shipped (PR #1823). Next targets: authoring→assignments (2 files) and tabs→assignments (1 file: PlcAssignmentsInProgressSubTab). Then hooks/context/utils large pass.
- **D4 worktree base discrepancy (run 7):** Subagent worktrees may be initialized from a commit slightly older than the latest origin/dev-paul. Always rebase nightly branches on origin/dev-paul before pushing — the rebase catches any drift and validate on the rebased commit is the authoritative gate.
