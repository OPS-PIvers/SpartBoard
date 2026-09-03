import React from 'react';
import type { ActivityWallLayout } from '@/types';

interface LayoutOption {
  layout: ActivityWallLayout;
  label: string;
  description: string;
  sketch: React.ReactNode;
}

const box = (
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  opacity = 1
) => (
  <rect
    key={key}
    x={x}
    y={y}
    width={w}
    height={h}
    rx={2}
    fill="currentColor"
    opacity={opacity}
  />
);

const sketch = (children: React.ReactNode) => (
  <svg
    viewBox="0 0 64 40"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    className="h-full w-full text-brand-blue-primary"
  >
    {children}
  </svg>
);

export const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    layout: 'wall',
    label: 'Wall',
    description: 'A free-form board of cards.',
    sketch: sketch([
      box('a', 4, 4, 16, 14),
      box('b', 24, 4, 16, 20, 0.8),
      box('c', 44, 4, 16, 11, 0.6),
      box('d', 4, 22, 16, 14, 0.6),
      box('e', 24, 28, 16, 8, 0.5),
      box('f', 44, 19, 16, 17, 0.8),
    ]),
  },
  {
    layout: 'columns',
    label: 'Columns',
    description: 'Named columns students post into.',
    sketch: sketch([
      box('h1', 4, 4, 16, 4),
      box('h2', 24, 4, 16, 4),
      box('h3', 44, 4, 16, 4),
      box('c1', 4, 12, 16, 24, 0.45),
      box('c2', 24, 12, 16, 24, 0.45),
      box('c3', 44, 12, 16, 24, 0.45),
    ]),
  },
  {
    layout: 'table',
    label: 'Table',
    description: 'A grid of labelled rows and columns.',
    sketch: sketch([
      box('th', 4, 4, 56, 4),
      box('rh', 4, 12, 12, 24, 0.8),
      box('x1', 20, 12, 18, 10, 0.4),
      box('x2', 42, 12, 18, 10, 0.4),
      box('x3', 20, 26, 18, 10, 0.4),
      box('x4', 42, 26, 18, 10, 0.4),
    ]),
  },
  {
    layout: 'timeline',
    label: 'Timeline',
    description: 'Ordered cards along a line, each with a label.',
    sketch: sketch([
      box('line', 4, 19, 56, 2, 0.6),
      box('t1', 8, 8, 12, 9),
      box('t2', 26, 23, 12, 9, 0.8),
      box('t3', 44, 8, 12, 9, 0.6),
    ]),
  },
  {
    layout: 'map',
    label: 'Map',
    description: 'Students drop a pin and attach a card.',
    sketch: sketch([
      box('bg', 4, 4, 56, 32, 0.2),
      <circle key="p1" cx={20} cy={16} r={4} fill="currentColor" />,
      <circle
        key="p2"
        cx={40}
        cy={26}
        r={4}
        fill="currentColor"
        opacity={0.7}
      />,
      <circle
        key="p3"
        cx={49}
        cy={12}
        r={3}
        fill="currentColor"
        opacity={0.5}
      />,
    ]),
  },
  {
    layout: 'wordcloud',
    label: 'Word Cloud',
    description: 'One word or phrase per post, sized by repeats.',
    sketch: sketch([
      box('w1', 8, 8, 24, 7),
      box('w2', 36, 10, 18, 5, 0.7),
      box('w3', 12, 20, 14, 5, 0.6),
      box('w4', 30, 19, 26, 8, 0.85),
      box('w5', 16, 30, 22, 5, 0.5),
    ]),
  },
];
