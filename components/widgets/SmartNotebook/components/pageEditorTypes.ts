/**
 * Shared types and tool constants for the SVG page editor. Kept in a plain
 * `.ts` file so PageEditor's React Fast Refresh isn't broken by exporting
 * non-component values alongside the component itself.
 */

export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser';

export const PEN_COLORS = [
  '#e11d48',
  '#2563eb',
  '#16a34a',
  '#111827',
  '#f59e0b',
];

export const PEN_WIDTHS = [2, 5, 10];
