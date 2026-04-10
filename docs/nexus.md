# Nexus: Widget Connection Journal

## Implemented

<!-- Migrated from .Jules/nexus.md on 2026-04-10 -->

### Random Picker → Timer
- **Date**: pre-2026
- **Value**: Automatically starts a timer when a student is selected, enabling timed turn-taking.
- **Status**: implemented
- **Code**: `random/RandomWidget.tsx` checks `autoStartTimer` config and triggers `updateWidget` on the active `time-tool` widget.

### Text Widget → QR Widget
- **Date**: pre-2026
- **Value**: Automatically generates a QR code mirroring any link pasted into a text widget.
- **Status**: implemented
- **Code**: `QRWidget/Widget.tsx` monitors active text widget content and syncs its URL when enabled via "Sync with Text Widget" toggle.

### Weather → Dashboard Background
- **Date**: pre-2026
- **Value**: Automatically changes the dashboard background theme to match current weather conditions.
- **Status**: implemented
- **Code**: `Weather/Widget.tsx` calls `setBackground` on DashboardContext when `syncBackground` is enabled.

### Timer → Traffic Light
- **Date**: pre-2026
- **Value**: Automatically changes the traffic light color when the timer expires, providing a visual cue for transitions.
- **Status**: implemented
- **Code**: `TimeTool/useTimeTool.ts` updates `TrafficLightWidget` via `timerEndTrafficColor` config.

### Randomizer → Scoreboard (Team Builder)
- **Date**: pre-2026
- **Value**: Instantly converts generated random groups into a competitive scoreboard for team activities.
- **Status**: implemented
- **Code**: `random/RandomWidget.tsx` provides a "Send to Scoreboard" button in Groups mode that creates or updates a Scoreboard widget.

### NextUp → Timer
- **Date**: pre-2026
- **Value**: Automatically starts the timer when advancing to the next student, pacing center rotations.
- **Status**: implemented
- **Code**: `NextUp/Widget.tsx` checks `autoStartTimer` config and triggers `updateWidget` on the active `time-tool` widget.

### Timer → Randomizer (Auto-Pick)
- **Date**: pre-2026
- **Value**: Automatically picks the next random student when the timer expires, creating a hands-free rotation loop.
- **Status**: implemented
- **Code**: `TimeTool/useTimeTool.ts` updates the `externalTrigger` config on the active `RandomWidget` via `timerEndTriggerRandom`.

### Timer → NextUp (Auto-Advance)
- **Date**: 2024-05-18
- **Value**: Automatically advances the student queue when the timer ends, enabling fully automated center rotations.
- **Status**: implemented
- **Code**: `TimeTool/useTimeTool.ts` advances the NextUp widget via `timerEndTriggerNextUp` config.

### Webcam (OCR) → Text Widget
- **Date**: 2024-05-22
- **Value**: Converts physical documents captured by webcam into editable digital text on the dashboard.
- **Status**: implemented
- **Code**: `Webcam/Widget.tsx` uses Tesseract.js or Gemini OCR to extract text, then calls `addWidget('text', ...)` to create a new text widget.

### Classes (Roster) → NextUp
- **Date**: 2024-05-23
- **Value**: Populates the NextUp queue from the active class roster with one click.
- **Status**: implemented
- **Code**: `NextUp/Settings.tsx` reads from `rosters` and `activeRosterId` via DashboardContext in `handleImportRoster`.

### Quiz → Scoreboard
- **Date**: 2024-05-24
- **Value**: Converts completed quiz scores into a live or post-quiz scoreboard for competitive review.
- **Status**: implemented
- **Code**: `QuizWidget/utils/quizScoreboard.ts` builds teams from responses; `QuizResults.tsx` sends to scoreboard; `Widget.tsx` supports live sync via `liveScoreboardWidgetId`.

### Calendar → Timer (Event Countdown)
- **Date**: 2024-05-20
- **Value**: Launches a timer that counts down to the start of a calendar event.
- **Status**: implemented
- **Code**: `Calendar/Widget.tsx` has `handleStartTimer` which triggers the time-tool widget with the time remaining until an event.

### Embed → Mini App (AI Generation)
- **Date**: 2024-05-21
- **Value**: Uses AI to generate an interactive mini app based on an embedded resource's content.
- **Status**: implemented
- **Code**: `Embed/Widget.tsx` calls `generateMiniAppCode()` from `utils/ai.ts` and creates a new `miniApp` widget.

### URL Widget → QR Widget
- **Date**: 2024-05-25
- **Value**: Spawns a QR code widget from any link in the URL widget for easy classroom sharing.
- **Status**: implemented
- **Code**: `UrlWidget/Widget.tsx` calls `addWidget('qr', { config: { url: urlItem.url } })` via an inline button.

