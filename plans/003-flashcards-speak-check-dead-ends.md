# Plan 003: A flashcards student is never told something untrue in a Speak Check, and "not available" has a way out

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan
> in `plans/README.md`, unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat db70831b..HEAD -- components/flashcards/ locales/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Line numbers below are from commit
> `db70831b`; always locate code by the quoted text, not the number.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (copy and labels only; no grading logic changes)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `db70831b`, 2026-11-14

## Why this matters

A flashcards "Check" is a graded, one-mode assignment. When its mode is Speak
(the student says each word into the microphone), three pieces of on-screen
text are wrong, and each one sends a student the wrong way:

1. If the microphone can't be used, the screen says "The other study modes
   still work." In a Check there are no other modes, so the student looks for
   something that isn't there instead of telling the teacher.
2. After "Couldn't hear you", the student can press "Skip". In a Check a
   skipped card is submitted as missed, but nothing says so.
3. After the last card the screen says "Round 1 complete" with a "Next round"
   button. In a Check that button leads to the Submit screen. Students expect
   more speaking and may close the tab before submitting.

Two smaller fixes ride along: the "assignment isn't available" page has no
button at all (a network blip lands there too), and the flip hint says "Click
or press Space" on touch devices.

## Current state

Files:

- `components/flashcards/SpeakMode.tsx` (1,493 lines): the Speak player. Contains `SpeakBlocked` (the "Speak isn't available" panel) and the "unclear" panel with Skip.
- `components/flashcards/FlashcardPlayer.tsx` (1,712 lines): the mode shell. Knows whether this is a Speak Check (`speakCheck`) and renders `<SpeakMode>`.
- `components/flashcards/PlayerPrimitives.tsx`: `RoundSummary`, the end-of-round card.
- `components/flashcards/FlashcardAssignmentPage.tsx` (888 lines): the page for an assigned set, route `/flashcards/a/...`. Contains `PageMessage`.
- `locales/en.json`, `es.json`, `fr.json`, `de.json`: all flashcards text is translated through `t('flashcards...')`.
- `components/flashcards/SpeakMode.test.tsx`: tests to follow, especially `runs a Speak check once through the cards, then submits each verdict`.

How the player knows it is a Speak Check (`FlashcardPlayer.tsx`, about line 194):

```tsx
const speakCheck = check?.mode === 'speak';
```

and a Check has only its own mode (about line 208):

```tsx
  const allowedModes = check
    ? [check.mode]
    : requestedModes.filter(
```

How it renders the Speak player (about line 1077):

```tsx
              <SpeakMode
                key={speakCheck ? 'check-speak' : speakKey}
                cards={speakCheck ? speakCheckCards : session.speakCards}
                round={speakCheck ? 1 : session.speakRound}
                ...
                onNextRound={
                  speakCheck ? () => setSpeakCheckFinished(true) : nextRound
                }
                onRestart={speakCheck ? undefined : onRestart}
                missed={roundMissed}
```

How a Check is submitted (about line 1009). A card with no recorded verdict is sent as not passed, which is why a skipped card counts as missed:

```tsx
submitCheck(
  deckCards.filter(isSpeakableCard).map((card) => {
    const entry = checkLog[card.id];
    return {
      cardId: card.id,
      response: '',
      type: 'speak' as const,
      attempts: Math.max(1, entry?.attempts ?? 1),
      passed: entry?.passed === true,
    };
  })
);
```

`SpeakModeProps` starts (`SpeakMode.tsx`, about line 102):

```tsx
export interface SpeakModeProps {
  /** Missed-card pile for the round summary; absent hides it. */
  missed?: RoundSummaryMissed;
  cards: FlashcardCard[];
  round: number;
```

The blocked panel (`SpeakMode.tsx`, about line 433):

```tsx
const SpeakBlocked: React.FC<{
  dark: boolean;
  reason: SpeakBlockReason;
  onRetry?: () => void;
}> = ({ dark, reason, onRetry }) => {
  ...
        <PanelBody dark={dark}>
          {t('flashcards.speak.unavailable.otherModes')}
        </PanelBody>
```

and where it is rendered (about line 895):

```tsx
  if (blockReason) {
    return (
      <SpeakBlocked
        dark={dark}
        reason={blockReason}
        onRetry={
```

The Skip button in the unclear panel (about line 1300):

```tsx
{
  /* no-tour-anchor: student player */
}
<button
  type="button"
  onClick={next}
  className={secondaryButton(dark)}
  style={buttonStyle}
>
  {t('flashcards.speak.player.skip')}
</button>;
```

The round summary in Speak (about line 880):

