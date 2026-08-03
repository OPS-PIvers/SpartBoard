/**
 * Executable record of the decisions in `DECISIONS.md` (issue #2335).
 *
 * Per the ticket's stated method (source doc §9.1): each review note is a
 * behavioural claim with a concrete input, so each converts directly into a
 * test case — and deciding the assertion IS the decision. These tests are the
 * decisions; the reference implementation exists to run them.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluatePronunciation,
  InvalidMatchLevelError,
  InvalidStressWeightError,
} from './engine';

/** The spec's threshold profiles (§5.2). Injected, never hard-coded (A7). */
const THRESHOLDS = { Loose: 60, Close: 80, Exact: 95 };

/** `El perro` — the canonical example, spec §6.2. */
const EL_PERRO = ['e', 'l', 'p', 'e', 'r', 'o'];

describe('canonical example — El perro (spec §6.2)', () => {
  it('scores a fully correct utterance 100', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: [...EL_PERRO],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.metrics.correctCount).toBe(6);
    expect(result.metrics.per).toBe(0);
  });

  it('marks the English retroflex as a substitution', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: ['e', 'l', 'p', 'e', 'ɹ', 'o'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.metrics.substitutionCount).toBe(1);
    expect(result.metrics.correctCount).toBe(5);
    expect(result.alignment[4]).toEqual({
      position: 5,
      targetIPA: 'r',
      spokenIPA: 'ɹ',
      status: 'substituted',
    });
  });

  /**
   * FINDING — the spec's own worked example is arithmetically wrong.
   *
   * §6.2 shows `score: 75, passed: false` alongside `per: 0.166` for this
   * exact input. Under the formula the spec itself states in §5.1
   * (`Accuracy = max(0, round((1 - PER) × 100))`), one substitution in six
   * target sounds gives 1/6 = 0.167 PER and a score of 83 — which CLEARS the
   * Close threshold of 80. A score of 75 would require PER 0.25, i.e. two
   * errors in eight sounds, not one in six.
   *
   * This matters beyond arithmetic: the spec's canonical illustration of
   * failure is actually a pass. Anyone calibrating thresholds against it
   * would be calibrating against a number the formula cannot produce.
   */
  it('scores 83 and PASSES at Close — not the 75/failed the spec shows', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: ['e', 'l', 'p', 'e', 'ɹ', 'o'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.metrics.per).toBe(0.167);
    expect(result.score).toBe(83);
    expect(result.passed).toBe(true);
  });

  it('fails the same utterance at Exact', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: ['e', 'l', 'p', 'e', 'ɹ', 'o'],
      matchLevel: 'Exact',
      thresholds: THRESHOLDS,
    });

    expect(result.passed).toBe(false);
  });
});

