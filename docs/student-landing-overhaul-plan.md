# Student Landing Overhaul — Implementation Plan

Unifies the SSO student landing (`/my-assignments`) and live-session flow into a single, admin-configurable home. Adds per-assignment results release, announcements, and a teacher directory, with section visibility and order driven by `StudentPageConfig`. Target: PR into `dev-paul`.

## How to use this doc

This plan is designed to be **executed in independent chunks across multiple sessions**. An agent (or human) can pick up any unchecked phase without re-deriving context.

### Rules for agents working this plan

1. **Always read this doc top-to-bottom before starting a phase.** Decisions in later phases may have shifted based on notes from earlier phases.
2. **Work one phase at a time.** Each phase is a shippable commit. Do not interleave phases.
3. **After completing each phase:**
   - Check the phase box in the Status list.
   - Fill in the phase's "Notes from implementation" block with: files actually changed (if different from the plan), surprises encountered, decisions made mid-phase, and anything the next phase needs to know.
   - If the work diverged from the plan, also update the affected later-phase sections to reflect reality.
4. **Checkpoints.** After Phase 2, Phase 5, and Phase 8, stop and do a full re-read of all remaining phases. Update scopes, file paths, and acceptance criteria if earlier work changed the landscape. Leave a dated entry in the **Checkpoint log** at the bottom.
5. **Open questions.** If you hit a decision that isn't answered here, add it to the **Open questions** list at the bottom and ask the user before proceeding — don't guess.
6. **Scope discipline.** This plan intentionally excludes: lunch menu, modular widget grid framework, mini-app results renderer, per-building section ordering. If you're tempted to expand scope, stop and ask.
7. **Don't delete this section.** The next agent needs it.

---

## Status

- [ ] **Phase 1** — Types + `StudentPageConfig` extension
- [ ] **Phase 2** — Firestore rules + indexes + rules tests _(checkpoint after)_
- [ ] **Phase 3** — Teacher UI toggles on 4 non-quiz assignment modals + new-session defaults
- [ ] **Phase 4** — `teacherDirectory` Cloud Function projection + one-off backfill script
- [ ] **Phase 5** — Student-side hooks + section components _(checkpoint after)_
- [ ] **Phase 6** — Landing wire-up (refactor `MyAssignmentsPage.tsx`)
- [ ] **Phase 7** — Admin section-order UI in `StudentPageView.tsx`
- [ ] **Phase 8** — `ResultsModal` + per-kind renderers + CTA gating _(checkpoint after)_
- [ ] **Phase 9** — Polish: i18n strings, roadmap doc entry, PR cleanup

Branch: work on the current worktree's branch (`claude/nostalgic-hypatia-5b412c` at time of writing) or a fresh feature branch off `dev-paul`. Do NOT target `main`.

---

## Locked decisions (do not re-open without user approval)

| Decision                                      | Value                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Flow model                                    | Unify SSO landing + live-session entry. PIN flow unchanged.                                                                        |
| Layout                                        | Fixed sections with admin visibility + order toggles. No widget grid.                                                              |
| Results gating                                | Reuse existing `showResultToStudent` field name from quiz, extend to the other 4 session types.                                    |
| Default `showResultToStudent` on new sessions | **Quiz: `false`** (unchanged). **Video-activity / guided-learning / activity-wall / mini-app: `true`** (no regression).            |
| Rules enforcement                             | Student response read requires `get(session).showResultToStudent == true`. UI-only gating is insufficient.                         |
| Results modal content                         | Student's own submission + score only. No correct answers, no peer data.                                                           |
| Mini-app results                              | **Skipped this PR.** Completed mini-app cards do not get a "View results" CTA.                                                     |
| Live-session CTA                              | Inline "Join now" button on the active-assignment card. No persistent banner.                                                      |
| Teacher directory fields                      | Name + email only. No class list, no building label visible to students.                                                           |
| Teacher directory data path                   | `/organizations/{orgId}/teacherDirectory/{emailLower}` — student-readable projection written by Cloud Function. Not raw `members`. |
| Lunch menu module                             | Out of scope. Keep the existing admin toggle; don't wire a consumer.                                                               |

---

## Reference files (read before starting)

