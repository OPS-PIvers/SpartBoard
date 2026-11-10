# Tours: steady playback, one editor, and a Steps view

Goal: a tour keeps pace with the person taking it and never looks broken when they get ahead; Live tours and web tours are edited in one tool whose header shows one thing to do next; and every tour can be read without running it.

Settled in a design interview with Paul on 2026-11-09. It covers **Live tours and web tours together**. It builds on [LIVE_TOURS_V3.md](LIVE_TOURS_V3.md), [LIVE_TOUR_EDITOR.md](LIVE_TOUR_EDITOR.md), [WEB_TOURS_UX.md](WEB_TOURS_UX.md), [WEB_TOURS_CLAUDE.md](WEB_TOURS_CLAUDE.md) and [WEB_TOURS_HELP_PANEL.md](WEB_TOURS_HELP_PANEL.md), and revises parts of them (see "What this overrides"). Terms are in [GLOSSARY.md](../../../GLOSSARY.md): Web tour, Target, Steps view.

**Code references** were taken at `dev-paul` `94d037a2b`. Symbol names are authoritative; line numbers are hints.

## Starting facts

- **What Paul hit.** Playback is sometimes choppy and sometimes too fast to follow. Clicking ahead of the tour makes it lose its target and show a failure, in Live tours and web tours alike. The editor headers are crowded with buttons of equal weight, don't show what is saved or what blocks Publish, and the two editors differ.
- **One step at a time.** Both players watch only the current step's target. The extension advances a click step on a trusted `pointerdown` (`extension/src/playback/frameScript.ts:164`), then looks for the next target; after `FALLBACK_MS` (4 s, `controller.ts:113`) it shows "find it" with the picture. Nothing recognises that the learner already did a later step.
- **Shared chrome, different settings.** `TourSpotlight`, `TourTip` and `TourBar` are shared. Web passes `glide={false}` and `positionKey={null}` (`extension/src/overlay/OverlayRoot.tsx`); Live glides and remembers the bar position.
- **Two editors.** Live: an outline docked over the real board with drag reorder, an undo stack, Add step after the selection, Record from here, thumbnails with Retake, conditions (`showWhen`/`doneWhen`) and a Settings tab (`components/tours/editor/TourEditorPanel.tsx`). Web: a `max-w-6xl` modal (`components/tours/web/WebTourEditor.tsx`) with arrow-button reorder, no undo, append-only recording, blur as the only picture tool, and no preview of the tip.
- **Web header today.** Record steps, Write with Claude, Rewrite all, Check tour, Play, Copy link, Publish and Delete all sit in the header.
- **A reader half exists.** Without the extension, `/tour/{setId}` lists the steps with pictures, but only for a signed-in SpartBoard user with `web-tours` (`WebTourHubPage.tsx:502`). Pictures are staff-only behind Storage rules and are read with `getBytes`, never a URL.
- **Web tours are in the Help Center today.** A Help item can link a web tour (`HelpGuidesTab.tsx:100`, `GuidedLearningPicker.tsx`), and the library card has "Move to Help Center" (`GuidedLearningManager.tsx:1039`).
- **Measurement exists.** `extension/scripts/bench/` runs playback scenarios with a frame-gap budget in CI; `/web-tour-playback-dev` and `/web-tour-fixture-dev/*` are the harness pages.

## Decisions

### Playback (Live and web)

