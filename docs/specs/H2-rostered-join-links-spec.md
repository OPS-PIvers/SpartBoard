# H2 — Rostered Sign-In Join Links for Student Activities

_Spec version: 2026-06-25. Author: architecture review (Claude). Scope: the "build the rostered-join path" follow-up described in `docs/wide-distro-plan.md` Phase 3b._

---

## 1. Current State Verification

### What the source doc claims vs. what the code actually has

The `docs/wide-distro-plan.md` Phase 3b status section (committed `885ea0b6`) says:

- **DONE:** `anonymous-join` global feature registered, admin UI, gated on Activity Wall widget.
- **KEY FINDING (plan doc):** Quiz, Video Activity, Guided Learning, and NextUp do NOT yet have a "rostered sign-in" link; the anonymous PIN URL is the only teacher-shared URL.

**Verification against the actual codebase confirms the plan doc's claim is accurate**, with additional nuance:

**Quiz** (`components/widgets/QuizWidget/Widget.tsx:1384`, `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx:854`) — The teacher UI provides exactly one student URL: `/quiz?code=<code>`. The `QUIZ_SSO_REDIRECT_ENABLED` flag at `config/constants.ts:16` is `false`. When enabled it _intercepts_ anonymous joiners on rostered sessions and steers them to `/student/login?next=/quiz?code=...`; that is a joiner-side gate, NOT a separate rostered link the teacher can share. The `ssoGate` state machine (`QuizStudentApp.tsx:304`) and the SSO auto-join effect (`QuizStudentApp.tsx:369-420`) are fully implemented on the student side.

**Video Activity** (`components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx:758`) — One link: `/activity/<sessionId>`. SSO auto-join path is fully implemented (`VideoActivityStudentApp.tsx:294-317`). No rostered link surface on the teacher side.

**Guided Learning** (`components/widgets/GuidedLearning/Widget.tsx:491`) — One link: `/guided-learning/<sessionId>`. No SSO support yet in `GuidedLearningStudentApp.tsx` — unlike Quiz and VideoActivity, GL has not been updated to detect `isStudentRole` and auto-join. The student app still does a direct `signInAnonymously` without checking claims (see `GuidedLearningStudentApp.tsx:62-99`).

**Activity Wall** (`components/widgets/ActivityWall/Widget.tsx:1800-1804`) — The confirmed TODO is present at line 1804, confirmed by reading the file. The `canOfferAnonymousJoin` gate already conditionally hides the anonymous copy-link and QR buttons. The rostered link slot in the grid is empty. `ActivityWallStudentApp.tsx` also does not check for `isStudentRole` or SSO auto-join.

**`resolveNextTarget`** (`utils/studentJoinRouting.ts:21-33`) — The allowlist only passes `/quiz` and `/join`. Paths `/activity`, `/guided-learning`, `/activity-wall/<id>` are not on the allowlist, so the `?next=` redirect-back mechanism at `/student/login` does not work for those three widgets. Extending the allowlist is required before building rostered links for them.

**Summary of actual remaining work:**
| Widget | SSO student-side | Teacher rostered link | `next=` redirect | AW compat gate |
|---|---|---|---|---|
| Quiz | Done (flag-off) | Missing | Works (`/quiz`) | N/A |
| Video Activity | Done (auto-join) | Missing | Broken (`/activity` not in allowlist) | N/A |
| Guided Learning | Not started | Missing | Broken | N/A |
| Activity Wall | Not started | Missing (TODO:1804) | Broken | Missing (`passesStudentClassGateCompat`) |

---

## 2. Architecture Decision

### Recommended approach: "Shared rostered link with `?next=` return"

Each widget's teacher share surface emits two parallel URLs:

- **Anonymous (existing):** the current URL, gated by `canAccessFeature('anonymous-join')`
- **Rostered:** `/student/login?next=<encoded-activity-url>` — routes the student through the PII-free GIS flow, lands them back on the activity URL, where the existing SSO auto-join path picks them up

This is the approach already proven in Quiz (`QuizStudentApp.tsx:692`). Extending it to the other three widgets requires:

