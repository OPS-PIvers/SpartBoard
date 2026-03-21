# Admin Settings > Feature Permissions > Admin Widget Configuration Modal Audit

## Required Structure:

```
[X] Widget Name
- **User-level Defaults:**
  - `setting`: description
- **Admin-only Settings:**
  - `setting`: description
```

## Widgets:

[X] Breathing
- **User-level Defaults:**
  - `pattern`: Default breathing pattern.
  - `visual`: Default visual style.
  - `color`: Default color theme.
- **Admin-only Settings:**
  - None.

[X] Calendar
- **User-level Defaults:**
  - `events`: Pre-populated building events.
- **Admin-only Settings:**
  - `googleCalendarIds`: Default Google Calendar IDs for the building.
  - `blockedDates`: Global list of dates that cannot be selected.
  - `updateFrequencyHours`: How often the admin proxy refreshes data.
  - `dockDefaults`: Visibility in the building dock.

[X] Car Rider Pro
- **User-level Defaults:**
  - `iframeUrl`: The URL of the Car Rider Pro dashboard.
  - `cardColor`: Default background color.
  - `cardOpacity`: Default background opacity.
- **Admin-only Settings:**
  - `url`: Global district portal URL.

[X] Catalyst
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `dockDefaults`: Visibility in the building dock.

[X] Checklist
- **User-level Defaults:**
  - `items`: Default checklist items pre-populated on creation.
  - `scaleMultiplier`: Default font scaling.
- **Admin-only Settings:**
  - None.

[ ] Classes - No admin config.

[X] Clock
- **User-level Defaults:**
  - `format24`: Toggle 24-hour time format.
  - `fontFamily`: Default clock font.
  - `themeColor`: Default clock text color.
- **Admin-only Settings:**
  - None.

[ ] Concept Web - No admin config.

[X] Dice
- **User-level Defaults:**
  - `count`: Default number of dice (1-6).
- **Admin-only Settings:**
  - None.

[X] Drawing
- **User-level Defaults:**
  - `mode`: Default mode ('window' or 'overlay').
  - `width`: Default pen width.
  - `customColors`: Pre-populated custom color palette.
- **Admin-only Settings:**
  - None.

[X] Embed
- **User-level Defaults:**
  - `hideUrlField`: Prevents teachers from changing the URL.
  - `whitelistUrls`: Restricted list of allowed URLs.
- **Admin-only Settings:**
  - None.

[X] Expectations
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `volumeOverrides`: Custom labels/subtitles for voice levels.
  - `groupOverrides`: Custom labels/subtitles for work modes.
  - `interactionOverrides`: Custom labels/subtitles for interactions.
  - `showVolume/Group/Interaction`: Visibility toggles for categories.

[X] Graphic Organizer
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `templates`: CRUD management of global templates.
  - `dockDefaults`: Visibility in the building dock.

[ ] Hotspot Image - No admin config.

[X] Instructional Routines
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of routines available to all buildings.

[X] Lunch Count
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `schumannSheetId`: Google Sheet ID for Schumann Elementary.
  - `intermediateSheetId`: Google Sheet ID for Intermediate School.
  - `submissionUrl`: Apps Script URL for data POSTing.

[X] Materials
- **User-level Defaults:**
  - `selectedItems`: Default material IDs selected on creation.
- **Admin-only Settings:**
  - None.

[X] Math Tools
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `toolGradeLevels`: Visibility of specific tools by grade level.
  - `dpiCalibration`: Global pixel-per-inch calibration for building hardware.

[X] Mini App
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `submissionUrl`: Apps Script URL for result collection.
  - `botEmail`: Service account email for data access.
  - Global Library: CRUD management of mini-apps by building/grade.

[X] Music
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of stations (YouTube/Spotify) by building.

[X] Next Up
- **User-level Defaults:**
  - `displayCount`: Default number of items to show in queue.
  - `fontFamily`: Default UI font.
  - `themeColor`: Default brand color.
- **Admin-only Settings:**
  - None.

[X] Number Line
- **User-level Defaults:**
  - `min`, `max`, `step`: Default number line range and intervals.
  - `displayMode`: Default visual mode ('integers', 'decimals', 'fractions').
  - `showArrows`: Default toggle for end arrows.
