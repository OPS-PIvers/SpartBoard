import type { QuizConfig } from '@/types';
import type { ProficiencyBand } from './monitorUtils';

/** The roster toolbar's saved choices; Quiz and Flashcards keep them in widget config. */
export type MonitorRosterPrefs = Pick<
  QuizConfig,
  | 'monitorShowScores'
  | 'monitorShowTabWarnings'
  | 'monitorShowProficiency'
  | 'monitorSortBy'
  | 'monitorFilterBy'
>;

export const BAND_TINT: Record<ProficiencyBand, string> = {
  hi: 'bg-emerald-50',
  mid: 'bg-amber-50',
  low: 'bg-orange-50',
  crit: 'bg-rose-50',
};

export const rosterFieldStyle = {
  fontSize: 'min(11px, 3.8cqmin)',
  padding: 'min(4px, 1cqmin) min(6px, 1.5cqmin)',
};

export const rosterIconSize = {
  width: 'min(12px, 4cqmin)',
  height: 'min(12px, 4cqmin)',
};
