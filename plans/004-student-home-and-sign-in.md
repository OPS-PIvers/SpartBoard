# Plan 004: Student sign-in recovers from errors and stays signed out, and assignment rows say what they are in words

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan
> in `plans/README.md`, unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat db70831b..HEAD -- components/student/StudentLoginPage.tsx components/student/landing/LandingRows.tsx hooks/useStudentIdleTimeout.ts context/StudentAuthContext.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Line numbers below are from commit
> `db70831b`; always locate code by the quoted text, not the number.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `db70831b`, 2026-11-14

## Why this matters

Signed-in students reach their work through `/student/login` and
`/my-assignments`. Three problems sit on that path:

1. **"Try again" on the sign-in page does nothing.** It sets the page to
   "Loading sign-in…" but the code that sets up Google sign-in never runs
   again, so the spinner stays forever. A student sent back with "no classes
   found" never gets a sign-in button at all.
2. **Signing out may not stick.** The page asks Google to auto-select the
   account and shows the One Tap prompt on every load. On a Chromebook still
   signed in to Google, a student who presses Sign out, or who is signed out
   for inactivity on a shared device, can be signed straight back in. The
   Google API has a call to prevent this (`disableAutoSelect`) that the code
   declares but never uses. A student signed out for inactivity is also given
   no explanation.
3. **Assignment rows rely on icons and colour.** The to-do list shows what
   kind of activity each row is by icon only (hidden from screen readers), a
   past due date reads "Due Mon, Nov 10" exactly like a future one, finished
   work that is never graded says "Not graded yet" forever, and on phones the
   separator dots wrap onto lines of their own.

## Current state

Files:

- `components/student/StudentLoginPage.tsx` (537 lines): the Google sign-in page for students.
- `hooks/useStudentIdleTimeout.ts`: signs a student out after 15 minutes of inactivity and redirects to the sign-in page.
- `context/StudentAuthContext.tsx`: the student `signOut` function.
- `components/student/landing/LandingRows.tsx` (599 lines): the rows on the student home. `WorkRow` is a to-do row; `DoneRow` is a finished row.
- Tests to follow: `components/student/landing/WorkRow.test.tsx`, `components/student/landing/LandingRows.test.tsx`, `tests/hooks/useStudentIdleTimeout.test.ts`, `tests/context/StudentAuthContext.test.tsx`.

### Sign-in page

Initial status and the redirect reason reader (`StudentLoginPage.tsx`, about lines 230 and 255):

```tsx
function readInitialBounceReason(): ErrorKind | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('reason');
    if (reason === 'no-classes') return 'not-in-roster';
    return null;
  } catch {
    return null;
  }
}
...
  const [status, setStatus] = useState<Status>(() => {
    if (!clientId) return { kind: 'error', error: 'config-missing' };
    const bounceError = readInitialBounceReason();
    if (bounceError) return { kind: 'error', error: bounceError };
    return { kind: 'loading-sdk' };
  });
```

The setup effect (about line 332). Its dependency list never changes, so it runs once:

```tsx
  useEffect(() => {
    if (!clientId) return;
    if (status.kind === 'error' && status.error !== 'config-missing') return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 50; // ~5s at 100ms intervals

    const init = () => {
      const idApi = window.google?.accounts?.id;
      if (!idApi) return false;

      idApi.initialize({
        client_id: clientId,
        callback: handleCredential,
        auto_select: true,
        ...
      });
      ...
      // Try One-Tap. If it's suppressed the fallback button remains available.
      idApi.prompt();

      if (!cancelled) setStatus({ kind: 'ready' });
      return true;
    };
    ...
    // `handleCredential` is stable via useCallback; intentionally not reinit-ing
    // GIS on status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, handleCredential]);

  const handleRetry = useCallback(() => {
    setStatus(
      !clientId
        ? { kind: 'error', error: 'config-missing' }
        : { kind: 'loading-sdk' }
    );
  }, [clientId]);
```

