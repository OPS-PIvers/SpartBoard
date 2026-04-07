SpartBoard Widget Configuration Analysis

This document outlines the administrative and user-level configuration capabilities for all widgets in the SpartBoard application. It is divided into widgets that currently have global administrative settings and those that could benefit from them in the future. The focus is on establishing Global Admin Configurations that set Building-Level Defaults (the initial state a widget boots up with when a teacher adds it to their dashboard, based on their building assignment).

---

## Implementation Status

| Widget                                         | Status                  | Notes                                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalyst (catalyst)                            | ✅ Implemented          | `CatalystPermissionEditor` component                                                                                                                                                                                          |
| Lunch Count (lunchCount)                       | ✅ Implemented          | Sheet IDs + submission URL in `FeatureConfigurationPanel`                                                                                                                                                                     |
| Weather                                        | ✅ Implemented          | Fetching strategy, source, temperature ranges, showFeelsLike                                                                                                                                                                  |
| Webcam                                         | ✅ Implemented          | OCR mode toggle (Standard vs Gemini)                                                                                                                                                                                          |
| Expectations                                   | ✅ Implemented          | `ExpectationsConfigurationPanel` per-building option overrides                                                                                                                                                                |
| Schedule                                       | ✅ Implemented          | `ScheduleConfigurationPanel` per-building default schedule items                                                                                                                                                              |
| Calendar                                       | ✅ Implemented          | `CalendarGlobalConfig` type + `CalendarConfigurationModal`                                                                                                                                                                    |
| Stickers                                       | ✅ Implemented          | `StickerLibraryModal` + `StickerGlobalConfig` type                                                                                                                                                                            |
| Instructional Routines (instructionalRoutines) | ✅ Implemented          | `InstructionalRoutinesManager` component                                                                                                                                                                                      |
| Clock                                          | ✅ Implemented          | Per-building defaults: format24, fontFamily, themeColor — `ClockConfigurationPanel`                                                                                                                                           |
| Timer (time-tool)                              | ✅ Implemented          | Per-building defaults: duration, timerEndTrafficColor — `TimeToolConfigurationPanel`                                                                                                                                          |
| Checklist                                      | ✅ Implemented          | Per-building defaults: items[], scaleMultiplier — `ChecklistConfigurationPanel`                                                                                                                                               |
| Sound                                          | ✅ Implemented          | Per-building defaults: visual style, sensitivity — `SoundConfigurationPanel`                                                                                                                                                  |
| Note (text)                                    | ✅ Implemented          | Per-building defaults: fontSize, bgColor — `NoteConfigurationPanel`                                                                                                                                                           |
| Traffic Light (traffic)                        | ✅ Implemented          | Per-building defaults: default active state — `TrafficLightConfigurationPanel`                                                                                                                                                |
| Random                                         | ✅ Implemented          | Per-building defaults: visualStyle, soundEnabled — `RandomConfigurationPanel`                                                                                                                                                 |
| Dice                                           | ✅ Implemented          | Per-building defaults: count — `DiceConfigurationPanel`                                                                                                                                                                       |
| Scoreboard                                     | ✅ Implemented          | Per-building defaults: teams (names/colors) — `ScoreboardConfigurationPanel`                                                                                                                                                  |
| Materials                                      | ✅ Implemented          | Per-building defaults: selectedItems — `MaterialsConfigurationPanel`                                                                                                                                                          |
| Math Tools (mathTools)                         | ✅ Implemented          | Per-tool grade level control + DPI calibration — `MathToolsConfigurationPanel`                                                                                                                                                |
| Mini Apps (miniApp)                            | ✅ Implemented          | Global app library with building targeting — `MiniAppLibraryModal`                                                                                                                                                            |
| Recess Gear (recessGear)                       | ✅ Implemented          | Weather-linked gear ranges and fetching strategy — `FeatureConfigurationPanel`                                                                                                                                                |
| Talking Tool (talking-tool)                    | ✅ Implemented          | Admin phrase bank and category management — `TalkingToolConfigurationPanel`                                                                                                                                                   |
| Drawing                                        | ✅ Implemented          | Default mode, brush thickness, and restricted palettes — `DrawingConfigurationPanel`                                                                                                                                          |
| Classes                                        | ✅ Implemented          | Per-building ClassLink enable/disable, roster display defaults — `ClassesConfigurationPanel`                                                                                                                                  |
| Embed                                          | ✅ Implemented          | Per-building domain allowlist, default URL, hide-URL-field toggle — `EmbedConfigurationPanel`                                                                                                                                 |
| Poll                                           | ✅ Implemented          | Per-building default question and answer options — `PollConfigurationPanel`                                                                                                                                                   |
| QR Code (qr)                                   | ✅ Implemented          | Per-building default URL and color scheme — `QRConfigurationPanel`                                                                                                                                                            |
| Seating Chart (seating-chart)                  | ✅ Implemented          | Per-building roster mode and layout defaults — `SeatingChartConfigurationPanel`                                                                                                                                               |
| Smart Notebook (smartNotebook)                 | ✅ Implemented          | Per-building max pages and stroke-path limits — `SmartNotebookConfigurationPanel`                                                                                                                                             |
| Breathing                                      | ✅ Implemented          | Per-building default pattern, visual style, and color — `BreathingConfigurationPanel`                                                                                                                                         |
| PDF Viewer (pdf)                               | ✅ Implemented          | Global PDF library with per-PDF building targeting, dock defaults — `PdfLibraryModal` (dedicated modal)                                                                                                                       |
| Magic (magic)                                  | ✅ Implemented          | Daily AI rate limit, default prompt suggestions — `MagicConfigurationPanel` (schema-driven)                                                                                                                                   |
| Record                                         | ✅ Implemented          | Max duration (minutes), max resolution cap — `RecordConfigurationPanel` (schema-driven)                                                                                                                                       |
| Number Line (numberLine)                       | ✅ Implemented          | Per-building defaults — `NumberLineConfigurationPanel`                                                                                                                                                                        |
| Concept Web (concept-web)                      | ✅ Implemented          | Per-building defaults — `ConceptWebConfigurationPanel`                                                                                                                                                                        |
| Syntax Framer (syntax-framer)                  | ✅ Implemented          | Per-building defaults — `SyntaxFramerConfigurationPanel`                                                                                                                                                                      |
| Hotspot Image (hotspot-image)                  | ✅ Implemented          | Per-building defaults — `HotspotImageConfigurationPanel`                                                                                                                                                                      |
| Reveal Grid (reveal-grid)                      | ✅ Implemented          | Per-building defaults — `RevealGridConfigurationPanel`                                                                                                                                                                        |
| Car Rider (car-rider-pro)                      | ✅ Implemented          | Per-building defaults — `CarRiderConfigurationPanel`                                                                                                                                                                          |
| Next Up (nextUp)                               | ✅ Implemented          | Per-building defaults — `NextUpConfigurationPanel`                                                                                                                                                                            |
| Quiz                                           | ⬜ No building defaults | Quiz management is self-contained in the widget (Drive-backed quizzes, live sessions). A "District Curriculum Repository" feature is proposed but not yet built. Intentionally excluded from the building-defaults panel map. |

