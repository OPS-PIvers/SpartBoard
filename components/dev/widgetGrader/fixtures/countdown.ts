import { defineFixtures } from './types';
import { STRESS } from './stress';

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number): string =>
  new Date(Date.now() + days * DAY_MS).toISOString();

export const countdownFixtures = defineFixtures<'countdown'>({
  empty: { config: {} },
  typical: {
    config: {
      title: 'Winter Break',
      startDate: inDays(-3),
      eventDate: inDays(18),
      includeWeekends: false,
      countToday: true,
      viewMode: 'number',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      title: `${STRESS.title} ${STRESS.word}`,
      startDate: inDays(-60),
      eventDate: inDays(300),
      includeWeekends: true,
      countToday: true,
      viewMode: 'grid',
    },
  },
});
