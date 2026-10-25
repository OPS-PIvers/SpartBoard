import type { FurnitureItem, SeatingChartRules } from '@/types';
import { getRandomInt, shuffleArray } from '@/utils/randomHelpers';

const ATTEMPTS = 200;

export const isSeat = (f: FurnitureItem): boolean =>
  f.type === 'desk' || f.type.startsWith('table');

const center = (f: FurnitureItem) => ({
  x: f.x + f.width / 2,
  y: f.y + f.height / 2,
});

// Neighbours touch side by side or on a diagonal; the same piece of furniture always counts.
export const seatsAreClose = (a: FurnitureItem, b: FurnitureItem): boolean => {
  if (a.id === b.id) return true;
  const ca = center(a);
  const cb = center(b);
  const reach = 1.6 * Math.max(a.width, a.height, b.width, b.height);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y) <= reach;
};

// The front of the room is the top of the canvas; the front row is the band of seats nearest it.
export const frontRowSeatIds = (seats: FurnitureItem[]): Set<string> => {
  if (seats.length === 0) return new Set();
  const minY = Math.min(...seats.map((s) => center(s).y));
  const heights = seats.map((s) => s.height).sort((a, b) => a - b);
  const band = heights[Math.floor(heights.length / 2)] * 0.75;
  return new Set(
    seats.filter((s) => center(s).y <= minY + band).map((s) => s.id)
  );
};

export interface RuleBreaks {
  apart: [string, string][];
  front: string[];
}

export interface SeatResult {
  /** New seats only; seats in `fixed` are left as they are. */
  placed: Record<string, string>;
  unplaced: string[];
  broken: RuleBreaks;
}

const partnersOf = (rules: SeatingChartRules) => {
  const map = new Map<string, Set<string>>();
  for (const { a, b } of rules.keepApart ?? []) {
    if (a === b) continue;
    if (!map.has(a)) map.set(a, new Set());
    if (!map.has(b)) map.set(b, new Set());
    map.get(a)?.add(b);
    map.get(b)?.add(a);
  }
  return map;
};

const findBreaks = (
  all: Record<string, string>,
  placed: Record<string, string>,
  rules: SeatingChartRules,
  seatsById: Map<string, FurnitureItem>,
  frontRow: Set<string>
): RuleBreaks => {
  const apart: [string, string][] = [];
  for (const { a, b } of rules.keepApart ?? []) {
    if (!(a in placed) && !(b in placed)) continue;
    const sa = seatsById.get(all[a]);
    const sb = seatsById.get(all[b]);
    if (sa && sb && seatsAreClose(sa, sb)) apart.push([a, b]);
  }
  const front = (rules.frontSeat ?? []).filter(
    (id) => id in placed && !frontRow.has(placed[id])
  );
  return { apart, front };
};

const pick = <T>(items: T[]): T => items[getRandomInt(items.length)];

/** Seats `students` in the empty seats, keeping `fixed` seats, and tries to honour the rules. */
export const seatWithRules = (
  seats: FurnitureItem[],
  students: string[],
  fixed: Record<string, string>,
  rules: SeatingChartRules
): SeatResult => {
  const seatsById = new Map(seats.map((s) => [s.id, s]));
  const frontRow = frontRowSeatIds(seats);
  const partners = partnersOf(rules);
  const front = new Set(rules.frontSeat ?? []);
  const taken = new Set(Object.values(fixed));
  const open = seats.filter((s) => !taken.has(s.id));
  const hasRules = partners.size > 0 || front.size > 0;

  let best: SeatResult | null = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < (hasRules ? ATTEMPTS : 1); attempt++) {
    const shuffled = shuffleArray(students);
    const order = [
      ...shuffled.filter((id) => front.has(id)),
      ...shuffled.filter((id) => !front.has(id) && partners.has(id)),
      ...shuffled.filter((id) => !front.has(id) && !partners.has(id)),
    ];
    const free = new Set(open.map((s) => s.id));
    const all: Record<string, string> = { ...fixed };
    const placed: Record<string, string> = {};
    const unplaced: string[] = [];

    for (const id of order) {
      if (free.size === 0) {
        unplaced.push(id);
        continue;
      }
      const freeSeats = [...free].flatMap((sid) => {
        const s = seatsById.get(sid);
        return s ? [s] : [];
      });
      const partnerSeats = [...(partners.get(id) ?? [])].flatMap((p) => {
        const s = seatsById.get(all[p]);
        return s ? [s] : [];
      });
      const apartOk = freeSeats.filter(
        (s) => !partnerSeats.some((p) => seatsAreClose(s, p))
      );
      const wantsFront = front.has(id);
      const tiers = wantsFront
        ? [apartOk.filter((s) => frontRow.has(s.id)), apartOk, freeSeats]
        : [apartOk, freeSeats];
      const tier = tiers.find((t) => t.length > 0) ?? freeSeats;
      const seat = pick(tier);
      free.delete(seat.id);
      all[id] = seat.id;
      placed[id] = seat.id;
    }

    const broken = findBreaks(all, placed, rules, seatsById, frontRow);
    const score = broken.apart.length + broken.front.length;
    if (score < bestScore) {
      best = { placed, unplaced, broken };
      bestScore = score;
    }
    if (score === 0) break;
  }
  return (
    best ?? {
      placed: {},
      unplaced: [...students],
      broken: { apart: [], front: [] },
    }
  );
};

/** Drops rules that name students no longer on the roster. */
export const rulesForRoster = (
  rules: SeatingChartRules | undefined,
  rosterIds: Set<string>
): SeatingChartRules => ({
  keepApart: (rules?.keepApart ?? []).filter(
    ({ a, b }) => rosterIds.has(a) && rosterIds.has(b)
  ),
  frontSeat: (rules?.frontSeat ?? []).filter((id) => rosterIds.has(id)),
});

export const describeBreaks = (
  broken: RuleBreaks,
  label: (id: string) => string
): string | null => {
  const parts: string[] = [];
  for (const [a, b] of broken.apart) {
    parts.push(`Couldn't keep ${label(a)} and ${label(b)} apart.`);
  }
  if (broken.front.length > 0) {
    parts.push(
      `No front-row seat left for ${broken.front.map(label).join(', ')}.`
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
};
