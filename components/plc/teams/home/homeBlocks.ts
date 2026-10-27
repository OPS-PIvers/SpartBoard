// Which PLC Home blocks show, in card order, packed into six-column rows.

import type { TeamCardId } from '@/types';
import { packCardRows } from '@/components/plc/teams/landing/landingRows';

export type PlcHomeBlock =
  | 'strip'
  | 'distribution'
  | 'trend'
  | 'participation'
  | 'mastery'
  | 'assessments'
  | 'goals'
  | 'updates'
  | 'calendar';

const BLOCK_OF_CARD: Partial<Record<TeamCardId, PlcHomeBlock>> = {
  nextMeeting: 'strip',
  openItems: 'strip',
  distribution: 'distribution',
  trend: 'trend',
  participation: 'participation',
  masteryByTarget: 'mastery',
  recentAssessments: 'assessments',
  goals: 'goals',
  latestUpdates: 'updates',
  calendar: 'calendar',
};

export const BLOCK_COLUMNS: Record<PlcHomeBlock, number> = {
  strip: 6,
  distribution: 2,
  trend: 2,
  participation: 2,
  mastery: 6,
  assessments: 6,
  goals: 6,
  updates: 4,
  calendar: 2,
};

/** Home's blocks in card order; a card with nothing to show is left out. */
export function plcHomeBlocks(
  cards: readonly TeamCardId[],
  shows: (block: PlcHomeBlock) => boolean
): PlcHomeBlock[] {
  const out: PlcHomeBlock[] = [];
  for (const card of cards) {
    const block = BLOCK_OF_CARD[card];
    if (block && !out.includes(block) && shows(block)) out.push(block);
  }
  return out;
}

/** Six-column rows of blocks; a row that doesn't fill shares its width evenly. */
export function plcHomeRows(blocks: readonly PlcHomeBlock[]) {
  return packCardRows(blocks, (b) => BLOCK_COLUMNS[b]).map((row) => ({
    blocks: row,
    full: row.reduce((n, b) => n + BLOCK_COLUMNS[b], 0) === 6,
  }));
}
