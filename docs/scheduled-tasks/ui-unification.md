# UI Unification & Snowflakes — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Wednesday_
_Last audited: 2026-05-27_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM `specialist-schedule` widget has full appearance config but no `WIDGET_APPEARANCE_COMPONENTS` entry

- **Detected:** 2026-04-15
- **File:** components/widgets/WidgetRegistry.ts (line 339), components/widgets/SpecialistSchedule/Settings.tsx (lines 23-24, 254-270), types.ts (`SpecialistScheduleConfig`)
- **Detail:** `SpecialistScheduleConfig` in types.ts declares `fontFamily`, `fontColor`, `textSizePreset`, `cardColor`, and `cardOpacity`. The widget's `SpecialistScheduleWidget.tsx` reads and applies all five fields. `Settings.tsx` imports and renders `TypographySettings` and `SurfaceColorSettings` inside the `general` tab. However, `specialist-schedule` is absent from `WIDGET_APPEARANCE_COMPONENTS` in WidgetRegistry.ts. As a result, `WidgetRenderer.tsx` (line 160) never finds an `AppearanceComponent` for this type and the DraggableWindow does not render an Appearance tab. The appearance controls are only accessible via the flip panel's `general` tab — buried after schedule-specific content — which diverges from the standard UX where appearance settings get their own dedicated tab.
- **Fix:** Create a `SpecialistScheduleAppearanceSettings` export in `components/widgets/SpecialistSchedule/Settings.tsx` that renders only `TypographySettings` and `SurfaceColorSettings` (factored out of the current general tab). Register it in `WIDGET_APPEARANCE_COMPONENTS`:
  ```ts
  'specialist-schedule': lazyNamed(
    () => import('./SpecialistSchedule'),
    'SpecialistScheduleAppearanceSettings'
  ),
  ```
  Remove the duplicated appearance controls from the general tab.

### MEDIUM `CarRiderProConfig` declares `cardColor` / `cardOpacity` but no code reads or renders them

- **Detected:** 2026-04-15
- **File:** types.ts (`CarRiderProConfig`), components/widgets/CarRiderPro/Widget.tsx, components/widgets/CarRiderPro/Settings.tsx
- **Detail:** `CarRiderProConfig` in types.ts declares `cardColor?: string` and `cardOpacity?: number`. Neither the widget (`CarRiderPro/Widget.tsx`) nor the settings panel (`CarRiderPro/Settings.tsx`) references these fields anywhere. The widget is an iframe wrapper for an external Car Rider Pro service — the iframe fills the full widget surface so surface-color controls have no effect. There is no entry in `WIDGET_APPEARANCE_COMPONENTS` for `car-rider-pro`. The dead fields create confusion: developers reading the type will assume the widget supports appearance customization when it does not.
- **Fix:** Remove `cardColor` and `cardOpacity` from `CarRiderProConfig` in types.ts. If appearance customization is a future intent for the header/frame area, document it as a TODO comment rather than leaving dead interface fields.

### MEDIUM `LunchCount/Settings.tsx` and `SpecialistSchedule/Settings.tsx` use raw `<select>` elements

- **Detected:** 2026-04-15
- **File:** components/widgets/LunchCount/Settings.tsx (line 90), components/widgets/SpecialistSchedule/Settings.tsx (line 640)
- **Detail:** Both settings panels use bare HTML `<select>` elements for dropdown controls. All other widget settings panels that need dropdown selection use styled `<select>` inline (e.g. with Tailwind classes matching the design system) or the common `Toggle` component. The bare `<select>` elements do not receive the project's standard `bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white` styling applied elsewhere, producing visually inconsistent dropdowns in dark-mode settings panels.
- **Fix:** Apply the standard input styling (`className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"`) to both `<select>` elements, or extract a `<StyledSelect>` component in `components/common/` if a third instance exists.

### MEDIUM `UrlConfigurationPanel.tsx` uses hardcoded hex color palette instead of design system references

