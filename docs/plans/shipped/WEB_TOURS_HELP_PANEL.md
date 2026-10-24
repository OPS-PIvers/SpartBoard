# Web tours: start after sign-in, and a help center in the side panel

**Shipped** 2026-10-24: slices 1-3 merged to `dev-paul` (#4619, #4620, #4622), extension 0.1.14. The store upload, IT trusting the OAuth clients and the real-Chrome check are tracked in `TODO.md`.

Goal: a web tour link keeps working on sites behind a sign-in (most of ours go through ClassLink), and staff can find every tour for the site they're on by clicking the extension's icon, without a link at all.

Settled in a design interview with Paul on 2026-10-23. It builds on [CHROME_EXTENSION.md](../CHROME_EXTENSION.md), [WEB_TOURS_UX.md](WEB_TOURS_UX.md) and [WEB_TOURS_CLAUDE.md](WEB_TOURS_CLAUDE.md), and **revises** CHROME_EXTENSION.md D3, T7, T9 and T11 and its out-of-scope line "the extension listing tours in its popup" (see "What this overrides").

**Code references** were taken at `dev-paul` `1e94907ec`. Symbol names are authoritative; line numbers are hints.

## Starting facts

- **The break.** The `/tour/{setId}` hub (`components/tours/web/WebTourHubPage.tsx`) hands the tour to the extension, which opens `startUrl` in a new tab (`startNow`, `extension/src/playback/controller.ts:628`). A site that redirects to its sign-in page fails the first step's `urlPattern`, so playback goes straight to `wrong-page` (`pageStatus`, `extension/src/playback/progress.ts:72`) and the overlay shows its wrong-page tip (`OverlayRoot.tsx:147`).
- **Two sign-ins today.** The hub itself needs SpartBoard sign-in (it lazy-loads `SignInPage`) because it reads the published snapshot and writes the run with the Firebase SDK (`loadPublishedTour`, `writeTourRun` in `components/tours/tourRuns.ts`).
- **ClassLink habits.** ClassLink SSO often lands the person on the app's home page, not the deep link they started from, and LaunchPad opens each app tile in a new tab. Tours today are bound to the tab they started in (T7).
- **The extension has no SpartBoard identity.** D3: no Firebase login, token or SDK. It knows the Chrome profile email (`extension/src/profile.ts`) and refuses staff-only messages for anyone else (`handler.ts:36`). The toolbar action opens the side panel recorder (`manifest.json` `action.default_title`, `extension/src/sidepanel/SidePanel.tsx`).
- **Pictures are public URLs.** Tour pictures are Firebase download-token URLs; anyone holding the URL can fetch them, and the extension has `<all_urls>` host permission.

## Decisions

### Starting a tour behind a sign-in

- **H1. Wait, then start.** A started tour begins in a new `armed` state instead of `wrong-page`. While armed it ignores pages that don't match the first step (sign-in pages, ClassLink, MFA) and the overlay shows only a small chip: "Sign in — your tour starts once you're in." When a page matching the first step's `urlPattern` loads, it moves to `seeking` and plays as today. No per-tour sign-in URL is recorded; this works on any site. `wrong-page` keeps its meaning for steps after the first.
- **H2. Go to start once.** When an armed tab leaves the tour's site (the first step's host) and later commits a page back on that host that doesn't match the first step, the extension navigates it to `startUrl` once. If the site bounces it again, the chip shows a "Go to the start" button instead of navigating, so it can never loop. A sign-in page on the site itself (one that never leaves the host) shows the button at once, since no round trip will come.
- **H3. Follow to the site.** An armed tour isn't bound to a tab. It attaches to the first tab that commits a page on the tour's host within 10 minutes of starting, then stays tab-bound as T7 says. The tab it started in shows "Your tour moved to the other tab" until closed. After 10 minutes with no arrival the tour disarms and the chip says "Tour stopped. Open the tour link again to start over." (slice 3 can point it at the side panel). One tour plays at a time, as now.
- **H4. Thin link page.** With a protocol that supports H7, `/tour/{setId}` sends the extension only the set id and needs no SpartBoard sign-in. The extension loads the tour itself (H7), arms it (H1) and records the run on the server; the page then says "Your tour is open in the other tab" with a Start again button. Without the extension, or with an older protocol (D6), the page keeps today's no-extension path: picture steps behind SpartBoard sign-in. The editor's Check tour (`useWebTourCheck`, C12) keeps handing over the full tour as today.

