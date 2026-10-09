# Schoology tool-created columns: push scores for assignments made only in SpartBoard

Drafted 2026-10-09, revised the same day after a code review, prod data checks and live AGS tests with Paul. Not yet built.

## Goal

A teacher assigns a quiz or video activity only in SpartBoard (no Schoology "Add Materials") and can still push its scores into their linked Schoology section's gradebook, for the nightly Schoology → SIS sync. SpartBoard creates the gradebook column itself and posts each student's score. No student has to open anything in Schoology, and no teacher has to add anything in Schoology.

With the flag on, the Schoology "Add Materials" assign path is hidden. Existing Schoology-attached assignments (`ltiAttachment`) keep working exactly as today.

## What is proven (2026-10-09, prod)

All of this ran against the live Schoology LTI service with the prod tool key, from one-off read/write scripts.

- **Service URLs are a fixed template keyed by section id.** All 364 saved `ags.lineitems` URLs are `https://lti-service.svc.schoology.com/lti-service/tool/8409082949/services/assignment-grade/v2p0/sections/{contextId}/lineitems` (one tool id; the section segment equals `contextId` in every doc). NRPS URLs are `…/tool/8409082949/services/names-roles/v2p0/membership/{contextId}`. Nothing per section needs to be captured or stored.
- **The service token works on sections that never launched SpartBoard.** NRPS read and AGS write both succeeded on course 7660186912, which had no launches.
- **The section id is in the course URL.** `https://orono.schoology.com/course/{contextId}/materials`.
- **NRPS releases emails.** Every learner in every section tested had one, and 5 of 6 instructors in a co-taught section did. Instructor ownership by email works for normal accounts. One older course listed Paul's instructor email as `paul.ivers@oro`, so email can fail for odd accounts.
- **AGS operations Schoology supports:** `POST lineitems` (201; keeps `resourceId`, `tag`, `label`, `scoreMaximum`), `GET lineitems?resource_id=` and `?tag=` filters (exact), `GET lineitems` lists only SpartBoard's own columns, `PUT` a line item to change `scoreMaximum` (200), `POST scores` for a never-launched student (201), `GET results` (read-back correct), `DELETE` a line item (204, then 404).
- **`endDateTime` is ignored.** Sent, not echoed; the column's due date is greyed out and not editable in Schoology.
- **A column lands in the course's current grading period** (from Grade Setup) and its default category. Category fields in the line item (`category`, `gradingCategory`, …) are ignored, so SpartBoard can't choose a category. Early tests where columns seemed invisible were most likely the gradebook's grading-period filter; whether a course with no category at all hides columns was not cleanly retested (Q4).
- **Comments work.** A score's `comment` shows as a text comment on the cell. A comment with no score is kept on a blank cell. Re-posting a score without a comment clears the old comment.
- **No Schoology exception flag can be written through AGS.** Nine score shapes were tried (every `activityProgress` × `gradingProgress` combination worth trying, with and without a score); Schoology only ever shows a number, a blank, or a comment.
- **Flags can't be read back either.** Missing reads as 0 when "missing scores as 0" is on and as blank when it's off; Incomplete, Exempt, Collected and Absent read as blank (Absent once as no result at all); Late keeps the score and looks unflagged.
- **A push wipes a teacher's flag.** Re-posting a score onto a cell marked Missing removed the flag. Marking Missing by hand removes the score.

## Current-state facts the design builds on

