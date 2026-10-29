# Schoology quiz import

Status: planned 2026-10-29 (grill with Paul). Not built.

## Goal

A teacher moves their existing Schoology Tests/Quizzes, Assessments and question banks into
SpartBoard in as few clicks as possible. It is a one-time move: the SpartBoard copy is its own and
is edited in SpartBoard afterwards. Pages, files, links, discussions and rubrics are out of scope.

## What we know (facts, not decisions)

### The Schoology REST API cannot read quiz content

Research of the REST v1 reference plus a read-only probe on test course 7660186912 with the prod
district key (2026-10-29, statuses and field names only):

- `GET /sections/{id}/grade_items` lists a Test/Quiz or Assessment only as a gradebook column:
  title, `max_points`, `due`, `grading_category`, `grading_period`, `published`, `folder_id`,
  `web_url`. No questions, choices, answer key, per-question points or images.
- There is no questions endpoint. Unknown paths under a section (`/sections/{id}/assessments`,
  `/assessments/{aid}/questions`, `/tests`, `/export`) do not fail: Schoology ignores the suffix
  and returns the section or assignment object with status 200. `/assessments/{aid}` is 404.
- No course export (Common Cartridge or QTI) exists in the API. QTI is import-only.
- With our key, `/sections/{id}/grading_rubrics` and `/courses/{cid}/folder/0` return 403.
- `/collections` returns the key owner's Resources, not a teacher's. No documented run-as.
- AMP Managed Assessments and managed question banks are not exposed anywhere.
- Rate limit (PowerSchool docs): 50 credits per user, refilled every 5 s; GET costs 1.

### What SpartBoard already has

- **Common Cartridge reader.** `utils/quizDocumentImport/cartridgeReader.ts` reads a Schoology
  `.imscc` export (QTI 1.2) into the shared `ExtractedQuiz` shape, one quiz (`readCartridge`) or
  every bank with its folder path (`readCartridgeBanks`, `utils/cartridgeBankImport.ts`,
  `CartridgeBankImportModal.tsx`). Behind the admin flags `quiz-imscc-import` and
  `question-bank-imscc-import` (`config/featureDefaults.ts`).
- **Shared normalizer.** Every reader returns `ExtractedQuiz` / `ExtractedQuestion`
  (`utils/quizDocumentImport/types.ts`); `toQuizData.ts` turns it into `QuizData`, marking
  unanswered questions `needsKey`, which blocks Assign. `attachImages.ts`
  (`attachDocumentImages`) uploads extracted images as quiz stimuli.
- **Saving.** Quizzes and banks are JSON in the teacher's Drive (`QuizDriveService.saveQuiz`,
  `utils/bankDriveService.ts`), written only from the SpartBoard client (`drive.file`).
- **Quiz question types:** `MC`, `MA`, `FIB`, `Matching`, `Ordering`, `free-response`.
- **Chrome extension** (`extension/`): `host_permissions: ["<all_urls>"]`, so a content script can
  run on Schoology pages. It calls our server with a Google access token, not Firebase auth
  (`functions/src/webTourExtension.ts`, `EXTENSION_OAUTH_CLIENTS`). Store listing is submitted but
  not yet published; it is force-installed district-wide once published.
- **Library folders** for quiz and question_bank (`hooks/useFolders.ts`, `ensureFolderPath`).

## Decisions

- **Q1 One-time move.** Imports make independent SpartBoard copies; no sync back or forward.
- **Q2 Scope.** Tests/Quizzes (classic Test/Quiz and the newer Assessment type) and question banks.
  Managed Assessments (AMP) are excluded: district-owned, and no reader can rely on seeing them.
- **Q3 Two routes.** The primary route is the extension; the fallback is the existing `.imscc`
  upload with a guided walkthrough. REST is not used for content.
