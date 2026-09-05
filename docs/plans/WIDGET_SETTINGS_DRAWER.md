# Widget Settings Drawer — Implementation Plan

**Date**: 2026-09-05 · **Branch**: `claude/widget-settings-ux-hgbwcy` · **Status**: Decisions locked via design interview; plan hardened by adversarial code review (not started)

Replace the per-widget floating settings panel with a docked, schema-driven settings drawer so
every widget's settings look and behave the same way while the live widget stays visible on the
board (WYSIWYG preserved). Decisions in §2 were agreed in an interactive interview on 2026-09-05
and are not open for re-litigation by an implementing session; open questions are listed at the
end and must be raised, not silently answered. Every file path and line reference below was
verified against the codebase on 2026-09-05; re-verify line numbers before relying on them.

This plan is written to be executed wave-by-wave by fresh sessions. The
`pauls-skills:mass-plan-implementation` skill is the intended driver; if it is not installed, run
each wave as file-owned parallel agents with the orchestrator validating and committing between
waves, exactly as `.claude/workflows/optimize-pass.README.md` describes for its implement phase.

---

## 1. Problem statement

- `components/common/SettingsPanel.tsx` portals a 380px panel beside the widget. Its side
  (right / left / centered) and height vary per widget position and content.
- Roughly 60 widgets ship a `*Settings` component and roughly 30 ship a separate
  `*AppearanceSettings` component (`components/widgets/WidgetRegistry.ts`:
  `WIDGET_SETTINGS_COMPONENTS`, `WIDGET_APPEARANCE_COMPONENTS`; count those maps for current
  numbers). Each hand-rolls sections, labels, spacing, and controls. The largest run 430–940
  lines (see §6).
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
   (existing `useHelpItemsForWidget` / `requestOpenHelp` wiring), close button with the exact
   aria-label `Close settings` (E2E `tests/e2e/nexus_qr_text.spec.ts` selects on it).
2. Tab bar pinned under the header: **Settings** · **Style**. Same two tabs, always.
3. Scrollable body. Settings tab renders schema groups in D8 order as titled sections. Style tab
   renders the universal style fields the widget opts into, then window background, then
   transparency (moved verbatim from the current panel).
4. Left-edge resize handle (D4). Keyboard: Esc closes; the existing `Alt+S` handler in
   `DraggableWindow.tsx` (`if (e.altKey)` → `case 's'` → toggles `flipped`) keeps working
   unchanged.
5. **The drawer root must carry `data-widget-portal=""` and `data-widget-id={widget.id}`**,
   mirroring `SettingsPanel.tsx`. Those attributes are load-bearing: `DashboardView.tsx`
   resolves the topmost widget via `'.widget, [data-widget-portal]'`, and `DraggableWindow.tsx`
   plus `GuidedLearning/ScreenCaptureModal.tsx` use them to tell "Escape from inside our portal"
   from a global Escape. `tests/components/common/SettingsPanel.test.tsx` asserts them.
6. Layering: the drawer sits at `Z_INDEX.popover` (11000). Nested modals (`modalNested` 10100,
   `modalDeep` 10200) are **below** that, so any picker a drawer field opens (Drive picker,
   library modals) must render at `popoverMenu` or higher, or the drawer must lower itself while
   a nested modal is open. Decide once in wave 1b and document it in `config/zIndex.ts`.

**Board behavior**:

- Opening pushes nothing; the drawer overlays the canvas. The canvas then auto-pans so the
  widget's screen rect fits inside `[PANEL_MARGIN, viewport.width - drawerWidth - PANEL_MARGIN]`
  (D3). If the widget is wider than that band at current zoom, pan to align its left edge and do
  not zoom out (zooming changes what the teacher is previewing). The requested offset must pass
  the existing `clampPan` / `getPanRange` in `utils/zoomPanMath.ts`; at zoom 1 the range is
  ±viewport/2, so a partial pan is the expected outcome for large widgets.
