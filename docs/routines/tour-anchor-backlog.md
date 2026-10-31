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
| components/widgets/Checklist/settingsFields.tsx:117 | Paste tasks textarea | A real control inside a custom settings field; unclear whether a tour would target it or the field row. |
| components/widgets/InstructionalRoutines/ConfirmDialog.tsx:77 | Cancel and Confirm buttons | Shared confirm dialog used from the board and the admin library; one fixed id would mean different things. |
| components/widgets/InstructionalRoutines/PromptDialog.tsx:86 | Prompt textarea, Cancel and Submit buttons | Shared prompt dialog; same reason as ConfirmDialog. |
| components/widgets/InstructionalRoutines/IconPicker.tsx:40 | Close and icon option buttons | Shared picker used by the template editor and settings; needs a caller-supplied anchor. |
| components/widgets/LiveControl.tsx:156 | Live toggle, student count, menu close, Freeze All | Shared by several widgets; needs a caller-supplied widget type and anchor ids. |
| components/settingsModal/sections/AppearanceSection.tsx:59 | Reset button in each color row | One shared control for three color rows; the anchor would need a per-row key. |
| components/settingsModal/sections/ConnectedAppsSection.tsx:193 | Disconnect button | One per connected app, generated per row. |
| components/widgets/GuidedLearning/components/recorder/ | Tour recorder panel, frame review and session controls | Authoring tool for recording tours; unclear whether a tour would ever walk a teacher through it. |
| components/backgroundsModal/BackgroundThumbnail.tsx:21 | Background select and favorite buttons | One per catalog item, generated; needs an index or id prop from every caller to key them. |

## Run log

`Remaining` is the script's total after the run's changes.

| Date | PR | Area | Tagged | Opted out | Deferred | Remaining |
| ---- | -- | ---- | ------ | --------- | -------- | --------- |
| 2026-10-19 | (baseline) | | | | | 801 in 325 files |
| 2026-10-20 | claude/tour-anchors-2026-10-20 | Widgets (ActivityWall editor, ArtsLettersAgenda, BloomsTaxonomy, Calendar, ConceptWeb, Countdown) | 5 | 16 | 1 | 779 in 313 files |
| 2026-10-21 | claude/tour-anchors-2026-10-21 | Widgets (Classes roster editor, CustomWidget blocks) | 7 | 21 | 0 | 744 in 310 files |
| 2026-10-22 | claude/tour-anchors-2026-10-22 | Widgets (Drawing, Guided Learning player, studio and editors) | 0 | 21 | 1 area | 720 in 295 files |
| 2026-10-23 | claude/tour-anchors-2026-10-23 | Widgets (HotspotImage, InstructionalRoutines, LunchCount) | 8 | 11 | 4 files | 699 in 287 files |
| 2026-10-24 | claude/tour-anchors-2026-10-24 | Widgets (MaterialsWidget, MathToolInstance, MiniApp, NeedDoPutThen) | 8 | 22 | 0 | 669 in 280 files |
| 2026-10-25 | claude/tour-anchors-2026-10-25 | Widgets (Onboarding, PdfWidget, PollWidget, Projects, QuizWidget through StartReviewModal) | 12 | 19 | 0 | 634 in 259 files |
| 2026-10-26 | claude/tour-anchors-2026-10-26 | Widgets (QuizWidget legacy monitor, RevealGrid, Schedule, Scoreboard, SmartNotebook, Soundboard, SpecialistSchedule, StarterPack) | 6 | 19 | 0 | 609 in 246 files |
| 2026-10-27 | claude/tour-anchors-2026-10-27 | Widgets (Stations, TextWidget, TimeTool, UrlWidget, Weather, Webcam, RotationHandle) | 21 | 7 | 0 | 581 in 235 files |
| 2026-10-28 | claude/tour-anchors-2026-10-28 | Widgets (math-tools, Random, StickerBook) | 14 | 3 | 0 | 35 in 8 files |
| 2026-10-29 | claude/tour-anchors-2026-10-29 | Board chrome (layout, Profile & Settings sections) | 0 | 20 | 2 | 539 in 213 files |
| 2026-10-30 | claude/tour-anchors-2026-10-30 | Board chrome (Backgrounds window) | 11 | 2 | 1 file | 525 in 207 files |
| 2026-10-31 | claude/tour-anchors-2026-10-31 | Board chrome (settings field renderer and window style schema) | 0 | 21 | 0 | 504 in 193 files |
