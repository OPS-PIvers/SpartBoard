# Quiz: state-test item formats, the District library and the MCA released-items package

Grilled and settled 2026-11-11. Stacked PRs to dev-paul in the order below. Terms are defined in `GLOSSARY.md`.

## Goal

Teachers should be able to give students the Minnesota Department of Education's released MCA questions in SpartBoard in the form students meet on the test: tabbed stimuli beside the question, dropdowns and drag-in words instead of typing, a review step before submitting, and MDE's rationale available afterwards.

The first attempt (a hand-built `.imscc` of the 48 grade 8 science items, 2026-11-11) worked, but only by bending the items to fit the Quiz widget. This plan removes the bending.

## The split: what is core Quiz and what is MCA

**M1. Everything students and teachers touch is core Quiz. There is no MCA question type, mode, preset or widget.**

Dropdown blanks, word banks, sort-into-groups, tabbed sources, a review step and answer explanations are the standard item set on every state test and most publisher assessments. Built as "MCA practice" they would serve 48 questions; built as Quiz features they serve every quiz.

| Piece                                                    | Where it belongs                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Blank types (typed, dropdown, drag)                      | Core Quiz, this plan                                                           |
| Stimulus tabs                                            | Core Quiz, this plan                                                           |
| Explanations                                             | Core Quiz, this plan                                                           |
| DOK on questions and in results                          | Core Quiz, this plan                                                           |
| Review before submit, mark for review                    | Core Quiz, this plan                                                           |
| District library                                         | Core, this plan (pulled forward from `QUIZ_STRUCTURED_ASSESSMENTS.md` D28–D29) |
| Sort into groups (Categorize), Part A/B                  | Core Quiz, `QUIZ_STRUCTURED_ASSESSMENTS.md` PRs 3–4, unchanged                 |
| The MDE script, the package file it writes and the banks | **The MCA package**: content and one admin-run script                          |

No code in Quiz knows about MCA. If MDE changes its site, only the script breaks.

## Current-state facts (checked 2026-11-11)

- **The source.** `https://pub.education.mn.gov/mqtapp/` is a React page over a public, unauthenticated API at `https://api.education.mn.gov/mqtapi/api`:
  - `/Questions/GetQuestionsAsync?TestTypeId=5&SubjectId=30&selectedgrades=8` lists items with `itemTableId`, `naepId`, `type`, `difficulty` (DOK), `contentArea` (science practice) and `standard` (the MN benchmark code).
  - `/QuestionDetails/GetQuestionDetailsAsync?itemTableId=` returns the question HTML; `/QuestionDetails/scoringguide?itemTableId=` the key and rationale; `/TabTemplate/DisplayTab?naepid=` the stimulus tabs as JSON; `/Charts/CreatePerformanceChartAsync?itemTableId=` a PNG of statewide results (a picture, no numbers).
  - The same API serves every test type, subject and grade.
