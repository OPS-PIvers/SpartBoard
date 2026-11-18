// The grade index queue and kill switch, kept free of grading code so the session triggers stay small.
import type * as admin from '../firebaseAdmin';
import type { GradeKind } from './types';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

export const GRADE_INDEX_QUEUE = 'grade_index_sessions';
export const GRADE_INDEX_SETTINGS_PATH = 'admin_settings/gradebook_index';

// Copy of GRADEBOOK_SESSION_COLLECTIONS so the session triggers skip gradebookCore; gradeIndexQueue.test.ts keeps them equal.
export const SESSION_COLLECTION: Record<GradeKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  flashcards: 'flashcard_sessions',
  projects: 'project_runs',
  'mini-app': 'mini_app_sessions',
  'activity-wall': 'activity_wall_sessions',
  writing: 'writing_assignment_sessions',
};

let enabledCache: { value: boolean; at: number } | null = null;
const ENABLED_TTL_MS = 60_000;

/** The org-wide kill switch; the index writes nothing until an admin turns it on. */
export async function isGradeIndexEnabled(
  db: Firestore,
  now = Date.now()
): Promise<boolean> {
  if (enabledCache && now - enabledCache.at < ENABLED_TTL_MS)
    return enabledCache.value;
  const snap = await db.doc(GRADE_INDEX_SETTINGS_PATH).get();
  const value = snap.data()?.enabled === true;
  enabledCache = { value, at: now };
  return value;
}

export function __resetGradeIndexEnabledCache(): void {
  enabledCache = null;
}

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Doc)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stableStringify(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Session fields whose change reshapes every row (D10 whole-session recompute). */
const SESSION_WATCHED = [
  'teacherUid',
  'title',
  'quizTitle',
  'assignmentName',
  'activityTitle',
  'appTitle',
  'prompt',
  'rosterIds',
  'classIds',
  'classId',
  'periodAccess',
  'openAt',
  'dueAt',
  'closeAt',
  'dueAtByClassId',
  'individualTargeting',
  'scorePublishedAt',
  'scoreVisibility',
  'publicSteps',
  'publicQuestions',
  'questionsInContent',
  'sections',
  'kind',
  'workKind',
  'assignmentId',
];

export function sessionWriteMatters(
  before: Doc | undefined,
  after: Doc | undefined
): boolean {
  if (!before || !after) return true;
  return SESSION_WATCHED.some(
    (f) => stableStringify(before[f]) !== stableStringify(after[f])
  );
}

/** Queues a whole-session recompute, oldest first; an entry already backing off keeps its backoff. Entries queued before the key carried a kind are keyed by session id alone. */
export async function markSessionDirty(
  db: Firestore,
  kind: GradeKind,
  sessionId: string,
  now = Date.now()
): Promise<void> {
  await db
    .collection(GRADE_INDEX_QUEUE)
    .doc(`${kind}__${sessionId}`)
    .set({ kind, sessionId, dirtyAt: now }, { merge: true });
}
