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

export interface TimelineGeometry {
  placements: TimelinePlacement[];
  /** One per distinct date: where it sits on the axis. */
  knots: { key: number; x: number }[];
  /** Axis position for a date; stretched between posts that would otherwise crowd. */
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

  // Knots of a piecewise-linear axis: true scale, except that neighbouring dates are
  // pushed at least `spacing` apart so their cards fit the lanes without overlapping.
  const spacing = (cardWidth + gap) / (lanes * 2);
  const knots: { key: number; x: number }[] = [];
  for (const item of items) {
    if (item.key === null) continue;
    const last = knots[knots.length - 1];
    if (last && last.key === item.key) continue;
    const x = last
      ? Math.max(last.x + (item.key - last.key) * pxPerYear, last.x + spacing)
      : originX;
    knots.push({ key: item.key, x });
  }
  const density = (a: number, b: number) =>
    knots.length > 1
      ? (knots[b].x - knots[a].x) / (knots[b].key - knots[a].key)
      : pxPerYear;
  const leftDensity = density(0, 1);
  const rightDensity = density(knots.length - 2, knots.length - 1);
  const keyToX = (key: number): number => {
    if (knots.length === 0) return originX;
    if (key <= knots[0].key)
      return knots[0].x - (knots[0].key - key) * leftDensity;
    const end = knots[knots.length - 1];
    if (key >= end.key) return end.x + (key - end.key) * rightDensity;
    let i = 1;
    while (knots[i].key < key) i += 1;
    const a = knots[i - 1];
    const b = knots[i];
    return a.x + ((key - a.key) / (b.key - a.key)) * (b.x - a.x);
  };
  const xToKey = (x: number): number => {
    if (knots.length === 0) return minKey;
    if (x <= knots[0].x) return knots[0].key - (knots[0].x - x) / leftDensity;
    const end = knots[knots.length - 1];
    if (x >= end.x) return end.key + (x - end.x) / rightDensity;
    let i = 1;
    while (knots[i].x < x) i += 1;
    const a = knots[i - 1];
    const b = knots[i];
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

/** Round-numbered ticks across the dated stretch, extended half a card either side. */
export const timelineTicks = (
  geometry: TimelineGeometry,
  minGap: number,
  cardWidth: number
): TimelineTick[] => {
  const { knots, keyToX, xToKey } = geometry;
  if (knots.length === 0) return [];
  // Each stretch between two dates gets its own round step, since crowding gaps widen some.
  const bounds = [
    xToKey(geometry.originX - cardWidth / 2),
    ...knots.map((knot) => knot.key),
    xToKey(geometry.datedEnd + cardWidth / 2),
  ];
  // Month ticks only when the whole timeline spans a few years.
  const allowMonths = knots[knots.length - 1].key - knots[0].key < 5;
  const ticks: TimelineTick[] = [];
  let lastX = -Infinity;
  for (let i = 1; i < bounds.length; i += 1) {
    const from = bounds[i - 1];
    const to = bounds[i];
    if (to <= from) continue;
    const local = (keyToX(to) - keyToX(from)) / (to - from);
    const step = tickStep(local, minGap, allowMonths);
    const first = Math.ceil(from / step - 1e-9) * step;
    for (let key = first; key <= to + 1e-9; key += step) {
      const rounded = step >= 1 ? Math.round(key) : Math.round(key * 12) / 12;
      // There is no year zero; the 1 BCE / 1 CE boundary goes unlabelled.
      if (step >= 1 ? rounded === 0 : Math.floor(rounded + 1e-9) === 0)
        continue;
      const x = keyToX(rounded);
      if (x - lastX < minGap) continue;
      ticks.push({ x, label: tickLabel(rounded, step) });
      lastX = x;
      if (ticks.length > 400) return ticks;
    }
  }
  return ticks;
};

/** Largest scale at which the dated stretch, crowding gaps included, fits the viewport. */
export const fitTimelineScale = (
  input: Omit<TimelineGeometryInput, 'pxPerYear'>,
  viewportWidth: number
): number => {
  const { items } = input;
  const naive = fitPxPerYear(items, viewportWidth, input.cardWidth, input.pad);
  const widthAt = (pxPerYear: number) =>
    layoutTimeline({ ...input, items, pxPerYear }).width;
  if (widthAt(naive) <= viewportWidth) return naive;
  let low = naive / 1e6;
  let high = naive;
  if (widthAt(low) > viewportWidth) return low;
  for (let i = 0; i < 30; i += 1) {
    const mid = Math.sqrt(low * high);
    if (widthAt(mid) <= viewportWidth) low = mid;
    else high = mid;
  }
  return low;
};
