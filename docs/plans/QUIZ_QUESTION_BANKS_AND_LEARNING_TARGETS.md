# Question banks, learning targets and MN standards for the Quiz widget

**Status:** approved design, not started
**Decided:** 2026-09-10 (grilling session with Paul)
**Supersedes:** `QUIZ_LEARNING_TARGETS_TAGGING.md` and `QUIZ_QUESTION_BANKS.md` (both outline-only, deleted)
**Depends on:** `PLC_ASSESSMENT_DATA.md` PR 2 (pooled per-question aggregate, shipped 2026-09-10)
**Branch flow:** five sequential PRs into `dev-paul`, then `dev-paul` → `main`

## 1. Goal

Teachers build reusable **question banks** and assemble quizzes from them, either by
hand-picking questions or by asking for _N random questions_ where every **attempt**
(not every quiz) gets its own draw. Questions, banks and quizzes can be tagged with
**learning targets** (PLC-authored or personal) and **Minnesota state standards** (a
seeded catalog). Teacher Results and the PLC pooled view gain a per-target axis so a
department can see mastery by target and roll it up to the standard.

## 2. Decisions (settled)

| #   | Decision                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | **Bank scope:** personal, with a PLC share toggle. Shared banks sync read-only to PLC members through the same `synced_*` machinery quizzes use. No co-editing in v1.                                                                                              |
| 2   | **Bank linkage:** live in the editor, frozen at assign. A quiz stores bank _slots_ (reference + draw rule). When assigned, the resolved pool is snapshotted so every attempt draws from an identical set. Bank edits affect future assignments only.               |
| 3   | **Draw scoring:** a random slot carries one point value applied to every drawn question, so every attempt has the same max score. Hand-picked questions keep their own points.                                                                                     |
| 4   | **Seeded standards:** MN ELA (2020) and MN Social Studies (2021), full K-12, tagged at the benchmark level.                                                                                                                                                        |
| 5   | **Target hierarchy:** a learning target may link to zero or more standards. Rollups use the link when present.                                                                                                                                                     |
| 6   | **Target owners:** PLC-owned lists (members edit) plus a personal list per teacher. The tag picker shows standards, every PLC the teacher belongs to, and personal targets.                                                                                        |
| 7   | **Bulk load:** paste lines (`CODE                                                                                                                                                                                                                                  | description`) and CSV (`code,description,standardCodes`). No AI extraction in v1. |
| 8   | **Retakes:** every attempt, including retakes, gets a fresh draw.                                                                                                                                                                                                  |
| 9   | **Bank storage:** Drive JSON + Firestore metadata, mirroring quizzes. Metadata carries tag ids and per-tag counts so the picker filters without loading Drive.                                                                                                     |
| 10  | **Slot shape:** `selected` (explicit ids) or `random` (count) with an optional target filter and slot points. A quiz may hold many slots.                                                                                                                          |
| 11  | **Draw engine:** the teacher client writes a resolved, keyed quiz snapshot to a Drive file at assign time; the session doc holds the full public pool; the student app draws its subset at attempt start and records it in `servedQuestionIds`. No Cloud Function. |
| 12  | **Caps:** 200 questions per bank (warn), 150 questions in a resolved assignment pool (block).                                                                                                                                                                      |
| 13  | **Rules budget:** PR 0 strips comments from `firestore.rules` at deploy time (`scripts/stripRulesComments.mjs`); the 256 KB cap now applies to rule logic only (~110 KB free).                                                                                     |
| 14  | **Catalog seed:** datasets in `config/standards/`, loaded into a global `standards_catalog` collection by an admin "Seed standards" action. Re-seed is idempotent.                                                                                                 |
| 15  | **PLC rollup:** the aggregate gains a `perTarget[]` axis next to `perQuestion[]`; per-question rows show served counts.                                                                                                                                            |
| 16  | **Tag shape:** id + kind + code + label snapshot (+ parent standard ids) on the question, like `rubricSnapshot`. Rollups key on id; display survives renames and deletes.                                                                                          |
| 17  | **Bank tags:** stored on the bank, shown as inherited in the bank editor, merged into each question's tags when it is copied into a quiz or a pool is frozen.                                                                                                      |
| 18  | **Target docs:** one array doc per owner: `plcs/{plcId}/meta/learningTargets` and `users/{uid}/userProfile/learningTargets`. Cap 1,000 targets per doc.                                                                                                            |
| 19  | **Bank UI home:** a fourth `Banks` tab in the Quiz manager with the same grid/list, folders and share toggle. Bank editor reuses the quiz question editor plus a tag toolbar.                                                                                      |
| 20  | **Results viz:** Targets tab with class mastery per target, a student × target grid with CSV export, and standard-level rollup rows. Growth across assignments is out of scope.                                                                                    |
| 21  | **Student view:** assignment setting `showLearningTargets` (default off) groups the student results screen by target.                                                                                                                                              |
| 22  | **Bank flows:** quiz → bank "Save to bank"; bank → quiz as fixed copies (selected mode); "Draft with AI" inside the bank editor.                                                                                                                                   |
| 23  | **AI gate:** new global permission `question-bank-ai` (access level + enabled), AND-ed with `gemini-functions`.                                                                                                                                                    |
| 24  | **Synced quizzes:** sharing a quiz to a PLC fails validation unless every referenced bank is PLC-shared (one-click share offered). Slots on synced quizzes reference the bank's synced group id.                                                                   |
| 25  | **Short pools:** assign is blocked with a per-slot fix-it message when a slot has fewer eligible questions than its count.                                                                                                                                         |
| 26  | **Mastery bands:** green ≥ 80, yellow 60-79, red < 60. PLC leads can change the two cutoffs in PLC settings; personal views use the defaults.                                                                                                                      |
| 27  | **Draw order:** drawn questions replace the slot in place, shuffled among themselves. `shuffleQuestions` still shuffles the whole attempt when on.                                                                                                                 |
| 28  | **Standard rollup:** a standard row is the union of questions tagged with it directly and questions tagged with a child target. Each question counts once.                                                                                                         |
| 29  | **Low sample:** item rows served to fewer than 5 students carry a "low sample" marker and are excluded from hardest-question rankings.                                                                                                                             |
| 30  | **Sequencing:** PR 0 rules → PR 1 targets → PR 2 banks → PR 3 teacher Results → PR 4 PLC aggregate.                                                                                                                                                                |

