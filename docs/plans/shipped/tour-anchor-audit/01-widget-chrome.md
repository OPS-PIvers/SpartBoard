# Tour anchor audit: widget window chrome + help

Scope: `components/common/DraggableWindow.tsx`, `components/help/*`. Proposed ids follow `config/tourAnchors.ts` naming.

| File:line                       | Element                                    | Opened from          | Proposed id                              | Flags                         |
| ------------------------------- | ------------------------------------------ | -------------------- | ---------------------------------------- | ----------------------------- |
| DraggableWindow.tsx:2401        | Cancel (close confirm)                     | Close → confirm      | `widget.close-confirm.cancel`            | perWidget, panel              |
| DraggableWindow.tsx:2410        | Close (close confirm)                      | Close → confirm      | `widget.close-confirm.confirm`           | perWidget, panel, destructive |
| DraggableWindow.tsx:2546        | Pen color swatches (PenColorSwatches)      | Annotate toolbar     | `widget.annotate-toolbar.color`          | perWidget, panel              |
| DraggableWindow.tsx:2553        | Eraser                                     | Annotate toolbar     | `widget.annotate-toolbar.eraser`         | perWidget, panel              |
| DraggableWindow.tsx:2564        | Undo                                       | Annotate toolbar     | `widget.annotate-toolbar.undo`           | perWidget, panel              |
| DraggableWindow.tsx:2583        | Clear all                                  | Annotate toolbar     | `widget.annotate-toolbar.clear-all`      | perWidget, panel, destructive |
| DraggableWindow.tsx:2601        | Done                                       | Annotate toolbar     | `widget.annotate-toolbar.done`           | perWidget, panel              |
| DraggableWindow.tsx:2913        | Screenshot                                 | Maximized kebab menu | `widget.max-menu.screenshot`             | perWidget, panel              |
| DraggableWindow.tsx:2927        | Annotate                                   | Maximized kebab menu | `widget.max-menu.annotate`               | perWidget, panel              |
| DraggableWindow.tsx:2940        | Record screen / stop                       | Maximized kebab menu | `widget.max-menu.record`                 | perWidget, panel              |
| DraggableWindow.tsx:2892        | Settings (reuses `widget.settings-opener`) | Maximized kebab menu | — (disambiguate only if needed)          |                               |
| DraggableWindow.tsx:3046        | Title rename input                         | Title click          | `widget.title-input`                     | perWidget                     |
| DraggableWindow.tsx:3152        | Screenshot                                 | Toolbar              | `widget.screenshot`                      | perWidget                     |
| DraggableWindow.tsx:3225        | Ungroup                                    | Toolbar              | `widget.ungroup`                         | perWidget                     |
| DraggableWindow.tsx:3237        | Group with…                                | Toolbar              | `widget.group-with`                      | perWidget                     |
| DraggableWindow.tsx:3291        | Snap zone swatches                         | Snap popover         | `widget.snap-layout.option`              | perWidget, panel              |
| DraggableWindow.tsx:3333        | Custom-size drag grid                      | Snap popover         | `widget.snap-layout.custom-grid`         | perWidget, panel              |
| DraggableWindow.tsx:3427        | Maximize / restore                         | Toolbar              | `widget.maximize`                        | perWidget                     |
| DraggableWindow.tsx:3445        | Minimize                                   | Toolbar              | `widget.minimize`                        | perWidget                     |
| WidgetHelpButton.tsx:76         | Show me live                               | Help `?` menu        | `settings.help-menu.show-live`           | perWidget, panel              |
| WidgetHelpButton.tsx:90         | Open guides                                | Help `?` menu        | `settings.help-menu.open-guides`         | perWidget, panel              |
| HelpCenterModal.tsx:94          | Search                                     | Help Center          | `help-center.search`                     | panel                         |
| HelpCenterModal.tsx:105         | Close                                      | Help Center          | `help-center.close`                      | panel                         |
| HelpCenterModal.tsx:138         | Shortcuts / Guides tabs                    | Help Center          | `help-center.tab`                        | panel                         |
| HelpCenterModal.tsx:166         | Mobile tab select                          | Help Center          | `help-center.tab-select`                 | panel                         |
| HelpGuidesTab.tsx:191           | Category buttons                           | Guides tab           | `help-center.guides.category`            | panel                         |
| HelpGuidesTab.tsx:211           | Category select (mobile)                   | Guides tab           | `help-center.guides.category-select`     | panel                         |
| HelpGuidesTab.tsx:228           | Kind filter chips                          | Guides tab           | `help-center.guides.kind-filter`         | panel                         |
| HelpGuidesTab.tsx:244           | Clear widget filter                        | Guides tab           | `help-center.guides.clear-widget-filter` | panel                         |
| HelpGuidesTab.tsx:274           | Guide card                                 | Guides tab           | `help-center.guides.item`                | panel                         |
| HelpResourceViewer.tsx:116      | Show me live                               | Resource viewer      | `help-center.viewer.show-live`           | panel                         |
| HelpResourceViewer.tsx:220      | Back                                       | Resource viewer      | `help-center.viewer.back`                | panel                         |
| HelpResourceViewer.tsx:230, 283 | Fullscreen toggle                          | Resource viewer      | `help-center.viewer.fullscreen`          | panel                         |

Follow-up: individual swatches in `components/common/PenColorSwatches.tsx` not inspected.
