import { describe, expect, it } from 'vitest';
import {
  calcAnswerAccepted,
  calcModifiedNeedsAnswer,
  calcSeed,
  drawCalcValues,
  evaluateFormula,
  fillCalcPrompt,
  formatCalcAnswer,
  formulaVariables,
  parseStudentNumber,
  type CalcSpec,
} from '@/utils/quizCalculated';

const speed: CalcSpec = {
  seed: 'seed-1',
  variables: [
    { name: 'd', min: 40, max: 120, decimals: 1 },
    { name: 't', min: 1.5, max: 4, decimals: 1 },
  ],
  formula: 'd ÷ t',
  tolerance: { kind: 'relative', percent: 1 },
  roundTo: 2,
  unit: 'km/h',
};

describe('evaluateFormula', () => {
  it.each([
    ['2 + 3 * 4', {}, 14],
    ['(2 + 3) * 4', {}, 20],
    ['2^3^2', {}, 512],
    ['-2^2', {}, -4],
    ['2d', { d: 5 }, 10],
    ['3(a + b)', { a: 1, b: 2 }, 9],
    ['sqrt(a^2 + b^2)', { a: 3, b: 4 }, 5],
    ['1/2 m v^2', { m: 2, v: 3 }, 9],
    ['2 × pi × r', { r: 1 }, 2 * Math.PI],
    ['log(1000)', {}, 3],
    ['mv^2', { m: 2, v: 3 }, 18],
    ['{d} / {t}', { d: 9, t: 3 }, 3],
    ['2 a1 + b', { a1: 4, b: 1 }, 9],
  ])('%s', (src, values, expected) => {
    expect(evaluateFormula(src, values)).toBeCloseTo(expected, 10);
  });

  it('returns null for unknown names, bad input and divide by zero', () => {
    expect(evaluateFormula('a + q', { a: 1 })).toBeNull();
    expect(evaluateFormula('a / 0', { a: 1 })).toBeNull();
    expect(evaluateFormula('alert(1)', {})).toBeNull();
    expect(evaluateFormula('a; b', { a: 1, b: 2 })).toBeNull();
    expect(evaluateFormula('constructor', {})).toBeNull();
    expect(evaluateFormula('constructor(5) + 1', {})).toBeNull();
    expect(evaluateFormula('toString(1)', {})).toBeNull();
    expect(evaluateFormula('(1 + 2', {})).toBeNull();
  });

  it('lists the variables a formula uses', () => {
    expect(formulaVariables('1/2 m v^2 + m g h')).toEqual(['m', 'v', 'g', 'h']);
    expect(formulaVariables('mgh')).toEqual(['m', 'g', 'h']);
  });
});

describe('drawCalcValues', () => {
  it('is the same for the same seed and inside each range at its decimals', () => {
    const seed = calcSeed('assign-1', 'student-1', 'q1');
    const a = drawCalcValues(speed, seed);
    expect(drawCalcValues(speed, seed)).toEqual(a);
    expect(a.d).toBeGreaterThanOrEqual(40);
    expect(a.d).toBeLessThanOrEqual(120);
    expect(Math.round(a.d * 10) / 10).toBe(a.d);
    expect(a.t).toBeGreaterThanOrEqual(1.5);
    expect(a.t).toBeLessThanOrEqual(4);
  });

  it('gives different students different numbers', () => {
    const seen = new Set(
      Array.from({ length: 30 }, (_, i) =>
        JSON.stringify(drawCalcValues(speed, calcSeed('a', `s${i}`, 'q1')))
      )
    );
    expect(seen.size).toBeGreaterThan(25);
  });

  it('can land on both ends of an integer range', () => {
    const spec = {
      variables: [{ name: 'n', min: 1, max: 3, decimals: 0 }],
    };
    const vals = new Set(
      Array.from({ length: 200 }, (_, i) => drawCalcValues(spec, `s${i}`).n)
    );
    expect([...vals].sort()).toEqual([1, 2, 3]);
  });

  it('never draws 0 from a range that crosses it', () => {
    const spec = {
      variables: [{ name: 'x', min: -1, max: 1, decimals: 0 }],
    };
    for (let i = 0; i < 50; i++) {
      expect(drawCalcValues(spec, `s${i}`).x).not.toBe(0);
    }
  });
});

