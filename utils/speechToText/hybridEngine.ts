import {
  SPEECH_CLIP_MAX_BASE64_CHARS,
  SPEECH_CLIP_MAX_SECONDS,
} from '@/config/speechToText';
import {
  callTranscribeSpeech,
  isPaidTranscribeOff,
  markPaidTranscribeOff,
  withTimeout,
  type TranscribeSpeechCall,
} from './paidCalls';
import type {
  SpeechEngine,
  SpeechEngineCallbacks,
  SpeechEngineStartOptions,
} from './types';

/** How long one transcribe call may take before the browser's text stands. */
export const TRANSCRIBE_TIMEOUT_MS = 8_000;
/** While nobody is speaking a fresh recording starts this often, so a clip never opens with a long silence. */
export const LEAD_IN_ROTATE_MS = 1_000;

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm'] as const;
const MAX_CLIP_MS = SPEECH_CLIP_MAX_SECONDS * 1_000;

export interface HybridEngineOptions {
  /** The student's assignment pointer id, sent with every clip. */
  assignmentId: string;
  transcribe?: TranscribeSpeechCall;
  timeoutMs?: number;
}

interface Clip {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

interface Take {
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
}

interface Tape {
  /** A phrase has started: keep the recording that holds its first word. */
  hold: () => void;
  /** The phrase finished: its clip, or null when there is nothing fit to send. */
  cut: () => Promise<Clip | null> | null;
  close: () => void;
}

/** True when this browser can record the microphone a second time, beside its own recognition. */
export function canRecordSpeech(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return PREFERRED_MIME_TYPES.find((type) =>
    MediaRecorder.isTypeSupported(type)
  );
}

const stopTracks = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) track.stop();
};

// Records short overlapping takes while idle, then keeps one take for the phrase.
function createTape(stream: MediaStream): Tape {
  const mimeType = pickMimeType();
  let takes: Take[] = [];
  let held = false;
  let tooLong = false;
  let closed = false;

  const startTake = (): void => {
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    );
    const take: Take = { recorder, chunks: [], startedAt: Date.now() };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) take.chunks.push(event.data);
    };
    recorder.start();
    takes.push(take);
  };

  // The audio is dropped the moment a take is not needed (D11).
  const discard = (take: Take | undefined): void => {
    if (!take) return;
    take.recorder.ondataavailable = null;
    take.recorder.onstop = null;
    take.chunks = [];
    try {
      if (take.recorder.state !== 'inactive') take.recorder.stop();
    } catch {
      // Already stopped.
    }
  };

  const finish = (take: Take): Promise<Clip | null> =>
    new Promise((resolve) => {
      const durationMs = Date.now() - take.startedAt;
      take.recorder.onstop = () => {
        const type =
          [take.recorder.mimeType, mimeType].find(Boolean) ?? 'audio/webm';
        const blob = new Blob(take.chunks, { type });
        take.chunks = [];
        resolve(blob.size > 0 ? { blob, mimeType: type, durationMs } : null);
      };
      try {
        take.recorder.stop();
      } catch {
        resolve(null);
      }
    });

  const safeStart = (): void => {
    try {
      startTake();
    } catch {
      close();
    }
  };

  const timer = setInterval(() => {
    if (closed) return;
    if (held) {
      const oldest = takes[0];
      if (oldest && Date.now() - oldest.startedAt > MAX_CLIP_MS) {
        tooLong = true;
        discard(takes.shift());
      }
      return;
    }
    safeStart();
    while (takes.length > 2) discard(takes.shift());
  }, LEAD_IN_ROTATE_MS);

  function close(): void {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    for (const take of takes) discard(take);
    takes = [];
    stopTracks(stream);
  }

  safeStart();

  return {
    hold: () => {
      if (closed || held) return;
      held = true;
      while (takes.length > 1) discard(takes.pop());
    },
    cut: () => {
      if (closed) return null;
      const spoken = held && !tooLong;
      const take = takes.shift();
      for (const other of takes) discard(other);
      takes = [];
      held = false;
      tooLong = false;
      safeStart();
      if (!take) return null;
      if (!spoken || Date.now() - take.startedAt > MAX_CLIP_MS) {
        discard(take);
        return null;
      }
      return finish(take);
    },
    close,
  };
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + step))
    );
  }
  return btoa(binary);
}

