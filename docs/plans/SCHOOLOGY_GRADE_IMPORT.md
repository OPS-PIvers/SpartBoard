# Schoology grade import: bring Schoology-only assignments into the Gradebook

Grilled and settled with Paul on 2026-10-29. Not built. Starts with a read-only probe (D19), then four stacked PRs to `dev-paul` behind `schoology-grade-import`, then a prod pilot.

## Goal

A teacher's Gradebook shows every score a class earned, including those earned on assignments made only in Schoology (a Schoology test, a discussion, a hand-entered column). Those scores feed the grid, the analysis tab, the student view, insights, standards proficiency and, when tagged, PLC target results. Schoology stays the owner of those grades. SpartBoard reads them and never edits them.

This is the reverse of [SCHOOLOGY_TOOL_COLUMNS.md](SCHOOLOGY_TOOL_COLUMNS.md), which pushes SpartBoard-only scores into Schoology.

## Current-state facts the design builds on

- **Gradebook is built** ([GRADEBOOK.md](GRADEBOOK.md)). The grid reads server-written `grade_index/{sessionId}__{studentUid}` rows (`functions/src/gradebook/gradeIndex.ts`, `gradeIndexTriggers.ts`) plus the teacher's `gradebook_marks` overlay, and `GradebookKind` (`utils/gradebook/gradebookCore.ts`) lists the SpartBoard activity kinds. D3 there says "no manual columns".
- **Schoology REST client** `functions/src/schoology/restClient.ts`: two-legged OAuth 1.0a with the district SIS Connect key (secrets `SCHOOLOGY_API_CONSUMER_KEY` / `SECRET`; dev holds `placeholder`). It already has `listEnrollments`, `listColumnGrades`, `listGradingCategories`, paging over `links.next` and a host-locked redirect guard. The key acts as the `apaul.ivers` admin account and can read any section.
- **Section link** `functions/src/lti/linkSectionByUrl.ts` (`ltiLinkSectionByUrlV1`): a teacher pastes a Schoology course URL; the caller must be an active Instructor in the section's NRPS roster and the section's learners must overlap the chosen ClassLink or test class. Stored in server-only `lti_course_links/{contextId}`. REST section id = LTI `contextId`.
- **Student mapping:** the NRPS LTI `sub` is `{schoologyUid}::{hash}`, and the prefix equals the REST enrollment `uid` (37 of 37). NRPS gives the learner's email, which maps to the ClassLink or test-class student and so to the Gradebook `studentUid` (`HMAC("sid:"+sourcedId)` or `HMAC("sid:test:"+email)`). `toolColumns.ts` already does the `sub` → enrollment half.
- **SpartBoard-made Schoology columns** are recorded in server-only `lti_tool_columns` (pushed columns) and on sessions with `ltiAttachment` ("Add Materials" launches, whose AGS line item is a REST grade column).
- **Schoology REST v1 documentation** (developers.schoology.com, read 2026-10-29; not yet tested live):
  - `GET /sections/{id}/grade_items` lists every gradable item: `type` (`assignment` | `discussion` | `assessment`), `title`, `max_points`, `due`, `grading_category`, `grading_period` (0 = Other), `grading_scale`, `factor`, `published`, `count_in_grade` (only returned when not the default 1), `show_comments`, `auto_publish_grades`. No change filter.
  - `GET /sections/{id}/grades` with no `assignment_id` returns every cell in the section, paged: `enrollment_id`, `assignment_id`, `grade`, `exception` (1 excused, 2 incomplete, 3 missing per our 2026-10-09 test), `comment`, `comment_status`, `timestamp`. A `timestamp` query returns only cells changed since then. The same response carries `period` and `final_grade` arrays (per enrollment, per period, with `final` = course grade).
  - No per-grade "hidden from student" field is documented. No per-question results for Schoology tests are documented; REST gives the total only.
  - No published rate limit; forum reports of "Rate Limit Exceeded".

## Decisions

### Placement and ownership

