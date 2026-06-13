# Remote Control v2 — Design Spec

_Date: 2026-06-13. Owner: Paul Ivers. Status: approved design, pre-implementation._

## Goal & constraint

Make the existing remote-control feature (`spartboard.web.app/remote`) feel
production-quality rather than a prototype, **scoped to be live and stable for
a presentation on Tuesday 2026-06-16**. The presentation use is **live board
control**: Paul drives widgets from his phone while the audience watches the
projected board. Therefore the priorities, in order, are:

1. **Latency** — tap-to-board delay the audience can see.
2. **Reliability + feedback** — never silently drift or drop a command on stage.
3. **Polish + targeted new capability** — the specific widgets Paul will drive.

Breadth of widget coverage is explicitly NOT a priority (he isn't walking
through every feature; he's running a session).

## Current state (as explored 2026-06-13)

- Route `/remote?boardId=<id>` → `MobileRemoteView`
  (`components/remote/MobileRemoteView.tsx`), wrapped in the same provider
  stack as the dashboard (DialogProvider → AuthProvider → CustomWidgets →
  SavedWidgets → DashboardProvider). Requires the same Firebase login.
- Transport: remote calls `updateWidget`/`updateDashboardSettings`; writes go
  through `DashboardContext`'s debounced auto-save
  (`context/DashboardContext.tsx` ~L2223–2286): **100ms** settings-only,
  **200ms** structural, **800ms** config/position. Desktop reflects changes via
  an `onSnapshot` listener. Observable tap-to-board latency ~200–1500ms.
- The remote keeps a LOCAL copy of widget state and only refreshes from context
  on a manual **Sync** button tap; a 5s per-widget `pendingWidgetTimers` guard
  prevents echo-reversion of in-flight edits.
- 15 widget control types exist in `components/remote/controls/`
  (timer, scoreboard, dice, random, traffic, clock, checklist, poll,
  expectations, schedule, breathing, music, nextUp, sound, webcam). ~45 other
  widget types show a "use Spotlight/Full Screen" placeholder.
- Permissions: `remote-control` global feature (default-public) + an
  account-level `remoteControlEnabled` preference. Both default on.
- Tests: only `RemoteControlMenu.test.tsx` (URL/QR). No coverage of
  `MobileRemoteView`, the control components, or sync behavior.

Demo widgets Paul will drive: timer/stopwatch, traffic, poll, noise (sound),
schedule, clock (all already supported → benefit from latency/reliability/
polish), plus **Embed/slide deck** and **Activity Wall** (NOT currently
remote-controllable → new work).

## Design

### 1. Latency fix — intent-aware write path

Remote-originated control actions (start/pause/reset timer, ±score, reveal
poll, advance NextUp, toggle traffic, etc.) currently change widget `config`
and therefore inherit the 800ms config debounce before the write even leaves
the phone. That client-side debounce — not Firestore — is the dominant latency.

**Change:** add a fast-path so remote-originated _control_ writes flush to
Firestore immediately (bypass the debounce), reusing the existing Firestore
transport (no new channel/collection). Structural and position writes keep
their current debounce. Mechanism: an explicit `{ immediate: true }`-style
flag (or equivalent intent classification) threaded from the remote control
call sites through `updateWidget` to the save scheduler, so the change is
additive and desktop-side behavior is untouched.

Expected result: ~300–500ms tap-to-board (Firestore round-trip only), which
reads as "instant" when projected.

**Risk control:** additive flag; default path unchanged. Covered by tests that
assert control writes are scheduled immediately while structural writes remain
debounced, plus a live two-device check.

### 2. Live two-way sync + reliability UI

- **Live sync:** stop requiring the manual Sync tap. `MobileRemoteView`
  reflects the live `DashboardContext` snapshot it already receives (it is
  inside `DashboardProvider`), retaining the 5s pending-write guard so Paul's
  own in-flight edits aren't echoed back. The Sync button may remain as a
  manual "force refresh" affordance but is no longer required for correctness.
- **Connection status chip:** persistent indicator — "Connected" /
  "Reconnecting…" — driven by Firestore connection/snapshot state.
- **Last-synced indicator:** subtle timestamp/"updated just now".
- **Tap feedback:** brief press-confirm state on control buttons so a command
  visibly registers even before the board reflects it.

### 3. Activity Wall remote control (new)

New `components/remote/controls/RemoteActivityWallControl.tsx`:

- Toggle the wall **active/paused**.
- **Show/hide the join QR** (drive the existing QR/popout affordance).
- **Moderation — GUARANTEED in scope.** Approve pending submissions and
  remove/hide submissions from the phone. This reuses the widget's existing
  writes (verified 2026-06-13): live submissions are a Firestore subcollection
  with `status: 'approved' | 'pending'`; `Widget.tsx` already approves via a
  `setDoc` status→`approved` (~L872) and removes via `deleteDoc` (~L1212), and
  tracks approved/pending counts (~L1099). The remote control adds a listener
  on that submissions subcollection (path `{teacherUid}_{activityId}`) to show
  the pending queue and a count badge, then fires the same approve/remove
  writes. This is the core audience-engagement loop: attendees submit, Paul
  approves live from his phone, the board updates.
- Register `activityWall` (confirm the exact widget type id in
  `WidgetRegistry`/`REMOTE_SUPPORTED_TYPES`) into the remote supported list.
- Respects the `anonymous-join` gate shipped 2026-06-13: if the teacher can't
  offer the anonymous link, the QR/show-link affordance hides cleanly.

### 4. Embed control

- **Guaranteed:** spotlight/swap from the phone — feature the embed
  full-screen / make it the active widget. This is the fallback and ships
  regardless.
- **Stretch spike (do early, timeboxed):** assess whether slide next/prev is
  reliably drivable for Paul's specific deck — e.g. a Google Slides
  published-to-web embed navigated by updating the iframe `src` `?slide=`
  index. Acceptance: smooth and reliable when projected. If it passes, wire a
  prev/next control; if not, keep spotlight/swap and drop the slide nav with no
  other impact.

### 5. UI/UX polish (demo path only)

Tighten the controls Paul will use (timer, traffic, poll, noise, schedule,
clock, activity wall): larger/clearer tap targets, consistent
dark-on-projector styling, clearer active/selected states, tap feedback from
§2. No full visual redesign; focused polish on the demo path.

## Testing

- Unit: write-classification (control writes immediate vs structural debounced);
  `RemoteActivityWallControl` behavior (pending-queue listener renders pending
  submissions; approve fires status→approved; remove fires deleteDoc; count
  badge); `MobileRemoteView` live-sync reflection (snapshot updates appear
  without manual Sync; pending-guard still suppresses echo).
- **Manual two-device smoke test** (phone + projected board) is the real
  acceptance gate before Tuesday — delivered as a checklist covering each demo
  widget, the latency feel, connection-drop/reconnect, and the Embed path.

## Out of scope (deferred — not Tuesday)

Broad remote coverage for the other ~45 widgets; code/QR pairing handshake;
offline write queue + Firestore offline persistence; multi-remote (phone A ↔
phone B) sync; the deeper transport rebuild (e.g. dedicated low-latency
channel/RTDB). These are candidates for a follow-up once the demo-critical path
is solid.

## Rollout

Work on `dev-paul` → dev preview for two-device testing → PR to `main` and
deploy **before** Tuesday's presentation. Remote control is default-public, so
no admin config is required to demo.
