import { normalizeAnswer } from '@/hooks/useQuizSession';

/** One spot in a student's Ordering answer. */
export interface OrderingSpot {
  text: string;
  /** Index in the key, or -1 for an empty slot or an item not in the key. */
  correctIndex: number;
  /** Part of the longest correctly ordered run, the one partial credit counts. */
  inOrder: boolean;
}

export interface OrderingPlacement {
  spots: OrderingSpot[];
  /** Per key item: where the student put it (0-based), or null when left out. */
  placedAt: (number | null)[];
  /** Per key item: the student had it out of order or left it out. */
  misplaced: boolean[];
}

/** Entries of one longest increasing run, preferring runs that keep more items in their exact spot. */
function bestRun(entries: { pos: number; idx: number }[]): Set<number> {
  const n = entries.length;
  const len = new Array<number>(n).fill(1);
  const exact = entries.map((e) => (e.pos === e.idx ? 1 : 0));
  const prev = new Array<number>(n).fill(-1);
  const better = (l: number, x: number, k: number) =>
    l > len[k] || (l === len[k] && x > exact[k]);
  for (let i = 0; i < n; i++) {
    const own = entries[i].pos === entries[i].idx ? 1 : 0;
    for (let j = 0; j < i; j++)
      if (
        entries[j].idx < entries[i].idx &&
        better(len[j] + 1, exact[j] + own, i)
      ) {
        len[i] = len[j] + 1;
        exact[i] = exact[j] + own;
        prev[i] = j;
      }
  }
  let end = -1;
  for (let k = 0; k < n; k++)
    if (
      end < 0 ||
      len[k] > len[end] ||
      (len[k] === len[end] && exact[k] > exact[end])
    )
      end = k;
  const run = new Set<number>();
  for (let k = end; k >= 0; k = prev[k]) run.add(k);
  return run;
}

/** Marks which items a student put out of order: everything outside the run partial credit counts. */
export function placeOrderingAnswer(
  correct: readonly string[],
  given: readonly string[]
): OrderingPlacement {
  const correctNorm = correct.map(normalizeAnswer);
  const used = new Array<boolean>(correct.length).fill(false);
  const spots: OrderingSpot[] = given.map((text) => {
    const target = normalizeAnswer(text);
    // Leftmost unused occurrence, matching the grader on duplicate items.
    let correctIndex = -1;
    for (let i = 0; i < correctNorm.length; i++)
      if (!used[i] && correctNorm[i] === target) {
        correctIndex = i;
        break;
      }
    if (correctIndex >= 0) used[correctIndex] = true;
    return { text: text.trim(), correctIndex, inOrder: false };
  });

  const mapped = spots
    .map((s, pos) => ({ pos, idx: s.correctIndex }))
    .filter((e) => e.idx >= 0);
  const run = bestRun(mapped);
  mapped.forEach((e, k) => {
    spots[e.pos].inOrder = run.has(k);
  });

  const placedAt: (number | null)[] = correct.map(() => null);
  for (const e of mapped) placedAt[e.idx] = e.pos;
  const misplaced = correct.map((_, i) => {
    const pos = placedAt[i];
    return pos === null || !spots[pos].inOrder;
  });
  return { spots, placedAt, misplaced };
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