### The side-panel help center

- **H5. Tours tab.** Clicking the toolbar icon opens the side panel on a **Tours** tab for every staff profile; admins also get the existing **Record** tab. Tours whose first step is on the current tab's host come first; below them a search box finds any published OPS web tour by title, so someone on the ClassLink page can still open the Schoology tour. Start arms the tour (H1) in the current tab when it's already on the tour's host, or opens `startUrl` in a new tab otherwise. A non-staff profile, or a profile not signed in to Chrome, sees "Sign in to Chrome with your Orono account to see tours."
- **H6. Badge.** The icon shows a count on sites that have tours. The extension caches a host → count list from H7's list call, refreshes it every 6 hours (`chrome.alarms`) and when the panel opens, and sets the badge per tab on navigation. No page content is read to compute it.

### How the extension gets tours

- **H7. Google token and callables (revises D3).** The extension gets a Google access token with `chrome.identity.getAuthToken` (an `oauth2` block in the manifest, one OAuth client per listing) and calls new HTTPS functions with it as a bearer token. Each function verifies the token with Google's tokeninfo, checks its audience is the listing's OAuth client and its email is a verified `@orono.k12.mn.us` address, and checks that email's `web-tours` access server-side. It never trusts the profile email the extension reports.
  - `webToursListV1`: published web tours (`id`, `title`, start host, step count, version), for the badge list and the Tours tab.
  - `webTourLoadV1({setId})`: the published steps without admin notes or Claude questions, and their pictures as base64 within the existing `MAX_PICTURE_TOTAL_CHARS` budget (pictures are behind Storage rules, so there are no public URLs to hand over); the extension builds the `web-tour/start` tour from them.
  - `webTourRunV1({setId, run})`: writes the run with the same fields and limits as `validRun`, under the Firebase uid found by `getUserByEmail`. A staff member with no SpartBoard account has no run recorded; their tour still plays.
  - The extension still has no Firebase SDK and never reads or writes Firestore. D3's other hard rules are unchanged: no acting on third-party pages, text-only tips, recording only from a side panel button.
- **H8. Consent and setup.** To avoid a Google consent prompt for each teacher, IT marks each listing's OAuth client as trusted in the Google Admin console. The prod OAuth client needs the store extension ID. Each listing's client ID is set at build time from `src/listings.ts`.
- **H9. Flag.** The existing `web-tours` flag gates everything, checked inside the H7 functions, so the panel follows the same admin/Beta pilot list as authoring and the `/tour` route. A profile without access sees "Web tours aren't available for your account yet." No new flag.

### Protocol and versions

- **H10. Protocol bump.** A new `web-tour/open` message (`{setId}`, staff-only) joins `ExtensionMessage` and `MESSAGE_SPECS`, and `EXTENSION_PROTOCOL_VERSION` goes up by one. The hub sends it only when `ping` reports the new protocol and falls back to today's `web-tour/start` otherwise, so a teacher with 0.1.12 still gets the old flow.

## What this overrides

- **D3**: the extension now holds a Google access token (never a Firebase one) and calls SpartBoard's own HTTPS functions (H7). It still never reads or writes Firestore.
- **T7**: a tour that hasn't started yet can move to another tab (H3).
- **T9**: the hub is a thin launcher with the extension (H4); the progress port and client-side run writes remain only for the Check tour and the old-protocol fallback.
- **T11** and the out-of-scope line: the extension lists tours (H5).

## Slices

1. **Callables and identity.** `webToursListV1`, `webTourLoadV1`, `webTourRunV1` with token verification, the `web-tours` check and tests; the manifest `oauth2` block and per-listing client IDs; a token helper in the extension. Nothing user-facing yet.
2. **Wait-then-start, extension 0.1.13.** The `armed` state in `progress.ts` and the controller (H1–H3), the chip in the overlay, `web-tour/open` (H10), and the thin hub (H4). Tests for: a ClassLink redirect chain, home-page landing with one navigation, a second bounce showing the button, a LaunchPad new tab within and after 10 minutes, and the 0.1.12 fallback.
3. **Tours tab and badge.** The Tours tab, search and Start (H5), the badge and its cached list (H6), and the not-signed-in and no-access messages (H9).

## Out of scope

An on-page help launcher drawn on third-party sites, tours that start automatically when someone visits a page, and tours for students.
