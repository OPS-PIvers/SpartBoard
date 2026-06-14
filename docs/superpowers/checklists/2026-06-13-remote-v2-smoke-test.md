# Remote Control v2 — Two-Device Smoke Test (acceptance gate, pre-Tuesday)

Setup: projected board open on desktop (logged in), phone open to
`/remote?boardId=<id>` (same account). Test on the dev preview first, then
re-run once on `main` after deploy.

## Latency (priority 1)

- [ ] Timer start/pause/reset reflects on the board in ~300–500ms (reads as instant).
- [ ] Traffic light colour change reflects near-instantly.
- [ ] Poll reveal reflects near-instantly.
- [ ] Structural change (add/remove a widget on desktop) still debounces normally (no thrash).

## Reliability + feedback (priority 2)

- [ ] Connection chip shows "Connected" on a good network.
- [ ] Toggle phone airplane mode → chip shows "Reconnecting…"; restore → "Connected".
- [ ] No command is silently dropped across a brief disconnect/reconnect.
- [ ] "Updated just now" / last-synced indicator appears after a sync.
- [ ] Each control button shows a brief press-confirm (scale/ring) on tap.
- [ ] Live sync: change a widget on the desktop → the phone reflects it WITHOUT tapping Sync.
- [ ] Pending-guard: rapidly drive a widget from the phone → the desktop echo does not revert the phone within 5s.

## Demo widgets (priority 3)

- [ ] Timer / stopwatch: start, pause, reset all drive the board.
- [ ] Traffic light: red/yellow/green/off all drive the board.
- [ ] Poll: reveal/hide drives the board.
- [ ] Noise meter (sound): control drives the board.
- [ ] Schedule: control drives the board.
- [ ] Clock: control drives the board.

## Activity Wall (new)

- [ ] **Start the wall on the DESKTOP first** (see caveat below), confirm it is running.
- [ ] Pending count badge on the phone matches the number of unapproved submissions.
- [ ] Approve from the phone moves a submission onto the board (live).
- [ ] Remove from the phone deletes the submission from the board (live).
- [ ] Join QR button shows only when `anonymous-join` is permitted; hidden cleanly otherwise.
- [ ] Approve/remove fails gracefully with a visible error banner if the Firestore write is rejected (e.g. offline).
- [ ] (If your widget's activities are NOT migrated to the library) Start/Pause from
      the phone toggles the wall — otherwise expect Start/Pause to no-op (caveat below).

> **Caveat — Activity Wall Start/Pause from the remote.** The remote reads
> activities from `widget.config.activities`. Some Activity Wall widgets store
> their activities in the Firestore-backed library (post-migration) with an
> empty `config.activities`; for those, the remote Start button has nothing to
> start. **Moderation of an already-running wall works regardless** (it keys off
> `config.activeActivityId` + the live submissions subcollection). For Tuesday:
> start the wall on the projected desktop, then moderate from the phone — the
> core engagement loop. Wiring the remote to the activity library is deferred
> follow-up work.

## Embed (new)

- [ ] "Feature on Board" maximizes the embed full-screen; "Exit Full Screen" restores.
- [ ] Spotlight (header) overlays the embed without maximizing.
- [ ] Slide next/prev is intentionally ABSENT — confirmed infeasible by the Task 1
      spike (`docs/superpowers/spikes/2026-06-13-embed-slide-control.md`); advance
      slides with the deck's own remote/arrow keys, feature/spotlight from the phone.

## Sign-off

- [ ] All priority-1 and priority-2 items pass.
- [ ] All demo widgets pass.
- [ ] Ready to PR `dev-paul` → `main` and deploy before Tuesday.
