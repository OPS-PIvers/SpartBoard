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

/** The clip and notes to copy onto a session or share, with absent fields left out. */
export const videoActivityPlayback = (src: {
  clip?: VideoActivityClip;
  notes?: VideoActivityNote[];
}): { clip?: VideoActivityClip; notes?: VideoActivityNote[] } => ({
  ...(src.clip ? { clip: src.clip } : {}),
  ...(src.notes && src.notes.length > 0 ? { notes: src.notes } : {}),
});
