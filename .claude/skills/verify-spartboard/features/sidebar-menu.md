# Sidebar menu

A teacher opens the menu at the top left of the board to reach their boards and collections, backgrounds, gradebook, classes, teams, profile and settings, Quick Access, Google Drive, What's New, and sign-out; admins also see Admin Settings.

## Sub-features

- `sidebar-open` opens and closes the sidebar.
- `sidebar-boards` opens Boards & Collections.
- `sidebar-profile` opens Profile & Settings.
- `sidebar-board-switch` moves between boards with the bottom-left board switcher.

## How to get to it (user POV)

- Click the menu button (title `Open Menu`) at the top left.
- Board switcher at the bottom left: `Previous board`, `Select board`, `Next board`.

## Driving it with the browser pane

Preconditions:

- Baseline from `README.md`, fresh load of `/`.

- **Open.** `find "Open Menu"`, `left_click`. The sidebar shows `Boards & Collections`, `Backgrounds`, `Gradebook`, `My Classes`, `My Teams`, `Profile & Settings`, `Quick Access`, `Google Drive`, `What's New`, `Sign Out`, and the top row gains `Admin Settings`, `Shorten URL`, `Enter Fullscreen`, `Annotate Screen`, `Clear All Windows`.
- **Boards.** `find "Boards & Collections"`, click. A boards panel opens listing the current board. Screenshot.
- **Profile.** `find "Profile & Settings"`, click. The profile and settings panel opens with its section list. Screenshot.
- **Close.** `find "Close Menu"`, click. The sidebar closes and `Open Menu` is visible again.
- **Proof.** `evidence.mjs new sidebar-menu open-menu`; screenshot each panel and `note` the visible section names.

## Gotchas

- Never click `Sign Out` in Isolated mode or on dev; on dev it ends the user's real session on that port.
- `Google Drive`, `My Classes` and `Gradebook` need a backend for real content; in Isolated mode they open but show empty or error states. Use Real on dev to prove their content.
- Not yet proven end to end; handles were read from the live accessibility tree on 2026-10-12.
