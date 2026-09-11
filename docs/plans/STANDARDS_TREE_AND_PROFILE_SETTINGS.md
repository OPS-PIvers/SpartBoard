# Standards tree picker and teacher Profile settings

Grilled 2026-09-11. Follows `QUIZ_QUESTION_BANKS_AND_LEARNING_TARGETS.md`.

## 1. Problem

The target picker (`components/quiz/targets/TargetPicker.tsx`) lists all 912 seeded
benchmarks as one flat list under "Standards". Teachers need to browse by content area,
strand and standard, tag at the standard level when a benchmark is too specific, and see
only the grades and subjects they teach. The app has no per-teacher grade or subject
setting; grade gating everywhere derives from the building's bands.

## 2. Decisions (settled)

| #   | Decision                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Tree shape:** content area → strand → standard → benchmark. Strand is navigation only. Standards and benchmarks are selectable.                                                                                                                                  |
| 2   | **Standard tag rollup:** a standard row is the union of direct standard tags and child benchmark tags (extends decision 28 of the banks plan). Each question counts once.                                                                                          |
| 3   | **Grade is a filter, not a tree level.** Filter sits above the tree, defaults from the profile, hides benchmarks outside the grades and standards left with no children. "All grades" escape hatch.                                                                |
| 4   | **Profile grades are individual** (`K`, `1` … `12`), stored as `gradesTaught: string[]` on `users/{uid}/userProfile/profile`. Band-shaped catalog grades (`9-12`, `11-12`) match by overlap.                                                                       |
| 5   | **Profile subjects** `subjectsTaught: string[]`, optional. Empty means no subject filtering. Picker opens on the teacher's only subject when there is exactly one.                                                                                                 |
| 6   | **Profile home:** the settings modal becomes "Profile & Settings" with a new first section `profile` holding building(s), grades taught, content areas taught. `SidebarBuildings` deep-links to it.                                                                |
| 7   | **Targets get the same filter.** `LearningTarget` gains optional `grades?: string[]` and `subject?: string`. Explicit wins, else inherited from linked `standardIds`, else shown everywhere.                                                                       |
| 8   | **Subject list:** fixed defaults in `config/subjects.ts` (`ela`, `math`, `science`, `social-studies`, `world-language`, `art`, `music`, `pe-health`, `other`), admin-editable in `admin_settings/subjects`. Archive, never delete. Catalog subject ids are locked. |
| 9   | **Default grades from buildings:** union of all assigned buildings' bands expanded to individual grades. Only an unset profile derives; saved values survive building changes. "Reset to building default" link.                                                   |
| 10  | **Personal grades take over app-wide grade gating.** `userGradeLevels` in AuthContext maps `gradesTaught` back to bands when set; building bands stay the fallback.                                                                                                |
| 11  | **Search keeps the tree**, auto-expanding branches with matches; no flat results.                                                                                                                                                                                  |
| 12  | **Standard labels** come from the build script: `standardCode` and `standardTitle` split on the first colon of the standard text. Admin re-seed is the migration; client parses nothing.                                                                           |
| 13  | **Initial expansion:** strands open, standards collapsed, benchmarks expand per click. Nothing persisted between opens.                                                                                                                                            |
| 14  | **Picker overrides:** grade chip row and subject dropdown pre-set from the profile; changes last for that open only.                                                                                                                                               |
| 15  | **Target editor + CSV:** grade multi-select and subject dropdown per target; CSV becomes `code,description,standardCodes,grades,subject` with the last two optional. Paste-lines format unchanged.                                                                 |
| 16  | **Sequencing:** PR A profile + subjects → PR B1 data model → PR B2 tree picker. Stacked on dev-paul; retarget the child before the parent merges.                                                                                                                  |

## 3. Facts the design rests on

- Catalog docs carry `set`, `subject`, `code` (`grade.strand.standard.benchmark`),
  `grade`, `strand`, `standard` (long text), `text`, `searchText`. ELA: 3 strands, 23
  standards, grades K-10 plus `11-12`. Social Studies: 5 strands, 25 standards, K-8 plus
  `9-12`. Seeded by `components/admin/StandardsPanel.tsx` from `config/standards/*.json`
  built by `scripts/build-standards.mjs`. Re-seed upserts by id.
- `useStandardsCatalog` fetches the whole collection once per session (912 docs).
- `GradeLevel` bands (`k-2`, `3-5`, `6-8`, `9-12`) drive widgets, starter packs, math
  tools. `getBuildingGradeLevels` in `config/buildings.ts` unions bands across ids;
  AuthContext exposes it as `userGradeLevels`.
- Profile doc is `users/{uid}/userProfile/profile` (AuthContext reads/writes it already).
  No new rules needed for profile fields. `admin_settings/*` is admin write, authed read.
