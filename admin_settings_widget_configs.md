SPART Board Widget Configuration Analysis

This document outlines the administrative and user-level configuration capabilities for all widgets in the SPART Board application. It is divided into widgets that currently have global administrative settings and those that could benefit from them in the future. The focus is on establishing Global Admin Configurations that set Building-Level Defaults (the initial state a widget boots up with when a teacher adds it to their dashboard, based on their building assignment).

---

## Implementation Status

| Widget                      | Status                   | Notes                                                                                |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Catalyst                    | ✅ Implemented           | `CatalystPermissionEditor` component                                                 |
| Lunch Count                 | ✅ Implemented           | Sheet IDs + submission URL in `FeatureConfigurationPanel`                            |
| Weather                     | ✅ Implemented           | Fetching strategy, source, temperature ranges, showFeelsLike                         |
| Webcam                      | ✅ Implemented           | OCR mode toggle (Standard vs Gemini)                                                 |
| Expectations                | ✅ Implemented           | `ExpectationsConfigurationPanel` per-building option overrides                       |
| Schedule                    | ✅ Implemented           | `ScheduleConfigurationPanel` per-building default schedule items                     |
| Calendar                    | ✅ Implemented           | `CalendarGlobalConfig` type + `CalendarConfigurationModal`                           |
| Stickers                    | ✅ Implemented           | `StickerLibraryModal` + `StickerGlobalConfig` type                                   |
| Instructional Routines      | ✅ Implemented           | `InstructionalRoutinesManager` component                                             |
| **Clock**                   | ✅ **Implemented (new)** | Per-building defaults: format24, fontFamily, themeColor — `ClockConfigurationPanel`  |
| **Timer (time-tool)**       | ✅ **Implemented (new)** | Per-building defaults: duration, timerEndTrafficColor — `TimeToolConfigurationPanel` |
| **Checklist**               | ✅ **Implemented (new)** | Per-building defaults: items[], scaleMultiplier — `ChecklistConfigurationPanel`      |
| **Sound**                   | ✅ **Implemented (new)** | Per-building defaults: visual style, sensitivity — `SoundConfigurationPanel`         |
| **Note (text)**             | ✅ **Implemented (new)** | Per-building defaults: fontSize, bgColor — `NoteConfigurationPanel`                  |
| **Traffic Light**           | ✅ **Implemented (new)** | Per-building defaults: default active state — `TrafficLightConfigurationPanel`       |
| **Random**                  | ✅ **Implemented (new)** | Per-building defaults: visualStyle, soundEnabled — `RandomConfigurationPanel`        |
| Checklist (user dice faces) | ⬜ Not started           | Custom word/value faces per die (user-facing feature)                                |
| Classes                     | ⬜ Not started           | SIS sync rate limits, display name format                                            |
| Dice                        | ⬜ Not started           | Custom preset arrays, default count/style                                            |
| Drawing                     | ⬜ Not started           | Restricted palettes, default mode per building                                       |
| Embed                       | ⬜ Not started           | Domain allowlist, default URL per building                                           |
| Magic                       | ⬜ Not started           | Usage quotas, prompt suggestions                                                     |
| Materials                   | ⬜ Not started           | Standardized asset library, default activeItems                                      |
| Mini Apps                   | ⬜ Not started           | Approved app registry, default activeApp per building                                |
| PDF Viewer                  | ⬜ Not started           | Max file size limit, default PDF URL                                                 |
| Poll                        | ⬜ Not started           | District-wide pushed polls                                                           |
| QR Code                     | ⬜ Not started           | UTM tracking parameter appender                                                      |
| Quiz                        | ⬜ Not started           | District curriculum repository                                                       |
| Recess Gear                 | ⬜ Not started           | Weather-linked thresholds, useFeelsLike default                                      |
| Record                      | ⬜ Not started           | Max duration/resolution limits                                                       |
| Scoreboard                  | ⬜ Not started           | Standardized teams, reset cron                                                       |
| Seating Chart               | ⬜ Not started           | Max nodes, default template per building                                             |
| Smart Notebook              | ⬜ Not started           | Max pages/stroke paths                                                               |
| Stickers (per-item)         | ⬜ Not started           | Global asset drop per building                                                       |

