# FormattingToolbar Redesign — Grouped, Single-Row, Responsive

**Date:** 2026-04-10
**Status:** Approved
**Scope:** `components/widgets/TextWidget/FormattingToolbar.tsx`, `components/widgets/TextWidget/Widget.tsx`

---

## Problem

The TextWidget's FormattingToolbar has three issues:

1. **Visual conflict with DraggableWindow toolbar** — Both float above the widget via portals. The DraggableWindow toolbar (z: 12000) occludes the FormattingToolbar (z: 110) when they overlap.
2. **No responsive behavior** — The toolbar renders 26 controls across 2 rows with no width constraint or overflow handling. On narrow widgets it overflows the viewport.
3. **Too many buttons** — The flat 2-row layout is cluttered. Related controls (alignment, colors) should be grouped behind single trigger buttons.

## Design

### Spatial Relationship

Stacking order (top to bottom):

1. **DraggableWindow toolbar** (z: 12000) — gear, close, duplicate, etc.
2. **FormattingToolbar** (z: ~11000) — rich text formatting
3. **Widget content**

The FormattingToolbar remains a portal to `document.body` with `position: fixed`. It positions at `top: widgetRect.top` (no `translateY(-100%)`), so it overlaps the top of the widget content area and sits visually below the DraggableWindow toolbar which floats 8px above the widget.

Styling: `bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md rounded-lg` (rounded-lg, not rounded-t-lg, since it's now a freestanding bar).

### Single-Row Button Layout

All controls render in a single horizontal row with groups separated by thin vertical dividers.

#### Priority Tier 1 — Always Visible

| #   | Group           | Controls                                  | Behavior                                                                                                                                                                                                                                              |
| --- | --------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Font Family** | Dropdown button showing current font name | Click opens font list menu (same as current)                                                                                                                                                                                                          |
| 2   | **Font Size**   | Stepper: `[−] [16] [+]`                   | Same as current, with `suppressInputRef` pattern                                                                                                                                                                                                      |
| 3   | **Text Style**  | Segmented control: `[B \| I \| U]`        | Three independent icon buttons styled with shared `rounded-l` / `rounded-r` borders to appear joined. Each toggles its own formatting via `execCommand('bold'/'italic'/'underline')`. No mutual exclusivity — all three can be active simultaneously. |

#### Priority Tier 2 — Collapse into Overflow

| #   | Group         | Trigger                                      | Popout Contents                                                                                                                                                                          |
| --- | ------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | **Alignment** | Single button showing current alignment icon | Popout grid with: Justify (Left/Center/Right), Vertical (Top/Middle/Bottom), Indent (Decrease/Increase), Lists (Bulleted/Numbered)                                                       |
| 5   | **Color**     | Palette icon button                          | Popout with three labeled sections: Font Color (swatch grid), Highlight (swatch grid + transparent), Background Color (swatch grid using `STICKY_NOTE_COLORS`, updates `bgColor` config) |
| 6   | **Link**      | Link icon button                             | Triggers `showPrompt` for URL input (same as current)                                                                                                                                    |

#### Overflow

| #   | Group            | Behavior                                                                                                                                                            |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | **`...` button** | Only visible when Tier 2 groups are hidden. Opens popout with collapsed groups stacked vertically, each labeled. No nested popouts — grouped buttons expand inline. |

### Responsive Overflow (ResizeObserver)

**Measurement:**

- A `ResizeObserver` watches the toolbar container width.
- Each button group is wrapped in a measured `<div ref>`.
- On resize, calculate whether all groups fit within `containerWidth - overflowButtonWidth`.

**Collapse order (right to left within each tier):**

- Tier 2 collapses first: Link → Color → Alignment
- Tier 1 collapses only at extreme widths: Text Style → Font Size → Font Family
- At very narrow widths (< ~120px), everything collapses — toolbar shows only the `...` button.

**Hysteresis:** 8px buffer to prevent flickering at boundaries. A group collapses when it exceeds available space, but only re-appears when there's `groupWidth + 8px` of room.

### Popout Menus

#### Alignment Popout

- Portal to `document.body`, fixed position, anchored below trigger button
- ~160px wide compact grid
- Sections with subtle dividers and tiny labels:
  - **Justify:** AlignLeft, AlignCenter, AlignRight (3 icons in a row)
  - **Vertical:** AlignVerticalTop, AlignVerticalMiddle, AlignVerticalBottom (calls `onVerticalAlignChange`)
  - **Indent:** IndentDecrease, IndentIncrease
  - **Lists:** List (bulleted), ListOrdered (numbered)
- Active option highlighted (`bg-blue-100 text-blue-600`)
- Closes on click-outside or re-clicking trigger

#### Color Popout

- Same portal/positioning approach
- Three labeled sections stacked vertically:
  - **Font Color** — 4-column swatch grid (same colors as current)
  - **Highlight** — 4-column swatch grid with pastel colors + transparent (same as current)
  - **Background** — swatch grid using `STICKY_NOTE_COLORS`. Selecting updates `bgColor` via `updateWidget`
- Clicking a swatch applies immediately and keeps the popout open (allows multiple changes without reopening)

**Popout z-index:** Rendered via portal at z-index that clears the toolbar (same as existing dropdown pattern).

### Interaction Details

**Focus management:**

- All toolbar buttons use `onMouseDown={e => e.preventDefault()}` to avoid stealing focus from the contentEditable editor.
- Popout menus also prevent default on mousedown.
- Closing a popout does not blur the editor.

**Click-outside:**

- Popouts close on outside click.
- Toolbar and all popouts carry `data-click-outside-ignore="true"` to prevent widget deselection.

**Keyboard shortcuts:**

- Ctrl+B/I/U handled natively by browser contentEditable (unchanged).
- Ctrl+K for link handled in editor `onKeyDown` (unchanged).
- No new keyboard shortcuts introduced.

**Background color update path:**

- Adds a second path to update `bgColor` (currently only on widget settings back-face).
- Uses `updateWidget(widget.id, { config: { ...config, bgColor } })`.
- Does NOT use `onContentChange` since this is a config change, not a DOM mutation.

## Files Affected

| File                                                       | Change                                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `components/widgets/TextWidget/FormattingToolbar.tsx`      | Full rewrite — single row, grouped buttons, popouts, ResizeObserver overflow                                                  |
| `components/widgets/TextWidget/Widget.tsx`                 | Update portal positioning (remove `translateY(-100%)`), bump z-index to ~11000, pass `bgColor` + `onBgColorChange` to toolbar |
| `components/widgets/TextWidget/FormattingToolbar.test.tsx` | Update tests for new grouped layout, overflow behavior, popout menus                                                          |

## Out of Scope

- Changes to DraggableWindow toolbar positioning or behavior
- Changes to other widget types
- New keyboard shortcuts for grouped controls
- Toolbar customization/reordering by users