- Target lists: `plcs/{plcId}/meta/learningTargets` and
  `users/{uid}/userProfile/learningTargets`. Editors: `LearningTargetsManager.tsx` (PLC)
  and `PersonalLearningTargetsModal.tsx`. Parsers in `utils/learningTargets.ts`.
- Settings modal: `components/settingsModal/SettingsModal.tsx`, `SectionId` union and
  `SECTIONS` array, one component per section under `sections/`.

## 4. Data model

```ts
// config/subjects.ts
export interface Subject {
  id: string; // 'ela'
  label: string;
  archived?: boolean;
}
export const DEFAULT_SUBJECTS: Subject[]; // the nine defaults
export const CATALOG_SUBJECT_IDS = ['ela', 'social-studies'] as const; // locked

// admin_settings/subjects
interface SubjectsDoc {
  subjects: Subject[];
  updatedAt: number;
}

// users/{uid}/userProfile/profile (additive)
gradesTaught?: string[]; // 'K' | '1' … '12'; absent = derive from buildings
subjectsTaught?: string[]; // Subject ids; absent or [] = no subject filter

// StandardBenchmark (additive, from build script)
standardCode: string; // 'R9' | '5'
standardTitle: string; // 'Media Literacy in Reading' | 'Public Policy'

// LearningTarget (additive)
grades?: string[];
subject?: string;
```

Grade matching helper (`utils/gradeMatch.ts`): `gradeOverlaps(catalogGrade, taught)`
expands `9-12` / `11-12` to individual grades and tests set intersection. Band derivation
(`bandsFromGrades`) maps individual grades back to `GradeLevel[]`.

Target effective grade/subject (`utils/learningTargets.ts`):
`effectiveGrades(target, catalogById)` = explicit, else union of linked benchmarks'
grades, else `null` (everywhere). Same for subject.

## 5. PR A: Profile settings and subjects

- `config/subjects.ts` with defaults and locked catalog ids.
- `hooks/useSubjects.ts`: reads `admin_settings/subjects`, falls back to defaults when
  the doc is absent. Admin panel `components/admin/SubjectsPanel.tsx` with add, rename,
  archive; archive refused for locked ids. Seeds the doc on first save.
- `ProfileSection.tsx` in `settingsModal/sections/`: building multi-select (moved from
  `SidebarBuildings`, which becomes a button that opens the modal on `profile`), grade
  chips K-12 with "Reset to building default", subject chips.
- AuthContext: read `gradesTaught` / `subjectsTaught` from the profile, expose
  `gradesTaught`, `subjectsTaught`, `effectiveGrades` (derived when unset), and change
  `userGradeLevels` to `bandsFromGrades(effectiveGrades)`.
- i18n: new strings in all four locales.
- Tests: band derivation and overlap helpers, ProfileSection reset behaviour,
  AuthContext `userGradeLevels` precedence, SubjectsPanel lock.

## 6. PR B1: Data model

- `scripts/build-standards.mjs` emits `standardCode` and `standardTitle`; regenerate both
  JSON files; `StandardBenchmark` type gains the fields (optional until re-seeded, the
  picker falls back to splitting on the client only if absent).
- `LearningTarget.grades` / `.subject`; editors gain the two controls; CSV parser accepts
  the two optional trailing columns (`grades` as `6;7;8` inside one cell).
- `effectiveGrades` / `effectiveSubject` helpers with tests.
- Admin re-seed after deploy (manual step, noted in the PR).

## 7. PR B2: Tree picker

- New `StandardsTree.tsx` under `components/quiz/targets/`: builds the tree from the
  catalog once (`useMemo`), keyed by subject → strand → `standardCode`. Rows for standard
  and benchmark are selectable; strand rows toggle only.
- Filters above the tree: subject dropdown (from `useSubjects`, restricted to subjects
  the catalog has), grade chip row. Both initialised from the profile; local state only.
- Search: term match on `searchText` or `standardTitle`; ancestors of matches expand,
  non-matching branches hide.
- Target sections (PLC, personal) apply the same grade/subject filter via
  `effectiveGrades` / `effectiveSubject`; unfilterable targets always show.
- `tagFromBenchmark` unchanged; new `tagFromStandard` produces
  `{ id: 'mn-ela-2020:std:R9', kind: 'standard', code: 'R9', label: standardTitle }`.
- Rollup: `utils/quizTargetStats.ts` and `functions/src/plcAssessmentMath.ts` treat a
  standard id with the `:std:` marker as the parent of every benchmark sharing the set
  and `standardCode`. Results rows for standards use `standardTitle`.
- Remove the `MAX_STANDARD_ROWS` cap; the tree bounds the render.
- Tests: tree building, filter and search expansion, standard-tag rollup union in both
  the client stats and the Cloud Function math.

## 8. Out of scope

- Grades on PLC target lists as a list-level setting.
- Remembering expansion state.
- Non-Minnesota catalogs (the tree is set-agnostic already).
