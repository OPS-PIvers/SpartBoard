# AI writing check

Status: planned. Grilled and settled with Paul 2026-11-23. Nothing is built yet.

Terms (AI writing check, Writing assignment, Writing record, Turn in) are defined in [`GLOSSARY.md`](../../GLOSSARY.md). Why this is allowed beside the "no plagiarism checker" stance is in [ADR 0012](../adr/0012-a-named-few-can-run-an-ai-writing-check.md), which narrows [ADR 0007](../adr/0007-writing-is-recorded-in-spartboard-not-google-docs.md).

## 1. Intent

When there is a concern about one student's writing, a named few people can send that piece to Pangram's AI-writing detector and read the result beside the facts SpartBoard already holds about how it was written. It is one more datapoint for a conversation with the student. It is never proof, and no teacher or student screen changes.

Non-goals:

- Anything a teacher or student can see or start. The Writing record stays facts-only (Writing plan D9, D17).
- Checking a whole class or assignment at once.
- Pasted text, Google Docs, or any work not turned in inside SpartBoard.
- Pangram's plagiarism endpoint (C12).
- Students who joined a quiz with a PIN (C17).
- Keeping the student's text or the flagged passages after the result is closed.

## 2. Decisions

| #   | Decision         | Choice                                                                                                                                                                                                                                                        |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Source of work   | Work turned in inside SpartBoard only                                                                                                                                                                                                                         |
| C2  | Who can run it   | People on the allowlist (C9). Being a site admin is not enough                                                                                                                                                                                                |
| C3  | Vendor status    | No Pangram account or agreement exists yet (2026-11-23)                                                                                                                                                                                                       |
| C4  | What is kept     | A check log (C13). No student text                                                                                                                                                                                                                            |
| C5  | ADR 0007         | ADR 0012 carves out this one check; ADR 0007 still holds for everything teachers and students see                                                                                                                                                             |
| C6  | Work types       | Turned-in Writing assignment drafts, and quiz free-response answers of 50 words or more. Shorter text is refused with a plain reason and nothing is sent                                                                                                      |
| C7  | Finding the work | Search by student name, then pick from that student's turned-in writing across all their teachers                                                                                                                                                             |
| C8  | Build order      | Build on `spartboard-dev` with a self-serve key and text that is not student work. Prod stays switched off until section 6 is done                                                                                                                            |
| C9  | Allowlist        | A list of emails kept with the switch and the cap (C19), checked in the Cloud Function on every call                                                                                                                                                          |
| C10 | Result screen    | Pangram's label (Human, Mixed, AI), the share of text in each category, and the text with flagged passages highlighted and each passage's confidence, beside the record's facts. Fixed wording says it is one datapoint and a reason to talk, not proof       |
| C11 | Accountability   | A typed reason is required before each check and saved in the log. SpartBoard tells neither the teacher nor the student                                                                                                                                       |
| C12 | Plagiarism       | Not now                                                                                                                                                                                                                                                       |
| C13 | Check log        | Seen by people on the allowlist and super admins, as "Past checks" on the tool page. Each entry: who, when, reason, student pseudonym, the piece and draft, word count, cost, Pangram's label and three percentages. Names resolve from ClassLink when viewed |
| C14 | Which draft      | Any turned-in draft, the latest picked to start. Work in progress is never sent                                                                                                                                                                               |
| C15 | Spending         | A monthly dollar cap set in the settings row and enforced in the Cloud Function. The month's spend shows on the tool page. Pangram auto-refill stays off                                                                                                      |
| C16 | Name             | "AI writing check". The result is "a check result", never "a detection" or "a flag"                                                                                                                                                                           |
| C17 | PIN joiners      | Out for version 1. The tool finds ClassLink students only and says so                                                                                                                                                                                         |
| C18 | This session     | Plan, ADR, glossary entry and to-dos. No feature code                                                                                                                                                                                                         |
| C19 | Settings row     | Admin Settings > Access > Features > "AI writing check": on/off switch, the people list and the monthly cap. Only super admins see or edit the row                                                                                                            |
| C20 | Tool page        | Admin Settings > Tools > "AI writing check", shown only to people on the allowlist                                                                                                                                                                            |
| C21 | Other admins     | See neither the row nor the tool. A person on the list who is not a super admin can run checks and see past checks, but can't see the list or change the cap                                                                                                  |

