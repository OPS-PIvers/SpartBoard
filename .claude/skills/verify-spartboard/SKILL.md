---
name: verify-spartboard
description: Launch, drive, and capture proof from SpartBoard's teacher web app (board, Dock, widgets, settings drawer, sidebar, Admin Settings) and its /*-dev harness pages. Use when asked to run, verify, demo, or screenshot SpartBoard, or to prove a change to SpartBoard works in the real app rather than only in tests.
---

# Verify SpartBoard

SpartBoard is a React/Vite web app. An agent proves a change by running a local Vite dev server and driving it in the **built-in browser pane** (`mcp__Claude_Browser__*`). The Playwright MCP (`mcp__plugin_playwright_playwright__*`) is an acceptable substitute with the same selectors; the user's real Chrome (`claude-in-chrome`) is not, because it carries their prod sign-in.

## Pick a mode first

| Mode                   | Launch config | Port  | Backend                                                   | Use for                                                                                                                    |
| ---------------------- | ------------- | ----- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Isolated** (default) | `vite-verify` | 56320 | none: Firebase project `dummy`, mock admin `mock-user-id` | anything a teacher does on a board: Dock, widgets, settings drawer, sidebar, Admin Settings UI, all `/*-dev` harness pages |
| **Real on dev**        | `vite-dev`    | 3000  | `spartboard-dev`, real Google sign-in                     | anything that must save or load: boards persisting across reload, Drive, AI, quiz sessions, student joins, rules behaviour |

