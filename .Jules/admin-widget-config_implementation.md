# Admin Settings > Feature Permissions > Admin Widget Configuration Modal Audit

## Legend

- `[X]` — A **dedicated** admin configuration panel or modal is implemented (beyond the generic
  per-widget dock-defaults row that every widget receives automatically). This is the AI agent's
  completion signal — do not re-implement these.
- `[ ]` — **No dedicated admin config panel exists yet.** These are the AI agent's implementation
  targets. Read the widget's `Settings.tsx` to identify user-facing settings to expose as building
  defaults, then follow the skill file to implement.
- `[-]` — Intentionally excluded. No admin configuration is needed or applicable for this widget.

> **Generic dockDefaults note:** Every widget that passes through `GenericConfigurationModal` →
> `FeatureConfigurationPanel.tsx` automatically receives per-building dock visibility toggles via
> `DockDefaultsPanel.tsx`. This is **not** counted as a dedicated admin config panel. Separate modals
> only have `dockDefaults` if they explicitly import and render `DockDefaultsPanel` themselves
> (confirmed: Calendar, Catalyst, Graphic Organizer, PDF, Specialist Schedule, Starter Pack).

---

## Architecture: Three Implementation Patterns

1. **Dedicated panel** — A `*ConfigurationPanel.tsx` or `*ConfigurationModal.tsx` file registered in
   `BUILDING_CONFIG_PANELS` inside `components/admin/FeatureConfigurationPanel.tsx`, rendered via
   `GenericConfigurationModal`. Receives typed `config` + `onChange` props per building.
2. **Inline** — Settings rendered directly inside `components/admin/FeatureConfigurationPanel.tsx`
   with no separate file (or a component file instantiated inline rather than registered in
   `BUILDING_CONFIG_PANELS`).
3. **Separate modal** — A full dedicated modal opened by `FeaturePermissionsManager.tsx`, bypassing
   `GenericConfigurationModal` entirely. Used for library-style or complex multi-step admin UIs.

---

## Required Entry Structure

```
[X] Widget Display Name — Type: `widget-type` | Label: "Admin UI Label"
Config: `components/admin/ExampleConfigurationPanel.tsx` (pattern description)

- **User-level Defaults:** (admin pre-configures per building; teachers can override in widget settings)
  - `setting`: description
- **Admin-only Settings:** (admin-controlled only; teachers cannot change or see these)
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

Note: Catalyst has no user-facing settings panel — `CatalystSettings.tsx` explicitly renders an
"Admin Managed" placeholder. The dedicated modal exists and is complete as dockDefaults-only.

- **User-level Defaults:**
  - None. Widget content is entirely admin-managed.
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

[x] Classes — Type: `classes` | Label: "Class"
Config: `components/admin/ClassesConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `classLinkEnabled`: Toggle to enable/disable ClassLink sync for the building.
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
Config: `components/admin/ConceptWebConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `defaultNodeWidth`: Default node width (percent of canvas).
  - `defaultNodeHeight`: Default node height (percent of canvas).
  - `fontFamily`: Default font family for node labels.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility (already automatic via generic handler).

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
create `components/admin/LunchCountConfigurationPanel.tsx` and register in `BUILDING_CONFIG_PANELS`.

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

[-] Onboarding — Type: `onboarding` | Label: N/A

Not present in `config/tools.ts` — no admin panel row exists. No admin configuration needed.

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
Config: Inline in `components/admin/FeatureConfigurationPanel.tsx` — no dedicated file. Added to the exclusion array to hide the generic "No global settings available" message; `DockDefaultsPanel` is still rendered automatically like other tools.

Note: `QuizWidget/Settings.tsx` exposes only `customTitle` (not a meaningful building default). Admin
config opportunity is primarily admin-only (e.g., a global quiz library). Investigate admin-only
settings before implementing.

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
create `components/admin/RecessGearConfigurationPanel.tsx` and register in `BUILDING_CONFIG_PANELS`.

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
Config: `components/admin/RevealGridConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- [Default User-Level Settings]
  -- columns: Default column count
  -- revealMode: Default reveal mode
  -- fontFamily: Default custom font
  -- defaultCardColor: Default front card color
  -- defaultCardBackColor: Default back card color
- [Admin-Only Settings]
  -- dockDefaults: Per-building dock visibility

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

[x] Seating Chart — Type: `seating-chart` | Label: "Seating"
Config: `components/admin/SeatingChartConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `rosterMode`: Default roster source (`'class'` or `'custom'`).
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility.

---

[x] Smart Notebook — Type: `smartNotebook` | Label: "Notebook"

- **User-level Defaults:**
  - None natively configurable.
- **Admin-only Settings:**
  - `dockDefaults`: Per-building dock visibility (automatic via generic handler).
  - `storageLimitMb`: Configurable maximum file upload size limit added globally per building.

---

[X] Sound / Noise — Type: `sound` | Label: "Noise"
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

**Note:** `components/admin/StarterPackConfigModal.tsx` also exists —
`FeaturePermissionsManager.tsx` imports `StarterPackConfigurationModal` (the longer name). Verify
`StarterPackConfigModal.tsx` is not a stale duplicate before editing either file.

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
Config: `components/admin/SyntaxFramerConfigurationPanel.tsx` _(dedicated panel via `BUILDING_CONFIG_PANELS`)_

- **User-level Defaults:**
  - `mode`: Default input mode (`'text'` or `'math'`).
  - `alignment`: Default token alignment (`'left'`, `'center'`).
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
create `components/admin/WeatherConfigurationPanel.tsx` and register in `BUILDING_CONFIG_PANELS`.

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

[X] Video Activity — Type: `video-activity` | Label: "Video Activity"
Config: `components/admin/VideoActivityConfigurationModal.tsx` _(separate modal; includes `DockDefaultsPanel`)_

- [Default User-Level Settings]
  -- `autoPlay`: Default to auto-playing the video.
  -- `requireCorrectAnswer`: Default whether students must answer correctly to proceed.
  -- `allowSkipping`: Default whether students can skip questions.
- [Admin-Only Settings]
  -- Global Library: Manage globally available video activities by listing existing entries, deleting them, and toggling per-building assignments (no create/update flows in this modal).
  -- `dockDefaults`: Per-building dock visibility.

---

[X] Webcam — Type: `webcam` | Label: "Camera"
Config: Inline in `components/admin/FeatureConfigurationPanel.tsx` — no dedicated file. To extract,
create `components/admin/WebcamConfigurationPanel.tsx` and register in `BUILDING_CONFIG_PANELS`.

- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `ocrMode`: `'standard'` (local browser OCR) vs `'gemini'` (AI-powered, uses API quota).
  - `dockDefaults`: Per-building dock visibility.

---

[x] Video Activity
    - [Default User-Level Settings]
        -- None natively configurable.
    - [Admin-Only Settings]
        -- video-activity-audio-transcription: Admin-only global toggle to allow Gemini AI audio transcription for uncaptioned videos.
        -- dockDefaults: Per-building dock visibility.

[x] Guided Learning
    - [Default User-Level Settings]
        -- None natively configurable. Settings are configured per-set inside the editor.
    - [Admin-Only Settings]
        -- dockDefaults: Per-building dock visibility.

[x] TimeTool
    - [Default User-Level Settings]
        -- Exposes the TimeTool defaults, specifically including the Auto-Pick Random Student and Auto-Advance Next Up Queue boolean controls.
    - [Admin-Only Settings]
        -- None added currently.

[x] Remote
    - [Default User-Level Settings]
        -- None natively configurable.
    - [Admin-Only Settings]
        -- dockDefaults: Per-building dock visibility.
