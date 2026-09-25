# Starred-Class Dependence — Audit and Follow-up Plan

Status: decisions locked 2026-09-25 (grill). Not built — 4 PRs below.
Origin: the Projects redesign (`PROJECTS_WIDGET.md` §10, D32) removed Projects' dependence on the
global starred class. Paul: "anything roster-dependent has a class picker on the widget itself",
and the Classes widget is effectively unused.

## What the star is

`activeRosterId` — set by the star in `SidebarClasses.tsx:563`, `ClassRosterMenu.tsx:113-131` and
`ClassesWidget.tsx:94,173`; stored in localStorage `spart_active_roster_id` (`useRosters.ts:598-600,
1263-1267`).

- **Never auto-set**, not even when a teacher has exactly one roster.
- **Per device, not per user**: the key isn't namespaced, so two teachers sharing a device share it.
- **Can go stale**: a roster deleted on another device leaves a non-null id that resolves to nothing.
- `ActiveClassChip` (`components/common/ActiveClassChip.tsx:174`) returns `null` when no class is
  active, so the in-widget switcher disappears exactly when a class needs picking.
- `RosterPicker` (settings field) shows "no class" when null with no dropdown.

## Consumers

### Depend only on the star (no picker of their own; null = dead end or misleading message)

| Widget                  | Where                                                                                                                                             | When null                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Randomizer              | `random/RandomWidget.tsx:282-343`, settings `random/settingsFields.tsx` (group count, import, Stations/Projects push, locked groups, save groups) | "No Names Provided / flip to enter your roster"; pushes refuse |
| Seating Chart           | `SeatingChart/Widget.tsx:128-156`                                                                                                                 | Empty pool shown as "All assigned!" — wrong message            |
| Checklist (roster mode) | `Checklist/Widget.tsx:43-66`                                                                                                                      | "Roster Empty / flip to enter names" — wrong message           |
| Poll (import options)   | `PollWidget/settingsFields.tsx:177-398`                                                                                                           | Import disabled                                                |
| NextUp (import queue)   | `NextUp/settingsFields.tsx:35-322`                                                                                                                | Error toast                                                    |

### Silently fall back to `rosters[0]`

| Widget                     | Where                                  | Problem                                                                |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Stations                   | `Stations/Widget.tsx:80-86`            | Uses first roster; chip hidden, so no class shown and no way to switch |
| Lunch Count                | `LunchCount/Widget.tsx:349-367`        | Same; the cafeteria report counts whichever class is first             |
| Scoreboard (import groups) | `Scoreboard/settingsFields.tsx:77-128` | Imports from first roster                                              |

### Outside widgets

- **Sub shares.** `utils/subShareSnapshot.ts:90-95` shares the starred roster plus ids remembered in
  widget configs. `ShareLinkCreatorModal.tsx:138,306-317` shares **only** the starred roster; with
  no star a sub gets no class and the teacher isn't warned.
- **Assign pickers** (Quiz, VA, GL, MiniApp) already have their own picker
  (`AssignStudentPicker.tsx:88-127`) — no change needed.
- `RosterModeControl.tsx` appears dead.

## Decisions (grilled 2026-09-25)

### End state

- **S1. The star is retired completely.** Nothing reads `activeRosterId` once the flag opens:
  the sidebar star (`SidebarClasses.tsx:563`), the dock toggle (`ClassRosterMenu.tsx:113-131`),
  the Classes widget, `setActiveRoster`, and `spart_active_roster_id` in localStorage all go in
  PR 4. This also removes the per-device (not per-user) star bug.
- **S2. Every live-roster widget stores its own class**, as a content config key (per board, never
  in `APPEARANCE_CONFIG_KEYS`): `rosterId?: string | null`. Live-roster widgets are those that
  read the roster continuously: **Randomizer, Seating Chart, Checklist (roster mode), Stations,
  Lunch Count**.
- **S3. The board remembers a default class**: `Dashboard.defaultRosterId?`, set to the class most
  recently picked by any widget on that board. A new roster widget starts on it; with no board
  default it starts on the teacher's only roster; otherwise it shows "Pick a class".
- **S4. One controlled chip.** `ActiveClassChip` gains `rosterId` / `onSelectRoster` props
  (following the existing `groupSelection` pattern) and **never returns `null`** — with no class it
  renders a "Pick a class" button. Every live-roster widget shows it on its front face.
  `RandomClassContextButton` folds into it. With the flag off, the chip keeps reading the global.
- **S5. Import-only widgets get no chip.** Poll (import options), NextUp (import queue) and
  Scoreboard (import class groups) use a class once; their import action gets a class dropdown
  defaulting to the board's class. `RosterPicker` (settings field) is replaced by the same dropdown
  where it remains.
