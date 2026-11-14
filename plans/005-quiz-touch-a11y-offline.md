# Plan 005: Quiz student screen works with a finger, a screen reader and a dropped connection

- **Priority**: P2 · **Effort**: M · **Risk**: MED · **Depends on**: none
- **Category**: bug (touch, accessibility, feedback)
- **Planned at**: commit `9a9dd678`, 2026-11-14

## Why this matters

On the student quiz screen: typed answer boxes use 14px text, so iPhones and
iPads zoom the page on focus and push NEXT off screen. Several controls are
well under the 44px tap target (back arrow about 24px, ordering arrows 32×22,
Reset about 24px tall). Long labels in ordering and matching questions break
mid-word on phones. Focus stays on the old button when a new question loads,
the per-question countdown is invisible to screen readers, and the word
counter talks over typing. A student who goes offline gets no sign that
answers are not reaching the server.

## Scope

**In scope** (only these files):

- `components/quiz/QuizStudentApp.tsx`
- `components/quiz/FibMultiBlankInput.tsx`
- `components/quiz/WrittenResponseEditor.tsx`
- `components/quiz/OrderingListInput.tsx`
- `components/quiz/OrderingResponseInput.tsx`
- `components/quiz/MatchingResponseInput.tsx`
- `components/quiz/FibChoiceBlanksInput.tsx`
- `components/quiz/AnswerImage.tsx`
- `components/quiz/QuestionPrompt.tsx` (only if needed for Step 4)
- `hooks/useOnlineStatus.ts` (create) and `tests/hooks/useOnlineStatus.test.ts` (create)
- `locales/en.json`, `es.json`, `fr.json`, `de.json` (add keys to the existing top-level `quizSubmit` block)
- Test files beside or under `tests/components/quiz/` for the changed components

**Out of scope**: `hooks/useQuizSession.ts`, `firestore.rules`, `functions/`,
the teacher-paced flow's behaviour, `components/quiz/whiteboard/`,
`components/quiz/paper/`, `components/quiz/game/`, translating existing
hard-coded strings, and the editor/teacher uses of any shared component (if a
change to a shared component would alter a teacher screen, STOP).

## Steps

### Step 1: 16px text in typed answer boxes

Change `text-sm` to `text-base` on exactly these student inputs:

- `QuizStudentApp.tsx`: the fill-in input whose class starts `w-full px-5 py-4 border-2 rounded-2xl text-sm`.
- `FibMultiBlankInput.tsx`: the input whose class starts `flex-1 min-w-0 px-5 py-4 border-2 rounded-2xl text-sm`.
- `WrittenResponseEditor.tsx`: the editable area (class contains `rounded-b-2xl text-sm leading-relaxed overflow-y-auto`) and its placeholder overlay (class starts `absolute inset-0 px-5 py-4 text-sm pointer-events-none`). Both must change together so the placeholder still lines up.

`WrittenResponseEditor` may also be used on teacher screens (grep for its
imports). 16px there is acceptable; no STOP needed for this step.

**Verify**: `grep -c "rounded-2xl text-sm" components/quiz/QuizStudentApp.tsx components/quiz/FibMultiBlankInput.tsx` prints 0 for the two input lines you changed (other unrelated matches may remain; list them in NOTES).

### Step 2: 44px tap targets

