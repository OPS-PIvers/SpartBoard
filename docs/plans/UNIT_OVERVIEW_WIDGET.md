# Unit Overview widget

Status: planned (design settled 2026-09-26). Mockup: [`mockups/unit-overview-mockup.html`](mockups/unit-overview-mockup.html) (open in a browser; it is the approved visual reference for every section below).

## 1. Intent

Teachers keep a "unit intro sheet" (Google Doc) listing essential questions, learning targets, standards, readings, vocabulary and assessments. The Unit Overview widget turns that sheet into a **projected anchor**: students see today's targets and question in large type at the start of class, and the whole unit is one toggle away. The teacher authors a unit once in a reusable library and shows it on any board.

Non-goals for v1: AI import, links to other widgets, PLC sharing, a student-device view, day-by-day pacing calendars.

## 2. Decisions (from the design interview)

| #   | Decision            | Choice                                                                                                                        |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Primary job         | Projected, student-facing anchor; the full unit plan sits behind it for the teacher                                           |
| 2   | Where a unit lives  | Reusable per-teacher **unit library** (`users/{uid}/units`); the widget references a unit by id                               |
| 3   | Targets entry       | Existing `TargetPicker` (standards catalog, PLC targets, personal targets) **plus** free-text "I can" statements              |
| 4   | Import              | Manual editor in v1; AI import from a Doc/PDF in a later phase                                                                |
| 5   | Sections            | Typed core sections + custom list sections; rename, reorder, show/hide                                                        |
| 6   | Display             | Two modes: **Focus** and **Overview**                                                                                         |
| 7   | Progress            | Lightweight: a "today" star per item, a covered checkbox per item, and an optional start date for "Week X of Y"               |
| 8   | Authoring surface   | Library + editor modal opened from the widget; no new top-level page                                                          |
| 9   | Pace scope          | Today stars, covered checks, section visibility and start date are **per widget** (board isolation)                           |
| 10  | Inter-widget links  | None in v1; all phased (§9)                                                                                                   |
| 11  | Sharing             | Sub portal read-only in v1; PLC share in phase 2                                                                              |
| 12  | Rollout             | `feature_permissions` for `unit-overview` at access level `admin`                                                             |
| 13  | PLC share semantics | Teammates copy the unit into their own library; never a live co-edited doc                                                    |
| 15  | Focus content       | Teacher-picked items: starred targets, starred EQ(s), starred vocab                                                           |
| 16  | Standards display   | Per-widget toggle: code + text (default), codes only, text only                                                               |
| 17  | Deletion            | Archive by default (widgets keep rendering); hard delete leaves widgets showing "This unit was deleted" with a re-pick button |
| 18  | Name                | **Unit Overview**                                                                                                             |

Mockup review defaults (approved as drawn): the EQ sits above the targets in Focus; covered checkboxes are visible on the projected Overview; the Overview grid is automatic (no per-card resizing).

## 3. Visual design (matches the mockup)

Standard SpartBoard chrome: frosted glass `DraggableWindow`, the floating toolbar pill on select, the settings drawer. Lexend throughout, brand blue `#2d3f89` for section labels and target bullets, brand red `#ad2122` only for the "Essential question" eyebrow and the Summative tag. All sizing uses container-query units per `components/widgets/CLAUDE.md`; nothing below is fixed px.

### 3.1 Toolbar

A `Focus | Overview` segmented control sits in the widget's toolbar pill next to Settings. It writes `config.mode`.

### 3.2 Focus mode (mockup scene 1)

Top to bottom:

1. Header row: `Unit title · course label` (left, brand blue, semibold) and `Week X of Y` with a thin progress bar (right). The week row hides when no start date is set.
2. **Essential question** eyebrow (red, uppercase) over the starred EQ in large light type. Multiple starred EQs stack.
3. **"Today I can…"** eyebrow over starred targets as large medium-weight lines with square blue bullets. Targets whose text starts with "I can" drop that prefix under this eyebrow.
4. Bottom row: "Words today" label and starred vocab as soft blue chips.

Empty Focus (nothing starred) shows the title and one line: "Star items in Overview to show them here."

### 3.3 Overview mode (mockup scene 2)

Header: title (large), then `grade · timeframe · Week X of Y` + bar. Below, an auto grid of section cards (white 70% glass, 14px-equivalent radius, thin slate border):

