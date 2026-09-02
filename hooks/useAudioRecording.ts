import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordingConfig } from '@/types';
import { wrapUpThresholdSeconds } from '@/config/quizRecordingDefaults';

/**
 * Audio capture state machine for a quiz recording question. Modeled on
 * `hooks/useScreenRecord.ts` (re-entrancy guard, mounted guard, onstop blob
 * handoff) but for `getUserMedia({ audio: true })`.
 *
 * Nothing leaves memory until `commit()`: `discard()` drops the blob and
 * writes nowhere, which is the only refusal mechanism a student has.
 * There is deliberately no pause/resume.
 */
export type AudioRecordingPhase =
  | 'prep'
  | 'requesting-permission'
  | 'armed'
  | 'recording'
  | 'reviewing'
  | 'capture-unavailable';

export interface AudioTake {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface UseAudioRecordingOptions {
  config: RecordingConfig;
  /** Blocks arming until the Tennessen notice is acknowledged. */
  enabled: boolean;
  /** `auto-advance` / `unanswered` bubble up; `armed` and `auto-start` do not. */
  onPrepExpired?: (expiry: RecordingConfig['prepExpiry']) => void;
  onCaptureUnavailable?: () => void;
  /** Injected in tests and in the DEV harness; defaults to the real APIs. */
  deps?: AudioRecordingDeps;
}

export interface AudioRecordingDeps {
  getStream: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream, mimeType: string) => MediaRecorder;
  isTypeSupported: (mimeType: string) => boolean;
  now: () => number;
}

const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

const realDeps: AudioRecordingDeps = {
  getStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
  createRecorder: (stream, mimeType) =>
    mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream),
  isTypeSupported: (mimeType) =>
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(mimeType),
  now: () => Date.now(),
};

