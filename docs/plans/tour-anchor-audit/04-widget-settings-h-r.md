# Tour anchor audit: widget settings drawers, H–R

None tagged today except Projects' body anchors. Schema-only fields should come from a generic renderer anchor (see 05). Widget-body controls were not covered. Ids use kebab-case per `config/tourAnchors.ts`.

| Widget           | File:line                    | Control                                                                 | Proposed id                                                        |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| HotspotImage     | settingsFields.tsx:180       | Upload / replace image                                                  | `widget-settings.hotspot-image.upload`                             |
| HotspotImage     | :220                         | Load from library                                                       | `widget-settings.hotspot-image.load-library`                       |
| HotspotImage     | :227                         | Delete from library (destructive)                                       | `widget-settings.hotspot-image.delete-library`                     |
| HotspotImage     | :242                         | Save to library                                                         | `widget-settings.hotspot-image.save-library`                       |
| HotspotImage     | :300                         | Delete hotspot (destructive)                                            | `widget-settings.hotspot-image.delete-hotspot`                     |
| HotspotImage     | :311 / 327                   | Pin title / detail text                                                 | `widget-settings.hotspot-image.pin-title` / `.detail-text`         |
| HotspotImage     | :349                         | Icon choice                                                             | `widget-settings.hotspot-image.icon`                               |
| MathTools        | settings.schema.ts:16        | DPI calibration                                                         | schema                                                             |
| MathToolInstance | settings.schema.ts:21–100    | Tool type, number line mode/min/max, ruler units, px per inch, rotation | schema                                                             |
| MiniApp          | settingsFields.tsx:8         | Managed notice (no control)                                             | —                                                                  |
| PdfWidget        | settingsFields.tsx:30        | Switch document                                                         | `widget-settings.pdf.switch-document`                              |
| Poll             | settingsFields.tsx:386       | Import from roster                                                      | `widget-settings.poll.import-roster`                               |
| Poll             | :445                         | AI draft                                                                | `widget-settings.poll.ai-draft`                                    |
| Poll             | :488                         | Delete question (destructive)                                           | `widget-settings.poll.delete-question`                             |
| Poll             | :505                         | Add question / question chips                                           | `widget-settings.poll.add-question` / `.select-question`           |
| Poll             | :558                         | Question text                                                           | `widget-settings.poll.question-text`                               |
| Poll             | :576 / 586                   | Add / delete option                                                     | `widget-settings.poll.add-option` / `.delete-option`               |
| Poll             | :627                         | Reset results (destructive) / export CSV                                | `widget-settings.poll.reset` / `.export-csv`                       |
| Poll             | :675                         | Copy link                                                               | `widget-settings.poll.copy-link`                                   |
| Poll             | :697 / 731                   | Stop / start voting                                                     | `widget-settings.poll.stop-voting` / `.start-voting`               |
| Poll             | :713                         | Resume / start fresh                                                    | `widget-settings.poll.resume` / `.start-fresh`                     |
| Projects         | settingsFields.tsx:21        | Go to library                                                           | `widget-settings.projects.library`                                 |
| QR               | settingsFields.tsx:21        | Destination URL                                                         | `widget-settings.qr.url`                                           |
| QR               | :59                          | Sync with Text widget                                                   | `widget-settings.qr.sync-text`                                     |
| Quiz             | settingsFields.tsx:21        | Widget label                                                            | `widget-settings.quiz.label`                                       |
| Quiz             | :34                          | Assignment archive                                                      | `widget-settings.quiz.archive`                                     |
| Quiz             | :44                          | Manager view                                                            | `widget-settings.quiz.manager`                                     |
| RecessGear       | settingsFields.tsx:26        | Linked Weather widget                                                   | `widget-settings.recess-gear.linked-weather`                       |
| RecessGear       | settings.schema.ts:36        | Use feels-like                                                          | schema                                                             |
| RevealGrid       | settingsFields.tsx:284 / 297 | Save to Drive / share URL                                               | `widget-settings.reveal-grid.save-drive` / `.share`                |
| RevealGrid       | :313                         | Load existing set                                                       | `widget-settings.reveal-grid.load-set`                             |
| RevealGrid       | :336 / 340 / 351             | Paste from sheet / upload CSV / generator                               | `widget-settings.reveal-grid.paste` / `.upload-csv` / `.generator` |
| RevealGrid       | :374                         | Add pasted cards                                                        | `widget-settings.reveal-grid.add-pasted`                           |
| RevealGrid       | :401 / 418                   | Expand / delete card                                                    | `widget-settings.reveal-grid.toggle-card` / `.delete-card`         |
| RevealGrid       | :433 / 455                   | Front / back content                                                    | `widget-settings.reveal-grid.front` / `.back`                      |
| RevealGrid       | :476                         | Add card                                                                | `widget-settings.reveal-grid.add-card`                             |
| Random           | settingsFields.tsx:68        | Group / home / expert count sliders                                     | `widget-settings.random.group-count`                               |
| Random           | :133 / 141                   | Import class / clear names (destructive)                                | `widget-settings.random.import-class` / `.clear-names`             |
| Random           | :237 / 289                   | Send to Stations / Projects                                             | `widget-settings.random.send-stations` / `.send-projects`          |