---

# Part 1: Widgets WITH Global Admin Settings

These widgets currently have explicit UI controls in the admin panel allowing administrators to enforce global states and defaults.

## 1. Catalyst (catalyst)

**Global Admin Config**: Administrators manage global Custom Categories (labels, icons, colors) and Custom Routines (titles, instructions, associated widgets). Admins configure how the catalyst routines/strategies behave at each building level.
**User Config Modal Defaults**: On the teacher's dashboard, the local state tracks the activeCategory and activeStrategyId based on what the teacher selects to display.

## 2. Lunch Count (lunchCount)

**Global Admin Config**: Configures the target endpoints for data synchronization, specifically accepting Schumann/Intermediate Google Sheet IDs and the Apps Script Submission URL.
**User Config Modal Defaults**: Teachers select their specific schoolSite, rosterMode (custom vs. class roster), and gradeLevel. They also configure the specific lunchTimeHour and lunchTimeMinute.

## 3. Weather (weather)

**Global Admin Config**: Controls the fetching strategy (Client vs. Admin Proxy), data source (OpenWeather vs. Earth Networks), target City, and custom Temperature Range thresholds/images.
**User Config Modal Defaults**: The user config modal allows teachers to override the location (locationName), toggle showFeelsLike temperature adjustments, and toggle hideClothing.

## 4. Webcam (webcam)

**Global Admin Config**: Toggles the OCR (Optical Character Recognition) mode between a standard local browser implementation and a high-accuracy Gemini AI implementation.
**User Config Modal Defaults**: Allows the teacher to select the specific hardware camera deviceId, adjust the digital zoomLevel, and toggle an isMirrored state.