- **The grade 8 science set.** 48 items across 9 phenomena (stimulus sets of 1–3 tabs, each a reading with 1–3 figures). By MDE type: 17 multiple choice, 6 multiple response, 10 gap match (drag a word into a sentence), 8 inline choice (dropdowns), 2 graphic gap match and 2 match (both drag-to-category), 2 point graph, 1 constructed response.
- **Fit today.** 24 of 48 run in their real format (MC, MA, free response). The rest were converted: 18 to typed fill-in-the-blank, 4 to Matching, 2 point-graph items split into a written Part A and an MC Part B.
- **FIB is typed only.** One text box per blank (`FibMultiBlankInput.tsx`); graded by normalized equality, case-insensitive, punctuation counted (`normalizeAnswer`, `scoreFibBlanks`). Each blank already has its own accepted-alternates list (`blankAlternates`).
- **Matching with repeated matches** renders two identical chips and grades per term (`MatchingResponseInput.tsx`).
- **No explanation field** exists on `QuizQuestion`.
- **Stimulus layout** (`QuizStudentApp.tsx`, `utils/quizStimuli.ts`). "Doc-shaped" stimuli (`pdf`, `gdoc-embed`, `text`, `calculator`) stack in one column, each at least 280px tall: left of the question on wide screens (sticky, 44% wide, drag-resizable), above it and capped at 45vh on narrow ones. Images, audio and video stack inline above the question text. There are no tabs. `QuizStimulus.label` is authoring-only and stripped before the session doc is written.
- **How a key reaches students.** On publish at the `score-responses-and-answers` level, the teacher's client writes `revealedAnswers` and `revealedRubricExamples` onto each student's response doc, and inside `resultsOverride` for a per-student publish (`publishAssignmentScores`, `publishResultsForStudents` in `useQuizAssignments.ts`; read by `resolveResultsVisibility`). No callable is involved. `functions/src/subLaunchAssignment.ts` keeps an allowlist of answer fields.
- **Session options.** Assign opens in self-paced "Assessment Mode" with questions in order, answers hidden and answer options shuffled (`DEFAULT_QUIZ_BEHAVIOR`). A self-paced student can always go back. There is no mark-for-review and no review screen: answering the last question submits the quiz.
- **Learning targets.** Results can already group by learning target (`showLearningTargets`, `QuizQuestion.targets`).
- **The cartridge reader** reads per-question pictures but not shared passages, standards, choices or explanations, so the stopgap import flattened each MCA tab into one PNG that read-aloud and translation cannot read.
- **Library.** Quizzes and banks are `.quiz.json` files in the owner's Drive. Nothing publishes them to buildings or grades; `QUIZ_STRUCTURED_ASSESSMENTS.md` D28–D29 designed that as the "admin assessment library" for quizzes only, and it is unbuilt.
- **ADR 0001** puts Platform readers in the extension and names no exception for a public API.

## Decisions

### Scope and order

- **M1.** As above: all core Quiz, no MCA type, mode or widget.
- **M2.** This plan's Quiz PRs go first and stand alone. Categorize, Part A/B and structured passages stay in `QUIZ_STRUCTURED_ASSESSMENTS.md` and follow from it.
- **M3.** A point-plot question type is out of scope (2 items of 48). Those items stay as a written Part A plus an MC Part B.
- **M4.** No "State test practice" preset. Quiz's assign defaults are already test-like, and explanations attach to options, so shuffled options don't break a rationale.
- **M5.** Each teacher-facing feature gets its own `GlobalFeature` under the flag-first rule. The student player, grading and results understand every new field regardless of flags, and reach `main` before or with the authoring tools.

### Blank types (PR 1)

- **M6.** A setting inside the Fill in the blank editor, not a new entry in the type picker: **Blank type: Typed / Dropdown / Drag**. It applies to the whole question.
  - **Typed** is today's behaviour.
  - **Dropdown:** each blank has its own list of choices (MCA inline choice).
  - **Drag:** one shared word bank of chips dragged or tapped into the blanks (MCA gap match), with **Words can be used more than once** (off by default).
- **M7.** Saved as optional fields on the FIB question (`blankType`, and the choices per blank or for the bank). The key and `scoreFibBlanks` are unchanged, so results, score overrides, PLC math and exports need no change, and a previous client shows text boxes that still grade when the student types the choice.
- **M8.** Choices are student-facing and travel with the public question; the key does not. The word bank shuffles; a dropdown keeps the authored order. On save, every blank's answer must be among its choices. PR 1 covers every producer and reader of the public FIB question, not only the client's `toPublicQuestion`: the server copy for sub-launched quizzes (`publicQuestionFromKey` in `functions/src/subLaunchAssignment.ts`) and the read-aloud part resolver (`functions/src/quizReadAloud.ts`) both keep only the fields they list.
- **M9.** No any-order setting. A word bank whose words are used once cannot produce "heat, heat, heat", so "any order" is each blank accepting the other words through the existing accepted-alternates list. Known gap: typed blanks still cannot be graded as a set.
- **M10.** Drag reuses the dnd-kit base, tap-to-place and keyboard support from Matching. Read-aloud reads the sentence, then the choices. Paper answer sheets print dropdown choices in brackets after the blank and the word bank under the sentence.
  - The paper clause is deferred to AB-199: paper sheets print no fill-in-the-blank today, so dropdown and drag stay excluded like typed blanks.

### Stimulus tabs (PR 2)

