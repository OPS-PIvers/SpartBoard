import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLIDE_MS, SETTLE_QUIET_MS, TICK_MS } from './playbackEngine';
import { useStepRhythm, type RhythmPhase } from './useStepRhythm';

const A = { x: 10, y: 10, width: 40, height: 20 };
const B = { x: 200, y: 120, width: 60, height: 24 };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// Stepped, so each phase's timer, set by an effect, gets its turn.
const pass = async (ms: number) => {
  for (let t = 0; t < ms; t += 20)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
};

type Props = {
  stepKey: string;
  rect: typeof A | null;
  actedChange?: boolean;
  reducedMotion?: boolean;
  enabled?: boolean;
  gone?: boolean;
};

const setUp = (initial: Props) => {
  const phases: RhythmPhase[] = [];
  const hook = renderHook(
    ({
      stepKey,
      rect,
      actedChange = false,
      reducedMotion = false,
      enabled = true,
      gone = false,
    }: Props) =>
      useStepRhythm({
        enabled,
        reducedMotion,
        stepKey,
        rect,
        actedChange,
        near: () => null,
        onPhase: (p) => phases.push(p),
        finishedGone: () => gone,
      }),
    { initialProps: initial }
  );
  return { ...hook, phases };
};

describe('useStepRhythm', () => {
  it('does nothing when off', () => {
    const { result, rerender } = setUp({
      stepKey: '1',
      rect: A,
      enabled: false,
    });
    rerender({ stepKey: '2', rect: B, enabled: false, actedChange: true });
    expect(result.current).toMatchObject({
      rect: B,
      tick: false,
      tipShown: true,
      phase: 'ready',
    });
  });

  it('on a web step change after an action: holds the finished ring, settles, ticks, glides, then shows the tip', async () => {
    const { result, rerender, phases } = setUp({ stepKey: '1', rect: A });
    rerender({ stepKey: '2', rect: B, actedChange: true });
    expect(result.current.rect).toEqual(A);
    expect(result.current.tipShown).toBe(false);
    await pass(SETTLE_QUIET_MS + 20);
    expect(result.current.tick).toBe(true);
    expect(result.current.rect).toEqual(A);
    await pass(TICK_MS);
    expect(result.current.phase).toBe('glide');
    expect(result.current.rect).toEqual(B);
    expect(result.current.tipShown).toBe(false);
    await pass(GLIDE_MS);
    expect(result.current.tipShown).toBe(true);
    expect(phases).toEqual(['ready', 'settle', 'tick', 'glide', 'ready']);
  });

  it('keeps settle to tip at about half a second, never instant', async () => {
    const { result, rerender } = setUp({ stepKey: '1', rect: A });
    rerender({ stepKey: '2', rect: B, actedChange: true });
    await pass(SETTLE_QUIET_MS + 20);
    expect(result.current.phase).toBe('tick');
    let shownAfter = 0;
    while (!result.current.tipShown && shownAfter < 2000) {
      await pass(20);
      shownAfter += 20;
    }
    expect(shownAfter).toBeGreaterThanOrEqual(TICK_MS + GLIDE_MS - 40);
    expect(shownAfter).toBeLessThanOrEqual(TICK_MS + GLIDE_MS + 60);
  });

  it('Live: act settles and ticks on the current ring, then advances; the change glides in', async () => {
    const { result, rerender, phases } = setUp({ stepKey: '1', rect: A });
    const advance = vi.fn(() => rerender({ stepKey: '2', rect: B }));
    act(() => result.current.act(() => null, advance));
    expect(result.current.phase).toBe('settle');
    expect(result.current.tipShown).toBe(false);
    await pass(SETTLE_QUIET_MS + 20);
    expect(result.current.tick).toBe(true);
    expect(advance).not.toHaveBeenCalled();
    await pass(TICK_MS);
    expect(advance).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('glide');
    await pass(GLIDE_MS);
    expect(result.current.tipShown).toBe(true);
    expect(phases.filter((p) => p === 'tick')).toHaveLength(1);
  });

  it('under reduced motion keeps the settle wait but has no tick or glide', async () => {
    const { result, rerender, phases } = setUp({
      stepKey: '1',
      rect: A,
      reducedMotion: true,
    });
    rerender({ stepKey: '2', rect: B, actedChange: true, reducedMotion: true });
    expect(result.current.tipShown).toBe(false);
    await pass(SETTLE_QUIET_MS + 40);
    expect(result.current.tipShown).toBe(true);
    expect(result.current.rect).toEqual(B);
    expect(phases).not.toContain('tick');
    expect(phases).not.toContain('glide');
  });

  it('glides with no settle when the step changes another way (Next, Back, catch-up)', async () => {
    const { result, rerender, phases } = setUp({ stepKey: '1', rect: A });
    rerender({ stepKey: '2', rect: B });
    expect(result.current.phase).toBe('glide');
    expect(result.current.rect).toEqual(B);
    await pass(GLIDE_MS);
    expect(result.current.tipShown).toBe(true);
    expect(phases).not.toContain('settle');
  });

  it('holds the finished ring while the next target is still being found', async () => {
    const { result, rerender } = setUp({ stepKey: '1', rect: A });
    rerender({ stepKey: '2', rect: null });
    expect(result.current.rect).toEqual(A);
    await pass(100);
    rerender({ stepKey: '2', rect: B });
    expect(result.current.rect).toEqual(B);
    expect(result.current.tipShown).toBe(false);
    await pass(GLIDE_MS);
    expect(result.current.tipShown).toBe(true);
  });

  it('holds no ring and draws no tick when the finished control left the page', async () => {
    const { result, rerender, phases } = setUp({ stepKey: '1', rect: A });
    rerender({ stepKey: '2', rect: B, actedChange: true, gone: true });
    await pass(20);
    expect(result.current.rect).toBeNull();
    await pass(SETTLE_QUIET_MS + 20);
    expect(phases).not.toContain('tick');
    expect(result.current.rect).toEqual(B);
    await pass(GLIDE_MS);
    expect(result.current.tipShown).toBe(true);
  });
});
