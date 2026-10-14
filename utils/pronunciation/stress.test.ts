import { describe, expect, it } from 'vitest';
import vocab from './xlsr53EspeakVocab.json';
import nucleiData from './xlsr53Nuclei.json';
import { evaluatePronunciation } from './score';
import type { CtcToken } from './ctcDecode';
import {
  countSyllables,
  detectStress,
  extractNuclei,
  isNucleus,
  mapToTargetSyllable,
  measureNuclei,
  prominenceScores,
  REDUCED_VOWELS,
  SAMPLES_PER_FRAME,
  type StressDetectorConfig,
} from './stress';

const CONFIG: StressDetectorConfig = {
  cueWeights: { duration: 1, energy: 1, pitch: 1 },
  minProminenceMargin: 0.15,
  language: 'es',
};

/** Times each symbol at the given frame lengths, back to back. */
function timed(symbols: string[], lengths: number[]): CtcToken[] {
  let frame = 0;
  return symbols.map((symbol, i) => {
    const startFrame = frame;
    frame += lengths[i] ?? 2;
    return { symbol, startFrame, endFrame: frame };
  });
}

const align = (target: string[], spoken: string[]) =>
  evaluatePronunciation({
    targetPhonemes: target,
    spokenPhonemes: spoken,
    matchLevel: 'x',
    thresholds: { x: 0 },
  }).alignment;

describe('nucleus set (S2)', () => {
  it('is the committed 244-token set, all of them vocabulary tokens', () => {
    expect(nucleiData.nuclei).toHaveLength(244);
    for (const t of nucleiData.nuclei) expect(vocab).toHaveProperty(t);
  });

  it('counts syllabic consonants, glide syllables, ɚ and ᵻ, and one per diphthong', () => {
    expect(countSyllables(['v', 'aː', 'ɡ', 'n̩'])).toBe(2);
    expect(isNucleus('ja') && isNucleus('ju')).toBe(true);
    expect(countSyllables(['b', 'ɛ', 'ɾ', 'ɚ'])).toBe(2);
    expect(isNucleus('ᵻ')).toBe(true);
    expect(countSyllables(['t', 'aɪ', 'm'])).toBe(1);
    expect(isNucleus('ɫ') || isNucleus('ʲ') || isNucleus('p')).toBe(false);
  });

  it('lists only emittable reduced vowels and keeps the KIT vowel out', () => {
    for (const v of REDUCED_VOWELS) expect(vocab).toHaveProperty(v);
    expect(REDUCED_VOWELS.has('ɪ')).toBe(false);
  });
});

describe('extractNuclei', () => {
  it('folds a held vowel into the nucleus it repeats', () => {
    const spoken = ['p', 'e', 'e', 'r', 'o'];
    const nuclei = extractNuclei(
      timed(spoken, [2, 3, 4, 2, 3]),
      align(['p', 'e', 'r', 'o'], spoken)
    );
    expect(nuclei.map((n) => [n.symbol, n.startFrame, n.endFrame])).toEqual([
      ['e', 2, 9],
      ['o', 11, 14],
    ]);
  });

  it('keeps a doubled vowel the reference also doubles as two syllables', () => {
    const word = ['eː', 'eː', 'm', 'a', 'n'];
    expect(extractNuclei(timed(word, []), align(word, word))).toHaveLength(3);
  });
});

describe('S3 — mapping onto the target syllable', () => {
  const target = ['p', 'e', 'r', 'o'];

  it('maps through an extra syllable to the target one', () => {
    const spoken = ['p', 'e', 'a', 'r', 'o'];
    const alignment = align(target, spoken);
    const nuclei = extractNuclei(timed(spoken, []), alignment);
    expect(
      nuclei.map((n) => mapToTargetSyllable(n, alignment, target))
    ).toEqual([1, null, 2]);
  });

  it('S3b — a vowel substituted over the first consonant maps nowhere', () => {
    const spoken = ['a', 'e', 'r', 'o'];
    const alignment = align(target, spoken);
    const [first] = extractNuclei(timed(spoken, []), alignment);
    expect(mapToTargetSyllable(first, alignment, target)).toBeNull();
  });
});

