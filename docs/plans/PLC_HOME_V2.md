# PLC Home v2: A Tile Dashboard With a Spotlight — Implementation Plan

**Date**: 2026-09-22 · **Branch**: `dev-paul` · **Status**: Draft for product-owner review. Decisions in §2 were settled in a design interview on 2026-09-22; no code has been written. File paths and line numbers were read at `643548c2f`; re-verify before relying on them.

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

- **Duplication.** Members appear three times (chrome count `PlcDashboard.tsx:109,229`, the
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
  (`hooks/usePlcAssignmentIndex.ts:114-121`).

### 1.1 Data available without new reads

Live on Home already (provider slices gated to `home`, or always on):

- `usePlcAssessmentsData` / `usePlcAggregatesData` (`context/usePlcContext.ts:496,501`).
  `PlcAssessmentAggregate` (`types.ts:994-1063`) gives, per assessment: `teamAveragePercent`,
  `studentCount`, `teacherCount`, `ranAt`, `perQuestion[]` (`correctPercent`,
  `choiceDistribution[]`), `perTarget[]` / `perStandard[]` (`correctPercent`, `attempted`,
  `lowSample`, `code`, `label`; schema 3+, `types.ts:971-982`) and `perTeacher[]`
  (`averagePercent`; shown only when `features.showPerTeacher`, `types.ts:360`).
- `usePlcMembers`, `usePlcWhoIsHere`, `usePlcActivity` (newest 50), `usePlcRootDoc`.

Not available, by design: per-student score distributions (FERPA boundary). Targets carry no
mastery numbers of their own; mastery exists only inside each assessment's aggregate.

Meetings (`PlcMeeting`, `types.ts:1075-1122`) only exist once started (`in-progress` /
`completed`). The `Plc` type (`types.ts:269-337`) has no schedule or cadence.

Reusable selectors: `weakestQuestions`, `buildAssessmentCards`
(`components/plc/sharedData/sharedDataSelectors.ts:115,142`), `aggregateStatus`,
`sortWorstFirst` (`components/plc/assessments/assessmentListSelectors.ts:59,295`),
`buildCommonAssessmentBanner` (`cards/commonAssessmentBannerSelectors.ts`), the mastery bands
in `PlcAssessmentDetail.tsx:56` (`MASTERY_BAR_CLASS`), and `selectMyActionItems`
(`cards/yourActionItems.ts`). `recharts` is installed (`package.json:87`) and used only by
`components/admin/Analytics/AnalyticsManager.tsx`.

---

## 2. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Home is a **balanced overview of tiles**. No single fixed hero.                                                                                                                                                                                                                                                               |
| D2  | Every tile has a **spotlight** button in its corner. The spotlighted tile becomes the **hero**: full width on top, showing its expanded view. All other tiles render in their **compact** view beneath.                                                                                                                       |
| D3  | The hero view is a **bigger read-only summary plus a deep link** ("Open Assessments →"). No editing inside tiles, except the existing inline "done" checkbox on action items. Home never becomes a second copy of each section.                                                                                               |
| D4  | With nothing spotlighted, a **smart default hero** applies: Meeting when a meeting is in progress or it is meeting day; else Results when a common assessment has new results since the viewer's last visit; else no hero (even grid). Removed tiles are skipped.                                                             |
| D5  | **Remove the quick-create bar.** Creating things happens in Assessments and Notes & Docs.                                                                                                                                                                                                                                     |
| D6  | **Remove the Common Assessment banner** as a separate strip. Its status (who ran it, ready to review, meeting CTA) folds into the Results tile.                                                                                                                                                                               |
| D7  | **Remove the Active assignments card.** Live assignments fold into the Results tile as compact rows; when there are none, they take no space.                                                                                                                                                                                 |
| D8  | **Header is just the PLC name** on the left and **one avatar cluster** on the right (online members get a green ring and a tooltip with the section they are in), plus the Customize button. Delete the subtitle, `PlcPresenceStrip` on Home, and the second members cluster.                                                 |
| D9  | **Core tiles**: Results, Meeting, Action items + activity, Docs & notes.                                                                                                                                                                                                                                                      |
| D10 | **Results tile** charts mastery by learning target **rolled up across assessments**. It falls back automatically: targets → standards (when questions are tagged with standards only) → weakest questions on the latest common assessment plus participation. The fallback shows a one-line hint linking to Learning Targets. |
| D11 | The rollup covers **this school year** (since Aug 1) by default, adjustable in the tile's settings to "last N assessments" or "all time".                                                                                                                                                                                     |
| D12 | **Low-sample** targets (`lowSample`, under 5 graded answers) are shown **muted with a "few answers" tag**, never colored as struggling or proficient, and sort last in worst-first order.                                                                                                                                     |
| D13 | **Action items + activity** replaces `YourActionItemsCard`, `SinceYouWereHereCard` and `PlcActivityFeed`: what I owe first, then what changed since my last visit.                                                                                                                                                            |
| D14 | A **chart catalog** ("+ Add tile") offers ready-made chart tiles, each with a small settings popover and designed compact + hero views (§4).                                                                                                                                                                                  |
| D15 | The **per-teacher comparison** tile appears in the catalog only when the PLC has `features.showPerTeacher` on.                                                                                                                                                                                                                |
| D16 | **All tiles are removable**, core tiles included. Zero tiles shows a "Customize to add tiles" state.                                                                                                                                                                                                                          |
| D17 | **Layout mode**, one setting that governs both the hero and the arrangement: `team` (the lead sets the hero and one tile layout for everyone) or `personal` (each member arranges their own and picks their own hero).                                                                                                        |
| D18 | The **district admin** sets the default mode and the **starter tile set** in the admin panel; each PLC's lead can override both in PLC Settings. The admin default ships with a toggle UI, never a Firestore edit.                                                                                                            |
| D19 | In `team` mode any member can **spotlight temporarily** (this visit only); the next visit snaps back to the lead's hero.                                                                                                                                                                                                      |
| D20 | Rearranging happens in a **Customize mode**: a header button toggles it; drag to reorder, × to remove, "+ Add tile" opens the catalog, Done exits. Outside Customize, only the spotlight button shows.                                                                                                                        |
| D21 | **Viewers** (read-only members) can spotlight, and in `personal` mode arrange their own layout. They cannot edit the team layout or the meeting cadence.                                                                                                                                                                      |
| D22 | **Meeting cadence**: the lead sets a recurrence in PLC Settings (weekly, every 2 weeks, or monthly on the Nth weekday; day, time, optional default agenda). From the Meeting tile the lead can **move or skip just the next occurrence**. The next date is computed client-side; no scheduled function.                       |
| D23 | Charts use **Recharts, lazy-loaded** in a separate chunk that loads only when a chart tile renders.                                                                                                                                                                                                                           |
| D24 | Ships behind a new **`plc-home-v2` GlobalFeature** at access level `admin`. The old Home stays for teachers until Paul opens it.                                                                                                                                                                                              |

---

## 3. Layout

- **Header** (D8): `h2` PLC name (truncate), right side: avatar cluster, Customize button.
  The dashboard chrome's member count (`PlcDashboard.tsx:229`) stays; it is outside Home.
- **Hero** (when one resolves, D2/D4/D19): full width, tile's `hero` view, tile's spotlight
  button reads "Unspotlight". A small "Team focus" chip shows when the hero came from the lead
  in `team` mode.
- **Grid**: compact tiles in `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`, `gap-5`, in the
  resolved order. Compact tiles have a fixed min height so the grid has no ragged holes.
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
  | 'masteryByTarget'
  | 'weakestQuestions'
  | 'participation'
  | 'teamAverageByAssessment'
  | 'targetOverTime'
  | 'choiceBreakdown'
  | 'perTeacher';

interface PlcHomeTileInstance {
  id: string; // uuid; a kind can be added more than once
  kind: PlcHomeTileKind;
  options?: PlcHomeTileOptions; // per-kind: assessmentId, targetId, window, etc.
}

interface PlcHomeTileDef {
  kind: PlcHomeTileKind;
  labelKey: string;
  icon: LucideIcon;
  isAvailable: (ctx) => boolean; // D15 per-teacher gate, feature gates
  Compact: React.FC<TileProps>;
  Hero: React.FC<TileProps>;
  Settings?: React.FC<TileSettingsProps>; // popover
  heroScore?: (ctx) => number; // feeds the smart default (D4)
  sectionLink?: PlcSectionId; // deep link (D3)
}
```

Registry in `components/plc/home/tiles/registry.ts`. Each tile's data shaping lives in a pure,
unit-tested selector file next to it (the repo pattern: `*Selectors.ts` + `.test.ts`).

---

## 4. Tiles

Every chart tile is built from `usePlcAggregatesData` + `usePlcAssessmentsData`, so none adds
Firestore reads.

| Kind                      | Compact                                                                                                              | Hero                                                                                                                                                   | Options                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `results`                 | Latest common assessment chip (phase, "3 of 4 ran it"), top 3 weakest targets as mastery bars, live-assignment count | Full target mastery bars (worst first) across the window, latest assessment status + Start/Resume Meeting, live assignments list (≤5) with sheet links | window (D11)                                 |
| `meeting`                 | Next meeting ("Thu 3:15 · in 2 days") or "In progress" + Resume; last meeting's open action item count               | Next meeting + agenda, Start/Resume, last meeting's decisions and action items; lead sees Move / Skip next                                             | —                                            |
| `actionsActivity`         | My open action items count + top 2; "N new since your visit"                                                         | Full my-items list with done checkboxes, then since-you-were-here and earlier activity                                                                 | —                                            |
| `docs`                    | 3 newest docs/notes                                                                                                  | 8 newest with author and time                                                                                                                          | —                                            |
| `masteryByTarget`         | Horizontal bars, top 5 worst                                                                                         | All targets, banded by the PLC's `masteryCutoffs`                                                                                                      | window, targets vs standards                 |
| `weakestQuestions`        | Top 3 questions by incorrect %                                                                                       | Top 10 with stem preview                                                                                                                               | assessment (default latest)                  |
| `participation`           | "N of M teachers ran it" ring for the latest assessment                                                              | Assessments × ran/not-ran matrix by count (no names unless `showPerTeacher`)                                                                           | window                                       |
| `teamAverageByAssessment` | Sparkline                                                                                                            | Line chart with assessment labels; caption notes averages compare different tests                                                                      | window                                       |
| `targetOverTime`          | Sparkline for one target                                                                                             | Line of that target's `correctPercent` per assessment                                                                                                  | target (required)                            |
| `choiceBreakdown`         | Mini stacked bar for one question                                                                                    | Bar per choice, correct highlighted                                                                                                                    | assessment + question                        |
| `perTeacher`              | Bars of class averages                                                                                               | Same, with class counts                                                                                                                                | assessment; only when `showPerTeacher` (D15) |

### 4.1 Results rollup (D10–D12)

New pure selector `rollupTargetMastery(aggregates, assessments, { window, dimension })`:

- Filter aggregates to the window: `ranAt >= schoolYearStart(now)` (Aug 1, Central), or last N
  by `ranAt`, or all.
- Group `perTarget` (or `perStandard`) rows by target id. Combine as a **weighted** mean:
  `Σ(correctPercent × attempted) / Σ attempted`. A combined row is `lowSample` when
  `Σ attempted` is below the existing threshold.
- Fallback order: any `perTarget` rows → targets; else any `perStandard` rows → standards; else
  `weakestQuestions` on the latest aggregate plus participation. Return a `mode` field so the
  tile renders the right view and hint.
- Band with the PLC's `masteryCutoffs` (`utils/learningTargets.ts:39`), reusing the existing
  mastery colors. Learning targets are needed only for labels and cutoffs; read the single
  `meta/learningTargets` doc (`hooks/useLearningTargets.ts:165`) only when a target tile is
  on the layout.

### 4.2 Smart default hero (D4)

`resolveHero({ layoutMode, teamHero, personalHero, sessionSpotlight, tiles, ctx })`:

1. `sessionSpotlight` (this visit) wins.
2. `personal` mode: the viewer's saved hero. `team` mode: the lead's `teamHero`.
3. Otherwise the highest positive `heroScore` among present tiles: Meeting scores when a
   meeting is in progress or the next occurrence is today; Results scores when an aggregate's
   `ranAt` is newer than the frozen unread cursor.
4. Otherwise no hero.

Keep the frozen-cursor logic from `PlcHome.tsx:55-68`; it moves with `actionsActivity` and
also feeds step 3.

---

## 5. Data model

### 5.1 Team layout and cadence, on the PLC doc (lead-writable)

```ts
interface Plc {
  // ...
  homeLayout?: {
    mode?: 'team' | 'personal'; // absent = admin default
    tiles?: PlcHomeTileInstance[]; // team layout (used in 'team' mode)
    heroTileId?: string | null; // team hero
  };
  meetingCadence?: {
    frequency: 'weekly' | 'biweekly' | 'monthlyNthWeekday';
    weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    nth?: 1 | 2 | 3 | 4 | -1; // monthly; -1 = last
    time: string; // 'HH:mm', America/Chicago
    anchorDate: string; // 'YYYY-MM-DD', first occurrence (biweekly parity)
    defaultAgenda?: string;
    overrides?: Record<string, { movedTo?: string; skipped?: true }>; // key: original ISO date
  };
}
```

Rules: only the lead (`leadUid`) may write `homeLayout` and `meetingCadence`. Prune `overrides`
keys older than 30 days on each write. The unused `plc_layouts` rule left by the retired grid
layout can be deleted in the same rules change. Check the compiled rules size with
`node scripts/releaseFirestoreRules.mjs spartboard-dev` (the 250 KB compiled cap).

### 5.2 Personal layout, on the member's own `plc_state` doc

`/users/{uid}/plc_state/{plcId}` (owner-only, already holds the unread cursor,
`hooks/usePlcUnread.ts:47`) gains `homeTiles?: PlcHomeTileInstance[]` and
`homeHeroTileId?: string | null`. Used in `personal` mode. It is already read on Home, so it adds
no listener. Check that the rule allows the new fields.

### 5.3 Admin default

`admin_settings/plc_home`: `{ defaultMode: 'team' | 'personal', starterTiles: PlcHomeTileKind[] }`.
It needs a panel in Admin Settings (mode radio + ordered starter-tile checklist). Seed:
`personal` mode; starter tiles `results`, `meeting`, `actionsActivity`, `docs`.

Resolution: `plc.homeLayout.mode ?? admin.defaultMode ?? 'personal'`; tiles from the mode's
source, else `admin.starterTiles`, else the hardcoded seed.

### 5.4 Next meeting

Pure `nextMeetingOccurrence(cadence, now)`: generate occurrences from `anchorDate`, apply
`overrides` (skip, or move), and return the first at or after now minus 2 hours so "today, in
progress" still resolves. Handle DST with `America/Chicago`. Unit-test month edges, the last
weekday of the month, biweekly parity, and skip/move chains.

---

## 6. Listener changes

- Add `home` to the `notes`, `docs` and `meetings` slice gates (`context/PlcContext.tsx:122-153`)
  so the tiles read the provider slices, not standalone full-collection listeners. This is a
  net read reduction versus today. Gate each one on its tile being on the resolved layout, so a
  team that removes Docs does not pay for it.
- `assignment_index`: add a `where('status', 'in', ['active','paused'])` + `limit(5)` query for
  the Results tile rather than the full collection (check whether an index is needed).
- Removing `QuickCreateBar` removes the `useQuiz` / `useVideoActivity` listeners from Home.
- Recharts: `React.lazy` import of a `PlcHomeCharts` module; compact tiles that only need bars
  keep using div bars so the chunk loads only for line/ring/stacked charts or hero views.

---

## 7. Removals and the assign-quiz gap

`QuickCreateBar` is the **only** place `PlcNewQuizAssignmentModal` is rendered. The Assessments
list has per-row `onAssign` (`PlcAssessmentList.tsx:331,1054`), and the video modal also lives
in `bodies/PlcVideoActivitiesTabsBody.tsx:223`. Before deleting the bar, confirm the Assessments
section offers a path to create a new quiz assignment from the teacher's library (not only
per-row assign on an existing PLC quiz). If it does not, add an "Assign from my library" action
to the Assessments header that opens `PlcNewQuizAssignmentModal`. Do not leave the modal
orphaned.

Behind the flag the old components stay; they are deleted when the flag opens to Public and
the old path is removed:

- `QuickCreateBar` (+ test), `CommonAssessmentBanner` (the selectors move into the Results tile),
  `AttentionCard`, `SinceYouWereHereCard`, `YourActionItemsCard`, `RecentDocsCard`, `PlcPresenceStrip`
  on Home (the component stays if used elsewhere), `MembersHeaderCluster` (merged into the new
  avatar cluster).

---

## 8. Flag and release

- `GlobalFeature` `'plc-home-v2'`, `FEATURE_DEFAULTS` entry with `defaultAccessLevel: 'admin'`,
  `defaultEnabled: true`, `missingDocPublic: false` (`config/featureDefaults.ts`).
- `PlcDashboard.tsx:123-124`: render `PlcHomeV2` when `canAccessFeature('plc-home-v2')`, else
  the current `PlcHome`.
- The new PLC Settings fields (layout mode, cadence) are shown only behind the same flag.
- Admins always pass admin gates, so "on for Paul" means Paul plus the other `/admins`.
- Compatibility at the `main` release: the new optional `Plc` and `plc_state` fields must not
  break an open tab running the previous client (the old client ignores them). Rules must accept
  writes from both clients.
- Changelog entry when the flag opens to everyone, not at merge.
- PR description: flag `plc-home-v2`, starting level admin, open at Admin Settings > Access >
  Global Settings > set to Public.

---

## 9. Suggested build order (when greenlit)

Stacked PRs into `dev-paul`, all behind `plc-home-v2`:

1. **Shell + core tiles.** Flag, `PlcHomeV2`, tile registry and contract, spotlight + hero
   resolution (session and smart default only), header cleanup, the four core tiles (Meeting
   without cadence), Results rollup selector with fallback, listener gating (§6), the
   assign-quiz gap (§7).
2. **Meeting cadence.** `meetingCadence` type + rules, PLC Settings editor, `nextMeetingOccurrence`,
   Move/Skip next on the Meeting tile, Meeting's `heroScore` on meeting day.
3. **Chart catalog.** Lazy Recharts module, the seven chart tiles, settings popovers, per-teacher
   gate.
4. **Customize + ownership.** Customize mode (drag, remove, add), `homeLayout` + `plc_state`
   persistence and rules, team/personal modes, temporary spotlight in team mode,
   `admin_settings/plc_home` + admin panel UI.

Tests per PR: pure selectors (`rollupTargetMastery`, `resolveHero`, `nextMeetingOccurrence`,
layout resolution) with `vitest related`; a render test for PlcHomeV2 with each hero; rules
tests for `homeLayout` / `meetingCadence` lead-only writes and `plc_state` owner writes (CI).

---

## 10. Open questions

None blocking. To confirm during build:

- Whether "new results since last visit" should also count results from assessments that are
  not common assessments (currently: common assessments only).
- The exact label and icon set for the catalog picker (copy review with `design:ux-copy`).
