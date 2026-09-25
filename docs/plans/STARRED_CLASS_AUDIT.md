# Starred-Class Dependence — Audit and Follow-up Plan

Status: audit only (2026-09-25). No decisions taken yet; grill before building.
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

## Proposed direction (to grill)

1. **Every roster widget stores its own `rosterId`** in config (per board — content, never an
   appearance key), shown and switchable by an always-visible class chip on the widget face.
   The chip renders a "Pick a class" button instead of returning `null`.
2. **Default for a new widget**: the only roster when there is one; otherwise the class this board
   last used; otherwise an explicit picker. The star stops being consulted.
3. **Fix the misleading empty states** in Seating Chart and Checklist regardless.
4. **Sub shares** collect each widget's own `rosterId` instead of the star.
5. **Retire the star** (sidebar star, Classes widget "active" concept, `activeRosterId` in context)
   once nothing reads it, or keep it only as the default for new widgets. Open question.

Open questions for the grill: one PR per widget or one sweep; migrate existing widgets by stamping
the current star into their config on first load (per device, so possibly wrong on a shared device);
whether the Classes widget survives at all; whether Lunch Count's report should pick classes
explicitly.
