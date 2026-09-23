# PLC Home v2: A Tile Dashboard With a Spotlight — Implementation Plan

**Date**: 2026-09-22 · **Branch**: `dev-paul` · **Status**: Revised after a review pass the same day. Decisions in §2 were settled in two design interviews on 2026-09-22 (the second one cut team layouts, the admin defaults panel, Recharts and five catalog tiles, and fixed the layout storage and "new results" signal). No code has been written. File paths and line numbers were read at `bc36f57e6`; re-verify before relying on them.

The PLC Home page should read as a dashboard a teacher never has to puzzle over: the team's
results, its next meeting, what they owe and what changed, laid out as visual tiles. Home is for
looking and navigating, not for creating things. Any tile can be spotlighted to become the hero.

---

## 1. What exists today

`components/plc/home/PlcHome.tsx` renders, top to bottom:

- **Header**: PLC name, the filler subtitle "Your collaborative space", `MembersHeaderCluster`
  (up to 6 avatars + "Members (n)"), `PlcPresenceStrip` ("Who's here"), then `QuickCreateBar`.
- **`CommonAssessmentBanner`**: a full-width strip for the featured common assessment (status
  phase, "X of N ran it", Start/Resume Meeting). When none exists it is a mostly empty bar
  ("No common assessment yet").
- **Two columns**: `SinceYouWereHereCard` + `AttentionCard` ("Active assignments") on the left;
  `YourActionItemsCard`, `RecentDocsCard`, `PlcActivityFeed` on the right.

Problems:

- **Duplication.** Members appear three times (chrome count `PlcDashboard.tsx:109`, the
  cluster, the presence strip). Activity appears twice: `SinceYouWereHereCard` and
  `PlcActivityFeed` render the same `PlcActivityRow`s from the same 50 events. Result counts
  appear in both the banner and the AttentionCard pill.
- **Quick-create is misplaced.** Assign quiz / Assign video activity / Add a doc duplicate
  actions that belong in Assessments and Notes & Docs. It also opens `useQuiz(uid)` and
  `useVideoActivity(uid)` library listeners on every Home visit just to compute disabled
  reasons (`QuickCreateBar.tsx:70-72`).
- **Empty space.** The banner and Active assignments card spend full-width real estate on
  empty states.
- **Nothing visual.** Every card is a list. The results data needed for charts is already
  loaded and unused.
- **Extra listeners.** `notes`, `docs` and `meetings` slices are gated off `home` in
  `context/PlcContext.tsx:122-153`, so `YourActionItemsCard` (`usePlcNotes`), `RecentDocsCard`
  (`usePlcDocs`) and `CommonAssessmentBanner` (`usePlcMeetings`) each open a standalone
  full-collection listener. `AttentionCard` reads `assignment_index` with no limit
  (`hooks/usePlcAssignmentIndex.ts:121`).

### 1.1 Data available without new reads

Live on Home already (provider slices gated to `home`, or always on):

- `usePlcAssessmentsData` / `usePlcAggregatesData` (`context/usePlcContext.ts`).
  `PlcAssessmentAggregate` (`types.ts:994-1063`) gives, per assessment: `teamAveragePercent`,
  `studentCount`, `scoredStudentCount`, `teacherCount`, `ranAt`, `perQuestion[]`
  (`correctPercent`, `choiceDistribution[]`), `perTarget[]` / `perStandard[]`
  (`correctPercent`, `attempted`, `lowSample`, `code`, `label`; schema 3+, `types.ts:971-982`)
  and `perTeacher[]` (`averagePercent`; shown only when `features.showPerTeacher`,
  `types.ts:360`).
