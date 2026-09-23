# Sub Shares: Whole Collections, Exactly As the Teacher Built Them — Implementation Plan

**Date**: 2026-09-22 · **Branch**: `dev-paul` · **Status**: Draft for product-owner review. Decisions in §2 were settled in a design interview on 2026-09-22; no code has been written. File paths and line numbers were read at `ad1b7a327`; re-verify before relying on them.

A teacher who keeps a day's lesson plan as a collection (one board per part of the day) must be
able to hand that collection to a substitute, and the sub must see every board exactly as the
teacher set it up — content, data, pen marks, groups, student names — and click through it the
same way the teacher does. Where the lesson calls for a quiz, video activity, guided learning set
or flashcards, the sub launches it and the results land in the teacher's account.

---

## 1. What exists today

Collection sharing with subs is **already built** (#1652 collection sharing, #2080 `/subs`
collections + Drive grants). It is not usable as a lesson plan, and single-board sub shares have
most of the same fidelity gaps.

### 1.1 Teacher side

- Single board: `components/share/ShareLinkCreatorModal.tsx` (mode `'substitute'`, `:42`; 48 h
  default / 14 d max `datetime-local`, `:45-46`, `:636-651`; building from the teacher's
  `selectedBuildings`, `:154-232`) → `handleShareSubstituteDashboard`
  (`context/DashboardContext.tsx:1789-1894`, runs `scrubDashboardPII` at `:1796`, grants Drive
  reader on the **active roster only**) → `addDoc('/shared_boards')` (`hooks/useFirestore.ts:533-604`).
- Collection: `components/share/ShareCollectionLinkCreatorModal.tsx` (preset expiry chips
  4 h–1 week, `:36-41`; hardcoded `BUILDINGS`, starts empty, `:29`, `:309`; active roster only,
  `:124-134`) → `DashboardContext.tsx:4137-4240` → `hooks/useSharedCollection.ts:295-351`
  (parent doc, then `boards/` sub-docs in 400-doc batches, each through `sanitizeBoardSnapshot`).
- Only **direct child** boards are shared (`BoardsModal.tsx:736`); nested collections are dropped.
- Success screen for a collection sub share shows `/share-collection/{id}`, an import link that
  only says "open it in /subs" (`ShareCollectionLinkCreatorModal.tsx:164`,
  `ImportSharedCollectionModal.tsx:130-136`).
- No UI lists active sub shares, updates one, or ends one early.

### 1.2 Data and rules

- `/shared_boards/{autoId}`: board fields + `intendedMode: 'substitute'`, `expiresAt`,
  `buildingId`, `initialState`, `subEmails?`, `driveGrants?`, `sharedRosters?`
  (`types.ts:8250-8287`). Rules `firestore.rules:1017-1179`: get = host/admin/verified `@orono`
  before expiry; list = substitute + verified `@orono` (expiry filtered client-side, no building
  constraint in rules); the six sub fields are pinned on update.
- `/shared_collections/{uuid}` + `boards/{boardId}` (`types.ts:9636-9685`). Rules `:1184-1279`:
  substitute shares are **immutable** (update allowed only for copy shares); board sub-docs are
  writable by the host at any time. The parent stores `boardIds` only — no names, no order, no
  sections.
- `preset_sub_emails/{buildingId}` (`:1284`) holds each building's generic sub accounts
  (e.g. `ohssub@`), edited in `components/admin/PresetSubEmailsManager.tsx`, offered as chips the
  teacher must click.
- Expiry: client sweep `hooks/useReconcileExpiredSubShares.ts` (revokes Drive grants no active
  share still uses) + `functions/src/expireSubShares.ts` hourly (deletes; cannot revoke Drive).

### 1.3 Sub side (`/subs`)

- `components/subs/SubsApp.tsx` is a local state machine (`building-picker` → `directory` →
  `board` | `collection-board`, `:31-43`); no URL deep links.
- `SubCollectionsList.tsx` is a one-time `getDocs` (`:42-48`), labels boards **"Board …{last4}"**
  (`:139-142`), shows no teacher name or expiry. `SubCollectionBoardScreen` has **no prev/next**;
  the only exit is "Back to directory". Directory counts ignore collections.
- `SubsDashboardProvider.tsx`: read-only chrome; `updateWidget` is local-only (`:146-171`);
  Reset re-copies `initialState`; the sub's edits are lost when they leave a board.

