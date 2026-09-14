# Nexus: Widget Connection Journal

## Connection Patterns

Every nexus connection follows one or more of four patterns:

1. **Auto-Trigger** -- Widget A detects a state change and automatically updates Widget B's config via `updateWidget(targetId, ...)`. Example: Timer end triggers Traffic Light color change.

2. **Live Sync** -- Widget B continuously watches Widget A's state and mirrors it via a `useEffect`/`useMemo` dependency. Example: QR Widget syncs URL from Text Widget.

3. **Spawn** -- Widget A creates a new Widget B on the dashboard via `addWidget(type, ...)`. Example: Webcam OCR spawns a Text Widget.

4. **Import** -- Widget B pulls data from Widget A on user action (button click). Reads from `activeDashboard.widgets` or DashboardContext rosters. Example: Checklist imports items from Instructional Routines.

---

## Implemented

<!-- Audited 2026-04-10. Total: 36 connections (7 auto-trigger, 5 live sync, 15 spawn, 9 import). -->

### Auto-Trigger Connections

#### Timer → Traffic Light

- **Date**: pre-2026
- **Value**: Automatically changes the traffic light color when the timer expires, providing a visual cue for transitions.
- **Pattern**: Auto-Trigger
- **Code**: `components/widgets/TimeTool/useTimeTool.ts` — config field `timerEndTrafficColor` updates TrafficLightWidget color on timer end.

#### Timer → Expectations

- **Date**: pre-2026
- **Value**: Automatically switches the Expectations widget voice level when the timer ends, cueing students to transition noise levels.
- **Pattern**: Auto-Trigger
- **Code**: `components/widgets/TimeTool/useTimeTool.ts:119-128` — config field `timerEndVoiceLevel` sets `voiceLevel` on the active Expectations widget.

#### Timer → Random (Auto-Pick)

- **Date**: pre-2026
- **Value**: Automatically picks the next random student when the timer expires, creating a hands-free rotation loop.
- **Pattern**: Auto-Trigger
- **Code**: `components/widgets/TimeTool/useTimeTool.ts` — config field `timerEndTriggerRandom` sets `externalTrigger` timestamp on the active RandomWidget.

#### Timer → NextUp (Auto-Advance)

- **Date**: pre-2026
- **Value**: Automatically advances the student queue when the timer ends, enabling fully automated center rotations.
- **Pattern**: Auto-Trigger
- **Code**: `components/widgets/TimeTool/useTimeTool.ts` — config field `timerEndTriggerNextUp` sets `externalTrigger` timestamp on the active NextUp widget.

#### Random → Timer

- **Date**: pre-2026
- **Value**: Automatically starts a timer when a student is selected, enabling timed turn-taking.
- **Pattern**: Auto-Trigger
- **Code**: `components/widgets/random/RandomWidget.tsx` — config field `autoStartTimer` triggers `updateWidget` on the active `time-tool` widget in single-pick mode.

#### NextUp → Timer

- **Date**: pre-2026
- **Value**: Automatically starts the timer when advancing to the next student, pacing center rotations.
- **Pattern**: Auto-Trigger
- **Code**: `components/widgets/NextUp/Widget.tsx:209-237` — config field `autoStartTimer` triggers `updateWidget` on the active `time-tool` widget.

#### Sound → Traffic Light

- **Date**: pre-2026
- **Value**: Automatically changes the traffic light color based on classroom noise level so students can self-correct.
- **Pattern**: Auto-Trigger
- **Code**: `components/widgets/SoundWidget/Widget.tsx:143-176`, `components/widgets/SoundWidget/settings.schema.ts` — config fields `autoTrafficLight` and `trafficLightThreshold` map noise levels to traffic light colors.

### Live Sync Connections

#### Text Widget → QR Widget

- **Date**: pre-2026
- **Value**: Automatically generates a QR code mirroring any link pasted into a text widget.
- **Pattern**: Live Sync
- **Code**: `components/widgets/QRWidget/Widget.tsx:74-93` — config field `syncWithTextWidget` watches the first Text widget and syncs its URL.

#### Weather → Dashboard Background