describe('parseStudentNumber', () => {
  it.each([
    ['38', 38],
    [' 38.00 ', 38],
    ['-4.5', -4.5],
    ['1,250.5', 1250.5],
    ['3.2e4', 32000],
    ['3.2 x 10^4', 32000],
    ['3/4', 0.75],
    ['38 km/h', 38],
    ['38km/h', 38],
  ])('%s', (raw, expected) => {
    expect(parseStudentNumber(raw, 'km/h')).toBeCloseTo(expected, 10);
  });

  it('refuses words and expressions', () => {
    expect(parseStudentNumber('about 38')).toBeNull();
    expect(parseStudentNumber('87.4/2.3')).toBeNull();
    expect(parseStudentNumber('')).toBeNull();
  });
});

describe('calcAnswerAccepted', () => {
  const values = { d: 87.4, t: 2.3 }; // 38.0
  it('accepts within 1 percent and refuses outside it', () => {
    expect(calcAnswerAccepted(speed, values, '38')).toBe(true);
    expect(calcAnswerAccepted(speed, values, '38.37')).toBe(true);
    expect(calcAnswerAccepted(speed, values, '38.5')).toBe(false);
    expect(calcAnswerAccepted(speed, values, '')).toBe(false);
  });

  it('always accepts the answer rounded the way it is shown', () => {
    const tight: CalcSpec = {
      ...speed,
      tolerance: { kind: 'absolute', amount: 0 },
    };
    const v = { d: 52.9, t: 3.6 }; // 14.6944...
    expect(formatCalcAnswer(tight, v)).toBe('14.69 km/h');
    expect(calcAnswerAccepted(tight, v, '14.69')).toBe(true);
    expect(calcAnswerAccepted(tight, v, '14.7')).toBe(false);
  });

  it('uses a plus or minus amount', () => {
    const abs: CalcSpec = {
      ...speed,
      tolerance: { kind: 'absolute', amount: 0.5 },
    };
    expect(calcAnswerAccepted(abs, values, '38.49')).toBe(true);
    expect(calcAnswerAccepted(abs, values, '38.6')).toBe(false);
  });
});

describe('fillCalcPrompt', () => {
  it('writes each number at its decimals and leaves unknown slots', () => {
    expect(
      fillCalcPrompt('Travels {d} km in {t} hours, {z} left.', speed, {
        d: 80,
        t: 2.5,
      })
    ).toBe('Travels 80.0 km in 2.5 hours, {z} left.');
  });
});

describe('rounding', () => {
  it('rounds to 2 decimals when the teacher never set it', () => {
    const spec: CalcSpec = {
      seed: 's',
      variables: [],
      formula: 'a / b',
      tolerance: { kind: 'absolute', amount: 0 },
    };
    expect(formatCalcAnswer(spec, { a: 10, b: 3 })).toBe('3.33');
    expect(calcAnswerAccepted(spec, { a: 10, b: 3 }, '3.33')).toBe(true);
  });
});

describe('calcModifiedNeedsAnswer', () => {
  it('is true only for a modified prompt with none of the number links', () => {
    expect(calcModifiedNeedsAnswer('Goes 60 km in 2 h.', speed)).toBe(true);
    expect(calcModifiedNeedsAnswer('Goes {d} km in 2 h.', speed)).toBe(false);
    expect(calcModifiedNeedsAnswer('', speed)).toBe(false);
    expect(calcModifiedNeedsAnswer(undefined, speed)).toBe(false);
  });
});