The Google API type already declares the unused method (about line 65):

```tsx
interface GsiIdApi {
  initialize(options: GsiInitializeOptions): void;
  prompt(listener?: (notification: unknown) => void): void;
  renderButton(parent: HTMLElement, config: GsiButtonConfig): void;
  cancel(): void;
  disableAutoSelect(): void;
}
```

The page renders `<StatusContent status={status} buttonContainerRef={buttonContainerRef} onRetry={handleRetry} />` inside its card.

### Where students are sent after sign-out

`hooks/useStudentIdleTimeout.ts`:

```ts
export const STUDENT_LOGIN_PATH = '/student/login';
...
export function useStudentIdleTimeout(
  enabled: boolean,
  redirectPath: string = STUDENT_LOGIN_PATH
```

and, inside it, `window.location.assign(redirectPath);` in `triggerIdleSignOut`. Both callers (`context/StudentAuthContext.tsx` and `components/student/StudentIdleTimeoutGuard.tsx`) use the default path.

`context/StudentAuthContext.tsx`, in `signOut` (about line 306), calls `window.location.assign(STUDENT_LOGIN_PATH);` in two places (the auth-bypass branch and the `finally` block).

### Assignment rows

`LandingRows.tsx`, the helpers (about lines 59 to 100):

```tsx
const kindLabel = (a: AssignmentSummary): string => {
  const base = KIND_CONFIG[a.kind].label;
  if (a.kind !== 'flashcards' || !a.flashcardKind) return base;
  return `${base} · ${a.flashcardKind === 'check' ? 'Check' : 'Study'}`;
};
...
const Dot: React.FC = () => (
  <span aria-hidden="true" className="text-slate-300">
    ·
  </span>
);
```

`dueLine` (about line 158):

```tsx
function dueLine(row: LandingRow, nowMs: number): React.ReactNode {
  const a = row.assignment;
  if (row.state === 'missing-open') {
    const was = a.dueAt !== undefined ? ` · was due ${fmtDay(a.dueAt)}` : '';
    const closes =
      a.closeAt !== undefined ? `, closes ${fmtDay(a.closeAt)}` : '';
    return (
      <>
        <span className="font-semibold text-rose-700">
          Missing · still open
        </span>
        <span className="text-slate-500">
          {was}
          {closes}
        </span>
      </>
    );
  }
  if (row.state === 'upcoming' && a.openAt !== undefined) {
    return <span className="text-slate-500">{formatOpensLabel(a.openAt)}</span>;
  }
  if (a.dueAt === undefined) {
    return <span className="text-slate-500">No due date</span>;
  }
  const label = formatDueLabel(a.dueAt, nowMs);
  return label.startsWith('Due today') ? (
    <span className="font-semibold text-slate-800">{label}</span>
  ) : (
    <span className="text-slate-500">{label}</span>
  );
}
```

`formatDueLabel` returns `Due today, 3:00 PM` for today and `Due Mon, Nov 10` for any other day, past or future.

The `WorkRow` meta line (about line 225):

```tsx
<span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
  {cls && (
    <>
      <ClassMark cls={cls} />
      <Dot />
    </>
  )}
  {dueLine(row, nowMs)}
  {row.state === 'in-progress' && (
    <>
      <Dot />
      <span className="text-sky-700">In progress</span>
    </>
  )}
  {periodLocked && (
    <>
      <Dot />
      <span className="text-slate-500">
        {periodOpensAt != null
          ? formatOpensLabel(periodOpensAt)
          : 'Not started yet'}
      </span>
    </>
  )}
</span>
```

The end of `completedRight`, used by `DoneRow` (about line 421):

```tsx
return item.row && areResultsShared(item.row.assignment, check, nowMs) ? (
  <span className="text-xs font-semibold text-brand-blue-primary">
    View results
  </span>
) : (
  <span className="text-xs text-slate-500">Not graded yet</span>
);
```

