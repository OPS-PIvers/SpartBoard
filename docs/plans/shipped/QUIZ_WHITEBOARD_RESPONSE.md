# Quiz whiteboard response (rich-response B track)

> **Status: decided 2026-10-13 (grilled with Paul). Built (verified 2026-11-01 sweep); human leftovers are in `TODO.md`.** The
> original design came from the rich-response wayfinder, 2026-08-04 → 08-07
> ([RR-B1](../../rich-response-wayfinder.md#rr-b1--can-drawingwidget-be-the-student-whiteboard-substrate),
> [RR-B2](../../rich-response-wayfinder.md#rr-b2--is-the-audio-synchronized-to-the-strokes-or-just-attached-alongside),
> [RR-B4](../../rich-response-wayfinder.md#rr-b4--what-is-a-whiteboard-responses-canonical-coordinate-space-and-page-size)).
> The audio track then shipped 2026-09-02
> ([IMPLEMENTATION.md](rich-response/IMPLEMENTATION.md)) and two months
> of quiz work landed on top of it, so the plan was audited against current code
> (C1–C14 below) and re-decided. **This doc supersedes the wayfinder's B-track
> tickets wherever they differ**; the wayfinder stays the record of why the
> August decisions were made. RR-B3 (the 30-response grading stopwatch) is
> dropped (D27).

## What it is

A per-question response mode, not a question type (RR-01). The student presses
Record; mic and canvas arm together on one clock; the board starts from the
teacher's starting page; they draw and narrate; the take ends at commit, at the
limit, or at a cutoff. A take is buffered in memory (and mirrored locally for
crash recovery) and written once at commit, exactly like an audio take.

## Decisions

Numbered for citation. "Was" names the August decision a line replaces.

### Authoring

- **D1 — Third response choice.** The per-question control becomes Typed /
  Spoken / Whiteboard, one choice per question (`ResponseFormatSection.tsx`).
  The mode is stored explicitly on `RecordingConfig`; a block with no mode keeps
  meaning audio, so every saved quiz is unchanged. No "student's choice" (C5).
- **D2 — "Students explain out loud", on by default.** Off makes the question
  draw-only: no mic permission prompt, no voice wording in the notice, still a
  timed replay.
- **D3 — 180 s default, 300 s maximum** — the same ceiling as audio, one limit
  table. _Was 180 / 600 (RR-B2 sd-8)._
- **D4 — Think time reuses audio's controls unchanged**: prep seconds and all
  four expiry choices. During prep the student sees the starting page and the
  stimulus but cannot draw.
- **D5 — "Students review before submitting", on by default, on the shared
  recording settings** — so spoken answers get it too; saved quizzes keep
  review on. On: final picture + replay + audio, then Commit or Discard. Off: the
  take commits the moment it ends (a one-shot performance).
- **D6 — Starting page = one pattern plus an optional uploaded image.**
  _Was "blank start" (RR-B2 sd-2)._
  - Patterns, all drawn in code so they stay sharp at 3200×2400: blank, grid,
    lines, dots (already in `backgroundTemplates.ts`); **coordinate plane**
    (teacher sets axis ranges); **number line** (teacher sets range and step);
    **one shape** — triangle, rectangle, circle or regular polygon — drawn large
    and centred. No positioning UI for any of them.
  - The image comes from file pick or clipboard paste and reuses the shipped
    quiz-stimulus upload, storage and student-access gate — no new storage
    rules. It is fitted whole and centred inside 1600×1200, never cropped.
- **D7 — The starting page is a locked background.** Students draw over it and
  cannot move, erase or delete it. Every take and retake starts from it; it is
  present at t=0 of the replay; it is baked into the final picture. The drawing
  log references it by id rather than copying it.
- **D8 — Student tools unchanged from RR-B2 sd-7**: pen, eraser (pixel, stroke,
  lasso), colours, typed text, shapes, undo/redo. Students cannot insert images;
  one page.

### Student experience

- **D9 — Full-width canvas.** During a whiteboard question the canvas takes the
  whole answer area and the stimulus opens as a drawer (C9).
- **D10 — Portrait is gated, absolutely** (RR-B4 sd-3/4 stand): "rotate your
  device"; an empty slot records `device-gated` (D17).
- **D11 — One notice per assignment.** Narrated: the existing voice notice plus
  "Your teacher can replay how you drew, including anything you erase."
  Draw-only: that line alone.
- **D12 — Erased work replays** (RR-B2 sd-3 stands). A silent take is complete
  (sd-4 stands). Mic denied → the canvas arms alone (sd-6 stands).
- **D13 — Takes inherit audio's semantics**: `takeIndex`, `takeLimit` (default
  unlimited), discards never written, no pause, retake restarts from the
  starting page.

### Capture and safety

- **D14 — The whiteboard keeps its own drawing log**, separate from the undo
  stack (capped at 100 since #4142, C1). Every point carries a millisecond
  offset so replay draws strokes as they were drawn. Points under ~1 px apart
  are dropped at capture; if the log nears 4 MB the take ends exactly as at the
  time limit.
- **D15 — Speech bitrate 32 kbps** (300 s ≈ 1.2 MB), applied to spoken answers
  too; the recorder sets none today, so Chrome's ~128 kbps default puts a 300 s
  spoken take at the 5 MB cap.
- **D16 — Cutoffs commit first.** If tab-away auto-submit or the quiz time
  limit fires mid-take, the take stops and commits as captured, then the rule
  runs. Clocks never pause. Applies to spoken answers too.
- **D17 — Crash recovery.** Audio chunks and the drawing log stream to IndexedDB
  as the take runs. On reopening the question the captured part goes to the
  review screen (Commit or Discard), or — with review off (D5) — commits
  automatically. The local copy is wiped on commit, discard, quiz submit, or
  24 hours after capture. Spoken answers get it too. _Was "a lost take is lost"._
- **D18 — Why a take is silent or a slot empty.** The take records its mic
  state (`on` / `denied` / `unavailable`); `UnrespondedReason` gains
  `device-gated` for the portrait gate. Audio's `capture-unavailable` keeps
  working; spoken takes record mic state too (C6).

### Storage and access

- **D19 — Three artifacts per take, flat in Drive.** The take's answer entry
  holds three artifacts — audio (absent when draw-only), final picture, drawing
  log — each archived as its own file in `Quiz Responses/{quiz}/`, named
  `Last_First__Q{n}_take{k}.m4a/.png/.json`. Adding the take number also fixes
  spoken takes colliding by name. _Was a per-response folder (RR-B2 sd-5)._
- **D20 — The final picture is rendered in the browser at commit**, 3200×2400
  via `exportCanvas.ts` with the 2× scale, background baked in.
- **D21 — The admin console treats a take as one row** and deletes all of its
  files together, from Storage and Drive.
- **D22 — Flag: `quiz-whiteboard-response`**, admin access, `stage: 'preview'`,
  fail-closed, `requires: 'quiz-media-response'`. The server checks it for the
  whiteboard kind. It opens after audio. Admin path: Admin Settings > Access >
  Previews.

### Grading and results

- **D23 — One take, one score**: the three files are one gradable slot, with one
  set of time-stamped comments on the replay timeline and one pinned take.
- **D24 — The grader opens on the full-size final picture**; Play runs the timed
  replay with audio on the shipped `WaveformScrubber` and its ms comment
  markers. No thumbnail grid in v1.
- **D25 — Both graders from day one**: `FreeResponseGrader` and the Classroom
  add-on's `TeacherReviewRoute`, sharing one replay component.
- **D26 — Students see their own picture, replay and comments** after results
  are published, under the same gates as spoken answers.
- **D27 — RR-B3 is dropped.** No grading-time prototype; the 300 s ceiling (D3)
  is the mitigation.

### Scope and order

- **D28 — Spoken-answer fixes ship first**, each its own PR against audio before
  any whiteboard code: D15 bitrate, D16 commit on cutoff, D17 crash recovery,
  D19's take-numbered filenames, D18 mic state, D5 review setting.
- **D29 — The teacher Drawing widget's page-space migration is decoupled.**
  _Was "lands at the track's start" (RR-B4 sd-6)._ It is a separate fix with its
  own PR and before/after screenshots, on its own schedule; the student canvas
  is a new component with the fixed page from day one (C2), so it does not need
  it. The annotation overlay is not touched; it already pins its own resolution.

**Unchanged from August:** fixed 1600×1200 logical page (RR-B4 sd-1/2); fixed
2× bitmap, no `devicePixelRatio` branching (sd-5). **Moot:** RR-B2's
transcription rider (AI transcription is not planned, Paul 2026-09-01) and its
"ships ungated" note (D22).

## Audit findings (2026-10-13) — why the August plan changed

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
  per-response folder. RR-B2 sd-5's three-file folder needs either three artifacts per
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
  separates silent-by-choice, mic-denied (RR-B2 sd-6) and portrait-gated (RR-B4 sd-4).
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
- **C10 — The page-space migration (RR-B4 sd-6) now has a wider blast radius.**
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
  the only empirical check on RR-B2 sd-8's ceiling and on RR-06's question-major queue
  (TODO.md:239).

## Build order

1. **Spoken-answer fixes (D28)**, one PR each, behind `quiz-media-response`.
2. **Data model**: `RecordingConfig` mode + mic toggle + review setting +
   starting page; mic state on the take; `device-gated`; whiteboard ceiling in
   `RECORDING_MODE_CEILING_SECONDS`; the `quiz-whiteboard-response` flag.
3. **Authoring**: the third choice in `ResponseFormatSection.tsx`, the starting
   page picker (patterns, coordinate plane, number line, shape, image upload).
4. **Student capture**: a capture hook beside `hooks/useAudioRecording.ts` that
   owns canvas, mic and one clock; `WhiteboardResponseCapture` beside
   `AudioResponseCapture.tsx`, composed from DrawingWidget's pure parts; the
   full-width layout and stimulus drawer; the portrait gate; the artifact build
   at `QuizStudentApp.tsx:952-1000` (hardcodes `kind: 'audio'`) and the
   `artifacts[0]` read at :3135.
5. **Transit + archive**: `storage.rules` content types (PNG, JSON);
   `utils/quizMediaUpload.ts` (three blobs per take); the whiteboard branch in
   `quizMediaArchive.ts` (no transcode for PNG/JSON); sweep; delete console (D21).
6. **Grading + results**: `slotNeedsManualGrading`, the shared replay view
   driven by `currentMs` over `applyCommand`, both graders, the playback
   callable, the student results card. Target wherever GRADEBOOK D37 puts
   grades if it has landed (C13).

Separately, on its own schedule: the teacher widget migration (D29).

## Out of scope

Student image insertion, multi-page responses, continuing from an earlier take,
a thumbnail grid in the grader, AI transcription or grading, video capture (its
own deferred track), and server-side MP4 rendering (rejected on cost in RR-B2).
