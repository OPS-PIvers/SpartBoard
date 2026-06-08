# Handoff — "Assign to Google Classroom" Phase 2 + due-date time picker

**Date:** 2026-06-05 · **Status of Phase 1:** SHIPPED to prod, live **admin-only**, Spike A passed (coursework + due **date** push correctly).
**This doc covers four follow-on work items (A, B, C, D).** It does not re-explain the feature — read these first:

- Design + implementation status: [`docs/assign-from-spartboard-to-lms-feasibility.md`](./assign-from-spartboard-to-lms-feasibility.md) (esp. **§7 Implementation status**).
- Memory: `project_assign_from_spartboard_to_lms` (shipped state, gotchas), `knowledge_ci_eslint_oom`.
- Shipped PRs: [#1880](https://github.com/OPS-PIvers/SpartBoard/pull/1880) (feature, admin-gated), [#1881](https://github.com/OPS-PIvers/SpartBoard/pull/1881) (403 verify fix).

## Hard constraints (carry forward — see memory for full detail)

- **Cannot live-test locally** — add-on/Classroom launches only reach **prod** (`TOOL_ORIGIN`/`ALLOWED_ORIGINS` hardcoded). Prove changes with unit tests + tsc/lint; verify behavior only after a prod deploy.
- **Flag gates:** `config/constants.ts` → `CLASSROOM_ASSIGN_ENABLED = true`, `CLASSROOM_ASSIGN_ADMIN_ONLY = true` (admin-only during rollout; widen = flip ADMIN_ONLY to `false`).
- **Ship flow:** feature → `dev-paul` (squash OK) → `main` via **regular merge commit, never squash**; CI owns the deploy (don't hand-deploy). CI `lint` step needs the `NODE_OPTIONS=--max-old-space-size=6144` heap bump (already in the 3 workflows — keep it).
- **Don't break Schoology LTI** (`functions/src/lti/*`, `LtiDeepLinkPicker`) — untouched so far.

---

## Item A — Due-date **time** picker (small, do first)

**Confirmed in Spike A:** the due **date** pushes to Classroom correctly. **The time is wrong:** to make a due date show as `6:59pm` Central the teacher currently has to think in UTC, because the server **hardcodes the time to 23:59 UTC**.

- Cause: `dueAtToClassroomDue(dueAtMs)` in [`functions/src/classroomAddonAuth.ts`](../functions/src/classroomAddonAuth.ts) returns `dueTime: { hours: 23, minutes: 59 }` (a deliberate Phase-1 choice to avoid a "day-early" roll for **date-only** input — `<input type="date">` yields UTC-midnight). Classroom stores `dueDate`/`dueTime` as **UTC** and renders in the viewer's local TZ → 23:59 UTC = 18:59 CDT.

**Desired:** wherever the assignment setup has a **date** picker, add a **time** picker too, and let the chosen time pass through to Classroom.

**Implementation sketch:**

1. UI: add `<input type="time">` next to the existing `<input type="date">`. Combine date + time into a **single local-datetime epoch** (`new Date(\`${date}T${time}\`).getTime()` — local TZ). Date pickers live in:
   - [`components/widgets/QuizWidget/components/QuizAssignmentSettingsModal.tsx`](../components/widgets/QuizWidget/components/QuizAssignmentSettingsModal.tsx) (`epochToDateInputValue`, the `dueAt` input).
   - [`components/classroomAddon/AssignToClassroomModal.tsx`](../components/classroomAddon/AssignToClassroomModal.tsx) (the GC assign modal's own date input).
   - VA equivalent if/when VA gets a settings modal (none today).
2. Server: change `dueAtToClassroomDue` to emit the **actual** UTC time-of-day from the epoch (`d.getUTCHours()/getUTCMinutes()`) instead of the hardcoded 23:59. Because the epoch now encodes the teacher's chosen _local_ datetime, its UTC components round-trip back to the teacher's local time in Classroom's display. **Backward-compat:** when no time is set (legacy date-only = UTC midnight), keep an end-of-day default so it doesn't roll to the prior evening — e.g. detect "midnight UTC" and fall back to 23:59, or default the time picker to a sensible hour (e.g. 11:59 PM **local**).
3. Update the `dueAtToClassroomDue` unit tests in `functions/src/classroomAddonAuth.test.ts` (currently assert the hardcoded `{hours:23,minutes:59}`).

> Note: SpartBoard is **Orono-only (US-Central)**; a "local datetime epoch → UTC components" round-trip is correct for any single-TZ teacher. Keep the existing comment's TZ reasoning in sync.

---

## Item B — Phase 2: move the entry point to the library-row **Assign** chooser

**Goal (Paul's words):** on a **quiz library row**, the **Assign** button opens a destination chooser:

```
Assign ▸   SpartBoard Only   |   Schoology   |   Google Classroom
```

- **SpartBoard Only** → today's assign flow, unchanged (class/period/PLC/due date → `useQuizAssignments.createAssignment`).
- **Google Classroom** → create the SpartBoard assignment first (so it has a join code + session id), **then** run the partner-first GC assign (course picker + due date → `assignToClassroomV1`). **Reuse everything from Phase 1** — `AssignToClassroomModal`, `utils/assignToClassroom.ts`, the CF. Just re-point the trigger and feed it the freshly-created assignment's `sessionId`/`code`.
- **Schoology** → an **instructional modal only** (embedded LTI assign is _not_ API-creatable — Option A in the feasibility doc): "In Schoology → open your course → **Add Materials → SpartBoard** → pick this quiz," with a screenshot/diagram.

**Integration points (quiz):**

- Library-row Assign trigger + modal host: [`components/widgets/QuizWidget/components/QuizManager.tsx`](../components/widgets/QuizWidget/components/QuizManager.tsx) — `assignTarget` state (`~:506`), `onAssign` prop (`~:220/460`), `AssignModal` from `@/components/common/library`.
- The handler that actually creates the SpartBoard assignment: [`components/widgets/QuizWidget/Widget.tsx`](../components/widgets/QuizWidget/Widget.tsx) `onAssign={async (...) => ...}` (`~:1077`).
- The current GC entry point (kebab on archive/active assignment rows) + modal host live in `Widget.tsx` (`assigningToClassroom` state `~:223`, render `~:1998`) and `QuizManager` (`onArchiveAssignToClassroom` action). See question 2 below.

**Approach:** intercept the library-row Assign click to show the chooser BEFORE the existing `AssignModal`. SpartBoard Only → current `AssignModal` path. Google Classroom → run the create-assignment path, then open `AssignToClassroomModal` with the new `sessionId`/`code`. Schoology → render a new instructional modal.

### 3 decisions needed from Paul before building Item B

1. **Schoology how-to content** — provide a real screenshot to embed, or build a clean step-by-step illustrated guide (numbered steps + simple Add-Materials diagram) as a swappable placeholder?
2. **Existing kebab "Assign to Google Classroom"** (on already-created assignment rows) — **remove** it now that the library-row chooser exists, or **keep both** (so an existing assignment can still be pushed to Classroom after the fact)?
3. **Scope** — quiz library only (as stated), or also wire the chooser into the **video-activity** library? (VA reuses the same CF/modal via `kind: 'va'`.)

---

## Item C — "Publish = Push": one action publishes scores **and** pushes to the LMS

**Requirement (Paul):** Clicking **"Publish Scores"** — at _every_ surface it appears (the assignment-archive kebab **and** the results/grading view) — must, in the **same action**, ALSO push grades to whatever LMS the assignment is linked to. The teacher should **never** have to click "Publish Scores" and then separately "Push grades" — that second step gets forgotten. Applies to **Google Classroom AND Schoology**, for **both quiz and video activity**. "Publish = Push."

**Behavior:**

- Assignment has a `classroomAttachment` (Google Classroom) → after the SpartBoard publish, also run the Classroom grade push.
- Assignment is LTI/Schoology-linked → also run the Schoology/AGS push.
- Non-LMS assignment → publish only (unchanged).
- The two systems are independent: a **push failure must NOT roll back the SpartBoard publish** — report partial success clearly ("Scores published; couldn't reach Classroom — retry" + a retry affordance).

**Integration points (reuse, don't rebuild):**

- Publish UI/host: `components/common/library/PublishScoresModal.tsx`; `onConfirm` handlers calling `publishAssignmentScores` in [`components/widgets/QuizWidget/Widget.tsx`](../components/widgets/QuizWidget/Widget.tsx) (`~:1908`) and [`components/widgets/VideoActivityWidget/Widget.tsx`](../components/widgets/VideoActivityWidget/Widget.tsx) (`~:873`). Chain the push after a successful publish.
- Classroom push (existing): `utils/runClassroomGradePush.ts` + `utils/classroomGradePush.ts` → `pushClassroomGradesForAssignment` CF; token via `requestClassroomTeacherToken` (`components/classroomAddon/gisOAuth.ts`). Today wired as the standalone "Push grades" button in `QuizResults.tsx` (`~:1094`) / VA `Results.tsx` (`~:287`) — gated on `session.classroomAttachment`.
- Schoology push (existing): `ltiPushGradesForAssignmentV1` (`functions/src/lti/serviceEndpoints.ts`) + its client caller.
- The standalone "Push grades" buttons can stay as a manual **re-push**, or be removed once Publish auto-pushes (decision).

**Decisions / gotchas to resolve when building C:**

1. **Token popup (Classroom):** the Classroom push needs a fresh `classroom.addons.teacher` token via a GIS popup — must fire from the Publish **click** (a user gesture). Handle dismissal gracefully (publish already succeeded; offer retry). The Schoology AGS push is server-side (no popup).
2. **Draft vs final grade — IMPORTANT.** Confirmed this session (logs + code): today's Classroom push only sets a **DRAFT** grade (`pointsEarned` on the add-on submission, `updateMask=pointsEarned`); it never sets `assignedGrade` or "returns" the work, so values don't become official gradebook grades until the teacher **Returns** them in Classroom (and a draft can't override an already-returned grade — order matters). Since **"Publish" implies finalizing**, C should likely push **FINAL** grades, not drafts. For **partner-first** GC coursework SpartBoard owns the courseWork and holds `classroom.coursework.students`, so it _can_ `courses.courseWork.studentSubmissions.patch` (draftGrade+assignedGrade) + `.return` to land them directly in the gradebook. Schoology AGS already posts the final score (no draft concept). **Confirm with Paul: make Publish push final/returned grades?** (Recommended — otherwise "Publish" still leaves a hidden manual Return step in Classroom.)
3. **Idempotency:** re-publishing re-pushes (overwrites) — confirm desired (likely yes).

## Item D — Unify class/period selection across SpartBoard ↔ LMS (kill the double-pick); add Schoology↔ClassLink linking

**Problem (Paul):** The teacher selects classes/periods **when creating the assignment** (SpartBoard targeting), then has to pick classes/courses **again** when assigning to Google Classroom. They should already be linked. Same will be true for Schoology. **The class/period selectors must be unified so there's no redundancy — one selection drives the SpartBoard assignment AND the LMS target — while still letting multiple class periods show up filterable in the monitor + results views.**

**Today's model:**

- **SpartBoard assignment targeting** (set at create time): `classIds` (ClassLink class `sourcedId`s), `periodNames`, `classPeriodByClassId`, `rosterIds` — see `hooks/useQuizAssignments.ts` / `hooks/useVideoActivityAssignments.ts` `createAssignment` and `types.ts`.
- **GC ↔ ClassLink link:** `classroom_course_links/{googleCourseId}` = `{ classlinkClassId, classlinkOrgId, teacherUid }` (interface `CourseLink` in `functions/src/classroomAddonAuth.ts`). Written by **SidebarClasses** "Link to Google Classroom" (`components/layout/sidebar/SidebarClasses.tsx` → `linkClassroomCourse`). `classroomAddonLoginV1`'s student-identity bridge already keys names off `classlinkClassId`.
- **Schoology:** **NO equivalent link exists.** LTI launches carry the section (`context_id`) and NRPS resolves names on read (`knowledge_lti_nrps_name_resolution`), but there is no stored ClassLink↔section mapping.

**The redundancy / the gap:**

- My `assignToClassroomV1` flow's `ensureCourseLinkForTeacher` only writes **`teacherUid`** (for grade-push auth) — it does **NOT** set `classlinkClassId`. So a course assigned via the new flow has _no_ roster link, and the assign modal re-asks for a course that should have been derivable from the assignment's already-selected ClassLink class.

**Direction (GC):** drive the Classroom target **from the assignment's selected ClassLink class(es)** via a reverse lookup on `classroom_course_links` (`classlinkClassId → googleCourseId`). If linked → auto-target that course (no re-pick). Multiple selected classes → multiple courses (true multi-period assign). An **unlinked** class → an inline "link this class to a Classroom course" step (reuse the SidebarClasses linking UX), then proceed. The `AssignToClassroomModal` standalone course picker becomes the **first-time-link / fallback** path, not the default.

**Direction (Schoology — NEW, the bigger lift):** add a `classroom_course_links`-style mapping for Schoology — e.g. `lti_course_links/{contextId}` = `{ classlinkClassId, classlinkOrgId, teacherUid, ...schoologyIds }` — so a SpartBoard ClassLink class resolves to a Schoology section (and back). Confirm the stable key from the LTI launch (likely `context_id`; check `functions/src/lti/launchEndpoints.ts` / `config.ts` for what's available) and how the teacher establishes the link (a "Link to Schoology" action mirroring SidebarClasses, or auto-capture on first LTI launch). This unblocks: deriving the Schoology target from the SpartBoard class, and per-period grade routing.

**Cardinality / decisions:**

1. One ClassLink class ↔ one LMS course **per teacher**? (Co-teachers, cross-listed sections.) Define it.
2. Should the assign flow **establish** the full link (`classlinkClassId`, not just `teacherUid`) so future assigns are zero-pick, or keep linking in Sidebar and have assign **consume** it? (Recommend: assign establishes it when missing.)
3. **Multi-period filtering:** ensure a multi-class/multi-course assign preserves `periodNames` / `classPeriodByClassId` so the **monitor + results views stay filterable by period** (the actual end goal). Verify the monitor/results filter UIs read these.

**Related memory:** `knowledge_lti_classroom_parity` (LTI session denormalizes section → `periodNames`/`classPeriodByClassId`), `knowledge_lti_nrps_name_resolution`, `project_classroom_addon_derisk_go` (ClassLink bridge).

## Suggested skills for the next session

- **superpowers:test-driven-development** — for the `dueAtToClassroomDue` change and any new CF logic (the repo's CF tests are the only correctness proof since prod-only).
- **superpowers:verification-before-completion** — gate "done" on real CI-green + a prod deploy + a Spike check, not local assertions.
- The repo's **`/ship`**-style flow is already established here: commit → `dev-paul` → PR → watch CI → regular-merge to `main` → watch prod deploy.
- Skip heavyweight brainstorming (Paul's stated preference): diagnose + propose tightly inline → quick approval → implement.