- **Detected:** 2026-04-15
- **File:** components/admin/UrlConfigurationPanel.tsx (lines 7-17, 192)
- **Detail:** The panel defines a `PRESET_COLORS` array of 11 hardcoded hex values (`#ef4444`, `#f97316`, … `#f43f5e`) for the URL tile color picker swatch row. These are Tailwind color hex values but are hardcoded as string literals rather than referencing the Tailwind palette via CSS variables or a shared constants file. If the design system color palette changes, this panel won't update automatically.
- **Fix:** Move `PRESET_COLORS` to a shared constants file (e.g. `config/colorPresets.ts`) using the same pattern as `SURFACE_COLOR_PRESETS` in `config/widgetAppearance.ts`. Import from there in UrlConfigurationPanel and any other admin panels that need a color picker swatch row.

### LOW `FeatureConfigurationPanel.tsx` is 706 lines — complex per-feature layout that could use `SchemaDrivenConfigurationPanel`

- **Detected:** 2026-04-15
- **File:** components/admin/FeatureConfigurationPanel.tsx
- **Detail:** The file is the largest admin config panel at 706 lines and contains per-widget building-default forms inline. Many fields it renders (string inputs, number inputs, color pickers, selects, booleans) follow the same pattern that `SchemaDrivenConfigurationPanel` was designed to handle. Only `MagicConfigurationPanel.tsx` and `RecordConfigurationPanel.tsx` currently use `SchemaDrivenConfigurationPanel`. The 18 remaining config panels that don't use it include `FeatureConfigurationPanel`, `SoundboardConfigurationPanel` (593 lines), `ScheduleConfigurationPanel` (538 lines), and `MaterialsConfigurationPanel` (523 lines).
- **Fix:** Audit `FeatureConfigurationPanel` for schema-driven extraction candidates. For panels whose entire form can be expressed as a field schema (input type + label + key + validation), migrate to `SchemaDrivenConfigurationPanel`. Panels with complex custom UIs (materials catalog, seating-chart layout, specialist schedule) should remain manual. Start with the simplest panels (DiceConfigurationPanel, TrafficLightConfigurationPanel, DrawingConfigurationPanel) as proof-of-concept before tackling the large ones.

### MEDIUM `stations` widget missing from admin `FeatureConfigurationPanel` — no building defaults

- **Detected:** 2026-05-13
- **File:** components/admin/FeatureConfigurationPanel.tsx, components/admin/ (no StationsConfigurationPanel.tsx)
- **Detail:** `StationsConfig` in types.ts declares `fontFamily`, `fontColor`, `cardColor`, `cardOpacity` (all appearance fields). `stations` has an `AppearanceSettings` component registered in `WIDGET_APPEARANCE_COMPONENTS`. However, there is no `StationsConfigurationPanel.tsx` in `components/admin/` and no `'stations'` entry in the widget panel map in `FeatureConfigurationPanel.tsx`. The `getAdminBuildingConfig` switch in `DashboardContext.tsx` also has no `'stations'` case. This means admins cannot set per-building appearance defaults for the Stations widget, and the appearance fields cannot be seeded from building config on widget creation.
- **Fix:** (1) Create `components/admin/StationsConfigurationPanel.tsx` following the pattern of `NeedDoPutThenConfigurationPanel.tsx` — expose `fontFamily`, `fontColor`, `cardColor`, `cardOpacity` using standard primitives. (2) Register it in `FeatureConfigurationPanel.tsx`: `stations: StationsConfigurationPanel as unknown as BuildingConfigPanel`. (3) Add a `'stations'` case in `getAdminBuildingConfig` in `DashboardContext.tsx` that reads the four appearance fields from `raw`.

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

### LOW Hardcoded brand hex colors in `Countdown/Settings.tsx`, `Countdown/Widget.tsx`, and `AnalyticsManager.tsx`

