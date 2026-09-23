# Per-period access for shared assignments

## The problem

A quiz assigned to four class periods is **one** `quiz_sessions/{id}` doc shared by all four
(`periodNames[]`, `classIds[]`, `rosterIds[]` on that doc — `types.ts:4268-4302`). Its status is
global: `setStatus()` in `hooks/useQuizAssignments.ts:1493` flips the assignment and the session
together. Starting the quiz in period 1 opens it for period 4 students too, wherever they are.

Three existing gaps make it worse:

- **Quiz pause is client-only.** The `quiz_sessions/{id}/responses` rules never read
  `session.status` (the block is `QuizStudentApp.tsx:1168`). Mini-app (`firestore.rules:4393`) and
  Flashcards (`firestore.rules:5188`) do check it.
- **Questions are readable before open.** `publicQuestions` sits on the session doc, and session
  reads are `allow read: if request.auth != null` (`firestore.rules:3496`). `openAt` gates response
  _creation_, not content.
- **There is no bell schedule.** The Schedule widget's admin building defaults
  (`feature_permissions/schedule.config.buildingDefaults`) are free-text items whose ids are
  regenerated on every copy (`utils/adminBuildingConfig.ts:640-649`), picked by weekday only.
  Rosters carry no period or meeting time.

## Decisions (settled in a design interview)

| #   | Decision                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Manual per-period start/pause, plus optional per-period windows that open and close automatically.                                                  |
| 2   | One mode choice at assign time: **In-class assessment** (every period closed until started) or **Assignment** (open now or on a window).            |
| 3   | Enforced in Firestore rules, not just the client.                                                                                                   |
| 4   | Closing or pausing mid-attempt freezes the student and keeps answers; resuming continues the attempt.                                               |
| 5   | The gate is keyed per targeted class (the `classIds` entry each roster contributes), not by period name.                                            |
| 6   | In-class assessment requires a verified identity (see _Verified identity_ below).                                                                   |
| 7   | Question content is hidden from a student until their period is open.                                                                               |
| 8   | Build a shared core; ship Quiz first, then Video Activity, then Guided Learning, Mini-app, Flashcards.                                              |
| 9   | Admins give building schedules stable period ids; teachers tag each roster to a period once; bell times fill windows. Custom times always override. |
| 10  | The monitor header gets a chip strip, one chip per period, replacing the single Pause button.                                                       |
| 11  | Assignment mode keeps one shared window; **Customize per period ▸** reveals per-period overrides.                                                   |
| 12  | A targeted roster with no verified identity is allowed but flagged on its chip.                                                                     |
| 13  | In assessment mode, Start opens a period until its end bell (+ the existing 120 s grace). One tap extends.                                          |
| 14  | Roster → period tagging is asked inline the first time it matters, and is editable in the roster editor.                                            |
| 15  | A building holds several named bell schedules; an admin (or the weekday default) picks the one for a date.                                          |
| 16  | A student in a closed period sees a locked card in My Assignments with no questions.                                                                |
| 17  | Sessions without per-period state behave exactly as today, except that quiz pause becomes rules-enforced for every quiz.                            |
| 18  | **Let in now** unlocks one student regardless of their period's state, defaulting to the current bell.                                              |
| 19  | Always on, no setup. Chips only render when a quiz targets more than one period.                                                                    |

Two details chosen without asking: bell times are resolved to epoch ms on the teacher's device (no
building timezone field exists or is needed), and a student in more than one targeted class gets in
if any of their periods is open.

### Verified identity

Decision 6 was framed as "require sign-in". The code already has a stronger PIN path than the
interview assumed: on rostered sessions the PIN join calls `pinLoginV1`
(`functions/src/studentIdentity.ts:1225`, `hooks/useQuizSession.ts:2107`), which matches the PIN
against the roster's `pin_index` server-side and mints `studentRole` plus `classIds: [classId]` —
the same claim shape SSO gets. A student cannot pass it for a period they are not rostered in.

So "verified" means **SSO or a `pinLoginV1`-bridged PIN**. What assessment mode turns off is only
the anonymous fallback (`pinLoginV1` no-match → `pin-{period}-{pin}` response key), whose
self-picked period no rule can check. Decision 12's flagged roster is one without a built
`pin_index` or ClassLink link. **Confirm this reading before implementation.**

## Data model