const wordCount = (text: string): number =>
  text.split(/\s+/).filter(Boolean).length;

/** A transcript far shorter or longer than what the browser heard is not trusted. */
export function plausibleRevision(heard: string, revised: string): boolean {
  const before = wordCount(heard);
  const after = wordCount(revised);
  if (after === 0) return false;
  if (after > before * 2 + 3) return false;
  return before < 4 || after * 2 >= before;
}

interface HybridSession {
  callbacks: SpeechEngineCallbacks;
  language: string;
  finals: number;
  tape: Tape | null;
  opening: boolean;
  ended: boolean;
  /** Aborted: answers still on their way are dropped. */
  cancelled: boolean;
}

/** The paid engine (D8): the browser's words live, then each phrase heard again by the AI transcriber. */
export function createHybridEngine(
  base: SpeechEngine,
  options: HybridEngineOptions
): SpeechEngine {
  const transcribe = options.transcribe ?? callTranscribeSpeech;
  const timeoutMs = options.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS;
  let session: HybridSession | null = null;

  const closeTape = (current: HybridSession): void => {
    current.tape?.close();
    current.tape = null;
  };

  const openTape = async (current: HybridSession): Promise<void> => {
    if (current.tape || current.opening || current.ended) return;
    if (isPaidTranscribeOff() || !canRecordSpeech()) return;
    current.opening = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return;
    }
    if (current.ended || isPaidTranscribeOff()) {
      stopTracks(stream);
      return;
    }
    try {
      current.tape = createTape(stream);
    } catch {
      stopTracks(stream);
    }
  };

  const revise = async (
    current: HybridSession,
    phrase: number,
    heard: string,
    pending: Promise<Clip | null>
  ): Promise<void> => {
    try {
      const clip = await pending;
      if (!clip || current.cancelled || isPaidTranscribeOff()) return;
      const audioBase64 = await toBase64(clip.blob);
      if (!audioBase64 || audioBase64.length > SPEECH_CLIP_MAX_BASE64_CHARS)
        return;
      const response = await withTimeout(
        transcribe({
          assignmentId: options.assignmentId,
          audioBase64,
          mimeType: clip.mimeType,
          durationMs: clip.durationMs,
          language: current.language,
        }),
        timeoutMs
      );
      if ('fallback' in response) {
        if (response.fallback === 'error') return;
        // D10: the free engine carries on and nothing more is recorded.
        markPaidTranscribeOff();
        if (session) closeTape(session);
        closeTape(current);
        return;
      }
      if (current.cancelled) return;
      const text = response.text.replace(/\s+/g, ' ').trim();
      if (!plausibleRevision(heard, text)) return;
      current.callbacks.onRevise?.(phrase, text);
    } catch {
      // Any failure keeps the browser's text.
    }
  };

  const start = (
    startOptions: SpeechEngineStartOptions,
    callbacks: SpeechEngineCallbacks
  ): void => {
    if (session) {
      session.ended = true;
      closeTape(session);
    }
    const current: HybridSession = {
      callbacks,
      language: startOptions.language ?? startOptions.locale.split('-')[0],
      finals: 0,
      tape: null,
      opening: false,
      ended: false,
      cancelled: false,
    };
    session = current;
    base.start(startOptions, {
      onStart: () => {
        callbacks.onStart?.();
        void openTape(current);
      },
      onInterim: (text) => {
        if (text.trim()) current.tape?.hold();
        callbacks.onInterim(text);
      },
      onFinal: (text) => {
        const phrase = current.finals++;
        if (isPaidTranscribeOff()) closeTape(current);
        // Cut before handing the text on: the caller may stop the engine from inside onFinal.
        const pending = current.tape?.cut();
        callbacks.onFinal(text);
        if (pending) void revise(current, phrase, text, pending);
      },
      onError: callbacks.onError,
      onEnd: () => {
        current.ended = true;
        closeTape(current);
        if (session === current) session = null;
        callbacks.onEnd();
      },
    });
  };

  return {
    punctuates: base.punctuates,
    start,
    stop: () => base.stop(),
    abort: () => {
      if (session) session.cancelled = true;
      base.abort();
    },
  };
}
