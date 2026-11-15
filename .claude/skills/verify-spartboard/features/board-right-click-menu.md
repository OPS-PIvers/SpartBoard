# Board right-click menu

Right-clicking the empty board background, or holding a finger on it for about 0.7 seconds, opens a menu with Paste, Undo, Redo, Tidy up, Minimize all or Restore all, Change background, Draw on board and Copy board link. It sits behind the "Board right-click menu" preview flag.

## Sub-features

- `paste`: Paste runs the same handling as Ctrl+V.
- `tidy`: Tidy up snaps widgets into a clean layout; one Undo restores it.
- `long-press`: a touch hold on empty board opens the menu, with a ring while holding.
- `copy-link`: Copy board link puts a copy-mode share link on the clipboard (needs Real on dev).

## How to get to it (user POV)

- Right-click empty board background.
- On a touch screen, press and hold empty board background until the ring fills.

## Driving it with the browser pane

Preconditions: baseline Isolated mode, and `localStorage.authBypassFeatureOverrides = '{"board-context-menu":true}'` set before a reload.

- **Open:** dismiss the toasts, add two widgets from the Dock, then right-click an empty spot well away from widgets and the Dock. Result: `[role="menu"][aria-label="Board options"]` exists.
- **Not on widgets:** right-click inside a `.widget`. Result: no `Board options` menu.
- **Tidy up:** click menuitem `Tidy up`. Result: widget rects change and no longer overlap.
- **Paste:** grant clipboard-read, write `https://www.example.com/page` to the clipboard, open the menu, click `Paste`. Result: the "How should this link be displayed?" picker opens, as with Ctrl+V.
- **Long press:** in a touch context, dispatch touchStart on empty board, wait 900 ms, touchEnd. Result: the menu is open after the lift. A 250 ms tap or a 40 px drift opens nothing.
- **Proof:** screenshots of the open menu, the tidied board and the paste picker, with the DOM checks noted in `run.md`.

## Gotchas

- Toasts in the top right cover the board on first load; right-clicking a toast is not the board.
- The Dock tray covers the lower board when open; pick a spot above it.
- Copy board link writes a share document, so it fails in Isolated mode by design.
