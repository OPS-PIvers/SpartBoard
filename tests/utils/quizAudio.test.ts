/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Unit tests for utils/quizAudio.ts — the Web Audio synthesizer used for the
 * quiz widget's sound effects.
 *
 * jsdom does not provide an AudioContext, so we install a spy-able mock on
 * `window` and drive the module's lazy singleton. Because the singleton is
 * cached at module scope, each case uses `vi.resetModules()` + a fresh dynamic
 * import so the AudioContext branch (creation, fallback, null degradation) can
 * be re-exercised from a clean slate.
 */

type QuizAudioModule = typeof import('@/utils/quizAudio');

// Records populated by the most recently constructed mock context.
let oscillators: any[] = [];
let gains: any[] = [];
let createdContexts: any[] = [];
let ctorCalls = 0;
let nextState = 'suspended';

function makeOscillator() {
  const osc = {
    type: 'sine',
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    // osc.connect(gain) must return the gain node so the code's
    // `osc.connect(gain).connect(ctx.destination)` chain resolves.
    connect: vi.fn((node: unknown) => node),
    start: vi.fn(),
    stop: vi.fn(),
  };
  oscillators.push(osc);
  return osc;
}

function makeGain() {
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  gains.push(gain);
  return gain;
}

class MockAudioContext {
  state = nextState;
  currentTime = 100;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);

  constructor() {
    ctorCalls += 1;
    createdContexts.push(this);
  }

  createOscillator() {
    return makeOscillator();
  }

  createGain() {
    return makeGain();
  }
}

// Save whatever (if anything) other suites left on window so we can restore it.
const savedAudioContext = (window as any).AudioContext;
const savedWebkit = (window as any).webkitAudioContext;

/**
 * Reset module + node records, install the given AudioContext constructor on
 * `window`, and return a fresh import of the quizAudio module.
 */
async function loadModule(
  opts: {
    audioContext?: any;
    webkitAudioContext?: any;
    state?: string;
  } = {}
): Promise<QuizAudioModule> {
  vi.resetModules();
  oscillators = [];
  gains = [];
  createdContexts = [];
  ctorCalls = 0;
  nextState = opts.state ?? 'suspended';

  delete (window as any).AudioContext;
  delete (window as any).webkitAudioContext;
  if ('audioContext' in opts) {
    (window as any).AudioContext = opts.audioContext;
  }
  if ('webkitAudioContext' in opts) {
    (window as any).webkitAudioContext = opts.webkitAudioContext;
  }

  return import('@/utils/quizAudio');
}

afterEach(() => {
  vi.restoreAllMocks();
  // Restore original window globals so we do not leak into other suites.
  if (savedAudioContext === undefined) {
    delete (window as any).AudioContext;
  } else {
    (window as any).AudioContext = savedAudioContext;
  }
  if (savedWebkit === undefined) {
    delete (window as any).webkitAudioContext;
  } else {
    (window as any).webkitAudioContext = savedWebkit;
  }
});

describe('quizAudio — sound synthesis', () => {
  // Each play function creates one oscillator per note it schedules.
  const cases: Array<{
    fn: keyof QuizAudioModule;
    oscillators: number;
  }> = [
    { fn: 'playCorrectChime', oscillators: 1 },
    { fn: 'playIncorrectBuzz', oscillators: 1 },
    { fn: 'playCountdownTick', oscillators: 1 },
    { fn: 'playPodiumFanfare', oscillators: 4 },
    { fn: 'playQuizCompleteCelebration', oscillators: 5 },
    { fn: 'playStreakSound', oscillators: 1 },
  ];

  it.each(cases)(
    '$fn schedules $oscillators oscillator(s) wired to a gain + destination',
    async ({ fn, oscillators: expected }) => {
      const mod = await loadModule({ audioContext: MockAudioContext });

      (mod[fn] as () => void)();

      expect(oscillators).toHaveLength(expected);
      expect(gains).toHaveLength(expected);
      // Every oscillator is started, stopped, and wired to a gain node.
      for (const osc of oscillators) {
        expect(osc.start).toHaveBeenCalled();
        expect(osc.stop).toHaveBeenCalled();
        expect(osc.connect).toHaveBeenCalled();
        expect(osc.frequency.setValueAtTime).toHaveBeenCalled();
      }
      for (const gain of gains) {
        expect(gain.connect).toHaveBeenCalled();
        expect(gain.gain.setValueAtTime).toHaveBeenCalled();
      }
    }
  );
});

describe('quizAudio — AudioContext lifecycle', () => {
  it('resumes a suspended context', async () => {
    const mod = await loadModule({
      audioContext: MockAudioContext,
      state: 'suspended',
    });

    mod.playCountdownTick();

    const ctx = createdContexts[0];
    expect(ctx).toBeDefined();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('does NOT resume a context that is already running', async () => {
    const mod = await loadModule({
      audioContext: MockAudioContext,
      state: 'running',
    });

    mod.playCountdownTick();

    const ctx = createdContexts[0];
    expect(ctx).toBeDefined();
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('reuses a single AudioContext singleton across multiple calls', async () => {
    const mod = await loadModule({ audioContext: MockAudioContext });

    mod.playCorrectChime();
    mod.playIncorrectBuzz();
    mod.playStreakSound();

    expect(ctorCalls).toBe(1);
  });

  it('falls back to webkitAudioContext when window.AudioContext is absent', async () => {
    const mod = await loadModule({ webkitAudioContext: MockAudioContext });

    mod.playCorrectChime();

    expect(ctorCalls).toBe(1);
    expect(oscillators).toHaveLength(1);
  });
});

describe('quizAudio — graceful degradation', () => {
  it('no-ops (no throw) when no AudioContext implementation is available', async () => {
    const mod = await loadModule(); // neither AudioContext nor webkit installed

    expect(() => {
      mod.playCorrectChime();
      mod.playIncorrectBuzz();
      mod.playCountdownTick();
      mod.playPodiumFanfare();
      mod.playQuizCompleteCelebration();
      mod.playStreakSound();
    }).not.toThrow();

    expect(oscillators).toHaveLength(0);
    expect(gains).toHaveLength(0);
  });

  it('no-ops (no throw) when the AudioContext constructor throws', async () => {
    class ThrowingContext {
      constructor() {
        throw new Error('AudioContext unavailable');
      }
    }
    const mod = await loadModule({ audioContext: ThrowingContext });

    expect(() => mod.playCorrectChime()).not.toThrow();
    expect(oscillators).toHaveLength(0);
  });

  it('produces no audio on repeated calls after construction fails', async () => {
    let attempts = 0;
    class ThrowingContext {
      constructor() {
        attempts += 1;
        throw new Error('AudioContext unavailable');
      }
    }
    const mod = await loadModule({ audioContext: ThrowingContext });

    mod.playCorrectChime();
    mod.playIncorrectBuzz();

    // getCtx() re-attempts construction while the singleton is null, but every
    // attempt fails and no oscillator is ever produced.
    expect(attempts).toBeGreaterThanOrEqual(1);
    expect(oscillators).toHaveLength(0);
  });
});
