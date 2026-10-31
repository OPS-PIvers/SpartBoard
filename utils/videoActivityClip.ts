import type { VideoActivityClip } from '@/types';

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
