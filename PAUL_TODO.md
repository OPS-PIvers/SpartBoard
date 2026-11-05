# Paul's to-do

Work only a person can start. Everything an agent can do on its own is in [AGENT_BACKLOG.md](AGENT_BACKLOG.md).

- **You**: only you can do it (prod clicks, your real account, a real device, Google or Admin Console, store listings, emails to IT, counsel or the district, money).
- **🤖 With an agent**: you approve or steer and an agent does the work. Paste the prompt into any SpartBoard session. A step that needs the prod key says so; run that session on the PC that has it.
- **Done?** Delete the line, or tell any agent "PT-12 done". IDs never get reused. `(F78)` is the item's old FOLLOW-UPS number.
- **Next free ID: PT-126.** Take it for a new item and bump this line in the same PR, so two parallel adds conflict here instead of reusing an ID.

Last audited 2026-11-01. Items removed as done: PT-73, PT-77, PT-81, PT-82, PT-83, PT-86 (ticked done by Paul, 2026-11-04), PT-18, PT-21, PT-23, PT-26, PT-27, PT-28, PT-29, PT-30, PT-31, PT-32, PT-35, PT-36, PT-37, PT-39, PT-43, PT-44, PT-45, PT-46, PT-47, PT-48, PT-110, PT-121 (ticked done by Paul, 2026-11-04), PT-5, PT-8, PT-9, PT-10, PT-11, PT-15, PT-40, PT-123 (done per Paul, 2026-11-04), PT-3 (main's Actions cache cleared, 23 caches, 2026-11-04), PT-113 (dry run found 0 stale entries, 2026-11-03), F43, F52-F54, F66, F67, F72, F77, F84, the extension 0.1.15 upload, the PLC Home v2 removals and the tour-slide conversion.

---

## 1. Now: blocking a release or a person

- [ ] **PT-1 🤖 Quiz join code backfill, run 2** (F78). Run 1 and the security release are done; run 2 is what lets the next release drop the old-client rule (AB-47). Turn on the PC with the prod key (OPS-z6wXCDG6PbO), then paste:
  > Run the post-release quiz join code backfill on prod: `node scripts/backfill-quiz-join-codes.mjs --all` as a dry run, show me the counts, then `--all --apply` after I say go.
- [ ] **PT-2 🤖 Re-run the widened demote script** (F73, #4900). The first run only checked auto-enrolled teacher records; this one checks all of them, which can include students. On the PC with the prod key and ClassLink env vars:
  > Run `node scripts/demote-student-member-docs.mjs` on prod as a dry run and list who it would demote, then add `--apply` after I say go.
- [ ] **PT-4 🤖 Speak gate pass marks** (F2, #4435). Enforcement stays off until these three are set: the pass mark for "another word accepted" (it runs 0.2-2.2%, so 2% passes every set), whether Spanish sound-group recall under 80% is OK, and whether to drop the unusable held-out recordings.
  > Grill me on the three Speak gate pass-mark decisions in #4435, then write my answers into the pronunciation gate config and docs/pronunciation-gate-results.md.
- [ ] **PT-6 You: `ORG_REPO_TOKEN` secret on OPS-PIvers/claude-skills** (F42, claude-skills #24). Fine-grained PAT: owner Orono-Public-Schools, repo claude-skills only, Contents read and write. Then tell an agent "merge claude-skills #24". Without the secret, the first mirror run after merge fails.
- [ ] **PT-7 🤖 Focus push key on dev** (F44, #4823). Devices poll every 5 minutes until this lands. On a PC with gcloud signed in as an owner:
  > Run `node scripts/focus-vapid-keygen.mjs --project dev`, then commit the updated `extension/src/listings.ts` with an extension version bump and open the PR.

## 2. Waiting on your prod test

### 2b. Wording to OK before a flag opens

Merged behind admin flags. Reply "OK" or the change.

- [ ] **PT-12 You: Drawing whiteboard tools** (F47): "Highlighter", "Laser pointer", "Sticky note", "Dashed", "Both ends", "Duplicate (Ctrl+D)", tooltips like "Pen (P)", and the what's new note "Zoom in and move around the page, mark up with a highlighter, point with a laser pointer and add sticky notes. Hold Shift for straight lines and even shapes, and duplicate, copy and paste items between boards."
- [ ] **PT-16 You: Import rows** (F81, #4960): the 15 "Import: ..." labels and descriptions (admin-only text, already merged).
- [ ] **PT-17 You: Video import "Left out" line** (F82, #4961): "Left out: 2 answer choices past the most a question can hold."
- [ ] **PT-19 You: Teams wording list** in `docs/plans/shipped/mockups/teams-redesign-wording.md`, and the "‹name›'s wall" member label from shared boards (OK or drop).

### 2c. Flags to test and open

Test on your real prod account, then set the row to Public (Previews, or Widgets for a widget). Then paste the prompt so an agent retires or graduates the gate and writes the teacher release note.

| ID     | Feature (flag)                                                            | Test first                                                                                                                                                                                                                                                                                                                           | When it's Public, paste                                                                                               |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| PT-24  | Web tours (`web-tours`)                                                   | Needs PT-52 first. Play a tour with the extension on a Chromebook: the spotlight glides between steps without blinking, and Wikipedia's Tools menu is found. In real Chrome: a tour link through ClassLink sign-in, a LaunchPad new tab, the Tours tab search and Start, the badge, the not-signed-in message on a personal profile. | "Web tours is Public: retire `web-tours` and add the changelog entry."                                                |
| PT-25  | Sparty (`sparty`)                                                         | Tours, first-time setup, Help Center.                                                                                                                                                                                                                                                                                                | "Sparty is Public: retire the gate and add the changelog entry."                                                      |
| PT-33  | Whiteboard responses (`quiz-whiteboard-response`)                         | Try it on your account.                                                                                                                                                                                                                                                                                                              | "Whiteboard responses are Public: retire the gate and add the changelog entry."                                       |
| PT-34  | Mini App results (`mini-app-results`)                                     | Results on a real Mini App.                                                                                                                                                                                                                                                                                                          | "Mini App results is Public: retire the gate and confirm the claude-skills `references/mini-apps.md` rewrite landed." |
| PT-49  | Import anything + the "Import: ..." rows                                  | Before opening: PT-54, PT-55, PT-56, and the "Import review minors" (AB-23) fixed. The "AI in Import" switch stays off until you want AI conversions. Each type opens only when Import anything, a way in, and its own row are all on, so Beta users can get one type at a time.                                                     | "Import X is Public: add the changelog entry."                                                                        |
| PT-50  | Gradebook                                                                 | Phases 1-6 are built behind admin flags.                                                                                                                                                                                                                                                                                             | "Gradebook is Public: retire the gates and do the Assignments hub retire PR (GRADEBOOK.md)."                          |
| PT-51  | Classroom assign (`CLASSROOM_ASSIGN_ADMIN_ONLY` in `config/constants.ts`) | Confirm Spike A end to end on prod: partner-first courseWork.create, due-date patch, token-less add-on render and launch, grade roll-up.                                                                                                                                                                                             | "Spike A passed: set `CLASSROOM_ASSIGN_ADMIN_ONLY = false` and add the changelog entry."                              |
| PT-111 | Widget connections (`widget-connections`)                                 | On by default for every admin since #5032; your boards' old link toggles converted on first load. Run a Sequence in class (Timer, Randomizer, Music), start a timer from the phone remote, pause and resume mid-Run, and copy a board with a Connection. AB-88 to AB-93 first.                                                       | "Widget connections is Public: retire the gate, write the release note and the widget notes."                         |
| PT-118 | Randomizer: avoid recent partners (`random-avoid-repeats`)                | On a class board in Groups mode turn on "Avoid recent partners", make groups 3 times and check partners rarely repeat; turn it off and check groups are plain random again.                                                                                                                                                          | "Avoid recent partners is Public: retire the gate and write the release note."                                        |
| PT-124 | Weather recess gear redesign (`weather-gear-layout`)                      | A Weather widget whose recess gear range has a picture, at a small and a large size; Hide recess gear and Weather details still look as before.                                                                                                                                                                                      | "Weather recess gear redesign is Public: retire `weather-gear-layout` and add the Weather widget note."               |
| PT-125 | Find my Schoology courses (`schoology-auto-link`)                         | In Link Schoology, click Find my Schoology courses: each ClassLink class shows its own Schoology section and semester; link a few, then check Push to Schoology lists only those.                                                                                                                                                    | "Find my Schoology courses is Public: retire the schoology-auto-link gate and write the release note."                |

### 2d. Checks before opening an item above

- [ ] **PT-52 You: prod Storage role for web tours** (F60). Agents can't change prod IAM. Without it, admins can't upload web tour pictures on prod: `gcloud projects add-iam-policy-binding spartboard --member=serviceAccount:service-759666600376@gcp-sa-firebasestorage.iam.gserviceaccount.com --role=roles/firebaserules.firestoreServiceAgent`
- [ ] **PT-53 You: Google Tasks setup.** Enable the Tasks API and add the tasks scope to the OAuth consent screen (prod, and dev if needed); confirm the district doesn't block third-party Tasks access for staff.
- [ ] **PT-54 You: Edpuzzle answer keys** (F83). Send one Edpuzzle lesson you own from the dev extension and see whether it arrives with its answer key (public ones don't).
- [ ] **PT-55 You: Quizlet Send** (F86, #4964). Before the next extension version raise, Send one Quizlet set from the dev extension and confirm it lands as Flashcards with its cards, not plain page text.
- [ ] **PT-56 You: PowerPoint import** (#4938). On spartboard-dev, signed in, import one PowerPoint into Notebook or Guided Learning to confirm Drive converts it.
- [ ] **PT-57 🤖 Review article on prod.**
  > Check read-only on prod that the Review Help Center article and its live tour (QUIZ_REVIEW_SPLIT PR 6) were imported; tell me what's missing.
- [ ] **PT-58 🤖 Release notes nobody wrote.** These features are on without a teacher note.
  > Draft teacher release notes for: library folders (no flag; confirm it's meant to be on for everyone), student landing v2, "tours start from the same screen every time", the Guided Learning light tour chrome, and quiz results printing (its flag is gone; check whether a note shipped). Show me the wording before committing.
- [ ] **PT-59 🤖 Live tour benchmark.**
  > Merge the claude-skills live-tours.md finish-pass update, rerun the three live-tour benchmark workflows, walk me through the 12 benchmark tours so I can record edits in docs/live-tours/BENCHMARK.md, and ask me whether D18's `live-tour-self-heal` gate is still wanted.
- [ ] **PT-99 You: real copier check for stimulus answer sheets** (`docs/plans/shipped/QUIZ_PAPER_SHEET_STIMULI.md` D4). Print one single-column sheet with a dark photo and a coordinate grid, scan it on the real copier and import it. Only real toner proves the post-fit Otsu exclusion; tell an agent if any bubble misreads.
- [ ] **PT-100 You: Speak "words to check"** (P5, `docs/multilingual-pronunciation-engine.md`). During the admin-only period, review the words to check in the Speaking view; open `flashcards-speak` only after this, PT-4 and PT-79.
- [ ] **PT-103 You: turn on the Schoology launch browser check** (batch 1I). After the release, launch one Schoology assignment as a student on a Chromebook and one on an iPad or Mac Safari, and add one quiz as a teacher from Schoology's resource picker. In the prod `ltiLaunch` logs, each `[ltiLaunch] browser binding` line should say `binding: 'ok'` (Safari may say `missing`). If teacher picker launches say `missing`, keep it off: the new-tab fallback can't return a picked item to Schoology. Otherwise set `launchBinding: "enforce"` on `admin_settings/lti_config` in the prod console. A launch without the check then shows one "Open SpartBoard" button that reopens it in a new tab; OK that wording or ask for another. Remove the field to switch it back off.

## 3. Prod steps that need your OK

- [ ] **PT-122 You: try the Claude connector without registration**. On spartboard-dev, Admin Settings > Access > Previews > District switches > "Claude connects without registering" > on. Wait 5 minutes, remove and re-add the dev connector in Claude, connect from claude.ai and from Claude Code (`/mcp`), and run one tool in each. If both work, turn the same row on in prod and repeat once. Turning it off puts Claude back on registration within 5 minutes.
- [ ] **PT-60 🤖 Scrub active Video Activity sessions** (F19). Outside school hours, PC with the prod key:
  > Scrub the active VA sessions on prod with `--include-active` (4 sessions): dry run, then apply after I say go.
- [ ] **PT-61 🤖 Grade index backfill** (F19, 347 sessions). Once the Gradebook score index switch is on:
  > Run the grade index backfill on prod: dry run, then apply after I say go.
- [ ] **PT-62 🤖 Internal tool permissions migration** (ADMIN_ACCESS_PAGES).
  > Run `scripts/migrate-internal-tool-permissions.mjs` on dev then prod, dry run first, then `--apply` after I say go; then check each 'keep' row against prod global_permissions and list flags already Public ("Ready to graduate").
- [ ] **PT-63 🤖 Phoneme model upload at the Speak release** (P2).
  > Upload the phoneme model to prod: `node scripts/upload-pronunciation-model.mjs --project prod`.
- [ ] **PT-64 🤖 Squatted attempt records** (F76, optional, likely zero).
  > Count prod quiz and video attempt records whose id doesn't match `studentUid` or whose `teacherUid` differs from the session's. Read-only; deleting needs my OK.
- [ ] **PT-108 🤖 Activity Wall records from before the write checks** (optional, likely zero).
  > Count prod Activity Wall sessions whose owner uid is a student account, wall posts whose `id` field doesn't match their doc id, and photo, file or video posts whose `content` isn't their `storagePath`. Read-only; deleting needs my OK.
- [ ] **PT-65 🤖 Claude SDK 1.x smoke test** (F58, #4603).
  > Set one AI integration to a Claude model on dev, run it, then do the same on prod with me. Tell me if anything falls back to Gemini or web tour writing fails.
- [ ] **PT-104 🤖 PLCs started by non-staff accounts** (security batch 1C, optional). New PLCs now need a staff account; older ones were not checked.
  > On prod, list PLCs whose lead has no active staff member doc (anonymous, student or unknown account). Read-only; deleting any needs my OK.
- [ ] **PT-115 🤖 Record who started each older PLC** (security batch 2D). Only after the next main release is live on prod (running it earlier turns the fallback off before new teams get their record). Until it runs, older teams trust their earliest member as creator, so printing for a team's creator keeps working:
  > Run `node scripts/backfill-plc-creators.mjs --project spartboard` (dry run) from the PC with the prod key, show me the count and any rows marked "differs from lead", then re-run with `--apply` after I say go.
- [ ] **PT-106 🤖 Strip leaderboard names from old quiz sessions** (security batch 1A, #4986). After the next main release, so no open monitor still writes them:
  > Remove `name` from every `liveLeaderboard` entry on prod `quiz_sessions` docs: dry run with a count, then apply after I say go.
- [ ] **PT-112 🤖 PLC assessments made by people who were not members** (security batch 2E, optional). Pooled results already skip them; their assessment entries stay in the PLC's list.
  > On prod, list `plcs/*/assessments` docs whose `createdBy` is not in that PLC's `memberUids` or whose member entry is `status: 'removed'`. Read-only; deleting any needs my OK.
- [ ] **PT-116 🤖 Board share item copies left behind** (security batch 2B, optional). New share ends and member leaves now remove their copies; older ones were not swept.
  > On prod, count `shared_boards/*/items` docs whose share no longer exists or whose `ownerUid` is no longer the share's host or a participant. Read-only; deleting them needs my OK.
- [ ] **PT-117 🤖 Sharing records made by non-staff accounts** (security batch 2B, optional, likely zero). Substitute shares and collection links now need a staff account; older records were not checked.
  > On prod, list substitute `shared_boards` and `shared_collections` whose host has no active staff member doc, and `linked_collections` or `shared_boards` participants with no staff member doc. Read-only; removing any needs my OK.
- [ ] **PT-119 🤖 Students in building groups** (optional, likely zero). The auto-roster now skips student-role accounts; ones it added earlier stay until swept. Only after the main release with this fix is live on prod and after PT-2's `--apply`, so no new student members appear after the sweep:
  > Run `node scripts/remove-student-building-group-members.mjs --project spartboard` (dry run) from the PC with the prod key, show me who it lists, then re-run with `--apply` after I say go.
- [ ] **PT-66 You: password reset domains** (F56, #4585). Admin Settings > Organization > Domains on prod: the Orono domains show Verified.
- [ ] **PT-67 You: ClassLink PIN lists** (F57, #4738). ClassLink students got 6-digit PINs in the 10-27 sync. If teachers weren't told, they need new PIN lists.
- [ ] **PT-105 🤖 Student names left in board copies saved before batch 1F.** New saves keep them out; older copies keep them until the board is saved again. Read-only first:

  > Count prod dashboards, shared_boards, starter packs and Catalyst sets that still hold quiz-built Scoreboard teams (`pin-`/`uid-` team ids), name-keyed Stations, Lunch Count or Seating Chart assignments, Poll hide keys with `#`, or any `PII_WIDGET_FIELDS` key. Report counts only; removing them needs my OK.

  Drive board shares made before this fix gave the whole domain read access to that board's own backup file. Ending those grants takes the teacher's Drive or a Workspace admin; decide whether to ask IT.

## 4. Cloud and Google console

- [ ] **PT-69 You: prod stays warm after the next release.** `gcloud run services describe getpseudonymsforassignmentv1 --project=spartboard --region=us-central1 --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/minScale'])"` prints `1` (PR #3723). Agents get permission denied on prod Cloud Run.
- [ ] **PT-70 You: Artifact Registry cleanup on prod.** Apply the same 1-day policy dev has (#4332) once its effect on build cache and deploy time is confirmed on dev. About $2/mo.
- [ ] **PT-71 You: unused secrets.** No deployed function references `JULES_API_KEY` or `YOUTUBE_API_KEY` (checked 2026-11-01). Disable them in prod Secret Manager (reversible). Never run `firebase functions:secrets:prune`.
- [ ] **PT-72 You: stale budget.** Delete the $20 "SpartBoard" budget on the personal billing account (01597B); it covers nothing now.
- [ ] **PT-74 🤖 Daily prod backup schedule** (delete protection and PITR are on; PITR's 7 days is the only recovery path).
  > Propose a daily Firestore backup schedule for prod with a retention and cost estimate, then create it after I say go.
- [ ] **PT-75 🤖 Prod CI to keyless deploys.**
  > Plan moving prod CI to Workload Identity Federation like dev, list the console steps I have to click, then delete the prod JSON key once it works.
- [ ] **PT-76 You: Dependabot alerts** (F85, optional). Settings > Code security > Dependabot alerts > Enable.
- [ ] **PT-101 You: dev registrations for ClassLink, Spotify and LTI**, only when a feature needs them on spartboard-dev (they are placeholders there today).

## 5. District, IT, counsel and Google

- [ ] **PT-78 You: IT force-installs the extension** on staff Chromebooks (0.1.26 is Published).
- [ ] **PT-79 You: counsel, espeak-ng GPL-3** (F14, G19, #2337). `flashcards-speak` stays admin-only until counsel confirms.
- [ ] **PT-80 You: counsel and family notice for Focus** (G1). Keep "Show each student's current site in Focus" off on prod until then. Before any pilot: 🤖 "Run `node scripts/focus-vapid-keygen.mjs --project prod` and commit the listing." (F59). Then the FS10 student pilot and the web tours pilot.
- [ ] **PT-84 You: wide distribution (hard to reverse).** Custom domain decision (the `*.web.app` domain can't meet OAuth branding rules), then upload the consent-screen logo (`marketplace-assets/icon-128.png`), then submit sensitive-scope verification (spreadsheets, calendar.readonly). Counsel finalizes `/privacy` and `/terms`; decide Path A vs B; then flip the consent screen Internal to External. 🤖 for the code half: "Broaden SupportPage.tsx for external users per docs/wide-distro-plan.md Phase 4."
- [ ] **PT-85 You: vanity short domain** for the link shortener ($15-50/yr).

## 6. Decisions (nothing blocked; pick when convenient)

Each prompt starts a grilling; the agent writes your answers into the plan and moves approved work into AGENT_BACKLOG.md.

- [ ] **PT-87 🤖 PLC rename "Quizzes" to "Assessments"** scope (teacher-side widget? VA and rubrics as kinds? student copy?).
  > Grill me on docs/plans/PLC_RENAME_QUIZZES_TO_ASSESSMENTS.md scope, then update the plan.
- [ ] **PT-88 🤖 M16 PLC phases 7-8**: Open Decisions A/B/C (Mini-App share UI point, Mini-App sync content model, GL Drive coupling on PLC import).
  > Grill me on M16 Open Decisions A, B and C in docs/specs/M16-plc-phases-7-8-spec.md and record them.
- [ ] **PT-89 🤖 LO12 Nexus connections**: Decision A (per-widget config vs a wiring table), defer candidates 6 and 9, reject 11.
  > Grill me on LO12 Decision A and the candidate 6/9/11 calls in docs/specs/LO12-nexus-widget-connections-spec.md and record them.
- [ ] **PT-90 🤖 Schoology grade import starts with your D19 probe.**
  > Walk me through the D19 read-only Schoology REST probe in docs/plans/SCHOOLOGY_GRADE_IMPORT.md and record what we learn.
- [ ] **PT-91 🤖 Import waves 2 and 3** (F80). Send one sample link each for Google Forms, Quizlet, Edpuzzle, YouTube and one Canvas/QTI export, and rank the wave 3 sites.
  > Here are my import samples and wave 3 ranking: … Update docs/plans/IMPORT.md and add the readers to AGENT_BACKLOG.md.
- [ ] **PT-92 🤖 Schoology Resources quizzes** (F70). Send a link to one real Resources quiz page if you want a Send button there.
- [ ] **PT-102 🤖 Video note stops in live runs.** Note stops are silent when you run a video activity teacher-paced. Decide whether live mode should pause on notes (AB-67).
  > Show me how a note stop behaves in a teacher-paced Video Activity run and ask whether it should pause, then add the answer to AB-67.
- [ ] **PT-93 🤖 Improvement review calls** (F23, `improve-2026-10-16/FINDINGS.md` in the Project): #15 archive answers when a completed unlimited-attempts quiz is reopened, #18 gradual OAuth token re-encryption, #12 split the tour-anchor registry out of the student chunk, #19 raise the test-count floor, the group reminders scan.
  > Grill me on improvement findings #12, #15, #18, #19 and the group reminders scan; add each yes to AGENT_BACKLOG.md.
- [ ] **PT-94 🤖 Widget rubric: re-norm Expectations** (F26, S5 paused for drift).
  > /grade-widget norming session on Expectations.
- [ ] **PT-95 🤖 Small fixes you parked.** Yes or no on each; yeses go to AGENT_BACKLOG.md:
  - Restore PIN students' individually assigned work (F62, #4680; needs a server call; you said "later").
  - Sidebar row menu: tour anchors for ClassLink sync, Classroom link and delete, and 28px tap targets (F64, live for everyone).
  - Release #4899 minors (F74): Focus side panel polls status every minute; a staff member with a ClassLink student role could be held by Focus; the Custom lines box resets to 1 when cleared; sub share access checks the domain only for teacher-named addresses.
  - Extra writing pages on paper answer sheets (F71, Jen's ask; `printed-writing-room/EXTRA-PAGES-PLAN.md` in the Project).
    > Ask me yes or no on each item in PT-95 and move the yeses into AGENT_BACKLOG.md.
- [ ] **PT-96 🤖 Focus and substitutes** (F63): should a sub's Release/End/Open follow the "sub launch as teacher" switch? Also confirm the sub-launch v1 limits still fit (class-wide only; no translated locales, read-aloud, media responses, learning targets or banked questions in sub runs).
- [ ] **PT-97 🤖 My groups open questions**: mentoring content owner, Danielson rubric details for evaluators (D9), whether department groups differ from PLCs.
- [ ] **PT-98 🤖 Build or drop?** Ideas nobody has said yes to:
  - District Curriculum Repository for Quiz (admin-approved library with grade and subject tags; needs product definition)
  - Mini App Monaco editor and a versioned postMessage bridge
  - Schema-driven admin config renderer replacing about 60 bespoke `*ConfigurationPanel.tsx` files
  - Data binding and webhooks (server proxy and webhook executor; security-sensitive)
  - Google Fonts picker and `@font-face` upload
  - Auto-assign a dashboard template on first login by building and grade; admin lock/unlock of live widgets
  - Full DashboardContext data/actions split (LO14; about 192 `useDashboard` sites, wide blast radius)
  - Regroup the 619 flat `utils/` files into domain folders (F23)
  - Student-side Sparty on finish screens and the lobby (Sparty phase 2)
  - Live mode from sub-launched and Library Assign entry points (VA live mode)
  - Flashcards v2: matching test, PLC shared library, Speak mode
  - Quiz `'speak'` question type
  - Deferred video capture responses (peer mode, framing check, transcode, district gate)
  - Link shortener PR 2 (per-click log, nightly rollup, chart) and PR 4 (bulk CSV)
  - Rewrite or retire `docs/PLC_ROADMAP.md`, which covers only the first 6 phases
  - Delete the retired `users/{uid}/plc_layouts` rule and its tests
    > Ask me build or drop on each idea in PT-98. Move each yes into AGENT_BACKLOG.md as a brief, delete each no.
