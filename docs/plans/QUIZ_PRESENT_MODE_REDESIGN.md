# Quiz Present Mode — SSO redesign

Replaces the current `PresentMode.tsx` fullscreen overlay. Scope decided in a design
interview; this document is the contract. Where a decision overturns an earlier one, the
earlier source is cited.

## Why

`PresentMode.tsx` leads with the join code at `clamp(3rem, 12vw, 9rem)` — the largest element
on the screen. In an SSO district nobody joins with a code, so the projected screen's dominant
element is dead weight, and what remains ("N of M answered") is thin.

The replacement is **two layouts, not one adaptive screen**: teacher-paced and self-paced want
genuinely different content, and a single screen would be mediocre at both.

## Constraints discovered in code (do not re-litigate)

| Fact                                                                           | Source                                 | Consequence                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `shuffleAnswerOptions` defaults **true** and shuffles per student, per attempt | `types.ts:3380`                        | The projector must **not** show lettered answer choices — they would contradict what students see. Question text only.          |
| Students already receive question text on their own device                     | `session.publicQuestions`              | Mirroring the stem on the projector is a deliberate choice for read-aloud/discussion, not a necessity.                          |
| `questionPhase: 'answering' \| 'reviewing'` already exists                     | `types.ts:3386`                        | The Kahoot-style phase split is existing plumbing, not new state.                                                               |
| `quiz_sessions` update is owner-gated with **no field whitelist**              | `firestore.rules:2973`                 | Adding `pauseMessage` needs **no rules change**. Students already read the session doc (`allow read: if request.auth != null`). |
| The student per-question timer is client-local, reset on index change          | `QuizStudentApp.tsx:1508`              | There is no shared start anchor. `autoProgressAt` is set only in `auto` mode (`useQuizSession.ts:1347`). See "Timer" below.     |
| `StimulusRenderer` accepts `enforcePlayLimit={false}`                          | `components/quiz/QuizStimulusView.tsx` | The projector's uncounted playback path already exists — pass the flag, don't fork the component.                               |

## Where it runs

**A pop-out window, not a fullscreen overlay.** Presenting currently blanks the teacher's own
screen; after this change the private monitor keeps the roster and needs-help view while the
class sees only the presentation.

Mechanism: `window.open` a blank document, then `createPortal` the presentation tree into
`popup.document.body`. The popup shares the widget's React tree and therefore its existing
Firestore listener — **no second listener, no new route, no serialization protocol.**

Implementation notes for the popup host:

- Copy stylesheets into the popup document on open: clone every `<link rel="stylesheet">` and
  `<style>` node from `document.head`. Without this the popup renders unstyled.
- Set `popup.document.title` to the quiz title, and give `body` an explicit
  `bg-brand-blue-dark` — the popup has no app shell behind it.
- Register `popup.addEventListener('beforeunload', …)` so closing the window from the OS
  clears `presenting` state in the widget.
- Close the popup on session end, on widget unmount, and on `onExit`.
- `window.open` returning `null` means the popup was blocked: surface a toast telling the
  teacher to allow popups for this site, and leave `presenting` false. Do **not** silently
  fall back to a fullscreen overlay — a fallback that sometimes takes over the teacher's
  screen is worse than a clear failure.

Entry point stays in the monitor's `⋯` menu; the item reads **"Close presentation"** while the
window is open.

## Screens

Routed on `session.status`, then `session.sessionMode`, then `session.questionPhase`.

### Lobby (`status === 'waiting'`)

Wayfinding owns the screen: quiz title at hero scale, plus a one-line instruction naming the
path — open **My Assignments**, then this title. Below it, a joined count.

Demotion is **teacher-triggered, not automatic**: the moment the first question goes live
(start/advance), the title drops to a persistent header and the mode layout takes over. No
threshold heuristics — an absent student must never pin the lobby screen up forever.

### Teacher-paced, answering (`questionPhase !== 'reviewing'`)

- **Hero:** question text. No answer choices (see constraints).
- Countdown from the question's `timeLimit`.
- Quiet `N of 24 answered`.
- Stimuli render inline when the question has them.

### Teacher-paced, reviewing (`questionPhase === 'reviewing'`)

- Anonymous answer distribution — reuse `buildDistribution` from `monitor/monitorUtils.ts`,
  the same function backing `QuestionDetail`.
- Correct answer, **still gated by the existing `showCorrectOnBoard` / reveal action**. If the
  teacher has not revealed it, it does not appear. This preserves the live-answer lock.
- Top standings (see Standings below).

### Self-paced

- **Hero:** `18 of 24 finished` at hero scale with a class progress bar.
- Secondary: still-working / not-started breakdown, from `useMonitorData().counts`.
- Live top-3 **only when gamification is active** (`isGamificationActive(scoringConfig)` —
  speed or streak bonuses on). Otherwise no standings until the end screen.

### Paused (`status === 'paused'`)

Dedicated screen — the question and standings are replaced entirely, so there is nothing to
read ahead on. Large "Paused", quiz title, and an optional reason line.