- **P1. Settle, tick, glide.** After the learner acts, the tour waits for the page to settle, shows a brief tick on the finished step, then glides the ring to the next target and brings in the tip. One rhythm of about half a second from settle to tip; never instant, never a long hang. "Settled" means no layout change in the area around the next target for a short quiet window, with a cap so a page that never rests can't stall the tour. Web turns glide on. Reduced-motion keeps the settle wait and drops the glide and tick animation.
- **P2. Catch up quietly.** The tour watches the next few steps as well as the current one. When the learner's action matches a later step (its target was acted on, or its page was reached), the tour jumps to the step after it with no message. Lookahead is bounded (three steps) and prefers the nearest match, so a control that appears in two steps resolves to the earlier one.
- **P3. Skipped steps.** Any step passed over by catch-up, including a "look at this" step, is skipped. The step bar shows it as a hollow dot, and Back returns to it. No "Must see" switch.
- **P4. Shrink and wait.** When nothing in the lookahead matches, the tip folds into a chip on the step bar: "Step 4 is waiting". It reopens by itself when the target appears. The chip has **Show me where** (the step picture) and **Take me back**. This replaces the timed "find it" fallback and the wording that reads as an error. `wrong-page` and the armed sign-in wait keep their meaning.
- **P5. Take me back, where it can.** Live: reopen the panel or page the step needs, as `tourSelfHeal.ts` does today. Web: navigate to the step's page only when its address is known exactly (a `urlPattern` with no `*`) or a matching address was already visited in this run. Otherwise the button is not shown and Show me where is the way forward. It navigates at most once per step, so it can't loop.
- **P6. One engine.** Settle detection and lookahead matching are one shared, pure module used by the Live runner and the extension controller, so the two can't drift again. Each side supplies how it finds a target (anchor id or scored clues).
- **P7. Measured, not judged by eye.** The extension bench gains slow-page, late-render and click-ahead scenarios, and the Live runner gets matching unit scenarios. The budgets: no frame gap over the existing limit during a glide, no tip drawn twice for one step, and a click-ahead of up to three steps ends on the right step with no fallback shown.

### One editor

- **E1. One shell, two stages.** Live and web tours open in the same editor shell: the same outline, step card, header and status. The stage differs. Live: the real board, as today. Web: the step's picture with the ring and tip drawn on it as the learner will see them. **Fix on site** stays the way to re-pick a web target.
- **E2. One next-step button.** The header holds the title, a status line, Play, one main button and a ⋯ menu.
  - Status line: saved state and Draft / Published / Changed since publish, plus the one thing in the way, for example "2 steps need text" or "Check needed".
  - Main button follows the tour's state: **Write text** (steps have no text), **Check tour** (web: targets changed since the last check), **Publish**, then **Published** (disabled until something changes). Live tours skip the Check state unless playtest notes are open.
  - ⋯ menu: Rewrite all, Copy link, Duplicate, Delete, and the public-link switch (S6).
  - Record steps and Add step move to the foot of the outline, where steps are added.
- **E3. Rare tools stay out of the way.** A step card shows Title, Tip and Type. A collapsed **More** holds conditions, the recorded clues, and the note for Claude. Picture tools (Crop, Blur, Mark up, Retake, Replace) appear only when the picture on the stage is selected. Nothing used a tenth of the time is visible by default.
- **E4. Web gains what Live has.** A real undo stack, drag reorder, and adding or recording a step at any position (Record from here), all through the shell so the behaviour is identical.
- **E5. Picture tools.** Re-crop from the original capture, retake on the site, upload a replacement, and mark up with arrows, boxes and numbers. Markup is stored as shapes on the step and drawn over the picture, so it can be edited later and never bakes into the file. A replaced or re-cropped picture is a picture change for the publish check and for S6. To re-crop, the recorder keeps the uncropped capture alongside the crop for new steps; older steps can crop tighter or retake.
- **E6. Conditions on web tours.** Web steps get `showWhen` and `doneWhen` like Live. A website exposes only two things to test: whether a target is on the page, and whether the page address matches. Those are the two condition kinds. Conditions change the step's fingerprint, so they expire a Check tour.
- **E7. Tour anchors carry over.** Every control moved into the shell keeps its existing `data-tour` id; new controls are registered. Saved tours that teach the editor must still pass `check:tour-anchors`.

### Steps view

- **S1. Every tour can be read.** A Steps view is the read-only version of a Live tour or a web tour: a scrolling article, one section per step with its picture, title and tip, that prints cleanly. A **Walk through** mode shows one picture at a time with the target ringed and the same tip and step bar as the real tour. Skipped-by-condition steps are shown with a plain "Only if it appears" note. Live tours use their step thumbnails.
- **S2. Live tours in the Help Center.** Clicking a Live tour in the Help Center opens its Steps view with **Start Live Tour** at the top. Starting a tour from Getting Started is unchanged.
- **S3. Web tours leave the Help Center.** Web tours are no longer linkable from Help items; "Move to Help Center" is removed from web tour cards, and existing Help items that link a web tour are unlinked in the same PR. Web tours are reached from the extension side panel and from shared links only.
- **S4. Web tours in the side panel.** Each tour in the extension's Tours tab has **Start** and **View steps**. View steps shows the article inside the panel, beside the website, so a teacher can follow by hand. The panel stays on the article while the teacher uses the page.
- **S5. The link without the extension.** `/tour/{setId}` without the extension shows the Steps view (article and Walk through) in place of today's plain list, with "Get the extension" above it.
- **S6. Anyone with the link, per tour.** An admin can switch a published tour to "Anyone with the link" (see [ADR 0003](../../adr/0003-tour-steps-view-can-be-public-per-tour.md)).
  - Only admins can switch it on, also after teachers can author.
  - Switching it on shows every picture and all text again for a second confirm.
  - Any later picture change, including markup, crop and retake, turns the public link off until it is confirmed again. Text edits pass through the existing student-data scan and don't turn it off.
  - A public tour is read-only: the link gives the Steps view, never the extension tour, which stays staff-only.
  - The same gate applies to Live tours, whose thumbnails show the author's board.
  - Served by an HTTPS function that returns the published steps and pictures for tours marked public. No Firestore or Storage rule changes, since rules are near the compiled size cap; the pictures stay private in Storage.

