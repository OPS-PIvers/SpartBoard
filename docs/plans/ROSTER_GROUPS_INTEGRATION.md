# Roster Groups Integration — Implementation Plan

**Date**: 2026-09-18 · **Branch**: `dev-paul` · **Status**: Draft for product-owner review. The decisions in §3 were settled in a design interview on 2026-09-18, and no code has been written. File paths were verified against `dev-paul` at `4b880aa46`; re-verify them before relying on them.

Teachers can already save named student groups inside the My Classes roster editor. Those groups reach the assignment-targeting pickers but reach **no board widget at all**. This plan wires them into the eight roster-aware widgets, adds a way to generate groups instead of hand-building them, and does both without ever putting a group's name on a projector.

---

## 1. Problem statement

`RosterGroup` was added by M17 A4 and is referenced in exactly three files outside `types.ts`:

- `hooks/useRosters.ts` — load, save, prune
- `components/classes/RosterEditorModal.tsx:607` — `RosterGroupsPanel`, the only authoring surface
- `components/layout/sidebar/SidebarClasses.tsx` — the page that hosts the modal

A teacher can build "Reading Group A" and then find no widget that knows it exists.

### 1.1 What already works (do not rebuild)

- **Assignment targeting already consumes groups.** `AssignStudentPicker.tsx:442` renders saved group chips, and `targetGroupIds` persists on quiz, video-activity, guided-learning, mini-app and flashcard assignment docs. Quiz "assign to Reading Group A" works today. This is **out of scope**.
- **Random and Stations are already live class-aware.** Both read `rosters` / `activeRosterId` from `useDashboard()` and derive names on every render, filtering today's absences. Neither is snapshot-based.
- **Random is the app's real group generator.** `components/widgets/random/groupMaker.ts` holds `makeRestrictedGroups` (`:44`), `makeJigsawExpertGroups` (`:102`), `makeNameGroups` (`:140`), `makeNameGroupsByCount` (`:170`) and `makeRestrictedGroupsByCount` (`:205`), plus drag-and-drop editing, per-name locks, group rename and recolor.
- **Cross-widget group handoff exists.** Random → Stations via `components/widgets/Stations/nexus.ts:39`; Random → Scoreboard via `RandomWidget.tsx:836`.

### 1.2 Constraints found during the interview

These shaped the decisions and are easy to re-derive wrongly later:

- **Three competing group concepts already exist.** `RosterGroup {id, name, studentIds}` (Drive, roster-scoped, persistent); `SharedGroup {id, name, color?}` (`types.ts:7748`, board doc, **membership-free** — a pure label registry); `RandomGroup {id?, names: string[]}` (widget config, **display-name strings**). `Stations/nexus.ts:71` already reverse-resolves names back to student ids through a `Map`, which silently merges duplicate display names.
- **Roster Drive writes are whole-file, last-write-wins, no ETag.** Documented at `hooks/useRosters.ts:600-604`. Two tabs, or a teacher save racing the nightly ClassLink sync, clobber each other.
- **Student names must not reach Firestore for these widgets.** `utils/dashboardPII.ts:19-32` strips `firstNames`, `lastNames`, `remainingStudents`, `lastResult`, `lockedNames`, `unassignedNames`, `doneNames`, `jigsawHomeGroups`, `jigsawExpertGroups` into a Drive supplement. Student **ids** are not stripped — `StationsConfig.assignments` is keyed by `studentId` and persists to Firestore in class mode. **Id-based grouping is the PII-safer design, not merely the tidier one.**
- **Stations has no group entity.** `assignments: Record<studentId, stationId | null>`; stations are name-free containers. `shuffleStudentsIntoStations` (`stationsActions.ts:128`) is plain Fisher-Yates with capacity caps and **zero** constraint awareness — it does not even honor the existing `restrictedStudentIds`.
- **`ScoreboardTeam` already carries `linkedGroupId`** (`types.ts:2142`), pointing at a `SharedGroup.id`, written by `RandomWidget.tsx:836`.
- **`RosterGroup[]` is flat.** Nothing models a partition, and nothing validates coverage or overlap.
- **Poll and Next Up use destructive snapshot imports.** `PollWidget/settingsFields.tsx:249` and `NextUp/Settings.tsx:191` copy names in once and never re-sync. Poll's button carries a `RefreshCw` icon that actively implies otherwise.
- **`APPEARANCE_CONFIG_KEY_LIST`** (`utils/widgetConfigPersistence.ts:14`) is the closed per-user carry-over allowlist. Nothing in this plan goes near it.
- **Firestore rules cannot be tested locally on this machine** (the emulator crashes); rules ship to shared prod on any `dev-*` push. No rules change is expected here.

---

## 2. The privacy constraint

This is a design constraint, not a nicety, and it is the reason several decisions below look indirect.

A group can legitimately be named "Modified Assessments" or "Tier 3 Intervention". Board widgets are projected. **A group's name must never render on a widget's front face**, and it must never leak into a station title or a team name without an explicit, deliberate opt-in.

Consequences, enforced throughout §3:

