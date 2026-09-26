# Live-tour anchor audit (2026-09-26)

Audit of unanchored interactive elements, with the ids proposed at the time. Most are now tagged on this branch; the files below are the original findings.

1. [Widget window chrome and help](01-widget-chrome.md)
2. [Sidebar, Profile & Settings, settings drawer](02-user-settings.md)
3. [Widget settings A–G](03-widget-settings-a-g.md)
4. [Widget settings H–R](04-widget-settings-h-r.md)
5. [Widget settings S–Z](05-widget-settings-s-z.md)

## Status

Done:

- Profile & Settings, My Classes, PLCs, roster/ClassLink/Schoology dialogs.
- Widget body controls for the main widgets, Quiz, Scoreboard, Activity Wall editor, shared library shell and cards, pen colours.
- Schema settings fields through one generic `settings.field` anchor (`settings.field:<type>#<key>`, list rows `#<list>.<n>.<field>`), plus custom settings controls.
- Widget window chrome, Help Center, dialog close (`modal.close`), library tabs and split-menu items.
- Repeated rows use `perField` anchors keyed `row-<n>` (1-based position).

Still open:

- `SidebarBoardsActive.tsx` is dead code; delete it rather than anchor it.
