# Widget settings inventory (wave 0.2)

Generated 2026-09-05 from the tree at `f2bf5395` by three parallel inventory passes (parts A–C,
split by `WIDGET_SETTINGS_COMPONENTS` registry order). One section per widget: config keys
written by its settings/appearance component, the control used, a D8 group guess, a
keep/remove/rename call, `WIDGET_DEFAULTS` coverage with the front-face fallback literal where a
default is missing, label/help string counts (0.3), and a pre-migration config fixture for the
§7 item 2 migration test. Orchestrator-owned: agents report widget names only; edits land here
once per wave. Part A ends with the production template read path requested by §4.4.

# Part A

## url - components/widgets/UrlWidget/Settings.tsx (348 lines)

| key  | control                                                                                                                           | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| urls | custom:link-list (add form + per-item shape/icon/background editors, uses `LinkShapePicker`, `IconPicker`, `LinkBackgroundInput`) | content     | keep               | yes (`[]`)   | Array-of-links editor; no shared "list" field type covers per-item icon+color+shape+image, so this stays a schema-gap custom slot. |

Labels: 9 labels (Add New Link section header, URL, Title, Shape, Icon, Background ×2, Active Links, per-item Title/Shape/Icon/Background repeated — counted distinct label strings: "Add New Link", "URL", "Title (Optional)", "Shape", "Icon", "Background", "Active Links", "Title" (expanded), "Shape"/"Icon"/"Background" (expanded, same text reused)), 0 help strings, t(): none — every string is a hardcoded English literal.

Pre-migration config fixture:

```json
{
  "urls": [
    {
      "id": "a1b2c3d4-0000-4000-8000-000000000001",
      "url": "https://google.com",
      "title": "Google",
      "color": "#4f46e5",
      "icon": "globe",
      "shape": "rectangle",
      "imageUrl": null
    }
  ]
}
```

---

## soundboard - components/widgets/SoundboardWidget/Settings.tsx (94 lines)

| key              | control                                                                                                                                                                                                                     | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| selectedSoundIds | custom:sound-toggle-list (per-sound row with color swatch + label button + `Toggle`; sound catalog comes from `getAvailableSoundboardSounds(globalConfig, buildingId)`, an admin/building-scoped source, not a static list) | content     | keep               | yes (`[]`)   | Not a plain multi-select — needs the admin-config-aware catalog, so it's a schema-gap custom control (closest kit fit is a generic "list" picker, but the per-row admin-sourced data makes it non-generic). |

Labels: 2 labels ("Available Sounds", the empty-state "No sounds have been configured..." message), 1 help string (the italic footer "Select which sounds you want..."), t(): none.

Pre-migration config fixture:

```json
{ "selectedSoundIds": ["bell", "applause"], "activeSoundIds": [] }
```

Note: `activeSoundIds` is in `WIDGET_DEFAULTS.soundboard.config` but is never written by this settings component — it's a front-face/runtime-only key (which sound is currently playing), not a settings-panel key, so it has no row above.

---

## clock - components/widgets/ClockWidget/Settings.tsx (153 lines); appearance: components/widgets/ClockWidget/Settings.tsx (same file, `ClockAppearanceSettings`)

| key         | control                                                                                                                                   | group guess            | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format24    | toggle (custom two-button toggle, not the shared `Toggle`)                                                                                | behavior               | keep               | yes (`true`) |                                                                                                                                                                                                                                                                         |
| showSeconds | toggle (same custom two-button pattern)                                                                                                   | behavior               | keep               | yes (`true`) |                                                                                                                                                                                                                                                                         |
| fontFamily  | fontFamily (`TypographySettings`, `showColorPicker={false}`)                                                                              | style (appearance tab) | keep               | no           | Front-face fallback `'global'` (`ClockWidget/Widget.tsx:25`). Duplicate-of-Style: `fontFamily` is a universal `APPEARANCE_CONFIG_KEYS` key, rendered here via the shared component so it already matches the D18 "Content styleKeys" pattern — not a bespoke duplicate. |
| clockStyle  | segmented (3-way button group: modern/lcd/minimal)                                                                                        | display                | keep               | no           | Fallback `'modern'` (`Widget.tsx:26`).                                                                                                                                                                                                                                  |
| themeColor  | accentColor (`AccentColorSettings`-style row of swatches from `WIDGET_PALETTE`, but implemented as raw buttons, not the shared component) | style                  | keep               | no           | Fallback `STANDARD_COLORS.slate` (`Widget.tsx:24`).                                                                                                                                                                                                                     |
| glow        | toggle (custom icon button, not shared `Toggle`)                                                                                          | display                | keep               | no           | Fallback `false` (`Widget.tsx:27`).                                                                                                                                                                                                                                     |
| dateColor   | accentColor (`AccentColorSettings`, fallback label "Match Time")                                                                          | style                  | keep               | no           | Fallback: undefined → widget face uses `dateColor ?? themeColor` (`Widget.tsx:159`).                                                                                                                                                                                    |

Labels: 8 labels (`widgets.clock.format24`, `showSeconds`, `displayStyle`, `colorPalette`, `glow`, `dateColor`, plus the 3 style option labels `styles.default/lcd/minimal` and the `matchTime` fallback label), 0 help strings, t(): all (every visible string routes through `t('widgets.clock.*')`).

Pre-migration config fixture:

```json
{
  "format24": true,
  "showSeconds": true,
  "fontFamily": "global",
  "clockStyle": "modern",
  "themeColor": "#0f172a",
  "glow": false,
  "dateColor": null
}
```

---

## text - components/widgets/TextWidget/Settings.tsx (77 lines); appearance: components/widgets/TextWidget/Settings.tsx (same file, `TextAppearanceSettings`)

