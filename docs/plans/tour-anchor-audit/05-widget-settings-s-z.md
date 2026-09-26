# Tour anchor audit: widget settings drawers, S–Z

None of these controls carry `data-tour` today. Schema-rendered fields (`settings.schema.ts`) should get one generic anchor from the schema renderer keyed by widget type + field key, rather than hand-tagging; only custom `settingsFields.tsx` controls need individual tags. Widget-body buttons were not covered by this pass.

## Custom settingsFields.tsx controls
| Widget | File:line | Control | Proposed id |
|---|---|---|---|
| Schedule | settingsFields.tsx:205 | Import today's events | `widget-settings.schedule.import-calendar` |
| Schedule | :471 | Add schedule | `widget-settings.schedule.add-schedule` |
| Schedule | :486 | Schedule tabs | `widget-settings.schedule.select-schedule` |
| Schedule | :503 | Schedule name | `widget-settings.schedule.schedule-name` |
| Schedule | :514 | New schedule | `widget-settings.schedule.new-schedule` |
| Schedule | :524 | Delete schedule (destructive) | `widget-settings.schedule.delete-schedule` |
| Schedule | :535 | Day buttons | `widget-settings.schedule.select-day` |
| Schedule | :568 | Sort events | `widget-settings.schedule.sort-events` |
| Schedule | :633 | Add event | `widget-settings.schedule.add-event` |
| Schedule | :641 | Add today-only event | `widget-settings.schedule.add-event-today` |
| Schedule | :660 | Building schedules toggle | `widget-settings.schedule.building-schedules` |
| Schedule | :703 | Copy building schedule | `widget-settings.schedule.copy-building-schedule` |
| Scoreboard | settingsFields.tsx:327 / 341 | Layout cards / rows | `widget-settings.scoreboard.layout` |
| Scoreboard | :366 | Import random groups | `widget-settings.scoreboard.import-random-groups` |
| Scoreboard | :392 | Use group names | `widget-settings.scoreboard.use-group-names` |
| Scoreboard | :398 | Import class groups | `widget-settings.scoreboard.import-class-groups` |
| Scoreboard | ~410+ | Resync members | `widget-settings.scoreboard.resync-members` |
| Scoreboard | ~425+ | Add team | `widget-settings.scoreboard.add-team` |
| Scoreboard | ~450+ | Team name | `widget-settings.scoreboard.team-name` |
| Scoreboard | ~460+ | Delete team (destructive) | `widget-settings.scoreboard.delete-team` |
| Scoreboard | ~475+ | Reset all scores (destructive) | `widget-settings.scoreboard.reset-scores` |
| SeatingChart | settingsFields.tsx:52 | Clear assignments (destructive) | `widget-settings.seating-chart.clear-assignments` |
| SeatingChart | :60 | Clear furniture (destructive) | `widget-settings.seating-chart.clear-furniture` |
| Soundboard | settingsFields.tsx:65 | Sound toggle | `widget-settings.soundboard.toggle-sound` |
| SpecialistSchedule | settingsFields.tsx:237 | Cycle day | `widget-settings.specialist-schedule.select-cycle-day` |
| SpecialistSchedule | :272 | Add item | `widget-settings.specialist-schedule.add-item` |
| SpecialistSchedule | :81 | Activity option | `widget-settings.specialist-schedule.select-activity` |
| SpecialistSchedule | :107 | Activity text | `widget-settings.specialist-schedule.activity-input` |
| SpecialistSchedule | :125 / 140 | Start / end time | `widget-settings.specialist-schedule.start-time` / `.end-time` |
| SpecialistSchedule | :151 / 68 | Save / cancel | `widget-settings.specialist-schedule.save-item` / `.cancel-edit` |
| SpecialistSchedule | :295 / 301 | Edit / delete item | `widget-settings.specialist-schedule.edit-item` / `.delete-item` |
| StarterPack | settingsFields.tsx:101 | Pack name | `widget-settings.starter-pack.pack-name` |
| StarterPack | :112 | Save personal pack | `widget-settings.starter-pack.save-personal` |
| StarterPack | :125 | Save global pack (admin) | `widget-settings.starter-pack.save-global` |
| Stations | settingsFields.tsx:103 | Add station | `widget-settings.stations.add-station` |
| Stations | :109 / 117 | Edit / delete station | `widget-settings.stations.edit-station` / `.delete-station` |
| Stations | :149 | Move up / down | `widget-settings.stations.move-up` / `.move-down` |
| Stations | :158 | Load preset | `widget-settings.stations.load-preset` |
| Stations | ~87+ | Import class groups | `widget-settings.stations.import-class-groups` |
| Stations | ~127+ | Resync members | `widget-settings.stations.resync-members` |
| Stations | ~198+ | Lock group | `widget-settings.stations.toggle-lock-group` |
| SyntaxFramer | settingsFields.tsx:44 | Content | `widget-settings.syntax-framer.content` |
| TimeTool | settingsFields.tsx:56 | Timer / stopwatch mode | `widget-settings.time-tool.mode` |
| TimeTool | :135 | Voice level | `widget-settings.time-tool.voice-level` |
| TimeTool | :181 | Traffic color | `widget-settings.time-tool.traffic-color` |
| Weather | settingsFields.tsx:38 | Show feels-like | `widget-settings.weather.show-feels-like` |
| Weather | ~110+ / ~148+ | Sync station / city | `widget-settings.weather.sync-station` / `.sync-city` |

## Schema-only fields (cover via generic renderer anchor)
- TextWidget (`settings.schema.ts`): template grid (:28), note color (:39), vertical align (:45).
- UrlWidget: links list (:20), add link (:22), url (:36), title (:44), shape (:50), icon (:59), color (:68), image (:74).
- SmartNotebook, SoundWidget, VideoActivityWidget, Webcam, WorkSymbols: appearance fields only, not itemised.
- TalkingTool, stickers: managed notice only. TrafficLightWidget: no settings panel.

Line numbers marked `~` are approximate; confirm when tagging.
