import type { DrawableObject } from '@/types';
import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const wave = (offset: number, color: string): DrawableObject => ({
  id: `path-${offset}`,
  kind: 'path',
  z: offset,
  color,
  width: 4,
  points: range(20, (i) => ({
    x: 20 + i * 15,
    y: 120 + offset * 30 + Math.sin(i / 2) * 25,
  })),
});

const typicalObjects: DrawableObject[] = [
  wave(0, '#2563eb'),
  wave(1, '#dc2626'),
  {
    id: 'rect-1',
    kind: 'rect',
    z: 3,
    x: 40,
    y: 40,
    w: 120,
    h: 60,
    stroke: '#16a34a',
    strokeWidth: 4,
  },
  {
    id: 'text-1',
    kind: 'text',
    z: 4,
    x: 60,
    y: 220,
    w: 220,
    h: 40,
    content: 'Label the parts of a cell',
    fontFamily: 'sans-serif',
    fontSize: 24,
    color: '#1e293b',
  },
];

const stressObjects: DrawableObject[] = [
  ...range(30, (i) => wave(i % 8, i % 2 ? '#7c3aed' : '#ea580c')),
  {
    id: 'text-stress',
    kind: 'text',
    z: 40,
    x: 20,
    y: 20,
    w: 600,
    h: 80,
    content: `${STRESS.word} ${STRESS.sentence}`,
    fontFamily: 'sans-serif',
    fontSize: 28,
    color: '#1e293b',
    wrap: true,
  },
];

export const drawingFixtures = defineFixtures<'drawing'>({
  empty: { config: {} },
  typical: {
    config: {
      pages: [{ id: 'page-1', objects: typicalObjects }],
      currentPage: 0,
      color: '#2563eb',
      width: 4,
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      pages: range(6, (i) => ({
        id: `page-${i + 1}`,
        objects: i === 0 ? stressObjects : typicalObjects,
      })),
      currentPage: 0,
      color: '#dc2626',
      width: 24,
      customColors: ['#111827', '#dc2626', '#2563eb', '#16a34a', '#f59e0b'],
    },
  },
});