### Flags

- **F1.** New Live tour playback (P1 to P5) ships behind a new preview flag, `tour-pacing` (`afterLaunch: 'retire'`). With it off, Live tours play as today.
- **F2.** Web tour playback, the web stage and the side-panel changes stay under the existing `web-tours` flag; no new flag.
- **F3.** The Steps view for Live tours and the Help Center change (S1, S2) ship behind a new preview flag, `tour-steps-view` (`afterLaunch: 'retire'`). The public switch (S6) is an admin control and follows the same flag.
- **F4.** The editor is admin-only, so the shell needs no flag.
- **F5.** The extension changes need a protocol bump. Page code reaches prod before the new extension version reaches the store, as with earlier versions.

## What this overrides

- **WEB_TOURS_UX.md**: web tours as Help Center items (S3 removes them); the modal editor layout (E1); `glide={false}` on websites (P1). The click-through dim (U2) is unchanged.
- **WEB_TOURS_CLAUDE.md**: the timed picture fallback gives way to shrink-and-wait (P4). Check tour, the publish gate and suggested fixes are unchanged, with conditions and markup added to what counts as a change (E5, E6).
- **WEB_TOURS_HELP_PANEL.md** H4: the no-extension path is the Steps view, and needs no sign-in for a public tour (S5, S6). H5 gains View steps (S4).
- **LIVE_TOUR_EDITOR.md**: the docked outline becomes the shared shell with the E2 header; its abilities are unchanged.
- **LIVE_TOURS_V3.md**: the missing-target behaviour becomes shrink-and-wait with Take me back (P4, P5). Autopilot and Show me are unchanged.

## Slices

1. **Playback engine.** The shared settle and lookahead module (P6), wired into the Live runner behind `tour-pacing` and into the extension controller; bench and unit scenarios (P7). No visible change beyond catch-up working.
2. **Playback feel.** The tick, glide on web, hollow dots on the step bar (P1, P3), the waiting chip with Show me where and Take me back (P4, P5). Extension version and protocol bump.
3. **Editor shell.** The shared shell and the E2 header and status line, with the Live editor moved into it and its anchors carried over (E1, E2, E3, E7).
4. **Web stage.** The picture stage with the ring and tip preview, undo, drag reorder, and add or record at any position (E1, E4). The web modal editor is deleted.
5. **Picture tools and conditions.** Crop, retake, replace, markup (E5); web conditions under More (E6); the recorder keeps the uncropped capture.
6. **Steps view.** The article and Walk through for both kinds (S1); Help Center opens it for Live tours (S2); web tours leave the Help Center (S3); View steps in the side panel (S4); the `/tour` page (S5).
7. **Public link.** The admin switch, second confirm, auto-off on picture change, and the serving function with tests (S6).

Slices 1 and 2 come first because an untrusted tour blocks Paul's real-Chrome test and the pilot. Slices 3 to 5 follow in order. Slice 6 can start once slice 2 has merged; slice 7 follows 6.

## Out of scope

Teachers authoring tours (every choice here stays safe for it, but nothing is opened), tours for students, Autopilot or Show me on websites, narration, branching paths beyond show-when and done-when, the connector changing targets or pictures, and a Help Center doorway to web tours.

## Known trade-off

With S3, a teacher without the extension reaches a web tour only through a link someone shares. Paul chose that over a single Help Center entry listing web tours.
