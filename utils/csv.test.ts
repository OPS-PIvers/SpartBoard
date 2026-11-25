import { describe, it, expect } from 'vitest';
import { csvDataRows, parseCsvRecords } from '@/utils/csv';

describe('parseCsvRecords', () => {
  it('handles quoted commas, newlines and escaped quotes', () => {
    expect(parseCsvRecords('a,"b, c","say ""hi""\nthere"\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['1', '2', '3'],
    ]);
  });

  it('drops a leading byte-order mark', () => {
    expect(parseCsvRecords('\uFEFFa,b')).toEqual([['a', 'b']]);
  });
});

describe('csvDataRows', () => {
  const isNumber = (cells: string[]) => /^\d+$/.test(cells[0] ?? '');

  it('skips a header row and keeps file line numbers', () => {
    expect(csvDataRows('id,name\n\n1, Ann \n2,Bo', isNumber)).toEqual([
      { cells: ['1', 'Ann'], line: 3 },
      { cells: ['2', 'Bo'], line: 4 },
    ]);
  });

  it('keeps the first row when it is data', () => {
    expect(csvDataRows('1,Ann', isNumber)).toEqual([
      { cells: ['1', 'Ann'], line: 1 },
    ]);
  });

  it('drops blank rows', () => {
    expect(csvDataRows(' , \n', isNumber)).toEqual([]);
  });
});
