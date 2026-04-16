# Admin Config & Settings Alignment — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Thursday_
_Last audited: 2026-04-16_
_Last action: 2026-04-16_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM 5 widgets have ConfigurationPanels but no Building\*Defaults type infrastructure

- **Detected:** 2026-04-16
- **File:** types.ts, context/DashboardContext.tsx, components/admin/FeatureConfigurationPanel.tsx
- **Detail:** The following 5 widgets have `*ConfigurationPanel.tsx` components registered in `BUILDING_CONFIG_PANELS` but have NO `Building*Defaults` interface in `types.ts` and NO `buildingDefaults` field on their config interface. The panels collect admin input with no defined schema, no Firestore storage key, and no application logic.
  - `mathTools` — `MathToolsConfigurationPanel` registered
  - `recessGear` — `RecessGearConfigurationPanel` registered
  - `magic` — `MagicConfigurationPanel` registered
  - `record` — `RecordConfigurationPanel` registered
  - `remote` — `RemoteConfigurationPanel` registered
- **Fix:** For each widget, decide: (a) if building-level defaults are genuinely needed, add a `Building*Defaults` interface to types.ts, add a `buildingDefaults` field to the widget's config interface, and add a case in `getAdminBuildingConfig()`; or (b) if admin settings aren't needed, remove the panel from `BUILDING_CONFIG_PANELS` in `FeatureConfigurationPanel.tsx` to avoid confusing admins with non-functional UI.

### MEDIUM Appearance settings (cardColor, cardOpacity, fontFamily, fontColor) exposed in user Settings.tsx but absent from admin building config

- **Detected:** 2026-04-16
- **File:** types.ts, context/DashboardContext.tsx (getAdminBuildingConfig)
- **Detail:** Multiple widgets expose appearance controls in their user-facing Settings.tsx (via `SurfaceColorSettings` and `TypographySettings`) and have the corresponding fields in their `types.ts` config interface, but these fields are not handled in `getAdminBuildingConfig()` and are not controllable from any admin ConfigurationPanel. Admins cannot set per-building appearance defaults for these widgets. Affected widgets:
  - `smartNotebook` — `cardColor`, `cardOpacity`, `fontFamily`, `fontColor` fields in `SmartNotebookConfig`; `getAdminBuildingConfig` handles only `storageLimitMb`
  - `concept-web` — `cardColor`, `cardOpacity`, `fontColor` fields in `ConceptWebConfig`; `getAdminBuildingConfig` handles only `defaultNodeWidth`, `defaultNodeHeight`, `fontFamily`
  - `numberLine` — `cardColor`, `cardOpacity`, `fontFamily`, `fontColor` fields in `NumberLineConfig`; `getAdminBuildingConfig` handles only axis parameters
  - `checklist` — `cardColor`, `cardOpacity`, `fontFamily`, `fontColor` fields in `ChecklistConfig`; `getAdminBuildingConfig` handles only `items`, `scaleMultiplier`
- **Fix:** For each widget, either (a) add the appearance fields to the widget's `Building*Defaults` interface in `types.ts` and add them to the `getAdminBuildingConfig()` case, plus expose them in the `*ConfigurationPanel.tsx`; or (b) add a note in the config interface comment that appearance fields are intentionally user-only and not admin-configurable per building.

### MEDIUM Clock: `clockStyle` and `glow` configurable by user but not included in admin building defaults

- **Detected:** 2026-04-16
- **File:** types.ts (ClockConfig / BuildingClockDefaults), context/DashboardContext.tsx (~line 2153), components/admin/ClockConfigurationPanel.tsx
- **Detail:** `ClockConfig` in types.ts has `clockStyle` and `glow` fields. The user-facing `ClockSettings.tsx` exposes both fields. However, `BuildingClockDefaults` does not include `clockStyle` or `glow`, and `getAdminBuildingConfig` case `'clock'` only applies `format24`, `fontFamily`, and `themeColor`. Admins cannot pre-set clock appearance style or glow effect per building.
- **Fix:** Add `clockStyle` and `glow` to `BuildingClockDefaults` interface in types.ts. Add them to the `case 'clock'` handler in `getAdminBuildingConfig()`. Expose controls for both in `ClockConfigurationPanel.tsx`.

### LOW Checklist: `rosterMode` user-configurable but not in admin building config

- **Detected:** 2026-04-16
- **File:** types.ts (ChecklistConfig / BuildingChecklistDefaults), context/DashboardContext.tsx (~line 2183)
- **Detail:** `ChecklistConfig` has a `rosterMode` field that controls whether the checklist uses a manually-entered list or a synced class roster. Users can toggle this in Settings.tsx. `BuildingChecklistDefaults` does not include `rosterMode`, so admins cannot set a default roster mode per building.
- **Fix:** Add `rosterMode` to `BuildingChecklistDefaults` in types.ts. Add it to the `case 'checklist'` handler in `getAdminBuildingConfig()`. Expose a toggle in `ChecklistConfigurationPanel.tsx`.

---

## Completed

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
