# My Groups

Source: Paul and Bailey's work list, section D (project thread "My Groups", 2026-10-01).
Status: slice 0 merged (#3710); slice 1 in review. Defaults below are the recommendations Paul was asked to confirm on 2026-10-01.

## Goal

Rename "My PLCs" to "My Groups" and let one group page serve four kinds of team: PLC, department, mentoring, and whole building. Connect team goals to Routine Guide routines so new teachers can read why a practice matters. Building groups fill themselves from login plus building.

## Decisions (defaults until Paul says otherwise)

| #   | Decision                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Keep the `plcs` collection, the `/plc/...` routes and all PLC code names. Only teacher-facing labels change. "PLC" remains a group type name.                                                                                                                                                                                                 |
| D2  | New field `Plc.groupType: 'plc' \| 'department' \| 'mentoring' \| 'building'`. Absent reads as `'plc'`.                                                                                                                                                                                                                                       |
| D3  | Section defaults by type. PLC and department: unchanged. Mentoring and building: Home, Notes & Docs, Resources, Shared Boards, Members, Settings. Assessments, Targets and Meeting are off but a lead can turn them on (existing `features` toggles, extended).                                                                               |
| D4  | Teachers can create PLC, department and mentoring groups. Only admins create building groups, through a callable that names the lead and co-leads (the ILT). Rules block `groupType: 'building'` on a client create.                                                                                                                          |
| D5  | Building group staff join as `viewer` (read and comment). Leads promote anyone who needs to post.                                                                                                                                                                                                                                             |
| D6  | Auto-roster: an admin turns on `autoRoster` for a building group. Anyone in the same org who has signed in and has that building in `selectedBuildings` is added, marked `addedBy: 'autoRoster'`. They are removed automatically only if their building changes and they were auto-added. Hand-added members are never removed automatically. |
| D7  | Goals: subcollection `plcs/{id}/goals`. Each goal has a title, an optional measure, and an ordered list of practices. A practice links to a Routine Guide routine id, with a free-text fallback. Shown as a Home tile; leads and co-leads edit.                                                                                               |
| D8  | Routine Guide gets a Personal / Group switch after that widget merges (owned by the "Instructional routines redesign" thread). The group view lists only the routines the group's goals link, starred ones first. The info pop-up reads the same admin routine record everywhere, so a rationale edit shows up in every place.                |
| D9  | Mentoring: evaluators and the Danielson rubric are out of scope until there is detail.                                                                                                                                                                                                                                                        |
| D10 | Flag: new GlobalFeature `my-groups`, `defaultAccessLevel: 'admin'`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'retire'`. With the flag off, teachers see today's PLC page unchanged, and the server ignores `groupType` for them (a building group is never visible to someone outside it anyway).                         |

## Slices

Each slice is its own PR into `dev-paul`. UI slices get a screenshot mockup approved by Paul before merge.

0. **PLC graph shows on load** (bug fix, no flag). Root cause and fix in the PR.
1. **Group type and rename** (flag). `groupType` on the type and parser; rules: create accepts `groupType` in `['plc','department','mentoring']`, immutable after create except by the admin branch; reads and writes rules tests. Sidebar, hub and create modal labels switch to "My Groups" under the flag; create modal gets a type picker; hub rows show the type. Section defaults by type (D3). Mockup first.
2. **Admin building groups** (flag). Callable `createBuildingGroupV1` (admin of the org; sets lead, co-leads, `buildingId`, `autoRoster`); View as guard and `CALLABLE_MODES` row. Admin UI in Admin Settings next to the existing PLC admin tools. Mockup first.
3. **Auto-roster** (server, behind `autoRoster` per group). Firestore trigger on `users/{uid}/userProfile/profile` that diffs `selectedBuildings` and adds or removes the user in matching building groups of their org. Backfill callable run when an admin creates or turns on auto-roster: collection-group query on `userProfile` where `selectedBuildings` array-contains the building, filtered to the org. Index added. Member records carry `addedBy`.
4. **Goals** (flag). Type, parser, hook, rules (members read; lead/co-lead write) with read and write tests, Home tile, editor in Settings. Practice picker reads Routine Guide routines once that collection exists; free text until then. Mockup first.
5. **Routine Guide group view** (flag, after Routine Guide merges). Personal / Group switch, group stars, preview-on-board and read-rationale actions. Coordinate with the Routine Guide thread through the coordinator; do not edit its files while it is open.
6. **Building page resources** (flag, if needed after slice 2 is in use). Add Guided Learning and plain links to the Resources kinds so an ILT can point staff at an experience or a strategy share.

## Open

- Who talks to Jess Hoblin about new-teacher and mentoring content (owner unconfirmed in the work list).
- Danielson rubric details for evaluators (D9).
- Whether department groups should differ from PLC at all, or are just a label.

## Release

All teacher-facing parts sit behind `my-groups`. Paul opens it in Admin Settings > Access > Previews > My Groups > Public after testing on prod. The flag row must be saved once before even admins see it. Changelog entry when it opens.