- **Date**: pre-2026
- **Value**: Automatically changes the dashboard background theme to match current weather conditions.
- **Pattern**: Live Sync
- **Code**: `components/widgets/Weather/Widget.tsx` — config field `syncBackground` calls `setBackground` on DashboardContext.

#### Timer → Music

- **Date**: pre-2026
- **Value**: Automatically plays background music when the work timer starts and pauses when it ends.
- **Pattern**: Live Sync
- **Code**: `components/widgets/MusicWidget/Widget.tsx:92-158`, `components/widgets/MusicWidget/Settings.tsx:202-224` — config field `syncWithTimeTool` watches Timer's `isRunning` state. YouTube stations only.

#### Expectations → Sound

- **Date**: pre-2026
- **Value**: Automatically adjusts noise meter sensitivity based on the current Expectations voice level.
- **Pattern**: Live Sync
- **Code**: `components/widgets/SoundWidget/Widget.tsx:46-82`, `components/widgets/SoundWidget/settings.schema.ts` — config field `syncExpectations` reads Expectations widget's `voiceLevel` (0–4) and maps to sensitivity (5.0–0.5).

#### Weather → Recess Gear

- **Date**: pre-2026
- **Value**: Automatically reads weather data to recommend appropriate recess gear for students.
- **Pattern**: Live Sync
- **Code**: `components/widgets/RecessGear/Widget.tsx:80-98`, `components/widgets/RecessGear/Settings.tsx:53-77` — config field `linkedWeatherWidgetId` reads temperature and conditions from linked or first available Weather widget. Falls back to admin proxy `global_weather/current`.

### Spawn Connections

#### Webcam (OCR) → Text Widget

- **Date**: pre-2026
- **Value**: Converts physical documents captured by webcam into editable digital text on the dashboard.
- **Pattern**: Spawn
- **Code**: `components/widgets/Webcam/Widget.tsx:137-164` — uses `extractTextWithGemini()` or Tesseract.js for OCR, then `addWidget('text', ...)`.

#### Webcam → Text (Send to Notes)

- **Date**: pre-2026
- **Value**: Creates a text widget from captured webcam image content (non-OCR path).
- **Pattern**: Spawn
- **Code**: `components/widgets/Webcam/Widget.tsx:125-135, 203-210` — `handleSendToNotes()` creates a text widget with image data.

#### Drawing → Text (OCR)

- **Date**: pre-2026
- **Value**: Extracts text from whiteboard drawings via Gemini OCR and creates an editable text widget.
- **Pattern**: Spawn
- **Code**: `components/widgets/DrawingWidget/Widget.tsx:282-341` — `handleSendToText()` calls `extractTextWithGemini()` then `addWidget('text', ...)`. Requires `canAccessFeature('gemini-functions')`.

#### Embed → Mini App (AI)

- **Date**: pre-2026
- **Value**: Uses AI to generate an interactive mini app based on an embedded resource's content.
- **Pattern**: Spawn
- **Code**: `components/widgets/Embed/Widget.tsx:153-189` — calls `generateMiniAppCode()` from `utils/ai.ts`, then `addWidget('miniApp', ...)`. Gated by `canAccessFeature('embed-mini-app')`.

#### URL Widget → QR Widget

- **Date**: pre-2026
- **Value**: Spawns a QR code widget from any link in the URL widget for easy classroom sharing.
- **Pattern**: Spawn
- **Code**: `components/widgets/UrlWidget/Widget.tsx:76-97` — inline button calls `addWidget('qr', { config: { url } })`.

#### Random → Scoreboard (Team Builder)

- **Date**: pre-2026
- **Value**: Instantly converts generated random groups into a competitive scoreboard for team activities.
- **Pattern**: Spawn
- **Code**: `components/widgets/random/RandomWidget.tsx:283-303` — "Send to Scoreboard" button creates/updates Scoreboard widget using `sharedGroups` on Dashboard and `linkedGroupId` on teams.

#### Quiz → Scoreboard

