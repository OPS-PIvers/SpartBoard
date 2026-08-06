# Rich-response wayfinder — assets

Working artifacts produced while resolving tickets on
[`docs/rich-response-wayfinder.md`](../rich-response-wayfinder.md). The wayfinder
skill links assets from their ticket rather than pasting them into it; this
folder is where they live so those links survive.

**None of these resolve a ticket.** Every open ticket on that map is HITL — it
resolves only through a live session with Paul. These are inputs to those
sessions.

| Asset                                                                  | Ticket    | What it is                                                                                                                                              |
| ---------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [rr-08-answered-state-grounding.md](rr-08-answered-state-grounding.md) | **RR-08** | Read-only audit of how "answered" is computed in shipped code, and what breaks when `answer: ''` becomes legitimate                                     |
| [rr-a1-timing-prototype.html](rr-a1-timing-prototype.html)             | **RR-A1** | Clickable prototype of the prep → armed → recording → limit flow, with the three prep-expiry branches switchable — ⚠️ **one decision stale**, see below |
| [rr-a5-capture-harness.html](rr-a5-capture-harness.html)               | **RR-A5** | Capture/codec harness that produces the real recordings the Drive round-trip test needs                                                                 |

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

## ⚠️ The RR-A1 prototype predates RR-A3

`rr-a1-timing-prototype.html` was built on 2026-08-06 **before** RR-A3 closed
later the same day. RR-A3 shipped video as a peer mode and added a **framing
check** — a self-view plus one line, after the Tennessen notice and before the
recorder arms — as a required step on the video path only. The build has no
framing-check state, no mode switch, and no notion of video at all.

It is still worth opening: its prep → armed → recording → limit spine, the three
prep-expiry branches, and the reversibility distinction it invented are all
unaffected. But reacting to it as-is produces a decision about a flow that has
already changed. **Revise it before the RR-A1 session, or run the session knowing
the build is one decision stale.**

## Verification status

Claims in these files are **not** uniformly verified — each file states its own
provenance and what was independently confirmed. Treat unverified `file:line`
references as leads to check during the session, not as established fact.