Start in Isolated. Move to Real on dev only when the proof needs a backend, and say so in the report. Never verify unreleased work against prod (`vite-dev-prod`, port 3004, or https://spartboard.web.app).

## Launch

Isolated:

1. `mcp__Claude_Browser__preview_start` with `{ "name": "vite-verify" }`. Record the returned `serverId` (for cleanup) and `tabId`.
2. `mcp__Claude_Browser__resize_window` `{ width: 1280, height: 800, tabId }`. The pane's default 800x600 puts the Dock off-screen and clicks on it fail.
3. Wait for ready (usable, not just HTTP 200; first boot can take 30-60 s while Vite pre-bundles). Run with `javascript_tool`:
   ```js
   const t0 = Date.now();
   while (
     Date.now() - t0 < 90000 &&
     !document.querySelector('[title="Open Menu"]')
   )
     await new Promise((r) => setTimeout(r, 1000));
   !!document.querySelector('[title="Open Menu"]');
   ```
   `true` = ready. `false` after 90 s = see Doctor. If the tool reports "the page navigated while this script was running", Vite reloaded the page after pre-bundling: run the same check again. The pane can also clear your 1280x800 size when its width changes; re-run step 2 if the tab context says so.

Without the browser pane (Playwright MCP or a script), start the same server from a shell in the background, and record the port:

```bash
VITE_AUTH_BYPASS=true VITE_FIREBASE_API_KEY=dummy VITE_FIREBASE_AUTH_DOMAIN=dummy VITE_FIREBASE_PROJECT_ID=dummy VITE_FIREBASE_STORAGE_BUCKET=dummy VITE_FIREBASE_MESSAGING_SENDER_ID=dummy VITE_FIREBASE_APP_ID=dummy VITE_GOOGLE_CLIENT_ID=dummy pnpm run dev --port 56320 --strictPort
```

(Bash tool, `run_in_background: true`). Ready when `doctor.mjs` exits 0; poll it in a bounded loop, never a fixed sleep. Shell env vars beat `.env.development`, which is how this stays off `spartboard-dev`.

Real on dev: follow the project `show-me` skill (`preview_start {name:"vite-dev"}`, the user signs in with Google in the pane; you never type credentials). Port 3000 is the only one with Drive/Picker origins registered.

Can two instances run side by side? Yes: 56320 (isolated), 56300 (`vite-harness`), 3000 (`vite-dev`) use different ports and per-origin storage. Never drive a port someone else started (the user's own `pnpm dev` on 3000 is their session); start your own.

## Doctor

Run first, and again whenever anything looks off:

```bash
node .claude/skills/verify-spartboard/scripts/doctor.mjs 56320
```

It is read-only. It prints HTTP status and title, Vite mode, the **Firebase project the running server actually targets** (read from the module Vite serves), whether auth bypass is on, and the git branch/sha. Exit 0 = drive it; 1 = not a SpartBoard server on that port; 2 = it points at **prod**, stop. If `firebase` is not `dummy` on 56320, a `.env.development.local` or shell env is leaking in: stop and fix before driving.

If the server answers 200 but the page stays blank past 90 s, the Vite optimizer has stalled (known on this machine): stop the server, delete `node_modules/.vite`, prune `.claude/worktrees/` agent checkouts, and relaunch.

## Drive

Use the accessibility tree, not coordinates: `find` / `read_page` give `ref_N` handles; `javascript_tool` reads state. Screenshots are evidence, not navigation.

Stable handles in this app:

- Sidebar: button title `Open Menu`; inside it `Boards & Collections`, `Profile & Settings`, `My Classes`, `Admin Settings` (title/aria-label), `Close Menu`.
- Dock: button title `Open Tools`; tool tiles are found by their label (`Clock`, `Timer`, `Note`, …). Clicking a tile adds that widget.
- Widgets: every widget root has class `.widget`. Clock face: `[data-testid="clock-time-container"]`. Select a widget by clicking inside it; its gear is the button named `Settings (Alt+S)` and opens a `role="dialog"` drawer with `role="switch"` toggles named by label (e.g. `Show Seconds`).
- Live-tour anchors: `[data-tour="<id>"]`, registry in `config/tourAnchors.ts` (e.g. `sidebar.admin-settings`). Good stable selectors for any control.
- Feature flags in Isolated mode: set `localStorage.authBypassFeatureOverrides = '{"<GlobalFeature id>": true|false}'` then reload. This is how to see a flag-gated feature on or off.
- Harness pages (Isolated mode, DEV only): `/library-managers-dev`, `/session-views-dev` (student quiz/VA views), `/student-landing-dev`, `/gl-views-dev`, `/notebook-views-dev`, `/live-tour-views-dev`, `/assign-stepper-dev`, `/gradebook-dev`, `/library-dev`, `/media-review-dev`, `/teams-*-dev`, `/widget-grader-dev`, `/sparty-dev`. Full list: `grep "pathname === '/.*-dev'" App.tsx`.

Per-feature journeys with exact steps live in [features/](features/README.md). Read the README contract, then the feature file.

## Evidence

Every proof goes to `.claude/verify-runs/<timestamp>-<feature-id>/` (gitignored):

```bash
RUN=$(node .claude/skills/verify-spartboard/scripts/evidence.mjs new widget-settings-drawer dock-gear)
node .claude/skills/verify-spartboard/scripts/evidence.mjs note "$RUN" "before: clock text 15:36:05, Show Seconds aria-checked=true"
node .claude/skills/verify-spartboard/scripts/evidence.mjs add "$RUN" "<screenshot source path>" after.jpg
```

A browser-pane screenshot result prints `source: <path>` (a file under `~/.claude/projects/<project>/<session>/tool-results/`); pass that path to `add`. In Git Bash write it with forward slashes (`/c/Users/...`). `run.md` in the run folder records feature, entry point, branch/sha and your notes.

Proof standards:

- Drive the real user path (Dock tile, gear, menu button). Do not call React setters, write `localStorage` board state, or use a harness page to prove something the real board can show.
- Capture the action and the resulting state: a before value, the action, an after value (read with `javascript_tool` from the DOM) plus a screenshot of each state.
- Verify side effects, not just pixels. In Isolated mode nothing persists past a reload, so persistence/sync claims need Real on dev, checked by reloading the board.
- Isolated mode replaces Firebase with a dead `dummy` project, which is the only mock here. A proof of Firestore, Drive, AI or student join is never complete from Isolated mode.
- Read `read_console_messages` with `onlyErrors: true` and record new errors. Expected in Isolated mode and not findings: repeated `401`/`400` resource errors and `[AuthContext] Anonymous sign-in failed in bypass mode … api-key-not-valid` (the dummy project). Anything else is a finding. Pass `pattern` to `read_console_messages` to skip the noise.
- If a proof fails, report it with its evidence. Do not retry until it passes and report only the pass.

## Cleanup

1. `mcp__Claude_Browser__preview_stop` with the `serverId` you recorded.
2. Shell-launched server: kill the process holding the port you started, never by name:
   ```powershell
   Get-NetTCPConnection -LocalPort 56320 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
   ```
3. Reset the pane viewport: `resize_window { preset: "desktop" }`. Close tabs you opened on dev (they are live clients that autosave the board they show).
4. Leave `.claude/verify-runs/` alone; evidence outlives the server. Confirm the run folder still exists before reporting.

## Maintaining the map

When you add, rename or remove a user-facing feature, update `features/` in the same PR: add or edit the feature file and its line in `features/README.md`. When the UI changes under a journey, fix the journey's steps and handles; never weaken its proof to make it pass. If a new launch mode, port or env var appears in `.claude/launch.json` or `CLAUDE.md`, update Launch and Doctor here.