- **M11.** One stimulus panel beside the question. When a question has two or more stimuli in the panel they show as tabs, for every quiz; existing quizzes change to match once the flag opens (M5). Until then the tabbed layout and the M13 picture move reach only sessions started by a teacher who has `quiz-stimulus-tabs`. The first tab opens by default and the panel stays resizable.
- **M12.** Tab names come from a new student-visible `tabLabel` on the stimulus ("Tab A", "Source 2"), kept in the session doc. Unnamed tabs are numbered. The authoring-only `label` is unchanged.
- **M13.** Where a picture goes: every image stimulus goes in the panel beside the question, as a tab when there are two or more (Paul, 2026-11-14; it was shared pictures only). A per-stimulus **Show: Beside the question / In the question** override keeps a small figure in the question. Audio and video stay inline.
- **M14.** The calculator stays in the panel as the last tab, named "Calculator".
- **M15.** One tab holding a reading and its figures together needs inline images in a text stimulus (`QUIZ_STRUCTURED_ASSESSMENTS.md` D21). Until that ships, the MCA package (M33) sends each tab as one rendered picture with the tab's words saved as its `readAloudText`.

### Explanations (PR 3)

- **M16.** `QuizQuestion` gains an optional **Explanation**: why the answer is right. MC and MA can also carry one per option (why that choice is right or wrong). Plain text.
- **M17.** Teachers always see explanations: in the editor, the results drill-down and print. Students see them only under each question in published results, and only when the session's **Show explanations** is on (default off). Never during an attempt.
- **M18.** They travel the way `revealedRubricExamples` does: built from the teacher's quiz at publish, written to each response doc and to `resultsOverride` for a per-student publish, cleared when results are hidden or unpublished, and read through `resolveResultsVisibility`. Needs the `firestore.rules` response-doc check and the `subLaunchAssignment` allowlist.

### DOK (PR 4)

- **M19.** An optional DOK level (1–4) on any question, set inside the existing Learning Targets field in the editor. No new editor row.
- **M20.** Results get one **Group by: Target / DOK** switch inside the existing learning-target breakdown, for a teacher's own results and the PLC aggregate. The switch appears only when at least one question in the quiz has a DOK. No new tab, panel or column.
- **M21.** Bank draws can filter by DOK ("5 questions at DOK 3").
- **M22.** MDE's science practice comes in as a learning-target tag beside the benchmark, not as a new field.

### Review before submit (PR 5)

- **M23.** Self-paced sessions end on a **Review before you submit** screen that lists every question as answered, unanswered or marked, with a jump to each. Submit lives on that screen; answering the last question no longer submits.
- **M24.** A **Mark for review** button on each question. Marks are the student's own for that attempt: shown on their review screen, cleared on submit, never shown on the teacher's monitor or in results.
- **M25.** Teacher-paced, auto-paced and game sessions are unchanged. A closed section ("Stop") still locks its questions; the review screen lists them as locked.

### District library (PRs 6–7)

- **M26.** Build `QUIZ_STRUCTURED_ASSESSMENTS.md` D28–D29 here, under the name **District library**, holding question banks as well as quizzes. That plan's PR 9 becomes "use the District library" when it is reached.
- **M27.** Targeting, linked delivery through `synced_quizzes` and "Make my own copy" are as D28 says. Rules enforce the targeting.
- **M28.** A teacher who uses a library bank gets a **linked, read-only bank**. They draw its questions into their own quizzes, which they edit freely; question ids survive, so team results line up. An admin's correction reaches the bank for everyone.
- **M29.** Admin Settings gets the library screen: upload a package file (M31), review it, publish, change targeting, replace with a newer file, unpublish and delete.
- **M30.** District-only for every item (D29): no public share links or auth-free surfaces, with no per-item switch. MDE's own site remains the public copy of the released items.

### The MCA package (PRs 8–9)