- **Learning targets** takes the tall first column (spans two rows) with a `N of M covered` counter.
- Remaining visible sections fill a 3-column grid in the widget's configured order; Vocabulary renders in two columns; Assessments show Formative (green) / Summative (red) tags.
- Every item has a covered checkbox (checked items turn muted with strike-through) and a star; starred items are bold with an amber ★.
- Cards scroll internally; the grid never clips text.
- Container breakpoints: 3 columns wide, 2 medium, 1 narrow (scene 3, left), where sections stack in one scrolling column and standards collapse to code chips.

The teacher toggles check/star by clicking an item in Overview (pointer events only on the item controls so dragging still works).

### 3.4 Empty and missing states (scene 3)

- No unit: "No unit selected" / "Pick a unit from your library or start a new one." / **Choose unit**.
- Hard-deleted unit: "This unit was deleted" / "Choose another unit to show here." / **Choose unit**.
- Archived unit: renders normally; the settings drawer shows an "Archived" badge next to the unit name.

### 3.5 Settings drawer (scene 4)

Per-widget only: Unit picker + "Edit unit in library" link; Start date and length in weeks; Standards show (`Code + text | Codes | Text`); "Sections in overview" list with drag grips and on/off switches (includes custom sections). No lesson content is edited here.

### 3.6 Library + editor modal (scene 5)

Full-size modal, two panes:

- **Left, My units:** list with title and `course · N targets`, **+ New**, selected unit highlighted, "Archived (n)" disclosure at the bottom; row menu: Duplicate, Archive/Restore, Delete (warns when boards show it).
- **Right, editor:** inline title, meta chips (grade, subject, timeframe), then one card per section with drag-to-reorder rows and a source tag per target (`PLC · <name>`, `Standard <code>`, `Typed`). Targets card offers "+ Pick from standards & targets" (opens `TargetPicker`) and "+ Type an 'I can' statement". Vocabulary accepts a pasted list (newline/comma split). A dashed "+ Add section" row adds Standards, Readings, Assessments or a Custom list. Save is explicit; Duplicate copies to a new unit.

Copy follows `components/CLAUDE.md`: no helper paragraphs, no em dashes, run `deslop --writing`.

## 4. Data model

### 4.1 Unit (library doc) — `users/{uid}/units/{unitId}`

```ts
type UnitSectionKind =
  | 'essentialQuestions'
  | 'learningTargets'
  | 'standards'
  | 'vocabulary'
  | 'readings'
  | 'assessments'
  | 'custom';

interface UnitItem {
  id: string; // stable; per-widget stars/checks key on it
  text: string;
  url?: string; // readings
  note?: string; // e.g. author, "Formative"
  assessmentKind?: 'formative' | 'summative';
  target?: QuestionTargetTag; // learningTargets from TargetPicker (snapshot)
  standard?: { id: string; code: string; text: string }; // standards section
}

interface UnitSection {
  id: string;
  kind: UnitSectionKind;
  title: string; // renamable; defaults per kind
  items: UnitItem[];
}

interface UnitOverviewUnit {
  id: string; // UUID
  title: string;
  courseLabel?: string; // "English 9"
  grade?: string;
  subject?: string; // config/subjects.ts id
  timeframeWeeks?: number;
  sections: UnitSection[];
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}
```

Targets reuse `QuestionTargetTag` snapshots so a later mastery join (§9) keys on the same ids quizzes use. Free-text targets have no `target`.

Caps: 20 sections, 60 items per section, 500 chars per item text. Enforced in the editor and in rules.

### 4.2 Widget config — `UnitOverviewConfig` (per board)

```ts
interface UnitOverviewConfig {
  unitId: string | null;
  mode: 'focus' | 'overview';
  startDate?: string; // ISO date; drives Week X of Y
  standardsDisplay: 'codeText' | 'code' | 'text';
  sectionOrder?: string[]; // UnitSection ids; absent = unit order
  hiddenSectionIds?: string[];
  todayItemIds: string[];
  coveredItemIds: string[];
}
```

None of these keys go in `APPEARANCE_CONFIG_KEYS`; all are per-board. Ids of items deleted from the unit are ignored at render and pruned on the next widget write.

## 5. Architecture

