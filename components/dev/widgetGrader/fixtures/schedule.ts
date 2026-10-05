import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const at = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const TYPICAL = [
  'Morning Meeting',
  'Math',
  'Reading Workshop',
  'Lunch',
  'Science',
  'Specials',
];

export const scheduleFixtures = defineFixtures<'schedule'>({
  empty: { config: { items: [] } },
  typical: {
    config: {
      items: TYPICAL.map((task, i) => ({
        id: `slot-${i}`,
        task,
        startTime: at(480 + i * 55),
        endTime: at(530 + i * 55),
      })),
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      items: range(STRESS.itemCount, (i) => ({
        id: `slot-${i}`,
        task: i % 2 === 0 ? STRESS.longLabel(i) : STRESS.word,
        startTime: at(450 + i * 20),
        endTime: at(468 + i * 20),
      })),
    },
  },
});