- Closing restores the pre-open `panOffset`. If the teacher panned manually while the drawer was
  open, do not restore (their explicit camera wins). A board switch or a `camera-reset` event
  while the drawer is open resets `panOffset` to `{0,0}` (`DashboardView.tsx`); in that case the
  saved camera is discarded, not restored.
- Maximized widgets: no pan; the drawer overlays the right edge.
- Drag or resize of the widget still closes the drawer: `DraggableWindow.tsx` sets
  `flipped: false` unconditionally on drag start and resize start. The host must not fight this;
  the drawer closes and does not restore the camera in that case.
- Read-only boards and teacher-locked widgets: the drawer cannot be **opened**, but an
  already-open one can still be **closed**. `DraggableWindow.tsx` deliberately allows the close
  path under `isActiveBoardReadOnly`; preserve that asymmetry.

**Selection**: `widget.flipped === true` remains the single source of truth for "settings open".
Today nothing unflips a sibling when another widget flips (every toggle is
`updateWidget(id, { flipped: !flipped })`; the only bulk unflip is on board switch in
`DashboardContext.tsx`), so **stored boards can contain several `flipped: true` widgets**. The
host therefore: (a) picks the flipped widget with the highest `z` (else first in array) to show,
(b) un-flips the previous widget whenever a new one flips, and (c) relies on a one-time
normalization in `migrateWidget` that clears `flipped` on all but one widget (§4.4).

## 4. Architecture

### 4.1 Files (new)

```
components/settings/
├── SettingsDrawer.tsx            # portal host: chrome, tabs, resize handle, Style tab
├── SettingsDrawerHost.tsx        # mounted once in DashboardView; finds the flipped widget
├── useSettingsDrawerCamera.ts    # auto-pan / restore logic against panOffset + zoom
├── schema/
│   ├── types.ts                  # FieldSchema, GroupSchema, WidgetSettingsSchema
│   ├── defineSettings.ts         # typed helper: defineSettings<Config>({...})
│   ├── validateSchema.ts         # dev-time + test assertions (see 4.2 rules)
│   └── styleKeys.ts              # UNIVERSAL_STYLE_FIELDS keyed by APPEARANCE_CONFIG_KEYS
├── renderer/
│   ├── SchemaRenderer.tsx        # groups → sections → fields
│   ├── FieldRenderer.tsx         # switch on field.type
│   └── fields/                   # one file per field type (see 4.3)
└── legacy/
    └── LegacySettingsSlot.tsx    # wraps WIDGET_SETTINGS_COMPONENTS[type] until migrated
```

Per widget: `components/widgets/<Widget>/settings.schema.ts` exporting a
`WidgetSettingsSchema<Config>`. Registered in `WidgetRegistry.ts` as
`WIDGET_SETTINGS_SCHEMAS: Partial<Record<WidgetType, () => Promise<WidgetSettingsSchema>>>`.
A schema is a module, not a component, so **`React.lazy` does not apply**: the host keeps a
memoized `import()` map and the drawer body renders a skeleton until the promise resolves.
`WidgetRenderer.tsx` already wraps legacy settings in `Suspense`; the legacy slot reuses that.

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
  configVersion?: number; // bumps when keys are renamed; pairs with WIDGET_CONFIG_MIGRATIONS
};
```

Rules:

- **Every field key must exist in the widget's `*Config` type in `types.ts`** (compile-time via
  `defineSettings<Config>`). `WIDGET_DEFAULTS[type].config` coverage is a **separate,
  warn-level** check, because defaults and settings already disagree today: `schedule` defaults
  hold only `items/cardColor/cardOpacity` while its Settings writes `autoProgress`,
  `autoScroll`, `expandActiveItem`, `schedules`, and more; `weather` defaults lack `fontColor`,
  `hideClothing`, `secondaryColor`; `time-tool` defaults lack `glow` even though
  `utils/migration.ts` seeds it. Wave 1a includes an explicit, reviewed backfill of missing
  default keys for the ten target widgets (it changes new-widget initial state, so it is not
  free).
- `Custom` fields are allowed only with a `// schema-gap:` one-line comment naming the field type
  that would replace it. The gap list is reported in the PR description of each migration wave.