describe('S4 — cues are relative within the word', () => {
  const spoken = ['p', 'e', 'r', 'o'];
  const nuclei = extractNuclei(timed(spoken, [2, 6, 2, 3]));

  it('ranks the longer, louder, higher syllable first', () => {
    const scores = prominenceScores(
      nuclei,
      [
        { energy: 4, f0Hz: 220 },
        { energy: 1, f0Hz: 180 },
      ],
      CONFIG
    );
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });

  it('is unchanged by recording level', () => {
    const quiet = prominenceScores(
      nuclei,
      [
        { energy: 4, f0Hz: 220 },
        { energy: 1, f0Hz: 180 },
      ],
      CONFIG
    );
    const loud = prominenceScores(
      nuclei,
      [
        { energy: 400, f0Hz: 220 },
        { energy: 100, f0Hz: 180 },
      ],
      CONFIG
    );
    expect(loud).toEqual(quiet);
  });

  it('applies the reduced-vowel cue to English only', () => {
    const en = extractNuclei(timed(['ə', 'b', 'aʊ', 't'], [6, 2, 2, 2]));
    const m = [
      { energy: 4, f0Hz: null },
      { energy: 1, f0Hz: null },
    ];
    expect(prominenceScores(en, m, { ...CONFIG, language: 'en' })[0]).toBe(0);
    expect(prominenceScores(en, m, CONFIG)[0]).toBeGreaterThan(0);
  });

  it('drops pitch when any nucleus is untracked instead of scoring it zero', () => {
    const scores = prominenceScores(
      nuclei,
      [
        { energy: 4, f0Hz: null },
        { energy: 1, f0Hz: 300 },
      ],
      CONFIG
    );
    expect(scores).toEqual([1, 0]);
  });
});

describe('S5 — absence is null, never an empty detected value', () => {
  const target = ['p', 'e', 'r', 'o'];
  const alignment = align(target, target);
  const nuclei = extractNuclei(timed(target, [2, 6, 2, 3]), alignment);
  const clear = [
    { energy: 4, f0Hz: 220 },
    { energy: 1, f0Hz: 180 },
  ];
  const base = { nuclei, alignment, targetPhonemes: target, config: CONFIG };

  it('reports the prominent target syllable', () => {
    expect(
      detectStress({ ...base, measurements: clear, accepted: [1] })
    ).toEqual({
      detected: 1,
      accepted: [1],
    });
  });

  it('reports nothing when too close to call, unmeasured, or with no accepted reference', () => {
    const even = extractNuclei(timed(target, [2, 3, 2, 3]), alignment);
    const tie = [
      { energy: 1, f0Hz: 200 },
      { energy: 1, f0Hz: 200 },
    ];
    expect(
      detectStress({ ...base, nuclei: even, measurements: tie, accepted: [1] })
    ).toBeNull();
    expect(
      detectStress({ ...base, measurements: [clear[0]], accepted: [1] })
    ).toBeNull();
    expect(
      detectStress({ ...base, nuclei: [], measurements: [], accepted: [1] })
    ).toBeNull();
    expect(
      detectStress({ ...base, measurements: clear, accepted: [] })
    ).toBeNull();
  });
});

describe('measureNuclei', () => {
  it('reads energy and pitch from the nucleus frames, and no pitch from silence', () => {
    const sampleRate = 16000;
    const audio = new Float32Array(SAMPLES_PER_FRAME * 30);
    for (let i = SAMPLES_PER_FRAME * 2; i < SAMPLES_PER_FRAME * 12; i++)
      audio[i] = 0.5 * Math.sin((2 * Math.PI * 200 * i) / sampleRate);
    const nuclei = [
      { phonemeIndex: 0, symbol: 'a', startFrame: 2, endFrame: 12 },
      { phonemeIndex: 1, symbol: 'o', startFrame: 20, endFrame: 28 },
    ];
    const [voiced, silent] = measureNuclei(audio, nuclei, sampleRate);
    expect(voiced.f0Hz).toBeCloseTo(200, -1);
    expect(voiced.energy).toBeCloseTo(0.125, 2);
    expect(silent).toEqual({ energy: 0, f0Hz: null });
  });
});
