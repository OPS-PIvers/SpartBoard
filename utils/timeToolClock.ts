import type { TimeToolConfig } from '@/types';
import { TIME_TOOL_MAX_DURATION_SECONDS } from '@/config/timeTool';

// The stored fields that make up the clock; everything else on TimeToolConfig is appearance or end-of-timer settings.
export type TimeToolClockFields = Pick<
  TimeToolConfig,
  'mode' | 'duration' | 'elapsedTime' | 'isRunning' | 'startTime'
>;

export type TimeToolClockPatch = Partial<TimeToolClockFields>;

type ClockMode = TimeToolConfig['mode'];

// Derived from the stored flat fields; `unstamped` is the legacy isRunning-without-startTime shape, shown as running but never ticking.
export type TimeToolClockState =
  | { phase: 'idle'; mode: ClockMode; seconds: number }
  | { phase: 'paused'; mode: ClockMode; seconds: number }
  | {
      phase: 'running';
      mode: ClockMode;
      baseSeconds: number;
      startedAt: number;
    }
  | { phase: 'expired'; mode: 'timer' }
  | { phase: 'unstamped'; mode: ClockMode; seconds: number };

export type TimeToolPhase = TimeToolClockState['phase'];

export type TimeToolClockEvent =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number; wholeSecondSteps?: boolean }
  | { type: 'expire' }
  | { type: 'reset' }
  | { type: 'setTime'; seconds: number }
  | { type: 'adjust'; deltaSeconds: number; fromSeconds: number; now: number }
  | { type: 'restart'; now: number }
  | { type: 'switchMode'; mode: ClockMode };

const modeOf = (config: TimeToolClockFields): ClockMode =>
  config.mode === 'timer' ? 'timer' : 'stopwatch';

export const clockStateOf = (
  config: TimeToolClockFields
): TimeToolClockState => {
  const mode = modeOf(config);
  const seconds = config.elapsedTime;
  if (config.isRunning) {
    return config.startTime
      ? {
          phase: 'running',
          mode,
          baseSeconds: seconds,
          startedAt: config.startTime,
        }
      : { phase: 'unstamped', mode, seconds };
  }
  if (mode === 'timer' && seconds <= 0) return { phase: 'expired', mode };
  const full = mode === 'timer' ? config.duration : 0;
  return seconds === full
    ? { phase: 'idle', mode, seconds }
    : { phase: 'paused', mode, seconds };
};

// Remaining (timer) or elapsed (stopwatch) seconds at `now`; the phone remote steps in whole seconds.
export const secondsAt = (
  config: TimeToolClockFields,
  now: number,
  opts?: { wholeSecondSteps?: boolean }
): number => {
  const state = clockStateOf(config);
  if (state.phase !== 'running') return config.elapsedTime;
  const raw = (now - state.startedAt) / 1000;
  const delta = opts?.wholeSecondSteps ? Math.floor(raw) : raw;
  return state.mode === 'timer'
    ? Math.max(0, state.baseSeconds - delta)
    : state.baseSeconds + delta;
};

// The clock fields that change for `event`, or null when the event isn't allowed from the current phase.
export const timeToolClockPatch = (
  config: TimeToolClockFields,
  event: TimeToolClockEvent
): TimeToolClockPatch | null => {
  const state = clockStateOf(config);
  const mode = state.mode;
  switch (event.type) {
    case 'start':
      if (state.phase !== 'idle' && state.phase !== 'paused') return null;
      return {
        isRunning: true,
        startTime: event.now,
        elapsedTime: state.seconds,
      };
    case 'pause':
      if (state.phase !== 'running' && state.phase !== 'unstamped') {
        return null;
      }
      return {
        isRunning: false,
        elapsedTime: secondsAt(config, event.now, {
          wholeSecondSteps: event.wholeSecondSteps,
        }),
        startTime: null,
      };
    case 'expire':
      if (state.phase !== 'running' || mode !== 'timer') return null;
      return { isRunning: false, elapsedTime: 0, startTime: null };
    case 'reset':
      return {
        isRunning: false,
        elapsedTime: mode === 'timer' ? config.duration : 0,
        startTime: null,
      };
    case 'setTime':
      return {
        elapsedTime: event.seconds,
        duration: event.seconds,
        isRunning: false,
        startTime: null,
      };
    case 'adjust': {
      if (mode !== 'timer') return null;
      const current = event.fromSeconds;
      const next = Math.min(
        TIME_TOOL_MAX_DURATION_SECONDS,
        Math.max(0, current + event.deltaSeconds)
      );
      const nextDuration = Math.min(
        TIME_TOOL_MAX_DURATION_SECONDS,
        Math.max(config.duration, next)
      );
      if (next === current && nextDuration === config.duration) return null;
      return {
        elapsedTime: next,
        duration: nextDuration,
        startTime: config.isRunning ? event.now : null,
      };
    }
    case 'restart':
      return {
        isRunning: true,
        startTime: event.now,
        elapsedTime:
          mode === 'timer' ? (config.duration ?? config.elapsedTime ?? 0) : 0,
      };
    case 'switchMode':
      if (event.mode === config.mode) return null;
      return event.mode === 'timer'
        ? {
            mode: 'timer',
            duration: 600,
            elapsedTime: 600,
            isRunning: false,
            startTime: null,
          }
        : {
            mode: 'stopwatch',
            elapsedTime: 0,
            isRunning: false,
            startTime: null,
          };
  }
};

export const timeToolClockReducer = <C extends TimeToolClockFields>(
  config: C,
  event: TimeToolClockEvent
): C => {
  const patch = timeToolClockPatch(config, event);
  return patch ? { ...config, ...patch } : config;
};

// A timer that is already counting down, for widgets that spawn one (Schedule, Calendar, Specialist Schedule).
export const startFreshClock = (
  seconds: number,
  now: number
): TimeToolClockFields => ({
  mode: 'timer',
  duration: seconds,
  elapsedTime: seconds,
  isRunning: true,
  startTime: now,
});