- **S6. Switch-all toast.** Switching one widget's class switches only that widget and shows a toast
  "Switch the other N widgets too" (N = other live-roster widgets on the board on a different
  class, plus Projects when its run contains the class). Accepting also updates the board default.
  Never silent, never forced.
- **S7. Switching clears everything class-scoped**, on every path (chip, toast, settings): for the
  Randomizer `lastResult`, `remainingStudents`, jigsaw groups, `lockedNames`, `unassignedNames`,
  `doneNames`, `lockedRosterGroupIds`, `rosterPoolGroupId`; for Lunch Count and Checklist their
  `rosterPoolGroupId`. Today the pool only clears via the chip (`ActiveClassChip.tsx:336`).
- **S8. Migration: keep what each widget shows today.** On first load with the flag on, a
  live-roster widget in class mode with no `rosterId` stamps this device's star (if it resolves to a
  roster), else the only roster, else stays unset. The board default is seeded the same way. A
  wrong stamp on a shared device is visible on the chip and one tap to fix.
- **S9. The Classes widget is retired.** Removed from the dock catalog in PR 4; existing instances
  render a one-line "Classes moved to the sidebar" card with an Open sidebar button. Everything it
  did besides starring already lives in the sidebar.
- **S10. Lunch Count's report is unchanged.** The cafeteria Apps Script parses the
  `"{lunchTime} - {Grade} - {Teacher}"` label (`LunchCount/Widget.tsx:535`); only the roster source
  changes.
- **S11. Sub shares bundle every class the board uses**: each widget's `rosterId`, the board's
  `defaultRosterId`, and the existing `lastRosterIdsBy*` maps. `collectShareRosterIds`
  (`utils/subShareSnapshot.ts:90-111`) must read the new keys explicitly — a plain string never
  matches the `lastRosterIdsBy*` regex. All three share dialogs (`ShareWithSubModal`,
  `ShareLinkCreatorModal` — which today bundles only the star — and
  `ShareCollectionLinkCreatorModal`) list the collected classes with checkboxes, all on, and warn
  when the board uses none. Rosters without a `driveFileId` stay excluded (`useSubShares.ts:168`).
- **S12. Assign pickers are unchanged.** Quiz / Video Activity / Guided Learning keep
  `AssignStudentPicker`'s current first-roster default.
- **S13. Projects joins the board default.** A Projects board with no `boardClassId` starts on the
  board default when the run contains it (`projectClassIdFor` maps roster → class id), and it takes
  part in the S6 toast. Its picker still lists only the run's classes.
- **S14. Absent marking follows the widget.** `AbsentButton` already takes a `roster` prop; Stations
  and the Randomizer pass their own roster instead of the starred one.

### Delivery — 4 PRs into `dev-paul`

Flag: `GlobalFeature` id `per-widget-class` in `types.ts` + `config/featureDefaults.ts` with
`defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`. Every new path
checks `canAccessFeature('per-widget-class')`; flag off = today's star behavior.

1. **PR 1 — empty states (no flag, bug fix).** Seating Chart shows "All assigned!" /
   "All students are already assigned!" when there is no class (`SeatingChartSidebar.tsx:203-205`,
   `SeatingChart/Widget.tsx:803-804`); Checklist says "flip to enter names"
   (`Checklist/Widget.tsx:174-187`); Randomizer says "No Names Provided" (`RandomWidget.tsx:1705-1756`).
   Each gets an honest "No class selected" state with a pick-class action (the current global
   picker until PR 2). Delete dead `RosterModeControl.tsx` if still unused.
2. **PR 2 — per-widget class (flag).** S2–S4, S6–S8, S14: controlled `ActiveClassChip`, `rosterId`
   on the five live-roster widget configs, `Dashboard.defaultRosterId`, the toast, the class-switch
   reset, and the migration stamp. A shared hook (e.g. `useWidgetRoster(widget)`) resolves
   `rosterId` → roster with the flag check, so each widget changes in one place.
3. **PR 3 — shares, imports, Projects (flag).** S5 import dropdowns, S11 share bundling with the
   class list, S13 Projects hookup.
4. **PR 4 — cleanup (after Paul opens the flag to Public).** S1 and S9: remove the star UI,
   `activeRosterId`/`setActiveRoster`, the localStorage key, the flag checks, the Classes widget's
   catalog entry (leaving the moved-to-sidebar card), and `RandomClassContextButton`.

Changelog: one entry when the flag opens to Public, written for teachers (no flag or field names).

### Out of scope

Changing the Lunch Count report format; the assign-picker default; a per-user (Firestore) star.