```tsx
if (summary) {
  return (
    <RoundSummary
      round={round}
      correct={passed}
      wrong={failed}
      dark={dark}
      onNextRound={onNextRound}
      onRestart={onRestart}
      missed={missed}
    />
  );
}
```

`RoundSummary`'s main button (`PlayerPrimitives.tsx`, about line 52):

```tsx
const primary = (missedOnly ? (studyMissed ?? studyAll) : null) ?? {
  label: t('flashcards.summary.next'),
  onClick: onNextRound,
};
```

`PageMessage` and the unavailable view (`FlashcardAssignmentPage.tsx`, about lines 116 and 701):

```tsx
const PageMessage: React.FC<{
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  body?: string;
}> = ({ icon: Icon, title, body }) => (
  <div className="flex h-full items-center justify-center bg-slate-100 p-6 text-center">
    <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
      <Icon aria-hidden={true} className="mx-auto h-10 w-10 text-rose-600" />
      <h1 className="mt-4 text-xl font-black text-slate-900">{title}</h1>
      {body && <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>}
    </section>
  </div>
);
...
  if (view.kind === 'unavailable' || !pseudonymUid) {
    return (
      <div className="h-screen h-dvh">
        <PageMessage
          icon={AlertTriangle}
          title={t('flashcards.assignment.unavailableTitle')}
          body={t('flashcards.assignment.unavailableBody')}
        />
      </div>
    );
  }
```

Existing locale keys (`locales/en.json`; the same keys exist in `es`, `fr`, `de`):

- `flashcards.speak.unavailable.otherModes`: "The other study modes still work."
- `flashcards.speak.player.skip`: "Skip"
- `flashcards.summary.next`: "Next round"
- `flashcards.cards.flipHint`: "Click or press Space to flip"
- `flashcards.assignment.back`: "Back to my assignments"

Repo conventions that apply:

- **Comments are one short line at most.**
- **UI copy**: no em dashes, no "Tip:" or "Note:", under 30 words per string. A student's go at a card is an "attempt", never a "try" (as a noun).
- **Every locale key goes in all four files**: `locales/en.json`, `es.json`, `fr.json`, `de.json`, at the same path.
- **Every new control needs a tour anchor or an opt-out comment.** This area uses `{/* no-tour-anchor: student player */}` on the line above the control.
- **Never run** `pnpm run validate`, full `pnpm run lint`, full `pnpm run test` or `tsc`.

## Commands you will need

| Purpose                                     | Command                                                   | Expected on success |
| ------------------------------------------- | --------------------------------------------------------- | ------------------- |
| Install (only if `node_modules` is missing) | `pnpm run install:all`                                    | exit 0              |
| One test file                               | `pnpm exec vitest run <path>`                             | all pass            |
| Tests for changed files                     | `pnpm exec vitest related --run <changed files>`          | all pass            |
| Copy and locale rules                       | `pnpm exec vitest run tests/copyGuard.test.ts tests/i18n` | all pass            |
| Tour anchors                                | `pnpm run check:tour-anchors`                             | exit 0              |
| Types (once, at the end)                    | `pnpm run type-check`                                     | exit 0              |

Do not put `--` between the script name and its flags.

## Scope

**In scope** (the only files you should modify):

- `components/flashcards/SpeakMode.tsx`
- `components/flashcards/FlashcardPlayer.tsx` (one new prop passed to `<SpeakMode>`)
- `components/flashcards/PlayerPrimitives.tsx`
- `components/flashcards/FlashcardAssignmentPage.tsx`
- `components/flashcards/SpeakMode.test.tsx`
- `tests/components/flashcards/FlashcardAssignmentPage.progress.test.tsx` (add one test) or a new test file beside it
- `locales/en.json`, `locales/es.json`, `locales/fr.json`, `locales/de.json`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- What a Check submits. Do not change `submitCheck`, `recordSpeak`, `checkLog`, `speakCheckIds` or anything that decides whether a card passed. This plan changes words on screen, not grades.
- Letting a student with no microphone submit a Speak Check. That is a grading policy decision for the maintainer.
- `FlashcardsMode.tsx`, `WriteMode.tsx`, `TestMode.tsx` behaviour. (Only the locale string for the flip hint changes; the component is untouched.)
- `PublicFlashcardsPage.tsx`, `FlashcardShareModal.tsx`, `FlashcardStaffRoute.tsx`.
- `functions/`, `firestore.rules`.

## Git workflow

- Branch from `origin/dev-paul`: `git fetch origin dev-paul && git checkout -b claude/flashcards-speak-check-dead-ends origin/dev-paul`.
- Commit message style from `git log`: `Web tours: view, finish and link-only view counts on the list`. Use `Flashcards: ...`.
- Pull requests target `dev-paul`, never `main`. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the locale strings