- The front-face class chip shows a **count**, never a group name.
- Group names appear only in the class-picker popover and the back-face settings panel — both teacher-only.
- Stations/Scoreboard import defaults to generic titles.
- Generated group order is reshuffled so a locked cohort has no positional tell.
- A board-local rename never writes back to the private roster group name, and the reverse never happens either.

---

## 3. Decisions (locked 2026-09-18)

### 3.1 Data model

| #   | Decision          | Choice                                                                                                                                                                                      |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Primary use cases | **Differentiation subsets** and **persistent teams for points**. Explicitly _not_ partitions, and _not_ seating/behavior constraint encoding.                                               |
| D2  | Group shape       | **`RosterGroup` unchanged.** Flat array, multi-select at the point of use, plus a "Split class into N" generator in the roster editor. No Drive schema change, no migration.                |
| D3  | Direction         | **Two-way.** Widgets read groups and can save new ones back. Save always **creates**; it never overwrites or edits an existing group in place.                                              |
| D4  | Identity          | **`RandomGroup` gains `studentIds?: string[]`**, populated only in class mode, alongside the existing `names`. Additive. Makes save-back id-exact and removes the duplicate-name collision. |
| D5  | Group scope       | **Per-widget.** `rosterGroupIds` lives on each widget's own config. The **class** stays global (`setActiveRoster`, unchanged).                                                              |

### 3.2 Roles and controls

| #   | Decision   | Choice                                                                                                                                                                                                                                     |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D6  | Two roles  | **Pool** (who is included) and **Lock** (who stays together). Separate controls — one checkbox meaning two things depending on what else is ticked was rejected as unexplainable.                                                          |
| D7  | Vocabulary | **Reuse the existing lock metaphor.** Random already pins individual names with a lock (`lockedNames`). Extending it from a name to a group teaches no new concept and needs no help text. "Constraints" was rejected as developer jargon. |
| D8  | Placement  | **Pool in the class-picker submenu** (universal, all five roster-aware widgets). **Lock in the back-face settings panel**, rendered only for Random groups/jigsaw mode and Stations.                                                       |
| D9  | Selection  | Pool is single-scope (whole class _or_ a group). Locking is multi-select. Stations' "import N groups → N stations" is a **separate explicit action**, not the pool control.                                                                |

### 3.3 Generation semantics

| #   | Decision            | Choice                                                                                                                                                      |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D10 | Lock meaning        | **Pin as a fixed group, exactly as saved.** The locked members become one output group verbatim; everyone else randomizes into the remaining groups.        |
| D11 | Output order        | **Reshuffled every generation.** Which bucket displays as Group 1/2/3/4 is randomized, so the locked cohort has no positional tell across days.             |
| D12 | Size setting        | **Locked group is exempt.** The size slider governs the unlocked remainder only. Silently splitting the group would defeat the point of locking it.         |
| D13 | Keep-apart conflict | **Lock wins**, with a toast naming the conflict — matching the existing "Couldn't satisfy all restrictions" pattern in `groupMaker.ts`.                     |
| D14 | Jigsaw              | **Home groups only.** A locked group stays intact as a home group; expert groups disperse by round-robin as usual, because dispersal is the whole activity. |
| D15 | Stations Shuffle    | **Honors both constraint kinds** — keep-together _and_ the existing `restrictedStudentIds`, which it ignores today.                                         |

### 3.4 Display and naming

| #   | Decision            | Choice                                                                                                                                                                                                              |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D16 | Front-face chip     | **Count plus a filter glyph** — `Sample 3 · 5 students`. The group name appears only in the picker popover and back-face settings.                                                                                  |
| D17 | Station/team titles | **"Use group names as titles" checkbox at import, default off.** Off → `Station 1–4` / `Team 1–4`. Covers both "Table 1" (name is the point) and "Modified Assessments" (name must never show).                     |
| D18 | Generated names     | **One prefilled, editable name field.** `Teams – Sep 18` → `Teams – Sep 18 (1)…(4)`. Enter to accept mid-class. Dating prevents six indistinguishable sets of "Team 1".                                             |
| D19 | Provenance          | **`SharedGroup` gains optional `rosterGroupId`**, so a locked group keeps its color across re-randomizes. **Renames never propagate in either direction** — the card name is projected, the roster name is private. |

### 3.5 Per-widget behavior

| #   | Decision                                | Choice                                                                                                                                                                                                              |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D20 | Scoreboard                              | **Seed once, then independent, plus an explicit "Re-sync members from class group" action** that preserves scores. Live-tracked membership was rejected: it would silently rewrite who earned what mid-competition. |
| D21 | Poll and Next Up                        | **Group-scope the existing snapshot import; do not convert them to live.** Both are lists teachers reorder and edit by hand; a live class binding would fight that.                                                 |
| D22 | Checklist / Lunch Count / Seating Chart | **Pool filter**, same as Random and Stations. All three are already live class-aware.                                                                                                                               |

### 3.6 Rollout

