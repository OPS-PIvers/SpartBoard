import { defineFixtures } from './types';
import { STRESS } from './stress';

export const catalystInstructionFixtures =
  defineFixtures<'catalyst-instruction'>({
    empty: { config: { routineId: '', stepIndex: 0 } },
    typical: {
      config: {
        routineId: 'routine-1',
        stepIndex: 0,
        title: 'Pair Share',
        instructions:
          '1. Turn to your shoulder partner.\n2. Partner A shares for 30 seconds.\n3. Partner B shares for 30 seconds.',
      },
    },
    stress: {
      customTitle: STRESS.title,
      config: {
        routineId: 'routine-1',
        stepIndex: 0,
        title: STRESS.title,
        instructions: Array.from(
          { length: STRESS.itemCount },
          (_, i) => `${i + 1}. ${i % 2 === 0 ? STRESS.sentence : STRESS.word}`
        ).join('\n'),
      },
    },
  });
