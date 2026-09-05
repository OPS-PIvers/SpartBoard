# Widget Settings Drawer — Implementation Plan

**Date**: 2026-09-05 · **Branch**: `claude/widget-settings-ux-hgbwcy` · **Status**: Revision 4 (2026-09-05) — decisions locked via design interview, hardened by adversarial code review, revised against the graded comparison in §10, re-scoped by the product owner (§11), then corrected against a third independent grading (§12: counts fixed, board-level `flipped` normalization, manual-pan detection, localized close button, custom-widget def migration) (not started)

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
- `WIDGET_SETTINGS_COMPONENTS` has 59 entries (55 lazy-loaded, `miniApp` imported directly,
  and `smartNotebook` / `traffic` / `classes` on the shared `DefaultSettings`) and
  `WIDGET_APPEARANCE_COMPONENTS` has 29 (`components/widgets/WidgetRegistry.ts`, recounted
  2026-09-05). Separately, 59 `*Settings*.tsx` files under `components/widgets/` total 14,272
  lines; the two sets of 59 are not identical (`stickers` has an appearance file but no
  settings entry; the three `DefaultSettings` widgets have no file). Each file
  each hand-rolls sections, labels, spacing, and controls. The largest run 430–940 lines (see §6).
- Measured control divergence across those 59 files: 11 use a raw `<select>`, 8 a raw range
  input, 5 a native `<input type="color">` against 20 that use a shared color picker, 4 a raw
  checkbox against 17 that use the shared `Toggle`. Only 31 use `SettingsLabel`.
- Only 4 of the 59 settings files call `t()`. The panel chrome itself hardcodes the tab names,
  the empty-state text, and the close button label.
- The Style tab writes two different models: `UniversalStyleSettings` sets window-level
  `widget.fontFamily` / `widget.baseTextSize`, while widget appearance components set
  config-level `config.fontFamily` etc. Which one a teacher gets depends on the widget.
- The same concept (color, font, size, toggle, list) is rendered with different controls in
  different widgets. The Style tab shows either `UniversalStyleSettings` or the widget's own
  appearance component, never a predictable set.
- The benefit to keep: the widget on the board updates instantly as a setting changes.

## 2. Locked decisions

