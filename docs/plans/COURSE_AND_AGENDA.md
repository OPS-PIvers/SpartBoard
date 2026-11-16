# Course and Agenda

Status: planned. Grilled and settled 2026-11-16; a second grill the same day checked it against the code and reshaped the build for parallel threads (D21 to D27, §4). Nothing is built yet.

Terms (Course, Agenda, Class page) are defined in [`GLOSSARY.md`](../../GLOSSARY.md). The reasons behind the shape are in [ADR 0008](../adr/0008-course-sits-above-sections.md) and [ADR 0009](../adr/0009-new-student-facing-work-must-not-need-the-lms.md).

## 1. Intent

Give every secondary teacher one reason to open SpartBoard each day: the daily agenda they already keep in Google Slides, set once per Course and shown in three places (the board, the students' Class page, a public family link). The goal is daily use by the whole staff, up from about 70 daily users.

This is the first of four steps agreed in the wider interview: Course, then Agenda, then the Writing widget, then copy-per-student Google files. The last two get their own plans.

Non-goals for this plan:

- Elementary homerooms and specialists. Decided after the pilot (D2).
- Google Docs as an Agenda file. Slides only in v1 (D7).
- Sharing a Course with a co-teacher or a Team.
- Folders, pages, announcements or a discussion tool for students.
- Anything a family signs in to, and any student name or work on the family link.

## 2. Decisions

| #   | Decision               | Choice                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Course                 | Teacher-owned, optional link above ClassLink sections. An unlinked section is a Course of one. Rosters, periods, due dates and grades stay with the section (ADR 0008)                                                                                                                                                                      |
| D2  | Who it is for          | Grades 6 to 12. Elementary homerooms and specialists are out of this plan and revisited after the pilot                                                                                                                                                                                                                                     |
| D3  | Where it is set up     | My Classes in the sidebar: linking suggestions, and each Course's Agenda and pinned links. The Agenda widget links to the same setup when a Course has no Agenda                                                                                                                                                                            |
| D4  | Linking suggestions    | Suggested for classes with the same ClassLink subject whose names match once the class code, period and section number are stripped ("English 9: link these 3 classes?"). SpartBoard stores no ClassLink title, so this replaces "matching titles" (D25). Nothing links until the teacher confirms, and the teacher can always link by hand |
| D5  | Unlinking              | The unlinked section becomes its own Course with a copy of the Agenda and pinned links, so nothing disappears from students                                                                                                                                                                                                                 |
| D6  | Agenda source          | The teacher's existing file, chosen with the Google Picker. One running deck per Course                                                                                                                                                                                                                                                     |
| D7  | File type              | Google Slides in v1                                                                                                                                                                                                                                                                                                                         |
| D8  | Today's slide          | Always the first slide. Setup tells the teacher to add each new day at the top of the deck                                                                                                                                                                                                                                                  |
| D9  | File sharing           | SpartBoard checks the file's sharing and offers to fix it, saying in plain words what changes. The teacher confirms before anything changes                                                                                                                                                                                                 |
| D10 | Sharing levels         | "Anyone in Orono with the link" for students. "Anyone with the link" only when the family link is switched on, after a confirm that says every slide in the deck, past days included, becomes public                                                                                                                                        |
| D11 | Class page             | The existing per-class page in My Assignments (`/my-assignments/{classId}`). Agenda and pinned links sit above the Assignments, Resources and Completed tabs                                                                                                                                                                                |
| D12 | Pinned links           | A short list on the Course, title and address each, at most 6. Shown on the Class page and the family link                                                                                                                                                                                                                                  |
| D13 | Family link            | One per Course, public, no sign-in. Shows the Course name, the Agenda and pinned links only. SpartBoard adds no student data, but cannot check what is on the slides                                                                                                                                                                        |
| D14 | Family link control    | Off until the teacher switches it on, and can be switched off. The address never changes, so a link pinned elsewhere works again when switched back on. No reset button                                                                                                                                                                     |
| D15 | Search engines         | The family page is marked `noindex`                                                                                                                                                                                                                                                                                                         |
| D16 | Board                  | A new Agenda widget in the Dock with a Course picker on the widget. It does not read the active class                                                                                                                                                                                                                                       |
| D17 | Existing agenda widget | `arts-letters-agenda` is a K to 5 checklist and stays as it is                                                                                                                                                                                                                                                                              |
| D18 | LMS                    | The teacher pins one Class page link per Course (and the family link, if on) in Schoology or Classroom once. The link opens each student's own section in that Course. Nothing here needs an LMS course (ADR 0009)                                                                                                                          |
| D19 | Rollout                | Behind a flag, on for admins first. Then a volunteer pilot of current daily users across the middle and high school                                                                                                                                                                                                                         |
| D20 | Pilot success          | Most pilot teachers still have a current Agenda after 3 weeks without reminders. Then it opens to all secondary staff                                                                                                                                                                                                                       |
| D21 | Who writes             | One server function saves a Course and writes the student and family copies, after confirming the teacher's classes with ClassLink. A roster's ClassLink class id is not trusted, so the browser never writes those copies                                                                                                                  |
| D22 | Co-taught classes      | Each teacher's copy is kept separately. The Class page shows one Agenda when both teachers point at the same deck and one per teacher, labelled by name, when they differ. Nobody is locked out                                                                                                                                             |
| D23 | Family link off        | Switching it off asks "Also stop sharing the deck outside Orono?", yes by default, and sets the deck back to "Anyone in Orono with the link"                                                                                                                                                                                                |
| D24 | Sharing re-check       | Each Course's deck is checked again when the teacher opens My Classes or the Agenda widget. A deck students can't open shows a notice with a fix. The same check records the deck's last-modified time and the time of the check for the pilot measure                                                                                      |
| D25 | Suggestion matching    | Same ClassLink subject plus cleaned-up name (see D4). No change to the ClassLink sync                                                                                                                                                                                                                                                       |
| D26 | Naming                 | "Course" is the linked group. "Class" stays one section, as everywhere in the app today. An LMS course is always written "Classroom course" or "Schoology course"                                                                                                                                                                           |
| D27 | Review and checkpoint  | Each PR merges on green CI plus one adversarial review by the strongest model. Paul does one end-to-end check on `spartboard-dev` (teacher, student, family) after all of them merge. Nothing goes to `main` before that                                                                                                                    |

Defaults I chose that were not asked; say if any is wrong:

- The family page lives at `/family/{shareId}`, and the one-per-Course Class page link at `/my-assignments/course/{linkId}`. A signed-out student who follows that link comes back to it after signing in, not to the My Assignments overview.
- The teacher's Class page preview shows only that teacher's own Agenda. In a co-taught class it says the co-teacher's Agenda also shows to students, as the preview already leaves out a co-teacher's assignments.
- Under the Agenda on the Class page sits a plain "Can't see it? Open in Google Slides" link. SpartBoard can't tell when Google refuses to show a deck to a student signed in to Chrome with a personal account, so the link is always there.
- The Agenda widget has a reload button and reloads the deck when the board opens. It does not reload on a timer.
- Whenever a deck shared as "Anyone with the link" stops being the Agenda (the teacher picks a different deck, removes the Agenda or unlinks a class), SpartBoard makes the same offer as D23 to set it back to Orono only. A deck that was never made public is left alone.
- The Getting Started tour is written as a Live tour after the build merges, not inside a PR. Each PR only adds the tour anchors for its own controls.
- An empty state, not a blank box: a Class page with no Agenda shows no Agenda area, and a family link that is switched off says "This page isn't available right now".
- The family page shows the teacher's display name beside the Course name.
- A manually made class (no ClassLink link) can be in a Course and use the Agenda widget, but has no Class page, because students reach a Class page through their ClassLink sign-in.

## 3. What exists today

- A class is a roster at `users/{uid}/rosters/{rosterId}` (`ClassRosterMeta`, `types.ts`), one per ClassLink section, with `classlinkClassId` and `bellPeriod`. No course grouping exists.
- The student page is keyed by ClassLink class id: `components/student/landing/LandingClassView.tsx`, routed from `/my-assignments/{classId}` in `App.tsx`. It holds no teacher-written content. The teacher's preview is `components/classes/ClassStudentPagePreview.tsx` (flag `class-student-page`).
- My Classes is `components/layout/sidebar/SidebarClasses.tsx`.
- Slides links become `/presentation/d/{id}/preview` in `utils/urlHelpers.ts` (`convertToEmbedUrl`), which opens on the first slide.
- The Picker is `hooks/useGooglePicker.ts`; picking a file gives SpartBoard access to it under the `drive.file` scope the app already asks for. `utils/googleDriveService.ts` has `makePublic`.
- Public pages by unguessable id exist for flashcards (`public_flashcard_sets/{shareId}`, `get: if true`, no list). Public tour links are switched off without changing their address (ADR 0003).
- Nothing in the app sets `noindex` yet. `firebase.json` already sets response headers per path, so the family path can carry `X-Robots-Tag`.
- A roster's `classlinkClassId` is not trusted: the rules only check it is a string. Trust comes from the server asking ClassLink (`functions/src/studentIdentity.ts`). Two teachers can hold the same class, and the student class list already merges them.
- No ClassLink title is stored. A roster's name is built once at import as "Subject - Title (code)" and the teacher can rename it; `classlinkSubject` and `classlinkClassCode` are kept.
- "Course" in today's code means a Classroom course or a Schoology course (`SidebarClasses.tsx`, `components/import/course/`). There is no `Course` type and no `courses` collection.

## 4. Shape of the build

### 4.1 Data

One callable, `saveCourseV1`, is the only writer of all four documents (D21). It confirms the teacher's classes with ClassLink the way Focus sessions do (`loadTeacherClassIds`, `functions/src/studentIdentity.ts`), then writes them together. A class made by hand gets no `class_pages` copy, because it has no Class page. A mock class (`testClassId`) gets one only when the caller passes the same gate Focus uses for mock classes (`isTestClassAuthority`); owning a roster that names the mock class is never enough, since a teacher can write any `testClassId` onto their own roster.

| Document                                      | Holds                                                                                                                                                  | Who reads                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `users/{uid}/courses/{courseId}`              | name, roster ids, Agenda (Drive file id, title), pinned links, family link (`shareId`, on or off), `linkId`, deck last-checked and last-modified times | The owning teacher                                                                   |
| `class_pages/{classId}/teachers/{teacherUid}` | Course name, teacher display name, Agenda file id, pinned links, `linkId`. One per teacher, so co-teachers never overwrite each other (D22)            | A student whose sign-in holds that class (`studentRoleCanAccessClass`), get and list |
| `course_page_links/{linkId}`                  | The Course's class ids, nothing else. The Class page link (D18) reads it and opens the one the student is in                                           | Any signed-in user, get only                                                         |
| `family_pages/{shareId}`                      | Course name, teacher display name, Agenda file id, pinned links. Present only while the link is on                                                     | Anyone, get only, no list                                                            |

- `class_pages` uses `studentPageClassId(roster)`, so it is keyed the same way as the page itself.
- A class with no Course document behaves as a Course of one. The document is created the first time the teacher links classes or sets an Agenda.
- Unlinking (D5) is one `saveCourseV1` call that makes the new Course and rewrites both sets of copies.
- All four rules are read-only and short. No browser write rule exists for any of them.

### 4.2 PRs into `dev-paul`: one foundation PR, then five threads at once

The foundation PR lands everything two threads would otherwise both have to invent or edit. After it merges, no thread changes `firestore.rules`, the Course types, the flag, the Drive service or `SidebarClasses.tsx`.

**PR 0. Foundation** (one agent, strongest model, serial)

- Course types in `types.ts`, and the `course-agenda` `GlobalFeature` (`stage: 'preview'`, `afterLaunch: 'keep'`, `category: 'students'`, admin first) in `config/featureDefaults.ts` and `functions/src/featureMissingDoc.ts`, with `functions/src/mcp/tourConditionList.ts` regenerated.
- `saveCourseV1` in `functions/src/course/`, with unit tests for ClassLink confirmation, co-teacher copies, unlink, and family link on and off.
- The four read rules and their `tests/rules/` cases. If the compiled growth passes 1,500 bytes, add the `rules-size-ok` label rather than splitting the rules across PRs.
- `hooks/useCourses.ts`: the teacher's Course listener and a `saveCourse` wrapper.
- `utils/course/deckSharing.ts`: read a deck's sharing level and last-modified time, and set it to Orono or to anyone. `listFilePermissions` gains the `domain` field it lacks today. `useGooglePicker` gains a `slides` mode.
- `components/classes/course/CourseSection.tsx`, mounted in `SidebarClasses.tsx` behind the flag, rendering three stub files that threads A, B and E each own: `CourseLinking.tsx`, `AgendaSetup.tsx`, `FamilyLinkSetup.tsx`.
- The `PAUL_TODO.md` flags-table row and the two PT items in §5. Threads do not edit `PAUL_TODO.md` or `AGENT_BACKLOG.md`.

**Five threads, started together when PR 0 merges**

| Thread            | What                                                                                                                                                                                                                                                               | Files it owns                                                                                                                                                                                                                             | Model     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| A. Course linking | Suggestions (D4), link, unlink (D5) and rename. Any bare "course" in existing My Classes labels becomes "Classroom course" or "Schoology course" (D26)                                                                                                             | `course/CourseLinking.tsx`, `utils/course/linkSuggestions.ts`                                                                                                                                                                             | Mid-tier  |
| B. Agenda setup   | Pick the deck, the offer to stop sharing a replaced public deck, the sharing check and confirm (D9, D10), pinned links (D12), copy the Class page link (D18), the re-check notice (D24)                                                                            | `course/AgendaSetup.tsx` and its parts                                                                                                                                                                                                    | Strongest |
| C. Class page     | Agenda and pinned links above the tabs for students and in the teacher's preview, the co-taught view for students (D22), the "Open in Google Slides" link, and `/my-assignments/course/{linkId}`, which must survive sign-in and be read as a link, not a class id | `components/student/landing/*`, `ClassStudentPagePreview.tsx`, `hooks/useClassStudentPagePreview.ts`, a new `hooks/useClassPageAgendas.ts`, `context/StudentAuthContext.tsx`, `utils/studentJoinRouting.ts`, `utils/myAssignmentsPath.ts` | Mid-tier  |
| D. Agenda widget  | New widget with a Course picker on the widget, modelled on the Focus widget's class picker (`Focus/FocusSetup.tsx`), via the `new-widget` skill. Access level `admin`                                                                                              | `components/widgets/Agenda/*`, the `WidgetType` lines in `types.ts`, every widget registry and generated widget list                                                                                                                      | Mid-tier  |
| E. Family link    | The switch with both confirms (D10, D23), the public page, the `/family/*` route with no providers, `X-Robots-Tag: noindex` in `firebase.json` plus a robots meta tag set by the page (D15)                                                                        | `course/FamilyLinkSetup.tsx`, `components/family/*`, one route block in `App.tsx`, `firebase.json`                                                                                                                                        | Strongest |

Two shared files remain, and every thread except C adds to them: `locales/en.json` and `config/tourAnchors.ts` with its generated lists.

- Each thread adds keys only under its own namespace: `course.linking`, `course.agenda`, `course.family`, `widgetSettings.agenda`.
- PRs merge in whatever order they go green. A thread that falls behind rebases and re-runs the generators (`UPDATE_TOUR_ANCHOR_LIST=1`, and for D `UPDATE_WIDGET_CATALOGUE=1` and `UPDATE_WIDGET_CONFIG_SCHEMAS=1`). Generated files are never merged by hand.
- Only D edits `types.ts` after PR 0, and only E edits `App.tsx`.

**After Paul's check: thread F** (one agent, mid-tier)

- The Getting Started Live tour, written as data on `spartboard-dev` through the connector and added to the admin Getting Started list.
- The pilot readout (§6): a read-only script that lists each pilot Course's deck last-modified time and when it was last checked.
- Fixes from Paul's end-to-end check go out as small PRs alongside it.

### 4.3 How the threads run

- Each thread is a cloud session in the "Spartboard" environment, on its own branch from `dev-paul` (no `dev-` prefix), started with this plan, its row above and the PR 0 merge commit. Five local sessions at once have crashed this machine.
- A cloud session can't sign in to Google, so Drive calls are covered by unit tests with a mocked `fetch`, and each PR carries a screenshot from a `/*-dev` harness page. Real Drive behaviour is proven in Paul's check.
- On `spartboard-dev` the Drive write guard refuses sharing changes to any deck outside the "SpartBoard Dev" Drive folder. Test decks go in that folder.
- Student-side checks on dev use the mock class (`organizations/orono/testClasses`).
- No agent runs the full lint, test or type-check; CI is the gate. Rules tests run in CI only.
- Each PR description names the flag, its starting access level, and the admin path to open it.

### 4.4 Flags

- `course-agenda` (`GlobalFeature`) gates Course and Agenda setup in My Classes. It lands in PR 0.
- The Agenda widget ships at access level `admin` through `feature_permissions`.
- Students and families need no flag: they see an Agenda only when a teacher with access has set one.
- The teacher's Class page preview is still behind `class-student-page` (waiting on PT-204). The student Class page itself is not.
- The pilot group is added as Beta users on both the flag and the widget; Beta grants are per feature.

## 5. Open items

Settled by the second grill and no longer open: co-taught classes (D22), who writes the copies and the rules for them (D21, §4.1), and students outside the domain sign-in (the always-present "Open in Google Slides" link).

Two things only Paul can do, filed as PT items by PR 0:

- **Workspace sharing settings.** Confirm on a real staff account that a teacher can set a Slides deck to "Anyone with the link". Thread E can build without it, but the family link can't be piloted until it is confirmed.
- **The end-to-end check (D27).** On `spartboard-dev`: link two classes, set an Agenda from a deck in the "SpartBoard Dev" folder, open the Class page as the mock student, add the Agenda widget to a board, switch the family link on and off.

One thing to watch in the build:

- **Compiled rules size.** Headroom is about 25 KB. Four read-only rules should cost well under the 1,500-byte PR budget; PR 0 reports the measured growth in its description.

## 6. Pilot

- Volunteers: 6 to 10 teachers who already use SpartBoard daily, from the middle and high school.
- Paul tests on his own account first, behind the flag.
- Measure: for each pilot Course, whether the deck changed in the last few school days, checked at week 3. The source is the deck's last-modified time, recorded on the Course by the sharing re-check (D24) and listed by thread F's readout script. That reading is only as fresh as the teacher's last visit to My Classes or a board with the Agenda widget, so the readout shows the check time beside it and counts a Course not checked in the last few school days as "not known", never as stale. Paul asks those teachers directly before deciding.
- If most pilot teachers are still current at week 3 without reminders, open to all secondary staff and revisit elementary and specialists (D2).
