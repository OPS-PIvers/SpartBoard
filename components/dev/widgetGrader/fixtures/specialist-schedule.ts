import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const at = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const TYPICAL = ['Music', 'Art', 'PE', 'Library', 'Media Lab'];

// Daily recurring items show on any date, so the fixtures don't depend on the rotation calendar.
export const specialistScheduleFixtures = defineFixtures<'specialist-schedule'>(
  {
    empty: { config: { cycleDays: [], recurringItems: [] } },
    typical: {
      config: {
        specialistClass: '3A',
        cycleDays: [],
        recurringItems: TYPICAL.map((task, i) => ({
          id: `slot-${i}`,
          type: 'daily' as const,
          task,
          startTime: at(540 + i * 50),
          endTime: at(585 + i * 50),
        })),
      },
    },
    stress: {
      customTitle: STRESS.title,
      config: {
        specialistClass: STRESS.word,
        cycleDays: [],
        recurringItems: range(STRESS.itemCount, (i) => ({
          id: `slot-${i}`,
          type: 'daily' as const,
          task: i % 2 === 0 ? STRESS.longLabel(i) : STRESS.word,
          startTime: at(450 + i * 20),
          endTime: at(468 + i * 20),
        })),
      },
    },
  }
);
