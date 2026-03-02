# Unifier: Visual Consistency & Design Systems

Unifier is responsible for maintaining a consistent look and feel across all SPART Board widgets, ensuring adherence to the brand's aesthetic and accessibility standards.

## Standards

### Typography

- **UI Elements:** Lexend
- **Accents/Labels:** Patrick Hand
- **Code/Technical:** Roboto Mono

### Color Palette

- **Brand Blue:** #2d3f89 (Primary)
- **Brand Red:** #ad2122 (Primary)
- **Status Colors:** Standard emerald-500 (success), amber-500 (warning), rose-500 (error).

## Component Standardization

### Toggle Switches

- **Action:** Standardized all widget settings to use the custom `Toggle` component.
- **Reference:** PR #328 (Standardize Toggle Switches).

### Floating Panels

- **Action:** Standardized all floating menus and popovers using the shared `FloatingPanel` component.
- **Reference:** PR #487 (Standardized Floating Panels).

### Scaling Logic

- **Container Query System:** Widgets with `skipScaling: true` (most widgets) use CSS Container Queries. All front-face content sizing must use `min(Xpx, Ycqmin)` or `min(Xcqw, Ycqh)` patterns in inline `style={{}}` props.
- **NEVER** use hardcoded Tailwind text/icon size classes (`text-sm`, `text-xs`, `w-12 h-12`, `size={24}`) in widget content — they don't scale when the widget is resized.
- **Settings panels** (back-face) don't need container query scaling — normal Tailwind classes are fine there.
- **Empty/error states:** Use the shared `ScaledEmptyState` component (`components/common/ScaledEmptyState.tsx`) for all widget empty and error states. It auto-scales via `cqmin` units.
- **Instructional Routines:** Uses mathematical "EM-based" scaling to ensure all steps fit within the widget height without vertical scrolling.
- **Bloom's Taxonomy:** Optimized step multiplier to 3.6 for high-density content layouts.
- **Clock:** Fixed dynamic font sizing to prevent overflow on extreme aspect ratios.
- **Reference implementations:** `ClockWidget.tsx`, `WeatherWidget.tsx`, `PollWidget.tsx`.

## Micro-Typography

- In **settings panels**, use `text-xxs` or `text-xxxs` for meta-labels and tracking-widest for uppercase headers.
- In **widget content**, use `style={{ fontSize: 'min(10px, 2.5cqmin)' }}` instead of Tailwind text classes.
- All "meta" labels should be `uppercase tracking-widest text-slate-400 font-black`.

## 2026-02-07 - Floating Menus (Gap)

**Drift:** Multiple widgets (`SeatingChart`, `TimeTool`, `DraggableSticker`) implemented their own "floating menu" or "popover" with inconsistent shadows, border radius, z-index, and animations.
**Fix:** Created `components/common/FloatingPanel.tsx` to standardize the container styling (shadow-xl, rounded-2xl, z-popover) and animations. Refactored affected widgets to use this component.

## 2026-02-08 - Z-Index Standardization

**Drift:** Discovered multiple hardcoded z-index values (e.g., `z-[60]`, `z-[9999]`, `z-[10000]`) across components, creating inconsistent stacking contexts and potential visual bugs (e.g., toasts appearing below modals).

**Fix:** Standardized z-indices by:

1.  Updating `config/zIndex.ts` with new semantic layers:
    - `stickerControl: 50`
    - `widgetResize: 60`
    - `dropdown: 110`
    - `overlay: 9910`
    - `modalNested: 10100`
    - `modalNestedContent: 10110`
    - `modalDeep: 10200`
    - `modalDeepContent: 10210`
2.  Updating `tailwind.config.js` to expose these as utility classes.
3.  Refactoring components (`DraggableWindow`, `SeatingChartWidget`, `DraggableSticker`, `IconPicker`, `DrawingWidget`, `AdminSettings`, `DashboardView`, `FeaturePermissionsManager`, `BackgroundManager`, `GlobalPermissionsManager`) to use the new `z-*` utility classes.

