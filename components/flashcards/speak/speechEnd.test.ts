import { describe, expect, it } from 'vitest';
import { createSpeechEndDetector } from './speechEnd';

const FRAME = 30;

// Each segment is [rms, milliseconds]; returns the first event and when it fired.
const run = (segments: Array<[number, number]>) => {
  const detector = createSpeechEndDetector();
  let at = 0;
  for (const [rms, ms] of segments) {
    for (let t = 0; t < ms; t += FRAME) {
      const event = detector.push(rms, at);
      if (event) return { event, at };
      at += FRAME;
    }
  }
  return { event: null, at };
};

describe('createSpeechEndDetector', () => {
  it('ends about a second after a word in a quiet room', () => {
    const result = run([
      [0.002, 300],
      [0.1, 500],
      [0.002, 2000],
    ]);
    expect(result.event).toBe('ended');
    expect(result.at).toBeGreaterThanOrEqual(800 + 1000 - FRAME);
    expect(result.at).toBeLessThan(800 + 1100);
  });

  it('waits through a pause between syllables', () => {
    const result = run([
      [0.002, 300],
      [0.1, 300],
      [0.002, 700],
      [0.1, 300],
      [0.002, 2000],
    ]);
    expect(result.event).toBe('ended');
    expect(result.at).toBeGreaterThanOrEqual(1600 + 1000 - FRAME);
  });

  it('ends over steady classroom noise once the voice drops back to it', () => {
    const result = run([
      [0.03, 300],
      [0.15, 600],
      [0.03, 2000],
    ]);
    expect(result.event).toBe('ended');
    expect(result.at).toBeLessThan(900 + 1100);
  });

  it('counts a word spoken right at the tap, before the room was measured', () => {
    const result = run([
      [0.12, 400],
      [0.002, 2000],
    ]);
    expect(result.event).toBe('ended');
    expect(result.at).toBeLessThan(400 + 1100);
  });

  it('ignores a key click and gives up after five seconds of nothing', () => {
    const result = run([
      [0.3, 30],
      [0.002, 6000],
    ]);
    expect(result.event).toBe('no-speech');
    expect(result.at).toBeGreaterThanOrEqual(5000);
    expect(result.at).toBeLessThan(5100);
  });

  it('does not treat a just-opened mic of exact zeros as the room level', () => {
    const result = run([
      [0, 150],
      [0.03, 300],
      [0.15, 500],
      [0.03, 2000],
    ]);
    expect(result.event).toBe('ended');
    expect(result.at).toBeLessThan(950 + 1100);
  });

  it('ends over classroom noise even when the mic fades in quietly', () => {
    const result = run([
      [0.0005, 150],
      [0.03, 300],
      [0.15, 500],
      [0.03, 2000],
    ]);
    expect(result.event).toBe('ended');
    expect(result.at).toBeLessThan(950 + 1100);
  });

  it('leaves an all-zero take (a suspended audio context) to the time limit', () => {
    expect(run([[0, 7000]]).event).toBeNull();
  });

  it('does not let one loud frame after a long timer gap count as speech', () => {
    const detector = createSpeechEndDetector();
    detector.push(0.002, 0);
    detector.push(0.3, 1000);
    let event = null;
    for (let at = 1030; at < 6100 && !event; at += 30)
      event = detector.push(0.002, at);
    expect(event).toBe('no-speech');
  });

  it('keeps listening while the student is still speaking', () => {
    expect(run([[0.1, 4000]]).event).toBeNull();
  });
});
