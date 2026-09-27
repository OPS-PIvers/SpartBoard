/**
 * Draws the answer sheet's templates (docs/plans/shipped/QUIZ_PAPER_SHEET_STIMULI.md
 * D9). A template is a spec rather than a file, so it is rendered as SVG at
 * print time: always sharp at any size, and nothing to fetch or share.
 *
 * Pure string building, shared by the print document and the modal preview.
 * Everything is drawn into a viewBox in the template's own millimetres, so the
 * auto-fit's shrink scales the drawing the way it scales an image.
 */

import type { PaperSheetTemplate } from '@/types';

/** Hairlines a copier still reproduces, and the darker line on top of them. */
const GRID_STROKE = 0.2;
const AXIS_STROKE = 0.45;
const GRID_COLOR = '#9a9a9a';
const INK = '#333333';
/** Ruling for the lined writing area. */
export const LINE_RULE_MM = 8;
/** Side of a graph-paper square. */
export const GRAPH_SQUARE_MM = 5;
/** Label size on an axis, in millimetres of cap height. */
const LABEL_MM = 3;

const n = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: number,
  color: string
): string =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" stroke-width="${n(stroke)}" />`;

const text = (x: number, y: number, value: string, anchor: string): string =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${LABEL_MM}" font-family="Helvetica, Arial, sans-serif" fill="${INK}" text-anchor="${anchor}">${value}</text>`;

/** Ticks from `min` to `max`, guarded so a bad step cannot run forever. */
function ticks(min: number, max: number, step: number): number[] {
  const span = max - min;
  if (!(step > 0) || !(span > 0)) return [min, max];
  const count = Math.min(Math.round(span / step), 200);
  const safeStep = span / count;
  return Array.from({ length: count + 1 }, (_, i) => min + i * safeStep);
}

function graphPaper(widthMm: number, heightMm: number): string {
  const parts: string[] = [];
  for (let x = 0; x <= widthMm + 0.001; x += GRAPH_SQUARE_MM) {
    parts.push(line(x, 0, x, heightMm, GRID_STROKE, GRID_COLOR));
  }
  for (let y = 0; y <= heightMm + 0.001; y += GRAPH_SQUARE_MM) {
    parts.push(line(0, y, widthMm, y, GRID_STROKE, GRID_COLOR));
  }
  return parts.join('');
}

function lined(widthMm: number, heightMm: number): string {
  const parts: string[] = [];
  for (let y = LINE_RULE_MM; y <= heightMm + 0.001; y += LINE_RULE_MM) {
    parts.push(line(0, y, widthMm, y, GRID_STROKE, GRID_COLOR));
  }
  return parts.join('');
}

function blankBox(widthMm: number, heightMm: number): string {
  return `<rect x="${n(AXIS_STROKE / 2)}" y="${n(AXIS_STROKE / 2)}" width="${n(
    widthMm - AXIS_STROKE
  )}" height="${n(heightMm - AXIS_STROKE)}" fill="none" stroke="${INK}" stroke-width="${n(AXIS_STROKE)}" />`;
}

function numberLine(
  template: Extract<PaperSheetTemplate, { kind: 'number-line' }>,
  widthMm: number,
  heightMm: number
): string {
  const inset = 6;
  const axisY = heightMm / 2;
  const values = ticks(template.min, template.max, template.step);
  const span = values[values.length - 1] - values[0] || 1;
  const at = (value: number): number =>
    inset + ((value - values[0]) / span) * (widthMm - inset * 2);

  const parts = [
    line(inset / 2, axisY, widthMm - inset / 2, axisY, AXIS_STROKE, INK),
    // Arrowheads, so the line reads as continuing past the numbers shown.
    `<path d="M${n(inset / 2)} ${n(axisY)} l3 -1.6 v3.2 z" fill="${INK}" />`,
    `<path d="M${n(widthMm - inset / 2)} ${n(axisY)} l-3 -1.6 v3.2 z" fill="${INK}" />`,
  ];
  for (const value of values) {
    const x = at(value);
    parts.push(line(x, axisY - 2, x, axisY + 2, AXIS_STROKE, INK));
    parts.push(text(x, axisY + 2 + LABEL_MM + 1, n(value), 'middle'));
  }
  return parts.join('');
}

function coordinateGrid(
  template: Extract<PaperSheetTemplate, { kind: 'coordinate-grid' }>,
  sideMm: number
): string {
  const pad = template.showNumbers ? LABEL_MM + 2 : 1;
  const plot = sideMm - pad * 2;
  const min = template.quadrants === 1 ? 0 : template.min;
  const max = template.max;
  const values = ticks(min, max, template.step);
  const span = values[values.length - 1] - values[0] || 1;
  const toX = (value: number): number =>
    pad + ((value - values[0]) / span) * plot;
  // SVG y grows downward; the grid's does not.
  const toY = (value: number): number =>
    pad + plot - ((value - values[0]) / span) * plot;

  const parts: string[] = [];
  for (const value of values) {
    parts.push(
      line(toX(value), pad, toX(value), pad + plot, GRID_STROKE, GRID_COLOR)
    );
    parts.push(
      line(pad, toY(value), pad + plot, toY(value), GRID_STROKE, GRID_COLOR)
    );
  }
  const originX = toX(Math.min(Math.max(0, values[0]), max));
  const originY = toY(Math.min(Math.max(0, values[0]), max));
  parts.push(line(pad, originY, pad + plot, originY, AXIS_STROKE, INK));
  parts.push(line(originX, pad, originX, pad + plot, AXIS_STROKE, INK));

  if (template.showNumbers) {
    for (const value of values) {
      const label = n(value);
      if (Math.abs(value) < 1e-9) continue;
      parts.push(text(toX(value), originY + LABEL_MM + 1.5, label, 'middle'));
      parts.push(text(originX - 1.5, toY(value) + LABEL_MM / 2, label, 'end'));
    }
  }
  return parts.join('');
}

/** The template as a standalone `<svg>` filling `widthMm` × `heightMm`. */
export function renderTemplateSvg(
  template: PaperSheetTemplate,
  widthMm: number,
  heightMm: number
): string {
  const body = (() => {
    switch (template.kind) {
      case 'graph-paper':
        return graphPaper(widthMm, heightMm) + blankBox(widthMm, heightMm);
      case 'lined':
        return lined(widthMm, heightMm) + blankBox(widthMm, heightMm);
      case 'blank-box':
        return blankBox(widthMm, heightMm);
      case 'number-line':
        return numberLine(template, widthMm, heightMm);
      case 'coordinate-grid':
        return coordinateGrid(template, Math.min(widthMm, heightMm));
    }
  })();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(widthMm)} ${n(
    heightMm
  )}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

/** A label for the template picker and the row it becomes. */
export function templateLabel(template: PaperSheetTemplate): string {
  switch (template.kind) {
    case 'coordinate-grid':
      return template.quadrants === 1
        ? 'Coordinate grid (first quadrant)'
        : 'Coordinate grid';
    case 'number-line':
      return `Number line ${n(template.min)} to ${n(template.max)}`;
    case 'graph-paper':
      return 'Graph paper';
    case 'lined':
      return 'Lined writing area';
    case 'blank-box':
      return 'Blank box';
  }
}