## 3. Facts the design rests on

- Quiz content is JSON in the teacher's Drive (`utils/quizDriveService.ts`); Firestore
  holds `QuizMetadata` only (`types.ts` `QuizMetadata`). Tags on `QuizQuestion` cost no
  rules bytes and have no doc-size ceiling, but are not queryable.
- `QuizQuestion.id` is stable and is the join key through `QuizPublicQuestion`,
  `QuizResponseAnswer.questionId` and `PlcAssessmentAggregate.perQuestion[].questionId`.
- `QuizResponse.servedQuestionIds` already records the subset served to one student and
  scoring already prefers it (`utils/quizQuestionStats.ts` skips ids a response lacks).
  Random draws reuse this field unchanged.
- Grading is client-side (`gradeAnswer`, `hooks/useQuizSession.ts`) against the quiz
  loaded from Drive. Nothing writes `QuizResponse.score`.
- The pooled aggregate (`functions/src/recomputePlcAssessments.ts`,
  `plcAssessmentMath.ts`) is written only by the server and already supports `byId`
  alignment. It has no grouping axis.
- `firestore.rules` is 249,516 bytes with comments, 152,186 bytes stripped. The deploy
  script strips full-line comments and blank lines before `firebase deploy`, so the 256 KB
  cap applies to the stripped text and `check:rules-size` measures that.
- The only tag-like field today is `PlcCommonAssessment.unitLabel` (free text). It stays
  as is.

## 4. Data model

All new types go in `types.ts` next to the quiz types.

### 4.1 Standards and learning targets

