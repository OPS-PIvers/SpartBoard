import type {
  DictationErrorCode,
  SpeechEngine,
  SpeechEngineCallbacks,
  SpeechEngineStartOptions,
} from './types';

interface RecognitionAlternative {
  readonly transcript: string;
}

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative | undefined;
}

interface RecognitionResultList {
  readonly length: number;
  readonly [index: number]: RecognitionResult | undefined;
}

export interface RecognitionResultEvent {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
}

export interface RecognitionErrorEvent {
  readonly error: string;
}

/** The part of the Web Speech API's SpeechRecognition this engine uses. */
export interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  /** Chrome 151+: the browser adds punctuation nobody spoke. */
  unspokenPunctuation?: boolean;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type BrowserRecognitionConstructor = new () => BrowserRecognition;

interface SpeechWindow {
  SpeechRecognition?: BrowserRecognitionConstructor;
  webkitSpeechRecognition?: BrowserRecognitionConstructor;
}

/** Callbacks plus the moment the microphone is live. */
export interface BrowserEngineCallbacks extends SpeechEngineCallbacks {
  onStart?: () => void;
}

export interface BrowserSpeechEngine extends SpeechEngine {
  start: (
    options: SpeechEngineStartOptions,
    callbacks: BrowserEngineCallbacks
  ) => void;
}

/** A session that ends sooner than this counts towards the restart guard. */
export const QUICK_END_MS = 1_000;
/** This many quick ends in a row stop the automatic restart. */
export const MAX_QUICK_ENDS = 3;
/** Wait before restarting after a quick end. */
export const QUICK_RESTART_DELAY_MS = 300;

function recognitionConstructor(): BrowserRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as Window & SpeechWindow;
  const ctor =
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  return typeof ctor === 'function' ? ctor : null;
}

/** True when this browser has built-in speech recognition (D6). */
export function isBrowserEngineSupported(): boolean {
  return recognitionConstructor() !== null;
}

/** Engine error to ours; null means the browser's report is not a failure. */
export function mapRecognitionError(error: string): DictationErrorCode | null {
  switch (error) {
    case 'no-speech':
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'mic-blocked';
    case 'audio-capture':
      return 'no-mic';
    case 'language-not-supported':
      return 'language-unsupported';
    case 'network':
      return 'network';
    default:
      return 'unknown';
  }
}

interface Session {
  recognition: BrowserRecognition;
  callbacks: BrowserEngineCallbacks;
  /** The student still wants to listen. */
  wanted: boolean;
  startedAt: number;
  quickEnds: number;
  /** Results already sent as final in this browser session. */
  finalCount: number;
  interim: string;
  restartTimer: ReturnType<typeof setTimeout> | null;
}

const transcriptOf = (result: RecognitionResult | undefined): string =>
  result?.[0]?.transcript ?? '';

/** The browser's built-in recognition as a SpeechEngine (D5), or null without it. */
export function createBrowserEngine(): BrowserSpeechEngine | null {
  const Recognition = recognitionConstructor();
  if (!Recognition) return null;

  let punctuates = false;
  try {
    punctuates = 'unspokenPunctuation' in new Recognition();
  } catch {
    punctuates = false;
  }

  let session: Session | null = null;

  const detach = (recognition: BrowserRecognition) => {
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  };

  const finish = (current: Session) => {
    if (current.restartTimer !== null) clearTimeout(current.restartTimer);
    detach(current.recognition);
    if (session === current) session = null;
    current.callbacks.onEnd();
  };

  const fail = (current: Session, code: DictationErrorCode) => {
    current.wanted = false;
    current.callbacks.onError(code);
  };

  const begin = (current: Session) => {
    current.startedAt = Date.now();
    current.finalCount = 0;
    current.interim = '';
    try {
      current.recognition.start();
    } catch {
      fail(current, 'unknown');
      finish(current);
    }
  };

  const onResult = (current: Session, event: RecognitionResultEvent) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = transcriptOf(result);
      if (!result?.isFinal) {
        interim += text;
        continue;
      }
      if (i < current.finalCount) continue;
      current.finalCount = i + 1;
      if (text.trim()) current.callbacks.onFinal(text.trim());
    }
    current.interim = interim.trim();
    current.callbacks.onInterim(current.interim);
  };

  const onEnd = (current: Session) => {
    // Words the browser never marked final still count.
    if (current.interim) {
      const leftover = current.interim;
      current.interim = '';
      current.callbacks.onFinal(leftover);
      current.callbacks.onInterim('');
    }
    if (!current.wanted) {
      finish(current);
      return;
    }
    const quick = Date.now() - current.startedAt < QUICK_END_MS;
    current.quickEnds = quick ? current.quickEnds + 1 : 0;
    if (current.quickEnds >= MAX_QUICK_ENDS) {
      finish(current);
      return;
    }
    if (!quick) {
      begin(current);
      return;
    }
    current.restartTimer = setTimeout(() => {
      current.restartTimer = null;
      if (session === current && current.wanted) begin(current);
    }, QUICK_RESTART_DELAY_MS);
  };

  const abort = () => {
    const current = session;
    if (!current) return;
    current.wanted = false;
    current.interim = '';
    if (current.restartTimer !== null) clearTimeout(current.restartTimer);
    current.restartTimer = null;
    detach(current.recognition);
    session = null;
    try {
      current.recognition.abort();
    } catch {
      // Already stopped.
    }
    current.callbacks.onEnd();
  };

  const stop = () => {
    const current = session;
    if (!current) return;
    current.wanted = false;
    if (current.restartTimer !== null) {
      finish(current);
      return;
    }
    try {
      current.recognition.stop();
    } catch {
      finish(current);
    }
  };

  const start = (
    options: SpeechEngineStartOptions,
    callbacks: BrowserEngineCallbacks
  ) => {
    abort();
    const recognition = new Recognition();
    recognition.lang = options.locale;
    recognition.continuous = true;
    recognition.interimResults = true;
    if ('unspokenPunctuation' in recognition)
      recognition.unspokenPunctuation = true;
    const current: Session = {
      recognition,
      callbacks,
      wanted: true,
      startedAt: 0,
      quickEnds: 0,
      finalCount: 0,
      interim: '',
      restartTimer: null,
    };
    recognition.onstart = () => current.callbacks.onStart?.();
    recognition.onresult = (event) => onResult(current, event);
    recognition.onerror = (event) => {
      const code = mapRecognitionError(event.error);
      if (code) fail(current, code);
    };
    recognition.onend = () => onEnd(current);
    session = current;
    begin(current);
  };

  return { punctuates, start, stop, abort };
}