- **Date**: pre-2026
- **Value**: Converts completed quiz scores into a live or post-quiz scoreboard for competitive review.
- **Pattern**: Spawn + Live Sync
- **Code**: `components/widgets/QuizWidget/utils/quizScoreboard.ts` builds teams from responses; `components/widgets/QuizWidget/components/QuizResults.tsx` sends to scoreboard; `components/widgets/QuizWidget/Widget.tsx` supports live sync via `liveScoreboardWidgetId`.

#### Calendar → Timer (Event Countdown)

- **Date**: pre-2026
- **Value**: Launches a timer that counts down to the start of a calendar event.
- **Pattern**: Spawn
- **Code**: `components/widgets/Calendar/Widget.tsx:189-218` — `handleStartTimer()` calculates time remaining until event, then `addWidget('time-tool', ...)`.

#### Schedule → Timer (Block Timer)

- **Date**: pre-2026
- **Value**: Launches a timer counting down to the end of the current schedule block.
- **Pattern**: Spawn
- **Code**: `components/widgets/Schedule/ScheduleWidget.tsx:299-324` — `handleStartTimer()` calculates remaining seconds in the block, then `addWidget('time-tool', ...)`.

#### Activity Wall → QR Widget

- **Date**: pre-2026
- **Value**: Spawns a QR code for the activity wall participant URL so students can join easily.
- **Pattern**: Spawn
- **Code**: `components/widgets/ActivityWall/Widget.tsx:837-839` — `spawnQrWidget()` calls `addWidget('qr', ...)` with the session join URL.

#### Blooms Taxonomy → Text Widget

- **Date**: pre-2026
- **Value**: Exports Bloom's tier content as a formatted text widget for lesson planning or display.
- **Pattern**: Spawn
- **Code**: `components/widgets/BloomsTaxonomy/Widget.tsx:165` — calls `addWidget('text', ...)` with tier content.

#### Blooms Taxonomy → Stickers (Drag)

- **Date**: pre-2026
- **Value**: Allows dragging a Bloom's tier to create a sticker widget for visual classroom display.
- **Pattern**: Spawn (drag)
- **Code**: `components/widgets/BloomsTaxonomy/Widget.tsx:177-188` — drag handler sets `application/sticker` data; `components/widgets/BloomsTaxonomy/Pyramid.tsx:68` enables draggable.

#### Instructional Routines → Text Widget

- **Date**: pre-2026
- **Value**: Exports routine steps as a formatted text widget for display or sharing.
- **Pattern**: Spawn
- **Code**: `components/widgets/InstructionalRoutines/Widget.tsx:617` — calls `addWidget('text', ...)` with routine step content.

#### Instructional Routines → Stickers

- **Date**: pre-2026
- **Value**: Spawns sticker widgets from routine steps for visual anchoring on the dashboard.
- **Pattern**: Spawn
- **Code**: `components/widgets/InstructionalRoutines/Widget.tsx:373` — calls `addWidget('sticker', ...)`.

#### Expectations → Stickers

- **Date**: pre-2026
- **Value**: Launches sticker widgets from voice level or group expectation icons for visual classroom display.
- **Pattern**: Spawn
- **Code**: `components/widgets/ExpectationsWidget/Widget.tsx:129-130` — `handleLaunchSticker()` calls `addWidget('sticker', ...)` with icon, label, and color.

### Import Connections

#### Classes (Roster) → NextUp

- **Date**: pre-2026
- **Value**: Populates the NextUp queue from the active class roster with one click.
- **Pattern**: Import
- **Code**: `components/widgets/NextUp/Settings.tsx` — `handleImportRoster()` reads from `rosters` and `activeRosterId` via DashboardContext.

#### Classes (Roster) → Random

- **Date**: pre-2026
- **Value**: Populates the Random widget's student pool from the active class roster.
- **Pattern**: Import
- **Code**: `components/widgets/random/settings.schema.ts` — config field `rosterMode: 'class'` via the schema `rosterPicker` field.

#### Classes (Roster) → Seating Chart

- **Date**: pre-2026
- **Value**: Populates the seating chart from the active class roster.
- **Pattern**: Import
- **Code**: `components/widgets/SeatingChart/Settings.tsx:44-50` — config field `rosterMode: 'class'` via `RosterModeControl` component.

