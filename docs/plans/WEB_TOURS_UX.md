# Web tours UX overhaul

Goal: make web tours (tours of other websites, recorded and played by the SpartBoard Chrome extension) feel like part of SpartBoard. Authors should be able to record a tour start to finish from the extension, find and manage it next to live tours, and play it on real sites without the page breaking.

Settled in a design interview with Paul on 2026-10-22, after his first hands-on test of the dev extension on Windows. This plan builds on [CHROME_EXTENSION.md](CHROME_EXTENSION.md) and overrides its T2 (Help Center), T6 last bullet (per-step student-data tick) and T11 (links-only discovery). Everything else there still holds, D3 above all: the extension never reads or writes Firestore.

**Code references** were taken at `dev-paul` `c18c610ba`. Symbol names are authoritative; line numbers are hints. Open PR #4544 ("Start a web tour from the Record a tour button") lands new entry points first; this plan builds on it (U5, U17, PR order).

## What Paul hit

1. Web tours, live tours and Guided Learning look and behave differently in the widget library.
2. A tour can't be created from the extension. The author has to open the tour in SpartBoard and press Record steps first.
3. Playing back a Google Docs tour (click Extensions, then Apps Script) blacked out the whole screen except the cutout over Extensions.
4. The side panel looks generic and ignores SpartBoard's design tokens.
5. Finding, editing and deleting web tours is unclear.

## Starting facts

- **The black screen was missing CSS, not a design choice.** The overlay reuses `TourSpotlight` (`components/tours/TourSpotlight.tsx:97-115`): a full-viewport SVG path with `fillRule="evenodd"` whose 55% slate-950 dim comes only from the Tailwind class `fill-slate-950/55`. With no CSS an SVG path fills solid black, and the evenodd hole still cuts out. Paul played the tour on a build from before #4541 (Tailwind content globs matched nothing on Windows). The current `extension/dist/dev/overlay.js` contains the classes.
- **Two real Docs problems remain.** The dim has `pointerEvents: 'auto'` (`TourSpotlight.tsx:110`) and the overlay passes no `onMisclick`, so a menu that opens under the dim can't be clicked. The recorder captures on `pointerdown` (`extension/src/recorder/contentRecorder.ts:40-48`), but playback only advances on a trusted `click` (`extension/src/playback/frameScript.ts:36-41, 79-101`), and Docs menu-bar buttons open on mousedown.
- **Re-seeking on Docs is costly.** A MutationObserver on the whole document re-runs `byText` over every element (`playback/locate.ts:116-129`, `frameScript.ts:124-149`, 250ms debounce).
- **Library.** `GuidedLearningManager.tsx` renders live tours and activities as `LibraryItemCard`s in `LibraryGrid` (`renderLibraryCard`, ~:905-1225), with folders, bulk select, a preview pane, badges and a full menu. `WebToursSection.tsx` is a plain admin-only `<ul>` mounted above the grid only under the Live tours filter (`GuidedLearningManager.tsx:1500-1504`), with no cards, play, link, menu, folders or delete.
- **Storage.** Drafts in `building_web_tours/{setId}` (admin only, `firestore.rules:1309-1311`); published snapshots in `building_guided_learning_tours/{setId}` with `surface: 'web'` (`components/tours/webTours.ts:148-188`); pictures in `web_tour_pictures/{setId}/` (`storage.rules:444-452`). Deleting a draft triggers `webTourCleanup` (`functions/src/webTours.ts:29`).
- **Entry points from #4544.** The library's admin **Record a tour** header button becomes a menu (`LibraryShell` secondary action with `menuItems`) offering **SpartBoard tour** and **Web tour**, wording Paul picked. Web tour calls the new shared `createWebTourDraft()` (`components/tours/webTours.ts`) and opens `WebTourEditor` from the manager (`openWebTour` state), whatever the Type filter. Admin Settings > Help Center > Live tour health gets **Record a web tour** (anchor `admin.help-center.record-web-tour`). Both are behind `web-tours`. New anchor `library-shell.secondary-menu-item`.
- **Editing today.** Rename and Delete exist only inside `WebTourEditor` (`:489-499`, `:427-456`). Publish success says "Staff can open this tour from its link" but no link is shown. The only Copy link is in Admin Settings > Help Center > Tour health (`WebTourHealthSection.tsx:83-140`).
- **Recording handshake.** The side panel learns about tours only from `recorder/attach` ports opened by an editor's Record steps button (`useWebTourRecorder.ts:74-148`, `extension/src/recorder/worker.ts:28-29, 58-70, 233-270`). The extension's external handler accepts only `ping` and `web-tour/start` (`extension/src/handler.ts:36-47`). All page-to-extension channels are page-initiated.
- **Publish gate.** `publishBlockers` (`components/tours/web/webStepReview.ts:164-184`) blocks on text hard hits from `findStudentData` and on any step without a current `checked` tick (`isStepChecked`, signature-based). The scan reads text only, never picture pixels.
- **Tokens.** The extension's Tailwind config presets the root config (`extension/scripts/tailwind.overlay.config.ts`), so brand colours and `lightChrome.ts` classes are available, but `SidePanel.tsx` uses raw `bg-blue-700`/`bg-red-700`/`rounded-md`. The extension ships no fonts. Lexend appears only if the host page loads it. Chrome ignores `@font-face` inside a shadow root.

