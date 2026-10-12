# Admin Settings

An admin opens Admin Settings from the sidebar to manage widget access, preview flags, AI models, content libraries, organization data and PLC defaults, organised as tabs under ACCESS, CONTENT, ORGANIZATION, TOOLS and PLC headings.

## Sub-features

- `admin-open` opens the Admin Settings dialog.
- `admin-tabs` switches between tabs (`Widgets`, `Features`, `Previews`, `AI`, …).
- `admin-widgets-filter` filters the Widgets tab by Enabled, Availability and Building.
- `admin-close` closes the dialog with Escape.

## How to get to it (user POV)

- Open the sidebar (`Open Menu`), then the `Admin Settings` button in its top row (`data-tour="sidebar.admin-settings"`).

## Driving it with the browser pane

Preconditions:

- Baseline from `README.md` (mock admin), fresh load of `/`.

- **Open.** `find "Open Menu"`, click; `find "Admin Settings"`, click. Within 4 s a `role="dialog"` titled `Admin Settings` opens on the `Widgets` tab with `FILTER` controls (`Enabled`, `Availability`, `Building`).
- **Tabs.** `find "Previews"` (a `role="tab"`), click. The tab panel changes to the preview-flag list. Repeat for any tab the change touches.
- **Close.** Press Escape (`computer key "Escape"`). No `role="dialog"` remains.
- **Proof.** `evidence.mjs new admin-settings sidebar-button`; screenshot the opened tab and `note` the tab names read from `[role=tab]`.

## Gotchas

- Isolated mode has no Firestore, so every list renders from defaults and nothing you save persists. Prove the UI here; prove a saved setting on Real on dev, and never change a setting on dev you did not create without asking.
- Agents never flip a feature to Public on prod; on dev, set it back after the run.
- An Admin Settings tab that owns its own scroll must keep bottom padding (see the scroll-panel rule in `CLAUDE.md`); scroll to the end and screenshot when a change touches a tab's layout.
- Not yet proven end to end; `admin-open` and the tab names were confirmed live on 2026-10-12.
