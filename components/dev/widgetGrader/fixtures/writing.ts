import type { WritingAssignmentDefinition } from '@/types';
import { defineFixtures, userPath } from './types';
import { STRESS, range } from './stress';

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

export const writingFixtures = defineFixtures<'writing'>({
  empty: { config: { view: 'manager', managerTab: 'library' } },
  typical: {
    firestoreDocs: docsFor(
      [
        'Personal narrative',
        'Argument essay',
        'Lab report reflection',
        'Book review',
      ].map((title, i) => makeAssignment(`writing-${i}`, title, i))
    ),
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