- `usePlcMembers`, `usePlcWhoIsHere` (presence carries the member's section), `usePlcActivity`
  (newest 50), `usePlcRootDoc`.

Not available, by design: per-student score distributions (FERPA boundary). Targets carry no
mastery numbers of their own; mastery exists only inside each assessment's aggregate.

`ranAt` is **not** a "new results" signal. `recomputePlcAssessments` runs every 5 minutes on any
assessment marked dirty by a session or response write (`functions/src/recomputePlcAssessments.ts:315`,
`markPlcAssessmentDirty.ts`), and schema backfills rewrite old aggregates, so `ranAt` moves
throughout any live quiz.

Meetings (`PlcMeeting`, `types.ts:1075-1122`) only exist once started (`in-progress` /
`completed`). Meeting Mode creates the doc lazily with `createMeeting({ assessmentIds: [] })`
(`PlcMeetingMode.tsx:189-208`); `createMeeting` already accepts an optional `agenda`
(`context/PlcContext.tsx:1075`). The `Plc` type has no schedule or cadence.

Roles: `PlcRole` is `lead | coLead | member | viewer`. The rules helper
`isPlcMembershipManager` and the client helper `isPlcLeadOrCoLead` (`utils/plc.ts:113`) both
mean lead or co-lead. The lead's broad PLC-doc update branch accepts any key; co-leads have no
path to write arbitrary PLC-doc fields.

Reusable selectors: `weakestQuestions`, `buildAssessmentCards`
(`components/plc/sharedData/sharedDataSelectors.ts`), `aggregateStatus`, `sortWorstFirst`
(`components/plc/assessments/assessmentListSelectors.ts`), `buildCommonAssessmentBanner`
(`cards/commonAssessmentBannerSelectors.ts`), the mastery bands in `PlcAssessmentDetail.tsx`
(`MASTERY_BAR_CLASS`), and `selectMyActionItems` (`cards/yourActionItems.ts`).
`@dnd-kit/sortable` is installed (`package.json:66`).

---

## 2. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Home is a **balanced overview of tiles**. No single fixed hero.                                                                                                                                                                                                                                                                                                    |
| D2  | Every tile has a **spotlight** button in its corner. The spotlighted tile becomes the **hero**: full width on top, showing its expanded view. All other tiles render in their **compact** view beneath.                                                                                                                                                            |
| D3  | The hero view is a **bigger read-only summary plus a deep link** ("Open Assessments →"). No editing inside tiles, except the existing inline "done" checkbox on action items. Home never becomes a second copy of each section.                                                                                                                                    |
| D4  | **Hero priority**: a meeting in progress; else the viewer's spotlighted tile; else a smart default (Meeting on meeting day until today's meeting is done, D26; else Results when there are new results, D27); else no hero (even grid). Removed tiles are skipped.                                                                                                 |
| D5  | **Remove the quick-create bar.** Creating things happens in Assessments and Notes & Docs.                                                                                                                                                                                                                                                                          |
| D6  | **Remove the Common Assessment banner** as a separate strip. Its status (who ran it, ready to review, meeting CTA) folds into the Results tile.                                                                                                                                                                                                                    |
| D7  | **Remove the Active assignments card.** Live assignments fold into the Results tile as compact rows; when there are none, they take no space.                                                                                                                                                                                                                      |
| D8  | **Header is just the PLC name** on the left and **one avatar cluster** on the right (online members get a green ring and a tooltip with the section they are in), plus the Customize button. Delete the subtitle, `PlcPresenceStrip` on Home, and the second members cluster.                                                                                      |
| D9  | **Core tiles**: Results, Meeting, Action items + activity, Docs & notes. They are the hardcoded starter set for every member.                                                                                                                                                                                                                                      |
| D10 | **Results tile** charts mastery by learning target. It falls back automatically: targets → standards (when questions are tagged with standards only) → weakest questions on the latest common assessment plus participation. The fallback shows a one-line hint linking to Learning Targets.                                                                       |
| D11 | Each target's bar shows its **latest assessment's** `correctPercent`, not a mean across assessments. Only targets whose latest assessment ran **this school year** (since Aug 1, Central) are shown. No window setting on the tile.                                                                                                                                |
| D12 | **Low-sample** targets (`lowSample`, under 5 graded answers) are shown **muted with a "few answers" tag**, never colored as struggling or proficient, and sort last in worst-first order.                                                                                                                                                                          |
| D13 | **Action items + activity** replaces `YourActionItemsCard`, `SinceYouWereHereCard` and `PlcActivityFeed`: what I owe first, then what changed since my last visit.                                                                                                                                                                                                 |
| D14 | A **catalog** ("+ Add tile") offers two extra tiles in v1: `participation` and `perTeacher`. Other chart tiles wait until someone asks for them.                                                                                                                                                                                                                   |
| D15 | The **per-teacher** tile appears in the catalog only when the PLC has `features.showPerTeacher` on.                                                                                                                                                                                                                                                                |
| D16 | **All tiles are removable**, core tiles included. Zero tiles shows a "Customize to add tiles" state.                                                                                                                                                                                                                                                               |
| D17 | **Personal layouts only.** Each member (viewers included) arranges their own Home and picks their own hero. No team layout, no team hero, no admin default mode, no admin starter-tile panel.                                                                                                                                                                      |
| D18 | A **spotlight sticks** until the member unspotlights it; it is saved as `heroTileId` on their layout doc. There is no separate "this visit" spotlight.                                                                                                                                                                                                             |
| D19 | **Trend marker**: a target shows ▲/▼ when its latest and previous assessments differ by at least 5 points and neither is low-sample. Otherwise no marker.                                                                                                                                                                                                          |
| D20 | Rearranging happens in a **Customize mode**: a header button toggles it; drag to reorder with `@dnd-kit/sortable` (keyboard sensor on: space to lift, arrows to move), × to remove, "+ Add tile" opens the catalog, Done exits. Outside Customize, only the spotlight button shows.                                                                                |
| D21 | **Lead and co-leads** manage PLC-wide Home settings (the meeting cadence). Members and viewers see the cadence but cannot edit it.                                                                                                                                                                                                                                 |
| D22 | **Meeting cadence**: a lead or co-lead sets a recurrence in PLC Settings (weekly, every 2 weeks, or monthly on the Nth weekday; day, time, optional default agenda). From the Meeting tile they can **move or skip just the next occurrence**. The next date is computed client-side; no scheduled function. The default agenda seeds `createMeeting({ agenda })`. |
| D23 | **No charting library in v1.** Bars are divs using the existing mastery band classes; the participation ring is one SVG arc. Recharts (lazy-loaded) comes in only with the first line-chart tile.                                                                                                                                                                  |
| D24 | Ships behind a new **`plc-home-v2` GlobalFeature** at access level `admin`. The old Home stays for teachers until Paul opens it.                                                                                                                                                                                                                                   |
| D25 | Personal layouts live on **`/users/{uid}/plc_layouts/{plcId}`**, reusing the existing owner-only rule, not on `plc_state` (whose `markSeen` overwrites the whole doc).                                                                                                                                                                                             |
| D26 | The **meeting-day auto hero ends** once a `completed` meeting exists for today's occurrence, or 2 hours after the scheduled start when nobody started one.                                                                                                                                                                                                         |
| D27 | **"New results"** means an assessment's `scoredStudentCount` is higher than the count saved on the member's last Home visit, or its phase newly reached ready-to-review. The saved counts live on the layout doc (`seenCounts`). `ranAt` is never used for this.                                                                                                   |
| D28 | **"Assign from my library"** is added to the Assessments header, behind the same `plc-home-v2` flag, so the old Home keeps quick-create and nobody ever has zero paths to `PlcNewQuizAssignmentModal`.                                                                                                                                                             |

