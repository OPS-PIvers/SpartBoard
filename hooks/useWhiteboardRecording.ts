import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { RecordingConfig, TakeMicState } from '@/types';
import type { WhiteboardLog } from '@/components/quiz/whiteboard/whiteboardLogTypes';
import { parseWhiteboardLog } from '@/components/quiz/whiteboard/whiteboardLog';
import type { RecoveredTake } from '@/utils/takeRecoveryStore';
import {
  whiteboardUsesMic,
  wrapUpThresholdSeconds,
} from '@/config/quizRecordingDefaults';

/**
 * Whiteboard take state machine: mic and canvas share one clock. Mirrors
 * `useAudioRecording` (no pause, nothing leaves memory until `commit()`), but a
 * denied or missing mic arms the canvas alone instead of ending the question.
 */
export type WhiteboardRecordingPhase =
  | 'prep'
  | 'requesting-permission'
  | 'armed'
  | 'recording'
  | 'stopping'
  | 'reviewing';

export type WhiteboardMicState = TakeMicState;

/** Why the take ended; `cutoff` is a tab-away or quiz time limit (D16). */
export type WhiteboardStopReason = 'user' | 'limit' | 'budget' | 'cutoff';

/** The log half of the take; the canvas pushes commands into the same recorder. */
export interface WhiteboardLogSink {
  start: (t0: number) => void;
  toLog: () => WhiteboardLog;
  /** D14: a full log ends the take exactly like the time limit. */
  readonly budgetReached?: boolean;
}

export interface WhiteboardCapturedTake {
  /** Absent when draw-only or when the mic never came on. */
  audio: { blob: Blob; mimeType: string } | null;
  log: WhiteboardLog;
  durationMs: number;
  /** Absent for draw-only questions, which never ask for the mic. */
  micState?: WhiteboardMicState;
  stopReason: WhiteboardStopReason;
  startedAt: number;
}

/** What the student app turns into the take's three artifacts (D19). */
export interface WhiteboardTake {
  audio: { blob: Blob; mimeType: string } | null;
  /** 3200x2400 PNG with the starting page baked in (D20). */
  picture: Blob;
  /** The serialized drawing log, `application/json`. */
  log: Blob;
  durationMs: number;
  micState?: WhiteboardMicState;
}

export interface WhiteboardRecordingDeps {
  getStream: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream, mimeType: string) => MediaRecorder;
  isTypeSupported: (mimeType: string) => boolean;
  now: () => number;
}

export interface UseWhiteboardRecordingOptions {
  config: RecordingConfig;
  /** Blocks arming until the notice is acknowledged and a take is allowed. */
  enabled: boolean;
  logSink: WhiteboardLogSink;
  /** `auto-advance` / `unanswered` bubble up; `armed` and `auto-start` do not. */
  onPrepExpired?: (expiry: RecordingConfig['prepExpiry']) => void;
  /** Fires once per take, the moment it is complete in memory. */
  onTakeReady?: (take: WhiteboardCapturedTake) => void;
  /** Fires at t0 with the audio format (empty when the mic is off). */
  onStarted?: (info: {
    mimeType: string;
    micState?: WhiteboardMicState;
  }) => void;
  /** Runs as the take ends, before the log is read (closes an open text box). */
  onBeforeStop?: () => void;
  /** Fires on every recorder chunk so crash recovery can mirror it. */
  onAudioChunk?: (chunk: Blob, mimeType: string) => void;
  deps?: WhiteboardRecordingDeps;
}

export interface UseWhiteboardRecordingResult {
  phase: WhiteboardRecordingPhase;
  prepSecondsLeft: number | null;
  recordSecondsLeft: number | null;
  wrapUpWarning: boolean;
  /** Mic state of the take in progress or under review. */
  micState: WhiteboardMicState | null;
  take: WhiteboardCapturedTake | null;
  /** Object URL for the take's audio; revoked on discard/commit. */
  audioUrl: string | null;
  /** Whether this question asks for narration (D2). */
  narrated: boolean;
  start: () => Promise<void>;
  /** Ends the take; resolves with it once the audio is flushed. */
  stop: (
    reason?: WhiteboardStopReason
  ) => Promise<WhiteboardCapturedTake | null>;
  discard: () => void;
  commit: () => WhiteboardCapturedTake | null;
  /** Loads a take recovered from local storage straight into review (D17). */
  restore: (take: WhiteboardCapturedTake) => void;
}

/** Same 32 kbps speech target as spoken answers (D15). */
export const WHITEBOARD_AUDIO_BITS_PER_SECOND = 32_000;
/** Chunk cadence for crash-recovery mirroring. */
export const WHITEBOARD_CHUNK_MS = 1_000;

const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

const realDeps: WhiteboardRecordingDeps = {
  getStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
  createRecorder: (stream, mimeType) =>
    new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: WHITEBOARD_AUDIO_BITS_PER_SECOND,
    }),
  isTypeSupported: (mimeType) =>
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(mimeType),
  now: () => performance.now(),
};