| #   | Decision                        | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Primary pains**               | Inside-panel structure differs; same setting rendered with different controls. Placement is secondary.                                                                                                                                                                                                                                                                                                                                                                                        |
| D2  | **Surface**                     | Docked **side drawer**, full viewport height, default right. Widget stays live on the board. The drawer docks on whichever side keeps the edited widget nearer and un-covered (§3 item 7); the choice is deterministic and announced.                                                                                                                                                                                                                                                         |
| D3  | **Overlap handling**            | **Side selection first, then auto-pan.** Pick the side that needs no pan when one exists; otherwise pan the canvas so the widget is fully visible beside the drawer; restore camera on close. The edited widget gets a focus ring while the drawer is open. Widget `x/y` never change.                                                                                                                                                                                                        |
| D4  | **Drawer sizing**               | **Resizable** via a drag handle on the board-facing edge (left when docked right, right when docked left), clamped 360–560px, default 400px, width persisted per user. Full viewport height. The current 380px × 80vh panel is judged cramped and overloaded by the product owner, so the larger, full-height, resizable surface is a goal of the series, not a cost of it. One widget at a time (D21).                                                                                       |
| D5  | **Consistency depth**           | **Schema-driven fields.** Widgets declare a settings schema; a shared renderer draws it. Custom escape hatch for editors a field can't express.                                                                                                                                                                                                                                                                                                                                               |
| D6  | **Field kit v1**                | Everything standardized: basics, color + typography, sortable item list, pickers (see §4.2). Anything not in the kit uses the custom slot and is a tracked gap, not a permanent exception.                                                                                                                                                                                                                                                                                                    |
| D7  | **Style tab**                   | **One universal Style tab** for all widgets, built from the appearance keys the widget declares it consumes. `WIDGET_APPEARANCE_COMPONENTS` is removed at the end of the series; extra visual knobs move into the schema's `display` group or become universal keys.                                                                                                                                                                                                                          |
| D8  | **Settings tab groups**         | Fixed order **Content → Behavior → Display**. Empty groups omitted. Style is its own tab.                                                                                                                                                                                                                                                                                                                                                                                                     |
| D9  | **Scope**                       | Drawer shell applies to every widget from wave 1 (unmigrated widgets render their legacy JSX inside the drawer's custom slot). **Every widget's internals migrate in this series**: the top 10 by usage in waves 2–3, the remaining 49 in waves 5–9 (§5). `LegacySettingsSlot` is deleted in wave 10, so no second settings system survives.                                                                                                                                                  |
| D10 | **Top-10 source**               | Admin Analytics (Firestore). Wave 0 queries it and writes the list into §6. Provisional list until then: the ten largest panels.                                                                                                                                                                                                                                                                                                                                                              |
| D11 | **Cruft cleanup in bounds**     | Remove dead/duplicate controls; rename/normalize config keys with a one-time migration; reorganize into the standard groups with i18n'd labels.                                                                                                                                                                                                                                                                                                                                               |
| D12 | **Rollout**                     | **Flag first, delete last.** Drawer ships behind a new global permission `settings-drawer`. Wave 4 flips the default and deletes `SettingsPanel.tsx`; wave 10 deletes the legacy slot.                                                                                                                                                                                                                                                                                                        |
| D13 | **Custom Widget Builder**       | `CustomWidgetSettingDef` becomes a subset of the new field schema so admin-built widgets render through the same drawer.                                                                                                                                                                                                                                                                                                                                                                      |
| D14 | **Mobile remote**               | `/remote` (`components/remote/`) untouched this series. Tablets using the teacher app are in scope: below 900px viewport width the drawer becomes a bottom sheet (§3 item 9).                                                                                                                                                                                                                                                                                                                 |
| D15 | **Delivery**                    | One PR per wave. Each wave must leave `pnpm run validate` green.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D16 | **Done bar per migrated panel** | Schema unit test + config-migration test + drawer E2E + i18n parity + axe pass (see §7).                                                                                                                                                                                                                                                                                                                                                                                                      |
| D17 | **Accessibility**               | The drawer is a non-modal `role="dialog"` with managed focus, a keyboard-operable resize handle, and an automated axe check per migrated widget (§3 item 10).                                                                                                                                                                                                                                                                                                                                 |
| D18 | **Style tab model**             | Two explicit tiers: **Window** (frame background, transparency, window font, window text size — `WidgetData` fields, every widget) and **Content** (declared `styleKeys` → `config`). No third path; the window-level fields are neither deleted nor duplicated.                                                                                                                                                                                                                              |
| D19 | **z-index**                     | Drawer renders at a new `Z_INDEX.drawer = 9980` (above annotation chrome, below `modal`). Every existing modal and picker already stacks above it, so nothing opened from a drawer field needs re-layering.                                                                                                                                                                                                                                                                                   |
| D20 | **Translation deferred**        | Every drawer label goes through `t()` with keys under `widgetSettings.*` in `locales/en.json` only. `de`/`es`/`fr` entries are **not** written in this series and no `tests/i18n/widgetSettings*Locales.test.ts` parity test is added. i18next falls back to English (`fallbackLng: 'en'`). Rationale: the locales exist for student-facing widget content used by world-language teachers; staff-facing settings chrome was never the target. A follow-up series owns the translations (§8). |
| D21 | **Single widget at a time**     | The drawer edits exactly one widget. Product owner confirmation: nobody edits two widgets' settings simultaneously, so the current ability to have several panels flipped at once is not a capability to preserve. The host un-flips siblings and `migrateWidget` normalizes stored boards to at most one `flipped` widget (§3, §4.4).                                                                                                                                                        |

## 3. Target UX

**Drawer chrome** (shared by every widget):

1. Header: widget title (`widget.customTitle ?? title`), `WidgetBuildingToggle`, help button
   (existing `useHelpItemsForWidget` / `requestOpenHelp` wiring), close button whose tooltip **and**
   `aria-label` are `t('widgetSettings.common.close')`, and which carries
   `data-testid="settings-drawer-close"`. `tests/e2e/nexus_qr_text.spec.ts` currently selects
   `getByLabel('Close settings')`; wave 1b switches it to the test id so no string is exempt
   from `t()`. Tab names and the empty-state text move to `widgetSettings.common.*` keys.
2. Tab bar pinned under the header: **Settings** · **Style**. Same two tabs, always.
3. Scrollable body. Settings tab renders schema groups in D8 order as titled sections. Style tab
   renders the universal style fields the widget opts into, then window background, then
   transparency (moved verbatim from the current panel).
4. Board-facing-edge resize handle (D4). Keyboard: Esc closes; the existing `Alt+S` handler in
   `DraggableWindow.tsx` (`if (e.altKey)` → `case 's'` → toggles `flipped`) keeps working
   unchanged.
5. **The drawer root must carry `data-widget-portal=""` and `data-widget-id={widget.id}`**,
   mirroring `SettingsPanel.tsx`. Those attributes are load-bearing: `DashboardView.tsx`
   resolves the topmost widget via `'.widget, [data-widget-portal]'`, and `DraggableWindow.tsx`
   plus `GuidedLearning/ScreenCaptureModal.tsx` use them to tell "Escape from inside our portal"
   from a global Escape. `tests/components/common/SettingsPanel.test.tsx` asserts them. (The
   `DashboardView.tsx` comment saying only `SettingsPanel` carries `data-widget-id` is stale:
   `DraggableWindow`, `DraggableSticker`, `Embed`, `NeedDoPutThen`, and `MiniApp` set it too.
   Carry both attributes regardless; do not rely on that comment.)
6. Layering (D19): add `drawer: 9980` to `config/zIndex.ts` between `annotationChrome` (9970)
   and `announcementOverlay` (9985). Every modal (`modal` 10000 and up), popover (11000), tool
   menu, tooltip, toast, and dialog already stacks above it, so a Drive picker, library modal,
   or color popover opened from a drawer field needs no change. The drawer's own in-body
   dropdowns use `popover`. Wave 1b.8 adds a unit test asserting
   `Z_INDEX.drawer < Z_INDEX.modal` and `Z_INDEX.drawer < Z_INDEX.popover`.
7. **Side selection** (D2/D3): on open, compute the widget's screen rect. If it fits entirely in
   the band left of a right-docked drawer, dock right; else if it fits in the band right of a
   left-docked drawer, dock left; else dock right and auto-pan. The side is chosen once per open
   and does not flip while the drawer stays open (swapping widgets re-evaluates). The chosen
   side is announced through a visually-hidden live region (`widgetSettings.common.dockedLeft` /
   `dockedRight`). Maximized widgets always dock right.
8. **Edited-widget focus ring**: while the drawer is open, the edited widget's `DraggableWindow`
   root carries `data-settings-target` and a 2px `ring-brand-blue-primary` outline, so on a
   projected 4K board the teacher can always find which widget the drawer controls.
9. **Responsive** (D14): below 900px viewport width the same component renders as a bottom sheet
   (full width, 50vh default, drag handle on top, 35–85vh range) and side selection / auto-pan
   are skipped. One component, one prop (`placement: 'right' | 'left' | 'bottom'`) derived from
   `useWindowSize`. The drawer E2E runs at 1280×800 and at 1024×768 (bottom sheet).
10. **Accessibility** (D17):
    - Root: `role="dialog"`, `aria-modal="false"`, `aria-labelledby` → the header title id.
      Non-modal is deliberate: the board must stay operable while the drawer is open, so there
      is **no focus trap**.
    - Focus moves to the drawer header on open (`tabIndex={-1}` on the heading). On close, focus
      returns to the element that opened it: `DraggableWindow` passes its gear button ref via
      the host; if that element is gone, focus the widget root.
    - Resize handle: `role="separator"`, `aria-orientation="vertical"`, `aria-valuemin/max/now`
      in px, keyboard-operable with ArrowLeft/ArrowRight (16px steps, Shift = 64px), and a
      visible focus ring. The bottom-sheet handle (§3 item 9) is the same element with
      `aria-orientation="horizontal"`, ArrowUp/ArrowDown, and `aria-valuemin/max/now` in vh.
    - Every field label is a real `<label for>` or `aria-labelledby`; `help` text is linked with
      `aria-describedby`. `SettingsLabel` keeps the `as="span"` + `role="group"` pattern for
      chip groups.
    - Open/close transitions respect `prefers-reduced-motion` (fade only, no slide).
    - Contrast: drawer surfaces are light; muted text uses `text-slate-600` minimum (AA on
      white). Tests: `tests/components/settings/SettingsDrawer.a11y.test.tsx` runs `axe-core`
      (add `vitest-axe` as a dev dependency in wave 1a) against the empty drawer and against
      every migrated schema (§7 item 7).

**Board behavior**:

- Opening pushes nothing; the drawer overlays the canvas. If side selection (§3 item 7) found
  a side that needs no pan, nothing else happens. Otherwise the canvas auto-pans so the widget's
  screen rect fits inside the free band beside the drawer (D3). If the widget is wider than that band at current zoom, pan to align its left edge and do
  not zoom out (zooming changes what the teacher is previewing). The requested offset must pass
  the existing `clampPan` / `getPanRange` in `utils/zoomPanMath.ts`; at zoom 1 the range is
  ±viewport/2, so a partial pan is the expected outcome for large widgets.
- Closing restores the pre-open `panOffset`. If the teacher panned manually while the drawer was
  open, do not restore (their explicit camera wins). **Detecting a manual pan**: the `board-pan`
  window event fires for every `panOffset` change, including the drawer's own auto-pan, so the
  camera hook sets a `pendingProgrammaticPan` ref before calling `requestPan`, consumes exactly
  one `board-pan` event against it, and treats any other `board-pan` while open as user-owned
  (unit-tested in 1b.9: auto-pan then close restores; auto-pan, wheel-pan, then close does not). A board switch or a `camera-reset` event
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
`updateWidget(id, { flipped: !flipped })`; bulk unflips exist only on board switch and on the
minimize-all / restore-all paths in `DashboardContext.tsx`), so **stored boards can contain
several `flipped: true` widgets**. The host therefore: (a) picks the flipped widget with the
highest `z` (else first in array) to show, (b) un-flips the previous widget whenever a new one
flips, and (c) relies on a one-time board-level normalization `normalizeFlipped(widgets)` that
clears `flipped` on all but one widget (§4.4). It is board-level because `migrateWidget` is a
per-widget mapper (`widgets.map(migrateWidget)`) and cannot see siblings. This is a
simplification, not a loss (D21).

