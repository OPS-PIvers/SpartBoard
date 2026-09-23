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

/** The saved place to offer on open, if it is past the first step and within 14 days. */
export function useResumeOffer(
  id: string,
  stepCount: number,
  enabled: boolean
): [ResumePoint | null, () => void] {
  const [offer, setOffer] = useState<ResumePoint | null>(() => {
    if (!enabled) return null;
    const p = readResume(id);
    return p && p.idx > 0 && p.idx < stepCount ? p : null;
  });
  return [offer, () => setOffer(null)];
}
