# Widget settings drawer

A teacher selects a widget and opens its settings with the gear; a drawer slides in from the right with a search box, tabs and grouped controls, and changing a control updates the widget on the board immediately.

## Sub-features

- `drawer-open` opens the drawer from the selected widget's gear.
- `drawer-toggle` flips a switch and the widget re-renders.
- `drawer-reopen` closes and reopens the drawer with the changed value kept.
- `drawer-shortcut` opens the drawer with Alt+S on a selected widget.

## How to get to it (user POV)

- Select a widget, click the gear button `Settings (Alt+S)` in its toolbar.
- Select a widget and press Alt+S.

## Driving it with the browser pane

Preconditions:

- Baseline from `README.md`, one Clock widget added and selected via `dock-add-widget.md` (Add widget, Select widget).

- **Read before.** `javascript_tool`: `document.querySelector('[data-testid="clock-time-container"]').textContent` returns `HH:MM:SS` (e.g. `15:36:05`). Screenshot.
- **Open drawer.** `find "Settings (Alt+S)"`, `left_click` the ref. A `role="dialog"` panel titled `Clock` appears on the right with a `Find a setting` box and a `Behavior` group.
- **Toggle.** `find "Show Seconds"` returns a `switch` ref; read its `aria-checked` (`true`), then `left_click` it.
- **Read after.** Within 1 s the clock text is `HH:MM` (e.g. `15:36`) and a date line (`MONDAY, OCT 12`) appears under it; the switch's `aria-checked` is `false`. Screenshot.
- **Reopen.** Press Escape or click the board to close the drawer, reselect the widget, open the gear again. `Show Seconds` is still off.
- **Shortcut entry.** With the widget selected and focus on the board, press `alt+s` (`computer key`). The same drawer opens.
- **Proof.** `evidence.mjs new widget-settings-drawer dock-gear`; add the before and after screenshots and `note` the before/after clock text and `aria-checked` values.

## Gotchas

- The "Welcome! Board created" toasts overlap the drawer's tab bar for several seconds after load. Dismiss them (`find "Dismiss"`) before clicking a drawer tab.
- The clock text changes every second; compare its shape (`HH:MM:SS` vs `HH:MM`), not its value.
- Alt+S only works while the widget is selected and focus is not in a text field.
- Proven 2026-10-12 in Isolated mode for `drawer-open` and `drawer-toggle` (gear entry). `drawer-reopen` and `drawer-shortcut` not yet proven.