Add these keys in all four locale files. Put each new key directly after the existing key named in the first column, inside the same JSON object.

| After existing key                        | New key       | en                                  | es                                      | fr                                                   | de                                                    |
| ----------------------------------------- | ------------- | ----------------------------------- | --------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `flashcards.speak.unavailable.otherModes` | `tellTeacher` | Tell your teacher you can't record. | Dile a tu docente que no puedes grabar. | Dis à ton enseignant que tu ne peux pas enregistrer. | Sag deiner Lehrkraft, dass du nicht aufnehmen kannst. |
| `flashcards.speak.player.skip`            | `skipCheck`   | Skip (counts as missed)             | Omitir (cuenta como fallada)            | Passer (compte comme manquée)                        | Überspringen (zählt als verfehlt)                     |
| `flashcards.summary.next`                 | `toSubmit`    | Continue to submit                  | Continuar para entregar                 | Continuer pour remettre                              | Weiter zum Abgeben                                    |
| `flashcards.assignment.back`              | `tryAgain`    | Try again                           | Intentar de nuevo                       | Réessayer                                            | Erneut versuchen                                      |

Change the value of the existing key `flashcards.cards.flipHint` in each file:

| en                         | es                                   | fr                                           | de                                         |
| -------------------------- | ------------------------------------ | -------------------------------------------- | ------------------------------------------ |
| Tap or press Space to flip | Toca o presiona Espacio para voltear | Toucher ou appuyer sur Espace pour retourner | Tippen oder Leertaste drücken zum Umdrehen |

There are other keys named `skip`, `next` and `back` elsewhere in these files. Make sure you are inside the `flashcards` object at the exact path given (for example `flashcards` → `speak` → `player` → `skip`).

**Verify**:

- `node -e "for (const l of ['en','es','fr','de']) { const f=require('./locales/'+l+'.json').flashcards; console.log(l, !!f.speak.unavailable.tellTeacher, !!f.speak.player.skipCheck, !!f.summary.toSubmit, !!f.assignment.tryAgain, f.cards.flipHint) }"` → four lines, each with four `true` values and the new hint.
- `pnpm exec vitest run tests/copyGuard.test.ts tests/i18n` → all pass.

### Step 2: Tell `SpeakMode` it is inside a Check

1. In `SpeakMode.tsx`, add to `SpeakModeProps`:
   ```tsx
   /** True inside a graded Check, where Speak is the only mode. */
   inCheck?: boolean;
   ```
   and destructure it in the component with a default: `inCheck = false`.
2. In `FlashcardPlayer.tsx`, on the `<SpeakMode ...>` element quoted above, add `inCheck={speakCheck}`.

**Verify**: `pnpm exec vitest run components/flashcards/SpeakMode.test.tsx` → all pass (no behaviour change yet).

### Step 3: Fix the three Speak Check messages

All in `SpeakMode.tsx` unless stated.

1. **Blocked panel.** Add `inCheck?: boolean` to `SpeakBlocked`'s props and destructure it. Replace the `otherModes` line with:
   ```tsx
   <PanelBody dark={dark}>
     {t(
       inCheck
         ? 'flashcards.speak.unavailable.tellTeacher'
         : 'flashcards.speak.unavailable.otherModes'
     )}
   </PanelBody>
   ```
   Pass `inCheck={inCheck}` where `<SpeakBlocked` is rendered. If `SpeakBlocked` is rendered in more than one place, pass it at each place inside `SpeakMode`; leave any use outside `SpeakMode` unchanged.
2. **Skip label.** In the unclear panel's Skip button quoted above, change the label to:
   ```tsx
   {
     t(
       inCheck
         ? 'flashcards.speak.player.skipCheck'
         : 'flashcards.speak.player.skip'
     );
   }
   ```
   Do not change its `onClick`.
3. **Summary button.** In `PlayerPrimitives.tsx`, add an optional prop `nextLabel?: string` to `RoundSummaryProps`, destructure it in `RoundSummary`, and change the primary button's label to `label: nextLabel ?? t('flashcards.summary.next'),`. In `SpeakMode.tsx`, pass it in the `if (summary)` block:
   ```tsx
   nextLabel={inCheck ? t('flashcards.summary.toSubmit') : undefined}
   ```
   `SpeakMode` already calls `useTranslation`; use its existing `t`.

**Verify**: `pnpm exec vitest run components/flashcards` → all pass.

### Step 4: Give the "not available" page a way out

In `FlashcardAssignmentPage.tsx`:

1. Add an optional `children?: React.ReactNode` prop to `PageMessage`, rendered after the body:
   ```tsx
   {
     children && (
       <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
         {children}
       </div>
     );
   }
   ```
