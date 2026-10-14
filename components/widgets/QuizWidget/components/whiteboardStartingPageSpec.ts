import type {
  WhiteboardStartingPattern,
  WhiteboardStartingPage,
} from '@/types';
import {
  WHITEBOARD_POLYGON_SIDES_MAX,
  WHITEBOARD_POLYGON_SIDES_MIN,
} from '@/config/quizRecordingDefaults';

type PatternKind = WhiteboardStartingPattern['kind'];

const AXIS_LIMIT = 100;
const NUMBER_LINE_LIMIT = 1000;
const MAX_TICKS = 40;

export const BLANK_STARTING_PAGE: WhiteboardStartingPage = {
  pattern: { kind: 'blank' },
};

/** The pattern a kind starts with when the teacher first picks it. */
export function defaultPattern(kind: PatternKind): WhiteboardStartingPattern {
  switch (kind) {
    case 'coordinate-plane':
      return { kind, xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
    case 'number-line':
      return { kind, min: 0, max: 10, step: 1 };
    case 'shape':
      return { kind, shape: 'triangle' };
    default:
      return { kind };
  }
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Keeps every range low-to-high and the number line under {@link MAX_TICKS} ticks. */
export function clampPattern(
  p: WhiteboardStartingPattern
): WhiteboardStartingPattern {
  if (p.kind === 'coordinate-plane') {
    const xMin = clamp(Math.round(p.xMin), -AXIS_LIMIT, AXIS_LIMIT - 1);
    const yMin = clamp(Math.round(p.yMin), -AXIS_LIMIT, AXIS_LIMIT - 1);
    return {
      kind: p.kind,
      xMin,
      xMax: clamp(Math.round(p.xMax), xMin + 1, AXIS_LIMIT),
      yMin,
      yMax: clamp(Math.round(p.yMax), yMin + 1, AXIS_LIMIT),
    };
  }
  if (p.kind === 'number-line') {
    const min = clamp(p.min, -NUMBER_LINE_LIMIT, NUMBER_LINE_LIMIT - 1);
    const max = clamp(p.max, min + 1, NUMBER_LINE_LIMIT);
    const step = Math.max(p.step, (max - min) / MAX_TICKS);
    return { kind: p.kind, min, max, step: Math.round(step * 1000) / 1000 };
  }
  if (p.kind === 'shape' && p.shape === 'polygon') {
    return {
      kind: p.kind,
      shape: p.shape,
      sides: clamp(
        Math.round(p.sides ?? 6),
        WHITEBOARD_POLYGON_SIDES_MIN,
        WHITEBOARD_POLYGON_SIDES_MAX
      ),
    };
  }
  if (p.kind === 'shape') return { kind: p.kind, shape: p.shape };
  return p;
}
