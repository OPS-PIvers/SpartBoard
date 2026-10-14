import { describe, expect, it } from 'vitest';
import vocab from './xlsr53EspeakVocab.json';
import { greedyCtcDecode, invertVocab } from './ctcDecode';
import { normalizeForWav2Vec2, trimSilence } from './audio';

function logitsFor(ids: number[], vocabSize: number): Float32Array {
  const out = new Float32Array(ids.length * vocabSize);
  ids.forEach((id, f) => {
    out[f * vocabSize + id] = 5;
  });
  return out;
}

describe('greedyCtcDecode', () => {
  const symbols = invertVocab(vocab);
  const id = (s: string) => (vocab as Record<string, number>)[s];

  it('inverts the 392-token vocab with the three distinct rhotics', () => {
    expect(symbols).toHaveLength(392);
    expect([id('ɹ'), id('ɾ'), id('r')]).toEqual([27, 15, 31]);
  });

  it('merges repeated frames, drops <pad>, and keeps frame spans', () => {
    const p = id('p');
    const e = id('e');
    const r = id('ɹ');
    const o = id('o');
    const frames = [0, p, p, 0, e, e, e, r, 0, 0, o, 0];
    const result = greedyCtcDecode(
      logitsFor(frames, 392),
      frames.length,
      392,
      symbols,
      0
    );
    expect(result.text).toBe('peɹo');
    expect(result.tokens[1]).toEqual({
      symbol: 'e',
      startFrame: 4,
      endFrame: 7,
    });
  });

  it('keeps a token repeated across a pad as two tokens (held trill → rr)', () => {
    const r = id('r');
    const frames = [r, r, 0, r];
    expect(
      greedyCtcDecode(logitsFor(frames, 392), 4, 392, symbols, 0).text
    ).toBe('rr');
  });

  it('throws when the logits are shorter than frames × vocab', () => {
    expect(() =>
      greedyCtcDecode(new Float32Array(10), 2, 392, symbols, 0)
    ).toThrow();
  });
});

describe('trimSilence', () => {
  it('cuts leading and trailing silence but keeps 200 ms of padding', () => {
    const audio = new Float32Array(16000 * 3);
    for (let i = 16000; i < 16000 * 1.5; i++) audio[i] = Math.sin(i / 5) * 0.5;
    const out = trimSilence(audio);
    expect(out.length / 16000).toBeCloseTo(0.9, 1);
  });

  it('returns all-silent audio unchanged', () => {
    const audio = new Float32Array(16000);
    expect(trimSilence(audio)).toBe(audio);
  });
});

describe('normalizeForWav2Vec2', () => {
  it('returns zero mean and unit variance', () => {
    const out = normalizeForWav2Vec2(Float32Array.from([1, 2, 3, 4]));
    const mean = out.reduce((a, b) => a + b, 0) / out.length;
    const variance = out.reduce((a, b) => a + (b - mean) ** 2, 0) / out.length;
    expect(mean).toBeCloseTo(0, 6);
    expect(variance).toBeCloseTo(1, 4);
  });
});
