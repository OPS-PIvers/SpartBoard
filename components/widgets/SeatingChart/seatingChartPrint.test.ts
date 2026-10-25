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

  it('keeps every piece, rotated ones included, inside the room', () => {
    const rotated = buildSeatingChartPrint({
      title: 'T',
      date: new Date(2026, 9, 25),
      furniture: [
        item('a', { x: 0, y: 0, width: 140, height: 60, rotation: 90 }),
        item('b', { x: 400, y: 300, width: 140, height: 60, rotation: 45 }),
      ],
      namesBySeat: new Map(),
    });
    const boxes = [
      ...rotated.body.matchAll(
        /class="item[^"]*" style="left:([\d.-]+)mm;top:([\d.-]+)mm;width:([\d.]+)mm;height:([\d.]+)mm;transform:rotate\(([\d.-]+)deg\)/g
      ),
    ].map((m) => m.slice(1).map(Number));
    expect(boxes).toHaveLength(2);
    for (const [left, top, w, h, deg] of boxes) {
      const rad = (deg * Math.PI) / 180;
      const hw =
        (w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad))) / 2;
      const hh =
        (w * Math.abs(Math.sin(rad)) + h * Math.abs(Math.cos(rad))) / 2;
      expect(left + w / 2 - hw).toBeGreaterThanOrEqual(-0.01);
      expect(top + h / 2 - hh).toBeGreaterThanOrEqual(-0.01);
      expect(left + w / 2 + hw).toBeLessThanOrEqual(250.01);
      expect(top + h / 2 + hh).toBeLessThanOrEqual(150.01);
    }
  });

  it('never writes non-numbers into styles', () => {
    const bad = buildSeatingChartPrint({
      title: 'T',
      date: new Date(2026, 9, 25),
      furniture: [
        item('a', { rotation: '0deg);background:red' as unknown as number }),
      ],
      namesBySeat: new Map(),
    });
    expect(bad.body).not.toContain('background:red');
    expect(bad.body).not.toContain('NaN');
  });
});