| key            | control                                                                                                                                                                                  | group guess            | keep/remove/rename | in-defaults? | notes                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| content        | custom:template-apply (grid of template buttons that overwrite `content` with sanitized HTML; the actual rich-text editing happens on the front face's contentEditable, not in Settings) | content                | keep               | yes (`''`)   | Settings never lets a teacher type text directly — only apply a canned template.                                                                             |
| textSizePreset | textSizePreset (`TextSizePresetSettings`)                                                                                                                                                | style (appearance tab) | keep               | no           | Front face reads `textSizePreset` directly (`Widget.tsx:49`), no local default constant — `resolveTextPresetMultiplier` presumably treats `undefined` as 1x. |
| fontFamily     | fontFamily (`TypographySettings`)                                                                                                                                                        | style                  | keep               | no           | Fallback `'global'` (`Widget.tsx:46`).                                                                                                                       |
| fontColor      | color (font color, via `TypographySettings`)                                                                                                                                             | style                  | keep               | no           | Fallback `'#334155'` (`Widget.tsx:47`).                                                                                                                      |

Labels: 1 label ("Templates" section heading), 0 help strings, t(): none (hardcoded).

Not written by Settings but present in `TextConfig` and set from the front-face toolbar instead (`FormattingToolbar`/inline editor): `bgColor`, `fontSize`, `verticalAlign`. These are WidgetData-adjacent front-face-only controls, out of scope for this settings-component inventory but worth flagging for wave migration: today they live entirely outside the settings/appearance panel, so a schema author must decide whether to pull them into the drawer or leave them on the front face.

Pre-migration config fixture:

```json
{
  "content": "<p>Hello class!</p>",
  "bgColor": "#fef9c3",
  "fontSize": 18,
  "fontFamily": "global",
  "fontColor": "#334155",
  "verticalAlign": "center"
}
```

---

## checklist - components/widgets/Checklist/Settings.tsx (383 lines); appearance: components/widgets/Checklist/Settings.tsx (same file, `ChecklistAppearanceSettings`)

| key             | control                                                                                                          | group guess            | keep/remove/rename | in-defaults?     | notes                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| items           | custom:bulk-textarea (one task per line, 500ms debounce, diffs against existing items to preserve ids/completed) | content                | keep               | yes (`[]`)       | Also written wholesale by the two "Nexus Connection" import buttons (from Instructional Routines / Text widget). |
| mode            | segmented (`'manual' \| 'roster'` two-button toggle, "CUSTOM TASKS"/"CLASS ROSTER")                              | behavior               | keep               | yes (`'manual'`) |                                                                                                                  |
| rosterMode      | rosterMode (`RosterModeControl`)                                                                                 | behavior               | keep               | no               | Fallback `'class'` (`Settings.tsx:27`, mirrored in `Widget.tsx:20`).                                             |
| firstNames      | textarea                                                                                                         | content                | keep               | yes (`''`)       | Only shown when `rosterMode === 'custom'`.                                                                       |
| lastNames       | textarea                                                                                                         | content                | keep               | yes (`''`)       | Same gating as `firstNames`.                                                                                     |
| scaleMultiplier | slider (`TextSizePresetSettings` with `writeScaleMultiplier`)                                                    | style (appearance tab) | keep               | yes (`1`)        |                                                                                                                  |
| fontFamily      | fontFamily (`TypographySettings`)                                                                                | style                  | keep               | no               | Fallback `'global'` (`Widget.tsx:25`).                                                                           |
| fontColor       | color (`TypographySettings`)                                                                                     | style                  | keep               | no               | Fallback `'#334155'` (`Widget.tsx:28`).                                                                          |
| textSizePreset  | textSizePreset (`TextSizePresetSettings`)                                                                        | style                  | keep               | no               | Combined with `scaleMultiplier` via `resolveTextPresetMultiplier` (`Widget.tsx:32`).                             |
| cardColor       | surfaceColor (`SurfaceColorSettings`)                                                                            | style                  | keep               | no               | Fallback `'#ffffff'` (`Widget.tsx:26`).                                                                          |
| cardOpacity     | surfaceColor (`SurfaceColorSettings`)                                                                            | style                  | keep               | no               | Fallback `1` (`Widget.tsx:27`).                                                                                  |

Labels: 11 labels (Import Routine, Import from Text Widget, List Source, CUSTOM TASKS, CLASS ROSTER, Task List (One per line), First Names, Last Names, plus the two Sync button labels and the roster-mode control's own internal labels not counted here), 0 help strings (no separate italic/help-line text beyond labels), t(): none — all hardcoded English.

Note: `completedNames` is in `WIDGET_DEFAULTS.checklist.config` (`[]`) and in `ChecklistConfig`, but is never written by this Settings component — it's runtime/front-face state (roster-mode checked-off tracking), not a settings-panel field.

Pre-migration config fixture:

```json
{
  "items": [{ "id": "i1", "text": "Sharpen pencils", "completed": false }],
  "mode": "manual",
  "rosterMode": "class",
  "firstNames": "",
  "lastNames": "",
  "completedNames": [],
  "scaleMultiplier": 1,
  "fontFamily": "global",
  "fontColor": "#334155",
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

---

## random - components/widgets/random/RandomSettings.tsx (641 lines)

| key                                                | control                                                                               | group guess | keep/remove/rename           | in-defaults?                                           | notes                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------- | ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| rosterMode                                         | rosterMode (`RosterModeControl`)                                                      | behavior    | keep                         | yes (`'class'`)                                        |                                                                                                                                            |
| soundEnabled                                       | toggle (`Toggle`)                                                                     | behavior    | keep                         | no                                                     | Fallback `true` (Settings.tsx:168, mirrored on the widget face).                                                                           |
| autoStartTimer                                     | toggle (`Toggle`, disabled unless a `time-tool` widget exists)                        | behavior    | keep                         | no                                                     | Fallback `false`. Cross-widget ("Nexus") automation gate.                                                                                  |
| mode                                               | segmented (4-way icon grid: single/shuffle/groups/jigsaw)                             | behavior    | keep                         | yes (`'single'`)                                       | Also resets `lastResult`/`jigsawHomeGroups`/`jigsawExpertGroups`/`jigsawView` as a side effect of the same write.                          |
| visualStyle                                        | segmented (3-way icon grid: flash/wheel/slots), only for `mode === 'single'`          | display     | keep                         | no                                                     | Fallback `'flash'`.                                                                                                                        |
| groupSize                                          | slider (range 2-20), only for `mode === 'groups'`                                     | content     | keep                         | no                                                     | Fallback computed: `configGroupSize ?? (mode === 'jigsaw' ? 4 : 3)`.                                                                       |
| numHomeGroups                                      | slider (range 2-20), only for `mode === 'jigsaw'`                                     | content     | keep                         | no                                                     | Fallback computed from roster/name-list size, clamped ≥2.                                                                                  |
| numExpertGroups                                    | slider (range 2-20), only for `mode === 'jigsaw'`                                     | content     | keep                         | no                                                     | Fallback computed as `max(2, ceil(numHomeGroups/2))`.                                                                                      |
| firstNames                                         | textarea (debounced 1000ms + blur-flush), only for `rosterMode === 'custom'`          | content     | keep                         | yes (`''`)                                             |                                                                                                                                            |
| lastNames                                          | textarea (debounced 1000ms + blur-flush), only for `rosterMode === 'custom'`          | content     | keep                         | yes (`''`)                                             |                                                                                                                                            |
| lastResult                                         | custom (cleared to `null` on mode switch / clear-names action; never directly edited) | content     | remove-from-settings-surface | no (has default `undefined`, not in `WIDGET_DEFAULTS`) | Runtime output, not a real setting; flag as dead-in-settings (only ever reset here, never set here — set by the front face's Pick action). |
| remainingStudents                                  | custom (cleared alongside `lastResult`)                                               | content     | remove-from-settings-surface | no                                                     | Same as `lastResult` — runtime state reset by Settings, not authored.                                                                      |
| jigsawHomeGroups / jigsawExpertGroups / jigsawView | custom (reset to null/'home' on mode change only)                                     | content     | remove-from-settings-surface | no                                                     | Runtime jigsaw state, only ever cleared here.                                                                                              |

Labels: 10 labels (Operation Mode + 4 mode labels, Animation Style + 3 style labels, "Sound Effects"/"Tick-tock while spinning", "Auto-Start Timer"/description, "Send Groups to Stations", `t('widgets.random.groupSize'|'homeGroupCount'|'expertGroupCount')`, "Import from Class", "First Names", "Last Names", "Clear Custom Names"), 4 help strings (tick-tock subtitle, auto-start subtitle, timer-required warning, stations-tip, clear-confirm), t(): partial (only the three slider labels route through `t()` with `defaultValue`; everything else is hardcoded English).

Pre-migration config fixture:

```json
{
  "firstNames": "",
  "lastNames": "",
  "mode": "single",
  "groupSize": 3,
  "soundEnabled": true,
  "rosterMode": "class",
  "autoStartTimer": false,
  "visualStyle": "flash",
  "numExpertGroups": 2,
  "numHomeGroups": 2
}
```

---

## dice - components/widgets/DiceWidget/Settings.tsx (84 lines)

| key       | control                                                                                      | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| count     | segmented (grid of 6 number buttons, 1-6)                                                    | content     | keep               | yes (`1`)    |                                                                                                                                                                                                                                                                                                                                                              |
| diceColor | surfaceColor (`SurfaceColorSettings` reused with `config.cardColor` remapped to `diceColor`) | style       | rename-candidate   | no           | Fallback `'#ffffff'` (`Widget.tsx:17`). Not a universal `APPEARANCE_CONFIG_KEYS` key (die color ≠ card color), so this is a legitimate per-widget style key, just piggybacking on the shared component via a manual remap — flag as a pattern the new field kit's `SurfaceColor` field type should support natively (custom label/key) instead of remapping. |
| dotColor  | surfaceColor (same remap pattern, `config.cardColor` → `dotColor`)                           | style       | rename-candidate   | no           | Fallback `'#1e293b'` (`Widget.tsx:17`). Same note as `diceColor`.                                                                                                                                                                                                                                                                                            |

Labels: 3 labels ("Number of Dice", "Die Color", "Pip Color"), 1 help string (the purple "Instructions" tip box), t(): none.

Pre-migration config fixture:

```json
{ "count": 2, "diceColor": "#ffffff", "dotColor": "#1e293b" }
```

---

## sound - components/widgets/SoundWidget/Settings.tsx (200 lines); appearance: components/widgets/SoundWidget/Settings.tsx (same file, `SoundAppearanceSettings`)

| key                   | control                                                                                   | group guess              | keep/remove/rename | in-defaults?          | notes                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- | ------------------------ | ------------------ | --------------------- | --------------------------------------------------------- |
| syncExpectations      | toggle (`Toggle`, disabled unless an `expectations` widget exists)                        | behavior                 | keep               | no                    | Fallback `false`. Cross-widget ("Nexus") automation gate. |
| sensitivity           | slider (range 0.5-5, disabled while `syncExpectations`)                                   | content                  | keep               | yes (`1`)             |                                                           |
| autoTrafficLight      | toggle (`Toggle`, disabled unless a `traffic` widget exists)                              | behavior                 | keep               | no                    | Fallback `undefined` → `?? false` at read site.           |
| trafficLightThreshold | custom:level-picker (list of `POSTER_LEVELS` buttons), only shown when `autoTrafficLight` | behavior                 | keep               | no                    | Fallback `4` (`Settings.tsx:14`).                         |
| visual                | segmented (2x2 icon grid: thermometer/speedometer/line/balls)                             | display (appearance tab) | keep               | yes (`'thermometer'`) |                                                           |

Labels: 6 labels ("Auto-Sensitivity (Expectations)", "Sync with Expectations", "Sensitivity", "Auto-Control Traffic Light", "Enable Automation", "Trigger Red Light At:", "Visual Mode"), 3 help strings (expectations tip, sensitivity-auto-adjusted note, traffic-light tip), t(): none.

Pre-migration config fixture:

```json
{
  "sensitivity": 1,
  "autoTrafficLight": false,
  "trafficLightThreshold": 4,
  "syncExpectations": false,
  "visual": "thermometer"
}
```

---

## embed - components/widgets/Embed/Settings.tsx (338 lines)

| key             | control                                                                                                                            | group guess | keep/remove/rename           | in-defaults? | notes                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| mode            | segmented ("WEBSITE URL"/"CUSTOM CODE" two-button toggle; hidden entirely when the building's `hideUrlField` global config is set) | behavior    | keep                         | no           | Fallback `'url'`.                                                                      |
| url             | text                                                                                                                               | content     | keep                         | yes (`''`)   | Also clears `isEmbeddable`→`true` as a side effect on every keystroke.                 |
| isEmbeddable    | custom (never directly edited by the teacher; flipped by the async "Verify" call, and reset to `true` whenever `url` changes)      | content     | remove-from-settings-surface | no           | Fallback `true`. This is a cached verification result, not a teacher-authored setting. |
| blockedReason   | custom (same as `isEmbeddable` — written only by the Verify callback)                                                              | content     | remove-from-settings-surface | no           | Fallback `''` (`Widget.tsx:52`).                                                       |
| html            | textarea (monospace, "HTML / CSS / JS")                                                                                            | content     | keep                         | no           | Fallback `''`.                                                                         |
| refreshInterval | select (0/1/5/15/30/60 minutes)                                                                                                    | behavior    | keep                         | no           | Fallback `0`.                                                                          |

Labels: 6 labels (Target URL, HTML / CSS / JS, Auto-Refresh, plus the two mode-toggle labels and the Verify button), 5 help strings (pro-tip about YouTube/Docs auto-format, non-embeddable warning, generic "some websites prevent embedding" tip, sandbox-scripts note, and the verify-result inline messages), t(): none.

Pre-migration config fixture:

```json
{
  "mode": "url",
  "url": "https://example.com",
  "isEmbeddable": true,
  "blockedReason": "",
  "html": "",
  "refreshInterval": 0
}
```

---

## drawing - components/widgets/DrawingWidget/Settings.tsx (224 lines)

| key     | control                        | group guess | keep/remove/rename | in-defaults?                                                                                   | notes                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | ------------------------------ | ----------- | ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (none)  | —                              | —           | —                  | —                                                                                              | `DrawingSettings` was inspected: it reads `widget.config` for display only (e.g. showing stroke count / background) and issues board actions (clear canvas, export image, change background swatch) that write via canvas-specific actions, not plain `config` merges routed through this file in a way distinguishable as "keys written." Re-checked: the background-color buttons DO write `config.bgColor`; see below. |
| bgColor | color (palette-swatch buttons) | style       | keep               | yes (`undefined`, not present in `WIDGET_DEFAULTS.drawing.config` which only sets `paths: []`) | No in-file fallback found in `DrawingWidget/Widget.tsx` beyond a CSS default — treat as "no fallback found" pending closer read; flagged for the drawing-widget owner to confirm at migration time since `drawing` uses `skipScaling: false` (transform-based), an architectural outlier among this batch.                                                                                                                |

Labels: not fully counted (file uses icon-only buttons for undo/clear/export in addition to color swatches) — recommend the drawing widget get its own focused pass before schema authoring, since its front face is canvas-based rather than config-driven like the rest of this batch.

Pre-migration config fixture:

```json
{ "paths": [], "bgColor": null }
```

---

## qr - components/widgets/QRWidget/Settings.tsx (113 lines)

| key                | control                                                                            | group guess | keep/remove/rename | in-defaults?  | notes                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------- | ----------- | ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| url                | text (disabled when `syncWithTextWidget` is on; shows the live synced URL instead) | content     | keep               | no            | Fallback: `Widget.tsx:54-56` falls back through a synced-URL derivation, then `config.url !== '' ? config.url : undefined`, ultimately `??` to a further default — effectively `''`. |
| showUrl            | toggle (`Toggle`)                                                                  | display     | keep               | yes (`false`) |                                                                                                                                                                                      |
| syncWithTextWidget | toggle (`Toggle`, "Link Repeater" section)                                         | behavior    | keep               | no            | Fallback `false`. Cross-widget ("Nexus") sync with the first `text` widget on the board.                                                                                             |

Labels: 4 labels (Destination URL, Show URL, Link Repeater, Sync with Text Widget), 2 help strings (Show-URL description line, Link-Repeater description line), t(): none.

Pre-migration config fixture:

```json
{
  "url": "https://spartboard.example",
  "showUrl": false,
  "syncWithTextWidget": false
}
```

---

## scoreboard - components/widgets/Scoreboard/Settings.tsx (321 lines)

| key    | control                                                                                                                | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| layout | segmented ("Cards"/"List" radiogroup)                                                                                  | display     | keep               | no           | Fallback `'cards'` (`Widget.tsx:49`). `WIDGET_DEFAULTS.scoreboard.config` only has the deprecated `scoreA/scoreB/teamA/teamB` shape — stale relative to the `teams` array this Settings component actually uses. |
| teams  | custom:team-list (add/remove/rename team rows with debounced name input, color auto-assigned from `SCOREBOARD_COLORS`) | content     | keep               | no           | Fallback `DEFAULT_TEAMS` (`Widget.tsx:48`) when not an array. Also written wholesale by "Import from Randomizer" and "Reset Scores" (zeroes every `score`).                                                      |

Labels: 3 labels (Layout, Import from Randomizer, "Teams (N)"), 2 help strings (Randomizer-not-found tip, none else), t(): none.

Note: `scoreA`, `scoreB`, `teamA`, `teamB` are in `WIDGET_DEFAULTS.scoreboard.config` and `ScoreboardConfig` (marked `@deprecated use teams array instead`) but are never written by this Settings component — the defaults entry is stale and should be updated to `{ teams: [], layout: 'cards' }` in the wave 1a.6 backfill.

Pre-migration config fixture:

```json
{
  "layout": "cards",
  "teams": [
    { "id": "t1", "name": "Team 1", "score": 0, "color": "bg-blue-500" },
    { "id": "t2", "name": "Team 2", "score": 0, "color": "bg-rose-500" }
  ]
}
```

---

## webcam - components/widgets/Webcam/Settings.tsx (40 lines)

| key             | control                           | group guess | keep/remove/rename | in-defaults? | notes                                                                                                        |
| --------------- | --------------------------------- | ----------- | ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------ |
| autoSendToNotes | toggle (`Toggle`, "OCR to Notes") | behavior    | keep               | no           | Fallback: `!!autoSendToNotes` treats `undefined` as falsy in both Settings and (presumably) the widget face. |

Labels: 2 labels ("Auto-Send OCR to Notes:" section label, "OCR to Notes" toggle title), 1 help string ("Instantly convert captured text into a Notes widget."), t(): none.

Not written by this Settings component but present in `WebcamConfig`/`WIDGET_DEFAULTS.webcam`: `zoomLevel` (default `1`), `isMirrored` (default `true`), `deviceId`, `isRemoteMode`, `remoteCaptureDataUrl`, `remoteCaptureTimestamp` — all front-face/runtime fields (zoom slider and mirror toggle live on the widget face itself, device selection and remote-capture state are runtime), not settings-panel fields. Flag for schema authoring: the zoom/mirror controls currently living only on the front face may be candidates to pull into the drawer's Behavior/Display groups.

Pre-migration config fixture:

```json
{ "autoSendToNotes": false }
```

---

## calendar - components/widgets/Calendar/Settings.tsx (418 lines); appearance: components/widgets/Calendar/Settings.tsx (same file, `CalendarAppearanceSettings`)

| key                   | control                                                                                                                                                 | group guess            | keep/remove/rename | in-defaults? | notes                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------ | ------------ | ---------------------------------------------------------------------------------------------------------- |
| isBuildingSyncEnabled | toggle (`Toggle`)                                                                                                                                       | behavior               | keep               | yes (`true`) |                                                                                                            |
| daysVisible           | number input (1-30)                                                                                                                                     | display                | keep               | yes (`5`)    |                                                                                                            |
| personalCalendarIds   | custom:id-list (paste Calendar ID/URL, `extractCalendarId` parses it, add/remove chips), gated behind a Google `calendar.readonly` OAuth connect button | content                | keep               | no           | Fallback `[]` (`Widget.tsx` reads `config.personalCalendarIds ?? []` pattern mirrored in Settings.tsx:58). |
| events                | custom:local-event-list (title/date/time text inputs, add/remove rows)                                                                                  | content                | keep               | yes (`[]`)   | Local manual events, separate from synced Google/building events.                                          |
| textSizePreset        | textSizePreset (`TextSizePresetSettings`)                                                                                                               | style (appearance tab) | keep               | no           |                                                                                                            |
| fontFamily            | fontFamily (`TypographySettings`)                                                                                                                       | style                  | keep               | no           | Fallback `'global'` (`Widget.tsx:66`).                                                                     |
| fontColor             | color (`TypographySettings`)                                                                                                                            | style                  | keep               | no           | Fallback `'#334155'` (`Widget.tsx:67`).                                                                    |
| cardColor             | surfaceColor (`SurfaceColorSettings`)                                                                                                                   | style                  | keep               | no           | Fallback `'#ffffff'` (`Widget.tsx:70`).                                                                    |
| cardOpacity           | surfaceColor (`SurfaceColorSettings`)                                                                                                                   | style                  | keep               | no           | Fallback `1` (`Widget.tsx:69`).                                                                            |

Labels: 7 labels (Display Options, Sync Building Schedule, Days to Display, Personal Google Calendars, Instructions (toggle link), Local Manual Events, "Sign in with Google to Sync"), 3 help strings (days-to-display description, personal-calendar instructions block, empty-events message), t(): none — this panel is entirely hardcoded English despite Weather (a sibling widget) being fully `t()`-ized, an inconsistency worth flagging for the string-count pass (0.3).

Pre-migration config fixture:

```json
{
  "events": [{ "title": "Art", "date": "Monday", "time": "10:00" }],
  "personalCalendarIds": ["abc123@group.calendar.google.com"],
  "isBuildingSyncEnabled": true,
  "daysVisible": 5,
  "fontFamily": "global",
  "fontColor": "#334155",
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

---

## weather - components/widgets/Weather/Settings.tsx (549 lines); appearance: components/widgets/Weather/Settings.tsx (same file, `WeatherAppearanceSettings`)

| key            | control                                                                                             | group guess            | keep/remove/rename           | in-defaults?    | notes                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------- |
| showFeelsLike  | toggle (`Toggle`)                                                                                   | display                | keep                         | no              | Fallback chain: `localShowFeelsLike ?? globalConfig?.showFeelsLike ?? false` — admin global config can supply a default. |
| hideClothing   | toggle (`Toggle`)                                                                                   | display                | keep                         | no              | Fallback `false`.                                                                                                        |
| syncBackground | toggle (`Toggle`)                                                                                   | display                | keep                         | no              | Fallback `false`.                                                                                                        |
| isAuto         | segmented (Manual/Automatic two-button toggle)                                                      | behavior               | keep                         | yes (`true`)    |                                                                                                                          |
| temp           | slider (range 0-110°F), manual mode only                                                            | content                | keep                         | yes (`72`)      | Also stamps `locationName` to a "Manual Mode" i18n string as a side effect.                                              |
| condition      | segmented (5-icon grid: sunny/cloudy/rainy/snowy/windy), manual mode only                           | content                | keep                         | yes (`'sunny'`) |                                                                                                                          |
| source         | segmented (OpenWeather / school-station toggle), auto mode only, hidden when admin proxy manages it | behavior               | keep                         | no              | Fallback: `source === 'openweather'                                                                                      |     | !source` treats unset as OpenWeather. |
| city           | text, auto+OpenWeather only                                                                         | content                | keep                         | no              | Fallback `''`.                                                                                                           |
| feelsLike      | custom (only ever written by the two fetch callbacks, never directly edited)                        | content                | remove-from-settings-surface | no              | Derived/synced value, not a teacher-authored field.                                                                      |
| locationName   | custom (written by fetch callbacks and by the manual-temp slider)                                   | content                | remove-from-settings-surface | no              | Fallback `'Classroom'` (destructured as unused `_locationName` in Settings — the panel never displays it directly).      |
| lastSync       | custom (timestamp stamped by fetch callbacks only)                                                  | content                | remove-from-settings-surface | no              | Not a setting a teacher edits.                                                                                           |
| fontFamily     | fontFamily (`TypographySettings`)                                                                   | style (appearance tab) | keep                         | no              |                                                                                                                          |
| fontColor      | color (`TypographySettings`)                                                                        | style                  | keep                         | no              |                                                                                                                          |
| secondaryColor | accentColor (`AccentColorSettings`, fallback label "Match Text")                                    | style                  | keep                         | no              | Fallback: `config.fontColor ?? '#334155'`.                                                                               |
| cardColor      | surfaceColor (`SurfaceColorSettings`, hidden when `hideClothing`)                                   | style                  | keep                         | no              |                                                                                                                          |
| cardOpacity    | surfaceColor (`SurfaceColorSettings`, hidden when `hideClothing`)                                   | style                  | keep                         | no              |                                                                                                                          |

Labels: 15 labels (all via `t('widgets.weather.*')`: prioritizeFeelsLike, hideClothing, syncBackground, manual, automatic, temperature, condition + 5 condition names, cityZip, schoolStation, useLocation, or, secondaryColor, clothingCard), 8 help strings (prioritizeDescription, hideClothingDescription, syncBackgroundDescription, managedByAdmin, serviceNotConfiguredAdmin, stationReady/stationConnectedTo, plus toast-only messages not counted as panel help), t(): all — every visible string routes through `t()`/`Trans`.

Pre-migration config fixture:

```json
{
  "temp": 72,
  "condition": "sunny",
  "isAuto": true,
  "locationName": "Classroom",
  "source": "openweather",
  "showFeelsLike": false,
  "hideClothing": false,
  "syncBackground": false,
  "fontFamily": "global",
  "fontColor": "#334155",
  "secondaryColor": null,
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

---

## lunchCount - components/widgets/LunchCount/Settings.tsx (343 lines); appearance: components/widgets/LunchCount/Settings.tsx (same file, `LunchCountAppearanceSettings`)

| key                    | control                                                                                 | group guess            | keep/remove/rename           | in-defaults?                                                                   | notes                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------- | ---------------------- | ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| schoolSite             | select (4 fixed Orono-building options)                                                 | content                | keep                         | yes (`'schumann-elementary'`)                                                  | District-specific hardcoded option list — flag for a follow-up on whether this should be building-scoped config rather than a per-widget select. |
| lunchTimeHour          | number (1-12, clamped on change+blur)                                                   | content                | keep                         | no                                                                             | Fallback `''` (Settings.tsx:63).                                                                                                                 |
| lunchTimeMinute        | number (0-59, clamped + zero-padded on blur)                                            | content                | keep                         | no                                                                             | Fallback `''`.                                                                                                                                   |
| gradeLevel             | segmented (button row, options depend on `schoolSite`)                                  | content                | keep                         | no                                                                             | Fallback `''`; cleared automatically when `schoolSite` changes and the old value is invalid for the new site.                                    |
| rosterMode             | rosterMode (`RosterModeControl`)                                                        | behavior               | keep                         | yes (`'class'`)                                                                |                                                                                                                                                  |
| isManualMode           | toggle (`Toggle`)                                                                       | behavior               | keep                         | yes (`false`)                                                                  |                                                                                                                                                  |
| manualHotLunch         | text, manual mode only                                                                  | content                | keep                         | yes (`''`)                                                                     |                                                                                                                                                  |
| manualBentoBox         | text, manual mode only                                                                  | content                | keep                         | yes (`''`)                                                                     |                                                                                                                                                  |
| roster                 | textarea (one student per line), custom roster mode only                                | content                | keep                         | yes (`[]`)                                                                     |                                                                                                                                                  |
| cachedMenu             | custom (cleared to `null` only as a side effect of `schoolSite` change, never set here) | content                | remove-from-settings-surface | no (not in defaults; type is `LunchMenuDay \| null`)                           | Synced-menu cache, not a teacher-authored field.                                                                                                 |
| fontFamily / fontColor | fontFamily / color (`TypographySettings`)                                               | style (appearance tab) | keep                         | yes (`cardColor`/`cardOpacity` only; `fontFamily`/`fontColor` not in defaults) |                                                                                                                                                  |
| cardColor              | surfaceColor (`SurfaceColorSettings`)                                                   | style                  | keep                         | yes (`'#ffffff'`)                                                              |                                                                                                                                                  |
| cardOpacity            | surfaceColor (`SurfaceColorSettings`)                                                   | style                  | keep                         | yes (`1`)                                                                      |                                                                                                                                                  |

Labels: 7 labels (School Site, Lunch Time, Grade Level, Manual Mode, Hot Lunch Name / Bento Box Name placeholders, Custom Roster, "Using Active Class Roster"), 0 dedicated help strings beyond the inline "Preview: H:MM" line, t(): none.

Not written here but present in `LunchCountConfig`/`WIDGET_DEFAULTS.lunchCount`: `assignments` (`{}`), `recipient` (`''`), `syncError`, `lastSyncDate` — all runtime/report-submission state written elsewhere (`SubmitReportModal.tsx`, sync logic), not settings-panel fields.

Pre-migration config fixture:

```json
{
  "schoolSite": "schumann-elementary",
  "isManualMode": false,
  "manualHotLunch": "",
  "manualBentoBox": "",
  "roster": [],
  "assignments": {},
  "recipient": "",
  "rosterMode": "class",
  "lunchTimeHour": "11",
  "lunchTimeMinute": "30",
  "gradeLevel": "3",
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

---

## poll - components/widgets/PollWidget/Settings.tsx (650 lines)

| key                  | control                                                                                                                                                                                      | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| questions            | custom:question-editor (chip strip to select which of up to `MAX_POLL_QUESTIONS` questions to edit, per-question text input + option list editor, AI draft-with-AI generator, roster import) | content     | keep               | no           | Not in `WIDGET_DEFAULTS.poll.config`, which still uses the legacy flat `question`/`options` shape (see below). Accessed everywhere through `getPollQuestions`/`withPollQuestions`/`withQuestionAt` helpers, never read directly. |
| currentQuestionIndex | custom (not directly settable by the teacher in Settings — only mirrors which question is "showing on the board"; presumably advanced from the front face)                                   | behavior    | keep               | no           | Read via `clampQuestionIndex`.                                                                                                                                                                                                   |
| joinCode             | custom (minted once by `ensurePollJoinCode`, displayed read-only with a copy button)                                                                                                         | behavior    | keep               | no           | Nullable; not teacher-typed.                                                                                                                                                                                                     |
| activePollSessionId  | custom (set/cleared by Start/Stop device-voting buttons via `startPollSession`/`stopPollSession`)                                                                                            | behavior    | keep               | no           | Drives the "Voting open"/"Not started" badge.                                                                                                                                                                                    |
| lastPollSessionId    | custom (set by `startPollSession`, read to decide whether to show the Resume-vs-fresh popover)                                                                                               | behavior    | keep               | no           |                                                                                                                                                                                                                                  |

Labels: 13 labels (Import from Class, Draft with AI, Questions, Question N, Options, Actions, Reset, Export CSV, Live Device Voting, Start device voting, Stop voting, Resume previous, Start fresh, Copy link/Copied), 6 help strings (import tip, AI-draft caption, question-limit tip, green-dot legend, live-voting description, resume-vs-fresh caption), t(): none — this is the most complex panel in the batch and is entirely un-translated.

Note: `question`/`options` (the pre-multi-question legacy shape) are in `WIDGET_DEFAULTS.poll.config` and `PollConfig` but are never written directly by this Settings component — new/edited widgets always go through `getPollQuestions`/`withPollQuestions`, which normalizes the legacy shape into `questions` on read/write. Flag `WIDGET_DEFAULTS.poll` as stale (still seeds the legacy single-question shape) for the wave 1a.6 backfill.

Pre-migration config fixture:

```json
{
  "questions": [
    {
      "id": "q1",
      "question": "Favorite season?",
      "options": [
        { "id": "opt-1", "label": "Summer", "votes": 0 },
        { "id": "opt-2", "label": "Winter", "votes": 0 }
      ]
    }
  ],
  "currentQuestionIndex": 0,
  "joinCode": null,
  "activePollSessionId": null,
  "lastPollSessionId": null
}
```

---

## instructionalRoutines - components/widgets/InstructionalRoutines/Settings.tsx (246 lines); appearance: components/widgets/InstructionalRoutines/Settings.tsx (same file, `InstructionalRoutinesAppearanceSettings`)

| key               | control                                                                                                                        | group guess            | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| selectedRoutineId | custom (only ever set to `null` here, via the "Switch Routine Template" button, which also sets `WidgetData.flipped = false`)  | content                | keep               | yes (`null`) | Writing a `WidgetData` field (`flipped`) alongside `config` from inside a settings component is the kind of thing D21's host-managed flip state should absorb — flag for wave 1b: the drawer host, not the panel, should own un-flipping. |
| customSteps       | custom:step-list (reorderable rows: icon picker, admin-only label field, direction textarea, attached-tool select, add/remove) | content                | keep               | yes (`[]`)   |                                                                                                                                                                                                                                           |
| scaleMultiplier   | slider (range 0.5-2.0)                                                                                                         | style (appearance tab) | keep               | yes (`1`)    |                                                                                                                                                                                                                                           |

Labels: 2 labels ("Switch Routine Template" button, "Step Editor" section), 0 dedicated help strings, t(): none.

Pre-migration config fixture:

```json
{
  "selectedRoutineId": null,
  "customSteps": [
    { "id": "s1", "text": "Turn to your partner", "icon": "Zap" }
  ],
  "favorites": [],
  "scaleMultiplier": 1
}
```

---

## materials - components/widgets/MaterialsWidget/Settings.tsx (572 lines)

| key                     | control                                                                                                                                                                                                            | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| title                   | text                                                                                                                                                                                                               | content     | keep               | no           | Fallback `'What you need'` (Settings.tsx:67).                                                                                                                                                                                                                                    |
| titleFont               | custom:font-swatch-grid (4 fixed font buttons: Inherit/Digital/Modern/School)                                                                                                                                      | style       | rename-candidate   | no           | Fallback `'global'`. Duplicate-of-Style: this is a bespoke reimplementation of what `TypographySettings`/fontFamily already covers elsewhere — flag as a genuine duplicate-of-Style control to fold into the universal Style tab rather than keep as a per-widget custom picker. |
| titleColor              | custom:color-swatch-grid (`WIDGET_PALETTE` swatches, raw buttons not `AccentColorSettings`)                                                                                                                        | style       | rename-candidate   | no           | Fallback `'#2d3f89'`. Same duplicate-of-Style flag as `titleFont` — this is exactly what `AccentColorSettings`/`fontColor` already provides.                                                                                                                                     |
| selectedItems           | custom:catalog-checklist (checkbox rows over an admin/building-scoped materials catalog, with per-row hide/edit/select-all)                                                                                        | content     | keep               | yes (`[]`)   |                                                                                                                                                                                                                                                                                  |
| activeItems             | custom (not directly toggled by a UI control in Settings — filtered to intersect with `selectedItems` whenever selection changes; the actual per-item "active/visible to students" toggle lives on the front face) | content     | keep               | yes (`[]`)   |                                                                                                                                                                                                                                                                                  |
| customMaterialSnapshots | custom (rebuilt automatically by `withSnapshots` on every selection change; never directly edited)                                                                                                                 | content     | keep               | no           | Derived cache so shared/exported boards still render teacher-defined materials — not a teacher-facing field, but structurally necessary; keep off any "remove" list.                                                                                                             |

Labels: 5 labels (Title Text, Typography, Title Color, Available Materials, Add/Select All/Deselect All), 2 help strings (material-cap message, footer "Selected materials will appear..." tip), t(): none.

Note: this component also writes to `AuthContext`'s `materialsPreferences` (`hiddenMaterialIds`, via `saveMaterialsPreferences`) alongside every `config` write — a second, account-wide persistence path (not `APPEARANCE_CONFIG_KEYS`) that the drawer/migration work should be aware of but that is out of scope for `config` key rows here.

Pre-migration config fixture:

```json
{
  "selectedItems": ["scissors", "glue"],
  "activeItems": ["scissors"],
  "title": "What you need",
  "titleFont": "global",
  "titleColor": "#2d3f89",
  "customMaterialSnapshots": []
}
```

---

## miniApp - components/widgets/FallbackSettings.tsx (19 lines, shared fallback — `MiniAppSettings` here is a static placeholder, not a real settings panel); no appearance component registered

| key    | control | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ------- | ----------- | ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (none) | —       | —           | —                  | —            | `WIDGET_SETTINGS_COMPONENTS.miniApp` points at the shared `FallbackSettings.tsx`'s `MiniAppSettings`, which renders a single static string ("Manage apps in the main view.") and writes nothing. Real Mini App configuration happens in the front-face editor (`components/widgets/MiniApp/`), entirely outside the settings/appearance system this inventory covers. |

Labels: 1 label (the static placeholder string), 0 help strings, t(): none.

Pre-migration config fixture: N/A — no config keys are written by this settings surface.

---

## Summary

| widget                | keys | labels                                     | help | t()     | not-in-defaults |
| --------------------- | ---- | ------------------------------------------ | ---- | ------- | --------------- |
| url                   | 1    | 9                                          | 0    | none    | 0               |
| soundboard            | 1    | 2                                          | 1    | none    | 0               |
| clock                 | 6    | 8                                          | 0    | all     | 4               |
| text                  | 4    | 1                                          | 0    | none    | 3               |
| checklist             | 11   | 11                                         | 0    | none    | 6               |
| random                | 13   | 10                                         | 4    | partial | 8               |
| dice                  | 3    | 3                                          | 1    | none    | 2               |
| sound                 | 5    | 6                                          | 3    | none    | 3               |
| embed                 | 6    | 6                                          | 5    | none    | 4               |
| drawing               | 1    | n/a (not counted — needs a dedicated pass) | n/a  | none    | 1               |
| qr                    | 3    | 4                                          | 2    | none    | 2               |
| scoreboard            | 2    | 3                                          | 2    | none    | 2               |
| webcam                | 1    | 2                                          | 1    | none    | 1               |
| calendar              | 9    | 7                                          | 3    | none    | 5               |
| weather               | 15   | 15                                         | 8    | all     | 12              |
| lunchCount            | 13   | 7                                          | 0    | none    | 4               |
| poll                  | 5    | 13                                         | 6    | none    | 5               |
| instructionalRoutines | 3    | 2                                          | 0    | none    | 0               |
| materials             | 6    | 5                                          | 2    | none    | 5               |
| miniApp               | 0    | 1                                          | 0    | none    | 0               |

## Template read path

The production dashboard-TEMPLATE read path (`dashboard_templates` Firestore collection → live `Dashboard`) is **`components/boardsModal/CreateFromTemplateModal.tsx`**:

- **Board templates**: `pickBoardTemplate()` (line ~83) reads a `DashboardTemplate` doc (already subscribed via `onSnapshot(query(collection(db, 'dashboard_templates'), where('enabled', '==', true)))`, or via `mockTemplateStore` under `VITE_AUTH_BYPASS`) and builds a `Dashboard` object directly — `widgets: tpl.widgets` is passed through **unchanged**, with no `migrateWidget` call — then hands it to `createNewDashboard(tpl.name, dashboard)`.
- **Collection templates**: `pickCollectionTemplate()` (line ~113) calls `hydrateCollectionTemplate()` (`utils/collectionTemplateHydration.ts`), a pure data-shaping function that remaps each `BoardTemplateSnapshot` into a `Dashboard` (fresh uuid, same `widgets` array reference from the snapshot) and returns `boardInputs: Dashboard[]`; the caller then loops `createNewDashboard(board.name, board, { collectionId, silent: true })` per board — again with no `migrateWidget` call anywhere in the chain.
- **Confirmed sink**: `createNewDashboard` (`context/DashboardContext.tsx`) does not call `migrateWidget` on the `widgets` it's handed — it accepts the `Dashboard` (or widget array) as-is. This means a widget config-key rename that ships as a `migrateWidget` step will **not** apply to widgets arriving from either template path, matching what §4.4 already documents for shared boards / Drive import / starter packs / saved-config merges. Wave 1b's "route every load path through `migrateWidget`" work must add both `pickBoardTemplate` and `hydrateCollectionTemplate`'s `createNewDashboard` calls to its list, and the fixture-board characterization set should gain `tests/fixtures/boards/template.json` covering both the board-template and collection-template shapes.

# Part B

## time-tool - components/widgets/TimeTool/Settings.tsx (641 lines); appearance: components/widgets/TimeTool/Settings.tsx (`TimeToolAppearanceSettings`, same file)

| key                           | control                                                          | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------- | ----------- | ------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mode                          | segmented                                                        | content     | keep               | yes          | resets duration/elapsedTime/isRunning/startTime as a side effect of the switch                                                                                               |
| visualType                    | segmented                                                        | display     | keep               | yes          |                                                                                                                                                                              |
| selectedSound                 | segmented (4-up grid)                                            | content     | keep               | yes          |                                                                                                                                                                              |
| adjustStepSeconds             | number                                                           | behavior    | keep               | yes          | only shown when `mode === 'timer'`                                                                                                                                           |
| timerEndVoiceLevel            | segmented                                                        | behavior    | keep               | no           | fallback: `config.timerEndVoiceLevel != null` check only — no literal fallback, `null`/absent both mean "no action"                                                          |
| timerEndTrafficColor          | segmented                                                        | behavior    | keep               | no           | same as above — `config.timerEndTrafficColor != null`, no literal fallback                                                                                                   |
| timerEndTriggerRandom         | toggle                                                           | behavior    | keep               | no           | no fallback found (`config.timerEndTriggerRandom` used directly as a boolean guard in `useTimeTool.ts`, falsy when absent)                                                   |
| timerEndTriggerNextUp         | toggle                                                           | behavior    | keep               | no           | same as `timerEndTriggerRandom`                                                                                                                                              |
| timerEndTriggerStationsRotate | toggle                                                           | behavior    | keep               | no           | same as `timerEndTriggerRandom`                                                                                                                                              |
| startTime                     | (not user-editable; internal)                                    | behavior    | n/a                | no           | never written by Settings.tsx; set by `useTimeTool.ts` runtime logic only — listed because it's part of `TimeToolConfig` and touched by the mode-switch handlers in Settings |
| fontFamily                    | fontFamily (via `TypographySettings`, `showColorPicker={false}`) | style       | duplicate-of-Style | no           | fallback: `fontFamily = 'global'` (`TimeToolWidget.tsx:402`); **duplicate-of-Style candidate** — TypographySettings is the shared Style-tab primitive                        |
| clockStyle                    | segmented                                                        | style       | keep               | no           | fallback: `clockStyle = 'modern'` (`TimeToolWidget.tsx:403`)                                                                                                                 |
| themeColor                    | accentColor (custom color-dot row)                               | style       | keep               | no           | fallback: `themeColor = STANDARD_COLORS.slate` (`TimeToolWidget.tsx:400`)                                                                                                    |
| glow                          | toggle                                                           | style       | keep               | no           | fallback: `glow = false` (`TimeToolWidget.tsx:401`)                                                                                                                          |

Labels: 33 labels, 2 help strings (`adjustStepHint`, tip callouts count as help/tip text — 4 more: `addExpectationsTip`, `addTrafficLightTip`, `addRandomizerTip`, `addStationsTip`, `addNextUpTip`), t(): all (every visible string in both `TimeToolSettings` and `TimeToolAppearanceSettings` goes through `t()`)

Pre-migration config fixture:

```json
{
  "mode": "timer",
  "visualType": "digital",
  "duration": 600,
  "elapsedTime": 600,
  "isRunning": false,
  "startTime": null,
  "selectedSound": "Gong",
  "adjustStepSeconds": 60,
  "timerEndVoiceLevel": 2,
  "timerEndTrafficColor": "yellow",
  "timerEndTriggerRandom": true,
  "timerEndTriggerNextUp": false,
  "timerEndTriggerStationsRotate": false,
  "themeColor": "#64748b",
  "glow": true,
  "fontFamily": "global",
  "clockStyle": "modern"
}
```

## seating-chart - components/widgets/SeatingChart/Settings.tsx (101 lines); no appearance component registered

| key         | control                                | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                           |
| ----------- | -------------------------------------- | ----------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| rosterMode  | custom:RosterModeControl               | content     | keep               | yes          | shared `RosterModeControl` component, not a schema-kit field type yet — schema-gap candidate                                                    |
| names       | textarea                               | content     | keep               | no           | fallback: `if (rosterMode === 'custom' && config.names)` in `Widget.tsx:141` — no literal fallback, undefined treated as an empty custom roster |
| assignments | custom:button (Clear Assignments Only) | content     | keep               | yes          | reset-to-`{}` action, not a field the teacher edits directly                                                                                    |
| furniture   | custom:button (Clear All / Reset)      | content     | keep               | yes          | reset-to-`[]` action, also clears `assignments` in the same click                                                                               |

Labels: 4 labels (Custom Roster, Actions, Clear Assignments Only, Clear All (Reset)), 0 help strings, t(): none (all hardcoded English strings)

Pre-migration config fixture:

```json
{
  "furniture": [],
  "assignments": {},
  "gridSize": 20,
  "rosterMode": "custom",
  "names": "Alex Kim\nJordan Lee",
  "template": "freeform",
  "templateColumns": 6
}
```

## catalyst - components/widgets/Catalyst/CatalystSettings.tsx (20 lines); no appearance component registered

| key    | control | group guess | keep/remove/rename | in-defaults? | notes                                                                                |
| ------ | ------- | ----------- | ------------------ | ------------ | ------------------------------------------------------------------------------------ |
| (none) | —       | —           | —                  | —            | dead panel: renders a static "Admin Managed" notice and writes no config keys at all |

Labels: 2 labels ("Admin Managed" heading + explanatory paragraph), 0 help strings, t(): none

Pre-migration config fixture:

```json
{}
```

## catalyst-instruction - components/widgets/Catalyst/CatalystInstructionWidget.tsx (54 lines, `CatalystInstructionSettings` exported from same file); no appearance component registered

| key    | control | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------- | ----------- | ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (none) | —       | —           | remove             | —            | dead control: settings panel renders a static "Guide Mode Controls" label only; writes no config. `title`/`instructions` (the actual content fields, read by the front face with `?? 'Instruction Guide'` / `?? ''` fallbacks) are not editable from this panel at all — **schema-gap**: no editor exists for the widget's own content |

Labels: 1 label ("Guide Mode Controls"), 0 help strings, t(): none

Pre-migration config fixture:

```json
{ "routineId": "", "stepIndex": 0 }
```

## catalyst-visual - components/widgets/Catalyst/CatalystVisualWidget.tsx (87 lines, `CatalystVisualSettings` exported from same file); no appearance component registered

| key    | control | group guess | keep/remove/rename | in-defaults? | notes                                                                  |
| ------ | ------- | ----------- | ------------------ | ------------ | ---------------------------------------------------------------------- |
| (none) | —       | —           | remove             | —            | dead control: static "Visual Anchor Mode" label only, no config writes |

Labels: 1 label ("Visual Anchor Mode"), 0 help strings, t(): none

Pre-migration config fixture:

```json
{ "routineId": "", "stepIndex": 0 }
```

## smartNotebook - components/widgets/SmartNotebook/Settings.tsx (21 lines, `SmartNotebookAppearanceSettings` only — main `WIDGET_SETTINGS_COMPONENTS.smartNotebook` entry is the shared `DefaultSettings` fallback, not this file); appearance: components/widgets/SmartNotebook/Settings.tsx

| key         | control                               | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                               |
| ----------- | ------------------------------------- | ----------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fontFamily  | fontFamily (`TypographySettings`)     | style       | duplicate-of-Style | no           | fallback not found in this pass (widget renders imported SVG/image pages; per the type comment these appearance fields have "no themed text/surface chrome to apply them to" today) |
| fontColor   | color (`TypographySettings`)          | style       | duplicate-of-Style | no           | see above                                                                                                                                                                           |
| cardColor   | surfaceColor (`SurfaceColorSettings`) | style       | duplicate-of-Style | yes          |                                                                                                                                                                                     |
| cardOpacity | slider (`SurfaceColorSettings`)       | style       | duplicate-of-Style | yes          |                                                                                                                                                                                     |

Main Settings tab (`WIDGET_SETTINGS_COMPONENTS.smartNotebook`) is the shared `DefaultSettings` fallback ("Standard settings available.") — writes nothing; `activeNotebookId`, `storageLimitMb`, `libraryDisplayMode`, `placedAssets` have no settings-panel editor at all (front-face only) — **schema-gap** for all four if a Content group is ever added for this widget.

Labels: 0 labels/help specific to `SmartNotebookAppearanceSettings` beyond what `TypographySettings`/`SurfaceColorSettings` render internally, t(): none

Pre-migration config fixture:

```json
{
  "activeNotebookId": null,
  "cardColor": "#ffffff",
  "cardOpacity": 1,
  "fontFamily": "global",
  "fontColor": "#1e293b"
}
```

## traffic - no settings component (`WIDGET_SETTINGS_COMPONENTS.traffic` = shared `DefaultSettings`); no appearance component registered

| key    | control | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                           |
| ------ | ------- | ----------- | ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (none) | —       | —           | —                  | —            | `DefaultSettings` fallback only ("Standard settings available."); `traffic`'s `WIDGET_DEFAULTS` config is `{}` — the widget has no configurable state to expose |

Labels: 1 label (shared fallback string), 0 help, t(): none

Pre-migration config fixture:

```json
{}
```

## expectations - components/widgets/ExpectationsWidget/Settings.tsx (92 lines); no appearance component registered

| key             | control | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ------- | ----------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| syncSoundWidget | toggle  | behavior    | keep               | no           | fallback: `config.syncSoundWidget ?? false`. **Side-effect note**: toggling this also writes `syncSoundWidget: false` on every _other_ `expectations` widget and `syncExpectations` on every `sound` widget on the board — a cross-widget write outside this widget's own config, which the schema/Custom-field model needs to account for explicitly |

`voiceLevel`, `workMode`, `interactionMode` (the widget's actual state, all in `WIDGET_DEFAULTS`) and `instructionalRoutine`/`activeRoutines`/`layout` have no editor in this panel — they're set from the widget's front face — **schema-gap** if Content fields are ever wanted here.

Labels: 2 labels ("Nexus Connections" section label, "Auto-Adjust Sound Meter"), 1 help string (the sync explanation paragraph), t(): none

Pre-migration config fixture:

```json
{
  "voiceLevel": null,
  "workMode": null,
  "interactionMode": null,
  "syncSoundWidget": true
}
```

## schedule - components/widgets/Schedule/Settings.tsx (938 lines); appearance: components/widgets/Schedule/Settings.tsx (`ScheduleAppearanceSettings`, same file)

| key                        | control                                                                  | group guess | keep/remove/rename             | in-defaults? | notes                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------ | ----------- | ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| schedules                  | list (custom drag-and-drop via `@dnd-kit`, per-schedule name/days/items) | content     | keep                           | no           | fallback: `config.schedules ?? []`; migrates legacy `items` into a `schedules[0]` on first schedule-CRUD action                                                                |
| items                      | list (legacy path only)                                                  | content     | rename → fold into `schedules` | yes          | marked `@deprecated` in `types.ts`; kept only for the migration path (`items ?? []`)                                                                                           |
| settingsSelectedScheduleId | (internal tab-selection state)                                           | behavior    | keep                           | no           | fallback: `config.settingsSelectedScheduleId ?? null`; explicitly "Not used by the front-face display" per its `types.ts` doc comment — settings-panel-only persisted UI state |
| autoProgress               | toggle                                                                   | behavior    | keep                           | no           | fallback: `config.autoProgress ?? false`                                                                                                                                       |
| autoScroll                 | toggle                                                                   | behavior    | keep                           | no           | fallback: `config.autoScroll ?? false`                                                                                                                                         |
| expandActiveItem           | toggle                                                                   | behavior    | keep                           | no           | fallback: `config.expandActiveItem ?? true`                                                                                                                                    |
| isBuildingSyncEnabled      | toggle                                                                   | behavior    | keep                           | no           | fallback: `config.isBuildingSyncEnabled ?? true`                                                                                                                               |
| textSizePreset             | textSizePreset (`TextSizePresetSettings`)                                | style       | duplicate-of-Style             | no           | no in-widget fallback found (defers to shared component default)                                                                                                               |
| fontFamily                 | fontFamily (`TypographySettings`)                                        | style       | duplicate-of-Style             | no           | no in-widget fallback found                                                                                                                                                    |
| fontColor                  | color (`TypographySettings`)                                             | style       | duplicate-of-Style             | no           | no in-widget fallback found                                                                                                                                                    |
| cardColor                  | surfaceColor (`SurfaceColorSettings`)                                    | style       | duplicate-of-Style             | yes          |                                                                                                                                                                                |
| cardOpacity                | slider (`SurfaceColorSettings`)                                          | style       | duplicate-of-Style             | yes          |                                                                                                                                                                                |

Note: `localEvents` and `lastSyncedBuildingId` (both in `ScheduleConfig`) are never written by this Settings file — building-sync/internal only, not surfaced to the teacher.

Labels: ~14 labels ("Auto-Checkoff & Scroll", "Auto-Complete Items", "Auto-Scroll View", "Expand Current Event", "Building Integration", "Sync Building Schedule", "Options", "Building Schedules", plus per-schedule/per-item chrome), 4 help strings (one paragraph under each of the three Auto-Checkoff toggles, plus the Building Sync paragraph), t(): none — this is the largest hardcoded-string panel in Part B and the biggest 0.3 string-count contributor

Pre-migration config fixture:

```json
{
  "items": [],
  "schedules": [
    {
      "id": "sched-1",
      "name": "Default Schedule",
      "items": [
        {
          "id": "item-1",
          "task": "Morning Meeting",
          "startTime": "08:00",
          "endTime": "08:15",
          "mode": "clock",
          "linkedWidgets": []
        }
      ],
      "days": [1, 2, 3, 4, 5]
    }
  ],
  "settingsSelectedScheduleId": "sched-1",
  "autoProgress": false,
  "autoScroll": false,
  "expandActiveItem": true,
  "isBuildingSyncEnabled": true,
  "cardColor": "#ffffff",
  "cardOpacity": 1,
  "textSizePreset": "medium",
  "fontFamily": "global",
  "fontColor": "#1e293b"
}
```

## classes - no settings component (`WIDGET_SETTINGS_COMPONENTS.classes` = shared `DefaultSettings`); no appearance component registered

| key    | control | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                     |
| ------ | ------- | ----------- | ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (none) | —       | —           | —                  | —            | `DefaultSettings` fallback only; `WIDGET_DEFAULTS.classes.config` is `{}` — roster management happens via `RosterModeControl`/roster CRUD elsewhere, not a settings panel |

Labels: 1 label (shared fallback string), 0 help, t(): none

Pre-migration config fixture:

```json
{}
```

## recessGear - components/widgets/RecessGear/Settings.tsx (86 lines); no appearance component registered

| key                   | control                                                      | group guess | keep/remove/rename | in-defaults? | notes |
| --------------------- | ------------------------------------------------------------ | ----------- | ------------------ | ------------ | ----- |
| useFeelsLike          | toggle                                                       | behavior    | keep               | yes          |       |
| linkedWeatherWidgetId | select (populated from other `weather` widgets on the board) | behavior    | keep               | yes          |       |

Labels: 3 labels ("Smart Linking", "Use \"Feels Like\" Temp", "Source Weather Widget"), 2 help strings (Smart Linking paragraph, Feels Like sub-label), t(): none

Pre-migration config fixture:

```json
{ "linkedWeatherWidgetId": "weather-widget-1", "useFeelsLike": true }
```

## pdf - components/widgets/PdfWidget/Settings.tsx (43 lines); no appearance component registered

| key           | control                                                     | group guess | keep/remove/rename | in-defaults? | notes                                                                     |
| ------------- | ----------------------------------------------------------- | ----------- | ------------------ | ------------ | ------------------------------------------------------------------------- |
| activePdfId   | custom:button (reset to `null` via "Switch to Another PDF") | content     | keep               | yes          |                                                                           |
| activePdfUrl  | custom:button (same reset)                                  | content     | keep               | yes          |                                                                           |
| activePdfName | custom:button (same reset)                                  | content     | keep               | yes          | shown read-only above the button, `?? 'None — library is shown'` fallback |

Labels: 2 labels ("Current Document", "Switch to Another PDF"), 1 help string (storage note), t(): none

Pre-migration config fixture:

```json
{
  "activePdfId": "pdf-abc123",
  "activePdfUrl": "https://storage.example/pdf-abc123.pdf",
  "activePdfName": "Unit 3 Packet.pdf"
}
```

## quiz - components/widgets/QuizWidget/Settings.tsx (77 lines); no appearance component registered

| key                   | control                                                       | group guess | keep/remove/rename | in-defaults?             | notes                                                                                                                                    |
| --------------------- | ------------------------------------------------------------- | ----------- | ------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| customTitle           | text                                                          | content     | keep               | n/a (`WidgetData` field) | **writes outside `config`** — this is `widget.customTitle`, not `config.customTitle`; flagged per the "keys written outside config" rule |
| view                  | custom:button (reset to `'manager'`, both buttons)            | behavior    | keep               | yes                      |                                                                                                                                          |
| managerTab            | custom:button (`'archive'` / `'library'`)                     | behavior    | keep               | yes                      |                                                                                                                                          |
| selectedQuizId        | custom:button (reset to `null`, "Reset to Manager View" only) | content     | keep               | yes                      |                                                                                                                                          |
| selectedQuizTitle     | custom:button (same reset)                                    | content     | keep               | yes                      |                                                                                                                                          |
| activeAssignmentId    | custom:button (same reset)                                    | content     | keep               | yes                      |                                                                                                                                          |
| activeLiveSessionCode | custom:button (same reset)                                    | content     | keep               | yes                      |                                                                                                                                          |
| resultsSessionId      | custom:button (same reset)                                    | content     | keep               | yes                      |                                                                                                                                          |

`plcMode`, `plcSheetUrl`, `teacherName`, `periodName`, `plcMemberEmails` (all in `WIDGET_DEFAULTS.quiz`) have no editor in this panel at all — set from the front-face PLC flow — **schema-gap** if ever exposed here.

Labels: 3 labels ("Widget Label", "View Assignment Archive", "Reset to Manager View"), 1 help string (the info callout about front-face management), t(): none

Pre-migration config fixture:

```json
{
  "view": "manager",
  "managerTab": "library",
  "selectedQuizId": null,
  "selectedQuizTitle": null,
  "activeAssignmentId": null,
  "activeLiveSessionCode": null,
  "resultsSessionId": null,
  "plcMode": false,
  "plcSheetUrl": "",
  "teacherName": "",
  "periodName": "",
  "plcMemberEmails": []
}
```

## breathing - components/widgets/Breathing/BreathingSettings.tsx (159 lines); appearance: components/widgets/Breathing/BreathingSettings.tsx (`BreathingAppearanceSettings`, same file)

| key         | control                                                  | group guess | keep/remove/rename | in-defaults? | notes                          |
| ----------- | -------------------------------------------------------- | ----------- | ------------------ | ------------ | ------------------------------ |
| pattern     | segmented (custom button list)                           | content     | keep               | yes          |                                |
| visual      | segmented (3-up icon grid)                               | display     | keep               | yes          |                                |
| color       | accentColor (custom color-dot row from `WIDGET_PALETTE`) | style       | keep               | yes          |                                |
| cardColor   | surfaceColor (`SurfaceColorSettings`)                    | style       | duplicate-of-Style | yes          |                                |
| cardOpacity | slider (`SurfaceColorSettings`)                          | style       | duplicate-of-Style | yes          |                                |
| fontFamily  | fontFamily (`TypographySettings`)                        | style       | duplicate-of-Style | no           | no fallback found in this pass |
| fontColor   | color (`TypographySettings`)                             | style       | duplicate-of-Style | no           | no fallback found in this pass |

Labels: 4 labels ("Pattern", "Visual Style", "Color Theme", plus per-pattern/per-visual button labels), 0 help strings, t(): none

Pre-migration config fixture:

```json
{
  "pattern": "4-7-8",
  "visual": "lotus",
  "color": "#3b82f6",
  "cardColor": "#ffffff",
  "cardOpacity": 1,
  "fontFamily": "global",
  "fontColor": "#1e293b"
}
```

## mathTools - components/widgets/MathTools/Settings.tsx (100 lines); appearance: components/widgets/MathTools/Settings.tsx (`MathToolsAppearanceSettings`, same file)

| key            | control                                                                                        | group guess | keep/remove/rename | in-defaults? | notes                                                         |
| -------------- | ---------------------------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | ------------------------------------------------------------- |
| dpiCalibration | number (with local text-input draft state + Apply/Reset buttons — not a pure controlled field) | behavior    | keep               | no           | fallback: `config.dpiCalibration ?? CSS_PPI` (`CSS_PPI` = 96) |
| cardColor      | surfaceColor                                                                                   | style       | duplicate-of-Style | yes          |                                                               |
| cardOpacity    | slider                                                                                         | style       | duplicate-of-Style | yes          |                                                               |
| fontFamily     | fontFamily                                                                                     | style       | duplicate-of-Style | no           | no fallback found in this pass                                |
| fontColor      | color                                                                                          | style       | duplicate-of-Style | no           | no fallback found in this pass                                |

Labels: 3 labels ("Math Tools Palette", "Palette DPI Calibration (px / inch)", grade-level note), 3 help strings (the explanatory paragraph under each of the three static info blocks), t(): none

Pre-migration config fixture:

```json
{
  "dpiCalibration": 96,
  "cardColor": "#ffffff",
  "cardOpacity": 1,
  "fontFamily": "global",
  "fontColor": "#1e293b"
}
```

## mathTool - components/widgets/MathToolInstance/Settings.tsx (279 lines); no appearance component registered

| key            | control                                                                      | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| toolType       | segmented (grid of tool buttons, generated from `MATH_TOOL_META`)            | content     | keep               | yes          |                                                                                                                                     |
| rotation       | slider + number-of-preset-buttons (0/45/90/180/270)                          | display     | keep               | no           | fallback: `config.rotation ?? 0` (`Widget.tsx:147`); only shown when `ROTATABLE_TOOLS.includes(toolType)`                           |
| numberLineMode | segmented                                                                    | content     | keep               | no           | fallback: `config.numberLineMode ?? 'integers'` (both in Settings and `Widget.tsx:89`); only shown for `toolType === 'number-line'` |
| numberLineMin  | number                                                                       | content     | keep               | no           | fallback: `config.numberLineMin ?? -10` (`Widget.tsx:90`)                                                                           |
| numberLineMax  | number                                                                       | content     | keep               | no           | fallback: `config.numberLineMax ?? 10` (`Widget.tsx:91`)                                                                            |
| rulerUnits     | segmented                                                                    | content     | keep               | yes          | only shown for `toolType === 'ruler-in' \| 'ruler-cm'`                                                                              |
| pixelsPerInch  | number (draft-state Apply/Reset, same pattern as `mathTools.dpiCalibration`) | behavior    | keep               | yes          |                                                                                                                                     |

`fractionDenominator`, `calcDisplay`, `calcExpression`, `stickerMode`, `stickerPiece`, `placeValueBlocks`, `placeValueColumns` (all in `MathToolConfig`) have no editor in this panel — front-face/runtime only.

Labels: 6 labels ("Tool Type", "Rotation (N°)", "Mode", "Min", "Max", "Units Displayed"), 1 help string (DPI calibration paragraph), t(): none

Pre-migration config fixture:

```json
{
  "toolType": "number-line",
  "pixelsPerInch": 96,
  "rulerUnits": "both",
  "numberLineMode": "integers",
  "numberLineMin": -10,
  "numberLineMax": 10,
  "rotation": 0
}
```

## nextUp - components/widgets/NextUp/Settings.tsx (433 lines); no appearance component registered

| key                | control                                                                                                                           | group guess | keep/remove/rename | in-defaults?                                                                                                | notes                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| activeDriveFileId  | custom:DriveFilePicker (new-file creation flow + `<select>` over `driveService.listFiles`, plus a reset-to-`null` on session end) | content     | keep               | yes                                                                                                         | schema-gap: needs a dedicated Drive-file-session field type                                             |
| sessionName        | custom (set via `showPrompt` dialog on session start; reset to `null` on end)                                                     | content     | keep               | yes                                                                                                         |                                                                                                         |
| isActive           | custom:button (Start/End Session flow)                                                                                            | behavior    | keep               | yes                                                                                                         |                                                                                                         |
| createdAt          | custom (stamped `Date.now()` on session start)                                                                                    | behavior    | keep               | yes                                                                                                         |                                                                                                         |
| lastUpdated        | custom (stamped `Date.now()` on roster import)                                                                                    | behavior    | keep               | yes                                                                                                         |                                                                                                         |
| autoStartTimer     | toggle (hand-rolled div, not the shared `Toggle` component)                                                                       | behavior    | keep               | no                                                                                                          | no fallback literal — `config.autoStartTimer` used directly as a truthy/falsy CSS-class switch          |
| displayCount       | slider                                                                                                                            | display     | keep               | yes                                                                                                         |                                                                                                         |
| styling.themeColor | accentColor (custom color-swatch grid)                                                                                            | style       | keep               | yes (`styling` object is in defaults; `themeColor` is a nested property inside it, not a new top-level key) | writes via `{ ...config.styling, themeColor: color }`, i.e. a nested field on a top-level `styling` key |

`styling.fontFamily` and `styling.animation` (both in `WIDGET_DEFAULTS.nextUp.config.styling`) have no editor in this panel — schema-gap if a nested-field kit control is added.

Also writes to two external stores as side effects of session start/end: a Firestore doc at `nextup_sessions/{uid}_{widgetId}` (`setDoc`/`updateDoc`) and a Drive file (`driveService.uploadFile`/`deleteFile`) — neither is `config`, both are flagged as writes outside the widget's own config for the Custom-field design.

Labels: 6 labels ("Session Status", "New Queue", "Load Existing", "Integration & Logic", "Auto-Start Timer", "Display Count", "Visual Style"), 2 help strings ("Start active timer when clicking NEXT", "Show N students"), t(): none

Pre-migration config fixture:

```json
{
  "activeDriveFileId": "drive-file-1",
  "sessionName": "Period 3 Help Queue",
  "isActive": true,
  "createdAt": 1730000000000,
  "lastUpdated": 1730000500000,
  "displayCount": 3,
  "autoStartTimer": true,
  "styling": {
    "fontFamily": "lexend",
    "themeColor": "#2d3f89",
    "animation": "slide"
  }
}
```

## music - components/widgets/MusicWidget/Settings.tsx (427 lines); appearance: components/widgets/MusicWidget/Settings.tsx (`MusicAppearanceSettings`, same file)

| key              | control                                                                   | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| source           | segmented (2-up, gated behind `canAccessFeature('personal-spotify')`)     | content     | keep               | no           | destructured default `source = 'curated'` at the top of `MusicSettings`                                                         |
| layout           | segmented (3-up, custom SVG previews)                                     | display     | keep               | no           | destructured default `layout = 'default'`                                                                                       |
| stationId        | custom:StationPicker (grid of curated stations from `useMusicStations()`) | content     | keep               | yes          |                                                                                                                                 |
| syncWithTimeTool | toggle                                                                    | behavior    | keep               | yes          | also force-cleared to `false` as a side effect of switching to `source: 'personal'` or picking a Spotify-backed curated station |
| bgColor          | color (custom swatch row, 4 fixed options incl. "Transparent")            | style       | duplicate-of-Style | no           | destructured default `bgColor = '#ffffff'`                                                                                      |
| textColor        | color (custom swatch row from `WIDGET_PALETTE` + white)                   | style       | duplicate-of-Style | no           | destructured default `textColor = STANDARD_COLORS.slate`                                                                        |

`personalSpotifyUrl`/`personalSpotifyLabel`/`personalSpotifyThumbnail` are not written directly in `Settings.tsx`; they're set from the nested `PersonalSpotifyPanel` component's own search/select flow (out of scope for this file-level pass, but present in `MusicConfig`).

Labels: 5 labels ("Source", "Curated stations", "My Spotify", "Layout", "Select a Station", "Sync with Time Tool", "Background", "Text Color"), 1 help string (the sync-disabled/enabled explanatory line, which swaps text based on state), t(): none

Pre-migration config fixture:

```json
{
  "stationId": "station-1",
  "syncWithTimeTool": false,
  "bgColor": "#ffffff",
  "textColor": "#64748b",
  "layout": "default",
  "source": "curated"
}
```

## countdown - components/widgets/Countdown/Settings.tsx (225 lines); appearance: components/widgets/Countdown/Settings.tsx (`CountdownAppearanceSettings`, same file)

| key             | control                                                           | group guess | keep/remove/rename | in-defaults? | notes                                      |
| --------------- | ----------------------------------------------------------------- | ----------- | ------------------ | ------------ | ------------------------------------------ |
| title           | text                                                              | content     | keep               | yes          |                                            |
| startDate       | text (`type="date"`, ISO-string round-trip via local helpers)     | content     | keep               | yes          |                                            |
| eventDate       | text (`type="date"`, same helpers)                                | content     | keep               | yes          |                                            |
| viewMode        | segmented                                                         | display     | keep               | yes          |                                            |
| includeWeekends | toggle                                                            | behavior    | keep               | yes          |                                            |
| countToday      | toggle                                                            | behavior    | keep               | yes          |                                            |
| fontFamily      | fontFamily (`TypographySettings`)                                 | style       | duplicate-of-Style | no           | no fallback found in this pass             |
| eventColor      | color (swatch row from `TEXT_COLOR_PRESETS` + native color input) | style       | keep               | no           | fallback: `config.eventColor ?? '#2d3f89'` |
| cardColor       | surfaceColor                                                      | style       | duplicate-of-Style | yes          |                                            |
| cardOpacity     | slider                                                            | style       | duplicate-of-Style | yes          |                                            |

Labels: 6 labels ("Event Title", "Start Date", "Event Date", "View Mode", "Include weekends", "Count today", "Event Title Color"), 0 help strings, t(): none

Pre-migration config fixture:

```json
{
  "title": "Special Event",
  "startDate": "2026-09-05T00:00:00.000Z",
  "eventDate": "2026-09-12T00:00:00.000Z",
  "includeWeekends": true,
  "countToday": true,
  "viewMode": "number",
  "cardColor": "#ffffff",
  "cardOpacity": 1,
  "fontFamily": "global",
  "eventColor": "#2d3f89"
}
```

## car-rider-pro - components/widgets/CarRiderPro/Settings.tsx (17 lines); no appearance component registered

| key    | control | group guess | keep/remove/rename | in-defaults? | notes                                                                                                              |
| ------ | ------- | ----------- | ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| (none) | —       | —           | —                  | —            | dead panel: static "centrally managed" notice, writes no config. `WIDGET_DEFAULTS['car-rider-pro'].config` is `{}` |

Labels: 1 label (the notice paragraph), 0 help, t(): none

Pre-migration config fixture:

```json
{}
```

---

## Summary

| widget               | keys                                         | labels | help | t()  | not-in-defaults |
| -------------------- | -------------------------------------------- | ------ | ---- | ---- | --------------- |
| time-tool            | 14                                           | 33     | 6    | all  | 10              |
| seating-chart        | 4                                            | 4      | 0    | none | 1               |
| catalyst             | 0                                            | 2      | 0    | none | 0               |
| catalyst-instruction | 0 (1 dead control)                           | 1      | 0    | none | 0               |
| catalyst-visual      | 0 (1 dead control)                           | 1      | 0    | none | 0               |
| smartNotebook        | 4 (appearance only; main tab writes nothing) | 0      | 0    | none | 2               |
| traffic              | 0                                            | 1      | 0    | none | 0               |
| expectations         | 1                                            | 2      | 1    | none | 1               |
| schedule             | 11                                           | 14     | 4    | none | 7               |
| classes              | 0                                            | 1      | 0    | none | 0               |
| recessGear           | 2                                            | 3      | 2    | none | 0               |
| pdf                  | 3                                            | 2      | 1    | none | 0               |
| quiz                 | 7 config + 1 WidgetData field                | 3      | 1    | none | 0               |
| breathing            | 7                                            | 4      | 0    | none | 2               |
| mathTools            | 5                                            | 3      | 3    | none | 2               |
| mathTool             | 7                                            | 6      | 1    | none | 4               |
| nextUp               | 8                                            | 6      | 2    | none | 1               |
| music                | 6                                            | 8      | 1    | none | 4               |
| countdown            | 10                                           | 6      | 0    | none | 2               |
| car-rider-pro        | 0                                            | 1      | 0    | none | 0               |

# Part C

Widgets covered: `blending-board`, `specialist-schedule`, `graphic-organizer`, `reveal-grid`,
`numberLine`, `syntax-framer`, `hotspot-image`, `concept-web`, `starter-pack`, `video-activity`,
`guided-learning`, `custom-widget`, `activity-wall`, `work-symbols`, `blooms-taxonomy`,
`talking-tool`, `need-do-put-then`, `stations`, `stickers`.

None of these 19 widgets' settings/appearance files import `react-i18next` or call `t()` — every
visible label and help string below is a hardcoded English literal. Shared field primitives used
across this part (`TypographySettings`, `SurfaceColorSettings`, `TextSizePresetSettings` —
`components/common/*.tsx`) are likewise not translated. Per D4's documented interim behavior, every
widget below whose per-widget appearance component writes `fontFamily`/`fontColor`/`cardColor`/
`cardOpacity`/`textSizePreset` is a **duplicate-of-Style** case today: the Window tier (D18) already
exposes a frame background + window font + window text size control, and until this widget migrates
its legacy appearance component renders a second, content-tier font/color/size control alongside it.
This is flagged once per widget below rather than repeated per key.

## blending-board - components/widgets/BlendingBoard/Settings.tsx (28 lines)

No table — `BlendingBoardSettings` and `BlendingBoardAppearanceSettings` both render a static
read-only notice (`CentrallyManagedNotice`) and call no `updateWidget`/`updateConfig`. Zero config
keys written. `BlendingBoardConfig` is `Record<string, never>` and `widgetDefaults.ts` gives it
`config: {}`. The appearance component is a deliberate override that **suppresses** the default
`UniversalStyleSettings` Style-tab fallback (per its own comment) because the widget is an
admin-controlled iframe with no visual knobs.

Labels: 0 labels, 0 help strings, t(): none (no fields to label; the notice text itself is not a
field help string).

Pre-migration config fixture:

```json
{}
```

## specialist-schedule - components/widgets/SpecialistSchedule/Settings.tsx (731 lines)

| key            | control                                                                                                                                    | group guess | keep/remove/rename       | in-defaults?      | notes                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------ | ----------------- | ------------------------------------------------------------------------------ |
| cycleDays      | list (per-day array of `{dayNumber, items[]}`, each item text+time inputs)                                                                 | content     | keep                     | yes (`[]`)        | Rotation tab. Read as `cycleDays = []` fallback in front face too.             |
| recurringItems | list (daily/weekly items, text+time+day-of-week select)                                                                                    | content     | keep                     | no                | Front-face fallback `recurringItems = []` (`SpecialistScheduleWidget.tsx`).    |
| fontFamily     | fontFamily (via `TypographySettings`)                                                                                                      | style       | keep, duplicate-of-Style | no                | Fallback `'global'` in front face. Duplicate-of-Style (see header note).       |
| fontColor      | color (via `TypographySettings`)                                                                                                           | style       | keep, duplicate-of-Style | no                | Fallback `'#334155'` in front face. Duplicate-of-Style.                        |
| textSizePreset | textSizePreset (via `TextSizePresetSettings`, `writeScaleMultiplier` not passed → defaults `false`, so `scaleMultiplier` is never written) | style       | keep, duplicate-of-Style | no                | Read via `resolveTextPresetMultiplier(textSizePreset, 1)`. Duplicate-of-Style. |
| cardColor      | surfaceColor (via `SurfaceColorSettings`)                                                                                                  | style       | keep, duplicate-of-Style | yes (`'#ffffff'`) | Duplicate-of-Style.                                                            |
| cardOpacity    | slider (via `SurfaceColorSettings`)                                                                                                        | style       | keep, duplicate-of-Style | yes (`1`)         | Duplicate-of-Style.                                                            |

Also note: the widget-level building-admin config (`cycleLength`, `dayLabel`, `customDayNames`,
`specialistOptions`) is read here but written only through Feature Permissions admin UI, not this
settings panel — not a widget-config key.

Labels: 15 labels (10 `SettingsLabel` instances in-file — Rotation/Recurring tab content headers
"Schedule", "Every Day", "Specific Day of Week", "Activity Name" ×2, "Start Time" ×2, "End Time" ×2,
"Repeat Every" — plus 5 from the shared components: Typography's "Typography" + "Text Color",
TextSizePresetSettings' "Text Size", SurfaceColorSettings' "Surface" + "Opacity"), 0 help strings,
t(): none.

Pre-migration config fixture:

```json
{
  "cycleDays": [
    {
      "dayNumber": 1,
      "items": [
        {
          "id": "i1",
          "startTime": "09:00",
          "endTime": "09:30",
          "task": "Music"
        }
      ]
    }
  ],
  "recurringItems": [
    {
      "id": "r1",
      "startTime": "11:30",
      "endTime": "12:00",
      "task": "🛝 Recess",
      "type": "daily"
    }
  ],
  "fontFamily": "font-sans",
  "fontColor": "#334155",
  "textSizePreset": "medium",
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

## graphic-organizer - components/widgets/GraphicOrganizer/Settings.tsx (89 lines)

| key          | control                                                      | group guess | keep/remove/rename       | in-defaults?      | notes                                                                                       |
| ------------ | ------------------------------------------------------------ | ----------- | ------------------------ | ----------------- | ------------------------------------------------------------------------------------------- |
| templateType | select                                                       | content     | keep                     | yes (`'frayer'`)  | Includes a dynamic `<optgroup>` of admin-defined custom templates from Feature Permissions. |
| fontFamily   | fontFamily (`TypographySettings`, `showColorPicker={false}`) | style       | keep, duplicate-of-Style | no                | Fallback chain `config.fontFamily ?? templateFontFamily ?? 'global'` in front face.         |
| cardColor    | surfaceColor (`SurfaceColorSettings`)                        | style       | keep, duplicate-of-Style | yes (`'#ffffff'`) |                                                                                             |
| cardOpacity  | slider (`SurfaceColorSettings`)                              | style       | keep, duplicate-of-Style | yes (`1`)         |                                                                                             |

Labels: 4 labels ("Template Type" `<label>` + Typography's "Typography" [no Text Color since
`showColorPicker={false}`] + Surface's "Surface" + "Opacity"), 0 help strings, t(): none.

Pre-migration config fixture:

```json
{
  "templateType": "frayer",
  "nodes": {},
  "fontFamily": "font-sans",
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

## reveal-grid - components/widgets/RevealGrid/Settings.tsx (703 lines)

| key                  | control                                                                      | group guess | keep/remove/rename       | in-defaults?       | notes                                                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------- | ----------- | ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| columns              | segmented (2/3/4/5 buttons)                                                  | display     | keep                     | yes (`3`)          |                                                                                                                                                                                                                                             |
| isMemoryMode         | segmented (Review/Memory buttons)                                            | behavior    | keep                     | no                 | Fallback `undefined`→falsy in front face.                                                                                                                                                                                                   |
| revealMode           | segmented (flip/fade)                                                        | display     | keep                     | yes (`'flip'`)     |                                                                                                                                                                                                                                             |
| setName              | text                                                                         | content     | keep                     | no                 | Not read by the front-face widget at all — only used by the settings panel itself for Drive save/load bookkeeping (file name). Not a dead control in the strict sense (it drives a real save action) but has no visual effect on the board. |
| activeDriveFileId    | custom: hidden Drive-sync id (set on save/load, not directly editable)       | behavior    | keep                     | no                 | Same as `setName` — Drive bookkeeping only, not rendered on the board.                                                                                                                                                                      |
| cards                | list (paste-from-sheet / CSV upload / manual add, each with front/back text) | content     | keep                     | yes (3 seed cards) |                                                                                                                                                                                                                                             |
| fontFamily           | fontFamily (`TypographySettings`, `showColorPicker={false}`)                 | style       | keep, duplicate-of-Style | no                 | Fallback `'global'`.                                                                                                                                                                                                                        |
| defaultCardColor     | color                                                                        | style       | keep                     | no                 | Fallback `'#dbeafe'`; applies to new cards only (per-card `bgColor` overrides).                                                                                                                                                             |
| defaultCardBackColor | color                                                                        | style       | keep                     | no                 | Fallback `'#dcfce7'`.                                                                                                                                                                                                                       |

Labels: 14 labels (7 `SettingsLabel`: "Columns", "Game Mode", "Reveal Mode", "Practice Set",
"Cards (N)", "Default Card Front Color", "Default Card Back Color"; 6 `<label>`: "Set Name", "Load
Existing Set", "Paste two columns (Term, Definition)", "Front (Question / Term)", "Back (Answer /
Definition)", plus one more inline label; 1 from Typography's "Typography" [`showColorPicker=false`
suppresses "Text Color"]), 3 help strings ("In Memory mode, the grid acts as a matching game...",
"Applied to all new cards (per-card colors override this)", "Background color for revealed cards"),
t(): none.

Pre-migration config fixture:

```json
{
  "columns": 3,
  "cards": [
    {
      "id": "1",
      "frontContent": "Question 1",
      "backContent": "Answer 1",
      "isRevealed": false
    }
  ],
  "revealMode": "flip",
  "isMemoryMode": false,
  "fontFamily": "font-sans",
  "defaultCardColor": "#dbeafe",
  "defaultCardBackColor": "#dcfce7",
  "setName": "Biology Ch 4",
  "activeDriveFileId": null
}
```

## numberLine - components/widgets/NumberLine/Settings.tsx (447 lines)

| key         | control                                           | group guess | keep/remove/rename       | in-defaults?       | notes                                                                                          |
| ----------- | ------------------------------------------------- | ----------- | ------------------------ | ------------------ | ---------------------------------------------------------------------------------------------- |
| min         | number (blur-committed, Escape-cancel)            | content     | keep                     | yes (`0`)          | Clamped to ±1000 and to `<= max`.                                                              |
| max         | number (blur-committed, Escape-cancel)            | content     | keep                     | yes (`10`)         | Clamped to ±1000 and to `>= min`.                                                              |
| step        | number (blur-committed, Escape-cancel)            | content     | keep                     | yes (`1`)          | Clamped so total ticks stay under 5000.                                                        |
| displayMode | select (integers/decimals/fractions)              | display     | keep                     | yes (`'integers'`) |                                                                                                |
| showArrows  | toggle                                            | display     | keep                     | yes (`true`)       |                                                                                                |
| markers     | list (value + label text + per-item color picker) | content     | keep                     | yes (`[]`)         | New markers auto-colored from `WIDGET_PALETTE`.                                                |
| jumps       | list (start/end/label add-form)                   | content     | keep                     | yes (`[]`)         |                                                                                                |
| fontFamily  | fontFamily (`TypographySettings`)                 | style       | keep, duplicate-of-Style | no                 | Fallback `undefined` (no `'global'` sentinel needed — front face treats undefined as inherit). |
| fontColor   | color (`TypographySettings`)                      | style       | keep, duplicate-of-Style | no                 | Fallback `'#1e293b'`.                                                                          |
| cardColor   | surfaceColor (`SurfaceColorSettings`)             | style       | keep, duplicate-of-Style | yes (`'#ffffff'`)  |                                                                                                |
| cardOpacity | slider (`SurfaceColorSettings`)                   | style       | keep, duplicate-of-Style | yes (`1`)          |                                                                                                |

Labels: 16 labels (8 `SettingsLabel`: "Axis Configuration", "Markers", "Jumps", "Value", "Label",
"Start", "End", plus one more via `htmlFor`; 4 `<label>`: "Min Value", "Max Value", "Step
(Interval)", "Display Mode"; 2 from Typography [Typography + Text Color, `showColorPicker` default
true]; 2 from Surface [Surface + Opacity]), plus one visible "Show arrows on ends" toggle caption
(counted as a label). 0 help strings, t(): none.

Pre-migration config fixture:

```json
{
  "min": -10,
  "max": 10,
  "step": 1,
  "displayMode": "integers",
  "showArrows": true,
  "markers": [{ "id": "m1", "value": 5, "label": "Start", "color": "#3b82f6" }],
  "jumps": [{ "id": "j1", "startValue": 0, "endValue": 5, "label": "+5" }],
  "fontFamily": "font-sans",
  "fontColor": "#1e293b",
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

## syntax-framer - components/widgets/SyntaxFramer/Settings.tsx (189 lines)

No appearance component registered for `syntax-framer` (not present in
`WIDGET_APPEARANCE_COMPONENTS`), so its Style tab today shows only the universal fallback.

| key       | control                                                                                                                                            | group guess | keep/remove/rename | in-defaults?     | notes                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------ | ---------------- | -------------------------------------------- |
| tokens    | custom: text-to-token retokenizer (textarea, auto-splits on save/mode-change, preserves existing token ids/colors/mask state where a word repeats) | content     | keep               | yes (`[]`)       |                                              |
| mode      | segmented (Text/Math)                                                                                                                              | content     | keep               | yes (`'text'`)   | Changing mode re-tokenizes the current text. |
| alignment | segmented (Left/Center icons)                                                                                                                      | display     | keep               | yes (`'center'`) |                                              |

Labels: 3 labels ("Content", "Mode", "Alignment" — all `SettingsLabel`), 2 help strings ("Words are
automatically converted to draggable blocks." / "Numbers and math operators are separated into
blocks." toggled by mode, plus the "Tip: Shift+Click a token..." box), t(): none.

Pre-migration config fixture:

```json
{
  "mode": "text",
  "tokens": [{ "id": "t1", "value": "The", "isMasked": false }],
  "alignment": "center"
}
```

## hotspot-image - components/widgets/HotspotImage/Settings.tsx (427 lines)

| key          | control                                                                      | group guess | keep/remove/rename | in-defaults?    | notes                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------- | ----------- | ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| baseImageUrl | imageUpload (Firebase Storage via `useStorage`)                              | content     | keep               | yes (`''`)      | Also drives the "Saved Library" load/save flow (`savedWidgetPresets['hotspot-image']`, a separate profile field, not this widget's config). |
| hotspots     | list (click-to-place pins; per-pin title text, detail textarea, icon picker) | content     | keep               | yes (`[]`)      |                                                                                                                                             |
| popoverTheme | segmented (Light/Dark/Glass)                                                 | style       | keep               | yes (`'light'`) | Appearance tab; hidden entirely until `baseImageUrl` is set.                                                                                |

Labels: 7 labels (4 `SettingsLabel`: "Base Image", "Saved Library", "Interactive Pins (N)", "Popover
Theme"; 3 `<label>`: "Title (Pin N)", "Detail Text", "Icon"), 2 help strings ("Click on the image to
add a new pin.", "Upload an image first to configure appearance options."), t(): none.

Pre-migration config fixture:

```json
{
  "baseImageUrl": "https://example.com/img.png",
  "hotspots": [
    {
      "id": "h1",
      "xPct": 40,
      "yPct": 60,
      "title": "Nucleus",
      "detailText": "Controls the cell",
      "icon": "info",
      "isViewed": false
    }
  ],
  "popoverTheme": "light"
}
```

## concept-web - components/widgets/ConceptWeb/Settings.tsx (124 lines)

| key               | control                                                                                       | group guess | keep/remove/rename       | in-defaults?      | notes                                                      |
| ----------------- | --------------------------------------------------------------------------------------------- | ----------- | ------------------------ | ----------------- | ---------------------------------------------------------- |
| nodes             | custom: "Clear All Nodes & Edges" button only (node CRUD happens on the board face, not here) | content     | keep                     | yes (`[]`)        | Settings tab only offers a bulk-clear action.              |
| edges             | (cleared together with `nodes` by the same button)                                            | content     | keep                     | yes (`[]`)        |                                                            |
| defaultNodeWidth  | slider (5–50%)                                                                                | display     | keep                     | no                | Fallback `15`. Live preview box shown beneath the sliders. |
| defaultNodeHeight | slider (5–50%)                                                                                | display     | keep                     | no                | Fallback `15`.                                             |
| fontFamily        | fontFamily (`TypographySettings`, `showColorPicker={false}`)                                  | style       | keep, duplicate-of-Style | no                | Fallback `'global'`.                                       |
| cardColor         | surfaceColor (`SurfaceColorSettings`)                                                         | style       | keep, duplicate-of-Style | yes (`'#ffffff'`) |                                                            |
| cardOpacity       | slider (`SurfaceColorSettings`)                                                               | style       | keep, duplicate-of-Style | yes (`1`)         |                                                            |

`ConceptWebConfig.fontColor` exists in `types.ts` (written by the shared `TypographySettings` when
`showColorPicker` is true) but this widget passes `showColorPicker={false}`, so `fontColor` is never
written here — a config field that exists on the type but has no writer in this widget's panel.

Labels: 5 labels (2 `<label>`: "Default Node Width (N%)", "Default Node Height (N%)"; 1 Typography
"Typography" [no Text Color]; 2 Surface "Surface" + "Opacity"), 1 help string ("These dimensions
apply to new nodes. You can still resize nodes individually!"), t(): none.

Pre-migration config fixture:

```json
{
  "nodes": [{ "id": "n1", "text": "Idea", "x": 40, "y": 40 }],
  "edges": [],
  "defaultNodeWidth": 15,
  "defaultNodeHeight": 15,
  "fontFamily": "font-sans",
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

## starter-pack - components/widgets/StarterPack/Settings.tsx (176 lines)

`StarterPackSettings` writes **no `widget.config` keys at all**. "Pack Name" is local component
state (`useState`) used only as the document `name` field for a new Firestore document under
`artifacts/{appId}/users/{uid}/starterPacks` (personal) or `artifacts/{appId}/public/data/
starterPacks` (admin-only global save) — a one-shot capture-and-save action, not a persisted widget
setting. `StarterPackAppearanceSettings` is a static "No additional style settings available."
placeholder with zero controls (dead by construction — it exists only to suppress the universal
Style-tab fallback, same pattern as `blending-board`).

Labels: 1 label ("Pack Name"), 3 help strings ("Captures all open widgets — their types, positions,
and sizes...", "Private — only visible to you", "Building-wide — visible to all teachers"), t():
none.

Pre-migration config fixture:

```json
{}
```

## video-activity - components/widgets/VideoActivityWidget/Settings.tsx (115 lines)

No appearance component registered for `video-activity`.

| key                  | control | group guess | keep/remove/rename | in-defaults? | notes                                             |
| -------------------- | ------- | ----------- | ------------------ | ------------ | ------------------------------------------------- |
| autoPlay             | toggle  | behavior    | keep               | no           | Fallback `false` in both settings and front face. |
| requireCorrectAnswer | toggle  | behavior    | keep               | no           | Fallback `true`.                                  |
| allowSkipping        | toggle  | behavior    | keep               | no           | Fallback `false`.                                 |

Labels: 3 labels ("Auto-Play Video", "Require Correct Answers", "Allow Skipping" — bold captions
next to each toggle, not `<label>` elements but the only visible name for each control), 3 help
strings (the muted description under each toggle), t(): none.

Pre-migration config fixture:

```json
{
  "autoPlay": false,
  "requireCorrectAnswer": true,
  "allowSkipping": false
}
```

## guided-learning - components/widgets/GuidedLearning/Settings.tsx (34 lines)

No appearance component registered for `guided-learning`.

| key  | control                                                                                                    | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| view | custom: single "Go to Library" button that force-navigates the widget's internal view state to `'library'` | behavior    | keep               | no           | No fallback literal needed here — the widget's own view-state machine defaults `view` elsewhere; this panel only ever writes the one literal `'library'`. |

Labels: 1 label ("Go to Library" button, the only actionable control), 1 help string ("Use the main
widget panel to create, edit, and assign guided learning sets. Settings are configured per-set
inside the editor."), t(): none.

Pre-migration config fixture:

```json
{ "view": "library" }
```

## custom-widget - components/widgets/CustomWidget/Settings.tsx (159 lines)

No appearance component registered for `custom-widget` (visual styling, if any, is defined inside
the admin-built widget's own blocks, not this panel).

| key           | control                                                                                                                                                                                                              | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| adminSettings | custom: dynamically-rendered form (text/number/boolean/select) driven by the `CustomWidgetSettingDef[]` the widget's admin author defined; edited in local state and committed by an explicit "Save Settings" button | content     | keep               | no           | Per D13, `CustomWidgetSettingDef` is meant to become a subset of the new field schema; this is the one widget whose "schema" is itself admin-authored data, not a static list, so it is a strong candidate for the custom escape hatch even post-migration. |

Static labels: 0 fixed field labels (all field labels are `def.label ?? def.key`, defined per admin
schema and therefore variable in count and text). 0 help strings (no per-field help wired from
`CustomWidgetSettingDef`). t(): none (and cannot be, since labels are admin-authored runtime data,
not code literals).

Pre-migration config fixture:

```json
{
  "customWidgetId": "widget-doc-1",
  "adminSettings": { "showTimer": true, "maxAttempts": 3 }
}
```

## activity-wall - components/widgets/ActivityWall/Settings.tsx (33 lines)

`ActivityWallSettings` (Content/Behavior/Display tabs) writes **no config keys** — it is two lines
of static text directing the teacher to the front-face Library button, where wall selection/
creation/editing actually happens (each wall's own layout/appearance/rules live on the wall document
itself, not `widget.config`).

| key         | control                               | group guess | keep/remove/rename       | in-defaults? | notes                                                          |
| ----------- | ------------------------------------- | ----------- | ------------------------ | ------------ | -------------------------------------------------------------- |
| fontFamily  | fontFamily (`TypographySettings`)     | style       | keep, duplicate-of-Style | no           | Fallback `'global'` in front face.                             |
| fontColor   | color (`TypographySettings`)          | style       | keep, duplicate-of-Style | no           | Fallback via `pickReadableForeground(cardColor)`.              |
| cardColor   | surfaceColor (`SurfaceColorSettings`) | style       | keep, duplicate-of-Style | no           | Fallback `'#0f172a'` (dark, unlike most widgets' `'#ffffff'`). |
| cardOpacity | slider (`SurfaceColorSettings`)       | style       | keep, duplicate-of-Style | no           | Fallback `0.7`.                                                |

Labels: 4 labels (all from the shared Typography + Surface components: Typography, Text Color,
Surface, Opacity — the Settings tab itself has no field labels), 2 help strings ("Walls are managed
from the widget face.", "Use the Library button to pick, create, edit, duplicate, or delete a
wall..."), t(): none.

Pre-migration config fixture:

```json
{
  "fontFamily": "font-sans",
  "fontColor": "#ffffff",
  "cardColor": "#0f172a",
  "cardOpacity": 0.7
}
```

## work-symbols - components/widgets/WorkSymbols/Settings.tsx (64 lines)

`WorkSymbolsSettings` (Content/Behavior/Display) is `() => null` — a dead component that renders
nothing and writes nothing. All configurable state lives in the appearance panel.

| key            | control                                   | group guess | keep/remove/rename       | in-defaults? | notes                                                                                                                                                                |
| -------------- | ----------------------------------------- | ----------- | ------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fontFamily     | fontFamily (`TypographySettings`)         | style       | keep, duplicate-of-Style | no           | Fallback `'global'`.                                                                                                                                                 |
| fontColor      | color (`TypographySettings`)              | style       | keep, duplicate-of-Style | no           | Fallback `'#1e293b'`.                                                                                                                                                |
| textSizePreset | textSizePreset (`TextSizePresetSettings`) | style       | keep, duplicate-of-Style | no           | Read via `resolveTextPresetMultiplier`.                                                                                                                              |
| titlePosition  | segmented (Bottom/Top)                    | display     | keep                     | no           | Fallback `'bottom'`; arguably a Display-group key that's stranded in the Style tab today rather than a true style key — worth revisiting the group during migration. |

Labels: 4 labels (Typography's "Typography" + "Text Color", TextSizePreset's "Text Size", own
"Title Position"), 0 help strings, t(): none.

Pre-migration config fixture:

```json
{
  "fontFamily": "font-sans",
  "fontColor": "#1e293b",
  "textSizePreset": "medium",
  "titlePosition": "bottom"
}
```

## blooms-taxonomy - components/widgets/BloomsTaxonomy/Settings.tsx (81 lines)

No appearance component registered for `blooms-taxonomy`.

| key               | control                                                     | group guess | keep/remove/rename | in-defaults? | notes                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------- | ----------- | ------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| enabledCategories | list (checkboxes, one per admin-available content category) | content     | keep               | no           | Not in `widgetDefaults.ts` (`config: {}`); fallback chain is `config.enabledCategories ?? defaultEnabledCategories ?? [...CONTENT_CATEGORIES]`, where `defaultEnabledCategories` comes from the admin's Feature Permissions building config. The set of checkboxes shown is further filtered by the admin's `availableCategories`. |

Labels: 1 heading label ("Content Categories") plus one checkbox label per visible category
(`CATEGORY_LABELS[cat]`, count varies with admin config — typically all `CONTENT_CATEGORIES`, a
small fixed list defined in `./constants`). 1 help string ("Choose which categories appear when you
click a level."), t(): none.

Pre-migration config fixture:

```json
{ "enabledCategories": ["remember", "understand", "apply"] }
```

## talking-tool - components/widgets/TalkingTool/Settings.tsx (33 lines)

`TalkingToolSettings` (Content/Behavior/Display) writes no config keys — static text pointing to
admin-managed Feature Permissions for the actual talking-stem content.

| key         | control                               | group guess | keep/remove/rename       | in-defaults? | notes                                                                                                                                                                                                                     |
| ----------- | ------------------------------------- | ----------- | ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fontFamily  | fontFamily (`TypographySettings`)     | style       | **dead control**         | no           | Never read anywhere in `components/widgets/TalkingTool/` — the front face destructures only `cardColor`/`cardOpacity` off its config (as `widgetConfig`, not `config`). Written by this panel but has zero visual effect. |
| fontColor   | color (`TypographySettings`)          | style       | **dead control**         | no           | Same — never read by the front face.                                                                                                                                                                                      |
| cardColor   | surfaceColor (`SurfaceColorSettings`) | style       | keep, duplicate-of-Style | no           | Consumed: `widgetConfig.cardColor ?? '#ffffff'`.                                                                                                                                                                          |
| cardOpacity | slider (`SurfaceColorSettings`)       | style       | keep, duplicate-of-Style | no           | Consumed: `widgetConfig.cardOpacity ?? 1`.                                                                                                                                                                                |

Labels: 4 labels (Typography's "Typography" + "Text Color", Surface's "Surface" + "Opacity"), 2 help
strings ("Global content settings" caption + "Talking stems and categories are configured by an
admin via Feature Permissions."), t(): none.

Pre-migration config fixture:

```json
{
  "fontFamily": "font-sans",
  "fontColor": "#334155",
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

## need-do-put-then - components/widgets/NeedDoPutThen/Settings.tsx (379 lines)

| key            | control                                                                                         | group guess | keep/remove/rename       | in-defaults?               | notes                                            |
| -------------- | ----------------------------------------------------------------------------------------------- | ----------- | ------------------------ | -------------------------- | ------------------------------------------------ |
| needItems      | list (icon picker + label text + color + per-item show/hide checkbox, in a collapsible section) | content     | keep                     | yes (`DEFAULT_NEED_ITEMS`) |                                                  |
| doItems        | list (plain numbered textarea steps, no icon/color/checkbox)                                    | content     | keep                     | yes (`DEFAULT_DO_ITEMS`)   | Uses the simpler `ListEditor`, not `TileEditor`. |
| putItems       | list (icon/label/color/checkbox, same shape as `needItems`)                                     | content     | keep                     | yes (`DEFAULT_PUT_ITEMS`)  |                                                  |
| thenItems      | list (icon/label/color, no visibility checkbox — `TileEditor` with `showCheckbox` omitted)      | content     | keep                     | yes (`DEFAULT_THEN_ITEMS`) |                                                  |
| fontFamily     | fontFamily (`TypographySettings`)                                                               | style       | keep, duplicate-of-Style | no                         | Fallback `'global'`.                             |
| fontColor      | color (`TypographySettings`)                                                                    | style       | keep, duplicate-of-Style | no                         | Fallback `'#1e293b'`.                            |
| textSizePreset | textSizePreset (`TextSizePresetSettings`, `writeScaleMultiplier={false}` explicit)              | style       | keep, duplicate-of-Style | no                         |                                                  |
| cardColor      | surfaceColor (`SurfaceColorSettings`)                                                           | style       | keep, duplicate-of-Style | no                         | Fallback `'#ffffff'`.                            |
| cardOpacity    | slider (`SurfaceColorSettings`)                                                                 | style       | keep, duplicate-of-Style | no                         | Fallback `1`.                                    |

`NeedDoPutThenConfig.drawerSize` exists in `types.ts` but is not written by either settings
component here — it is a `WidgetData`-adjacent runtime field set elsewhere (front-face drag/resize
of the drawer tray), out of scope for this inventory row.

Labels: 9 labels (4 `CollapsibleSection` headers: "What you need", "What you do", "Where it goes",
"What's next"; plus Typography ×2, TextSizePreset ×1, Surface ×2), 0 help strings (only `title`
tooltip attributes on icon buttons, e.g. "Restore defaults", "Remove item" — not visible help text),
t(): none.

Pre-migration config fixture:

```json
{
  "needItems": [
    {
      "id": "n1",
      "label": "Pencil",
      "icon": "Pencil",
      "color": "#3b82f6",
      "checked": true
    }
  ],
  "doItems": ["Read the passage", "Answer the questions"],
  "putItems": [
    {
      "id": "p1",
      "label": "Turn-in bin",
      "icon": "Package",
      "color": "#22c55e",
      "checked": true
    }
  ],
  "thenItems": [
    {
      "id": "t1",
      "label": "Read quietly",
      "icon": "BookOpen",
      "color": "#f59e0b"
    }
  ],
  "fontFamily": "font-sans",
  "fontColor": "#1e293b",
  "textSizePreset": "medium",
  "cardColor": "#ffffff",
  "cardOpacity": 1
}
```

## stations - components/widgets/Stations/Settings.tsx (324 lines)

| key         | control                                                                                                                                                                                                                                  | group guess | keep/remove/rename       | in-defaults? | notes                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| stations    | list (delegated to `./components/StationEditor`: title text, color, image upload, reorder up/down, delete)                                                                                                                               | content     | keep                     | yes (`[]`)   | Reorder always renormalizes `order` to `0..N-1`.                                                                         |
| assignments | custom: cleared/remapped as a side effect of station add/delete/preset-load; no direct field in this file (assignment itself happens on the widget face, drag-and-drop)                                                                  | behavior    | keep                     | yes (`{}`)   | Only ever written here to strip a deleted station's id or wipe on preset load — not a user-facing control in this panel. |
| —           | button: "Send Station Names to Randomizer" (writes into a _different_ widget's config — `RandomConfig.firstNames`/`lastNames`/`rosterMode` on the board's Randomizer widget, a cross-widget "Nexus" action, not a `stations` config key) | behavior    | n/a                      | n/a          | Flagging because it is a config-writing control that belongs to another widget type entirely.                            |
| —           | delegated to `./components/SavedPresetsPanel` (load/save/delete named presets to `savedWidgetPresets.stations`, a profile field, not board config)                                                                                       | content     | n/a                      | n/a          | Not inventoried further — out of this file's own JSX, and writes to `savedWidgetPresets`, not `widget.config`.           |
| fontFamily  | fontFamily (`TypographySettings`)                                                                                                                                                                                                        | style       | keep, duplicate-of-Style | no           | Fallback `'global'`.                                                                                                     |
| fontColor   | color (`TypographySettings`)                                                                                                                                                                                                             | style       | keep, duplicate-of-Style | no           | No fallback default in front face (`const fontColor = config.fontColor;`, used directly, may be `undefined`).            |
| cardColor   | surfaceColor (`SurfaceColorSettings`, `label="Card surface"`)                                                                                                                                                                            | style       | keep, duplicate-of-Style | no           | Fallback `'#f8fafc'`.                                                                                                    |
| cardOpacity | slider (`SurfaceColorSettings`)                                                                                                                                                                                                          | style       | keep, duplicate-of-Style | no           | Fallback `0.4`.                                                                                                          |

Labels: at least 6 labels in this file (own "Stations", "Connect with Randomizer"; Typography ×2;
Surface's "Card surface" + "Opacity") — `StationEditor` and `SavedPresetsPanel` are separate files
with their own labels not enumerated here (out of scope: they are not `Settings.tsx`). 0 help
strings in this file's own JSX beyond one conditional info box ("Add a Randomizer widget to send
your station names to it." — counts as 1 help string, so 7 labels/1 help combined for the file
proper), t(): none.

Pre-migration config fixture:

```json
{
  "stations": [
    { "id": "s1", "title": "Reading", "color": "#3b82f6", "order": 0 }
  ],
  "assignments": { "student-1": "s1" },
  "fontFamily": "font-sans",
  "fontColor": "#1e293b",
  "cardColor": "#f8fafc",
  "cardOpacity": 0.4
}
```

## stickers - components/widgets/stickers/StickerBookSettings.tsx (21 lines)

No `WIDGET_SETTINGS_COMPONENTS` entry exists for `stickers` — only an appearance component is
registered (per the registry's own comment: "All sticker configuration lives in the appearance
panel"). Sticker CRUD (upload, favorite, reorder) happens on the widget face via drag-and-drop, not
through any settings/appearance panel.

| key         | control                               | group guess | keep/remove/rename | in-defaults?      | notes                                                                                                                                          |
| ----------- | ------------------------------------- | ----------- | ------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| fontFamily  | fontFamily (`TypographySettings`)     | style       | **dead control**   | no                | Never referenced anywhere in `StickerBookWidget.tsx` (no `fontFamily`/`fontColor`/`cardColor`/`cardOpacity` matches at all in the front face). |
| fontColor   | color (`TypographySettings`)          | style       | **dead control**   | no                | Same — never read.                                                                                                                             |
| cardColor   | surfaceColor (`SurfaceColorSettings`) | style       | **dead control**   | yes (`'#ffffff'`) | In `widgetDefaults.ts` but still never read by the front face — a default written for a key nothing consumes.                                  |
| cardOpacity | slider (`SurfaceColorSettings`)       | style       | **dead control**   | yes (`1`)         | Same — defaulted but unread.                                                                                                                   |

This is the one widget in Part C where the entire Style tab is dead: every key it writes is either
never read by the front face at all, or is seeded into `widgetDefaults.ts` for a widget that never
looks at it. Worth flagging to the orchestrator as a real (not `duplicate-of-Style`) bug independent
of this migration.

Labels: 4 labels (Typography ×2, Surface ×2), 0 help strings, t(): none.

Pre-migration config fixture:

```json
{
  "uploadedUrls": ["https://example.com/sticker1.png"],
  "favorites": [],
  "stickerOrder": [],
  "cardColor": "#ffffff",
  "cardOpacity": 1,
  "fontFamily": "font-sans",
  "fontColor": "#334155"
}
```

## Summary

| widget              | keys                 | labels        | help | t()  | not-in-defaults                                                                |
| ------------------- | -------------------- | ------------- | ---- | ---- | ------------------------------------------------------------------------------ |
| blending-board      | 0                    | 0             | 0    | none | n/a                                                                            |
| specialist-schedule | 7                    | 15            | 0    | none | recurringItems, fontFamily, fontColor, textSizePreset                          |
| graphic-organizer   | 4                    | 4             | 0    | none | fontFamily                                                                     |
| reveal-grid         | 9                    | 14            | 3    | none | setName, activeDriveFileId, fontFamily, defaultCardColor, defaultCardBackColor |
| numberLine          | 11                   | 16            | 0    | none | fontFamily, fontColor                                                          |
| syntax-framer       | 3                    | 3             | 2    | none | (none — all 3 keys are in defaults)                                            |
| hotspot-image       | 3                    | 7             | 2    | none | (none — all 3 keys are in defaults)                                            |
| concept-web         | 7                    | 5             | 1    | none | defaultNodeWidth, defaultNodeHeight, fontFamily                                |
| starter-pack        | 0                    | 1             | 3    | none | n/a                                                                            |
| video-activity      | 3                    | 3             | 3    | none | autoPlay, requireCorrectAnswer, allowSkipping                                  |
| guided-learning     | 1                    | 1             | 1    | none | view                                                                           |
| custom-widget       | 1                    | 0 (dynamic)   | 0    | none | adminSettings                                                                  |
| activity-wall       | 4                    | 4             | 2    | none | fontFamily, fontColor, cardColor, cardOpacity                                  |
| work-symbols        | 4                    | 4             | 0    | none | fontFamily, fontColor, textSizePreset, titlePosition                           |
| blooms-taxonomy     | 1                    | 1 + N dynamic | 1    | none | enabledCategories                                                              |
| talking-tool        | 4                    | 4             | 2    | none | fontFamily (dead), fontColor (dead), cardColor, cardOpacity                    |
| need-do-put-then    | 9                    | 9             | 0    | none | fontFamily, fontColor, textSizePreset, cardColor, cardOpacity                  |
| stations            | 4 (+2 cross-cutting) | 7             | 1    | none | fontFamily, fontColor, cardColor, cardOpacity                                  |
| stickers            | 4 (all dead)         | 4             | 0    | none | fontFamily, fontColor (cardColor/cardOpacity are in defaults but still dead)   |

# Burndown

Updated once per wave by the orchestrator (widget · wave · PR · done). Wave-2 rows retired their
0.4 legacy snapshots in the same PR. The consolidated wave-3/5 branch replaces the rejected
whole-panel `compositeControl` shims with field-level schemas. Its ten remaining `Custom` fields
are isolated gaps: board import actions (1), cross-widget/partner actions (2), derived roster
sliders (2), inherited or contextual controls (3), a contextual sound multi-select (1), and a
fixed drawing color palette (1). All standard fields and list-row labels are indexed by the
find-a-setting filter.

| Widget                 | Type                    | Wave | PR                                              | Done |
| ---------------------- | ----------------------- | ---- | ----------------------------------------------- | ---- |
| Timer                  | `time-tool`             | 2    | `feat/settings-drawer-w2`                       | yes  |
| Note                   | `text`                  | 2    | `feat/settings-drawer-w2`                       | yes  |
| Embed                  | `embed`                 | 2    | `feat/settings-drawer-w2`                       | yes  |
| Clock                  | `clock`                 | 2    | `feat/settings-drawer-w2`                       | yes  |
| Lunch                  | `lunchCount`            | 2    | `feat/settings-drawer-w2`                       | yes  |
| Tasks                  | `checklist`             | 3    | `codex/consolidate-field-level-widget-settings` | yes  |
| Weather                | `weather`               | 3    | `codex/consolidate-field-level-widget-settings` | yes  |
| Expectations           | `expectations`          | 3    | `codex/consolidate-field-level-widget-settings` | yes  |
| Random                 | `random`                | 3    | `codex/consolidate-field-level-widget-settings` | yes  |
| Links                  | `url`                   | 3    | `codex/consolidate-field-level-widget-settings` | yes  |
| Soundboard             | `soundboard`            | 5    | `codex/consolidate-field-level-widget-settings` | yes  |
| Dice                   | `dice`                  | 5    | `codex/consolidate-field-level-widget-settings` | yes  |
| Sound Meter            | `sound`                 | 5    | `codex/consolidate-field-level-widget-settings` | yes  |
| Webcam                 | `webcam`                | 5    | `codex/consolidate-field-level-widget-settings` | yes  |
| Drawing                | `drawing`               | 5    | `codex/consolidate-field-level-widget-settings` | yes  |
| QR Code                | `qr`                    | 6    | current work                                    | yes  |
| Scoreboard             | `scoreboard`            | 6    | current work                                    | yes  |
| Calendar               | `calendar`              | 6    | current work                                    | yes  |
| Poll                   | `poll`                  | 6    | current work                                    | yes  |
| Routines               | `instructionalRoutines` | 6    | current work                                    | yes  |
| Specialist Schedule    | `specialist-schedule`   | 7    | current work                                    | yes  |
| Graphic Organizer      | `graphic-organizer`     | 7    | current work                                    | yes  |
| Reveal Grid            | `reveal-grid`           | 7    | current work                                    | yes  |
| Number Line            | `numberLine`            | 7    | current work                                    | yes  |
| Syntax Framer          | `syntax-framer`         | 7    | current work                                    | yes  |
| Hotspot Image          | `hotspot-image`         | 8    | current work                                    | yes  |
| Concept Web            | `concept-web`           | 8    | current work                                    | yes  |
| Starter Pack           | `starter-pack`          | 8    | current work                                    | yes  |
| Video Activity         | `video-activity`        | 8    | current work                                    | yes  |
| Guided Learning        | `guided-learning`       | 8    | current work                                    | yes  |
| Countdown              | `countdown`             | 9    | current work                                    | yes  |
| Work Symbols           | `work-symbols`          | 9    | current work                                    | yes  |
| Bloom's Taxonomy       | `blooms-taxonomy`       | 9    | current work                                    | yes  |
| Need / Do / Put / Then | `need-do-put-then`      | 9    | current work                                    | yes  |
| Stations               | `stations`              | 9    | current work                                    | yes  |
| Materials              | `materials`             | 10   | current work                                    | yes  |
| Seating Chart          | `seating-chart`         | 10   | current work                                    | yes  |
| Schedule               | `schedule`              | 10   | current work                                    | yes  |
| Recess Gear            | `recessGear`            | 10   | current work                                    | yes  |
| PDF                    | `pdf`                   | 10   | current work                                    | yes  |
| Quiz                   | `quiz`                  | 11   | current work                                    | yes  |
| Breathing              | `breathing`             | 11   | current work                                    | yes  |
| Math Tools             | `mathTools`             | 11   | current work                                    | yes  |
| Math Tool Instance     | `mathTool`              | 11   | current work                                    | yes  |
| Next Up                | `nextUp`                | 11   | current work                                    | yes  |
| Music                  | `music`                 | 12   | current work                                    | yes  |
| Car Rider Pro          | `car-rider-pro`         | 12   | current work                                    | yes  |
| Blending Board         | `blending-board`        | 12   | current work                                    | yes  |
| First 5                | `first-5`               | 12   | current work                                    | yes  |
| Custom Widget          | `custom-widget`         | 12   | current work                                    | yes  |
| Catalyst               | `catalyst`              | 13   | current work                                    | yes  |
| Catalyst Guide         | `catalyst-instruction`  | 13   | current work                                    | yes  |
| Catalyst Visual        | `catalyst-visual`       | 13   | current work                                    | yes  |
| Smart Notebook         | `smartNotebook`         | 13   | current work                                    | yes  |
| Mini App               | `miniApp`               | 13   | current work                                    | yes  |
| Traffic Light          | `traffic`               | 13   | current work                                    | yes  |
| Classes                | `classes`               | 13   | current work                                    | yes  |