- **M31.** A **package file**: one zip of the native quiz and bank JSON plus their pictures, carrying choices, tab labels, explanations, standards and DOK. The library screen is its only reader. Uploading a newer package updates the same items, matched by stable ids.
- **M32.** An admin-run repo script (`scripts/`) reads the Minnesota Questions Tool API and writes a package file. It needs no prod credentials and is not a Platform reader, so ADR 0001 is untouched. It is rerun when MDE releases items.
- **M33.** The script's mapping, one bank per stimulus set:

  | MDE type           | Becomes                    | Notes                                                                                   |
  | ------------------ | -------------------------- | --------------------------------------------------------------------------------------- |
  | MC                 | MC                         | Per-option rationale → option explanations                                              |
  | MR                 | MA                         | choose-exactly-N once `QUIZ_STRUCTURED_ASSESSMENTS.md` D18 exists                       |
  | IC (inline choice) | FIB, Dropdown              | Choices from the `<select>` elements; key from the rubric sentence                      |
  | GM (gap match)     | FIB, Drag                  | Sentence and choices come from image alt text; the script lists these for a human check |
  | GGM, MATCH         | Categorize                 | Matching until Categorize ships                                                         |
  | PG (point graph)   | Part A written + Part B MC | Human check (M3)                                                                        |
  | CR                 | Free response              | MDE's holistic rubric becomes a rubric with levels                                      |

  Each question also gets its stimulus tabs, benchmark, DOK, science practice tag, MDE's rationale as the explanation, an Attribution line ("Minnesota Department of Education, released MCA item 880921"), and the statewide results picture attached to the explanation for teachers.

- **M34.** First package: MCA IV science, grades 5, 8 and high school. Validate each set against MDE's site (item count, every key, every figure present) before publishing. Math and reading are a second pass, after a look at their item types.
- **M35.** The hand-built grade 8 `.imscc` banks are the stopgap. The package replaces them; teachers keep any quiz already built from them.

## PR sequence

| PR  | Scope                                                                                  | Flag (proposed)                                                    | Depends on                      |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| 1   | Blank types: Typed / Dropdown / Drag (M6–M10)                                          | `quiz-blank-types`                                                 | —                               |
| 2   | Stimulus tabs, `tabLabel`, shared pictures in the panel (M11–M15)                      | `quiz-stimulus-tabs` gates authoring and the student layout change | —                               |
| 3   | Explanations and Show explanations (M16–M18)                                           | `quiz-explanations`                                                | —                               |
| 4   | DOK field, Group by DOK, bank draw filter (M19–M22)                                    | `quiz-dok`                                                         | —                               |
| 5   | Review before submit, Mark for review (M23–M25)                                        | retired, on for everyone                                           | —                               |
| 6   | District library: collection, targeting rules, linked banks and quizzes (M26–M28, M30) | `district-library`                                                 | —                               |
| 7   | District library admin screen and package upload (M29, M31)                            | behind PR 6's flag                                                 | PR 6                            |
| 8   | MDE script and package writer (M32–M33)                                                | none (tooling)                                                     | PR 7; PRs 1–4 for full fidelity |
| 9   | Science package for grades 5, 8 and HS, validated and published (M34–M35)              | none (content)                                                     | PR 8                            |

PRs 6–7 have no dependency on PRs 1–5 and can be built alongside them. The flag ids are proposals; rename them in the PR that adds each one.

Coverage of the 48 grade 8 science items in their real format: 24 today; 42 after PR 1; 46 once Categorize is public. The 2 point-graph items stay converted.

## Rules and compatibility notes

- PR 2 changes what students see on existing quizzes with several stimuli. That change sits behind the PR's flag; its changelog entry is written when the flag opens to everyone. It also needs a check of every stimulus type in the tabbed panel on a phone and a Chromebook.
- PR 3 adds a field to the response doc and PR 6 adds a collection with targeting rules. Check the compiled rules size with `node scripts/releaseFirestoreRules.mjs spartboard-dev` before either reaches `main`.
- PR 5 changes how a self-paced quiz ends. A previous client still submits on the last answer; both must grade the same.

## Open items

- **Terms of use.** MDE publishes released items for classroom use. Paul to confirm that covers redistribution inside the district through the District library. M30 keeps them internal either way.
- **State results as numbers.** The API returns only a chart picture, so comparing a class to the state is not planned. It would need the numbers read off the picture or supplied by MDE.
- **Math and reading item types** have not been looked at (equation entry, number lines, long passages). Survey them before the second package.
- **Where District library files live.** Settled in PRs 6–7: content in `synced_quizzes` / `synced_question_banks` at a random `syncGroupId` minted with the draft header (marked `districtItemId`, written by any site admin), pictures in Firebase Storage at `district_library/{itemId}/v{version}-{attemptId}/`, never in an admin's Drive. Each upload attempt writes a new folder and old ones are kept, so live sessions and frozen copies keep their pictures.
- **Changelog.** Each flagged piece gets its `public/changelog.json` entry when its flag opens to everyone, not when it merges.