## 4. Architecture

### 4.1 Files (new)

```
components/settings/
├── SettingsDrawer.tsx            # portal host: chrome, tabs, resize handle, Style tab
├── SettingsDrawerHost.tsx        # mounted once in DashboardView; finds the flipped widget
├── useSettingsDrawerPlacement.ts # side selection + bottom-sheet breakpoint (§3 items 7, 9)
├── useSettingsDrawerCamera.ts    # auto-pan / restore logic against panOffset + zoom
├── useSettingsDrawerFocus.ts     # focus move on open, focus return on close (§3 item 10)
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
    └── LegacySettingsSlot.tsx    # wraps WIDGET_SETTINGS_COMPONENTS[type] until migrated; deleted in wave 10
```

Also new: `scripts/new-widget-settings.ts` (run as `pnpm run new-widget-settings <type>`)
scaffolds `settings.schema.ts`, the `widgetSettings.<type>.*` keys in `locales/en.json`, the
schema test, and the migration fixture, so a new widget never starts from a
copied 400-line file. The `new-widget` skill invokes it.

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
  styleKeys?: ReadonlyArray<AppearanceKey>; // Content-tier Style fields this widget consumes (D18)
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
  No field may write outside `config` except the **Window tier** of the Style tab (D18), which
  targets exactly four `WidgetData` fields: `backgroundColor`, `transparency`, `fontFamily`,
  `baseTextSize`. That tier is rendered by `schema/windowStyle.tsx` for every widget and is not
  part of any schema. The Content tier (`styleKeys`) writes `config` only. A widget that consumes
  `config.fontFamily` still shows the window font control; the two are different scopes (whole
  frame vs. widget content) and both are labeled as such.
- Labels are i18n keys under `widgetSettings.<widgetType>.*` in `locales/en.json`. Shared field
  labels live under `widgetSettings.common.*`. Per D20, only `en.json` is written in this series;
  the other locales fall back to English.
