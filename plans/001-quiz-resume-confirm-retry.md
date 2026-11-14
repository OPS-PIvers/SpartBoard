# Plan 001: A quiz student resumes where they left off, confirms the final submit, and can retry from an error screen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan
> in `plans/README.md`, unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat db70831b..HEAD -- components/quiz/QuizStudentApp.tsx utils/quizReviewMarksStore.ts utils/quizReviewStep.ts locales/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Line numbers below are from commit
> `db70831b`; always locate code by the quoted text, not the number.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (the quiz student screen is the most used student surface)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `db70831b`, 2026-11-14

## Why this matters

Three things strand or mislead a student taking a self-paced quiz:

1. The current question number lives only in React state that starts at 0. A
   page refresh, or the teacher pausing and resuming (the paused screen
   replaces the quiz component), sends the student back to question 1. Their
   answers are kept, but they must press NEXT through every question again and
   usually believe the work is lost.
2. Pressing SUBMIT on the last question turns the attempt in at once. There is
   no confirmation and no warning about blank questions, unless the teacher
   enabled the optional review step. Submitting a part of a quiz already asks
   for confirmation, so the final submit is the odd one out.
3. Four error screens tell the student to refresh the page but give no button.
   Students in fullscreen on a Chromebook often cannot find the browser's
   reload control.

## Current state

Files:

- `components/quiz/QuizStudentApp.tsx` (7,348 lines): the whole student quiz
  app. `ActiveQuiz` (starts at `export const ActiveQuiz: React.FC<{`, about
  line 1919) is the question screen.
- `utils/quizReviewMarksStore.ts`: per-attempt state kept in this tab's
  `sessionStorage` (review marks). This plan adds the resume position beside it.
- `utils/quizReviewStep.ts`: `reviewRows` and `reviewCounts`, which already
  compute how many questions are unanswered.
- `tests/components/quiz/QuizStudentApp.selfPaced.test.tsx`: component tests
  for the self-paced flow. Pattern to follow.
- `tests/utils/quizReviewMarksStore.test.ts`: unit tests for the store.

The position state (`QuizStudentApp.tsx`, about line 2306):

```tsx
// For student-paced mode, the student maintains their own local index
const [localIndex, setLocalIndex] = useState(0);

const isStudentPaced = session.sessionMode === 'student';
const reviewOn = reviewStepActive(session);
const currentIndex = isStudentPaced ? localIndex : session.currentQuestionIndex;
```

The existing "adjust state while rendering" jumps, which are the pattern to
copy (about line 2466; `orderedPublicQuestions` is declared just above them):

```tsx
// A rejoin or a just-submitted part lands on the first open question.
const watchIndex = watchQuestionId
  ? orderedPublicQuestions.findIndex((q) => q.id === watchQuestionId)
  : -1;
if (watchIndex >= 0 && watchIndex !== localIndex) setLocalIndex(watchIndex);
if (
  !watching &&
  partsDone > 0 &&
  !isAttemptSubmitted(myResponse) &&
  partOf(orderedPublicQuestions[localIndex]) <= partsDone
) {
  const firstOpen = orderedPublicQuestions.findIndex(
    (q) => partOf(q) > partsDone
  );
  if (firstOpen > localIndex) setLocalIndex(firstOpen);
}
```

The per-attempt storage key already exists (about line 2033):

```tsx
const reviewStoreKey = reviewStateKey(
  session.id,
  myResponse?._responseKey,
  myResponse?.completedAttempts ?? 0
);
```

It is `null` until the response is known, and `const reviewAttemptSubmitted = isAttemptSubmitted(myResponse);` is declared a few lines below it.

The store (`utils/quizReviewMarksStore.ts`):

```ts
export function reviewStateKey(
  sessionId: string,
  responseKey: string | undefined,
  attempt: number
): string | null {
  return responseKey
    ? `spartboard:quiz-review:${sessionId}:${responseKey}:${attempt}`
    : null;
}
...
export function clearReviewState(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* storage blocked */
  }
}
```

`clearAllReviewStates` removes every key that starts with the response prefix,
so a key of the form `<reviewStateKey>:at` is already cleaned up by it.

