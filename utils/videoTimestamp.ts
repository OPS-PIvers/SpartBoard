/** MM:SS or M:SS to total seconds; NaN when it isn't one. */
export function mmSsToSeconds(value: string): number {
  const match = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(value);
  if (!match) return NaN;
  const m = Number(match[1]);
  const s = Number(match[2]);
  if (s >= 60) return NaN;
  return m * 60 + s;
}

/** Total seconds as MM:SS. */
export function secondsToMmSs(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