`item.kind` is a `SessionKind`: `'quiz' | 'video-activity' | 'guided-learning' | 'mini-app' | 'activity-wall' | 'flashcards' | 'projects'`. In `hooks/useStudentAssignments.ts`, the kinds `video-activity`, `mini-app`, `activity-wall` and `projects` are configured with `gradingStateFrom: () => 'not-graded'`: they are never graded.

Repo conventions that apply:

- **Comments are one short line at most.**
- **`useEffect` only to sync with an external system.** The Google sign-in SDK qualifies.
- **UI copy**: no em dashes, no "Tip:" or "Note:", under 30 words per string. These student pages are hard-coded English today (no `t()`); keep new strings in English in the code to match.
- **Muted text on these light pages** uses `text-slate-500` or darker for real text.
- **Never run** `pnpm run validate`, full `pnpm run lint`, full `pnpm run test` or `tsc`.

## Commands you will need

| Purpose                                     | Command                                          | Expected on success |
| ------------------------------------------- | ------------------------------------------------ | ------------------- |
| Install (only if `node_modules` is missing) | `pnpm run install:all`                           | exit 0              |
| One test file                               | `pnpm exec vitest run <path>`                    | all pass            |
| Tests for changed files                     | `pnpm exec vitest related --run <changed files>` | all pass            |
| Copy rules                                  | `pnpm exec vitest run tests/copyGuard.test.ts`   | all pass            |
| Tour anchors                                | `pnpm run check:tour-anchors`                    | exit 0              |
| Types (once, at the end)                    | `pnpm run type-check`                            | exit 0              |

Do not put `--` between the script name and its flags.

## Scope

**In scope** (the only files you should modify):

- `components/student/StudentLoginPage.tsx`
- `hooks/useStudentIdleTimeout.ts`
- `context/StudentAuthContext.tsx` (the two redirect lines in `signOut` only)
- `components/student/landing/LandingRows.tsx`
- `components/student/landing/WorkRow.test.tsx`
- `components/student/landing/LandingRows.test.tsx`
- `tests/hooks/useStudentIdleTimeout.test.ts`
- `tests/context/StudentAuthContext.test.tsx`
- `tests/components/student/StudentLoginPage.test.tsx` (create)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- `utils/studentLanding.ts`, `utils/studentTurnIn.ts`, `hooks/useStudentAssignments.ts`, `hooks/useStudentTurnIns.ts`: no change to how rows are classified, sorted or loaded. This plan changes wording and layout only.
- The idle timeout length and its activity detection.
- `components/student/landing/StudentLandingSample.tsx` (fixture data) and `StudentLandingLayout.tsx`.
- `components/student/StudentPageShell.tsx`, `ResultsProtectionGate.tsx`.
- The teacher sign-in page and `functions/`.
- Translating these pages. Separate, larger work.

## Git workflow

- Branch from `origin/dev-paul`: `git fetch origin dev-paul && git checkout -b claude/student-home-and-sign-in origin/dev-paul`.
- Commit message style from `git log`: `Keep menus open when an unrelated pane scrolls during live tours`. Use `Student sign-in: ...` and `Student home: ...`.
- Pull requests target `dev-paul`, never `main`. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make "Try again" on the sign-in page work

In `StudentLoginPage.tsx`:

1. Add state: `const [retryNonce, setRetryNonce] = useState(0);`
2. In `handleRetry`, after the `setStatus(...)` call, add `setRetryNonce((n) => n + 1);`
3. Add `retryNonce` to the setup effect's dependency list: `[clientId, handleCredential, retryNonce]`. Keep the existing `eslint-disable-next-line` comment above it.

Why this is enough: when "Try again" is pressed, `status` becomes `loading-sdk` in the same update as the nonce changes, so on the re-run the effect's early `return` for an error status does not fire and `init` runs. Leave that early `return` line unchanged; it keeps the first load from prompting a student who was just told they have no classes.

