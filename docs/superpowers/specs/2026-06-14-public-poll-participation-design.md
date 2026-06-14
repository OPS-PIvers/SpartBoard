# Public Poll Participation — Design Spec

_Date: 2026-06-14 (design). Decisions locked 2026-06-13. Owner: Paul Ivers.
Status: **APPROVED — building now** (originally a post-Tuesday follow-up; promoted
at the owner's request). Own branch off `main`._

## Goal

Give the **Poll** widget a public, audience-facing participation flow like the
Activity Wall has: a copyable/scannable link that lets participants vote from
their own devices, with live tallies reflected on the projected board and a
"Show Join QR" affordance on the teacher remote. One vote per participant
device, anonymous (no sign-in).

## Why this is a real feature, not a wire-in

The Activity Wall remote control shipped quickly in v2 because its **entire
participant side already existed** — `/activity-wall/...` route,
`ActivityWallStudentApp`, the `activity_wall_sessions/{uid}_{activityId}/submissions`
subcollection, and Firestore rules. v2 only added the teacher remote control on
top.

Poll has **none** of that participant infrastructure (verified 2026-06-13):

- No `/poll` participant route in `App.tsx`.
- No `PollVoteApp` / participant component (only the dashboard widget, the admin
  panel, and `RemotePollControl`).
- The only shared-vote storage is `pollVotes` nested under
  `/announcements/{id}/` — tied to the announcement system, not a standalone poll
  session.

So this builds the participant side from scratch, reusing **patterns** (not
plumbing) from Activity Wall: the `?data=<base64>` join-link encoding, anonymous
join, the live-tally Firestore listener shape, and the QR panel. Scope is
comparable to the original Activity Wall participant build — roughly a focused
day with tests + rules.

## Current Poll model (for reference)

- `PollWidget` (`components/widgets/PollWidget/Widget.tsx`): `PollConfig` is
  `{ question, options[] }`, where `PollOption` is `{ id, label, votes }` (note:
  options carry an `id`). Votes are stored either **locally in widget config**
  (teacher-driven tally, adjusted on-board or via `RemotePollControl` ±/reset) or
  — when embedded in an announcement (`config._announcementId`) — in
  `/announcements/{id}/pollVotes/{optionIndex}` as `{ count }`, shared live via
  `onSnapshot` + `increment`.
- `RemotePollControl` only does manual ±/reset of tallies; no link/QR.

## Locked decisions (2026-06-13)

1. **Tally mode = replace-when-live.** Manual ± is the default. While a public
   session is active, the board switches to live device tallies and manual ±
   click-to-vote is disabled; it returns when voting stops.
2. **Voter view = live results.** After voting, the participant sees a "your vote
   is in" confirmation with the live aggregated tally (subscribes to the votes
   subcollection). A voter may change their vote (overwrite) until voting closes.
3. **Re-open = Resume/Restart popover.** Starting voting on a poll that already
   has a prior session prompts the teacher: **Resume previous** (reuse session id
   - prior votes) or **Restart** (fresh session id, prior votes abandoned).
4. **Link encoder centralized.** A single `components/poll/pollLink.ts` is shared
   by widget + remote + participant app (Activity Wall duplicated its encoder
   across two files; we do not repeat that).
5. **Votes subcollection is openly readable** by any authenticated user
   (incl. anonymous). Vote docs are anonymous (`{ optionIndex, votedAt }`, keyed
   by anonymous uid) so they carry no PII — this is what makes live results work
   and matches the spec's stated privacy bar.
6. **Start/stop is server-enforced** via an `active` flag on the session doc, so
   "stop voting" actually blocks new writes (not just a UI affordance).

## Design

### 1. Session identity

`PollConfig` gains:

- `activePollSessionId?: string | null` — non-null = voting is **live**. This id
  is the `:pollId` in the route and the `{pollId}` half of the collection key.
- `lastPollSessionId?: string | null` — remembers the previous session so
  "Resume" can reuse it.

Route: `/poll/:pollId` · Collection:
`poll_sessions/{teacherUid}_{pollId}/votes/{participantUid}`.

**Start/stop state machine** (driven from widget _and_ remote; the teacher is a
non-anonymous authed user in both surfaces):

- **Start**, no prior session → mint a fresh uuid → `activePollSessionId = uuid`;
  write session doc `active: true`.
- **Start**, prior session exists → show the **Resume/Restart popover**. Resume →
  reuse `lastPollSessionId` (set `active: true` on its doc); Restart → fresh uuid
  - new session doc.
- **Stop** → `lastPollSessionId = activePollSessionId`, `activePollSessionId =
null`, session doc `active: false`.

### 2. Participant route + app

- New route in `App.tsx`: `isPollRoute` (`/poll` or `/poll/...`), rendered like
  the Activity Wall branch — `DialogProvider` + `StudentIdleTimeoutGuard` + a lazy
  `PollVoteApp`, **outside** `AuthProvider`.
- New `components/poll/PollVoteApp.tsx`: decodes the `?data=` payload, signs in
  anonymously (`signInAnonymously`), renders the options as large vote buttons
  (dark, mobile-first styling like `ActivityWallStudentApp`), casts one vote, then
  shows a "thanks / your vote is in" confirmation with the live tally. Re-tapping
  a different option overwrites the prior vote until voting closes.

### 3. Join link encoding (centralized)