## 5. Expectations (expectations)

**Global Admin Config**: Set default behavior guidelines and per-building option overrides (enabled status, custom labels) for voice levels, group modes, and interaction modes.
**User Config Modal Defaults**: Teachers manually define the voiceLevel, workMode, interactionMode, and the visual layout.

## 6. Schedule (schedule)

**Global Admin Config**: Set per-building default schedule items that pre-populate the widget upon instantiation.
**User Config Modal Defaults**: Teachers manage an array of items (tasks and times), toggle autoProgress, and select a fontFamily.

## 7. Calendar (calendar)

**Global Admin Config**: Manage district-wide blocked dates and building-specific default events. Supports syncing events from Google Calendar IDs via an admin proxy with configurable refresh frequency.
**User Config Modal Defaults**: Teachers can add personal events and toggle building sync.

## 8. Stickers (stickers)

**Global Admin Config**: Manage the global sticker library available to all users, with optional grade-level targeting for specific stickers.
**User Config Modal Defaults**: Teachers browse the global library and can upload their own local stickers.

## 9. Instructional Routines (instructionalRoutines)

**Global Admin Config**: Manage a centralized repository of instructional routines (morning meetings, transitions, etc.) available to teachers.
**User Config Modal Defaults**: Teachers select from the library or build custom steps.

## 10. Clock (clock)

**Global Admin Config**: Set per-building defaults for 12/24h format, fontFamily, and themeColor.
**User Config Modal Defaults**: Teachers configure visual preferences including format24, showSeconds, themeColor, fontFamily, and clockStyle.

## 11. Timer (time-tool)

**Global Admin Config**: Set per-building defaults for duration and the traffic light color to show when the timer ends.
**User Config Modal Defaults**: Teachers toggle between timer or stopwatch mode, set duration, and pick sounds.

## 12. Checklist (checklist)

**Global Admin Config**: Set per-building default items that are automatically injected into a teacher's checklist, and default scale multiplier.
**User Config Modal Defaults**: Teachers select mode (manual vs roster), scale, and manage items.

## 13. Sound (sound)

**Global Admin Config**: Set per-building defaults for visual style (balls, line, etc.) and microphone sensitivity.
**User Config Modal Defaults**: Teachers adjust sensitivity and pick visual style.

## 14. Note (text)

**Global Admin Config**: Set per-building defaults for fontSize and bgColor.
**User Config Modal Defaults**: Teachers define content, bgColor, and fontSize.

## 15. Traffic Light (traffic)

**Global Admin Config**: Set per-building default active state (red, yellow, green, or none).
**User Config Modal Defaults**: Teachers manually click to set the active state.

## 16. Random (random)

**Global Admin Config**: Set per-building defaults for visualStyle (wheel, slots, flash) and soundEnabled.
**User Config Modal Defaults**: Teachers configure rosterMode, mode, groupSize, visualStyle, and soundEnabled.

## 17. Dice (dice)

**Global Admin Config**: Set per-building default dice count (1-6).
**User Config Modal Defaults**: Teachers adjust the count of dice.

## 18. Scoreboard (scoreboard)

**Global Admin Config**: Set per-building default teams including names and color assignments.
**User Config Modal Defaults**: Teachers manage team scores, names, and colors.

## 19. Materials (materials)

**Global Admin Config**: Set per-building default selected items from the standardized supply library.
**User Config Modal Defaults**: Teachers choose which materials are currently visible.

## 20. Math Tools (mathTools)

**Global Admin Config**: Controls which individual math manipulatives (ruler, protractor, base-10 blocks, etc.) are available to each grade band (K-2, 3-5, 6-8, 9-12). Also sets building-wide DPI calibration for physical accuracy on IFP hardware.
**User Config Modal Defaults**: Teachers select tools from their enabled palette.

## 21. Mini Apps (miniApp)

**Global Admin Config**: Manage a global repository of sandboxed HTML/JS apps. Each app can be targeted to specific buildings.
**User Config Modal Defaults**: Teachers select an active app from the library.

## 22. Recess Gear (recessGear)

**Global Admin Config**: Set weather-fetching strategy and define gear categories (clothing, footwear, accessories) linked to temperature ranges with custom labels and icons.
**User Config Modal Defaults**: Teachers link the widget to a specific weather source and toggle "feels like" temperature usage.