- Board isolation is unchanged: schema keys are per-board by default. `styleKeys` may reference
  only members of `APPEARANCE_CONFIG_KEYS` in `utils/widgetConfigPersistence.ts`. Promoting a
  widget knob to a universal key (D7) means adding it to that allowlist **in the same commit**,
  and only if it is purely visual (CLAUDE.md rule).

### 4.3 Field components

Reuse, don't rebuild, where a shared component exists:

| Field                                | Backed by                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FontFamily, Color(font)              | `components/common/TypographySettings.tsx`                                                                                                                          |
| TextSizePreset                       | `components/common/TextSizePresetSettings.tsx`                                                                                                                      |
| SurfaceColor                         | `components/common/SurfaceColorSettings.tsx`                                                                                                                        |
| AccentColor                          | `components/common/AccentColorSettings.tsx`                                                                                                                         |
| Color (generic)                      | `components/common/ColorPresetPicker.tsx` (today reached only through the `SurfaceColor`/`AccentColor`/`Typography` wrappers; no settings file imports it directly) |
| List                                 | `components/common/SortableList.tsx`                                                                                                                                |
| ImageUpload                          | `components/common/DriveImagePicker.tsx` + `hooks/useStorage.ts` (mind §3 item 6 on z-index)                                                                        |
| RosterPicker                         | `components/common/AssignClassPicker.tsx` / `RosterModeControl.tsx`                                                                                                 |
| Labels/sections                      | `components/common/SettingsLabel.tsx` (retained as the section-heading primitive)                                                                                   |
| IconPicker, EmojiPicker, SoundPicker | New; extracted from the first migrated widget that needs each (`TimeTool` for sounds, `Checklist`/`Stations` for icons).                                            |

Every field renders the same anatomy: label row (label + optional reset-to-default), control,
optional help line, with the `<label for>` / `aria-describedby` wiring from §3 item 10 built into
`FieldRenderer` so no field author can omit it. Text sizes: `text-xs` body, `text-xxs` uppercase labels, matching
`SettingsLabel`. Settings panels are not front-face content, so Tailwind sizes are fine here.

### 4.4 Config migration

- **`migrateWidget` (`utils/migration.ts`) runs on exactly two paths today**: the server-board
  normalizer in `hooks/useFirestore.ts` and the snapshot path in `context/DashboardContext.tsx`.
  It does **not** run for shared boards (`mapSharedDocToDashboard` casts straight to
  `Dashboard`), Drive import, `hooks/useTemplateStore.ts`, `hooks/useStarterPacks.ts`, or the
  `savedWidgetConfigs` merge in `utils/widgetConfigPersistence.ts` (`mergeWidgetConfig`). Wave
  1b routes all of those through `migrateWidget` and adds `migrateSavedWidgetConfigs` for
  renamed appearance keys. Without this, a renamed key resurfaces from any of those paths.
- **Characterization first, reroute second.** Before wave 1b.6 touches a load path, it captures
  a fixture board through that path (`tests/fixtures/boards/{shared,template,starterPack,drive,savedConfigs}.json`)
  and a test asserting today's output shape. Rerouting through `migrateWidget` must leave every
  fixture byte-identical except for the added `configVersion` and cleared `flipped` flags.
  `migrateWidget` is idempotent (running twice equals running once) and that is tested.
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
- Add the one-time `flipped` normalization from §3 as `normalizeFlipped(widgets: WidgetData[])`
  in `utils/migration.ts`, applied **after** `widgets.map(migrateWidget)` at both existing call
  sites (`hooks/useFirestore.ts`, `context/DashboardContext.tsx`) and at every path wave 1b
  reroutes. It clears `flipped` on all but the highest-`z` flipped widget; it is not part of
  `migrateWidget`, which sees one widget at a time.

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
  from wave 1b the drawer would be the only settings surface E2E sees. Wave 1b.4 therefore adds
  `VITE_AUTH_BYPASS_FEATURE_OVERRIDES` (JSON, e.g. `{"settings-drawer":false}`), read by
  `canAccessFeature` **only** under `isAuthBypass`, and a second Playwright project
  `legacy-settings` that sets it and runs `tests/e2e/settings-legacy.spec.ts` plus the QR spec.
  Both surfaces stay E2E-reachable until wave 4 deletes the floating panel. Update
  `tests/e2e/nexus_qr_text.spec.ts` (settings button → `data-testid="settings-drawer-close"`, §3 item 1) in wave 1b.
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
renderer. `SettingsDefEditor.tsx` in the admin builder exposes the full v1 field kit in wave 3.6.
Widening `CustomWidgetSettingDef.type` changes the shape of stored `/custom_widgets/{id}` docs,
so 3.6 also adds `migrateCustomWidgetDefs` in `context/CustomWidgetsContext.tsx` (read path):
the four legacy literals stay valid and unknown types render as a `Custom` schema-gap field
rather than crashing. Fixture test: a pre-3.6 doc loads and renders unchanged.

### 4.8 Auto-pan mechanics (D3)

`panOffset` is `React.useState` local to `DashboardView.tsx` (deliberately outside context to
avoid re-render cascades). It is clamped on every render via `getPanRange`, reset to `{0,0}` on
board switch and on the `camera-reset` event, and the existing `board-pan` window event is
**outbound only** (a notification that pan changed). There is no inbound setter today. Wave 1b
adds one **without a global event**: `DashboardCanvasStore` gains a `registerPanSetter(fn)` slot
(mount-stable, like the other actions in `context/dashboardCanvasStore.ts`); `DashboardView`
registers `(xy) => setPanOffset(clampPan(xy))` on mount and unregisters on unmount. The camera
hook calls `store.requestPan({ x, y })`, which is a no-op when nothing is registered (fallback
hosts, tests). `panOffset` itself stays local state in `DashboardView`; only the setter is
exposed. Do not lift `panOffset` into context and do not add a window event.

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
- **0.3** String count (D20): from the 0.2 inventory, count label/help strings per widget and
  write the totals into §6 (column "Strings"). This sizes the deferred translation follow-up;
  it does not gate any wave in this series.