- **Detected:** 2026-05-27 (first formal item — noted in 2026-05-13 audit log but never promoted to open item)
- **File:** components/widgets/Countdown/Settings.tsx:179, components/widgets/Countdown/Widget.tsx:44, components/admin/Analytics/AnalyticsManager.tsx (lines 270, 398, 534, 682, 897, 953, 983, 1129)
- **Detail:** `Countdown/Settings.tsx:179` uses `const eventColor = config.eventColor ?? '#2d3f89'` as a fallback for the color picker default. `Countdown/Widget.tsx:44` uses `'#2d3f89'` directly in a style prop. `AnalyticsManager.tsx` uses hardcoded `'#2d3f89'` (brand primary) in 5 chart fill color arrays and `'#ad2122'` (brand accent) in 3 chart fill arrays. The `--spart-primary` CSS variable is set by the admin's global style configuration specifically so widget chrome can use `var(--spart-primary, #2d3f89)` instead of hardcoded values; hardcoded hex will not update when the admin changes the primary color.
- **Fix:** In `Countdown/Settings.tsx` and `Widget.tsx`, replace `'#2d3f89'` with `'var(--spart-primary, #2d3f89)'` or read the CSS variable at runtime via `getComputedStyle(document.documentElement).getPropertyValue('--spart-primary')`. In `AnalyticsManager.tsx`, define chart color constants that reference the CSS variables rather than hardcoding the hex literals. Note: `AppearanceSection.tsx` uses these as default object literals (acceptable) — the issue is inline style properties and chart fill arrays.

---

## Completed

_2026-05-27: Audited all recently added Settings.tsx files (Stations, SmartNotebook, drawing-widget toolbar — skipScaling:false so not a CQ concern), WIDGET_APPEARANCE_COMPONENTS cross-referenced against types.ts appearance fields. New commits since 2026-05-22 did not add new widget types requiring appearance panels. Two new open items added: ExpectationsWidget custom toggle, Countdown/AnalyticsManager hardcoded brand hex. All pre-existing open items remain valid._

_2026-05-22: Audited all Settings.tsx files under components/widgets/, WIDGET_APPEARANCE_COMPONENTS, and new \*ConfigurationPanel.tsx files. New dev-paul additions: `SmartNotebookConfigurationPanel.tsx` added and wired in FeatureConfigurationPanel.tsx (import at line 54, registered at lines 129–130 as `SmartNotebook: SmartNotebookConfigurationPanel as unknown as BuildingConfigPanel`). `SmartNotebookAppearanceSettings` correctly registered in WIDGET_APPEARANCE_COMPONENTS. New PLC modals (`PlcNewQuizAssignmentModal`, `PlcNewVideoActivityAssignmentModal`) and quiz behavior panels use standard Tailwind patterns; no snowflake custom form controls or hardcoded hex colors detected. `components/settingsModal/sections/AppearanceSection.tsx` declares `DEFAULT_PRIMARY_COLOR = '#2d3f89'` and `DEFAULT_ACCENT_COLOR = '#ad2122'` as fallback literals for `DEFAULT_GLOBAL_STYLE` — these are fallback defaults for a config object, not inline style replacements for CSS variables; acceptable. All pre-existing open items remain valid._

_2026-05-13: Audited all Settings.tsx files under components/widgets/, all \*ConfigurationPanel.tsx under components/admin/, and WIDGET_APPEARANCE_COMPONENTS. New findings: (1) `stations` widget has no `StationsConfigurationPanel` and no entry in `FeatureConfigurationPanel.tsx` — admin building defaults cannot be set for it despite StationsConfig having fontFamily/fontColor/cardColor/cardOpacity. (2) All existing config panels confirmed to use SchemaDrivenConfigurationPanel (except MagicConfigurationPanel and RecordConfigurationPanel which are intentional exceptions). (3) Hardcoded brand hex colors found in NextUpConfigurationPanel.tsx (lines 24, 106-107), StudentPageView.tsx (lines 19-20), NewUserSetup.tsx (line 96), MaterialsWidget/Settings.tsx (line 23), Countdown/Settings.tsx (line 179), Countdown/Widget.tsx (line 44), and AnalyticsManager.tsx (multiple). Existing open items remain valid._

_No completed items yet._