1. `QuizStudentApp.tsx`, the "Previous question" button (`aria-label="Previous question"`, class `p-1 -ml-1 rounded-sm transition-colors`): make it `inline-flex h-11 w-11 -ml-3 items-center justify-center rounded-lg transition-colors` and its `ChevronLeft` `w-5 h-5`. In the light theme its colour comes from `backBtnCls`; find where `backBtnCls` is assigned and change the light value's `text-slate-400` to `text-slate-600` (leave the dark value).
2. The question counter next to it (`<span className="text-xs text-slate-500">{currentIndex + 1} / {effectiveTotalQuestions}</span>`): change to `text-sm font-semibold text-slate-600` when `light` is true, and keep a readable dark equivalent (`text-slate-300`) when not. Use the existing `light` const.
3. `OrderingListInput.tsx` `arrowCls` and the two identical arrow buttons in `OrderingResponseInput.tsx` (class starts `min-w-[32px] min-h-[22px] p-1`): change to `min-w-[44px] min-h-[36px] p-1` and change the light colour `text-slate-400` to `text-slate-500`. Two stacked 36px arrows keep a row near its current height; add `touch-target-expand` only if it does not make the two hit areas overlap (it must not: skip it here).
4. Reset buttons: `MatchingResponseInput.tsx` (`aria-label="Reset all placements"`), the matching one in `OrderingResponseInput.tsx`, and "Clear all blanks" in `FibChoiceBlanksInput.tsx`. Change `px-2 py-1 text-xs` to `min-h-[44px] px-3 text-xs`, and the light colour `text-slate-400` to `text-slate-600`.
5. Reset must not destroy work silently. In each of those three components, keep the placements from just before the last reset in component state and show an "Undo" button in place of the Reset button until the student makes another change:
   - state: `const [undo, setUndo] = useState<T | null>(null)` where `T` is that component's placements type;
   - the reset handler stores the current placements in `undo` before clearing;
   - Undo restores them through the same setter/callback the component uses for a normal change, then clears `undo`;
   - any other change to placements clears `undo` (do this in the change handlers, not in an effect).
     The Undo button uses the same classes as Reset and the label `Undo` (these three components are hard-coded English today; if one uses `t()`, add `quizSubmit.undo` to all four locales: Undo / Deshacer / Annuler / Rückgängig).

**Verify**: `pnpm exec vitest run --maxWorkers=2 tests/components/quiz components/quiz` → all pass.

### Step 3: Long labels stop breaking mid-word on phones

`components/quiz/AnswerImage.tsx` exports `AnswerLabel` with layouts
`'tile' | 'row' | 'compact'`. In the `compact` layout the picture
(`h-16 w-20 sm:h-24 sm:w-32`) sits beside the text, which on a 360px phone
leaves about 60px for the label, so "Understanding" splits across three lines.

In the `compact` layout only, stack the picture above the text below the `sm`
breakpoint and keep them side by side from `sm` up: the wrapper becomes
`flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-…`
(keep whatever `sm`-and-up gap and alignment it has today). Do not change
`tile` or `row`. Then check `MatchingResponseInput.tsx`: if its term rows use
the `compact` layout they are fixed too; if they use `row` and a picture, apply
the same stacking to that call site's wrapper inside `MatchingResponseInput`
only, not to the shared `row` layout.

**Verify**: `pnpm exec vitest run --maxWorkers=2 components/quiz tests/components/quiz` → all pass. The reviewer checks the result visually.

### Step 4: Focus and announcements

1. When the question changes, move keyboard focus to the question prompt. In `ActiveQuiz` (`QuizStudentApp.tsx`), find the element that renders the current question's prompt text (it uses `QuestionPrompt` or a heading). Give its wrapper `tabIndex={-1}`, a ref, and `className` addition `focus:outline-hidden`. Add one effect keyed on `currentQuestion?.id` that calls `ref.current?.focus({ preventScroll: true })`, skipping the very first run (keep a "first" flag in a ref written only inside the effect) so the page does not steal focus on load. This is a DOM sync, so an effect is correct. If the written-response editor or an input is meant to be focused on a new question today (search for `autoFocus` and `.focus(` in this file first), STOP and report instead of fighting it.
2. The per-question countdown (`<Timer className="w-4 h-4" />` followed by `{timeLeft}s`): give its wrapper `role="timer"` and `aria-label={`${timeLeft} seconds left`}`, and mark the icon `aria-hidden="true"`. Add a visually hidden live region next to it, `<span className="sr-only" aria-live="assertive">`, that contains text only when `timeLeft` is exactly 10 (`10 seconds left`) or 0 (`Time is up`), and is empty otherwise.
3. `WrittenResponseEditor.tsx`: the word counter has `aria-live="polite"`. Remove that attribute so the count is not read on every keystroke. If the component already shows a limit warning, put `role="status"` on that warning element instead; if there is no such element, just remove the attribute.

**Verify**: `pnpm exec vitest run --maxWorkers=2 tests/components/quiz components/quiz` → all pass.

### Step 5: Offline banner

