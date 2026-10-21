import { MONTH_NAMES, formatYear } from './timelineDates';

export interface TimelineInput {
  id: string;
  /** Axis position in years; null for posts with no readable date. */
  key: number | null;
}

export interface TimelinePlacement {
  id: string;
  /** Marker position on the axis. */
  dotX: number;
  /** Card's left edge; moves right of the marker only when its lane is crowded. */
  cardX: number;
  side: 'above' | 'below';
  /** 0 is the lane nearest the axis. */
  lane: number;
  dated: boolean;
}

export interface TimelineTick {
  x: number;
  label: string;
}

export interface TimelineGeometryInput {
  items: TimelineInput[];
  pxPerYear: number;
  cardWidth: number;
  gap: number;
  pad: number;
  lanesPerSide: number;
}

/** An empty stretch drawn shorter than its true length, marked on the axis. */
export interface TimelineBreak {
  fromX: number;
  toX: number;
  years: number;
}

export interface TimelineGeometry {
  placements: TimelinePlacement[];
  /** One per distinct date: where it sits on the axis. */
  knots: { key: number; x: number }[];
  breaks: TimelineBreak[];
  /** Axis position for a date: true scale, except across marked breaks. */
  keyToX: (key: number) => number;
  xToKey: (x: number) => number;
  width: number;
  /** Where the dated axis ends; undated posts sit to its right. */
  datedEnd: number;
  /** Left edge of the undated stretch, or null when every post has a date. */
  undatedStart: number | null;
  minKey: number;
  originX: number;
}

/** Year span of the dated posts; a single date gets a one-year span so it can be centred. */
export const datedRange = (
  items: TimelineInput[]
): { min: number; max: number } | null => {
  const keys = items
    .map((item) => item.key)
    .filter((key): key is number => key !== null);
  if (keys.length === 0) return null;
  return { min: Math.min(...keys), max: Math.max(...keys) };
};

/** Pixels per year that fit every dated marker into the viewport. */
export const fitPxPerYear = (
  items: TimelineInput[],
  viewportWidth: number,
  cardWidth: number,
  pad: number
): number => {
  const range = datedRange(items);
  const usable = Math.max(viewportWidth - cardWidth - pad * 2, 40);
  if (!range || range.max === range.min) return usable;
  return usable / (range.max - range.min);
};

/**
 * Gaps long enough to shrink, keyed by the date that starts them: more than four times the
 * median gap and more than a sixth of the span still drawn to scale. Chosen from the dates, never the zoom.
 */
