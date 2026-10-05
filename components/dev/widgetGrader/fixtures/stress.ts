// Shared stress inputs (plan: long titles, long unbroken words, 35-student roster, 20+ items).
import type { ClassRoster, Student } from '@/types';

const FIRST = [
  'Ava',
  'Mateo',
  'Harper',
  'Elijah',
  'Sofia',
  'Kai',
  'Amara',
  'Liam',
  'Zoe',
  'Theo',
  'Nora',
  'Malik',
];
const LAST = [
  'Johnson',
  'Nguyen',
  'Garcia',
  'Okafor',
  'Lindqvist',
  'Patel',
  'Rivera',
  'Kowalski',
  'Haddad',
  'Svensson',
];

const LONG_FIRST = 'Maximiliana-Josephine';
const LONG_LAST = 'Vanderbilt-Oyelaran-Castellanos';

export const STRESS = {
  title:
    'Second Period Advanced Placement Environmental Science Lab Rotation Planner',
  word: 'Pneumonoultramicroscopicsilicovolcanoconiosis',
  sentence:
    'Before you leave today, finish the reflection on page forty-two, return your lab goggles, and check that your station partner has signed the safety log.',
  longLabel: (i: number): string =>
    `Item ${i + 1}: Pneumonoultramicroscopicsilicovolcanoconiosis and a deliberately long label that keeps going`,
  maxText: (chars: number): string =>
    'Lorem ipsum dolor sit amet consectetur adipiscing elit '
      .repeat(Math.ceil(chars / 55))
      .slice(0, chars),
  itemCount: 24,
  rosterSize: 35,
} as const;

export const range = <T>(count: number, make: (i: number) => T): T[] =>
  Array.from({ length: count }, (_, i) => make(i));

export const makeStudents = (count: number): Student[] =>
  range(count, (i) => ({
    id: `student-${i + 1}`,
    firstName: i === 0 ? LONG_FIRST : FIRST[i % FIRST.length],
    lastName: i === 0 ? LONG_LAST : LAST[(i * 7) % LAST.length],
    pin: String(i + 1).padStart(2, '0'),
  }));

export const makeRoster = (
  count: number,
  name = 'Period 3 Science'
): ClassRoster => ({
  id: `roster-${count}`,
  name,
  driveFileId: null,
  studentCount: count,
  createdAt: Date.UTC(2026, 8, 1),
  students: makeStudents(count),
});

export const TYPICAL_ROSTER = makeRoster(24);
export const STRESS_ROSTER = makeRoster(STRESS.rosterSize, STRESS.title);