## 2026-02-09 - Toggle Standardization (Gap)

**Drift:** Multiple widgets and admin panels used hardcoded `label` + `input[type="checkbox"]` patterns for toggles, with inconsistent styling, focus states, and sizing.
**Fix:** Refactored all remaining instances to use the shared `Toggle` component. Standardized on `md` size for dashboard widgets and `xs` or `sm` for high-density admin panels.

## 2026-02-09 - Standardize Bloom's Resource Styles

**Drift:** `InstructionalRoutinesWidget` was generating HTML strings with hardcoded inline styles (`color: #2d3f89`, `font-weight: 900`, `color: #1e293b`) for Bloom's Taxonomy resources instead of using design system tokens.
**Fix:** Replaced inline styles with standard Tailwind utility classes (`text-brand-blue-primary`, `font-black`, `text-slate-800`, `text-slate-600`) to enforce design system consistency and eliminate "snowflakes".

## 2026-02-10 - Dock Icon Standardization

**Drift:** The main Dock component used inconsistent sizing methods (padding vs fixed pixels) for different button types (Tools, Folders, System Buttons), resulting in visual size mismatches (36px vs 42px vs 48px vs 52px) and hardcoded "magic numbers".
**Fix:** Created `components/layout/dock/DockIcon.tsx` to enforce a standard responsive size (`w-10 h-10` mobile, `w-12 h-12` desktop) and unified all dock items (Tools, Folders, Live, Classes, Magic, Hide) to use this component.

## 2026-02-12 - Settings Headers (Gap)

**Drift:** Widget settings panels used inconsistent typography for section headers (variations of `text-xxs`, `text-xs`, `text-[10px]`, `font-bold` vs `font-black`, `text-slate-400` vs `text-slate-500`, inconsistent margins).
**Fix:** Created `components/common/SettingsLabel.tsx` to enforce the standard style (`text-xxs font-black text-slate-400 uppercase tracking-widest mb-2`). Refactored 12 widgets to use this component.

## 2026-02-14 - Standardized Modal & Z-Index Refinement

**Drift:** Identified hardcoded modal patterns and inconsistent z-indices (`z-[100000]`, `z-[60]`) in `CategoryEditor.tsx`, `RoutineEditor.tsx`, and `WebcamWidget.tsx` that bypassed the centralized design system.

**Fix:**

1.  Created `components/common/Modal.tsx` as a reusable portal-based component.
2.  Refactored `CategoryEditor` and `RoutineEditor` to use this new component with standardized `z-modal-deep` (10200) layering.
3.  Standardized `WebcamWidget` to use `z-widget-resize` (60), aligning it with the established `config/zIndex.ts` hierarchy.

## 2026-02-15 - Standardized Admin Buttons

**Drift:** Identified multiple hardcoded buttons in `CategoryEditor.tsx`, `RoutineEditor.tsx`, and `BackgroundManager.tsx` that used inconsistent styles (e.g., `indigo-600` vs brand blue, `bg-slate-800` vs standard variants) and manual markup instead of the shared `<Button />` component.
**Fix:**

1.  Added a new `dark` variant to `components/common/Button.tsx` (`bg-slate-800`) to support "neutral" actions like Google Drive integration.
2.  Refactored `CategoryEditor` and `RoutineEditor` to use `<Button variant="primary">` (Save) and `<Button variant="secondary">` (Cancel), unifying the color palette to Brand Blue.
3.  Refactored `BackgroundManager` to use `<Button variant="dark">`, `<Button variant="secondary">`, and `<Button variant="primary">`, replacing custom implementations.

## 2026-02-16 - Micro-Typography Standardization

**Drift:** Identified multiple hardcoded font sizes (`text-[10px]`, `text-[11px]`, `text-[7px]`, `text-[8px]`, `text-[9px]`) across components, bypassing the design system's `text-xxs` and `text-xxxs` tokens.
**Fix:** Refactored all instances to use standard Tailwind utility classes (`text-xxs` for 10px, `text-xxxs` for 8px) to enforce consistency.
