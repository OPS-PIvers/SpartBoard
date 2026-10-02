import {
  PLC_RECORDING_MAX_MS,
  PLC_RECORDING_WARN_MS,
} from '@/utils/plcRecording';

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
  if (elapsedMs < PLC_RECORDING_WARN_MS) return null;
  return Math.max(0, PLC_RECORDING_MAX_MS - elapsedMs);
}
