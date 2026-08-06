# Rich-response wayfinder — assets

Working artifacts produced while resolving tickets on
[`docs/rich-response-wayfinder.md`](../rich-response-wayfinder.md). The wayfinder
skill links assets from their ticket rather than pasting them into it; this
folder is where they live so those links survive.

**None of these resolve a ticket.** Every open ticket on that map is HITL — it
resolves only through a live session with Paul. These are inputs to those
sessions.

| Asset                                                                  | Ticket    | What it is                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [rr-08-answered-state-grounding.md](rr-08-answered-state-grounding.md) | **RR-08** | Read-only audit of how "answered" is computed in shipped code, and what breaks when `answer: ''` becomes legitimate                                                                                                           |
| [rr-a1-timing-prototype.html](rr-a1-timing-prototype.html)             | **RR-A1** | Clickable prototype of the prep → armed → recording → limit flow, with **four** prep-expiry branches switchable. **Rev 2** adds the audio/video mode switch, the framing check, auto-start, and a live cost table — see below |
| [rr-a5-capture-harness.html](rr-a5-capture-harness.html)               | **RR-A5** | Capture/codec harness that produces the real recordings the Drive round-trip test needs                                                                                                                                       |
| [rr-a2-retake-grounding.md](rr-a2-retake-grounding.md)                 | **RR-A2** | Read-only audit of every overwrite path for a prior answer, what preserves attempt history (almost nothing), whether a teacher can see attempt counts (no), and whether `functions/` can delete a Drive file (no)             |

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

## Verification status

Claims in these files are **not** uniformly verified — each file states its own
provenance and what was independently confirmed. Treat unverified `file:line`
references as leads to check during the session, not as established fact.
