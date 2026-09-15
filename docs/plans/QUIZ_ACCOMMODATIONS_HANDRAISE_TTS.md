# Quiz: class-mode accommodations, raise-hand gate, Spanish audio, FIB translation

Grilled and settled 2026-09-14. Four PRs, shipped in this order. Each is independent.

## Current-state facts that drove the decisions

- Roster accommodations (`ClassRoster.defaultOverridesByStudentId`, Drive file) are applied only when a student is individually ticked in `AssignStudentPicker`. Checking a class applies nothing; `functions/src/studentAssignmentTargets.ts` never reads roster defaults.
- The double "+" is a lucide `Plus` icon plus a label string starting with "+" in all four `locales/*.json` (`assignTargeting.expandAffordance`).
- Raise hand has no toggle anywhere. Student app reads no admin docs; global quiz features reach students via the session doc written at assign time.
- `FeatureConfigurationPanel.tsx:690` declares quiz as having global settings but renders no panel. Quiz admin settings live in the separate "Quiz Languages" tab (`QuizReadAloudConfigurationPanel.tsx`).
- D25 hides the whole read-aloud bar when a translated rendering is on screen. TTS language comes only from `session.language` (quiz authoring language). Translation locale (`override.language`, short codes `es`/`so`/`hmn`) is never plumbed to TTS. Voices are keyed `es-US` etc.
- D21 skips FIB translation in eight layers (`config/quizTranslation.ts:isTranslatableQuestionType` is the single switch). MC/Matching/Ordering options are already translated. `serveLocalizedQuestion` is all-or-nothing per question.

## PR 1 — Class-mode accommodations + exclude toggle + double plus

Applies to every surface using `AssignTargetingSection` (Quiz, VA, GL, Mini-app, Assignments Hub, Classroom add-on, LTI). One shared component, one behavior.

- Rename affordance to "Edit or add modifications"; drop the literal "+" from all four locales; update the two comments in `TeacherDiscoveryRoute.tsx` and `LtiDeepLinkPicker.tsx` that quote the old label.
- **Classes decide who gets the work.** Expanding the section lists every student from checked rosters. Rows with standing accommodations sort first with a badge; the rest collapse under "show N more".
- Each row pre-fills from `defaultOverridesByStudentId` and is editable for this assignment only. Edits never write back to the roster.
- Each row gets a "Skip this student" toggle. Skipped students get no pointer at fan-out and see nothing on their assignments page.
- Snapshot semantics: later roster edits do not touch existing assignments.
- Client-side expansion: checked classes are expanded into `overridesByKey` before `buildSetAssignmentTargetsPayload`. No Cloud Function change for defaults. Exclusions need a new field on the payload (e.g. `excludedTargets: StudentTargetRef[]`), which the CF must honor; gate on the new client marker per the dev-branch-deploys-to-prod rule.
- Old `targetMode: 'students'` picker is retired from the UI; keep read compatibility for existing assignments.
- Tests: `AssignTargetingSection.test.tsx`, `AssignStudentPicker.test.tsx`, per-surface assign tests, `studentAssignmentTargets.test.ts`.

## PR 2 — Raise-hand gate + Quiz admin modal

- New Quiz config modal under Feature Permissions (`admin-widget-config` skill). Move the Quiz Languages tab content (read-aloud voices, translation settings) into it and remove the standalone tab.
- Raise hand setting is three-state: `teacher-choice` / `force-on` / `force-off`, stored in `admin_settings` keyed per building like other widget configs.
- Per-quiz teacher checkbox "Allow students to raise a hand" in quiz settings, hidden when forced. **Default is OFF** (Paul's call): raise hand disappears for every quiz until a teacher opts in or an admin forces it on. Flag this in release notes.
- Teacher client resolves admin setting + quiz checkbox at assign and writes `handRaiseEnabled` onto the session doc. Student player renders the button only when true. Running sessions keep their value.
- Monitor: hands section hidden when the session has it disabled.

## PR 3 — Spanish audio (reverse D25)

- Map translation locales to voices: `es` → `es-US` voice. `so` and `hmn` have no Google Neural2 voice, so the bar stays hidden on those views.
- Read-aloud manifest and on-demand callable accept a locale; synthesize the translated strings the student sees (`serveLocalizedQuestion` output), cached per `(part, locale)`.
- Server must derive text from the stored translation, never from client-supplied strings, matching the existing rule.
- No admin gate: if read-aloud is on for the student, they get audio in whichever view is active.
- Tests: `QuizStudentApp.readAloud`, `QuizStudentApp.translation`, `quizReadAloud` function tests.

## PR 4 — FIB translation (reverse D21)

- Blanks replaced by numbered tokens before translation; validator requires the same token set back or the question falls back to English (existing all-or-nothing rule).
- Answer key translated alongside the stem; grader accepts either the English or the localized accepted answers. Locale is already stamped on each recorded answer.
- Flip `isTranslatableQuestionType`, then audit the eight enforcement sites listed in the research notes and the Languages review pane so FIB rows appear.

## Open

- Whether excluded-student count should appear on the assignment card (PII-free count already exists for skipped students).

## Status (2026-09-14)

All four PRs merged to dev-paul via the mass-plan-implementation run, each after three internal adversarial review/fix rounds: #3047 (PR 1), #3045 (PR 3), #3048 (PR 4), #3046 (PR 2). Integration review of the merged whole produced one follow-up, #3049. Not yet released to main. Not yet browser-verified.

Design changes made during the run:

- A skip keeps `targetMode: 'class'`. The Cloud Function writes the student's pointer doc with `excluded: true` and keeps their override on it (suppression, not deletion); the class channel and every student app entry path hide the work from that flag. Flipping to individual targeting was rejected: it dropped non-SSO roster students and hit the 250-ref cap. Only exclusions the CF actually resolved are persisted.
- Hub edits treat stored targeting as a frozen snapshot (`useRosterDefaults: false`); roster defaults never apply retroactively. Class context is passed only when every roster resolves.
- Add-on resolves its roster from `classroom_course_links`; LTI from `roster.ltiContextId`. No roster, no modifications panel.
- Raise-hand gate lives in `feature_permissions/quiz.config.buildingDefaults`, resolved across the union of org-membership `buildingIds` and `selectedBuildings`, most restrictive wins; empty set is teacher-choice. View-only shares never enable it. Session creation waits (bounded 5 s) for profile, permissions and membership.
- Translated FIB answer keys are snapshotted on the teacher-owned `quiz_assignments` doc as `localizedFibAnswers`; grading accepts English plus only the locale served to that student, resolved teacher-side, and refreshes on PLC sync. The sidecar normalizer carries `answer`. A FIB row with a blank translated answer cannot be reviewed and falls back to English.
- TTS prepare scopes translation locales to students who hold read-aloud (or all voiced locales under `readAloudAll`). Stimulus passages keep English audio on localized views. A locale mismatch returns `failed-precondition` and the client retries in English. Locale slices persist their failures and get their own deadline; the manifest is counted in the session-doc byte budget.

Follow-ups:

- Browser verification of all four flows on the dev-paul preview (assign with a skip, hub edit, Spanish read-aloud on a translated quiz, FIB translation review + grading, admin modal + raise hand).
- Release notes must flag raise hand default OFF for every existing quiz.
- Check TTS cost after the first Spanish class uses read-aloud.
- Excluded-student count on assignment cards (still open).