### 1.4 Why boards don't look the same for the sub

Every widget in `/subs` reads `useAuth().user.uid` (the **sub**) and `activeDashboard.id` (the
**shareId**). Nothing in `components/widgets/*` knows it is inside a sub share.

| Widget                                        | Where the content lives                                                         | What the sub sees today                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Drawing (migrated)                            | `users/{uid}/dashboards/{id}/drawings/...` (`DrawingWidget/Widget.tsx:140-160`) | No strokes. The sub's own strokes are written to `users/{subUid}/dashboards/{shareId}/…` and survive Reset. |
| Quiz                                          | `users/{uid}/quizzes` + Drive JSON; `quiz_assignments`                          | The sub's own library, or "Drive access needed"                                                             |
| Video Activity                                | `users/{uid}/video_activities` + Drive                                          | Same                                                                                                        |
| Guided Learning                               | `users/{uid}/guided_learning` + Drive (building sets are readable)              | Personal set falls back to the sub's library                                                                |
| Flashcards                                    | `users/{uid}/flashcard_sets`                                                    | Sub's library                                                                                               |
| Projects                                      | `users/{uid}/projects` + run doc keyed on uid                                   | Empty                                                                                                       |
| Activity Wall                                 | `users/{uid}/activity_wall_activities`, session `{uid}_{activityId}`            | Empty wall or sub's library; legacy inline activities migrate into the **sub's** library                    |
| Smart Notebook                                | `users/{uid}/notebooks`                                                         | Sub's library                                                                                               |
| Next Up                                       | Queue JSON in teacher's Drive                                                   | Empty queue                                                                                                 |
| Poll (live)                                   | `poll_sessions/{uid}_{id}`                                                      | Questions show, zero tallies                                                                                |
| Calendar (personal)                           | Google Calendar API with the sub's token                                        | Silently empty unless the calendar is shared                                                                |
| Music (Spotify)                               | Teacher's Spotify OAuth                                                         | The sub's own Spotify connect                                                                               |
| Custom Widget (beta-only)                     | `custom_widgets/{id}`                                                           | Blank unless the sub is on the beta list                                                                    |
| Expectations, Schedule, Soundboard, Blooms, … | Admin config by `useWidgetBuildingId` (`hooks/useWidgetBuildingId.ts:15-26`)    | The **sub's** building defaults, not the teacher's                                                          |
| PDF, MiniApp                                  | Active item URL/app saved in config                                             | Works; "Back to library" shows the sub's                                                                    |

Images are fine: Storage download URLs are tokenized and Drive-first uploads are shared to the
domain or anyone (`hooks/useStorage.ts`).

### 1.5 Student names

`scrubDashboardPII` (`utils/dashboardPII.ts:119-135`) removes `firstNames`, `lastNames`,
`completedNames`, `remainingStudents`, `lastResult`, `lockedNames`, `unassignedNames`,
`doneNames`, `jigsawHomeGroups`, `jigsawExpertGroups`, `names`, `roster`, `customRoster`, and
custom-mode `assignments`. `/subs` only gets class-roster names back (via the Drive Picker unlock,
`hooks/useSubstituteRosters.ts`); custom lists, Randomizer picks/groups and Checklist ticks never
come back.

**Live bug:** the collection path never calls `scrubDashboardPII` — only `sanitizeBoardSnapshot`
(`utils/dashboardSanitize.ts:41-58`), which doesn't touch widget configs. In-memory boards carry
names merged back from Drive (`DashboardContext.tsx:1969`, `:3067`), so custom-list names can be
written to `/shared_collections/*/boards/*` — for copy shares and collection templates too.
`sanitizeBoardSnapshot` also drops `annotationOverlay` and `sharedGroups`, which single-board
sub shares keep.

### 1.6 Constraints