- Renderer writes via `updateWidget(widget.id, { config: { ...widget.config, [key]: value } })`.
  No field may write outside `config` except the universal Style/transparency fields that already
  target `widget.backgroundColor` / `widget.transparency`.
- Labels are i18n keys under `widgetSettings.<widgetType>.*` in `locales/*.json`. Shared field
  labels live under `widgetSettings.common.*`.
- Board isolation is unchanged: schema keys are per-board by default. `styleKeys` may reference
  only members of `APPEARANCE_CONFIG_KEYS` in `utils/widgetConfigPersistence.ts`. Promoting a
  widget knob to a universal key (D7) means adding it to that allowlist **in the same commit**,
  and only if it is purely visual (CLAUDE.md rule).

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
| ImageUpload                          | `components/common/DriveImagePicker.tsx` + `hooks/useStorage.ts` (mind §3 item 6 on z-index)                             |
| RosterPicker                         | `components/common/AssignClassPicker.tsx` / `RosterModeControl.tsx`                                                      |
| Labels/sections                      | `components/common/SettingsLabel.tsx` (retained as the section-heading primitive)                                        |
| IconPicker, EmojiPicker, SoundPicker | New; extracted from the first migrated widget that needs each (`TimeTool` for sounds, `Checklist`/`Stations` for icons). |

Every field renders the same anatomy: label row (label + optional reset-to-default), control,
optional help line. Text sizes: `text-xs` body, `text-xxs` uppercase labels, matching
`SettingsLabel`. Settings panels are not front-face content, so Tailwind sizes are fine here.

### 4.4 Config migration

- **`migrateWidget` (`utils/migration.ts`) runs on exactly two paths today**: the server-board
  normalizer in `hooks/useFirestore.ts` and the snapshot path in `context/DashboardContext.tsx`.
  It does **not** run for shared boards (`mapSharedDocToDashboard` casts straight to
  `Dashboard`), Drive import, `hooks/useTemplateStore.ts`, `hooks/useStarterPacks.ts`, or the
  `savedWidgetConfigs` merge in `utils/widgetConfigPersistence.ts` (`mergeWidgetConfig`). Wave
  1b routes all of those through `migrateWidget` and adds `migrateSavedWidgetConfigs` for
  renamed appearance keys. Without this, a renamed key resurfaces from any of those paths.
- Version stamp lives on **`WidgetData`**, not inside `config`: add
  `configVersion?: number` next to `transparency` in `types.ts`. Putting `__v` inside `config`
  would require widening every typed `*Config` interface and would leak through
  `mergeWidgetConfig` as a per-board key.
- Per-type table `WIDGET_CONFIG_MIGRATIONS: Partial<Record<WidgetType, Array<(config) => config>>>`,
  indexed by version; `migrateWidget` runs the steps from `widget.configVersion ?? 0` up to the
  schema's `configVersion`.
- Key renames (D11) copy old → new and delete old. Tests assert old-shape fixtures normalize to
  the new shape with no data loss.
- **Renaming any member of `APPEARANCE_CONFIG_KEYS` is discouraged.** The allowlist is a
  `Set<string>` of literal names; a rename without updating the Set and migrating
  `savedWidgetConfigs` silently drops a teacher's saved appearance defaults. If a rename is
  unavoidable, all three (Set, config migration, saved-config migration) land in one commit.
- Add the one-time `flipped` normalization from §3 (clear all but the highest-`z` flipped widget).

### 4.5 Feature flag

