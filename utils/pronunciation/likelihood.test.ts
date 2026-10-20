import { describe, expect, it } from 'vitest';
import { PRONUNCIATION_GROUPS } from '@/config/pronunciationGroups';
import { SCORING_CANDIDATES, SWAP_CUTOFF } from '@/config/pronunciationScoring';
import { PRONUNCIATION_VARIANTS } from '@/config/pronunciationVariants';
import vocab from './xlsr53EspeakVocab.json';
import {
  ctcLogLikelihood,
  decideSounds,
  logSoftmax,
  nativeVariants,
  scoreReference,
  type SoundReading,
  type SpeakLogProbs,
} from './likelihood';

const VOCAB: Record<string, number> = vocab;
const V = Object.keys(VOCAB).length;

// Seeded so a failure reproduces.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function randomLogProbs(frames: number, seed: number): SpeakLogProbs {
  const next = rng(seed);
  const logits = Float32Array.from({ length: frames * V }, () => next() * 6);
  return { data: logSoftmax(logits, frames, V), frames, vocabSize: V };
}

// The prototype's plain forward pass, recomputed from scratch for every sequence.
function naiveCtc(lp: SpeakLogProbs, tokens: string[]): number {
  const lse = (a: number, b: number) =>
    a === -Infinity
      ? b
      : b === -Infinity
        ? a
        : Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b)));
  const ext = [0];
  for (const t of tokens) ext.push(VOCAB[t], 0);
  const S = ext.length;
  let a = new Array<number>(S).fill(-Infinity);
  a[0] = lp.data[ext[0]];
  if (S > 1) a[1] = lp.data[ext[1]];
  for (let t = 1; t < lp.frames; t++) {
    const b = new Array<number>(S).fill(-Infinity);
    for (let s = 0; s < S; s++) {
      let v = a[s];
      if (s > 0) v = lse(v, a[s - 1]);
      if (s > 1 && ext[s] !== 0 && ext[s] !== ext[s - 2]) v = lse(v, a[s - 2]);
      if (v > -Infinity) b[s] = v + lp.data[t * V + ext[s]];
    }
    a = b;
  }
  return S > 1 ? lse(a[S - 1], a[S - 2]) : a[0];
}

/** Log-probs whose frames each strongly favour one symbol, '-' for the blank. */
function spokenAs(frames: string[], sharp = 8): SpeakLogProbs {
  const logits = new Float32Array(frames.length * V);
  frames.forEach((f, t) => {
    logits[t * V + (f === '-' ? 0 : VOCAB[f])] = sharp;
  });
  return {
    data: logSoftmax(logits, frames.length, V),
    frames: frames.length,
    vocabSize: V,
  };
}

describe('logSoftmax', () => {
  it('normalises every frame', () => {
    const lp = randomLogProbs(3, 1);
    for (let t = 0; t < 3; t++) {
      let sum = 0;
      for (let k = 0; k < V; k++) sum += Math.exp(lp.data[t * V + k]);
      expect(sum).toBeCloseTo(1, 4);
    }
  });
});

describe('CTC scores', () => {
  it('matches the plain forward pass, repeated tokens included', () => {
    const lp = randomLogProbs(12, 7);
    for (const tokens of [['a'], ['p', 'e', 'r', 'o'], ['l', 'l', 'a']]) {
      expect(ctcLogLikelihood(lp, tokens)).toBeCloseTo(naiveCtc(lp, tokens), 6);
    }
  });

  it('gives every swap and drop the same lead a full recomputation gives', () => {
    const lp = randomLogProbs(14, 3);
    const ref = ['p', 'e', 'r', 'o'];
    const candidates = ['p', 'e', 'r', 'o', 'a', 'ɾ'];
    const readings = scoreReference(lp, ref, candidates);
    expect(readings).not.toBeNull();
    const base = naiveCtc(lp, ref);
    readings?.forEach((sound, i) => {
      // Five other candidates plus the drop.
      expect(sound).toHaveLength(6);
      for (const r of sound) {
        const changed =
          r.spoken === null
            ? [...ref.slice(0, i), ...ref.slice(i + 1)]
            : [...ref.slice(0, i), r.spoken, ...ref.slice(i + 1)];
        expect(r.lead).toBeCloseTo(naiveCtc(lp, changed) - base, 6);
      }
    });
  });

  it('never drops the only sound of a one-sound word', () => {
    const readings = scoreReference(randomLogProbs(6, 2), ['a'], ['a', 'e']);
    expect(readings?.[0].map((r) => r.spoken)).toEqual(['e']);
  });

  it('returns null when the take has too few frames to spell the reference', () => {
    expect(scoreReference(randomLogProbs(1, 4), ['l', 'l'], ['a'])).toBeNull();
  });

  it('returns null for a token outside the vocabulary or an empty take', () => {
    expect(scoreReference(randomLogProbs(4, 1), ['☃'], ['a'])).toBeNull();
    expect(
      scoreReference(
        { data: new Float32Array(0), frames: 0, vocabSize: V },
        ['a'],
        ['e']
      )
    ).toBeNull();
  });

  it('scores a clear take of the word as correct and a clear swap as wrong', () => {
    const lp = spokenAs(['-', 'o', 'o', '-', 'l', '-', 'e', 'e', '-']);
    const readings = scoreReference(lp, ['o', 'l', 'a'], ['o', 'l', 'a', 'e']);
    const a = readings?.[2].find((r) => r.spoken === 'e');
    expect(a?.lead).toBeGreaterThan(SWAP_CUTOFF);
    const o = readings?.[0].find((r) => r.spoken === 'a');
    expect(o?.lead).toBeLessThan(0);
  });
});