The reason line is written to `session.pauseMessage` and therefore reaches **both** the
projector and each student's own paused overlay — a student heads-down on a Chromebook sees it
too. Extend `components/quiz/QuizPausedPlaceholder.tsx` (currently hardcodes "Paused — eyes
up") to render `session.pauseMessage` when present, keeping the current copy as the fallback.

### Ended (`status === 'ended'`)

Final standings plus class stats (average, completion count). The window stays open until the
teacher closes it — do not auto-exit onto the dashboard, which would expose the private roster
view on the projector.

## Standings and names

**Default: scores without names.** `1st — 940 pts`, `2nd — 880 pts`. Every student can
recognize their own score; nobody is publicly ranked.

A control on the **teacher's private monitor** — not on the projected screen — swaps in first
names. The control panel appears in the widget while presenting and drives the popup.

**Scope:** hold the toggle as widget-local React state that resets to off every time Present
opens. It is deliberately **not** persisted to the session doc or widget config: a review game
with names on must not silently leave names on for the graded assessment that follows.

Source the rows from `buildLiveLeaderboard` (`utils/quizScoreboard.ts:449`), which already
resolves names via `pinToName` / `byStudentUid` — render or suppress the `name` field per the
toggle rather than building a second ranking path.

## Stimuli on the projector

Visual stimuli (image, PDF page, YouTube/Doc embed) render alongside the question.

Audio and video get a **teacher play control**, so a listening clip plays once for the room
instead of thirty times across thirty devices.

**Projector playback is uncounted and unlimited.** Pass `enforcePlayLimit={false}` and omit
`onPlayCompleted` so the path never writes `stimulusPlays`. Each student's own device still
enforces their own limit independently — the two paths are deliberately separate, and a
teacher misclick must never burn the class's allowance.

## Timer

The projector countdown mirrors the existing student approach: reset to `currentQ.timeLimit`
when the question index changes, tick locally. This makes the projector a third independent
clock, but it matches what students actually see and adds no new session fields.

Sub-second drift between clients is acceptable at v1 — every client observes the Firestore
index change within milliseconds. **If** drift proves visible in a real classroom, the upgrade
is a `questionStartedAt: number` stamped on the session doc at each advance, read by the
projector and students alike. Do not add it speculatively.

In `auto` mode, prefer `session.autoProgressAt` — it is already a shared anchor.

## Files

New, under `components/widgets/QuizWidget/components/present/`:

| File                        | Responsibility                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `PresentWindow.tsx`         | Popup lifecycle: open, stylesheet cloning, portal, close/blocked handling                       |
| `PresentScreen.tsx`         | Routes status → mode → phase; renders the persistent title header                               |
| `PresentLobby.tsx`          | Wayfinding hero                                                                                 |
| `PresentPacedAnswering.tsx` | Question, countdown, answered count, stimuli                                                    |
| `PresentPacedReview.tsx`    | Distribution, gated correct answer, standings                                                   |
| `PresentSelfPaced.tsx`      | Finished count, progress bar, conditional top-3                                                 |
| `PresentPaused.tsx`         | Paused screen + `pauseMessage`                                                                  |
| `PresentEnded.tsx`          | Final standings + class stats                                                                   |
| `PresentStandings.tsx`      | Shared standings block, names on/off                                                            |
| `PresentControls.tsx`       | Teacher-side panel (names toggle, media play, exit) — renders in the monitor, **not** the popup |

Modified:

- `monitor/MonitorShell.tsx` — swap `PresentMode` for `PresentWindow`; menu label toggles;
  mount `PresentControls` while presenting.
- `components/quiz/QuizPausedPlaceholder.tsx` — render `session.pauseMessage`.
- `types.ts` — add `pauseMessage?: string` to `QuizSession`.
- `docs/plans/QUIZ_INTERFACE_REDESIGN.md` — amend the two lines this supersedes (below).

Deleted: `monitor/PresentMode.tsx`.

## Superseded decisions

`docs/plans/QUIZ_INTERFACE_REDESIGN.md` records for this screen: _"Explicitly never shows names
or scores"_ (line 54–55) and specifies a unit test _"projector safety (Present shows no names
or scores)"_ (line 189).

Both are amended, not discarded. The new rule: **names and scores are hidden by default and
appear only when the teacher explicitly enables them for that presentation.** Update the test
to assert the default-off behavior and the opt-in, rather than asserting absence
unconditionally.

Line 86 of that doc rejects "anonymous student tiles as a projector mode" — that rejection
**stands**; the self-paced hero is an aggregate count and progress bar, not per-student tiles.

## Testing

Unit (Vitest + Testing Library):

- Standings render scores without names by default; names appear only with the toggle on.
- The names toggle resets to off when Present is reopened.
- Review phase suppresses the correct answer unless `showCorrectOnBoard` and a reveal are set.
- Paced answering renders no answer choices, whatever `shuffleAnswerOptions` is.
- Self-paced renders standings only when speed or streak bonuses are on.
- Projector stimulus playback never invokes the play-completed callback (uncounted path).
- `QuizPausedPlaceholder` renders `pauseMessage` when present, falls back when absent.
- Lobby demotes to a header when `status` leaves `waiting`.

Harness: extend `components/dev/SessionViewsDevHarness.tsx` with present-mode fixtures for each
of the six screens, both modes, names on and off.

No `test:rules` run is required — no `firestore.rules` change (see constraints).

`pnpm run validate` green before every push.
