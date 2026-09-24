/** v2 preloads image slides this far either side of the current one. */
export const PRELOAD_RADIUS = 2;

/** v2 preload window: slides to fetch and the one slide to decode ahead. */
export function preloadWindow(
  current: number,
  count: number,
  isVideo: (i: number) => boolean
): { fetch: number[]; decode: number | null } {
  const fetch: number[] = [];
  for (
    let i = Math.max(0, current - PRELOAD_RADIUS);
    i <= Math.min(count - 1, current + PRELOAD_RADIUS);
    i++
  ) {
    if (i !== current && !isVideo(i)) fetch.push(i);
  }
  const next = current + 1;
  return {
    fetch,
    decode: next < count && !isVideo(next) ? next : null,
  };
}