## Decisions

### Playback

- **U1. Missing styles can never paint black.** The spotlight path carries inline `fill` and `fill-opacity` attributes matching the dim, so a missing stylesheet degrades to the right dim. The overlay mount checks that its sheet applied (a probe element's computed style), and if not, shows the picture-fallback tip instead of a spotlight.
- **U2. On websites the dim is click-through.** Same look as live tours: 55% dim, white ring, tip and bar. But on web tours the dim takes `pointer-events: none`, so menus and popups that open mid-step stay usable. SpartBoard live tours keep their blocking dim and `onMisclick`.
- **U3. Advance on the event that was recorded.** A click step advances on a trusted `pointerdown` or `mousedown` on the target as well as `click`, matching the recorder, so menu buttons that open on mousedown (Google Docs) advance.
- **U4. Cheaper re-seek.** Scope the MutationObserver re-seek so busy pages like Docs don't re-scan every element's text on each mutation (e.g. try role+name first and run `byText` only when the cheap passes miss, and coalesce to animation frames). Measure on a Google Doc before and after.

### Library

- **U5. Web tours join the Live tours list.** One list of tours, both kinds as `LibraryItemCard`s in `LibraryGrid`, with a website badge (the site's host) on web tours. `WebToursSection`'s strip goes away, including its "New web tour" link: the #4544 Record a tour menu (Web tour) is the library's one way to start a web tour from SpartBoard. The `web-tours.new` anchor is not in `config/tourAnchorsInUse.json`, so it is retired with the strip rather than carried over. The list still reads drafts from `building_web_tours` through `watchWebTourDrafts`, merged with live tours in the manager. Admin-only and `web-tours`-gated as now (T12).
- **U6. Web tour card actions.** Play (opens `/tour/{setId}`), Edit, Copy link (the `/r/tour-...` short link), Duplicate, Move to folder, Move to Help Center / Move to library, Delete (with the confirm `WebTourEditor` has today). Card badges show Published, Draft or Changed since publish. No Export, no Assign. Check during PR 2 how folders store membership and whether a `building_web_tours` id can sit in them; if not, extend the folder model rather than skipping folders.
- **U7. Web tours appear in the Help Center.** Overrides CHROME_EXTENSION.md T2/T11. A web tour moved to the Help Center is listed like a live tour, with the site's badge, and opening it goes to its `/tour/{setId}` hub. The snapshot read rule already limits web snapshots to district staff (T6), so students never see them. `useTourOffers`, What's New and tour offers still skip web tours.
- **U8. No extension: pictures plus install.** A teacher opening a web tour without the extension (or on an old protocol) gets the picture walkthrough `/tour` already renders, with a clear "Get the SpartBoard extension" button. No blocking.

### Editor (SpartBoard side)

- **U9. Same layout as the live tour editor.** Light chrome (`lightChrome.ts`, TOUR_LIGHT_CHROME.md): a step list with thumbnails on the left, a large picture preview on the right, title and Published/Draft state in the header with Play and Copy link. It edits tip text, order, delete, blur, and the step's action type.
- **U10. Fix on site.** A step whose locator is weak or missing ("needs checking") gets a **Fix on site** button. It opens the step's site in a tab and puts the side panel in pick mode for that step: the next click replaces that step's locator and picture instead of adding a step. This needs a new recorder message for "re-pick step X of set Y" (protocol bump, D6).
- **U11. One publish check, not a tick per step.** Overrides CHROME_EXTENSION.md T6's last bullet. On Publish:
  - The text scan (`findStudentData`) hides any student names it finds (`hideHits`) and lists what it hid.
  - One confirm shows every step picture as a strip and asks if anything private is in them, with Publish or Blur. It appears on first publish and again only when a picture changed since the last confirmed publish (track one tour-level signature of picture paths, replacing per-step `checked`).
  - `publishBlockers` and `assertPublishable` drop the `unchecked` blocker and keep the hard-hit text blockers, so every publish path still refuses student data in text.

### Side panel (extension)

- **U12. Match SpartBoard exactly.** Rebuild `SidePanel.tsx` on `lightChrome.ts` classes and brand tokens (brand blue primary, brand red for Stop, `rounded-lg` buttons, `rounded-2xl` cards, the app's icons). Bundle Lexend woff2 files in the extension: the side panel loads them directly; the overlay declares `@font-face` at document level pointing at `web_accessible_resources`, falling back to system sans if the site's CSP blocks it.
- **U13. Record, then name at Send.** No tour is needed before Record. At Send the panel asks for a title prefilled from the tab's page title, or offers a list of the author's web tour drafts to add the steps to.
- **U14. Step editing in the panel.** Each step can be deleted, blurred, and given its tip text while the click is fresh. Order, action type and publishing stay in SpartBoard.
- **U15. Unsent steps survive.** Unsent steps (with pictures and blur boxes) are kept in `chrome.storage.local` until sent or discarded. Reopening the panel shows them with Send and Discard. Cleared on successful send.
- **U16. Recording is visible on the page.** While recording, the tab shows a small SpartBoard "Recording" pill (in the overlay's shadow root) so the author knows clicks are captured even with the panel collapsed.

### Creating from the extension

- **U17. The extension asks SpartBoard to save, through a quiet tab.** D3 stands: the extension still never touches Firestore. Send works like this:
  - If a SpartBoard tab on a listed origin already has an intake port open, the panel's request goes through it.
  - The intake page creates drafts with `createWebTourDraft()` (from #4544), so every entry point makes the same blank draft.
  - Otherwise the service worker opens a small SpartBoard intake route (e.g. `/web-tour-intake`) in a background tab. The page signs in as usual, checks `isAdmin` and the `web-tours` flag, connects a port, lists the author's drafts for the picker (U13), creates the draft (`newWebTour` + `saveWebTourDraft`) or appends to the chosen one, uploads pictures, acks each step, and closes itself.
  - The panel then shows "Saved" with Open in SpartBoard.
  - If the author isn't signed in to SpartBoard, the intake tab comes to the front on the sign-in screen and the panel says so.
  - New protocol messages and validators go in `components/tours/web/recorderProtocol.ts` and `extensionProtocol.ts`, with a protocol bump (D6). The intake page accepts only steps from its own extension port, never from page messages.
- **U18. SpartBoard-side entry points stay.** Record a tour > Web tour (library) and Record a web tour (Live tour health), both from #4544, still create a draft and open the editor, and the editor's Record steps button still appends from SpartBoard. They use the same intake logic as U17.

### Scope

- **U19. No mixed tours** (unchanged T2): a tour is either a SpartBoard tour or a website tour.
- **U20. Flag.** Everything stays behind `web-tours` (admin, preview). No new flag.
- **U21. Copy.** New strings follow `components/CLAUDE.md` On-screen copy: no helper sentences under labels, empty states with a title and at most one short line, no em dashes. Paul approves new on-screen wording in each PR.

## PRs

All into `dev-paul`, in order. Each bumps `extension/manifest.json` when it changes the extension.

1. **Playback fixes.** U1, U2, U3, U4. Tests for the advance-on-pointerdown path and the click-through dim; manual check on a Google Doc (Extensions > Apps Script).
2. **Library merge and cards.** U5, U6, U7, U8. Starts after #4544 merges and builds on its Record a tour menu and `openWebTour` editor state. Removes `WebToursSection` and its `web-tours.new` anchor; registers anchors for new card actions.
3. **Editor redesign and publish check.** U9, U11, and the SpartBoard half of U10 (the button and the request; the panel's pick mode lands in PR 4). `WebTourEditor` is opened from the library card, the Record a tour menu and Live tour health (#4544); keep its `initial`/`onClose` props so all three keep working.
4. **Side panel redesign.** U12, U14, U15, U16, and the panel half of U10.
5. **Create and append from the extension.** U13, U17, U18.

## Risks

- **Site CSP vs fonts (U12).** Some sites may block the extension's font URLs in the overlay. Fallback is system sans; verify on Docs, Schoology and Infinite Campus.
- **Background intake tab (U17).** Chrome may throttle a background tab's timers; Firestore writes and Storage uploads must still finish. Prove it in PR 5 with ten steps and pictures.
- **Click-through dim (U2).** A learner can now click anything on the page. Wrong clicks are no longer caught; the step simply waits. Acceptable for observe-only web tours (D3).
- **Folders (U6).** Folder membership may assume `building_guided_learning` ids; checked in PR 2.
