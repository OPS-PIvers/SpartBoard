import { useState } from 'react';
import type { PlaybackMode } from '../../types/stage';

export const RESUME_PREFIX = 'spartboard.gl.resume.';
export const RESUME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface ResumePoint {
  id: string;
  idx: number;
  mode: PlaybackMode;
  updatedAt: number;
}

export function readResume(id: string, now = Date.now()): ResumePoint | null {
  try {
    const raw = window.localStorage.getItem(RESUME_PREFIX + id);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ResumePoint>;
    if (
      p.id !== id ||
      typeof p.idx !== 'number' ||
      typeof p.updatedAt !== 'number' ||
      (p.mode !== 'watch' && p.mode !== 'try')
    ) {
      return null;
    }
    if (now - p.updatedAt > RESUME_MAX_AGE_MS) return null;
    return p as ResumePoint;
  } catch {
    return null;
  }
}

export function writeResume(point: ResumePoint): void {
  try {
    window.localStorage.setItem(
      RESUME_PREFIX + point.id,
      JSON.stringify(point)
    );
  } catch {
    // Storage blocked: resume is a convenience, so skip it.
  }
}

/** A place to offer on open: this device's saved point, else the server's furthest step. */
export interface ResumeOffer {
  idx: number;
  source: 'device' | 'server';
}

interface OfferState {
  offer: ResumeOffer | null;
  /** This device had a saved point, so the server's is never offered. */
  hasLocal: boolean;
  dismissed: boolean;
  serverSeen: boolean;
}

const offerable = (idx: number | null | undefined, stepCount: number) =>
  typeof idx === 'number' && idx > 0 && idx < stepCount;

/** The saved place to offer on open, if it is past the first step and within 14 days. */
export function useResumeOffer(
  id: string,
  stepCount: number,
  enabled: boolean,
  serverIdx?: number | null,
  pristine = true
): [ResumeOffer | null, () => void] {
  const [state, setState] = useState<OfferState>(() => {
    if (!enabled) {
      return {
        offer: null,
        hasLocal: false,
        dismissed: false,
        serverSeen: true,
      };
    }
    const p = readResume(id);
    const server = offerable(serverIdx, stepCount)
      ? (serverIdx as number)
      : null;
    return {
      offer:
        p && offerable(p.idx, stepCount)
          ? { idx: p.idx, source: 'device' }
          : !p && server !== null
            ? { idx: server, source: 'server' }
            : null,
      hasLocal: Boolean(p),
      dismissed: false,
      serverSeen: typeof serverIdx === 'number',
    };
  });
  // The progress doc can land after the player opens; a learner who has moved is left alone.
  if (!state.serverSeen && typeof serverIdx === 'number') {
    const late =
      !state.hasLocal &&
      !state.dismissed &&
      pristine &&
      offerable(serverIdx, stepCount);
    setState({
      ...state,
      serverSeen: true,
      offer: late ? { idx: serverIdx, source: 'server' } : state.offer,
    });
  }
  return [
    state.offer,
    () => setState((s) => ({ ...s, offer: null, dismissed: true })),
  ];
}
