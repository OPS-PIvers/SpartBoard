# Tour anchor audit: widget settings drawers, A–G

No A–G widget carries `data-tour` on its own controls. Rows marked "schema" are rendered from `settings.schema.ts` and should be covered by one generic renderer anchor (see 05); only custom controls and widget-body buttons need individual tags.

| Widget | File:line | Control | Tab | Proposed id |
|---|---|---|---|---|
| ActivityWall | editor/LayoutPicker.tsx:17 | Layout picker | Editor | `widget-settings.activity-wall.layout` |
| ActivityWall | editor/SubmissionTypesToggles.tsx | Submission types | Editor | `widget-settings.activity-wall.submission-types` |
| ActivityWall | editor/LimitsAndEditing.tsx | Max posts per student | Editor | `widget-settings.activity-wall.max-posts` |
| ActivityWall | editor/LimitsAndEditing.tsx:100 / 105 | Students may edit / delete posts | Editor | `widget-settings.activity-wall.allow-edit` / `.allow-delete` |
| ActivityWall | editor/AppearancePicker.tsx:32 | Background appearance | Editor | `widget-settings.activity-wall.appearance` |
| ActivityWall | editor/ModerationAndAccess.tsx:34–51 | Moderation, guests, show names, students see posts | Editor | `widget-settings.activity-wall.<moderation\|guests\|show-names\|student-view>` |
| ActivityWall | editor/EngagementSettings.tsx:24–41 | Likes, comments, replies | Editor | `widget-settings.activity-wall.<likes\|comments\|replies>` |
| ActivityWall | Widget.tsx:76 | Edit wall | Body | `widget.activity-wall.edit` |
| ActivityWall | Widget.tsx | Library / moderation / share | Body | `widget.activity-wall.library` / `.moderation` / `.share` |
| BlendingBoard, CarRiderPro, Catalyst, First5 | settings.schema.ts | Managed notice (no control) | Settings | — |
| BloomsTaxonomy | settingsFields.tsx:55 | Category checkboxes | Settings | `widget-settings.blooms.category` |
| Breathing | settings.schema.ts:12–40 | Pattern, visual, color | Settings/Style | schema |
| Breathing | BreathingWidget.tsx:82 | Start / pause | Body | `widget.breathing.start-pause` |
| Breathing | BreathingWidget.tsx:114 | Reset | Body | `widget.breathing.reset` |
| Calendar | settings.schema.ts:20 | Local events | Settings | schema |
| Calendar | settingsFields.tsx:113 | Instructions help | Settings | `widget-settings.calendar.instructions` |
| Calendar | settingsFields.tsx:136 | Connect Google | Settings | `widget-settings.calendar.connect-google` |
| Calendar | settingsFields.tsx:145 | Add calendar | Settings | `widget-settings.calendar.add-calendar` |
| Calendar | settingsFields.tsx:61 | Building sync toggle | Settings | `widget-settings.calendar.building-sync` |
| Calendar | settings.schema.ts:76 | Days visible | Style | schema |
| Checklist | settings.schema.ts:32–85 | List source, tasks, roster source/names, pool group | Settings | schema |
| Checklist | settingsFields.tsx:109 / 134 / 141 | Paste tasks / import routine / import text | Settings | `widget-settings.checklist.paste` / `.import-routine` / `.import-text` |
| Classes | — | No settings registered | — | — |
| Clock | settings.schema.ts:61–90 | 24-hour, seconds, style, glow, theme color, date color | Settings/Style | schema |
| ConceptWeb | settings.schema.ts:17–32 | Node width / height | Settings | schema |
| ConceptWeb | settingsFields.tsx:47 | Clear all (destructive) | Settings | `widget-settings.concept-web.clear-all` |
| Countdown | settings.schema.ts:29–83 | Title, start/event date, weekends, count today, view mode, color | Settings/Style | schema |
| CustomWidget | settingsFields.tsx:66 | Dynamic admin-defined fields | Settings | `widget-settings.custom-widget.field` |
| Dice | settings.schema.ts:9–24 | Count, dice color, dot color | Settings | schema |
| Drawing | settings.schema.ts:43–68 | Brush thickness, background, shape fill | Settings | schema |
| Embed | settings.schema.tsx:14–39 | Content mode, refresh interval | Settings | schema |
| Expectations | settingsFields.tsx:46 | Sync with Sound widget | Settings | `widget-settings.expectations.sound-sync` |
| Flashcards | settings.schema.ts:10–23 | Present show-first, shuffle | Settings | schema |
| GraphicOrganizer | settingsFields.tsx:37 | Template selector | Settings | `widget-settings.graphic-organizer.template` |
| GuidedLearning | settingsFields.tsx:6 | Go to library | Settings | `widget-settings.guided-learning.library` |

Follow-up: widget-body controls beyond ActivityWall and Breathing were not swept (e.g. Drawing toolbar, Flashcards, Checklist items).