---

# Part 1: Widgets WITH Global Admin Settings

These widgets currently have explicit UI controls in the FeatureConfigurationPanel allowing administrators to enforce global states and defaults.

## 1. Catalyst (catalyst)

Global Admin Config (Current): Administrators manage global Custom Categories (labels, icons, colors) and Custom Routines (titles, instructions, associated widgets).

Global Admin Config (UPDATES FOR BUILDING-LEVEL DEFAULTS): Administrators manage global Custom Categories (labels, icons, colors) and Custom Routines (titles, instructions, associated widgets). Admins configure how the catalyst routines/strategies behave at each building level.

Admin Improvement Idea: Add a strictness toggle dictating whether teachers can edit/duplicate these admin-level routines on their own dashboards, improving fidelity to district-mandated instructional strategies.

User Config Modal Defaults: On the teacher's dashboard, the local state tracks the activeCategory and activeStrategyId based on what the teacher selects to display.

## 2. Lunch Count (lunchCount)

Global Admin Config (Current): Configures the target endpoints for data synchronization, specifically accepting Schumann/Intermediate Google Sheet IDs and the Apps Script Submission URL.

Global Admin Config (UPDATES FOR BUILDING-LEVEL DEFAULTS): Admins configure the target endpoints and map the user's assigned building to the widget's default schoolSite.

Admin Improvement Idea: Integrate Google Workspace OAuth to allow administrators to securely select target spreadsheets from a file picker, mitigating the risk of malformed IDs or broken URLs.

User Config Modal Defaults: In the user config modal, teachers select their specific schoolSite, rosterMode (custom vs. class roster), and gradeLevel. They also configure the specific lunchTimeHour and lunchTimeMinute.

## 3. Weather (weather)

Global Admin Config (Current): Controls the fetching strategy (Client vs. Admin Proxy), data source (OpenWeather vs. Earth Networks), target City, and custom Temperature Range thresholds/images.

Global Admin Config (UPDATES FOR BUILDING-LEVEL DEFAULTS): Admins could set the default city, locationName, and showFeelsLike toggle per building. An Elementary school might default showFeelsLike to true (due to stricter recess windchill policies) and hideClothing to false, whereas a High School defaults hideClothing to true.

Admin Improvement Idea: Implement real-time zip code validation or IP-based geofencing for the "City" input to ensure exact weather matches for specific campuses rather than relying on a generic string match.

User Config Modal Defaults: The user config modal allows teachers to override the location (locationName), toggle showFeelsLike temperature adjustments, and toggle hideClothing.

## 4. Webcam (webcam)

Global Admin Config (Current): Toggles the OCR (Optical Character Recognition) mode between a standard local browser implementation and a high-accuracy Gemini AI implementation. No additional changes necessary.

User Config Modal Defaults: The user config modal allows the teacher to select the specific hardware camera deviceId, adjust the digital zoomLevel, and toggle an isMirrored state.

# Part 2: Widgets WITHOUT Global Admin Settings (Proposed)

These widgets currently lack global settings in the administrative panel. Below are proposed global configurations (which include admin-defined building defaults) and the existing local user configuration settings.

## 1. Calendar (calendar)

Proposed Admin Config: Global Blocked Dates & Defaults. Allow admins to sync any number of district-wide Google Calendars to different buildings that automatically populate into all teacher widgets for those buildings. Admins can also set defaults so that when instantiated, the events array is pre-populated with the specific building's A/B schedule or block rotation, allowing the teacher to immediately see relevant upcoming dates without entering them manually.

User Config Modal Defaults: Teachers use the config modal to manually create, edit, and delete an array of local events (comprising a date string and title).

## 2. Checklist (checklist)