## Rejected

### Poll → Scoreboard
- **Reason**: Does not add meaningful value; poll results and scores serve different purposes.

### Scoreboard ↔ Randomizer (further automations)
- **Reason**: Beyond the existing Randomizer → Scoreboard team builder, additional bidirectional integrations would overcomplicate both widgets.

## Candidates

<!-- Proposed connections scored and ranked -->

### Schedule → Timer (Auto-Start Block Timer)
- **User story**: "When my schedule shows it's reading time, I want the timer to automatically start for 20 minutes so I don't have to set it manually."
- **Data flow**: Schedule widget emits current block duration (minutes) → Timer widget receives duration and starts countdown.
- **Approach**: Schedule widget checks for active `time-tool` widget on block transition and calls `updateWidget` with duration and `isRunning: true`, same pattern as the existing NextUp → Timer connection.
- **Scores**: Value: 5/5 | Feasibility: 5/5 | Coupling risk: 2/5 | **Total: 8**
- **Status**: proposed

### Noise Meter → Traffic Light (Auto-Color by Volume)
- **User story**: "I want the traffic light to automatically turn red when the classroom gets too loud so students can self-correct."
- **Data flow**: Sound widget emits current decibel level (number) → Traffic widget receives threshold-mapped color (green/yellow/red).
- **Approach**: Sound widget monitors its `currentDb` against configurable thresholds and calls `updateWidget` on the active traffic widget, similar to Timer → Traffic.
- **Scores**: Value: 5/5 | Feasibility: 5/5 | Coupling risk: 2/5 | **Total: 8**
- **Status**: proposed

### Classes (Roster) → Random Picker
- **User story**: "I want the random picker to use my current class roster so I don't have to type every student's name."
- **Data flow**: Classes widget provides student name list (string[]) → Random widget receives names as its pool.
- **Approach**: Random widget settings add an "Import from Roster" button that reads `rosters` and `activeRosterId` from DashboardContext, identical to the existing Classes → NextUp pattern.
- **Scores**: Value: 5/5 | Feasibility: 5/5 | Coupling risk: 1/5 | **Total: 9**
- **Status**: proposed

### Classes (Roster) → Seating Chart
- **User story**: "I want to populate my seating chart directly from my class roster instead of adding each student manually."
- **Data flow**: Classes widget provides student name list (string[]) → Seating chart widget receives student objects for seat assignment.
- **Approach**: Seating chart settings add an "Import from Roster" button reading `rosters` and `activeRosterId` from DashboardContext, same pattern as Classes → NextUp.
- **Scores**: Value: 5/5 | Feasibility: 4/5 | Coupling risk: 1/5 | **Total: 8**
- **Status**: proposed

### Checklist → Timer (Task Timer)
- **User story**: "When I check off a task, I want the timer to auto-start for the next task so transitions happen seamlessly."
- **Data flow**: Checklist widget emits task completion event + next task's optional duration → Timer widget receives duration and starts.
- **Approach**: Checklist widget adds optional per-item duration config; on item check-off, finds the active `time-tool` widget and calls `updateWidget` with next item's duration, following the NextUp → Timer pattern.
- **Scores**: Value: 4/5 | Feasibility: 4/5 | Coupling risk: 2/5 | **Total: 6**
- **Status**: proposed

### Quiz → Concept Web (AI Knowledge Map)
- **User story**: "After a quiz, I want to see which concepts my students struggled with visualized as a concept web so I can plan reteaching."
- **Data flow**: Quiz widget emits question topics + class accuracy data (JSON) → AI generates concept nodes and edges → Concept Web widget receives graph data.
- **Approach**: Quiz results panel adds a "Generate Concept Map" button. Uses `gemini-3.1-flash-lite-preview` to analyze question topics and accuracy rates, then calls `addWidget('concept-web', { config: { nodes, edges } })`.
- **Scores**: Value: 4/5 | Feasibility: 3/5 | Coupling risk: 2/5 | **Total: 5**
- **Status**: proposed

### Timer → Music (Auto-Play/Pause)
- **User story**: "I want background music to automatically start when the work timer begins and stop when it ends."
- **Data flow**: Timer widget emits start/stop events → Music widget receives play/pause commands.
- **Approach**: `useTimeTool.ts` adds `timerStartMusic` and `timerEndMusic` config flags; on timer state change, finds the active music widget and toggles playback via `updateWidget`. Note: `MusicConfig` would need a new `isPlaying` field added to `types.ts` to support this.
- **Scores**: Value: 4/5 | Feasibility: 5/5 | Coupling risk: 2/5 | **Total: 7**
- **Status**: proposed

