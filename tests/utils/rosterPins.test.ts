import { describe, it, expect } from 'vitest';
import { assignPins } from '@/utils/rosterPins';
import type { Student } from '@/types';

const student = (id: string, pin = ''): Student => ({
  id,
  firstName: id,
  lastName: '',
  pin,
});

describe('assignPins', () => {
  it('leaves students with an existing pin untouched', () => {
    const result = assignPins([student('a', '07')]);
    expect(result[0].pin).toBe('07');
  });

  it('backfills blank pins sequentially, zero-padded', () => {
    const result = assignPins([student('a'), student('b'), student('c')]);
    expect(result.map((s) => s.pin)).toEqual(['01', '02', '03']);
  });

  it('does not overwrite the array in place', () => {
    const input = [student('a')];
    const result = assignPins(input);
    expect(input[0].pin).toBe('');
    expect(result).not.toBe(input);
  });

  it('never hands out a fallback pin that collides with a manually-set pin later in the roster', () => {
    // Student at index 4 (position 5) is blank; a manually-set pin "05"
    // already exists later in the roster. The naive `String(i+1)` fallback
    // used to assign "05" to the blank student too, producing a silent
    // duplicate that breaks PIN-based student login (two students would
    // resolve to the same pin_index entry).
    const students = [
      student('s1'),
      student('s2'),
      student('s3'),
      student('s4'),
      student('s5'), // blank — naive fallback would be "05"
      student('s6'),
      student('s7', '05'), // manually assigned, collides with the naive fallback
    ];

    const result = assignPins(students);
    const pins = result.map((s) => s.pin);

    expect(new Set(pins).size).toBe(pins.length);
    expect(result.find((s) => s.id === 's7')?.pin).toBe('05');
    expect(result.find((s) => s.id === 's5')?.pin).not.toBe('05');
  });

  it('skips over multiple manually-set pins when backfilling', () => {
    const students = [
      student('a', '01'),
      student('b'),
      student('c', '02'),
      student('d'),
    ];
    const result = assignPins(students);
    const pins = result.map((s) => s.pin);
    expect(new Set(pins).size).toBe(pins.length);
    expect(result.find((s) => s.id === 'b')?.pin).toBe('03');
    expect(result.find((s) => s.id === 'd')?.pin).toBe('04');
  });
});
