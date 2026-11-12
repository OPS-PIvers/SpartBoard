# Web tours across sites, and Message steps

Goal: one web tour can walk a teacher through more than one website, for example making a skill in gemini.google.com, downloading it, and uploading it to claude.ai. A tour can also say something without pointing at a control: an opening, a closing, or "Now we'll move over to Gemini".

Settled in a design interview with Paul on 2026-11-12. It builds on [WEB_TOURS_HELP_PANEL.md](shipped/WEB_TOURS_HELP_PANEL.md) and [TOURS_10X.md](shipped/TOURS_10X.md), and **revises** WEB_TOURS_HELP_PANEL.md H3 (a started tour can now change tabs) and the [WEB_TOURS_CLAUDE.md](shipped/WEB_TOURS_CLAUDE.md) rule that Claude only rewrites words (see "What this overrides"). Terms: **Site switch** and **Message step** in [GLOSSARY.md](../../GLOSSARY.md). Claude's new structural edits are recorded in [ADR 0004](../adr/0004-claude-can-restructure-web-tours.md).

**Code references** were taken at `dev-paul` `9c9d259f3`. Symbol names are authoritative; line numbers are hints.

## Starting facts

- **One run, one tab.** A started tour lives in one tab's record (`TabRecord`, `extension/src/playback/controller.ts`). Only an `armed` tour moves to another tab (`armedTabFor`, `adopt`); a running one never does.
- **Every step is pinned to a site.** Each step carries `web.urlPattern` (origin plus path, ids as `*`). When the current page doesn't match, `pageStatus` (`extension/src/playback/progress.ts`) sets `wrong-page` and the tip says "This step is on another page" (`tours.webOtherPage`, `OverlayRoot.tsx`).
- **Take me back only knows visited pages.** `takeBackFor` picks from `rec.visited`, the pages this run already loaded. A site the run never reached (claude.ai after Gemini) has no button, so the learner is stuck. Recording across sites already works; only playback breaks.
- **No untargeted step exists anywhere.** The extension's start parser rejects the whole tour if any step lacks `web.urlPattern/action/locator` (`onlyKeys(web, ['urlPattern', 'action', 'locator'])`, `components/tours/web/extensionProtocol.ts`). The page and server builders silently drop steps without `web` (`webTourHub.ts` `steps.filter(s => !!s.web)`, `functions/src/webTourExtension.ts` `webSteps`). Live tours need an anchor on every step too.
- **The extension can't update itself today.** No `chrome.runtime.requestUpdateCheck` anywhere. Protocol is 13 (`EXTENSION_PROTOCOL_VERSION`; 13 is `INSTALL_PROTOCOL`, which the quiz page relies on), so extensions in the field already report 13 and still reject a step without `web`. Newer features (conditions, markup, pacing) are only sent to an extension that reports them.
- **Web tour revisions keep words only.** `restoreWebTourRevision` (`functions/src/mcp/webTourTools.ts`) puts back the title and step words; a removed step can't come back. Pictures no step uses are deleted: the editor's `sweepWebTourPictures` (after a 10-minute grace) and `publishWebTour` (`components/tours/webTours.ts`) remove any file the draft and published copy no longer use.

## Decisions

### Site switch