- `getAgsAccessToken` / `postScore` (`functions/src/lti/ags.ts`) handle the signed-JWT token, cache and redirect guard. `AGS_SCOPE_LINEITEM` exists in `config.ts`, unused.
- `fetchNrpsMembers` (`functions/src/lti/nrps.ts`) returns `userId` (the `sub` to score), roles, status and email.
- `lti_course_links/{contextId}` pairs a section with a ClassLink class (`classlinkClassId` or `testClassId`, `rosterId`, `teacherUid`); **any signed-in user can read it**. Written only by `linkLtiCourseV1`, which today is trust-anchored on a session that saw the section (`assertOwnsSchoologyContext`). The roster mirrors one `ltiContextId`.
- `LinkSchoologyModal` lists only sections from `users/{uid}/lti_seen_sections`, which only a **student** launch writes (teacher launches write nothing; `launchEndpoints.ts` returns early for `role !== 'student'`). With the assign path hidden, no new section would ever appear. This plan replaces that discovery with a pasted course link.
- `ltiSuggestClassLinkMatchV1` already computes NRPS-email ↔ OneRoster overlap against classes the caller owns.
- Student identity: SSO students' response key is `computeStudentUid(sourcedId)`. Students who launched from Schoology before may be keyed by `ltiStudentUid(sub)` or bridged via `lti_identity_bridge/{ltiStudentUid(sub)}`. PIN students (`pin-{period}-{pin}`) can never be matched.
- `quiz_sessions` / `video_activity_sessions` updates are open to the owning teacher for any field, `ltiAttachment` included. Firestore rules are at the compiled-size cap.
- Client push surfaces check `session.ltiAttachment` directly: `QuizResults.tsx`, VA `Results.tsx`, `publishGradePush.ts` (`ltiLinked`), `TeacherReviewRoute.tsx`; the Gradebook uses `readLmsLink` (`utils/gradebook/lmsPush.ts`) via `useGradebookLmsPush` and `GradebookPushScoresButton`.
- `bucketLtiPushResults` treats only `'student never launched'` as a skip; `formatLtiPushToast` says "not opened in Schoology yet".

## Decisions

