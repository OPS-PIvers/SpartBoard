# Rich-response implementation order

Execution plan for the locked spec in
[`docs/rich-response-wayfinder.md`](../rich-response-wayfinder.md). Decided with
Paul 2026-08-27. The map is the source of truth for every design decision; this
doc only orders the build. One GitHub issue exists per slice, under the
**Rich Response** milestone.

**Standing decisions from the ordering session:**

- Start now, everything — accepted risk: RR-A5 item 4 or RR-09 q7/q10 coming
  back badly reworks later phases.
- C track (stimuli) is already shipped. Order is: fixes → foundations →
  **audio** capture → compliance console → **pause** for other quiz features.
- Video, AI transcription, and the B track (whiteboard) are deferred —
  scheduled, not ordered.

## Phase 0 — human errands (fire now, block nothing)

Not engineering. Listed so the pause points are honest.

- **RR-A5 item 4** — ask the district Chrome admin to allowlist the origin in
  `AudioCaptureAllowedUrls` for the student OU. Carries RR-07's entire
  resolution; a "no" reopens RR-07 sub-decision 1 before Phase 3 ships.
- **RR-09 questions 7 and 10** — one email to counsel/Google. q7 can stop a
  capability; q10 (undo replay in whiteboard takes) only gates the deferred B
  track.
- **RR-A5 device checklist** — the harness at
  [`rr-a5-capture-harness.html`](rr-a5-capture-harness.html) on a student
  Chromebook (codec matrix, 600 s audio, clean `getUserMedia` policy failure,
  3200×2400 canvas, pdf.js paging, stacked stimuli on 768px, picker at volume).

## Phase 1 — hygiene fixes

Cheap now precisely because the traps are provably harmless today. Land before
any schema change; each is its own PR.

1. **`submitAnswer` spread fix** (RR-08 sd-9). Not one line: a naive
   `...priorEntry` spread resurrects a conditionally-included `speedBonus` —
   spread, then explicitly re-own every field the write owns. Protects the
   future `takeIndex` field too.
2. **Four-consumer `takeIndex` ordering** (RR-A2 sd-5). `quizScoreboard.ts`,
   `questionAccuracyStats.ts`, `useQuizAssignments.ts`,
   `useVideoActivityAssignments.ts`: first-occurrence-wins →
   **highest-`takeIndex`-wins, ties by earliest `answeredAt`** — preserving the
   #1728/#1777 race guards exactly. Must land with or before the append change,
   never after.
3. **Absent-means-unanswered, four sites** (RR-06 finding 4).
   `assignmentExportShared.ts:170-178`, `quizDriveService.readPlcSheet`,
   `plcContributions.ts:99-114`, `quizDriveService.ts:718-741`. Must land with
   or before RR-08's always-write change, never after — without it, RR-08
   converts every "unanswered" export cell into `'0'`.

**Fix 4 (drawing page-space migration, RR-B4 sd-6) is deliberately deferred to
the B track** — it is the only change that visibly moves a teacher's saved
work, and nothing before whiteboard needs it.

## Phase 2 — foundations (data model before any UI)

1. **`artifacts[]` + `artifactArchive`** (RR-02, amended by RR-03): sibling
   `ResponseArtifact[]` on `QuizResponseAnswer` (stable `id`, `slot`, `kind`,
   `uploadState` written before bytes land); server-written archival state in a
   sibling `artifactArchive` map. `answer: string` untouched.
   ⚠ `VideoActivityQuestion` inherits `QuizQuestion` fields at compile time —
   decide `Omit` vs inherit in the same PR that adds any field.
2. **Completeness model** (RR-08): every passed-over question writes an entry;
   new `unresponded` field beside `status`; one completeness predicate driving
   both progress count and Submit gate (binary student / three-state teacher);
   idle sweep marks empty required slots off the session doc it already reads.
3. **`GradeResult.state`** (RR-06 sd-1/2): `'scored' | 'awaiting-grade' |
'not-attempted'` as a required field so the compiler walks all ~8 consumers.
   `awaiting-grade` omits from gradebook push; `not-attempted` pushes a real 0
   with teacher-decided excusal. **Also fixes the live defect: an ungraded
   essay pushes a real 0 into Google Classroom today.**

