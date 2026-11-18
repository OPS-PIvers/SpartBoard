// The grade index session triggers only queue a recompute, so they load none of the grading code.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from '../firebaseAdmin';
import '../functionsInit';
import {
  SESSION_COLLECTION,
  isGradeIndexEnabled,
  markSessionDirty,
  sessionWriteMatters,
} from './gradeIndexQueue';
import type { GradeKind } from './types';

export type Doc = Record<string, unknown>;

export interface Change {
  before: { exists: boolean; data: () => Doc | undefined };
  after: { exists: boolean; data: () => Doc | undefined };
}

export interface WriteEvent {
  params: Record<string, string>;
  data?: Change;
  time?: string;
}

export const TRIGGER_OPTS = { memory: '256MiB' as const, maxInstances: 20 };

export const dataOf = (side: Change['before'] | undefined): Doc | undefined =>
  side?.exists ? (side.data() ?? undefined) : undefined;

export async function guarded(
  label: string,
  context: Doc,
  fn: () => Promise<void>
): Promise<void> {
  try {
    const db = admin.firestore();
    if (!(await isGradeIndexEnabled(db))) return;
    await fn();
  } catch (err) {
    logger.error(`gradeIndex: ${label} failed`, {
      ...context,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Session handler body: a relevant change queues a whole-session recompute. */
export async function handleSessionWrite(
  kind: GradeKind,
  event: WriteEvent
): Promise<void> {
  const { sessionId } = event.params;
  const before = dataOf(event.data?.before);
  const after = dataOf(event.data?.after);
  if (!sessionWriteMatters(before, after)) return;
  await guarded('session', { kind, sessionId }, () =>
    markSessionDirty(admin.firestore(), kind, sessionId)
  );
}

const sessionTrigger = (kind: GradeKind) =>
  onDocumentWritten(
    { ...TRIGGER_OPTS, document: `${SESSION_COLLECTION[kind]}/{sessionId}` },
    (event) => handleSessionWrite(kind, event as unknown as WriteEvent)
  );

export const gradeIndexQuizSession = sessionTrigger('quiz');
export const gradeIndexVideoSession = sessionTrigger('video-activity');
export const gradeIndexGuidedLearningSession =
  sessionTrigger('guided-learning');
export const gradeIndexFlashcardSession = sessionTrigger('flashcards');
export const gradeIndexProjectRun = sessionTrigger('projects');
export const gradeIndexMiniAppSession = sessionTrigger('mini-app');
export const gradeIndexWallSession = sessionTrigger('activity-wall');
export const gradeIndexWritingSession = sessionTrigger('writing');
