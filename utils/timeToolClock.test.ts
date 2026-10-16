import { describe, it, expect } from 'vitest';
import {
  clockStateOf,
  secondsAt,
  startFreshClock,
  timeToolClockPatch,
  timeToolClockReducer,
  type TimeToolClockEvent,
  type TimeToolClockFields,
  type TimeToolPhase,
} from './timeToolClock';
import { TIME_TOOL_MAX_DURATION_SECONDS } from '@/config/timeTool';

const NOW = 1_700_000_000_000;

const timer = (
  over: Partial<TimeToolClockFields> = {}
): TimeToolClockFields => ({
  mode: 'timer',
  duration: 300,
  elapsedTime: 300,
  isRunning: false,
  startTime: null,
  ...over,
});

const stopwatch = (
  over: Partial<TimeToolClockFields> = {}
): TimeToolClockFields => ({
  mode: 'stopwatch',
  duration: 300,
  elapsedTime: 0,
  isRunning: false,
  startTime: null,
  ...over,
});

const FIXTURES: Record<TimeToolPhase, TimeToolClockFields[]> = {
  idle: [timer(), stopwatch()],
  paused: [timer({ elapsedTime: 120.5 }), stopwatch({ elapsedTime: 42 })],
  running: [
    timer({ isRunning: true, startTime: NOW - 10_000, elapsedTime: 200 }),
    stopwatch({ isRunning: true, startTime: NOW - 10_000, elapsedTime: 5 }),
  ],
  expired: [timer({ elapsedTime: 0 }), timer({ duration: 0, elapsedTime: 0 })],
  unstamped: [
    timer({ isRunning: true, startTime: null, elapsedTime: 600 }),
    stopwatch({ isRunning: true }),
  ],
};

const PHASES = Object.keys(FIXTURES) as TimeToolPhase[];

const EVENTS: TimeToolClockEvent[] = [
  { type: 'start', now: NOW },
  { type: 'pause', now: NOW },
  { type: 'expire' },
  { type: 'reset' },
  { type: 'setTime', seconds: 90 },
  { type: 'adjust', deltaSeconds: 60, fromSeconds: 100, now: NOW },
  { type: 'restart', now: NOW },
  { type: 'switchMode', mode: 'timer' },
  { type: 'switchMode', mode: 'stopwatch' },
];

// Which (phase, event) pairs may change state. `adjust` and `switchMode` also depend on mode.
const ALLOWED: Record<TimeToolClockEvent['type'], TimeToolPhase[]> = {
  start: ['idle', 'paused'],
  pause: ['running', 'unstamped'],
  expire: ['running'],
  reset: PHASES,
  setTime: PHASES,
  adjust: PHASES,
  restart: PHASES,
  switchMode: PHASES,
};

const isAllowed = (
  phase: TimeToolPhase,
  config: TimeToolClockFields,
  event: TimeToolClockEvent
): boolean => {
  if (!ALLOWED[event.type].includes(phase)) return false;
  if (event.type === 'expire') return config.mode === 'timer';
  if (event.type === 'adjust') return config.mode === 'timer';
  if (event.type === 'switchMode') return config.mode !== event.mode;
  return true;
};

describe('clockStateOf', () => {
  it.each(PHASES)('derives %s from the stored fields', (phase) => {
    for (const config of FIXTURES[phase]) {
      expect(clockStateOf(config).phase).toBe(phase);
    }
  });

  it('carries the running base and start stamp', () => {
    expect(
      clockStateOf(timer({ isRunning: true, startTime: NOW, elapsedTime: 50 }))
    ).toEqual({
      phase: 'running',
      mode: 'timer',
      baseSeconds: 50,
      startedAt: NOW,
    });
  });
});

describe('secondsAt', () => {
  it('counts a timer down from its start stamp', () => {
    const c = timer({ isRunning: true, startTime: NOW, elapsedTime: 60 });
    expect(secondsAt(c, NOW + 1500)).toBe(58.5);
    expect(secondsAt(c, NOW + 120_000)).toBe(0);
  });

  it('counts a stopwatch up from its start stamp', () => {
    const c = stopwatch({ isRunning: true, startTime: NOW, elapsedTime: 10 });
    expect(secondsAt(c, NOW + 2500)).toBe(12.5);
  });

  it('steps in whole seconds when asked', () => {
    const c = timer({ isRunning: true, startTime: NOW, elapsedTime: 60 });
    expect(secondsAt(c, NOW + 1500, { wholeSecondSteps: true })).toBe(59);
    const s = stopwatch({ isRunning: true, startTime: NOW, elapsedTime: 10 });
    expect(secondsAt(s, NOW + 2500, { wholeSecondSteps: true })).toBe(12);
  });

  it('returns the stored value when not ticking', () => {
    expect(secondsAt(timer({ elapsedTime: 33.3 }), NOW)).toBe(33.3);
    expect(secondsAt(FIXTURES.unstamped[0], NOW)).toBe(600);
  });
});