- **Q4 Extension button on the Schoology page.** On a Test/Quiz, Assessment or question-bank page
  the extension adds a small "Send to SpartBoard" button. It reads the questions from the page (or
  the page's own data requests) in the teacher's signed-in session.
- **Q5 Bulk checklist.** On a course's Materials page and in a Resources folder, the extension adds
  "Send quizzes to SpartBoard": a checklist of the Tests/Quizzes, Assessments and banks it can see.
  Items are read one at a time with a progress count, staying well inside Schoology's rate.
- **Q6 Question types.** Map what fits; nothing is silently dropped:

  | Schoology            | SpartBoard                                   |
  | -------------------- | -------------------------------------------- |
  | Multiple choice      | `MC` (or `MA` when several are correct)      |
  | True/False           | `MC` with True / False choices               |
  | Matching             | `Matching`                                   |
  | Ordering             | `Ordering`                                   |
  | Fill in the blank    | `FIB`                                        |
  | Numeric              | `FIB` with the number as the accepted answer |
  | Short answer / Essay | `free-response`                              |
  | Anything else        | `free-response` placeholder, see below       |

  An unmappable question (formula, hotspot, label-the-image and so on) imports as a
  `free-response` placeholder holding the original prompt text, flagged "needs a look". The review
  screen lists every flagged question. Exact type strings come from the fixture in Q15.

- **Q7 Pictures are copied in.** The extension downloads each question and choice image through the
  teacher's Schoology session and sends it with the quiz; SpartBoard stores it through
  `attachDocumentImages` like any imported stimulus. No quiz depends on a Schoology image URL.
- **Q8 Inbox and review tab.** The extension posts each read quiz or bank to a server-side import
  inbox, then opens (or focuses) a SpartBoard tab on an "Imported from Schoology" review screen.
  The review screen shows each item's questions, flagged questions, missing keys and destination
  folder, and saves to Drive from the client. Unsaved inbox items expire after 7 days.
- **Q9 Destination folders.** Quizzes land in a Quiz library folder named after the Schoology
  course (or the Resources folder path for Resources items); banks land in the matching Question
  Banks folder, created with `ensureFolderPath`.
- **Q10 Sending the same item again** asks "Update the existing copy or keep both?". Update
  replaces the questions but keeps SpartBoard-only data (standards, learning targets) on any
  question whose prompt text is unchanged.
- **Q11 Provenance, not linking.** Each imported quiz and bank records where it came from:
  `source: { system: 'schoology', kind, sectionId?, itemId, collectionId?, importedAt }`. Q10 uses
  it. Linking a quiz to its Schoology gradebook column is not part of this feature; the
  tool-columns work (`docs/plans/SCHOOLOGY_TOOL_COLUMNS.md`) can use these ids later.
- **Q12 Points and settings.** Per-question points come across. Quiz-level settings come across
  only where SpartBoard has the same setting (for example shuffle questions); others are dropped
  and named on the review screen.
- **Q13 Review reuses the import pipeline.** The extension's output is an `ExtractedQuiz`, so the
  review screen reuses `toQuizData`, `needsKey`, and the existing suggested-learning-targets step.
- **Q14 Flag.** New `GlobalFeature` `schoology-quiz-import` (`defaultAccessLevel: 'admin'`,
  `stage: 'preview'`, `afterLaunch: 'keep'`, category quiz). It gates the extension button (the
  server answers whether the signed-in teacher has it), the inbox endpoint, the review screen and
  the "From Schoology" Import-menu entry. `quiz-imscc-import` and `question-bank-imscc-import`
  fold into it: their entry points check the new flag, and the old ids are retired when it opens.
- **Q15 Fixture.** Paul adds to test course 7660186912 one Test/Quiz and one Assessment containing
  every Schoology question type (with images and an answer key), plus one Resources question bank.
  The agent inspects those pages read-only in Paul's Chrome to write the readers. No other
  Schoology pages are read.

## Design

### Extension side

- A content script matched on `https://*.schoology.com/*` detects three page kinds: a quiz or
  assessment (teacher view or editor), a question bank in Resources, and a list page (course
  Materials or a Resources folder).
- Two readers, one per Schoology editor (Test/Quiz and Assessment), each producing
  `ExtractedQuiz` plus `ExtractedImage[]`. Prefer the JSON the Schoology page itself loads over
  DOM scraping where the fixture shows one; DOM is the fallback.
- Each reader is a pure function over captured HTML/JSON so it is unit-tested against saved
  fixture pages (scrubbed of anything but the sample content), without a browser.
- The button appears only after `GET schoologyImportStatus` (Google token) says the teacher has the
  flag. No button, no reading.
- If a reader finds no questions (Schoology changed its page), the button says "Couldn't read this
  quiz" and links to the `.imscc` route.

### Server side

- `schoologyImportInboxV1` (HTTP, Google access token verified like `webTourExtension.ts`, district
  domain only): validates the payload shape and caps (questions per quiz, image bytes per item and
  per request), checks the flag, resolves the teacher's uid by email, and writes
  `schoology_import_inbox/{uid}/items/{itemId}` with `expiresAt` (7 days, Firestore TTL).
- Images go to Storage under the teacher's import path, referenced from the inbox item; the review
  screen moves them to stimuli on save.
- Owner-only read and delete rules on the inbox; no client create (server writes only).

### SpartBoard side

- Route or modal "Imported from Schoology" opened by the extension with `?schoologyImport=1`, and
  a badge on the Quiz library when the inbox is non-empty.
- Each row: title, course/folder, question count, flagged count, needs-key count, destination,
  and Update/Keep both when a provenance match exists. Save writes to Drive, files into the folder,
  then deletes the inbox item.
- Import menu "From Schoology" (Quiz and Question Banks libraries): if the extension is detected,
  explains the one-click button; otherwise walks through Schoology Export (course or Resources) with
  screenshots, then takes the `.imscc` into the existing cartridge reader.
- New controls get `tourAttr` anchors and a tour surface entry.

## PR sequence

1. **Fixture + readers.** Saved fixture pages from Q15, both readers with type mapping (Q6) and
   unit tests. Extension-only, no UI. Blocked on Paul adding the fixture.
2. **Server inbox.** Flag registration (`types.ts`, `config/featureDefaults.ts`,
   `functions/src/featureMissingDoc.ts`), `schoologyImportStatus` + `schoologyImportInboxV1`,
   rules, TTL, Storage path, tests.
3. **Review screen.** Inbox listener, review rows, provenance match and Update/Keep both, Drive
   save, folder filing, image move, Quiz library badge.
4. **Extension buttons.** Single-item button and bulk checklist wired to the readers and inbox;
   extension version bump.
5. **Guided `.imscc` route.** "From Schoology" in both Import menus, walkthrough, `.imscc` flags
   folded into `schoology-quiz-import`.

Then: Paul tests in prod with his own Schoology quizzes, then opens the flag. Release note when it
opens.

## Release dependency

The extension button needs the published store listing. Until then teachers have only the
`.imscc` route (PR 5), so PR 5 can open first if the listing is delayed.

## Out of scope

- Pages, files, links, discussions, rubrics, media albums.
- Managed Assessments (AMP).
- Linking imported quizzes to Schoology gradebook columns (tool-columns work).
- Any write back to Schoology.
- Student responses or grades (see the grade-import plan, `docs/plans/SCHOOLOGY_GRADE_IMPORT.md`
  on branch `schoology-grade-import-plan`).
