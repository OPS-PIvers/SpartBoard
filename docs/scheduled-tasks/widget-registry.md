# Widget Registry Consistency — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: daily_
_Last audited: 2026-04-13_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW `sticker` widget bypasses WIDGET_COMPONENTS via WidgetRenderer special-case

- **Detected:** 2026-04-12
- **File:** components/widgets/WidgetRenderer.tsx:277, components/widgets/WidgetRegistry.ts:468
- **Detail:** `sticker` is a valid WidgetType in types.ts and has entries in widgetDefaults.ts and WIDGET_SCALING_CONFIG, but is intentionally absent from WIDGET_COMPONENTS and WIDGET_SETTINGS_COMPONENTS. WidgetRenderer handles it via a hard-coded branch (`if (widget.type === 'sticker') return <StickerItemWidget ... />`). This special-casing bypasses the standard registry pattern and is a silent failure point if any other code looks up WIDGET_COMPONENTS['sticker'].
- **Fix:** Either (a) register StickerItemWidget in WIDGET_COMPONENTS to normalize the pattern, or (b) add a JSDoc comment on the WIDGET_COMPONENTS object explaining the sticker exception so future developers do not accidentally rely on WIDGET_COMPONENTS being exhaustive over all WidgetTypes.

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

---

## Completed

_No completed items yet._
