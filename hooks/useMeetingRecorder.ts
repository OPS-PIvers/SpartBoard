import { useCallback, useEffect, useRef, useState } from 'react';
import {
  firebaseMeetingRecordingBackend,
  type MeetingRecordingBackend,
} from '@/utils/meetingRecording/backend';
import {
  defaultSegmentQueue,
  type SegmentQueue,
} from '@/utils/meetingRecording/segmentQueue';
import type { PlcRecordingPart } from '@/types';
import {
  PLC_RECORDING_HEARTBEAT_MS,
  PLC_RECORDING_MAX_MS,
  PLC_RECORDING_MIME,
  PLC_RECORDING_PAUSE_LIMIT_MS,
  PLC_RECORDING_TIMESLICE_MS,
  PLC_RECORDING_WARN_MS,
  plcRecordingSegmentPath,
} from '@/utils/plcRecording';
import { logError } from '@/utils/logError';

// Stop waits this long for in-flight uploads; anything later still lands via the late-segment merge (MR-D8).
export const STOP_FLUSH_MS = 15_000;
// Chrome defaults Opus to ~128 kbps (58 MB an hour); speech needs a quarter of that.
export const SPEECH_BITS_PER_SECOND = 32_000;
export const MIC_STORAGE_KEY = 'spartboard.meetingRecorder.micId';

export type MeetingRecorderPhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'stopped';

export type MeetingRecorderError =
  | 'unsupported'
  | 'mic-denied'
  | 'start-failed'
  | 'mic-lost'
  | 'finalize-failed';

export interface MicOption {
  deviceId: string;
  label: string;
}

export interface MeetingRecorderDeps {
  backend: MeetingRecordingBackend;
  queue: SegmentQueue;
  getStream: (deviceId: string | null) => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
  isSupported: () => boolean;
  listMics: () => Promise<MicOption[]>;
  readMic: () => string | null;
  writeMic: (deviceId: string | null) => void;
  now: () => number;
}

