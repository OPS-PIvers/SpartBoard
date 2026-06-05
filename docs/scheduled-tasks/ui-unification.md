# UI Unification & Snowflakes — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Wednesday_
_Last audited: 2026-06-05_
_Last action: 2026-06-05 — MEDIUM `stations` admin building-default appearance panel added; MEDIUM raw-`<select>` item resolved as stale (already styled)_

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW `FeatureConfigurationPanel.tsx` is 706 lines — complex per-feature layout that could use `SchemaDrivenConfigurationPanel`

- **Detected:** 2026-04-15
- **File:** components/admin/FeatureConfigurationPanel.tsx
- **Detail:** The file is the largest admin config panel at 706 lines and contains per-widget building-default forms inline. Many fields it renders (string inputs, number inputs, color pickers, selects, booleans) follow the same pattern that `SchemaDrivenConfigurationPanel` was designed to handle. Only `MagicConfigurationPanel.tsx` and `RecordConfigurationPanel.tsx` currently use `SchemaDrivenConfigurationPanel`. The 18 remaining config panels that don't use it include `FeatureConfigurationPanel`, `SoundboardConfigurationPanel` (593 lines), `ScheduleConfigurationPanel` (538 lines), and `MaterialsConfigurationPanel` (523 lines).
- **Fix:** Audit `FeatureConfigurationPanel` for schema-driven extraction candidates. For panels whose entire form can be expressed as a field schema (input type + label + key + validation), migrate to `SchemaDrivenConfigurationPanel`. Panels with complex custom UIs (materials catalog, seating-chart layout, specialist schedule) should remain manual. Start with the simplest panels (DiceConfigurationPanel, TrafficLightConfigurationPanel, DrawingConfigurationPanel) as proof-of-concept before tackling the large ones.

### LOW `InstructionalRoutinesWidget` uses hardcoded brand blue hex for numbered step badge

- **Detected:** 2026-05-06
- **File:** components/widgets/InstructionalRoutines/Widget.tsx:217
- **Detail:** The numbered step badge on list/step-view routines uses `style={{ backgroundColor: '#2d3f89' }}`. `--spart-primary` is set by the admin's global style configuration in `DashboardView.tsx` specifically so that widget chrome can use `var(--spart-primary)` instead of hardcoded brand blue. Using a hardcoded hex means this badge will not update when the admin changes the primary color.
- **Fix:** Replace `backgroundColor: '#2d3f89'` with `backgroundColor: 'var(--spart-primary, #2d3f89)'` to respect the theme while keeping the brand blue as the fallback.

### LOW `TextConfig` has `fontFamily`, `fontColor`, `textSizePreset` but no appearance panel or settings UI

- **Detected:** 2026-04-29
- **File:** components/widgets/TextWidget/Widget.tsx:37-47, types.ts (`TextConfig`), components/widgets/WidgetRegistry.ts
- **Detail:** `TextConfig` declares `fontFamily?: string`, `fontColor?: string`, and `textSizePreset?: TextSizePreset`. `TextWidget/Widget.tsx` reads all three at lines 37-47 and applies them: `fontFamily` sets the container-level CSS font class, `fontColor` sets the default text color, `textSizePreset` adjusts the base font size multiplier. However, `text` is absent from `WIDGET_APPEARANCE_COMPONENTS` and `TextSettings` only shows template shortcuts — no UI exists to configure these three fields. They can only be set via admin building config. Teachers have no way to change the widget-level font family or base text color from the dashboard. The FormattingToolbar allows per-selection inline font changes in the content HTML, but `config.fontFamily`/`config.fontColor` control the container defaults that show for unformatted text.
- **Fix:** Create a `TextAppearanceSettings` component in `components/widgets/TextWidget/Settings.tsx` that renders `TypographySettings` (fontFamily + fontColor) and `TextSizePresetSettings` (textSizePreset). Register in `WIDGET_APPEARANCE_COMPONENTS` as `'text': lazyNamed(() => import('./TextWidget/Settings'), 'TextAppearanceSettings')`. This exposes three config fields that are already consumed by the widget but unreachable by end users.

### MEDIUM `ExpectationsWidget/Settings.tsx` implements custom toggle instead of shared `Toggle` component