1. Extending `resolveNextTarget` to accept the additional path prefixes
2. Implementing SSO detection and auto-join in `GuidedLearningStudentApp` and `ActivityWallStudentApp`
3. Surfacing both links in each widget's teacher UI
4. Migrating the Activity Wall Firestore rules to `passesStudentClassGateCompat`

**Rationale over alternatives:**

- **Alternative: dedicated `/student/join?widget=X&id=Y` endpoint** — unnecessary indirection; the existing pattern of `?next=` to the canonical widget URL composes correctly with SSO and doesn't require a new route.
- **Alternative: new `rosterJoinLink` field on session docs** — over-engineering; the rostered link is always `derivable` as `/student/login?next=<activity-url>`, making it purely a teacher UI concern, not a data-model concern.

**The recommended approach is zero-new-route, zero-new-schema.** The only data-model touch is the Activity Wall session doc (adding optional `classId`/`classIds` to an existing doc shape already handled by the rules follow-up noted in `docs/rules-followups.md:17-25`).

---

## 3. Open Decisions (Need Paul)

### Decision A: When to flip `QUIZ_SSO_REDIRECT_ENABLED` to `true`

**Context:** The flag exists (`config/constants.ts:16`, `false` today). When flipped, anonymous joiners on ClassLink-rostered quiz sessions are intercepted and offered Google sign-in by default, with a "use a PIN instead" escape. This is distinct from providing a rostered _link_ — it's a redirect on the anonymous path.

**Options:**

1. **Flip alongside this PR.** Maximizes SSO uptake for Quiz immediately; any in-progress quiz session at flip time changes its UX mid-session. Low risk if flipped between sessions.
2. **Keep off, build rostered link only.** Teachers explicitly share the rostered URL; anonymous link stays as-is. This is safer and matches what VA/GL/AW will have.
3. **Remove the flag entirely and standardize both widgets to the two-link model.** Cleanest long-term; the intercept pattern is a one-off that Quiz grew before the two-link model existed.

**Recommendation:** Option 2 for this PR. The two-link model (teacher explicitly shares both URLs) is consistent and auditable. The intercept (option 1) can be a separate feature-flag flip after the rostered link ships. Removes ambiguity about what "rostered join" means.

---

### Decision B: Teacher UX for the rostered link — inline vs. modal

**Context:** There are currently three teacher UI surfaces that emit the student URL per widget: (a) inline copy buttons on the widget front-face (Activity Wall), (b) a live-monitor header (Quiz `QuizLiveMonitor`), and (c) an archive row "Copy link" action (Quiz, VA, GL). Each would need to emit both links.

**Options:**