2. In the `view.kind === 'unavailable' || !pseudonymUid` block only, pass two children to `PageMessage`:
   ```tsx
   {
     /* no-tour-anchor: student page */
   }
   <button
     type="button"
     onClick={() => window.location.reload()}
     className="min-h-[44px] rounded-full bg-rose-600 px-5 text-sm font-black text-white hover:bg-rose-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300"
   >
     {t('flashcards.assignment.tryAgain')}
   </button>;
   {
     /* no-tour-anchor: student page */
   }
   <a
     href="/my-assignments"
     className="inline-flex min-h-[44px] items-center rounded-full bg-slate-100 px-5 text-sm font-black text-slate-700 hover:bg-slate-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300"
   >
     {t('flashcards.assignment.back')}
   </a>;
   ```
   Leave the other four `PageMessage` uses as they are.

**Verify**:

- `pnpm exec vitest run tests/components/flashcards` → all pass.
- `pnpm run check:tour-anchors` → exit 0.

### Step 5: Final checks

**Verify**:

- `pnpm exec vitest related --run components/flashcards/SpeakMode.tsx components/flashcards/FlashcardPlayer.tsx components/flashcards/PlayerPrimitives.tsx components/flashcards/FlashcardAssignmentPage.tsx` → all pass.
- `pnpm run type-check` → exit 0.
- `git status --short` lists only in-scope files.

## Test plan

Add to `components/flashcards/SpeakMode.test.tsx`, modelled on `runs a Speak check once through the cards, then submits each verdict` (reuse its setup for a Speak Check and its fake recognizer):

1. **Blocked in a Check says tell your teacher**: render a Speak Check with the microphone unavailable (use whichever fixture an existing test uses for a blocked or missing mic); expect "Tell your teacher you can't record." and expect "The other study modes still work." to be absent.
2. **Blocked outside a Check is unchanged**: same block in ordinary study mode shows "The other study modes still work."
3. **Skip names its cost in a Check**: drive the fake recognizer to the unclear verdict in a Speak Check; expect a button named "Skip (counts as missed)". In ordinary study mode the button is still "Skip".
4. **The last card leads to Submit by name**: finish every card of a Speak Check; expect a button named "Continue to submit" and no button named "Next round".

Add one test for the assignment page (in `tests/components/flashcards/FlashcardAssignmentPage.progress.test.tsx` or a new sibling file using the same mocks): when the session read reports unavailable, the page shows a "Try again" button and a "Back to my assignments" link whose `href` is `/my-assignments`.

If the test i18n setup returns keys instead of English text, assert on the key names (`flashcards.speak.unavailable.tellTeacher`, and so on), matching how the neighbouring tests assert.

## Done criteria

- [ ] `pnpm exec vitest run components/flashcards tests/components/flashcards` exits 0 with the five new tests present.
- [ ] `pnpm exec vitest run tests/copyGuard.test.ts tests/i18n` exits 0.
- [ ] `pnpm run check:tour-anchors` exits 0.
- [ ] `pnpm run type-check` exits 0.
- [ ] `grep -c "tellTeacher" locales/en.json locales/es.json locales/fr.json locales/de.json` prints `1` for each file.
- [ ] `grep -rn "Click or press Space" locales/` returns no matches.
- [ ] `git diff db70831b -- components/flashcards/FlashcardPlayer.tsx | grep "^[+-]" | grep -v "^+++\|^---" | wc -l` prints `1` (only the added `inCheck` line).
- [ ] `git status --short` shows no files outside the in-scope list.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match the live code.
- A locale file lacks one of the existing keys listed in "Current state" (the files have drifted apart).
- Making a test pass seems to need a change to what a Check submits or to how a card is marked passed.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- Two real gaps remain and need the maintainer's decision, not a copy fix:
  - A student whose device cannot record still cannot submit a Speak Check, so the teacher sees nothing. Options are a "can't record" submission or a teacher-side override.
  - A skipped card in a Check is offered again if the page is reloaded before submitting, but not otherwise. Recording the skip as a decided miss would make that consistent, at the cost of removing the second chance.
- `RoundSummary` is shared by all study modes. The new `nextLabel` prop is optional and only Speak passes it; a reviewer should confirm Flashcards and Write summaries still read "Next round".
- The flip hint now reads "Tap or press Space to flip" on every device, mouse included. It was chosen over device detection to keep one string.
- Copy and label fixes only, so no feature flag is planned. State that in the PR description.
- Deferred from the same audit: answer inputs under 16px (page zoom on iPhone and iPad), small tap targets in the player header, long card text clipped on the flip card, Next on the last card wrapping to card 1, and test answers lost when switching mode.
