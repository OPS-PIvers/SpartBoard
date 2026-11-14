# Plan 008: Student home waits for turn-in checks, warns before an idle sign-out, and "Results locked" has a way back

- **Priority**: P2 · **Effort**: M · **Risk**: MED · **Depends on**: none
- **Category**: bug (misleading state, dead end)
- **Planned at**: commit `9a9dd678`, 2026-11-14

## Why this matters

1. Every time a student returns to `/my-assignments` from an activity, work
   they just finished shows under to-do with an "Open" button, then jumps to
   Completed a moment later. Whether a row is done is read from the student's
   own response document, one read per assignment, after the page has already
   rendered. Students tap the row again or think it did not submit.
2. A student who reads or watches without touching the device is signed out
   after 15 minutes with no warning.
3. The "Results locked" screen has no button; the only exit is the browser's
   Back control.

## Current state

- `hooks/useStudentTurnIns.ts`: `useStudentTurnIns(assignments, pseudonymUid)` returns `{ checks, recheck }`. In an effect it reads `readStudentResponseDoc(a, pseudonymUid)` once for each assignment where `a.workKind === 'work' && !isClosedProjectRun(a) && hasResponseDoc(a.kind)`, and on success does `setChecks((prev) => ({ ...prev, [a.compositeId]: toCheck(a, data) }))`. On failure it only does `ids.delete(a.compositeId)` (comment: "A failed read leaves the row unchecked, never Missing; a later snapshot retries it.").
- `components/student/landing/StudentLandingV2.tsx` calls the hook (`const { checks, recheck } = useStudentTurnIns(assignments, pseudonymUid);`) and builds `partitionLanding(assignments, checks, nowMs)`.
- `components/student/MyAssignmentsPage.tsx` renders a loading screen while `loadState === 'loading' || directory.status === 'loading' || bell.status === 'loading'`, then renders `<StudentLandingV2 … />`.
- `utils/studentLanding.ts` `landingRowState` treats a missing check as not turned in (`return turnIn === 'in-progress' ? 'in-progress' : 'open';`).
- `hooks/useStudentIdleTimeout.ts`: `useStudentIdleTimeout(enabled, redirectPath)` returns nothing. Inside its effect, `scheduleTimeout(delay)` arms one timer; `onTimeout` computes `remaining = lastActive + STUDENT_IDLE_TIMEOUT_MS - now` (using this tab's `lastInteractionAt` and the cross-tab `readSharedActivity()`), re-arms when `remaining > 0`, else calls `triggerIdleSignOut()`. `handleInteraction` (throttled to once per 5 seconds) records activity and re-arms. `STUDENT_IDLE_TIMEOUT_MS` is 15 minutes.
- The hook is called in two places: `context/StudentAuthContext.tsx` (`useStudentIdleTimeout(!isAuthBypass && state.status === 'authenticated');`, for `/my-assignments`) and `components/student/StudentIdleTimeoutGuard.tsx` (`useStudentIdleTimeout(isStudentRole); return null;`, mounted on activity pages).
- `components/student/ResultsProtectionGate.tsx`: when `tabWarningEnabled && lockedOut` it renders a full-screen card with the heading `Results locked` and one paragraph, nothing else. It is rendered by `components/videoActivity/VideoActivityStudentApp.tsx`, `components/flashcards/FlashcardCheckResults.tsx` and `components/guidedLearning/GuidedLearningStudentApp.tsx`.
- These files are hard-coded English (no `t()`); keep new strings in English.

## Scope

**In scope**: `hooks/useStudentTurnIns.ts`, `components/student/landing/StudentLandingV2.tsx`,
`components/student/MyAssignmentsPage.tsx`, `hooks/useStudentIdleTimeout.ts`,
`components/student/StudentIdleWarning.tsx` (create),
`components/student/StudentIdleTimeoutGuard.tsx`, `context/StudentAuthContext.tsx`
(only the idle hook call and rendering the warning), `components/student/ResultsProtectionGate.tsx`,
one-line call-site edits in `components/videoActivity/VideoActivityStudentApp.tsx`
and `components/flashcards/FlashcardCheckResults.tsx`, and tests:
`components/student/MyAssignmentsPage.test.tsx`, `tests/hooks/useStudentIdleTimeout.test.ts`,
a new `tests/hooks/useStudentTurnIns.test.ts`, a new test for the gate.

**Out of scope**: `utils/studentLanding.ts` (row classification stays as is),
`hooks/useStudentAssignments.ts`, `components/student/landing/LandingRows.tsx`
and `StudentLandingLayout.tsx`, `components/student/landing/StudentLandingSample.tsx`
except for passing the new props it now needs (if it renders `StudentLandingV2`;
if it does not, leave it), the idle timeout length, `GuidedLearningStudentApp.tsx`,
`firestore.rules`, `functions/`.

## Steps

### Step 1: The hook reports when the first checks have settled

In `hooks/useStudentTurnIns.ts`:

1. Add state `const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());` and, in the existing `.catch`, after `ids.delete(a.compositeId)`, add the id: `setFailed((prev) => new Set(prev).add(a.compositeId));`.
2. Compute during render (no effect):

   ```ts
   const settled = assignments.every(
     (a) =>
       a.workKind !== 'work' ||
       isClosedProjectRun(a) ||
       !hasResponseDoc(a.kind) ||
       a.compositeId in checks ||
       failed.has(a.compositeId)
   );
   ```

3. Return `{ checks, recheck, settled }`. With no `pseudonymUid` the effect never reads, so return `settled: true` in that case.

### Step 2: The page keeps its loading screen until checks settle, once

1. Move the hook call up: call `useStudentTurnIns(assignments, pseudonymUid)` in `MyAssignmentsPage.tsx` (it must be called before any early `return`, next to the other hooks) and pass `checks` and `recheck` to `StudentLandingV2` as new required props; remove the call from `StudentLandingV2.tsx` and take them from props. Use the same `assignments` and `pseudonymUid` values the page already passes to `StudentLandingV2`.
2. In the page, latch readiness so later snapshots never bring the loading screen back, and never wait longer than 4 seconds:

   ```tsx
   const [checksReady, setChecksReady] = useState(false);
   const loaded =
     loadState !== 'loading' &&
     directory.status !== 'loading' &&
     bell.status !== 'loading';
   if (loaded && turnIns.settled && !checksReady) setChecksReady(true);
   useEffect(() => {
     if (!loaded || checksReady) return;
     const id = window.setTimeout(() => setChecksReady(true), 4000);
     return () => window.clearTimeout(id);
   }, [loaded, checksReady]);
   ```

   (the `if … setChecksReady(true)` line is the repo's "adjust state while rendering" pattern and belongs with the hooks, before any early return). Change the existing loading condition to also show the loading screen while `!checksReady`, but only on the branch where the page would otherwise render `StudentLandingV2`: the error and no-classes screens must still appear as they do today without waiting.

### Step 3: Warn one minute before the idle sign-out

1. `hooks/useStudentIdleTimeout.ts`:
   - Export `export const STUDENT_IDLE_WARNING_MS = 60 * 1000;`.
   - Add state inside the hook, `const [warning, setWarning] = useState(false);`, and return `{ warning }` from the hook (it returned nothing before, so existing callers keep working).
   - In `onTimeout`, replace the two-way branch with three: if `remaining > STUDENT_IDLE_WARNING_MS` → `setWarning(false)` and `scheduleTimeout(remaining - STUDENT_IDLE_WARNING_MS)`; else if `remaining > 0` → `setWarning(true)` and `scheduleTimeout(remaining)`; else `triggerIdleSignOut()`.
   - Change the first arm and the re-arm in `handleInteraction` from `scheduleTimeout()` (15 minutes) to `scheduleTimeout(STUDENT_IDLE_TIMEOUT_MS - STUDENT_IDLE_WARNING_MS)`, and have `handleInteraction` call `setWarning(false)`. Update `scheduleTimeout`'s default parameter to match.
   - On cleanup and when `enabled` is false the warning must be false: derive the returned value as `enabled && warning`.

   Sign-out still happens exactly 15 minutes after the last activity; the timer now stops once on the way, 60 seconds early, to raise the warning. Activity in another tab still counts, because `onTimeout` recomputes `remaining` from the shared timestamp each time it fires.

2. Create `components/student/StudentIdleWarning.tsx`:

   ```tsx
   import React from 'react';

   /** Shown for the last minute before an idle sign-out; any tap or key press dismisses it. */
   export const StudentIdleWarning: React.FC<{ visible: boolean }> = ({
     visible,
   }) =>
     visible ? (
       <div
         role="alertdialog"
         aria-modal="false"
         aria-labelledby="student-idle-title"
         className="fixed inset-x-0 bottom-0 z-[1000] flex justify-center p-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]"
       >
         <div className="w-full max-w-sm rounded-2xl border border-amber-300 bg-white p-4 text-center shadow-xl">
           <p
             id="student-idle-title"
             className="text-base font-bold text-slate-900"
           >
             Still there?
           </p>
           <p className="mt-1 text-sm text-slate-600">
             You will be signed out in 1 minute.
           </p>
           {/* no-tour-anchor: student screen; live tours walk teachers. */}
           <button
             type="button"
             className="mt-3 min-h-[44px] w-full rounded-xl bg-brand-blue-primary px-4 text-sm font-bold text-white hover:bg-brand-blue-dark"
           >
             Stay signed in
           </button>
         </div>
       </div>
     ) : null;
   ```

   The button needs no handler: the click is itself activity, which the hook's capture-phase listener records and which clears the warning. Check the repo's z-index conventions (search `z-[` in `components/student/` and `tailwind.config.js`) and use an existing top-layer value instead of `z-[1000]` if one is defined.

3. `StudentIdleTimeoutGuard.tsx`: `const { warning } = useStudentIdleTimeout(isStudentRole); return <StudentIdleWarning visible={warning} />;`
4. `context/StudentAuthContext.tsx`: capture `const { warning: idleWarning } = useStudentIdleTimeout(…same argument…);` and render `<StudentIdleWarning visible={idleWarning} />` as a sibling after `{children}` inside the provider's returned JSX.

### Step 4: "Results locked" gets a way back

1. `ResultsProtectionGate.tsx`: add an optional prop `backHref?: string`. In the locked card, after the paragraph, when `backHref` is set render:

   ```tsx
   {
     /* no-tour-anchor: student screen; live tours walk teachers. */
   }
   <a
     href={backHref}
     className="inline-flex min-h-[44px] items-center rounded-full bg-brand-blue-primary px-5 text-sm font-bold text-white hover:bg-brand-blue-dark"
   >
     Back to my assignments
   </a>;
   ```

2. `VideoActivityStudentApp.tsx`: on its `<ResultsProtectionGate`, add `backHref={isStudentRole ? '/my-assignments' : undefined}` (`isStudentRole` is a prop of that component).
3. `FlashcardCheckResults.tsx`: add `backHref="/my-assignments"` only if this component is reached solely from the signed-in assignment page (`FlashcardAssignmentPage`). Confirm with a grep of its imports; if it is also used elsewhere, add an optional `backHref` prop to it and pass `/my-assignments` from `FlashcardAssignmentPage` only (that file is then in scope for that one line).

## Test plan

- `tests/hooks/useStudentTurnIns.test.ts` (new; mock `@/utils/studentResponseDoc` so `readStudentResponseDoc` returns controllable promises and `hasResponseDoc` returns true for `quiz`): `settled` is false while a read is pending and true after it resolves; a rejected read also settles; an assignment kind with no response doc does not block; no `pseudonymUid` → settled.
- `components/student/MyAssignmentsPage.test.tsx` (existing; follow its mocks, adding a mock for the hook or for `readStudentResponseDoc`): the loading screen stays while checks are pending and the list appears once they settle; with a read that never resolves, the list appears after 4 seconds (fake timers); after the list has appeared, a new pending check does not bring the loading screen back.
- `tests/hooks/useStudentIdleTimeout.test.ts` (existing, fake timers): `warning` is false at 13 minutes 59 seconds, true at 14 minutes, sign-out still fires at 15 minutes; an interaction during the warning clears it and sign-out moves 15 minutes out; with `enabled` false `warning` stays false.
- New gate test: locked with `backHref` shows a link to it; locked without shows no link.

## Done criteria

- [ ] `pnpm exec vitest run --maxWorkers=2 components/student tests/components/student tests/hooks/useStudentIdleTimeout.test.ts tests/hooks/useStudentTurnIns.test.ts tests/context/StudentAuthContext.test.tsx tests/components/videoActivity components/flashcards tests/copyGuard.test.ts` exits 0 with the new tests present.
- [ ] `pnpm run check:tour-anchors` exits 0.
- [ ] `grep -rn "useStudentTurnIns(" components | grep -v test` shows exactly one call, in `MyAssignmentsPage.tsx`.
- [ ] `git diff 9a9dd678 -- utils/studentLanding.ts` is empty.
- [ ] `git status --short` shows only in-scope files.

## STOP conditions

- `StudentLandingV2` is rendered somewhere other than `MyAssignmentsPage` in a way that cannot simply be given `checks` and `recheck` (a dev harness fixture passing an empty map and a no-op is fine; say so in NOTES).
- The hook call cannot be placed before every early return in `MyAssignmentsPage`.
- An existing idle-timeout test that asserts sign-out at exactly 15 minutes fails after Step 3 (the total must not change).
- More than 5 existing tests fail, or a verification fails twice.

## Maintenance notes

- The loading screen can now last up to 4 seconds longer on a very slow connection. It replaces a list that was wrong for that same period.
- A row whose check fails to load is shown as before (not turned in); that was the existing fallback.
- Guided Learning's "Results locked" screen still has no back link (its app was out of scope here).
