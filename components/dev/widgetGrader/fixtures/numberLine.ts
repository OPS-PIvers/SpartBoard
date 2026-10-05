import { defineFixtures } from './types';
import { STRESS } from './stress';

export const numberLineFixtures = defineFixtures<'numberLine'>({
  empty: {
    config: {
      min: 0,
      max: 10,
      step: 1,
      displayMode: 'integers',
      markers: [],
      jumps: [],
      showArrows: true,
    },
  },
  typical: {
    config: {
      min: 0,
      max: 20,
      step: 1,
      displayMode: 'integers',
      showArrows: true,
      markers: [
        { id: 'm1', value: 7, label: 'Start', color: '#ef4444' },
        { id: 'm2', value: 15, label: 'End', color: '#3b82f6' },
      ],
      jumps: [{ id: 'j1', startValue: 7, endValue: 15, label: '+8' }],
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      min: -1000,
      max: 1000,
      step: 0.25,
      displayMode: 'decimals',
      showArrows: true,
      markers: [
        { id: 'm1', value: -999.75, label: STRESS.word, color: '#ef4444' },
        { id: 'm2', value: 0, label: STRESS.longLabel(1), color: '#22c55e' },
        { id: 'm3', value: 0.25, label: STRESS.longLabel(2), color: '#3b82f6' },
        { id: 'm4', value: 999.5, label: STRESS.word, color: '#f59e0b' },
      ],
      jumps: [
        { id: 'j1', startValue: -999.75, endValue: 0, label: STRESS.word },
        {
          id: 'j2',
          startValue: 0,
          endValue: 999.5,
          label: STRESS.longLabel(3),
        },
        { id: 'j3', startValue: 999.5, endValue: -500, label: '-1499.5' },
      ],
    },
  },
});
