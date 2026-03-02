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

## Planned Connections

## WILL NOT IMPLEMENT

- **Poll -> Scoreboard:** this is not a connection that adds meaningful value.