**Verify**: covered by the new test file in Step 3.

### Step 2: Stay signed out after Sign out or an idle timeout

1. `hooks/useStudentIdleTimeout.ts`: add below `STUDENT_LOGIN_PATH`:
   ```ts
   export const STUDENT_IDLE_LOGIN_PATH = `${STUDENT_LOGIN_PATH}?reason=idle`;
   export const STUDENT_SIGNED_OUT_LOGIN_PATH = `${STUDENT_LOGIN_PATH}?reason=signed-out`;
   ```
   and change the default parameter to `redirectPath: string = STUDENT_IDLE_LOGIN_PATH`.
2. `context/StudentAuthContext.tsx`: in `signOut` only, change both `window.location.assign(STUDENT_LOGIN_PATH);` calls to `window.location.assign(STUDENT_SIGNED_OUT_LOGIN_PATH);` and add the name to the existing import from the idle-timeout hook. Do not change the other use of `STUDENT_LOGIN_PATH` in this file (the one that builds `${STUDENT_LOGIN_PATH}?${query}`).
3. `StudentLoginPage.tsx`: add beside `readInitialBounceReason`:
   ```tsx
   /** Why the student was sent here on purpose, from a fixed allow-list. */
   function readSignedOutReason(): 'idle' | 'signed-out' | null {
     if (typeof window === 'undefined') return null;
     try {
       const reason = new URLSearchParams(window.location.search).get('reason');
       return reason === 'idle' || reason === 'signed-out' ? reason : null;
     } catch {
       return null;
     }
   }
   ```
   In the component: `const [signedOutReason] = useState(readSignedOutReason);`
4. In `init` inside the setup effect:
   - change `auto_select: true,` to `auto_select: signedOutReason === null,`
   - replace the `idApi.prompt();` line with:
     ```tsx
     if (signedOutReason === null) idApi.prompt();
     else idApi.disableAutoSelect();
     ```
   Keep the comment above it accurate in one line.
5. Show why the student is here. Directly above `<StatusContent` in the page's JSX add:
   ```tsx
   {
     signedOutReason === 'idle' && (
       <p role="status" className="mb-4 text-sm text-slate-600">
         You were signed out after 15 minutes without activity.
       </p>
     );
   }
   ```

Update the two existing tests that assert the old redirect:

- `tests/hooks/useStudentIdleTimeout.test.ts`: expectations of `assignMock` called with `STUDENT_LOGIN_PATH` become `STUDENT_IDLE_LOGIN_PATH`.
- `tests/context/StudentAuthContext.test.tsx`: any expectation that `signOut` redirects to `'/student/login'` becomes `'/student/login?reason=signed-out'`.

**Verify**: `pnpm exec vitest run tests/hooks/useStudentIdleTimeout.test.ts tests/context/StudentAuthContext.test.tsx` → all pass.

### Step 3: Test the sign-in page

Create `tests/components/student/StudentLoginPage.test.tsx`. The page imports only these modules that need mocking: `firebase/auth` (`signInWithCustomToken`), `firebase/functions` (`httpsCallable`, `FunctionsError`), and `@/config/firebase` (`auth`, `functions`). Mock them with `vi.mock`. Set the client id with `vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client')` before importing the page (use a dynamic `import()` inside each test or `vi.resetModules()` if the value is read at module load). Provide the Google SDK as:

```ts
const idApi = {
  initialize: vi.fn(),
  prompt: vi.fn(),
  renderButton: vi.fn(),
  cancel: vi.fn(),
  disableAutoSelect: vi.fn(),
};
(window as unknown as { google: unknown }).google = { accounts: { id: idApi } };
```

Set the query string per test with `window.history.replaceState({}, '', '/student/login?reason=...')`.

Tests:

