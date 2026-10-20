import { describe, expect, it } from 'vitest';
import { meanNonBlankConfidence, measureVoicedMs } from './recognizerCore';

describe('meanNonBlankConfidence', () => {
  it('averages the softmax peak over non-blank frames only', () => {
    // 3 frames × 2 symbols; id 0 is blank. Frame 0 is blank, frames 1-2 pick id 1.
    const logits = Float32Array.from([5, 0, 0, Math.log(3), -1, 0]);
    const c = meanNonBlankConfidence(logits, 3, 2, 0);
    expect(c).toBeCloseTo((0.75 + 1 / (1 + Math.exp(-1))) / 2, 6);
  });

  it('is 0 when every frame is blank', () => {
    expect(
      meanNonBlankConfidence(Float32Array.from([1, 0, 1, 0]), 2, 2, 0)
    ).toBe(0);
  });
});

describe('measureVoicedMs', () => {
  it('counts loud frames, not the padding around them', () => {
    const audio = new Float32Array(16000);
    for (let i = 4000; i < 8000; i++) audio[i] = 0.2 * Math.sin(i / 4);
    // 4000 samples straddle 13 frames of 320.
    expect(measureVoicedMs(audio)).toBe(260);
  });

  it('is 0 for digital silence and near-silent hiss', () => {
    expect(measureVoicedMs(new Float32Array(16000))).toBe(0);
    const hiss = Float32Array.from(
      { length: 16000 },
      (_, i) => 0.0002 * Math.sin(i)
    );
    expect(measureVoicedMs(hiss)).toBe(0);
  });
});