| #   | Decision     | Choice                                                                                                                                                                                                                                            |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D23 | Kill switch  | **`admin_settings/roster_groups_integration`, ships disabled**, with a row in `components/admin/RolloutSwitchesPanel.tsx` and a feature-permission entry. Follows `plc_note_collab` and `paper_answer_sheets`. Never edited in Firestore by hand. |
| D24 | Write safety | **Re-read, append, write — scoped to the new group-write path.** Fetch the Drive roster file, append to whatever `groups[]` is current, then write. Full ETag support on every roster write is a separate, larger piece of work.                  |

---

## 4. Assumptions

Derived, not interviewed. Each is cheap to reverse; flag any that is wrong before PR 1 merges.

1. The pool filter applies to **every** Random mode, including pick-one's draw-without-replacement pool. Changing the pool resets `remainingStudents`, matching the existing reset on `activeRosterId` change (`RandomWidget.tsx:262-298`).
2. Absences filter **after** the group filter. A 5-student group with 1 absent picks from 4.
3. "Split class into N" uses `makeRestrictedGroupsByCount` (`groupMaker.ts:205`), so it is keep-apart aware, not a plain shuffle.
4. Switching the active class clears stale `rosterGroupIds` — they point at another class's groups. A group deleted out from under a widget falls back to whole class, silently.
5. `rosterGroupIds` is ordinary per-board config and does **not** enter `APPEARANCE_CONFIG_KEY_LIST`. It is roster content, not styling.
6. Nothing enforces coverage or non-overlap on `groups[]`, per D1.
7. Scoreboard's re-sync needs a roster-group reference. `ScoreboardTeam.linkedGroupId` points at a `SharedGroup`, which a direct class-group import does not create — so a direct import needs `linkedRosterGroupId?: string` on `ScoreboardTeam` rather than reusing the existing field. Confirm during PR 3.
8. A locked group whose members are all absent yields an empty bucket, which is dropped rather than rendered.

---

## 5. PR sequence

Four PRs, foundation first, so the one risky Drive write lands early and alone where it is easy to review in isolation.

### PR 1 — Foundation

- `RandomGroup.studentIds?`, `SharedGroup.rosterGroupId?` in `types.ts` (D4, D19).
- Shared group-picker component: class list with a group submenu, count-only display, used by the class chip across all five roster-aware widgets (D8, D16).
- Safe group write in `hooks/useRosters.ts`: re-read, append, write (D24).
- `RosterGroupsPanel` gains "Split class into N groups" with the prefilled name dialog (D2, D18).
- `config/rosterGroupsIntegration.ts` + `RolloutSwitchesPanel` row + feature permission (D23).

Ships dark. No widget behavior changes.

### PR 2 — Randomizer

- Pool filter via `rosterGroupIds` (D5, D22).
- Lock section on the back-face settings panel (D7, D8).
- Locked-group generation: pin verbatim, size-exempt, reshuffled output order, conflict toast (D10–D13).
- Jigsaw restricted to home groups (D14).
- "Save as class groups" with the prefilled dated name (D3, D18).

### PR 3 — Stations and Scoreboard

- Import N groups → N stations, with the title checkbox defaulting off (D9, D17).
- Constraint-aware `shuffleStudentsIntoStations` — keep-together _and_ keep-apart (D15).
- Scoreboard seed-then-independent plus re-sync (D20), resolving assumption 7.

### PR 4 — Remaining widgets

- Pool filter on Checklist, Lunch Count, Seating Chart (D22).
- Group-scoped snapshot import on Poll and Next Up (D21).

---

## 6. Out of scope

- **Assignment targeting** (Quiz / VA / GL / Mini-App / Flashcards). Group chips and `targetGroupIds` already work.
- **ETag / If-Match on roster writes.** `useRosters.ts:600-604` documents that every roster Drive write is whole-file last-write-wins. D24 protects `groups[]` on the new path only; a teacher editing students in one tab still clobbers another, and the nightly ClassLink sync still races teacher saves. That is pre-existing, affects far more than this feature, and belongs in its own piece of work.
- **Converting Poll and Next Up to live class binding** (D21). Their `RefreshCw`-icon-on-a-destructive-replace problem stays open.
- **Group sets / partitions with coverage validation.** Rejected under D1; revisit if partition use cases appear.
- **Migrating Random off display-name strings.** D4 adds ids alongside rather than converting `names`, so `lockedNames`, `doneNames` and the drag handlers keep their current name-keyed behavior.

---

## 7. Verification

Per `CLAUDE.md`, scope local checks to what changed; CI runs the full gates.

- `pnpm exec vitest related --run <changed files>` per PR. Existing suites that will need updating: `groupMaker.test.ts`, `randomEditHelpers.test.ts`, `RandomWidget.test.tsx`, `stationsActions.test.ts`, `Stations/Widget.test.tsx`, `ScoreboardItem.test.tsx`.
- `pnpm run type-check` once per PR — PR 1 touches `types.ts` and shared signatures, so it is required there.
- Browser verification of the privacy behavior is **mandatory before enabling the switch**: confirm that a group named something sensitive renders nowhere on any front face, in any widget, in any mode.
- New unit coverage worth writing: locked-group size exemption (D12), keep-apart conflict reporting (D13), output-order reshuffle (D11), and the re-read/append write under a concurrent group add (D24).
