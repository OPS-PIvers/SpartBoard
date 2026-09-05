# Widget Settings Drawer — Implementation Plan

**Date**: 2026-09-05 · **Branch**: `claude/widget-settings-ux-hgbwcy` · **Status**: Decisions locked via design interview (not started)

Replace the per-widget floating settings panel with a docked, schema-driven settings drawer so
every widget's settings look and behave the same way while the live widget stays visible on the
board (WYSIWYG preserved). Decisions below were agreed in an interactive interview on 2026-09-05
and are not open for re-litigation by an implementing session; open questions are listed at the
end and must be raised, not silently answered.

This plan is written to be executed wave-by-wave by fresh sessions. The `pauls-skills:mass-plan-implementation`
skill is the intended driver; if it is not installed, run each wave as file-owned parallel agents
with the orchestrator validating and committing between waves, exactly as
`.claude/workflows/optimize-pass.README.md` describes for its implement phase.

---

## 1. Problem statement

- `components/common/SettingsPanel.tsx` portals a 380px panel beside the widget. Its side
  (right / left / centered) and height vary per widget position and content.
- 62 widgets ship a `*Settings` component and 29 ship a separate `*AppearanceSettings`
  component (`components/widgets/WidgetRegistry.ts`: `WIDGET_SETTINGS_COMPONENTS`,
  `WIDGET_APPEARANCE_COMPONENTS`). Each hand-rolls sections, labels, spacing, and controls.
  The largest run 600–850 lines (`Schedule`, `SpecialistSchedule`, `RevealGrid`, `random`,
  `PollWidget`, `TimeTool`).
- The same concept (color, font, size, toggle, list) is rendered with different controls in
  different widgets. The Style tab shows either `UniversalStyleSettings` or the widget's own
  appearance component, never a predictable set.
- The benefit to keep: the widget on the board updates instantly as a setting changes.

## 2. Locked decisions

