import { describe, expect, it } from 'vitest';
import {
  CALLOUT_IN_MS,
  SLIDE_MS,
  ZOOM_MS,
  cursorMs,
  motionMs,
  readingTimeS,
  stepDurationMs,
} from './motion';

const normal = { speed: 1, reducedMotion: false };

describe('motionMs', () => {
  it('divides the base durations by learner speed', () => {
    expect(motionMs(ZOOM_MS, normal)).toBe(900);
    expect(motionMs(ZOOM_MS, { speed: 0.5, reducedMotion: false })).toBe(1800);
    expect(motionMs(ZOOM_MS, { speed: 1.5, reducedMotion: false })).toBe(600);
    expect(motionMs(CALLOUT_IN_MS, { speed: 0.5, reducedMotion: false })).toBe(
      560
    );
  });

  it('gives 0ms for every duration under reduced motion', () => {
    const reduced = { speed: 0.5, reducedMotion: true };
    expect(motionMs(ZOOM_MS, reduced)).toBe(0);
    expect(motionMs(CALLOUT_IN_MS, reduced)).toBe(0);
    expect(motionMs(SLIDE_MS, reduced)).toBe(0);
    expect(cursorMs(400, reduced)).toBe(0);
  });

  it('treats a non-positive speed as 1x', () => {
    expect(motionMs(ZOOM_MS, { speed: 0, reducedMotion: false })).toBe(900);
  });
});

describe('cursorMs', () => {
  it('clamps 250 + 0.9 × distance to 600–1100ms', () => {
    expect(cursorMs(0, normal)).toBe(600);
    expect(cursorMs(500, normal)).toBe(700);
    expect(cursorMs(5000, normal)).toBe(1100);
    expect(cursorMs(500, { speed: 0.5, reducedMotion: false })).toBe(1400);
  });
});

describe('readingTimeS', () => {
  it('reads 180 words a minute plus a 1.5s pad', () => {
    expect(readingTimeS('')).toBe(1.5);
    expect(readingTimeS(Array(180).fill('word').join(' '))).toBeCloseTo(61.5);
    expect(readingTimeS('  three   spaced words ')).toBeCloseTo(2.5);
  });
});

describe('stepDurationMs', () => {
  it('keeps today’s timing when player v2 is off', () => {
    expect(stepDurationMs({ text: 'a b c' })).toBe(5000);
    expect(stepDurationMs({ autoAdvanceDuration: 10 })).toBe(10000);
    expect(stepDurationMs({ autoAdvanceDuration: 0 })).toBe(0);
    expect(
      stepDurationMs(
        { autoAdvanceDuration: 10 },
        { timeMultiplier: 2, speed: 0.5, watchPace: 'calm' }
      )
    ).toBe(20000);
    expect(stepDurationMs({ text: 'x' }, { timeMultiplier: 'unlimited' })).toBe(
      0
    );
  });

  it('uses reading time with a 3s floor under v2', () => {
    const v2 = { playerV2: true };
    // 3 words → 1s + 1.5s = 2.5s, floored to 3s.
    expect(stepDurationMs({ text: 'one two three' }, v2)).toBe(3000);
    // 36 words (label + text) → 12s + 1.5s.
    expect(
      stepDurationMs(
        {
          label: Array(6).fill('w').join(' '),
          text: Array(30).fill('w').join(' '),
        },
        v2
      )
    ).toBe(13500);
    expect(stepDurationMs({ autoAdvanceDuration: 1, text: 'x' }, v2)).toBe(
      3000
    );
    expect(stepDurationMs({ autoAdvanceDuration: 8 }, v2)).toBe(8000);
  });

  it('keeps 0 as "wait for Next" under v2', () => {
    expect(stepDurationMs({ autoAdvanceDuration: 0 }, { playerV2: true })).toBe(
      0
    );
  });

  it('multiplies by timeMultiplier, divides by speed and stretches calm pace', () => {
    const step = { autoAdvanceDuration: 10 };
    expect(stepDurationMs(step, { playerV2: true, timeMultiplier: 1.5 })).toBe(
      15000
    );
    expect(stepDurationMs(step, { playerV2: true, speed: 0.5 })).toBe(20000);
    expect(stepDurationMs(step, { playerV2: true, speed: 1.5 })).toBe(6667);
    expect(stepDurationMs(step, { playerV2: true, watchPace: 'calm' })).toBe(
      13000
    );
    expect(
      stepDurationMs(step, {
        playerV2: true,
        timeMultiplier: 2,
        speed: 0.5,
        watchPace: 'calm',
      })
    ).toBe(52000);
    expect(
      stepDurationMs(step, { playerV2: true, timeMultiplier: 'unlimited' })
    ).toBe(0);
  });
});