- **D1.** Schoology-only assignments become **columns in the Gradebook grid**, with a Schoology badge on the header. This is a narrow exception to Gradebook D3: an external column fed by an LMS, never a hand-typed one.
- **D2.** Imported grades are **read-only**. The cell popover shows Schoology's score, flags and comment and links to the Schoology gradebook for edits. There is no D9 overlay on imported cells, no override, no fill, no Mark all, no publish control and no write-back.
- **D3.** **Every** column in the linked section that SpartBoard didn't create comes in automatically, of every type (assignments, discussions, tests). A teacher hides any they don't want with the existing hide-column control. Columns in `lti_tool_columns` and columns backing an `ltiAttachment` session are skipped, since those assignments are already SpartBoard columns.
- **D4.** Items Schoology hasn't published still appear, with the same "not published" dot as unpublished SpartBoard columns (Gradebook D7).

### Sync

- **D5.** **Nightly plus Refresh.** A scheduled function refreshes every linked section off-hours, staggered, and fetches only cells changed since the last run (`timestamp`); the item list is re-read in full. A **Refresh** button in the Gradebook sub-bar pulls one section on demand (throttled per section). The sub-bar shows "Schoology · updated 6:12 AM". A failed sync keeps the last good rows and shows them as stale; 429s back off and retry.
- **D6.** It **reuses the tool-columns section link** (`lti_course_links`). One link per class drives both push and pull. A Gradebook class with no link offers "Link Schoology course" from the sub-bar, which opens the existing paste-URL flow.
- **D7.** **Drift.** A column gone from Schoology is removed on the next sync; its SpartBoard-side setup (category, counts toward overall, standards tags, hidden) is kept 30 days in case it returns. Schoology students who match no SpartBoard student are skipped, and the Refresh status says "N students in Schoology aren't in this class".
- **D8.** **Unlink** (or relinking to a different section) deletes that class's imported rows at once, so no stale student grades remain. SpartBoard-side setup is kept 30 days.
- Co-taught sections: each teacher who links the same section gets its columns in their own class.

### Grading

- **D9.** The settings configuration (Gradebook D16) gains **"Schoology scores in the grade: Include all / Include selected / Do not include"**. The default is **Do not include**, so turning import on never silently changes a class's Overall; imported columns still show in the grid and analysis.
  - **Include all:** each imported column's "Counts toward overall" switch starts on.
  - **Include selected:** the switch starts off and the teacher turns on the ones that count.
  - **Do not include:** the switch is hidden and imported columns never count.
  - PLC and district configurations can set it like any other field.
- **D10.** Under Include all, a column Schoology marks `count_in_grade: 0` starts with "Counts toward overall" off. The teacher can still change it.
- **D11.** **Category:** an imported column goes in the SpartBoard category whose name matches its Schoology category (case-insensitive), else the first category. It stays editable per column in the header popover.
- **D12.** **Flags:** Schoology Missing → SpartBoard Missing (M), Excused → Excused (X), Incomplete → Incomplete (I). They render as read-only "from Schoology" chips and use those flags' values and Visibility. SpartBoard's auto Late and Missing (Gradebook D15) never fire on imported columns.
- **D13.** **Grading period:** an imported column belongs to the SpartBoard period whose dates overlap its Schoology grading period; with no Schoology period (0 / Other), fall back to the Schoology due date, then the date the column was first seen.
- **D14.** Schoology's own period and course grade (`final_grade`) come in as a frozen, teacher-only **"Schoology grade"** reference column beside Overall, for the selected period. It never counts toward anything, never reaches students and is never exported as a SpartBoard score.

### Header popover and analysis for imported columns

- The header popover keeps sort, hide, **Category**, **Counts toward overall** (per D9) and **Standards**. **Results** becomes **Open in Schoology**. Edit, Delete, Publish, Retakes, Total points, Mark all and Push scores are absent.
- **Analyze** shows distribution, target breakdown and non-submitters. Item analysis is hidden: REST gives totals only.

### Students, standards and PLCs

- **D15.** Students **see imported grades** on their Grades tab (Gradebook D35), badged "From Schoology", mirroring Schoology's own visibility:
  - only items with `published: 1`;
  - comments only when `comment_status` says the student can see them;
  - flags only when the mapped SpartBoard flag's Visibility is "Teachers and students".
  - If the probe (D19) finds a per-grade "hidden" state is not readable, items whose grades a teacher can hide per student stay off the tab until it is.
  - Written into the D37 projection by the server like everything else.
