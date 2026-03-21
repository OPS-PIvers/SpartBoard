# Admin Settings > Feature Permissions > Admin Widget Configuration Modal Audit

## Legend

- `[X]` — Admin configuration is implemented.
- `[ ]` — No admin configuration exists or is needed.
- **Type:** The `WidgetType` string used in code (`types.ts`, Firestore, `WidgetData.type`).
- **Label:** The display name shown in the admin UI (from `config/tools.ts`).
- **Config:** File path(s) for the admin panel/modal. Three patterns exist:
  1. **Dedicated panel** — A `*ConfigurationPanel.tsx` file registered in `BUILDING_CONFIG_PANELS` inside `components/admin/FeatureConfigurationPanel.tsx`, rendered via `GenericConfigurationModal`.
  2. **Inline** — Settings rendered directly inside `components/admin/FeatureConfigurationPanel.tsx` with no dedicated file. The component file may still exist but is instantiated inline rather than through `BUILDING_CONFIG_PANELS`.
  3. **Separate modal** — A full dedicated modal opened by `FeaturePermissionsManager.tsx`, bypassing `GenericConfigurationModal` entirely.
- **`dockDefaults`** — Every widget that passes through `GenericConfigurationModal` →
  `FeatureConfigurationPanel.tsx` automatically gets per-building dock visibility toggles via
  `DockDefaultsPanel.tsx`. Separate modals only have `dockDefaults` if they import and render
  `DockDefaultsPanel` themselves (confirmed per file: Calendar, Catalyst, Graphic Organizer, PDF,
  Specialist Schedule, Starter Pack). Separate modals without it: Instructional Routines, Mini Apps,
  Music, Stickers.

---

## Required Structure

```
[X] Widget Display Name — Type: `widget-type` | Label: "Admin UI Label"
Config: `components/admin/ExampleConfigurationPanel.tsx` (pattern)

- **User-level Defaults:** (admin pre-configures per building; teachers can override in widget settings)
  - `setting`: description
- **Admin-only Settings:** (admin-controlled only; teachers cannot change)
  - `setting`: description
```

---

## Widgets

---

[X] Breathing — Type: `breathing` | Label: "Breathing"
Config: `components/admin/BreathingConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `pattern`: Default breathing pattern.
  - `visual`: Default visual style.
  - `color`: Default color theme.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Calendar / Events — Type: `calendar` | Label: "Events"
Config: `components/admin/CalendarConfigurationModal.tsx` _(separate modal; includes `DockDefaultsPanel`)_

- **User-level Defaults:**
  - `events`: Pre-populated building events.
- **Admin-only Settings:**
  - `googleCalendarIds`: Default Google Calendar IDs for the building (building-level, admin-proxy
    only — not teacher-configurable).
  - `blockedDates`: Global list of dates that cannot be selected.
  - `updateFrequencyHours`: How often the admin proxy refreshes data.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Car Rider Pro — Type: `car-rider-pro` | Label: "Car Rider"
Config: `components/admin/CarRiderConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `iframeUrl`: The URL of the Car Rider Pro dashboard.
  - `cardColor`: Default background color.
  - `cardOpacity`: Default background opacity.
- **Admin-only Settings:**
  - `url`: Global district portal URL.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Catalyst — Type: `catalyst` | Label: "Catalyst"