1. **Inline two-button row** (matches Activity Wall's current anonymous link treatment — grid grows from 3 cols to 4, or adds a row). Immediately visible, no modal friction.
2. **"Share" chevron triggers a small popover/sheet** showing both links with copy buttons and brief labels. One affordance leads to both; cleaner on smaller widget sizes.
3. **Keep inline anonymous link; add rostered link only in a dedicated "Rostered link" button** (two separate buttons in different visual groupings). Explicit separation reduces confusion about what each link does.

**Recommendation:** Option 2 (share popover) for all new surfaces. It scales to small widget sizes via container queries, avoids adding a fourth button to an already-tight row, and matches the mental model of "sharing options" rather than "two separate link types scattered across the UI." The Activity Wall already has an inline approach; for consistency update AW to use the popover too, or accept the divergence as acceptable for now (ActivityWall's three-button row is already established and known to teachers).

---

### Decision C: Session class-targeting requirement for the rostered link

**Context:** The Firestore `passesStudentClassGate` logic requires either (a) `isStudentRoleUser() == false` (anonymous) OR (b) the session's `classId`/`classIds` to contain a class from the student's token claims. If a session has no class targeting (no `classId`), the gate passes any SSO student — the token is the proof of "real student", not of class membership. If a session HAS a classId and the student's token doesn't include it, they are denied.

**Options:**

1. **Show the rostered link only when the session targets at least one ClassLink class.** Prevents a student from being denied by rules when clicking a rostered link for an untargeted session.
2. **Always show the rostered link.** Untargeted sessions will accept any SSO student (the gate is open); targeted sessions will filter correctly by class membership. Teacher just needs to understand the semantic.
3. **Show the rostered link always, but add a tooltip/label clarifying that students must be on the targeted class roster.**

**Recommendation:** Option 2 for the initial build. The rules already handle the untargeted-open case correctly (`passesStudentClassGate` returns true for untargeted sessions). Hiding the link based on class targeting adds complexity and an asynchronous data dependency to the share UI. Option 3 (label) is a UX improvement that can layer on top once the core feature ships.

---

## 4. Implementation Map

### Files to MODIFY

#### 4.1 `utils/studentJoinRouting.ts`

**Change:** Extend `resolveNextTarget`'s allowlist to include the three new activity paths.

The current allowlist (line 33) passes only `/quiz` and `/join`. Add:

- `/activity` (covers `/activity/<sessionId>`)
- `/guided-learning` (covers `/guided-learning/<sessionId>`)
- `/activity-wall` (covers `/activity-wall/<sessionId>`)

The path comparison must strip the query/hash before comparing, which the existing implementation already does. The `sessionId` portion rides in the path segment, not the query, so the prefix check `path === '/activity'` would fail for `/activity/SESSION_ID`. The logic must be updated to use `path.startsWith('/activity/')` (and similar) rather than exact equality. Audit this carefully — the current exact-match for `/quiz` and `/join` works because those routes use a `?code=` query param, not a path segment.

**TypeScript interface change:** none — pure logic.

#### 4.2 `utils/studentJoinRouting.test.ts`

**Change:** Add test cases for the new allowed paths and verify that path-segment variants (e.g. `/activity/SESSION123`) pass while non-activity paths (e.g. `/activity-wall/gallery/shareId`) remain blocked or are considered carefully.

#### 4.3 `components/guidedLearning/GuidedLearningStudentApp.tsx`

**Change:** Add SSO detection and auto-join, mirroring the pattern already in `VideoActivityStudentApp.tsx`:

1. After `auth.authStateReady()`, probe `user.getIdTokenResult()` for `claims.studentRole === true` and extract `classIds`.
2. Derive `isStudentRole: boolean` and `ssoClassIds: string[]`.
3. Pass them down to `StudentExperience` (or a new inner component).
4. In `StudentExperience`, add an auto-join `useEffect` that fires when `isStudentRole` is true, resolves the class period from the session's `classPeriodByClassId` map (same helper as VideoActivity's `resolveSsoClassPeriod`), and calls `submitResponse`/join without requiring PIN entry.
5. Gate the PIN prompt UI on `!isStudentRole`.

The GL session submission already uses `auth.uid` as the response doc ID (line 170 of the GL student app: `doc(db, GL_SESSIONS_COLLECTION, sessionId, 'responses', anonymousUid)`), which works correctly for both anonymous and SSO users since `anonymousUid` is set to `auth.currentUser.uid` in both cases. No response-doc-key change needed.

#### 4.4 `components/activityWall/ActivityWallStudentApp.tsx`

**Change:** Add SSO detection and SSO-specific identity resolution:

1. After `auth.authStateReady()`, probe claims for `studentRole` and extract `classIds`.
2. Derive `isStudentRole` and `ssoClassIds`.
3. When `isStudentRole` is true and the activity uses `identificationMode !== 'anonymous'`, populate `participantLabel` from a class-derived display hint (or leave it as a fixed string like `'Student'` since the SSO path deliberately avoids surfacing PII — the teacher sees responses keyed by `auth.uid` instead of a PIN).
4. When `isStudentRole` is true, skip the name/PIN collection form and submit directly, analogous to the Quiz SSO auto-join.

The Activity Wall submission doc does not have a response doc keyed by `auth.uid` today — submissions go into a Firestore collection under `activity_wall_sessions/{sessionId}/submissions/{submissionId}` where `submissionId` is an `addDoc` auto-ID. This means SSO students can submit multiple times (no de-dup). This is acceptable for the Activity Wall use case (posting a response is intentionally unrestricted; the wall accumulates entries). No structural change needed.

#### 4.5 `firestore.rules`

**Change 1 (required for AW rostered join):** Per `docs/rules-followups.md:17-25`, migrate `activity_wall_sessions/{sessionId}/submissions` from `passesStudentClassGate(awSessionClassId())` to `passesStudentClassGateCompat(awSessionClassIds(), awSessionClassId())`. Add the `awSessionClassIds()` helper function parallel to the existing `awSessionClassId()` function.

**Change 2 (AW session doc class targeting):** No rule change needed — the session doc's `classId` field is already read by the existing `awSessionClassId()` helper. Adding `classIds[]` support via the compat helper is the only touch needed.

**Change 3 (GL `resolveNextTarget` path):** No rules change; the `/guided-learning/:id` route already runs anonymous auth via `signInAnonymously` or SSO via custom token. The rules already handle both auth paths via `passesStudentClassGateCompat`.

#### 4.6 `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`

**Change:** In the live monitor header, surface a rostered join link alongside the existing `joinUrl` copy button.

At line 853-864, `joinUrl` is built as `/quiz?code=${session.code}` and `handleCopy` copies it. Add:

- `rosterJoinUrl`: `/student/login?next=${encodeURIComponent('/quiz?code=' + session.code)}`
- A second copy button or a small share popover (per Decision B)
- Gate the anonymous link on `canAccessFeature('anonymous-join')` — the monitor does not currently gate it, which is the un-gated surface the plan doc flagged

#### 4.7 `components/widgets/QuizWidget/Widget.tsx`

**Change:** In the two places that generate and copy the student link:

- Line 1384: post-assignment creation URL copy
- Line 1638: archive row "Copy link" action

Add the rostered link alongside the anonymous link. At minimum, after the existing anonymous link copy, add a second clipboard write or a toast that surfaces the rostered URL. Longer term (Decision B): use a share popover.

Also gate the anonymous link copy on `canAccessFeature('anonymous-join')` (same signal as ActivityWall). Currently neither line is gated.

#### 4.8 `components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx`

**Change:** At line 758, where `setViewOnlyShareLink` is set, the concept is "view-only share" not "rostered join" — leave this alone. Find the active-session copy-link surface (equivalent to QuizLiveMonitor's copy button for VA). Add the rostered link there. Gate the anonymous link on `canAccessFeature('anonymous-join')`.

#### 4.9 `components/widgets/GuidedLearning/Widget.tsx`

**Change:** At `handleAssignmentCopyLink` (line 486-498), add the rostered link. Gate the anonymous link on `canAccessFeature('anonymous-join')`.

#### 4.10 `components/widgets/ActivityWall/Widget.tsx`

**Change:** At lines 1800-1844 (the area with the confirmed TODO at 1804):

1. Add a "Rostered sign-in" button in the grid alongside or replacing the empty slot.
2. Wire the button to copy `/student/login?next=${encodeURIComponent('/activity-wall/' + activeSessionId)}` to clipboard.
3. The grid layout `canOfferAnonymousJoin ? 'grid-cols-3' : 'grid-cols-1'` needs updating to accommodate the rostered button always being present. Proposed: `grid-cols-2` when `canOfferAnonymousJoin` (anonymous + rostered), `grid-cols-1` when only rostered. "Share gallery" moves to a separate row or is visually grouped differently.
4. Requires `activeSessionId` to be available in scope — verify it is (it is, since `copyLink` at line 1808 is already in scope and uses it).

#### 4.11 `components/remote/controls/RemoteActivityWallControl.tsx`

**Change:** Mirror the Widget.tsx change — add the rostered link button alongside the existing `canOfferAnonymousJoin`-gated anonymous link section (lines 242-265).

### Files to CREATE

No new files are required for the core feature. If Decision B (share popover) is chosen for the teacher share UX, a new shared component `components/common/ShareOptionsPopover.tsx` is warranted to avoid duplicating the two-link popover UI across four widgets.

---

## 5. Data Flow

### Rostered join flow (end-to-end)

```
Teacher copies rostered URL
    ↓
"/student/login?next=/quiz?code=ABC123"
    ↓
StudentLoginPage mounts (App.tsx:768)
    → readNextTarget() validates ?next= against allowlist
    → GIS One-Tap / button flow
    → studentLoginV1 Cloud Function: verifies Google ID token, resolves org,
      looks up ClassLink classes, mints custom token
    → signInWithCustomToken(auth, customToken)
    → window.location.assign(next)  ← "/quiz?code=ABC123"
    ↓
QuizStudentApp mounts at /quiz?code=ABC123
    → auth.authStateReady() (hydrates IndexedDB — SSO token present)
    → user.getIdTokenResult() → studentRole:true, classIds:[...]
    → isStudentRole = true
    → QuizJoinFlow: ssoAutoJoinStartedRef fires
    → joinQuizSession(urlCode, undefined, undefined)
    → Response doc created at quiz_sessions/{sessionId}/responses/{auth.uid}
    ↓
Student sees questions; teacher sees them in QuizLiveMonitor
```

The same flow applies to `/activity/`, `/guided-learning/`, and `/activity-wall/` once `resolveNextTarget` allows those paths and the SSO auto-join is implemented in each student app.

### For Activity Wall specifically

```
Teacher copies rostered URL
    "/student/login?next=/activity-wall/TEACHER_UID_ACTIVITY_ID"
    ↓
StudentLoginPage → studentLoginV1 → custom token → redirect to /activity-wall/...
    ↓
ActivityWallStudentApp mounts
    → auth.authStateReady() → SSO token present
    → user.getIdTokenResult() → isStudentRole = true, classIds:[...]
    → payloadState: no ?data= param → Firestore read of activity_wall_sessions/{sessionId}
    → passesStudentClassGateCompat checks classIds intersection
    → Student skips name/PIN form
    → Submits directly with participantLabel derived from identificationMode config
```

---

## 6. Build Sequence (Phased)

Each phase is independently shippable and mergeable. Each can be a separate PR on `dev-paul`.

### Phase 1 — Tracer: Quiz rostered link (unblocks testing the full end-to-end)

- [ ] `utils/studentJoinRouting.ts`: No change needed for Quiz (it already works; `/quiz` is in the allowlist).
- [ ] `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`: Add rostered copy button next to the existing anonymous join URL copy. Gate the anonymous button on `canAccessFeature('anonymous-join')`.
- [ ] `components/widgets/QuizWidget/Widget.tsx`: Gate the post-assign clipboard write (line 1384) and archive "Copy link" (line 1638) on `canAccessFeature('anonymous-join')`; add a parallel "Rostered link" copy action.
- [ ] `config/constants.ts`: Keep `QUIZ_SSO_REDIRECT_ENABLED = false` for now (Decision A).
- [ ] Tests: Unit tests for the new share UI behavior; verify anonymous link is gated; verify rostered link resolves correctly.

**Acceptance criteria:** Teacher can copy a rostered quiz link from the live monitor. A student following the link through `/student/login` arrives at the quiz and is auto-joined as SSO (existing path). Anonymous link disappears from live monitor when `anonymous-join` feature is disabled.

### Phase 2 — Extend `resolveNextTarget` and Video Activity

- [ ] `utils/studentJoinRouting.ts`: Extend allowlist to pass `/activity/<anything>` (path-prefix check, not exact match).
- [ ] `utils/studentJoinRouting.test.ts`: Add test cases for the new paths.
- [ ] `components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx`: Add rostered link to the active-session share surface and gate the anonymous link.
- [ ] `components/remote/controls/RemoteActivityWallControl.tsx`: No VA remote control — skip.

**Acceptance criteria:** Student following `/student/login?next=/activity/SESSION_ID` lands on the video activity, `isStudentRole` is detected, SSO auto-join fires, student submits responses attributed to their SSO UID.

### Phase 3 — Guided Learning

- [ ] `utils/studentJoinRouting.ts`: Add `/guided-learning/<anything>` to the allowlist.
- [ ] `utils/studentJoinRouting.test.ts`: Test cases.
- [ ] `components/guidedLearning/GuidedLearningStudentApp.tsx`: Add SSO detection and auto-join mirroring VideoActivity pattern. Extract `resolveSsoClassPeriod` helper (or import from a shared utils location — the exact same function already lives in `VideoActivityStudentApp.tsx:52-69`; extract to `utils/ssoClassPeriodResolver.ts` so both share it).
- [ ] `components/widgets/GuidedLearning/Widget.tsx`: Add rostered link at `handleAssignmentCopyLink`; gate anonymous link.

**Acceptance criteria:** Student following `/student/login?next=/guided-learning/SESSION_ID` is auto-joined as SSO student; their response is attributed by SSO UID; existing PIN path unchanged.

### Phase 4 — Activity Wall (most complex)

- [ ] `firestore.rules`: Add `awSessionClassIds()` helper; migrate `submissions` create rule from `passesStudentClassGate(awSessionClassId())` to `passesStudentClassGateCompat(awSessionClassIds(), awSessionClassId())`. Deploy rules separately first.
- [ ] `utils/studentJoinRouting.ts`: Add `/activity-wall/<anything>` to the allowlist (but NOT `/activity-wall/gallery/` — the gallery is public, not a join destination). Carefully carve out the gallery path.
- [ ] `utils/studentJoinRouting.test.ts`: Test cases including the gallery-exclusion case.
- [ ] `components/activityWall/ActivityWallStudentApp.tsx`: Add SSO detection. When `isStudentRole`, skip name/PIN form, derive `participantLabel` based on `identificationMode` config (SSO student = no PII available, so: `anonymous` → `'Anonymous'`; `name` or `name-pin` → `'Student'` or `'Student (SSO)'`; `pin` → omit label). Submit directly.
- [ ] `components/widgets/ActivityWall/Widget.tsx`: Remove TODO comment at line 1804. Add "Rostered sign-in link" button. Adjust grid layout. Gate anonymous buttons on `canAccessFeature('anonymous-join')`.
- [ ] `components/remote/controls/RemoteActivityWallControl.tsx`: Add rostered link button mirroring Widget.tsx change.
- [ ] `tests/rules/`: Add test coverage for the `passesStudentClassGateCompat` AW submissions case.

**Acceptance criteria:** SSO student following an AW rostered link submits successfully; anonymous-join gate hides anonymous buttons; Firestore rules test suite green.

### Phase 5 — Gate the anonymous link on Quiz/VA/GL (completes the two-link model)

This phase is already partially done (Phase 1 gates the Quiz monitor). After phases 1-4, verify:

- [ ] All four widgets gate their anonymous links on `canAccessFeature('anonymous-join')` in every teacher surface (live monitor, archive row, widget front-face).
- [ ] When `anonymous-join` is disabled admin-side, only the rostered link is available (teachers with no rostered classes should see a hint that they need ClassLink setup, or just the rostered link with no notice if the admin has gated appropriately).
- [ ] Integration test: disable `anonymous-join` in test harness, verify anonymous buttons disappear across all four widgets.

---

## 7. TypeScript Snippets (load-bearing changes)

### 7.1 `utils/studentJoinRouting.ts` — updated `resolveNextTarget`

The critical change is path comparison. Current code uses strict equality (`path === '/quiz'`). For path-segment routes, use `startsWith`:

```typescript
const ALLOWED_NEXT_PATHS: readonly string[] = [
  '/quiz', // /quiz?code=... (query-param route, exact match still works)
  '/join', // /join (same)
];

const ALLOWED_NEXT_PATH_PREFIXES: readonly string[] = [
  '/activity/', // /activity/{sessionId}
  '/guided-learning/', // /guided-learning/{sessionId}
  '/activity-wall/', // /activity-wall/{sessionId}  — NOT /activity-wall/gallery/
];

export function resolveNextTarget(rawNext: string | null): string | null {
  if (!rawNext) return null;
  if (
    !rawNext.startsWith('/') ||
    rawNext.startsWith('//') ||
    rawNext.includes('\\')
  ) {
    return null;
  }
  const path = rawNext.split(/[?#]/)[0];
  // Explicit deny: gallery is a public view, not a student join destination
  if (path.startsWith('/activity-wall/gallery/')) return null;
  if (ALLOWED_NEXT_PATHS.includes(path)) return rawNext;
  if (ALLOWED_NEXT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)))
    return rawNext;
  return null;
}
```

### 7.2 `GuidedLearningStudentApp.tsx` — SSO detection additions

The root component's `init` function needs these additions inside the `auth.authStateReady()` / user-check block:

```typescript
let isStudentRole = false;
let ssoClassIds: string[] = [];
if (auth.currentUser && !auth.currentUser.isAnonymous) {
  const tokenResult = await auth.currentUser.getIdTokenResult();
  if (tokenResult.claims?.studentRole === true) {
    isStudentRole = true;
    const claimed = tokenResult.claims.classIds;
    if (Array.isArray(claimed)) {
      ssoClassIds = claimed.filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      );
    }
  }
}
```

These values must be threaded down to `StudentExperience` and used to conditionally skip the PIN form and auto-join (same pattern as `VideoActivityStudentApp.tsx:294-317`).

### 7.3 `firestore.rules` — AW sessions compat gate

Inside `match /activity_wall_sessions/{sessionId}/submissions/{submissionId}`:

```
// Add this helper alongside awSessionClassId():
function awSessionClassIds() {
  return get(/databases/$(database)/documents/activity_wall_sessions/$(sessionId)).data.get('classIds', []);
}

// In the allow create rule, replace:
//   passesStudentClassGate(awSessionClassId())
// with:
//   passesStudentClassGateCompat(awSessionClassIds(), awSessionClassId())
```

---

## 8. Firestore / Collection Impacts

### New fields on session docs

No new fields required on any session doc to support the rostered URL. The rostered link is derived from the session ID (already in the URL), not from any new field.

The Activity Wall case may optionally benefit from adding `classId` / `classIds` targeting to sessions so the `passesStudentClassGateCompat` check has something to gate against. If the AW teacher widget does not set `classId` on the session doc at activity-creation time, the compat gate falls through to the "open to any SSO student" branch — which is acceptable but means the rostered link does not enforce roster membership. This is a separate product question about whether AW assignment targeting should require a class selection step.

### Read cost implications

The `passesStudentClassGateCompat` function adds a second helper function `awSessionClassIds()` that calls `get()` on the parent session doc. Per `docs/rules-followups.md:1-13`, Firestore caches the doc within a single rule evaluation, so the second `get()` does not cost an additional read. No billing regression.

### `resolveNextTarget` security note

The extension to path-prefix matching must NOT accept arbitrary paths. The allowlist MUST remain a closed set of known student-activity routes. A path like `/activity-wall/gallery/shareId` being blocked is load-bearing — gallery is a public view, not a student login destination, and allowing `?next=/activity-wall/gallery/X` would be an open redirect to a non-auth-required page (harmless but misleading).

---

## 9. FERPA / Privacy Considerations

The rostered join path uses the existing `studentLoginV1` Cloud Function and `StudentAuthContext` architecture, which is already designed for FERPA compliance:

- No student email, name, or PII flows through Firestore.
- The custom token carries only `studentRole: true`, `orgId`, and `classIds` (class sourcedIds, not names or emails).
- The `participantLabel` stored in Activity Wall submissions when `isStudentRole` is true should NOT include any PII derived from the Google token. Use a fixed string (`'Student'`) or omit it entirely when `identificationMode === 'anonymous'`. For `identificationMode === 'name'` or `name-pin`, the teacher has already configured the session to collect names — the SSO path should either use the first name from `sessionStorage` (already stored for the `/my-assignments` greeting) or prompt the student to enter a display name. **Recommendation:** for this first implementation, treat all SSO Activity Wall submitters as `participantLabel = 'Student'` regardless of `identificationMode`. The teacher can identify them from the response doc's `auth.uid` if needed, and a future enhancement can add a display-name prompt.
- The idle-timeout guard (`useStudentIdleTimeout`) already fires on `/activity`, `/guided-learning`, and `/activity-wall` routes via `App.tsx`'s `StudentIdleTimeoutGuard`. Verify this does not conflict with SSO students who are not managed by `StudentAuthProvider` on those routes (they are not — `StudentAuthContext` only wraps `/my-assignments`; those routes mount the guard directly). The idle guard on non-`/my-assignments` routes calls `signOut(auth)` and redirects to `/student/login`, which is correct behavior for an SSO student who walked away.

---

## 10. Testing Strategy

### Unit tests

- `utils/studentJoinRouting.test.ts`: Full coverage of the updated allowlist including gallery exclusion, path-with-sessionId cases, and the existing attack vectors (open-redirect tests must still pass).
- `GuidedLearningStudentApp` SSO detection: mock `auth.authStateReady()` + `getIdTokenResult()` returning `studentRole: true`; verify auto-join effect fires and PIN form is not rendered.
- `ActivityWallStudentApp` SSO detection: same pattern; verify submission goes through without PIN/name form.

### Firestore rules tests (`tests/rules/`)

Per `CLAUDE.md`, run via `pnpm run test:rules` (Firestore emulator). Add test cases:

- `activity_wall_sessions/{sessionId}/submissions`: SSO student with matching `classId` claim can create submission.
- `activity_wall_sessions/{sessionId}/submissions`: SSO student without matching `classId` is denied.
- `activity_wall_sessions/{sessionId}/submissions`: Anonymous student (no `studentRole` claim) can still create (passthrough behavior preserved).
- `activity_wall_sessions/{sessionId}/submissions`: SSO student with untargeted session (no `classId` on session doc) can create (open-to-any-SSO branch).

### Integration smoke test (manual, pre-merge)

The emulator cannot run locally (see `MEMORY.md` test gotchas). Before merging Phase 4 (AW rules change), verify against the dev Firebase project:

1. Create an AW activity targeting a ClassLink class.
2. Copy rostered link → open in incognito → student login → verify redirect back to AW → verify submission lands in Firestore.
3. Disable `anonymous-join` in admin → verify anonymous buttons hidden → only rostered link visible.

---

## 11. Risks

| Risk                                                                                     | Likelihood                                                                 | Mitigation                                                                     |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `resolveNextTarget` path-prefix match introduces open redirect                           | Low — allowlist is closed                                                  | Add gallery-exclusion test; code review on the allowlist                       |
| GL `anonymousUid` variable name confusion after SSO addition                             | Medium — SSO user's UID is passed as `anonymousUid` to `StudentExperience` | Rename the prop/state to `participantUid` at the same time as the SSO addition |
| AW submission identified by `auth.uid` but teacher UI uses `participantLabel`            | Low — AW has no per-student response view today                            | Document behavior; not a functional regression                                 |
| `QUIZ_SSO_REDIRECT_ENABLED` stays `false` but someone flips it without the rostered link | Low — guarded by constant                                                  | Add comment at flag site: "flip only after H2 rostered link ships per spec"    |
| Firestore rules compat gate breaks existing AW anonymous submissions                     | Very low — `!isStudentRoleUser()` path bypasses class check entirely       | Rules test suite covers anonymous path                                         |
| `StudentIdleTimeoutGuard` on activity routes signs out SSO students on idle              | Low but intentional — shared Chromebook hygiene                            | No mitigation needed; desired behavior                                         |

---

## 12. Files Summary

**Modify:**

- `/utils/studentJoinRouting.ts` — extend allowlist (Phase 2+)
- `/utils/studentJoinRouting.test.ts` — new test cases
- `/components/guidedLearning/GuidedLearningStudentApp.tsx` — SSO detection + auto-join (Phase 3)
- `/components/activityWall/ActivityWallStudentApp.tsx` — SSO detection + form bypass (Phase 4)
- `/firestore.rules` — AW `passesStudentClassGateCompat` migration (Phase 4)
- `/components/widgets/QuizWidget/components/QuizLiveMonitor.tsx` — rostered link button + anonymous gate (Phase 1)
- `/components/widgets/QuizWidget/Widget.tsx` — rostered link in post-assign and archive copy actions + anonymous gate (Phase 1)
- `/components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx` — rostered link + anonymous gate (Phase 2)
- `/components/widgets/GuidedLearning/Widget.tsx` — rostered link + anonymous gate (Phase 3)
- `/components/widgets/ActivityWall/Widget.tsx` — replace TODO:1804 with rostered button + gate anonymous buttons (Phase 4)
- `/components/remote/controls/RemoteActivityWallControl.tsx` — rostered button (Phase 4)
- `/tests/rules/` — AW submission rules test cases (Phase 4)

**Optionally create:**

- `/components/common/ShareOptionsPopover.tsx` — if Decision B (share popover) is chosen; avoids 4-way duplication of the two-link popover UI
- `/utils/ssoClassPeriodResolver.ts` — extract shared `resolveSsoClassPeriod` helper from `VideoActivityStudentApp.tsx:52-69` so GL can reuse it (Phase 3)
