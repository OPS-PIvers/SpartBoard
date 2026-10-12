# SpartBoard verification map

This directory is the maintained source for verifying SpartBoard's user-facing behaviour. Read this index before driving the app, then use the matching feature file as the recipe. Launch, Doctor, Evidence and Cleanup are in `../SKILL.md`.

## Baseline preconditions

- Isolated mode: `vite-verify` running at `http://localhost:56320`, started by this run (`preview_start {name:"vite-verify"}`).
- `node .claude/skills/verify-spartboard/scripts/doctor.mjs 56320` exits 0 and prints `firebase dummy` and `auth bypass on`.
- Browser pane tab resized to 1280x800 and the ready check (`[title="Open Menu"]` present) has passed.
- The signed-in user is the mock admin `mock-user-id`, so admin-only and preview-flag features are visible.
- A fresh page load starts with an empty board named by the first-run flow ("Welcome! Board created" toasts) and the Dock open or collapsed to `Open Tools`.
- Real-on-dev journeys additionally need `vite-dev` on port 3000 with the user signed in by hand; each such journey says so in its Preconditions.

## Driving conventions

- Start every recipe from a fresh load of `/` unless its preconditions say otherwise. In Isolated mode a reload is the reset: board state does not survive it.
- Prefer accessible names (`find`, `read_page`), `title`/`aria-label`, `data-testid` and `data-tour` handles over coordinates.
- Treat quoted names as literal; tile labels and switch names are case-sensitive in `find` results but match in any case.
- Read state with `javascript_tool` (DOM text, `aria-checked`); click with `computer left_click` on a `ref`.
- On Real on dev, delete anything the run created (widgets, boards) before cleanup. Never touch boards or materials the run did not create: dev data is shared by Paul and Bailey.

## Proof and skip reporting

- UI proof: a before screenshot, the action, an after screenshot, and the before/after DOM values written to `run.md` with `evidence.mjs note`.
- Mutation proof: a second, read-only view of the changed value (reopen the drawer, reload on dev, reopen the dialog).
- Every artifact lives under a run folder created by `evidence.mjs new <feature-id> <entry-point>`, so each is tagged with the feature and entry point.
- An entry point you could not reach is reported as unverified with the attempted step and the unmet precondition. Never report it as verified through a different entry point.
- Persistence, Firestore, Drive, AI and student-join claims are never verified from Isolated mode.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behaviour, then exactly four H2 sections in this order:

1. `Sub-features`: short IDs, one line each.
2. `How to get to it (user POV)`: every entry point a teacher has.
3. `Driving it with the browser pane`: starts with `Preconditions:`, then labeled bullets pairing each user action with the exact tool call and its observable result, ending in a **Proof** bullet.
4. `Gotchas`: traps that waste or invalidate a run.

Keep implementation details out. Name only user paths, stable handles, required state, tool calls and observable proof.

## Features

- [Add a widget from the Dock](./dock-add-widget.md) covers opening the Dock, adding a widget, the widget toolbar and closing it.
- [Widget settings drawer](./widget-settings-drawer.md) covers opening a widget's settings and changing a setting that visibly changes the widget. **Proven 2026-10-12.**
- [Sidebar menu](./sidebar-menu.md) covers opening the sidebar and reaching its sections.
- [Admin Settings](./admin-settings.md) covers opening Admin Settings and switching tabs.
- [Dev harness pages](./dev-harness-pages.md) covers the `/*-dev` fixture pages used for library, student and editor views.
