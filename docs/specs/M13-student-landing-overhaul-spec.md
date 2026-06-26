# M13 — Student-Landing Overhaul: Implementation Spec

## 1. Code-State Audit (What Is Already Shipped)

The 9-phase plan was written before significant implementation work landed. Several claimed "not-started" items are **fully or partially shipped**. Verify against the following before beginning any phase.

### Fully Shipped — Do Not Reimplement

| Plan Item                                                                                                                   | Actual Status     | Evidence                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `useStudentAssignments` hook                                                                                                | Shipped           | `hooks/useStudentAssignments.ts` — full dual-query, 5-kind, deduped subscription                                                                                 |
| `MyAssignmentsPage` refactor (slide-out sidebar layout)                                                                     | Shipped           | `components/student/MyAssignmentsPage.tsx` — sidebar+main layout, filter persistence                                                                             |
| `useStudentClassDirectory` hook                                                                                             | Shipped           | `hooks/useStudentClassDirectory.ts`                                                                                                                              |
| `StudentSidebar`, `StudentOverview`, `StudentClassView`, `AssignmentSections`, `AssignmentListItem`, `AssignmentFilterTabs` | Shipped           | All present in `components/student/`                                                                                                                             |
| `useOrgStudentPage` hook                                                                                                    | Shipped           | `hooks/useOrgStudentPage.ts` — subscribes to `organizations/{orgId}/studentPageConfig/default`                                                                   |
| `StudentPageConfig` in `types/organization.ts`                                                                              | Partially shipped | Fields `showAnnouncements`, `showTeacherDirectory`, `showLunchMenu`, `accentColor`, `heroText` exist. **Missing**: `sectionOrder`, `assignmentsDefaultFilter`    |
| `StudentPageView.tsx` admin UI                                                                                              | Shipped           | `components/admin/Organization/views/StudentPageView.tsx` — hero text, color picker, section toggles                                                             |
| `gradingState` on `AssignmentSummary`                                                                                       | Shipped           | `hooks/useStudentAssignments.ts:82` — `gradingState: 'not-graded'                                                                                                | 'graded'` |
| `showResultToStudent` on `BaseSessionOptions`                                                                               | Shipped           | `types.ts:3099` — in `BaseSessionOptions`, flows into `QuizSession:3235` and `VideoActivitySession` via `VideoActivitySessionOptions extends BaseSessionOptions` |
| `VideoActivityBehaviorSettingsPanel` with `showResultToStudent` toggle                                                      | Shipped           | `components/common/library/VideoActivityBehaviorSettingsPanel.tsx:157`                                                                                           |
| `AssignmentSettingsToggleGroup` shared toggle surface                                                                       | Shipped           | `components/common/library/AssignmentSettingsToggleGroup.tsx`                                                                                                    |

### Partially Shipped

| Plan Item                                                                | Gap                                                                                                                                                                                                                                                                                                           | Required Work        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `showResultToStudent` on Guided Learning, MiniApp, ActivityWall sessions | `GuidedLearningSession` and `ActivityWallSession` in `types.ts` have no `showResultToStudent`; `MiniAppSession` has no `showResultToStudent`. The field exists on `BaseSessionOptions` (which GL and VA session options may extend), but the session-doc types themselves don't carry it                      | Phase 1 of this spec |
| `buildingIds` on student token/context                                   | `studentLoginV1` mints tokens with `{ studentRole, orgId, classIds }` only — **no `buildingIds`** claim (`studentIdentity.ts:204,291`). `StudentAuthContextValue.ts` and `StudentAuthContext.tsx` surface `orgId` and `classIds` but no `buildingIds`. This is the critical blocker for the teacher directory | Phase 2 of this spec |
| Teacher directory Cloud Function                                         | Not started. No `projectTeacherDirectory` trigger exists in `functions/src/`                                                                                                                                                                                                                                  | Phase 3 of this spec |
| `AssignmentSummary.showResultToStudent` field                            | `AssignmentSummary` (defined in `hooks/useStudentAssignments.ts:61`) has `gradingState` but no `showResultToStudent` passthrough from the session doc; `gradingStateFrom` hardcodes `'not-graded'` for VA, mini-app, and activity-wall                                                                        | Phase 4 of this spec |
| Results modal                                                            | Not started. No `ResultsModal.tsx` in `components/student/`                                                                                                                                                                                                                                                   | Phase 5 of this spec |
| Admin section-order reordering in `StudentPageView`                      | Not started. Toggles exist but no `sectionOrder` controls                                                                                                                                                                                                                                                     | Phase 6 of this spec |
| Announcements section on student landing                                 | `AnnouncementOverlay` exists for teacher dashboards; no student-side extraction                                                                                                                                                                                                                               | Phase 6 of this spec |
| Teacher directory section on student landing                             | Not started                                                                                                                                                                                                                                                                                                   | Phase 6 of this spec |
| i18n for new student-surface strings                                     | Not audited in `locales/en.json`                                                                                                                                                                                                                                                                              | Phase 7 of this spec |

### Plan Phase Mapping to Real Gaps

The 9-phase plan maps to this spec's 7 phases as follows:

