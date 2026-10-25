import { describe, it, expect } from 'vitest';
import type { FurnitureItem } from '@/types';
import {
  describeBreaks,
  frontRowSeatIds,
  rulesForRoster,
  seatWithRules,
  seatsAreClose,
} from './seatingRules';

// A 4x3 grid of desks 110 apart horizontally, 90 vertically; row 0 is the front.
const grid = (): FurnitureItem[] =>
  Array.from({ length: 12 }, (_, i) => ({
    id: `d${i}`,
    type: 'desk',
    x: (i % 4) * 110,
    y: Math.floor(i / 4) * 90,
    width: 90,
    height: 70,
    rotation: 0,
  }));

const byId = (seats: FurnitureItem[]) => {
  const map = new Map(seats.map((s) => [s.id, s]));
  return {
    get: (id: string): FurnitureItem => {
      const seat = map.get(id);
      if (!seat) throw new Error(`no seat ${id}`);
      return seat;
    },
  };
};

describe('seatingRules', () => {
  it('treats side, front and diagonal neighbours as close', () => {
    const s = byId(grid());
    expect(seatsAreClose(s.get('d0'), s.get('d1'))).toBe(true);
    expect(seatsAreClose(s.get('d0'), s.get('d4'))).toBe(true);
    expect(seatsAreClose(s.get('d0'), s.get('d5'))).toBe(true);
    expect(seatsAreClose(s.get('d0'), s.get('d2'))).toBe(false);
    expect(seatsAreClose(s.get('d0'), s.get('d8'))).toBe(false);
  });

  it('finds the front row', () => {
    expect([...frontRowSeatIds(grid())].sort()).toEqual([
      'd0',
      'd1',
      'd2',
      'd3',
    ]);
  });

  it('keeps pairs apart and front-row students in front', () => {
    const seats = grid();
    const s = byId(seats);
    const students = Array.from({ length: 12 }, (_, i) => `s${i}`);
    const rules = {
      keepApart: [
        { a: 's0', b: 's1' },
        { a: 's2', b: 's3' },
      ],
      frontSeat: ['s4', 's5'],
    };
    for (let run = 0; run < 20; run++) {
      const r = seatWithRules(seats, students, {}, rules);
      expect(r.broken).toEqual({ apart: [], front: [] });
      expect(Object.keys(r.placed)).toHaveLength(12);
      expect(new Set(Object.values(r.placed)).size).toBe(12);
      expect(seatsAreClose(s.get(r.placed.s0), s.get(r.placed.s1))).toBe(false);
      expect(['d0', 'd1', 'd2', 'd3']).toContain(r.placed.s4);
    }
  });

  it('respects seats already taken', () => {
    const seats = grid();
    const r = seatWithRules(
      seats,
      ['s1'],
      { s0: 'd0' },
      {
        keepApart: [{ a: 's0', b: 's1' }],
      }
    );
    expect(['d1', 'd4', 'd5']).not.toContain(r.placed.s1);
    expect(r.placed.s1).not.toBe('d0');
  });

  it('reports rules it cannot meet', () => {
    const seats = grid().slice(0, 2);
    const r = seatWithRules(
      seats,
      ['a', 'b'],
      {},
      {
        keepApart: [{ a: 'a', b: 'b' }],
      }
    );
    expect(r.broken.apart).toEqual([['a', 'b']]);
    expect(describeBreaks(r.broken, (id) => id.toUpperCase())).toBe(
      "Couldn't keep A and B apart."
    );
  });

  it('lists students left without a seat', () => {
    const r = seatWithRules(grid().slice(0, 1), ['a', 'b'], {}, {});
    expect(r.unplaced).toHaveLength(1);
  });

  it('drops rules for students who left the roster', () => {
    expect(
      rulesForRoster(
        { keepApart: [{ a: 'a', b: 'gone' }], frontSeat: ['gone', 'a'] },
        new Set(['a'])
      )
    ).toEqual({ keepApart: [], frontSeat: ['a'] });
  });
});
