import type { QuizMetadata } from '@/types';
import { defineFixtures, userPath } from './types';
import { STRESS, range } from './stress';

const T0 = Date.UTC(2026, 8, 1, 14, 0);

const makeQuiz = (id: string, title: string, i: number): QuizMetadata => ({
  id,
  title,
  driveFileId: `drive-${id}`,
  questionCount: 5 + i,
  createdAt: T0 - i * 86_400_000,
  updatedAt: T0 - i * 86_400_000,
});

const docsFor = (
  quizzes: QuizMetadata[]
): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    quizzes.map((q) => [userPath(`quizzes/${q.id}`), { ...q }])
  );

export const reviewFixtures = defineFixtures<'review'>({
  empty: { config: { view: 'manager', managerTab: 'library' } },
  typical: {
    firestoreDocs: docsFor(
      [
        'Unit 3 review',
        'Vocabulary warm-up',
        'Lab safety',
        'Chapter 5 check',
      ].map((title, i) => makeQuiz(`quiz-${i}`, title, i))
    ),
    config: { view: 'manager', managerTab: 'library' },
  },
  stress: {
    firestoreDocs: docsFor(
      range(STRESS.itemCount, (i) =>
        makeQuiz(`quiz-${i}`, i % 2 === 0 ? STRESS.title : STRESS.word, i)
      )
    ),
    config: { view: 'manager', managerTab: 'library' },
  },
});
