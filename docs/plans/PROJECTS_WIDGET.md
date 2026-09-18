# Projects Widget — Implementation Plan

Status: design locked 2026-09-18. No code written.
Unblocked: the roster-groups foundation landed on `dev-paul` in
[#3119](https://github.com/OPS-PIvers/SpartBoard/pull/3119). `RandomGroup.studentIds?` exists and
`groupMaker.ts` populates it with `Student.id` in class mode, which is the handle D7/D8 need.

## 1. Problem statement

A teacher assigns one project to each of ~6 groups and wants two things at once:

1. **Group-owned tracking.** Each group updates its own progress through the project's steps.
   Members can edit their group and no other.
2. **A glanceable board face.** She looks up mid-class and sees where every group is, which step
   they're on, and who needs help — partly for her own triage, partly as positive peer pressure
   ("those groups are working").

The second problem she named is Schoology: she cannot assign one thing to one group, so a
six-group project becomes 26 individual assignments. Group-level work links, uploads and rubric
scoring exist in v1 to answer that directly — she grades six things, not 26.

Source: teacher interview, transcribed in the originating session. She explicitly does **not** need
per-student differentiation of the project itself, and named the rubric as "would be amazing,"
not required — it is in v1 anyway by decision D18.

## 2. Two findings that shaped the design

**Identity is derivable, and only for ClassLink students.**
`computeStudentUid(sourcedId, secret) = HMAC("sid:" + sourcedId)` — byte-identical to the
`pseudonym` stored in `RosterPinIndexEntry` that `pinLoginV1` mints against. A PIN login and a
Google SSO login therefore produce the _same_ uid for the same student. The binding constraint is
not which door the student uses; it is `Student.classLinkSourcedId`, which is `undefined` for
hand-typed roster rows. A hand-built roster can never have an enforceable student side.

The secret is server-side, so the client cannot compute member uids. Membership resolution must be
a teacher-only callable, mirroring `commitRosterPinIndexV1`.

**There is no server-side Drive credential.** `archiveActivityWallPhoto` receives an `accessToken`
from the _client_. Drive writes only happen while the teacher is signed in with a live token.
Student uploads must land in Firebase Storage and be archived to Drive later by the teacher's own
session. Any design that promises "the group's files are in your Drive the moment they upload" is
wrong.

## 3. Decisions (locked 2026-09-18)

### 3.1 Progress model

- **D1.** Progress lives **per step**, not per group. A group's position on the board is derived
  from its step states, so a group asking for help never loses its place on the bar.
- **D2.** `ProjectStepState` is `notStarted | inProgress | readyForReview | done`. Students may set
  any of the first three on any step. On a step marked `requiresApproval`, `readyForReview` is the
  student ceiling and only the teacher can set `done`.
- **D3.** `requiresApproval` is a **per-step** teacher setting, not a project-wide mode. Most steps
  self-serve; checkpoint steps gate.
- **D4.** `needsSupport` is a **group-level boolean**, independent of step state. It is an alarm,
  not a progress point. The teacher's five spoken statuses collapse into D2 + D4
  ("brainstorming" ≡ `inProgress`).

### 3.2 Identity and groups

- **D5.** Student access is **Google SSO only** (`/student/login` → `/my-assignments`). The PIN
  bridge is not wired up for Projects, matching the existing code comment preferring SSO over "the
  fork-prone anonymous PIN path."
- **D6.** Classes without ClassLink-sourced rosters get a **teacher-only tracker**: she moves the
  statuses herself, the student side is absent and the UI says so plainly. Not a degraded student
  mode — no student mode.
- **D7.** Groups are created by a **one-time snapshot import from the Group Maker widget**. The
  Group Maker must be in roster mode; a custom typed name list cannot resolve to students and is
  refused with an explanation.
- **D8.** Membership is resolved by `commitProjectGroupsV1` (teacher-only callable). The **client**
  resolves `RandomGroup.studentIds` (which hold `Student.id`) → `Student.classLinkSourcedId` from
  the loaded roster and sends the sourcedIds; the **function** applies the HMAC and writes
  `memberUids`. The split is forced: the roster's student list lives in the teacher's Drive file,
  not Firestore, so a function cannot read it, while the HMAC secret is server-side only and a
  client cannot compute the uid. Students with no `classLinkSourcedId` never leave the client and
  are named in the import dialog.
- **D9.** Re-importing from Group Maker **creates a new group set**; it never overwrites a running
  one. A reshuffle cannot silently destroy tracked work.
- **D10.** The teacher can **edit membership in place** on a running project. Moving a student
  changes who may edit; it never moves step states, links or files.
- **D11.** Group names default to `Group 1..N`. Carrying the Group Maker's own names across is
  **opt-in**, per #3114's rule that a group name must never reach a projected face by default.

### 3.3 Structure and reuse

- **D12.** A **project library** lives at `/users/{uid}/projects/{projectId}` — reusable definitions
  (title, steps, rubric), archivable, editable after launch.
- **D13.** Each project has **exactly one run**, holding every section's groups. Each group carries
  its own `classId`.
- **D14.** The board face renders only the groups whose `classId` matches the **globally active
  roster** (`activeRosterId` in `DashboardContext`). Switching class switches the board. No
  per-board class binding is introduced.
- **D15.** A Projects widget points at **one** project, chosen from the library by a dropdown. It
  never stacks multiple projects on one face.
- **D16.** Step authoring is **one line per step** in a single textarea — paste seven lines and go.
  Descriptions, per-step due dates and `requiresApproval` are progressive disclosure behind a click
  on the step. No AI generation, no starter templates in v1.
- **D17.** A project is an **assignment** on `/my-assignments` with an optional window. It **never
  auto-completes**: all steps `done` does not move it to Completed. Only the teacher closing it
  (`acceptingUpdates: false`) does.

### 3.4 Work, scoring, accountability

- **D18.** v1 ships tracker **+ group work link + uploads + rubric scoring with per-student
  override**.
- **D19.** Files attach to a **group-level folder**, with optional per-step tagging so
  "ready for review" on step 4 can point at something specific.
- **D20.** Uploads follow the Activity Wall pipeline: Firebase Storage first, Drive archive later
  from the teacher's session (see §2). The widget shows archive state honestly rather than
  pretending the file is already in Drive.
- **D21.** The rubric is **student-visible on demand** — a button on the student project page pops
  it open read-only. It is not hidden until scored.
- **D22.** Teacher grading **mirrors the quiz free-response grader**, so there is no second grading
  interface to learn: the `FreeResponseGrader` queue shell (walk one subject at a time, autosave on
  advance, prev/next, pin/skip) with the queue walking **groups**, and `RubricScoringPanel` dropped
  in unchanged. Per-member override rows sit beneath the panel.
- **D23.** Scores **fan out to every member** and support **per-student override**, so a group grade
  can publish per student while still allowing an individual adjustment.
- **D24.** Every state change, upload and membership edit stamps **actor uid + timestamp** into a
  per-group event log. **Teacher-visible only** — never shown to students. It exists so a
  per-student override has something to rest on.

### 3.5 Board face and control

- **D25.** Layout is **one row per group**: name, a segmented bar with one segment per step colored
  by state, and flag chips. Groups with `needsSupport` sort to the top with a colored edge.
- **D26.** Comfortable ceiling is **8 groups × 8 steps**; beyond that the face degrades to counts
  rather than trying to render everything.
- **D27.** She gets the **show/hide status toggle** she asked for on the board face.
- **D28.** The front face is **fully interactive** for the teacher: set any group's step state, clear
  a help flag, open a group. Teacher edits are attributed to her in the event log so they never
  read as student actions.
- **D29.** `needsSupport` escalates **on the board face only** — no toast, no sound, no cross-board
  notification. She said she would be looking up at the board; that is the channel.
- **D30.** Students **see every group's progress, edit only their own.** The projected board already
  shows everyone, and the peer pressure she wants requires visibility.

## 4. Assumptions derived, not asked — confirm before building

- **A1.** `readyForReview` was originally framed as a group-level flag alongside `needsSupport`, then
  the per-step-approval decision (D3) made it a step state. Reconciled as D2: it is a step state
  available on every step, and the student ceiling only on approval steps. This was my reconciliation,
  not Paul's explicit answer.
- **A2.** Grades live in a **sibling doc** (`grades/{groupId}`), not on the group doc, with a
  `released` flag — otherwise a member reading their own group doc reads an unreleased score. Paul
  said when students see the _rubric_, not when they see the _score_.
- **A3.** Student gating reads the **group doc's own `classId`**, never a `get()` on the parent run,
  to avoid a rules-side document read on every group read.
- **A4.** Per-student override is stored as an **absolute point value plus a note**, not a delta.
- **A5.** The Group Maker → Projects handoff is a **push from Group Maker** ("Send to Projects"),
  not a pull from a Projects picker. Cheaper to discover, matches how Stations import reads in #3114.
- **A6.** `FreeResponseGrader`'s queue shell is **mirrored, not extracted**. Extracting a shared
  shell touches the quiz grading hot path for no user-visible gain; revisit if a third grader appears.
- **A7.** Project-level `dueAt` feeds the `/my-assignments` window; per-step `dueAt` is display-only
  and drives no gating.
- **A8.** One Projects widget per board. Two widgets pointed at the same project on one board is
  allowed but untested.

## 5. Data model

### 5.1 Types (`types.ts`)

```ts
export type ProjectStepState =
  | 'notStarted'
  | 'inProgress'
  | 'readyForReview'
  | 'done';

export interface ProjectStep {
  id: string;
  title: string;
  description?: string;
  dueAt?: number;
  /** Students stop at `readyForReview`; only the teacher sets `done`. */
  requiresApproval?: boolean;
}

/** Library entry — `/users/{uid}/projects/{projectId}`. */
export interface ProjectDefinition {
  id: string;
  title: string;
  description?: string;
  steps: ProjectStep[];
  rubric?: Rubric;
  rubricMaxPoints?: number;
  dueAt?: number;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
}

/** `/project_runs/{runId}`, runId = `${teacherUid}_${projectId}`. */
export interface ProjectRun {
  id: string;
  projectId: string;
  teacherUid: string;
  title: string;
  steps: ProjectStep[];
  rubric?: Rubric;
  rubricMaxPoints?: number;
  dueAt?: number;
  /** Every ClassLink sourcedId with at least one group in this run. */
  classIds: string[];
  showStatusToStudents: boolean;
  acceptingUpdates: boolean;
  updatedAt: number;
}

/** `/project_runs/{runId}/groups/{groupId}`. */
export interface ProjectGroup {
  id: string;
  name: string;
  /** Section this group belongs to. Gates student reads without a parent get(). */
  classId: string;
  memberUids: string[];
  order: number;
  stepStates: Record<string, ProjectStepState>;
  needsSupport: boolean;
  workLinks: ProjectWorkLink[];
  /** Populated once the teacher's session archives uploads to Drive. */
  driveFolderId?: string;
  updatedAt: number;
}

export interface ProjectWorkLink {
  id: string;
  url: string;
  label?: string;
  stepId?: string;
  addedByUid: string;
  addedAt: number;
}

/** `/project_runs/{runId}/groups/{groupId}/events/{eventId}` — teacher read only. */
export interface ProjectGroupEvent {
  id: string;
  at: number;
  actorUid: string;
  actorRole: 'student' | 'teacher';
  kind: 'stepState' | 'needsSupport' | 'workLink' | 'upload' | 'membership';
  stepId?: string;
  from?: ProjectStepState;
  to?: ProjectStepState;
  detail?: string;
}

/** `/project_runs/{runId}/grades/{groupId}` — members read only when released. */
export interface ProjectGroupGrade {
  groupId: string;
  rubricScores: WrittenAnswerRubricScore[];
  points: number;
  maxPoints: number;
  comment?: string;
  released: boolean;
  gradedAt: number;
  /** Absolute per-member points + note, keyed by member uid (A4). */
  overridesByUid?: Record<string, { points: number; note?: string }>;
}
```

### 5.2 Rules shape (`firestore.rules`)

A doc per group is **required**, not preferred: rules cannot gate a partial write to an array inside
a single run doc, so "edit only my group" is unenforceable in a one-doc design. It also removes
write contention when six groups update simultaneously.

```
match /project_runs/{runId} {
  allow read:  if isOwner(resource.data.teacherUid)
               || passesStudentClassGate(resource.data.classIds);
  allow write: if isOwner(resource.data.teacherUid);

  match /groups/{groupId} {
    // A3: gate on the group's own classId, no parent get().
    allow read:   if isTeacherOfRun() || passesStudentClassGate([resource.data.classId]);
    allow update: if isTeacherOfRun()
                  || (request.auth.uid in resource.data.memberUids
                      && onlyStudentEditableProjectFields()
                      && runAcceptingUpdates());
    allow create, delete: if isTeacherOfRun();
  }

  match /groups/{groupId}/events/{eventId} { allow read: if isTeacherOfRun(); }
  match /grades/{groupId} {
    allow read: if isTeacherOfRun()
                || (resource.data.released == true && isMemberOfGroup(groupId));
    allow write: if isTeacherOfRun();
  }
}
```

`onlyStudentEditableProjectFields()` allows `stepStates`, `needsSupport`, `workLinks`, `updatedAt`
and nothing else — notably not `memberUids`, `name` or `classId`. Approval steps additionally reject
a student transition into `done`.

Watch the **256 KiB stripped-rules cap** (comments are stripped at deploy; ~110 KB headroom today).
Validate with the Firebase MCP rules validator before pushing.

### 5.3 Cloud Functions

- `commitProjectGroupsV1` — teacher-only. Input: runId + group definitions carrying
  `classLinkSourcedId`s the client already resolved from the Drive-loaded roster (D8). Applies
  `computeStudentUid` and writes the group docs. It cannot resolve students itself — the roster is
  in Drive, not Firestore.
- Upload archiving reuses the existing Activity Wall Storage → Drive path; no new Drive function.

## 6. UI

**Board face.** Rows of `name · segmented bar · flags`, help-flagged rows sorted to the top with a
colored edge, filtered to the active roster (D14). Show/hide status toggle (D27). Teacher-interactive
(D28).

**Back face / teacher.** Project picker, step authoring textarea (D16), group import from Group
Maker, membership editor, group drill-down (files, links, event log), and the grader (D22).

**Student page.** Reached from `/my-assignments`. Own group editable, all groups visible read-only
(D30), rubric button (D21), work link + upload, `needsSupport` toggle.

## 7. Delivery — 4 stacked PRs into `dev-paul`

Everything behind `admin_settings/projects_widget`, **shipped disabled**, with an admin-panel toggle
in the same PR that introduces the flag (never a Firestore hand-edit). Widget registration follows
the `new-widget` skill: `types.ts` `WidgetType`, `config/tools.ts`, `config/widgetDefaults.ts`,
`config/widgetGradeLevels.ts`, `components/widgets/WidgetRegistry.ts`.

1. **Foundation** — types, project library CRUD, run/group/grade/event docs, `firestore.rules`,
   `commitProjectGroupsV1`, indexes, admin flag + toggle, feature-permission entry.
2. **Board face + teacher control** — widget registration, row layout, active-class filtering,
   step authoring, Group Maker import, membership editing.
3. **Student page + work** — `/my-assignments` entry, student project page, work links, Storage
   uploads and Drive archive wiring.
4. **Grading** — group grader mirroring `FreeResponseGrader`, `RubricScoringPanel` reuse, per-student
   overrides, release, event log surfacing.

## 8. Out of scope (v1)

PLC sharing of projects; gradebook/Schoology push; peer evaluation; student-visible attribution;
cross-period comparison view; AI-generated steps; starter step templates; per-group differentiated
projects (all groups in a run share one project); group comments/chat; PIN-bridge student access.
