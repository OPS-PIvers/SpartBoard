import type { FurnitureItem } from '@/types';
import { defineFixtures } from './types';
import { STRESS, STRESS_ROSTER, TYPICAL_ROSTER, range } from './stress';

const desks = (count: number, columns: number): FurnitureItem[] =>
  range(count, (i) => ({
    id: `desk-${i + 1}`,
    type: 'desk',
    x: 60 + (i % columns) * 110,
    y: 100 + Math.floor(i / columns) * 90,
    width: 90,
    height: 70,
    rotation: 0,
  }));

const assignAll = (
  roster: typeof TYPICAL_ROSTER,
  furniture: FurnitureItem[]
): Record<string, string> =>
  Object.fromEntries(
    roster.students
      .slice(0, furniture.length)
      .map((s, i) => [s.id, furniture[i].id])
  );

const TYPICAL_FURNITURE: FurnitureItem[] = [
  ...desks(24, 6),
  {
    id: 'teacher',
    type: 'teacher-desk',
    x: 60,
    y: 20,
    width: 140,
    height: 60,
    rotation: 0,
    label: 'Teacher',
  },
];
const STRESS_FURNITURE = desks(STRESS.rosterSize, 7);

export const seatingChartFixtures = defineFixtures<'seating-chart'>({
  empty: { config: {} },
  typical: {
    rosters: [TYPICAL_ROSTER],
    config: {
      rosterMode: 'class',
      furniture: TYPICAL_FURNITURE,
      assignments: assignAll(TYPICAL_ROSTER, TYPICAL_FURNITURE),
    },
  },
  stress: {
    customTitle: STRESS.title,
    rosters: [STRESS_ROSTER],
    config: {
      rosterMode: 'class',
      furniture: STRESS_FURNITURE,
      assignments: assignAll(STRESS_ROSTER, STRESS_FURNITURE),
    },
  },
});