The final submit (inside `handleSubmitAndAdvance`, about line 3685):

```tsx
      const isLast = currentIndex >= effectiveTotalQuestions - 1;
      if (reviewOn && (isLast || returnToReview)) {
        setReturnToReview(false);
        setReviewOpen(true);
      } else if (isLast) {
        if (openRecordingQuestions.length > 0) {
          setSubmitBlocked(true);
          return;
        }
        setSelectedAnswer(answer);
        dispatchStep({ type: 'submit' });
        if (!isAttemptSubmitted(myResponse)) {
          try {
            await onComplete();
```

The existing confirm for a part, the pattern to copy (about line 3729):

```tsx
const ok = await showConfirm(
  t(
    'quizParts.confirmBody',
    "You can't change your Part {{part}} answers after this.",
    { part }
  ),
  {
    title: t('quizParts.confirmTitle', 'Submit Part {{part}}?', { part }),
    confirmLabel: t('quizParts.confirmSubmit', 'Submit Part {{part}}', {
      part,
    }),
  }
);
if (!ok) return;
```

How the review screen counts unanswered questions (about line 4052):

```tsx
        rows={reviewRows(
          orderedPublicQuestions.map((q) =>
            applyLocalizedStrings(q, serveLocalizedQuestion(q, assignedLocale))
          ),
          myResponse?.answers ?? [],
          answerCache,
          markedIds,
          (id) =>
            partOf(orderedPublicQuestions.find((q) => q.id === id)) <=
              partsDone ||
            isLockedByChooseCount(
              session.sections,
              sectionAnswers,
              id,
              sectionServedIds
            )
        )}
```

The four error screens with no button:

1. About line 445, text `Unable to connect. Please refresh the page and try again.` (dark, `bg-slate-900`).
2. About line 1376, inside `if (ssoError) {`, renders `{ssoError}` (light).
3. About line 1556, `case 'listenerError':`, renders `{error}` (light or dark by the `light` const).
4. About line 1596, text `Lost connection to the quiz. Please refresh.` (dark, `bg-brand-blue-dark`).

The existing button to model the new one on (about line 5718):

```tsx
const ReturnToAssignmentsButton: React.FC<{
  variant?: 'card' | 'standalone';
}> = ({ variant = 'card' }) => (
  <button
    type="button"
    onClick={() => {
      window.location.assign('/my-assignments');
    }}
```

Repo conventions that apply:

- **Comments are one short line at most.** No multi-line comment blocks or docstrings in new code.
- **`useEffect` only to sync with an external system** (here: `sessionStorage`). Do not use an effect to derive or reset state; use the "adjust state while rendering" pattern shown above.
- **New code never reads or writes `ref.current` during render.**
- **UI copy**: no em dashes, no "Tip:" or "Note:", a student's go at a quiz is an "attempt". Strings stay under 30 words.
- **Every new control needs a tour anchor or an opt-out comment.** Student screens opt out with a comment on the line above the control, as this file already does: `// no-tour-anchor: student results screen; live tours walk teachers.`
- **Locale keys go in all four files**: `locales/en.json`, `es.json`, `fr.json`, `de.json`.
- **Never run** `pnpm run validate`, full `pnpm run lint`, full `pnpm run test` or `tsc`. The pre-commit hook lints staged files.

## Commands you will need

| Purpose                                     | Command                                                          | Expected on success |
| ------------------------------------------- | ---------------------------------------------------------------- | ------------------- |
| Install (only if `node_modules` is missing) | `pnpm run install:all`                                           | exit 0              |
| Tests for changed files                     | `pnpm exec vitest related --run <changed source and test files>` | all pass            |
| One test file                               | `pnpm exec vitest run <path>`                                    | all pass            |
| Copy rules                                  | `pnpm exec vitest run tests/copyGuard.test.ts`                   | all pass            |
| Locale tests                                | `pnpm exec vitest run tests/i18n`                                | all pass            |
| Tour anchors                                | `pnpm run check:tour-anchors`                                    | exit 0              |
| Types (once, at the end)                    | `pnpm run type-check`                                            | exit 0              |