#### Classes (Roster) → Lunch Count

- **Date**: pre-2026
- **Value**: Sets the lunch count total from the active class roster size.
- **Pattern**: Import
- **Code**: `components/widgets/LunchCount/Settings.tsx:49-65` — config field `rosterMode: 'class'` via `RosterModeControl` component.

#### Classes (Roster) → Checklist

- **Date**: pre-2026
- **Value**: Populates checklist items from student names in the active class roster.
- **Pattern**: Import
- **Code**: `components/widgets/Checklist/settings.schema.ts` — config field `rosterMode: 'class'` via the schema `rosterPicker` field.

#### Classes (Roster) → Poll

- **Date**: pre-2026
- **Value**: Populates poll options from student names in the active class roster.
- **Pattern**: Import
- **Code**: `components/widgets/PollWidget/Settings.tsx:56-80` — `importFromRoster()` maps active roster students to poll options.

#### Instructional Routines → Checklist

- **Date**: pre-2026
- **Value**: Imports routine steps as checklist items for tracking completion during a lesson.
- **Pattern**: Import
- **Code**: `components/widgets/Checklist/settingsFields.tsx` — `importRoutine()` reads `customSteps` from the active Instructional Routines widget into the Checklist.

#### Text Widget → Checklist

- **Date**: pre-2026
- **Value**: Imports text widget content as checklist items, splitting lines into individual tasks.
- **Pattern**: Import
- **Code**: `components/widgets/Checklist/settingsFields.tsx` — `importText()` finds Text widgets and parses HTML to plain text lines into Checklist items.

#### Text Widget → MiniApp (Import from Notes)

- **Date**: pre-2026
- **Value**: Uses text widget content as the AI prompt seed for mini app generation.
- **Pattern**: Import
- **Code**: `components/widgets/MiniApp/components/MiniAppEditor.tsx:67-109` — `importFromNotes()` finds the longest Text widget and uses its content as the MiniApp generation prompt.

---

## Rejected

### Poll → Scoreboard

- **Reason**: Does not add meaningful value; poll results and scores serve different purposes.

### Scoreboard ↔ Random (further automations)

- **Reason**: Beyond the existing Random → Scoreboard team builder, additional bidirectional integrations would overcomplicate both widgets.

### Weather → Recess Gear (push direction)

- **Reason**: Already implemented as Weather → Recess Gear (via `linkedWeatherWidgetId` — Recess Gear reads Weather config). A separate push-based connection from Weather would duplicate the existing Live Sync data path.

---

## Candidates

<!-- Proposed connections scored and ranked. Total = Value + Feasibility - Coupling risk. -->

### Quiz → Graphic Organizer (AI Misconception Map)

- **User story**: "After a quiz, I want student misconceptions organized into a graphic organizer so I can see patterns and plan reteaching."
- **Data flow**: Quiz responses (wrong answers + question topics) → Gemini analyzes patterns → GraphicOrganizer widget receives categorized misconceptions.
- **Approach**: Quiz results panel adds "Analyze Misconceptions" button. Uses `generateWithAI` with type `'quiz-analysis'` to cluster wrong answers by topic. Calls `addWidget('graphic-organizer', { config: { templateType: 'cause-effect', nodes: { ... } } })`. Valid layout types: `'frayer'`, `'t-chart'`, `'venn'`, `'kwl'`, `'cause-effect'`. Nodes are `Record<string, OrganizerNode>`.
- **Infrastructure**: `generateQuiz()` and GraphicOrganizer widget both exist. Only needs a new prompt type in the Cloud Function. AI output must conform to `GraphicOrganizerConfig` in `types.ts`.
- **Scores**: Value: 5/5 | Feasibility: 4/5 | Coupling risk: 2/5 | **Total: 7**
- **Pattern**: Spawn (AI-generated)
- **Status**: proposed

### Text Widget → Concept Web (AI Concept Extraction)

