# Audit: Widget Space Utilization & Content Scaling

**Date**: 2026-02-15
**Updated**: 2026-02-15 (Complete 31-widget inventory)
**Goal**: Identify wasted space, excessive padding, and conservative scaling across all widgets.

## Executive Summary

**Audit Coverage**: ✅ **31 of 31 widgets audited** (100% complete)

Most widgets have been updated to the `skipScaling: true` standard, removing the global 16px padding. However, many widgets still use defensive `cqmin` values or internal padding that prevents content from truly filling the window. The "Hero" widgets (Clock, Weather, TimeTool) suffer most from conservative height constraints.

**Key Findings**:

- **29 widgets** use `skipScaling: true` with container queries
- **2 widgets** correctly use `skipScaling: false` (Drawing, SeatingChart) for coordinate-based systems
- **Top performers**: Weather, Webcam, Embed, Calendar, Scoreboard, MiniApp, SmartNotebook
- **Needs improvement**: Clock, TimeTool (75% height ceiling), Checklist (conservative scaling), Sound (fixed padding), CatalystVisual (small icons)

---

## Widget Audit Details

| Widget                    | Skip Scaling | Padding Strategy                                  | Content Scaling Rules                                          | Rating | Notes                                                           |
| :------------------------ | :----------: | :------------------------------------------------ | :------------------------------------------------------------- | :----: | :-------------------------------------------------------------- |
| **Clock**                 |      ✅      | `p-0` (Global) + `0` (Internal)                   | `min(82cqh, 25cqw)` (Time), `min(12cqh, 80cqw)` (Date)         |  5/5   | ✅ Fixed: Removed padding, increased to 82cqh, tightened gap.   |
| **Weather**               |      ✅      | `p-0` (Global) + `min(8px, 2cqmin)` (Internal)    | `clamp(32px, 35cqmin, 400px)`                                  |  5/5   | Exemplary hero scaling.                                         |
| **Traffic Light**         |      ✅      | `p-0` (Global) + `p-[min(4px,1cqmin)]` (Internal) | `h-[95%] w-[95%]` + `min(28cqh, 80cqw)`                        |  5/5   | Great use of space.                                             |
| **Text**                  |      ✅      | `p-0` (Global) + `min(16px, 3.5cqmin)` (Internal) | `min(fontSize, fontSize * 0.5cqmin)`                           |  4/5   | Padding is appropriate for legibility.                          |
| **Checklist**             |      ✅      | `p-0` (Global) + `min(12px, 2.5cqmin)` (Internal) | `min(20px, 5cqmin)`                                            |  2/5   | **WASTED SPACE**: Scaling is too conservative for wide widgets. |
| **Random**                |      ✅      | `p-0` (Global) + Var. Internal                    | `45cqmin` (Hero) / `min(24px, 6cqmin)` (List)                  |  4/5   | Single result fills well; groups can be tight.                  |
| **Dice**                  |      ✅      | `p-0` (Global) + `p-[4cqmin]` (Internal)          | `75cqmin` / `55cqmin` / `42cqmin`                              |  4/5   | Good logic for multiple dice.                                   |
| **Sound**                 |      ✅      | `p-0` (Global) + `p-2` (Internal)                 | N/A (SVG based)                                                |  3/5   | **WASTED SPACE**: Uses fixed `p-2` instead of scaled padding.   |
| **Webcam**                |      ✅      | `p-0` (Global) + `0` (Internal)                   | `object-cover`                                                 |  5/5   | Full bleed content.                                             |
| **Embed**                 |      ✅      | `p-0` (Global) + `0` (Internal)                   | `w-full h-full`                                                |  5/5   | Full bleed content.                                             |
| **Drawing**               |      ❌      | `p-0` (Global)                                    | Canvas-based                                                   |  4/5   | Functional necessity for fixed coordinates.                     |
| **QR**                    |      ✅      | `p-0` (Global) + `min(8px, 1.5cqmin)` (Internal)  | `object-contain`                                               |  4/5   | Good balance.                                                   |
| **Scoreboard**            |      ✅      | `p-0` (Global) + `min(16px, 3.5cqmin)` (Internal) | `min(60cqh, 50cqw)` (Score)                                    |  5/5   | Aggressive and fills well.                                      |
| **Expectations**          |      ✅      | `p-0` (Global) + `min(16px, 3cqmin)` (Internal)   | `min(32px, 10cqmin)` (Labels)                                  |  4/5   | Modern and clean.                                               |
| **Poll**                  |      ✅      | `p-0` (Global) + `min(16px, 3cqmin)` (Internal)   | `min(32px, 10cqmin)` (Question)                                |  4/5   | Fills container width well.                                     |
| **Schedule**              |      ✅      | `p-0` (Global) + `min(12px, 2.5cqmin)` (Internal) | `min(36px, 10cqmin, 80cqw)`                                    |  4/5   | Good use of width constraints.                                  |
| **Calendar**              |      ✅      | `p-0` (Global) + `min(16px, 3.5cqmin)` (Internal) | `min(48px, 25cqmin)` (Date)                                    |  5/5   | Aggressive scaling for primary info.                            |
| **LunchCount**            |      ✅      | `p-0` (Global) + `min(10px, 2cqmin)` (Internal)   | `min(16px, 6cqmin)` (Items)                                    |  4/5   | Dense content, well distributed.                                |
| **Classes**               |      ✅      | `p-0` (Global) + `min(12px, 2.5cqmin)` (Internal) | `min(24px, 8cqmin)` (Titles)                                   |  4/5   | Consistent with modern standard.                                |
| **Materials**             |      ✅      | `p-0` (Global) + `min(16px, 3.5cqmin)` (Internal) | `min(18px, 6cqmin)` (Labels)                                   |  4/5   | Items reflow and scale well.                                    |
| **TimeTool**              |      ✅      | `p-0` (Global) + `0` (Internal)                   | `min(82cqh, 25cqw)` (Digital)                                  |  5/5   | ✅ Fixed: Removed padding, increased to 82cqh matching Clock.   |
| **CatalystVisual**        |      ✅      | `p-0` (Global) + `min(24px, 5cqmin)` (Internal)   | `40cqmin` (Icon)                                               |  3/5   | **WASTED SPACE**: Icons could be 60-70% height in "Go Mode".    |
| **RecessGear**            |      ✅      | `p-0` (Global) + `min(12px, 2.5cqmin)` (Internal) | `min(48px, 16cqmin)` (Icon)                                    |  4/5   | Card-based reflow works well.                                   |
| **Catalyst**              |      ✅      | `p-0` (Global) + `min(16px, 3cqmin)` (Internal)   | `min(32px, 10cqmin)` (Icons), `min(12px, 3cqmin)` (Text)       |  4/5   | Multi-view navigation, consistent scaling across all modes.     |
| **CatalystInstruct**      |      ✅      | `p-0` (Global) + `min(16px, 3cqmin)` (Internal)   | `min(20px, 5cqmin)` (Title), `min(14px, 3.5cqmin)` (Body)      |  4/5   | Good text hierarchy, appropriate for instructional content.     |
| **MiniApp**               |      ✅      | `p-0` (Global) + `min(20px, 4cqmin)` (Internal)   | `min(18px, 4.5cqmin)` (Headers), `min(14px, 3.5cqmin)` (Items) |  5/5   | ⭐ **EXEMPLARY**: Model implementation for multi-view widgets.  |
| **SmartNotebook**         |      ✅      | `p-0` (Global) + `min(20px, 4cqmin)` (Internal)   | `min(12px, 3cqmin)` (Titles), `min(16px, 4cqmin)` (Icons)      |  5/5   | Excellent content prioritization, minimal UI chrome.            |
| **InstructionalRoutines** |      ✅      | `p-0` (Global) + `min(12px, 3.5cqmin)` (Internal) | Custom step rendering with proper scaling                      |  4/5   | Consistent with modern scaling standards.                       |
| **Stickers**              |      ✅      | `p-0` (Global) + Grid layout                      | Sticker grid with drag-to-board functionality                  |  4/5   | Gallery-style widget, appropriate for browsing content.         |
| **SeatingChart**          |      ❌      | N/A (Custom canvas rendering)                     | Pixel-based coordinates (no container queries)                 |  4/5   | ✅ **CORRECT** `skipScaling:false` for coordinate system.       |
| **Sticker (item)**        |     N/A      | N/A (Overlay element, bypasses DraggableWindow)   | Fixed 200×200 size                                             |  N/A   | ⚠️ Special case: decorative overlay, not a widget window.       |

