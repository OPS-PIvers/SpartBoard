# Add a widget from the Dock

A teacher opens the Dock at the bottom of the board, clicks a tool tile, and the widget appears on the board as a window they can select, move, duplicate, maximize, minimize and close.

## Sub-features

- `dock-open` opens the Dock from its collapsed `Open Tools` button.
- `dock-add` adds a widget by clicking its tile.
- `widget-select` selects a widget and shows its toolbar.
- `widget-duplicate` makes a second copy from the toolbar.
- `widget-close` removes the widget from the board.

## How to get to it (user POV)

- Click `Open Tools` at the bottom centre of the board, then a tile (`Clock`, `Timer`, `Note`, …).
- Drag a tile from the open Dock onto the board.
- `More Widgets` at the end of the Dock opens the full widget library for tools not pinned to the Dock.

## Driving it with the browser pane

Preconditions:

- Baseline from `README.md`, fresh load of `/`, no widgets on the board (`document.querySelectorAll('.widget').length === 0`).

- **Open Dock.** If tiles are not visible, `find "Open Tools"` and `left_click` the ref. Tile labels (`CLOCK`, `TIMER`, `NOTE`) become visible along the bottom edge.
- **Add widget.** `find "Clock"` and `left_click` the ref. `javascript_tool`: `document.querySelectorAll('.widget').length` is `1` and `document.querySelector('[data-testid="clock-time-container"]').textContent` matches `HH:MM:SS`.
- **Select widget.** Click empty board at the far left to close the Dock, then `left_click` inside the widget. `find "Settings (Alt+S)"` returns a button; the toolbar also offers `Pin Position (Alt+P)`, `Duplicate`, `Maximize (Alt+M)`, `Minimize (Esc)`, `Close`.
- **Duplicate.** `find "Duplicate"`, click it. `.widget` count is `2`.
- **Close.** Select one widget, `find "Close"` (the widget toolbar's, not `Close Menu`), click it. `.widget` count drops by one.
- **Proof.** `evidence.mjs new dock-add-widget open-tools`; screenshot after each count change and `note` the counts.

## Gotchas

- At the pane's default 800x600 the Dock tiles sit outside the viewport and clicks fail with "outside the viewport". Resize to 1280x800 first.
- Dock tiles are `generic` elements in the accessibility tree, not buttons; `find` by label still returns a clickable ref.
- The widget toolbar only renders while a widget is selected. Click inside the widget again if `Settings (Alt+S)` is not found.
- Two "Welcome! Board created" toasts cover the top right for several seconds after load; they do not block the Dock but do cover drawer tabs (see the settings drawer file).
- Widgets do not survive a reload in Isolated mode. That is expected, not a bug.
