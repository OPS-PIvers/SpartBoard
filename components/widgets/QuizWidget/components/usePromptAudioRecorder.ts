// Records a teacher's spoken question prompt; prefers MP4 so iPads and Chromebooks can both play it.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export const PROMPT_AUDIO_MAX_SEC = 120;

const MIME_PREFERENCE = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
];

export type PromptAudioPhase = 'idle' | 'starting' | 'recording';

export interface PromptAudioTake {
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

export function pickPromptAudioMime(
  isSupported: (m: string) => boolean
): string {
  return MIME_PREFERENCE.find((m) => isSupported(m)) ?? '';
}

export function usePromptAudioRecorder(opts: {
  onTake: (take: PromptAudioTake) => void;
  onMicBlocked: () => void;
}) {
  const [phase, setPhase] = useState<PromptAudioPhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const mountedRef = useRef(true);
  const cancelStartRef = useRef(false);
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  const release = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec) {
      if (rec.state !== 'inactive') rec.stop();
      return;
    }
    // Still waiting on the mic permission: drop the start when it resolves.
    cancelStartRef.current = true;
    setPhase('idle');
  }, []);

  const start = useCallback(async () => {
    if (phase !== 'idle') return;
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      optsRef.current.onMicBlocked();
      return;
    }
    cancelStartRef.current = false;
    setPhase('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setPhase('idle');
      optsRef.current.onMicBlocked();
      return;
    }
    if (!mountedRef.current || cancelStartRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      cancelStartRef.current = false;
      return;
    }
    streamRef.current = stream;
    const mimeType = pickPromptAudioMime((m) =>
      MediaRecorder.isTypeSupported(m)
    );
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(
        stream,
        mimeType
          ? { mimeType, audioBitsPerSecond: 64000 }
          : { audioBitsPerSecond: 64000 }
      );
    } catch {
      release();
      setPhase('idle');
      optsRef.current.onMicBlocked();
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      const durationSec = Math.min(
        PROMPT_AUDIO_MAX_SEC,
        (Date.now() - startedAtRef.current) / 1000
      );
      release();
      recorderRef.current = null;
      setPhase('idle');
      setElapsed(0);
      const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0];
      const blob = new Blob(chunks, { type });
      if (mountedRef.current && blob.size > 0 && durationSec >= 0.5)
        optsRef.current.onTake({ blob, mimeType: type, durationSec });
    };
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    rec.start(1000);
    setElapsed(0);
    setPhase('recording');
    timerRef.current = window.setInterval(() => {
      const sec = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(sec);
      if (sec >= PROMPT_AUDIO_MAX_SEC) stop();
    }, 250);
  }, [phase, release, stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const rec = recorderRef.current;
      if (rec) {
        rec.onstop = null;
        if (rec.state !== 'inactive') rec.stop();
      }
      release();
    };
  }, [release]);

  return { phase, elapsed, start, stop };
}
