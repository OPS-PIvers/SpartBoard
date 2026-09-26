# Live-tour anchor audit (2026-09-26)

Unanchored interactive elements, with proposed `config/tourAnchors.ts` ids. Nothing here is tagged yet.

1. [Widget window chrome and help](01-widget-chrome.md)
2. [Sidebar, Profile & Settings, settings drawer](02-user-settings.md)
3. [Widget settings A–G](03-widget-settings-a-g.md)
4. [Widget settings H–R](04-widget-settings-h-r.md)
5. [Widget settings S–Z](05-widget-settings-s-z.md)

Recommendations:
- Add one generic anchor in the schema settings renderer (widget type + field key) instead of tagging each schema field.
- Tag Profile & Settings first; it has no anchors at all.
- Delete `components/layout/sidebar/SidebarBoardsActive.tsx` (dead code).

Open follow-ups: widget-body controls for most widgets; roster editor, ClassLink import and Link Schoology dialogs; `PenColorSwatches`; line numbers marked `~`.
