# Rich-response implementation order

> ✅ **Shipped to dev-paul 2026-09-02.** Every ordered item below landed as a
> squash-merged PR after internal adversarial review: 1.2 #2727 · 1.3 #2728 ·
> 2.1 #2729 · 2.2 #2730 · 3.3 #2733 (+ rules/index #2734, notice-ack rule #2737)
> · 3.1+3.2 #2736 · 4.1 #2738 · 3.5 #2740 · 3.4 #2741 · 3.6 #2742. Audio capture
> is admin-gated behind the fail-closed `quiz-media-response` global permission
> (no record exists yet; create it to enable). Follow-ups: #2735 (sweep retry
> cap for lost Storage objects), #2749 (take-limit copy pluralisation).
> Run conventions and glossary: `briefs/`.

Execution plan for the locked spec in
[`docs/rich-response-wayfinder.md`](../rich-response-wayfinder.md). Decided with
Paul 2026-08-27. The map is the source of truth for every design decision; this
doc only orders the build. One GitHub issue exists per slice, under the
**Rich Response** milestone.

**Standing decisions from the ordering session:**

- Start now, everything. _(2026-09-01: the accepted risk is gone — RR-A5 and
  RR-09 closed on Paul's notes, see Phase 0.)_
- **Hard constraint (Paul, 2026-09-01): student audio/video only ever persists
  in the staff member's Drive.** Firebase Storage is a transit buffer, not a
  store — see Phase 3.3.
- AI transcription is not planned (Paul, 2026-09-01). RR-05's boundary stands
  as a decision; the callable is not built.
- C track (stimuli) is already shipped. Order is: fixes → foundations →
  **audio** capture → compliance console → **pause** for other quiz features.
- Video and the B track (whiteboard) are deferred —
  scheduled, not ordered.

## Phase 0 — human errands ✅ closed 2026-09-01

All three closed on Paul's notes, none executed as written:

- **RR-A5** — district Chromebooks are current and the app is approved for the
  student OU. No allowlist ask, no device harness. RR-07 stands unconditionally.
- **RR-09** — answered by district posture: internal app, every persisted
  student artifact in staff Drive. No email. q7 is moot (no transcription);
  q10 travels with the deferred B track.
- **RR-A6** — closed with RR-A5; audio uploads are ~1 s a take, so the only
  remnant (back-to-back take uploads) is an in-order queue inside Phase 3.3.

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
3. ~~**`GradeResult.state`** (RR-06 sd-1/2)~~ — ✅ **shipped 2026-08-28 by the
   M12 rubrics track** (`b8e8806f`, PR #2601): `GradeState` on `GradeResult`
   in `types.ts`, ungraded essays no longer push 0. Phase 3.4 builds on the
   shape that exists; re-read it before adding `not-attempted` excusal.

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
   **Drive-only constraint (Paul, 2026-09-01):** Firebase Storage holds bytes
   only until archival succeeds. A take whose archive fails is retried and
   surfaced to the student as not yet submitted — it is never parked for a
   week. Shrink the straggler sweep to hours, not ~7 days.
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

- ~~**Individually assign**~~ — ✅ shipped as milestone M17 (`student_assignments`,
  per-student overrides in `QuizStudentApp`, `/my-assignments` windows).
- ~~**Rubrics**~~ — ✅ shipped 2026-08-28 (M12 phases 3-A..3-I, PRs #2614–#2619,
  #2628–#2630). Phase 3.4's grading queue must compose with the shipped
  `Rubric` types, not assume a blank slate.
- **Add question from another quiz** — still unplanned.

## Deferred — scheduled, not ordered

- **Video capture**: peer-mode UI, framing check + continuous self-view,
  district gate surface (needs the district-operable gate from RR-05 sd-5's
  pattern), video-capable transcode runtime (Cloud Run vs callable — re-test at
  4–8 MB/take before migrating), 480p/500kbps ceiling.
- **AI transcription** (RR-05): **not planned** (Paul, 2026-09-01). The
  design is recorded in RR-05 if it is ever needed; nothing is built.
- **B track (whiteboard)**: event-log capture (RR-B2), 1600×1200 page (RR-B4),
  **fix 4 (page-space migration) lands at this track's start** — its own PR,
  its own before/after screenshots. RR-B3's grading prototype should be run
  before committing to this track's grading surface.
- ~~**RR-A6 upload strategy**~~ — closed 2026-09-01; see Phase 0.

## Shipped inconsistencies to file as issues (found by the map, not this plan)

Background-upload Drive sharing-type disagreement (`useStorage.ts:47` vs
`useGoogleDrive.ts:85`); `global_pdfs` anonymously readable on both rule sets;
VA answer-key exposure; Matching/Ordering `Math.random` re-randomization on
back-navigation; VA `shuffleAnswerOptions` ignored (false silently fails);
`video-activity-audio-transcription` `missingDocPublic: true` vs fail-closed
callable.