---

## 3. Layout

- **Header** (D8): `h2` PLC name (truncate), right side: avatar cluster, Customize button.
  The dashboard chrome's member count (`PlcDashboard.tsx:109`) stays; it is outside Home.
- **Hero** (when one resolves, D4): full width, tile's `hero` view, tile's spotlight button reads
  "Unspotlight". The hero tile is not repeated in the grid.
- **Grid**: compact tiles in `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`, `gap-5`, in the
  member's order. Compact tiles share a min height so rows stay even.
- **Narrow widths**: hero then compact tiles, single column.
- Normal Tailwind sizing (modal chrome, not a widget face). Keep the existing light surfaces
  and brand tokens; the finish pass should run the `impeccable` / `deslop --ui` review.

### 3.1 Tile contract

```ts
type PlcHomeTileKind =
  | 'results'
  | 'meeting'
  | 'actionsActivity'
  | 'docs'
  | 'participation'
  | 'perTeacher';

type PlcHomeSlice = 'notes' | 'docs' | 'meetings';

interface PlcHomeTileInstance {
  id: string; // uuid; a kind can be added more than once
  kind: PlcHomeTileKind;
  options?: PlcHomeTileOptions; // per-kind, e.g. assessmentId for perTeacher
}

interface PlcHomeTileDef {
  kind: PlcHomeTileKind;
  labelKey: string;
  icon: LucideIcon;
  slices: PlcHomeSlice[]; // provider opens only these while Home is active (§6)
  isAvailable: (ctx) => boolean; // D15 per-teacher gate
  Compact: React.FC<TileProps>;
  Hero: React.FC<TileProps>;
  Settings?: React.FC<TileSettingsProps>; // popover
  heroScore?: (ctx) => number; // smart default (D4)
  sectionLink?: PlcSectionId; // deep link (D3)
}
```