```ts
export type StandardSubject = 'ela' | 'social-studies'; // extend later

/** One benchmark in the seeded catalog. Doc id = `${set}:${code}`. */
export interface StandardBenchmark {
  id: string; // 'mn-ela-2020:6.4.2.2'
  set: string; // 'mn-ela-2020' | 'mn-ss-2021'
  subject: StandardSubject;
  code: string; // official benchmark code
  grade: string; // 'K' | '1' ... '12' | '9-12'
  strand: string;
  standard: string; // parent standard text
  text: string; // benchmark text
  searchText: string; // lowercased code + text
}

export type LearningTargetKind = 'standard' | 'plc' | 'personal';

/** A PLC- or teacher-authored target. Lives inside an owner's array doc. */
export interface LearningTarget {
  id: string; // uuid
  code?: string; // 'LT 4.2'
  label: string;
  standardIds?: string[]; // StandardBenchmark ids (decision 5)
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Array doc at plcs/{plcId}/meta/learningTargets and users/{uid}/userProfile/learningTargets. */
export interface LearningTargetList {
  targets: LearningTarget[]; // ≤ 1000
  masteryCutoffs?: { proficient: number; approaching: number }; // PLC doc only; default 80 / 60
  updatedAt: number;
}

/** Snapshot stored on a question (decision 16). */
export interface QuestionTargetTag {
  id: string; // StandardBenchmark.id or LearningTarget.id
  kind: LearningTargetKind;
  ownerId?: string; // plcId for 'plc'; absent for standard/personal
  code?: string;
  label: string;
  standardIds?: string[]; // copied from LearningTarget.standardIds for rollups (decision 28)
}
```

`QuizQuestion` gains `targets?: QuestionTargetTag[]`. `QuizPublicQuestion` gains the
same field only when the assignment's `showLearningTargets` is true (students otherwise
never receive tags).

### 4.2 Question banks

```ts
/** Drive JSON (mirrors QuizData). */
export interface QuestionBankData {
  id: string;
  title: string;
  questions: QuizQuestion[]; // ≤ 200 (warn)
  stimuli?: QuizStimulus[];
  targets?: QuestionTargetTag[]; // bank-level tags (decision 17)
  language?: string;
  createdAt: number;
  updatedAt: number;
}

/** Firestore at users/{uid}/question_banks/{bankId} (mirrors QuizMetadata). */
export interface QuestionBankMetadata {
  id: string;
  title: string;
  driveFileId: string;
  questionCount: number;
  folderId?: string | null;
  order?: number;
  searchText: string;
  targetIds: string[]; // union of bank tags + every question's tags
  targetCounts: Record<string, number>; // targetId → eligible question count, for the picker
  sync?: PlcQuizSync; // reuse the synced-quiz sync shape
  createdAt: number;
  updatedAt: number;
}
```

PLC sharing reuses the quiz pattern: `plcs/{plcId}/question_banks/{id}` header
(`PlcBankEntry`, same fields as `PlcQuizEntry`) pointing at `/synced_question_banks/{groupId}`.

### 4.3 Bank slots on a quiz

```ts
export interface QuizBankSlot {
  id: string; // uuid; the slot's position in QuizData.items
  bankId: string; // owner's bank id
  syncGroupId?: string; // set when the quiz is PLC-synced (decision 24)
  bankTitle: string; // display snapshot
  mode: 'selected' | 'random';
  questionIds?: string[]; // selected mode
  count?: number; // random mode
  targetFilter?: string[]; // random mode; any-of match on tag ids
  points?: number; // random mode; default 1 (decision 3)
}
```

`QuizData` gains `bankSlots?: QuizBankSlot[]` and `order?: Array<{ kind: 'question' | 'slot'; id: string }>`
so slots have a position among fixed questions. Selected-mode slots are resolved into fixed
copies at add time (decision 22), so at rest only random slots survive in `bankSlots`; the
`selected` mode exists for the picker UI and the "Save to bank" reverse flow.

### 4.4 Assignment and session

- `QuizAssignmentSettings` gains `showLearningTargets?: boolean` (default false) and
  `resolvedDriveFileId?: string`, the keyed snapshot written at assign time (decision 11).
