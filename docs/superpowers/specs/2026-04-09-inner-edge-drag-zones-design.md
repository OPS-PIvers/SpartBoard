# Inner Edge Drag Zones for Widgets

**Date:** 2026-04-09
**Status:** Draft

## Context

Full-interactive widgets (embed, text) whose entire content area matches `DRAG_BLOCKING_SELECTOR` (iframe, contentEditable) can only be dragged from an invisible 20px zone _outside_ the widget boundary. On touch panels -- the primary interaction surface for SpartBoard -- users never discover this because grabbing _outside_ a visible window to move it is unintuitive. Users naturally try to grab from the edges of the visible widget frame, not from empty space beyond it.

## Decision

Add invisible drag zones along the **inner perimeter** of every widget, universally. These zones sit above widget content in z-order, catch pointer/touch events for dragging, and are completely invisible -- preserving the full-bleed aesthetic.

Applied to all widgets (not opt-in) for consistency: users build one mental model for dragging regardless of widget type. On non-interactive widgets the inner zones are redundant but harmless, overlapping with the already-draggable surface.

## Design

### New Constant

```typescript
const INNER_EDGE_PAD = 16; // px of invisible drag zone inside widget bounds
```

16px provides a comfortable touch target (~5% of a 300px widget) while leaving the vast majority of the content area interactive.

### Inner Edge Zone Rendering

Four absolutely-positioned divs rendered inside the drag-surface container in `DraggableWindow.tsx`:

| Zone   | Position                                             | Size                     |
| ------ | ---------------------------------------------------- | ------------------------ |
| Top    | `top: 0, left: CORNER_INSET, right: CORNER_INSET`    | `height: INNER_EDGE_PAD` |
| Bottom | `bottom: 0, left: CORNER_INSET, right: CORNER_INSET` | `height: INNER_EDGE_PAD` |
| Left   | `left: 0, top: CORNER_INSET, bottom: CORNER_INSET`   | `width: INNER_EDGE_PAD`  |
| Right  | `right: 0, top: CORNER_INSET, bottom: CORNER_INSET`  | `width: INNER_EDGE_PAD`  |

Where `CORNER_INSET = 24` (matches existing resize handle size to avoid overlap).

**Properties on each zone div:**

- `position: absolute`
- `background: transparent` -- completely invisible
- `pointer-events: auto` -- catches touch/pointer before interactive content below
- `touch-action: none` -- prevents browser scroll interference
- `cursor: grab` -- desktop affordance (irrelevant on touch panels)
- `z-index`: above widget content, below toolbar/annotation/confirm overlays
- `onPointerDown={handleDragStart}` -- same handler as outer edge zones

**Key mechanism:** Because `handleDragStart` checks `target.closest(DRAG_BLOCKING_SELECTOR)` and the zone div itself is not an interactive element (no button/input/iframe/contentEditable), the drag-blocking check passes and drag initiates normally.

### Visibility Conditions

Inner edge zones are rendered when ALL of:

- Widget is NOT maximized
- Widget is NOT locked
- Widget is NOT pinned
- Widget is NOT in annotation mode

Same conditions as the existing outer edge zones.

### Existing Outer Edge Zones

Kept as-is. They still provide value for desktop users and there's no reason to remove them.

## Files Changed

| File                                    | Change                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `components/common/DraggableWindow.tsx` | Add `INNER_EDGE_PAD` constant (16px), render 4 inner edge zone divs inside the drag-surface, positioned above content but below overlays |

**Single file change.** No types, registry, or widget modifications needed.

## Edge Cases

- **Small widgets (~150px):** 16px edges on each side leaves ~118px of interactive content -- still usable
- **Maximized widgets:** Inner zones hidden (same as outer zones)
- **Locked/pinned widgets:** Inner zones hidden (can't drag anyway)
- **Annotation mode:** Inner zones hidden (annotation canvas needs full surface)
- **Resize handle overlap:** Corner inset (24px) keeps inner edge zones from conflicting with corner resize handles
- **Non-interactive widgets:** Inner zones overlap with already-draggable surface -- harmless, no behavior change

## Verification

1. Add an embed widget with a URL -- confirm the iframe content is interactive in the center but dragging works from edges
2. Add a text widget -- confirm text editing works in the center but dragging works from edges
3. Add a non-interactive widget (e.g., clock) -- confirm no behavior regression
4. Test on touch: tap-and-drag from inner edge of an embed widget to move it
5. Test resize handles still work in corners (no conflict with inner edge zones)
6. Test annotation mode: inner zones should not appear
7. Test locked/pinned widgets: inner zones should not appear