Proposed Admin Config: Mandatory Daily Tasks. Provide a list of default checklist items that are automatically injected into a teacher's checklist upon initialization. Admins can establish building-level defaults where the starting items array is pre-filled based on building expectations (e.g., an Elementary default might populate ["Take Attendance", "Lunch Count", "Morning Meeting"], while High School defaults to ["Take Attendance", "Bell Ringer", "Check Canvas"]).  Admins should also be able to pre-set the text sizing default for the buildings.

User Config Modal Defaults: Teachers select the mode (manual text items vs. student roster mode), set the scaleMultiplier for text sizing, and manage the underlying items array.

## 3. Classes (classes)

Proposed Admin Config: SIS Synchronization Limits. Add controls for how often roster data can be pulled from ClassLink/Drive to prevent API rate limiting. Admins could also set a building-level default layout/display style—for instance, defaulting to "First Name + Last Initial" in Elementary, but "Full Name" in High School.

User Config Modal Defaults: The Classes widget acts as an integration hub without a traditional config payload, but users manage their active roster selection.

## 4. Clock (clock)

Proposed Admin Config: Standardized Formatting. Introduce a global toggle to enforce a 12-hour or 24-hour time format district-wide. Admins can set the initial visual payload based on the building. Elementary buildings might default to format24: false and a playful fontFamily like "comic", while High Schools might default to a sleek "sans" font with the building's hex code for the themeColor.

User Config Modal Defaults: Teachers configure visual preferences including format24, showSeconds, themeColor, fontFamily, and clockStyle.

## 5. Dice (dice)

Proposed Admin Config: Custom Face Libraries. Allow admins to create custom dice preset arrays that teachers can access globally. Admins can set default starting count and styles per building. Elementary buildings might start with 1 die showing pips/dots, while Middle Schools might default to 2 dice showing numerical digits for math operations.

User Config Modal Defaults: The config modal allows the teacher to adjust the count of how many dice appear on the board.  **NEW**: Users should be able to enter a list of words or values that will display on each side of the dice.  If they have 1 die selected, they can enter 6 things.  If they ahve 2, they have two separate textareas that can each have 6 things, etc.

## 6. Drawing (drawing)

Proposed Admin Config: Restricted Palettes. Offer a predefined color palette matching the school's branding. Admins can establish building default color, width, customColors. Additionally, admin can set the default mode per building where, for example, the widget defaults to mode: 'window' for older grades using it as a scratchpad, but mode: 'overlay' for younger grades where teachers frequently draw directly over the entire dashboard.

User Config Modal Defaults: Teachers select the mode (contained window vs. full-screen overlay) and define default stroke properties (color, width, customColors).

## 7. Embed (embed)

Proposed Admin Config: Domain Allowlist. Establish a global security array of allowed domains to prevent inappropriate content from being framed. Admins can configure defaults so that when a new embed widget is added, the url property points to the building's specific daily announcement slide deck, LMS login page, or building-specific intranet site.

User Config Modal Defaults: Teachers input the target url or html snippet and can configure a refreshInterval.

## 8. Expectations (expectations)

Proposed Admin Config: PBIS Framework Defaults. Set default behavior guidelines that perfectly align with the school's PBIS matrix. Admins can define defaults so the widget instantiates with building-specific expectations already selected. Elementary might default to layout: 'elementary' and voiceLevel: 0 (Silent), while Secondary defaults to layout: 'secondary', voiceLevel: 1 (Whisper), and workMode: 'individual'.  Admin users can create presets/templates that are matched to specific instructional routines (These need to be mapped/matched to the actual building-level-available instructional routines, so when expectations widget is connected to a step in that routine, they can auto-launch it with the pre-selected defaults.

User Config Modal Defaults: Teachers manually define the voiceLevel, workMode, interactionMode, and the visual layout.

## 9. Magic (magic - Internal Tool)

Proposed Admin Config: Usage Quotas. Implement daily rate limits on how many times a user can trigger AI widget generation. The initial UI could also display default prompt suggestions tailored by admins to the building level. High school might suggest "Generate a chemistry lab safety checklist," while Elementary suggests "Generate a sight-word randomizer."