- **0.4** Legacy render snapshots: a Vitest snapshot of every `WIDGET_SETTINGS_COMPONENTS` and
  `WIDGET_APPEARANCE_COMPONENTS` entry rendered with `WIDGET_DEFAULTS` config
  (`tests/components/settings/legacySnapshots.test.tsx`), rendered through one shared
  `renderLegacySettings(type)` harness that mounts the mocked `Dashboard` / `Auth` /
  `CustomWidgets` / `SavedWidgets` providers the panels need (the harness is the real cost of
  0.4; budget it as its own item). Only the slot content is snapshotted, never the panel or
  drawer chrome. Wave 1b's `LegacySettingsSlot` must reproduce these byte-for-byte; a migrated
  widget's schema test retires its snapshot.

### Wave 1a — Schema + field kit (pure additions, genuinely disjoint)

| Item                                | Files                                                                                                   | Deliverable                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a.1 Schema types + validator       | `components/settings/schema/*`                                                                          | §4.2 types, `defineSettings`, `validateSchema` + a test that iterates `WIDGET_SETTINGS_SCHEMAS`.                                                                   |
| 1a.2 Field kit: basics              | `components/settings/renderer/fields/{Toggle,Text,Textarea,Number,Select,Segmented,Slider}.tsx` + tests | Shared anatomy per §4.3.                                                                                                                                           |
| 1a.3 Field kit: color + typography  | `.../fields/{Color,FontFamily,TextSizePreset,AccentColor,SurfaceColor}.tsx`                             | Thin wrappers over existing shared components.                                                                                                                     |
| 1a.4 Field kit: List + Custom       | `.../fields/{List,Custom}.tsx`                                                                          | `List` over `SortableList` with a per-row sub-schema rendered by `FieldRenderer`.                                                                                  |
| 1a.5 SchemaRenderer + FieldRenderer | `components/settings/renderer/{SchemaRenderer,FieldRenderer}.tsx`                                       | Groups in D8 order; `visibleWhen`/`disabledWhen`; i18n resolution. Also label/description wiring per §4.3.                                                         |
| 1a.7 a11y tooling + scaffold        | `package.json` (`vitest-axe`), `scripts/new-widget-settings.ts`, `.claude/skills/new-widget`            | §3 item 10 test harness; §4.1 scaffold; the skill calls the scaffold.                                                                                              |
| 1a.6 Defaults backfill              | `config/widgetDefaults.ts` (orchestrator-owned), tests                                                  | Add the missing default keys for the ten §6 widgets per the 0.2 inventory. Waves 5–9 backfill their own widgets the same way, so done bar item 1 holds for all 59. |

Exit: nothing user-visible; validate green.

### Wave 1b — Drawer, host, flag, camera (behind flag, no widget migrated)

| Item                           | Files                                                                                                                                                                                                                                   | Deliverable                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1b.1 Drawer chrome + Style tab | `components/settings/SettingsDrawer.tsx`                                                                                                                                                                                                | Header/tabs/body/resize; `data-widget-portal` + `data-widget-id` on root; ports help, building toggle, transparency from `SettingsPanel.tsx`; Style tab from `schema/styleKeys.ts`.                                                                                                                                                                                                                                                                     |
| 1b.2 Placement, camera, focus  | `components/settings/useSettingsDrawerPlacement.ts`, `useSettingsDrawerCamera.ts`, `useSettingsDrawerFocus.ts`, `context/dashboardCanvasStore.ts` (`registerPanSetter`), `DashboardView.tsx` (orchestrator-owned: registers the setter) | §3 items 7–10, §4.8.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1b.3 Host + legacy slot        | `components/settings/SettingsDrawerHost.tsx`, `components/settings/legacy/LegacySettingsSlot.tsx`                                                                                                                                       | Narrow canvas-store subscription; flipped tie-break per §3; memoized schema `import()` map.                                                                                                                                                                                                                                                                                                                                                             |
| 1b.4 Flag + legacy E2E project | `types.ts` (orchestrator-owned), `config/featureDefaults.ts` + test, `components/admin/GlobalPermissionsManager.tsx`, `context/AuthContext.tsx` (bypass overrides), `playwright.config.ts`                                              | §4.5, including `VITE_AUTH_BYPASS_FEATURE_OVERRIDES` and the `legacy-settings` project.                                                                                                                                                                                                                                                                                                                                                                 |
| 1b.5 Renderer/window wiring    | `components/widgets/WidgetRenderer.tsx`, `components/common/DraggableWindow.tsx` (`settings` optional)                                                                                                                                  | Flag branch; drawer host receives the widget.                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1b.6 Migration plumbing        | `utils/migration.ts`, `hooks/useFirestore.ts`, `hooks/useTemplateStore.ts`, `hooks/useStarterPacks.ts`, `utils/widgetConfigPersistence.ts`                                                                                              | `configVersion` on `WidgetData`, `WIDGET_CONFIG_MIGRATIONS`, all load paths per §4.4, `flipped` normalization.                                                                                                                                                                                                                                                                                                                                          |
| 1b.7 Width persistence         | `types.ts` (orchestrator-owned), `context/AuthContext.tsx` write path                                                                                                                                                                   | §4.6.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1b.8 z-index                   | `config/zIndex.ts`, `tailwind.config.js`                                                                                                                                                                                                | Add `drawer: 9980` per D19 plus the ordering test.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1b.9 Tests                     | `tests/components/settings/*`, `tests/e2e/settings-drawer.spec.ts`, `tests/e2e/nexus_qr_text.spec.ts`                                                                                                                                   | Port the nine `SettingsPanel.test.tsx` behaviours (portal attrs, click-outside after `onClose` identity change, dialog-click exclusion, `board-pan` re-measure, Escape-in-field, Escape propagation) to drawer tests; drawer E2E; fix the QR spec; the no-widget-movement test from §4.9. Plus: side-selection unit tests (fits-right, fits-left, needs-pan, maximized); bottom-sheet E2E at 1024×768; focus-return test; axe test on the empty drawer. |

