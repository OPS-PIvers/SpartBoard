# Quiz grading: tag highlights to a rubric strand

Grilled and settled 2026-09-21. One PR to dev-paul. No feature flag.

## Goal

When a written question has a rubric, a teacher can tag a highlight (or an audio timestamp note) to one or more rubric strands from the same popover they already use to pick a color and write a margin comment. The tag marks that passage as evidence for the strand. It does not score anything.

## Current-state facts that drove the decisions

- The popover is `AnchoredAnnotationEditor` in `components/widgets/QuizWidget/components/AnnotatedResponseView.tsx`. It has two modes: **pending** (text selected, nothing saved; the first color click commits via `commitPending`) and **active** (existing annotation; color, comment and delete). It is 288px wide (`POPOVER_WIDTH`).
- `WrittenAnswerAnnotation` (`types.ts`) has `id`, `from`, `to`, `highlightColor`, `comment`, `authorUid`, `createdAt`. `firestore.rules` does not validate annotation shape, so a new optional field needs no rules change.
- The grader resolves the rubric per student with `resolveRubricForResponse` (`utils/rubricOverrideResolution.ts`). A per-student override can swap in a different rubric (`overrideMode: 'rubric'`) or drop it entirely (`'points'`). `FreeResponseGrader` uses the result as `effectiveRubric`.
- The student review (`QuizStudentApp.tsx`, `ScoredRubricDisplay`) reads the question's base `rubricSnapshot`, not the override. The student therefore can't look up an override rubric's criterion names by id.
- `WrittenAnswerRubricScore` already snapshots `points` "for resilience against later rubric edits", so snapshotting a strand name has a precedent.
- `RubricScoringPanel.tsx` renders one row per criterion in the right rail. The Highlights list (`AnnotationsList` in `FreeResponseGrader.tsx`) lists every highlight with its snippet and comment.
- Audio/video responses use `AudioAnnotatedResponseView.tsx`: a list of timestamp notes (`from === to`, milliseconds, `annotationUnit: 'ms'`), each with a textarea. There is no popover. `buildGradeFromDraft` in `utils/gradeDraft.ts` **drops media notes with an empty comment**. The student sees audio notes through `ResponsePlaybackCard.tsx`.
- In `ReadOnlyView` (student side of `AnnotatedResponseView`), only highlights with a comment get a margin chip (`commented`).
- `ProjectGrader.tsx` (Projects widget) uses `RubricScoringPanel` but has no annotations.

## Decisions

- **D1. A tag is an evidence link only.** Scoring stays in the rubric panel. The popover never shows levels.
- **D2. Multiple strands per highlight.** Strand chips toggle on and off.
- **D3. Students see the tags.** A student margin chip shows the strand label(s). A tagged highlight with no comment still gets a chip.
- **D4. Tagging in pending mode commits the highlight in yellow**, the same way clicking a color does now, then the popover moves to active mode with that strand already on. Comment text typed beforehand carries over.
- **D5. The rubric panel shows a count and lets the teacher jump to each highlight.** Each strand with tags shows a "2 highlights" link. Clicking it cycles through that strand's highlights in text order: it sets the active annotation, which opens its popover and scrolls the mark into view. For audio it seeks to the note.
- **D6. Audio timestamp notes get strand tags in the same PR.**
- **D7. Projects is a follow-up**, recorded below and not built here.
- **D8. One PR, no flag.** Nothing shows unless the question has a rubric.

## Data model

Add to `WrittenAnswerAnnotation` in `types.ts`:

```ts
/** Rubric strands this passage is evidence for; name snapshotted for the student view. */
rubricCriteria?: { criterionId: string; name: string }[];
```

- Omit the field when it's empty. Never write `[]` (keeps `annotationListsEqual` and saved payloads stable).
- `name` is copied from the effective rubric when the tag is added. It is only used when the id is no longer in the effective rubric (the rubric was edited, or the student has an override). Otherwise the current name is shown.
- Keep the order the strands appear in the rubric, not the order they were clicked.
- `annotationListsEqual` in `FreeResponseGrader.tsx` must compare `rubricCriteria` too, or tag-only edits won't mark the grade dirty.

## Teacher UI

### Text popover (`AnnotatedResponseView.tsx`)

