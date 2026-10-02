import { describe, expect, it } from 'vitest';
import {
  STAGE_FADE_MS,
  STAGE_MOVE_MS,
  STAGE_STAGGER_MS,
  awayTransform,
  leaveFrames,
  stageClearMs,
  staggerDelay,
} from './stageTransition';

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

describe('stage transition timing', () => {
  it('spreads starts evenly so the last widget starts STAGE_STAGGER_MS in', () => {
    expect([0, 1, 2].map((i) => staggerDelay(i, 3))).toEqual([
      0,
      STAGE_STAGGER_MS / 2,
      STAGE_STAGGER_MS,
    ]);
    expect(staggerDelay(0, 1)).toBe(0);
  });

  it('finishes in about 350ms, or one short fade under reduced motion', () => {
    expect(stageClearMs(5, false)).toBe(STAGE_MOVE_MS + STAGE_STAGGER_MS);
    expect(stageClearMs(1, false)).toBe(STAGE_MOVE_MS);
    expect(stageClearMs(5, true)).toBe(STAGE_FADE_MS);
    expect(stageClearMs(0, false)).toBe(0);
  });
});

describe('awayTransform', () => {
  it('moves the widget centre onto the dock item centre and shrinks it', () => {
    expect(awayTransform(rect(0, 0, 200, 100), rect(300, 400, 40, 40))).toBe(
      'translate(220px, 370px) scale(0.12)'
    );
  });

  it('only shrinks a little when there is no dock to head for', () => {
    expect(awayTransform(rect(0, 0, 200, 100), null)).toBe('scale(0.9)');
  });

  it('keeps reduced motion to a plain fade', () => {
    const [from, to] = leaveFrames('translate(1px, 1px) scale(0.12)', true);
    expect(from).toEqual({ opacity: 1, transform: 'none' });
    expect(to).toEqual({ opacity: 0, transform: 'none' });
  });
});