Exit: flag on for admins (on in the default E2E project, off in `legacy-settings`), every widget
opens in the drawer showing its legacy panel inside the new chrome with the 0.4 snapshots still
passing, Style tab two-tier, validate green.

### Wave 2 — Pickers + migration batch A (top 1–5)

| Item                                                                       | Files                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 IconPicker, EmojiPicker, SoundPicker, ImageUpload, RosterPicker fields | `components/settings/renderer/fields/*` (+ extraction from the widget that owns the current implementation). **Must land before any 2.x widget that needs them**; the orchestrator sequences 2.1 first, then the five widgets in parallel.                                                                                  |
| 2.2–2.6 Migrate widgets #1–#5                                              | `components/widgets/<W>/settings.schema.ts`; delete the widget's legacy settings file (**not always `Settings.tsx`**: e.g. `random/RandomSettings.tsx`; read `WIDGET_SETTINGS_COMPONENTS` for the real path) and its appearance export; registry entries and locale keys (orchestrator-owned); migration step; tests per §7 |
| 2.7 English keys for #1–#5                                                 | `locales/en.json` (orchestrator-owned). `de`/`es`/`fr` untouched per D20.                                                                                                                                                                                                                                                   |

Each migration item is one agent, one widget. The agent owns only that widget's folder and its
migration step; it hands registry lines and locale entries to the orchestrator as a patch.

### Wave 3 — Migration batch B (top 6–10) + Custom Widget Builder

- 3.1–3.5 Migrate widgets #6–#10 (same shape as wave 2).
- 3.6 `customDefsToSchema` adapter and `CustomWidget/Settings.tsx` through the renderer (D13),
  **and** `SettingsDefEditor.tsx` in the admin builder exposes the full v1 field kit (§8 item 1
  is resolved as "full kit now"; the four legacy def types stay readable).
- 3.7 Field-kit gap review: every `Custom` field left in migrated schemas gets a decision:
  promote to a real field type now, or record in §8.
- 3.8 English keys for #6–#10 (same shape as 2.7).

### Wave 4 — Flip default and delete the floating panel

- 4.1 `settings-drawer` default → `public`.
- 4.2 Delete `components/common/SettingsPanel.tsx`, `SettingsPanel.help.test.tsx`,
  `tests/components/common/SettingsPanel.test.tsx`, the `settings` / `appearanceSettings` props
  on `DraggableWindow` (and the ~10 `DraggableWindow.test.tsx` cases that pass them), the
  `legacy-settings` Playwright project, and the bypass override env. Unmigrated widgets keep
  `WIDGET_SETTINGS_COMPONENTS` / `WIDGET_APPEARANCE_COMPONENTS` rendered via
  `LegacySettingsSlot` until their wave below.
  **Update `scripts/test-count-baseline.json`**: `pnpm run test:counts` runs inside `validate`
  and fails when suites disappear.
- 4.3 Remove the flag after one release cycle (separate tiny PR; noted here so it isn't
  forgotten).
- 4.4 Update `CLAUDE.md` "Settings Panel" section and the `new-widget` skill templates to the
  schema pattern. Add an ESLint rule (`no-restricted-syntax` on new entries in
  `WIDGET_SETTINGS_COMPONENTS` / `WIDGET_APPEARANCE_COMPONENTS`) so no new legacy panel can be
  added while the burndown runs.

### Waves 5–9 — Migrate the remaining 49 widgets (D9)

Same item template as wave 2, ten widgets per wave (nine in the last), ordered by the analytics
ranking continued past #10. Each wave carries its `en.json` key item and retires its 0.4
snapshots. Widgets whose settings open an editor modal (Quiz, VideoActivity, GuidedLearning)
wrap the "open editor" button as a `Custom` field with a `// schema-gap:` note and do not inline
the editor. Keep a burndown table in `docs/plans/widget-settings-inventory.md` (widget · wave ·
PR · done) updated by every wave's orchestrator.

### Wave 10 — Delete the legacy slot

- 10.1 Delete `components/settings/legacy/LegacySettingsSlot.tsx`, `WIDGET_SETTINGS_COMPONENTS`,
  `WIDGET_APPEARANCE_COMPONENTS`, `legacySnapshots.test.tsx`, and the ESLint rule from 4.4
  (nothing left to guard). Update `scripts/test-count-baseline.json`.
- 10.2 `WIDGET_SETTINGS_SCHEMAS` becomes `Record<WidgetType, …>` (no longer `Partial`) so a new
  widget without a schema fails type-check.

## 6. Top-10 migration list

**Status: PROVISIONAL — replace in wave 0.1 with the analytics-ranked list.**

Provisional (largest legacy settings files, verified 2026-09-05):

