# UI Unification & Snowflakes — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Wednesday_
_Last audited: 2026-05-06_
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

---

## Completed

_No completed items yet._