- `QuizSession` gains `bankSlots?: Array<{ id; count; points; poolQuestionIds: string[]; position: number }>`
  and `publicQuestions` carries the full pool (fixed questions + every pool question). Cap:
  150 pool questions (decision 12), enforced before the session write.
- `QuizResponse.servedQuestionIds` is written on the first answer write of each attempt with
  the drawn ids. Per-attempt: the ledger's next `takeIndex` seeds nothing; the draw is
  `crypto.getRandomValues`-based and stored, never recomputed.
- Grading loads `resolvedDriveFileId` when present, else the live quiz file (unchanged
  behaviour for quizzes without slots).

### 4.5 PLC aggregate

`PlcAssessmentAggregate` gains:

```ts
perTarget?: Array<{
  targetId: string;
  kind: LearningTargetKind;
  code?: string;
  label: string;
  questionIds: string[];
  attempted: number; // student-question pairs
  correctPercent: number;
  lowSample: boolean; // attempted < 5
}>;
perStandard?: Array<same shape>; // union rollup (decision 28)
perQuestion[].servedCount: number;
```

`questionSnapshot` entries carry `targets` so the function can group without Drive access.

## 5. Firestore rules

PR 0 bought headroom first. New blocks (all owner/member checks, no schema locks beyond
`updatedAt`/array caps):

| Path                                           | Read           | Write                           |
| ---------------------------------------------- | -------------- | ------------------------------- |
| `standards_catalog/{id}`                       | authenticated  | admin                           |
| `users/{uid}/question_banks/{id}`              | owner          | owner                           |
| `users/{uid}/userProfile/learningTargets`      | existing owner | existing owner (no new rules)   |
| `plcs/{plcId}/meta/learningTargets`            | PLC member     | lead/coLead/member (not viewer) |
| `plcs/{plcId}/question_banks/{id}`             | PLC member     | sharer or lead (mirror quizzes) |
| `synced_question_banks/{groupId}` + `versions` | group members  | mirror `synced_quizzes`         |
| `global_permissions/question-bank-ai`          | existing       | existing                        |

Budget line: PR 0 freed ~97 KB of comment bytes from the deployed text; PR 1 + PR 2 have
no practical byte constraint but keep validators shared.
`tests/rules/` gains cases for each new path (CI-only on this machine).

## 6. Standards catalog

- `config/standards/mn-ela-2020.json` and `config/standards/mn-ss-2021.json`, generated by
  `scripts/build-standards.ts` from the MDE published documents, checked in. Each row is a
  `StandardBenchmark` minus `searchText`.
- Admin Settings → new "Standards" panel: shows seeded sets with counts, a "Seed / re-seed"
  button that batch-writes (500 per batch) with deterministic ids, and a diff summary
  (added / updated / unchanged). No delete.
- Client reads the catalog once per session via a cached query on `set` + `grade`; the
  picker filters by grade band, defaulting to the PLC's or teacher's grade if known.
- Licensing: MDE standards are public state documents; note the source URL and revision
  date in each JSON's header.

## 7. Client changes

### 7.1 Tagging (PR 1)

- `components/quiz/targets/TargetPicker.tsx`: searchable popover with three sections
  (Standards, PLC targets grouped by PLC, My targets), grade filter, multi-select, shows
  selected chips. Used by the question detail pane, the bank editor, and the bulk action.
- `QuizEditor` question list gains a checkbox select mode (`selectedIds: Set<string>`) with
  a toolbar: **Tag**, **Save to bank** (PR 2), **Delete**. Shift-click selects a range.
- Question rows show tag chips; bank-inherited chips render muted and non-removable.
- PLC page → Settings → "Learning targets": list, add, edit, archive, paste-lines import,
  CSV import (preview + validate before write), mastery cutoffs. Personal targets: the same
  component mounted from Quiz manager → Library → "My learning targets".
- Tags travel with synced quizzes unchanged (they are inside the Drive/synced content).