| #   | Widget             | Legacy settings file                                 | Lines | Strings (0.3) |
| --- | ------------------ | ---------------------------------------------------- | ----- | ------------- |
| 1   | Schedule           | `components/widgets/Schedule/Settings.tsx`           | 938   | TBD           |
| 2   | SpecialistSchedule | `components/widgets/SpecialistSchedule/Settings.tsx` | 731   | TBD           |
| 3   | RevealGrid         | `components/widgets/RevealGrid/Settings.tsx`         | 703   | TBD           |
| 4   | Poll               | `components/widgets/PollWidget/Settings.tsx`         | 650   | TBD           |
| 5   | Random             | `components/widgets/random/RandomSettings.tsx`       | 641   | TBD           |
| 6   | TimeTool           | `components/widgets/TimeTool/Settings.tsx`           | 641   | TBD           |
| 7   | Materials          | `components/widgets/MaterialsWidget/Settings.tsx`    | 572   | TBD           |
| 8   | Weather            | `components/widgets/Weather/Settings.tsx`            | 549   | TBD           |
| 9   | NumberLine         | `components/widgets/NumberLine/Settings.tsx`         | 447   | TBD           |
| 10  | NextUp             | `components/widgets/NextUp/Settings.tsx`             | 433   | TBD           |

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
5. All labels, including the close button's `aria-label`, through `t()` with keys present in
   `locales/en.json`. No hardcoded English JSX
   strings remain in the schema or drawer chrome. `de`/`es`/`fr` are deferred (D20); do **not**
   add a `widgetSettings` parity test to `tests/i18n/`, it would fail by design.
6. PR description lists removed controls, renamed keys, and `schema-gap` custom fields.
7. Axe: `SettingsDrawer.a11y.test.tsx` renders the widget's schema in the drawer and passes
   `axe-core` with zero violations; every field has an accessible name.
8. Focus: the drawer E2E tabs from the header through every field of the Settings tab without
   leaving the drawer unexpectedly, and closing returns focus to the gear button.
9. Bottom sheet: the schema renders inside the 1024×768 bottom sheet with no horizontal scroll.
10. The widget's 0.4 legacy snapshot is deleted and the burndown table row is marked done.

## 8. Open questions (raise, don't assume)

- ~~Whether `SettingsDefEditor.tsx` should expose the full v1 field kit~~ **Resolved (rev 2):**
  full kit in wave 3.6.
- Whether analytics should rank by widget adds or by widgets present on active boards (plan
  assumes adds; both are acceptable, state which was used).
- ~~Widgets whose settings open other modals~~ **Resolved (rev 2):** they migrate in waves 5–9
  with the "open editor" button as a `Custom` field; the editor is never inlined.
- ~~z-index resolution for nested pickers~~ **Resolved (rev 2):** D19, drawer below `modal`.
- ~~Who the fluent `de`/`es`/`fr` reviewer is~~ **Resolved (rev 3):** translations deferred to
  a follow-up series (D20). The follow-up starts from the §6 "Strings" column and adds the
  parity test when it lands. Only the analytics ranking question remains open.

## 9. Non-goals

- `/remote` mobile settings (D14). Note `RemoteWidgetCard.tsx` writes `flipped: false` on
  maximize; that stays compatible with the host.
- Admin-level widget configuration modals (`admin-widget-config` skill territory).
- Changing front-face widget rendering or container-query scaling.
- Inlining the Quiz / VideoActivity / GuidedLearning editors into the drawer.
- `de`/`es`/`fr` translations of settings labels (D20).
- Editing more than one widget's settings at once (D21).

## 10. Revision 2 — changes made against the graded comparison

A comparison on 2026-09-05 graded the original proposal against the current floating panel per
category. Every category below A was revised; this table records what changed and where.

| Category                           | Was | Gap                                                                                   | Fix in this revision                                                                                    |
| ---------------------------------- | --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Panel placement                    | A-  | Right-only dock is predictable but not always near the widget.                        | Deterministic side selection, announced (D2, §3 item 7).                                                |
| Widget stays visible while editing | B+  | Drawer could sit a full projector-width from a small widget; partial pan on big ones. | Side selection before pan; focus ring on the edited widget (§3 7–8).                                    |
| Internal structure consistency     | A-  | 49 widgets would keep hand-rolled JSX indefinitely.                                   | All 59 migrate; legacy slot deleted (D9, waves 5–10).                                                   |
| Same setting, same control         | A-  | Custom escape hatch could become permanent.                                           | Gap review per wave; `Record` type in wave 10.2 closes the door.                                        |
| Style tab predictability           | A-  | Window-level `fontFamily`/`baseTextSize` were unaddressed.                            | Two explicit tiers, Window and Content (D18, §4.2).                                                     |
| Internationalization               | B   | Hundreds of strings × 3 locales unbudgeted; chrome strings hardcoded.                 | Budget in 0.3, sized items per wave, named reviewer; chrome keys (reviewer later dropped by rev 3 D20). |
| Authoring a new widget's settings  | A-  | Still a hand-written schema plus four locale edits.                                   | `new-widget-settings` scaffold wired into the skill (§4.1, 1a.7).                                       |
| Config hygiene and migrations      | B+  | Rerouting five load paths through `migrateWidget` was a wide, untested change.        | Characterization fixtures per path before reroute; idempotence test.                                    |
| Keyboard and screen reader         | B   | Only Escape and Alt+S were specified.                                                 | Non-modal dialog, focus in/out, keyboard resize, axe per widget (D17).                                  |
| Preserving tuned behaviors         | B+  | Nine tests ported, but legacy panels had no render guard inside the new chrome.       | 0.4 snapshots of every legacy panel, byte-identical through the slot.                                   |
| Space on small screens             | B   | 360px minimum on a 1024px tablet; tablets unaddressed.                                | Bottom sheet below 900px; E2E at 1024×768 (§3 item 9).                                                  |
| Canvas interaction                 | B+  | New inbound global window event added coupling.                                       | Typed `registerPanSetter` on the canvas store, no event (§4.8).                                         |
| Coverage of the primary pain (D1)  | C+  | Series fixed structure for 10 of 59 widgets.                                          | Waves 5–9 migrate the rest; wave 10 removes the second system.                                          |
| Custom Widget Builder              | A-  | Admin builder stayed on four field types.                                             | Full v1 kit in 3.6.                                                                                     |
| Rollout safety                     | A-  | Legacy path unreachable by E2E while flagged.                                         | Bypass override env + `legacy-settings` Playwright project (§4.5).                                      |
| Open questions                     | —   | z-index and editor-modal widgets were unresolved and blocked wave 1b.                 | Resolved in §8; translation reviewer and analytics ranking remained open (reviewer closed by rev 3).    |

