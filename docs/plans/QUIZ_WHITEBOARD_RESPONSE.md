# Quiz whiteboard response (rich-response B track)

> **Status: live plan, refreshed 2026-10-13. Nothing built yet.** The design
> decisions were made 2026-08-04 → 08-07 in the rich-response wayfinder
> ([RR-B1](../rich-response-wayfinder.md#rr-b1--can-drawingwidget-be-the-student-whiteboard-substrate),
> [RR-B2](../rich-response-wayfinder.md#rr-b2--is-the-audio-synchronized-to-the-strokes-or-just-attached-alongside),
> [RR-B4](../rich-response-wayfinder.md#rr-b4--what-is-a-whiteboard-responses-canonical-coordinate-space-and-page-size);
> [RR-B3](../rich-response-wayfinder.md#rr-b3--what-does-grading-30-whiteboard-plus-audio-responses-look-like)
> still open). The audio track then shipped 2026-09-02
> ([IMPLEMENTATION.md](shipped/rich-response/IMPLEMENTATION.md)) and two months
> of quiz work landed on top of it. This doc is the single current picture: what
> still stands, what the shipped code changed, and what is left to decide. The
> wayfinder stays the decision record; where this doc and the wayfinder
> disagree, this doc is newer.

## What a whiteboard response is (the decisions that still stand)

A per-question response mode, not a question type (RR-01). The student presses
Record; mic and canvas arm together on one clock; the board starts blank; they
draw and narrate; the take ends at commit or at the limit. A take is buffered in
memory and written once at commit, exactly like an audio take.

| #   | Decision                                                                                                                                    | Source        | Status today                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| W1  | Timed + narration-synced replay: a teacher scrubs a timeline and watches the work appear as the student talks                               | RR-B2 sd-1    | Stands. Capture log costs more than priced (see C1)                                                                 |
| W2  | One armed take, blank start; no sketch-then-explain, no "continue my draft"                                                                 | RR-B2 sd-2    | Stands                                                                                                              |
| W3  | Undo, erase and redraw are events in the log and replay to the teacher                                                                      | RR-B2 sd-3    | Stands; the student notice must say so plainly                                                                      |
| W4  | A silent take is complete; SpartBoard never inspects a recording to decide whether a student responded                                      | RR-B2 sd-4    | Stands                                                                                                              |
| W5  | Drive archive = a per-response folder of three files: transcoded audio, final-state PNG, event-log JSON                                     | RR-B2 sd-5    | **Collides with shipped archive shape** (C3) — reopen                                                               |
| W6  | Mic denied → the canvas arms alone and records a silent take                                                                                | RR-B2 sd-6    | Stands, but the provenance field it relied on was never built (C6)                                                  |
| W7  | Tools: pen, eraser, colours, typed text, shapes. No image insertion, one page                                                               | RR-B2 sd-7    | Stands. Note the pixel eraser is a `color: 'eraser'` path and the lasso eraser is a `bulkRemove`; replay needs both |
| W8  | 180 s default, 600 s maximum per take                                                                                                       | RR-B2 sd-8    | **At risk** (C7, C8) — audio's shipped ceiling is 300 s                                                             |
| W9  | Takes inherit audio's semantics: `takeIndex`, `takeLimit` (default unlimited), discards never written, no pause, retake starts blank        | RR-B2 derived | Stands; shipped helpers are generic (`utils/answerTakeOrdering.ts`, `commitRecordingTake`)                          |
| W10 | Fixed logical page 1600×1200 (4:3), absolute coordinates, identical on every device                                                         | RR-B4 sd-1/2  | Stands                                                                                                              |
| W11 | Portrait is gated ("rotate your device"), not letterboxed; the gate is absolute and the empty slot records why                              | RR-B4 sd-3/4  | Stands; check against the new stimulus layout (C9)                                                                  |
| W12 | Fixed 2× bitmap, 3200×2400, live and archived; no `devicePixelRatio` branching                                                              | RR-B4 sd-5    | Stands                                                                                                              |
| W13 | The teacher Drawing widget moves to the same fixed page (read-time pure migration, `pageSpaceMigrated` flag, scalars scale by the same `k`) | RR-B4 sd-6    | Stands, scope grew (C10). Lands first, own PR, before/after screenshots                                             |

**Moot since August:** RR-B2's RR-05 rider (transcription on the take) — AI
transcription is not planned (Paul, 2026-09-01). RR-B2's "ships ungated as
audio-class" — every recording mode now sits behind the fail-closed
`quiz-media-response` flag (C11).

## What changed since 2026-08-07 (audit 2026-10-13)

Audited against current code by three read-only sweeps. Line numbers are as of
this date.

- **C1 — The undo stack can no longer be the capture log.** #4142 (2026-10-13)
  caps `past` at `MAX_UNDO_DEPTH = 100` per page
  (`DrawingWidget/useCommandStack.ts:46-50`). RR-B2's "the capture layer is the
  array `useCommandStack` already builds, never popped" is now false: `past`
  silently drops its oldest commands. The log must be its own uncapped
  `{ t, cmd }[]` written at the push/undo/redo call sites. The cap's own reason
  (snapshot-holding commands grow memory) applies harder to an uncapped
  10-minute log: `clear`/`bulkRemove` carry whole-page snapshots and `update`
  carries before and after. The log needs a size budget. `applyCommand` is
  still pure and bidirectional (`commands.ts:47-127`), so replay is still free;
  `reorder` is still never constructed.
- **C2 — `/quiz` still has no teacher-context shim, so the widget can't be
  dropped in.** `App.tsx:1420-1429` mounts only `DialogProvider`. The student
  canvas has to be a new quiz component built from the pure parts
  (`useDrawingCanvas`, `renderers/`, `commands.ts`, `hitTest.ts`,
  `useSelection`, `TextEditorOverlay`, `exportCanvas.ts`), not `Widget.tsx`.
  Two precedents now exist: `components/layout/AnnotationOverlay.tsx` already
  composes those hooks outside the widget at a fixed internal resolution
  (`canvasWidth/Height`), and `useSubShareDrawingObjects.ts` is a shipped
  in-memory backing store (substitute boards draw without writing Firestore).
- **C3 — The shipped archive is one artifact → one storage path → one Drive
  file, in a flat folder.** `ResponseArtifact` has one `storagePath`;
  `ArtifactArchiveEntry` has one `driveFileId` (`types.ts:5444`). Drive layout
  is `Quiz Responses/{quizTitle}/{Last}_{First}__Q{n}.m4a`
  (`quizMediaArchive.ts:306-319`) with no take index in the name, and no
  per-response folder. W5's three-file folder needs either three artifacts per
  take or a multi-file archive entry; the delete console
  (`deleteQuizMediaForOrgAdmin.ts`), the straggler sweep and the cleanup paths
  all assume one file per artifact.
- **C4 — Paper handwritten responses shipped and already widened the
  pipeline once.** `ArtifactKind` gained `'handwriting'`, and the archive
  branches on kind (`ArchivableKind = 'audio' | 'handwriting'`,
  `quizMediaArchive.ts:207`). Whiteboard is the third branch in that code, not
  its own pipeline. `'whiteboard'` is already in the `ArtifactKind` union and
  used nowhere. (The paper doc's header still says "plan only"; it shipped.)
- **C5 — There is no persisted response-mode set.** `RecordingConfig`
  (`types.ts:4436`) has no `modes`; `recordingModesForQuestion` returns
  `['audio']` for any block (`utils/quizRecordingModes.ts:28-32`). The editor's
  control is Typed/Spoken, inline per question (`ResponseFormatSection.tsx`),
  not in a Settings tab — and QUIZ_REVIEW_SPLIT D10 removes that tab anyway.
  Whiteboard needs the mode field added first, with "a block with no modes
  means audio" kept for every saved quiz.
- **C6 — The provenance field RR-B2 and RR-B4 owed RR-02 was never built.**
  `UnrespondedReason` is `passed | expired | abandoned | capture-unavailable |
paper-unclear`. A denied mic on audio writes `capture-unavailable`. Nothing
  separates silent-by-choice, mic-denied (W6) and portrait-gated (W11).
- **C7 — Audio's shipped ceiling is 300 s, and the transit path caps at 5 MB.**
  `AUDIO_LIMIT_SECONDS_MAX = 300`; `storage.rules:292-297` allows only
  `audio/.*` under 5 MB; `getQuizArtifactPlaybackUrl` caps playback at 4 MB and
  filters `kind === 'audio'`. A 600 s whiteboard take is double any take the
  pipeline has carried.
- **C8 — Two shipped quiz features can kill a take mid-recording.** Tab-away
  auto-submit (`useTabAwayTracker`, `QuizStudentApp.tsx:1885`, per-student
  `tabAwayLimit`) and the overall quiz time limit (`quiz-time-limit`) know
  nothing about an in-progress take. Matters for audio today; matters ten times
  more at 600 s, where RR-B2 already accepted that a lost take is ten minutes
  of work with nothing on the server.
- **C9 — The student page layout moved.** Quiz is self-paced only
  (QUIZ_REVIEW_SPLIT D8; recording already was). A document stimulus takes a
  resizable left panel (44%, min 320 px) beside a `max-w-7xl` answer column
  (`QuizStudentApp.tsx:3484-3515`). On a 1366×768 Chromebook a 4:3 canvas beside
  a stimulus is height-bound and small. RR-B4 assumed the canvas had the screen.
- **C10 — The page-space migration (W13) now has a wider blast radius.**
  `useDrawingCanvas` is shared with `AnnotationOverlay` (and its pure hooks
  are imported there), and `migrateDrawingConfig` has four call sites, not
  three (`Widget.tsx:115`, `settings.schema.ts:23`, `DashboardContext.tsx:5545`,
  `utils/migration.ts:114`). Not started: no 1600 constant, no
  `pageSpaceMigrated`, no `devicePixelRatio` in any inking path.
- **C11 — Flag conventions changed.** `quiz-media-response` is `stage:
'preview'`, admin, `failClosedForAdmins: true`, read only through
  `canAccessQuizMediaResponse`, and the server checks it only for
  `kind === 'audio'` (`quizMediaArchive.ts:812`). Its permission record still
  doesn't exist (TODO.md), so audio itself is not on for anyone. Feature entries
  now carry `stage`, `afterLaunch`, `group`, `requires`; `paper-handwritten-responses`
  is the nearest model.
- **C12 — The grading side grew, and is audio-only in the places that matter.**
  `FreeResponseGrader` has question- and student-major modes, pinned takes,
  capture-unavailable adjudication, and a rubric panel (M12 shipped). But
  `slotNeedsManualGrading` returns true only for audio/video
  (`utils/mediaGrading.ts:71`), so a whiteboard artifact would never enter the
  queue. A media-agnostic scrubber now exists — `WaveformScrubber.tsx` takes
  peaks, `currentMs` and ms markers — which is a closer start than the
  YouTube-welded Video Activity timeline RR-B3 pointed at. There is also a
  second grader to cover: the Classroom add-on's `TeacherReviewRoute.tsx`.
- **C13 — Grades may move.** GRADEBOOK D37 plans to move grading and comments
  off the student-readable response doc into `{quiz}_sessions/{id}/grades/`.
  Unbuilt. Whiteboard grading should target wherever that lands.
- **C14 — RR-B3 was never run.** The 30-response stopwatch prototype is still
  the only empirical check on W8's ceiling and on RR-06's question-major queue
  (TODO.md:239).

## Where the build plugs in (sketch, not decided)

Not an ordering — that comes after the grilling. Listed so the questions below
can be answered against real surfaces.

- **Types:** `RecordingConfig.modes`; whiteboard ceiling in
  `RECORDING_MODE_CEILING_SECONDS`; provenance beside `UnrespondedReason`;
  archive entry shape (C3).
- **Student:** a capture hook beside `hooks/useAudioRecording.ts` that owns the
  canvas, the mic and one clock; a `WhiteboardResponseCapture` beside
  `AudioResponseCapture.tsx` reusing its prep/armed/review phases and notice
  gate; the artifact build at `QuizStudentApp.tsx:952-1000` (hardcodes
  `kind: 'audio'`) and the `artifacts[0]` read at :3135.
- **Transit + archive:** `storage.rules` content types; `utils/quizMediaUpload.ts`
  (one blob per job, audio extension map); `quizMediaArchive.ts` kind branch,
  transcode skip for PNG/JSON, file naming; sweep; delete console.
- **Teacher:** `slotNeedsManualGrading`, a replay view driven by `currentMs`
  over `applyCommand`, `FreeResponseGrader` + `TeacherReviewRoute`, playback
  callable, student results card.
- **Authoring:** `ResponseFormatSection.tsx` (Typed/Spoken → a third choice),
  `config/quizRecordingDefaults.ts` clamp.
- **Teacher widget:** W13 migration across the four `migrateDrawingConfig`
  sites and `exportCanvas.ts` (`ctx.scale(2, 2)`).

## Open questions (agenda for the grilling)

1. **Is the product still the same?** Paper handwritten responses now cover
   "show your work on paper" for typed-answer transcription. Is the whiteboard
   still timed + narrated (W1), or is a silent draw-only first slice the right
   start, with narration second?
2. **RR-B3 first, or measure in production?** Run the stopwatch prototype before
   building the grading surface (the wayfinder's position), or ship behind the
   flag to Paul and time real responses?
3. **Archive shape (C3).** Three artifacts per take, or one artifact with a
   multi-file archive entry? Per-response Drive folder (W5) or flat files with a
   take index in the name, matching audio?
4. **Final-state PNG:** rendered client-side at commit (a third upload) or
   server-side from the log (a headless renderer)? Left open by RR-B2.
5. **Capture log budget (C1).** A size cap or delta encoding for `update` and
   `clear` snapshots; what happens when a take hits it.
6. **Mode set (C5).** Typed / Spoken / Whiteboard as one single choice per
   question, or can a teacher allow more than one (RR-A3's "student's choice")?
   Does whiteboard always arm the mic, or can a teacher author it silent?
7. **Take length (C7, W8).** Keep 180 / 600 s, or align with audio's 300 s
   ceiling? What the 5 MB transit cap means at that length.
8. **Takes vs tab-away and the quiz clock (C8).** Does an armed take suspend
   tab-away auto-submit and the quiz time limit, end the take cleanly, or
   neither? And does a 10-minute take get any local safety net (e.g. IndexedDB)
   against a tab crash, given RR-B2 accepted "lost is lost"?
9. **Provenance (C6).** Add the field now, separating silent-by-choice,
   mic-denied and portrait-gated — and retrofit audio's `capture-unavailable`?
10. **Layout (C9, W11).** Canvas beside a stimulus on a 768 px-tall Chromebook,
    or a full-width answer view with the stimulus collapsible? Is the portrait
    gate still absolute?
11. **Teacher widget migration (W13, C10).** Still in scope and still first?
    Does it include the annotation overlay, which shares the canvas hook?
12. **Flag (C11).** Its own fail-closed `quiz-whiteboard-response` flag with
    `requires: 'quiz-media-response'`, or ride the audio flag? A silent take
    doesn't need the mic at all.
13. **Grading (C12, C13).** Open on the final-state PNG or on the replay? A
    thumbnail grid for triage (4:3 makes it uniform)? Reuse `WaveformScrubber`
    with markers; rubric panel as shipped; both graders.

## Out of scope

Image insertion, multi-page responses, a re-do workflow over earlier work, AI
transcription or AI grading, video capture (its own deferred track), and server
MP4 rendering (rejected on cost in RR-B2).
