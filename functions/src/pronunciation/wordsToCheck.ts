// Admin "Words to check" (F10 pooled): Speak words most students miss across every assignment in the district.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import '../functionsInit';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { assertViewAsAllowed } from '../viewAsGuard';
import { mapWithConcurrency } from '../adminActiveStudents';
import { FLASHCARDS_SPEAK_FEATURE_ID } from './lookup';
import {
  MAX_SPEAK_SESSIONS,
  parseSpeakCards,
  poolSpeakWordsToCheck,
  type SpeakCheckSession,
  type SpeakWordsToCheckResult,
} from './wordsToCheckPool';

export * from './wordsToCheckPool';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Progress is client-written, so every number is clamped to a small whole count.
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), 100000)
    : 0;

async function loadSpeakSessions(
  db: admin.firestore.Firestore
): Promise<{ sessions: SpeakCheckSession[]; truncated: boolean }> {
  // Every stamped session carries speak.locked; past the cap, the newest assignments win.
  const snap = await db
    .collection('flashcard_sessions')
    .where('speak.locked', 'in', [true, false])
    .orderBy('createdAt', 'desc')
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
