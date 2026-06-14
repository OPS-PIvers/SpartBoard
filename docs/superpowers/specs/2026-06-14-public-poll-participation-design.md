# Public Poll Participation — Design Spec (follow-up)

_Date: 2026-06-14. Owner: Paul Ivers. Status: follow-up spec — NOT for the
Tuesday 2026-06-16 demo. Build after PR #1961 (Remote Control v2) merges, in
its own branch/PR._

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

Poll has **none** of that participant infrastructure (verified 2026-06-14):

- No `/poll` participant route in `App.tsx`.
- No `PollVoteApp` / participant component (only the dashboard widget, the admin
  panel, and `RemotePollControl`).
- The only shared-vote storage is `pollVotes` nested under
  `/announcements/{id}/` (`firestore.rules:2679`) — tied to the announcement
  system, not a standalone poll session.

So this builds the participant side from scratch, reusing **patterns** (not
plumbing) from Activity Wall: the `?data=<base64>` join-link encoding, anonymous
join, the live-tally Firestore listener shape, and the QR panel. Scope is
comparable to the original Activity Wall participant build — roughly a focused
day with tests + rules.

## Current Poll model (for reference)

- `PollWidget` (`components/widgets/PollWidget/Widget.tsx`): `PollConfig` has
  `question` + `options[]` (each `{ label, votes }`). Votes are stored either
  **locally in widget config** (teacher-driven tally, adjusted on-board or via
  `RemotePollControl` ±/reset) or — when embedded in an announcement
  (`config._announcementId`) — in `/announcements/{id}/pollVotes/{optionIndex}`
  as `{ count }`, shared live via `onSnapshot` + `increment`.
- `RemotePollControl` only does manual ±/reset of tallies; no link/QR.

## Design

### 1. Participant route + app

- New route in `App.tsx`: `/poll/:pollId` (anonymous entry, outside
  `AuthProvider` — mirror the `/activity-wall` branch: `DialogProvider` +
  `StudentIdleTimeoutGuard` + a lazy `PollVoteApp`). Add an `isPollRoute` guard.
- New `components/poll/PollVoteApp.tsx`: decodes the `?data=` payload (poll
  question + options + `pollId` + `teacherUid`), signs in anonymously
  (`signInAnonymously`), renders the options as large vote buttons, casts one
  vote, then shows a "thanks / your vote is in" confirmation with the live
  tally. Reuses the dark, mobile-first participant styling of
  `ActivityWallStudentApp`.

### 2. Join link encoding (mirror Activity Wall)

- A `buildPublicPollLink(poll, teacherUid)` →
  `${origin}/poll/${pollId}?data=${encodeURIComponent(btoa(JSON.stringify({ id, question, options, teacherUid })))}`.
  Same base64-of-JSON `?data=` shape as `buildPublicActivityLink`, so the
  participant app renders without a Firestore read of the poll config. (Keep the
  encoded payload small — only what's needed to render and route the vote.)

### 3. Vote storage + one-vote-per-device

- New collection: `poll_sessions/{teacherUid}_{pollId}/votes/{participantUid}`,
  doc `{ optionIndex: number, votedAt: number }`. Using the anonymous
  participant's `uid` as the **doc id** enforces one vote per device/session
  naturally (re-voting overwrites). This mirrors Activity Wall's per-doc /
  uid-keyed pattern and is cleaner than `increment` counters for dedup.
- Live tally: the dashboard `PollWidget` (and the participant confirmation
  screen) subscribe to the `votes` subcollection and aggregate counts per
  `optionIndex` client-side. This is a NEW read path for the widget — today it
  reads local config or announcement votes; add a third "session-backed" mode
  keyed on an active `poll_sessions` session id.

### 4. Widget-side (teacher) changes

- `PollWidget`: when a public session is active, generate the participant link +
  QR (gated by `canAccessFeature('anonymous-join')`, consistent with Activity
  Wall) and show live aggregated tallies from the votes subcollection on the
  projected board. Add a "Start/stop accepting votes" notion (an active session
  id in config, analogous to `activeActivityId`) so the link is only live when
  the teacher opens voting.
- Decide: does a public session REPLACE the local-tally mode or coexist? Default:
  coexist — local ± tally stays for show-of-hands; public session is opt-in when
  the teacher wants device voting.

### 5. Remote control

- Extend `RemotePollControl` with a "Show Join QR" panel (same component shape as
  `RemoteActivityWallControl`'s QR panel, gated by `anonymous-join`) plus a
  start/stop-voting toggle. Keep the existing ±/reset tally controls.

### 6. Firestore rules

- New rules for `poll_sessions/{sessionId}/votes/{participantUid}`: an
  authenticated (incl. anonymous) user may create/update ONLY the doc whose id ==
  their own `request.auth.uid`; `optionIndex` is a number within range;
  `votedAt` is a number. Teacher (sessionId matches `{uid}_*`) + admin may read
  all and delete (reset). Model on the `activity_wall_sessions` submission rules
  (`firestore.rules`) and the existing `pollVotes` rule shape.

## Reuse map (Activity Wall → Poll)

| Activity Wall                                                   | Poll equivalent                                       |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `/activity-wall/:id` route + `ActivityWallStudentApp`           | `/poll/:pollId` route + `PollVoteApp`                 |
| `buildPublicActivityLink` / `encodeActivityData`                | `buildPublicPollLink` / `encodePollData`              |
| `activity_wall_sessions/{uid}_{activityId}/submissions/{docId}` | `poll_sessions/{uid}_{pollId}/votes/{participantUid}` |
| Remote QR panel (`anonymous-join` gated)                        | same, in `RemotePollControl`                          |
| `activeActivityId` (active session)                             | new active-poll-session id in `PollConfig`            |

## Out of scope (YAGNI)

- Stronger anti-fraud than one-vote-per-anonymous-device (acceptable for
  classroom/presentation use, same bar as Activity Wall).
- Ranked/multi-select voting, open-ended poll responses, results export.
- Migrating the existing announcement `pollVotes` path — leave it as-is; this is
  an additive third mode.

## Testing

- `PollVoteApp`: decodes `?data=`, casts a vote (writes the uid-keyed doc),
  blocks/overwrites a second vote, renders the live tally.
- `PollWidget`: with an active session, generates the link/QR (gated by
  `anonymous-join`) and aggregates live tallies from the votes subcollection.
- `RemotePollControl`: QR panel shows only when `anonymous-join` is permitted;
  start/stop toggles the session.
- Firestore rules tests: a participant can write only their own `votes/{uid}`
  doc; cannot write another participant's; teacher/admin can read+reset.
- Manual: phone scans QR → votes → tally updates live on the projected board.

## Rollout

Own branch off `main` (after #1961 merges) → `dev-paul` preview → PR. New public
route + Firestore rules deploy on the `main` merge. Gated by `anonymous-join`
(already shipped), so it composes with the wide-distro tiering.
