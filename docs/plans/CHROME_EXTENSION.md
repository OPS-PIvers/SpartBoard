# SpartBoard Chrome extension: web tours and focus sessions

Goal: one Chrome extension that does two things.

1. **Web tours (first).** Admins record live tours on any website (Schoology, Google Classroom, Infinite Campus, ...). A shared link opens the site and starts the tour.
2. **Focus sessions (later).** Keep students on allowed sites during a SpartBoard quiz or video activity, or during a teacher-started session on any website.

Scope was settled in a design interview with Paul on 2026-10-22. This document is the contract.

**Code references** were taken at `dev-paul` commit `1da7f45`. Symbol names are authoritative; line numbers are hints.

## Starting facts

- A live tour is a Guided Learning set with `mode === 'tour'` (`GuidedLearningMode`, `types.ts`). Each step carries `step.tour: GuidedLearningTourBinding` with an `anchor` from `config/tourAnchors.ts`, plus a `fallback {role, name}`. There is no CSS selector, URL or coordinate field.
- Drafts are at `building_guided_learning/{setId}`; published snapshots at `building_guided_learning_tours/{setId}` (`components/tours/publishedTours.ts`), with runs at `/runs/{uid}`. Staff read; only `isAdmin()` writes.
- `LiveTourRunner` (`components/tours/LiveTourRunner.tsx`) only runs inside `DashboardView`. `findTourAnchor` (`components/tours/resolveTourAnchor.ts`) queries `[data-tour]` and falls back to ARIA role plus accessible name.
- The recorder (`components/widgets/GuidedLearning/components/recorder/`) captures pictures with `getDisplayMedia` and blurs `[data-pii]` elements.
- Sharing today is `/help/{itemId}` plus `/r/help-...` short links (`components/help/helpCenterState.ts`).
- There is no fullscreen focus mode. Quizzes and video activities track tab-away (`hooks/useTabAwayTracker.ts`), count `tabSwitchWarnings`, auto-submit at a threshold and record `tabExits[]` (max 50), guarded by `tabExitsOk()` in `firestore.rules`. Guided learning and mini apps have no tracking.
- No extension code or extension plan exists in the repo. Orono runs no classroom-management tool (GoGuardian, Securly, etc.) on student Chromebooks.

## Decisions

### Shared

- **D1. One extension, tours first.** Web tours ship to staff first. Focus sessions are added later as a flag-gated module of the same extension, switched on by rolling the install out to the student org unit.
- **D2. Private listing, force-installed.** Publish to the Chrome Web Store as Private to `orono.k12.mn.us`. Force-install from Google Admin by org unit (staff for tours, students when focus ships). Users can't disable it.
- **D3. SpartBoard is the brain.** The extension holds no Firebase login, token or SDK, and never reads or writes Firestore. A signed-in SpartBoard tab talks to it over `externally_connectable` messaging (`chrome.runtime.sendMessage` / ports). It sends the extension a tour to play or a focus allowlist, receives recorded steps or exit events, and saves them through the normal client and rules.
- **D4. Code lives in `extension/` in this repo.** It has its own Vite build (Manifest V3) and imports `types.ts` and the tour overlay components (`TourSpotlight`, `TourTip`, `TourBar`), rendered inside a Shadow DOM so host-page CSS can't leak in or out. It shares the step-binding types so they can't drift.
- **D5. One build for dev and prod.** `externally_connectable.matches` lists `https://spartboard.web.app/*`, the `spartboard-dev*.web.app` sites and `http://localhost:3000`-`3004`. The calling page's origin decides the Firebase project, so the extension needs no environment switch.
- **D6. Release pipeline.** CI builds and zips `extension/` on every PR. A push to `main` whose `extension/manifest.json` version changed uploads and publishes it with the Chrome Web Store API (a secret Paul adds). Force-installed copies update within hours.

### Web tours

