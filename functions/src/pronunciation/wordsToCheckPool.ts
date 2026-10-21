// Pure pooling for the admin Words to check list; no runtime imports, so client parity tests can load it.
import type { FlashcardCardSpeak, SpeakLanguage } from './types';

// Same cut-offs as the per-assignment list in utils/flashcardResults.ts (parity test guards them).
export const SPEAK_WORDS_TO_CHECK_MIN_STUDENTS = 5;
export const SPEAK_WORDS_TO_CHECK_FAIL_SHARE = 0.6;
export const MAX_SPEAK_SESSIONS = 1000;
export const MAX_WORDS_TO_CHECK = 200;
const SPEAK_LANGUAGES: readonly SpeakLanguage[] = ['es', 'de', 'en'];

export interface SpeakCheckCard {
  id: string;
  term: string;
  definition: string;
  speak: FlashcardCardSpeak;
}

export interface SpeakCheckSession {
  id: string;
  termLanguage: string;
  definitionLanguage: string;
  speak: Record<string, unknown>;
  cards: SpeakCheckCard[];
  progress: { studentUid: string; lastActiveAt: number; speak: unknown }[];
}

export interface SpeakWordToCheck {
  key: string;
  language: SpeakLanguage;
  term: string;
  definition: string;
  students: number;
  missed: number;
  assignments: number;
  /** The card and stamp from the assignment with the most students, so an admin can try it as students did. */
  card: SpeakCheckCard;
  termLanguage: string;
  definitionLanguage: string;
  settings: Record<string, unknown>;
}

export interface SpeakWordsToCheckResult {
  asOf: number;
  assignments: number;
  truncated: boolean;
  words: SpeakWordToCheck[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Progress is client-written, so every number is clamped to a small whole count.
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), 100000)
    : 0;

export const speakLanguageOfTerm = (
  termLanguage: unknown
): SpeakLanguage | null => {
  const primary = (typeof termLanguage === 'string' ? termLanguage : '')
    .trim()
    .split(/[-_]/)[0]
    .toLowerCase();
  return (SPEAK_LANGUAGES as readonly string[]).includes(primary)
    ? (primary as SpeakLanguage)
    : null;
};

const SPEAK_DIALECTS: Record<SpeakLanguage, readonly string[]> = {
  es: ['es-419', 'es-ES'],
  de: ['de-DE'],
  en: ['en-US'],
};

/** Keeps a stored stamp playable: known dialects (or the language's first) and a groups map. */
export const playableSpeakSettings = (
  raw: Record<string, unknown>,
  language: SpeakLanguage
): Record<string, unknown> => {
  const allowed = SPEAK_DIALECTS[language];
  const dialects = (Array.isArray(raw.dialects) ? raw.dialects : []).filter(
    (d): d is string => typeof d === 'string' && allowed.includes(d)
  );
  return {
    ...raw,
    dialects: dialects.length > 0 ? dialects : [allowed[0]],
    groups: isRecord(raw.groups) ? raw.groups : {},
  };
};

const wordKey = (language: SpeakLanguage, term: string): string =>
  `${language}:${term.normalize('NFC').trim().toLocaleLowerCase(language)}`;

/** Only cards Speak can score; others are skipped for students too. */
export const parseSpeakCards = (raw: unknown): SpeakCheckCard[] =>
  (Array.isArray(raw) ? raw : []).flatMap((card): SpeakCheckCard[] => {
    if (!isRecord(card) || !isRecord(card.speak)) return [];
    const { id, term, definition, speak } = card;
    if (typeof id !== 'string' || typeof term !== 'string') return [];
    if (speak.status === 'unavailable' || !Array.isArray(speak.refs)) return [];
    if (speak.term !== term) return [];
    const hasTokens = speak.refs.some(
      (ref: unknown) =>
        isRecord(ref) && Array.isArray(ref.tokens) && ref.tokens.length > 0
    );
    if (!hasTokens) return [];
    return [
      {
        id,
        term,
        definition: typeof definition === 'string' ? definition : '',
        speak: speak as unknown as FlashcardCardSpeak,
      },
    ];
  });

interface WordTally {
  language: SpeakLanguage;
  // Latest round per student across assignments: true when it was missed.
  latest: Map<string, { at: number; missed: boolean }>;
  sessions: Map<string, number>;
  best: { session: SpeakCheckSession; card: SpeakCheckCard; students: number };
}

/** Pools each student's last round per word; a student in two assignments counts once, by the one they used last. */
export function poolSpeakWordsToCheck(
  sessions: readonly SpeakCheckSession[]
): SpeakWordToCheck[] {
  const tallies = new Map<string, WordTally>();
  for (const session of sessions) {
    const language = speakLanguageOfTerm(session.termLanguage);
    if (!language) continue;
    for (const card of session.cards) {
      const key = wordKey(language, card.term);
      let students = 0;
      const tally: WordTally = tallies.get(key) ?? {
        language,
        latest: new Map<string, { at: number; missed: boolean }>(),
        sessions: new Map<string, number>(),
        best: { session, card, students: -1 },
      };
      for (const result of session.progress) {
        const speak = isRecord(result.speak) ? result.speak : {};
        const progress = speak[card.id];
        if (!isRecord(progress)) continue;
        if (count(progress.c) + count(progress.w) === 0) continue;
        students += 1;
        // A failed round resets the streak, so s 0 means the last round failed.
        const missed = count(progress.s) === 0;
        const prior = tally.latest.get(result.studentUid);
        if (!prior || result.lastActiveAt >= prior.at) {
          tally.latest.set(result.studentUid, {
            at: result.lastActiveAt,
            missed,
          });
        }
      }
      if (students > 0) tally.sessions.set(session.id, students);
      if (students > tally.best.students) {
        tally.best = { session, card, students };
      }
      tallies.set(key, tally);
    }
  }
  const words: SpeakWordToCheck[] = [];
  for (const [key, tally] of tallies) {
    const students = tally.latest.size;
    let missed = 0;
    for (const entry of tally.latest.values()) if (entry.missed) missed += 1;
    if (students < SPEAK_WORDS_TO_CHECK_MIN_STUDENTS) continue;
    if (missed / students < SPEAK_WORDS_TO_CHECK_FAIL_SHARE) continue;
    const { session, card } = tally.best;
    words.push({
      key,
      language: tally.language,
      term: card.term,
      definition: card.definition,
      students,
      missed,
      assignments: tally.sessions.size,
      card,
      termLanguage: session.termLanguage,
      definitionLanguage: session.definitionLanguage,
      settings: playableSpeakSettings(session.speak, tally.language),
    });
  }
  return words
    .sort(
      (a, b) =>
        b.missed / b.students - a.missed / a.students ||
        b.students - a.students ||
        a.term.localeCompare(b.term)
    )
    .slice(0, MAX_WORDS_TO_CHECK);
}
