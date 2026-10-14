import { describe, expect, it } from 'vitest';
import {
  EmptyReferenceError,
  evaluatePronunciation,
  InvalidMatchLevelError,
  InvalidStressWeightError,
  type EvaluateInput,
} from './score';

const THRESHOLDS = { Loose: 60, Close: 80, Exact: 95 };
const EL_PERRO = ['e', 'l', 'p', 'e', 'r', 'o'];

function run(
  targetPhonemes: string[],
  spokenPhonemes: string[],
  extra: Partial<EvaluateInput> = {}
) {
  return evaluatePronunciation({
    targetPhonemes,
    spokenPhonemes,
    matchLevel: 'Close',
    thresholds: THRESHOLDS,
    ...extra,
  });
}

const statuses = (r: ReturnType<typeof run>) =>
  r.alignment.map((e) => e.status);

describe('El perro (spec §6.2)', () => {
  it('scores a fully correct utterance 100', () => {
    const r = run(EL_PERRO, [...EL_PERRO]);
    expect([r.score, r.passed, r.metrics.correctCount, r.metrics.per]).toEqual([
      100,
      true,
      6,
      0,
    ]);
  });

  it('scores the English retroflex 83, a pass at Close and a fail at Exact', () => {
    const spoken = ['e', 'l', 'p', 'e', 'ɹ', 'o'];
    const close = run(EL_PERRO, spoken);
    expect(close.alignment[4]).toEqual({
      position: 5,
      targetIPA: 'r',
      spokenIPA: 'ɹ',
      status: 'substituted',
    });
    expect([close.score, close.passed]).toEqual([83, true]);
    expect(run(EL_PERRO, spoken, { matchLevel: 'Exact' }).passed).toBe(false);
  });
});

describe('A5 — extra sounds get an entry, rendered in array order', () => {
  it('emits an inserted entry sharing its predecessor position', () => {
    const r = run(['p', 'o'], ['p', 'o', 's']);
    expect(r.alignment[2]).toEqual({
      position: 2,
      targetIPA: null,
      spokenIPA: 's',
      status: 'inserted',
    });
    expect(r.alignment.map((e) => e.position)).toEqual([1, 2, 2]);
  });

  it('positions an insertion before the word at 0', () => {
    const r = run(['a'], ['b', 'a']);
    expect(statuses(r)).toEqual(['inserted', 'correct']);
    expect(r.alignment[0].position).toBe(0);
  });
});

describe('A6 — PER keeps the standard definition', () => {
  it('lets PER exceed 1 while the score clamps at 0', () => {
    const r = run(['p', 'e'], ['p', 'e', 'a', 'b', 'c', 'd']);
    expect([r.metrics.per, r.score, r.passed]).toEqual([2, 0, false]);
  });
});

describe('A7 — an unconfigured strictness level throws', () => {
  it('rejects a level that is not configured, naming the ones that are', () => {
    expect(() => run(EL_PERRO, EL_PERRO, { matchLevel: 'close' })).toThrow(
      InvalidMatchLevelError
    );
    expect(() => run(EL_PERRO, EL_PERRO, { matchLevel: 'Strict' })).toThrow(
      /Loose, Close, Exact/
    );
  });

  it('accepts an admin-added level', () => {
    const r = run(EL_PERRO, EL_PERRO, {
      matchLevel: 'Kindergarten',
      thresholds: { ...THRESHOLDS, Kindergarten: 40 },
    });
    expect(r.requiredScore).toBe(40);
  });
});

describe('A8 — ties go to a substitution', () => {
  it('reports a wrong sound rather than a skip plus an extra', () => {
    const r = run(['p', 'a'], ['b']);
    expect(statuses(r)).toEqual(['omitted', 'substituted']);
    expect(r.metrics.insertionCount).toBe(0);
  });
});

describe('A3/A4 — symbols only, null for the missing side', () => {
  it('uses null on an omission and carries no prose', () => {
    const r = run(['p', 'e', 'r', 'o'], ['p', 'e', 'o']);
    expect(r.alignment[2]).toEqual({
      position: 3,
      targetIPA: 'r',
      spokenIPA: null,
      status: 'omitted',
    });
    expect(JSON.stringify(r)).not.toMatch(/Expected|detected/);
  });
});