- **Rules headroom:** `node scripts/checkRulesSize.mjs` → 181,754 stripped bytes, **595 bytes**
  below the 182,349-byte compiled-ruleset cliff (#3241). Any new clause needs room made first.
- **Server can't read the teacher's Drive** (only ~2% of users have a refresh token), so anything
  a Cloud Function builds must come from data already in Firestore.
- **Launch helpers assume the caller is the teacher**: `setAssignmentTargetsV1`
  (`functions/src/studentAssignmentTargets.ts:~687-707`) requires `session.teacherUid == caller`;
  quiz/VA/GL/flashcard session and response rules gate the teacher on `teacherUid`.

---

## 2. Decisions (locked 2026-09-22)

| #   | Decision          | Choice                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Freshness         | **Snapshot + "Update sub share."** The share is a frozen copy; the teacher can re-push the current boards (and newly added boards) into the same share — same link, same expiry, same `/subs` entry.                                                                                                                        |
| D2  | Sub navigation    | **Mirror the teacher's Board FAB**: same prev/next + board list in collection order, arrow-key shortcuts, opens on the collection's default board (else the first).                                                                                                                                                         |
| D3  | Sub edits         | **Kept in memory per board for the session** — timer running, checklist ticks, picked names survive clicking to the next board and back; lost on reload. No Firestore writes.                                                                                                                                               |
| D4  | Fidelity          | **Byte-for-byte what the teacher set up**, content and data included: nested sub-collections, every roster the boards use, pen annotations, randomizer groups, custom-list names, and content that lives outside the board doc.                                                                                             |
| D5  | Nesting           | **Grouped by sub-collection**: the FAB list shows section headers (Monday, Tuesday…); prev/next walks the flattened tree order across sections.                                                                                                                                                                             |
| D6  | Outside content   | **Bundle into the share** at share/update time (the Materials `customMaterialSnapshots` pattern). Widgets in `/subs` read a share content source, never the sub's library. Deleted with the share.                                                                                                                          |
| D7  | Live runs         | **Launch in the teacher's account** via a Cloud Function; results show in the teacher's Results. The sub can monitor runs **they launched from this share** — never the teacher's earlier results.                                                                                                                          |
| D8  | Live set v1       | **Quiz, Video Activity, Guided Learning, Flashcards.** Poll and Activity Wall show their content but launching reads "Available when your teacher is back" in v1.                                                                                                                                                           |
| D9  | Custom-list names | **Per-share names file in the teacher's Drive, granted to named subs** through the same unlock as rosters. Names never enter Firestore.                                                                                                                                                                                     |
| D10 | Who is "named"    | The building's **preset sub accounts are pre-selected** on every sub share (teacher can untick) plus any specific sub email the teacher adds. Named subs get roster + names access and launch rights. Anyone else verified `@orono` in the building still sees the boards (today's behavior) but no names and no launching. |
| D11 | Expiry            | **14-day cap stays**; "Extend" in the manager adds up to 14 days from now.                                                                                                                                                                                                                                                  |
| D12 | Scope             | Single-board sub shares get the same fidelity; add a teacher **"Sub shares" manager**, a **unified `/subs` directory**, and **deep links**.                                                                                                                                                                                 |
| D13 | Rules room        | **The first commit of PR 2 shrinks `firestore.rules`**, verified with `node scripts/releaseFirestoreRules.mjs spartboard-dev`, before any clause is added.                                                                                                                                                                  |
| D14 | Rollout           | Only **launch-as-teacher** sits behind a kill switch (`admin_settings/sub_launch_as_teacher`, off in both projects, with an admin-panel toggle). Everything else fixes broken behavior and ships unflagged.                                                                                                                 |

### 2.1 Choices made during planning (confirm or overturn)

- **A1 — One share model.** New sub shares of a single board are written as a one-board
  `/shared_collections` share (`kind: 'board' | 'collection'`), so bundling, names, update and
  launch are built once. `/subs` keeps reading `/shared_boards` substitute docs; 14 days after the
  `main` release every old one has expired and that path reads nothing. Deleting it (and its rules
  branches, which returns rules bytes) is optional cleanup, not a planned PR. Copy and view-only
  board shares stay in `/shared_boards`.
- **A2 — Answer keys are named-only.** Bundled quiz/VA/GL answer keys go in a sub-collection only
  the host and named subs can read; display content is readable by any share viewer.
- **A3 — Spotify can't be reproduced.** Personal Spotify shows the curated stations with "Your
  teacher's Spotify isn't available here." Calendar personal events are bundled (next 14 days at
  share/update time).
- **A4 — Monitor access ends with the share.** A session the sub launched carries
  `subMonitorUntil = share.expiresAt`; extending the share later does not extend old sessions.

