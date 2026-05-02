# Widget Registry Consistency — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: daily_
_Last audited: 2026-05-02_
_Last action: 2026-05-02_

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW `stickers` missing from `WIDGET_SETTINGS_COMPONENTS`

- **Detected:** 2026-04-14
- **File:** components/widgets/WidgetRegistry.ts
- **Detail:** `stickers` (StickerBook) has entries in `WIDGET_COMPONENTS`, `WIDGET_APPEARANCE_COMPONENTS`, `WIDGET_SCALING_CONFIG`, `widgetDefaults.ts`, `widgetGradeLevels.ts`, and `tools.ts`, but is absent from `WIDGET_SETTINGS_COMPONENTS`. `stickers/StickerBookSettings.tsx` exports `StickerBookAppearanceSettings` (wired into appearance panel), but there is no flip-panel settings component registered. As a result flipping the stickers widget shows no settings tab — only the appearance tab. May be intentional if stickers has no non-appearance settings, but is undocumented.
- **Fix:** Either (a) confirm this is intentional and add a JSDoc comment in `WIDGET_SETTINGS_COMPONENTS` noting stickers has appearance-only settings, or (b) create a `StickerBookSettings` component and register it if any non-appearance settings (e.g. lock/reset) are desired.

### LOW `blooms-detail` missing from `WIDGET_SETTINGS_COMPONENTS`

- **Detected:** 2026-04-17
- **File:** components/widgets/WidgetRegistry.ts, components/widgets/BloomsTaxonomy/DetailWidget.tsx
- **Detail:** `blooms-detail` is registered in `WIDGET_COMPONENTS` (line 191) and `WIDGET_SCALING_CONFIG`, but has no entry in `WIDGET_SETTINGS_COMPONENTS`. `BloomsTaxonomy/DetailWidget.tsx` exports no Settings component. Because `blooms-detail` is a programmatically-spawned companion widget (not user-selectable from the Dock), having no settings panel may be intentional — but it is undocumented. Flipping a blooms-detail widget card will show an empty settings area with no controls.
- **Fix:** Either (a) add a JSDoc comment in `WIDGET_SETTINGS_COMPONENTS` noting that `blooms-detail` intentionally has no settings panel (it is read-only, managed by the parent `blooms-taxonomy` widget), or (b) create a minimal `BloomsDetailSettings` component for any future per-instance configuration needs.

---

## Completed

### LOW `config/tools.ts` lacks documentation of intentionally-excluded `WidgetType`s

- **Detected:** 2026-04-12 (catalyst sub-types), 2026-04-12 (mathTool/onboarding/custom-widget), 2026-05-01 (blooms-detail)
- **Completed:** 2026-05-02
- **File:** config/tools.ts
- **Detail:** Six `WidgetType`s are fully registered elsewhere (WIDGET_COMPONENTS, widgetDefaults.ts, widgetGradeLevels.ts) but intentionally absent from `config/tools.ts` because they are not user-selectable from the Dock: `catalyst-instruction` and `catalyst-visual` (spawned by `catalyst`), `blooms-detail` (spawned by `blooms-taxonomy`), `mathTool` (spawned by the `mathTools` palette), `custom-widget` (created via Custom Widget system), and `onboarding` (one-time system widget). Each omission was deliberate but undocumented — a developer adding a new sub-widget could mistakenly conclude they needed a tools.ts entry.
- **Resolution:** Added a JSDoc block above the `TOOLS` export in `config/tools.ts` explaining that the catalog is intentionally not exhaustive over `WidgetType` and listing each excluded type with the reason it is excluded. Also referenced `sticker`, which is handled via the `WidgetRenderer` special-case branch (already documented in the prior `WIDGET_COMPONENTS` comment, surfaced here for completeness). Documentation-only change — no behavioral impact. `pnpm type-check`, `pnpm exec eslint config/tools.ts --max-warnings 0`, and `pnpm exec prettier --check config/tools.ts` all clean.

### LOW `sticker` widget bypasses WIDGET_COMPONENTS via WidgetRenderer special-case

- **Detected:** 2026-04-12
- **Completed:** 2026-04-26
- **File:** components/widgets/WidgetRegistry.ts, components/widgets/WidgetRenderer.tsx:271-273
- **Detail:** `sticker` is a valid WidgetType in types.ts and has entries in widgetDefaults.ts and WIDGET_SCALING_CONFIG, but is intentionally absent from WIDGET_COMPONENTS and WIDGET_SETTINGS_COMPONENTS. WidgetRenderer handles it via a hard-coded branch (`if (widget.type === 'sticker') return <StickerItemWidget ... />`). This special-casing bypasses the standard registry pattern and is a silent failure point if any other code looks up WIDGET_COMPONENTS['sticker'].
- **Resolution:** Chose option (b) — added a JSDoc block on the `WIDGET_COMPONENTS` export in `components/widgets/WidgetRegistry.ts` documenting that the map is intentionally not exhaustive over all `WidgetType`s. The note specifically calls out `sticker` (handled via the hard-coded branch in `WidgetRenderer.tsx:271-273`), warns against adding a `sticker` entry without also removing the special-case branch, and tells future developers to handle the `undefined` case at call sites. Documentation-only change — no behavioral impact, all 1476 tests still pass; `pnpm type-check`, `pnpm lint --max-warnings 0`, and `pnpm format:check` all clean.
