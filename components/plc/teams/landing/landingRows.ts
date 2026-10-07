// Packs landing cards into six-column rows in layout order.

import type { TeamCardId } from '@/types';
import type {
  TeamCardRegistry,
  TeamCardSpan,
} from '@/components/plc/teams/types';

export const SPAN_COLUMNS: Record<TeamCardSpan, number> = {
  full: 6,
  twoThirds: 4,
  half: 3,
  third: 2,
};

/** The hero is always on the landing page (T4); it leads when the layout omits it. */
export function landingCardIds(cards: readonly TeamCardId[]): TeamCardId[] {
  return cards.includes('hero') ? [...cards] : ['hero', ...cards];
}

export function packLandingRows(
  cards: readonly TeamCardId[],
  registry: TeamCardRegistry
): TeamCardId[][] {
  const rows: TeamCardId[][] = [];
  let row: TeamCardId[] = [];
  let used = 0;
  for (const id of landingCardIds(cards)) {
    const cols = id === 'hero' ? 6 : SPAN_COLUMNS[registry[id].span];
    if (row.length && used + cols > 6) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(id);
    used += cols;
  }
  if (row.length) rows.push(row);
  return rows;
}