- **T1. Same data model, new surface.** A web tour stays a Guided Learning set with `mode: 'tour'`, and gets a new set-level field `surface: 'spartboard' | 'web'` (missing means `'spartboard'`). Drafts, publishing, snapshots, rules, review notes and runs are reused as they are.
- **T2. No mixed tours.** A tour is either a SpartBoard tour or a web tour. The Help Center, tour offers, What's New, `useTourOffers` and `TourHealthPanel` filter to `surface !== 'web'`. The Help Center stays SpartBoard-only.
- **T3. Web step binding.** `GuidedLearningTourBinding` becomes a discriminated union on `kind`. The existing shape is `kind: 'spartboard'` (default when missing). The new `kind: 'web'` carries:
  - `urlPattern`: the page the step expects (origin plus path, with wildcards for ids).
  - `locator`: layered clues captured at record time: ARIA role plus accessible name, visible text, a short CSS path, the frame path (D-risk R1), and the element's position relative to the viewport.
  - `action` (observe / click / type / select), `thumbnail`, and tip text, as SpartBoard steps have today.
- **T4. Layered locator with picture fallback.** Playback tries the clues in order (role+name, text, CSS path, position). If none match, the step shows its picture with "Find this button" instead of failing silently. Each step reports which clue matched, so weak matches show up in the health data (T9).
- **T5. Side-panel recorder, Studio editor.** In a Chrome side panel the admin presses Record and clicks through the real site. Each click captures the locator and a screenshot (`chrome.tabs.captureVisibleTab`, so no screen-share prompt), and the steps stream to the SpartBoard tab, which saves them as a draft. Wording, ordering and publishing happen in the Guided Learning Studio. There is no second editor.
- **T6. Student data in pictures.** Screenshots are cropped to the target and its surroundings, and the side panel has a one-click blur-region tool. Publishing a web tour is blocked until the admin ticks "I checked this picture for student data" on every picture step. Pictures use the existing staff-only tour picture Storage path.
- **T7. Multi-page tours in one tab.** Each step stores its `urlPattern`. The service worker keeps tour progress per tab in `chrome.storage.session`, re-injects the overlay after each navigation and waits for the expected page before showing the step. New tabs and popups are a v2 question.
- **T8. Host access: any site, inject on demand.** The manifest declares `<all_urls>` (force-install grants it without a prompt) but ships no always-on content scripts. The extension injects with `chrome.scripting.executeScript` only into a tab that is playing or recording a tour, and reads nothing on any other site. IT can still block hosts in Google Admin (`runtime_blocked_hosts`).
- **T9. `/tour/{setId}` page is the hub.** Shared links are `/tour/{setId}`, with `/r/tour-...` short links (extend the `helpShortLinkCode` family in `components/help/helpCenterState.ts`). The route mounts only auth and the published-tour read, not the dashboard. The page:
  - With the extension: opens the tour's start URL in a new tab, hands the tour to the extension, and stays open as the tour's home, showing a step checklist with pictures. It receives progress over a runtime port and writes the run doc and per-step locator-miss and weak-match counts.
  - Without the extension: shows the tour as picture steps, and says how to get the extension.
  - If the site tab is closed, the tour can be resumed from here.
- **T10. Discovery is links only in v1.** Admins manage web tours in the Guided Learning manager, filtered by surface, and share links in email, Schoology and newsletters. A staff "District tools" page can come later on the same data.
- **T11. Flag.** New `GlobalFeature` `web-tours`, a `FEATURE_DEFAULTS` entry (`defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'keep'`), also added to `functions/src/featureMissingDoc.ts`. It gates authoring only: the "Web tour" option in the GL manager, the recorder hand-off and the side panel. `/tour/{setId}` plays for any staff member, so Paul can pilot one tour with one teacher on prod. Admins always pass the gate.

### Focus sessions

- **F1. One engine, two entry points.** The extension runs a "focus session": an allowlist plus an enforcement level.
  - (a) A quiz or video activity with tab-away tracking on starts one automatically, with the allowlist set to that activity.
  - (b) A teacher starts a standalone session on any sites from a new **Focus** widget.
    Both record exits in the existing `tabExits` shape, so the monitor views, `tabExitsOk()` and their tests carry over. Standalone sessions get their own session/response collection, with rules modelled on the video-activity response rules.