---

## 3. Design

### 3.1 Share document (v2)

`/shared_collections/{shareId}` gains:

```ts
kind: 'board' | 'collection';
sections: { id: string; name: string; color?: string }[];   // root first, then sub-collections in tree order
boards: { id: string; name: string; sectionId: string; order: number }[];  // replaces reading names from sub-docs
defaultBoardId?: string;
contentVersion: number;          // bumped by Update share; /subs reloads when it changes
namesFile?: { driveFileId: string };   // D9
updatedAt: number;
```

`boardIds` stays (rules and old clients key on it). Sub-collections:

- `boards/{boardId}` — `{ boardId, dashboard }`, dashboard passed through `scrubDashboardPII`
  and a **substitute-mode sanitize** that keeps `annotationOverlay` and `sharedGroups`.
- `content/{kind}_{itemId}` — display content for outside-the-board widgets (§3.3), readable
  wherever `boards/*` is.
- `keys/{kind}_{itemId}` — answer keys / full quiz, VA and GL content, readable by host and
  named subs only (A2).

Rosters: collect every `rosterId` referenced by widgets across the shared boards, plus the
active roster, and grant each to the named subs (`sharedRosters` becomes the full list).

### 3.2 Share dialog (both entry points)

One `ShareWithSubModal` used from board and collection menus:

- Building defaults to the teacher's building (`useAdminBuildings`, not the hardcoded list).
- The building's preset sub emails are **pre-checked**; the teacher can untick or add emails (D10).
- Expiry: `datetime-local`, default 48 h, max 14 days (both paths).
- Includes nested sub-collections for a collection (D4, D5).
- If an active sub share already exists for this board/collection, the dialog opens on
  **"Update existing share"** instead of making a second one.
- Success shows the deep link (§3.5) with Copy, not the import link.

### 3.3 Share content source in `/subs`

A `SubShareContentContext` provided by `SubsDashboardProvider` exposes the share's building,
bundled content, keys (if named), unlocked names and rosters. Widgets that read outside the board
call a small hook (e.g. `useShareContent(kind, id)`) that returns `null` outside `/subs`, so the
teacher's path is untouched. Per widget:

| Widget                   | Bundled at share time                                                                                                                                             | In `/subs`                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Drawing                  | Strokes from `drawings/{widgetId}/pages/*/objects`                                                                                                                | Render bundled strokes; sub strokes stay in memory (D3), never written to the sub's `users/` path          |
| Quiz, VA, GL (personal)  | Full copy in `keys/` and nothing in `content/`; the board snapshot carries the title. VA's questions come from the teacher's Drive, so the bundler takes a reader | Show the item the widget last launched or reviewed, not a library; Launch per §3.6                         |
| GL (building set)        | Reference only — never bundled, and no bundling failure reported for one                                                                                          | Read `/building_guided_learning` as today; the sub's widget falls back to it when the share carried no key |
| Flashcards               | Set cards                                                                                                                                                         | Present / Launch                                                                                           |
| Projects                 | Project + current run (read-only)                                                                                                                                 | Board view renders                                                                                         |
| Activity Wall            | Definition in `content/`, approved posts in the names file (§3.4)                                                                                                 | Read-only wall; launch disabled (D8)                                                                       |
| Smart Notebook           | Notebook doc (page image URLs already tokenized)                                                                                                                  | Opens the teacher's notebook                                                                               |
| Next Up                  | Queue rides the names file (§3.4), not `content/`                                                                                                                 | Queue shows; student link disabled                                                                         |
| Poll                     | — (questions are in config)                                                                                                                                       | Questions; launch disabled (D8)                                                                            |
| Calendar                 | Personal events, next 14 days                                                                                                                                     | Bundled + local + building events                                                                          |
| Custom Widget            | Definition doc                                                                                                                                                    | Renders for beta-only widgets too                                                                          |
| PDF, MiniApp             | —                                                                                                                                                                 | Hide "Back to library"                                                                                     |
| Building-default widgets | —                                                                                                                                                                 | `useWidgetBuildingId` returns the share's `buildingId`                                                     |

Bundling runs on the teacher's client (it has Drive). Anything that fails to bundle is listed in
the success screen ("3 of 4 items bundled — Next Up queue couldn't be read") rather than
silently shipping an empty widget.

