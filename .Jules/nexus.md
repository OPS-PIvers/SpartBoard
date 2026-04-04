# Nexus: Inter-Widget Communication

Nexus is the system that allows widgets to interact with each other, creating a cohesive classroom ecosystem.

## Active Connections

### Random Picker -> Timer

**Description:** Automatically starts a timer when a student/winner is selected.
**Implementation:** `RandomWidget.tsx` checks for `autoStartTimer` config and triggers `updateWidget` on any active `time-tool` widget.
**Configuration:** Enabled via the "Auto-Start Timer" toggle in Random Widget settings (Single mode only).

### Text Widget -> QR Widget (Link Repeater)

**Description:** Automatically generates a QR code for any link pasted into a text widget.
**Implementation:** `QRWidget.tsx` monitors the content of any active text widget and updates its URL if syncing is enabled.
**Configuration:** Enabled via the "Sync with Text Widget" toggle in QR Settings.

### Weather Widget -> Dashboard Background

**Description:** Automatically changes the dashboard background theme to match the current weather conditions (e.g., Blue gradient for Sunny, Dark gradient for Rainy).
**Implementation:** `WeatherWidget.tsx` monitors the `condition` state and calls `setBackground` on the dashboard context when `syncBackground` is enabled.
**Configuration:** Enabled via the "Sync Background" toggle in Weather Settings.

### Timer -> Traffic Light

**Description:** Automatically changes the traffic light color when the timer ends.
**Implementation:** `TimeToolWidget.tsx` (via `useTimeTool.ts`) monitors the timer completion and updates the `TrafficLightWidget` if `timerEndTrafficColor` is set.
**Configuration:** Enabled via the "Traffic Light Control" section in Time Tool Settings.

### Randomizer -> Scoreboard (Team Builder)

**Description:** Instantly turns generated random groups into a competitive scoreboard.
**Implementation:** `RandomWidget.tsx` provides a "Send to Scoreboard" button when groups are generated. It updates or creates a Scoreboard widget with the groups as teams.
**Configuration:** Manual trigger via button in Randomizer (Groups mode).

### NextUp -> Timer

**Description:** Automatically starts the timer when advancing to the next student.
**Implementation:** `NextUpWidget.tsx` checks for the `autoStartTimer` config. If enabled, advancing a student finds the active `time-tool` widget in the dashboard context and triggers `updateWidget` to start it and reset the start time.
**Configuration:** Enabled via the "Auto-Start Timer" toggle in NextUp Settings.

### Timer -> Randomizer (Auto-Rotation Loop)

**Description:** Automatically triggers the Randomizer to pick the next student the moment the timer runs out.
**Implementation:** `TimeToolWidget.tsx` (via `useTimeTool.ts`) updates the `externalTrigger` config of the active `RandomWidget` when the timer reaches 0 if `timerEndTriggerRandom` is set.
**Configuration:** Enabled via the "Auto-Pick Random Student" toggle in Time Tool Settings.

## 2024-05-18 - [Auto-Rotation Loop] **Source:** Timer (Time Tool) **Destination:** NextUp Widget **Value:** Automates center rotations by advancing the student queue when the timer ends.

## 2024-05-22 - [OCR to Notes] **Source:** Webcam **Destination:** Text **Value:** Instantly converts physical documents into editable digital text on the dashboard.

## 2024-05-23 - [Roster to Queue] **Source:** Classes (Roster) **Destination:** NextUp **Value:** Allows teachers to instantly populate the NextUp queue with their active class roster.

## 2024-05-24 - [Quiz to Scoreboard] **Source:** Quiz **Destination:** Scoreboard **Value:** Instantly converts completed quiz scores into a competitive scoreboard for post-quiz review.

## Planned Connections

## WILL NOT IMPLEMENT

- **Poll -> Scoreboard:** this is not a connection that adds meaningful value.
- **Scoreboard & Randomizer (additional automations):** Beyond the existing _Randomizer -> Scoreboard (Team Builder)_ handoff documented above, we do not plan further automatic or bi-directional integrations between these widgets, to maintain their simplicity.

## 2024-05-20 - [Event Countdown] **Source:** Calendar **Destination:** Timer (Time Tool) **Value:** Launches a timer that counts down to the start of a calendar event.

## 2024-05-21 - [Generate Mini App] **Source:** Embed **Destination:** Mini App **Value:** Automatically generates an interactive mini app based on an embedded resource.

## 2024-05-25 - [URL to QR] **Source:** URL Widget **Destination:** QR Widget **Value:** Spawns a QR widget using the URL of an item in the URL widget.