- Add `'settings-drawer'` to `GlobalFeature` in `types.ts`. In `config/featureDefaults.ts` the
  entry shape is `{ defaultAccessLevel, defaultEnabled, missingDocPublic }`; use
  `{ defaultAccessLevel: 'admin', defaultEnabled: true, missingDocPublic: false }`.
  **`missingDocPublic: false` is mandatory**: `canAccessFeature` in `context/AuthContext.tsx`
  returns true for a missing Firestore doc when it is `true`, which would ship the unfinished
  drawer to every teacher. Add a `config/featureDefaults.test.ts` case mirroring the
  `anonymous-join` one.
- `GLOBAL_FEATURES` in `components/admin/GlobalPermissionsManager.tsx` needs a full
  `{ id, label, icon, description }` entry, not just a label.
- **Auth bypass forces the flag on**: `canAccessFeature` returns `true` unconditionally under
  `isAuthBypass`, and `playwright.config.ts` sets `VITE_AUTH_BYPASS=true` for every E2E run. So
  from wave 1b the drawer is the only settings surface E2E ever sees. Consequences: update
  `tests/e2e/nexus_qr_text.spec.ts` (settings button → `Close settings`) in wave 1b, and cover
  the legacy path with unit tests, since it is not E2E-reachable.
- `WidgetRenderer.tsx`: if the flag is on, pass no settings to `DraggableWindow` and let
  `SettingsDrawerHost` handle it; else keep today's path. `settings` is a **required** prop on
  `DraggableWindow` (`settings: React.ReactNode`), so wave 1b makes it optional; full prop
  removal stays in wave 4.
- Final wave sets the default to `public` for one release, then removes the flag and the old
  panel.

### 4.6 Drawer width persistence

Add `settingsDrawerWidth?: number` to `AppSettings` in `types.ts`, written through
`updateAppSettings` (debounced on resize end). Falls back to 400.

### 4.7 Custom Widget Builder (D13)

`CustomWidgetSettingDef` (`types.ts`) has `type: 'string' | 'number' | 'boolean' | 'select'`,
`defaultValue: string | number | boolean`, and `options?: string[]` for select. These map 1:1 to
`Text | Number | Toggle | Select`; the select adapter reads `options`. Add
`customDefsToSchema(defs)` and route `components/widgets/CustomWidget/Settings.tsx` through the
renderer. `SettingsDefEditor.tsx` in the admin builder gains the remaining v1 field types in a
later series.

### 4.8 Auto-pan mechanics (D3)

`panOffset` is `React.useState` local to `DashboardView.tsx` (deliberately outside context to
avoid re-render cascades). It is clamped on every render via `getPanRange`, reset to `{0,0}` on
board switch and on the `camera-reset` event, and the existing `board-pan` window event is
**outbound only** (a notification that pan changed). There is no inbound setter today. Wave 1b
adds one: a `board-pan-request` window event carrying `{ x, y }` that `DashboardView` handles by
clamping and setting `panOffset`. The camera hook dispatches that event on open and close. Do
not lift `panOffset` into context.

The host reads the flipped widget through `useDashboardCanvasSelector` / the canvas store in
`context/dashboardCanvasStore.ts`, never the full `useDashboard()` value, per the CLAUDE.md
hot-path rule. Mounting the host in `DashboardView` is fine only if it subscribes to that narrow
slice.

### 4.9 Invariant: the drawer must never move widgets

Two mechanisms reposition widgets on a `window` `resize` event, and both read
`window.innerWidth` / `window.innerHeight` directly:

- `context/DashboardContext.tsx`: proportional re-hydration recomputes every widget's pixel
  `x/y/w/h` from its stored `xProp/yProp/wProp/hProp` against the new viewport.
- `components/layout/DashboardView.tsx`: `rescueWidgets` clamps any widget outside the world
  rectangle (`clampWidgetToWorld`) and **persists** the new position via `updateWidget`.

Docking the browser devtools shrinks the window, so both fire and widgets on the right edge get
pushed inward. That is the known symptom to avoid. The drawer therefore obeys these rules:

1. **Overlay only.** The drawer is a `position: fixed` portal on `document.body`. It must not
   shrink, pad, or re-flow the board container, and must not change `window.innerWidth`.
