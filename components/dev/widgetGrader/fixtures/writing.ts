import type {
  WritingAssignmentDefinition,
  WritingAssignmentRecord,
} from '@/types';
import { defineFixtures, userPath } from './types';
import { STRESS, makeRoster, range } from './stress';

const T0 = Date.UTC(2026, 8, 1, 14, 0);

const makeAssignment = (
  id: string,
  title: string,
  i: number
): WritingAssignmentDefinition => ({
  id,
  title,
  prompt: 'Write about a time you changed your mind.',
  stimuli: [],
  minWords: 200,
  maxWords: 600,
  grading: i % 2 === 0 ? { mode: 'points', points: 20 } : { mode: 'ungraded' },
  folderId: null,
  createdAt: T0 - i * 86_400_000,
  updatedAt: T0 - i * 86_400_000,
});

const docsFor = (
  items: WritingAssignmentDefinition[]
): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    items.map((a) => [userPath(`writing_assignments/${a.id}`), { ...a }])
  );

const record = (
  id: string,
  title: string,
  status: 'active' | 'ended',
  periodNames: string[],
  i: number
): WritingAssignmentRecord => ({
  id,
  sessionId: id,
  itemId: `writing-${i}`,
  title,
  teacherUid: 'fixture',
  status,
  periodNames,
  createdAt: T0 - i * 86_400_000,
  updatedAt: T0 - i * 86_400_000,
  dueAt: T0 + (3 - i) * 86_400_000,
  ...(status === 'ended' ? { endedAt: T0 } : {}),
});

const ROSTERS = [
  {
    ...makeRoster(24, 'Period 1 English'),
    id: 'roster-w1',
    classlinkClassId: 'class-w1',
  },
  {
    ...makeRoster(27, 'Period 3 English'),
    id: 'roster-w3',
    classlinkClassId: 'class-w3',
  },
];

const RECORDS = [
  record('ws-1', 'Personal narrative', 'active', ['Period 1', 'Period 3'], 0),
  record('ws-2', 'Argument essay', 'active', ['Period 2'], 1),
  record('ws-3', 'Book review', 'ended', ['Period 1'], 2),
];

export const writingFixtures = defineFixtures<'writing'>({
  empty: { config: { view: 'manager', managerTab: 'library' } },
  typical: {
    rosters: ROSTERS,
    firestoreDocs: {
      ...docsFor(
        [
          'Personal narrative',
          'Argument essay',
          'Lab report reflection',
          'Book review',
        ].map((title, i) => makeAssignment(`writing-${i}`, title, i))
      ),
      ...Object.fromEntries(
        RECORDS.map((r) => [
          userPath(`writing_assignment_records/${r.id}`),
          { ...r },
        ])
      ),
    },
    config: { view: 'manager', managerTab: 'library' },
  },
  stress: {
    firestoreDocs: docsFor(
      range(STRESS.itemCount, (i) =>
        makeAssignment(
          `writing-${i}`,
          i % 2 === 0 ? STRESS.title : STRESS.word,
          i
        )
      )
    ),
    config: { view: 'manager', managerTab: 'library' },
  },
});