### Scoreboard → Stickers (Achievement Rewards)
- **User story**: "When a team reaches a score milestone, I want a celebration sticker to automatically appear on the dashboard."
- **Data flow**: Scoreboard widget emits milestone event (team name + score) → Stickers widget spawns a celebratory sticker.
- **Approach**: Scoreboard widget adds configurable milestone thresholds; on threshold hit, calls `addWidget('sticker', { config: { icon: 'celebration' } })` positioned near the scoreboard.
- **Scores**: Value: 3/5 | Feasibility: 4/5 | Coupling risk: 2/5 | **Total: 5**
- **Status**: proposed

### Poll → Graphic Organizer (AI Results Summary)
- **User story**: "After a class poll, I want the results automatically organized into a graphic organizer so we can discuss trends."
- **Data flow**: Poll widget emits question + response data (JSON) → AI generates organizer structure → Graphic Organizer widget receives categorized data.
- **Approach**: Poll results view adds a "Summarize in Organizer" button. Uses `gemini-3.1-flash-lite-preview` to categorize responses, then calls `addWidget('graphic-organizer', { config: { ... } })`.
- **Scores**: Value: 3/5 | Feasibility: 3/5 | Coupling risk: 2/5 | **Total: 4**
- **Status**: proposed

### Weather → Recess Gear
- **User story**: "I want the recess gear recommendations to automatically update based on today's weather so I don't have to configure them separately."
- **Data flow**: Weather widget provides current conditions + temperature (string + number) → Recess Gear widget receives weather context and auto-selects appropriate gear items.
- **Approach**: Recess Gear widget adds a `syncWithWeather` toggle in settings; when enabled, reads weather data from the active weather widget's config in `activeDashboard.widgets` and applies gear mapping rules.
- **Scores**: Value: 4/5 | Feasibility: 4/5 | Coupling risk: 2/5 | **Total: 6**
- **Status**: proposed

### Schedule → Catalyst (AI Lesson Prompt)
- **User story**: "When the schedule shows it's science time, I want the Catalyst widget to automatically suggest relevant discussion prompts."
- **Data flow**: Schedule widget emits current block subject/label (string) → AI generates subject-relevant prompts → Catalyst widget receives prompt suggestions.
- **Approach**: Catalyst widget adds a `syncWithSchedule` toggle; on schedule block change, calls `gemini-3.1-flash-lite-preview` with the subject label to generate 3-5 discussion prompts and updates its own config.
- **Scores**: Value: 4/5 | Feasibility: 3/5 | Coupling risk: 3/5 | **Total: 4**
- **Status**: proposed

### Activity Wall → Hotspot Image (AI-Placed Responses)
- **User story**: "I want student activity wall submissions to appear as pins on a hotspot image so we can see responses spatially organized."
- **Data flow**: Activity Wall widget emits student submissions (text[]) → AI assigns spatial coordinates based on content similarity → Hotspot Image widget receives annotated pins.
- **Approach**: Activity Wall results view adds an "Organize on Image" button. Uses `gemini-3.1-flash-lite-preview` to cluster submissions and assign (x,y) positions, then calls `addWidget('hotspot-image', { config: { hotspots } })`.
- **Scores**: Value: 3/5 | Feasibility: 2/5 | Coupling risk: 3/5 | **Total: 2**
- **Status**: proposed

### Classes (Roster) → Lunch Count
- **User story**: "I want the lunch count widget to know how many students are in my class today so I just pick meal choices, not re-enter the total."
- **Data flow**: Classes widget provides student count for active roster (number) → Lunch Count widget receives total student count as its base number.
- **Approach**: Lunch Count settings add an "Auto-count from Roster" toggle; when enabled, reads `rosters` and `activeRosterId` from DashboardContext to set the total student count, following the same pattern as Classes → NextUp.
- **Scores**: Value: 3/5 | Feasibility: 5/5 | Coupling risk: 1/5 | **Total: 7**
- **Status**: proposed

### Guided Learning → Quiz (AI Assessment Generation)
- **User story**: "After a guided learning session, I want to quickly generate a formative quiz based on the content we just covered."
- **Data flow**: Guided Learning widget emits lesson content/slides (text) → AI generates quiz questions → Quiz widget receives question set.
- **Approach**: Guided Learning results panel adds a "Generate Quiz" button. Uses `gemini-3-flash-preview` (complex task: content analysis + question generation) to produce 5-10 questions from the lesson content. Note: `QuizConfig` currently loads quizzes by ID from Drive, so this would need an `activeQuiz` inline state (similar to `MiniAppConfig`) or save the generated quiz to Drive first, then pass the ID to `addWidget('quiz', ...)`.
- **Scores**: Value: 5/5 | Feasibility: 3/5 | Coupling risk: 2/5 | **Total: 6**
- **Status**: proposed