2. **Never dispatch `resize`.** No synthetic `window.dispatchEvent(new Event('resize'))`, and no
   code path in the drawer, host, or camera hook may call `updateWidget` with `x`, `y`, `w`, or
   `h`. Auto-pan moves the camera (`panOffset`) only.
3. **No viewport substitution.** Do not introduce an "effective viewport" that subtracts the
   drawer width and feed it to re-hydration or rescue. The drawer covering part of the board is
   the accepted trade-off; the camera pan (D3) is how the widget is brought into view.
4. **Resizing the drawer** (D4) changes only the drawer's own width and the pan target; it is
   not a viewport change.

Required test (wave 1b.9): a unit test that opens the drawer, resizes it across the full
360–560px range, closes it, and asserts that no widget's `x/y/w/h` or proportional fields changed
and that `updateWidget` was never called with positional keys. The drawer E2E also asserts widget
bounding rects are identical before open and after close.

## 5. Waves

Each wave is one PR. Items within a wave are file-disjoint unless marked **orchestrator-owned**,
which means only the orchestrator edits that file after agents finish: `types.ts`,
`components/widgets/WidgetRegistry.ts`, `locales/*.json`, `components/layout/DashboardView.tsx`.
The orchestrator runs `pnpm run validate` on the whole tree after each wave, fixes anything red,
commits, pushes, opens a draft PR, and only then starts the next wave.

### Wave 0 — Discovery (no code)

- **0.1** Query Admin Analytics for widget adds in the last 90 days. Write the ranked top 10
  into §6 and commit. If analytics is empty, keep the provisional list and say so.
- **0.2** Inventory every settings component for: config keys written, controls used, `t()` vs
  hardcoded labels, duplicate-of-Style controls, keys missing from `WIDGET_DEFAULTS`. Output
  `docs/plans/widget-settings-inventory.md` (table: widget · key · control · group guess ·
  keep/remove/rename · in-defaults?). Input for every migration item and for wave 1a's backfill.

### Wave 1a — Schema + field kit (pure additions, genuinely disjoint)

| Item                                | Files                                                                                                   | Deliverable                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1a.1 Schema types + validator       | `components/settings/schema/*`                                                                          | §4.2 types, `defineSettings`, `validateSchema` + a test that iterates `WIDGET_SETTINGS_SCHEMAS`. |
| 1a.2 Field kit: basics              | `components/settings/renderer/fields/{Toggle,Text,Textarea,Number,Select,Segmented,Slider}.tsx` + tests | Shared anatomy per §4.3.                                                                         |
| 1a.3 Field kit: color + typography  | `.../fields/{Color,FontFamily,TextSizePreset,AccentColor,SurfaceColor}.tsx`                             | Thin wrappers over existing shared components.                                                   |
| 1a.4 Field kit: List + Custom       | `.../fields/{List,Custom}.tsx`                                                                          | `List` over `SortableList` with a per-row sub-schema rendered by `FieldRenderer`.                |
| 1a.5 SchemaRenderer + FieldRenderer | `components/settings/renderer/{SchemaRenderer,FieldRenderer}.tsx`                                       | Groups in D8 order; `visibleWhen`/`disabledWhen`; i18n resolution.                               |
| 1a.6 Defaults backfill              | `config/widgetDefaults.ts` (orchestrator-owned), tests                                                  | Add the missing default keys for the ten §6 widgets per the 0.2 inventory.                       |

Exit: nothing user-visible; validate green.

### Wave 1b — Drawer, host, flag, camera (behind flag, no widget migrated)