Registry in `components/plc/home/tiles/registry.ts`. Each tile's data shaping lives in a pure,
unit-tested selector file next to it (the repo pattern: `*Selectors.ts` + `.test.ts`).

---

## 4. Tiles

Every chart tile is built from `usePlcAggregatesData` + `usePlcAssessmentsData`, so none adds
Firestore reads.

| Kind              | Compact                                                                                                              | Hero                                                                                                                                                        | Options                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `results`         | Latest common assessment chip (phase, "3 of 4 ran it"), top 3 weakest targets as mastery bars, live-assignment count | All targets this school year (worst first) with trend markers, latest assessment status + Start/Resume Meeting, live assignments list (≤5) with sheet links | —                                            |
| `meeting`         | Next meeting ("Thu 3:15 · in 2 days") or "In progress" + Resume; last meeting's open action item count               | Next meeting + agenda, Start/Resume, last meeting's decisions and action items; lead/co-lead sees Move / Skip next                                          | —                                            |
| `actionsActivity` | My open action items count + top 2; "N new since your visit"                                                         | Full my-items list with done checkboxes, then since-you-were-here and earlier activity                                                                      | —                                            |
| `docs`            | 3 newest docs/notes                                                                                                  | 8 newest with author and time                                                                                                                               | —                                            |
| `participation`   | "N of M teachers ran it" ring for the latest assessment                                                              | Ran/not-ran count per assessment this school year (no names unless `showPerTeacher`)                                                                        | —                                            |
| `perTeacher`      | Bars of class averages                                                                                               | Same, with class counts                                                                                                                                     | assessment; only when `showPerTeacher` (D15) |

Cut from the original catalog, to add on request: `masteryByTarget` and `weakestQuestions`
(Results already covers them), `teamAverageByAssessment` (it compares different tests),
`targetOverTime` and `choiceBreakdown` (each needs a picker before it shows anything).

### 4.1 Results rollup (D10–D12, D19)

New pure selector `latestTargetMastery(aggregates, assessments, { now, dimension })`:

- For each target id, collect its `perTarget` (or `perStandard`) rows across aggregates, ordered
  by the assessment's run date. Use the assessment's own date, not `ranAt` (see §1.1); confirm
  the right field on `PlcCommonAssessment` during build.
- The bar is the **latest** row's `correctPercent` and `lowSample`. Keep only targets whose latest
  row is on or after `schoolYearStart(now)` (Aug 1, America/Chicago).
- Trend: compare latest with previous; emit `'up' | 'down' | null`, with `null` when the change is
  under 5 points or either row is `lowSample` (D19).
- Fallback order: any `perTarget` rows → targets; else any `perStandard` rows → standards; else
  `weakestQuestions` on the latest aggregate plus participation. Return a `mode` field so the
  tile renders the right view and hint.
- Band with the PLC's `masteryCutoffs` (`utils/learningTargets.ts:37`), reusing the existing
  mastery colors. Learning targets are needed only for cutoffs (rows already carry `code` and
  `label`); read `plcs/{plcId}/meta/learningTargets` via `usePlcLearningTargets` only when the
  Results tile is on the layout.

### 4.2 Hero resolution (D4, D18, D26, D27)

`resolveHero({ tiles, heroTileId, ctx })`:

1. A meeting is `in-progress` and a `meeting` tile is present → Meeting.
2. `heroTileId` names a present tile → that tile.
3. The highest positive `heroScore` among present tiles: Meeting scores on meeting day until
   D26 ends it; Results scores when D27 finds new results.
4. Otherwise no hero.

