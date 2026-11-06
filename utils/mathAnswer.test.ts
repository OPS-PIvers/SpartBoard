import { describe, expect, it } from 'vitest';
import { tidyAsciiMath } from './mathAnswer';

describe('tidyAsciiMath', () => {
  it('drops brackets around single-token fractions', () => {
    expect(tidyAsciiMath('(3)/(4)')).toBe('3/4');
    expect(tidyAsciiMath('(1)/(2)x')).toBe('1/2x');
    expect(tidyAsciiMath('(2.5)/(x)')).toBe('2.5/x');
  });

  it('keeps brackets that group more than one token', () => {
    expect(tidyAsciiMath('(x+1)/(2)')).toBe('(x+1)/2');
    expect(tidyAsciiMath('2(x+1)')).toBe('2(x+1)');
    expect(tidyAsciiMath('sin(x)')).toBe('sin(x)');
  });

  it('drops a doubled bracket', () => {
    expect(tidyAsciiMath('((x+1))/(2)')).toBe('(x+1)/2');
    expect(tidyAsciiMath('(((a)))')).toBe('(a)');
  });

  it('collapses spacing', () => {
    expect(tidyAsciiMath('  3 *  4 ')).toBe('3 * 4');
  });
});