### 7.2 Banks (PR 2)

- Quiz manager `managerTab` gains `'banks'`; `QuizConfig.managerTab` type widened.
- `hooks/useQuestionBanks.ts` mirrors `useQuizzes` (list, create, rename, folder, delete,
  share toggle); Drive I/O through a `bankDriveService` that wraps `quizDriveService`.
- `BankEditorModal` = `QuizEditorModal` with `mode: 'bank'`: no assignment actions, bank
  tag toolbar, "Draft with AI" gated by `canAccessFeature('question-bank-ai') && canAccessFeature('gemini-functions')`,
  and the generated questions receive the bank tags.
- Quiz editor "Add" becomes a split button: **Blank question**, **From question bank…**.
  The picker modal: choose bank (personal + PLC-shared), then either check questions
  (selected mode, inlined as copies with merged tags) or set count + optional target filter +
  points (random slot). Slot rows in the question list show "Random · 5 of 18 · RL.6.2 · 2 pts".
- Assign modal: resolves every slot (loads bank Drive file or synced content), validates
  counts (decision 25) and pool size (decision 12), writes the resolved snapshot to Drive,
  builds `publicQuestions` from the full pool, writes `session.bankSlots`.
- Share-to-PLC validation (decision 24).
- Student app (`useQuizSessionStudent`): on attempt start, if `session.bankSlots` exists,
  draw per slot from `poolQuestionIds` excluding nothing (fresh draw, decision 8), splice at
  `position` in random order, then apply `shuffleQuestions`. Persist `servedQuestionIds` on
  the first answer write. Reload mid-attempt re-reads `servedQuestionIds` from the response
  doc so refreshes do not re-roll.
- Teacher live monitor and results already read `servedQuestionIds`; add served counts and
  the low-sample marker.

### 7.3 Teacher Results (PR 3)

- `QuizResults` gains a **Targets** tab (only when any served question has tags):
  - Class mastery list: target chip, served count, % correct, banded bar, expand to
    contributing questions.
  - Student × target grid: rows students, columns targets, cells % with band colour,
    sortable, CSV export via the existing export helper.
  - Standard rollup rows (union, decision 28) shown above the target rows when any target
    links to a standard.
- `utils/quizTargetStats.ts`: pure `computeTargetStats(questions, responses, cutoffs)`
  built on `computeQuestionStats`; unit-tested.
- Student results screen: when `showLearningTargets`, group feedback by target using the
  tags on `QuizPublicQuestion`.

### 7.4 PLC pooled view (PR 4)

- `plcAssessmentMath.ts` computes `perTarget`, `perStandard`, `servedCount`.
- `PlcAssessmentDetail` adds a Targets section mirroring 7.3's class view (no student
  rows: FERPA boundary unchanged).
- `PlcAssessmentList` rows show target chips; a filter by target/standard across the list.

## 8. PR checklists

### PR 0 — rules headroom (done)

- [x] Deploy-time comment strip: `scripts/stripRulesComments.mjs` runs in
      `.github/scripts/firebase-deploy-with-retry.sh`; surviving lines are byte-identical.
- [x] `scripts/checkRulesSize.mjs` measures the stripped size (152,186 of 262,144 bytes).
- [x] Stripped output validated against the Rules API (same 3 pre-existing warnings).
- [x] `tests/rules/` unchanged; they load the commented source.

### PR 1 — standards catalog, learning targets, tagging (done)

- [x] Types (§4.1), `standards_catalog` rules, `plcs/{plcId}/meta/learningTargets` rules
      (personal doc uses the existing userProfile rule). `showLearningTargets` sits on
      `QuizSessionOptions`; sessions project tags only when it is on (UI toggle lands in
      PR 3 with the student results view).
- [x] `config/standards/mn-ela-2020.json` built by `scripts/build-standards.mjs` from
      `config/standards/MN_ELA_Standards.csv` (MDE export, February 2024 corrected).
      Social Studies 2021 still needs its CSV.