function pickMimeType(deps: AudioRecordingDeps): string {
  for (const candidate of CANDIDATE_MIME_TYPES) {
    if (deps.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

export interface UseAudioRecordingResult {
  phase: AudioRecordingPhase;
  /** Whole seconds left in the prep countdown; null once prep is over. */
  prepSecondsLeft: number | null;
  /** Whole seconds left in the take; null when not recording. */
  recordSecondsLeft: number | null;
  /** True inside the wrap-up stretch — the stated limit is still the real limit. */
  wrapUpWarning: boolean;
  take: AudioTake | null;
  /** Object URL for the pending take; revoked on discard/commit. */
  takeUrl: string | null;
  arm: () => void;
  start: () => Promise<void>;
  stop: () => void;
  discard: () => void;
  /** Hands the blob to the caller and resets to `armed`; writes nothing itself. */
  commit: () => AudioTake | null;
  reset: () => void;
}

export function useAudioRecording(
  options: UseAudioRecordingOptions
): UseAudioRecordingResult {
  const { config, enabled } = options;
  const deps = options.deps ?? realDeps;

  const [phase, setPhase] = useState<AudioRecordingPhase>(
    config.prepSeconds > 0 ? 'prep' : 'armed'
  );
  const [prepSecondsLeft, setPrepSecondsLeft] = useState<number | null>(
    config.prepSeconds > 0 ? config.prepSeconds : null
  );
  const [recordSecondsLeft, setRecordSecondsLeft] = useState<number | null>(
    null
  );
  const [take, setTake] = useState<AudioTake | null>(null);
  const [takeUrl, setTakeUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isStartingRef = useRef(false);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);
  const prepTimerRef = useRef<number | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const takeUrlRef = useRef<string | null>(null);

  const onPrepExpiredRef = useRef(options.onPrepExpired);
  onPrepExpiredRef.current = options.onPrepExpired;
  const onCaptureUnavailableRef = useRef(options.onCaptureUnavailable);
  onCaptureUnavailableRef.current = options.onCaptureUnavailable;

  const clearPrepTimer = () => {
    if (prepTimerRef.current !== null) {
      clearInterval(prepTimerRef.current);
      prepTimerRef.current = null;
    }
  };
  const clearRecordTimer = () => {
    if (recordTimerRef.current !== null) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    clearRecordTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (!enabled) return;
    if (isStartingRef.current) return;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return;
    isStartingRef.current = true;
    clearPrepTimer();
    setPrepSecondsLeft(null);
    setPhase('requesting-permission');
    try {
      const stream = await deps.getStream();
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = stream.getAudioTracks()[0];
      // A track that arrives already ended/muted is a dead device, not a
      // usable stream — treat it exactly like a denied permission.
      if (!track || track.readyState === 'ended') {
        stream.getTracks().forEach((t) => t.stop());
        setPhase('capture-unavailable');
        onCaptureUnavailableRef.current?.();
        return;
      }

      chunksRef.current = [];
      streamRef.current = stream;
      const mimeType = pickMimeType(deps);
      const recorder = deps.createRecorder(stream, mimeType);
      const effectiveMime = recorder.mimeType || mimeType || 'audio/webm';

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recorderRef.current !== recorder) return;
        // Client-measured duration: Chrome-recorded webm reports Infinity on
        // the media element, so the element is never the source of truth.
        const durationMs = Math.max(0, deps.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, { type: effectiveMime });
        chunksRef.current = [];
        streamRef.current = null;
        recorderRef.current = null;
        clearRecordTimer();
        setRecordSecondsLeft(null);
        setTake({ blob, mimeType: effectiveMime, durationMs });
        const url = URL.createObjectURL(blob);
        takeUrlRef.current = url;
        setTakeUrl(url);
        setPhase('reviewing');
      };

      recorderRef.current = recorder;
      startedAtRef.current = deps.now();
      recorder.start();
      setPhase('recording');
      setRecordSecondsLeft(config.limitSeconds);

      recordTimerRef.current = window.setInterval(() => {
        const elapsed = (deps.now() - startedAtRef.current) / 1000;
        const left = Math.max(0, Math.ceil(config.limitSeconds - elapsed));
        setRecordSecondsLeft(left);
        // Hard stop at exactly the stated limit — no grace tail.
        if (elapsed >= config.limitSeconds) stop();
      }, 250);
    } catch {
      setPhase('capture-unavailable');
      onCaptureUnavailableRef.current?.();
    } finally {
      isStartingRef.current = false;
    }
  }, [config.limitSeconds, deps, enabled, stop]);

  const arm = useCallback(() => {
    clearPrepTimer();
    setPrepSecondsLeft(null);
    setPhase('armed');
  }, []);

  const startRef = useRef(start);
  startRef.current = start;

  // Prep countdown. `performance`-independent: a client interval over
  // `deps.now()`, never the media element.
  useEffect(() => {
    if (!enabled) return;
    if (phase !== 'prep') return;
    if (config.prepSeconds <= 0) {
      setPhase('armed');
      return;
    }
    const deadline = deps.now() + config.prepSeconds * 1000;
    prepTimerRef.current = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - deps.now()) / 1000));
      setPrepSecondsLeft(left);
      if (left > 0) return;
      clearPrepTimer();
      setPrepSecondsLeft(null);
      if (config.prepExpiry === 'auto-start') {
        setPhase('armed');
        void startRef.current();
      } else if (config.prepExpiry === 'armed') {
        setPhase('armed');
      } else {
        setPhase('armed');
        onPrepExpiredRef.current?.(config.prepExpiry);
      }
    }, 250);
    return clearPrepTimer;
  }, [config.prepExpiry, config.prepSeconds, deps, enabled, phase]);

  const dropTake = useCallback(() => {
    setTake(null);
    if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
    takeUrlRef.current = null;
    setTakeUrl(null);
  }, []);

  const discard = useCallback(() => {
    // Zero writes, zero counters: the discard IS the refusal.
    dropTake();
    setPhase('armed');
  }, [dropTake]);

  const commit = useCallback((): AudioTake | null => {
    const committed = take;
    dropTake();
    setPhase('armed');
    return committed;
  }, [dropTake, take]);

  const reset = useCallback(() => {
    dropTake();
    setRecordSecondsLeft(null);
    setPrepSecondsLeft(config.prepSeconds > 0 ? config.prepSeconds : null);
    setPhase(config.prepSeconds > 0 ? 'prep' : 'armed');
  }, [config.prepSeconds, dropTake]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPrepTimer();
      clearRecordTimer();
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
    };
  }, []);

  const wrapUpWarning =
    phase === 'recording' &&
    recordSecondsLeft !== null &&
    recordSecondsLeft <= wrapUpThresholdSeconds(config.limitSeconds);

  return {
    phase,
    prepSecondsLeft,
    recordSecondsLeft,
    wrapUpWarning,
    take,
    takeUrl,
    arm,
    start,
    stop,
    discard,
    commit,
    reset,
  };
}
