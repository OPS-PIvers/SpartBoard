/**
 * Shared types and tool constants for the SVG page editor. Kept in a plain
 * `.ts` file so PageEditor's React Fast Refresh isn't broken by exporting
 * non-component values alongside the component itself.
 */

export type Tool =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'text'
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow';

/** Tools that drag-to-define an area / line. Used to gate shape-preview
 *  behaviour in the pointer handlers and to decide cursor styling. */
export const SHAPE_TOOLS: ReadonlyArray<Tool> = [
  'rect',
  'circle',
  'line',
  'arrow',
];

export const isShapeTool = (t: Tool): boolean => SHAPE_TOOLS.includes(t);

// Eight-color palette including white (intentionally added so teachers can
// strike through dark imported SMART backgrounds) and a near-black for ink
// readability. Ordered to roughly match the rainbow + neutrals at the ends.
export const PEN_COLORS = [
  '#111827', // near-black
  '#ffffff', // white
  '#e11d48', // red
  '#f59e0b', // amber
  '#facc15', // yellow
  '#16a34a', // green
  '#2563eb', // blue
  '#8b5cf6', // violet
];

export const PEN_WIDTHS = [2, 5, 10];