- **F2. Teacher picks enforcement.** Per session: **Monitor** (allow and log), **Redirect** (send the student back to the allowed tab with a notice, and log it; the default), or **Lock** (block new tabs, windows and non-allowed navigation). IT one-time setup: turn off guest mode and incognito for the student OU in Google Admin.
- **F3. The student's SpartBoard tab is the hub.** The student joins through the normal flow (ClassLink login or join code). That page hands the allowlist to the extension, stays open, receives exit events and writes them. Closing the hub tab counts as an exit, and the extension reopens it. The extension never holds student credentials.
- **F4. Domain and time only.** The teacher sees the domain the student went to and how long they were away. Never full URLs, page titles or content. Add a `domain` field to the `tabExits` entry and to `tabExitsOk()`.
- **F5. Lease plus hard cap.** The hub renews the lease about every 30 seconds. The session ends when the teacher ends it, when the quiz or video activity is submitted, at the teacher's time limit (at most 90 minutes), or 2 minutes after the hub goes silent and can't be reopened (logged as "focus ended: connection lost"). A rebooted or offline Chromebook always comes back unlocked.
- **F6. Focus widget.** New `focus` widget through the `new-widget` skill. The teacher picks a class, adds allowed sites (or pulls them from the board's URL and Embed widgets), picks the enforcement level, sets a time limit and starts. It shows a live roster with who is away, where (domain) and for how long. It ships at `feature_permissions` access level `admin`.
- **F7. No extension means fall back and flag it.** Quizzes and video activities fall back to today's browser-only tab-away tracking. A standalone session still opens the allowed sites but can't enforce them. Either way, the roster marks the student "not enforced (no extension)". The extension answers a `ping` message so the page can tell.
- **F8. Allowlist matching.** Entries are URL prefixes (`desmos.com/calculator`, or one Google Doc's URL). Sign-in and SpartBoard hosts are always allowed (`accounts.google.com`, `launchpad.classlink.com`, `spartboard.web.app`), so logging in never counts as an exit.
- **F9. Flag.** New `GlobalFeature` `focus-sessions` (preview, admin) gates the automatic quiz and video-activity hand-off (F1a). The Focus widget is gated by its `feature_permissions` record.

## Risks, in the order to prove them

- **R1. Frames from other sites.** Schoology and Google Drive build pages from embedded frames on other origins. The extension has to inject into every frame (`allFrames`), record each target's frame path, and draw the spotlight in the right frame. **Prove this first** with a throwaway prototype that records and replays three steps in Schoology; it decides whether T4 holds.
- **R2. Service worker lifetime.** MV3 service workers stop when idle. Tour progress and focus leases live in `chrome.storage.session` and `chrome.alarms`, never in memory.
- **R3. Screenshots only cover the viewport.** `captureVisibleTab` captures what's on screen, so the recorder scrolls the target into view before capturing.
- **R4. Store review for `<all_urls>`.** A Private listing still goes through review. The listing needs a privacy policy section for the extension (extend `/privacy`) that states T8 and F4.
- **R5. Limits of focus mode.** It can't stop another device or another Chrome profile. Teacher-facing copy must say so.

## Build order

Each step is its own PR into `dev-paul`.

1. **Prototype (throwaway).** Minimal MV3 extension that records and replays three steps on Schoology, across frames (R1). Not merged; findings go into this doc.
2. **Extension scaffold.** `extension/` Vite build, manifest, service worker, `externally_connectable`, `ping`, Shadow DOM overlay that reuses the tour components, CI zip job (D4-D6).
3. **Data model.** `surface` field, `kind`-tagged `GuidedLearningTourBinding`, filters in the Help Center and tour offers (T1-T3), `web-tours` flag (T11).
4. **Playback.** Layered locator, multi-page progress, picture fallback (T4, T7, T8).
5. **`/tour/{setId}` hub and short links**, with run and miss tracking (T9).
6. **Recorder.** Side panel, capture, blur, publish gate, GL manager "Web tour" option (T5, T6, T10).
7. **Web Store publish job** on `main` (D6).
8. **Focus engine** in the extension, plus `domain` in `tabExits` and rules (F1, F2, F4, F5, F8).
9. **Quiz and video-activity hand-off** behind `focus-sessions` (F1a, F3, F7, F9).
10. **Focus widget** and standalone session collection (F1b, F6).

## Out of scope for v1

Tours that mix SpartBoard and web steps, tours that follow new tabs or popups, a browsable tour list for staff, the extension listing tours in its popup, full-URL browsing logs, student-made tours, and distribution outside Orono.
