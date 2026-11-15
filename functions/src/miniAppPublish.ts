// Publishes an ended v2 Mini App assignment's results to its students, one copy each.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isRecord, readAnswerKey, readManifest } from './miniAppGrading';
import { assertViewAsAllowed } from './viewAsGuard';

const SESSIONS = 'mini_app_sessions';
const MAX_ID_LENGTH = 128;
const BATCH_SIZE = 400;

export type MiniAppScoreVisibility =
  'none' | 'score-only' | 'score-and-responses' | 'score-responses-and-answers';

const LEVELS: readonly MiniAppScoreVisibility[] = [
  'none',
  'score-only',
  'score-and-responses',
  'score-responses-and-answers',
];

export interface PublishMiniAppCaller {
  uid: string;
  studentRole: boolean;
}

export interface PublishedMiniAppItem {
  id: string;
  prompt: string;
  answer: unknown;
  correct: boolean | null;
  correctAnswer?: string;
}

/** What one student may read once results are published. */
export interface PublishedMiniAppResult {
  studentUid: string;
  visibility: Exclude<MiniAppScoreVisibility, 'none'>;
  publishedAt: number;
  score?: number;
  maxScore?: number;
  gradedBy?: 'server' | 'app';
  correctCount?: number;
  gradedCount?: number;
  items?: PublishedMiniAppItem[];
  details?: Record<string, unknown>;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function parsePublishInput(raw: unknown): {
  sessionId: string;
  visibility: MiniAppScoreVisibility;
} {
  const data = isRecord(raw) ? raw : {};
  const { sessionId, visibility } = data;
  if (
    typeof sessionId !== 'string' ||
    sessionId.length === 0 ||
    sessionId.length > MAX_ID_LENGTH ||
    sessionId.includes('/')
  )
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  if (!LEVELS.includes(visibility as MiniAppScoreVisibility))
    throw new HttpsError('invalid-argument', 'visibility is not valid.');
  return { sessionId, visibility: visibility as MiniAppScoreVisibility };
}

/** The key's correct value as one line, or undefined when it has none to show. */
export function correctAnswerText(entry: unknown): string | undefined {
  if (!isRecord(entry)) return undefined;
  const { correct, accepted } = entry;
  if (
    typeof correct === 'string' ||
    typeof correct === 'number' ||
    typeof correct === 'boolean'
  )
    return correct === true
      ? 'True'
      : correct === false
        ? 'False'
        : String(correct);
  if (
    Array.isArray(correct) &&
    correct.length > 0 &&
    correct.every((c) => typeof c === 'string' || typeof c === 'number')
  )
    return correct.join(', ');
  if (Array.isArray(accepted) && typeof accepted[0] === 'string')
    return accepted[0];
  return undefined;
}

/** One student's published copy, cut down to the level the teacher picked; null when there is nothing to show. */
export function buildPublishedResult(
  summary: Record<string, unknown>,
  attempt: Record<string, unknown> | null,
  session: Record<string, unknown>,
  keyRaw: unknown,
  visibility: Exclude<MiniAppScoreVisibility, 'none'>,
  nowMs: number
): PublishedMiniAppResult | null {
  if (typeof summary.studentUid !== 'string') return null;
  const best = isRecord(summary.best) ? summary.best : null;
  const scored =
    best && isFiniteNumber(best.score) && isFiniteNumber(best.maxScore)
      ? {
          score: best.score,
          maxScore: best.maxScore,
          ...(best.gradedBy === 'server'
            ? { gradedBy: 'server' as const }
            : best.gradedBy === 'app'
              ? { gradedBy: 'app' as const }
              : {}),
        }
      : null;
  const marks =
    best && Array.isArray(best.items) ? best.items.filter(isRecord) : [];
  const counts =
    marks.length > 0
      ? {
          correctCount: marks.filter((m) => m.correct === true).length,
          gradedCount: marks.length,
        }
      : {};
  const showResponses = visibility !== 'score-only';
  const showAnswers = visibility === 'score-responses-and-answers';

  const questions = readManifest(session.manifest);
  const key = readAnswerKey(keyRaw);
  const keyRecord =
    isRecord(keyRaw) && isRecord(keyRaw.questions) ? keyRaw.questions : {};
  const attemptItems =
    attempt && Array.isArray(attempt.items)
      ? attempt.items.filter(isRecord)
      : [];
  const items: PublishedMiniAppItem[] = showResponses
    ? attemptItems
        .filter(
          (i): i is Record<string, unknown> & { id: string } =>
            typeof i.id === 'string'
        )
        .map((i) => {
          const q = questions.find((m) => m.id === i.id);
          const correctAnswer =
            showAnswers && key.has(i.id)
              ? correctAnswerText(keyRecord[i.id])
              : undefined;
          return {
            id: i.id,
            prompt: q?.prompt ?? '',
            answer: i.answer ?? null,
            correct: typeof i.correct === 'boolean' ? i.correct : null,
            ...(correctAnswer !== undefined ? { correctAnswer } : {}),
          };
        })
    : [];
  // Free-form results: the app's extra data, or an older app's whole payload.
  const payload =
    attempt && isRecord(attempt.payload)
      ? attempt.payload
      : isRecord(summary.payload)
        ? summary.payload
        : null;
  const rawDetails =
    payload && isRecord(payload.data)
      ? payload.data
      : payload && !Array.isArray(payload.items)
        ? Object.fromEntries(
            Object.entries(payload).filter(([k]) => k !== 'completed')
          )
        : null;
  const details =
    showResponses && rawDetails && Object.keys(rawDetails).length > 0
      ? rawDetails
      : null;

  if (!scored && items.length === 0 && !details) return null;
  return {
    studentUid: summary.studentUid,
    visibility,
    publishedAt: nowMs,
    ...(scored ?? {}),
    ...(scored ? counts : {}),
    ...(items.length > 0 ? { items } : {}),
    ...(details ? { details } : {}),
  };
}

export async function handlePublishMiniAppScores(
  db: admin.firestore.Firestore,
  caller: PublishMiniAppCaller | null,
  rawInput: unknown,
  nowMs: number
): Promise<{ published: number }> {
  if (!caller || caller.studentRole)
    throw new HttpsError('unauthenticated', 'Sign in required.');
  const { sessionId, visibility } = parsePublishInput(rawInput);
  const sessionRef = db.collection(SESSIONS).doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists)
    throw new HttpsError('not-found', 'Assignment not found.');
  const session: Record<string, unknown> = sessionSnap.data() ?? {};
  if (session.teacherUid !== caller.uid)
    throw new HttpsError('permission-denied', 'Not your assignment.');
  if (session.resultsVersion !== 2 || session.mode === 'view-only')
    throw new HttpsError(
      'failed-precondition',
      'This assignment has no scores to publish.'
    );
  if (session.status !== 'ended')
    throw new HttpsError(
      'failed-precondition',
      'End the assignment before publishing scores.'
    );