Do not put `--` between the script name and its flags; Vitest then ignores them.

## Scope

**In scope** (the only files you should modify):

- `components/quiz/QuizStudentApp.tsx`
- `utils/quizReviewMarksStore.ts`
- `utils/quizResume.ts` (create)
- `tests/utils/quizResume.test.ts` (create)
- `tests/utils/quizReviewMarksStore.test.ts`
- `tests/components/quiz/QuizStudentApp.selfPaced.test.tsx`
- `locales/en.json`, `locales/es.json`, `locales/fr.json`, `locales/de.json` (add one `quizSubmit` block each)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- `hooks/useQuizSession.ts`: no change to what is written to Firestore. The resume position stays in this tab's `sessionStorage` so teachers never see it and no security rule changes.
- `firestore.rules`, `functions/`.
- `components/quiz/QuizReviewScreen.tsx` and the review step itself.
- Teacher-paced mode. Every change here applies only when `isStudentPaced` is true (the retry buttons excepted).
- Translating the other hard-coded English strings in this file. That is a separate, larger piece of work.

## Git workflow

- Branch from `origin/dev-paul`: `git fetch origin dev-paul && git checkout -b claude/quiz-resume-confirm-retry origin/dev-paul`.
- One commit per step is fine. Message style from `git log`: `Quiz: pictures beside the question, Stimuli under the prompt in the editor`. Use `Quiz: ...`.
- Pull requests in this repo target `dev-paul`, never `main`. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Store the resume position

In `utils/quizReviewMarksStore.ts`, add below `clearReviewState`:

```ts
const resumeKey = (key: string): string => `${key}:at`;

/** The question this tab was last on for one attempt; null when none is saved. */
export function loadResumeQuestion(key: string | null): string | null {
  if (!key) return null;
  try {
    return window.sessionStorage.getItem(resumeKey(key));
  } catch {
    return null;
  }
}

export function saveResumeQuestion(key: string, questionId: string): void {
  try {
    window.sessionStorage.setItem(resumeKey(key), questionId);
  } catch {
    /* storage blocked */
  }
}
```

Change `clearReviewState` so it also removes `resumeKey(key)` inside the same `try`.

Add tests to `tests/utils/quizReviewMarksStore.test.ts`: save then load returns the id; load with a `null` key returns `null`; `clearReviewState` removes the saved id; `clearAllReviewStates` removes it too.

**Verify**: `pnpm exec vitest run tests/utils/quizReviewMarksStore.test.ts` → all pass, including the new cases.

### Step 2: Add the pure resume rule

Create `utils/quizResume.ts`:

```ts
import type { QuizResponseAnswer } from '@/types';

/** Where a self-paced student restarts: the saved question, else the first with no submitted answer, else the last. */
export function resumeQuestionIndex(
  questionIds: readonly string[],
  storedId: string | null,
  answers: readonly Pick<QuizResponseAnswer, 'questionId' | 'status'>[]
): number {
  if (questionIds.length === 0) return 0;
  const stored = storedId ? questionIds.indexOf(storedId) : -1;
  if (stored >= 0) return stored;
  const done = new Set(
    answers.filter((a) => a.status !== 'draft').map((a) => a.questionId)
  );
  const firstOpen = questionIds.findIndex((id) => !done.has(id));
  return firstOpen >= 0 ? firstOpen : questionIds.length - 1;
}
```

Create `tests/utils/quizResume.test.ts` covering: empty list → 0; stored id present → its index; stored id not in the list → falls back; no answers → 0; first two submitted → 2; a `status: 'draft'` answer does not count as done; every question submitted → last index.

**Verify**: `pnpm exec vitest run tests/utils/quizResume.test.ts` → all pass.

### Step 3: Restore and save the position in `ActiveQuiz`

In `components/quiz/QuizStudentApp.tsx`:

1. Import `resumeQuestionIndex` from `@/utils/quizResume`, and add `loadResumeQuestion` and `saveResumeQuestion` to the existing import from `@/utils/quizReviewMarksStore`.
2. Directly below `const [localIndex, setLocalIndex] = useState(0);` add:

   ```tsx
   const [resumedKey, setResumedKey] = useState<string | null>(null);
   ```

