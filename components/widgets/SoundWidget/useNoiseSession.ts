import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { POSTER_LEVELS } from './constants';
import { usePageVisible } from './usePageVisible';

export interface NoiseRun {
  level: number;
  seconds: number;
}

export interface NoiseSession {
  /** Seconds spent at each poster level. */
  seconds: number[];
  /** Run-length timeline, one entry per stretch at the same level. */
  runs: NoiseRun[];
  alerts: number;
}

const BLIP_SECONDS = 3;
// Keeps the timeline small on an all-day session; the oldest runs merge first.
export const MAX_RUNS = 300;

const emptySession = (): NoiseSession => ({
  seconds: POSTER_LEVELS.map(() => 0),
  runs: [],
  alerts: 0,
});

export const addSample = (
  session: NoiseSession,
  level: number
): NoiseSession => {
  const seconds = [...session.seconds];
  seconds[level] += 1;
  const runs = session.runs.slice();
  const last = runs.at(-1);
  const before = runs.at(-2);
  if (last?.level === level) {
    runs[runs.length - 1] = { level, seconds: last.seconds + 1 };
  } else if (last && before?.level === level && last.seconds < BLIP_SECONDS) {
    // A brief blip between two stretches at one level folds into them.
    runs.splice(-2, 2, { level, seconds: before.seconds + last.seconds + 1 });
  } else {
    runs.push({ level, seconds: 1 });
  }
  if (runs.length > MAX_RUNS) {
    const [first, second] = runs;
    runs.splice(0, 2, {
      level: first.seconds >= second.seconds ? first.level : second.level,
      seconds: first.seconds + second.seconds,
    });
  }
  return { ...session, seconds, runs };
};

/** In-memory record of how loud the room was, one sample a second while listening. */
export const useNoiseSession = (listening: boolean, currentLevel: number) => {
  const [session, setSession] = useState(emptySession);
  // A hidden tab freezes the meter, so its frozen level is not recorded.
  const visible = usePageVisible();
  const active = listening && visible;
  const sample = useEffectEvent(() => {
    setSession((prev) => addSample(prev, currentLevel));
  });

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(sample, 1000);
    return () => clearInterval(timer);
  }, [active]);

  const addAlert = useCallback(() => {
    setSession((prev) => ({ ...prev, alerts: prev.alerts + 1 }));
  }, []);
  const clear = useCallback(() => setSession(emptySession()), []);

  return { session, addAlert, clear };
};