Config: `components/admin/CatalystConfigurationModal.tsx` _(separate modal; includes `DockDefaultsPanel`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Checklist / Tasks — Type: `checklist` | Label: "Tasks"
Config: `components/admin/ChecklistConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `items`: Default checklist items pre-populated on creation.
  - `scaleMultiplier`: Default font scaling.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Classes — Type: `classes` | Label: "Class"
Config: No dedicated file. `dockDefaults` only — handled automatically by `DockDefaultsPanel` inside
`FeatureConfigurationPanel.tsx`. To add building-level defaults, create
`components/admin/ClassesConfigurationPanel.tsx` and register it in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Clock — Type: `clock` | Label: "Clock"
Config: `components/admin/ClockConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `format24`: Toggle 24-hour time format.
  - `fontFamily`: Default clock font.
  - `themeColor`: Default clock text color.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Concept Web — Type: `concept-web` | Label: "Concept Web"
Config: No dedicated file. `dockDefaults` only — handled automatically by `DockDefaultsPanel` inside
`FeatureConfigurationPanel.tsx`. To add building-level defaults, create
`components/admin/ConceptWebConfigurationPanel.tsx` and register it in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Dice — Type: `dice` | Label: "Dice"
Config: `components/admin/DiceConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `count`: Default number of dice (1–6).
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Drawing — Type: `drawing` | Label: "Draw"
Config: `components/admin/DrawingConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `mode`: Default mode (`'window'` or `'overlay'`).
  - `width`: Default pen width.
  - `customColors`: Pre-populated custom color palette.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Embed — Type: `embed` | Label: "Embed"
Config: `components/admin/EmbedConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `hideUrlField`: Prevents teachers from changing the URL.
  - `whitelistUrls`: Restricted list of allowed URLs.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Expectations — Type: `expectations` | Label: "Expectations"
Config: `components/admin/ExpectationsConfigurationPanel.tsx` _(rendered inline in
`FeatureConfigurationPanel.tsx`; not registered in `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `volumeOverrides`: Custom labels/subtitles for voice levels.
  - `groupOverrides`: Custom labels/subtitles for work modes.
  - `interactionOverrides`: Custom labels/subtitles for interactions.
  - `showVolume/Group/Interaction`: Visibility toggles for each category.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Graphic Organizer — Type: `graphic-organizer` | Label: "Organizer"
Config: `components/admin/GraphicOrganizerConfigurationModal.tsx` _(separate modal; includes
`DockDefaultsPanel`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `templates`: CRUD management of global templates.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Hotspot Image — Type: `hotspot-image` | Label: "Hotspot Image"
Config: `components/admin/HotspotImageConfigurationPanel.tsx` _(dedicated panel via
`BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `popoverTheme`: Default popover theme (`'light'`, `'dark'`, or `'glass'`).
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Instructional Routines — Type: `instructionalRoutines` | Label: "Routines"
Config: `components/admin/InstructionalRoutinesManager.tsx` _(separate modal; does **not** include
`DockDefaultsPanel`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of routines available to all buildings.

---

[X] Lunch Count — Type: `lunchCount` | Label: "Lunch"
Config: Inline in `components/admin/FeatureConfigurationPanel.tsx` — no dedicated file. To extract,
create `components/admin/LunchCountConfigurationPanel.tsx` and add a case to the inline block or
register in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `schumannSheetId`: Google Sheet ID for Schumann Elementary.
  - `intermediateSheetId`: Google Sheet ID for Intermediate School.
  - `submissionUrl`: Apps Script URL for data POSTing.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Materials — Type: `materials` | Label: "Materials"
Config: `components/admin/MaterialsConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `selectedItems`: Default material IDs selected on creation.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Math Tools — Type: `mathTools` | Label: "Math"
Config: `components/admin/MathToolsConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `toolGradeLevels`: Visibility of specific tools by grade level.
  - `dpiCalibration`: Global pixel-per-inch calibration for building hardware.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Mini App — Type: `miniApp` | Label: "Mini Apps"
Config: `components/admin/MiniAppLibraryModal.tsx` _(separate modal; does **not** include
`DockDefaultsPanel`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `submissionUrl`: Apps Script URL for result collection.
  - `botEmail`: Service account email for data access.
  - Global Library: CRUD management of mini-apps by building/grade.

---

[X] Music — Type: `music` | Label: "Music"
Config: `components/admin/MusicLibraryModal.tsx` _(separate modal; does **not** include
`DockDefaultsPanel`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of stations (YouTube/Spotify) by building.

---

[X] Next Up — Type: `nextUp` | Label: "Next Up"
Config: `components/admin/NextUpConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `displayCount`: Default number of items to show in queue.
  - `fontFamily`: Default UI font.
  - `themeColor`: Default brand color.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Note / Text — Type: `text` | Label: "Note"
Config: `components/admin/NoteConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `fontSize`: Default text size.
  - `bgColor`: Default background color.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Number Line — Type: `numberLine` | Label: "Number Line"
Config: `components/admin/NumberLineConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `min`, `max`, `step`: Default number line range and intervals.
  - `displayMode`: Default visual mode (`'integers'`, `'decimals'`, `'fractions'`).
  - `showArrows`: Default toggle for end arrows.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[ ] Onboarding — Type: `onboarding` | Label: N/A
Not present in `config/tools.ts` — no admin panel row exists. No admin configuration.

---

[X] PDF Viewer — Type: `pdf` | Label: "PDF Viewer"
Config: `components/admin/PdfLibraryModal.tsx` _(separate modal; includes `DockDefaultsPanel`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of district and building-level PDFs.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Poll — Type: `poll` | Label: "Poll"
Config: `components/admin/PollConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `question`: Pre-populated default question.
  - `options`: Pre-populated default options.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] QR — Type: `qr` | Label: "QR"
Config: `components/admin/QRConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `defaultUrl`: Initial URL for generated QR codes.
  - `qrColor`: Default foreground color.
  - `qrBgColor`: Default background color.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Quiz — Type: `quiz` | Label: "Quiz"
Config: No dedicated file. `dockDefaults` only — handled automatically by `DockDefaultsPanel` inside
`FeatureConfigurationPanel.tsx`. To add building-level defaults, create
`components/admin/QuizConfigurationPanel.tsx` and register it in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Random — Type: `random` | Label: "Random"
Config: `components/admin/RandomConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `visualStyle`: Default picker style (`'flash'`, `'slots'`, `'wheel'`).
  - `soundEnabled`: Toggle sound effects on/off.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Recess Gear — Type: `recessGear` | Label: "Recess Gear"
Config: Inline in `components/admin/FeatureConfigurationPanel.tsx` — no dedicated file. To extract,
create `components/admin/RecessGearConfigurationPanel.tsx` and add a case to the inline block or
register in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `fetchingStrategy`: `'client'` vs `'admin_proxy'`.
  - `updateFrequencyMinutes`: Refresh interval.
  - `temperatureRanges`: CRUD gear items with icons, images, and categories.
  - `source`: OpenWeather vs Earth Networks.
  - `city`: Default city for weather data.
  - `useFeelsLike`: Toggle feels-like temperature usage.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Reveal Grid — Type: `reveal-grid` | Label: "Reveal"
Config: No dedicated file. Currently `dockDefaults` only — handled automatically by `DockDefaultsPanel`
inside `FeatureConfigurationPanel.tsx`. Planned building-level defaults below are **not yet
implemented** in the admin panel. To implement, create
`components/admin/RevealGridConfigurationPanel.tsx` and register it in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:** _(planned — not yet admin-configurable)_
  - `columns`: Default column count.
  - `revealMode`: Default reveal mode (`'flip'` or `'fade'`).
  - `fontFamily`: Default custom font.
  - `defaultCardColor`: Default front card color.
  - `defaultCardBackColor`: Default back card color.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Schedule — Type: `schedule` | Label: "Schedule"
Config: `components/admin/ScheduleConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `items`: Default schedule items.
  - `schedules`: Pre-defined building-level schedules.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Scoreboard — Type: `scoreboard` | Label: "Scores"
Config: `components/admin/ScoreboardConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `teams`: Pre-defined team names and colors.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Seating Chart — Type: `seating-chart` | Label: "Seating"
Config: No dedicated file. `dockDefaults` only — handled automatically by `DockDefaultsPanel` inside
`FeatureConfigurationPanel.tsx`. To add building-level defaults, create
`components/admin/SeatingChartConfigurationPanel.tsx` and register it in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Smart Notebook — Type: `smartNotebook` | Label: "Notebook"
Config: No dedicated file. `dockDefaults` only — handled automatically by `DockDefaultsPanel` inside
`FeatureConfigurationPanel.tsx`. To add building-level defaults, create
`components/admin/SmartNotebookConfigurationPanel.tsx` and register it in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Sound — Type: `sound` | Label: "Noise"
Config: `components/admin/SoundConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `visual`: Default visualizer style.
  - `sensitivity`: Initial mic sensitivity level.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Specialist Schedule — Type: `specialist-schedule` | Label: "Specialist"
Config: `components/admin/SpecialistScheduleConfigurationModal.tsx` _(separate modal; includes
`DockDefaultsPanel`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `cycleLength`: Rotation length (6 or 10 days).
  - `startDate`: Anchor date for cycle calculation.
  - `schoolDays`: List of valid school days for rotation.
  - `dayLabel`: Custom label (e.g., `"Day"` vs `"Block"`).
  - `customDayNames`: Day-specific naming overrides.
  - `blocks`: Date range blocks for 10-block rotations.
  - `specialistOptions`: Predefined list of specialist subjects.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Starter Pack — Type: `starter-pack` | Label: "Starter Packs"
Config: `components/admin/StarterPackConfigurationModal.tsx` _(separate modal; includes `DockDefaultsPanel`)_
**Note:** `components/admin/StarterPackConfigModal.tsx` also exists — `FeaturePermissionsManager.tsx`
imports `StarterPackConfigurationModal` (the longer name). Verify `StarterPackConfigModal.tsx` is not
a stale duplicate before editing either file.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Packs: CRUD management of widget collections by building/grade.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Stickers — Type: `stickers` | Label: "Stickers"
Config: `components/admin/StickerLibraryModal.tsx` _(separate modal; does **not** include
`DockDefaultsPanel`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of stickers available to all users.

---

[X] Syntax Framer — Type: `syntax-framer` | Label: "Syntax Framer"
Config: No dedicated file. `dockDefaults` only — handled automatically by `DockDefaultsPanel` inside
`FeatureConfigurationPanel.tsx`. To add building-level defaults, create
`components/admin/SyntaxFramerConfigurationPanel.tsx` and register it in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Talking Tool — Type: `talking-tool` | Label: "Talking Tool"
Config: `components/admin/TalkingToolConfigurationPanel.tsx` _(rendered inline in
`FeatureConfigurationPanel.tsx`; not registered in `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of categories and sentence stems.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Timer / Time Tool — Type: `time-tool` | Label: "Timer"
Config: `components/admin/TimeToolConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `duration`: Initial timer duration in seconds.
  - `timerEndTrafficColor`: Linked traffic light color on timer end.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Traffic — Type: `traffic` | Label: "Traffic"
Config: `components/admin/TrafficLightConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `active`: The initial light state (`'red'`, `'yellow'`, `'green'`).
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[X] Weather — Type: `weather` | Label: "Weather"
Config: Inline in `components/admin/FeatureConfigurationPanel.tsx` — no dedicated file. To extract,
create `components/admin/WeatherConfigurationPanel.tsx` and add a case to the inline block or register
in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `fetchingStrategy`: `'client'` vs `'admin_proxy'`.
  - `updateFrequencyMinutes`: Refresh interval.
  - `temperatureRanges`: CRUD display messages and images by temp range.
  - `source`: OpenWeather vs Earth Networks.
  - `city`: Default city for weather data.
  - `showFeelsLike`: Toggle feels-like temperature display.
  - `dockDefaults`: Per-building dock visibility.

---

[X] Webcam — Type: `webcam` | Label: "Camera"
Config: Inline in `components/admin/FeatureConfigurationPanel.tsx` — no dedicated file. To extract,
create `components/admin/WebcamConfigurationPanel.tsx` and add a case to the inline block or register
in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `ocrMode`: `'standard'` (local browser OCR) vs `'gemini'` (AI-powered, uses API quota).
  - `dockDefaults`: Per-building dock visibility.