The frozen-cursor logic from `PlcHome.tsx:55-68` moves with `actionsActivity`. Freeze
`seenCounts` the same way on mount (prev-prop pattern), so writing the new counts during the
visit does not immediately clear the Results hero.

---

## 5. Data model

### 5.1 Personal layout: `/users/{uid}/plc_layouts/{plcId}`

```ts
interface PlcHomeLayoutDoc {
  tiles: PlcHomeTileInstance[];
  heroTileId?: string | null;
  seenCounts?: Record<string, number>; // assessmentId → scoredStudentCount at last visit
  updatedAt: number;
}
```

- Missing doc → the hardcoded starter set (`results`, `meeting`, `actionsActivity`, `docs`), no
  hero. The doc is created on the first Customize, spotlight or seen-counts write.
- Extend the existing rule (`firestore.rules:576`): `hasOnly(['tiles', 'heroTileId',
'seenCounts', 'updatedAt'])`, `heroTileId` null or string, `seenCounts` a map with a size cap.
  Keep the `tiles.size() <= 50` cap and extend `tests/rules/plcOverviewAndContent.test.ts`.
- `seenCounts` is written once per Home visit, next to `markSeen()`, with `merge: true`. Prune
  keys for assessments that no longer exist on the same write.
- `plc_state` and its rule are untouched.

### 5.2 Meeting cadence, on the PLC doc (lead or co-lead)

```ts
interface Plc {
  // ...
  meetingCadence?: {
    frequency: 'weekly' | 'biweekly' | 'monthlyNthWeekday';
    weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    nth?: 1 | 2 | 3 | 4 | -1; // monthly; -1 = last
    time: string; // 'HH:mm', America/Chicago
    anchorDate: string; // 'YYYY-MM-DD', first occurrence (biweekly parity)
    defaultAgenda?: string;
    overrides?: Record<string, { movedTo?: string; skipped?: true }>; // key: original ISO date
  } | null;
}
```

- New rules function `isUpdatingPlcMeetingCadence()`, modeled on `isUpdatingPlcFeatures`:
  caller is `isPlcMembershipManager(resource.data)`, diff closed to
  `['meetingCadence', 'updatedAt']`, `meetingCadence` is a map or null, `plcUpdatedAtOk()`.
  Add it to the `allow update` OR-list and to the mutually-exclusive-branches comment.
- PLC Settings shows the cadence editor to leads and co-leads (`isPlcLeadOrCoLead`) and a
  read-only summary to everyone else.
- Prune `overrides` keys older than 30 days on each write.
- Rules size: at `bc36f57e6` the stripped source is about 178.4 KB against the 182,349-byte
  mark in `scripts/checkRulesSize.mjs`, so about 3.9 KB of headroom. Keep the new function
  small, and test with `node scripts/releaseFirestoreRules.mjs spartboard-dev` before `main`.

### 5.3 Next meeting

Pure `nextMeetingOccurrence(cadence, now)`: generate occurrences from `anchorDate`, apply
`overrides` (skip, or move), and return the first at or after now minus 2 hours so "today, in
progress" still resolves. Handle DST with `America/Chicago`. Unit-test month edges, the last
weekday of the month, biweekly parity, and skip/move chains. The same occurrence feeds D26.

---

## 6. Listener changes

- **Slice gating from the layout.** While Home is active, `PlcProvider` listens to the member's
  `plc_layouts/{plcId}` doc (the one read Home needs anyway), resolves the tiles (doc or
  starter set) and opens the union of their `slices`. `SLICE_SECTIONS`
  (`context/PlcContext.tsx:122`) stays section-based for every other section. A member who
  removes Docs pays for no docs listener. Home reads the layout from the provider rather than
  opening a second listener.
- **Meetings on Home**: a bounded query, `orderBy('heldAt', 'desc')` + `limit(5)`, enough for the
  in-progress meeting, the last completed one and D26. Meeting Mode keeps its full slice.
- **`assignment_index`**: `orderBy('createdAt', 'desc')` + `limit(25)`, filtered client-side to
  `active`, `paused` and legacy entries with no `status` (which `usePlcAssignmentIndex.ts:55-64`
  already treats as active). No composite index. It can miss an active assignment older than
  the 25 newest; acceptable.