Defaults Paul accepted with the summary:

- **What is sent:** the plain text of the chosen draft and nothing else. No student, teacher, class, title or prompt. `public_dashboard_link` stays false.
- **Reads:** the Cloud Function reads with the Admin SDK. `firestore.rules` is not changed for Writing responses.
- **Secret:** the Pangram key is read from Secret Manager at call time, as `functions/src/freshservice.ts` does, so a project with no key still deploys.
- **View as:** every callable here is refused from a View as tab.
- **After 1 August:** a piece whose edit log was deleted (ADR 0010) can still be checked; the summary facts remain.

## 3. Why there is no feature flag

A `GlobalFeature` preview row shows on Admin Settings > Access > Previews to every site admin, and every admin passes an admin or beta gate. Both break C21. The gate is the settings row instead: it ships with the switch off and an empty list in both projects, so the feature is off for everyone at release, and a super admin turns it on for named people. This is an admin-only tool, which the flag rule in `CLAUDE.md` exempts. It gets no What's New entry.

## 4. How it works

### Settings and access

- One document holds `enabled`, `allowedEmails`, `monthlyCapCents`, and the current month's spend. No client reads or writes it; rules deny it by default and callables do the work. Confirm the default deny covers the chosen path before picking it.
- `getAiWritingCheckAccessV1` returns `{ canRun, canManage }` for the caller. Admin Settings calls it once for a signed-in admin and shows the Tools entry and the Features row from the answer. `canManage` is the strict super admin check that guards View as (`isStrictSuperAdmin`, `functions/src/authz.ts`).
- `saveAiWritingCheckSettingsV1` is strict super admin only and writes an `admin_audit_log` entry for each change to the list, the switch or the cap. Those entries must be super-admin-only to read, as `view_as_*` entries are; if that needs a rules change, keep the entries in the check log instead.
- The Features row follows the custom-editor rows already there (`DailyLimitEditor`, `FocusHoursRow` in `components/admin/access/`).

### Finding a piece (C7, C17)

1. The person types a name. The function searches ClassLink students org-wide, as `getActiveStudentsV1` (`functions/src/adminActiveStudents.ts`) resolves names, and returns name, grade and building.
2. For the chosen student it computes the pseudonym uid (`computeStudentUid`, `functions/src/classlinkShared.ts`) and reads the `student_assignments/{studentUid}/items` pointers to find their Writing assignments and quizzes.
3. It lists each turned-in Writing draft (`writing_assignment_sessions/{sid}/responses/{uid}/drafts/{seq}`) and each submitted quiz free-response answer of 50 words or more, with teacher, title, turned-in date and word count. No text is returned at this step.

Check in slice 1 that the pointers cover closed and past assignments; if not, fall back to a `teacherUid` query over the student's classes.

### Running a check

1. The person picks a piece and draft, types a reason and confirms. The confirm line shows the word count and the estimated cost.
2. `runAiWritingCheckV1` checks, in order: not a View as tab, verified email, `enabled`, caller on the list, reason present, the draft is turned in, 50 words or more, and month spend plus this cost is within the cap. Cost is 5 cents per started 100 words.
3. It writes the log entry and reserves the spend in one transaction before calling Pangram, as `functions/src/viewAs.ts` writes its audit entry before returning a token.
4. It converts the draft HTML to plain text and calls Pangram: `POST https://text.external-api.pangram.com/task` with `x-api-key`, then polls `GET /task/{task_id}` until `STAGE_SUCCESS` or `STAGE_FAILED`, within the callable's timeout. Use plain `fetch` with `redirect: 'error'` and `AbortSignal.timeout`; Pangram has no Node SDK. Read the model name from settings or `GET /models`, not a hard-coded string.
5. On success it updates the log entry with the label and three fractions and returns the text, the windows and the record facts to the page. On failure it refunds the reserved spend, marks the entry failed and shows a plain message (402 out of credits, 429 try again shortly).

