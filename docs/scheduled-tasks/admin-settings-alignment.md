# Admin Config & Settings Alignment — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Thursday_
_Last audited: 2026-05-31_
_Last action: 2026-06-04_

---

## In Progress

_Nothing currently in progress._

---

## Open

_2026-06-04 action notes: Selected the MEDIUM appearance-settings group (highest-severity Open item across all journals read today; widget-registry/css-scaling/typescript-eslint dailies had no item ≥ this severity). Resolved the two tractable widgets in the group — `concept-web` and `checklist` (option a). `smartNotebook` (BLOCKED, file-recency) and `stations` (needs new infrastructure) remain. Branch base brought up to date with `origin/dev-paul` via merge (rebase was intractable — 44 journal-file conflicts), consistent with how this branch was previously synced. See the group MEDIUM item and the new Completed entry for detail._

_2026-05-31 audit notes: Reviewed all changes since 2026-05-24. (1) Scoreboard gained `layout?: 'cards' | 'rows'` in `ScoreboardConfig` (commit 4f5d2bb6) — added as a user-configurable toggle in Settings.tsx. `BuildingScoreboardDefaults` does not include `layout`; `ScoreboardConfigurationPanel.tsx` exposes only team defaults; `case 'scoreboard':` in `adminBuildingConfig.ts` passes through only `teams`. New LOW gap added. (2) Classroom-addon commits (VA grade push, grade passback, assignment settings, PLC parity) added `ClassroomAddonContext`, `ClassroomCourseWork`, and session types to types.ts — none are widget-config fields; no building defaults impact. (3) Notebook fix (#1759) and Spotify fix (#1758) are logic-only; no config changes. (4) NumberLine ConfigurationPanel fix already captured in Completed. No new HIGH or MEDIUM items._

_2026-05-24 audit notes: Reviewed all changes since 2026-05-17. (1) Music widget gained `source` (curated/personal/curated-spotify), `layout`, and `personalSpotify*` fields in MusicConfig — these are user-level preferences; personal-spotify access is gated via `canAccessFeature('personal-spotify')` (GlobalFeaturePermission + `buildings?:string[]`), not through building defaults. No building-defaults admin config needed for music. (2) QuizBehaviorSettings added new behavior fields to QuizConfig and VideoActivityConfig — quiz behavior is set per-quiz in the quiz editor, not per-building. No building defaults needed. (3) `refactor(admin)` commit (31e46ad3) removed magic/record/remote panels — already captured in Completed item. (4) SmartNotebook continues to accumulate features but its existing open item (appearance fields gap) covers the new work. No new MEDIUM or HIGH items. One new LOW item added (guided-learning stub panel)._

### MEDIUM Appearance settings (cardColor, cardOpacity, fontFamily, fontColor) exposed in user Settings.tsx but absent from admin building config

- **Detected:** 2026-04-16 (expanded 2026-05-03)
- **File:** types.ts, context/DashboardContext.tsx (getAdminBuildingConfig)
- **Detail:** Multiple widgets expose appearance controls in their user-facing Settings.tsx (via `SurfaceColorSettings` and `TypographySettings`) and have the corresponding fields in their `types.ts` config interface, but these fields are not handled in `getAdminBuildingConfig()` and are not controllable from any admin ConfigurationPanel. Admins cannot set per-building appearance defaults for these widgets. Affected widgets:
  - `smartNotebook` — `cardColor`, `cardOpacity`, `fontFamily`, `fontColor` fields in `SmartNotebookConfig`; `getAdminBuildingConfig` handles only `storageLimitMb`
  - ~~`concept-web`~~ — RESOLVED 2026-06-04 (see Completed below)
  - ~~`numberLine`~~ — RESOLVED 2026-05-28 (see Completed below)
  - ~~`checklist`~~ — RESOLVED 2026-06-04 (see Completed below)
  - `stations` — `fontFamily`, `fontColor`, `cardColor`, `cardOpacity` fields in `StationsConfig` (added 2026-05-03); exposed via `TypographySettings` + `SurfaceColorSettings` in `components/widgets/Stations/Settings.tsx`; no `StationsConfigurationPanel` exists and `stations` is not registered in `BUILDING_CONFIG_PANELS` or `getAdminBuildingConfig()`
- **Fix:** For each widget, either (a) add the appearance fields to the widget's `Building*Defaults` interface in `types.ts` and add them to the `getAdminBuildingConfig()` case, plus expose them in the `*ConfigurationPanel.tsx`; or (b) add a note in the config interface comment that appearance fields are intentionally user-only and not admin-configurable per building.
- **2026-05-28 progress:** Resolved `numberLine` (option a) — moved to Completed. SmartNotebook deferred: SmartNotebook/\* files modified in the last 5 commits (`fix(pr-1718)` 8fcf9267 + `fix(smart-notebook)` 5ff93db2), so per the file-recency rule the smartNotebook subset is BLOCKED for this session. Other 3 widgets (concept-web, checklist, stations) remain Open — stations also needs new infrastructure (no `BuildingStationsDefaults` interface, no `StationsConfigurationPanel`, not registered in `BUILDING_CONFIG_PANELS`).
- **2026-06-04 progress:** Resolved `concept-web` and `checklist` (option a) — moved to Completed. **Remaining: `smartNotebook` and `stations`.** `stations` still needs new infrastructure (no `BuildingStationsDefaults` interface, no `StationsConfigurationPanel`, not registered in `BUILDING_CONFIG_PANELS`); `smartNotebook` should be re-checked for file-recency before action. Note carved out during the concept-web work: `ConceptWebConfig.fontColor` exists (written by the shared `TypographySettings` panel) but ConceptWeb's widget renders node text with a hardcoded `text-slate-800` and never reads `config.fontColor` — so concept-web's `fontColor` is a dead field even at the user level. It was therefore **not** wired into the admin building default (doing so would create a dead admin control); this is documented inline in both `types.ts` and `utils/adminBuildingConfig.ts`. A separate user-level question — whether ConceptWeb's node text should consume `fontColor` or whether the field should be removed from the Settings panel — is out of scope for this admin-config task and is not currently tracked elsewhere.

### LOW Checklist: `rosterMode` user-configurable but not in admin building config

- **Detected:** 2026-04-16
- **File:** types.ts (ChecklistConfig / BuildingChecklistDefaults), context/DashboardContext.tsx (~line 2183)
- **Detail:** `ChecklistConfig` has a `rosterMode` field that controls whether the checklist uses a manually-entered list or a synced class roster. Users can toggle this in Settings.tsx. `BuildingChecklistDefaults` does not include `rosterMode`, so admins cannot set a default roster mode per building.
- **Fix:** Add `rosterMode` to `BuildingChecklistDefaults` in types.ts. Add it to the `case 'checklist'` handler in `getAdminBuildingConfig()`. Expose a toggle in `ChecklistConfigurationPanel.tsx`.

### LOW Scoreboard: `layout` user-configurable but not in admin building config

- **Detected:** 2026-05-31
- **File:** types.ts (ScoreboardConfig / BuildingScoreboardDefaults), utils/adminBuildingConfig.ts (case 'scoreboard'), components/admin/ScoreboardConfigurationPanel.tsx
- **Detail:** Commit `4f5d2bb6` added `layout?: 'cards' | 'rows'` to `ScoreboardConfig` and exposed it as a toggle in `Scoreboard/Settings.tsx`. However, `BuildingScoreboardDefaults` only has `buildingId` and `teams?` — no `layout` field. `ScoreboardConfigurationPanel.tsx` exposes only team defaults. The `case 'scoreboard':` handler in `adminBuildingConfig.ts` passes through only `teams`. Admins cannot set a per-building default layout mode.
- **Fix:** Add `layout?: 'cards' | 'rows'` to `BuildingScoreboardDefaults` in `types.ts`. Add `layout` extraction to the `case 'scoreboard':` handler in `adminBuildingConfig.ts` (validate against allowlist `['cards', 'rows']`). Add a 2-segment pill toggle for "Default Layout" (Cards / Rows) in `ScoreboardConfigurationPanel.tsx`, following the existing pattern from `ClockConfigurationPanel.tsx` for multi-option defaults.

### MEDIUM `activity-wall` admin ConfigurationPanel writes building defaults that nothing reads

- **Detected:** 2026-05-17
- **File:** components/admin/ActivityWallConfigurationPanel.tsx, utils/adminBuildingConfig.ts, types.ts
- **Detail:** `ActivityWallBuildingConfig` (types.ts:1226) defines three per-building admin defaults: `defaultMode` (text/photo), `defaultIdentificationMode` (anonymous/name/pin/name-pin), and `defaultModerationEnabled` (boolean). `ActivityWallGlobalConfig` (types.ts:1232) holds `buildingDefaults: Record<string, ActivityWallBuildingConfig>`. `ActivityWallConfigurationPanel.tsx` is fully implemented — it correctly reads/writes these per-building values via `BuildingSelector`. However: (1) there is no `case 'activity-wall':` in `utils/adminBuildingConfig.ts`, so `getAdminBuildingConfig('activity-wall')` falls through to `default: break` returning `{}`; (2) more importantly, `ActivityWallConfig` (the widget instance config, types.ts:1237) has no `defaultMode`, `defaultIdentificationMode`, or `defaultModerationEnabled` fields at all — these are _activity-level_ defaults, not widget-level defaults; (3) no code in `components/widgets/ActivityWall/` or `hooks/useActivityWallLibrary.ts` reads from `featurePermissions['activity-wall']` to apply building defaults when creating new activities. The admin panel stores data correctly in Firestore but nothing ever reads it.
- **Fix:** In `components/widgets/ActivityWall/` (likely in the activity creation path inside `useActivityWallLibrary.ts` or the widget's new-activity handler), read `featurePermissions['activity-wall']` directly (pattern: `(featurePermissions['activity-wall']?.config as ActivityWallGlobalConfig | undefined)?.buildingDefaults?.[selectedBuilding]`) and apply `defaultMode`, `defaultIdentificationMode`, and `defaultModerationEnabled` as initial values when a teacher creates a new activity. No widget-config fields need to be added; the defaults should be applied at activity-creation time, not at widget-creation time. A `case 'activity-wall':` in `adminBuildingConfig.ts` is NOT needed since these aren't widget-level fields.

### LOW `guided-learning` registered in BUILDING_CONFIG_PANELS with stub info-only panel

- **Detected:** 2026-05-24
- **File:** components/admin/GuidedLearningConfigurationPanel.tsx, components/admin/FeatureConfigurationPanel.tsx (~line 132)
- **Detail:** `GuidedLearningConfigurationPanel` is registered in `BUILDING_CONFIG_PANELS` in `FeatureConfigurationPanel.tsx`. The panel renders only an informational message: "Guided Learning settings are managed directly — please interact with the widget directly on your board." It has no `onChange` handler, writes nothing to Firestore, and there is no building defaults infrastructure for guided-learning (`GuidedLearningConfig` does not have a `BuildingGuidedLearningDefaults` interface in types.ts, and there is no `case 'guided-learning':` in `utils/adminBuildingConfig.ts`). The GuidedLearning widget reads `widget.config` directly — it does not read from feature_permissions at all. The admin panel button for this widget opens a panel that provides no functional value and shows a message that could be misleading (implying settings exist but are in-widget only).
- **Fix:** Option (a): Remove `guided-learning` from `BUILDING_CONFIG_PANELS` so the admin UI falls through to the standard "No global settings available for this widget." placeholder — more accurate than an info stub. Option (b): If guided-learning admin defaults are genuinely planned (e.g., default view, default set library source), implement building defaults infrastructure (types.ts interface + adminBuildingConfig.ts case + real panel controls). Option (a) is lower-effort and more honest about current state.

### MEDIUM `need-do-put-then` has stub admin config panel but no getAdminBuildingConfig handler

- **Detected:** 2026-04-26
- **File:** components/admin/NeedDoPutThenConfigurationPanel.tsx, context/DashboardContext.tsx (getAdminBuildingConfig)
- **Detail:** `need-do-put-then` was added with `NeedDoPutThenConfigurationPanel.tsx` registered in `BUILDING_CONFIG_PANELS`. However: (1) the panel is a non-functional stub showing "No building-level defaults yet" with no input controls; (2) there is no `case 'need-do-put-then':` in `getAdminBuildingConfig()` in DashboardContext.tsx; (3) `NeedDoPutThenConfig` (types.ts:2897) has no building defaults interface. When a teacher adds the widget, `getAdminBuildingConfig('need-do-put-then')` falls through to `default: break` and returns `{}`. The admin gear button for this widget opens a panel but provides no functional controls and stores nothing useful.
- **Fix:** Either (a) implement building-level defaults for the widget: add a `NeedDoPutThenBuildingDefaults` interface to types.ts, add a `case 'need-do-put-then':` handler in `getAdminBuildingConfig()`, and replace the stub panel with actual form controls for preset items per column; or (b) remove `NeedDoPutThenConfigurationPanel` from `BUILDING_CONFIG_PANELS` so the admin UI shows the standard "No global settings available" placeholder instead of a misleading stub.

---

## Completed

### MEDIUM ConceptWeb & Checklist appearance fields absent from admin building defaults

- **Detected:** 2026-04-16 (carved out from group MEDIUM 2026-06-04)
- **Completed:** 2026-06-04
- **File:** types.ts (`BuildingConceptWebDefaults`, `BuildingChecklistDefaults`), utils/adminBuildingConfig.ts (`case 'concept-web'`, `case 'checklist'`), components/admin/ConceptWebConfigurationPanel.tsx, components/admin/ChecklistConfigurationPanel.tsx, components/admin/HexColorField.tsx (new shared control), tests/utils/adminBuildingConfig.test.ts
- **Detail:** `ConceptWebConfig` exposed `cardColor`/`cardOpacity` (consumed by `ConceptWeb/Widget.tsx:60-61,385` via `hexToRgba`) and `ChecklistConfig` exposed `fontFamily`/`fontColor`/`cardColor`/`cardOpacity` (consumed by `Checklist/components/ChecklistCard.tsx:42-43,81` + `Widget.tsx` `font-${fontFamily}`), but the `Building*Defaults` interfaces and `getAdminBuildingConfig()` cases passed through only node-dimension/font-family (concept-web) and items/scaleMultiplier (checklist). Admins could not set per-building appearance defaults for these two widgets.
- **Resolution:** Chose fix option (a).
  - **concept-web:** Added `cardColor` + `cardOpacity` to `BuildingConceptWebDefaults`; extended the `case 'concept-web'` validator (`isHexColor` for `cardColor`, `0..1` finite check for `cardOpacity`) and tightened the existing `fontFamily` check to the shared `isGlobalFontFamily()` allowlist; added an "Appearance Defaults" section (surface colour + opacity) to `ConceptWebConfigurationPanel.tsx`. **`fontColor` deliberately NOT wired** — ConceptWeb's node text is hardcoded `text-slate-800` and never reads `config.fontColor`, so a per-building default would be a dead control (documented inline in `types.ts` + `adminBuildingConfig.ts`).
  - **checklist:** Added `fontFamily` + `fontColor` + `cardColor` + `cardOpacity` to `BuildingChecklistDefaults`; extended the `case 'checklist'` validator with the same allowlist/hex/opacity checks; added an "Appearance Defaults" section (font family + text colour + surface colour + opacity) to `ChecklistConfigurationPanel.tsx` in the panel's existing `text-xxs` visual style.
  - **Shared infra:** Hoisted a module-level `VALID_FONT_FAMILIES` constant + `isGlobalFontFamily()` guard in `adminBuildingConfig.ts` (the `numberLine` case was refactored to use it, eliminating a duplicate inline array). Extracted a reusable `HexColorField` admin control (native colour swatch + debounced on-blur hex text input + Clear button — cost-conscious for Firestore) used by both new panels; `NumberLineConfigurationPanel` keeps its equivalent local copy and could adopt `HexColorField` later.
- **Verification:** `pnpm run type-check` clean; `pnpm exec eslint` (the 5 changed source/test files) `--max-warnings 0` clean; `pnpm exec prettier --check` clean. `pnpm exec vitest run tests/utils/adminBuildingConfig.test.ts` — 25 tests pass (added `describe('concept-web')` with 3 cases incl. a "does not wire fontColor" guard, and `describe('checklist')` with 2 cases incl. UUID-refresh assertion on items).

### MEDIUM NumberLine appearance fields (cardColor, cardOpacity, fontFamily, fontColor) absent from admin building defaults

- **Detected:** 2026-04-16 (carved out from group MEDIUM 2026-05-28)
- **Completed:** 2026-05-28
- **File:** types.ts (BuildingNumberLineDefaults), utils/adminBuildingConfig.ts (case 'numberLine'), components/admin/NumberLineConfigurationPanel.tsx, tests/utils/adminBuildingConfig.test.ts
- **Detail:** `NumberLineConfig` exposed `cardColor`, `cardOpacity`, `fontFamily`, and `fontColor` (consumed by `NumberLine/Widget.tsx` lines 43-44 and 130 via `hexToRgba(cardColor, cardOpacity)`), but `BuildingNumberLineDefaults` was a `Pick<NumberLineConfig, 'min' | 'max' | 'step' | 'displayMode' | 'showArrows'>` — appearance fields were not selectable for per-building defaults and the `NumberLineConfigurationPanel` had no controls for them.
- **Resolution:** Chose fix option (a) — extended the `Pick<>` set in `BuildingNumberLineDefaults` to include `cardColor | cardOpacity | fontFamily | fontColor`. Added validation in the `case 'numberLine'` handler in `utils/adminBuildingConfig.ts`: `cardColor`/`fontColor` validated as non-empty trimmed strings; `cardOpacity` validated as finite number in `[0, 1]` (matches the `0..1` value space written by `SurfaceColorSettings`); `fontFamily` validated as non-empty trimmed string (the `GlobalFontFamily` discriminated-union narrowing happens via the `Pick<>` typing). Added "Appearance Defaults" section to `NumberLineConfigurationPanel.tsx` with a font-family `<select>` (matching the unprefixed value space of ConceptWeb's panel — `'global' | 'sans' | 'serif' | ...`), a text-color picker, a surface-color picker, and a surface-opacity slider — all following the existing panel's plain-input visual style. Added three new tests under a `describe('numberLine')` block in `tests/utils/adminBuildingConfig.test.ts`: valid pass-through of all 9 fields, rejection of empty/invalid appearance values, and acceptance of `cardOpacity` at both bounds (0 and 1). `pnpm exec tsc --noEmit`, `pnpm exec eslint ... --max-warnings 0`, and `pnpm exec prettier --check` all clean. `pnpm exec vitest run tests/utils/adminBuildingConfig.test.ts` — all 18 tests pass.

### MEDIUM Clock: `clockStyle` and `glow` configurable by user but not included in admin building defaults

- **Detected:** 2026-04-16
- **Completed:** 2026-05-24
- **File:** types.ts (BuildingClockDefaults), utils/adminBuildingConfig.ts (case 'clock'), components/admin/ClockConfigurationPanel.tsx, tests/utils/adminBuildingConfig.test.ts
- **Detail:** `ClockConfig` exposed `clockStyle` ('modern' | 'lcd' | 'minimal') and `glow` (boolean) in user `ClockSettings.tsx`, but `BuildingClockDefaults` and the `case 'clock'` handler in `getAdminBuildingConfig()` only passed through `format24`, `fontFamily`, and `themeColor`. Admins could not set per-building clock display style or glow effect.
- **Resolution:** Chose fix option (a) — implemented building defaults for both fields. (1) Added `clockStyle?: 'modern' | 'lcd' | 'minimal'` and `glow?: boolean` to `BuildingClockDefaults` in `types.ts`. (2) Updated `case 'clock'` in `utils/adminBuildingConfig.ts` to extract both fields with validation: `clockStyle` is validated against the `['modern', 'lcd', 'minimal']` allowlist, `glow` is validated with `typeof === 'boolean'` (matches the existing pattern from `reveal-grid` / `countdown` cases). (3) Added a 3-segment "Default Display Style" pill and a "Glow Effect" toggle to `ClockConfigurationPanel.tsx`, matching the existing visual pattern of the Font Family pill and 24-Hour Format toggle. (4) Added two new tests under a `describe('clock')` block in `tests/utils/adminBuildingConfig.test.ts`: one for valid pass-through (all five fields), one for rejection of unknown `clockStyle` and non-boolean `glow`. `pnpm exec tsc --noEmit`, `pnpm exec eslint ... --max-warnings 0`, and `pnpm exec prettier --check` all clean. `pnpm exec vitest run tests/utils/adminBuildingConfig.test.ts` — all 13 tests pass.

### MEDIUM 5 widgets have ConfigurationPanels but no Building\*Defaults type infrastructure

- **Detected:** 2026-04-16
- **Completed:** 2026-05-21
- **File:** components/admin/FeatureConfigurationPanel.tsx (+ deleted MagicConfigurationPanel.tsx, RecordConfigurationPanel.tsx, RemoteConfigurationPanel.tsx, SchemaDrivenConfigurationPanel.tsx)
- **Detail:** The original entry flagged `mathTools`, `recessGear`, `magic`, `record`, and `remote` as registered in `BUILDING_CONFIG_PANELS` with "no application logic." On investigation the five split into two groups:
  - **`mathTools` and `recessGear` — NOT dead UI; the original premise was inaccurate.** Both are fully functional via the _global-config_ pattern rather than the `buildingDefaults` / `getAdminBuildingConfig()` pattern. `MathTools/Widget.tsx:34-46` reads `featurePermissions.find(p => p.widgetType === 'mathTools')?.config` as `MathToolsGlobalConfig` and applies `toolGradeLevels` + `dpiCalibration`. `RecessGear/Widget.tsx:47` reads the admin permission's `config` as `RecessGearGlobalConfig` and applies `temperatureRanges`. These panels write structured, typed, consumed config — they correctly do **not** need a `Building*Defaults` interface or a `getAdminBuildingConfig` case. No action required; re-classified as not-an-issue.
  - **`magic`, `record`, `remote` — genuinely dead/stub admin UI (fix option b applied).** A whole-codebase grep confirmed `MagicConfigurationPanel`'s keys (`dailyRateLimit`, `promptSuggestions`) and `RecordConfigurationPanel`'s keys (`maxDurationMinutes`, `maxResolution`) appear **only** in their own panels — nothing in `components/`, `hooks/`, `utils/`, or the cloud functions ever reads them. `RemoteConfigurationPanel` was an explicit "No additional global settings available" stub; `RemoteGlobalConfig` only carries `dockDefaults`, which is already handled by the always-rendered `DockDefaultsPanel` at the top of `FeatureConfigurationPanel`, independent of the `BUILDING_CONFIG_PANELS` entry.
- **Resolution:** Chose fix option (b) for the three dead/stub panels — wiring them up (option a) would require unspecified feature work (AI quota enforcement for `magic`, screen-recording constraints for `record`) that is out of scope for a config-alignment cleanup. Removed the `magic`, `record`, and `remote` imports and `BUILDING_CONFIG_PANELS` entries from `FeatureConfigurationPanel.tsx`; all three now fall through to the standard "No global settings available for this widget." placeholder. Deleted the three now-unused panel files plus `SchemaDrivenConfigurationPanel.tsx`, which was orphaned once `magic`/`record` (its only consumers) were removed. `remote`'s dock-visibility control is unaffected (still rendered by `DockDefaultsPanel`). `RemoteGlobalConfig` left in `types.ts` (harmless unused export documenting the dockDefaults shape). `pnpm type-check` clean (whole project); `pnpm exec eslint components/admin/FeatureConfigurationPanel.tsx --max-warnings 0` and `pnpm exec prettier --check` both clean. No test referenced any removed file.

### HIGH 6 widgets have Building\*Defaults + ConfigurationPanel but no getAdminBuildingConfig handler

- **Detected:** 2026-04-16
- **Completed:** 2026-04-16
- **File:** context/DashboardContext.tsx (getAdminBuildingConfig)
- **Detail:** url, soundboard, schedule, embed, qr, countdown had Building\*Defaults interfaces and registered ConfigurationPanels but no `case` in `getAdminBuildingConfig()`, making admin config dead UI.
- **Resolution:** Added `case` blocks for all 6 widgets in `getAdminBuildingConfig()`:
  - `url`: Copies `urls[]` array with fresh UUIDs to widget config
  - `soundboard`: Combines `availableSounds[].id` + `enabledLibrarySoundIds` + `enabledCustomSoundIds` into `selectedSoundIds`
  - `schedule`: Copies `items` and `schedules` arrays with fresh UUIDs for each schedule and item
  - `embed`: No-op case with comment — building defaults (`hideUrlField`, `whitelistUrls`) are admin constraints consumed via permission config lookup, not widget config fields
  - `qr`: Maps `defaultUrl` → `url`, copies `qrColor` and `qrBgColor`
  - `countdown`: Copies `title`, `startDate`, `eventDate`, `includeWeekends`, `countToday`, `viewMode` (validated against 'number'|'grid')
    All 1129 unit tests pass; `pnpm type-check`, `pnpm lint --max-warnings 0`, and prettier check all clean.
