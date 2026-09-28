# Video Activity: teacher-paced (live) mode

Status: planned (design settled 2026-09-28).

## 1. Intent

A teacher plays a Video Activity on the board. At each question timestamp the board video pauses and shows the question; students answer on their own devices (reached through My Assignments), and the teacher gets the class's aggregated results in the moment, reveals them on the board, and resumes the video.

This came from a teacher who believed Video Activity already worked this way. The VA editor's behavior panel offers a "Teacher-paced" session mode, and it is the default, but nothing reads `behavior.sessionMode`: `VideoActivityWidget/Widget.tsx` copies only `sessionOptions` and `attemptLimit` into the session, so every session is self-paced today.

Non-goals for v1: video on student devices, multi-class live sessions, auto-advance or countdown timers, non-YouTube providers, a live leaderboard.

## 2. Decisions (from the design interview)

| #   | Decision                   | Choice                                                                                                                                                                                             |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Student device             | Question only, no video. A "watch the board" screen between questions                                                                                                                             |
| D2  | Resume                     | The board auto-pauses at each timestamp; only the teacher's **Resume** restarts playback. Live "X of Y answered" counter                                                                          |
| D3  | Results on board           | Hidden by default. **Show results** projects the anonymous aggregate; **Reveal answer** marks the correct option                                                                                   |
| D4  | Where the mode is chosen   | At assign time. Same VA asset; the Assign dialog offers Self-paced / Teacher-paced (live), default Self-paced                                                                                      |
| D5  | The dead editor picker     | Removed from the VA behavior panel now, as an unflagged bug fix. Stored `behavior.sessionMode` values are ignored from then on                                                                     |
| D6  | Board player               | The live monitor becomes the player plus controls inside the widget (works on one mirrored screen), plus an optional Quiz-style **Present to class** pop-out for two-screen teachers               |
| D7  | Join path                  | Class sessions appear on `/my-assignments`; the `/activity/{id}` link and a QR are shown on the board. Link, QR and PIN entry are hidden when `canAccessFeature('anonymous-join')` fails            |
| D8  | Answer window              | A question accepts answers only while open (from the pause until Resume). Students who miss it see "Question closed"                                                                              |
| D9  | Student feedback           | "Submitted, eyes on the board" after answering; the device flips to correct/incorrect when the teacher reveals                                                                                     |
| D10 | Self-paced behaviors       | Require-correct, rewind-on-incorrect, retries and point penalties are off in live mode. One answer per question. The Assign dialog greys them out with a note                                      |
| D11 | Scoring                    | Same `responses` docs, so Results, export and gradebook are unchanged. Score is out of asked questions; an asked-but-missed question scores 0                                                      |
| D12 | Teacher scrubbing          | Free seek. Seeking past a timestamp skips its question (not asked, not scored). A question jump list opens any question directly                                                                  |
| D13 | Session start              | Lobby: QR/link, joined count and **Start**. The video does not play until Start                                                                                                                    |
| D14 | Targeting                  | One class per live session. Each period runs its own session from the same activity                                                                                                                |
| D15 | Names on the board         | Counts and anonymous aggregates only. A deliberate **Who hasn't answered?** popover lists names                                                                                                   |
| D16 | Aggregate display          | MC and choose-all: bar distributions (as Quiz). Fill-in-the-blank: normalized, grouped, ranked answers with an "Other (k)" bucket; the correct group is highlighted on reveal                       |
| D17 | `anonymous-join` gap       | Live mode honors it (D7). A separate unflagged bug-fix PR makes VA and Quiz self-paced honor it too, with student-side and server-side checks                                                      |
| D18 | Absent students            | An ended live session offers **Assign make-up (self-paced)**, defaulting to students with no answers. It creates a normal self-paced session                                                       |
| D19 | Returning to a closed Q    | The jump list reopens it for students who haven't answered. Existing answers stay locked; the aggregate keeps accumulating; the answer is hidden again until re-revealed                            |
| D20 | Enforcing D8               | `checkVideoActivityAnswerV1` rejects an answer whose `questionId` is not the session's open question. No `firestore.rules` growth                                                                   |

## 3. Rollout

