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

## Verification status

Claims in these files are **not** uniformly verified — each file states its own
provenance and what was independently confirmed. Treat unverified `file:line`
references as leads to check during the session, not as established fact.