  const publishedCol = sessionRef.collection('published');
  const writes: ((batch: admin.firestore.WriteBatch) => void)[] = [];
  const existing = await publishedCol.get();
  let published = 0;

  if (visibility === 'none') {
    for (const d of existing.docs) writes.push((b) => b.delete(d.ref));
  } else {
    const [submissions, keySnap] = await Promise.all([
      sessionRef.collection('submissions').get(),
      sessionRef.collection('private').doc('key').get(),
    ]);
    const keyRaw = keySnap.exists ? keySnap.data() : null;
    const kept = new Set<string>();
    for (const sub of submissions.docs) {
      const summary = sub.data();
      const best = isRecord(summary.best) ? summary.best : null;
      const attemptNo =
        best && isFiniteNumber(best.attemptNo)
          ? best.attemptNo
          : isFiniteNumber(summary.attemptCount)
            ? summary.attemptCount
            : null;
      const attemptSnap = attemptNo
        ? await sub.ref.collection('attempts').doc(String(attemptNo)).get()
        : null;
      const result = buildPublishedResult(
        summary,
        attemptSnap?.exists ? (attemptSnap.data() ?? null) : null,
        session,
        keyRaw,
        visibility,
        nowMs
      );
      if (!result) continue;
      kept.add(sub.id);
      published += 1;
      writes.push((b) => b.set(publishedCol.doc(sub.id), result));
    }
    for (const d of existing.docs)
      if (!kept.has(d.id)) writes.push((b) => b.delete(d.ref));
  }

  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH_SIZE)) w(batch);
    await batch.commit();
  }

  const fields =
    visibility === 'none'
      ? {
          scoreVisibility: 'none',
          scorePublishedAt: admin.firestore.FieldValue.delete(),
        }
      : { scoreVisibility: visibility, scorePublishedAt: nowMs };
  await sessionRef.update(fields);
  if (
    typeof session.assignmentId === 'string' &&
    session.assignmentId.length > 0
  ) {
    const row = db
      .collection('users')
      .doc(caller.uid)
      .collection('miniapp_assignments')
      .doc(session.assignmentId);
    if ((await row.get()).exists) await row.update(fields);
  }
  return { published };
}

export const publishMiniAppScoresV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    await assertViewAsAllowed(request, { outward: true });
    return handlePublishMiniAppScores(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            studentRole: request.auth.token.studentRole === true,
          }
        : null,
      request.data,
      Date.now()
    );
  }
);