export const outlierGaps = (sortedKeys: number[]): Set<number> => {
  const result = new Set<number>();
  if (sortedKeys.length < 3) return result;
  const gaps = sortedKeys.slice(1).map((key, i) => key - sortedKeys[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  let remaining = sortedKeys[sortedKeys.length - 1] - sortedKeys[0];
  // Largest first: each break shortens the span the next gap is judged against.
  const order = gaps.map((gap, i) => i).sort((a, b) => gaps[b] - gaps[a]);
  for (const i of order) {
    const gap = gaps[i];
    if (gap <= median * 4 || gap <= remaining / 6) break;
    result.add(sortedKeys[i]);
    remaining -= gap;
  }
  return result;
};

/**
 * Places each post's marker at its date and its card in the nearest lane that has room,
 * alternating sides; a crowded card slides right of its marker instead of covering a neighbour.
 */
export const layoutTimeline = ({
  items,
  pxPerYear,
  cardWidth,
  gap,
  pad,
  lanesPerSide,
}: TimelineGeometryInput): TimelineGeometry => {
  const range = datedRange(items);
  const minKey = range?.min ?? 0;
  const originX = pad + cardWidth / 2;
  const lanes = Math.max(1, lanesPerSide);
  // Index 2n is above-lane n, 2n+1 below-lane n.
  const laneRight = Array.from({ length: lanes * 2 }, () => -Infinity);
  const placements: TimelinePlacement[] = [];
  let lastSide: 'above' | 'below' = 'below';

  const place = (id: string, dotX: number, dated: boolean) => {
    const desired = dotX - cardWidth / 2;
    const leftFor = (slot: number) => Math.max(desired, laneRight[slot] + gap);
    const preferred = lastSide === 'above' ? 1 : 0;
    // First choice: the innermost lane on the alternate side that needs no nudge.
    let slot = -1;
    for (const side of [preferred, 1 - preferred]) {
      for (let lane = 0; lane < lanes && slot === -1; lane += 1) {
        const candidate = lane * 2 + side;
        if (leftFor(candidate) === desired) slot = candidate;
      }
      if (slot !== -1) break;
    }
    if (slot === -1) {
      slot = 0;
      for (let candidate = 1; candidate < laneRight.length; candidate += 1) {
        if (leftFor(candidate) < leftFor(slot)) slot = candidate;
      }
    }
    const cardX = leftFor(slot);
    laneRight[slot] = cardX + cardWidth;
    const side = slot % 2 === 0 ? 'above' : 'below';
    lastSide = side;
    placements.push({
      id,
      dotX,
      cardX,
      side,
      lane: Math.floor(slot / 2),
      dated,
    });
  };

  // True scale everywhere except the outlier gaps chosen from the data, each drawn as a marked break.
  const breakWidth = Math.max(cardWidth * 0.35, 56);
  const distinct = [
    ...new Set(
      items.map((item) => item.key).filter((key): key is number => key !== null)
    ),
  ].sort((a, b) => a - b);
  const broken = outlierGaps(distinct);
  const knots: { key: number; x: number }[] = [];
  const breaks: TimelineBreak[] = [];
  for (const key of distinct) {
    const last = knots[knots.length - 1];
    if (!last) {
      knots.push({ key, x: originX });
      continue;
    }
    const years = key - last.key;
    const raw = years * pxPerYear;
    const shortened = cardWidth / 2 + breakWidth;
    if (broken.has(last.key) && raw > shortened) {
      const x = last.x + shortened;
      breaks.push({
        fromX: last.x + cardWidth / 4,
        toX: x - cardWidth / 4,
        years,
      });
      knots.push({ key, x });
    } else {
      knots.push({ key, x: last.x + raw });
    }
  }
  // Within a broken segment the quarter card at each end stays true scale; only the middle shrinks.
  const edge = cardWidth / 4;
  const isBroken = (a: { x: number }, b: { x: number }) =>
    breaks.some((br) => br.fromX >= a.x && br.toX <= b.x);
  const keyToX = (key: number): number => {
    if (knots.length === 0) return originX;
    if (key <= knots[0].key)
      return knots[0].x - (knots[0].key - key) * pxPerYear;
    const end = knots[knots.length - 1];
    if (key >= end.key) return end.x + (key - end.key) * pxPerYear;
    let i = 1;
    while (knots[i].key < key) i += 1;
    const a = knots[i - 1];
    const b = knots[i];
    if (isBroken(a, b)) {
      const near = edge / pxPerYear;
      if (key - a.key <= near) return a.x + (key - a.key) * pxPerYear;
      if (b.key - key <= near) return b.x - (b.key - key) * pxPerYear;
      const t = (key - a.key - near) / (b.key - a.key - 2 * near);
      return a.x + edge + t * (b.x - a.x - 2 * edge);
    }
    return a.x + ((key - a.key) / (b.key - a.key)) * (b.x - a.x);
  };
  const xToKey = (x: number): number => {
    if (knots.length === 0) return minKey;
    if (x <= knots[0].x) return knots[0].key - (knots[0].x - x) / pxPerYear;
    const end = knots[knots.length - 1];
    if (x >= end.x) return end.key + (x - end.x) / pxPerYear;
    let i = 1;
    while (knots[i].x < x) i += 1;
    const a = knots[i - 1];
    const b = knots[i];
    if (isBroken(a, b)) {
      const near = edge / pxPerYear;
      if (x - a.x <= edge) return a.key + (x - a.x) / pxPerYear;
      if (b.x - x <= edge) return b.key - (b.x - x) / pxPerYear;
      const t = (x - a.x - edge) / (b.x - a.x - 2 * edge);
      return a.key + near + t * (b.key - a.key - 2 * near);
    }
    return a.key + ((x - a.x) / (b.x - a.x)) * (b.key - a.key);
  };

  let datedEnd = originX;
  for (const item of items) {
    if (item.key === null) continue;
    const dotX = keyToX(item.key);
    place(item.id, dotX, true);
    datedEnd = Math.max(datedEnd, dotX);
  }

  const undated = items.filter((item) => item.key === null);
  let undatedStart: number | null = null;
  if (undated.length > 0) {
    const cardsEnd = Math.max(datedEnd, ...laneRight.filter(Number.isFinite));
    undatedStart = range ? cardsEnd + gap * 3 : pad;
    // Undated posts share the lanes two at a time, one above and one below.
    undated.forEach((item, index) => {
      const column = Math.floor(index / 2);
      const dotX =
        (undatedStart as number) + cardWidth / 2 + column * (cardWidth + gap);
      place(item.id, dotX, false);
    });
  }

  const rightmost = Math.max(
    datedEnd + cardWidth / 2,
    ...placements.map((p) => p.cardX + cardWidth)
  );
  return {
    placements,
    width: rightmost + pad,
    datedEnd,
    undatedStart,
    minKey,
    originX,
    keyToX,
    xToKey,
    knots,
    breaks,
  };
};

const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const MONTH_STEPS = [1, 3, 6];

/** Tick step in years: the smallest round step whose labels stay `minGap` pixels apart. */
export const tickStep = (
  pxPerYear: number,
  minGap: number,
  allowMonths = true
): number => {
  for (const months of allowMonths ? MONTH_STEPS : []) {
    if ((months / 12) * pxPerYear >= minGap) return months / 12;
  }
  let scale = 1;
  for (;;) {
    for (const step of YEAR_STEPS) {
      if (step * scale * pxPerYear >= minGap) return step * scale;
    }
    scale *= 1000;
    if (scale > 1e9) return 1e9;
  }
};

const tickLabel = (key: number, step: number): string => {
  if (step >= 1) return formatYear(Math.round(key));
  const year = Math.floor(key + 1e-9);
  const month = Math.round((key - year) * 12) + 1;
  const name = MONTH_NAMES[month - 1].slice(0, 3);
  return month === 1 ? `${name} ${formatYear(year)}` : name;
};

/** Round-numbered ticks on one true-scale step, left out of breaks and kept `minGap` apart. */
export const timelineTicks = (
  geometry: TimelineGeometry,
  pxPerYear: number,
  minGap: number,
  cardWidth: number
): TimelineTick[] => {
  const { knots, keyToX, xToKey, breaks } = geometry;
  if (knots.length === 0) return [];
  // Month ticks only when the whole timeline spans a few years.
  const allowMonths = knots[knots.length - 1].key - knots[0].key < 5;
  const step = tickStep(pxPerYear, minGap, allowMonths);
  const inBreak = (x: number) =>
    breaks.some((b) => x > b.fromX - minGap / 2 && x < b.toX + minGap / 2);
  // Walk each true-scale stretch on its own so a long break never means millions of steps.
  const edges = [
    geometry.originX - cardWidth / 2,
    ...breaks.flatMap((b) => [b.fromX, b.toX]),
    geometry.datedEnd + cardWidth / 2,
  ];
  const ticks: TimelineTick[] = [];
  let lastX = -Infinity;
  for (let i = 0; i + 1 < edges.length; i += 2) {
    // A stretch holding one post between breaks gets no ticks; its card names the date.
    const posts = knots.filter(
      (k) => k.x >= edges[i] - 1e-6 && k.x <= edges[i + 1] + 1e-6
    ).length;
    if (
      breaks.length > 0 &&
      (posts < 2 || edges[i + 1] - edges[i] < minGap * 2)
    )
      continue;
    const from = xToKey(edges[i]);
    const to = xToKey(edges[i + 1]);
    const first = Math.ceil(from / step - 1e-9) * step;
    for (let key = first; key <= to + 1e-9; key += step) {
      const rounded = step >= 1 ? Math.round(key) : Math.round(key * 12) / 12;
      // There is no year zero; the 1 BCE / 1 CE boundary goes unlabelled.
      if (step >= 1 ? rounded === 0 : Math.floor(rounded + 1e-9) === 0)
        continue;
      const x = keyToX(rounded);
      if (x < minGap / 2 || x - lastX < minGap || inBreak(x)) continue;
      ticks.push({ x, label: tickLabel(rounded, step) });
      lastX = x;
      if (ticks.length > 400) return ticks;
    }
  }
  return ticks;
};

/** "336 years" or "8 months": how much time a break leaves out. */
export const breakLabel = (years: number): string => {
  if (years >= 2) {
    const rounded = Math.round(years);
    return `${rounded.toLocaleString('en-US')} years`;
  }
  const months = Math.max(1, Math.round(years * 12));
  return months === 1 ? '1 month' : `${months} months`;
};

/** Zoom level, as a power of two of the whole-span scale: the closest view that fits, else the least crowded one. */
export const fitZoomLevel = (
  input: Omit<TimelineGeometryInput, 'pxPerYear'>,
  viewportWidth: number,
  baseScale: number,
  minLevel: number,
  maxLevel: number
): number => {
  let best = minLevel;
  let bestWidth = Infinity;
  let fallback = minLevel;
  let fallbackPush = Infinity;
  for (let level = maxLevel; level >= minLevel; level -= 1) {
    const geometry = layoutTimeline({
      ...input,
      pxPerYear: baseScale * 2 ** level,
    });
    if (geometry.width <= viewportWidth) return level;
    const push = Math.max(
      0,
      ...geometry.placements
        .filter((p) => p.dated)
        .map((p) => Math.abs(p.cardX + input.cardWidth / 2 - p.dotX))
    );
    // Otherwise the narrowest view whose cards sit within a card's width of their markers.
    if (push <= input.cardWidth && geometry.width < bestWidth) {
      bestWidth = geometry.width;
      best = level;
    }
    if (push < fallbackPush) {
      fallbackPush = push;
      fallback = level;
    }
  }
  if (bestWidth === Infinity) return fallback;
  return best;
};
