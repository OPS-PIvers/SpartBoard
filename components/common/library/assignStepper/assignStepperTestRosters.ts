import type { ClassRoster } from '@/types';

const student = (id: string, first: string, sso: boolean) => ({
  id,
  firstName: first,
  lastName: 'S',
  pin: id,
  ...(sso ? { classLinkSourcedId: `SID-${id}` } : {}),
});

/** Test and harness rosters: Sample 1 has two students without a school sign-in. */
export const SAMPLE_ROSTERS: ClassRoster[] = [
  {
    id: 'c1',
    name: 'Sample 1',
    driveFileId: null,
    studentCount: 4,
    createdAt: 0,
    students: [
      student('a', 'Avery', true),
      student('b', 'Jordan', true),
      student('c', 'Priya', true),
      student('d', 'Mateo', false),
    ],
    groups: [
      { id: 'g1', name: 'Reading group A', studentIds: ['a', 'c'] },
      { id: 'g2', name: 'Needs reteach', studentIds: ['d'] },
    ],
  },
  {
    id: 'c2',
    name: 'Sample 2',
    driveFileId: null,
    studentCount: 3,
    createdAt: 0,
    students: [
      student('e', 'Sofia', true),
      student('f', 'Elijah', true),
      student('g', 'Hana', true),
    ],
  },
  {
    id: 'c3',
    name: 'Sample 3',
    driveFileId: null,
    studentCount: 0,
    createdAt: 0,
    students: [],
    loadError: 'network error',
  },
];
