# AI boards: build and edit boards with Claude

Grilled and settled 2026-10-27 against `dev-paul` at `f088bd3ed`. Two PRs to `dev-paul`, behind one preview flag.

Shipped 2026-10-28 as ten slices (`/mnt/project-files/ai-boards/SLICES.md`): #4770, #4771, #4772, #4773, #4774, #4775, #4776, #4781, #4782, and S10 (connector instructions, `spartboard` skill, this move). Remaining step: Paul opens `ai-boards` (TODO.md).

## Goal

A teacher asks Claude, through the SpartBoard connector, to build or change a board, and watches it happen on the board open in SpartBoard. Boards come out aligned and professional: placed on snap zones from a library of activity templates, tuned to the teacher's own screen shape, with real widget content and library items wired in. In-app Magic Board moves onto the same layout engine.

## Current-state facts that drove the decisions

- **Connector.** `functions/src/mcp/` (`mcpEndpoint.ts` verifies the token and builds `ctx = {db, uid, email, grantId}`; `tools.ts` registers tools; `toolKit.ts` `run()` wraps each). Writes go to `users/{uid}/...` through the Admin SDK. Shared helpers in `activity.ts`: `reserveWrite` (daily cap), `logActivity`, `snapshotRevision` (30-day `claude_revisions`), `REVIEW_MARK`. `list_revisions` / `restore_revision` dispatch per `itemType`. **There is no board tool today.**
- **Magic Board** ("Magic Layout"): Dock `'magic'` opens `components/layout/dock/MagicLayoutModal.tsx` → `generateDashboardLayout` (`utils/ai.ts`) → AI integration `dashboard-layout` (prompt `functions/src/aiGeneration.ts` ~927). It returns 3–6 widgets on a **12×12 grid**; `addWidgets` (`context/DashboardContext.tsx` ~6806) maps cells to a 1600×900 canvas. No snap zones or templates. UI flag `magic-layout`; the server checks `dashboard-layout` (known mismatch).
- **Live sync.** The client listens to `users/{uid}/dashboards` (`hooks/useFirestore.ts` ~459) and, when it has local work in flight, runs a per-widget merge keyed on each widget's `version` (`DashboardContext.tsx` ~2326–2538). A server write appears without a reload if it sets a fresh `updatedAt` and bumps `version` on each widget it touches. **Gap:** with `hasPendingWrites` the local board wins outright (~2337); offline saves fall back to a blind `setDoc` (`useFirestore.ts` ~408), and `saveDashboards` batch-writes blindly (~423).
- **Layout.** Snap zones are fractional rects in `config/snapLayouts.tsx` (halves, thirds, quarters, sidebars, priority splits); constants in `utils/layoutMath.ts` (PADDING 16, GAP 12). Rendering uses only `xProp/yProp/wProp/hProp` (`utils/proportionalLayout.ts`). Widgets other than drawing, embed, hotspot-image, pdf, custom-widget, miniApp and smartNotebook keep their stored `aspectRatio`, so edges line up exactly on one screen shape only: for safe-area ratio R = (vw−32)/(vh−32), `aspectRatio = (w/h)·R/(1888/1048)`. Fixed app chrome: top-left buttons to ~78px, dock band from vh−80, board arrows/help from vh−56; Need/Do/Put/Then drawers reach ~212px out.
- **Widget config** is TypeScript-only (`WidgetConfig` union in `types.ts`, ~68 `WidgetType`s); no runtime schema. Defaults in `config/widgetDefaults.ts`. `functions/` can't import root code; the precedent is a test-generated copy (`functions/src/mcp/widgetTypeList.ts`).
- **Shared boards.** The owner's client mirrors a shared or synced board to `shared_boards/{shareId}` and `linked_collections/{linkId}.boards[]` only while it's open (`DashboardContext.tsx` ~3880–3968). Rosters live in Drive, never in board docs (`utils/dashboardPII.ts`).
- **Embeds.** `convertToEmbedUrl` (`utils/urlHelpers.ts:101`) already turns Docs/Slides/Sheets/Drive links into embed URLs.

## Decisions

### Scope

- **D1.** Claude can create boards and edit any board the teacher owns: add, configure, move and remove widgets, rename, set the background (app presets only). It can never delete a board.
- **D2.** `tidy_board` snaps a hand-made board's widgets onto the best-fitting template or nearest zones without touching content.
- **D3.** Edits are small per-widget operations (add, update config, move to zone, remove, apply template, rename, set background), batched in one `edit_board` call. Each touched widget gets a bumped `version`; the board a fresh `updatedAt`. No whole-board replace.
- **D4.** Claude can't upload files. It can set links and embed URLs and place library items.

### Seeing it