---

## Identified Opportunities for Improvement

### 1. ~~The "75% Height" Ceiling (Clock, TimeTool)~~ ✅ RESOLVED

- **Problem**: Digits were capped at `75cqh` to prevent clipping, leaving large gaps at the top and bottom.
- **Solution**: Increased to `82cqh`, removed internal padding, and tightened vertical gaps.

### 2. Conservative `cqmin` (Checklist, Sound)

- **Problem**: Using `5cqmin` for text means the content only grows to 5% of the smaller dimension. In a large window, this looks tiny.
- **Solution**: Transition to higher `cqmin` values (8-10%) or use "Fill-First" width/height constraints.

### 3. Static Padding (Sound)

- **Problem**: `SoundWidget` uses hardcoded `p-2` instead of `min(Xpx, Ycqmin)`.
- **Solution**: Standardize on `min(16px, 3cqmin)` for general padding.

### 4. Catalyst Visuals

- **Problem**: The icon in `CatalystVisualWidget` is only `40cqmin`.
- **Solution**: Increase to `min(70cqh, 60cqw)` to make the visual anchor truly dominant.

---

## Special Implementation Notes

### Widgets with `skipScaling: false`

Two widgets correctly use CSS `transform: scale()` instead of container queries:

1. **DrawingWidget** - Canvas-based drawing with pixel-perfect coordinate tracking. Must preserve exact pixel coordinates for drawing operations.
2. **SeatingChartWidget** - Drag-and-drop furniture editor with absolute positioning. Requires consistent coordinate space for furniture placement.