- **Admin-only Settings:**
  - None.

[ ] Onboarding - No admin config.

[X] PDF
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of district and building-level PDFs.
  - `dockDefaults`: Visibility in the building dock.

[X] Poll
- **User-level Defaults:**
  - `question`: Pre-populated default question.
  - `options`: Pre-populated default options.
- **Admin-only Settings:**
  - None.

[X] QR
- **User-level Defaults:**
  - `defaultUrl`: Initial URL for generated QR codes.
  - `qrColor`: Default foreground color.
  - `qrBgColor`: Default background color.
- **Admin-only Settings:**
  - None.

[X] Quiz
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `dockDefaults`: Visibility in the building dock.

[X] Random
- **User-level Defaults:**
  - `visualStyle`: Default picker style ('flash', 'slots', 'wheel').
  - `soundEnabled`: Toggle sound effects on/off.
- **Admin-only Settings:**
  - None.

[X] Recess Gear
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `fetchingStrategy`: 'client' vs 'admin_proxy'.
  - `updateFrequencyMinutes`: Refresh interval.
  - `temperatureRanges`: CRUD gear items with icons, images, and categories.
  - `source`: OpenWeather vs Earth Networks.
  - `city`: Default city for weather data.
  - `useFeelsLike`: Toggle feels-like temperature usage.

[X] Reveal Grid
- **User-level Defaults:**
  - `columns`: Default column count.
  - `revealMode`: Default reveal mode ('flip' or 'fade').
  - `fontFamily`: Default custom font.
  - `defaultCardColor`: Default front card color.
  - `defaultCardBackColor`: Default back card color.
- **Admin-only Settings:**
  - `dockDefaults`: Visibility in the building dock.

[X] Schedule
- **User-level Defaults:**
  - `items`: Default schedule items.
  - `schedules`: Pre-defined building-level schedules.
- **Admin-only Settings:**
  - None.

[X] Scoreboard
- **User-level Defaults:**
  - `teams`: Pre-defined team names and colors.
- **Admin-only Settings:**
  - None.

[ ] Seating Chart - No admin config.

[ ] Smart Notebook - No admin config.

[X] Sound
- **User-level Defaults:**
  - `visual`: Default visualizer style.
  - `sensitivity`: Initial mic sensitivity level.
- **Admin-only Settings:**
  - None.

[X] Specialist Schedule
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `cycleLength`: Rotation length (6 or 10 days).
  - `startDate`: Anchor date for cycle calculation.
  - `schoolDays`: List of valid school days for rotation.
  - `dayLabel`: Custom label (e.g., "Day" vs "Block").
  - `customDayNames`: Day-specific naming overrides.
  - `blocks`: Date range blocks for 10-block rotations.
  - `specialistOptions`: Predefined list of specialist subjects.
  - `dockDefaults`: Visibility in the building dock.

[X] Starter Pack
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Packs: CRUD management of widget collections by building/grade.
  - `dockDefaults`: Visibility in the building dock.

[X] Stickers (Book)
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of stickers available to all users.

[ ] Syntax Framer - No admin config.

[X] Talking Tool
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - Global Library: CRUD management of categories and sentence stems.

[X] Text
- **User-level Defaults:**
  - `fontSize`: Default text size.
  - `bgColor`: Default background color.
- **Admin-only Settings:**
  - None.

[X] Time Tool
- **User-level Defaults:**
  - `duration`: Initial timer duration in seconds.
  - `timerEndTrafficColor`: Linked traffic light color on timer end.
- **Admin-only Settings:**
  - None.

[X] Traffic
- **User-level Defaults:**
  - `active`: The initial light state ('red', 'yellow', 'green').
- **Admin-only Settings:**
  - None.

[X] Weather
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `fetchingStrategy`: 'client' vs 'admin_proxy'.
  - `updateFrequencyMinutes`: Refresh interval.
  - `temperatureRanges`: CRUD display messages and images by temp range.
  - `source`: OpenWeather vs Earth Networks.
  - `city`: Default city for weather data.
  - `showFeelsLike`: Toggle feels-like temperature display.

[X] Webcam
- **User-level Defaults:**
  - None.
- **Admin-only Settings:**
  - `ocrMode`: 'standard' (local) vs 'gemini' (AI).