- **User story**: "I paste my lesson notes into a text widget and want to auto-generate a concept web showing key ideas and their relationships."
- **Data flow**: Text widget content (HTML/text) → Gemini extracts concepts and relationships → ConceptWeb widget receives nodes and edges.
- **Approach**: ConceptWeb settings adds "Import from Notes" button (matches the existing Text Widget → MiniApp import pattern). Uses `generateWithAI` with type `'concept-extraction'` to produce `{ nodes: [{id, label, x, y}], edges: [{from, to, label}] }`. Calls `addWidget('concept-web', { config: { nodes, edges } })`.
- **Infrastructure**: Both widgets exist. Pattern matches the existing Text Widget → MiniApp import flow (`components/widgets/MiniApp/components/MiniAppEditor.tsx:importFromNotes`).
- **Scores**: Value: 5/5 | Feasibility: 4/5 | Coupling risk: 2/5 | **Total: 7**
- **Pattern**: Import (AI-enhanced)
- **Status**: proposed

### Checklist → Timer (Task Timer)

- **User story**: "When I check off a task, I want the timer to auto-start for the next task so transitions happen seamlessly."
- **Data flow**: Checklist widget emits task completion event + next task's optional duration → Timer widget receives duration and starts.
- **Approach**: Checklist widget adds optional per-item `duration` field; on item check-off, finds the active `time-tool` widget and calls `updateWidget` with next item's duration. Follows the NextUp → Timer pattern exactly.
- **Infrastructure**: `ChecklistItem` in `types.ts` needs `duration?: number`. No AI needed.
- **Scores**: Value: 4/5 | Feasibility: 5/5 | Coupling risk: 2/5 | **Total: 7**
- **Pattern**: Auto-Trigger
- **Status**: proposed

### Guided Learning → Quiz (AI Assessment Generation)

- **User story**: "After a guided learning session, I want to quickly generate a formative quiz based on the content we just covered."
- **Data flow**: Guided Learning widget emits lesson content/slides (text) → AI generates quiz questions → Quiz widget receives question set.
- **Approach**: Guided Learning results panel adds a "Generate Quiz" button. Uses existing `generateQuiz()` from `utils/ai.ts` with lesson step content as prompt. Saves generated quiz to Firestore via `useQuiz` hook, then optionally spawns a Quiz widget.
- **Infrastructure**: `generateQuiz()` exists. Main complexity: Quiz currently loads by Drive/Firestore ID, so generated quiz needs to be saved first.
- **Scores**: Value: 5/5 | Feasibility: 3/5 | Coupling risk: 2/5 | **Total: 6**
- **Pattern**: Spawn (AI-generated)
- **Status**: proposed

### Video Activity → Guided Learning (AI Scene Hotspots)

- **User story**: "After creating a video activity, I want to generate a guided learning experience from key video frames so students can explore scenes interactively."
- **Data flow**: Video Activity timestamps + YouTube URL → Gemini extracts key frames → GuidedLearning widget receives image + hotspot steps.
- **Approach**: Video Activity results panel adds "Create Guided Learning" button. Captures screenshots at question timestamps. Uses existing `generateGuidedLearning()` to create interactive hotspot steps.
- **Infrastructure**: Both `generateVideoActivity()` and `generateGuidedLearning()` exist. Chains two existing AI capabilities.
- **Scores**: Value: 5/5 | Feasibility: 3/5 | Coupling risk: 2/5 | **Total: 6**
- **Pattern**: Spawn (AI-generated)
- **Status**: proposed

### Webcam/Drawing → Guided Learning (AI Image-to-Lesson)

- **User story**: "I captured a photo of a textbook diagram. I want to automatically generate a guided learning experience from it."
- **Data flow**: Webcam/Drawing widget provides captured image → `generateGuidedLearning(imageBase64, mimeType)` → Guided Learning widget receives step data.
- **Approach**: Webcam/Drawing widget adds "Send to Guided Learning" button. Calls existing `generateGuidedLearning()` with captured image data. Saves via `useGuidedLearning` hook and spawns widget.
- **Infrastructure**: `generateGuidedLearning()` already accepts base64 images. Webcam/Drawing already capture images. Minimal new code — mostly wiring.
- **Scores**: Value: 4/5 | Feasibility: 5/5 | Coupling risk: 1/5 | **Total: 8**
- **Pattern**: Spawn (AI-generated)
- **Status**: proposed

