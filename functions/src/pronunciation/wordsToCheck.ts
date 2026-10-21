// Admin "Words to check" (F10 pooled): Speak words most students miss across every assignment in the district.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import '../functionsInit';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { assertViewAsAllowed } from '../viewAsGuard';
import { mapWithConcurrency } from '../adminActiveStudents';
import { FLASHCARDS_SPEAK_FEATURE_ID } from './lookup';
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

/** Pools each student's last round per word; a student in two assignments counts once, by their latest. */
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
      settings: session.speak,
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

async function loadSpeakSessions(
  db: admin.firestore.Firestore
): Promise<{ sessions: SpeakCheckSession[]; truncated: boolean }> {
  // Every stamped session carries speak.locked; sessions without a stamp never show Speak.
  const snap = await db
    .collection('flashcard_sessions')
    .where('speak.locked', 'in', [true, false])
    .limit(MAX_SPEAK_SESSIONS)
    .get();
  const sessions: SpeakCheckSession[] = [];
  await mapWithConcurrency(snap.docs, 16, async (doc) => {
    const data = doc.data();
    if (!isRecord(data.speak)) return;
    const rawCards: unknown =
      data.cardsInContent === true
        ? (await doc.ref.collection('content').doc('cards').get()).data()?.cards
        : data.cards;
    const cards = parseSpeakCards(rawCards);
    if (cards.length === 0) return;
    const progressSnap = await doc.ref
      .collection('progress')
      .select('speak', 'lastActiveAt')
      .get();
    sessions.push({
      id: doc.id,
      termLanguage:
        typeof data.termLanguage === 'string' ? data.termLanguage : '',
      definitionLanguage:
        typeof data.definitionLanguage === 'string'
          ? data.definitionLanguage
          : '',
      speak: data.speak,
      cards,
      progress: progressSnap.docs.map((p) => ({
        studentUid: p.id,
        lastActiveAt: count(p.get('lastActiveAt')),
        speak: p.get('speak') as unknown,
      })),
    });
  });
  // Stable pick of each word's sample assignment regardless of fetch order.
  sessions.sort((a, b) => a.id.localeCompare(b.id));
  return {
    sessions,
    truncated: snap.size >= MAX_SPEAK_SESSIONS,
  };
}

export const listSpeakWordsToCheckV1 = onCall(
  { memory: '512MiB', timeoutSeconds: 120, cors: ALLOWED_ORIGINS },
  async (request): Promise<SpeakWordsToCheckResult> => {
    assertViewAsAllowed(request, { read: true });
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const email =
      typeof auth.token.email === 'string'
        ? auth.token.email.toLowerCase()
        : '';
    if (
      !email ||
      auth.token.email_verified !== true ||
      auth.token.studentRole === true ||
      auth.token.firebase?.sign_in_provider === 'anonymous'
    ) {
      throw new HttpsError('permission-denied', 'Admins only.');
    }
    const db = admin.firestore();
    if (!(await db.collection('admins').doc(email).get()).exists) {
      throw new HttpsError('permission-denied', 'Admins only.');
    }
    const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
    if (
      !(await isGlobalFeatureGranted(
        db,
        FLASHCARDS_SPEAK_FEATURE_ID,
        email,
        auth.uid
      ))
    ) {
      throw new HttpsError('permission-denied', 'Speak is not turned on.');
    }
    const { sessions, truncated } = await loadSpeakSessions(db);
    return {
      asOf: Date.now(),
      assignments: sessions.length,
      truncated,
      words: poolSpeakWordsToCheck(sessions),
    };
  }
);