1. **Plain load**: no `reason` → `initialize` called with `auto_select: true`, `prompt` called once, `disableAutoSelect` not called.
2. **After Sign out**: `?reason=signed-out` → `initialize` called with `auto_select: false`, `disableAutoSelect` called, `prompt` not called, and no idle message.
3. **After idle**: `?reason=idle` → same as test 2, plus the text `You were signed out after 15 minutes without activity.` is shown.
4. **Try again recovers**: `?reason=no-classes` → `initialize` not called at first and a retry button is shown (find it by role `button`; its label comes from `ErrorView` in the page). Click it → `initialize` called once and "Loading sign-in…" is no longer shown.
5. **Unknown reason is ignored**: `?reason=<script>` → behaves like test 1.

**Verify**: `pnpm exec vitest run tests/components/student/StudentLoginPage.test.tsx` → 5 pass.

### Step 4: Put words on the assignment rows

In `components/student/landing/LandingRows.tsx`:

1. Add a separator that hides on phones, below the existing `Dot`:
   ```tsx
   const RowDot: React.FC = () => (
     <span aria-hidden="true" className="hidden text-slate-300 sm:inline">
       ·
     </span>
   );
   ```
   Leave `Dot` and its other uses unchanged.
2. In `dueLine`, in the `missing-open` branch, take the separator out of the text so it can hide on phones. `was` becomes `a.dueAt !== undefined ? `was due ${fmtDay(a.dueAt)}` : ''` (no leading `·`), and the returned JSX becomes:
   ```tsx
   <>
     <span className="font-semibold text-rose-700">Missing · still open</span>
     {(was || closes) && (
       <>
         <RowDot />
         <span className="text-slate-500">
           {was}
           {closes}
         </span>
       </>
     )}
   </>
   ```
   If `was` is empty and `closes` is not, strip the leading `, ` from `closes` so the text does not start with a comma.
3. In `dueLine`, replace the final `return` with a version that tells a past date from a future one:
   ```tsx
   const label = formatDueLabel(a.dueAt, nowMs);
   if (label.startsWith('Due today'))
     return <span className="font-semibold text-slate-800">{label}</span>;
   if (a.dueAt < nowMs)
     return (
       <span className="font-semibold text-slate-800">
         Was due {fmtDay(a.dueAt)}
       </span>
     );
   return <span className="text-slate-500">{label}</span>;
   ```
4. In the `WorkRow` meta line quoted above:
   - change the wrapper's classes to `mt-0.5 flex flex-col items-start gap-y-0.5 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1.5`
   - replace each `<Dot />` inside this wrapper with `<RowDot />`
   - directly before `{dueLine(row, nowMs)}` add the activity type in words:
     ```tsx
     <span className="text-slate-500">{kindLabel(a)}</span>
     <RowDot />
     ```
5. In `completedRight`, replace the final fallback so work that is never graded says so. Add above `completedRight`:
   ```tsx
   const NEVER_GRADED: ReadonlySet<SessionKind> = new Set([
     'video-activity',
     'mini-app',
     'activity-wall',
     'projects',
   ]);
   ```
   and change the last branch to:
   ```tsx
   ) : (
     <span className="text-xs text-slate-500">
       {NEVER_GRADED.has(item.kind) ? 'Turned in' : 'Not graded yet'}
     </span>
   );
   ```
   `SessionKind` is already imported in this file as a type.

Update existing tests in `WorkRow.test.tsx` and `LandingRows.test.tsx` only where they assert text this step changes on purpose.

**Verify**:

- `pnpm exec vitest run components/student/landing` → all pass.
- `pnpm exec vitest run tests/copyGuard.test.ts` → all pass.

### Step 5: Final checks

**Verify**:

- `pnpm exec vitest related --run components/student/StudentLoginPage.tsx hooks/useStudentIdleTimeout.ts context/StudentAuthContext.tsx components/student/landing/LandingRows.tsx` → all pass.
- `pnpm run check:tour-anchors` → exit 0 (this plan adds no new controls).
- `pnpm run type-check` → exit 0.
- `git status --short` lists only in-scope files.

