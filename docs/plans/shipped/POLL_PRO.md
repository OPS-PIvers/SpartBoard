# Poll: from class vote to a pro live-response tool

Proposed 2026-10-25. Waiting on Paul's go-ahead before any build.

## Why Poll

I compared three candidates against the tools teachers already know.

| Candidate         | Best-in-class reference                                          | Gap today                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Poll** (picked) | Mentimeter, Slido, Pear Deck                                     | Large. Multiple choice only. Results show on the board and on phones as votes arrive, so students follow the crowd. No reveal, no lock, no correct answer, no "how many have answered". Bars use indigo. |
| Seating Chart     | Dedicated seating apps (constraint shuffles, saved arrangements) | Medium. Layouts and drag are solid; missing "keep apart" rules, saved arrangements per class, and print.                                                                                                 |
| Scoreboard        | Game-show scoreboards, ClassDojo points                          | Small. Teams, rows/cards, roster groups and quiz live-sync already exist.                                                                                                                                |

Poll wins because the gap is the largest, it is used live in front of the whole class (so quality shows), and the live device voting backbone (join code, QR, `poll_sessions`, per-device votes, rules) is already built. Most of the work is on top of what exists, not a rebuild.

## What exists (reuse, don't rebuild)

- Multi-question polls with a presentation cursor; teacher moves the board and every phone together.
- Join code + QR, phone voting app (`components/poll/PollVoteApp.tsx`), resume/restart sessions.
- Manual +/- voting when no live session, roster import for options, announcement embeds, sub-share and shared-board handling.
- Firestore rules for one vote per device per question.

## The upgrade, in four slices (each its own PR, all behind one flag)

**Slice 1. Results control (the biggest pro gap).**

- Hide results until the teacher reveals them, on the board and on phones. Default for new polls: hidden.
- Lock voting on the current question without ending the session.
- Live count on the board: "12 of 24 answered" (joined devices vs votes).
- Reveal animates bars from zero; bars recoloured to brand blue (drop indigo).

**Slice 2. Correct answer.**

- Optionally mark one or more options correct. On reveal, the correct bar is marked with a check icon and label (not colour only). Phones show "Correct" / "Not quite" after reveal only.

**Slice 3. More question types.**

- Rating scale (1-5 or 1-10, with end labels), shown as a distribution plus average.
- Word cloud (short answer, up to 3 words), reusing the Activity Wall word cloud renderer.
- Open text, with a moderation list before anything shows on the board (reusing the Activity Wall moderation pattern).
- Rules: new vote doc shapes per type, rules tests for reads and writes, size checked with `check:rules-size`.

**Slice 4. After the poll.**

- Results summary per question (counts, percent, average) and CSV export.
- Save a poll to reuse later (from the Poll widget, no new library).

## Guardrails

- Flag: new `GlobalFeature` `poll-pro`, `defaultAccessLevel: 'admin'`, `stage: 'preview'`. Old behaviour stays for teachers until you open it. Path: Admin Settings > Access > Previews > set to Public.
- Existing polls keep working: results default to "shown" for polls created before the flag (no surprise behaviour change mid-class).
- Every new control gets a live tour anchor.
- Mockup as an in-app harness page with real tokens, before/after screenshots of the real widget at several sizes, before merge.
- All new on-screen wording comes to you for OK before push. Draft labels for Slice 1: "Show results", "Hide results", "Lock voting", "Unlock voting", "12 of 24 answered".
- No purple, gradients, card-heavy UI or anything added to the widget header bar.

## Added beyond your ask

- Recolouring the existing indigo bars to brand blue (style rule fix that rides along with Slice 1).
