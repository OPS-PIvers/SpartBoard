import { defineFixtures } from './types';
import { STRESS, range } from './stress';

export const conceptWebFixtures = defineFixtures<'concept-web'>({
  empty: { config: { nodes: [], edges: [] } },
  typical: {
    config: {
      nodes: [
        { id: 'n1', text: 'Water cycle', x: 40, y: 40 },
        { id: 'n2', text: 'Evaporation', x: 10, y: 10 },
        { id: 'n3', text: 'Condensation', x: 70, y: 10 },
        { id: 'n4', text: 'Precipitation', x: 70, y: 70 },
        { id: 'n5', text: 'Collection', x: 10, y: 70 },
      ],
      edges: [
        {
          id: 'e1',
          sourceNodeId: 'n1',
          targetNodeId: 'n2',
          lineStyle: 'solid',
        },
        {
          id: 'e2',
          sourceNodeId: 'n2',
          targetNodeId: 'n3',
          label: 'rises',
          lineStyle: 'solid',
        },
        {
          id: 'e3',
          sourceNodeId: 'n3',
          targetNodeId: 'n4',
          label: 'falls',
          lineStyle: 'dashed',
        },
        {
          id: 'e4',
          sourceNodeId: 'n4',
          targetNodeId: 'n5',
          lineStyle: 'solid',
        },
      ],
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      nodes: range(STRESS.itemCount, (i) => ({
        id: `n${i}`,
        text: i % 2 === 0 ? STRESS.word : STRESS.longLabel(i),
        x: (i % 5) * 20,
        y: Math.floor(i / 5) * 18,
      })),
      edges: range(STRESS.itemCount - 1, (i) => ({
        id: `e${i}`,
        sourceNodeId: `n${i}`,
        targetNodeId: `n${i + 1}`,
        label: STRESS.word,
        lineStyle: i % 2 ? ('dashed' as const) : ('solid' as const),
      })),
    },
  },
});
