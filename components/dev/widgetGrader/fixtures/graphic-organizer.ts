import { defineFixtures } from './types';
import { STRESS } from './stress';

const node = (id: string, text: string) => ({ id, text });

export const graphicOrganizerFixtures = defineFixtures<'graphic-organizer'>({
  empty: { config: { templateType: 'frayer', nodes: {} } },
  typical: {
    config: {
      templateType: 'frayer',
      nodes: {
        'top-left': node('top-left', 'A living thing that makes its own food'),
        'top-right': node('top-right', '- Needs sunlight\n- Has chlorophyll'),
        'bottom-left': node('bottom-left', '- Oak tree\n- Fern'),
        'bottom-right': node('bottom-right', '- Rock\n- Mushroom'),
        center: node('center', 'Plant'),
      },
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      templateType: 'kwl',
      nodes: {
        know: node('know', `${STRESS.sentence} ${STRESS.word}`),
        wonder: node('wonder', STRESS.maxText(600)),
        learn: node('learn', `${STRESS.word}\n${STRESS.longLabel(0)}`),
      },
    },
  },
});
