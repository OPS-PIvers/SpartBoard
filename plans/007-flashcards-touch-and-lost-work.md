# Plan 007: Flashcards stop zooming on iPhone, show long answers in full, end a deck honestly and keep test answers

- **Priority**: P2 · **Effort**: M · **Risk**: MED · **Depends on**: none
- **Category**: bug (touch, lost work, accessibility)
- **Planned at**: commit `9a9dd678`, 2026-11-14

## Why this matters

In the flashcards player: answer inputs render below 16px, so iPhones and
iPads zoom the page on every question. Header controls are 25 to 33px tall.
A long answer overflows the flip card and is clipped top and bottom with no
way to scroll. Pressing Next on the last card silently wraps to card 1, so a
student using the arrows never reaches an end. A student part-way through a
self-study test who opens another mode or changes a setting loses every answer
without warning. In Write mode a screen reader never hears the correct answer
after a wrong one.

## Current state

- `components/flashcards/FlashcardPlayer.tsx` is the shell used both on student pages and inside the teacher's board widget. All its sizes use container-query units like `fontSize: 'min(11px, 2.9cqmin)'`. It renders `<TestMode key={modeKey} …>`, and `modeKey` includes `mode`, `session.round`, `settings.showFirst`, `settings.strict`, `settings.testTypes` and `settings.testCount`, so any of those changing remounts the test.
- `components/flashcards/TestMode.tsx`: answers live in local state keyed by question id. A graded Check already survives a remount through `check.initialAnswers` (a `Record<cardId, response>`) and `check.onAnswer(cardId, response)`:

  ```tsx
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const saved = check?.initialAnswers ?? {};
    return Object.fromEntries(
      questions.flatMap((question) => {
        const response = saved[question.card.id];
        return response ? [[question.id, response]] : [];
      })
    );
  });
  ...
  const answer = (question: TestQuestion, response: string): void => {
    setAnswers((current) => ({ ...current, [question.id]: response }));
    check?.onAnswer?.(question.card.id, response);
  };
  ```

  Each `TestQuestion` has a `type`. `const submit = (): void => {` is the submit handler.

- `components/flashcards/FlashcardsMode.tsx`: `move` wraps with a modulo:

  ```tsx
  setIndex((current) => (current + direction + cards.length) % cards.length);
  ```

  The round summary appears only from `record` when the last card is marked. `showMarks` is true for students and false in Present mode on the board. Both card faces are `absolute inset-0 flex flex-col items-center justify-center overflow-hidden …`; the answer text has `style={{ fontSize: 'clamp(20px, 8cqmin, 48px)' }}`.

- `components/flashcards/WriteMode.tsx`: after a wrong answer it renders a panel (border `border-rose-200 bg-rose-50`) with "Yours:" and "Correct:" and focuses the retype input (`aria-label={t('flashcards.write.retypeLabel')}`).
- All flashcards text uses `t('flashcards.…')` with keys in `locales/en.json`, `es.json`, `fr.json`, `de.json`.

## Scope

**In scope**: `components/flashcards/FlashcardPlayer.tsx`, `TestMode.tsx`,
`WriteMode.tsx`, `FlashcardsMode.tsx`, `TestQuestionNav.tsx`,
`FlashcardAssignmentPage.tsx` (Step 2 item 3 only), their test files under
`components/flashcards/` and `tests/components/flashcards/`, and the four
locale files (only if a step needs a new string).

**Out of scope**: `SpeakMode.tsx` and `components/flashcards/speak/`, what a
Check submits or how anything is graded, `adapters.ts`, `PublicFlashcardsPage.tsx`,
the board widget under `components/widgets/`, and any change to font sizes
other than the inputs in Step 1 (the player is shared with the teacher's board;
do not rescale it).

## Steps

### Step 1: 16px inputs

Set the font size of these three inputs to exactly `'16px'` (replace the `min(…)` expression):

- `TestMode.tsx`: the fill-in input with `fontSize: 'min(14px, 3.5cqmin)'`.
- `WriteMode.tsx`: the retype input with `fontSize: 'min(16px, 4cqmin)'`, and the main answer input in the same file if its font size can fall below 16px (check and say which in NOTES).
- `FlashcardPlayer.tsx`: the question-count number input with `fontSize: 'min(12px, 3.2cqmin)'` (the one whose class starts `w-0 min-w-0 flex-1 rounded-lg border-2 text-center`).

**Verify**: `pnpm exec vitest run --maxWorkers=2 components/flashcards` → all pass.

### Step 2: Bigger hit areas without changing the look

Add the class `touch-target-expand` (defined in `index.css`; it enlarges the hit area with a pseudo-element and changes nothing visible) to:

1. `FlashcardPlayer.tsx`: each mode tab button (Flashcards, Write, Test, Speak) and the Study settings button.
2. `FlashcardsMode.tsx`: the favourite (star) button and the Previous / Next card buttons. `TestQuestionNav.tsx`: the Previous question / Next question buttons.
3. `FlashcardAssignmentPage.tsx`: the header back link (`aria-label={t('flashcards.assignment.back')}`); change its `p-2` to `p-3` instead of using the utility.

If two expanded neighbours would overlap (the mode tabs sit side by side: read the `.touch-target-expand` rule in `index.css` first to see how far it extends), apply it only vertically if the rule allows, or skip the tabs and say so in NOTES. Never let one button's hit area cover another control.

**Verify**: `pnpm exec vitest run --maxWorkers=2 components/flashcards tests/config/touchHover.test.ts` → all pass.

### Step 3: Long card text scrolls instead of being clipped

