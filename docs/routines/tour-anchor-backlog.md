# Tour anchor sweep backlog

Progress record for the tour anchor mapper's sweep (`docs/routines/tour-anchor-mapper.md`, "Sweep"). When the queue has nothing to map, the routine tags existing teacher-facing controls that have no live-tour anchor, a batch per run, so tours can point at them before anyone records one.

The code is the source of truth for what is left: `node scripts/listUnanchoredControls.ts` lists every `button`, `input`, `select`, `textarea`, tab, menu item and switch in a teacher-facing file with no anchor and no `no-tour-anchor` comment (the same rules as the `Live Tour Anchors` PR check). A control drops off the list once it is tagged or opted out, so this file only records the order, the decisions the code can't hold, and the run log.

## Order

Work the first area that still has controls listed, finishing whole files before starting the next area. Pass the area's prefixes to the script to see only that area.

1. **Widgets:** `components/widgets/` (widget faces and their settings panels).
2. **Board chrome:** `components/layout/`, `App.tsx`, `components/settings/`, `components/settingsModal/`, `components/backgroundsModal/`.
3. **Shared pieces:** `components/common/`. A control here renders on many surfaces, so one fixed id is only right when it means the same thing everywhere (a shared dialog's Close). Otherwise add a prop the callers pass to `tourAttr`, or defer the control.
4. **Library and assigning:** `components/quiz/`, `components/flashcards/`, `components/activityWall/`, `components/videoActivity/`, `components/classes/`, `components/share/`, `components/schoology/`, `components/spotify/`.
5. **Teams:** `components/plc/`.
6. **Admin:** `components/admin/`.
7. **Outside the board:** `components/auth/`, `components/subs/`, `components/remote/`, `components/viewAs/`. Live tours only run on the teacher board, so these get a `no-tour-anchor: <why>` comment rather than an anchor, after confirming the screen never shows on the board.
8. Anything else the script still lists.

## Deferred

Controls the sweep looked at and left for Paul, so later runs don't retry them. Remove a row once it is resolved.

| File:line | Control | Why |
| --------- | ------- | --- |

## Run log

`Remaining` is the script's total after the run's changes.

| Date | PR | Area | Tagged | Opted out | Deferred | Remaining |
| ---- | -- | ---- | ------ | --------- | -------- | --------- |
| 2026-10-19 | (baseline) | | | | | 801 in 325 files |
