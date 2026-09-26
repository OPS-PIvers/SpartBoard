# M17 — Individual Assignment: Per-Student Targeting, Windows & Accommodations

**Status:** SHIPPED 2026-08-31 — all 16 items (A1–E2) implemented and merged to dev-paul across 28 adversarially-reviewed PRs (#2636–#2690). Known accepted limitations recorded in §6 plus: per-student window shifts client-enforced within the session-level server bound (§3a-E); score-denominator snapshotting for re-targeted students tracked as a follow-up task.
**Author:** Grilling + architect scout of dev-paul codebase; r2 incorporates audit findings verified against dev-paul @ 472ed5ff
**Scope:** Per-student / group targeting of quiz, video-activity, guided-learning, and mini-app assignments delivered via `/my-assignments`; open/close windows on all four types; per-student accommodation overrides (extended time, reduced question set, reduced MC options, alternate rubric, tab-warning threshold); central Assignments hub; assignment-creation tab-warning control
**Date:** 2026-08-28

---

## 1. Current-state verification (scouted 2026-08-28; corrected in r2)

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All four activity types use the same **assignment doc + session doc (1:1, shared UUID)** pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Quiz: `/users/{uid}/quiz_assignments/{id}` + `/quiz_sessions/{id}`; `hooks/useQuizAssignments.ts:686,801-804` (`assignmentId = crypto.randomUUID()`, session written at the same id). VA/GL/MiniApp analogous via `useVideoActivitySession.ts`, `useGuidedLearningSession.ts`, `useMiniAppSession.ts`                                                                                                                                                                                      |
| Targeting is **exclusively class/roster-scoped**; no per-student field exists anywhere                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `utils/resolveAssignmentTargets.ts:14-18` — precedence `rosterIds` → legacy `classIds` → `periodNames` → untargeted                                                                                                                                                                                                                                                                                                                                                                        |
| `/my-assignments` delivery is class-claim-scoped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `hooks/useStudentAssignments.ts:511-512` — `where('classIds','array-contains-any', ids)` / `where('classId','in', ids)`. Active + ended channels per kind, but **`endedLimit` is 50 only for quiz/VA/mini-app; it is 0 for guided-learning and activity-wall** (`useStudentAssignments.ts:171,195,221,240,263`) — GL has **no ended channel**                                                                                                                                              |
| Student identity is an **opaque HMAC pseudonym uid** + claims `{studentRole, orgId, classIds}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `computeStudentUid(sourcedId, secret)` lives in `functions/src/classlinkShared.ts:90` (studentIdentity.ts calls it); `context/StudentAuthContext.tsx` never reads email/displayName. **Test-class students derive their uid from `test:{emailLower}`, not a sourcedId** (`functions/src/studentIdentity.ts:202`)                                                                                                                                                                           |
| Per-assignment pseudonyms are deliberately **unlinkable across assignments**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `functions/src/studentIdentity.ts:63-69` — `HMAC(secret, "asn:"+uid+":"+assignmentId)`. Teacher-side resolution is `getPseudonymsForAssignmentV1` (batched per classId), surfaced by `hooks/useAssignmentPseudonyms.ts` as **two maps**: `byStudentUid` (keys quiz/VA/GL response docs) and `byAssignmentPseudonym` (keys mini-app submissions only) — see `useAssignmentPseudonyms.ts:5-13`. `getAssignmentPseudonymV1` is the **student-called** function (requires `studentRole` claim) |
| **Session reads are intentionally permissive — `allow read: if request.auth != null` — for all four session collections.** Class gating exists ONLY on response **writes** (runtime `get()` of the parent classId). Session docs are public-by-UUID by explicit design; the rules comments say tighter enumeration would need a CF proxy                                                                                                                                                                                                                                                                                   | `firestore.rules:3068-3074` (quiz), `:3607-3611` (VA), `:3761-3765` (mini-app), `:3863-3867` (GL). ⚠️ r1 of this spec misread this as "rules gate reads on class membership" — that error produced the rejected r1 read-gate design (see §2)                                                                                                                                                                                                                                               |
| Roster `Student[]` lives in a **Google Drive JSON file, not Firestore**; PII never written to Firestore. **The file body is a bare `Student[]` array** — the writer is `JSON.stringify(students)` (`hooks/useRosters.ts:360`) and the reader **throws** if the parsed value isn't an array (`useRosters.ts:398`). Whole-file overwrite, no ETag/If-Match — concurrent edits are last-write-wins                                                                                                                                                                                                                            | `types.ts:87` `Student` (`classLinkSourcedId?` is **undefined for manually created students** — `types.ts:98`); `types.ts:119` `ClassRosterMeta`                                                                                                                                                                                                                                                                                                                                           |
| Due dates exist on **quiz only** (`dueAt` + `dueAtHasTime`); all time fields repo-wide are **epoch-millisecond numbers**, not Timestamps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `types.ts:4176` `QuizAssignmentSettings`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| There are **two unrelated tab-warning systems**. (a) During-taking: `session.tabWarningsEnabled` gates a visibility tracker whose threshold is **hardcoded `>= 3`** at `components/quiz/QuizStudentApp.tsx:1172` and `:4032`, with "Warning N of 3" modal copy. (b) Published-results protection: `protection.tabWarningThreshold` (`types.ts:4119`, default 3) drives the results-viewing lockout via `useResultsTabWarnings` (`QuizStudentApp.tsx:3444-3459`, `QuizResults.tsx:1613`), settable only in `PublishScoresModal.tsx:127-188`. ⚠️ r1 conflated these; B4 (r2) now targets the during-taking system explicitly | verified 2026-08-28                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Per-student targeting cannot be a query filter on shared session docs: the student query has no remaining `in`/`array-contains-any` budget (`useStudentAssignments.ts:300` comment), and — decisively — teachers cannot compute pseudonym uids client-side (HMAC secret is server-only)                                                                                                                                                                                                                                                                                                                                    | Firestore query constraints; `STUDENT_LOGIN_CLASS_IDS_MAX = 20` (`studentIdentity.ts:56`)                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## 2. Architecture decision (r2)

**Chosen approach: server-side fan-out, with ALL per-student data confined to the per-student pointer doc.** At assign time, a Cloud Function (`setAssignmentTargetsV1`) receives the assignment id, kind, and the picked roster students, computes each student's stable pseudonym uid server-side, and writes/deletes pointer docs in a new top-level collection:

```
/student_assignments/{studentUid}/items/{assignmentId}
  { kind: 'quiz'|'video-activity'|'guided-learning'|'mini-app',
    sessionId, teacherUid, classId,
    openAt?, closeAt?, dueAt?,            // epoch ms, per-student effective window
    override?: StudentOverride,           // THIS student's overrides only
    createdAt, updatedAt }
```

Rationale (each alternative rejected):

- **Filter on session docs (`targetUids` array)** — impossible: no remaining array-filter budget, and teachers can't compute pseudonym uids client-side.
- **Client-side filtering alone** — can't express per-student windows and has no server-authoritative record.
- **Fan-out** — one cheap `collection('student_assignments/{uid}/items')` listener per student, gated purely on the path segment (`request.auth.uid == studentUid`), and the pointer doc is the natural home for per-student window/override data.

### 2a. What the session doc does and does not carry (r2 — replaces r1's design)

**Session reads stay `request.auth != null`. No read-rule change.** r1 proposed gating individually-targeted session reads with "class gate OR `exists()` pointer doc." That is unimplementable: session reads are already ungated (`firestore.rules:3068-3867`, evidence §1), and on a `list` query Firestore evaluates rules against the query, not per-document — any `exists()`/`resource.data` condition fails the **entire** `array-contains-any` listener with `permission-denied` for every student, including untouched `targetMode:'class'` assignments. Rules are not filters.

Consequences, stated honestly:

- The session doc for an individually-targeted assignment remains readable by any authenticated user who has its UUID (same as every session today). Exclusion of untargeted classmates from `/my-assignments` is **client-side presentation** (the class channel drops `individualTargeting: true` sessions), not a security boundary.
- Therefore the session doc **must not contain anything sensitive per-student**. In particular:

**`overridesByPseudonym` on the session doc is REMOVED from the design.** Accommodation data (`timeMultiplier`, reduced `questionIds`, hidden distractors, rubric swaps) is de-facto 504/IEP-adjacent data. On a world-readable session doc it would be disclosed to any signed-in user in the district, and its stable-uid keys on shared docs would break the cross-assignment unlinkability the pseudonym system exists to protect (`classlinkShared.ts:6-11` design comment). Instead:

- **Student side:** the override lives only in the student's own pointer doc (`override` field above), readable only by `request.auth.uid == studentUid`. The student app reads its own pointer doc alongside the session.
- **Teacher side:** overrides are stored on the teacher's own assignment doc as `overridesBySourcedId: Record<string, StudentOverride>` (owner-read-only path `/users/{uid}/...`; contains no names). The CF materializes pointer docs from it.
- **Grading side (C4):** the grader resolves per-student rubric overrides from the teacher's assignment doc (which the teacher can read), matched to responses via `byStudentUid` — no session-side mirror needed.

**Targeting fields on the assignment doc** (teacher-owned, owner-read-only):

```ts
targetMode: 'class' | 'students';           // default 'class' (today's behavior)
targetStudents?: StudentTargetRef[];        // see below
targetGroupIds?: string[];                  // provenance of picked groups (display only)
overridesBySourcedId?: Record<string, StudentOverride>;
```

```ts
type StudentTargetRef =
  | { kind: 'classlink'; sourcedId: string }
  | { kind: 'test'; email: string }; // test-class students (uid = HMAC('test:'+email))
```

⚠️ **sourcedId PII caveat:** OneRoster `sourcedId` is SIS-defined and in many districts **is the real student ID number**. It is therefore treated as PII-adjacent: it appears only on the teacher's own assignment doc (owner-read-only under `/users/{uid}/`) and in the CF payload — never on session docs, pointer docs, or any surface other org members can read. Verify the ClassLink tenant's sourcedId format before ever relaxing this.

**Manually-created roster students** (`classLinkSourcedId === undefined`, `types.ts:98`) have no SSO identity and **cannot be individually targeted**. The picker (B1) grays them out with an inline explanation; the CF returns a `skipped` list for any unresolvable ref rather than failing silently.

`targetMode: 'class'` keeps the existing class-claim query path untouched — zero data migration and (per B3 acceptance criteria) zero added UI friction. `targetMode: 'students'` sets `individualTargeting: true` on the session doc; the class channel drops those client-side (including **removing** an already-rendered row if the flag arrives after initial render — the flag write and pointer writes race across the student's two listeners, so the drop must handle late-arriving flags, and the CF must write the session flag **before** pointer docs to keep the exposure window one-sided).

**Per-student overrides:**

```ts
interface StudentOverride {
  timeMultiplier?: 1.5 | 2 | 'unlimited';
  questionIds?: string[]; // quiz only: subset to serve
  hiddenOptionIdsByQuestion?: Record<string, string[]>; // quiz only, never the correct answer
  rubricOverrideByQuestion?: Record<string, RubricSnapshot>; // quiz only
  tabWarningThreshold?: number | 'off'; // quiz only (during-taking system, see B4)
  openAt?: number;
  closeAt?: number; // per-student window shift (epoch ms)
}
```

**Standing accommodations (r2 addition — closes the highest-frequency workflow gap):** a 504/IEP accommodation applies to _every_ assignment; forcing per-assignment re-entry is a compliance risk, not a papercut. Each roster's Drive JSON gains `defaultOverridesByStudentId: Record<Student['id'], StudentOverride>` (PII stays in Drive, consistent with roster policy). When a student is targeted in B1, their roster default override pre-populates their row (editable per assignment). Question-level fields (`questionIds`, `hiddenOptionIdsByQuestion`, `rubricOverrideByQuestion`) are assignment-specific and are NOT part of defaults — defaults cover `timeMultiplier`, `tabWarningThreshold`, and window shifts. B2 additionally gets a "Copy overrides from [student]" action for the question-level fields.

**Groups** are stored per-roster inside the roster's Drive JSON. Because the current file body is a bare array (`useRosters.ts:360,398`), this is a **schema migration**, not an addition: the file becomes a versioned envelope `{ version: 2, students, groups, defaultOverridesByStudentId }` with a back-compat reader for the array form (see A4).

**SSO-only for v1.** Join-code/PIN sessions remain class-wide; individual targeting, windows enforcement, and overrides apply to the `/my-assignments` path only.

---

## 3. Decisions locked (Paul, 2026-08-28)

1. **Scope:** all four activity types (quiz, VA, GL, mini-app).
2. **Meaning of assigning:** appears on the SSO student's `/my-assignments`; no live-session gating in v1.
3. **Granularity:** individual students + whole roster + saved per-roster groups.
4. **Architecture:** fan-out collection + Cloud Function pseudonym translation (accepted explicitly).
5. **Scheduling:** enforced open/close windows on **all four** types (new `openAt`/`closeAt` fields everywhere; quiz keeps `dueAt` as display metadata within the window).
6. **Window UX:** visible but locked — upcoming shows "Opens …", closed shows grayed "Closed". Grouped into **Open now / Upcoming / Closed** sections with muted-card treatment inside.
7. **Variants are independent of targeting:** any assignment (class-wide or individual) can carry per-student overrides.
8. **Variant dimensions:** extended time (multiplier 1.5x/2x/unlimited — all four types), reduced question set (quiz), reduced MC options (quiz), alternate rubric from library or points mode (quiz), tab-warning threshold raise/disable (quiz).
9. **Reduction UX:** manual per student — teacher hand-picks questions and hides specific distractors in the override editor; no automatic presets. System must never allow hiding the correct answer.
10. **Discretion:** modified versions are **invisible to students** — no badges, counts, or hints; the reduced set renders as if it were the whole assignment; the student's timer simply shows their own time. **(r2 clarification: invisibility applies to the student view ONLY. The teacher's hub roster (D2) shows a discreet "modified" marker + served question count so misconfigured overrides are catchable before a student takes the assignment — this does not violate this decision.)**
11. **Tab-warning threshold at creation:** the quiz behavior settings panel gains a during-taking threshold control with an **off** option (see B4 r2 — this is the `>= 3` hardcode system, NOT `protection.tabWarningThreshold`). Also per-student overridable.
12. **Assign UI:** both — an "Assign" action in each editor **and** a central Assignments hub.
13. **Hub:** sidebar entry → full-screen modal; list + detail pane (left: filterable assignment list with type/class/status chips; right: per-student status roster).
14. **Status tracking:** per-assignment only in v1 — student rows with status chips (Not started / In progress / Submitted / Graded) + summary counts. No cross-assignment student profile. **(r2 note: unlinkability is preserved on client-readable surfaces because `/student_assignments/{uid}` is self-read-only and no shared doc carries stable-uid keys. The collection is still grouped by stable uid server-side; §A3 adds an explicit non-goal that no CF, admin surface, or export job may ever query it across assignments per student.)**
15. **Picker:** new two-panel modal — rosters + group chips left; searchable student checklist with per-roster select-all right; removable-chip selected-summary strip; selected count in footer.
16. **Overrides UI:** inline in the assign flow — each selected student row collapses to tiny chips of active overrides ("2x time", "12/20 Qs") and expands to one compact grid of controls; no tabs.
17. **Post-edit:** fully editable after creation — add/remove students, change windows/overrides anytime; removing a student deletes their pointer doc (hides it from their list) but keeps submitted work teacher-side. **(r2: window edits apply only to not-yet-submitted students; submitted/graded rows are unaffected and show no change.)**
18. **Groups storage:** per-roster, inside the roster Drive JSON (versioned envelope per §2a).
19. **Rubric variant:** swap in any library rubric (or points mode) per student per written question.
20. **Empty/loading states:** icon + one line + one action; existing skeleton/pulse patterns, no spinners.

### 3a. r2 amendments (from 2026-08-28 audit — supplement, don't override, the locked decisions)

- **A. No session-doc read-gate change; no session-side override mirror.** (§2a; audit blockers 1–2.)
- **B. Standing accommodations at roster level + copy-between-students.** (§2a; audit blocker 4.) Confirmed by Paul 2026-08-28 — in scope for v1.
- **C. Window sections nest inside today's Active/Completed model, they don't replace it.** `/my-assignments` currently partitions Active/Completed (`components/student/MyAssignmentsPage.tsx:184-211`). r2 rule: **Open now / Upcoming** subdivide the Active list; **Closed** items merge into the existing Completed/ended list with the "Closed" muted treatment. Submitted-but-still-open items go to Completed (as today). Assignments with no `openAt`/`closeAt` (all pre-existing ones) are always "Open now" — `openAt ?? -Infinity`, `closeAt ?? Infinity`, stated here so no implementer invents a comparator. The Closed/Completed section is collapsed by default past 10 items.
- **D. Mid-attempt close behavior (quiz):** when `closeAt` passes while a student has an attempt open, the client **auto-submits what's answered** with a brief non-blocking notice — never a silent rules rejection that loses in-flight work. Windows/timers compare against **server-offset time**, not raw `Date.now()` (clock-skew guard).
- **E. Server-side window enforcement scope:** session-level `closeAt` only, enforced in the existing response-write rules via `request.time.toMillis() < closeAt` (fields are epoch-ms numbers — a Timestamp-vs-number comparison would silently always-pass). Per-student window shifts are client-enforced in v1 (a rules check would double the `get()` budget on the hottest write path). All four types get the same session-level rule, not just quiz.
- **F. Accommodation invisibility acceptance criteria:** every student-facing count (question index "3 of N", progress bar, review screens, results denominators including `QuizResults`/publish-scores) is computed from the **served subset**, never the session's full question count; the tab-warning banner never renders the numeric threshold (generic copy only). These are test-gated criteria in C3, not guidance.
- **G. The class-wide assign flow stays exactly as fast as today.** `targetMode:'class'` (default) renders none of B1/B2 — a single collapsed "+ Individual students & overrides" affordance expands them. Stated as a B3 acceptance criterion.

---

## 4. Design Contract — BINDING for every UI item

Every implementer and reviewer must comply. **A dedicated design-lens reviewer checks each UI PR against this section during adversarial review.**

**Reference surfaces (clone, don't invent):**

- Modals, panels, settings rows: `components/common/library/` (QuizBehaviorSettingsPanel, PublishScoresModal, AssignmentSettingsToggleGroup and siblings).
- Editor side-panels / builder ergonomics: the M12 rubric panels (`RubricBuilderPanel`, `RubricScoringPanel`).
- Each spec item below names its reference; the PR description must state which surface was cloned.

**Forbidden (design-slop list — reviewer rejects on sight):**

- Emoji anywhere in UI. Badges/pills beyond the defined status chips.
- New colors or gradients. Palette = brand blue/red, slate scale, and the status-chip colors defined once in item D1.
- Explanatory paragraphs in modals — one-line helper text max.
- Hand-rolled dropdowns/toggles/inputs — reuse the shared controls in `components/common/`.
- Countdown timers, illustrations in empty states, spinners in new surfaces.

**Required:**

- Status chips: one shared `AssignmentStatusChip` component, defined once, used everywhere.
- One shared `AssignTargetingSection` component (target-mode toggle + B1 trigger + B2 list + window pickers) consumed verbatim by all four B3 PRs — the PRs differ only in save-wiring, never in layout (r2; prevents four-way drift).
- Empty states: icon + one line + one action button.
- Loading: existing skeleton/pulse patterns.
- Muted/locked cards: reduced opacity + lock icon + "Opens {day time}" / "Closed" label — same card component, no new component.
- Dark-surface text: `text-slate-300` body / `text-slate-200` headings (per CLAUDE.md AA rule).
- Comments: one short line max (repo standard).

---

## 5. Implementation phases (r2)

Each item is self-contained: an agent gets this spec §1–§4 plus its item. Items marked **[server]** touch protected files (functions/, firestore.rules) — orchestrator-owned or dedicated small PRs.

### Phase A — Foundations (data model, server, rules)

**A1. Types + shared targeting model.** Add to `types.ts`: `targetMode`, `targetStudents: StudentTargetRef[]`, `targetGroupIds`, `overridesBySourcedId` (assignment docs), `openAt`/`closeAt` (epoch ms; all four assignment+session types), `dueAt` for VA/GL/MiniApp, `StudentOverride`, `individualTargeting` boolean (session docs), `StudentAssignmentPointer` (including its `override` field). **No override data on session types.** Extend `utils/resolveAssignmentTargets.ts` to pass targeting mode through. Pure types + utils + tests; no UI.

**A2. [server] Cloud Function `setAssignmentTargetsV1`.** Input: `{assignmentId, kind, sessionId, add: StudentTargetRef[], remove: StudentTargetRef[], overridesBySourcedId, window}`. Must:

- Verify caller owns the assignment **and validate every target ref against a roster the caller owns** (scope lookups the same way `getStudentClassDirectoryV1` does, `studentIdentity.ts:361-369`) — reject refs not found in the teacher's classes; a valid-HMAC-but-unauthorized sourcedId must never produce a pointer doc (cross-class/cross-org targeting guard).
- Compute uids per ref kind: `classlink` → `computeStudentUid(sourcedId)`; `test` → `computeStudentUid('test:'+emailLower)` (reuse `studentIdentity.ts:202` derivation).
- Write the session's `individualTargeting` flag **before** pointer-doc writes; batch-write/delete `/student_assignments/{uid}/items/{assignmentId}` including each student's own `override`.
- Return `{written, removed, skipped: {ref, reason}[]}` — unresolvable refs are reported, never silently dropped.
- Idempotent; unit-tested in `functions/`, including cross-teacher/cross-org rejection tests.

**A2b. [server] Deletion cleanup (r2 — new).** Assignment deletion today is a pure client `writeBatch` (`hooks/useQuizAssignments.ts:1077-1121` and analogues) and the client cannot touch `/student_assignments` (CF-only writes, server-only secret) — without this item every delete strands pointer docs forever. Add `onDocumentDeleted` triggers on all four assignment collections that fan out pointer deletes (trigger, not a callable, so admin/script deletes are covered too). C1 additionally drops any pointer whose session doc is missing, as defense in depth.

**A3. [server] Firestore rules for `/student_assignments`.** Read (`get` AND `list`): `request.auth.uid == studentUid` path segment + `studentRole` claim. Write: none from clients (CF/Admin SDK only). **No changes to session read rules** (§2a). Session-level `closeAt` check added to the existing response-**write** rules for all four kinds: `sessionData().get('closeAt', null) == null || request.time.toMillis() < sessionData().closeAt` — fits the existing single-`get()` pattern (`firestore.rules:3091-3093`). Rules tests in `tests/rules/`: student A cannot `get` or `list` student B's items; no `collectionGroup('items')` access; response write rejected after `closeAt`; pointer writes rejected from clients. **Explicit non-goal recorded in the rules comment: no Cloud Function, admin surface, or export job may query `/student_assignments` grouped per-student across assignments** — the collection exists solely for each student's own listener; teacher surfaces always resolve through per-assignment pseudonym functions.

**A4. Roster Drive JSON: versioned envelope + groups + default overrides.** Migrate the file body from bare `Student[]` to `{version: 2, students, groups: {id,name,studentIds[]}[], defaultOverridesByStudentId}`. Reader accepts both forms (array ⇒ v1, wrap on next write); writer always emits v2. Known limitation stated in code comment: whole-file last-write-wins (`useRosters.ts:369-372` has no revision check) — group edits and roster edits from two tabs can clobber; acceptable for v1, revisit with Drive revision-id preconditions if reports surface. Prune `groups[].studentIds` and `defaultOverridesByStudentId` entries on student delete and ClassLink re-sync (dangling ids silently shrink select-all targeting). Group editor UI inside the existing `RosterEditorModal`. Tests including v1→v2 read-compat and prune behavior.

### Phase B — Teacher assign flow

**B1. Two-panel student picker (`AssignStudentPicker`).** New shared modal per Decision 15. Left: rosters with group chips; right: searchable checklist + select-all; chip summary strip; footer count. Reads students via `useRosters` (Drive), never writes PII to Firestore. **Manually-created students (`classLinkSourcedId` undefined) render disabled with inline note "Individual assignment requires ClassLink sign-in"** — never selectable-then-silently-dropped. Rows pre-populate override chips from the roster's `defaultOverridesByStudentId`. Reference: library modals. Component + tests (incl. mixed-provenance roster).

**B2. Override editor rows.** Per Decision 16: collapsed chip row + expanded compact grid — time multiplier, tab-warning threshold (number/off), per-student window shift, and for quizzes: question subset picker, per-question MC-option hider (correct answer un-hideable, validated in the CF too), rubric swap (library picker or points mode). **"Copy overrides from [student]" action** duplicates another selected student's full override (r2 — cuts realistic authoring cost without violating Decision 9). Emits `StudentOverride`. Reference: rubric panels. Component + tests.

**B3. Wire "Assign" into all four editors via the shared `AssignTargetingSection` (§4).** Acceptance criteria: (1) `targetMode:'class'` default shows NONE of B1/B2 — one collapsed "+ Individual students & overrides" affordance; class-wide assign click-count is unchanged from today. (2) All four editors consume `AssignTargetingSection` verbatim. On save: existing session-creation path with new fields, then `setAssignmentTargetsV1`; surface the CF's `skipped` list to the teacher (toast + row markers), never silently. One PR per activity type (B3-quiz, B3-va, B3-gl, B3-miniapp).

**B4. During-taking tab-warning threshold (r2 rewrite).** This targets the **taking-time** system, not results protection. New field `session.tabWarningThreshold?: number | 'off'` alongside the existing `tabWarningsEnabled`. Control (with off) added to `QuizBehaviorSettingsPanel`, cloned from the `PublishScoresModal.tsx:127-188` threshold control; written at session creation. Edit sites: the hardcoded `>= 3` at `QuizStudentApp.tsx:1172` and `:4032`, the "Warning N of 3" modal copy (which must become generic — never render the effective numeric threshold, per §3a-F), and the monotonic `tabSwitchWarnings` rules invariant (`firestore.rules:3252-3253`) if the auto-submit interaction changes. Per-student override (`StudentOverride.tabWarningThreshold`) is read from the student's own pointer doc. The results-protection threshold (`protection.tabWarningThreshold`) is explicitly out of scope here — it already has its UI in PublishScoresModal. Tests.

### Phase C — Student delivery

**C1. Fan-out channel in `useStudentAssignments`.** Add a listener on `/student_assignments/{auth.uid}/items`; merge with class channels. Merge rules (explicit): dedupe key is the shared assignment/session UUID; **pointer wins** for `openAt`/`closeAt`/`dueAt`/`override`; **session wins** for title/status/content. Class channel drops `individualTargeting` sessions **including removing already-rendered rows when the flag arrives late** (two listeners race). A pointer whose session isn't in any class-channel bucket (GL has no ended channel — `endedLimit: 0`; others cap at 50) hydrates via direct `getDoc(session)` (reads are permissive); a pointer whose session doc is missing entirely is dropped (deleted assignment). Tests for: dedupe, late-flag removal, GL-ended hydration, missing-session drop.

**C2. Windows on `/my-assignments`.** Per §3a-C: Open now / Upcoming subdivide Active; Closed merges into Completed with muted+lock treatment, collapsed past 10. No-window assignments are Open now. Enforcement: locked items unclickable; **mid-attempt close auto-submits answered work with a notice (§3a-D)**; comparisons use server-offset time, not `Date.now()`. Server-side session-level `closeAt` on response writes ships in A3 (all four kinds). Per Decision 6/20 and Design Contract. Tests incl. no-window default and mid-attempt close.

**C3. Override materialization in student apps.** The student app reads its own pointer doc (`/student_assignments/{auth.uid}/items/{id}`) for its `override` — there is no session-side override map. Quiz taking honors: `questionIds` subset, hidden MC options, `timeMultiplier`, per-student `tabWarningThreshold`. VA/GL/MiniApp honor `timeMultiplier` on any timed element. **Acceptance criteria (test-gated, §3a-F):** question index/progress/review/results denominators (`QuizStudentApp.tsx:2145,2357,3139,3254,4055` and the `QuizResults`/publish-scores path) all derive from the served subset; grading max points = served subset sum; no student-facing surface renders the full count or the numeric warning threshold. One PR per app, quiz first.

**C4. Rubric override in grader.** `WrittenResponseGrader`/`RubricScoringPanel` reads `rubricOverrideByQuestion` from the teacher's assignment doc (`overridesBySourcedId`), matched to the response via `byStudentUid` from `useAssignmentPseudonyms`. Tests.

### Phase D — Assignments hub

**D1. Hub shell.** Sidebar entry → full-screen modal (precedent: `components/settingsModal/SettingsModal.tsx` pattern); PR description states Sidebar placement explicitly. Left list (all four kinds, filter chips: type/class/status) reading the four assignment collections; right detail pane placeholder. `AssignmentStatusChip` defined here. No badge/count on the sidebar entry (Decision-8-consistent; the zero-ambient-signal tradeoff is accepted deliberately). Tests.

**D2. Detail pane: per-student status roster (r2 rewrite).** Name resolution uses the **teacher-side** `getPseudonymsForAssignmentV1` via `useAssignmentPseudonyms` (NOT `getAssignmentPseudonymV1`, which is student-called and returns `permission-denied` for teachers). Response matching: **`byStudentUid` for quiz/VA/GL; `byAssignmentPseudonym` for mini-app only** (`useAssignmentPseudonyms.ts:5-13` contract). For `targetMode:'students'` assignments spanning partial rosters, extend the callable (small [server] sub-item) to accept the assignment's target refs directly, keeping the existing batching/`Promise.allSettled` partial-results behavior. Rows: status chips (Not started / In progress / Submitted / Graded) + summary counts + discreet "modified (N of M Qs)" marker for overridden students (§3a / Decision 10 r2 note). Manually-created students in a class-wide assignment's roster show unmatched-but-listed with a "PIN/manual — no SSO status" row state. Tests.

**D3. Edit-in-place from hub.** Detail pane actions: edit window, add/remove students (re-invokes B1/B2 → `setAssignmentTargetsV1`), close early. Removing a student deletes their pointer; submitted work retained, with the removed-but-submitted row remaining visible in D2 marked "removed". **Window edits affect not-yet-submitted students only (§3a / Decision 17 r2)**. Tests.

### Phase E — Hardening

**E1. Design-lens review sweep.** After all UI lands: one reviewer pass over every new surface against §4; fixes shipped as one polish PR.

**E2. Integration review.** Cross-feature checklist (r2-expanded): fan-out + class channels don't double-deliver and late-flag removal works; assignment **deletion** cleans pointers end-to-end (A2b) from every delete path in all four hooks; overrides + PLC-synced quizzes; window enforcement vs. attempt limits vs. mid-attempt auto-submit; `resolveAssignmentTargets` legacy paths untouched for `targetMode:'class'`; roster v1→v2 file migration round-trips; no surface anywhere reads `/student_assignments` for a uid other than `request.auth.uid`.

---

## 6. Non-goals (v1)

- PIN/join-code individual gating; individual targeting of manually-created (non-SSO) students.
- Cross-assignment per-student profiles — including any server-side/admin/export query of `/student_assignments` grouped per student (recorded in A3 rules comment).
- Server-side enforcement of **per-student** window shifts (session-level `closeAt` IS enforced server-side; per-student shifts are client-enforced).
- Automatic reduction presets ("75% of questions"). (Manual copy-between-students IS in scope, B2.)
- Content-swap variants (entirely different quiz per student).
- Google Classroom sync of per-student targeting.
- Drive roster file revision-id concurrency control (last-write-wins accepted, documented in A4).
