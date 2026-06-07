# Design — Item D part 2: unify class ↔ LMS course (kill the double-pick)

**Status:** Design / not yet built. **Author context:** follows
[`classroom-assign-phase2-handoff.md`](./classroom-assign-phase2-handoff.md)
Item D. Part 1 (assign establishes the ClassLink↔Google-course link) shipped on
the Phase-2 branch; this doc specs **part 2** — the teacher-facing linking flow,
Google Classroom auto-fan-out, and the **new Schoology↔ClassLink mapping**.

---

## 1. The problem, in teacher terms

A teacher imports their classes from **ClassLink** (Periods 1–4). They also use
an LMS — **Google Classroom** and/or **Schoology** — where the _same_ students
live under the LMS's own course ids. Today the teacher picks their classes when
creating a SpartBoard assignment, then picks the LMS course **again** when
pushing to the LMS. That redundancy is the pain.

**Goal:** one selection drives both. The teacher links each class to its LMS
course **once**; thereafter they create **one** SpartBoard assignment, target
their classes the way they already do, and SpartBoard routes to the right LMS
course(s) and gradebook(s) automatically — while the monitor + results stay
filterable by period.

Two experiences to get right:

- **Link once** — and make it near-zero effort, not a chore per class.
- **Assign once** — one assignment fans out to all targeted classes; grades land
  in each linked class's own LMS gradebook column.

---

## 2. The hard constraint that shapes the Schoology design

**Google Classroom has a "list my courses" API; Schoology does not.** SpartBoard
can enumerate a teacher's Google courses on demand (it already does in
`AssignToClassroomModal`/`SidebarClasses`). For Schoology, the tool only ever
"meets" a course when **someone launches into it** over LTI — there is no way to
list a teacher's Schoology sections up front.

Consequence: the Schoology side of a link **cannot** be established purely from
SpartBoard. SpartBoard must first **see** a Schoology section (via a launch),
then the teacher pairs it to a ClassLink class. The "seeing" is passive (it
happens as SpartBoard is used in that course); only the **pairing** is an action.

This is why the two LMS get different fan-out stories (§5).

---

## 3. Today's building blocks (what already exists)

| Concern                                 | Google Classroom                                                                                                                                                                                                                                                                    | Schoology (LTI 1.3)                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Class→course link doc                   | `classroom_course_links/{googleCourseId}` = `{ classlinkClassId, classlinkOrgId, teacherUid, rosterId }` (server-write-only, `firestore.rules:669`). Written by SidebarClasses "Link to Google Classroom" → `linkClassroomCourse` CF, and (part 1) filled by `assignToClassroomV1`. | `lti_course_links/{contextId}` — **rules home already exists** (`firestore.rules:701`, server-write-only) as "context → linking-teacher map," but currently records only the linking teacher for AGS gating. **No `classlinkClassId` yet.**                                                                                                                                    |
| Section/course identity captured at use | The course id is chosen by the teacher from the API list.                                                                                                                                                                                                                           | The launch carries `context_id`, the **section title/label**, `resource_link_id`, the **NRPS** roster URL, and the **AGS** line item. Stored in `lti_session_memberships/{sessionId}/contexts/{contextId}` and mirrored onto the session (`ltiAttachment`, `classPeriodByClassId['schoology:<ctx>'] = <title>`) — see `functions/src/lti/nrpsStore.ts` / `launchEndpoints.ts`. |
| Name resolution                         | `classroomAddonLoginV1` bridges via `classlinkClassId` → OneRoster roster.                                                                                                                                                                                                          | NRPS resolves names **on read** (`ltiResolveNamesForAssignmentV1`); `nrps.ts` surfaces **name only, no email**.                                                                                                                                                                                                                                                                |
| Grade push                              | `pushClassroomGradesForAssignment` (draft) / `pushClassroomFinalGradesForAssignment` (final).                                                                                                                                                                                       | `ltiPushGradesForAssignmentV1` → AGS, per-student line item from `lti_grade_links/{pseudonymUid}/resources/{resourceLinkId}`.                                                                                                                                                                                                                                                  |

SpartBoard models an LMS class in a namespace: ClassLink class = `<sourcedId>`;
Google = `classroom:<courseId>`; Schoology = `schoology:<contextId>`. Item D
unifies these so one ClassLink class drives the LMS-namespaced targets.

---

## 4. Link once — the auto-match + one-confirm flow

### 4.1 Capture (passive, automatic)

Already largely in place for Schoology: on **any** launch (teacher or student),
the launch-exchange CF records the context (`contextId`, section title, NRPS URL,
AGS endpoints, `resourceLinkId`) and the owning `teacherUid`. **Extend** this to
maintain a per-teacher inventory of "Schoology sections seen but not yet linked"
(derivable from `lti_course_links`/`lti_session_memberships`, keyed by teacher).

