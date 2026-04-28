# Widget Registry Consistency — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: daily_
_Last audited: 2026-04-28_
_Last action: 2026-04-26_

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW `catalyst-instruction`, `catalyst-visual` absent from config/tools.ts

- **Detected:** 2026-04-12
- **File:** config/tools.ts, types.ts
- **Detail:** Both sub-types are in the WidgetType union, are registered in WIDGET_COMPONENTS and WIDGET_SETTINGS_COMPONENTS, and have entries in widgetDefaults.ts. They are intentionally absent from config/tools.ts because they are programmatically spawned by the Catalyst widget, not user-selectable from the Dock. However, this is undocumented — a developer adding a new sub-widget type could mistakenly conclude they need a tools.ts entry.
- **Fix:** Add a comment in config/tools.ts near the catalyst entry noting that `catalyst-instruction` and `catalyst-visual` are intentionally omitted because they are spawned programmatically.

### LOW `mathTool`, `onboarding`, `custom-widget` absent from config/tools.ts

- **Detected:** 2026-04-12
- **File:** config/tools.ts, types.ts
- **Detail:** These three WidgetTypes are fully registered in all other locations (WIDGET_COMPONENTS, widgetDefaults.ts, widgetGradeLevels.ts) but are absent from config/tools.ts because they cannot be directly added from the Dock. `mathTool` is spawned by mathTools, `onboarding` is a one-time system widget, `custom-widget` is created via the Custom Widget system. This is intentional but undocumented.
- **Fix:** Add a comment block in config/tools.ts documenting which WidgetTypes are intentionally excluded from the dock and why.

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

### LOW `sticker` widget bypasses WIDGET_COMPONENTS via WidgetRenderer special-case

- **Detected:** 2026-04-12
- **Completed:** 2026-04-26
- **File:** components/widgets/WidgetRegistry.ts, components/widgets/WidgetRenderer.tsx:271-273
- **Detail:** `sticker` is a valid WidgetType in types.ts and has entries in widgetDefaults.ts and WIDGET_SCALING_CONFIG, but is intentionally absent from WIDGET_COMPONENTS and WIDGET_SETTINGS_COMPONENTS. WidgetRenderer handles it via a hard-coded branch (`if (widget.type === 'sticker') return <StickerItemWidget ... />`). This special-casing bypasses the standard registry pattern and is a silent failure point if any other code looks up WIDGET_COMPONENTS['sticker'].
- **Resolution:** Chose option (b) — added a JSDoc block on the `WIDGET_COMPONENTS` export in `components/widgets/WidgetRegistry.ts` documenting that the map is intentionally not exhaustive over all `WidgetType`s. The note specifically calls out `sticker` (handled via the hard-coded branch in `WidgetRenderer.tsx:271-273`), warns against adding a `sticker` entry without also removing the special-case branch, and tells future developers to handle the `undefined` case at call sites. Documentation-only change — no behavioral impact, all 1476 tests still pass; `pnpm type-check`, `pnpm lint --max-warnings 0`, and `pnpm format:check` all clean.
