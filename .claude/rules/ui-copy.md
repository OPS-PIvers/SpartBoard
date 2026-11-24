---
paths:
  - 'locales/**'
  - 'changelog.d/**'
  - 'public/changelog.json'
  - 'tests/copyGuard.test.ts'
---

# SpartBoard's words

Paul has already chosen these. Use them in every string, in every locale, and never vary one for style.
How to write a string is the `ui-copy` skill (`pauls-skills` plugin); run it before adding or changing
any on-screen text. This file is only the word list. When Paul picks a new word, add a row here in the same PR.

| Say                                                                 | Never                                                | Where                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| attempt ("Attempts per card", "Attempt 2 of 3")                     | try, take, retake as a noun ("Try again" is fine)    | everywhere; `tests/copyGuard.test.ts` |
| Assigned students                                                   | picked students                                      | assignment rows, Previews             |
| Final score: Latest / Highest / Average                             | Score that counts, Use latest                        | quiz attempts, Gradebook              |
| Score                                                               | Points awarded                                       | grading                               |
| category                                                            | criterion                                            | rubric grader                         |
| Replays; "Play audio (N/M)"                                         | play limit, plays remaining, views                   | question audio                        |
| Submitted / Missing                                                 |                                                      | student work that can still be done   |
| Not submitted (muted gray)                                          | Missing, once the work can no longer be turned in    | expired or closed work                |
| Turn in / Turned in                                                 | Submit / Submitted                                   | Writing only                          |
| Skipped                                                             | Left out                                             | questions and students passed over    |
| Select                                                              | Choose                                               | pickers, dialog titles                |
| Last, First                                                         | First Last                                           | student names in lists                |
| Assessment Settings                                                 | Session settings                                     | Assign dialog                         |
| Import options                                                      | Ways in                                              | import dialogs                        |
| Text / Link / Drive file                                            | labels with examples ("Text, like a word bank")      | Supports menu                         |
| Device details (gray)                                               | Unusual input, for a second screen alone             | input signs                           |
| Draft with AI; "Generate questions"; "Finding a video…" as progress | Gemini, Claude, "Generate with AI", "Asking Gemini…" | every AI entry point                  |
| the page, your assignment                                           | the check, the try, a feature name used as a place   | student-facing copy                   |
| Unscored value                                                      | a sentence explaining what a flag does to a cell     | Gradebook flags                       |
| Discussion Notes                                                    | Decisions                                            | meeting notes template                |

- Menu items and buttons never end in "…" or "...", even when they open a dialog.
- Never send a user to the school office.
- Graduate is "Move to Features or widget settings." Retire is "Remove the switch." Hints stay that short.
- A warning goes on the control that fixes it (the "Check tour" button turning amber), not on a new status chip.
- A toast about students lists them (Last, First, with date and time) instead of giving a count.