Open these in the first session so you understand the pivot points:

- `components/student/MyAssignmentsPage.tsx` — the pivot. Dual-query strategy is load-bearing.
- `components/student/StudentApp.tsx` — **do not modify.** Confirms PIN flow stays separate.
- `firestore.rules` (response-read rules across 5 collections; search `responses/` and `submissions/`) — understand `passesStudentClassGateCompat` before adding a gate.
- `types.ts` — `QuizSession`, `QuizAssignmentSettings`, `VideoActivitySession`, `MiniAppSession`, `GuidedLearningSession`. `showResultToStudent` lives here.
- `types/organization.ts` — `StudentPageConfig`.
- `components/admin/Organization/views/StudentPageView.tsx` — admin UI to extend in Phase 7.
- `components/announcements/AnnouncementOverlay.tsx` — subscription logic to extract in Phase 5.
- `components/widgets/QuizWidget/components/QuizAssignmentSettingsModal.tsx` — the toggle UI pattern to mirror in Phase 3.
- `context/StudentAuthContext.tsx` + `context/useStudentAuth.ts` — confirm whether `buildingIds` is on the student claim (see Phase 5).

---

## Phase 1 — Types + `StudentPageConfig` extension

**Goal:** land the type changes that every later phase depends on. No runtime behavior changes yet.

### Scope

- Extend `types/organization.ts` `StudentPageConfig`:
  ```ts
  sectionOrder?: Array<'announcements' | 'assignments' | 'teacherDirectory'>;
  assignmentsDefaultFilter?: { sort: 'newest' | 'oldest'; classId?: string | 'all' };
  ```
  Keep `showLunchMenu` on the type (still set by admin UI; no consumer until a future PR).
- Add `showResultToStudent?: boolean` to:
  - `VideoActivitySession` and its `*AssignmentSettings` (if one exists)
  - `MiniAppSession` and settings
  - `GuidedLearningSession` and settings
  - ActivityWall session type (likely inline in `components/widgets/ActivityWall/Widget.tsx` — check; if so, promote or inline-extend there).
  - Quiz already has it — confirm the field name matches.
- Helper: add `DEFAULT_SHOW_RESULT_TO_STUDENT: Record<AssignmentKind, boolean>` export in a single shared module (propose `config/assignmentDefaults.ts`, new file) so Phase 3 can import it without duplicating the "quiz false, others true" rule.

### Acceptance criteria