3. Directly above the comment `// A rejoin or a just-submitted part lands on the first open question.` add:

   ```tsx
   // A reload or a pause remounts this screen; pick up where this tab left off.
   if (
     isStudentPaced &&
     !watching &&
     reviewStoreKey &&
     resumedKey !== reviewStoreKey &&
     orderedPublicQuestions.length > 0
   ) {
     setResumedKey(reviewStoreKey);
     const at = resumeQuestionIndex(
       orderedPublicQuestions.map((q) => q.id),
       loadResumeQuestion(reviewStoreKey),
       myResponse?.answers ?? []
     );
     if (at !== localIndex) setLocalIndex(at);
   }
   ```

4. Directly below the existing `if (... partsDone > 0 ...) { ... }` block (the one ending `if (firstOpen > localIndex) setLocalIndex(firstOpen);` and its closing brace) add:

   ```tsx
   const resumeId =
     isStudentPaced && !watching
       ? orderedPublicQuestions[localIndex]?.id
       : undefined;
   useEffect(() => {
     if (!reviewStoreKey || !resumeId || resumedKey !== reviewStoreKey) return;
     if (reviewAttemptSubmitted) return;
     saveResumeQuestion(reviewStoreKey, resumeId);
   }, [reviewStoreKey, resumeId, resumedKey, reviewAttemptSubmitted]);
   ```

   Before adding the effect, confirm there is no conditional `return` statement in `ActiveQuiz` between `const [localIndex, setLocalIndex] = useState(0);` and this point (hooks must not follow an early return). At commit `db70831b` there is none.

**Verify**: `pnpm exec vitest run tests/components/quiz/QuizStudentApp.selfPaced.test.tsx`. Some existing tests may now fail because they preload a response whose first question already has a submitted answer and then expect question 1 on screen. That is the intended behaviour change. For each such test, change only its setup or its first assertion so it still tests what its title says (for example, navigate back to question 1 before asserting, or assert question 2). If more than 6 existing tests fail, STOP.

### Step 4: Confirm the final submit

1. Add to each locale file a new top-level block, placed directly before the existing `"quizParts"` block:

   `locales/en.json`:

   ```json
   "quizSubmit": {
     "confirmTitle": "Submit your quiz?",
     "confirmBody": "You can't change your answers after this.",
     "confirmBlank_one": "{{count}} question has no answer. You can't change your answers after this.",
     "confirmBlank_other": "{{count}} questions have no answer. You can't change your answers after this.",
     "confirmSubmit": "Submit",
     "tryAgain": "Try again"
   },
   ```

   `locales/es.json`:

   ```json
   "quizSubmit": {
     "confirmTitle": "¿Entregar tu prueba?",
     "confirmBody": "Después de esto no podrás cambiar tus respuestas.",
     "confirmBlank_one": "{{count}} pregunta no tiene respuesta. Después de esto no podrás cambiar tus respuestas.",
     "confirmBlank_other": "{{count}} preguntas no tienen respuesta. Después de esto no podrás cambiar tus respuestas.",
     "confirmSubmit": "Entregar",
     "tryAgain": "Intentar de nuevo"
   },
   ```

   `locales/fr.json`:

   ```json
   "quizSubmit": {
     "confirmTitle": "Remettre ton quiz ?",
     "confirmBody": "Tu ne pourras plus modifier tes réponses après cela.",
     "confirmBlank_one": "{{count}} question n'a pas de réponse. Tu ne pourras plus modifier tes réponses après cela.",
     "confirmBlank_other": "{{count}} questions n'ont pas de réponse. Tu ne pourras plus modifier tes réponses après cela.",
     "confirmSubmit": "Remettre",
     "tryAgain": "Réessayer"
   },
   ```

   `locales/de.json`:

   ```json
   "quizSubmit": {
     "confirmTitle": "Quiz abgeben?",
     "confirmBody": "Danach kannst du deine Antworten nicht mehr ändern.",
     "confirmBlank_one": "{{count}} Frage hat keine Antwort. Danach kannst du deine Antworten nicht mehr ändern.",
     "confirmBlank_other": "{{count}} Fragen haben keine Antwort. Danach kannst du deine Antworten nicht mehr ändern.",
     "confirmSubmit": "Abgeben",
     "tryAgain": "Erneut versuchen"
   },
   ```

