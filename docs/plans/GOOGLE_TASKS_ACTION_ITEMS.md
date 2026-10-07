# Google Tasks sync for team action items

Status: decided, not started. Interviewed with Paul on 2026-10-06.

## Goal

When an action item in My Teams > Notes is assigned to someone who has turned on the Google Tasks connection, it appears in their Google Tasks within seconds and stays in step with SpartBoard. The connection is off for everyone until they turn it on themselves.

## Decisions

| #   | Decision                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Each person opts in.** A toggle under Profile & Settings > Connected Apps reading "Send my team action items to Google Tasks". Turning it on runs Google's consent flow for the `tasks` permission. It is never added to the sign-in permissions. |
| D2  | **Push is server-side and immediate.** A Firestore trigger uses the **assignee's** stored refresh token; the Tasks API can only write to the list of the person who granted it, so the assigner's token can't be used.                              |
| D3  | **What's synced:** team note action items (including those from Meeting Mode and approved AI drafts) and linked-doc action items. Self-assigned items are included. Unassigned items are not synced.                                                |
| D4  | **Backfill on connect:** the assignee's open items across all their teams are pushed when they first connect.                                                                                                                                       |
| D5  | **SpartBoard → Google:** creating an item, editing its text or due date, reassigning it (delete from the old list, create in the new), deleting it (or the whole note) and checking it off all carry over to Google.                                |
| D6  | **Google → SpartBoard:** only the done/open state comes back, in both directions (checking off and unchecking). Title, due date and notes changes made in Google are not synced back.                                                               |
| D7  | **When completion is pulled:** whenever the person opens a team or the "Your action items" card. There is no scheduled sweep.                                                                                                                       |
| D8  | **Destination:** a dedicated "SpartBoard" task list, created on first push and recreated if the user deletes it.                                                                                                                                    |
| D9  | **Task content:** title = item text; due = `dueAt` date; notes = "<Team name> · <Note title>" plus a deep link to the note.                                                                                                                         |
| D10 | **Turning it off, or leaving or being removed from a team:** existing Google tasks are left in place and stop syncing. Nothing in the user's Google account is deleted.                                                                             |
| D11 | **Private:** assigners never see whether an assignee has connected.                                                                                                                                                                                 |
| D12 | **OAuth app is Internal** (orono.k12.mn.us), so Google doesn't need to verify the `tasks` permission. Add it to the consent screen and confirm the district Workspace admin allows the Tasks API.                                                   |

## Design

### Grant

- `exchangeGoogleAuthCode` (`functions/src/googleOAuth.ts`) already stores one encrypted refresh token per user, with the granted `scope` recorded, at `users/{uid}/private/googleAuth`. The Tasks connect flow runs the same GIS code flow, requesting `drive.file` + `https://www.googleapis.com/auth/tasks` with `include_granted_scopes`. The new refresh token replaces the old one and covers both scopes. Keep the existing `partial-consent` check for `drive.file`.
- "Connected" means the stored `scope` includes `tasks` and `users/{uid}/private/googleTasks.enabled === true`. That doc (server-written only) also holds `listId` and `connectedAt`.
- On `invalid_grant` or a missing scope at push time: set `enabled: false` and `disconnectReason`; the settings toggle shows "Reconnect".

### Sync map

- `users/{uid}/private/googleTasksMap/{plcId}_{source}_{parentId}_{itemId}`, where source is `note` or `doc`: `{ taskId, listId, plcId, parentId, itemId, lastPushedHash, lastKnownDone }`. Server-only (no client rules), so a teammate can't read someone else's connection state (D11).

### Push trigger

- `onDocumentWritten` on `plcs/{plcId}/notes/{noteId}` and `plcs/{plcId}/docs/{docId}`. Diff `before.actionItems` against `after.actionItems` by `id`. For each affected assignee, check `googleTasks.enabled` and that they are still an active member, then insert, patch or delete. `lastPushedHash` makes repeat fires no-ops (the CRDT mirror rewrites the whole array every few seconds).
- A note deleted, or soft-deleted by `gcPlcOrphans`, deletes its mapped tasks (D5).
- Google Tasks `due` is date-only; convert `dueAt` (local midnight) to a `YYYY-MM-DD` date in the district time zone, not UTC.

### Completion pull (D6, D7)

- Callable `pullGoogleTasksStatusV1({ plcId? })`: lists the caller's SpartBoard list with `showCompleted=true&showHidden=true` (cleared completed tasks are hidden otherwise) and `updatedMin` = last pull. It returns `{ plcId, source, parentId, itemId, done }[]` for tasks whose status differs from `lastKnownDone`.
- **The client applies the change, not the server.** With live collaboration on, the Yjs doc is authoritative and `usePlcNoteCrdt` copies it over `actionItems` (`hooks/usePlcNoteCrdt.ts:248`), so a server write would be overwritten. The client flips `done`/`doneAt` through `crdt.setActionItems`, or `updateNote` when CRDT is off. That write fires the push trigger, which finds Google already matches and does nothing.
- The pull runs on the team view mount and on the `YourActionItemsCard` mount, throttled to once per 2 minutes per user.
- Only the assignee's own client applies their items. A teammate viewing the note sees the update once the assignee has opened SpartBoard (D7 trade-off).

### Turning it off and membership (D10)

- Turning it off sets `enabled: false` and deletes the map docs. The refresh token keeps the `tasks` scope; that's harmless, and turning it on again is a single click.
- The trigger skips assignees who are no longer active members. A membership change does nothing to existing tasks.

### UI

- `components/settingsModal/sections/ConnectedAppsSection.tsx`: a Google Tasks card with the toggle, status ("Connected · 12 items synced") and Reconnect. The section is currently gated only on `claude-connector`; show it when either flag passes.
- No change to `NoteActionItems.tsx` (D11).

## Flag and rollout

- `GlobalFeature` `google-tasks-sync`: `defaultAccessLevel: 'admin'`, `stage: 'preview'`, `afterLaunch: 'keep'`, `category` = teams. Add it to `functions/src/featureMissingDoc.ts`. The trigger checks `isGlobalFeatureGranted` for the assignee so a flag-off user is never pushed, even if they somehow connected.
- To open it: Admin Settings > Access > Previews > Google Tasks sync > Public. The changelog entry ships at that point.
- Dev and prod share one OAuth client, so adding the `tasks` scope to the consent screen affects both at once. That's fine because nothing requests it until the flag is on.

## Open checks before building

1. Google Cloud Console (prod OAuth client's project): enable the Tasks API, then add the `.../auth/tasks` scope to the consent screen. Enable the API in `spartboard-dev` as well if it calls Google under its own project quota.
2. Confirm with the district Workspace admin that third-party access to Google Tasks isn't blocked for staff.
3. Tasks API quota: the default is 50,000 queries/day per project. Estimate: one write per item change per assignee, plus one list call per pull. Comfortably inside at district scale.

## Build order

1. Flag, settings card, connect flow, `googleTasks` doc (no sync yet). Test on dev that consent and token storage work.
2. Push trigger plus sync map, for notes only. Then linked docs.
3. Backfill on connect.
4. Completion pull callable plus the client applying it through the CRDT.
5. Rules tests (map docs aren't readable by the client) and function unit tests for the diff and hash logic.
