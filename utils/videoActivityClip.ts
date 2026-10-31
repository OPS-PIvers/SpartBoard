import type { VideoActivityClip, VideoActivityNote } from '@/types';

/** Drops empty or out-of-order bounds so a saved clip is always playable. */
export const normalizeClip = (
  clip: VideoActivityClip | undefined
): VideoActivityClip | undefined => {
  if (!clip) return undefined;
  const start = clip.start && clip.start > 0 ? clip.start : undefined;
  const end =
    clip.end && clip.end > 0 && (start === undefined || clip.end > start)
      ? clip.end
      : undefined;
  if (start === undefined && end === undefined) return undefined;
  return {
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
  };
};

/** The clip and notes to copy onto a session or share; blank notes are dropped and the clip widens so no stop is cut off. */
export const videoActivityPlayback = (src: {
  clip?: VideoActivityClip;
  notes?: VideoActivityNote[];
  questions?: { timestamp: number }[];
}): { clip?: VideoActivityClip; notes?: VideoActivityNote[] } => {
  const notes = (src.notes ?? []).filter((n) => n.text.trim().length > 0);
  const stops = [...(src.questions ?? []), ...notes].map((s) => s.timestamp);
  let clip = src.clip;
  if (clip && stops.length > 0) {
    const first = Math.min(...stops);
    const last = Math.max(...stops);
    clip = normalizeClip({
      start: clip.start !== undefined ? Math.min(clip.start, first) : undefined,
      end: clip.end !== undefined ? Math.max(clip.end, last) : undefined,
    });
  }
  return {
    ...(clip ? { clip } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
};

/** Whether two note lists hold the same notes in the same order. */
export const notesEqual = (
  a: VideoActivityNote[],
  b: VideoActivityNote[]
): boolean =>
  a === b ||
  (a.length === b.length &&
    a.every(
      (n, i) =>
        n.id === b[i].id &&
        n.timestamp === b[i].timestamp &&
        n.text === b[i].text
    ));

/** The clip and notes a synced canonical doc or version stores; `notes` is always written so readers can tell it from a doc that predates synced playback. */
export const syncedPlaybackFields = (src: {
  clip?: VideoActivityClip;
  notes?: VideoActivityNote[];
  questions?: { timestamp: number }[];
}): { clip?: VideoActivityClip; notes: VideoActivityNote[] } => {
  const playback = videoActivityPlayback(src);
  return { ...playback, notes: playback.notes ?? [] };
};

/** A synced doc's clip and notes, or the fallback's when the doc has no `notes` key (written before synced playback). */
export const syncedPlayback = (
  canonical: {
    clip?: VideoActivityClip;
    notes?: VideoActivityNote[];
    questions: { timestamp: number }[];
  },
  fallback?: { clip?: VideoActivityClip; notes?: VideoActivityNote[] } | null
): { clip?: VideoActivityClip; notes?: VideoActivityNote[] } => {
  const src = canonical.notes !== undefined ? canonical : (fallback ?? {});
  return videoActivityPlayback({
    clip: src.clip,
    notes: src.notes,
    questions: canonical.questions,
  });
};