1. Create `hooks/useOnlineStatus.ts`:

   ```ts
   import { useSyncExternalStore } from 'react';

   const subscribe = (onChange: () => void): (() => void) => {
     window.addEventListener('online', onChange);
     window.addEventListener('offline', onChange);
     return () => {
       window.removeEventListener('online', onChange);
       window.removeEventListener('offline', onChange);
     };
   };

   /** False while the browser reports no network connection. */
   export function useOnlineStatus(): boolean {
     return useSyncExternalStore(
       subscribe,
       () => navigator.onLine,
       () => true
     );
   }
   ```

   Test it in `tests/hooks/useOnlineStatus.test.ts` with `renderHook`: stub `navigator.onLine` (`vi.spyOn(navigator, 'onLine', 'get')`), dispatch `offline` and `online` events on `window` inside `act`, and assert the value flips.

2. In `ActiveQuiz`, call `const online = useOnlineStatus();` near the other hooks, and render, as the first child of the question card area (above the row that holds the "Previous question" button), when `!online && !isAttemptSubmitted(myResponse)`:

   ```tsx
   <div
     role="status"
     className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
       light
         ? 'border-amber-300 bg-amber-50 text-amber-900'
         : 'border-amber-400/40 bg-amber-500/10 text-amber-200'
     }`}
   >
     {t('quizSubmit.offline')}
   </div>
   ```

3. Add `offline` to the `quizSubmit` block in all four locale files:
   - en: `You're offline. Keep this tab open and your answers will save when you reconnect.`
   - es: `No tienes conexión. Deja esta pestaña abierta y tus respuestas se guardarán cuando vuelvas a conectarte.`
   - fr: `Tu es hors ligne. Garde cet onglet ouvert et tes réponses seront enregistrées à la reconnexion.`
   - de: `Du bist offline. Lass diesen Tab offen, dann werden deine Antworten gespeichert, sobald du wieder verbunden bist.`

**Verify**: `pnpm exec vitest run --maxWorkers=2 tests/hooks/useOnlineStatus.test.ts tests/i18n tests/copyGuard.test.ts` → all pass.

## Test plan

In `tests/components/quiz/QuizStudentApp.selfPaced.test.tsx` (use its helpers):

1. Offline banner: with `navigator.onLine` stubbed false, the banner text shows; after an `online` event it is gone.
2. Focus: after pressing NEXT, `document.activeElement` is the prompt wrapper of the new question (or contains its text).
3. Timer: with a per-question time limit (see the existing timeout test for setup), an element with `role="timer"` exists.
4. Previous-question button has class `h-11`.

Component tests (new files beside the components or under `tests/components/quiz/`, modelled on any existing test that renders `MatchingResponseInput`/`OrderingListInput`):

5. Matching: place one item, press Reset, press Undo → the placement is back and `onChange` (or the component's callback) received the restored value.
6. Matching: after Reset, making a new placement removes the Undo button.
7. Ordering list: the move-up button has `min-w-[44px]`.

## Done criteria

- [ ] `pnpm exec vitest run --maxWorkers=2 tests/components/quiz components/quiz tests/hooks/useOnlineStatus.test.ts tests/i18n tests/copyGuard.test.ts` exits 0 with the new tests present.
- [ ] `pnpm run check:tour-anchors` exits 0.
- [ ] `grep -c "min-h-\[22px\]" components/quiz/OrderingListInput.tsx components/quiz/OrderingResponseInput.tsx` prints 0 for both.
- [ ] `grep -c '"offline"' locales/en.json locales/es.json locales/fr.json locales/de.json` is at least 1 each and the key sits inside `quizSubmit`.
- [ ] `git status --short` shows only in-scope files.

## STOP conditions

- The focus step conflicts with an existing focus behaviour (see Step 4.1).
- Undo cannot be built without changing a component's props or its parent (it must stay inside the three components).
- A changed shared component alters a teacher-facing screen's behaviour (font size excepted).
- More than 5 existing tests fail, or any test in `QuizStudentApp.liveView.test.tsx` / `.windowClose.test.tsx` fails.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The offline banner reflects the browser's own online flag, which can read "online" on a captive or broken network. It is a floor, not a guarantee of saving; a true per-answer "Saved" state needs pending-write tracking in `useQuizSession` and was left out.
- The zoom controls on stimuli (22×22) were left for a separate pass with the stimulus viewer.