- New `GlobalFeature` id `'video-activity-live'` in `types.ts`, with a `FEATURE_DEFAULTS` entry in `config/featureDefaults.ts`: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'keep'`, `widget: 'video-activity'`, plus `label`, `icon`, `description`. Add it to `functions/src/featureMissingDoc.ts`.
- Gate the Teacher-paced option in the Assign dialog with `canAccessFeature('video-activity-live')`. With the flag off nothing about VA changes except the D5 picker removal.
- Admin path to open: Admin Settings > Access > Previews > Video Activity live mode > Public. Admins always pass the gate.
- Changelog entry when the flag opens to everyone, not at merge.

## 4. Data model

### 4.1 Session doc (`video_activity_sessions/{sessionId}`)

New optional fields on `VideoActivitySession` (`types.ts`). All are teacher-written, which the existing owner-only update rule already allows.

```ts
sessionMode?: 'student' | 'teacher'; // absent = 'student' (every existing session)
status: 'waiting' | 'active' | 'ended'; // 'waiting' is new, live only (lobby, D13)
live?: {
  currentQuestionId: string | null;   // null = video playing / lobby
  questionPhase: 'open' | 'closed';   // D8
  resultsShown: boolean;              // D3 Show results
  answerRevealed: boolean;            // D3/D9 Reveal answer
  askedQuestionIds: string[];         // D11 denominator
  skippedQuestionIds: string[];       // D12
  playheadSeconds: number;            // last known board position, for Present sync and refresh recovery
  updatedAt: number;
};
```

`status: 'waiting'` must be accepted everywhere `status` is read: `useStudentAssignments` (the VA `KIND_CONFIG` query uses `status == 'active'`; change to `in ['waiting','active']`, as Quiz does), the teacher archive, and the monitor. Check every `status ===` comparison on VA sessions.

### 4.2 Responses

Unchanged shape. Live answers go through the existing `submitAnswer` transaction and `checkVideoActivityAnswerV1`. No new student-written fields, so the response rules are unchanged.

Scoring (D11): the live `completeActivity` path computes `score` over `askedQuestionIds`, not all questions. `Results.tsx` and the export read `sessionMode` and the asked list so skipped questions render as "Not asked", not as 0.

### 4.3 Server check (D20)

In `functions/src/videoActivityKey.ts` `checkVideoActivityAnswerV1`: when the session has `sessionMode === 'teacher'`, reject unless `live.currentQuestionId === questionId && live.questionPhase === 'open'`. Return a typed error the student client maps to "Question closed". The function already reads the session doc, so this adds no reads.

Because `submitAnswer` writes the answer doc directly, the client must call the check first and only write on success (as it does today). A tampered client could still write an ungraded answer; `isCorrect` is only trusted from the function, so it cannot score. Note this in the PR.

## 5. Teacher side

### 5.1 Assign dialog (D4, D10, D14)

- A Self-paced / Teacher-paced (live) segmented control, visible only with the flag.
- Live selected: the class picker becomes single-select; the self-paced-only controls (require correct, rewind, attempt limit, penalty) are disabled with one line of explanation.
- `createSession` (`hooks/useVideoActivitySession.ts`) writes `sessionMode: 'teacher'`, `status: 'waiting'` and an initial `live` block. Carry the mode through every assign entry point (the widget, library assign, PLC assign modals).

### 5.2 Live player (D2, D6, D12, D13, D15)

A new `VideoActivityLivePlayer` view in `components/widgets/VideoActivityWidget/`, used instead of `VideoActivityLiveMonitor` when `sessionMode === 'teacher'`. Add a `'live'` value to `VideoActivityConfig.view`.

- **Lobby:** big QR plus short link (both behind `anonymous-join`, D7), the class name, "N joined", and **Start**. Start sets `status: 'active'`.
- **Playing:** a `VideoPlayer` (reuse `components/videoActivity/VideoPlayer.tsx` in an unlocked teacher mode, no `maxAllowedRef` lock). On reaching an unasked question's timestamp: pause, and write `currentQuestionId`, `questionPhase: 'open'`, and push to `askedQuestionIds`.
- **Paused on a question:** the question text and options on the board; "X of Y answered"; buttons **Show results**, **Reveal answer**, **Resume**. Resume writes `questionPhase: 'closed'`, `currentQuestionId: null` and plays.
- **Seek (D12):** a seek that lands past unasked timestamps adds them to `skippedQuestionIds`, removing them from asked if never opened. Timestamp triggers fire only on forward playback crossing, not on seek.
- **Jump list (D12, D19):** a side list of questions with state chips (upcoming / open / closed / skipped). Clicking one seeks to its timestamp and opens it. A closed question reopens with `answerRevealed: false`, `resultsShown: false`.
- **Who hasn't answered? (D15):** a popover from the answered counter, listing joined students without an answer to the open question, plus roster students who haven't joined.
- **End:** sets `status: 'ended'` and runs the existing finalize path.

Pacing writes are small single-doc updates; keep them in one `useVideoActivityLiveControls` hook modeled on `useQuizSession.ts` `advanceQuestion` / `revealAnswer`.

### 5.3 Aggregates (D3, D16)

- MC / MA: reuse `monitorUtils.buildDistribution` from `QuizWidget/components/monitor/` (move to `utils/` if the import would cross widget folders) and the `QuestionResults` bar component.
- FIB: a new `groupFillInAnswers(answers, question)` in `utils/` that normalizes (trim, case, whitespace, `acceptableVariants`) and returns ranked groups with a top-N cut and an "Other (k)" bucket. Unit-test it.
- The teacher's client already has the answer key (`useVideoActivityKeyQuestions`) and the responses listener, so aggregation is client-side with no new reads.

### 5.4 Present window (D6)

Reuse `QuizWidget/components/present/PresentWindow.tsx` (the popup portal). The projector shows the video, the open question and, when shown, the aggregate. The widget keeps the controls and drives the popup's player through the window handle `onWindowReady` already provides. When the popup is open, the in-widget video is hidden and the widget shows controls only, so there is one audio source.

### 5.5 Make-up (D18)

When an ended live session is open in Results, show **Assign make-up (self-paced)**. It opens the normal self-paced Assign dialog pre-filled with the same activity and class, and a student filter defaulting to students with no answers. The make-up is its own session and scores separately.

## 6. Student side (D1, D7, D8, D9)

In `components/videoActivity/VideoActivityStudentApp.tsx`, branch on `session.sessionMode === 'teacher'` into a new `VideoActivityLiveStudent` view. It never mounts `VideoPlayer`.

| Session state                                  | Student sees                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `waiting`                                      | "You're in. Waiting for your teacher to start."                             |
| `active`, `currentQuestionId: null`            | "Watch the board."                                                          |
| open question, not answered                    | The question (reuse `QuestionOverlay` input parts) and Submit               |
| open question, answered                        | "Submitted, eyes on the board" with their answer shown locked               |
| `answerRevealed`                               | Correct / incorrect on their answer; "You didn't answer this one" if missed |
| closed question, not answered, not revealed    | "Question closed"                                                           |
| `ended`                                        | Existing completion screen with score if `scoreVisibility` allows           |

Refresh and late join simply render from current session state; there is no local progress to restore. The tab-away timer and tab-exit tracking keep working as today.

PIN entry (D7): when the session's teacher fails `anonymous-join`, the PIN form is not shown. The student app cannot evaluate the teacher's permission itself, so `createSession` stamps `allowAnonymousJoin: boolean` on the session, and the student app and `pinLoginV1` read that. This field is shared with the D17 bug-fix PR; land it there first.

## 7. PR sequence

Each PR targets `dev-paul`.

1. **Remove the dead session-mode picker (D5).** Unflagged bug fix. Drop the mode block from `components/common/library/VideoActivityBehaviorSettingsPanel.tsx`; leave the type and `DEFAULT_VA_BEHAVIOR.sessionMode` in place (ignored) so stored docs still parse. No changelog (the control never did anything), or a one-line fix note if Paul prefers.
2. **Honor `anonymous-join` in VA and Quiz (D17).** Unflagged bug fix. Stamp `allowAnonymousJoin` on new VA and Quiz sessions; hide the link/PIN/join-code options in both assign flows and monitors when the check fails; hide the PIN form in both student apps when the stamp is false; reject in `pinLoginV1` for sessions stamped false. Existing sessions without the stamp behave as today.
3. **Flag, data model and server check.** `video-activity-live` feature, the `VideoActivitySession` fields, the `'waiting'` status in every reader, `createSession` support, the D20 check in `checkVideoActivityAnswerV1` with a functions unit test, D11 scoring over asked questions.
4. **Assign dialog and teacher live player** (§5.1, §5.2) with lobby, pause/resume, seek/skip, jump list, who-hasn't-answered.
5. **Student live view** (§6).
6. **Aggregates and Present window** (§5.3, §5.4), including `groupFillInAnswers` and its tests.
7. **Make-up flow and Results polish** (§5.5, "Not asked" rendering, export column).

PRs 3–7 are flagged and can be tested end-to-end on `spartboard-dev` after PR 5 (without aggregates). The PR description for each names the flag, its `admin` starting level, and the Previews path.

## 8. Testing

- Unit: `groupFillInAnswers`; live scoring over `askedQuestionIds`; the seek-to-skip logic as a pure function (`computeSkippedOnSeek(prev, next, questions, asked)`); the D20 check in `functions/`.
- Rules: none changed in PRs 3–7. PR 2 changes only functions and clients.
- Manual on dev: one teacher tab + two student tabs (one SSO mock class student, one PIN) through lobby, three questions, a skip, a reopen, reveal, end, and make-up. Repeat with `anonymous-join` off for the teacher's building to confirm no link/QR/PIN.
- Add the live player and student view to `tests/tourAnchors.test.ts` only if tour anchors are added.

## 9. Open follow-ups (not v1)

- Teacher-set countdown per question.
- Muted synced video on student devices for teachers who want it.
- MCP connector: `create_video_activity` needs no change (mode is assign-time), but `get_video_activity_results_summary` should label live sessions and skipped questions once PR 7 lands.