## 23. Talking Tool (talking-tool)

**Global Admin Config**: Manage the admin phrase bank and category configuration used to seed the widget's phrase library.
**User Config Modal Defaults**: Teachers select from the admin-curated phrase bank or add their own phrases.

## 24. Drawing (drawing)

**Global Admin Config**: Set per-building defaults for drawing mode, brush thickness, and restricted color palettes.
**User Config Modal Defaults**: Teachers select tools, colors, and canvas options.

## 25. Classes (classes)

**Global Admin Config**: Per-building ClassLink integration enable/disable. Controls whether the ClassLink roster sync is available for each building, and sets default display name format (first name only, first + last initial, or full name).
**User Config Modal Defaults**: Teachers select their active class roster source and display preferences.

## 26. Embed (embed)

**Global Admin Config**: Per-building domain allowlist (restrict embeddable URLs to approved domains), a default URL per building (e.g., daily announcements page), and a toggle to hide the URL input field from teachers.
**User Config Modal Defaults**: Teachers enter a URL to embed in the iframe.

## 27. Poll (poll)

**Global Admin Config**: Per-building default question text and answer options that pre-populate a new Poll widget.
**User Config Modal Defaults**: Teachers customize the question, options, and reset vote counts.

## 28. QR Code (qr)

**Global Admin Config**: Per-building default URL and color scheme for the QR code.
**User Config Modal Defaults**: Teachers enter a URL and optionally customize colors.

## 29. Seating Chart (seating-chart)

**Global Admin Config**: Per-building roster mode (class vs. custom) and layout defaults.
**User Config Modal Defaults**: Teachers build and arrange their seating layout.

## 30. Smart Notebook (smartNotebook)

**Global Admin Config**: Per-building limits on max pages and stroke paths to control storage usage.
**User Config Modal Defaults**: Teachers add pages, write, and draw.

## 31. Breathing (breathing)

**Global Admin Config**: Per-building defaults for breathing pattern (Box, Relaxing, Coherent), visual style (Sphere, Lotus, Ripple), and accent color.
**User Config Modal Defaults**: Teachers select their preferred pattern and visual.

## 32. PDF Viewer (pdf)

**Global Admin Config**: Managed via the dedicated `PdfLibraryModal` (accessible from the Feature Permissions manager). Admins upload PDFs to a global library and optionally restrict each PDF to specific buildings. The settings tab controls dock visibility defaults. PDFs in the library become available to all teachers in targeted buildings.
**User Config Modal Defaults**: Teachers browse the global library and select the active PDF.

## 33. Magic (magic)

**Global Admin Config**: Daily AI rate limit (max requests per user per day) and a list of default prompt suggestions shown to all users. Implemented via `MagicConfigurationPanel` using the `SchemaDrivenConfigurationPanel` generic form engine.
**User Config Modal Defaults**: Teachers type their own prompts or select from suggestions.

## 34. Record (record)

**Global Admin Config**: Maximum recording duration (minutes) and maximum resolution cap (e.g., 1080p, 720p). Implemented via `RecordConfigurationPanel` using the `SchemaDrivenConfigurationPanel` generic form engine.
**User Config Modal Defaults**: Teachers start/stop recordings within the enforced limits.

## 35. Number Line, Concept Web, Syntax Framer, Hotspot Image, Reveal Grid, Car Rider, Next Up

**Global Admin Config**: Each has a dedicated `*ConfigurationPanel.tsx` providing per-building defaults registered in `FeatureConfigurationPanel.tsx`.
**User Config Modal Defaults**: Teachers adjust per-widget settings within allowed bounds.

---

# Part 2: Widgets WITHOUT Global Admin Settings

As of the current implementation, all major widgets have admin configuration panels. The only remaining widget without a building-defaults panel is:

## Quiz (quiz)

**Current State**: The Quiz widget is a self-contained system backed by Google Drive (quiz JSON files) and Firestore live sessions. Admin management of quiz content happens at the widget level (teacher creates/imports quizzes from Drive). The widget is intentionally excluded from the building-defaults panel map in `FeatureConfigurationPanel.tsx`.

**Proposed Future Admin Config**: District Curriculum Repository — a centralized Firestore/Drive collection of approved quizzes that admins can publish, tag by grade/subject, and make available to all teachers. This is a larger feature not yet implemented.
