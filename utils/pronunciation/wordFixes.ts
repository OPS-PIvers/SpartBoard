// District Speak word fixes (admin_settings/flashcardsSpeakWordFixes): extra accepted readings, judged like voice refs, or skip the word.
import type {
  FlashcardCard,
  FlashcardSpeakReference,
  SpeakDialect,
  SpeakLanguage,
} from '@/types';
import { countSyllables } from './stress';

export const SPEAK_WORD_FIXES_DOC = 'flashcardsSpeakWordFixes';
export const MAX_SPEAK_WORD_FIXES = 300;
export const MAX_ACCEPTED_PER_WORD = 6;
const MAX_TOKENS = 64;

export interface SpeakWordAccepted {
  id: string;
  kind: 'spelling' | 'recording';
  /** The sounds-like spelling an admin typed; absent for a recording. */
  spelling?: string;
  refs: FlashcardSpeakReference[];
  addedAt: number;
}

export interface SpeakWordFix {
  language: SpeakLanguage;
  term: string;
  skip: boolean;
  accepted: SpeakWordAccepted[];
  updatedAt: number;
}

export type SpeakWordFixes = Record<string, SpeakWordFix>;

export const LANGUAGE_DIALECTS: Record<SpeakLanguage, readonly SpeakDialect[]> =
  {
    es: ['es-419', 'es-ES'],
    de: ['de-DE'],
    en: ['en-US'],
  };

/** Same key the server pools Words to check by (functions/src/pronunciation/wordsToCheck.ts). */
export const speakWordKey = (language: SpeakLanguage, term: string): string =>
  `${language}:${term.normalize('NFC').trim().toLocaleLowerCase(language)}`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const parseRef = (
  raw: unknown,
  language: SpeakLanguage
): FlashcardSpeakReference | null => {
  if (!isRecord(raw)) return null;
  const dialect = raw.dialect as SpeakDialect;
  if (!LANGUAGE_DIALECTS[language].includes(dialect)) return null;
  const tokens = Array.isArray(raw.tokens)
    ? raw.tokens.filter((t): t is string => typeof t === 'string' && t !== '')
    : [];
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) return null;
  const stress = Array.isArray(raw.stress)
    ? raw.stress.filter((n): n is number => Number.isInteger(n) && n >= 0)
    : [];
  return { dialect, tokens, stress, source: 'voice' };
};

const isLanguage = (v: unknown): v is SpeakLanguage =>
  v === 'es' || v === 'de' || v === 'en';

/** Admin-written but read by every student, so anything off-shape is dropped. */
export function normalizeSpeakWordFixes(raw: unknown): SpeakWordFixes {
  const words = isRecord(raw) && isRecord(raw.words) ? raw.words : {};
  const out: SpeakWordFixes = {};
  for (const [key, value] of Object.entries(words).slice(
    0,
    MAX_SPEAK_WORD_FIXES
  )) {
    if (!isRecord(value) || !isLanguage(value.language)) continue;
    if (typeof value.term !== 'string' || !value.term.trim()) continue;
    const language = value.language;
    if (speakWordKey(language, value.term) !== key) continue;
    const accepted = (Array.isArray(value.accepted) ? value.accepted : [])
      .slice(0, MAX_ACCEPTED_PER_WORD)
      .flatMap((item): SpeakWordAccepted[] => {
        if (!isRecord(item) || typeof item.id !== 'string') return [];
        if (item.kind !== 'spelling' && item.kind !== 'recording') return [];
        const refs = (Array.isArray(item.refs) ? item.refs : [])
          .map((ref) => parseRef(ref, language))
          .filter((ref): ref is FlashcardSpeakReference => ref !== null);
        if (refs.length === 0) return [];
        return [
          {
            id: item.id,
            kind: item.kind,
            ...(typeof item.spelling === 'string'
              ? { spelling: item.spelling }
              : {}),
            refs,
            addedAt: typeof item.addedAt === 'number' ? item.addedAt : 0,
          },
        ];
      });
    const skip = value.skip === true;
    if (!skip && accepted.length === 0) continue;
    out[key] = {
      language,
      term: value.term,
      skip,
      accepted,
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    };
  }
  return out;
}

/** Adds each fixed word's accepted readings beside the card's own reading for that accent, or marks it unavailable when skipped. */
export function applySpeakWordFixes(
  cards: FlashcardCard[],
  language: SpeakLanguage,
  fixes: SpeakWordFixes
): FlashcardCard[] {
  if (Object.keys(fixes).length === 0) return cards;
  let changed = false;
  const next = cards.map((card) => {
    const speak = card.speak;
    const fix = speak ? fixes[speakWordKey(language, card.term)] : undefined;
    if (!fix || !speak || speak.term !== card.term) return card;
    if (fix.skip) {
      changed = true;
      return { ...card, speak: { ...speak, status: 'unavailable' as const } };
    }
    // Only accents the card already reads, so a fix never replaces its own reading or letter marks.
    const extra = fix.accepted
      .flatMap((a) => a.refs)
      .flatMap((ref) => {
        const base = speak.refs.find(
          (r) => r.dialect === ref.dialect && r.source !== 'voice'
        );
        if (!base) return [];
        // Stress carries over as voice readings do, so a fix never switches stress judging off.
        const stress =
          ref.stress.length === 0 &&
          countSyllables(ref.tokens) === countSyllables(base.tokens)
            ? [...base.stress]
            : ref.stress;
        return [{ ...ref, stress }];
      });
    if (extra.length === 0) return card;
    changed = true;
    return { ...card, speak: { ...speak, refs: [...speak.refs, ...extra] } };
  });
  return changed ? next : cards;
}

const UNUSABLE = new Set(['<pad>', '<s>', '</s>', '<unk>', '??']);

/** Readings of what the recognizer heard, one per accent of the language; null when any sound is unusable. */
export function heardReferences(
  symbols: readonly string[],
  language: SpeakLanguage,
  vocab: Readonly<Record<string, number>>
): FlashcardSpeakReference[] | null {
  const tokens = symbols.filter((s) => s !== '|');
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) return null;
  if (!tokens.every((s) => s in vocab && !UNUSABLE.has(s))) return null;
  return LANGUAGE_DIALECTS[language].map((dialect) => ({
    dialect,
    tokens,
    stress: [],
    source: 'voice' as const,
  }));
}