| Source Plan Phase                        | This Spec    | Status                                                                      |
| ---------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| Phase 1 (types)                          | Phase 1      | ~60% done; `sectionOrder` + GL/AW/MA session types remain                   |
| Phase 2 (rules + indexes)                | Phase 2      | Not started                                                                 |
| Phase 3 (teacher UI toggles on 4 modals) | Phase 3      | VA partially done via `BaseSessionOptions`; GL/AW/MA assign paths not wired |
| Phase 4 (teacherDirectory CF)            | Phase 3      | Not started                                                                 |
| Phase 5 (hooks + section components)     | Phases 2 + 6 | Hooks partially done; section components not started                        |
| Phase 6 (landing wire-up)                | Phase 6      | Page refactored to sidebar layout; sections not composed from config        |
| Phase 7 (admin section-order UI)         | Phase 6      | Toggles shipped; order controls not started                                 |
| Phase 8 (ResultsModal)                   | Phase 5      | Not started                                                                 |
| Phase 9 (polish, i18n)                   | Phase 7      | Not started                                                                 |

---

## 2. Architecture Decision

**Keep the existing `MyAssignmentsPage` sidebar-layout shell exactly as it is.** The overhaul plan's "landing wire-up" (plan Phase 6) is structurally complete — the sidebar + main column layout shipped. What remains is additive: (a) composing the three optional sections from `StudentPageConfig` within the existing main column, (b) surfacing a results modal from completed-row CTAs, and (c) adding the teacher directory data path.

The `MyAssignmentsPage` exports `MyAssignmentsPage` as both a default and named export — both must be preserved throughout.

**Section composition strategy**: render optional sections as inline components within `StudentOverview` and `StudentClassView`, reading `sectionOrder` from a `StudentPageConfig` prop drilled from the page. Do not re-architect the page shell. The `announcements` and `teacherDirectory` sections render above the assignment list when they appear first in `sectionOrder`, or below when last. The `assignments` section is non-removable (it renders the full existing `AssignmentSections` component).

**Teacher directory data path**: a Firestore trigger on `organizations/{orgId}/members/{emailLower}` writes a student-readable projection to `organizations/{orgId}/teacherDirectory/{emailLower}`. Students query via `buildingIds array-contains` claim. This requires `buildingIds` on the student custom token — the login Cloud Function must be extended.

**Results modal strategy**: a single `ResultsModal` component switches on `assignment.kind`. Each kind fetches the student's own response doc (using the same doc-id strategy already in `AssignmentListItem`) and renders a read-only summary. The "View results" CTA is gated by `showResultToStudent === true` on `AssignmentSummary` (a new field fed from the session doc in `useStudentAssignments`).

---

## 3. Open Decisions (Need Paul)

### Decision A — `buildingIds` on Student Token

**The problem**: The teacher directory query is `where('buildingIds', 'array-contains', studentBuildingId)`. Students have no `buildingIds` claim today — the `studentLoginV1` CF only mints `{ studentRole, orgId, classIds }`.

**Option 1 — Add `buildingIds` to the student token.** Extend `studentLoginV1` to look up each classId's associated building from the org's `buildings` subcollection and mint `buildingIds` on the custom claim. Keeps rules enforcement purely claim-based. Downside: adds one Firestore read per login; `buildingIds` can stale between roster changes (requires a token refresh or re-login to update).

**Option 2 — Query teacherDirectory by `orgId` only, filter client-side.** The projection doc carries `buildingIds`; the student queries all teacher docs for their `orgId`, then filters client-side on their claimed classes' buildings. Avoids `buildingIds` on the token entirely. Downside: reads ALL org teachers, not just the student's building — a large district could have hundreds; overcounts on read.

**Option 3 — Derive teacher directory membership from `classIds`.** Add a `classlinkClassIds` array to the teacher directory projection (which classes a teacher owns); students query by `classlinkClassIds array-contains-any (classIds)`. No building join needed. Most accurate — student only sees teachers of their actual classes.

