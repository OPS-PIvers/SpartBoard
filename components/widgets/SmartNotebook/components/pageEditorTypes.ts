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

export const PEN_COLORS = [
  '#e11d48',
  '#2563eb',
  '#16a34a',
  '#111827',
  '#f59e0b',
];

export const PEN_WIDTHS = [2, 5, 10];