User Config Modal Defaults: Operates primarily via prompt injection rather than standard configuration.

## 10. Materials (materials)

Proposed Admin Config: Standardized Asset Library. Pre-load an un-deletable global library of standard school supply icons. Admins could define building defaults for the initial activeItems array. Elementary defaults might instantly display a pencil, crayons, and scissors, whereas High School defaults to a laptop and notebook.

User Config Modal Defaults: Teachers choose the selectedItems (available to display) and activeItems (currently visible).

## 11. Mini Apps (miniApp)

Proposed Admin Config: Approved Third-Party App Registry. Manage a repository of approved app HTML/URLs. Admins can set building-level defaults for the activeApp property to automatically load a building-mandated web-app—for example, a phonics app for early education centers or a graphing calculator app for the high school.

User Config Modal Defaults: The config modal allows the teacher to select the activeApp from their library.

## 12. Note (text)

Proposed Admin Config: Text size and style can be set in the admin config for each building so when a new widget instance is created by a user, it begins with the default styling.

User Config Modal Defaults: Teachers define the content of the note, the bgColor, and the fontSize.

## 13. PDF Viewer (pdf)

Proposed Admin Config: Upload Restrictions. Set a global maximum file size limit for PDF uploads. Admins can configure a building default where the widget automatically initializes with the activePdfUrl pointing to the building's permanent master bell schedule or campus map.

User Config Modal Defaults: The config modal allows the teacher to select an uploaded document, setting the activePdfId.

## 14. Poll (poll)

Proposed Admin Config: District-Wide Pushed Polls. Build an interface for admins to create a poll that gets forced onto all active dashboards. Admins could push building-specific defaults so the widget starts with an active, building-wide question pre-loaded into the question and options payload (e.g., voting for a building-specific spirit day theme).

User Config Modal Defaults: Teachers input the primary question and construct an array of options.

## 15. QR Code (qr)

Proposed Admin Config: Analytics & UTM Tracking. Configure an automatic URL tracking parameter appender.

User Config Modal Defaults: Teachers input the destination url and toggle syncWithTextWidget.

## 16. Quiz (quiz)

Proposed Admin Config: District Curriculum Repository. Establish a centralized database of approved quizzes that syncs to all users. Admins can establish defaults so the widget initializes in 'import' view mode with a pre-selected folder of building-specific benchmark assessments ready to load based on the user’s selected building.

User Config Modal Defaults: Teachers manage the view state, select the selectedQuizId, and track the activeLiveSessionCode.

## 17. Random (random)

Proposed Admin Config: Pedagogical Constraints. Toggle "elimination mode" on/off globally based on policy. Admins could map visual style defaults to building ages. Elementary defaults to visualStyle: 'wheel' with soundEnabled: true, while High School defaults to visualStyle: 'flash' (a rapid, sleek text generator) with soundEnabled: false.

User Config Modal Defaults: Teachers configure rosterMode, mode, groupSize, visualStyle, and soundEnabled.

## 18. Recess Gear (recessGear)

Proposed Admin Config: Weather-Linked Thresholds. Remove the requirement that a weather widget must be active for this to work and instead pull weather data from the admin weather proxy directly to this widget as well.  Automatically map required gear to the admin weather widget. Since primarily elementary buildings use this, admins can set temperature ranges for specific clothing items (basically take the behavior/logic from the current weather widget config and apply it here, but within the structure of the recess gear widget expectations), and default useFeelsLike to true per building policy.

User Config Modal Defaults: Teachers manually select the linkedWeatherWidgetId to sync with local temperatures and toggle useFeelsLike.

## 19. Record (record - Internal Tool)

Proposed Admin Config: Storage Constraints. Set a hard limit on maximum recording duration and enforce 720p maximum resolution. Admins can configure defaults for the initial API request for getDisplayMedia, defaulting to requesting microphone audio in buildings where asynchronous video lessons are standard, or defaulting to muted in buildings where it's used solely for archiving board notes.

