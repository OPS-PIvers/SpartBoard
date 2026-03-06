SPART Board Widget Configuration Analysis

This document outlines the administrative and user-level configuration capabilities for all widgets in the SPART Board application. It is divided into widgets that currently have global administrative settings and those that could benefit from them in the future. The focus is on establishing Global Admin Configurations that set Building-Level Defaults (the initial state a widget boots up with when a teacher adds it to their dashboard, based on their building assignment).

---

## Implementation Status

| Widget                                         | Status         | Notes                                                                                |
| ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| Catalyst (catalyst)                            | ✅ Implemented | `CatalystPermissionEditor` component                                                 |
| Lunch Count (lunchCount)                       | ✅ Implemented | Sheet IDs + submission URL in `FeatureConfigurationPanel`                            |
| Weather                                        | ✅ Implemented | Fetching strategy, source, temperature ranges, showFeelsLike                         |
| Webcam                                         | ✅ Implemented | OCR mode toggle (Standard vs Gemini)                                                 |
| Expectations                                   | ✅ Implemented | `ExpectationsConfigurationPanel` per-building option overrides                       |
| Schedule                                       | ✅ Implemented | `ScheduleConfigurationPanel` per-building default schedule items                     |
| Calendar                                       | ✅ Implemented | `CalendarGlobalConfig` type + `CalendarConfigurationModal`                           |
| Stickers                                       | ✅ Implemented | `StickerLibraryModal` + `StickerGlobalConfig` type                                   |
| Instructional Routines (instructionalRoutines) | ✅ Implemented | `InstructionalRoutinesManager` component                                             |
| Clock                                          | ✅ Implemented | Per-building defaults: format24, fontFamily, themeColor — `ClockConfigurationPanel`  |
| Timer (time-tool)                              | ✅ Implemented | Per-building defaults: duration, timerEndTrafficColor — `TimeToolConfigurationPanel` |
| Checklist                                      | ✅ Implemented | Per-building defaults: items[], scaleMultiplier — `ChecklistConfigurationPanel`      |
| Sound                                          | ✅ Implemented | Per-building defaults: visual style, sensitivity — `SoundConfigurationPanel`         |
| Note (text)                                    | ✅ Implemented | Per-building defaults: fontSize, bgColor — `NoteConfigurationPanel`                  |
| Traffic Light (traffic)                        | ✅ Implemented | Per-building defaults: default active state — `TrafficLightConfigurationPanel`       |
| Random                                         | ✅ Implemented | Per-building defaults: visualStyle, soundEnabled — `RandomConfigurationPanel`        |
| Dice                                           | ✅ Implemented | Per-building defaults: count — `DiceConfigurationPanel`                              |
| Scoreboard                                     | ✅ Implemented | Per-building defaults: teams (names/colors) — `ScoreboardConfigurationPanel`         |
| Materials                                      | ✅ Implemented | Per-building defaults: selectedItems — `MaterialsConfigurationPanel`                 |
| Math Tools (mathTools)                         | ✅ Implemented | Per-tool grade level control + DPI calibration — `MathToolsConfigurationPanel`       |
| Mini Apps (miniApp)                            | ✅ Implemented | Global app library with building targeting — `MiniAppLibraryModal`                   |
| Recess Gear (recessGear)                       | ✅ Implemented | Weather-linked gear ranges and fetching strategy — `FeatureConfigurationPanel`       |
| Classes                                        | ⬜ Not started | SIS sync rate limits, display name format [First / First L. \ First Last]            |
| Drawing                                        | ✅ Implemented | Default mode, brush thickness, and restricted palettes — `DrawingConfigurationPanel` |
| Embed                                          | ⬜ Not started | Domain allowlist, default URL per building                                           |
| Magic                                          | ⬜ Not started | Usage quotas, prompt suggestions                                                     |
| PDF Viewer (pdf)                               | ⬜ Not started | Max file size limit, default PDF URL                                                 |
| Poll                                           | ⬜ Not started | District-wide pushed polls                                                           |
| QR Code (qr)                                   | ⬜ Not started | UTM tracking parameter appender                                                      |
| Quiz                                           | ⬜ Not started | District curriculum repository                                                       |
| Record                                         | ⬜ Not started | Max duration/resolution limits                                                       |
| Seating Chart (seating-chart)                  | ⬜ Not started | Max nodes, default template per building                                             |
| Smart Notebook (smartNotebook)                 | ⬜ Not started | Max pages/stroke paths                                                               |
| Talking Tool (talking-tool)                    | ✅ Implemented | Admin phrase bank and category management                                            |
| Breathing                                      | ⬜ Not started | No specific global settings available                                                |

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

---

# Part 2: Widgets WITHOUT Global Admin Settings (Proposed)

These widgets currently lack specific global settings panels beyond basic enablement.

## 1. Classes (classes)

**Proposed Admin Config**: SIS Synchronization Limits. Add controls for how often roster data can be pulled from ClassLink/Drive. Set building-level default display styles (e.g., "First Name + Last Initial" vs "Full Name").

## 3. Embed (embed)

**Proposed Admin Config**: Domain Allowlist. Establish security array of allowed domains. Set default URLs per building (e.g., daily announcements).

## 4. Magic (magic)

**Proposed Admin Config**: Usage Quotas. Implement daily rate limits on AI generation. Provide default prompt suggestions tailored to building level.

## 5. PDF Viewer (pdf)

**Proposed Admin Config**: Max file size limits. Set building default PDF (e.g., bell schedule).

## 6. Poll (poll)

**Proposed Admin Config**: District-Wide Pushed Polls. Interface for admins to force a poll onto active dashboards.

## 7. QR Code (qr)

**Proposed Admin Config**: UTM Tracking. Configure automatic URL tracking parameter appender for analytics.

## 8. Quiz (quiz)

**Proposed Admin Config**: District Curriculum Repository. Centralized database of approved quizzes.

## 9. Record (record)

**Proposed Admin Config**: Storage & Resolution Limits. Set max recording duration and enforce resolution caps.

## 10. Seating Chart (seating-chart)

**Proposed Admin Config**: Classroom Dimensions. Limit max furniture nodes for fire code. Set default template (rows, pods, etc) per building.

## 11. Smart Notebook (smartNotebook)

**Proposed Admin Config**: Data Caps. Define max pages or stroke paths per notebook.

## 13. Breathing (breathing)

**Proposed Admin Config**: Building default pattern or visual style.
