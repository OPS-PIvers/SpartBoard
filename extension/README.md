# SpartBoard Chrome extension

Web tours now, focus sessions later. The contract is [docs/plans/CHROME_EXTENSION.md](../docs/plans/CHROME_EXTENSION.md).

- `pnpm -C extension run build` builds both listings into `dist/prod/` and `dist/dev/` (load either unpacked from `chrome://extensions`); `pnpm run build:extension` also zips them, as CI does on every PR.
- Type-check and lint run in their own passes (`pnpm -C extension run type-check`, `pnpm run lint:extension`); tests run in the root Vitest suite.
- Only `@types/chrome` is installed here. Vite, React, i18next and Tailwind come from the root `node_modules`, and `@/` is the repo root, as in the app.

## Layout

- `manifest.json`: the base manifest. Bump `version` here to publish (D7). `src/listings.ts` holds each listing's name and exact page origins (D5).
- `src/serviceWorker.ts`: refuses senders that aren't a top frame on a listed origin (`src/sender.ts`), checks every message against `components/tours/web/extensionProtocol.ts` and answers it in `src/handler.ts`. Page ports are refused until a protocol version defines one.
- `src/overlay/`: the tour overlay (`TourSpotlight`, `TourBar` without Autopilot, `TourTip`) in a closed Shadow DOM with its own i18n instance. Its CSS is compiled with the app's Tailwind theme and every `rem` rewritten to `px`, so the host page's font size can't rescale it.
- `src/focus/`: focus sessions on student profiles (`@students.orono.k12.mn.us` only; staff never enforce). `focusClient.ts` pulls `focusStatusV1` every 5 minutes, at browser start, on sign-in and on a data-free Web Push, keeps the session in `chrome.storage.session`, counts down on the badge and reports On task or Away to `focusReportV1` on each change and at most once a minute. `page/` is the focus page the student sees. Push subscribes only once the listing has a `vapidPublicKey`; until then devices poll. The server sends a data-free push to the class after each teacher change (`functions/src/focus/push.ts`); `node scripts/focus-vapid-keygen.mjs --project dev|prod` makes a project's key, stores the private half in Secret Manager and writes the public half here.
- `src/sidepanel/FocusTab.tsx`: the teacher's side panel Focus tab (F12). It shows only when `focusPanelV1` lists the teacher's classes, which needs the `focus` widget permission; the worker forwards its requests (`src/focus/panelMessages.ts`) with the Chrome Google token, and the server runs the same start, extend, release and end handlers as the Focus widget.
- Redirect and Lock (F2, F10): `enforce.ts` decides (pure, tested) and `chromeEnforce.ts` acts. A blocked top-level navigation goes back to the allowed page the tab was leaving, else to the most recent allowed tab (closing the blocked one), else the tab becomes the focus page, with a notice, and counts as a blocked try. Tabs already on blocked sites are parked as `focus/index.html?parked=<address>` and restored when nothing blocks them any more, including at the first check after a restart. Lock adds two `declarativeNetRequest` session rules (allow the sites, sign-in and SpartBoard hosts; block every other top-level page; paths are the worker's job), makes the window fullscreen once, and covers the page with "Return to fullscreen" (`pageNotice.ts`, injected) when the student leaves it; that time reports as Away. The permission is `declarativeNetRequestWithHostAccess`, which adds no install warning on top of `<all_urls>`.

## Publishing

`.github/workflows/extension-publish.yml` runs on every `main` push and publishes the prod listing whenever `version` in `manifest.json` is higher than the newest version the Web Store has published or in review (D7):

- **Dev build:** never published. Paul loads `dist/dev` unpacked, so a `dev-paul` version bump publishes nothing.
- **Prod listing:** a `main` push whose version is newer than the store's builds `dist/prod`, uploads it to the item in the `SPART_EXTENSION_ID` repository variable and submits it through the `chrome-web-store-dev` environment (the name is historical; it holds the prod secrets and only `main` may use it). There is no separate GitHub approval: Paul's OK on the release that carries the bump is the approval. The workflow refuses any ref but `main`, and the environment's deployment branch rule keeps its secrets on `main` too.
- A failed upload is tried once more after two minutes, and every later `main` push tries again, because the comparison is with the store, not the previous commit. It can also be run by hand (Actions > Publish Chrome Extension > Run workflow, from `main`).
- When a run fails it opens one issue titled "Chrome Web Store publish failed" (later failures comment on it), and Claude comments there with the cause and the fix. A later run that finds the store up to date closes it. Only a new issue gets a diagnosis, so a lasting failure does not start a Claude run on every release.
- It still goes through Web Store review before Chrome updates installs, which can take days. The run's summary keeps the uploaded zip for 90 days.
- `scripts/publish.ts` does the upload with the Chrome Web Store API v2 (`scripts/webStore.ts`) and stops with a plain message naming anything that isn't set up.

One-time setup (Paul):

1. In a Google Cloud project, enable the Chrome Web Store API, set the OAuth consent screen to **Internal** (an External app in testing loses its refresh token after 7 days), and create an OAuth client ID.
2. With that client, get a refresh token for the scope `https://www.googleapis.com/auth/chromewebstore` while signed in as the Web Store developer account (it needs 2-step verification), for example from the OAuth 2.0 Playground with "Use your own OAuth credentials".
3. Copy the publisher ID from the Developer Dashboard (Publisher > Settings).
4. Create the environment `chrome-web-store-dev` under Settings > Environments (deployment branch `main`, no required reviewers). Give it the secrets `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` and `CWS_PUBLISHER_ID`, and nothing else.
5. The API keeps the listing's visibility, so it needs one manual publish from the dashboard as Private first.

## Adding a message type

Add it to the `ExtensionMessage` union and `MESSAGE_SPECS` in `extensionProtocol.ts` (fields and `staffOnly`), bump `EXTENSION_PROTOCOL_VERSION`, and add its `case` in `src/handler.ts`, with tests for both.

## Playback performance

`scripts/bench/` plays real tours through the built extension in headless Chromium and times every step change. `pnpm -C extension run bench` builds `dist/bench/` (the dev listing with timing marks, which normal builds compile away) and plays the scenarios in `scripts/bench/scenarios.ts`: seven pages served over local https (a 12k-cell gradebook with a ticking clock, a single-page app with late content, Docs-like menus, shadow DOM, iframes and a long scroller). The tours are recorded with the recorder's own clue capture.

- Flags: `--label=<name>` (results land in `scripts/bench/results/<name>.json`, which is git-ignored; `node scripts/bench/compare.ts <before> <after>` prints a before/after table), `--runs=3`, `--throttle=1,4` (CPU slowdown; 4 is roughly a Chromebook), `--only=heavy,spa`, `--cold` (stops the service worker before each click, as Chrome does after 30 idle seconds), `--video`, `--budget` (fails over the `BUDGETS` in `run.ts`; CI runs this).
- `SB_BENCH_EXT=<dir>` plays another bench build, e.g. one from before a change; `SB_BENCH_CHROMIUM=<path>` uses a browser other than Playwright's.
- What it reports per scenario: click to the next spotlight being painted, content arriving to its spotlight, time the spotlight blinked out or the tip sat centred, the worst search, long tasks and skipped frames on the page.