**Recommendation**: Option 3. It is the most semantically correct (students see only their teachers, not a building-wide directory), avoids token changes and their staleness problem, and the data is derivable from the existing roster structure (the CF trigger already has access to the teacher's roster `classlinkClassId` fields via `users/{uid}/rosters/`). The trade-off is the CF must maintain the teacher's class list on the projection, not just their building assignment.

If Paul prefers the plan's stated model (building-scoped directory), use Option 1 and accept the staleness trade-off.

### Decision B — Results Modal Scope for Activity-Wall

**The problem**: The plan skips `activity-wall` results ("student's own posts") but `AssignmentListItem` already has `'activity-wall': 'none'` as the `DocIdStrategy` — no per-student response doc to fetch.

**Option 1 — Skip activity-wall in ResultsModal** (consistent with the mini-app skip). Show a "Completed" badge only, no "View results" CTA. Simplest.

**Option 2 — Add activity-wall to the modal** by querying submissions where `submittedAt` is set and matching a student identifier. The challenge: anonymous AW submissions have no consistent student uid link without PII.

**Option 3 — For ClassLink-authenticated students**, activity-wall submissions use `auth.uid` (the pseudonym). Show only submissions keyed on pseudonymUid.

**Recommendation**: Option 1. Skip activity-wall in the ResultsModal. This matches the plan's explicit mini-app skip and avoids the anonymous submission identification problem. Show "Completed" badge based on the existing lazy completion check (which already handles AW as `'none'` — always returns 'unknown', so AW cards never reach the Completed section anyway unless via the ended channel). In practice, activity-wall sessions have no `status: 'ended'` trigger, so no AW cards appear in Completed to need a CTA.

### Decision C — `showResultToStudent` Default and Backward Compatibility

**The problem**: the plan says "Video-activity / guided-learning / activity-wall / mini-app default to `true`", but these session types currently have `gradingStateFrom: () => 'not-graded'` in `useStudentAssignments`. If `showResultToStudent` is absent on existing sessions, the student should see the "View results" CTA for sessions where the teacher expects it.

**Option 1 — Treat absent `showResultToStudent` as `true` for non-quiz kinds.** New sessions default to `true`; existing sessions without the field behave as if `true` — students get the CTA. Preserves the spirit of the plan.

**Option 2 — Treat absent as `false`.** Students with existing sessions see no CTA until teachers re-create the session. Breaking change for existing users.

**Option 3 — Kind-specific default**: absent on quiz = `false`; absent on others = `true`.

**Recommendation**: Option 3 (matches the plan's locked decision table). Implement in `useStudentAssignments` `gradingStateFrom`/`showResultToStudentFrom` per-kind parser with per-kind defaults.

---

## 4. Data Model Changes

### 4a. `types/organization.ts`

Extend `StudentPageConfig` at `/types/organization.ts:155`:

```typescript
export type StudentPageSection =
  | 'announcements'
  | 'assignments'
  | 'teacherDirectory';

export interface StudentPageConfig {
  orgId: string;
  showAnnouncements: boolean;
  showTeacherDirectory: boolean;
  showLunchMenu: boolean;
  accentColor: string; // hex
  heroText: string;
  // NEW
  sectionOrder?: StudentPageSection[];
  assignmentsDefaultFilter?: {
    sort: 'newest' | 'oldest';
    classId?: string | 'all';
  };
}
```

### 4b. `types.ts` — Session type additions

**`ActivityWallSession`** (currently at line 1743): add `showResultToStudent?: boolean`. Note: the plan includes it but per Decision B this CTA is ultimately skipped — add the field for completeness/future use but do not wire a "View results" CTA.

**`MiniAppSession`** (line 2500): add `showResultToStudent?: boolean` for future use. No CTA wired this PR per plan's locked decision.

**`GuidedLearningSession`** (line 5402): add `showResultToStudent?: boolean`.

No changes needed to `VideoActivitySession` — `showResultToStudent` is already on `BaseSessionOptions`, which flows via `VideoActivitySessionOptions extends BaseSessionOptions` and is mirrored onto the session doc by the assign flow.

No changes needed to `QuizSession` — already has `showResultToStudent` at line 3235.

### 4c. New Firestore collection: `organizations/{orgId}/teacherDirectory/{emailLower}`

```typescript
// In types/organization.ts
export interface TeacherDirectoryEntry {
  email: string; // lowercase; matches doc id
  name: string; // display name from Firebase Auth
  buildingIds: string[]; // canonical building ids (for Option 1)
  classlinkClassIds?: string[]; // OneRoster class sourcedIds this teacher owns (Option 3)
  updatedAt: number; // ms epoch
}
```

### 4d. `hooks/useStudentAssignments.ts` — `AssignmentSummary` extension

Add `showResultToStudent: boolean` to `AssignmentSummary` interface:

```typescript
export interface AssignmentSummary {
  // ... existing fields ...
  /**
   * Whether the teacher has enabled results viewing for this assignment.
   * Drives the "View results" CTA on completed rows.
   * Absent on session docs that predate this feature — defaults per-kind:
   *   quiz: false, others: true
   */
  showResultToStudent: boolean;
}
```

Add `showResultToStudentFrom: (data: DocumentData) => boolean` to `KindConfig`. Per-kind defaults: quiz = `false`, all others = `true` when field is absent.

### 4e. `context/StudentAuthContextValue.ts` and `StudentAuthContext.tsx`

If Decision A = Option 3 (recommended), no token changes needed. If Option 1 or 2, add `buildingIds: string[]` to `StudentAuthValue` and `extractStudentClaims`.

---

## 5. Files to Create

| File                                                      | Description                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| `functions/src/projectTeacherDirectory.ts`                | Firestore onWrite trigger + backfill helpers                |
| `scripts/backfill-teacher-directory.js`                   | One-off backfill script (ADC, not CI)                       |
| `components/student/ResultsModal.tsx`                     | Results modal with per-kind renderers                       |
| `components/student/sections/AnnouncementsSection.tsx`    | Inline announcement cards for student landing               |
| `components/student/sections/TeacherDirectorySection.tsx` | Teacher contact list                                        |
| `hooks/useStudentAnnouncements.ts`                        | Firestore subscription for org announcements (student-side) |
| `hooks/useStudentTeacherDirectory.ts`                     | Queries teacher directory for student's buildings/classes   |
| `config/assignmentDefaults.ts`                            | `DEFAULT_SHOW_RESULT_TO_STUDENT` per-kind map               |
| `tests/rules/firestore-rules-teacher-directory.test.ts`   | Rules test for teacherDirectory read/write                  |
| `tests/rules/firestore-rules-responses-release.test.ts`   | Rules test for per-kind `showResultToStudent` gates         |

---

## 6. Files to Modify

| File                                                      | Change                                                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `types/organization.ts`                                   | Add `StudentPageSection`, extend `StudentPageConfig`, add `TeacherDirectoryEntry`                                                                          |
| `types.ts`                                                | Add `showResultToStudent?: boolean` to `ActivityWallSession`, `MiniAppSession`, `GuidedLearningSession`                                                    |
| `hooks/useStudentAssignments.ts`                          | Add `showResultToStudent` to `AssignmentSummary`; add `showResultToStudentFrom` to `KindConfig` with per-kind defaults; thread into `docToSummary`         |
| `hooks/useOrgStudentPage.ts`                              | Already reads `StudentPageConfig`; no code change needed if type change is backward-compatible                                                             |
| `components/student/MyAssignmentsPage.tsx`                | Pass `studentPage` config to `StudentOverview` and `StudentClassView`; subscribe to org config via `useOrgStudentPage` using `orgId` from `useStudentAuth` |
| `components/student/StudentOverview.tsx`                  | Accept `studentPage?: StudentPageConfig                                                                                                                    | null`prop; compose`AnnouncementsSection`, assignments block, `TeacherDirectorySection`in`sectionOrder` order |
| `components/student/StudentClassView.tsx`                 | Same `studentPage` prop; same composition pattern                                                                                                          |
| `components/student/AssignmentListItem.tsx`               | Add "View results" CTA on completed rows when `assignment.showResultToStudent === true`; open `ResultsModal`                                               |
| `components/admin/Organization/views/StudentPageView.tsx` | Add section-order reorder controls (up/down buttons); persist to `sectionOrder` on `StudentPageConfig`                                                     |
| `functions/src/index.ts`                                  | Re-export `projectTeacherDirectoryV1` trigger                                                                                                              |
| `firestore.rules`                                         | Add `teacherDirectory` read rule; add `showResultToStudent` gate on response reads per-kind (see Phase 2 details)                                          |
| `firestore.indexes.json`                                  | Add composite index for `teacherDirectory`                                                                                                                 |
| `locales/en.json`                                         | Add i18n keys for new student-surface strings                                                                                                              |
| `locales/de.json`, `locales/es.json`, `locales/fr.json`   | Mirror new keys                                                                                                                                            |

---

## 7. Phased Build Sequence

### Phase 1 — Type Foundation (no runtime changes)

**Goal**: all TypeScript compiles against the new schema. Zero behavior changes.

Tasks:

- [ ] In `types/organization.ts`: add `StudentPageSection` union; extend `StudentPageConfig` with `sectionOrder?` and `assignmentsDefaultFilter?`; add `TeacherDirectoryEntry` interface
- [ ] In `types/organization.ts`: add `TeacherDirectoryEntry` (see section 4c)
- [ ] In `types.ts`: add `showResultToStudent?: boolean` to `ActivityWallSession` (line ~1762), `MiniAppSession` (line ~2536), `GuidedLearningSession` (line ~5402 area — check exact insertion point after `classIds` block)
- [ ] Create `config/assignmentDefaults.ts`: export `DEFAULT_SHOW_RESULT_TO_STUDENT: Record<SessionKind, boolean>` = `{ quiz: false, 'video-activity': true, 'guided-learning': true, 'mini-app': true, 'activity-wall': true }`
- [ ] In `hooks/useStudentAssignments.ts`: add `showResultToStudent: boolean` to `AssignmentSummary`; add `showResultToStudentFrom: (data: DocumentData) => boolean` to `KindConfig` interface; implement per-kind with the kind-specific absent-field defaults from `DEFAULT_SHOW_RESULT_TO_STUDENT`; wire into `docToSummary`
- [ ] Run `pnpm run type-check` — must pass with zero errors

**Acceptance**: `pnpm run type-check` green, no lint errors, zero test regressions, no runtime consumers of the new fields yet.

---

### Phase 2 — Firestore Rules + Teacher Directory CF + Backfill

**Goal**: server-side enforcement for results release and the teacher directory collection.

#### 2a. Firestore Rules (`firestore.rules`)

**`showResultToStudent` gate on response reads**: The plan calls for adding a gate on response reads. However, the current rules on `quiz_sessions/{sessionId}/responses/{responseKey}` do NOT restrict student reads at the document level (only write is gated). Adding a read gate here is a **breaking change**: the existing `AssignmentListItem` lazy completion check does a `getDoc` on the response doc to detect participation. If the rule denies that read when `showResultToStudent === false`, the completion check silently fails, stranding students on the Active list.

The correct enforcement boundary is: a student should be able to detect whether they participated (read doc existence), but should not be able to read the full response content (score, answers) when `showResultToStudent === false`. The current rules do not distinguish these two levels.

**Recommended approach**: Keep the existing response read rule unchanged (participation detection still works). Gate only the content-level read in the `ResultsModal` by using `getDoc` within the modal, which will fail or return partial data when the rule is added. Alternatively — simpler — rely on the client-side `showResultToStudent` flag from `AssignmentSummary` to gate the CTA, which is derived from the session doc (teacher-written), making a client-level guard adequate. If defense-in-depth at the rule level is required, add the gate only on reads of the specific fields (Firestore does not support field-level read rules natively), meaning a separate "results read" subcollection path would be needed.

**Decision for this PR**: Client-side gating via `showResultToStudent` on `AssignmentSummary` is sufficient for V1. The existing Phase 2 plan's rule change (deny student response reads when `showResultToStudent === false`) is **deferred** because it would break the participation detection in `AssignmentListItem` without a larger refactor. Flag this as a known gap in the PR description.

**Teacher directory rule** — add to `firestore.rules` in the organizations block:

```
match /organizations/{orgId}/teacherDirectory/{emailLower} {
  // Students may read teacher directory entries for their org.
  // No client write — Cloud Function only (Admin SDK bypass).
  allow read: if isStudentRoleUser() &&
               request.auth.token.get('orgId', '') == orgId;
  // Org members (teachers) may also read (for future admin use).
  allow read: if isOrgMember(orgId);
  allow write: if false; // CF writes via Admin SDK only
}
```

If Decision A = Option 3 (class-based query), the read rule simplifies: `request.auth.token.get('orgId', '') == orgId`. The CF ensures only that org's teachers appear.

If Decision A = Option 1 (buildingIds claim), change to `request.auth.token.classIds is list && ...` with a building intersection check.

#### 2b. `firestore.indexes.json`

Add:

```json
{
  "collectionGroup": "teacherDirectory",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "classlinkClassIds", "arrayConfig": "CONTAINS" },
    { "fieldPath": "name", "order": "ASCENDING" }
  ]
}
```

For Option 1 (buildingIds): replace `classlinkClassIds` with `buildingIds`.

#### 2c. Rules tests

Create `tests/rules/firestore-rules-teacher-directory.test.ts`:

- Student with matching orgId can read any teacher directory entry
- Student with different orgId cannot read
- No client can write (assert fails for authenticated write)
- Org member (teacher) can read

Create `tests/rules/firestore-rules-responses-release.test.ts`:

- This test is a **placeholder** for the deferred rule change above. Document the intent and mark `@skip` or test only the existing behavior (student can read response doc regardless of `showResultToStudent` flag on session).

#### 2d. Cloud Function: `functions/src/projectTeacherDirectory.ts`

```typescript
// onDocumentWritten trigger on organizations/{orgId}/members/{emailLower}
// If member has a teacher-eligible role (any non-student role) and is active:
//   upsert /organizations/{orgId}/teacherDirectory/{emailLower} with:
//     { email, name, classlinkClassIds (from user's rosters), updatedAt }
// If member deleted or set to inactive:
//   delete the projection doc
```

Teacher role predicate: any member whose `roleId` is NOT in `['super_admin', 'domain_admin', 'building_admin']` and is active — or more precisely, any member with `status: 'active'` is a teacher. The `organizationMembersSync` module defines `ADMIN_ROLES` — anyone not in that list and with `status: 'active'` is a teacher for directory purposes. Check `MemberRecord.roleId` to confirm.

Name resolution: call `admin.auth().getUser(uid)` where `uid` is `member.uid`. If `member.uid` is absent (uninvited/not-yet-signed-in member), skip the projection or write with `name: member.email.split('@')[0]`.

`classlinkClassIds`: query `users/{uid}/rosters` collection group via Admin SDK, collect `classlinkClassId` values. Cap at 50. If `uid` is absent, skip this field.

Export from `functions/src/index.ts` as `projectTeacherDirectoryV1`.

#### 2e. Backfill script `scripts/backfill-teacher-directory.js`

- Uses `admin.firestore()` with ADC (application default credentials)
- Iterates each org via `organizations` collection
- For each org, iterates `members` subcollection
- Applies same logic as CF trigger
- Idempotent: uses `set(..., { merge: false })` to overwrite
- Header comment documents usage: `node scripts/backfill-teacher-directory.js`

**Acceptance**: CF deploys, rules tests pass, backfill runs in dev project and produces correct docs, deleting a member removes their projection within one trigger run.

---

### Phase 3 — Teacher UI Toggles on Non-Quiz Session Modals

**Goal**: teachers can configure `showResultToStudent` on Guided Learning and Activity Wall assign flows. Video Activity is already wired via `VideoActivityBehaviorSettingsPanel` → `AssignmentSettingsToggleGroup`.

**Check first**: confirm whether the VA assign flow actually writes `showResultToStudent` to the session doc. The `VideoActivityBehaviorSettingsPanel` feeds `sessionOptions.showResultToStudent` and the `VideoActivityBehaviorSettings` object — verify this is written to the Firestore session doc in `components/widgets/VideoActivityWidget/Widget.tsx`. If it is, VA is done. If not, add the write.

**Mini-app**: per the plan's locked decision, mini-app results are skipped this PR. Add `showResultToStudent` to the session doc at create time (default `true` per `DEFAULT_SHOW_RESULT_TO_STUDENT`) but do not wire the "View results" CTA.

**Guided Learning assign modal**: find the GL assignment creation path in `components/widgets/GuidedLearning*/` or `hooks/useGuidedLearningSession.ts`. Add a "Let students view their results" toggle mirroring the `AssignmentSettingsToggleGroup` pattern. On session create, write `showResultToStudent` using the default from `config/assignmentDefaults.ts`.

**Activity Wall**: review `components/widgets/ActivityWall/Widget.tsx` around line 446 (session write). Add `showResultToStudent: DEFAULT_SHOW_RESULT_TO_STUDENT['activity-wall']` to the session doc write. No UI toggle needed per Decision B (AW results are skipped).

**MiniApp**: `components/widgets/MiniApp/Widget.tsx` or the session create path. Add `showResultToStudent: DEFAULT_SHOW_RESULT_TO_STUDENT['mini-app']` to session create. No UI toggle.

**Label text** (confirmed from plan): "Let students view their results". Tooltip: "When on, students see their own submission on the completed list."

**Acceptance**: `pnpm run type-check`, `pnpm run lint` pass. New GL toggle appears and persists. All four non-quiz kinds default correctly on new sessions. Existing sessions without the field default per `DEFAULT_SHOW_RESULT_TO_STUDENT` in the `showResultToStudentFrom` parser.

---

### Phase 4 — `showResultToStudent` Passthrough in `useStudentAssignments`

**Goal**: `AssignmentSummary.showResultToStudent` is populated from the session doc and flows to all consumers. This phase makes the Phase 1 type addition live.

Tasks:

- [ ] In `hooks/useStudentAssignments.ts`: implement `showResultToStudentFrom` per kind in `KIND_CONFIG`. For quiz and video-activity, read `sessionOptions.showResultToStudent` with kind-specific fallback. For GL, read top-level `showResultToStudent`. For mini-app and AW, read top-level `showResultToStudent` with default `true`
- [ ] Wire `showResultToStudentFrom` into `docToSummary` → `showResultToStudent` on the returned summary
- [ ] Run existing test suite to confirm no regressions on `parsePublicationFields` tests and `useStudentAssignments` tests
- [ ] Add test cases to `hooks/useStudentAssignments` test file covering `showResultToStudent: true/false/absent` for each kind

**Acceptance**: `pnpm run test` green, `showResultToStudent` flows correctly to `AssignmentSummary`.

---

### Phase 5 — ResultsModal

**Goal**: students can open a completed assignment and see their own submission.

#### `components/student/ResultsModal.tsx`

Props:

```typescript
interface ResultsModalProps {
  assignment: AssignmentSummary | null; // null = closed
  pseudonymUid: string | null;
  onClose: () => void;
}
```

Structure:

- Dialog/modal overlay (use the project's existing `showAlert` / dialog pattern or a local modal — check `context/DialogContext.tsx` for the correct modal primitive)
- Header: assignment title + kind badge + close button
- Body: switches on `assignment.kind`

Per-kind renderers (all ~60-80 lines each, inline in the file):

**`QuizResultsContent`**: fetch `quiz_sessions/{sessionId}/responses/{pseudonymUid}`. Display: student's answers per question (no `correctAnswer` exposure), their final score if present, submitted-at timestamp. Read from existing `QuizResponse` type in `types.ts`. Do not render `correctAnswer`, `revealedAnswers`, or leaderboard data.

**`VideoActivityResultsContent`**: fetch `video_activity_sessions/{sessionId}/responses/{pseudonymUid}`. Display: student's text/MC answers per step using the existing `VideoActivityAnswer[]` shape. Render question text from the session doc's `publicQuestions` or equivalent student-safe field. Score if published.

**`GuidedLearningResultsContent`**: fetch `guided_learning_sessions/{sessionId}/responses/{pseudonymUid}`. Display: step-by-step answers. The GL response shape likely mirrors the session's `publicSteps` structure.

**`MiniAppResultsContent`**: not rendered. Per plan's locked decision — no CTA wired for mini-app. This case should be unreachable since the CTA is never shown.

**`ActivityWallResultsContent`**: not rendered. Per Decision B.

Data fetching in the modal: use a single `useEffect` (this IS an external system sync — Firestore read) that fires when the modal opens (`assignment !== null`). Store `{ data, loading, error }` in local state. No real-time subscription — a one-shot `getDoc` is correct here (results are static).

For mini-app, the doc-id is the assignment pseudonym (must call `getAssignmentPseudonymV1` callable — reuse `getCachedPseudonym` already module-scoped in `AssignmentListItem.tsx`; consider moving it to a shared util or re-exporting it).

#### `components/student/AssignmentListItem.tsx` modifications

In the completed-row render path, add:

```typescript
{isCompleted && assignment.showResultToStudent && (
  <button onClick={() => onViewResults?.(assignment)}>
    View results
  </button>
)}
```

Add `onViewResults?: (assignment: AssignmentSummary) => void` prop. The parent (`AssignmentSections` → `StudentOverview` / `StudentClassView` → `MyAssignmentsPage`) threads the callback down and manages modal open state with a single `useState<AssignmentSummary | null>(null)`.

The `ResultsModal` is rendered once at the `MyAssignmentsPage` level (not per-row), using the shared `pseudonymUid` from `useStudentAuth`.

**Acceptance**: clicking "View results" on a completed row opens the modal with the student's own data. Modal does not expose `correctAnswer`. Security (client-side only in V1): CTA is invisible when `showResultToStudent === false`.

---

### Phase 6 — Admin UI + Optional Sections Wire-Up

#### 6a. Admin section-order UI (`components/admin/Organization/views/StudentPageView.tsx`)

Add a "Section order" block in the Settings card. Render the three sections as a sortable list with up/down arrow buttons. The `assignments` section is non-removable (greyed checkbox, always present). The `announcements` and `teacherDirectory` rows each have a visibility toggle (already present as `showAnnouncements`, `showTeacherDirectory`) plus up/down controls.

Persist `sectionOrder` to `StudentPageConfig` via `onUpdate`. Default when field is absent: `['announcements', 'assignments', 'teacherDirectory']`.

Update the Preview mock in `StudentPageView` to render sections in the current `sectionOrder` (reorder the existing mock section divs).

#### 6b. `hooks/useStudentAnnouncements.ts` (new file)

```typescript
// Signature:
export function useStudentAnnouncements(orgId: string | null): Announcement[];
```

Logic: subscribe to `announcements` collection `where('orgId', '==', orgId) && where('isActive', '==', true)`. Filter client-side using the same `isWithinActiveWindow` logic already in `AnnouncementOverlay.tsx`. Dismissal is NOT stored for the student session (students don't dismiss — they see current announcements; they don't control dashboard overlay dismissals). Return currently active announcements.

This hook is independent of `AnnouncementOverlay`, which uses `useAuth` (teacher context) — the student hook uses `orgId` from `useStudentAuth`.

#### 6c. `hooks/useStudentTeacherDirectory.ts` (new file)

```typescript
// Signature (Option 3):
export function useStudentTeacherDirectory(
  orgId: string | null,
  classIds: readonly string[]
): { teachers: TeacherDirectoryEntry[]; loading: boolean; error: Error | null };
```

Logic (Option 3): query `organizations/{orgId}/teacherDirectory` where `classlinkClassIds array-contains-any classIds`. Cap at 30 results. Sort by name client-side. If `classIds.length > 10`, chunk into multiple queries (Firestore `array-contains-any` max is 30 elements).

#### 6d. `components/student/sections/AnnouncementsSection.tsx` (new file)

Props: `announcements: Announcement[]`. Renders a list of announcement text cards, styled to match the student landing's light-mode palette (`bg-white`, border, rounded-2xl, matching brand-blue accent for the Bell icon). Title: "Announcements" (i18n key). Empty state: hidden (renders nothing if announcements is empty).

#### 6e. `components/student/sections/TeacherDirectorySection.tsx` (new file)

Props: `teachers: TeacherDirectoryEntry[]`, `loading: boolean`. Renders name + email as a mailto link per entry. Empty state while loading: skeleton. Empty state when no teachers: "No teachers found for your classes." Title: "Your teachers" (i18n key).

#### 6f. Wire into `StudentOverview` and `StudentClassView`

Both components accept a new optional prop:

```typescript
studentPage?: StudentPageConfig | null;
```

In the render body, compute the effective section order:

```typescript
const sectionOrder = studentPage?.sectionOrder ?? [
  'announcements',
  'assignments',
  'teacherDirectory',
];
```

Then map over `sectionOrder` and render each section conditionally, skipping `announcements` if `!studentPage?.showAnnouncements` and `teacherDirectory` if `!studentPage?.showTeacherDirectory`. The `assignments` section always renders.

`MyAssignmentsPage` calls `useOrgStudentPage(orgId)` (where `orgId` comes from `useStudentAuth`) and passes `studentPage` down. `useOrgStudentPage` uses `useAuth` — but the student page uses `useStudentAuth`, not `useAuth`. **This is a critical incompatibility**: `useOrgStudentPage` calls `useAuth()` internally to check `user` and `isAuthBypass`. On the student route, `AuthContext` is not mounted.

**Fix**: create `hooks/useStudentOrgPage.ts` — a student-specific variant that uses `useStudentAuth` for session gating and queries `organizations/{orgId}/studentPageConfig/default` directly via `onSnapshot` with the orgId from the student claim. It does not call `useAuth`.

#### 6g. `MyAssignmentsPage.tsx` modifications

Add `useStudentOrgPage(orgId)` call near the top of the component. Pass `studentPage` to `StudentOverview` and `StudentClassView`. Pass `onViewResults` callback managing `ResultsModal` open state. Render `<ResultsModal>` at the bottom of the JSX.

**Acceptance**: student sees sections in configured order; admin toggles reflect in student view on refresh; teacher directory shows only the student's class teachers; announcements section shows org-scoped active announcements.

---

### Phase 7 — i18n + Polish + PR

**Goal**: all new user-visible strings are i18n-registered.

Tasks:

- [ ] Audit all new student-surface strings added in Phases 5 and 6. Strings include: "Your teachers", "Announcements", "View results", "No teachers found for your classes.", results modal headers per kind, "Completed", "Not graded"
- [ ] Add keys to `locales/en.json`
- [ ] Mirror to `locales/de.json`, `locales/es.json`, `locales/fr.json` (machine-translation stubs acceptable, flagged for human review)
- [ ] Run `pnpm run validate` (type-check + lint + format-check + all unit tests)
- [ ] Manual check: SSO student sees hero + sections in configured order; teacher directory populated; PIN-flow student unaffected; admin section-order UI works; results CTA appears on correct rows only
- [ ] PR targets `dev-paul` (not `main`)

---

## 8. Data Flow

```
studentLoginV1 CF
  → mints { studentRole, orgId, classIds } on custom token
  → (Option 3: no change; Option 1: also mints buildingIds)

StudentAuthContext
  → exposes { orgId, classIds, pseudonymUid }

MyAssignmentsPage
  ├── useStudentOrgPage(orgId)
  │     → onSnapshot organizations/{orgId}/studentPageConfig/default
  │     → StudentPageConfig { sectionOrder, showAnnouncements, showTeacherDirectory, ... }
  ├── useStudentAssignments({ classIds })
  │     → 5-kind dual-query subscription
  │     → AssignmentSummary[] with showResultToStudent per row
  ├── useStudentClassDirectory({ classIds, pseudonymUid })
  │     → class name / teacher name lookup
  ├── useStudentAnnouncements(orgId) [new]
  │     → Announcement[] active for this org
  └── StudentOverview / StudentClassView
        → receives studentPage, announcements, teachers
        → renders sections in sectionOrder
             'announcements' → AnnouncementsSection
             'assignments'   → AssignmentSections (existing)
             'teacherDirectory' → TeacherDirectorySection
                                    → useStudentTeacherDirectory(orgId, classIds)
                                          → organizations/{orgId}/teacherDirectory
                                              where classlinkClassIds array-contains-any classIds

AssignmentListItem (completed row)
  → showResultToStudent === true → "View results" button
  → onClick → onViewResults(assignment) bubbles to MyAssignmentsPage
  → ResultsModal opens
       → getDoc(sessionCollection/sessionId/responses/pseudonymUid)
       → renders per-kind read-only summary

projectTeacherDirectoryV1 CF [new]
  organizations/{orgId}/members/{emailLower} onWrite
    → member.status === 'active' and member has uid
      → query users/{uid}/rosters for classlinkClassIds
      → upsert organizations/{orgId}/teacherDirectory/{emailLower}
            { email, name, classlinkClassIds, updatedAt }
    → member deleted or inactive
      → delete organizations/{orgId}/teacherDirectory/{emailLower}
```

---

## 9. Firestore Collections Impacted

| Collection                                                                                                            | Change                                                               | Rules Impact                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations/{orgId}/studentPageConfig/default`                                                                     | New fields (`sectionOrder`, `assignmentsDefaultFilter`)              | No rule change needed; existing rules cover `studentPageConfig` writes by domain+ admins                                                                             |
| `organizations/{orgId}/teacherDirectory/{emailLower}`                                                                 | New collection                                                       | New rule block required (see Phase 2)                                                                                                                                |
| `quiz_sessions`, `video_activity_sessions`, `guided_learning_sessions`, `activity_wall_sessions`, `mini_app_sessions` | New `showResultToStudent` field written by teacher on session create | Teacher update allowlist must permit `showResultToStudent` — check existing update rules for each session type. GL and AW may have restrictive `affectedKeys` guards |
| `firestore.indexes.json`                                                                                              | New composite index for `teacherDirectory`                           | Deploy required                                                                                                                                                      |

---

## 10. Cost + FERPA Considerations

**Teacher directory projection**: each teacher update in `organizations/{orgId}/members/{emailLower}` triggers the CF, which reads up to 50 roster docs. At class-scale (a district with 200 teachers, each changing records once per semester), this is low cost. The backfill runs once and is bounded by org size.

**Student query on teacher directory**: one Firestore read per student page load (bounded by `limit(30)`). Low cost.

**FERPA**: the teacher directory stores teacher name and email only. Teacher contact information is not student PII and is not covered by FERPA. The projection never stores student data. The student's `classIds` in their claim are opaque ClassLink sourcedIds, not names or emails.

**Announcements on student landing**: the existing announcement subscription for teachers (`AnnouncementOverlay`) is scoped to `orgId`. The new student-side hook mirrors this scope. No new PII surface.

**ResultsModal**: the student reads only their own response doc (keyed by their pseudonymUid). The modal never fetches or renders other students' data. Correct-answer fields (`correctAnswer`, `revealedAnswers`) are not rendered — the spec explicitly excludes them.

---

## 11. Testing Strategy

| Layer                          | What to Test                                                                                          | File                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Rules unit (emulator)          | teacherDirectory read by matching-org student; denied by non-matching org                             | `tests/rules/firestore-rules-teacher-directory.test.ts`        |
| Rules unit (emulator)          | Placeholder for deferred response-release gate (see Phase 2 note)                                     | `tests/rules/firestore-rules-responses-release.test.ts`        |
| Hook unit (vitest)             | `showResultToStudentFrom` per-kind with absent/true/false field values                                | Extend `hooks/useStudentAssignments` test file                 |
| Hook unit (vitest)             | `useStudentAnnouncements` returns only active announcements for the orgId                             | `hooks/useStudentAnnouncements.test.ts`                        |
| Hook unit (vitest)             | `useStudentTeacherDirectory` returns expected entries; handles empty classIds                         | `hooks/useStudentTeacherDirectory.test.ts`                     |
| CF unit (vitest in functions/) | `projectTeacherDirectoryV1` upserts on member active; deletes on inactive/deleted                     | `functions/src/projectTeacherDirectory.test.ts`                |
| Component render (vitest)      | `ResultsModal` renders quiz results without correctAnswer field                                       | `components/student/ResultsModal.test.tsx`                     |
| Component render (vitest)      | `AnnouncementsSection` renders correctly; hides when empty                                            | `components/student/sections/AnnouncementsSection.test.tsx`    |
| Component render (vitest)      | `TeacherDirectorySection` renders name + mailto link; shows skeleton during load                      | `components/student/sections/TeacherDirectorySection.test.tsx` |
| E2E (manual for this PR)       | SSO student landing: sections appear in configured order; "View results" only on released assignments | Document in PR description                                     |

---

## 12. Risks and Flags

**Risk 1 — `useOrgStudentPage` uses `useAuth`**: The student landing route does not mount `AuthProvider`, only `StudentAuthProvider`. Any attempt to call `useOrgStudentPage` from `MyAssignmentsPage` will throw or silently return nothing. A new `hooks/useStudentOrgPage.ts` is required that uses `useStudentAuth` and queries Firestore directly. Do not reuse `useOrgStudentPage` on the student route.

**Risk 2 — `AnnouncementOverlay` is not extractable without touching teacher auth**: `AnnouncementOverlay` calls `useAuth()` for `user`, `selectedBuildings`, `userTier`, `orgId`. None of these are available on the student route. The student announcements hook must be written from scratch. `isWithinActiveWindow` and the dismissal helpers in `AnnouncementOverlay.tsx` should be extracted to a shared util (e.g., `utils/announcementHelpers.ts`) so both paths reuse the same logic.

**Risk 3 — GL and AW session doc `showResultToStudent` write location**: Unlike Quiz/VA which have dedicated assignment-settings modals and a clear `sessionOptions` write path, GL session creation may be inline in the widget. Locate the exact `setDoc`/`addDoc` call that creates the GL session before implementing Phase 3 — it may be in `hooks/useGuidedLearningSession.ts` or in the GL widget itself.

**Risk 4 — Activity Wall `sessions` doc update rule**: `activity_wall_sessions/{sessionId}` update rule at `firestore.rules:4407` checks `sessionId.matches(request.auth.uid + '_.*')`. Adding `showResultToStudent` to the session doc in Phase 3 requires that the teacher write includes this field, which should pass the existing rule since the teacher owns the doc. Verify no `affectedKeys` whitelist on AW session updates.

**Risk 5 — CF trigger on `members` fires on every field update**: `organizationMembersSync` already short-circuits on non-admin-relevant changes. `projectTeacherDirectoryV1` should implement a similar short-circuit (check if `name`, `uid`, `status`, or `roleId` changed; skip otherwise) to avoid thrashing the teacher directory on irrelevant member field updates (e.g., `lastActive` updates).

**Risk 6 — `buildingIds` staleness (Option 1 only)**: if Paul chooses Option 1, document that a student's teacher directory will not update until the next token refresh (typically at most 1 hour, or on re-login). For mid-year roster changes this is acceptable.
