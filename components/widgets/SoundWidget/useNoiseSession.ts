import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { POSTER_LEVELS } from './constants';

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
  const last = session.runs.at(-1);
  const runs =
    last && last.level === level
      ? [...session.runs.slice(0, -1), { level, seconds: last.seconds + 1 }]
      : [...session.runs, { level, seconds: 1 }];
  return { ...session, seconds, runs };
};

/** In-memory record of how loud the room was, one sample a second while listening. */
export const useNoiseSession = (listening: boolean, currentLevel: number) => {
  const [session, setSession] = useState(emptySession);
  const sample = useEffectEvent(() => {
    setSession((prev) => addSample(prev, currentLevel));
  });

  useEffect(() => {
    if (!listening) return undefined;
    const timer = setInterval(sample, 1000);
    return () => clearInterval(timer);
  }, [listening]);

  const addAlert = useCallback(() => {
    setSession((prev) => ({ ...prev, alerts: prev.alerts + 1 }));
  }, []);
  const clear = useCallback(() => setSession(emptySession()), []);

  return { session, addAlert, clear };
};
