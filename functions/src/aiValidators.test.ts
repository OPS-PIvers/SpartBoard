import { describe, it, expect } from 'vitest';
import {
  validateAndBucketVideoQuestions,
  validateAndBucketQuizQuestions,
} from './index';

// ──────────────────────────────────────────────────────────────────────────
// Video-activity validator
// ──────────────────────────────────────────────────────────────────────────

const baseVideoQ = (overrides: Record<string, unknown> = {}) => ({
  text: 'What did the speaker emphasize?',
  timestamp: 30,
  type: 'MC',
  correctAnswer: 'Practice',
  incorrectAnswers: ['Speed', 'Volume', 'Memorization'],
  timeLimit: 30,
  ...overrides,
});

describe('validateAndBucketVideoQuestions', () => {
  it('returns [] for non-array input', () => {
    expect(
      validateAndBucketVideoQuestions(null, { MC: 1, FIB: 0, MA: 0 }, 100)
    ).toEqual([]);
  });

  it('drops timestamps beyond durationSeconds', () => {
    const raw = [
      baseVideoQ({ timestamp: 50 }),
      baseVideoQ({ timestamp: 161 }), // out of range
    ];
    const out = validateAndBucketVideoQuestions(
      raw,
      { MC: 5, FIB: 0, MA: 0 },
      160
    );
    expect(out).toHaveLength(1);
    expect(out[0].timestamp).toBe(50);
  });

  it('accepts timestamp === durationSeconds (inclusive boundary)', () => {
    const out = validateAndBucketVideoQuestions(
      [baseVideoQ({ timestamp: 160 })],
      { MC: 1, FIB: 0, MA: 0 },
      160
    );
    expect(out).toHaveLength(1);
  });

  it('drops negative timestamps', () => {
    const out = validateAndBucketVideoQuestions(
      [baseVideoQ({ timestamp: -5 })],
      { MC: 1, FIB: 0, MA: 0 },
      160
    );
    expect(out).toEqual([]);
  });

  it('treats unknown type as a drop, not a fallback', () => {
    const out = validateAndBucketVideoQuestions(
      [baseVideoQ({ type: 'matching' })], // not a video type
      { MC: 1, FIB: 0, MA: 0 },
      160
    );
    expect(out).toEqual([]);
  });

  it('requires MC to have 3 distractors', () => {
    const out = validateAndBucketVideoQuestions(
      [
        baseVideoQ({ incorrectAnswers: ['A', 'B'] }), // 2 — should drop
        baseVideoQ({ incorrectAnswers: ['A', 'B', 'C'], timestamp: 40 }),
      ],
      { MC: 5, FIB: 0, MA: 0 },
      160
    );
    expect(out).toHaveLength(1);
    expect(out[0].timestamp).toBe(40);
  });

  it('FIB clears incorrectAnswers and preserves acceptableVariants', () => {
    const out = validateAndBucketVideoQuestions(
      [
        baseVideoQ({
          type: 'FIB',
          correctAnswer: 'color',
          incorrectAnswers: ['leftover'], // server should strip
          acceptableVariants: ['colour', ''],
        }),
      ],
      { MC: 0, FIB: 1, MA: 0 },
      160
    );
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('FIB');
    expect(out[0].incorrectAnswers).toEqual([]);
    // Empty-string variants are filtered.
    expect(out[0].acceptableVariants).toEqual(['colour']);
  });

  it('MA requires pipe-encoded correctAnswer and ≥2 distractors', () => {
    const accept = validateAndBucketVideoQuestions(
      [
        baseVideoQ({
          type: 'MA',
          correctAnswer: 'opt1|opt2',
          incorrectAnswers: ['x', 'y'],
          timestamp: 20,
        }),
      ],
      { MC: 0, FIB: 0, MA: 1 },
      160
    );
    expect(accept).toHaveLength(1);

    const tooThin = validateAndBucketVideoQuestions(
      [
        baseVideoQ({
          type: 'MA',
          correctAnswer: 'opt1', // only one selection
          incorrectAnswers: ['x', 'y'],
        }),
        baseVideoQ({
          type: 'MA',
          correctAnswer: 'opt1|opt2',
          incorrectAnswers: ['x'], // only one distractor
          timestamp: 50,
        }),
      ],
      { MC: 0, FIB: 0, MA: 5 },
      160
    );
    expect(tooThin).toEqual([]);
  });

  it('trims per-type quotas', () => {
    const out = validateAndBucketVideoQuestions(
      [
        baseVideoQ({ timestamp: 10 }),
        baseVideoQ({ timestamp: 20 }),
        baseVideoQ({ timestamp: 30 }), // over the quota of 2
      ],
      { MC: 2, FIB: 0, MA: 0 },
      160
    );
    expect(out).toHaveLength(2);
    expect(out.map((q) => q.timestamp)).toEqual([10, 20]);
  });

  it('sorts output by timestamp', () => {
    const out = validateAndBucketVideoQuestions(
      [
        baseVideoQ({ timestamp: 50, correctAnswer: 'a' }),
        baseVideoQ({ timestamp: 10, correctAnswer: 'b' }),
        baseVideoQ({ timestamp: 30, correctAnswer: 'c' }),
      ],
      { MC: 5, FIB: 0, MA: 0 },
      160
    );
    expect(out.map((q) => q.timestamp)).toEqual([10, 30, 50]);
  });

  it('treats durationSeconds=undefined as unbounded', () => {
    const out = validateAndBucketVideoQuestions(
      [baseVideoQ({ timestamp: 9999 })],
      { MC: 1, FIB: 0, MA: 0 },
      undefined
    );
    expect(out).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Quiz validator
// ──────────────────────────────────────────────────────────────────────────

const baseQuizQ = (overrides: Record<string, unknown> = {}) => ({
  text: 'Capital of France?',
  type: 'MC',
  correctAnswer: 'Paris',
  incorrectAnswers: ['London', 'Berlin', 'Madrid'],
  timeLimit: 30,
  ...overrides,
});

describe('validateAndBucketQuizQuestions', () => {
  it('returns [] for non-array input', () => {
    expect(
      validateAndBucketQuizQuestions(undefined, {
        MC: 1,
        FIB: 0,
        Matching: 0,
        Ordering: 0,
      })
    ).toEqual([]);
  });

  it("preserves Gemini's original order (does not group by type)", () => {
    const raw = [
      baseQuizQ({ text: 'Q1 (MC)', type: 'MC' }),
      baseQuizQ({
        text: 'Q2 (FIB)',
        type: 'FIB',
        correctAnswer: 'a',
        incorrectAnswers: [],
      }),
      baseQuizQ({ text: 'Q3 (MC)', type: 'MC' }),
      baseQuizQ({
        text: 'Q4 (Matching)',
        type: 'Matching',
        correctAnswer: 'a:1|b:2|c:3',
        incorrectAnswers: [],
      }),
    ];
    const out = validateAndBucketQuizQuestions(raw, {
      MC: 5,
      FIB: 5,
      Matching: 5,
      Ordering: 5,
    });
    expect(out.map((q) => q.text)).toEqual([
      'Q1 (MC)',
      'Q2 (FIB)',
      'Q3 (MC)',
      'Q4 (Matching)',
    ]);
  });

  it('Matching requires ≥3 pairs and rejects pipe-only payloads', () => {
    const out = validateAndBucketQuizQuestions(
      [
        // Ordering-shape mislabeled as Matching: rejected
        baseQuizQ({
          type: 'Matching',
          correctAnswer: 'a|b|c|d',
          incorrectAnswers: [],
        }),
        // Two pairs (≥3 required): rejected
        baseQuizQ({
          type: 'Matching',
          correctAnswer: 'a:1|b:2',
          incorrectAnswers: [],
        }),
        // Valid 3 pairs: accepted
        baseQuizQ({
          type: 'Matching',
          correctAnswer: 'a:1|b:2|c:3',
          incorrectAnswers: [],
        }),
        // Pair missing definition: rejected
        baseQuizQ({
          type: 'Matching',
          correctAnswer: 'a:1|b:|c:3',
          incorrectAnswers: [],
        }),
      ],
      { MC: 0, FIB: 0, Matching: 5, Ordering: 0 }
    );
    expect(out).toHaveLength(1);
    expect(out[0].correctAnswer).toBe('a:1|b:2|c:3');
  });

  it('Ordering requires ≥3 items', () => {
    const out = validateAndBucketQuizQuestions(
      [
        baseQuizQ({
          type: 'Ordering',
          correctAnswer: 'a|b',
          incorrectAnswers: [],
        }),
        baseQuizQ({
          type: 'Ordering',
          correctAnswer: 'a|b|c',
          incorrectAnswers: [],
        }),
      ],
      { MC: 0, FIB: 0, Matching: 0, Ordering: 5 }
    );
    expect(out).toHaveLength(1);
    expect(out[0].correctAnswer).toBe('a|b|c');
  });

  it('MC requires 3 distractors', () => {
    const out = validateAndBucketQuizQuestions(
      [
        baseQuizQ({ incorrectAnswers: ['A', 'B'] }),
        baseQuizQ({ incorrectAnswers: ['A', 'B', 'C'], text: 'kept' }),
      ],
      { MC: 5, FIB: 0, Matching: 0, Ordering: 0 }
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('kept');
  });

  it('clears incorrectAnswers for non-MC types', () => {
    const out = validateAndBucketQuizQuestions(
      [
        baseQuizQ({
          type: 'FIB',
          correctAnswer: 'x',
          incorrectAnswers: ['leftover'],
        }),
      ],
      { MC: 0, FIB: 1, Matching: 0, Ordering: 0 }
    );
    expect(out).toHaveLength(1);
    expect(out[0].incorrectAnswers).toEqual([]);
  });

  it('trims per-type quotas while preserving order', () => {
    const raw = [
      baseQuizQ({ text: 'mc1' }),
      baseQuizQ({ text: 'mc2' }),
      baseQuizQ({ text: 'mc3' }), // over quota
      baseQuizQ({
        text: 'fib1',
        type: 'FIB',
        correctAnswer: 'x',
        incorrectAnswers: [],
      }),
    ];
    const out = validateAndBucketQuizQuestions(raw, {
      MC: 2,
      FIB: 1,
      Matching: 0,
      Ordering: 0,
    });
    expect(out.map((q) => q.text)).toEqual(['mc1', 'mc2', 'fib1']);
  });
});