describe('transitions', () => {
  for (const phase of PHASES) {
    for (const event of EVENTS) {
      FIXTURES[phase].forEach((config, i) => {
        const allowed = isAllowed(phase, config, event);
        const label = `${phase}#${i} ${config.mode} + ${event.type}${
          event.type === 'switchMode' ? `(${event.mode})` : ''
        } is ${allowed ? 'allowed' : 'ignored'}`;
        it(label, () => {
          const next = timeToolClockReducer(config, event);
          if (allowed) {
            expect(timeToolClockPatch(config, event)).not.toBeNull();
          } else {
            expect(timeToolClockPatch(config, event)).toBeNull();
            expect(next).toBe(config);
          }
        });
      });
    }
  }
});

describe('start', () => {
  it('stamps now and keeps the stored time', () => {
    const c = timer({ elapsedTime: 120.5 });
    expect(timeToolClockPatch(c, { type: 'start', now: NOW })).toEqual({
      isRunning: true,
      startTime: NOW,
      elapsedTime: 120.5,
    });
    expect(
      clockStateOf(timeToolClockReducer(c, { type: 'start', now: NOW }))
    ).toEqual({
      phase: 'running',
      mode: 'timer',
      baseSeconds: 120.5,
      startedAt: NOW,
    });
  });
});

describe('pause', () => {
  const running = timer({ isRunning: true, startTime: NOW, elapsedTime: 300 });

  it('saves the exact remaining time by default', () => {
    expect(
      timeToolClockPatch(running, { type: 'pause', now: NOW + 12_646 })
    ).toEqual({ isRunning: false, elapsedTime: 287.354, startTime: null });
  });

  it('saves whole-second steps when asked (phone remote)', () => {
    expect(
      timeToolClockPatch(running, {
        type: 'pause',
        now: NOW + 12_646,
        wholeSecondSteps: true,
      })
    ).toEqual({ isRunning: false, elapsedTime: 288, startTime: null });
  });

  it('stops an unstamped timer at its stored time', () => {
    expect(
      timeToolClockPatch(FIXTURES.unstamped[0], { type: 'pause', now: NOW })
    ).toEqual({ isRunning: false, elapsedTime: 600, startTime: null });
  });

  it('lands in paused, or expired when nothing is left', () => {
    expect(
      clockStateOf(
        timeToolClockReducer(running, { type: 'pause', now: NOW + 1000 })
      ).phase
    ).toBe('paused');
    expect(
      clockStateOf(
        timeToolClockReducer(running, { type: 'pause', now: NOW + 999_000 })
      ).phase
    ).toBe('expired');
  });
});

describe('expire', () => {
  it('stops a running timer at zero', () => {
    const running = timer({ isRunning: true, startTime: NOW });
    expect(timeToolClockPatch(running, { type: 'expire' })).toEqual({
      isRunning: false,
      elapsedTime: 0,
      startTime: null,
    });
    expect(
      clockStateOf(timeToolClockReducer(running, { type: 'expire' })).phase
    ).toBe('expired');
  });
});

describe('reset', () => {
  it('returns a timer to its duration', () => {
    const c = timer({ isRunning: true, startTime: NOW, elapsedTime: 12 });
    expect(timeToolClockPatch(c, { type: 'reset' })).toEqual({
      isRunning: false,
      elapsedTime: 300,
      startTime: null,
    });
    expect(clockStateOf(timeToolClockReducer(c, { type: 'reset' })).phase).toBe(
      'idle'
    );
  });

  it('returns a stopwatch to zero', () => {
    const c = stopwatch({ elapsedTime: 99 });
    expect(timeToolClockPatch(c, { type: 'reset' })).toEqual({
      isRunning: false,
      elapsedTime: 0,
      startTime: null,
    });
  });
});

