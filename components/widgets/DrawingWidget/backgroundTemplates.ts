import type { CSSProperties } from 'react';
import type { DrawingBackground } from '@/types';

// Background template module (Phase 2 PR 2.5).
//
// Two parallel rendering paths:
//
// 1. CSS path (`getBackgroundStyle`) — used live in the widget. The background
//    sits on a sibling `<div>` BELOW the canvas, so changing templates costs
//    zero canvas paint work and the canvas pixel data stays clean for export.
//
// 2. Canvas path (`paintBackground`) — used by the export pipeline. PNG export
//    needs the template baked into pixels, so when we paint to an offscreen
//    canvas we draw the template first, then composite the object layer on
//    top.
//
// Both paths share the same constants below so live and exported views never
// drift.

// Repeating spacing for grid/dots; lines uses a wider gap so horizontal rules
// don't read as a tight grid. Tuned to be visible-but-quiet on dark and light
// surfaces — alpha is low enough to never compete with object color.
const GRID_SPACING_PX = 24;
const LINES_SPACING_PX = 32;
const DOT_RADIUS_PX = 1;
const TEMPLATE_LINE_COLOR = 'rgba(148, 163, 184, 0.25)';
const TEMPLATE_DOT_COLOR = 'rgba(148, 163, 184, 0.45)';

/**
 * Resolve a background template to React inline-style props. Returned object
 * is spread onto the background-layer `<div>` sat below the canvas.
 *
 * `'blank'` returns `{}` so the layer doesn't paint anything (transparent —
 * the dashboard background shows through).
 *
 * Width / height are accepted but currently unused — the CSS templates are
 * pattern-based and tile across whatever box they're rendered into. The
 * parameters are reserved so a future "fit to widget" template (e.g. one
 * line per N px regardless of widget size) can scale the spacing.
 */
export const getBackgroundStyle = (
  template: DrawingBackground,
  _w?: number,
  _h?: number
): CSSProperties => {
  switch (template) {
    case 'blank':
      return {};
    case 'grid': {
      // Two repeating linear gradients (one horizontal, one vertical) draw a
      // pattern of 1-px lines on a transparent surface. `background-size`
      // controls the spacing; `background-image` stacks the two passes.
      const line = TEMPLATE_LINE_COLOR;
      const stop = `${line} 0 1px, transparent 1px 100%`;
      return {
        backgroundImage: `linear-gradient(to right, ${stop}), linear-gradient(to bottom, ${stop})`,
        backgroundSize: `${GRID_SPACING_PX}px ${GRID_SPACING_PX}px`,
      };
    }
    case 'lines': {
      // Horizontal rules only (notebook-style). Wider spacing than the grid
      // template so the lines read as guides for handwriting rather than as
      // a grid pattern.
      const line = TEMPLATE_LINE_COLOR;
      return {
        backgroundImage: `linear-gradient(to bottom, ${line} 0 1px, transparent 1px 100%)`,
        backgroundSize: `100% ${LINES_SPACING_PX}px`,
      };
    }
    case 'dots': {
      // Single dot per cell via a radial-gradient. The transparent fade after
      // the dot edge means each dot stays crisp without bleeding into the
      // next cell.
      return {
        backgroundImage: `radial-gradient(${TEMPLATE_DOT_COLOR} ${DOT_RADIUS_PX}px, transparent ${DOT_RADIUS_PX + 0.5}px)`,
        backgroundSize: `${GRID_SPACING_PX}px ${GRID_SPACING_PX}px`,
      };
    }
  }
};

/**
 * Paint a background template directly onto a Canvas 2D context. Used by the
 * export pipeline so the saved PNG/PDF carries the same template the live
 * widget displays. Mirrors the CSS path's pattern + colours so live and
 * exported outputs match.
 *
 * `'blank'` is a no-op (the export canvas stays transparent, matching the
 * live widget where the dashboard background bleeds through).
 */
export const paintBackground = (
  ctx: CanvasRenderingContext2D,
  template: DrawingBackground,
  w: number,
  h: number
): void => {
  if (template === 'blank') return;

  ctx.save();
  if (template === 'grid') {
    ctx.fillStyle = TEMPLATE_LINE_COLOR;
    // Vertical lines (each 1px wide).
    for (let x = 0; x <= w; x += GRID_SPACING_PX) {
      ctx.fillRect(x, 0, 1, h);
    }
    // Horizontal lines.
    for (let y = 0; y <= h; y += GRID_SPACING_PX) {
      ctx.fillRect(0, y, w, 1);
    }
  } else if (template === 'lines') {
    ctx.fillStyle = TEMPLATE_LINE_COLOR;
    for (let y = 0; y <= h; y += LINES_SPACING_PX) {
      ctx.fillRect(0, y, w, 1);
    }
  } else if (template === 'dots') {
    ctx.fillStyle = TEMPLATE_DOT_COLOR;
    for (let y = 0; y <= h; y += GRID_SPACING_PX) {
      for (let x = 0; x <= w; x += GRID_SPACING_PX) {
        ctx.beginPath();
        ctx.arc(x, y, DOT_RADIUS_PX, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
};