- **Hook** `hooks/useUnitLibrary.ts`, modeled on `hooks/useProjectLibrary.ts`: live `onSnapshot` of `users/{uid}/units`, `saveUnit`, `duplicateUnit`, `setArchived`, `deleteUnit`; guards `user?.uid`; returns unsubscribe.
- **Single-unit read** `useUnit(unitId)` for the widget, so a board only listens to the one doc it shows.
- **Widget files** `components/widgets/UnitOverview/`: `Widget.tsx`, `FocusView.tsx`, `OverviewView.tsx`, `SectionCard.tsx`, `EmptyState.tsx`, `settings.schema.ts` / `settingsFields.tsx` (drawer), `library/UnitLibraryModal.tsx`, `library/UnitEditor.tsx`, `library/SectionEditor.tsx`, `unitOverviewUtils.ts` (week math, ordering, pruning).
- **Target picking** reuses `components/quiz/targets/TargetPicker.tsx` and `TargetChips.tsx` unchanged (already used outside Quiz by SmartNotebook).
- **Canvas hot path**: the widget uses `DashboardActionsContext` for `updateWidget`, not `useDashboard()`.
- **Registration** via the `new-widget` skill: `types.ts` `WidgetType` + config type, `config/tools.ts`, `config/widgetDefaults.ts`, `config/widgetGradeLevels.ts` (6–12 default, all grades allowed), `WidgetRegistry.ts`, any `data-tour` anchors in `config/tourAnchors.ts`.

### 5.1 Firestore rules

New `match /users/{userId}/units/{unitId}`: `ownsUserTeacher(userId)` for read/delete; create/update check `incoming().id == unitId`, `isStr('title')`, `isList('sections')`, `sections.size() <= 20`, `isInt('updatedAt')`. Use the shorthands; run `pnpm run check:rules-size` and `node scripts/releaseFirestoreRules.mjs spartboard-dev`. Add emulator tests in `tests/rules/`.

### 5.2 Sub portal

Substitutes cannot read `users/{uid}/units`. Follow the Projects precedent: add a `'unit'` kind to `utils/bundleSubShareContent.ts` that bundles the referenced unit at share time, and a `useSubShareUnit(unitId)` hook built on `useShareContent`. In `/subs` the widget renders from the bundle, read-only (no checks/stars toggling, no library button).

### 5.3 Dev sync

Add `users/{uid}/units` to `syncMyMaterialsFromProdV1` (`functions/src/devSyncFromProd.ts`) as authored material.

## 6. Rollout

- Widget gated by `feature_permissions` `unit-overview` at access level **admin** (Paul plus other `/admins`).
- PR must state: flag `unit-overview`, starting level admin, path Admin Settings > Access > Feature Permissions > Unit Overview > set to Public. Agents never open it on prod.
- Changelog entry only when the flag opens to everyone.

## 7. Phase 1 build order (one PR)

1. Types + `unitOverviewUtils.ts` with unit tests (week math, order/visibility resolution, pruning of stale ids).
2. `useUnitLibrary` / `useUnit` + rules + rules tests.
3. Widget registration, empty state, Focus and Overview views with container-query scaling.
4. Settings drawer.
5. Library + editor modal with `TargetPicker`, paste-to-add vocabulary, custom sections, archive/delete.
6. Sub share bundling.
7. Dev sync entry.
8. Tests: widget render per mode/state, settings schema test, drawer interactions, `tests/tourAnchors.test.ts`, copy guard.

Verification: `pnpm exec vitest related --run <changed files>`, `pnpm run test:rules`, one `pnpm run type-check` (touches `types.ts`), browser check on https://spartboard-dev.web.app at small, medium and projector sizes, then compare against the mockup.

## 8. Phase 2: PLC share

- "Share to PLC" from the library row menu publishes a snapshot, following the existing PLC quiz/resource share hooks.
- Teammates see shared units in the library's "From my PLCs" tab and **Copy to my units**; the copy is independent. When the owner republishes, copies show "Update available" and the teammate chooses to pull; never overwritten silently.
- PLC-kind targets keep their `ownerId` so teammates' copies still roll up to the same PLC target ids.

## 9. Later phases (documented, not scheduled)

- **AI import:** pick a Google Doc/PDF via `hooks/useGooglePicker.ts`, pull text with `getDriveFileTextContent` (`hooks/useGoogleDrive.ts`), parse into sections with a new Cloud Function modeled on `utils/quizDocumentImport/`, and match extracted targets with `suggestedTargets.ts`. Result opens in the editor for review, never saved directly.
- **Vocabulary → Flashcards:** create a Flashcards set/widget from the vocabulary section.
- **Target mastery:** show class mastery per tagged target from quiz results (`utils/quizTargetStats.ts`), keyed on the shared `QuestionTargetTag` ids.
- **Resource links:** reading/assessment items link to a library quiz, video activity or GL activity and open or add that widget on the board.
- **Schedule / Next Up:** surface today's starred target in Schedule or Next Up items.
- **Student view:** a read-only student link to the unit overview.