### 3.4 Names (D9)

At share/update time the teacher's client writes `SpartBoard/Data/SubShares/{shareId}-names.json`
with the PII extracted from every shared board (same shape as the dashboard `-pii.json`
sidecars) and grants reader to the named subs. In `/subs`, the existing "Load class list" unlock
picks the rosters **and** the names file in one Picker; after download the provider calls
`mergeDashboardPII` per board. The sweep revokes and trashes the names file with the rosters.

### 3.5 `/subs` experience

- **Deep links**: `/subs/s/{shareId}` and `/subs/s/{shareId}/{boardId}`. `SubsApp` reads the
  path after sign-in; building and expiry checks still apply. Old `/share-collection/{id}`
  substitute links redirect here.
- **Directory**: one card per teacher with their shared boards and collections — names, section
  counts, expiry — from one live `onSnapshot` (replacing the one-time `getDocs`).
- **Navigation**: the teacher's `BoardNavFab` rendered against the share's `boards`/`sections`
  (grouped list, prev/next, arrow keys), opening on `defaultBoardId` (D2, D5).
- **Session memory**: widget state per `boardId` held in `SubsApp` so navigation doesn't reset it;
  Reset resets the current board only (D3).
- **Update awareness**: when `contentVersion` changes, a banner offers "Your teacher updated
  these boards — reload" (keeps in-progress sub edits until they accept).

### 3.6 Launch in the teacher's account (D7, D8, D14)

Callable `launchSubAssignmentV1({ shareId, boardId, widgetId, kind, classIds?, options })`,
modeled on `createTeammatePaperBatchV1` (`functions/src/createTeammatePaperBatch.ts:851`):

1. Caller is verified `@orono`, email is in `share.subEmails`, share is substitute and unexpired,
   kill switch on.
2. The widget exists on the bundled board and references the bundled `keys/` item.
3. Builds the session **from the bundle** with `teacherUid = share.hostUid`,
   `launchedBy: { uid, email, shareId }`, `subMonitorUids: [callerUid]`,
   `subMonitorUntil: share.expiresAt`; writes the matching `users/{hostUid}/*_assignments` doc.
   Quiz needs join-code allocation and the public-question projection
   (`toPublicQuestion`, `hooks/useQuizSession.ts:377`) moved to a module both client and
   functions import; VA, GL and Flashcards are straight copies.
4. Class targeting: the sub picks from the shared rosters; the per-student pointer fan-out is
   factored out of `setAssignmentTargetsV1` into an internal function the new callable calls
   with the host's uid.

Monitoring: one rules helper, `isSubMonitor(session)` =
`request.auth.uid in session.subMonitorUids && request.time.toMillis() < session.subMonitorUntil`,
added to the four session/response read rules. Pause/end go through
`controlSubAssignmentV1` rather than widening update rules. Grading in the sub's monitor uses the
`keys/` copy. In the teacher's Results, these runs carry a "Launched by {sub email} · {date}" tag.

### 3.7 Teacher "Sub shares" manager

A "Shared with subs" section in the Boards modal listing the teacher's active sub shares:
name, kind, building, named subs, expiry. Actions: **Copy link**, **Update now** (re-push boards,
content, names file, rosters; bump `contentVersion`), **Add sub email** (grants rosters + names
file), **Extend** (≤ now + 14 days), **End now** (revoke Drive grants, delete share). Board and
collection menus show a "Shared with a sub until {date}" badge.

Rules: allow the host to update a substitute share's `boards`, `boardIds`, `sections`,
`collection`, `defaultBoardId`, `subEmails`, `sharedRosters`, `driveGrants`, `namesFile`,
`contentVersion`, `updatedAt`, and `expiresAt` (still ≤ now + 14 d); everything else stays pinned.

---

## 4. PR sequence

Four PRs, split where the risk or the timing differs, not by layer or by widget.

**PR 1 — Scrub student names from collection shares.** Run `scrubDashboardPII` on every board in
the collection share path (copy, substitute, and collection templates). A few lines plus tests.
It fixes a live leak, so it lands immediately and waits on nothing. No rules, no functions.

**PR 2 — Lesson-plan flow** (§3.1 minus `content/`/`keys/`, §3.2, §3.5, §3.7). Depends on PR 1.