describe('A5 — extra sounds appear in the breakdown', () => {
  it('emits an entry for an inserted sound', () => {
    const result = evaluatePronunciation({
      targetPhonemes: ['p', 'e', 'r', 'o'],
      spokenPhonemes: ['p', 'e', 'r', 'o', 's'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.metrics.insertionCount).toBe(1);
    expect(result.alignment).toHaveLength(5);
    expect(result.alignment[4]).toEqual({
      position: 4,
      targetIPA: null,
      spokenIPA: 's',
      status: 'inserted',
    });
  });

  it('positions an insertion before the word at 0, in utterance order', () => {
    const result = evaluatePronunciation({
      targetPhonemes: ['a'],
      spokenPhonemes: ['b', 'a'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.alignment.map((e) => e.status)).toEqual([
      'inserted',
      'correct',
    ]);
    expect(result.alignment[0].position).toBe(0);
    expect(result.alignment[0].targetIPA).toBeNull();
  });

  it('lets an inserted entry share a position with its neighbour', () => {
    const result = evaluatePronunciation({
      targetPhonemes: ['p', 'o'],
      spokenPhonemes: ['p', 'o', 's'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    // position is NOT a unique key — consumers must render in array order.
    const positions = result.alignment.map((e) => e.position);
    expect(positions).toEqual([1, 2, 2]);
    expect(new Set(positions).size).toBeLessThan(positions.length);
  });
});

describe('A6 — error rate keeps the standard definition', () => {
  it('lets PER exceed 1 rather than clamping or renormalizing it', () => {
    const result = evaluatePronunciation({
      targetPhonemes: ['p', 'e'],
      spokenPhonemes: ['p', 'e', 'a', 'b', 'c', 'd'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.metrics.insertionCount).toBe(4);
    expect(result.metrics.per).toBe(2);
    expect(result.metrics.per).toBeGreaterThan(1);
  });

  it('still clamps the score at 0, so nothing goes negative', () => {
    const result = evaluatePronunciation({
      targetPhonemes: ['p', 'e'],
      spokenPhonemes: ['p', 'e', 'a', 'b', 'c', 'd'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe('A7 — an unconfigured strictness level is rejected, never guessed', () => {
  it('throws rather than silently falling back to Close', () => {
    expect(() =>
      evaluatePronunciation({
        targetPhonemes: EL_PERRO,
        spokenPhonemes: [...EL_PERRO],
        matchLevel: 'close', // wrong case — a renamed or foreign preset
        thresholds: THRESHOLDS,
      })
    ).toThrow(InvalidMatchLevelError);
  });

  it('names the configured levels so the failure is actionable', () => {
    expect(() =>
      evaluatePronunciation({
        targetPhonemes: EL_PERRO,
        spokenPhonemes: [...EL_PERRO],
        matchLevel: 'Strict',
        thresholds: THRESHOLDS,
      })
    ).toThrow(/Loose, Close, Exact/);
  });

  it('accepts an admin-added level, since thresholds ship tunable', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: [...EL_PERRO],
      matchLevel: 'Kindergarten',
      thresholds: { ...THRESHOLDS, Kindergarten: 40 },
    });

    expect(result.requiredScore).toBe(40);
    expect(result.passed).toBe(true);
  });
});

describe('A8 — tie-break prefers a substitution, deliberately', () => {
  /**
   * For target [p, a] against spoken [b], substitution and omission are both
   * optimal at the final cell (both cost 2). The choice changes which
   * diagnostic the student sees, so it is decided rather than inherited from
   * statement order.
   */
  it('reports "wrong sound" rather than "skipped plus extra"', () => {
    const result = evaluatePronunciation({
      targetPhonemes: ['p', 'a'],
      spokenPhonemes: ['b'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.alignment.map((e) => e.status)).toEqual([
      'omitted',
      'substituted',
    ]);
    expect(result.metrics.substitutionCount).toBe(1);
    expect(result.metrics.insertionCount).toBe(0);
    expect(result.alignment[1]).toEqual({
      position: 2,
      targetIPA: 'a',
      spokenIPA: 'b',
      status: 'substituted',
    });
  });
});

describe('A3/A4 — payload carries symbols, never prose', () => {
  it('reports the detected sound on every substitution', () => {
    const result = evaluatePronunciation({
      targetPhonemes: ['r'],
      spokenPhonemes: ['ɹ'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.alignment[0].spokenIPA).toBe('ɹ');
  });

  it('emits no English diagnostic string anywhere', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: ['e', 'l', 'p', 'ɛ', 'ɹ', 'o'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    for (const entry of result.alignment) {
      expect(entry).not.toHaveProperty('diagnostic');
      expect(Object.keys(entry).sort()).toEqual([
        'position',
        'spokenIPA',
        'status',
        'targetIPA',
      ]);
    }
  });

  it('uses null, not an em dash, for the missing side of an omission', () => {
    const result = evaluatePronunciation({
      targetPhonemes: ['p', 'e', 'r', 'o'],
      spokenPhonemes: ['p', 'e', 'o'],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    const omitted = result.alignment.find((e) => e.status === 'omitted');
    expect(omitted?.spokenIPA).toBeNull();
    expect(omitted?.targetIPA).toBe('r');
  });
});

describe('A9 — stress folds into one combined score at a tunable weight', () => {
  it('lowers a perfect sound score when stress is wrong', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: [...EL_PERRO],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
      stress: { detected: [0, 1], accepted: [[1, 0]] },
      stressWeight: 0.15,
    });

    expect(result.segmentScore).toBe(100);
    expect(result.stressScore).toBe(0);
    expect(result.score).toBe(85);
    expect(result.passed).toBe(true);
  });

  it('degrades to sounds-only when the stress stage supplies nothing', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: [...EL_PERRO],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
      stressWeight: 0.15,
    });

    expect(result.stressScore).toBeNull();
    expect(result.appliedStressWeight).toBe(0);
    expect(result.score).toBe(result.segmentScore);
    expect(result.score).toBe(100);
  });

  it('rejects a weight outside 0–1', () => {
    expect(() =>
      evaluatePronunciation({
        targetPhonemes: EL_PERRO,
        spokenPhonemes: [...EL_PERRO],
        matchLevel: 'Close',
        thresholds: THRESHOLDS,
        stressWeight: 1.5,
      })
    ).toThrow(InvalidStressWeightError);
  });
});

describe('A10 — any accepted stress variant scores full credit (#2342)', () => {
  it('does not penalize a regionally valid stress pattern', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: [...EL_PERRO],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
      stress: {
        detected: [0, 1],
        accepted: [
          [1, 0],
          [0, 1],
        ],
      },
      stressWeight: 0.15,
    });

    expect(result.stressScore).toBe(100);
    expect(result.score).toBe(100);
  });

  it('degrades to sounds-only when no accepted variants are configured', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: [...EL_PERRO],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
      stress: { detected: [1, 0], accepted: [] },
      stressWeight: 0.5,
    });

    // A10a: absent evidence, not a failed match. Scoring 0 here would be a
    // silent class-wide failure, since no score persists and points are
    // recomputed on every read (D4) — an admin clearing the variants after
    // authoring would retroactively drag down every historical response.
    expect(result.stressScore).toBeNull();
    expect(result.appliedStressWeight).toBe(0);
    expect(result.score).toBe(result.segmentScore);
    expect(result.score).toBe(100);
  });

  it('counts extra detected syllables against the score', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: [...EL_PERRO],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
      stress: { detected: [1, 1, 0, 1], accepted: [[1, 0]] },
      stressWeight: 0.2,
    });

    // A10b: the denominator is the LONGER pattern, so this is 1/4 rather than
    // 1/2 — producing the wrong number of syllables is a real difference.
    expect(result.stressScore).toBe(25);
    expect(result.score).toBe(85);
  });

  it('counts missing detected syllables against the score too', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: [...EL_PERRO],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
      stress: { detected: [1], accepted: [[1, 0]] },
      stressWeight: 0.2,
    });

    expect(result.stressScore).toBe(50);
  });

  it('gives partial credit for a partly-correct pattern', () => {
    const result = evaluatePronunciation({
      targetPhonemes: EL_PERRO,
      spokenPhonemes: [...EL_PERRO],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
      stress: { detected: [1, 1], accepted: [[1, 0]] },
      stressWeight: 0.5,
    });

    expect(result.stressScore).toBe(50);
    expect(result.score).toBe(75);
  });
});

describe('A2 — the engine is alphabet-agnostic', () => {
  /**
   * The reference is stored exactly as the model emits it (narrow), so the
   * engine never needs to know which alphabet it is comparing — it compares
   * strings. This is what makes a future stress-bearing source a drop-in.
   */
  it('treats an allophone as a plain substitution', () => {
    const result = evaluatePronunciation({
      targetPhonemes: ['w', 'ɑ', 'ɾ', 'ɚ'], // narrow: American flap
      spokenPhonemes: ['w', 'ɑ', 't', 'ɚ'], // released /t/
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.metrics.substitutionCount).toBe(1);
    expect(result.score).toBe(75);
  });

  it('handles an empty target without dividing by zero', () => {
    const result = evaluatePronunciation({
      targetPhonemes: [],
      spokenPhonemes: [],
      matchLevel: 'Close',
      thresholds: THRESHOLDS,
    });

    expect(result.metrics.per).toBe(0);
    expect(result.score).toBe(100);
  });
});