- **Detected:** 2026-05-27
- **File:** components/widgets/ExpectationsWidget/Settings.tsx:66–91
- **Detail:** The settings panel uses a custom button-pair toggle (two `<button>` elements styled with gradient classes and active state toggling) instead of the shared `Toggle` component from `components/common/Toggle.tsx`. The shared `Toggle` is already used in ~15 other widget settings panels. The custom implementation is visually different from the standard toggle, violating design consistency in the dark-mode settings panels.
- **Fix:** Replace the custom button-pair with `<Toggle value={...} onChange={...} />` from `components/common/Toggle.tsx`, following the pattern in `QRWidget/Settings.tsx` or `LunchCount/Settings.tsx`. Remove the custom gradient button styling.

### MEDIUM `ClockWidget/Settings.tsx` implements inline font family selector instead of `TypographySettings`

- **Detected:** 2026-06-05
- **File:** components/widgets/ClockWidget/Settings.tsx (lines 50–92)
- **Detail:** The Clock widget settings panel implements a custom font-family picker using four inline `<button>` elements toggling between `global`, `font-mono`, `font-sans`, and `font-handwritten` — instead of using the shared `TypographySettings` component from `components/common/`. The shared component is already used in ~15 other widget settings panels (Weather, Schedule, Countdown, LunchCount, Checklist, etc.). The Clock's inline picker is visually inconsistent with the rest of the settings panels and does not benefit from future improvements to the shared component.
- **Fix:** Replace the inline font-family button group (lines 50–92) in `ClockWidget/Settings.tsx` with `<TypographySettings widget={widget} update={update} />` from `@/components/common/TypographySettings`. Verify that `ClockConfig` declares `fontFamily` (it already does — it drives the clock face font). Remove the local button-group markup and its associated state/style logic.

### MEDIUM `MusicWidget/Settings.tsx` implements inline background/text color picker instead of `SurfaceColorSettings`

- **Detected:** 2026-06-05
- **File:** components/widgets/MusicWidget/Settings.tsx (lines 327–388)
- **Detail:** The Music widget settings panel implements a custom background color and text color picker using manual button arrays with hardcoded hex palettes, instead of using `SurfaceColorSettings` from `components/common/`. This is visually inconsistent with other widget settings panels and duplicates color-picker logic that the shared component already provides. The inline implementation also hardcodes `#ffffff` as a default background color (line 327) rather than reading from the widget config.
- **Fix:** Replace the inline color picker blocks (lines 327–388) with `<SurfaceColorSettings widget={widget} update={update} />` from `@/components/common/SurfaceColorSettings`. Ensure `MusicConfig` has `cardColor` and `cardOpacity` fields (verify in types.ts), or add them if absent. Remove the local button-array markup and `STANDARD_COLORS` palette references.

### MEDIUM `nextUp`, `video-activity`, and `guided-learning` widgets have appearance config fields but no `WIDGET_APPEARANCE_COMPONENTS` entry

- **Detected:** 2026-06-05
- **File:** types.ts (`NextUpConfig`, `VideoActivityConfig`, `GuidedLearningConfig`), components/widgets/WidgetRegistry.ts
- **Detail:** Per the audit, `NextUpConfig`, `VideoActivityConfig`, and `GuidedLearningConfig` all declare `fontFamily`, `fontColor`, `cardColor`, and `cardOpacity` fields (matching the standard appearance field set). However, none of `nextUp`, `video-activity`, or `guided-learning` have entries in `WIDGET_APPEARANCE_COMPONENTS` in `WidgetRegistry.ts`. This means the Appearance tab is never shown in the DraggableWindow flip panel for these widgets, and teachers cannot adjust their visual appearance despite the config fields existing.
- **Fix:** For each widget: (1) Create or add an `*AppearanceSettings` export to the corresponding `Settings.tsx` that renders `TypographySettings` and `SurfaceColorSettings` (following the `SpecialistScheduleAppearanceSettings` pattern). (2) Register in `WIDGET_APPEARANCE_COMPONENTS`: `'nextUp': lazyNamed(...)`, `'video-activity': lazyNamed(...)`, `'guided-learning': lazyNamed(...)`. Verify the widget `Widget.tsx` files actually consume the four config fields before wiring up the panel — if any field is not consumed, remove it from the interface (per the CarRiderProConfig precedent) rather than adding a dead UI control.