- First commit: shrink `firestore.rules` (target ≥ 3 KB compiled headroom), checked with
  `node scripts/releaseFirestoreRules.mjs spartboard-dev`.
- Share model v2 (A1): `kind`, `sections`, `boards`, `defaultBoardId`, `contentVersion`; nested
  sub-collections; substitute sanitize keeping annotations and groups; every referenced roster.
- One share dialog: teacher's building, presets pre-checked, 48 h / 14 d expiry, deep link on
  success, "Update existing share" instead of duplicates.
- Teacher manager: Copy link, Update now, Add sub email, Extend, End now; "Shared with a sub"
  badges. Rules: host update allowlist on substitute shares.
- `/subs`: one live directory per teacher, deep links, `BoardNavFab` with sections and arrow
  keys, per-board session memory, update banner, share building passed to building-default
  widgets.
- Deletes the stale `TODO.md:84` entry.

**PR 3 — Full fidelity** (§3.3, §3.4). Depends on PR 2.

- `content/` and `keys/` sub-collections with their rules; `expireSubShares` and the client sweep
  reap them.
- `SubShareContentContext` + `useShareContent`, and the per-widget adapters in the §3.3 table.
- Names file in Drive, one-Picker unlock for rosters + names, `mergeDashboardPII` in `/subs`.
- This is the largest review (about a dozen widgets). If it gets unreviewable, split it once:
  display-only widgets first, then Quiz/VA/GL/Flashcards with `keys/`. Only split if needed.

**PR 4 — Launch in the teacher's account** (§3.6). Depends on PR 3 (needs `keys/`).

- `launchSubAssignmentV1` and `controlSubAssignmentV1` for Quiz, VA, GL and Flashcards; quiz
  projection and join-code allocation moved to a module shared with `functions/`; target fan-out
  factored out of `setAssignmentTargetsV1`.
- `isSubMonitor` rules helper on the four session/response reads.
- Kill switch `admin_settings/sub_launch_as_teacher` with its admin-panel toggle, off in both
  projects; "Launched by" tag in teacher Results.
- Kept separate because it is the only PR with Cloud Functions acting on another user's behalf.

Every rules change runs `node scripts/releaseFirestoreRules.mjs spartboard-dev` before merge.

### 4.1 Release-time compatibility (at `main`)

- A teacher's already-open old tab still creates `/shared_boards` substitute docs and immutable
  `/shared_collections` substitute docs. PR 2 must keep those creates valid, and `/subs` must
  read both shapes (old collection docs have no `boards[]` → fall back to "Board …" labels).

## 5. Testing

- **Unit**: substitute sanitize keeps annotations/groups and runs the PII scrub; roster
  collection across boards; section flattening order; per-board session memory; share content
  hook returns `null` outside `/subs`; names merge.
- **Rules** (`tests/rules/sharedCollections.test.ts`, CI only): host update allowlist, expiry
  ≤ 14 d on extend, `keys/` named-only, `content/` viewer-readable, `isSubMonitor` true for the
  launching sub before `subMonitorUntil` and false after / for other subs / for the teacher's
  other sessions.
- **Functions**: `launchSubAssignmentV1` rejects unnamed, expired, kill-switch-off, widget-not-
  on-board, and item-not-bundled; writes `teacherUid = host`; flashcard Check grading works on a
  sub-launched session unchanged.
- **Dev verification** (https://spartboard-dev.web.app): teacher shares a nested collection with
  a quiz, a drawing, a custom-list randomizer and a roster seating chart; generic sub account opens
  the deep link, unlocks names, clicks through every board, launches the quiz, a mock-class
  student joins, the teacher sees the result tagged with the sub.

## 6. Out of scope for v1

- Poll and Activity Wall launching (D8).
- Live sync of teacher edits without "Update share" (D1).
- Sub edits persisting across reloads or visible to the teacher (D3).
- Admin/office UI to manage another teacher's sub shares (admins keep rules-level override only).
- Personal Spotify (A3).

## 7. Housekeeping found while planning

- `TODO.md:84` ("M5: finish /subs Collections stub + Drive grants") is done (#2080); delete it in PR 2.
- Video Activity session create (`firestore.rules:~4194`) doesn't pin `teacherUid == auth.uid`,
  and sessions embed `correctAnswer` readable by any signed-in user — tracked separately.