- **X1. Automatic.** A Site switch is any point where the next step's `urlPattern` host differs from the current step's. Nothing is authored, so tours already recorded across sites start working. The extension works it out from the steps it already gets.
- **X2. The switch tip.** When the learner finishes the last step on one site, the tip reads "Next we continue on claude.ai" with a **Go to claude.ai** button. Fixed wording, no editor field; an author who wants their own words puts a Message step before it (X6). The button opens the next step's address: its `urlPattern` cut at the first `*` segment (`https://claude.ai/customize/skills` stays whole; `https://claude.ai/chat/*` opens `https://claude.ai/chat`, falling back to the origin if needed).
- **X3. New tab, and the tour follows.** Go opens the site in a new tab (`host.openTab`) and the run moves there with its pictures, the way `adopt` moves an armed run today. The tab left behind keeps its page and shows the existing `moved` notice ("The tour continued in another tab"). A later switch back to a site this run already has a tab for focuses that tab and navigates it only if its page doesn't match.
- **X4. Self-opened tabs.** If the learner opens the next step's site in a new tab themselves, the run moves to that tab, as `armedTabFor` already does for an armed run. This applies only to the **next** step's host, so stray browsing elsewhere doesn't pull the tour.
- **X5. Check tour.** In a check run (`rec.check`) the switch happens without a click, so one Check tour covers every site. The admin has to be signed in to each site.

### Message steps

- **X6. Before a Site switch.** A Message step directly before a Site switch shows **Go to gemini.google.com** instead of Next. One click finishes the message and makes the switch (X3); no separate switch tip follows.
- **X7. What it looks like.** A centered tip with title, text, Back and Next. No spotlight, no picture, no **Show me where**. It plays on whatever page the learner is on: it has no `urlPattern` and never goes to `wrong-page`. `showWhen`/`doneWhen` don't apply.
- **X8. Opening the tour.** A tour whose first step is a Message step still opens and waits on the first targeted step's site, as `armed` does today, and shows the message once that site's start page has loaded (after any sign-in). `startUrl` and `webTourSite` keep coming from the first step with a target. A tour made only of Message steps can't be published.
- **X9. Saved shape.** A Message step is a `GuidedLearningStep` in a `surface: 'web'` set with `message: true` and no `web`. The extension protocol gains a step without `web` carrying `message: true` (only at protocol 14, X13). Every builder that filters on `s.web` (`webTourHub.ts`, `webTourExtension.ts`, `handoff.ts`, `webStepReview.ts`, `webTourFixes.ts`, `writeWithClaude.ts`, and the public-link model `functions/src/tourPublicLinkModel.ts` `webSteps` with its app copy `components/tours/publicLink/publicLinkModel.ts`, kept equal by `tests/tourPublicLinkParity.test.ts`) must keep Message steps in order instead of dropping them.
- **X10. Editor.** An **Add a message** control sits between step cards and at both ends of the list in `WebTourEditor`. It inserts a text-only card that drags like any other step and has no picture, crop, markup or condition fields. The recorder doesn't change: messages are added after recording. Each new control gets a `tourAttr` anchor.
- **X11. Steps view.** Message steps appear in order as text without a picture, in the signed-in and public Steps views (`components/tours/steps/stepsModel.ts`). Each Site switch shows as a one-line "Continue on gemini.google.com" divider. The public-link picture gate (ADR 0003) is unaffected: a message has no picture, but its text counts in the confirm.
- **X12. Check results.** A Message step counts as passing: Check tour records it `found` without seeking, so it never blocks Publish or shows as Needs checking.

### Extension version

- **X13. Protocol 14.** A new `CROSS_SITE_PROTOCOL = 14` constant, and `EXTENSION_PROTOCOL_VERSION` goes to 14, for Message steps, Site switches and Update now. 13 is already taken by `INSTALL_PROTOCOL`. A tour with a Message step or a Site switch is sent only to an extension at 14 or later.
- **X14. Old extension.** Below 14, such a tour doesn't start. The hub and the side panel say "This tour needs a newer version of the SpartBoard extension. It updates on its own within a few hours, or close and reopen Chrome to get it now." This affects only extensions installed before this release, and only once.
- **X15. Update now.** Protocol 14 adds a staff-only `extension/update` message: the service worker calls `chrome.runtime.requestUpdateCheck()` and, on `update_available`, `chrome.runtime.reload()`. From the next bump on, the X14 notice gets an **Update now** button instead of the restart advice. If no update is found (`no_update` or `throttled`), the button says "Already up to date" or "Try again in a few minutes".

