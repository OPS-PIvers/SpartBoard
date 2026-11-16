# Course and Agenda

Status: planned. Grilled and settled 2026-11-16. Nothing is built yet.

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

| #   | Decision               | Choice                                                                                                                                                                                                             |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Course                 | Teacher-owned, optional link above ClassLink sections. An unlinked section is a Course of one. Rosters, periods, due dates and grades stay with the section (ADR 0008)                                             |
| D2  | Who it is for          | Grades 6 to 12. Elementary homerooms and specialists are out of this plan and revisited after the pilot                                                                                                            |
| D3  | Where it is set up     | My Classes in the sidebar: linking suggestions, and each Course's Agenda and pinned links. The Agenda widget links to the same setup when a Course has no Agenda                                                   |
| D4  | Linking suggestions    | Suggested from matching ClassLink titles ("English 9: link these 3 sections?"). Nothing links until the teacher confirms                                                                                           |
| D5  | Unlinking              | The unlinked section becomes its own Course with a copy of the Agenda and pinned links, so nothing disappears from students                                                                                        |
| D6  | Agenda source          | The teacher's existing file, chosen with the Google Picker. One running deck per Course                                                                                                                            |
| D7  | File type              | Google Slides in v1                                                                                                                                                                                                |
| D8  | Today's slide          | Always the first slide. Setup tells the teacher to add each new day at the top of the deck                                                                                                                         |
| D9  | File sharing           | SpartBoard checks the file's sharing and offers to fix it, saying in plain words what changes. The teacher confirms before anything changes                                                                        |
| D10 | Sharing levels         | "Anyone in Orono with the link" for students. "Anyone with the link" only when the family link is switched on, after a confirm that says every slide in the deck, past days included, becomes public               |
| D11 | Class page             | The existing per-class page in My Assignments (`/my-assignments/{classId}`). Agenda and pinned links sit above the Assignments, Resources and Completed tabs                                                       |
| D12 | Pinned links           | A short list on the Course, title and address each, at most 6. Shown on the Class page and the family link                                                                                                         |
| D13 | Family link            | One per Course, public, no sign-in. Shows the Course name, the Agenda and pinned links only. SpartBoard adds no student data, but cannot check what is on the slides                                               |
| D14 | Family link control    | Off until the teacher switches it on, and can be switched off. The address never changes, so a link pinned elsewhere works again when switched back on. No reset button                                            |
| D15 | Search engines         | The family page is marked `noindex`                                                                                                                                                                                |
| D16 | Board                  | A new Agenda widget in the Dock with a Course picker on the widget. It does not read the active class                                                                                                              |
| D17 | Existing agenda widget | `arts-letters-agenda` is a K to 5 checklist and stays as it is                                                                                                                                                     |
| D18 | LMS                    | The teacher pins one Class page link per Course (and the family link, if on) in Schoology or Classroom once. The link opens each student's own section in that Course. Nothing here needs an LMS course (ADR 0009) |
| D19 | Rollout                | Behind a flag, on for admins first. Then a volunteer pilot of current daily users across the middle and high school                                                                                                |
| D20 | Pilot success          | Most pilot teachers still have a current Agenda after 3 weeks without reminders. Then it opens to all secondary staff                                                                                              |

Defaults I chose that were not asked; say if any is wrong:

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
- Nothing in the app sets `noindex` yet.

## 4. Shape of the build

### 4.1 Data

- `users/{uid}/courses/{courseId}`: name, the roster ids it links, the Agenda (Drive file id, title), pinned links, family link state and its share id.
- A student-readable copy per ClassLink class, written when the Course changes, holding only what the Class page shows (Agenda embed address, pinned links). Students can't read a teacher's `users/{uid}` documents, so the Class page reads this copy.
- A public copy per Course for the family link, by share id, present only while the link is switched on.

A section with no Course document behaves as a Course of one; a Course document is created the first time the teacher links sections or sets an Agenda.

### 4.2 PRs into `dev-paul`, in three waves

Five PRs, three waves. Each new collection's rules ride in their own PR because a PR may grow the compiled Firestore rules by only 1,500 bytes (`.claude/rules/firestore-rules.md`).

| Wave | PR                 | What                                                                                                                                                                              | Agent model                                  |
| ---- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1    | A. Course          | The type, the `courses` collection and rules, linking suggestions, link, unlink and rename in My Classes, and the flag                                                            | Strongest: it fixes the data shape and rules |
| 1    | B. Agenda setup    | Stacked on A. Pick the Slides file, the sharing check and confirm (D9, D10), pinned links (D12), the student-readable copy and its rule, the one-per-Course Class page link (D18) | Strongest: rules and Drive sharing           |
| 2    | C. Class page      | Agenda and pinned links above the tabs in `LandingClassView` and the teacher's preview                                                                                            | Mid-tier: UI on a settled shape              |
| 2    | D. Agenda widget   | New widget with a Course picker, via the `new-widget` skill                                                                                                                       | Mid-tier: follows the widget template        |
| 2    | E. Family link     | The public page and route, its rule, the on/off switch, `noindex`, the "Anyone with the link" confirm                                                                             | Strongest: a public page and its rule        |
| 3    | Pilot (in C, D, E) | The Getting Started tour and the pilot measure (§6), added to whichever wave 2 PR merges last                                                                                     | Mid-tier                                     |

- Wave 1 is serial: one agent, A then B. Everything later reads the shape these two set.
- Wave 2 runs as three agents at once, each in its own worktree from `dev-paul` after B merges. They touch different folders; the only shared files are `firestore.rules` (E only), `types.ts` and the widget registries (D only).
- A cheaper model writes, the main session reviews: each wave 2 PR gets one review pass by the strongest model before it merges.
- No agent runs the full lint, test or type-check; CI is the gate.

### 4.3 Flags

- A `GlobalFeature` for Course and Agenda setup, `stage: 'preview'`, `afterLaunch: 'keep'`, admin first.
- The Agenda widget ships at access level `admin` through `feature_permissions`.
- Students and families need no flag: they see an Agenda only when a teacher with access has set one.
- The pilot group is added as Beta users on both.

## 5. Open questions for the build

These are technical and get settled in the PR that reaches them:

- **Co-taught sections.** Two teachers can each hold a roster for the same ClassLink class. The student-readable copy is one document per class, so the build must say whose Agenda wins. Suggested: the first teacher to set one, with a clear message to the second.
- **Rule for the student-readable copy.** A teacher may write it only for a class they hold a roster for; the rule needs a cheap way to check that. Read `.claude/rules/firestore-rules.md` first.
- **Rule for the public family copy.** It is readable without sign-in, so it holds only the fields D13 lists and exists only while the link is switched on.
- **Students outside the domain sign-in.** A student signed in to Chrome with a personal Google account won't see a deck shared to Orono only. The Class page needs a plain message for that case.
- **Workspace sharing settings.** Paul reports staff can share "Anyone with the link" today. Confirm on a real staff account before PR E.

## 6. Pilot

- Volunteers: 6 to 10 teachers who already use SpartBoard daily, from the middle and high school.
- Paul tests on his own account first, behind the flag.
- Measure: for each pilot Course, whether the deck changed in the last few school days, checked at week 3. The simplest source is the file's last-modified time, recorded on the Course when the teacher opens SpartBoard.
- If most pilot teachers are still current at week 3 without reminders, open to all secondary staff and revisit elementary and specialists (D2).