const reading = (spoken: string | null, lead: number): SoundReading => ({
  spoken,
  lead,
});
const NONE = new Set<string>();
const LENIENT = { 'es-trill': 'require', 'es-soft-bdg': 'forgive' } as const;

describe('decideSounds', () => {
  it('keeps a sound no alternative beats by the swap cut-off', () => {
    const [e] = decideSounds(['a'], [[reading('e', 3.4)]], 'es', LENIENT, NONE);
    expect(e).toMatchObject({ status: 'correct', spokenIPA: 'a' });
  });

  it('marks the likeliest alternative past the cut-off, or a drop', () => {
    const entries = decideSounds(
      ['p', 'a'],
      [
        [reading('b', 1), reading('t', 4)],
        [reading('e', 2), reading(null, 9)],
      ],
      'es',
      LENIENT,
      NONE
    );
    expect(entries).toEqual([
      { position: 1, targetIPA: 'p', spokenIPA: 't', status: 'substituted' },
      { position: 2, targetIPA: 'a', spokenIPA: null, status: 'omitted' },
    ]);
  });

  it('never counts a native variant', () => {
    const [e] = decideSounds(
      ['e'],
      [[reading('eː', 8), reading('a', 1)]],
      'es',
      LENIENT,
      new Set(['e>eː'])
    );
    expect(e.status).toBe('correct');
  });

  it('catches a required group partner at its own lower cut-off', () => {
    const [e] = decideSounds(['r'], [[reading('ɾ', 1.5)]], 'es', LENIENT, NONE);
    expect(e).toMatchObject({ status: 'substituted', spokenIPA: 'ɾ' });
    const [kept] = decideSounds(
      ['r'],
      [[reading('ɾ', 0.9)]],
      'es',
      LENIENT,
      NONE
    );
    expect(kept.status).toBe('correct');
  });

  it('reads a slightly less likely forgiven partner as that partner', () => {
    const [e] = decideSounds(
      ['β'],
      [[reading('b', -0.5)]],
      'es',
      LENIENT,
      NONE
    );
    expect(e).toMatchObject({ status: 'substituted', spokenIPA: 'b' });
  });

  it('prefers a tolerated or forgiven reading within the window over a wrong one', () => {
    const [e] = decideSounds(
      ['ɾ'],
      [[reading('l', 6), reading('r', 2)]],
      'es',
      LENIENT,
      NONE
    );
    // ɾ heard as r is tolerated in Spanish.
    expect(e).toMatchObject({ status: 'substituted', spokenIPA: 'r' });
    const [far] = decideSounds(
      ['ɾ'],
      [[reading('l', 9), reading('r', 2)]],
      'es',
      LENIENT,
      NONE
    );
    expect(far.spokenIPA).toBe('l');
  });
});

describe('scorer config', () => {
  it('only tries sounds the model can emit', () => {
    for (const list of Object.values(SCORING_CANDIDATES)) {
      for (const t of list) expect(VOCAB[t], t).toBeDefined();
    }
  });

  it('never treats a sound-group pair as a native variant', () => {
    for (const [language, groups] of Object.entries(PRONUNCIATION_GROUPS)) {
      const set = nativeVariants(language as keyof typeof PRONUNCIATION_GROUPS);
      for (const g of groups)
        for (const p of g.pairs)
          expect(set.has(`${p.target}>${p.spoken}`)).toBe(false);
    }
    expect(Object.keys(PRONUNCIATION_VARIANTS).sort()).toEqual([
      'de',
      'en',
      'es',
    ]);
  });
});
