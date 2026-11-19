# 021 — Progress bars: animate `width` only, and stop the video timeline marker trailing the pointer

- **Status**: TODO
- **Commit**: 3dcc1cd
- **Severity**: MEDIUM
- **Category**: Performance (also Interruptibility)
- **Estimated scope**: 11 files, 12 class strings

## Problem

**Part A: progress and tally fills use `transition-all`.** Each of these is a fill whose inline `width` percentage changes. `transition-all` animates every property on the element when only `width` is meant to move. Several are student-facing and run on low-powered Chromebooks.

| File                                                                       | Line | Current class fragment                                                                       |
| -------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `components/quiz/QuizStudentApp.tsx`                                       | 4508 | `` `h-full transition-all ${progressFill}` ``                                                |
| `components/poll/PollVoteApp.tsx`                                          | 494  | `` `h-full transition-all duration-500 ${ ``                                                 |
| `components/widgets/GuidedLearning/components/GuidedLearningPlayer.tsx`    | 831  | `"h-full rounded-full bg-brand-blue-primary transition-all duration-200"`                    |
| `components/activityWall/submission/ComposerSheet.tsx`                     | 355  | `"h-full bg-brand-blue-primary transition-all"`                                              |
| `components/widgets/QuizWidget/components/monitor/CurrentQuestionCard.tsx` | 234  | `"h-full bg-brand-blue-primary rounded-full transition-all"`                                 |
| `components/admin/Announcements/Widget.tsx`                                | 610  | `"h-full bg-indigo-500 transition-all duration-500 rounded-full"`                            |
| `components/remote/controls/RemotePollControl.tsx`                         | 389  | `` `h-full rounded-full transition-all duration-300 ${BAR_COLORS[i % BAR_COLORS.length]}` `` |
| `components/remote/controls/RemotePollControl.tsx`                         | 416  | same as line 389                                                                             |
| `components/converter/ConverterPage.tsx`                                   | 185  | `"h-full bg-indigo-500 transition-all duration-200"`                                         |
| `components/widgets/VideoActivityWidget/components/Results.tsx`            | 953  | `` `h-full rounded-full transition-all ${colors.bar}` ``                                     |
| `components/import/course/CourseImportScreen.tsx`                          | 407  | `"h-full bg-brand-blue-primary transition-all"`                                              |

Each of these elements has `style={{ width: ... }}` within the next three lines.

**Part B: the video activity timeline marker eases its own position while being dragged.**

```tsx
// components/widgets/VideoActivityWidget/components/Timeline.tsx:517-524 — current
className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-all touch-none ${dot} ${
  isDragging
    ? `w-4 h-4 ring-2 cursor-grabbing ${amber ? '' : 'bg-emerald-600 ring-emerald-300'}`
    : isActive
      ? 'w-4 h-4 ring-2 cursor-grab'
      : 'w-3 h-3 hover:w-4 hover:h-4 cursor-grab'
}`}
style={{ left: `${pct}%` }}
```

`transition-all` includes `left`, so each pointer move starts a 150ms ease toward the new position and the dot should trail the pointer during a drag. A dragged element must follow the pointer exactly. Derived from the code; step 1 confirms it.

## Target

**Part A:** at each of the eleven sites, replace `transition-all` with `transition-[width]`. Durations stay as written (sites with no `duration-*` class keep Tailwind's 150ms default).

A `scaleX` transform would avoid layout entirely, but most of these fills have rounded ends that a horizontal scale would squash, and each is a single small element inside a fixed-size track, so the layout cost is negligible. Naming `width` is the right-sized fix.

**Part B:** on the timeline marker, replace `transition-all` with `transition-[width,height,box-shadow,background-color]`. The hover grow (12px to 16px), the ring (a box-shadow in Tailwind v4) and the colour change still ease; `left` no longer does.

## Repo conventions to follow

- Exemplar of a fill that already names its property: `components/widgets/QuizWidget/components/FreeResponseGrader.tsx` (`transition-transform ease-linear duration-900`).
- Comments are one short line at most. No new dependencies.

## Steps

1. Confirm Part B before editing. Start the bypass dev server (`vite-verify` entry in `.claude/launch.json`), open a Video Activity editor with at least one question on the timeline, and drag a marker steadily for about a second while sampling per frame the pointer's x and the marker's `getBoundingClientRect()` centre x. Record the largest gap between them. A gap that grows with pointer speed and closes about 150ms after you stop confirms the lag. If the marker tracks the pointer within 1px throughout, skip Part B and say so. If you cannot reach a Video Activity editor in the bypass app, say so and make the Part B edit anyway (the reasoning is sound and the change is safe).
2. Part A: at each row of the table, replace `transition-all` with `transition-[width]`. Line numbers may have drifted; locate each by its fragment and confirm the element sets `width` in an inline style. If a listed element does not set an inline `width`, skip it and report it.
3. Part B: make the replacement in `Timeline.tsx`.
4. Mark this plan DONE here and in `plans/README.md`.

## Boundaries

- Do NOT touch `components/widgets/PollWidget/Widget.tsx` (its fill at line 488 already carries `motion-reduce:transition-none` and extra classes; leave it) or `components/widgets/PollWidget/components/ScaleResults.tsx` (animates `height`, already guarded).
- Do NOT convert any fill to a `scaleX` transform.
- Do NOT change durations, colours, markup, inline styles or `tourFieldAttr` anchors.
- Do NOT touch any other `transition-all` in these files; several of them have many, on buttons and cards.
- No feature flag, no changelog entry.

## Verification

- **Mechanical**: `pnpm exec vitest related --run` on the eleven edited files. `QuizStudentApp.tsx` has a large related set; it must pass. Commit; the pre-commit hook is the lint gate. Never run full lint, the full suite, `tsc` or `pnpm run validate`.
- **Feel check**:
  - Student quiz (bypass app, student route, or the quiz dev harness): answer a question; the progress fill still eases to its new width. `getComputedStyle(fill).transitionProperty` is `width`.
  - Poll results on the teacher board and the remote: bars still grow smoothly.
  - Video Activity timeline: drag a marker; it stays under the pointer with no trailing. Hover a marker: it still grows from 12px to 16px smoothly. Select one: the ring still eases in.
- **Done when**: every listed fill reports `transitionProperty: width`, and the marker's largest gap from the pointer during a drag is under 2px.