describe('setTime', () => {
  it('sets duration and time and stops', () => {
    const c = timer({ isRunning: true, startTime: NOW, elapsedTime: 12 });
    expect(timeToolClockPatch(c, { type: 'setTime', seconds: 90 })).toEqual({
      elapsedTime: 90,
      duration: 90,
      isRunning: false,
      startTime: null,
    });
  });
});

describe('adjust', () => {
  it('adds time while stopped and grows the duration past it', () => {
    const c = timer({ elapsedTime: 280 });
    expect(
      timeToolClockPatch(c, {
        type: 'adjust',
        deltaSeconds: 60,
        fromSeconds: 280,
        now: NOW,
      })
    ).toEqual({ elapsedTime: 340, duration: 340, startTime: null });
  });

  it('rebases the start stamp while running', () => {
    const c = timer({ isRunning: true, startTime: NOW - 5000 });
    expect(
      timeToolClockPatch(c, {
        type: 'adjust',
        deltaSeconds: -60,
        fromSeconds: 200,
        now: NOW,
      })
    ).toEqual({ elapsedTime: 140, duration: 300, startTime: NOW });
  });

  it('clamps at zero and at the ceiling', () => {
    const c = timer();
    expect(
      timeToolClockPatch(c, {
        type: 'adjust',
        deltaSeconds: -600,
        fromSeconds: 30,
        now: NOW,
      })
    ).toEqual({ elapsedTime: 0, duration: 300, startTime: null });
    expect(
      timeToolClockPatch(timer({ duration: TIME_TOOL_MAX_DURATION_SECONDS }), {
        type: 'adjust',
        deltaSeconds: 60,
        fromSeconds: TIME_TOOL_MAX_DURATION_SECONDS - 10,
        now: NOW,
      })
    ).toEqual({
      elapsedTime: TIME_TOOL_MAX_DURATION_SECONDS,
      duration: TIME_TOOL_MAX_DURATION_SECONDS,
      startTime: null,
    });
  });

  it('ignores a step that clamping cancels out', () => {
    const c = timer({ elapsedTime: 0 });
    const event: TimeToolClockEvent = {
      type: 'adjust',
      deltaSeconds: -60,
      fromSeconds: 0,
      now: NOW,
    };
    expect(timeToolClockPatch(c, event)).toBeNull();
    expect(timeToolClockReducer(c, event)).toBe(c);
  });
});

describe('restart', () => {
  it('runs a timer from its full duration', () => {
    const c = timer({ elapsedTime: 0 });
    expect(timeToolClockPatch(c, { type: 'restart', now: NOW })).toEqual({
      isRunning: true,
      startTime: NOW,
      elapsedTime: 300,
    });
  });

  it('runs a stopwatch from zero', () => {
    expect(
      timeToolClockPatch(stopwatch({ elapsedTime: 50 }), {
        type: 'restart',
        now: NOW,
      })
    ).toEqual({ isRunning: true, startTime: NOW, elapsedTime: 0 });
  });

  it('falls back to the stored time when a saved timer has no duration', () => {
    const legacy = { ...timer({ elapsedTime: 45 }), duration: undefined };
    expect(
      timeToolClockPatch(legacy as unknown as TimeToolClockFields, {
        type: 'restart',
        now: NOW,
      })
    ).toEqual({ isRunning: true, startTime: NOW, elapsedTime: 45 });
  });
});

describe('switchMode', () => {
  it('to timer seeds ten minutes', () => {
    expect(
      timeToolClockPatch(stopwatch(), { type: 'switchMode', mode: 'timer' })
    ).toEqual({
      mode: 'timer',
      duration: 600,
      elapsedTime: 600,
      isRunning: false,
      startTime: null,
    });
  });

  it('to stopwatch zeroes the time and keeps the duration', () => {
    expect(
      timeToolClockPatch(timer(), { type: 'switchMode', mode: 'stopwatch' })
    ).toEqual({
      mode: 'stopwatch',
      elapsedTime: 0,
      isRunning: false,
      startTime: null,
    });
  });
});

describe('startFreshClock', () => {
  it('builds a running timer for spawners', () => {
    const fresh = startFreshClock(240, NOW);
    expect(fresh).toEqual({
      mode: 'timer',
      duration: 240,
      elapsedTime: 240,
      isRunning: true,
      startTime: NOW,
    });
    expect(clockStateOf(fresh).phase).toBe('running');
  });
});