**These implementations are architecturally correct** and should not be converted to container queries.

### Special Widget Types

**Sticker (item)** - This is not a traditional widget. It represents individual sticker instances placed directly on the dashboard as decorative overlays. It bypasses the DraggableWindow wrapper and uses a fixed 200×200 size. Not subject to standard widget scaling rules.

---

## Exemplary Implementations 🌟

The following widgets demonstrate **best-in-class** container query scaling and should serve as reference implementations:

1. **MiniApp** - Complex multi-view widget with library, editor, and running modes. Every element uses proper `min()` capping with appropriate `cqmin` values. Demonstrates how to handle dynamic content with minimal chrome.

2. **SmartNotebook** - Image/slide viewer with viewer and library modes. Content dominates the space, UI controls are compact and properly scaled. Excellent example of content prioritization.

3. **Weather** - Hero content with `clamp(32px, 35cqmin, 400px)` temperature display. Shows aggressive scaling that fills space beautifully.

4. **Calendar** - Aggressive date scaling (`min(48px, 25cqmin)`) that makes primary information dominant while maintaining proper hierarchy for day labels and metadata.

5. **Scoreboard** - Bold score display (`min(60cqh, 50cqw)`) that truly fills the widget. Demonstrates confidence in aggressive sizing for numeric displays.

## Rating Legend

- **5/5**: Content hits the edges or uses space optimally.
- **4/5**: Good utilization, slight padding but appropriate for the component type.
- **3/5**: Noticeable wasted space; content feels a bit small for the container.
- **2/5**: Poor utilization; large margins or tiny content.
- **1/5**: Significant layout issues or extremely small content.
