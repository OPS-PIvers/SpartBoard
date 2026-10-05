import type { Station } from '@/types';
import { defineFixtures } from './types';
import { STRESS, STRESS_ROSTER, TYPICAL_ROSTER, range } from './stress';

const COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
];
const ICONS = [
  'BookOpen',
  'Laptop',
  'Calculator',
  'Users',
  'PenLine',
  'Beaker',
];

const makeStations = (count: number, title: (i: number) => string): Station[] =>
  range(count, (i) => ({
    id: `station-${i + 1}`,
    title: title(i),
    description: i % 2 === 0 ? STRESS.sentence : undefined,
    maxStudents: i % 3 === 0 ? 6 : undefined,
    iconName: ICONS[i % ICONS.length],
    color: COLORS[i % COLORS.length],
    order: i,
  }));

const assign = (
  students: { id: string }[],
  stationCount: number,
  skipEvery: number
): Record<string, string | null> =>
  Object.fromEntries(
    students.map((s, i) => [
      s.id,
      i % skipEvery === 0 ? null : `station-${(i % stationCount) + 1}`,
    ])
  );

export const stationsFixtures = defineFixtures<'stations'>({
  empty: {
    rosters: [TYPICAL_ROSTER],
    config: { stations: [], assignments: {} },
  },
  typical: {
    rosters: [TYPICAL_ROSTER],
    config: {
      stations: makeStations(
        4,
        (i) => ['Reading', 'Computers', 'Math games', 'Writing'][i]
      ),
      assignments: assign(TYPICAL_ROSTER.students, 4, 5),
    },
  },
  stress: {
    customTitle: STRESS.title,
    rosters: [STRESS_ROSTER],
    config: {
      stations: makeStations(10, (i) => STRESS.longLabel(i)),
      assignments: assign(STRESS_ROSTER.students, 10, 7),
    },
  },
});