function pickMimeType(deps: WhiteboardRecordingDeps): string {
  for (const candidate of CANDIDATE_MIME_TYPES) {
    if (deps.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

/** A recovered record becomes a take only when its log survived; audio alone can't replay. */
export function toCapturedTake(
  found: RecoveredTake
): WhiteboardCapturedTake | null {
  if (!found.log) return null;
  let log: WhiteboardLog;
  try {
    log = parseWhiteboardLog(found.log);
  } catch {
    return null;
  }
  const bytes = found.chunks.some((c) => c.size > 0);
  return {
    audio:
      bytes && found.mimeType
        ? {
            blob: new Blob(found.chunks, { type: found.mimeType }),
            mimeType: found.mimeType,
          }
        : null,
    log,
    durationMs: Math.max(0, found.updatedAt - found.startedAt),
    micState: found.micState,
    stopReason: 'cutoff',
    startedAt: found.startedAt,
  };
}

export function micStateFromError(err: unknown): WhiteboardMicState {
  const name =
    err instanceof Error || err instanceof DOMException ? err.name : '';
  return name === 'NotAllowedError' || name === 'SecurityError'
    ? 'denied'
    : 'unavailable';
}

export function useWhiteboardRecording(
  options: UseWhiteboardRecordingOptions
): UseWhiteboardRecordingResult {
  const { config, enabled, logSink } = options;
  const deps = options.deps ?? realDeps;
  const narrated = whiteboardUsesMic(config);

  const [phase, setPhase] = useState<WhiteboardRecordingPhase>(
    config.prepSeconds > 0 ? 'prep' : 'armed'
  );
  const [prepSecondsLeft, setPrepSecondsLeft] = useState<number | null>(
    config.prepSeconds > 0 ? config.prepSeconds : null
  );
  const [recordSecondsLeft, setRecordSecondsLeft] = useState<number | null>(
    null
  );
  const [micState, setMicState] = useState<WhiteboardMicState | null>(null);
  const [take, setTake] = useState<WhiteboardCapturedTake | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isStartingRef = useRef(false);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);
  const micStateRef = useRef<WhiteboardMicState | undefined>(undefined);
  const prepTimerRef = useRef<number | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const stoppingRef = useRef<Promise<WhiteboardCapturedTake | null> | null>(
    null
  );
  const takeRef = useRef<WhiteboardCapturedTake | null>(null);

  const optionsRef = useRef(options);
  const depsRef = useRef(deps);
  useLayoutEffect(() => {
    optionsRef.current = options;
    depsRef.current = deps;
  });

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

  const setAudioObjectUrl = useCallback((blob: Blob | null) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = blob ? URL.createObjectURL(blob) : null;
    audioUrlRef.current = url;
    setAudioUrl(url);
  }, []);

  const finalize = useCallback(
    (
      reason: WhiteboardStopReason,
      endedAt: number,
      audio: WhiteboardCapturedTake['audio']
    ): WhiteboardCapturedTake => {
      const durationMs = Math.max(0, endedAt - startedAtRef.current);
      const captured: WhiteboardCapturedTake = {
        audio,
        log: optionsRef.current.logSink.toLog(),
        durationMs,
        micState: micStateRef.current,
        stopReason: reason,
        startedAt: startedAtRef.current,
      };
      takeRef.current = captured;
      if (mountedRef.current) {
        setRecordSecondsLeft(null);
        setTake(captured);
        setAudioObjectUrl(audio?.blob ?? null);
        setPhase('reviewing');
      }
      optionsRef.current.onTakeReady?.(captured);
      return captured;
    },
    [setAudioObjectUrl]
  );

  const stop = useCallback(
    (
      reason: WhiteboardStopReason = 'user'
    ): Promise<WhiteboardCapturedTake | null> => {
      if (stoppingRef.current) return stoppingRef.current;
      clearRecordTimer();
      const recorder = recorderRef.current;
      const isRecording =
        recorder !== null ||
        (startedAtRef.current > 0 && takeRef.current === null);
      if (!isRecording) return Promise.resolve(takeRef.current);
      // The take ends when stop is asked for, not when the encoder flushes.
      const endedAt = depsRef.current.now();
      optionsRef.current.onBeforeStop?.();
      if (mountedRef.current) setPhase('stopping');
      const pending = new Promise<WhiteboardCapturedTake | null>((resolve) => {
        if (!recorder || recorder.state === 'inactive') {
          recorderRef.current = null;
          resolve(finalize(reason, endedAt, null));
          return;
        }
        const mimeType = recorder.mimeType || 'audio/webm';
        recorder.onstop = () => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          recorderRef.current = null;
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          resolve(finalize(reason, endedAt, { blob, mimeType }));
        };
        recorder.stop();
      }).finally(() => {
        stoppingRef.current = null;
      });
      stoppingRef.current = pending;
      return pending;
    },
    [finalize]
  );

  const start = useCallback(async () => {
    if (!enabled) return;
    if (isStartingRef.current) return;
    if (recorderRef.current || phase === 'recording') return;
    isStartingRef.current = true;
    clearPrepTimer();
    setPrepSecondsLeft(null);
    takeRef.current = null;
    setTake(null);
    setAudioObjectUrl(null);
    try {
      let stream: MediaStream | null = null;
      let nextMic: WhiteboardMicState | undefined;
      if (narrated) {
        setPhase('requesting-permission');
        try {
          stream = await deps.getStream();
          const track = stream.getAudioTracks()[0];
          if (!track || track.readyState === 'ended') {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
            nextMic = 'unavailable';
          } else {
            nextMic = 'on';
          }
        } catch (err) {
          // D12: a refused mic arms the canvas alone.
          nextMic = micStateFromError(err);
        }
        if (!mountedRef.current) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
      }
      micStateRef.current = nextMic;
      setMicState(nextMic ?? null);

      let recorder: MediaRecorder | null = null;
      let chunkMime = '';
      if (stream) {
        chunksRef.current = [];
        streamRef.current = stream;
        const mimeType = pickMimeType(deps);
        try {
          recorder = deps.createRecorder(stream, mimeType);
        } catch {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          micStateRef.current = 'unavailable';
          setMicState('unavailable');
        }
        if (recorder) {
          chunkMime = recorder.mimeType || mimeType || 'audio/webm';
          const mime = chunkMime;
          recorder.ondataavailable = (e: BlobEvent) => {
            if (!e.data || e.data.size === 0) return;
            chunksRef.current.push(e.data);
            optionsRef.current.onAudioChunk?.(e.data, mime);
          };
        }
      }

      // One clock: the log and the audio both start at t0.
      const t0 = deps.now();
      startedAtRef.current = t0;
      logSink.start(t0);
      try {
        recorder?.start(WHITEBOARD_CHUNK_MS);
      } catch {
        // A recorder that won't start leaves a drawing-only take.
        recorder = null;
        stream?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        micStateRef.current = 'unavailable';
        setMicState('unavailable');
      }
      recorderRef.current = recorder;
      optionsRef.current.onStarted?.({
        mimeType: recorder ? chunkMime : '',
        micState: micStateRef.current,
      });
      setPhase('recording');
      setRecordSecondsLeft(config.limitSeconds);

      recordTimerRef.current = window.setInterval(() => {
        const elapsed = (depsRef.current.now() - startedAtRef.current) / 1000;
        setRecordSecondsLeft(
          Math.max(0, Math.ceil(config.limitSeconds - elapsed))
        );
        if (elapsed >= config.limitSeconds) void stop('limit');
        else if (optionsRef.current.logSink.budgetReached) void stop('budget');
      }, 250);
    } finally {
      isStartingRef.current = false;
    }
  }, [
    config.limitSeconds,
    deps,
    enabled,
    logSink,
    narrated,
    phase,
    setAudioObjectUrl,
    stop,
  ]);

  const startRef = useRef(start);
  useLayoutEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    if (!enabled) return;
    if (phase !== 'prep') return;
    if (config.prepSeconds <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- zero-length prep skips straight to armed
      setPhase('armed');
      return;
    }
    const deadline = depsRef.current.now() + config.prepSeconds * 1000;
    prepTimerRef.current = window.setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((deadline - depsRef.current.now()) / 1000)
      );
      setPrepSecondsLeft(left);
      if (left > 0) return;
      clearPrepTimer();
      setPrepSecondsLeft(null);
      setPhase('armed');
      if (config.prepExpiry === 'auto-start') {
        void startRef.current();
      } else if (config.prepExpiry !== 'armed') {
        optionsRef.current.onPrepExpired?.(config.prepExpiry);
      }
    }, 250);
    return clearPrepTimer;
  }, [config.prepExpiry, config.prepSeconds, enabled, phase]);

  const dropTake = useCallback(() => {
    takeRef.current = null;
    startedAtRef.current = 0;
    setTake(null);
    setMicState(null);
    micStateRef.current = undefined;
    setAudioObjectUrl(null);
  }, [setAudioObjectUrl]);

  const discard = useCallback(() => {
    // Zero writes: the discard IS the refusal (D13).
    dropTake();
    setPhase('armed');
  }, [dropTake]);

  const commit = useCallback((): WhiteboardCapturedTake | null => {
    const committed = takeRef.current;
    dropTake();
    setPhase('armed');
    return committed;
  }, [dropTake]);

  const restore = useCallback(
    (recovered: WhiteboardCapturedTake) => {
      clearPrepTimer();
      setPrepSecondsLeft(null);
      takeRef.current = recovered;
      startedAtRef.current = recovered.startedAt;
      micStateRef.current = recovered.micState;
      setMicState(recovered.micState ?? null);
      setTake(recovered);
      setAudioObjectUrl(recovered.audio?.blob ?? null);
      setPhase('reviewing');
    },
    [setAudioObjectUrl]
  );

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
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
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
    micState,
    take,
    audioUrl,
    narrated,
    start,
    stop,
    discard,
    commit,
    restore,
  };
}