On the session (and mirrored on the assignment for the teacher's hub):

```ts
type PeriodAccessState = 'closed' | 'open' | 'paused';

interface PeriodAccess {
  state: PeriodAccessState;
  openAt: number | null;   // epoch ms; null = no scheduled open
  closeAt: number | null;  // epoch ms; bell end in assessment mode, window end in assignment mode
  bellPeriodId: string | null;
  verified: boolean;       // roster supports SSO or pinLoginV1
}

accessMode?: 'assessment' | 'assignment';          // absent = legacy global behaviour
periodAccess?: Record<string /* classId */, PeriodAccess>;
studentAccess?: Record<string /* uid */, number /* untilMs */>;  // "Let in now"
```

- Keyed by the same id the auth claim carries, so a rule can index it with `response.classId`,
  which the join already writes as the overlap of claim and session (`types.ts:4683-4691`).
- A period is effectively open when `state == 'open'` and `now` is inside `[openAt, closeAt]`
  with the existing grace helpers (`assignmentOpenGraceMs` / `assignmentCloseGraceMs`). Auto-close
  needs no Cloud Function: rules compare `request.time`, the client derives the chip state from the
  clock.
- A scheduled window in assignment mode is written as `state: 'open'` with a future `openAt`.
- `studentAccess` uids are the pseudonymous auth uids, the same ones already on response docs.

Question content moves to `quiz_sessions/{id}/content/questions` (same shape as
`publicQuestions` today) for sessions that have `periodAccess`. Legacy sessions keep
`publicQuestions` on the session.

## Rules

A shared helper, used by every session collection that adopts this:

```
function periodOpen(session, classId) {
  let pa = session.get('periodAccess', null);
  return pa == null ||
    (classId in pa &&
     pa[classId].state == 'open' &&
     (pa[classId].openAt == null || request.time.toMillis() >= pa[classId].openAt - assignmentOpenGraceMs()) &&
     (pa[classId].closeAt == null || request.time.toMillis() < pa[classId].closeAt + assignmentCloseGraceMs()));
}
function studentLetIn(session) {
  return session.get('studentAccess', {}).get(request.auth.uid, 0) > request.time.toMillis();
}
```

Quiz responses:

- **Create:** existing gates, plus `periodOpen(sessionData(), request.resource.data.classId) ||
studentLetIn(sessionData())`, plus `request.resource.data.classId in request.auth.token.classIds`
  when `periodAccess` exists. With `accessMode == 'assessment'`, reject the anonymous-key branch.
- **Update:** answer writes need the same check. Writes that must still land while frozen
  (`tabSwitchWarnings`, `handRaisedAt`, `resultsTab*`, `recordingNoticeAckedAt`, and the like) are
  split into an allowlist, as `isResultsProtectionOnlyWrite()` already does for close windows.
  **Audit every field the student app writes while paused before landing this.**
- **Global pause (decision 17):** answer writes also require `sessionData().status != 'paused'`
  on every session, legacy included, with the same allowlist.

Content doc `quiz_sessions/{id}/content/questions`:

- Teacher and admin read always.
- A student reads it only if `responses/{request.auth.uid}` exists and `periodOpen(session,
thatResponse.classId) || studentLetIn(session)`. That is two `get()`s per read, well under the
  limit. The join order becomes: create response (gated) → read content.

Rules tests in `tests/rules/` cover: each state × in-window/out-of-window/grace edge; wrong
classId; claim without the class; anonymous key in assessment mode; frozen allowlist writes;
legacy session unaffected except for pause; `studentAccess` expiry; content read before and after
open.

## Bell schedules

- `ScheduleItem` gains `periodId?: string` (stable, admin-assigned, **not** regenerated by
  `getAdminBuildingConfig`) and `isClassPeriod?: boolean`. The admin editor
  (`components/admin/ScheduleConfigurationPanel.tsx`) gets a "Class period" toggle per item.
  Period ids are shared across a building's schedules, so "P3" on the regular and early-release
  schedules is the same period with different times.
- `BuildingScheduleDefaults` gains `dateOverrides?: Record<'YYYY-MM-DD', scheduleId>`. The admin
  panel gets a small "Special days" list. Weekday selection (`resolveActiveSchedule`,
  `components/widgets/Schedule/utils.ts:264`) is the fallback; the Schedule widget adopts the same
  resolver so the board and the gate always agree.
- `ClassRosterMeta` gains `bellPeriod?: { buildingId: string; periodId: string }`.
- `utils/bellSchedule.ts`: `resolveBellWindow(buildingDefaults, bellPeriod, date)` →
  `{ openAt, closeAt } | null` in epoch ms from the browser's local clock. Pure and unit-tested.
  It becomes the shared "what period is it" helper the app lacks today.

## Teacher UI

**Assign modal** (`components/common/library/AssignTargetingSection.tsx`):

- Mode toggle next to Schedule: _In-class assessment_ / _Assignment_. It only renders once more
  than one period is targeted; a single period behaves as today.
- Assignment mode: today's Schedule picker is the shared window. **Customize per period ▸**
  expands one row per period: _Same as above_ / _Bell times_ / _Custom_.
- Any untagged roster used with bell times shows the inline one-line prompt
  "Which period is _Algebra – Blue_? [P1 … P7]", which writes `bellPeriod` to the roster.
- Assessment mode with an unverified roster shows the "PIN — not verified" note on that row.

**Monitor** (`components/widgets/QuizWidget/components/monitor/MonitorShell.tsx:293`):

- `PeriodAccessStrip` replaces the single Pause/Resume button when `periodAccess` exists: one chip
  per period, `P1 ● Live · P3 ○ Closed · P4 ⏱ 1:05`. Tap toggles start/pause. Starting an
  untagged period in assessment mode opens it with no `closeAt` and nudges the tag prompt.
- The chip's countdown menu offers **+10 min** and **Until I pause**.
- The overflow menu keeps **Pause all** / **Start all**.
- Student rows gain **Let in now** (until the current bell, or 30 min when untagged).

**Roster editor** (`components/widgets/Classes/RosterEditor.tsx`): a "Bell period" select.

## Student UI

- `QuizStudentApp`: a closed or paused period shows a locked screen ("Opens when your teacher
  starts it" / "Opens Tue 10:40"). A mid-attempt close freezes the attempt on the existing paused
  overlay; answers already saved stay saved.
- My Assignments (`hooks/useStudentAssignments.ts`): the card stays visible and locked, with the
  title only. The session doc (which the listing already reads) has `periodAccess`, so no extra
  reads are needed to render it.

## Shared core

- `utils/periodAccess.ts`: pure state resolution (`effectivePeriodState(access, now)`,
  `studentCanEnter(session, classIds, uid, now)`), used by teacher chips, student gate and hub.
- `hooks/usePeriodAccess.ts`: teacher writes (`startPeriod`, `pausePeriod`, `extendPeriod`,
  `startAll`, `pauseAll`, `letIn`), generic over the session and assignment collection pair so
  Video Activity reuses it unchanged.
- The rules helpers above live once near `passesStudentClassGateList` (`firestore.rules:64`).
- `components/assignmentsHub/useUnifiedAssignments.ts` summarises "2 of 4 periods live".

## Rollout

A merge to `dev-paul` ships **rules** to the shared production project while production browsers
still run `main`. Every phase must be safe against the older client.

1. **Rules + types, additive.** `periodOpen` is a no-op without `periodAccess`; the content doc
   rule is new. The global pause check is the one tightening. Before shipping it, confirm that
   production's client writes nothing but allowlisted fields while paused.
2. **Student side to `main`.** The student app reads content from the subdoc when present and
   falls back to `publicQuestions`; it renders the locked states and handles the frozen attempt.
   Nothing creates gated sessions yet.
3. **Bell schedule admin + roster tagging.** Independent of 1–2.
4. **Teacher side.** The assign-modal mode toggle, the chip strip and Let in now. Gated sessions
   only exist from here, after every student client can read them.
5. **Video Activity**, then Guided Learning, Mini-app and Flashcards (which gain pause as part of
   adopting this).

Each teacher-visible phase gets a `public/changelog.json` entry written for teachers.

## Open questions

- Confirm the _Verified identity_ reading of decision 6 above.
- Test classes and `schoology:<ctx>` entries in `classIds`: confirm that `pinLoginV1` and SSO mint
  the same id the session stores for every roster origin, or `periodAccess` keys will miss.
- PLC-shared sessions (`components/plc/assignments/PlcQuizSessionContent.tsx`): which teacher's
  bell schedule applies when colleagues share one session.