## Test plan

Sign-in: the five tests in Step 3.

Rows, added to `components/student/landing/WorkRow.test.tsx` (model: `shows Open on an available row`, using its `base` fixture and `NOW`):

1. A quiz row shows the text `Quiz` in its meta line; a flashcards row with `flashcardKind: 'check'` shows `Flashcards · Check`. (Read the exact labels from `KIND_CONFIG` in `hooks/useStudentAssignments.ts`.)
2. A row in state `open` whose `dueAt` is two days before `NOW` shows `Was due` and does not show a label starting with `Due `.
3. A row whose `dueAt` is two days after `NOW` still shows `Due `.
4. A row due earlier today still shows `Due today`.
5. A `missing-open` row with a `dueAt` shows `Missing · still open` and `was due`.

Added to `components/student/landing/LandingRows.test.tsx` (model: the existing `describe('DoneRow', ...)` and its `renderRow` helper):

6. A finished `video-activity` item with results not shared shows `Turned in`.
7. A finished `quiz` item with results not shared still shows `Not graded yet`.

## Done criteria

- [ ] `pnpm exec vitest run tests/components/student/StudentLoginPage.test.tsx tests/hooks/useStudentIdleTimeout.test.ts tests/context/StudentAuthContext.test.tsx components/student/landing` exits 0 with the twelve new tests present.
- [ ] `pnpm exec vitest run tests/copyGuard.test.ts` exits 0.
- [ ] `pnpm run type-check` exits 0.
- [ ] `grep -c "disableAutoSelect()" components/student/StudentLoginPage.tsx` prints `2` (the type declaration and the call).
- [ ] `grep -c "retryNonce" components/student/StudentLoginPage.tsx` prints at least `3`.
- [ ] `grep -n "· was due" components/student/landing/LandingRows.tsx` returns no matches.
- [ ] `git diff db70831b -- utils/studentLanding.ts utils/studentTurnIn.ts hooks/useStudentAssignments.ts` is empty.
- [ ] `git status --short` shows no files outside the in-scope list.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match the live code.
- `useStudentIdleTimeout` has a caller that passes its own `redirectPath` (at commit `db70831b` neither caller does).
- The sign-in page cannot be rendered in a test with only the three mocks named in Step 3. Report what else it needs; do not skip the tests.
- More than 5 existing tests under `components/student/landing` fail after Step 4.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching `utils/studentLanding.ts` or any other out-of-scope file.

## Maintenance notes

- **Needs a device check by the maintainer.** Whether Google One Tap really signs a student back in after Sign out depends on browser and Google account state, and could not be reproduced in tests. After this ships to the dev site, sign in as a student on a Chromebook, press Sign out, and confirm the sign-in page waits for a click. Repeat for the idle timeout if practical.
- A student who reloads `/student/login?reason=signed-out` keeps auto-select off until they sign in. That is intended.
- "Was due" appears for any past date that is not classified as missing. Kinds with no turn-in record (activity wall, projects) cannot be told apart from done work, which is why the wording is neutral and not "Overdue".
- `NEVER_GRADED` mirrors the kinds whose `gradingStateFrom` is fixed to `'not-graded'` in `hooks/useStudentAssignments.ts`. If one of those kinds gains grading, remove it from the set.
- On phones each part of a row's meta line now sits on its own line with no dots. Reviewer: check a row with a class name, a type, "Missing · still open" and a "was due" date at 360px wide and at desktop width.
- Bug fixes and wording only, so no feature flag is planned. State that in the PR description.
- Deferred from the same audit: finished work briefly showing as to-do while turn-in checks load, a warning before the idle sign-out, the loading and loaded pages using different headers, a way back from the "Results locked" screen, and translating these pages.
