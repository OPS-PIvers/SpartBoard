// Mirrors the Flashcards Speak lookup contract in types.ts (docs/multilingual-pronunciation-engine.md §5).
export type SpeakLanguage = 'es' | 'de' | 'en';
export type SpeakDialect = 'es-419' | 'es-ES' | 'de-DE' | 'en-US';

export interface FlashcardSpeakReference {
  dialect: SpeakDialect;
  tokens: string[];
  /** Accepted 0-based syllable indices; [] means not stress-judged. */
  stress: number[];
  /** Flat [start, end) pairs into the spoken variant, one pair per token. */
  letterSpans?: number[];
  /** Absent means espeak; voice refs are a Cloud TTS voice's reading and carry no letterSpans. */
  source?: 'espeak' | 'voice';
  /** What was looked up, when it isn't the term's first variant ("el guía" for "el/la guía"). */
  text?: string;
  /** 0-based indices of tokens that end a word inside a phrase, so word-final sound rules apply there too. */
  wordEnds?: number[];
}

export type FlashcardSpeakStatus = 'ready' | 'needs-review' | 'unavailable';
export type FlashcardSpeakReason =
  | 'multi-word'
  | 'unrenderable'
  | 'untokenizable'
  | 'g2p-disagree'
  | 'stress-disagree'
  | 'language-switch'
  | 'lookup-failed'
  | 'set-too-large';

export interface FlashcardCardSpeak {
  term: string;
  refs: FlashcardSpeakReference[];
  g2pVersion: string;
  status: FlashcardSpeakStatus;
  reasons?: FlashcardSpeakReason[];
  dialects?: SpeakDialect[];
  confirmedAt?: number;
  ipaOverride?: Partial<Record<SpeakDialect, string>>;
}

export interface SpeakLookupTerm {
  cardId: string;
  term: string;
  ipaOverride?: Partial<Record<SpeakDialect, string>>;
}

export interface SpeakLookupInput {
  language: SpeakLanguage;
  dialects: SpeakDialect[];
  terms: SpeakLookupTerm[];
}

export interface SpeakLookupOutput {
  g2pVersion: string;
  cards: Record<string, FlashcardCardSpeak>;
}
