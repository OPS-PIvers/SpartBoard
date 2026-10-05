import { ROUTINES } from '@/config/instructionalRoutines';
import type { RoutineStep } from '@/types';
import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const stepsOf = (id: string): RoutineStep[] =>
  (ROUTINES.find((r) => r.id === id)?.steps ?? []).map((s, i) => ({
    id: `${id}-step-${i}`,
    text: s.text,
    icon: s.icon,
    color: s.color,
    label: s.label,
  }));

export const instructionalRoutinesFixtures =
  defineFixtures<'instructionalRoutines'>({
    empty: { config: {} },
    typical: {
      config: {
        selectedRoutineId: 'chalk-talk',
        customSteps: stepsOf('chalk-talk'),
        favorites: ['chalk-talk', 'jigsaw'],
      },
    },
    stress: {
      customTitle: STRESS.title,
      config: {
        selectedRoutineId: 'chalk-talk',
        customSteps: range(STRESS.itemCount, (i) => ({
          id: `stress-step-${i}`,
          text: `${STRESS.longLabel(i)} ${STRESS.sentence}`,
          label: STRESS.word,
          icon: 'Eye',
          color: 'blue',
        })),
        favorites: ROUTINES.map((r) => r.id),
      },
    },
  });