- **D5.** Primary view is the board open in SpartBoard, updating live.
- **D6.** Every board tool returns a **wireframe image** drawn server-side: the board outline, each widget as a labelled box at its real rect for the target screen, and the dock/button bands and drawer clearances. Plus a text summary of gaps and overlaps.
- **D7.** Each result carries a link to the board. If the teacher's open tab is on a different board, a toast "Claude is editing ‹name› — Show" appears; the tab never switches by itself.
- **D8.** If the board was open and active in the last few minutes, the tool result says so and Claude checks with the teacher before changes students would see. Not blocked.

### Layout

- **D9.** A typed template library in code (`config/boardTemplates.ts`), roughly 10–12 templates, e.g. Launch / Do Now, Direct instruction, Work time, Stations, Discussion, Exit ticket, Presentation + notes, Centers, Review game, Independent reading, Lab, Assessment. Each template: zones, slot roles, suggested widgets, when to use it. Tests prove every template lands on snap zones and stays clear of the dock, app buttons and drawer clearances.
- **D10.** Templates are starting points; Claude may compose any layout from snap zones. Never raw pixels.
- **D11.** Boards are tuned to the teacher's screen shape: the client records the shape of the screen the teacher last used full screen on their profile, and the teacher can override per request ("this is for the projector"). None recorded → 16:9.
- **D12.** One layout engine (zones, template placement, aspect tuning, tidy), shared by the connector and in-app Magic Board. In-app Magic Board switches from the 12×12 grid to choosing a template and filling slots. The engine lives where both root and `functions/` can use it (test-generated copy, following `widgetTypeList.ts`).
- **D13.** Teacher-saved templates ("make it like my Monday board") are a follow-up, not v1.

### Content

- **D14.** Claude sets each widget's real settings. A test generates a JSON schema per widget config from `types.ts` into `functions/`; the server rejects bad settings with an error Claude can act on.
- **D15.** The server builds each widget's config the way the app does: built-in defaults → admin building defaults → the teacher's saved appearance (`APPEARANCE_CONFIG_KEYS` only) → Claude's settings. Claude can't add widgets the teacher can't access (`feature_permissions`).
- **D16.** Library items go on boards by id: quiz, video activity, flashcards, Activity Wall, mini-app, Guided Learning. Claude chains tools in one conversation (e.g. `create_quiz`, then `edit_board` adding a Quiz widget with that id, a QR/join widget and a timer).
- **D17.** Docs/Slides/Sheets/Drive links are embedded with the Embed widget, normalised through the same `convertToEmbedUrl` logic so a pasted edit link works. Claude mentions that other viewers need view access to the file.
- **D18.** Class-based widgets (Stations, Randomizer, Seating, attendance) use the board's default class; with none, the class is left unset and Claude tells the teacher to pick one. Claude never sees or writes student names.
- **D19.** New boards go at the top of the Boards list, outside any collection, unless the teacher names a collection or folder. Up to 5 boards per call; about 20 widgets per board.

### Talking to the teacher

- **D20.** `get_board_guide` serves the templates, a widget catalogue with each widget's settings, chaining examples and a checklist. Claude asks only for what it can't infer: grade and subject; activity and lesson part; new or existing board (which one); content it shouldn't invent (links, quiz topic, timer lengths, group names); target screen if different from the recorded one. It then states a short plan (template, widgets, what each holds) and builds. Small iterative tweaks after that need no confirmation.

### Safety

- **D21.** Every edit snapshots a board revision (30 days); `restore_revision` undoes it. If a board is over the 1 MB doc limit, drawing strokes are left out of the revision and the tool says so.
- **D22.** Board operations have their own daily allowance (about 500 ops), separate from the library write cap; one batched call counts as one write.
- **D23.** On shared or synced-collection boards the server also writes `shared_boards/{shareId}` and the board's entry in `linked_collections/{linkId}.boards[]`, scrubbed the same way the client scrubs, so co-teachers see changes with the owner's tab closed.
- **D24.** Boards Claude creates or edits carry a "Made with Claude" / "Edited by Claude" badge in the Boards list until opened, and every change goes in the Claude activity log.
- **D25.** The client's sync gap is fixed: with pending writes, and on the offline save path, the tab merges per widget instead of keeping its whole board.

### Release

- **D26.** One preview flag, `ai-boards` (`GlobalFeature`, admin, `stage: 'preview'`, `afterLaunch: 'retire'`), gates the connector board tools (hidden via `hiddenToolsFor`) and the new Magic Board engine. Teachers keep the old Magic Board until Paul sets it to Public. Changelog entry when it opens.

## PRs

1. **Server.** Shared layout engine and templates (with placement tests), generated config schemas, connector tools (`list_boards`, `get_board`, `create_board`, `edit_board`, `tidy_board`, `get_board_guide`), revisions and restore, shared-board sync, wireframe images, own write allowance, activity log. Works alone; boards tune to 16:9 until PR 2 records screen shapes.
2. **App.** Recording the screen shape, the "Claude is editing" toast, the badge, Magic Board on the shared engine, and the sync-gap fix (D25). Update the `spartboard` skill and connector instructions to cover boards.