For Google Classroom no capture is needed — the course list is an API call.

### 4.2 Suggest (best-effort auto-match)

When presenting unlinked sections/courses, **pre-select** the matching ClassLink
class so the teacher usually just confirms:

- **Match key — email when available.** A ClassLink roster student carries
  `email` + `sourcedId` (`types.ts` `Student`). Match a Schoology section to the
  ClassLink class whose roster has the **highest student-email overlap**.
  - ⚠️ **Dependency:** NRPS today returns **name only** (`nrps.ts` `NrpsMember`,
    deliberate PII minimization). Email-based matching requires (a) Schoology's
    NRPS config to **release email**, and (b) extending the NRPS client to read
    `email` **transiently for matching only** (never persisted, same rule as
    names). If email isn't released, fall back to name overlap (weaker) or no
    pre-selection.
- **High-confidence ⇒ silent auto-link.** Unique, near-total overlap (e.g. ≥ a
  threshold and unambiguous) → link automatically and _show_ it ("Linked Period 1
  ↔ Algebra 1 · P1 — change?"). Low/ambiguous overlap (co-taught, cross-listed) →
  ask.
- **Always recognizable.** Show the captured **section title** so the teacher can
  pick correctly even with zero match signal — the title alone makes the manual
  case one click.

### 4.3 Confirm (one screen, not N prompts)

Two equivalent entry points (build both):

1. **Prompt after the teacher's own launch:** "You opened SpartBoard in _Algebra
   1 · P1_. Which of your classes is this?" → pick → done.
2. **SidebarClasses, alongside "Link to Google Classroom":** the teacher's
   classes list shows each class's link state. A "Link to Schoology" affordance
   opens a **single review screen** listing all detected-but-unlinked sections
   with their pre-matched class, checkboxes, and one **Confirm all**. An unlinked
   class with no seen section shows: "Open SpartBoard in that Schoology course
   once, then it'll appear here."

Net effort: **zero-to-one click, once, ever** — never per assignment.

### 4.4 Cardinality (decision — recommend)

**One ClassLink class ↔ one LMS course, per teacher.** The link doc is keyed by
the LMS id (`courseId`/`contextId`) and owns one `classlinkClassId` + `teacherUid`.
Co-teachers each hold their own link (the no-hijack guard already prevents one
teacher overwriting another's). Cross-listed/merged sections (one Schoology
course = two ClassLink classes) are **out of scope for v1** — surface them as
"can't auto-match, pick one" rather than silently guessing. (This is also why
part 1 deliberately refuses to capture `classlinkClassId` for a _multi-section_
SpartBoard assignment.)

---

## 5. Assign once — fan-out

The teacher creates **one** SpartBoard assignment and targets classes as today
(`classIds` / `periodNames` / `classPeriodByClassId` preserved → monitor +
results stay filterable by period). Then:

### 5.1 Google Classroom

**Phase 1 — single-class auto-target (SHIPPED).** Reverse-lookup the targeted
ClassLink class(es) → linked Google course (`classlinkClassId → googleCourseId`
over `classroom_course_links`; single-field `where('classlinkClassId','in',ids)`,
no composite index, filter `teacherUid` client-side — `utils/classroomCourseLinks.ts`).
When an **unambiguous single** course resolves, `AssignToClassroomModal`
auto-selects it with an "already linked" hint so the teacher just confirms — the
double-pick is gone for the common single-class assign. Zero/ambiguous → the
plain picker (and assigning establishes the link, so it's auto next time).

**Phase 2 — multi-course fan-out (NOT YET — has a data-model cost).** "One assign
→ `assignToClassroomV1` per linked course" needs a session to carry **multiple**
attachments, but today `QuizSession`/`VideoActivitySession` hold a **single**
`classroomAttachment`. Fanning out to N Google courses therefore requires
migrating `classroomAttachment` → `classroomAttachments[]` and updating **every
reader**: the draft + final grade-push CFs, both Results "Push grades" buttons,
`persistClassroomAttachmentLink`, `TeacherDiscoveryRoute`/`TeacherReviewRoute`,
and the **Publish = Push** chain (which currently reads a single attachment). That
is a cross-cutting change that re-touches just-shipped, reviewed code, so it is
deliberately split out as its own piece — do NOT bundle it with Phase 1. Until
then, a multi-period GC assign keeps today's "pick one course" behavior.

- Linked classes → auto-targeted.
- Unlinked targeted class → inline "link this class to a Classroom course" step
  (reuse the SidebarClasses course picker), then proceed. The current
  `AssignToClassroomModal` course picker becomes the **first-time-link / fallback**
  path, not the default.
- Multi-course gate correctness: each course's `classroom_course_links` carries
  its own `classlinkClassId`, so a student launching from course X resolves to
  section X and overlaps the session's `classIds` (part 1's per-course
  establishment is what makes this safe — hence the single-section rule).

### 5.2 Schoology — identity & grade routing automatic; attach still manual

SpartBoard **cannot push** an activity into a Schoology course (no API — this is
the whole reason the Assign-chooser's Schoology branch is a how-to, not an
action). So the teacher still **adds the activity inside each Schoology course
once** (Add Materials → SpartBoard). What the link buys:

- **No re-identification:** when students launch from a linked section, SpartBoard
  already knows the ClassLink class → real names, class-gate, and per-period
  bucketing without re-asking.
- **Grade routing:** Publish=Push (AGS) routes each section's grades to its own
  Schoology gradebook column — driven by the section↔class link, not a re-pick.
- It's **one** SpartBoard assignment underneath: unified monitor + results,
  filterable by period.

Honest framing for the UI: linking removes the redundant _re-picking and
re-identifying_ on Schoology, not Schoology's own attach step.

---

## 6. Data model & security

### 6.1 `lti_course_links/{contextId}` (extend the existing doc)

```
{
  teacherUid:       string,   // existing — AGS push gate
  classlinkClassId: string,   // NEW — the paired ClassLink class sourcedId
  classlinkOrgId?:  string,   // NEW — parity with classroom_course_links
  contextTitle?:    string,   // captured section title (display/recognition)
  createdAt, updatedAt
}
```

- **Writes are server-only** (rules already `write: if false`). A new
  `linkLtiCourse` / `unlinkLtiCourse` CF mirrors `linkClassroomCourse`:
  - **Trust anchor:** the caller must own a SpartBoard **session whose captured
    `ltiAttachment.contextId` == this contextId** (i.e. they've actually launched
    that Schoology section), re-verified server-side — the LTI analogue of
    `verifyTeacherOfCourse`. Rules can't validate an LTI launch, so this gate is
    the squat protection (no client write; no enumerating/claiming a foreign
    `context_id`).
  - **No-hijack / no-overwrite:** never re-point a link owned by a different
    teacher; never clobber an existing `classlinkClassId` (same invariants part 1
    established for `classroom_course_links`). Transactional check-then-write.
- **Reads** stay open to authed users (the monitor reads link state).

### 6.2 Reverse-lookup index

`classlinkClassId → courseId` is a single-field equality query on both
`classroom_course_links` and `lti_course_links` — **no composite index needed**;
filter `teacherUid` in code.

### 6.3 PII

No new PII at rest. Email used for **matching is transient** (computed
server-side during the suggest step, never written) — identical to the existing
"names are resolved on read, never persisted" rule. The link docs hold only
opaque ids + the section title.

---

## 7. Phasing (ship incrementally, each independently valuable)

1. **GC reverse-lookup consume — ✅ SHIPPED.** The assign flow reverse-looks-up
   the targeted class's linked Google course and auto-selects it (single,
   unambiguous); unlinked → today's picker. Kills the GC double-pick for the
   common single-class assign. No new scope/rules/data-model. _Builds on part 1._