| #   | Decision                        | Detail                                                                                                                                                                                                                                                               |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Primary pains**               | Inside-panel structure differs; same setting rendered with different controls. Placement is secondary.                                                                                                                                                               |
| D2  | **Surface**                     | Docked **right-side drawer**, full viewport height. Widget stays live on the board.                                                                                                                                                                                  |
| D3  | **Overlap handling**            | **Auto-pan the canvas** on open so the edited widget is fully visible left of the drawer; restore camera on close. Widget `x/y` never change.                                                                                                                        |
| D4  | **Drawer sizing**               | **Resizable** via left-edge drag handle, clamped 360–560px, default 400px, width persisted per user. One widget at a time: opening settings on another widget swaps the drawer contents.                                                                             |
| D5  | **Consistency depth**           | **Schema-driven fields.** Widgets declare a settings schema; a shared renderer draws it. Custom escape hatch for editors a field can't express.                                                                                                                      |
| D6  | **Field kit v1**                | Everything standardized: basics, color + typography, sortable item list, pickers (see §4.2). Anything not in the kit uses the custom slot and is a tracked gap, not a permanent exception.                                                                           |
| D7  | **Style tab**                   | **One universal Style tab** for all widgets, built from the appearance keys the widget declares it consumes. `WIDGET_APPEARANCE_COMPONENTS` is removed at the end of the series; extra visual knobs move into the schema's `display` group or become universal keys. |
| D8  | **Settings tab groups**         | Fixed order **Content → Behavior → Display**. Empty groups omitted. Style is its own tab.                                                                                                                                                                            |
| D9  | **Scope**                       | Drawer shell applies to every widget from wave 1 (unmigrated widgets render their legacy JSX inside the drawer's custom slot). Internals of the **top 10 by usage** are migrated in this series.                                                                     |
| D10 | **Top-10 source**               | Admin Analytics (Firestore). Wave 0 queries it and writes the list into §6. Provisional list until then: the ten largest panels.                                                                                                                                     |
| D11 | **Cruft cleanup in bounds**     | Remove dead/duplicate controls; rename/normalize config keys with a one-time migration; reorganize into the standard groups with i18n'd labels.                                                                                                                      |
| D12 | **Rollout**                     | **Flag first, delete last.** Drawer ships behind a new global permission `settings-drawer`. Final wave flips the default and deletes `SettingsPanel.tsx`.                                                                                                            |
| D13 | **Custom Widget Builder**       | `CustomWidgetSettingDef` becomes a subset of the new field schema so admin-built widgets render through the same drawer.                                                                                                                                             |
| D14 | **Mobile remote**               | `/remote` (`components/remote/`) untouched this series.                                                                                                                                                                                                              |
| D15 | **Delivery**                    | One PR per wave. Each wave must leave `pnpm run validate` green.                                                                                                                                                                                                     |
| D16 | **Done bar per migrated panel** | Schema unit test + config-migration test + drawer E2E (see §7).                                                                                                                                                                                                      |

## 3. Target UX

**Drawer chrome** (shared by every widget):

1. Header: widget title (`widget.customTitle ?? title`), `WidgetBuildingToggle`, help button
   (existing `useHelpItemsForWidget` / `requestOpenHelp` wiring), close (Esc).
2. Tab bar pinned under the header: **Settings** · **Style**. Same two tabs, always.
3. Scrollable body. Settings tab renders schema groups in D8 order as titled sections. Style tab
   renders the universal style fields the widget opts into, then window background, then
   transparency (moved verbatim from the current panel).
4. Left-edge resize handle (D4). Keyboard: Esc closes; `Alt+S` toggles (already in
   `DraggableWindow`).

**Board behavior**:

- Opening pushes nothing; the drawer overlays the canvas at `Z_INDEX.popover`. The canvas then
  auto-pans so the widget's screen rect fits inside `[PANEL_MARGIN, viewport.width - drawerWidth - PANEL_MARGIN]`
  (D3). If the widget is wider than that band at current zoom, pan to align its left edge and do
  not zoom out (zooming changes what the teacher is previewing).
- Closing restores the pre-open `panOffset`. If the teacher panned manually while the drawer was
  open, do not restore (their explicit camera wins).
- Maximized widgets: no pan; the drawer overlays the right edge.
- Drag or resize of the widget still closes the drawer (existing behavior, keeps position sync
  simple).
- Read-only boards: drawer does not open (existing `isActiveBoardReadOnly` guard).

**Selection**: `widget.flipped === true` remains the single source of truth for "settings open".
Only one widget may be flipped at a time; the drawer host enforces this by un-flipping the
previous widget when a new one flips.

## 4. Architecture

### 4.1 Files (new)

```
components/settings/
├── SettingsDrawer.tsx            # portal host: chrome, tabs, resize, auto-pan hook
├── SettingsDrawerHost.tsx        # mounted once in DashboardView; finds the flipped widget
├── useSettingsDrawerCamera.ts    # auto-pan / restore logic against panOffset + zoom
├── schema/
│   ├── types.ts                  # FieldSchema, GroupSchema, WidgetSettingsSchema
│   ├── defineSettings.ts         # typed helper: defineSettings<Config>({...})
│   ├── validateSchema.ts         # dev-time + test assertions (keys exist in widgetDefaults)
│   └── styleKeys.ts              # UNIVERSAL_STYLE_FIELDS keyed by APPEARANCE_CONFIG_KEYS
├── renderer/
│   ├── SchemaRenderer.tsx        # groups → sections → fields
│   ├── FieldRenderer.tsx         # switch on field.type
│   └── fields/                   # one file per field type (see 4.2)
└── legacy/
    └── LegacySettingsSlot.tsx    # wraps WIDGET_SETTINGS_COMPONENTS[type] until migrated
```

Per widget: `components/widgets/<Widget>/settings.schema.ts` exporting a
`WidgetSettingsSchema<Config>`. Registered in `WidgetRegistry.ts` as
`WIDGET_SETTINGS_SCHEMAS: Partial<Record<WidgetType, () => Promise<WidgetSettingsSchema>>>`
(lazy, like components). `WidgetRenderer.tsx` passes the schema (or `undefined`) to the drawer.

### 4.2 Schema model

```ts
type FieldBase<K> = {
  key: K; // top-level config key; nested keys via 'a.b' are NOT allowed
  label: string; // i18n key, resolved by renderer
  help?: string; // i18n key; rendered as muted line under the control
  visibleWhen?: (config) => boolean;
  disabledWhen?: (config) => boolean;
};

type Field =
  | Toggle
  | Text
  | Textarea
  | Number
  | Select
  | Segmented
  | Slider // basics
  | Color
  | FontFamily
  | TextSizePreset
  | AccentColor
  | SurfaceColor // color + typography
  | List<Row> // sortable rows, per-row sub-schema
  | IconPicker
  | EmojiPicker
  | ImageUpload
  | SoundPicker
  | RosterPicker // pickers
  | Custom; // { render: (ctx) => ReactNode }

type Group = {
  id: 'content' | 'behavior' | 'display';
  title?: string;
  fields: Field[];
};

type WidgetSettingsSchema<C> = {
  groups: Group[];
  styleKeys?: ReadonlyArray<AppearanceKey>; // which universal Style fields this widget consumes
  configVersion?: number; // bumps when keys are renamed; pairs with migrateWidgetConfig
};
```

Rules:

- **Every field key must exist in `WIDGET_DEFAULTS[type].config`.** `validateSchema.ts` asserts
  this in a shared test so a typo is a red test, not a dead control.
- `Custom` fields are allowed only with a `// schema-gap:` one-line comment naming the field type
  that would replace it. The gap list is reported in the PR description of each migration wave.
- Renderer writes via `updateWidget(widget.id, { config: { ...widget.config, [key]: value } })`.
  No field may write outside `config` except the universal Style/transparency fields that already
  target `widget.backgroundColor` / `widget.transparency`.
- Labels are i18n keys under `widgetSettings.<widgetType>.*` in `locales/*.json`. Shared field
  labels live under `widgetSettings.common.*`.
- Board isolation is unchanged: schema keys are per-board by default. A key is added to
  `APPEARANCE_CONFIG_KEYS` in `utils/widgetConfigPersistence.ts` only if it is purely visual
  (CLAUDE.md rule). `styleKeys` may only reference keys that are already in that allowlist.

### 4.3 Field components

Reuse, don't rebuild, where a shared component exists:

| Field                                | Backed by                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| FontFamily, Color(font)              | `components/common/TypographySettings.tsx`                                                                               |
| TextSizePreset                       | `components/common/TextSizePresetSettings.tsx`                                                                           |
| SurfaceColor                         | `components/common/SurfaceColorSettings.tsx`                                                                             |
| AccentColor                          | `components/common/AccentColorSettings.tsx`                                                                              |
| Color (generic)                      | `components/common/ColorPresetPicker.tsx`                                                                                |
| List                                 | `components/common/SortableList.tsx`                                                                                     |
| ImageUpload                          | `components/common/DriveImagePicker.tsx` + `hooks/useStorage.ts`                                                         |
| RosterPicker                         | `components/common/AssignClassPicker.tsx` / `RosterModeControl.tsx`                                                      |
| Labels/sections                      | `components/common/SettingsLabel.tsx` (retained as the section-heading primitive)                                        |
| IconPicker, EmojiPicker, SoundPicker | New; extracted from the first migrated widget that needs each (`TimeTool` for sounds, `Checklist`/`Stations` for icons). |

Every field renders the same anatomy: label row (label + optional reset-to-default), control,
optional help line. Text sizes: `text-xs` body, `text-xxs` uppercase labels, matching
`SettingsLabel`. Settings panels are not front-face content, so Tailwind sizes are fine here.

### 4.4 Config migration

- `utils/migration.ts` `migrateWidget` already runs on every load path (`hooks/useFirestore.ts`,
  `context/DashboardContext.tsx`). Extend with a per-type table
  `WIDGET_CONFIG_MIGRATIONS: Partial<Record<WidgetType, Array<(config) => config>>>` keyed by
  `configVersion`; the schema's `configVersion` and the widget's stored `config.__v` decide which
  steps run.
- Key renames (D11) always keep reading the old key for one release: migration copies old → new
  and deletes old. Tests assert old-shape fixtures normalize to the new shape with no data loss.
- Migrations must also run on `savedWidgetConfigs` (appearance defaults) and on
  `WIDGET_DEFAULTS` consumers so an old saved appearance default doesn't reintroduce a removed key.

### 4.5 Feature flag

- Add `'settings-drawer'` to `GlobalFeature` in `types.ts` and `FEATURE_DEFAULTS` in
  `config/featureDefaults.ts` (`accessLevel: 'admin'`, `enabled: true` initially).
- `WidgetRenderer.tsx`: if `canAccessFeature('settings-drawer')` render nothing for settings and
  let `SettingsDrawerHost` handle it; else keep passing `settings`/`appearanceSettings` to
  `DraggableWindow` → `SettingsPanel` as today.
- Final wave sets the default to `public` for one release, then removes the flag and the old
  panel.

### 4.6 Drawer width persistence

Add `settingsDrawerWidth?: number` to `AppSettings` (`types.ts` ~line 7228), written through
`updateAppSettings` (debounced on resize end). Falls back to 400.

### 4.7 Custom Widget Builder (D13)

`CustomWidgetSettingDef` (`types.ts` ~line 7914) types `string | number | boolean | select` map
1:1 to `Text | Number | Toggle | Select`. Add an adapter `customDefsToSchema(defs)` and route
`components/widgets/CustomWidget/Settings.tsx` through the renderer. `SettingsDefEditor.tsx` in
the admin builder gains the remaining v1 field types in a later wave (not this series unless
trivial).

## 5. Waves

Each wave is one PR. Items within a wave are file-disjoint so they can be built by parallel
agents. The orchestrator runs `pnpm run validate` on the whole tree after each wave, fixes
anything red, commits, pushes, opens a draft PR, and only then starts the next wave.

### Wave 0 — Discovery (no code)

- **0.1** Query Admin Analytics for widget adds in the last 90 days. Write the ranked top 10
  into §6 of this doc and commit. If analytics is empty, keep the provisional list and say so
  in the commit.
- **0.2** Inventory every `*Settings.tsx` for: config keys written, controls used, `t()` vs
  hardcoded labels, duplicate-of-Style controls. Output `docs/plans/widget-settings-inventory.md`
  (table: widget · key · control · group guess · keep/remove/rename). This is the input for
  every migration item and for the field kit's completeness check.

### Wave 1 — Foundation (behind flag, no widget migrated)

| Item                               | Files                                                                                                                                                                                                 | Deliverable                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1.1 Schema types + validator       | `components/settings/schema/*`                                                                                                                                                                        | Types in §4.2, `defineSettings`, `validateSchema` + test harness that iterates `WIDGET_SETTINGS_SCHEMAS`.         |
| 1.2 Field kit: basics              | `components/settings/renderer/fields/{Toggle,Text,Textarea,Number,Select,Segmented,Slider}.tsx` + tests                                                                                               | Shared anatomy per §4.3.                                                                                          |
| 1.3 Field kit: color + typography  | `.../fields/{Color,FontFamily,TextSizePreset,AccentColor,SurfaceColor}.tsx`                                                                                                                           | Thin wrappers over existing shared components.                                                                    |
| 1.4 Field kit: List + Custom       | `.../fields/{List,Custom}.tsx`                                                                                                                                                                        | `List` over `SortableList` with a per-row sub-schema rendered by `FieldRenderer`.                                 |
| 1.5 SchemaRenderer + FieldRenderer | `components/settings/renderer/{SchemaRenderer,FieldRenderer}.tsx`                                                                                                                                     | Groups in D8 order; `visibleWhen`/`disabledWhen`; i18n resolution.                                                |
| 1.6 Drawer chrome                  | `components/settings/SettingsDrawer.tsx`                                                                                                                                                              | Header/tabs/body/resize handle; ports help + building toggle + transparency from `SettingsPanel.tsx`.             |
| 1.7 Camera hook                    | `components/settings/useSettingsDrawerCamera.ts` + `components/layout/DashboardView.tsx` (expose `panOffset` setter via a small imperative handle or the existing `board-pan` event pattern)          | Auto-pan/restore per §3.                                                                                          |
| 1.8 Host + flag wiring             | `components/settings/SettingsDrawerHost.tsx`, `components/widgets/WidgetRenderer.tsx`, `types.ts` (GlobalFeature), `config/featureDefaults.ts`, `components/admin/GlobalPermissionsManager.tsx` label | Drawer mounts once; legacy JSX shown through `LegacySettingsSlot` for unmigrated widgets.                         |
| 1.9 Universal Style tab            | `components/settings/schema/styleKeys.ts`, drawer Style tab                                                                                                                                           | Built from `APPEARANCE_CONFIG_KEYS`; widgets without a schema get the current `UniversalStyleSettings` set.       |
| 1.10 Width persistence             | `types.ts` (AppSettings), `context/AuthContext.tsx` write path                                                                                                                                        | §4.6.                                                                                                             |
| 1.11 E2E scaffold                  | `tests/e2e/settings-drawer.spec.ts`                                                                                                                                                                   | Opens drawer on a text widget under the flag, changes a field, asserts board update and persistence after reload. |

Exit: flag on for admins, every widget opens in the drawer showing its legacy panel inside the
new chrome, Style tab universal, validate green.

### Wave 2 — Pickers + migration batch A (top 1–5)

| Item                                                                       | Files                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 IconPicker, EmojiPicker, SoundPicker, ImageUpload, RosterPicker fields | `components/settings/renderer/fields/*` (+ extraction from the widget that owns the current implementation)                                                                                           |
| 2.2–2.6 Migrate widgets #1–#5                                              | `components/widgets/<W>/settings.schema.ts`, delete `<W>/Settings.tsx` + `<W>/AppearanceSettings` export, `WidgetRegistry.ts` entries, `utils/migration.ts` step, `locales/*.json` keys, tests per §7 |

Each migration item is one agent, one widget. The agent owns only that widget's folder plus its
registry lines, migration step, and locale keys. Registry and locale edits are the shared-file
hotspot: the orchestrator merges them, or agents append under a `// <widget>` marker to avoid
overlapping hunks.

### Wave 3 — Migration batch B (top 6–10) + Custom Widget Builder

- 3.1–3.5 Migrate widgets #6–#10 (same shape as wave 2).
- 3.6 `customDefsToSchema` adapter and `CustomWidget/Settings.tsx` through the renderer (D13).
- 3.7 Field-kit gap review: every `Custom` field left in migrated schemas gets a decision:
  promote to a real field type now, or record in §8.

### Wave 4 — Flip default and delete legacy

- 4.1 `settings-drawer` default → `public`.
- 4.2 Delete `components/common/SettingsPanel.tsx`, its tests, the `settings` /
  `appearanceSettings` props on `DraggableWindow`, and `WIDGET_APPEARANCE_COMPONENTS`
  (unmigrated widgets keep `WIDGET_SETTINGS_COMPONENTS` rendered via `LegacySettingsSlot`; their
  appearance components fold into the universal Style tab or are ported into their schema's
  `display` group as a small custom field).
- 4.3 Remove the flag after one release cycle (separate tiny PR; noted here so it isn't
  forgotten).
- 4.4 Update `CLAUDE.md` "Settings Panel" section and the `new-widget` skill templates to the
  schema pattern.

Remaining 52 widgets migrate opportunistically after this series, each following the wave-2
item template.

## 6. Top-10 migration list

**Status: PROVISIONAL — replace in wave 0.1 with the analytics-ranked list.**

Provisional (largest panels, `wc -l` of `Settings.tsx`):

1. Schedule (851)
2. SpecialistSchedule (688)
3. RevealGrid (682)
4. random (609)
5. PollWidget (598)
6. TimeTool (593)
7. MaterialsWidget (530)
8. Weather (516)
9. NumberLine (429)
10. NextUp (414)

When the analytics list arrives, keep whichever of these are in the true top 10 and drop the
rest; do not exceed 10 in this series.

## 7. Done bar (per migrated widget)

1. `settings.schema.ts` passes `validateSchema` (every key exists in `WIDGET_DEFAULTS`, group
   ids valid, `styleKeys` ⊆ `APPEARANCE_CONFIG_KEYS`).
2. Config-migration test: a fixture of the pre-migration config shape (captured from the current
   `Settings.tsx` in wave 0.2) loads through `migrateWidget` and equals the expected new shape;
   no key lost that the front face reads.
3. Drawer E2E in `tests/e2e/settings-drawer.spec.ts`: open, change one field from each present
   group, observe the board widget update, close, reload, values persist.
4. Legacy `Settings.tsx` deleted; no `WIDGET_SETTINGS_COMPONENTS` / `WIDGET_APPEARANCE_COMPONENTS`
   entry remains for the widget.
5. All labels through `t()`; `de/es/fr` get the English string as placeholder per the repo's
   i18n test expectations.
6. PR description lists removed controls, renamed keys, and `schema-gap` custom fields.

## 8. Open questions (raise, don't assume)

- Whether `SettingsDefEditor.tsx` (admin Custom Widget Builder) should expose the full v1 field
  kit in this series or only the four existing types (plan assumes only the four).
- Whether analytics should rank by widget adds or by widgets present on active boards (plan
  assumes adds; both are acceptable, state which was used).
- Widgets whose settings open other modals (Quiz, VideoActivity, GuidedLearning editors) are
  out of the top-10 by design unless analytics says otherwise; if one lands in the list, the
  schema wraps the "open editor" button as a `Custom` field and does not attempt to inline the
  editor.

## 9. Non-goals

- `/remote` mobile settings (D14).
- Admin-level widget configuration modals (`admin-widget-config` skill territory).
- Changing front-face widget rendering or container-query scaling.
- Migrating widgets beyond the top 10 in this series.