- Removing `QuickCreateBar` removes the `useQuiz` / `useVideoActivity` listeners from Home.

---

## 7. Removals and the assign-quiz gap

`QuickCreateBar` is the **only** place `PlcNewQuizAssignmentModal` is rendered
(`QuickCreateBar.tsx:35,181`). The Assessments list has per-row `onAssign` and a Share button
(`PlcAssessmentList.tsx`, `openSharePicker` in `hooks/usePlcQuizActions.tsx`), but no way to
assign a quiz from the teacher's own library. D28 adds "Assign from my library" to the
Assessments header, opening `PlcNewQuizAssignmentModal`, shown when
`canAccessFeature('plc-home-v2')`. The video modal already lives in
`bodies/PlcVideoActivitiesTabsBody.tsx`.

Behind the flag the old components stay; they are deleted when the flag opens to Public and
the old path is removed:

- `QuickCreateBar` (+ test), `CommonAssessmentBanner` (the selectors move into the Results tile),
  `AttentionCard`, `SinceYouWereHereCard`, `YourActionItemsCard`, `RecentDocsCard`, `PlcPresenceStrip`
  on Home (the component stays if used elsewhere), `MembersHeaderCluster` (merged into the new
  avatar cluster). At that point the Assessments header action loses its flag check.

---

## 8. Flag and release

- `GlobalFeature` `'plc-home-v2'`, `FEATURE_DEFAULTS` entry with `defaultAccessLevel: 'admin'`,
  `defaultEnabled: true`, `missingDocPublic: false` (`config/featureDefaults.ts`).
- `PlcDashboard.tsx` `renderSection('home')`: render `PlcHomeV2` when
  `canAccessFeature('plc-home-v2')`, else the current `PlcHome`.
- The cadence editor in PLC Settings and the Assessments "Assign from my library" action are
  shown only behind the same flag.
- Admins always pass admin gates, so "on for Paul" means Paul plus the other `/admins`.
- Compatibility at the `main` release: `meetingCadence` is a new optional `Plc` field the old
  client ignores; the old client never touches `plc_layouts`. The widened `plc_layouts` rule and
  the new cadence branch accept everything the old client writes.
- Changelog entry when the flag opens to everyone, not at merge.
- PR description: flag `plc-home-v2`, starting level admin, open at Admin Settings > Access >
  Global Settings > set to Public.

---

## 9. Build order (when greenlit)

Stacked PRs into `dev-paul`, all behind `plc-home-v2`:

0. **Assign from my library.** The Assessments header action (D28) and the flag entry. Small, and
   it removes the only reason `QuickCreateBar` can't go.
1. **Shell + core tiles.** `PlcHomeV2`, tile registry and contract, header cleanup, the four core
   tiles (Meeting without cadence), `latestTargetMastery` with fallback and trend markers,
   `resolveHero` steps 1 and 4, the bounded meetings and `assignment_index` reads, starter-set
   slice gating in the provider.
2. **Customize + persistence.** `plc_layouts` rule + tests, layout doc read in the provider,
   Customize mode (dnd-kit sortable, remove, empty state), spotlight persisted as `heroTileId`,
   `seenCounts` and the Results `heroScore` (D27).
3. **Meeting cadence.** `meetingCadence` type, `isUpdatingPlcMeetingCadence` rule + tests, PLC
   Settings editor, `nextMeetingOccurrence`, Move/Skip next, default agenda into
   `createMeeting`, Meeting's `heroScore` with D26.
4. **Catalog.** "+ Add tile", `participation` and `perTeacher` tiles, the per-teacher settings
   popover and the `showPerTeacher` gate.

Tests per PR: pure selectors (`latestTargetMastery`, `resolveHero`, `nextMeetingOccurrence`,
layout resolution, slice union) with `vitest related`; a render test for PlcHomeV2 with each
hero; rules tests for `plc_layouts` owner writes and `meetingCadence` lead/co-lead writes (CI).

---

## 10. Open questions

None blocking. To confirm during build:

- Which `PlcCommonAssessment` field is the right "run date" for ordering targets (§4.1).
- The exact label and icon set for the catalog picker (copy review with `design:ux-copy`).
