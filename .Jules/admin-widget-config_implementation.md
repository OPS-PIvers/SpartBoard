# Admin Settings > Feature Permissions > Admin Widget Configuration Modal Audit

## Required Structure:

"[X] [WIDGET] - [Default User-Level Settings]
-- [Description] - [Admin-Only Settings]
-- [Description]"

## Widgets:

[ ] Breathing - No admin config.
[X] Calendar - Default User-Level Settings
-- `events`: Pre-populated building events.
-- `googleCalendarIds`: Default Google Calendar IDs for the building. - Admin-Only Settings
-- `blockedDates`: Global list of dates that cannot be selected.
-- `updateFrequencyHours`: How often the admin proxy refreshes data.
-- `dockDefaults`: Visibility in the building dock.
[X] Car Rider Pro - Default User-Level Settings
-- `iframeUrl`: The URL of the Car Rider Pro dashboard.
-- `cardColor`: Default background color.
-- `cardOpacity`: Default background opacity. - Admin-Only Settings
-- `url`: Global district portal URL.
[X] Catalyst - Default User-Level Settings
-- None. - Admin-Only Settings
-- `dockDefaults`: Visibility in the building dock.
[X] Checklist - Default User-Level Settings
-- `items`: Default checklist items pre-populated on creation.
-- `scaleMultiplier`: Default font scaling.
[ ] Classes - No admin config.
[X] Clock - Default User-Level Settings
-- `format24`: Toggle 24-hour time format.
-- `fontFamily`: Default clock font.
-- `themeColor`: Default clock text color.
[ ] Concept Web - No admin config.
[X] Dice - Default User-Level Settings
-- `count`: Default number of dice (1-6).
[X] Drawing - Default User-Level Settings
-- `mode`: Default mode ('window' or 'overlay').
-- `width`: Default pen width.
-- `customColors`: Pre-populated custom color palette.
[X] Embed - Default User-Level Settings
-- `hideUrlField`: Prevents teachers from changing the URL.
-- `whitelistUrls`: Restricted list of allowed URLs.
[X] Expectations - Default User-Level Settings
-- None. - Admin-Only Settings
-- `volumeOverrides`: Custom labels/subtitles for voice levels.
-- `groupOverrides`: Custom labels/subtitles for work modes.
-- `interactionOverrides`: Custom labels/subtitles for interactions.
-- `showVolume/Group/Interaction`: Visibility toggles for categories.
[X] Graphic Organizer - Default User-Level Settings
-- None. - Admin-Only Settings
-- `templates`: CRUD management of global templates.
-- `dockDefaults`: Visibility in the building dock.
[ ] Hotspot Image - No admin config.
[X] Instructional Routines - Default User-Level Settings
-- None. - Admin-Only Settings
-- Global Library: CRUD management of routines available to all buildings.
[X] Lunch Count - Default User-Level Settings
-- None. - Admin-Only Settings
-- `schumannSheetId`: Google Sheet ID for Schumann Elementary.
-- `intermediateSheetId`: Google Sheet ID for Intermediate School.
-- `submissionUrl`: Apps Script URL for data POSTing.
[X] Materials - Default User-Level Settings
-- `selectedItems`: Default material IDs selected on creation.
[X] Math Tools - Default User-Level Settings
-- None. - Admin-Only Settings
-- `toolGradeLevels`: Visibility of specific tools by grade level.
-- `dpiCalibration`: Global pixel-per-inch calibration for building hardware.
[X] Mini App - Default User-Level Settings
-- None. - Admin-Only Settings
-- `submissionUrl`: Apps Script URL for result collection.
-- `botEmail`: Service account email for data access.
-- Global Library: CRUD management of mini-apps by building/grade.
[X] Music - Default User-Level Settings
-- None. - Admin-Only Settings
-- Global Library: CRUD management of stations (YouTube/Spotify) by building.
[X] Next Up - Default User-Level Settings
-- `displayCount`: Default number of items to show in queue.
-- `fontFamily`: Default UI font.
-- `themeColor`: Default brand color.
[ ] Number Line - No admin config.
[ ] Onboarding - No admin config.
[ ] PDF - No admin config.
[X] Poll - Default User-Level Settings
-- `question`: Pre-populated default question.
-- `options`: Pre-populated default options.
[X] QR - Default User-Level Settings
-- `defaultUrl`: Initial URL for generated QR codes.
-- `qrColor`: Default foreground color.
-- `qrBgColor`: Default background color.
[ ] Quiz - No admin config.
[X] Random - Default User-Level Settings
-- `visualStyle`: Default picker style ('flash', 'slots', 'wheel').
-- `soundEnabled`: Toggle sound effects on/off.
[X] Recess Gear - Default User-Level Settings
-- None. - Admin-Only Settings
-- `fetchingStrategy`: 'client' vs 'admin_proxy'.
-- `updateFrequencyMinutes`: Refresh interval.
-- `temperatureRanges`: CRUD gear items with icons, images, and categories.
-- `source`: OpenWeather vs Earth Networks.
-- `city`: Default city for weather data.
-- `useFeelsLike`: Toggle feels-like temperature usage.
[X] Reveal Grid - Default User-Level Settings
-- `columns`: Default column count.
-- `revealMode`: Default reveal mode ('flip' or 'fade').
-- `fontFamily`: Default custom font.
-- `defaultCardColor`: Default front card color.
-- `defaultCardBackColor`: Default back card color. - Admin-Only Settings
-- `dockDefaults`: Visibility in the building dock.
[X] Schedule - Default User-Level Settings
-- `items`: Default schedule items.
-- `schedules`: Pre-defined building-level schedules.
[X] Scoreboard - Default User-Level Settings
-- `teams`: Pre-defined team names and colors.
[ ] Seating Chart - No admin config.
[ ] Smart Notebook - No admin config.
[X] Sound - Default User-Level Settings
-- `visual`: Default visualizer style.
-- `sensitivity`: Initial mic sensitivity level.
[X] Specialist Schedule - Default User-Level Settings
-- None. - Admin-Only Settings
-- `cycleLength`: Rotation length (6 or 10 days).
-- `startDate`: Anchor date for cycle calculation.
-- `schoolDays`: List of valid school days for rotation.
-- `dayLabel`: Custom label (e.g., "Day" vs "Block").
-- `customDayNames`: Day-specific naming overrides.
-- `blocks`: Date range blocks for 10-block rotations.
-- `specialistOptions`: Predefined list of specialist subjects.
-- `dockDefaults`: Visibility in the building dock.
[X] Starter Pack - Default User-Level Settings
-- None. - Admin-Only Settings
-- Global Packs: CRUD management of widget collections by building/grade.
-- `dockDefaults`: Visibility in the building dock.
[X] Stickers (Book) - Default User-Level Settings
-- None. - Admin-Only Settings
-- Global Library: CRUD management of stickers available to all users.
[ ] Syntax Framer - No admin config.
[X] Talking Tool - Default User-Level Settings
-- None. - Admin-Only Settings
-- Global Library: CRUD management of categories and sentence stems.
[X] Text - Default User-Level Settings
-- `fontSize`: Default text size.
-- `bgColor`: Default background color.
[X] Time Tool - Default User-Level Settings
-- `duration`: Initial timer duration in seconds.
-- `timerEndTrafficColor`: Linked traffic light color on timer end.
[X] Traffic - Default User-Level Settings
-- `active`: The initial light state ('red', 'yellow', 'green').
[X] Weather - Default User-Level Settings
-- None. - Admin-Only Settings
-- `fetchingStrategy`: 'client' vs 'admin_proxy'.
-- `updateFrequencyMinutes`: Refresh interval.
-- `temperatureRanges`: CRUD display messages and images by temp range.
-- `source`: OpenWeather vs Earth Networks.
-- `city`: Default city for weather data.
-- `showFeelsLike`: Toggle feels-like temperature display.
[X] Webcam - Default User-Level Settings
-- None. - Admin-Only Settings
-- `ocrMode`: 'standard' (local) vs 'gemini' (AI).
