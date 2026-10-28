// Slides/Canva-style alignment guides for widget drag and resize, in world coordinates.

export interface GuideRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A guide line: `axis: 'x'` is a vertical line at `pos`, spanning `from`..`to` on y. */
export interface AlignLine {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
}

/** An equal-gap marker: `axis: 'x'` spans `from`..`to` on x at height `at`. */
export interface SpacingMark {
  axis: 'x' | 'y';
  from: number;
  to: number;
  at: number;
}

export interface Guides {
  lines: AlignLine[];
  spacing: SpacingMark[];
}

export const EMPTY_GUIDES: Guides = { lines: [], spacing: [] };

/** Snap distance in screen pixels; divide by zoom for world units. */
export const GUIDE_SNAP_PX = 6;

const EPS = 0.5;

type Axis = 'x' | 'y';

const start = (r: GuideRect, a: Axis) => (a === 'x' ? r.x : r.y);
const size = (r: GuideRect, a: Axis) => (a === 'x' ? r.w : r.h);
const end = (r: GuideRect, a: Axis) => start(r, a) + size(r, a);
const other = (a: Axis): Axis => (a === 'x' ? 'y' : 'x');

const stops = (r: GuideRect, a: Axis) => [
  start(r, a),
  start(r, a) + size(r, a) / 2,
  end(r, a),
];

/** True when the two rects overlap on the axis perpendicular to `a` (same row for x, same column for y). */
const sharesBand = (p: GuideRect, q: GuideRect, a: Axis) => {
  const o = other(a);
  return start(p, o) < end(q, o) && start(q, o) < end(p, o);
};

/** Nearest neighbour before / after `r` along `a` among rects sharing its band. */
const neighbours = (r: GuideRect, others: GuideRect[], a: Axis) => {
  let before: GuideRect | null = null;
  let after: GuideRect | null = null;
  for (const o of others) {
    if (!sharesBand(r, o, a)) continue;
    if (end(o, a) <= start(r, a) + EPS) {
      if (!before || end(o, a) > end(before, a)) before = o;
    } else if (start(o, a) >= end(r, a) - EPS) {
      if (!after || start(o, a) < start(after, a)) after = o;
    }
  }
  return { before, after };
};

/** Start positions along `a` that would make `r` evenly spaced with its neighbours. */
const spacingTargets = (r: GuideRect, others: GuideRect[], a: Axis) => {
  const targets: number[] = [];
  const { before, after } = neighbours(r, others, a);
  const len = size(r, a);
  if (before && after) {
    targets.push((end(before, a) + start(after, a) - len) / 2);
  }
  if (before) {
    const prev = neighbours(before, others, a).before;
    if (prev) targets.push(end(before, a) + (start(before, a) - end(prev, a)));
  }
  if (after) {
    const next = neighbours(after, others, a).after;
    if (next) {
      targets.push(start(after, a) - (start(next, a) - end(after, a)) - len);
    }
  }
  return targets;
};

/** Offset that brings the closest of `moving` onto the closest of `targets`, or null when none is within `threshold`. */
const bestOffset = (
  moving: number[],
  targets: number[],
  threshold: number
): number | null => {
  let best: number | null = null;
  let bestDist = threshold + EPS;
  for (const m of moving) {
    for (const t of targets) {
      const d = Math.abs(t - m);
      if (d < bestDist) {
        bestDist = d;
        best = t - m;
      }
    }
  }
  return best;
};

/** Snaps a moving rect's position to other widgets' edges, centres and equal gaps. */
export const snapMove = (
  r: GuideRect,
  others: GuideRect[],
  threshold: number
): { x: number; y: number } => {
  if (others.length === 0) return { x: r.x, y: r.y };
  const offset = (a: Axis) => {
    const alignTargets = others.flatMap((o) => stops(o, a));
    const align = bestOffset(stops(r, a), alignTargets, threshold);
    const spaced = bestOffset(
      [start(r, a)],
      spacingTargets(r, others, a),
      threshold
    );
    if (align === null) return spaced ?? 0;
    if (spaced === null) return align;
    return Math.abs(spaced) < Math.abs(align) ? spaced : align;
  };
  return { x: r.x + offset('x'), y: r.y + offset('y') };
};

/** Snaps one moving edge coordinate to other widgets' edges and centres. */
export const snapEdge = (
  edge: number,
  axis: Axis,
  others: GuideRect[],
  threshold: number
): number =>
  edge +
  (bestOffset(
    [edge],
    others.flatMap((o) => stops(o, axis)),
    threshold
  ) ?? 0);

/** Which edge a resize moves on each axis; null leaves that axis without guides. */
export interface ResizeEdges {
  x: 'start' | 'end' | null;
  y: 'start' | 'end' | null;
}

const alignLines = (
  r: GuideRect,
  others: GuideRect[],
  a: Axis,
  edges?: ResizeEdges
) => {
  const o = other(a);
  const lines: AlignLine[] = [];
  const edge = edges?.[a];
  const moving = edges
    ? edge
      ? [edge === 'start' ? start(r, a) : end(r, a)]
      : []
    : stops(r, a);
  for (const m of moving) {
    let from = Infinity;
    let to = -Infinity;
    for (const q of others) {
      if (!stops(q, a).some((t) => Math.abs(t - m) < EPS)) continue;
      from = Math.min(from, start(q, o), start(r, o));
      to = Math.max(to, end(q, o), end(r, o));
    }
    if (from < to && !lines.some((l) => Math.abs(l.pos - m) < EPS)) {
      lines.push({ axis: a, pos: m, from, to });
    }
  }
  return lines;
};

const gapMark = (p: GuideRect, q: GuideRect, a: Axis): SpacingMark => {
  const o = other(a);
  const lo = Math.max(start(p, o), start(q, o));
  const hi = Math.min(end(p, o), end(q, o));
  return { axis: a, from: end(p, a), to: start(q, a), at: (lo + hi) / 2 };
};

const spacingMarks = (r: GuideRect, others: GuideRect[], a: Axis) => {
  const marks: SpacingMark[] = [];
  const { before, after } = neighbours(r, others, a);
  const gap = (p: GuideRect, q: GuideRect) => start(q, a) - end(p, a);
  const same = (g1: number, g2: number) => g1 > EPS && Math.abs(g1 - g2) < EPS;
  if (before && after && same(gap(before, r), gap(r, after))) {
    marks.push(gapMark(before, r, a), gapMark(r, after, a));
    return marks;
  }
  if (before) {
    const prev = neighbours(before, others, a).before;
    if (prev && same(gap(prev, before), gap(before, r))) {
      marks.push(gapMark(prev, before, a), gapMark(before, r, a));
    }
  }
  if (after) {
    const next = neighbours(after, others, a).after;
    if (next && same(gap(r, after), gap(after, next))) {
      marks.push(gapMark(r, after, a), gapMark(after, next, a));
    }
  }
  return marks;
};

/** Guide lines and equal-gap markers for `r` at its final (already snapped) position; `edges` limits them to a resize's moving edges. */
export const computeGuides = (
  r: GuideRect,
  others: GuideRect[],
  edges?: ResizeEdges
): Guides => {
  if (others.length === 0) return EMPTY_GUIDES;
  const lines = [
    ...alignLines(r, others, 'x', edges),
    ...alignLines(r, others, 'y', edges),
  ];
  const spacing = [
    ...(!edges || edges.x ? spacingMarks(r, others, 'x') : []),
    ...(!edges || edges.y ? spacingMarks(r, others, 'y') : []),
  ];
  if (lines.length === 0 && spacing.length === 0) return EMPTY_GUIDES;
  return { lines, spacing };
};