In `FlashcardsMode.tsx`, on both faces: change `overflow-hidden` to `overflow-y-auto` and wrap the face's existing children in one inner `<div className="my-auto flex w-full flex-col items-center">` so short content stays centred and long content starts at the top and scrolls. Remove `justify-center` from the face itself (the `my-auto` child now centres). Keep every other class, including the `backface-hidden` and transform classes, exactly as is. Anything absolutely positioned inside a face (the flip hint, a label in a corner) must stay a direct child of the face, outside the new wrapper.

**Verify**: `pnpm exec vitest run --maxWorkers=2 components/flashcards` → all pass.

### Step 4: The last card is the end

In `FlashcardsMode.tsx`, when `showMarks` is true, Next on the last card and Previous on the first card do nothing instead of wrapping:

- In `move`: if `showMarks` and the target index would be below 0 or above `cards.length - 1`, return without changing state. Add `showMarks` to the callback's dependency list. Without `showMarks` (Present mode) keep the modulo wrap.
- Give the Next button `disabled={showMarks && index >= cards.length - 1}` and the Previous button `disabled={showMarks && index <= 0}`, with `disabled:opacity-40` added to their classes. The keyboard arrow handler already calls `move`, so it inherits the stop.

**Verify**: `pnpm exec vitest run --maxWorkers=2 components/flashcards` → all pass; update only existing tests that asserted the wrap for a marks-on deck.

### Step 5: A self-study test keeps its answers across a mode or setting change

1. `TestMode.tsx`: add two optional props to `TestModeProps`:

   ```tsx
   /** Self-study answers kept by the player across a remount, by card id. */
   draft?: Record<string, { type: string; response: string }>;
   onDraftChange?: (cardId: string, type: string, response: string) => void;
   onDraftClear?: () => void;
   ```

   - Initial `answers`: keep the existing Check path first. When `check` is absent and `draft` is given, restore a card's response only when `draft[cardId].type === question.type`.
   - In `answer`: after the existing lines, call `onDraftChange?.(question.card.id, question.type, response)` when `check` is absent.
   - In `submit`: when `check` is absent, call `onDraftClear?.()` once the results are set.

2. `FlashcardPlayer.tsx`: hold the draft in state with the round and side it belongs to:

   ```tsx
   const [testDraft, setTestDraft] = useState<{
     key: string;
     answers: Record<string, { type: string; response: string }>;
   }>({ key: '', answers: {} });
   const testDraftKey = `${missedOnly}:${session.round}:${settings.showFirst}`;
   ```

   Pass to `<TestMode>` (only when `check` is absent): `draft={testDraft.key === testDraftKey ? testDraft.answers : undefined}`, `onDraftChange={(cardId, type, response) => setTestDraft((d) => ({ key: testDraftKey, answers: { ...(d.key === testDraftKey ? d.answers : {}), [cardId]: { type, response } } }))}`, and `onDraftClear={() => setTestDraft({ key: '', answers: {} })}`.

   A new round or a flipped "show first" side changes the key, so stale answers are ignored. Use the names this file already has for `missedOnly`, `session.round` and `settings.showFirst` (they appear in `modeKey`).

**Verify**: `pnpm exec vitest run --maxWorkers=2 components/flashcards` → all pass.

### Step 6: Write mode reads out the correct answer

In `WriteMode.tsx`, give the wrong-answer panel (the `div` with `border-rose-200 bg-rose-50`) `role="status"`. Give the element that shows the correct answer an `id` from `useId()` and add `aria-describedby={thatId}` to the retype input.

**Verify**: `pnpm exec vitest run --maxWorkers=2 components/flashcards` → all pass.

## Test plan

Add to `components/flashcards/FlashcardPlayer.test.tsx` (use its `renderPlayer` helper and existing fixtures):

1. Test answers survive a mode switch: open Test, answer the first question, switch to Flashcards, switch back to Test → the answer is still selected/filled.
2. Test answers survive a setting change that remounts the test (for example the question count) → still there for cards still in the test.
3. Flipping "show first" clears them.
4. Submitting the test, then leaving and returning in the same round, shows a fresh test.
5. Flashcards mode with marks: on the last card the Next button is disabled and pressing ArrowRight keeps the last card on screen.
6. Flashcards mode, a card whose answer is 600 characters: the face element has class `overflow-y-auto`.
7. Write mode: after a wrong answer, the retype input's `aria-describedby` points at an element whose text contains the correct answer.

Add to `components/flashcards/TestMode.nav.test.tsx` or a new sibling: the fill-in input has inline `font-size: 16px`.

## Done criteria

- [ ] `pnpm exec vitest run --maxWorkers=2 components/flashcards tests/components/flashcards tests/config/touchHover.test.ts tests/copyGuard.test.ts tests/i18n` exits 0 with the new tests present.
- [ ] `pnpm run check:tour-anchors` exits 0.
- [ ] `grep -n "min(14px, 3.5cqmin)" components/flashcards/TestMode.tsx` returns no matches.
- [ ] `git status --short` shows only in-scope files.

## STOP conditions

- Step 5 would need a change to what a graded Check stores or submits.
- The flip animation breaks in tests after Step 3 (a face no longer has its transform classes).
- More than 5 existing tests fail.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Test drafts live in player state only; a page refresh still clears a self-study test. Checks are unaffected (they already persist).
- The teacher's board widget shares this player. Steps 1 to 4 and 6 apply there too; Present mode (`showMarks` false) keeps wrapping.
- Small text in the player header (10 to 12px) was left alone: resizing it means a page-size variant of a component the board also uses.
