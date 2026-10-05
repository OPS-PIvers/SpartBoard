import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const dateOffset = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Building sync reads Firestore, so fixtures use only the teacher's own events.
const own = { isBuildingSyncEnabled: false, personalCalendarIds: [] };

export const calendarFixtures = defineFixtures<'calendar'>({
  empty: { config: { ...own, events: [] } },
  typical: {
    config: {
      ...own,
      events: [
        { date: dateOffset(0), time: '09:30', title: 'Unit 3 quiz' },
        { date: dateOffset(0), time: '13:15', title: 'Staff meeting' },
        { date: dateOffset(1), title: 'Picture day' },
        { date: dateOffset(2), time: '10:00', title: 'Library visit' },
        { date: dateOffset(4), title: 'Field trip permission slips due' },
      ],
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      ...own,
      daysVisible: 7,
      events: range(STRESS.itemCount, (i) => ({
        date: dateOffset(Math.floor(i / 4)),
        time: `${String(8 + (i % 4) * 2).padStart(2, '0')}:00`,
        title: i % 2 === 0 ? STRESS.longLabel(i) : STRESS.word,
        location: STRESS.title,
        description: STRESS.sentence,
      })),
    },
  },
});