Field names in this plan came from a summarising reader of `docs.pangram.com`. Confirm each against the live docs and one real call on dev before writing the response types.

### The result (C10)

- Left: the draft with each Pangram window tinted by its label (AI-Generated, AI-Assisted, Human Written) and its confidence (High, Medium, Low) on hover and in a list.
- Right: Pangram's label and the three shares, then the record's facts. For Writing: words, writing time, Writing sessions, pastes and pasted characters, untyped and dictated text, time away. For a quiz answer: whichever of pastes, typing and tab exits were captured.
- Fixed wording above both: this is one datapoint; the percentage is the share of text given each label, not how sure the tool is; talk with the student before deciding anything.
- A short-text line when the piece is under 300 words: results on short writing are less reliable. Pangram's own evidence is strongest at 300 words and up.
- Closing the result discards the text and the highlights. "Past checks" shows only what C13 lists.

### Rules for the build

- Every new control gets a tour anchor (`components/CLAUDE.md`).
- `functions/src/viewAsCallableCoverage.test.ts` fails an `onCall` file that skips `assertViewAsAllowed`.
- Tests: the gate order in step 2 (each refusal sends nothing to Pangram), the cap at its boundary, the refund on failure, the log entry holding no text, and a non-listed site admin being refused by every callable.
- Dev testing uses the mock class and text Paul types as a test student. Never copy student work into dev.

## 5. Slices

1. **Server.** Settings document, the access and settings callables, the Pangram client with an injected `fetch`, `runAiWritingCheckV1`, the check log, and the tests above. Needs the dev key (PT-310) to confirm the response shape.
2. **Settings row.** Access > Features row for super admins: switch, people list, cap.
3. **Tool page.** Tools > AI writing check: student search, the piece list, the reason and confirm step, the result, Past checks and the month's spend.
4. **Prod readiness.** Privacy policy wording that names Pangram and says a named few can open a student's work for a check (PT-312), and anything the agreement changes (PT-311), such as a zero-retention setting.

## 6. Before prod is switched on

All three are Paul's and tracked in `PAUL_TODO.md`:

- **PT-311:** a signed data privacy agreement with Pangram, zero retention on API submissions, and district pricing. Self-serve credits appear to include neither.
- **PT-312:** district privacy review of the new data flow, and privacy policy wording. The policy now names only Google as a third party and says access is limited to the account that owns the content (`components/legal/PrivacyPolicyPage.tsx`).
- The prod key in Secret Manager, set by Paul, with auto-refill off.

## 7. Open items

- **How long the check log is kept.** Not decided. Until it is, entries stay until a super admin deletes them.
- **Under-50-word behaviour.** Pangram's docs don't say what the API returns below its floor. SpartBoard refuses first, so this only matters if the floor moves.
- **K-12 accuracy.** No vendor or independent accuracy data on K-12 writers was found; PT-311 asks Pangram for it. If none exists, say so in the fixed wording.
- **Pangram retention on self-serve.** Their privacy policy and help article give different periods, and `/task` retention is not documented. Dev sends no student work, so this blocks only prod.

## 8. Facts this plan rests on (checked 2026-11-23)

- Admins can't read `writing_assignment_sessions/**` through rules; quiz responses are readable by a site admin.
- A response carries a pseudonym uid, not a name. Names come from ClassLink at read time.
- Writing is ClassLink-only (Writing plan D20), so C17 costs nothing for Writing.
- Pangram: 50-word minimum, about 18,725 words maximum per scan, $0.05 per 100 words, 24 languages, async submit and poll, SOC 2 Type II, and a claim that submissions are not used for training.