2. In `QuizStudentApp.tsx`, add `reviewCounts` to the existing import from `@/utils/quizReviewStep`.
3. Turn the inline lock function and row list used by the review screen into two named consts, declared directly above `const reviewScreen =`:

   ```tsx
   const isReviewLocked = (id: string): boolean =>
     partOf(orderedPublicQuestions.find((q) => q.id === id)) <= partsDone ||
     isLockedByChooseCount(
       session.sections,
       sectionAnswers,
       id,
       sectionServedIds
     );
   const currentReviewRows = () =>
     reviewRows(
       orderedPublicQuestions.map((q) =>
         applyLocalizedStrings(q, serveLocalizedQuestion(q, assignedLocale))
       ),
       myResponse?.answers ?? [],
       answerCache,
       markedIds,
       isReviewLocked
     );
   ```

   and change the review screen prop to `rows={currentReviewRows()}`. Behaviour of the review screen must not change.

4. In `handleSubmitAndAdvance`, inside `} else if (isLast) {`, after the `openRecordingQuestions` block and before `setSelectedAnswer(answer);`, add:

   ```tsx
   if (isStudentPaced && !isAttemptSubmitted(myResponse)) {
     const blank = reviewCounts(currentReviewRows()).unanswered;
     const ok = await showConfirm(
       blank > 0
         ? t('quizSubmit.confirmBlank', { count: blank })
         : t('quizSubmit.confirmBody'),
       {
         title: t('quizSubmit.confirmTitle'),
         confirmLabel: t('quizSubmit.confirmSubmit'),
       }
     );
     if (!ok) return;
   }
   ```

   `handleSubmitAndAdvance` is declared earlier in the function body than `currentReviewRows`. That is fine at run time because the handler only runs after render. If the pre-commit lint rejects it as use-before-define, move the two consts from item 3 to directly above `const handleSubmitAndAdvance` instead; if they then reference a const declared later (`sectionAnswers`, `sectionServedIds`), STOP.

   The existing `finally` block already resets `submitting` and `advancingRef` on the early `return`.

5. The self-paced tests that press SUBMIT on the last question now meet a confirm. Find how `useDialog` is provided in `tests/components/quiz/QuizStudentApp.selfPaced.test.tsx` (a `vi.mock('@/context/useDialog', ...)` or a `DialogProvider` wrapper) and make `showConfirm` resolve `true` by default so existing tests keep passing.

**Verify**:

- `pnpm exec vitest run tests/components/quiz/QuizStudentApp.selfPaced.test.tsx` → all pass.
- `pnpm exec vitest run tests/i18n tests/copyGuard.test.ts` → all pass.
- `grep -c '"quizSubmit"' locales/en.json locales/es.json locales/fr.json locales/de.json` → `1` for each file.

### Step 5: Add a retry button to the four error screens

Next to `ReturnToAssignmentsButton` add:

```tsx
const ReloadButton: React.FC<{ dark?: boolean }> = ({ dark = false }) => {
  const { t } = useTranslation();
  return (
    // no-tour-anchor: student error screen; live tours walk teachers.
    <button
      type="button"
      onClick={() => window.location.reload()}
      className={`inline-flex min-h-[44px] items-center px-5 py-2.5 text-sm font-bold rounded-full transition-colors ${
        dark
          ? 'bg-white text-slate-900 hover:bg-slate-100'
          : 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
      }`}
    >
      {t('quizSubmit.tryAgain')}
    </button>
  );
};
```

Render it as the last child of each of the four screens listed in "Current state":

1. `Unable to connect...` screen: `<ReloadButton dark />`.
2. `if (ssoError)` screen: `<ReloadButton />`.
3. `case 'listenerError':` screen: `<ReloadButton dark={!light} />`.
4. `Lost connection to the quiz. Please refresh.`: render `<ReloadButton dark />` inside the same `dealPending && drawStalledKey === drawKey` condition, after the `<p>`. Wrap the `<p>` and the button in a fragment.