- [x] Admin Standards panel with seed action (`utils/standardsCatalog.ts`).
- [x] `hooks/useLearningTargets.ts`, `hooks/useStandardsCatalog.ts`.
- [x] `components/quiz/targets/TargetPicker.tsx` + `TargetChips.tsx`; question detail
      tagging; checkbox multi-select with Tag / Delete / Clear in `QuizEditor`.
- [x] `components/plc/settings/LearningTargetsManager.tsx` in PLC Settings and as
      "Targets" in the Quiz library toolbar (personal).
- [x] Tags ride `QuizQuestion` through Drive save/load and synced versions (whole-object
      writes); Sheet/CSV/AI import adapters build questions field-by-field and carry none.
- [x] Tests: target list helpers, CSV parser, picker filtering, catalog diff, rules (CI).
- [x] Changelog. Help center article is Firestore-authored content, not code.

### PR 2 — question banks and per-attempt draws (done 2026-09-10)

- [x] Types (§4.2-4.4), bank rules, synced bank rules, `question-bank-ai` permission.
      Synced banks are owner-write / member-read (`synced_question_banks`, no join
      function; decision 1). Student `servedQuestionIds` on a bank-slot session is
      size-checked against `totalQuestions` (a client may pick pool questions but never
      shrink the denominator).
- [x] `useQuestionBanks`, `bankDriveService`, `useBankSources`, Banks tab
      (`QuizBanksTab`), folders (`question_bank_folders`), share toggle.
- [x] BankEditorModal (`QuizEditorModal mode='bank'`) incl. bank tags and gated AI.
- [x] "Save to bank" from quiz multi-select (`SaveToBankModal`).
- [x] Add split button + bank picker (`BankPickerModal`); slot rows; slot editing.
- [x] Assign-time resolution (`resolveQuizAssignment`), validation, resolved Drive
      snapshot (`saveDriveSnapshot`; `quizDriveFileId` points at it), session pool.
      Sync-to-latest is refused for bank assignments; view-only shares inline the pool.
- [x] Student draw (`chooseServedDraw`) + `servedQuestionIds` persisted at draw time +
      refresh safety; a retake join clears the field for a fresh draw.
- [x] Grading reads the resolved snapshot; results/monitor/export denominators now
      honour `servedQuestionIds` (`questionPointsFor`, `rowMaxPoints`).
- [x] Share-to-PLC bank validation (`reconcileBankSlotsForPlcShare`).
- [x] Tests: engine (17), records/drive (12), draw helpers, editor state (9), picker,
      manager Banks tab (3), share validator (8), rules (CI-only).
- [x] Changelog 2026.09.10.5. Help center article still to author in Firestore.

### PR 3 — teacher Results by target

- [ ] `computeTargetStats` + tests.
- [ ] Targets tab (class view, grid, CSV, standard rollup, low-sample marker).
- [ ] `showLearningTargets` assignment setting + student results grouping.
- [ ] Changelog.

### PR 4 — PLC per-target aggregate

- [ ] Aggregate types, `plcAssessmentMath` grouping + tests, `questionSnapshot.targets`.
- [ ] Recompute trigger unchanged; backfill script for existing aggregates optional.
- [ ] PLC detail Targets section, list chips and filter.
- [ ] Changelog.

## 9. Verification

- Unit: draw engine, stats, CSV parser, rules (CI).
- Manual on the dev preview: two-teacher PLC, one shared bank, quiz with 3 fixed + one
  random slot (5 of 12, target-filtered), assigned by both teachers; 4 student attempts
  with a retake; confirm distinct draws, equal max scores, served counts, Targets tab,
  pooled `perTarget`. Use `/session-views-dev` for student-side checks (dev-bypass cannot
  complete anonymous joins).
- Rules deploy: watch the first dev-branch push after each rules-touching PR for the 400.

## 10. Out of scope

- Growth across assignments per student per target.
- AI extraction of targets from pacing guides.
- Co-editable PLC banks.
- Cloud-Function-side draws (revisit if pool visibility in the session doc becomes a
  concern).
- MN Math and Science catalogs (same pipeline, add datasets later).
