export const RECORDING_LIMIT_MS = 60 * 60 * 1000;
export const RECORDING_WARNING_MS = 55 * 60 * 1000;

/** `m:ss`, or `h:mm:ss` from one hour. */
export function formatRecordingClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Time left before the auto-stop, once the 55-minute warning has started. */
export function recordingTimeLeftMs(elapsedMs: number): number | null {
  if (elapsedMs < RECORDING_WARNING_MS) return null;
  return Math.max(0, RECORDING_LIMIT_MS - elapsedMs);
}
