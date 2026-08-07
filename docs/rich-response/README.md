# Rich-response wayfinder — assets

Working artifacts produced while resolving tickets on
[`docs/rich-response-wayfinder.md`](../rich-response-wayfinder.md). The wayfinder
skill links assets from their ticket rather than pasting them into it; this
folder is where they live so those links survive.

**None of these resolve a ticket.** Every open ticket on that map is HITL — it
resolves only through a live session with Paul. These are inputs to those
sessions.

| Asset                                                                  | Ticket    | What it is                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [rr-08-answered-state-grounding.md](rr-08-answered-state-grounding.md) | **RR-08** | Read-only audit of how "answered" is computed in shipped code, and what breaks when `answer: ''` becomes legitimate. **RR-08 closed 2026-08-06** — the audit held up; see below                                                                                                           |
| [rr-a1-timing-prototype.html](rr-a1-timing-prototype.html)             | **RR-A1** | Clickable prototype of the prep → armed → recording → limit flow, with **four** prep-expiry branches switchable. **Rev 2** adds the audio/video mode switch, the framing check, auto-start, and a live cost table — see below                                                             |
| [rr-a5-capture-harness.html](rr-a5-capture-harness.html)               | **RR-A5** | Capture/codec harness that produces the real recordings the Drive round-trip test needs                                                                                                                                                                                                   |
| [rr-a2-retake-grounding.md](rr-a2-retake-grounding.md)                 | **RR-A2** | Read-only audit of every overwrite path for a prior answer, what preserves attempt history (almost nothing), whether a teacher can see attempt counts (no), and whether `functions/` can delete a Drive file (no). **RR-A2 closed 2026-08-06** — held up, with two corrections; see below |

## Running the two HTML files

Both are single self-contained files with no build step and no external
requests. Open them directly in a browser — but **not** through an in-app preview
pane, which renders out-of-project files as static snapshots and blocks
microphone access.

`rr-a5-capture-harness.html` **must be opened on the hardware you are asking
about.** It prints the `MediaRecorder.isTypeSupported()` matrix for whatever
browser opens it, so running it on a Windows staff device answers a question
RR-A5 did not ask. **Run it on a student Chromebook** — that is what closes the
ticket's item 2. It needs a secure context, so use `file://` (a secure origin in
Chrome) or serve it over localhost; it uploads nothing anywhere.

## RR-A1 prototype — rev 2 (2026-08-06, post-RR-A3)

Rev 1 was built earlier the same day **before** RR-A3 closed, so it had no mode
switch, no framing check and no notion of video. Rev 2 lands all three of RR-A3's
consequences and is the build the RR-A1 session should react to. The rev-1 spine
— prep → armed → recording → limit, the three prep-expiry branches, the
reversibility distinction — is unchanged.

What rev 2 adds:

- **A fourth prep-expiry branch — D, auto-start.** Restored during the session after the statutory bar against it was found not to hold (see RR-A1's resolution). Capture begins on the timer; refusal moves from the entry to a **"stop — don't keep this"** discard that deletes the take unsent. The record button becomes the ticket's original _"I'm ready, start now"_ escape. Two properties emerged from building it: on the video path there is no click to hang a framing check on, so the self-view moves into prep; and after a discard the flow drops to armed rather than re-arming the timer, because re-auto-starting on someone who just refused would be hostile.
- **An audio / video mode switch.** Peer modes, per RR-A3 sub-decision 2. Switching restarts the assignment, because the flow itself differs.
- **A framing check on the video path**, after the notice and before capture — a fake viewfinder, the one line, and a confirm. It exposes a fork RR-A3 did not settle: **once per assignment** vs **before every take**. The second variant interposes the check between the record click and capture, which is a timing decision and therefore this ticket's.
- **A "second person in frame" toggle**, which draws a bystander and then says nothing about them. It demonstrates the mitigation's exact limit — RR-04 sub-decision 2 forbids the detection that would notice.
- **A district-gate toggle.** With video gated off, set subtraction empties the set before the student sees anything, so the Tennessen interstitial never renders and the whole assignment opens as written. That is RR-A3 sub-decision 3 rendered honestly.
- **A live cost table** driven by resolution and bitrate sliders. It reproduces RR-A4's published figures exactly at its 720p / 2500 kbps / 60 s corner — **19 MB a take, 2.85 GB an assignment, 76 s to upload, 240 KB for the same answer as audio** — so the numbers this ticket has to pick can be dragged rather than argued.

**Rev 1's "no timer can reach the recorder" property is deliberately broken in
branch D and nowhere else.** In A, B and C `startRecording()` is still reachable
only from a click, and on the per-take framing path the record button opens the
check while the **confirm** click starts capture. Branch D adds the single timer
call site, takes a `fromTimer` flag so the event log says which path fired, and
pairs it with the discard. If you are reading the build to check the statutory
claim, that flag is where to look.

## RR-08 closed 2026-08-06 — how the grounding brief held up

Kept for the record, because a grounding asset is only worth producing again if it
turns out to have been worth reading.

- **The headline finding was right and was the session's most consequential item.** Landmine #1 — `submitAnswer` rebuilding the answer object with no `...priorEntry` spread — was re-verified against source at the top of the session and got its own resolution (sub-decision 9): a standalone implementation ticket landing **before** RR-02's build.
- **One correction.** The brief implies a one-line fix. It isn't: a naive spread resurrects the prior entry's `speedBonus`, which is currently included _conditionally_. The fix must spread and then explicitly re-own every field the write owns.
- **The brief's §0 verdict — "shipped code asks whether an entry exists, not whether `answer` is non-empty" — is what made sub-decision 1 possible.** Knowing that roughly ten consumers are presence-based is exactly what turned "fix the `'auto'` stall" into "make absence mean one thing," which fixes all ten at once.
- **One cost assumption in the session was wrong and the code corrected it.** The instinct was to leave the idle sweep dumb because loading quiz definitions per response is expensive. But `publicQuestions` lives on the session doc and the sweep **already batch-reads it**. That reversed sub-decision 5. The brief didn't say this; it's the kind of thing only reading the function shows.
- **§7's two carry-ins both landed.** The written-response three-state Submit gate is the shape sub-decision 7 generalized, and "there is no shipped concept of partially answered" is recorded in the resolution as an explicit warning that the ticket introduces a state rather than refining one.

## RR-A2 closed 2026-08-06 — how the grounding brief held up

Second brief in two days to be written, read cold, and then measured against the
session it fed. The pattern is holding: a structural audit is worth more than a
bullet-by-bullet one, and it fails in a predictable place.

- **Its §0 summary set the ticket's whole frame, correctly.** "No concept of an attempt to a **question** — only to an assignment" meant every option on the table was a **new capability**, not an extension, and the session never wasted a question on whether something could be reused.
- **§5 decided a sub-decision nearly verbatim.** "Counting discards requires inventing a write whose only purpose is to record that a child refused to be recorded" is the reasoning that made discards free, and it arrived with the in-repo precedent (§5.1) already attached.
- **Its biggest contribution was a landmine it only half-described.** §1.6 flagged four first-occurrence-wins consumers. Re-reading one of them in session showed the comment cites **shipped bugs #1728 and #1777** — which turned "flip them to latest-wins" from an obvious fix into an obvious regression, and forced the explicit `takeIndex` ordinal with a same-index tie-break that preserves the old guard exactly. **The table row was right; the reason it mattered was one line below the cited range.**
- **🔴 One claim was wrong in the direction that matters — it argued for the option it made look cheap.** §2.3 says of rules-level enforcement that "the codebase already knows how to do this and simply hasn't at the question level." Quiz cannot: `hasAll` demands byte-identical priors and quiz students promote their own drafts in place, and rules cannot count per `questionId` under any model anyway. The session repeated the claim in a recommendation, caught it, corrected it and re-asked the question. **A grounding brief's errors are load-bearing precisely because they are read before anyone is skeptical.**
- **One recommendation was declined on the brief's own evidence.** §3.3 offered the results sheet's `Warnings` column as the cheap home for take counts, then noted teachers read that column as an integrity signal. That second half won.
- **One gap, honestly scoped.** It audits data paths and does not touch pause/resume, where the ticket's charted premise turned out to be simply false (`MediaRecorder.pause()` is native and continuous, so the "stitching cost" never existed). The brief said what it covered; the lesson is that a bullet the brief doesn't reach may be a bullet that dissolves.

## RR-05 closed 2026-08-06 — the control case, run without a brief

Recorded because the two sections above measure what a grounding brief is worth,
and this session is the comparison they were missing: **RR-05 had no asset.** The
audit happened live, inside the session, before the first question.

- **It found four wrong premises, three of which changed an answer** — that no shipped AI call has ever consumed student-created content; that "the established mechanism" is four rival mechanisms; that the precedent is fail-open in the client and fail-closed in the callable; and that `global_permissions` is written by SpartBoard admins rather than districts, which corrected a **closed** ticket (RR-A3). A brief written the night before would plausibly have found the same four. Working live found them **in the order the questions needed them**, which a brief cannot do.
- **The cost was concentrated and visible.** Roughly the first third of the session was reading rather than deciding, and the ticket's charted framing had to be dismantled before question one. On a ticket with more open decisions than RR-05's five, that overhead would have arrived at a worse moment.
- **The honest conclusion is narrower than "briefs are unnecessary."** RR-05's questions were answerable from **five files**, all reachable by name from the ticket text itself (`aiGeneration.ts`, `featureDefaults.ts`, `firestore.rules`, `GlobalPermissionsManager.tsx`, `types.ts`). RR-08 and RR-A2 both needed a structural sweep across ten-plus consumers — which is exactly what a brief is good at and what a live session does badly under time pressure. **Write the brief when the question is "where does this pattern appear"; skip it when the question is "what does this specific mechanism actually do."**

## RR-06 closed 2026-08-07 — the rule from RR-05 predicted a brief was needed, and it was run without one

The three sections above are a running argument about when a grounding brief pays
for itself. RR-05 ended it with a rule: **write the brief when the question is
"where does this pattern appear"; skip it when it is "what does this mechanism
do."** RR-06 is the first ticket to test that rule, and it is worth recording that
**the rule said "write one" and nobody did.**

- **RR-06 was squarely a sweep ticket.** Its questions ranged over the grader, the scoreboard, the publish path, the Sheets export, the PLC aggregation reader, two LMS push paths and the question-stats tab — the ten-plus-consumer shape the rule names. It was run live anyway, in one session, and the audit consumed roughly the first third of it.
- **It worked, in the sense that four premises fell.** There is no shipped rubric surface (M12 Phase 3 is unbuilt, which removed a charted question rather than answering it); `gradeAnswer` cannot express "ungraded" either, so the flat-zero defect already ships for essays; the phantom-zero argument was **already written in the repo** at `canScoreResponse`, applied to a different cause; and RR-08's always-write rule silently converts the export's "unanswered" cell into `'0'` for every question in every quiz.
- 🔴 **But note how the fourth one was found.** It surfaced while reading `assignmentExportShared.ts` for a different reason — the cell-semantics docblock happened to be six lines from what I was actually checking. **That is luck, not method**, and it is precisely the failure mode the rule predicts: a live sweep finds the consumers it happens to open. RR-08's and RR-A2's briefs enumerated consumers exhaustively; this session did not, and **nothing establishes that a fifth consumer isn't sitting one file over.**
- **So the check the rule implies was run before the session closed, and it found two more immediately.** Grepping deliberately for readers of the convention — rather than reading files for other reasons — turned up `plcContributions.ts:99-114`, the **Firestore-native** replacement for the PLC sheet reader (its contract is documented at `types.ts:387-391`: _"Absent keys = not answered. Value `0` = answered incorrectly"_), and `quizDriveService.ts:718-741`, whose `answeredSet` becomes every question for every student. **Four sites, not two.** Both new ones were found in under ten minutes by a query, and neither would have been opened for any other reason.
- **The conclusion is the rule's, stated more sharply than RR-05 could state it.** A live audit finds consumers **it has a reason to open**; a query finds consumers **that share a property**. RR-06's first two sites came the first way and its last two came the second, in the same session, on the same question — which is about as clean a demonstration as this argument is going to get. **The rule stands: on a sweep ticket, run the enumerating query first.** It does not have to be a written brief; it has to be a query rather than a reading list.
- 📌 **What the compiler covers and what it doesn't.** RR-06 leans on `GradeResult` gaining a required field to force its ~8 consumers to be visited — a real mitigation, and the reason sub-decision 1 was chosen over the alternatives. **The absent-means-unanswered convention has no type behind it**, which is exactly why it needed the query and exactly why it was the thing at risk.

## RR-B2 closed 2026-08-07 — the rule's other half, and a research ticket that read the types instead of the call sites

RR-06 tested the "sweep ticket ⇒ enumerate by query" half of RR-05's rule. RR-B2
is the **control for the other half**: its questions were all _"what does this
specific mechanism actually do"_, they were answerable from one directory, and
the rule says skip the brief. That worked — five findings, all from
`components/widgets/DrawingWidget/`, in well under the third of a session RR-05
and RR-06 each spent. **The interesting part is not that it worked; it is what it
found sitting on top of a closed research ticket.**

- 🔴 **RR-B1 was a full AFK research ticket over the same directory, and it missed two things because it read the type and not the call sites.** It concluded that ordered-untimed replay is "nearly free from persisted data today" via `z` ordering. Both halves needed a call-site check neither got. (a) `z` is creation order **only because the `reorder` command kind is declared and never constructed** — a fact visible only by grepping for what pushes it. (b) More seriously, `update` commands **are** constructed, all over the widget, so replaying persisted objects by `z` shows **final geometry in creation order**. RR-B1 correctly reported that the middle option loses timing and erasures; it did not report that the thing left over is not a process record at all. **That is the finding that collapsed a three-way fork to two.**
- 📌 **The lesson generalizes past this ticket.** A type union tells you what is **expressible**; only the call sites tell you what is **expressed**. RR-B1 answered "can the command stack replay?" from `commands.ts`'s types and its docblock — both of which are accurate — and the docblock even says forward replay is a design intent. Nothing in the file is wrong. **The wrong inference came from not asking what constructs each variant**, and it is the same class of mistake as reading `kind: 'text'` and assuming something writes it.
- ✅ **The audit moved a cost estimate in the _cheap_ direction, which has not happened before on this map.** Every prior audit made a ticket bigger. This one found that the "new timestamped event log persisted alongside object writes" RR-B1 priced as a subsystem is `{ t, cmd }` appended to an array `useCommandStack` already builds, replayed by a function that is already pure, already bidirectional, and already documented as the route any future replay must take. It then found that the student whiteboard needs **no new Firestore collection and no new rules at all** — dissolving RR-B1's ⛔ hard blocker, which was the single largest item of scope on the B track.
- ⚠️ **And it landed too late to inform my own recommendation, which is worth recording honestly.** I recommended the cheap branch in question 1 partly on cost. Paul took the expensive one; the toolset answer three questions later then exposed that the cost I had priced was largely imaginary, on evidence my own audit had already collected but not yet assembled. **The audit was complete before the questions started and the inference was not** — which is a different failure from RR-06's (there, the audit itself was incomplete), and it argues that the audit's _conclusions_ deserve the same explicit write-up the findings get, before question one rather than after.

## Verification status

Claims in these files are **not** uniformly verified — each file states its own
provenance and what was independently confirmed. Treat unverified `file:line`
references as leads to check during the session, not as established fact.
