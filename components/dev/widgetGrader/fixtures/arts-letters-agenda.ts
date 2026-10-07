import { defineFixtures } from './types';
import { STRESS } from './stress';

export const artsLettersAgendaFixtures = defineFixtures<'arts-letters-agenda'>({
  empty: { config: {} },
  typical: {
    config: {
      descriptions: {
        launch: 'Quick write: what makes a character brave?',
        learn: 'Read chapter 3 and annotate with a partner',
        land: 'Exit ticket on the main idea',
      },
      completed: { launch: true },
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      descriptions: {
        launch: STRESS.sentence,
        learn: STRESS.word,
        land: STRESS.sentence.repeat(2).slice(0, 200),
      },
      completed: { launch: true, land: true },
    },
  },
});
