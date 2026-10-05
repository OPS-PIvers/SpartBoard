import { defineFixtures } from './types';
import { STRESS } from './stress';

// The library comes from the teacher's Drive, so the manager shows its empty lists.
export const quizFixtures = defineFixtures<'quiz'>({
  empty: { config: {} },
  typical: {
    config: {
      view: 'manager',
      managerTab: 'active',
      libraryViewMode: 'list',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      view: 'manager',
      managerTab: 'library',
      selectedQuizTitle: STRESS.title,
      teacherName: STRESS.title,
      periodNames: [STRESS.word, STRESS.title],
    },
  },
});