## Phase 3 — audio capture (A track, audio only; ships admin-gated)

Video is a peer mode in the data model (RR-01/RR-A3) but its capture UI,
framing check, and transcode runtime are deferred — design nothing that assumes
audio-only, build nothing video-specific.

1. **Recording block + student capture flow** (RR-A1): prep → armed →
   recording → hard stop with wrap-up warning; per-question expiry branch
   (`auto-start`/`auto-advance`/`armed`/`unanswered`); `recording` config block
   separate from `timeLimit` (speed bonus unavailable by design); bytes local
   until commit; record → review → commit-or-discard (RR-A2), discards never
   written; Tennessen notice once per assignment (RR-04).
2. **Takes** (RR-A2): append as siblings with explicit `takeIndex`;
   `takeLimit: number | null` defaulting unlimited, enforced in the archival
   callable (rules cannot); take budget visible pre-commit.
3. **Upload + archival callable** (RR-03): per-upload immediate archival to the
   teacher's Drive via stored refresh token; audio transcode (webm/Opus does
   not survive to Drive — RR-A4); Firebase copy deleted on archive; ~7-day
   sweep for stragglers with failure email; retention to end of school year
   (RR-04). Callable sizing is fine for audio; the video runtime question is
   deferred with video.
4. **Grading surfaces** (RR-06): question-major queue; per-slot grades keyed
   question+slot; pinned-take grading with `gradedTakeIndex`; time-anchored
   comments (ms); provisional scores always marked; three-way adjudication for
   `capture-unavailable` slots (RR-07: excuse / blank / offline substitute with
   mandatory note).
5. **Authoring** (RR-10): recording controls in the existing
   `EditorWorkspace` Settings surface; one `recording` block clamped to the
   lowest ceiling in the mode set; live non-blocking advisory (degradation,
   completability) alongside RR-A3's launch-time warning; neutral storage
   figure ("records up to N slots per student"). Every authored control gets a
   read-site test (RR-10's standing rule).
6. **Student results view** (RR-03/RR-06): playback on published-results only,
   uid- and publish-gated; provisional-score marking student-side.

## Phase 4 — compliance gate

**Org-admin review-and-delete console** (RR-04 — a compliance precondition).
Lists responses and takes, deletes media + transcript as a set, reuses the
stored refresh token. **Audio capture opens to beta/public only after this
lands**; admin-gated testing may precede it.

## ⏸ Pause — other quiz features

Named here so the pause point is explicit; each gets its own planning session
when its turn comes (not planned in this doc):

- **Individually assign** (per-student assignment)
- **Rubrics** — M12 Phase 3 is unbuilt with three open decisions
  (`TODO.md:34,46`) and touches RR-06's grading model; wants its own design
  pass.
- **Add question from another quiz**

## Deferred — scheduled, not ordered

- **Video capture**: peer-mode UI, framing check + continuous self-view,
  district gate surface (needs the district-operable gate from RR-05 sd-5's
  pattern), video-capable transcode runtime (Cloud Run vs callable — re-test at
  4–8 MB/take before migrating), 480p/500kbps ceiling.
- **AI transcription** (RR-05): one gated callable, teacher-initiated, pinned
  take only, two-gate model (SpartBoard availability + district consent on the
  org doc).
- **B track (whiteboard)**: event-log capture (RR-B2), 1600×1200 page (RR-B4),
  **fix 4 (page-space migration) lands at this track's start** — its own PR,
  its own before/after screenshots. RR-B3's grading prototype should be run
  before committing to this track's grading surface.
- **RR-A6 upload strategy**: blocked on RR-A5's measurements.

## Shipped inconsistencies to file as issues (found by the map, not this plan)

Background-upload Drive sharing-type disagreement (`useStorage.ts:47` vs
`useGoogleDrive.ts:85`); `global_pdfs` anonymously readable on both rule sets;
VA answer-key exposure; Matching/Ordering `Math.random` re-randomization on
back-navigation; VA `shuffleAnswerOptions` ignored (false silently fails);
`video-activity-audio-transcription` `missingDocPublic: true` vs fail-closed
callable.
