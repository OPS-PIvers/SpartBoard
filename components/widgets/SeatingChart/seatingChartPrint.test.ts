import { describe, it, expect } from 'vitest';
import type { FurnitureItem } from '@/types';
import { buildSeatingChartPrint } from './seatingChartPrint';

const item = (
  id: string,
  over: Partial<FurnitureItem> = {}
): FurnitureItem => ({
  id,
  type: 'desk',
  x: 100,
  y: 100,
  width: 80,
  height: 65,
  rotation: 0,
  ...over,
});

describe('buildSeatingChartPrint', () => {
  const doc = buildSeatingChartPrint({
    title: 'Room <204>',
    planName: 'Test day',
    className: 'Period 3',
    date: new Date(2026, 9, 25),
    furniture: [
      item('d1'),
      item('d2', { x: 300, rotation: 90 }),
      item('t', { type: 'teacher-desk', y: 0 }),
    ],
    namesBySeat: new Map([['d1', ['Ana <b>Ba</b>']]]),
  });

  it('prints names in seats, escaped', () => {
    expect(doc.body).toContain('Ana &lt;b&gt;Ba&lt;/b&gt;');
    expect(doc.body).not.toContain('<b>Ba');
  });

  it('marks the front of the room, the class, plan and date', () => {
    expect(doc.body).toContain('Front of room');
    expect(doc.body).toContain('Room &lt;204&gt;');
    expect(doc.body).toContain('Period 3 &middot; Test day');
    expect(doc.body).toContain('2026');
  });

  it('labels the teacher desk and keeps rotation', () => {
    expect(doc.body).toContain('>Teacher<');
    expect(doc.body).toContain('rotate(90deg)');
  });

  it('fits the room to the page from its top-left furniture', () => {
    expect(doc.body).toContain('left:0.00mm;top:0.00mm');
  });
});
