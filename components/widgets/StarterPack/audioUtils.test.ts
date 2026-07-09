/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAudioCtx, playCleanUpUnlocked } from './audioUtils';

describe('playCleanUpUnlocked', () => {
  let ctx: any;

  beforeEach(() => {
    // jsdom has no Web Audio API — install a minimal constructible stub the
    // first time, then fetch the module's singleton via getAudioCtx().
    if (!(window as any).AudioContext) {
      (window as any).AudioContext = class MockAudioContext {
        state = 'suspended';
        currentTime = 0;
        destination = {};
        createOscillator() {
          return {};
        }
        createGain() {
          return {};
        }
        createBiquadFilter() {
          return {};
        }
        resume() {
          return Promise.resolve();
        }
      };
    }

    ctx = getAudioCtx();
    ctx.state = 'suspended';

    ctx.createOscillator = vi.fn().mockReturnValue({
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });
    ctx.createGain = vi.fn().mockReturnValue({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    });
    ctx.createBiquadFilter = vi.fn().mockReturnValue({
      type: 'lowpass',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('awaits ctx.resume() before building the chime audio graph', async () => {
    let resolveResume!: () => void;
    const resumePromise = new Promise<void>((resolve) => {
      resolveResume = resolve;
    });
    // Mirrors real AudioContext behavior: state flips to 'running' only once
    // resume() actually settles, not the instant it's called.
    ctx.resume = vi.fn(() =>
      resumePromise.then(() => {
        ctx.state = 'running';
      })
    );

    const donePromise = playCleanUpUnlocked();

    // Resume has been requested but hasn't settled yet — the chime's audio
    // graph must NOT be built yet. Building it here means playCleanUp's own
    // `state === 'suspended'` guard silently drops the sound.
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).not.toHaveBeenCalled();

    resolveResume();
    await donePromise;

    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('plays immediately without resuming when already running', async () => {
    ctx.state = 'running';
    ctx.resume = vi.fn();

    await playCleanUpUnlocked();

    expect(ctx.resume).not.toHaveBeenCalled();
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });
});
