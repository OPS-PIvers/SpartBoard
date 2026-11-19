/** Feature flag gating the Speech to text accommodation (docs/plans/SPEECH_TO_TEXT.md D16). */
export const SPEECH_TO_TEXT_FEATURE = 'speech-to-text' as const;

export type DictationStatus = 'idle' | 'starting' | 'listening';

export type DictationErrorCode =
  'mic-blocked' | 'no-mic' | 'language-unsupported' | 'network' | 'unknown';

export interface SpeechEngineCallbacks {
  /** Words heard so far for the phrase in progress; replaces the last interim text. */
  onInterim: (text: string) => void;
  /** A finished phrase, raw from the engine. */
  onFinal: (text: string) => void;
  /** The microphone is live. */
  onStart?: () => void;
  onError: (code: DictationErrorCode) => void;
  /** The engine stopped listening, by request or on its own. */
  onEnd: () => void;
}

export interface SpeechEngineStartOptions {
  /** Recognition locale, such as `en-US`. */
  locale: string;
}

/** One way of turning speech into text (D7). */
export interface SpeechEngine {
  /** True when the engine punctuates on its own, so spoken punctuation rules stay off. */
  readonly punctuates: boolean;
  start: (
    options: SpeechEngineStartOptions,
    callbacks: SpeechEngineCallbacks
  ) => void;
  /** Finish the phrase in progress, then end. */
  stop: () => void;
  /** End now and drop the phrase in progress. */
  abort: () => void;
}

export interface UseDictationOptions {
  /** False keeps the hook inert: no engine is created and `supported` is false. */
  enabled: boolean;
  /** App language codes the student may dictate in, default first (see `dictationLanguages`). */
  languages: readonly string[];
  /** Stop after one phrase, for fill-in-the-blank. */
  singlePhrase?: boolean;
  /** Finished text, already punctuated and capitalised, ready to insert. */
  onCommit: (text: string) => void;
  /** The student said "undo that": remove the last committed text. */
  onUndo?: (text: string) => void;
  /** Text before the caret, so capitalisation and spacing fit what is already written. */
  textBefore?: () => string;
  /** Signed-in students only: lets the paid engine run when an admin has it on. */
  paid?: PaidDictation;
}

export interface DictationController {
  /** False when the browser has no speech recognition; the Dictate button hides (D6). */
  supported: boolean;
  status: DictationStatus;
  error: DictationErrorCode | null;
  /** Words heard for the phrase in progress, not yet committed. */
  interim: string;
  /** App language code in use. */
  language: string;
  languages: readonly string[];
  setLanguage: (code: string) => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/** What a text box needs to offer dictation. */
export interface EditorDictation {
  /** App language codes, default first. */
  languages: readonly string[];
  /** Called just before dictated text goes into the box, so the caller can label the edit. */
  onInsert?: (text: string) => void;
  /** Signed-in students only: lets the paid engine and Tidy up run when an admin has them on. */
  paid?: PaidDictation;
}

/** Why a paid call was not served; the student carries on with the free engine (D10). */
export type PaidDictationFallback = 'off' | 'cap' | 'ineligible' | 'error';

/** `transcribeSpeechV1` request: one short clip of speech, never stored (D8, D11). */
export interface TranscribeSpeechRequest {
  /** The student's assignment pointer id, proving the accommodation. */
  assignmentId: string;
  audioBase64: string;
  /** Such as `audio/webm;codecs=opus`. */
  mimeType: string;
  durationMs: number;
  /** App language code the student is dictating in. */
  language: string;
}

/** `tidyDictationV1` request: one dictated passage to punctuate (D9). */
export interface TidyDictationRequest {
  assignmentId: string;
  text: string;
  language: string;
}

/** Both callables answer with text, or a fallback and no text. */
export type PaidDictationResponse =
  { text: string } | { fallback: PaidDictationFallback };

/** Paid extras for one text box; absent keeps dictation on the free engine. */
export interface PaidDictation {
  assignmentId: string;
}