- **D16.** **Standards:** the header popover's Standards row (Gradebook D29 whole-column tagging) works on imported columns, so the column percent counts as proficiency evidence. Tags are SpartBoard-side and survive re-syncs.
- **D17.** **PLC evidence:** an imported column tagged with a PLC learning target **blends into that PLC's target result** as more evidence.
  - Tagging is the teacher's opt-in.
  - The lead (and co-leads) see a list of contributing columns by title and can exclude any of them.
  - The usual PLC anonymity holds: no per-teacher or per-student numbers, hidden under 5 students.
  - Recompute goes through the existing PLC dirty flag, enqueued when a tagged imported column's rows change.

### Release

- **D18.** Gated by a new `GlobalFeature` **`schoology-grade-import`** (`defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'retire'`), ANDed with `gradebook`. Independent of `schoology-tool-columns`. Add it to `functions/src/featureMissingDoc.ts`. It opens at Admin Settings > Access > Previews > Schoology grade import > Public.
- **D19.** **Probe first.** Before PR 1, one read-only script against Paul's test course 7660186912 with the prod REST key records in this plan's "What is proven" section:
  - the real `type` and fields of manual columns, external-tool columns and SpartBoard deep-link columns in `grade_items`;
  - whether any per-grade hidden-from-student state is readable;
  - the `final_grade` / `period` shape;
  - that `timestamp` filtering works;
  - paging and 429 behavior.
    It stores nothing and logs no grades.
- **D20.** Four stacked PRs, then a prod pilot (below).

## Data model (proposed; finalize in PR 1)

| Path                                                 | Written by  | Purpose                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grade_index/sgy_{sectionId}_{itemId}__{studentUid}` | server only | Ordinary index row with `kind: 'schoology'`, `rawPct`, `points`, `max`, `state`, `published`, plus `sgy: { sectionId, itemId, type, exception, comment, commentVisible, gradingPeriodId, categoryTitle, countInGrade }` |
| `schoology_imports/{rosterId}`                       | server only | Per-class sync state: `sectionId`, `ownerUid`, `lastSyncAt`, `lastTimestamp`, `status`, `unmatchedCount`, item list (`itemId`, title, type, max, due, period, category, published)                                      |
| `schoology_imports/{rosterId}/final/{studentUid}`    | server only | D14 reference grades per period                                                                                                                                                                                         |
| `gradebook_columns/sgy_{sectionId}_{itemId}`         | teacher     | Existing column config doc: category, `countsTowardOverall`, targets, hidden; `deletedAt` for the 30-day keep (D7, D8)                                                                                                  |

`'schoology'` joins `GradebookKind`; it is never a Resource, has no attempts and no session doc. Rules for the new server-only collections: teacher reads where `ownerUid == authUid()`; no client writes. Check `pnpm run check:rules-size`.

## PR sequence

Each PR is usable on `spartboard-dev` by itself (REST calls there hit the placeholder key, so PRs ship with a fake REST client for tests and the dev harness; real reads happen in the pilot).

1. **Sync engine.** The flag; REST additions (`listGradeItems`, `listSectionGrades` with `timestamp`, `final_grade` parsing, 429 backoff); identity map (NRPS email + `sub` prefix → enrollment → `studentUid`); skip SpartBoard-made columns; `grade_index` `schoology` rows; `schoology_imports`; the nightly scheduled function and `refreshSchoologyImportV1` callable; delete on unlink.
2. **Grid and settings.** Schoology badge and read-only cell and header popovers, Open in Schoology, the sub-bar link / Refresh / status, the D9 setting in the settings editor, D10 and D11 defaults, D12 flag chips, D13 periods, the D14 reference column, Analyze without item analysis. New controls get `tourAttr` anchors.
3. **Students and standards.** D15 projection and the Grades tab badge; D16 Standards row on imported columns.
4. **PLC evidence.** D17 blending in the PLC recompute, the lead's contributing-columns list with exclude.

Then the **prod pilot** on Paul's test class linked to 7660186912 (test-class `memberEmails` must equal the course's student emails), with the flag on for admins only.

## Out of scope

- Writing anything to Schoology from this feature.
- Per-question results for Schoology tests.
- Local-roster classes (as in Gradebook D8).
- Importing from Schoology sections not linked to a Gradebook class.