2. **GC multi-course fan-out — deferred (data-model cost, see §5.1).** Requires
   `classroomAttachment` → `classroomAttachments[]` across the session model +
   every reader (grade push CFs, Results, Publish=Push). Its own piece.
3. **Schoology link doc + CFs.** Extend `lti_course_links` with `classlinkClassId`;
   add `linkLtiCourse`/`unlinkLtiCourse` (session-ownership trust anchor) +
   rules-tests. Route AGS grade push + name resolution through the link.
4. **Linking UX.** SidebarClasses "Link to Schoology" (single review screen) +
   post-launch prompt; auto-match suggestion (email if released, else title pick).
5. **Polish:** silent auto-link for high-confidence matches; cross-listed handling.

Phase 1 (shipped) is pure Google Classroom and low-risk. Phase 2 is bigger than
it first looks (the attachment-array migration). Phases 3–4 are the Schoology
"bigger lift" and touch LTI (`functions/src/lti/*`) — **do not break the existing
Schoology launch/AGS/NRPS paths**; everything additive, fully unit-tested
(prod-only verifiable, like the rest of this feature).

---

## 8. Open questions for Paul

1. **NRPS email release.** Is Schoology configured to release student email over
   NRPS? If yes → reliable auto-match. If no → auto-match degrades to
   name-overlap/title-pick (still one click). Confirm before building §4.2.
2. **Silent auto-link threshold.** OK to auto-link (and just show it) on a unique,
   near-total roster match, or always require an explicit confirm? (Recommend:
   auto-link the unambiguous, confirm the rest.)
3. **Cross-listed sections** (one Schoology course spanning two ClassLink classes):
   v1 = "pick one / can't auto-match," or in scope?
4. **Establish-on-launch placement:** post-launch prompt, SidebarClasses-only, or
   both? (Recommend: both.)