const realDeps = (): MeetingRecorderDeps => ({
  backend: firebaseMeetingRecordingBackend,
  queue: defaultSegmentQueue(),
  getStream: (deviceId) =>
    navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    }),
  createRecorder: (stream) =>
    new MediaRecorder(stream, {
      mimeType: PLC_RECORDING_MIME,
      audioBitsPerSecond: SPEECH_BITS_PER_SECOND,
    }),
  isSupported: () =>
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(PLC_RECORDING_MIME) &&
    !!navigator.mediaDevices?.getUserMedia,
  listMics: async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId)
      .map((d) => ({ deviceId: d.deviceId, label: d.label }));
  },
  readMic: () => {
    try {
      return localStorage.getItem(MIC_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  writeMic: (deviceId) => {
    try {
      if (deviceId) localStorage.setItem(MIC_STORAGE_KEY, deviceId);
      else localStorage.removeItem(MIC_STORAGE_KEY);
    } catch {
      // Private windows can refuse storage; the choice just isn't remembered.
    }
  },
  now: () => Date.now(),
});

interface ActivePart {
  index: number;
  recorder: MediaRecorder;
  stream: MediaStream;
  startedAt: number;
  endedAt: number | null;
  segmentCount: number;
  closed: Promise<void>;
}

interface Session {
  plcId: string;
  recordingId: string;
}

export interface StartMeetingRecordingInput {
  plcId: string;
  noteId: string;
  recorderUid: string;
}

export interface UseMeetingRecorderResult {
  isSupported: boolean;
  phase: MeetingRecorderPhase;
  recordingId: string | null;
  /** Recorded time; paused time does not count (MR-D6). */
  elapsedMs: number;
  lengthWarning: boolean;
  /** The chosen mic went away and recording moved to the default one (MR-D22). */
  micFallback: boolean;
  /** Segments uploading now or waiting in the retry queue. */
  pendingUploads: number;
  error: MeetingRecorderError | null;
  mics: MicOption[];
  selectedMicId: string | null;
  start: (input: StartMeetingRecordingInput) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  retryFinalize: () => Promise<void>;
  selectMic: (deviceId: string | null) => Promise<void>;
  refreshMics: () => Promise<void>;
  dismissMicFallback: () => void;
}

const isPermanentUploadError = (err: unknown) =>
  !!err &&
  typeof err === 'object' &&
  (err as { code?: unknown }).code === 'storage/unauthorized';

const isPermissionError = (err: unknown) =>
  !!err &&
  typeof err === 'object' &&
  ((err as { name?: unknown }).name === 'NotAllowedError' ||
    (err as { name?: unknown }).name === 'SecurityError');

const stopTracks = (stream: MediaStream) =>
  stream.getTracks().forEach((t) => t.stop());

export function useMeetingRecorder(
  options: { deps?: MeetingRecorderDeps } = {}
): UseMeetingRecorderResult {
  const depsRef = useRef<MeetingRecorderDeps | null>(null);
  depsRef.current ??= options.deps ?? realDeps();
  const deps = depsRef.current;

  const [isSupported] = useState(() => deps.isSupported());
  const [phase, setPhaseState] = useState<MeetingRecorderPhase>('idle');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micFallback, setMicFallback] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [error, setError] = useState<MeetingRecorderError | null>(null);
  const [mics, setMics] = useState<MicOption[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(() =>
    deps.readMic()
  );

  const mountedRef = useRef(true);
  const phaseRef = useRef<MeetingRecorderPhase>('idle');
  const sessionRef = useRef<Session | null>(null);
  const partsRef = useRef<PlcRecordingPart[]>([]);
  const activeRef = useRef<ActivePart | null>(null);
  const micRef = useRef<string | null>(selectedMicId);
  const opChainRef = useRef<Promise<void>>(Promise.resolve());
  const inflightRef = useRef(new Map<string, Promise<void>>());
  const queuedRef = useRef(new Set<string>());
  const drainingRef = useRef(false);
  const pauseTimerRef = useRef<number | null>(null);
  const stopRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const onTrackEndedRef = useRef<((part: ActivePart) => void) | null>(null);

  const setPhase = useCallback((next: MeetingRecorderPhase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhaseState(next);
  }, []);

  const syncPending = useCallback(() => {
    if (!mountedRef.current) return;
    const paths = new Set([
      ...inflightRef.current.keys(),
      ...queuedRef.current,
    ]);
    setPendingUploads(paths.size);
  }, []);

  const totalMs = useCallback(() => {
    const done = partsRef.current.reduce((sum, p) => sum + p.durationMs, 0);
    const active = activeRef.current;
    if (!active) return done;
    return done + ((active.endedAt ?? deps.now()) - active.startedAt);
  }, [deps]);

  const partsSnapshot = useCallback((): PlcRecordingPart[] => {
    const active = activeRef.current;
    if (!active) return [...partsRef.current];
    return [
      ...partsRef.current,
      {
        segmentCount: active.segmentCount,
        durationMs: (active.endedAt ?? deps.now()) - active.startedAt,
      },
    ];
  }, [deps]);

  // Write-ahead: the segment sits in IndexedDB until Storage confirms it, so a reload mid-upload loses nothing.
  const upload = useCallback(
    (path: string, blob: Blob) => {
      if (inflightRef.current.has(path)) return;
      queuedRef.current.add(path);
      const task = deps.queue
        .put({ path, blob, queuedAt: deps.now() })
        .catch((err: unknown) =>
          logError('useMeetingRecorder.queue', err, { path })
        )
        .then(() => deps.backend.uploadSegment(path, blob))
        .then(
          async () => {
            queuedRef.current.delete(path);
            await deps.queue.remove(path).catch(() => undefined);
          },
          async (err: unknown) => {
            if (isPermanentUploadError(err)) {
              // Create-only rule: the object already exists, or this user may no longer upload here.
              queuedRef.current.delete(path);
              await deps.queue.remove(path).catch(() => undefined);
            }
            logError('useMeetingRecorder.upload', err, { path });
          }
        )
        .finally(() => {
          inflightRef.current.delete(path);
          syncPending();
        });
      inflightRef.current.set(path, task);
      syncPending();
    },
    [deps, syncPending]
  );

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const queued = await deps.queue.list().catch(() => []);
      for (const seg of queued) queuedRef.current.add(seg.path);
      syncPending();
      for (const seg of queued) {
        if (inflightRef.current.has(seg.path)) continue;
        upload(seg.path, seg.blob);
        await inflightRef.current.get(seg.path);
      }
    } finally {
      drainingRef.current = false;
    }
  }, [deps, syncPending, upload]);

  const runExclusive = useCallback((op: () => Promise<void>) => {
    const next = opChainRef.current.then(op, op);
    opChainRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const writeRecording = useCallback(
    async (
      patch: Parameters<MeetingRecordingBackend['updateRecording']>[2]
    ) => {
      const session = sessionRef.current;
      if (!session) return;
      try {
        await deps.backend.updateRecording(
          session.plcId,
          session.recordingId,
          patch
        );
      } catch (err) {
        logError('useMeetingRecorder.update', err, {
          plcId: session.plcId,
          recordingId: session.recordingId,
        });
      }
    },
    [deps]
  );

  const acquireStream = useCallback(
    async (deviceId: string | null): Promise<MediaStream> => {
      if (!deviceId) return deps.getStream(null);
      try {
        return await deps.getStream(deviceId);
      } catch (err) {
        if (isPermissionError(err)) throw err;
        return deps.getStream(null);
      }
    },
    [deps]
  );

  const openPart = useCallback(
    (stream: MediaStream): boolean => {
      // A stream that resolves after unmount would otherwise leave the mic on with nothing to stop it.
      if (!mountedRef.current) {
        stopTracks(stream);
        return false;
      }
      const session = sessionRef.current;
      if (!session) throw new Error('No recording session');
      const recorder = deps.createRecorder(stream);
      let resolveClosed: (() => void) | undefined;
      const part: ActivePart = {
        index: partsRef.current.length,
        recorder,
        stream,
        startedAt: deps.now(),
        endedAt: null,
        segmentCount: 0,
        closed: new Promise<void>((resolve) => {
          resolveClosed = resolve;
        }),
      };
      recorder.ondataavailable = (e: BlobEvent) => {
        if (!e.data || e.data.size === 0) return;
        const segmentIndex = part.segmentCount;
        part.segmentCount += 1;
        upload(
          plcRecordingSegmentPath(
            session.plcId,
            session.recordingId,
            part.index,
            segmentIndex
          ),
          e.data
        );
      };
      recorder.onstop = () => {
        part.endedAt ??= deps.now();
        resolveClosed?.();
      };
      // A recorder error ends the part the same way a lost mic does.
      recorder.onerror = () => onTrackEndedRef.current?.(part);
      const track = stream.getAudioTracks()[0];
      track?.addEventListener('ended', () => onTrackEndedRef.current?.(part));
      activeRef.current = part;
      recorder.start(PLC_RECORDING_TIMESLICE_MS);
      return true;
    },
    [deps, upload]
  );

  const closePart = useCallback(async () => {
    const part = activeRef.current;
    if (!part) return;
    part.endedAt ??= deps.now();
    if (part.recorder.state !== 'inactive') part.recorder.stop();
    await part.closed;
    stopTracks(part.stream);
    partsRef.current = [
      ...partsRef.current,
      {
        segmentCount: part.segmentCount,
        durationMs: Math.max(0, part.endedAt - part.startedAt),
      },
    ];
    activeRef.current = null;
    if (mountedRef.current) setElapsedMs(totalMs());
  }, [deps, totalMs]);

  const clearPauseTimer = () => {
    if (pauseTimerRef.current !== null) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  };

  const refreshMics = useCallback(async () => {
    try {
      const list = await deps.listMics();
      if (mountedRef.current) setMics(list);
    } catch {
      if (mountedRef.current) setMics([]);
    }
  }, [deps]);

  const finalize = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      await deps.backend.finalize(session.plcId, session.recordingId);
      if (mountedRef.current) setError(null);
    } catch (err) {
      logError('useMeetingRecorder.finalize', err, {
        plcId: session.plcId,
        recordingId: session.recordingId,
      });
      if (mountedRef.current) setError('finalize-failed');
    }
  }, [deps]);

  const start = useCallback(
    (input: StartMeetingRecordingInput) =>
      runExclusive(async () => {
        if (phaseRef.current !== 'idle' && phaseRef.current !== 'stopped') {
          return;
        }
        if (!isSupported) {
          setError('unsupported');
          return;
        }
        setError(null);
        setMicFallback(false);
        setPhase('starting');
        partsRef.current = [];
        activeRef.current = null;
        sessionRef.current = null;
        setElapsedMs(0);
        setRecordingId(null);
        let stream: MediaStream;
        try {
          // Mic permission comes before the doc so a refusal leaves nothing behind.
          stream = await acquireStream(micRef.current);
        } catch (err) {
          setPhase('idle');
          setError(isPermissionError(err) ? 'mic-denied' : 'start-failed');
          return;
        }
        if (!mountedRef.current) {
          stopTracks(stream);
          return;
        }
        try {
          const id = await deps.backend.createRecording(input);
          sessionRef.current = { plcId: input.plcId, recordingId: id };
          if (mountedRef.current) setRecordingId(id);
          if (!openPart(stream)) return;
          setPhase('recording');
        } catch (err) {
          stopTracks(stream);
          logError('useMeetingRecorder.start', err, { plcId: input.plcId });
          sessionRef.current = null;
          setPhase('idle');
          setError('start-failed');
          return;
        }
        void refreshMics();
      }),
    [
      acquireStream,
      deps,
      isSupported,
      openPart,
      refreshMics,
      runExclusive,
      setPhase,
    ]
  );

  const pause = useCallback(
    () =>
      runExclusive(async () => {
        if (phaseRef.current !== 'recording') return;
        await closePart();
        setPhase('paused');
        await writeRecording({
          status: 'paused',
          parts: partsSnapshot(),
          durationMs: totalMs(),
          heartbeat: true,
        });
        clearPauseTimer();
        pauseTimerRef.current = window.setTimeout(() => {
          void stopRef.current();
        }, PLC_RECORDING_PAUSE_LIMIT_MS);
      }),
    [closePart, partsSnapshot, runExclusive, setPhase, totalMs, writeRecording]
  );

  const resume = useCallback(
    () =>
      runExclusive(async () => {
        if (phaseRef.current !== 'paused') return;
        if (totalMs() >= PLC_RECORDING_MAX_MS) return;
        let stream: MediaStream;
        try {
          stream = await acquireStream(micRef.current);
        } catch (err) {
          setError(isPermissionError(err) ? 'mic-denied' : 'mic-lost');
          return;
        }
        if (!openPart(stream)) return;
        clearPauseTimer();
        setError(null);
        setPhase('recording');
        await writeRecording({
          status: 'recording',
          parts: partsSnapshot(),
          heartbeat: true,
        });
      }),
    [
      acquireStream,
      openPart,
      partsSnapshot,
      runExclusive,
      setPhase,
      totalMs,
      writeRecording,
    ]
  );

  const flushUploads = useCallback(async () => {
    await drainQueue();
    const inflight = [...inflightRef.current.values()];
    if (inflight.length === 0) return;
    let timer: number | undefined;
    await Promise.race([
      Promise.allSettled(inflight),
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, STOP_FLUSH_MS);
      }),
    ]);
    clearTimeout(timer);
  }, [drainQueue]);

  const stop = useCallback(
    () =>
      runExclusive(async () => {
        const from = phaseRef.current;
        if (from !== 'recording' && from !== 'paused') return;
        clearPauseTimer();
        setPhase('stopping');
        await closePart();
        await writeRecording({
          parts: partsSnapshot(),
          durationMs: totalMs(),
        });
        await flushUploads();
        await finalize();
        setPhase('stopped');
      }),
    [
      closePart,
      finalize,
      flushUploads,
      partsSnapshot,
      runExclusive,
      setPhase,
      totalMs,
      writeRecording,
    ]
  );
  stopRef.current = stop;

  const retryFinalize = useCallback(
    () =>
      runExclusive(async () => {
        if (phaseRef.current !== 'stopped') return;
        await flushUploads();
        await finalize();
      }),
    [finalize, flushUploads, runExclusive]
  );

  // Switching mic mid-recording closes the part and opens a new one on the new device (MR-D7).
  const selectMic = useCallback(
    (deviceId: string | null) =>
      runExclusive(async () => {
        micRef.current = deviceId;
        deps.writeMic(deviceId);
        if (mountedRef.current) setSelectedMicId(deviceId);
        if (phaseRef.current !== 'recording') return;
        let stream: MediaStream;
        try {
          stream = await acquireStream(deviceId);
        } catch {
          return;
        }
        if (!mountedRef.current) {
          stopTracks(stream);
          return;
        }
        await closePart();
        if (!openPart(stream)) return;
        setMicFallback(false);
        await writeRecording({ parts: partsSnapshot(), heartbeat: true });
      }),
    [
      acquireStream,
      closePart,
      deps,
      openPart,
      partsSnapshot,
      runExclusive,
      writeRecording,
    ]
  );

  onTrackEndedRef.current = (part) => {
    void runExclusive(async () => {
      if (phaseRef.current !== 'recording' || activeRef.current !== part) {
        return;
      }
      await closePart();
      let stream: MediaStream;
      try {
        stream = await deps.getStream(null);
      } catch {
        // No mic left at all: hold the recording paused so it can resume or stop.
        setPhase('paused');
        setError('mic-lost');
        await writeRecording({
          status: 'paused',
          parts: partsSnapshot(),
          durationMs: totalMs(),
          heartbeat: true,
        });
        clearPauseTimer();
        pauseTimerRef.current = window.setTimeout(() => {
          void stopRef.current();
        }, PLC_RECORDING_PAUSE_LIMIT_MS);
        return;
      }
      if (!openPart(stream)) return;
      setMicFallback(true);
      await writeRecording({ parts: partsSnapshot(), heartbeat: true });
    });
  };

  // Elapsed clock and the 60-minute auto-stop.
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = window.setInterval(() => {
      const total = totalMs();
      setElapsedMs(total);
      if (total >= PLC_RECORDING_MAX_MS) void stopRef.current();
    }, 250);
    return () => clearInterval(id);
  }, [phase, totalMs]);

  // Heartbeat only while recording; pause writes one and stops (server contract).
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = window.setInterval(() => {
      void writeRecording({
        parts: partsSnapshot(),
        durationMs: totalMs(),
        heartbeat: true,
      });
    }, PLC_RECORDING_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [partsSnapshot, phase, totalMs, writeRecording]);

  const unsafeToLeave =
    phase === 'starting' ||
    phase === 'recording' ||
    phase === 'paused' ||
    phase === 'stopping' ||
    pendingUploads > 0;

  useEffect(() => {
    if (!unsafeToLeave) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsafeToLeave]);

  // Segments left by a dropped connection or an earlier tab go up on mount and whenever the network returns.
  useEffect(() => {
    const onOnline = () => void drainQueue();
    void drainQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [drainQueue]);

  useEffect(() => {
    if (!isSupported || !navigator.mediaDevices?.addEventListener) return;
    const onChange = () => void refreshMics();
    void refreshMics();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () =>
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [isSupported, refreshMics]);

  // Leaving mid-recording keeps the final segment; the server finalizes once heartbeats stop (MR-D8).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPauseTimer();
      const part = activeRef.current;
      if (part) {
        if (part.recorder.state !== 'inactive') part.recorder.stop();
        stopTracks(part.stream);
      }
    };
  }, []);

  return {
    isSupported,
    phase,
    recordingId,
    elapsedMs,
    lengthWarning: elapsedMs >= PLC_RECORDING_WARN_MS,
    micFallback,
    pendingUploads,
    error,
    mics,
    selectedMicId,
    start,
    pause,
    resume,
    stop,
    retryFinalize,
    selectMic,
    refreshMics,
    dismissMicFallback: () => setMicFallback(false),
  };
}