`components/poll/pollLink.ts`:

- `encodePollData(poll, sessionId, teacherUid)` → base64-of-JSON via
  `btoa(TextEncoder→binary)` + `encodeURIComponent`, mirroring Activity Wall's
  shape exactly (so the decode side can be a straight port).
- `buildPublicPollLink(...)` →
  `${origin}/poll/${sessionId}?data=${encoded}`.
- A decode helper used by `PollVoteApp`.
- Payload kept minimal — `{ id: sessionId, question, options: [{ id, label }],
teacherUid }` — so the participant app renders without a Firestore read of the
  poll config.

### 4. Vote storage + one-vote-per-device

- New collection: `poll_sessions/{teacherUid}_{pollId}/votes/{participantUid}`,
  doc `{ optionIndex: number, votedAt: number }`. Using the anonymous
  participant's `uid` as the **doc id** enforces one vote per device/session
  naturally (re-voting overwrites). Cleaner than `increment` counters for dedup.
- Session doc `poll_sessions/{teacherUid}_{pollId}` = `{ id, teacherUid,
optionCount, active, updatedAt }`, written by the teacher on start/stop.
- Live tally: the dashboard `PollWidget` and the participant confirmation screen
  subscribe to the `votes` subcollection and aggregate counts per `optionIndex`
  client-side. This is a NEW read path for the widget — a third "session-backed"
  mode keyed on `activePollSessionId`, alongside the existing local-config and
  announcement modes.

### 5. Widget-side (teacher) changes

- `PollWidget` (`Widget.tsx` + `Settings.tsx`): when `activePollSessionId` is set,
  subscribe to the votes subcollection, aggregate per `optionIndex`, and render
  those bars **instead of** config votes (replace-when-live); disable manual
  click-to-vote and ± while live. When live + `canAccessFeature('anonymous-join')`,
  show a compact "Scan to vote" QR + copyable link on the board. Add the
  Start/Stop control and the Resume/Restart popover.
- Public voting is **dashboard-widget only**: the announcement-backed mode
  (`_announcementId`) and the existing local manual mode are left untouched.

### 6. Remote control

- Extend `RemotePollControl` with a "Show Join QR" panel (same component shape as
  `RemoteActivityWallControl`'s QR panel — `qrserver.com` `<img>`, gated by
  `anonymous-join`) plus a Start/Stop-voting toggle with the same Resume/Restart
  popover and live aggregated tallies while running. Keep the existing ±/reset
  tally controls for the manual (not-live) mode.

### 7. Firestore rules

New rules for `poll_sessions/{sessionId}` and its `votes/{participantUid}`
subcollection, modeled on `activity_wall_sessions`:

- Session doc: read for any authed user; create/update only by a non-anonymous
  teacher whose uid matches `{sessionId}` prefix (`sessionId.matches(uid + '_.*')`)
  or admin; no client delete.
- `votes/{participantUid}`: create/update only when `request.auth.uid ==
participantUid`, `optionIndex` is an int within range (range-checked against the
  session doc's `optionCount`), `votedAt` is an int, keys limited to
  `[optionIndex, votedAt]`, and the session is `active == true`. Read open to any
  authed user (anonymous tallies, no PII). Delete (reset) by teacher
  (`sessionId.matches(uid + '_.*')`) or admin.

## Reuse map (Activity Wall → Poll)

| Activity Wall                                                   | Poll equivalent                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| `/activity-wall/:id` route + `ActivityWallStudentApp`           | `/poll/:pollId` route + `PollVoteApp`                          |
| `encodeActivityData` / `buildPublicActivityLink` (duplicated)   | `pollLink.ts` (`encodePollData`/`buildPublicPollLink`, shared) |
| `activity_wall_sessions/{uid}_{activityId}/submissions/{docId}` | `poll_sessions/{uid}_{pollId}/votes/{participantUid}`          |
| Remote QR panel (`anonymous-join` gated)                        | same, in `RemotePollControl`                                   |
| `activeActivityId` (active session)                             | `activePollSessionId` + `lastPollSessionId` in `PollConfig`    |

## Out of scope (YAGNI)

- Stronger anti-fraud than one-vote-per-anonymous-device (acceptable for
  classroom/presentation use, same bar as Activity Wall).
- Ranked/multi-select voting, open-ended poll responses, results export.
- Migrating the existing announcement `pollVotes` path — leave it as-is; this is
  an additive third mode.

## Testing

- `PollVoteApp`: decodes `?data=`, casts a vote (writes the uid-keyed doc),
  overwrites on re-vote, renders the live tally.
- `PollWidget`: with an active session, aggregates live tallies from the votes
  subcollection and generates the link/QR (gated by `anonymous-join`);
  replace-when-live disables manual ±.
- `RemotePollControl`: QR panel shows only when `anonymous-join` is permitted;
  start/stop toggles the session; Resume/Restart popover.
- Firestore rules tests: a participant can write only their own `votes/{uid}`
  doc; cannot write another participant's; writes blocked when `active == false`
  or `optionIndex` out of range; teacher/admin can read+reset.
- Manual: phone scans QR → votes → tally updates live on the projected board.

## Rollout

Own branch off `main` → `dev-paul` preview → PR. New public route + Firestore
rules deploy on the `main` merge. Gated by `anonymous-join` (already shipped), so
it composes with the wide-distro tiering.