### Scoreboard → Stickers (Achievement Rewards)

- **User story**: "When a team reaches a score milestone, I want a celebration sticker to automatically appear on the dashboard."
- **Data flow**: Scoreboard widget emits milestone event (team name + score) → Stickers widget spawns a celebratory sticker.
- **Approach**: Scoreboard widget adds configurable milestone thresholds; on threshold hit, calls `addWidget('sticker', { config: { icon: 'celebration' } })` positioned near the scoreboard. Pattern matches Expectations → Stickers.
- **Scores**: Value: 3/5 | Feasibility: 4/5 | Coupling risk: 2/5 | **Total: 5**
- **Pattern**: Spawn (threshold-triggered)
- **Status**: proposed

### Quiz → Concept Web (AI Knowledge Map)

- **User story**: "After a quiz, I want to see which concepts my students struggled with visualized as a concept web so I can plan reteaching."
- **Data flow**: Quiz widget emits question topics + class accuracy data (JSON) → AI generates concept nodes and edges → Concept Web widget receives graph data.
- **Approach**: Quiz results panel adds a "Generate Concept Map" button. Uses Gemini to analyze question topics and accuracy rates, then calls `addWidget('concept-web', { config: { nodes, edges } })`.
- **Scores**: Value: 4/5 | Feasibility: 3/5 | Coupling risk: 2/5 | **Total: 5**
- **Pattern**: Spawn (AI-generated)
- **Status**: proposed

### Schedule → Catalyst (AI Lesson Prompt)

- **User story**: "When the schedule shows it's science time, I want the Catalyst widget to automatically suggest relevant discussion prompts."
- **Data flow**: Schedule widget emits current block subject/label (string) → AI generates subject-relevant prompts → Catalyst widget receives prompt suggestions.
- **Approach**: Catalyst widget adds a `syncWithSchedule` toggle; on schedule block change, calls Gemini with the subject label to generate 3-5 discussion prompts and updates its own config. **Note**: `CatalystConfig` currently only has `initialSetId` — this candidate requires expanding the interface with new fields (e.g., `syncWithSchedule`, `generatedPrompts`).
- **Scores**: Value: 4/5 | Feasibility: 3/5 | Coupling risk: 3/5 | **Total: 4**
- **Pattern**: Live Sync (AI-enhanced)
- **Status**: proposed

### Poll → Graphic Organizer (AI Results Summary)

- **User story**: "After a class poll, I want the results automatically organized into a graphic organizer so we can discuss trends."
- **Data flow**: Poll widget emits question + response data (JSON) → AI generates organizer structure → Graphic Organizer widget receives categorized data.
- **Approach**: Poll results view adds a "Summarize in Organizer" button. Uses Gemini to categorize responses, then calls `addWidget('graphic-organizer', { config: { ... } })`.
- **Scores**: Value: 3/5 | Feasibility: 3/5 | Coupling risk: 2/5 | **Total: 4**
- **Pattern**: Spawn (AI-generated)
- **Status**: proposed

### Activity Wall → Hotspot Image (AI-Placed Responses)

- **User story**: "I want student activity wall submissions to appear as pins on a hotspot image so we can see responses spatially organized."
- **Data flow**: Activity Wall widget emits student submissions (text[]) → AI assigns spatial coordinates based on content similarity → Hotspot Image widget receives annotated pins.
- **Approach**: Activity Wall results view adds an "Organize on Image" button. Uses Gemini to cluster submissions and assign (x,y) positions, then calls `addWidget('hotspot-image', { config: { baseImageUrl, hotspots } })`. **Note**: `HotspotImageConfig` requires `baseImageUrl` — the teacher would need to select a base image first, or AI would generate/select one.
- **Scores**: Value: 3/5 | Feasibility: 2/5 | Coupling risk: 3/5 | **Total: 2**
- **Pattern**: Spawn (AI-generated)
- **Status**: proposed