| Item                           | Files                                                                                                                                      | Deliverable                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1b.1 Drawer chrome + Style tab | `components/settings/SettingsDrawer.tsx`                                                                                                   | Header/tabs/body/resize; `data-widget-portal` + `data-widget-id` on root; ports help, building toggle, transparency from `SettingsPanel.tsx`; Style tab from `schema/styleKeys.ts`.                                                                                                       |
| 1b.2 Camera hook + pan request | `components/settings/useSettingsDrawerCamera.ts`, `DashboardView.tsx` (orchestrator-owned: `board-pan-request` handler)                    | §4.8.                                                                                                                                                                                                                                                                                     |
| 1b.3 Host + legacy slot        | `components/settings/SettingsDrawerHost.tsx`, `components/settings/legacy/LegacySettingsSlot.tsx`                                          | Narrow canvas-store subscription; flipped tie-break per §3; memoized schema `import()` map.                                                                                                                                                                                               |
| 1b.4 Flag                      | `types.ts` (orchestrator-owned), `config/featureDefaults.ts` + test, `components/admin/GlobalPermissionsManager.tsx`                       | §4.5.                                                                                                                                                                                                                                                                                     |
| 1b.5 Renderer/window wiring    | `components/widgets/WidgetRenderer.tsx`, `components/common/DraggableWindow.tsx` (`settings` optional)                                     | Flag branch; drawer host receives the widget.                                                                                                                                                                                                                                             |
| 1b.6 Migration plumbing        | `utils/migration.ts`, `hooks/useFirestore.ts`, `hooks/useTemplateStore.ts`, `hooks/useStarterPacks.ts`, `utils/widgetConfigPersistence.ts` | `configVersion` on `WidgetData`, `WIDGET_CONFIG_MIGRATIONS`, all load paths per §4.4, `flipped` normalization.                                                                                                                                                                            |
| 1b.7 Width persistence         | `types.ts` (orchestrator-owned), `context/AuthContext.tsx` write path                                                                      | §4.6.                                                                                                                                                                                                                                                                                     |
| 1b.8 z-index decision          | `config/zIndex.ts`                                                                                                                         | §3 item 6.                                                                                                                                                                                                                                                                                |
| 1b.9 Tests                     | `tests/components/settings/*`, `tests/e2e/settings-drawer.spec.ts`, `tests/e2e/nexus_qr_text.spec.ts`                                      | Port the nine `SettingsPanel.test.tsx` behaviours (portal attrs, click-outside after `onClose` identity change, dialog-click exclusion, `board-pan` re-measure, Escape-in-field, Escape propagation) to drawer tests; drawer E2E; fix the QR spec; the no-widget-movement test from §4.9. |

Exit: flag on for admins (and always on in E2E via bypass), every widget opens in the drawer
showing its legacy panel inside the new chrome, Style tab universal, validate green.

### Wave 2 — Pickers + migration batch A (top 1–5)

| Item                                                                       | Files                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 IconPicker, EmojiPicker, SoundPicker, ImageUpload, RosterPicker fields | `components/settings/renderer/fields/*` (+ extraction from the widget that owns the current implementation). **Must land before any 2.x widget that needs them**; the orchestrator sequences 2.1 first, then the five widgets in parallel.                                                                                  |
| 2.2–2.6 Migrate widgets #1–#5                                              | `components/widgets/<W>/settings.schema.ts`; delete the widget's legacy settings file (**not always `Settings.tsx`**: e.g. `random/RandomSettings.tsx`; read `WIDGET_SETTINGS_COMPONENTS` for the real path) and its appearance export; registry entries and locale keys (orchestrator-owned); migration step; tests per §7 |

Each migration item is one agent, one widget. The agent owns only that widget's folder and its
migration step; it hands registry lines and locale entries to the orchestrator as a patch.

### Wave 3 — Migration batch B (top 6–10) + Custom Widget Builder

- 3.1–3.5 Migrate widgets #6–#10 (same shape as wave 2).
- 3.6 `customDefsToSchema` adapter and `CustomWidget/Settings.tsx` through the renderer (D13).
- 3.7 Field-kit gap review: every `Custom` field left in migrated schemas gets a decision:
  promote to a real field type now, or record in §8.

### Wave 4 — Flip default and delete legacy