Do not change the wording of the existing messages.

**Verify**: `grep -c "<ReloadButton" components/quiz/QuizStudentApp.tsx` → `4`. `pnpm run check:tour-anchors` → exit 0.

### Step 6: Final checks

**Verify**:

- `pnpm exec vitest related --run components/quiz/QuizStudentApp.tsx utils/quizResume.ts utils/quizReviewMarksStore.ts` → all pass.
- `pnpm run type-check` → exit 0.
- `git status --short` lists only in-scope files.

## Test plan

Add to `tests/components/quiz/QuizStudentApp.selfPaced.test.tsx`, modelled on the existing test `advances to the next question on a single NEXT click (SSO listener-fast race)` and using its helpers (`buildResponse`, `hookState`, `appendAnswer`):

1. **Resumes at the first unanswered question**: preload `hookState.myResponse` with a submitted answer for `q1`; render; expect question 2's text on screen and question 1's text absent.
2. **Resumes at the saved question**: before rendering, write the question-2 id to `sessionStorage` under `` `${reviewStateKey(session.id, response._responseKey, 0)}:at` `` (import `reviewStateKey`); render with no answers; expect question 2.
3. **A new attempt starts at question 1**: with no stored id and no answers, expect question 1.
4. **Final submit asks first**: make `showConfirm` resolve `false`; answer the last question and press SUBMIT; expect `mockCompleteQuiz` not called and the question still on screen.
5. **Final submit proceeds on confirm**: resolve `true`; expect `mockCompleteQuiz` called once.
6. **Blank count is shown**: with one question left unanswered, expect `showConfirm` to have been called with a first argument containing `1`.

Clear `window.sessionStorage` in `beforeEach` for these tests.

## Done criteria

- [ ] `pnpm exec vitest run tests/utils/quizResume.test.ts tests/utils/quizReviewMarksStore.test.ts tests/components/quiz/QuizStudentApp.selfPaced.test.tsx` exits 0, with the six new component tests present.
- [ ] `pnpm exec vitest run tests/i18n tests/copyGuard.test.ts` exits 0.
- [ ] `pnpm run check:tour-anchors` exits 0.
- [ ] `pnpm run type-check` exits 0.
- [ ] `grep -c "<ReloadButton" components/quiz/QuizStudentApp.tsx` prints `4`.
- [ ] `grep -n "useState(0);" components/quiz/QuizStudentApp.tsx` still shows the `localIndex` line, and `grep -c "resumeQuestionIndex" components/quiz/QuizStudentApp.tsx` prints at least `2`.
- [ ] `git status --short` shows no files outside the in-scope list.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match the live code.
- There is a conditional `return` in `ActiveQuiz` between the `localIndex` state and the place Step 3 adds the effect.
- More than 6 existing tests fail after Step 3, or any test in `QuizStudentApp.liveView.test.tsx` or `QuizStudentApp.windowClose.test.tsx` fails (the change must not affect Live view or window-close behaviour).
- The confirm in Step 4 would run on a timer expiry, window close or any automatic submit. It must only run from a student pressing the button. If `handleSubmitAndAdvance` is called from an automatic path, STOP.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to need a change to `hooks/useQuizSession.ts` or `firestore.rules`.

## Maintenance notes

- The resume position is per tab (`sessionStorage`). A student who moves to a different device resumes at the first unanswered question, not the exact one they were on. Storing the position on the response document would fix that but needs a rules change; deliberately deferred.
- The confirm on the final submit is a behaviour change for students. This repo normally ships behaviour changes behind a flag; this one is treated as bringing the final submit in line with the existing part-submit confirm. The PR description must say so plainly so the maintainer can ask for a flag instead.
- Reviewer: check that teacher-paced sessions and Live view (`watching`) are untouched, and that the review-step path (`reviewOn`) still opens the review screen without an extra confirm.
- Deferred: translating the remaining hard-coded English in this file, a visible "saved / offline" indicator, and moving focus to the new question.