User Config Modal Defaults: Operates externally via browser screen recording APIs.

## 20. Routines (instructionalRoutines)

Proposed Admin Config: Locked Core Routines. Provide a read-only list of foundational instructional steps that cannot be modified. Admins can configure building defaults so the selectedRoutineId automatically populates with the building's required morning or period-transition routine, saving teachers from hunting for it in the library.

User Config Modal Defaults: Teachers select a selectedRoutineId or build customSteps, define the structure, and select the audience.

## 21. Schedule (schedule)

Proposed Admin Config: Default Block Schedules. Allow admins to push predefined Bell Schedules. Admins can set building defaults so the items array is fully populated on instantiation with the building's specific bell schedule (e.g., Period 1, Period 2, Lunch, etc., with exact timestamps), saving the teacher from typing it out daily.

User Config Modal Defaults: Teachers manage an array of items (tasks and times), toggle autoProgress, and select a fontFamily.

## 22. Scoreboard (scoreboard)

Proposed Admin Config: Standardized Teams & Resets. Configure a global reset cron job and push standardized team names. Admins can define defaults for the teams array to automatically load specific building cohorts. A middle school with a "House" system could default to four teams pre-named "Gryffindor, Hufflepuff, Ravenclaw, Slytherin" with their respective hex colors already assigned in the config payload.

User Config Modal Defaults: Teachers build an array of teams, assigning each an id, name, score, and color.

## 23. Seating Chart (seating-chart)

Proposed Admin Config: Classroom Dimensions. Allow admins to limit maximum furniture nodes to match physical fire code capacities. Admins can set defaults for the template to reflect building standards. Elementary might default to the pods template (groups of 4 desks), while High School defaults to the rows template.

User Config Modal Defaults: Teachers select a template, define the gridSize, and map student IDs to assignments.

## 24. Smart Notebook (smartNotebook)

Proposed Admin Config: Data Caps. Define a maximum number of pages or stroke paths per notebook.

User Config Modal Defaults: The config tracks the activeNotebookId selected by the teacher.

## 25. Sound (sound)

Proposed Admin Config: Calibrated Decibel Thresholds. Set global baseline sensitivity thresholds to normalize the noise meter. Admins can set building defaults so the widget instantiates with the visual property set to 'balls' (bouncing balls) for Elementary buildings and 'line' (a waveform monitor) for High School. The sensitivity property would default to a calibrated number matching the building's issued laptops.

User Config Modal Defaults: Teachers adjust sensitivity, pick a visual style, and toggle autoTrafficLight.

## 26. Stickers (stickers / sticker)

Proposed Admin Config: Global Asset Drop. Upload a shared directory of school mascot images or PBIS graphics. Admins can set building defaults where the Sticker Book's initial uploadedUrls array automatically includes URLs to the specific building's mascot, logo, and digital PBIS reward badges, ensuring immediate access to school-branded graphics.

User Config Modal Defaults: For the book, teachers manage uploadedUrls. For individual stickers, settings track url, icon, color, size, and rotation.

## 27. Timer (time-tool)

Proposed Admin Config: Standardized Testing Presets. Lock in official timer durations for standardized state testing. Admins can establish building defaults for the initial duration based on standard transition times (e.g., 300 seconds / 5 mins for High School passing periods). The timerEndTrafficColor could also default to 'red' to enforce a hard stop at zero.

User Config Modal Defaults: Teachers toggle between timer or stopwatch mode, set the duration, pick a selectedSound, and configure actions like timerEndVoiceLevel.

## 28. Traffic Light (traffic)

Proposed Admin Config: Automated Triggers. Create an admin rule permanently binding the Traffic Light widget to the Sound Meter widget based on global decibel limits. Admins could configure building defaults for the widget to always boot up with active: 'green' by default, rather than starting in an off/unlit state, establishing an immediate visual baseline for classroom management.

User Config Modal Defaults: Teachers manually click to set the active state string ('red', 'yellow', or 'green').