- **D1. Link a section by pasting its course URL.** `LinkSchoologyModal` gains "Paste a Schoology course link". The client sends the URL; the server parses `contextId` (`/course/(\d+)/`, digits only) and builds the NRPS URL itself.
- **D2. Ownership = instructor email + roster overlap.** New callable `ltiLinkSectionByUrlV1`: the caller's token email must appear as an active `#Instructor` in the section's NRPS roster, **and** the section's learners must overlap the ClassLink class the teacher picks (reuse the suggest-match overlap; the class must be one the caller owns). It returns the suggested class first so the common case is one click. Email miss → "Your Schoology account isn't listed as a teacher of this course. Ask an admin to link it." The existing no-hijack rule (a section linked by another teacher can't be re-pointed) still applies. Writes the same `lti_course_links` doc and roster `ltiContextId` as `linkLtiCourseV1`; no seen-section or session needed.
- **D3. No stored service URLs.** Both URLs are built server-side from `contextId` by one helper, `schoologySectionUrls(contextId)`, using the tool id constant. The plan's earlier capture-at-launch and backfill are dropped.
- **D4. Which sections.** The server derives targets, never the client: `lti_course_links` docs whose `teacherUid` is the caller and whose `classlinkClassId`/`testClassId` is in the session's `classIds` or whose `rosterId` is in its `rosterIds`. None → `failed-precondition` "Link this class to Schoology first." One column per linked section; each gets only its own NRPS members' scores.
- **D5. Column records live in a server-only collection**, `lti_tool_columns/{sessionId}/sections/{contextId}` = `{ lineitemUrl, scoreMaximum, createdAt, kind, lastPushed }` (`lastPushed`: a map of `ltiStudentUid(sub)` → fingerprint of the last score + comment sent, for D12), with `allow read, write: if false` (tiny rules cost; the session doc stays teacher-writable so it can't hold a URL the server will send a bearer token to). The session gets a display-only `ltiToolColumn: true` the server sets, for showing "In Schoology" state.
- **D6. Column lifecycle.**
  - **Created only by an explicit "Push to Schoology".** Publish = Push updates a column that already exists and never creates one, so practice quizzes never reach the gradebook.
  - Create: claim the record in a Firestore transaction (`status: 'creating'`, short lease) so a double click or a parallel Publish = Push can't make two columns; then `GET lineitems?resource_id=spartboard:{kind}:{sessionId}` and reuse a match (crash recovery), else `POST` with `label` = the assignment title read server-side, `resourceId`, `tag: 'spartboard'`, `scoreMaximum`. No `endDateTime` (ignored).
  - **The total is always SpartBoard's current total.** If `maxPoints` differs from the record, `PUT` the line item (full body) before posting scores. A quiz re-pushed after dropping a question goes from 10 to 9.
  - Recorded URL returns 404 (teacher deleted it in Schoology) → clear the record and recreate once.
  - **"Not showing in Schoology? Re-create column"** action on Results: `DELETE`, recreate, clear `lastPushed` and re-push everything. Recovery for a column that went missing in Schoology for any reason; drop it if the pilot never needs it (Q4).
  - **Deleting the assignment in SpartBoard asks** "Also remove its column from Schoology?" (default unchecked). Yes → `DELETE` each recorded line item via a small callable `ltiDeleteToolColumnsV1`.
- **D7. Student matching, per section.** Fetch NRPS, keep active Learners. A member maps to a SpartBoard response uid by, in order: `ltiStudentUid(sub)` directly (launched before, never bridged); `lti_identity_bridge/{ltiStudentUid(sub)}.classlinkUid`; NRPS email ↔ the linked class's OneRoster roster → `computeStudentUid(sourcedId)`. Factor the OneRoster lookup out of `classlinkBridge.ts` into a shared helper. Post each grade whose `pseudonymUid` matches, clamped to `[0, maxPoints]`. Unmatched entries return `ok: false, reason: 'not in Schoology section'` (benign skip). PIN-keyed entries return `reason: 'pin student'` (benign skip). Emails stay in memory only.
- **D12. What each student's cell gets, and only when it changed.** Schoology flags can't be written or read through AGS, and any post wipes a flag the teacher set, so:
  - **Scored** (raw or override final score) → the score, no comment (which also clears an earlier "Missing" comment).
  - **No submission** (the student is on a targeted roster, not excused, and has no submitted response; in the Gradebook, a cell whose final status is the Missing flag) → no score, `activityProgress: 'Initialized'`, `gradingProgress: 'NotReady'`, comment `"Missing"`. The cell stays blank with a visible "Missing" comment so the teacher can set Schoology's own Missing flag; the course's "missing as 0" setting then applies there.
  - **Awaiting a teacher grade, or excused** → nothing is sent.
  - **Only changed cells are posted.** The server compares each student's `{score, comment}` with `lastPushed` and skips matches, then updates `lastPushed` for every successful post. A flag a teacher sets in Schoology survives every re-push until the student's SpartBoard result actually changes (a new submission or a regrade), which correctly overwrites it.
  - Grade entries gain `missing?: true` (with no `pointsEarned`). Results gain `reason: 'unchanged'` (benign skip). Toast: "Pushed 3 grades to Schoology (2 marked Missing). 19 unchanged. 1 student isn't in the Schoology section."
- **D8. Push callable `ltiPushToolColumnV1`**, separate from `ltiPushGradesForAssignmentV1`, same response shape and the D12-extended request. Gate: email-bearing teacher token, no `studentRole`, caller owns the session, caller owns every target link, `assertViewAsAllowed(request, { outward: true })`, **and** a server-side check that the caller has the `schoology-tool-columns` feature (it writes into an external gradebook, so the client gate isn't enough). Secrets: `LTI_TOOL_PRIVATE_KEY`, `STUDENT_PSEUDONYM_HMAC_SECRET`, `CLASSLINK_CLIENT_ID`, `CLASSLINK_CLIENT_SECRET`, `CLASSLINK_TENANT_URL`. URL guard: every request URL must be `https:` on `lti-service.svc.schoology.com` (hard-coded; `getLtiPlatformConfig` has no host). Register in `functions/src/index.ts`, `index.test.ts` and `viewAsCallableCoverage.test.ts`. Token scopes: `lineitem`, `score`, `result.readonly`, NRPS.
- **D9. Client wiring.**
  - `readLmsLink` takes the session **and** the teacher's rosters and returns `{ lms: 'schoology', mode: 'launch' }` when `ltiAttachment` is set, else `{ lms: 'schoology', mode: 'tool-column' }` when the flag is on and a targeted roster has `ltiContextId`. Classroom still wins.
  - Every surface switches to `readLmsLink`: `QuizResults.tsx`, VA `Results.tsx`, `publishGradePush.ts` (tool-column pushes only when `ltiToolColumn` is already set), `useGradebookLmsPush`/`GradebookPushScoresButton`. `TeacherReviewRoute.tsx` stays on the `launch` path (it is reached from Schoology).
  - `LTI_PUSH_SKIP_REASONS` becomes a set (`'student never launched'`, `'not in Schoology section'`, `'pin student'`, `'unchanged'`) and `formatLtiPushToast` takes the mode and the D12 counts.
  - The quiz and VA grade builders and `buildGradebookPushPlan` emit `missing: true` entries for no-submission students in tool-column mode only (the launch path is unchanged).
  - **First push confirmation** (only when no column exists yet): "This adds a '{title}' column to {n} Schoology section(s), in the course's current grading period and default category. Students with no submission get a 'Missing' comment for you to flag in Schoology." Confirm → push.
- **D10. Assign dialog.** With the flag on, the Schoology tile in `AssignDestinationModal` is hidden (the assign stepper has no Schoology destination). A linked class shows "Scores can be pushed to Schoology from Results" in the class picker.
- **D11. Feature flag** `schoology-tool-columns` per CLAUDE.md "Releasing a feature": `GlobalFeature` id, `FEATURE_DEFAULTS` entry (`defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'retire'`, label/icon/description), plus `functions/src/featureMissingDoc.ts`. Client gates: the paste-link entry, every tool-column push button, the confirmation, the re-create and delete-column actions, the hidden assign tile. Server gate: D8. Admins pass the gate, so "on for Paul" includes the other admins.

## Phases (PRs into `dev-paul`)

1. **Server core.** `schoologySectionUrls`, URL guard, a small AGS line-item client (`listLineItems`, `createLineItem`, `updateLineItem`, `deleteLineItem`) next to `postScore`, the shared OneRoster lookup helper, `lti_tool_columns` rules (`if false`) + a rules test. Unit tests with mocked fetch.
2. **Link by URL.** `ltiLinkSectionByUrlV1` (D1–D2) + flag registration (D11) + the paste field in `LinkSchoologyModal`. Tests: URL parsing (rejects non-digit and foreign hosts), instructor email required, overlap required, owned-class check, no-hijack, inactive instructor ignored.
3. **Push + delete callables** (D4–D8, D12). Tests: unchanged cells skipped and `lastPushed` updated only on success; missing entry posts no score + "Missing" comment; a later score clears the comment; re-create resets `lastPushed`; column created once and reused; transaction lease blocks a parallel create; recovery via `resource_id`; `PUT` on a changed total; 404 → recreate; each matching path (direct sub, bridge, email); PIN and unmatched skips; two linked sections → two columns; foreign-teacher link and flag-off rejected; bad host rejected.
4. **Client** (D9–D10): `readLmsLink` modes, all four surfaces, toast and skip reasons, first-push confirmation, re-create and delete-column actions, assign tile hidden. Tests for `readLmsLink`, bucketing and toast copy.
5. **Pilot (prod only).** LTI only runs on `spartboard.web.app` and ClassLink is a placeholder on dev, so dev can verify only unit tests and UI. Paul links one real section by URL, pushes once, checks the gradebook, re-pushes after a total change, then widens.
6. **Later, separate:** for Schoology-attached sessions, score never-launched students through the same NRPS matching, posting to the column Schoology made (`GET lineitems?resource_link_id=`).

## Open questions

- **Q1. Linked/cross-listed sections (`/csm/` line items).** Does a column created in one section of a Schoology linked-section group appear in the others? Test during the pilot on a cross-listed course before widening. If yes, D4 creates one column per group.
- **Q2. Students and parents see the column and score as soon as it is pushed?** Confirm in the pilot (the test learner's view). If yes, the first-push confirmation says so.
- **Q3. Inactive NRPS members.** Skipped by D7; confirm a dropped student's existing Schoology score is simply left alone.
- **Q4. A course with no grading category at all.** Early tests suggested such a course hides tool columns, but those runs were confounded by the grading-period filter. Retest in the pilot (delete every category, push, view with the period filter on the current period). If it does hide them, the first-push confirmation adds "Your Schoology course needs a default grading category" and the Re-create action stays.

## Cleanup

Test columns still in Schoology: "SpartBoard API test - safe to delete" (Model Course 7595131723) and, in 7660186912, "SpartBoard missing test 2", "SpartBoard due-date test" and "SpartBoard variant A"–"I". Delete them (`DELETE` on each line item) when Paul says.