### LOW Hardcoded brand hex colors in `StudentPageView.tsx` and `RevealGridConfigurationPanel.tsx`

- **Detected:** 2026-06-05
- **File:** components/admin/ (StudentPageView.tsx, RevealGridConfigurationPanel.tsx)
- **Detail:** `StudentPageView.tsx` uses `#2d3f89` (brand blue) and `#ad2122` (brand red) as inline style hex values in what appears to be the organization student landing-page config view. `RevealGridConfigurationPanel.tsx` uses `#dbeafe` (blue-100) and `#dcfce7` (green-100) as default card color values in the admin building config panel. These should reference the design-system color palette (Tailwind config values or CSS variables) rather than raw hex literals. Note: the existing LOW item already tracks `Countdown/Settings.tsx`, `Countdown/Widget.tsx`, and `AnalyticsManager.tsx` — this item adds the newly found admin-panel occurrences.
- **Fix:** In `StudentPageView.tsx`, replace hardcoded `#2d3f89` / `#ad2122` with `var(--spart-primary, #2d3f89)` / `var(--spart-accent, #ad2122)` or the corresponding Tailwind classes. In `RevealGridConfigurationPanel.tsx`, use named Tailwind palette values (e.g. `'bg-blue-100'` token string → a CSS variable reference or the config's `WIDGET_PALETTE`) rather than raw hex literals as defaults.

### LOW Hardcoded brand hex colors in `Countdown/Settings.tsx`, `Countdown/Widget.tsx`, and `AnalyticsManager.tsx`

- **Detected:** 2026-05-27 (first formal item — noted in 2026-05-13 audit log but never promoted to open item)
- **File:** components/widgets/Countdown/Settings.tsx:179, components/widgets/Countdown/Widget.tsx:44, components/admin/Analytics/AnalyticsManager.tsx (lines 270, 398, 534, 682, 897, 953, 983, 1129)
- **Detail:** `Countdown/Settings.tsx:179` uses `const eventColor = config.eventColor ?? '#2d3f89'` as a fallback for the color picker default. `Countdown/Widget.tsx:44` uses `'#2d3f89'` directly in a style prop. `AnalyticsManager.tsx` uses hardcoded `'#2d3f89'` (brand primary) in 5 chart fill color arrays and `'#ad2122'` (brand accent) in 3 chart fill arrays. The `--spart-primary` CSS variable is set by the admin's global style configuration specifically so widget chrome can use `var(--spart-primary, #2d3f89)` instead of hardcoded values; hardcoded hex will not update when the admin changes the primary color.
- **Fix:** In `Countdown/Settings.tsx` and `Widget.tsx`, replace `'#2d3f89'` with `'var(--spart-primary, #2d3f89)'` or read the CSS variable at runtime via `getComputedStyle(document.documentElement).getPropertyValue('--spart-primary')`. In `AnalyticsManager.tsx`, define chart color constants that reference the CSS variables rather than hardcoding the hex literals. Note: `AppearanceSection.tsx` uses these as default object literals (acceptable) — the issue is inline style properties and chart fill arrays.

---

## Completed

### MEDIUM `stations` widget missing from admin `FeatureConfigurationPanel` — no building defaults

- **Detected:** 2026-05-13
- **Completed:** 2026-06-05
- **File:** components/admin/StationsConfigurationPanel.tsx (new), components/admin/FeatureConfigurationPanel.tsx, utils/adminBuildingConfig.ts, types.ts, tests/utils/adminBuildingConfig.test.ts
- **Detail:** `StationsConfig` declares `fontFamily`, `fontColor`, `cardColor`, `cardOpacity` (all consumed by the front-face card grid + unassigned bucket per the config comment, and surfaced via the registered `StationsAppearanceSettings` in `WIDGET_APPEARANCE_COMPONENTS`). But there was no `StationsConfigurationPanel.tsx`, no `'stations'` entry in `BUILDING_CONFIG_PANELS`, and no `'stations'` case in `getAdminBuildingConfig` — so admins could not set per-building appearance defaults and the fields were never seeded on widget creation.
- **Resolution:** (1) Added `StationsGlobalConfig` / `BuildingStationsDefaults` interfaces to `types.ts` (parallel to `ChecklistGlobalConfig`). (2) Created `components/admin/StationsConfigurationPanel.tsx` (Path B — panel inside `GenericConfigurationModal`) following the `ChecklistConfigurationPanel` appearance pattern: `BuildingSelector` + font-family `<select>`, `HexColorField` for text/surface colour, and an opacity range. **Key correctness detail:** the font-family `<select>` is driven by `FONTS` (the **prefixed** `'font-sans'` value space written by the shared `TypographySettings` primitive that the Stations widget actually uses), NOT the bare `GlobalFontFamily` space used by Checklist/ConceptWeb/NumberLine — so the seeded value highlights correctly in the teacher's own Appearance tab. (3) Registered the panel in `FeatureConfigurationPanel.tsx` (`stations: StationsConfigurationPanel as unknown as BuildingConfigPanel`). (4) Added a `'stations'` case to `utils/adminBuildingConfig.ts` (the pure helper that long ago replaced the in-context `getAdminBuildingConfig` switch) with a new `isWidgetFontFamily` guard derived from `FONTS` (minus the `'global'` sentinel) so the validator stays in lockstep with the panel; reused `isHexColor` and the 0–1 `cardOpacity` clamp. (5) Added 4 unit tests covering pass-through, prefixed-vs-bare font rejection, invalid surface/font rejection, and exact 0/1 opacity bounds. `pnpm run type-check`, `pnpm exec eslint` (changed files, `--max-warnings 0`), `pnpm exec prettier --check`, and `pnpm exec vitest run tests/utils/adminBuildingConfig.test.ts` (30 tests) all clean.

### MEDIUM `LunchCount/Settings.tsx` and `SpecialistSchedule/Settings.tsx` use raw `<select>` elements — RESOLVED (stale: already styled)

- **Detected:** 2026-04-15
- **Completed:** 2026-06-05 (no code change — finding was stale/inaccurate on inspection)
- **File:** components/widgets/LunchCount/Settings.tsx, components/widgets/SpecialistSchedule/Settings.tsx
- **Detail/disposition:** The 2026-04-15 finding claimed both panels use _bare_ `<select>` elements lacking the project's dark-mode input styling (`bg-slate-800 border-slate-600 text-white`). On inspection this is no longer true (and the cited line numbers — LunchCount L90, SpecialistSchedule L640 — predate the `SettingsLabel` refactors in PRs #1771/#1783 that shifted them). The current `<select>` elements are **already styled** and consistent with their panels: LunchCount's school-site select (now ~L96) uses `w-full p-2.5 text-xs border border-slate-200 rounded-xl outline-none bg-white`, and SpecialistSchedule's day-of-week select (now ~L586) uses `w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-bold text-sm`. **Both panels are light-themed** (`bg-slate-50` / `border-slate-200` containers), so the prescribed dark `bg-slate-800 text-white` fix would have _broken_ visual consistency, not improved it. Each select already matches its sibling inputs. No `<StyledSelect>` extraction is warranted (only two instances, each correct for its panel). Closing as not-a-defect to stop future agents re-spending cycles on it.

### MEDIUM `CarRiderProConfig` declares `cardColor` / `cardOpacity` but no code reads or renders them

- **Detected:** 2026-04-15
- **Completed:** 2026-06-03
- **File:** types.ts (`CarRiderProConfig`)
- **Detail:** `CarRiderProConfig` declared `cardColor?: string` and `cardOpacity?: number`, but nothing consumed them. The widget (`CarRiderPro/Widget.tsx`) is an iframe wrapper for an external district portal — the iframe fills the entire widget surface, so surface-color controls have no visible effect. There is no `car-rider-pro` entry in `WIDGET_APPEARANCE_COMPONENTS`, and the admin building-default panel uses a separate `CarRiderProGlobalConfig` (url only) via `CarRiderConfigurationPanel.tsx`. `utils/adminBuildingConfig.ts` has no `car-rider-pro` case (the `cardColor`/`cardOpacity` reads there belong to the `number-line` case). The dead fields implied appearance customization the widget does not support.
- **Resolution:** Removed `cardColor` and `cardOpacity` from `CarRiderProConfig` in types.ts, replacing them with an explanatory comment documenting why the iframe-only widget has no surface-color controls and instructing future devs to declare supporting fields only when/if header-frame appearance customization is actually added. Verified the two fields had no readers across `components/`, `config/`, `context/`, `utils/`, and `tests/` before removal. `pnpm run type-check` (0 errors — confirms nothing read the removed optional fields), `pnpm exec eslint types.ts --max-warnings 0`, and `pnpm exec prettier --check types.ts` all clean.

### MEDIUM `UrlConfigurationPanel.tsx` uses hardcoded hex color palette instead of design system references

- **Detected:** 2026-04-15
- **Completed:** 2026-05-29
- **File:** components/admin/UrlConfigurationPanel.tsx
- **Detail:** The panel defined a local `COLORS` array of 11 hardcoded hex values (`#ef4444`, `#f97316`, … `#f43f5e`) for the URL tile color picker swatch row, plus a hardcoded `'#10b981'` fallback at the active-link list rendering. These were duplicated verbatim in `components/widgets/UrlWidget/icons.ts` which already exported `URL_COLORS` (the same 11 values) and `DEFAULT_URL_COLOR = '#10b981'`, used by `UrlWidget/Settings.tsx`, `UrlWidget/Widget.tsx`, and `UrlWidget/LinkBackgroundInput.tsx`. The admin panel was the only swatch consumer outside the widget directory.
- **Resolution:** Removed the local `COLORS` array and imported `URL_COLORS` + `DEFAULT_URL_COLOR` from `@/components/widgets/UrlWidget/icons` — the existing canonical source already used by every other URL-tile color picker in the app. Replaced the three call sites: swatch map (`COLORS.map` → `URL_COLORS.map`), initial new-color state (`COLORS[4]` → `DEFAULT_URL_COLOR`), and active-link fallback (`'#10b981'` → `DEFAULT_URL_COLOR`). The admin building defaults now stay in lockstep with the widget's own palette automatically — any future palette change in `icons.ts` propagates to the admin config panel. `pnpm exec tsc --noEmit`, `pnpm exec eslint components/admin/UrlConfigurationPanel.tsx --max-warnings 0`, and `pnpm exec prettier --check components/admin/UrlConfigurationPanel.tsx` all clean.

### MEDIUM `specialist-schedule` widget has full appearance config but no `WIDGET_APPEARANCE_COMPONENTS` entry

- **Detected:** 2026-04-15
- **Completed:** 2026-05-27
- **File:** components/widgets/WidgetRegistry.ts, components/widgets/SpecialistSchedule/Settings.tsx
- **Detail:** `SpecialistScheduleConfig` declared `fontFamily`, `fontColor`, `textSizePreset`, `cardColor`, and `cardOpacity` and the widget consumed all five, but `specialist-schedule` was absent from `WIDGET_APPEARANCE_COMPONENTS`. The appearance controls were buried in the flip panel's `general` tab instead of getting the standard dedicated Appearance tab in DraggableWindow.
- **Resolution:** Added `SpecialistScheduleAppearanceSettings` export to `components/widgets/SpecialistSchedule/Settings.tsx` rendering `TypographySettings`, `TextSizePresetSettings`, and `SurfaceColorSettings` via a shared `update` helper (matching the `NeedDoPutThenAppearanceSettings` reference pattern). Registered it in `WIDGET_APPEARANCE_COMPONENTS` so `WidgetRenderer.tsx` now surfaces the dedicated Appearance tab. Removed the now-redundant `general` tab from the flip panel — the only content there was the three appearance primitives, so the tab union narrowed to `'schedules' | 'recurring'` with `'schedules'` as the new default. `pnpm exec tsc --noEmit`, `pnpm exec eslint`, `pnpm exec prettier --check`, and `pnpm exec vitest run tests/components` (1056 tests across 127 files) all clean.

_2026-06-05: Weekly audit pass. Scanned Settings.tsx files for Clock, Weather, Poll, Schedule, Countdown, LunchCount, Music, Checklist widgets. Found 2 new MEDIUM items: ClockWidget inline font-family selector (not using TypographySettings), MusicWidget inline color picker (not using SurfaceColorSettings). Cross-referenced WIDGET_APPEARANCE_COMPONENTS against types.ts appearance fields — found nextUp, video-activity, guided-learning have fontFamily/fontColor/cardColor/cardOpacity in their config interfaces but no appearance panel registered. Found 1 new LOW: hardcoded hex in StudentPageView.tsx and RevealGridConfigurationPanel.tsx. Pre-existing items (stations no admin config, TextConfig no appearance panel, ExpectationsWidget custom toggle, Countdown/Analytics hardcoded hex, LunchCount/SpecialistSchedule raw selects, InstructionalRoutines hardcoded hex) all re-confirmed valid. 4 new open items added._

_2026-06-05: Weekly action pass (Friday). Top-priority items in code-structure (HIGH DashboardContext extraction + both MEDIUM extractions) remain BLOCKED — documented as needing a supervised runtime-verified session. The #1 ui-unification MEDIUM (LunchCount/SpecialistSchedule raw `<select>`) turned out STALE on inspection: both selects are already styled and consistent with their light-themed panels; the prescribed dark-mode fix would have harmed consistency — resolved as not-a-defect. Took the next actionable MEDIUM instead: wired admin per-building appearance defaults for the `stations` widget (new `StationsConfigurationPanel`, `BUILDING_CONFIG_PANELS` registration, `getAdminBuildingConfig` 'stations' case + `isWidgetFontFamily` guard, types, 4 tests). Verified target files untouched in the last 5 branch commits before starting. type-check/lint/format/tests all clean._

_2026-06-03: Weekly action pass. Selected the highest-priority safe Open item (code-structure HIGH and both code-structure MEDIUM refactors are blocked/architecturally-significant — see code-structure.md). Completed the first ui-unification MEDIUM: removed dead `cardColor`/`cardOpacity` from `CarRiderProConfig`. Confirmed types.ts and CarRiderPro files were not modified in the last 5 branch commits. Remaining Open items re-confirmed valid; no new snowflakes detected in this pass._

_2026-05-27: Audited all recently added Settings.tsx files (Stations, SmartNotebook, drawing-widget toolbar — skipScaling:false so not a CQ concern), WIDGET_APPEARANCE_COMPONENTS cross-referenced against types.ts appearance fields. New commits since 2026-05-22 did not add new widget types requiring appearance panels. Two new open items added: ExpectationsWidget custom toggle, Countdown/AnalyticsManager hardcoded brand hex. All pre-existing open items remain valid._

_2026-05-22: Audited all Settings.tsx files under components/widgets/, WIDGET_APPEARANCE_COMPONENTS, and new \*ConfigurationPanel.tsx files. New dev-paul additions: `SmartNotebookConfigurationPanel.tsx` added and wired in FeatureConfigurationPanel.tsx (import at line 54, registered at lines 129–130 as `SmartNotebook: SmartNotebookConfigurationPanel as unknown as BuildingConfigPanel`). `SmartNotebookAppearanceSettings` correctly registered in WIDGET_APPEARANCE_COMPONENTS. New PLC modals (`PlcNewQuizAssignmentModal`, `PlcNewVideoActivityAssignmentModal`) and quiz behavior panels use standard Tailwind patterns; no snowflake custom form controls or hardcoded hex colors detected. `components/settingsModal/sections/AppearanceSection.tsx` declares `DEFAULT_PRIMARY_COLOR = '#2d3f89'` and `DEFAULT_ACCENT_COLOR = '#ad2122'` as fallback literals for `DEFAULT_GLOBAL_STYLE` — these are fallback defaults for a config object, not inline style replacements for CSS variables; acceptable. All pre-existing open items remain valid._

_2026-05-13: Audited all Settings.tsx files under components/widgets/, all \*ConfigurationPanel.tsx under components/admin/, and WIDGET_APPEARANCE_COMPONENTS. New findings: (1) `stations` widget has no `StationsConfigurationPanel` and no entry in `FeatureConfigurationPanel.tsx` — admin building defaults cannot be set for it despite StationsConfig having fontFamily/fontColor/cardColor/cardOpacity. (2) All existing config panels confirmed to use SchemaDrivenConfigurationPanel (except MagicConfigurationPanel and RecordConfigurationPanel which are intentional exceptions). (3) Hardcoded brand hex colors found in NextUpConfigurationPanel.tsx (lines 24, 106-107), StudentPageView.tsx (lines 19-20), NewUserSetup.tsx (line 96), MaterialsWidget/Settings.tsx (line 23), Countdown/Settings.tsx (line 179), Countdown/Widget.tsx (line 44), and AnalyticsManager.tsx (multiple). Existing open items remain valid._

_No completed items yet._