### Claude and the connector

- **X16. Structural edits.** `update_web_tour_text` (or a sibling tool, `update_web_tour_steps`, if that keeps the text tool's contract clean) can add, move and remove any step, Message steps and recorded steps alike, on the draft only. Claude can write a Message step from scratch but can't create a recorded step: it has no clues or picture to give one. Retargeting a recorded step (changing its clues) stays out, as `suggested_fix` handling already says.
- **X17. Only when asked.** The finish pass doesn't add an intro, outro or switch message unless the admin asks. The web tours section of the connector guide (`functions/src/mcp/liveTourGuide.ts`, kept in sync by `tests/liveTourGuideSync.test.ts`) drops "Claude can't … reorder" and explains Message steps, Site switches and the new edits.
- **X18. Whole-step revisions.** A structural edit snapshots the full step list, including each step's `web` binding and picture paths, and `restoreWebTourRevision` puts the list back exactly. The editor's sweep and `publishWebTour`'s cleanup must also keep every picture path a stored step-list revision references, for as long as the revision is kept (30 days), so a restored step comes back with its picture. Word-only edits keep today's lighter revision.

### Release

- **X19. No flag.** Only admins author web tours, so no teacher sees a Message step until an admin adds one, and the Site switch fixes cross-site tours that break today. Exempt as a fix plus admin-only authoring, per CLAUDE.md. Paul chose this knowing the Site switch changes playback for teachers on tours already recorded across sites: those tours can't be finished at all today, and the X14 refusal reaches only extensions from before this release.

## What this overrides

- **WEB_TOURS_HELP_PANEL.md H3**: a started tour isn't only tab-bound; it moves at a Site switch (X3, X4).
- **WEB_TOURS_CLAUDE.md** and the connector guide: Claude can now add, move and remove steps (X16), not only rewrite words.
- **Live tours** are unchanged: no Message step there yet.

## Slices

1. **Playback, extension protocol 14.**
   - Files: `progress.ts`, `controller.ts`, `OverlayRoot.tsx`, `i18n.ts`, `extensionProtocol.ts`, `handler.ts`/`serviceWorker.ts`, `webTourHub.ts`, `handoff.ts`, `functions/src/webTourExtension.ts`.
   - Work: Message steps in the reducer and overlay (X7, X8), the Site switch tip, new-tab move and tab reuse (X1-X4), message-plus-Go (X6), the automatic switch in check runs (X5), `extension/update` (X15), and the old-extension notice in the hub and side panel (X14).
   - Tests: a Gemini → Claude → Gemini run reusing the first tab, a self-opened tab, a message at the start, middle and end, a check run across two sites, and protocol 13 refused.
2. **Editor and Steps view.**
   - Files: `WebTourEditor.tsx`, `WebStepCard.tsx`, `webEditorModel.ts`, `webStepReview.ts`, `webTourFixes.ts`, `writeWithClaude.ts`, `useWebTourCheck.ts`, `stepsModel.ts`, `functions/src/tourPublicLinkModel.ts` and `components/tours/publicLink/publicLinkModel.ts`, plus tour anchors and surfaces.
   - Work: **Add a message** (X10), Check passing messages (X12), the Steps view with switch dividers (X11), and Publish refusing a tour with no targeted step (X8).
3. **Connector.**
   - Files: `functions/src/mcp/webTourTools.ts`, `liveTourGuide.ts` and its sync test, and the picture cleanup in `components/tours/webTours.ts`.
   - Work: structural edits (X16), whole-step revisions and restore (X18), and the guide (X17).

Slice 1 ships first because the editor would otherwise make tours that today's extension refuses. Slices 2 and 3 can run in parallel after it: they touch different files.

## Out of scope

- Message steps in Live tours.
- Adding a Message step from the recorder's side panel.
- Author-written wording for the Site switch tip.
- Opening a new site without a click outside Check tour.