- `pnpm typecheck` (or the project's equivalent) passes.
- No runtime consumers reference the new fields yet — this phase is type-only.
- No lint errors.

### Notes from implementation

_To be filled by the implementing agent. Include: actual field names used, any types that turned out to be awkward to extend, and whether ActivityWall's session type needed to be promoted out of its widget file._

---

## Phase 2 — Firestore rules + indexes + rules tests _(checkpoint after)_

**Goal:** server-side enforcement of results release, and the new `teacherDirectory` read rule. Nothing can regress when Phase 3+ actually start setting the flag.

### Scope

- `firestore.rules`:
  - For each of `quiz_sessions`, `video_activity_sessions`, `guided_learning_sessions`, `activity_wall_sessions`, `mini_app_sessions`: on the student's own response/submission read rule, add `&& (isTeacher || get(/databases/$(database)/documents/<collection>/$(sessionId)).data.get('showResultToStudent', false) == true)`. Preserve existing class-gate + ownership checks.
  - Add rule for `/organizations/{orgId}/teacherDirectory/{emailLower}`: authenticated user may read if `request.auth.token.buildingIds` (or equivalent claim, per `StudentAuthContext`) intersects the doc's `buildingIds` field. No write from client — Cloud Function only.
  - Teacher update allowlist on each of the 5 session types must permit `showResultToStudent` writes.
- `firestore.indexes.json`: add composite index on `teacherDirectory` `(buildingIds array-contains, name asc)`.
- Rules tests (`tests/rules/` — match the existing structure):
  - `firestore-rules-responses-release.test.ts`: student denied when flag is `false` or absent; student allowed when `true`; teacher always allowed; student denied for another student's doc regardless of flag.
  - `firestore-rules-teacher-directory.test.ts`: student in matching building can read; student outside building cannot; no client can write.

### Acceptance criteria

- Rules tests pass locally (`pnpm test tests/rules/...`).
- No existing rules test regressions.
- `firebase deploy --only firestore:rules` succeeds in a dry-run or emulator.

### Notes from implementation

_Fill in: exact rule function names used, whether `passesStudentClassGateCompat` needed modification, and what the student claim field turned out to be for building matching (`buildingIds` vs. something else)._

### Checkpoint 1 — after Phase 2

Re-read Phases 3–9. Verify:

- Do the rule changes you wrote match the field names in the `types.ts` changes from Phase 1?
- Does the teacher-directory claim field you chose match what Phase 5 will pass from `StudentAuthContext`? (If `buildingIds` isn't on the claim yet, flag it as a Phase 5 prerequisite.)
- Log what you confirmed in the **Checkpoint log** at the bottom.

---

## Phase 3 — Teacher UI toggles on 4 non-quiz modals

**Goal:** teachers can flip "Let students view their results" on the four non-quiz assignment types. New sessions default per the locked decisions table.

### Scope

- Find the assignment-settings modal for each of:
  - Video Activity (`components/widgets/VideoActivityWidget/...`)
  - Mini App (`components/widgets/MiniAppWidget/...`)
  - Guided Learning (`components/widgets/GuidedLearningWidget/...`)
  - Activity Wall (`components/widgets/ActivityWall/...`)
- Mirror the `QuizAssignmentSettingsModal.tsx` toggle pattern exactly. Label: **"Let students view their results"**. Tooltip/helper: **"When on, students see their own submission on the completed list."**
- On each widget's "create session" / "assign" call site, default the new field per `DEFAULT_SHOW_RESULT_TO_STUDENT` from Phase 1. Quiz create path stays `false`; the other four default to `true`.
- Unit tests for each modal's toggle (read + write).

### Acceptance criteria

- All four modals show and persist the toggle.
- New sessions created today default correctly per the table.
- Existing sessions without the field continue to work (rules treat absent as `false`, so quiz UX is unchanged; the other four will get the flag on new creates only).
- No change to quiz modal (it already has this toggle).

### Notes from implementation

_Fill in: exact modal file paths, whether any of the four types route session-create through a shared helper (if so, the default can live in one place), and whether any widget's session doc is created on the server rather than client (defaults would move to the Cloud Function)._

---

## Phase 4 — `teacherDirectory` Cloud Function projection

**Goal:** student-readable projection of teacher contact info, derived from `/organizations/{orgId}/members/{emailLower}`.

### Scope

- `functions/src/` — new trigger `projectTeacherDirectoryV1`:
  - Firestore `onWrite` on `/organizations/{orgId}/members/{emailLower}`.
  - If member has teacher role and `buildingIds.length > 0`: upsert `/organizations/{orgId}/teacherDirectory/{emailLower}` with `{ name, email, buildingIds, updatedAt }`.
  - If member is deleted or loses teacher role: delete the projection doc.
- One-off backfill: `scripts/backfill-teacher-directory.js`. Iterates `members` in each org, writes projections. Idempotent. Not invoked in CI — documented in the script's header comment.
- Functions unit test: mock the member doc, assert projection write/delete.

### Acceptance criteria

- Trigger deploys cleanly.
- Backfill script runs against the dev project and produces the expected docs.
- Deleting a teacher member removes the projection within one trigger run.

### Notes from implementation

_Fill in: the exact teacher-role predicate used (roleId check? claim check?), the collection path used for `members`, and whether the backfill script needs a service-account path or uses ADC._

---

## Phase 5 — Student hooks + section components _(checkpoint after)_

**Goal:** extract reusable data hooks and build the presentational section components. No landing rewire yet.

### Scope

- **`hooks/useStudentAssignments.ts`** — extract the dual-query subscription from `MyAssignmentsPage.tsx`. Returns `{ active, completed, loading, error }`. `completed` is the lazy-checked set already implemented; keep pseudonym logic intact.
- **`hooks/useAnnouncements.ts`** — extract the Firestore subscription + scheduled-activation + dismissal logic from `AnnouncementOverlay.tsx`. Signature: `useAnnouncements(buildingIds: string[]): Announcement[]`. `AnnouncementOverlay` refactors to call the hook; behavior must be identical.
- **Student claim `buildingIds`** — confirm in `StudentAuthContext` whether `buildingIds` is on the student claim/context. If not, extend `studentLoginV1` (Cloud Function) to include it, update the context type, and surface via `useStudentAuth()`. **This is a blocker for Phase 6.**
- **Section components** in `components/student/sections/`:
  - `HeroSection.tsx` — reads `heroText` + `accentColor` from `StudentPageConfig`. Renders header bar.
  - `ActiveAssignmentsSection.tsx` — list + filter-by-class + sort UI. Card renders "Join now" inline CTA when session status indicates live.
  - `CompletedAssignmentsSection.tsx` — list, "View results" CTA only when the assignment's `showResultToStudent === true`. (Button wired in Phase 8.)
  - `AnnouncementsSection.tsx` — inline cards from `useAnnouncements`.
  - `TeacherDirectorySection.tsx` — queries `teacherDirectory` for the student's buildings. Renders name + email. Email is a `mailto:` link.
- Each section is a pure presentational component plus one data hook; no cross-section state.

### Acceptance criteria

- Existing `AnnouncementOverlay` still works for teacher dashboards (no visual regressions).
- Each section renders in isolation in a Storybook-style test page or in Vitest render tests.
- `useStudentAssignments` passes a dedicated test asserting the dual-query merge and completed-check behavior.

### Notes from implementation

_Fill in: whether `buildingIds` needed to be added to the student claim (and the Cloud Function changes), whether the teacher directory query needed an additional index not captured in Phase 2, and any awkwardness splitting the announcements logic out of the overlay._

### Checkpoint 2 — after Phase 5

Re-read Phases 6–9. Verify:

- Does your `useStudentAssignments` return shape match what Phase 6's wire-up expects?
- Is the "active vs. completed" split cleanly derivable client-side, or does Phase 6 need a second subscription?
- Has the `buildingIds` claim plumbing landed? If yes, Phase 7's admin UI doesn't need to touch auth.
- Log confirmations in the **Checkpoint log** at the bottom.

---

## Phase 6 — Landing wire-up (refactor `MyAssignmentsPage.tsx`)

**Goal:** the refactor that makes the new experience real.

### Scope

- Rename the exported component inside `components/student/MyAssignmentsPage.tsx` to `StudentLandingPage`. Keep `MyAssignmentsPage` as a named alias export for one release (avoids churning the router + any external bookmarks).
- Body of the component becomes a thin composition:
  - Call `useOrgStudentPage(orgId)` (or whatever hook reads `StudentPageConfig`; confirm path).
  - Render the sections in `sectionOrder` (default: `['announcements', 'assignments', 'teacherDirectory']`).
  - Respect the existing `show*` flags (`showAnnouncements`, `showTeacherDirectory`); assignments section is always rendered (it's the backbone).
- Remove the old inline list/filter UI — that work now lives inside the section components.
- `accentColor` gets applied as a CSS variable at the landing root so section components can read it.

### Acceptance criteria

- SSO student lands on `/my-assignments` and sees:
  - Hero with `heroText` from org config.
  - Sections in `sectionOrder`, honoring `show*` visibility flags.
  - All existing assignment list behaviors still work (active + completed, dual-class query).
- PIN-flow students are completely unaffected (manual check: visit `/join`).
- No import of removed `useTestClassRosters` anywhere (defensive — the previous PR already removed that).

### Notes from implementation

_Fill in: the final `sectionOrder` default used, whether `useOrgStudentPage` already existed or had to be authored, and whether the `MyAssignmentsPage` alias had any import fan-out concerns._

---

## Phase 7 — Admin section-order UI

**Goal:** admins can reorder and toggle sections on the student landing from the org settings page.

### Scope

- Extend `components/admin/Organization/views/StudentPageView.tsx`:
  - Add a simple up/down reorder control for the three section keys (`announcements`, `assignments`, `teacherDirectory`). Numeric up/down buttons are fine — no drag-drop library needed.
  - Persist to `StudentPageConfig.sectionOrder`.
  - Update the preview mock at the top of the page to render in the chosen order so admins see their change without leaving.
- Keep the lunch toggle visible (but `showLunchMenu` still has no runtime consumer — that's fine).

### Acceptance criteria

- Reorder persists to Firestore, then reflects on the actual `/my-assignments` landing after refresh.
- Toggling `showAnnouncements` / `showTeacherDirectory` hides the corresponding section.
- Admin UI tests pass.

### Notes from implementation

_Fill in: UI pattern chosen (buttons vs. actual drag), any awkwardness reconciling the existing mockup preview with the real section-order logic._

---

## Phase 8 — `ResultsModal` + per-kind renderers _(checkpoint after)_

**Goal:** students can open a completed assignment and see their own submission + score, gated on `showResultToStudent`.

### Scope

- `components/student/ResultsModal.tsx`:
  - Props: `{ assignment, isOpen, onClose }`.
  - Switches on `assignment.kind`:
    - **`quiz`** — fetch `quiz_sessions/{id}/responses/{pseudonym}`. Render answered-question list with the student's selected answer and their final score. Do NOT render `correctAnswer` or any reveal flags.
    - **`video-activity`** — fetch response. Render the student's text responses keyed by step. Reuse rendering from `components/widgets/VideoActivityWidget/components/Results.tsx`, filtered to the pseudonym's doc only.
    - **`guided-learning`** — similar pattern; reuse `GuidedLearningResults.tsx` filtered.
    - **`activity-wall`** — render the student's own posts. Reuse the post card from the teacher gallery.
    - **`mini-app`** — **no case.** Skipped this PR. Completed mini-app cards do not render the "View results" CTA; just the "Completed" badge.
- Gate the "View results" CTA in `CompletedAssignmentsSection` on `assignment.showResultToStudent === true`.
- Each kind's renderer is a ~80-line subcomponent; no shared abstraction yet — that's over-engineering.

### Acceptance criteria

- Student sees "View results" CTA only for completed assignments the teacher has released.
- Clicking opens modal with their own data, styled consistently.
- Security rules (Phase 2) prevent reads when flag is false — verify with an E2E or manual test.
- Mini-app completed cards never show the CTA.

### Notes from implementation

_Fill in: which existing result components were reusable vs. had to be re-written, and any data-shape surprises per kind._

### Checkpoint 3 — after Phase 8

Re-read Phase 9. Verify:

- Are there i18n strings in the sections/modal that need to be registered?
- Is the roadmap doc entry accurate given what actually shipped?
- Any lingering `TODO` or `@deprecated` comments that should be resolved before PR?
- Log in the **Checkpoint log**.

---

## Phase 9 — Polish, i18n, roadmap

**Goal:** ship-ready PR.

### Scope

- i18n: audit `locales/` for all new user-visible strings (section titles, toggle labels, CTA labels, modal headers). Add keys and translations (at minimum English + whichever other locales are kept current).
- `non-code_roadmap.md`: add an entry under the current milestone summarizing what shipped.
- Run full test suite: `pnpm test` (unit), rules tests, any E2E that exists.
- Manual preview check against `dev-paul` config:
  - SSO student sees hero + sections.
  - Toggling admin flags reflects on refresh.
  - Results gate works end-to-end.
  - PIN flow unchanged.
- PR description: reference this doc, list the 9 phases as completed, call out the skipped mini-app results as explicit follow-up work.

### Acceptance criteria

- All tests green.
- No lint / typecheck errors.
- PR opens against `dev-paul` (not `main`).
- This doc's status list is fully checked and every phase has implementation notes.

---

## Open questions

_Add here any decision the plan doesn't cover. Ask the user before proceeding._

- (none yet)

---

## Checkpoint log

_Each checkpoint adds a dated entry. Format:_
`- YYYY-MM-DD (Phase N complete) — <one-line summary of what you reconciled and any plan edits made>`

- _(empty)_

---

## Out of scope (do not expand)

- Lunch menu student rendering.
- Modular widget grid framework on student side.
- Mini-app per-type results renderers.
- Per-building section ordering.
- Correct-answer reveal, peer comparison, or any results view beyond the student's own submission.
- Teacher directory fields beyond name + email.
- Rewriting the PIN-code live-session flow.