- 4.1 `settings-drawer` default → `public`.
- 4.2 Delete `components/common/SettingsPanel.tsx`, `SettingsPanel.help.test.tsx`,
  `tests/components/common/SettingsPanel.test.tsx`, the `settings` / `appearanceSettings` props
  on `DraggableWindow` (and the ~10 `DraggableWindow.test.tsx` cases that pass them), and
  `WIDGET_APPEARANCE_COMPONENTS`. Unmigrated widgets keep `WIDGET_SETTINGS_COMPONENTS` rendered
  via `LegacySettingsSlot`; their appearance components fold into the universal Style tab or
  port into their schema's `display` group as a small custom field.
  **Update `scripts/test-count-baseline.json`**: `pnpm run test:counts` runs inside `validate`
  and fails when suites disappear.
- 4.3 Remove the flag after one release cycle (separate tiny PR; noted here so it isn't
  forgotten).
- 4.4 Update `CLAUDE.md` "Settings Panel" section and the `new-widget` skill templates to the
  schema pattern.

Remaining widgets migrate opportunistically after this series, each following the wave-2 item
template.

## 6. Top-10 migration list

**Status: PROVISIONAL — replace in wave 0.1 with the analytics-ranked list.**

Provisional (largest legacy settings files, verified 2026-09-05):

| #   | Widget             | Legacy settings file                                 | Lines |
| --- | ------------------ | ---------------------------------------------------- | ----- |
| 1   | Schedule           | `components/widgets/Schedule/Settings.tsx`           | 938   |
| 2   | SpecialistSchedule | `components/widgets/SpecialistSchedule/Settings.tsx` | 731   |
| 3   | RevealGrid         | `components/widgets/RevealGrid/Settings.tsx`         | 703   |
| 4   | Poll               | `components/widgets/PollWidget/Settings.tsx`         | 650   |
| 5   | Random             | `components/widgets/random/RandomSettings.tsx`       | 641   |
| 6   | TimeTool           | `components/widgets/TimeTool/Settings.tsx`           | 641   |
| 7   | Materials          | `components/widgets/MaterialsWidget/Settings.tsx`    | 572   |
| 8   | Weather            | `components/widgets/Weather/Settings.tsx`            | 549   |
| 9   | NumberLine         | `components/widgets/NumberLine/Settings.tsx`         | 447   |
| 10  | NextUp             | `components/widgets/NextUp/Settings.tsx`             | 433   |

When the analytics list arrives, keep whichever of these are in the true top 10 and drop the
rest; do not exceed 10 in this series.

## 7. Done bar (per migrated widget)

1. `settings.schema.ts` compiles against the widget's `*Config` type and passes
   `validateSchema` (group ids valid, `styleKeys` ⊆ `APPEARANCE_CONFIG_KEYS`, defaults coverage
   warning-free after the wave 1a backfill).
2. Config-migration test: a fixture of the pre-migration config shape (captured from the legacy
   settings file in wave 0.2) loads through `migrateWidget` and equals the expected new shape;
   no key lost that the front face reads.
3. Drawer E2E in `tests/e2e/settings-drawer.spec.ts`: open, change one field from each present
   group, observe the board widget update, close, reload, values persist.
4. Legacy settings file deleted; no `WIDGET_SETTINGS_COMPONENTS` / `WIDGET_APPEARANCE_COMPONENTS`
   entry remains for the widget.
5. All labels through `t()` with **real `de`/`es`/`fr` translations**. English placeholders are
   rejected by `tests/i18n/*Locales.test.ts` (English-key leakage is treated as a bug there).
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
- z-index resolution for nested pickers (§3 item 6): raise pickers or lower the drawer.

## 9. Non-goals

- `/remote` mobile settings (D14). Note `RemoteWidgetCard.tsx` writes `flipped: false` on
  maximize; that stays compatible with the host.
- Admin-level widget configuration modals (`admin-widget-config` skill territory).
- Changing front-face widget rendering or container-query scaling.
- Migrating widgets beyond the top 10 in this series.