Cost of the revision: the series grows from four code waves to ten. The translation work made
explicit here was subsequently deferred in revision 3 (§11).

## 11. Revision 3 — product owner re-scope

A second independent grading on 2026-09-05 left four categories below A. The product owner ruled
on each; this table records the ruling and where the plan changed.

| Category                   | Was | Ruling                                                                                                                                    | Change                                                                                      |
| -------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Space / drawer size        | A-  | The current 380px × 80vh panel is cramped and overloaded. A larger full-height surface is the point, not a cost.                          | D4 rationale; "board coverage" is an accepted trade, not a regression to grade against.     |
| Multi-widget editing       | C+  | Nobody edits two widgets' settings at once. The category is moot.                                                                         | D21 added; §3 and §9 updated. Not a graded category.                                        |
| Internationalization       | B+  | Locales exist for student-facing widget content (world-language teachers). Staff-facing settings i18n ballooned beyond intent. Defer.     | D20 rewritten; 0.3, 2.7, 3.8, waves 5–9, done bar 5, §8, §9 updated. English keys only.     |
| Scope, cost, delivery risk | C   | Removing the translation stream cuts the largest non-engineering dependency (an unnamed fluent reviewer) from every wave's critical path. | Waves keep their shape; each is now engineering-only and mergeable without external review. |

Grading instruction for future reviewers: grade the drawer's larger footprint as an improvement
over the current panel, do not grade multi-widget editing, and grade i18n on "every string goes
through `t()` with an English key" rather than on locale coverage.

## 12. Revision 4 — corrections from the third independent grading

A third grading on 2026-09-05 re-measured every §1 claim against the tree and graded both systems
per category (current overall C-, proposal A-). All measured figures held except the two counts
corrected below. This table records each factual correction and each sub-A gap with its fix.

| Item                     | Finding                                                                                                       | Change                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Appearance count         | `WIDGET_APPEARANCE_COMPONENTS` has 29 entries, not 21 (already 29 when rev 1 was written).                    | §1 corrected.                                                                      |
| Settings count           | `WIDGET_SETTINGS_COMPONENTS` has 59 entries, not 55; the 59 files and 59 entries are different sets.          | §1 corrected.                                                                      |
| `flipped` normalization  | Described as living in `migrateWidget`, which is a per-widget mapper and cannot pick the highest-`z` sibling. | Board-level `normalizeFlipped` at both call sites (§3, §4.4).                      |
| "Only bulk unflip"       | Minimize-all / restore-all in `DashboardContext.tsx` also unflip in bulk.                                     | §3 wording corrected; design unchanged.                                            |
| `data-widget-id` comment | The `DashboardView.tsx` comment that only `SettingsPanel` carries it is stale (five other components do).     | §3 item 5 notes it; attributes still required.                                     |
| i18n exemption           | `Close settings` was exempt from `t()` to keep an E2E selector stable.                                        | Localized; QR spec switches to `data-testid` (§3 item 1, §4.5, done bar 5).        |
| Manual-pan detection     | `board-pan` fires for the drawer's own auto-pan, so "teacher panned manually" was undetectable.               | `pendingProgrammaticPan` ref, consumed once, with a unit test (§3 Board behavior). |
| Bottom-sheet keyboard    | Only the vertical separator had keyboard operation specified.                                                 | Horizontal variant with ArrowUp/Down (§3 item 10).                                 |
| Custom-widget defs       | Widening `CustomWidgetSettingDef.type` changed stored `/custom_widgets` docs with no migration.               | `migrateCustomWidgetDefs` on the read path in 3.6 (§4.7).                          |
| Defaults backfill scope  | Only the ten §6 widgets were backfilled, but done bar item 1 applies to all 59.                               | Waves 5–9 backfill their own widgets (1a.6).                                       |
| 0.4 snapshot cost        | Snapshotting 84 lazy components under mocked providers was unbudgeted and "byte-identical" was over-broad.    | Shared `renderLegacySettings` harness as its own item; slot content only (0.4).    |
| §10 stale rows           | The i18n and open-questions rows still referenced the named reviewer after rev 3 deferred translations.       | Rows annotated.                                                                    |

Remaining below A after this revision: **scope, cost, and delivery risk (B-)**. Ten waves and 59
migrations are inherent to D9, the analytics ranking (wave 0.1) is still an external dependency,
and `pauls-skills:mass-plan-implementation` is not installed in every session. None of these
change the design; they are accepted by the product owner as the price of removing the second
settings system.