describe('A13 — an empty reference throws', () => {
  it('throws whether or not anything was spoken', () => {
    expect(() => run([], ['p'])).toThrow(EmptyReferenceError);
    expect(() => run([], [])).toThrow(EmptyReferenceError);
  });
});

describe('T1–T3 — a repeated recognized token is held, not charged', () => {
  it('scores a held trill 100 with a held entry after the matched one', () => {
    const r = run(['p', 'e', 'r', 'o'], ['p', 'e', 'r', 'r', 'o']);
    expect(statuses(r)).toEqual([
      'correct',
      'correct',
      'correct',
      'held',
      'correct',
    ]);
    expect(r.alignment[3]).toEqual({
      position: 3,
      targetIPA: null,
      spokenIPA: 'r',
      status: 'held',
    });
    expect([
      r.score,
      r.metrics.per,
      r.metrics.heldCount,
      r.metrics.insertionCount,
    ]).toEqual([100, 0, 1, 0]);
  });

  it('holds every extra in a long run', () => {
    const r = run(['p', 'e', 'r', 'o'], ['p', 'e', 'r', 'r', 'r', 'o']);
    expect([r.score, r.metrics.heldCount]).toEqual([100, 2]);
  });

  it('still charges an under-produced geminate', () => {
    const r = run(['i', 'n', 'n', 'a', 't', 'o'], ['i', 'n', 'a', 't', 'o']);
    expect(r.metrics.omissionCount).toBe(1);
    expect(r.metrics.heldCount).toBe(0);
  });

  it('charges a held trill over a tap once, not twice (T5)', () => {
    const r = run(['p', 'e', 'ɾ', 'o'], ['p', 'e', 'r', 'r', 'o']);
    expect(statuses(r)).toEqual([
      'correct',
      'correct',
      'substituted',
      'held',
      'correct',
    ]);
    expect(r.score).toBe(75);
  });

  it('charges a run of extra sounds once when none of it matches', () => {
    const r = run(['p', 'o'], ['p', 'r', 'r', 'o']);
    expect(statuses(r)).toEqual(['correct', 'inserted', 'held', 'correct']);
    expect(r.metrics.insertionCount).toBe(1);
  });

  it('keeps the spoken entries one-to-one with the spoken stream', () => {
    const spoken = ['p', 'e', 'r', 'r', 'r', 'o', 's'];
    const r = run(['p', 'e', 'r', 'o'], spoken);
    expect(
      r.alignment.filter((e) => e.spokenIPA !== null).map((e) => e.spokenIPA)
    ).toEqual(spoken);
  });
});

describe('A9/A10 — stress folds in at a tunable weight, binary per S1', () => {
  it('lowers a perfect sound score when stress lands on an unaccepted syllable', () => {
    const r = run(EL_PERRO, EL_PERRO, {
      stress: { detected: 1, accepted: [2] },
      stressWeight: 0.15,
    });
    expect([r.segmentScore, r.stressScore, r.score]).toEqual([100, 0, 85]);
  });

  it('gives full credit for any accepted index', () => {
    const r = run(EL_PERRO, EL_PERRO, {
      stress: { detected: 1, accepted: [2, 1] },
      stressWeight: 0.15,
    });
    expect(r.score).toBe(100);
  });

  it('degrades to sounds-only with no evidence or an empty accepted list (A10a)', () => {
    for (const stress of [undefined, null, { detected: 1, accepted: [] }]) {
      const r = run(EL_PERRO, EL_PERRO, { stress, stressWeight: 0.5 });
      expect([r.stressScore, r.appliedStressWeight, r.score]).toEqual([
        null,
        0,
        100,
      ]);
    }
  });

  it('rejects a weight outside 0–1', () => {
    expect(() => run(EL_PERRO, EL_PERRO, { stressWeight: 1.5 })).toThrow(
      InvalidStressWeightError
    );
  });
});