- New optional `EditProps.rubric?: Rubric`, passed as `effectiveRubric` from `FreeResponseGrader`. When it's missing or has no criteria (including the `'points'` override), no chip row renders.
- Below the color row and above the textarea: a wrapping row of small pill buttons, one per criterion, with `aria-pressed`. Long names are truncated with the full name in `title`. Use the violet active style the color ring uses.
- Pending mode: clicking a chip calls a new `commitPending({ color: 'yellow', criteria: [c] })` (see D4). Refactor `commitPending` to take `{ color, criteria }` so the color and chip paths share one function.
- Active mode: toggling a chip calls `updateActiveAnnotation({ rubricCriteria })`, which removes the field when the list becomes empty.
- An existing tag whose id isn't in the current rubric renders as a muted chip with its snapshotted name. It can be removed but not added back.
- Keyboard: the chips are ordinary buttons in tab order after the colors. The textarea keeps `autoFocus`.
- The popover's height grows with the chip row. Update the flip thresholds in `handleMouseUp` (`220`) and the active-position layout effect (`200`) so a popover near the bottom still flips above.

### Audio notes (`AudioAnnotatedResponseView.tsx`)

- New optional `rubric?: Rubric` prop. Each note row gets the same chip row between the timecode line and the textarea. Share it as a small `RubricStrandChips` component (new file next to `AnnotatedResponseView.tsx`) so both surfaces use the same markup.
- `utils/gradeDraft.ts`: keep a media note when it has a comment **or** at least one tag. Without this change, a tag-only audio note is silently dropped on save. Add a unit test for this.

### Rubric panel (`RubricScoringPanel.tsx`)

- New optional props: `tagCounts?: Record<string, number>` and `onJumpToTagged?: (criterionId: string) => void`. Projects doesn't pass them, so nothing changes there.
- Criteria with a count > 0 show a small link-style button beside the criterion name: "{count} highlight(s)" for text, "{count} note(s)" for audio.
- `FreeResponseGrader` owns the cycling. It keeps `lastJump: { criterionId, index }`, sorts that strand's annotations by `from`, and sets `activeAnnotationId` to the next one. For text, `AnnotatedResponseView` should call `scrollIntoView({ block: 'nearest' })` on the active mark when `activeId` changes from outside (add it to the existing active-position layout effect, and only scroll when the mark is off-screen). For audio, reuse the seek the timecode button already does. That means `AudioAnnotatedResponseView` seeks when `activeId` changes to a note, or exposes a callback.

### Highlights list (`AnnotationsList` in `FreeResponseGrader.tsx`)

- Under the snippet, show the strand names as small grey pills before the comment. A tagged highlight with no comment shows its pills instead of the "no comment" hint.

## Student UI

- `ReadOnlyView` in `AnnotatedResponseView.tsx`: replace the `commented` filter with "has a comment or has tags". `CommentChip` renders the strand pills (snapshotted `name`, since the student side has no override rubric) above the comment text. The pinned-chip height estimate (`COMMENT_CHIP_MIN_HEIGHT`) is only a minimum, so no layout change is needed. Check that two tagged, uncommented highlights on one line still stack.
- `ResponsePlaybackCard.tsx`: it also filters notes to those with a comment. Change that to "comment or tags", and show the same pills on each note.
- Printable report and Results drill-down don't render annotations today. No change.

## i18n

New keys go in the existing quiz grading namespace next to `highlights` (all locale files, following how `quizMediaResponse.grading.player.*` was added):

- the chip row's accessible label ("Rubric strands"),
- the chip's `aria-label` ("Tag as evidence for {name}" / "Remove {name} tag"),
- the panel link ("{count} highlight" / "{count} highlights", "{count} note" / "{count} notes"),
- the student pill group's label.

The existing popover strings are hardcoded English (`'Margin comment (optional)'`). Leave them as they are. Only the new strings use i18n.

## Tests

- `AnnotatedResponseView` test (new or extend the grader test): chips hidden without a rubric; pending chip click commits a yellow highlight with that strand and the typed comment; toggling in active mode adds/removes and omits the field when empty; orphaned tag renders muted.
- `FreeResponseGrader.test.tsx`: a tag-only change marks the grade dirty and saves; the panel count matches; the jump link cycles the active annotation.
- `utils/gradeDraft` test: a tag-only media note survives the save.
- Student read view: a tagged, uncommented highlight produces a margin chip with the strand label.

Run with `pnpm exec vitest related --run <changed files>`.

## Follow-up: Projects

`ProjectGrader.tsx` has a rubric but no highlight annotations. Once Projects gets annotation support (on submitted text or files), reuse `RubricStrandChips` and the `tagCounts` / `onJumpToTagged` panel props. Nothing to build until then.

## Out of scope

- Scoring a level from the popover (D1).
- Colors tied to strands.
- Class-level evidence reports ("every highlight tagged Thesis across the class").
