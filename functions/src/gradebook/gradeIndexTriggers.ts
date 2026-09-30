// Firestore triggers and the scheduled worker that keep `grade_index` and `student_grades` current (GRADEBOOK.md D10, D37).
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import '../functionsInit';
import {
  SESSION_COLLECTION,
  STUDENT_SUBCOLLECTION,
  applyDocWrite,
  drainDirtySessions,
  isGradeIndexEnabled,
  markSessionDirty,
  sessionWriteMatters,
  stableStringify,
} from './gradeIndex';
import {
  GRADEBOOK_COLUMNS,
  GRADEBOOK_MARKS,
  configPathFor,
  projectRow,
  reprojectRows,
  rowsForClass,
  rowsForSession,
} from './gradeProjection';
import { GRADE_INDEX } from './gradeIndex';
import type { GradeIndexRow, GradeKind } from './types';

type Doc = Record<string, unknown>;

interface Change {
  before: { exists: boolean; data: () => Doc | undefined };
  after: { exists: boolean; data: () => Doc | undefined };
}

interface WriteEvent {
  params: Record<string, string>;
  data?: Change;
}

const TRIGGER_OPTS = { memory: '256MiB' as const, maxInstances: 20 };

const dataOf = (side: Change['before'] | undefined): Doc | undefined =>
  side?.exists ? (side.data() ?? undefined) : undefined;

async function guarded(
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

/** Per-student doc handler body, exported for tests. */
export async function handleStudentDocWrite(
  kind: GradeKind,
  event: WriteEvent
): Promise<void> {
  const { sessionId, docId } = event.params;
  await guarded('student doc', { kind, sessionId, docId }, async () => {
    await applyDocWrite(admin.firestore(), {
      kind,
      sessionId,
      docId,
      before: dataOf(event.data?.before),
      after: dataOf(event.data?.after),
    });
  });
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

const studentDocTrigger = (kind: GradeKind) =>
  onDocumentWritten(
    {
      ...TRIGGER_OPTS,
      document: `${SESSION_COLLECTION[kind]}/{sessionId}/${STUDENT_SUBCOLLECTION[kind]}/{docId}`,
    },
    (event) => handleStudentDocWrite(kind, event as unknown as WriteEvent)
  );

const sessionTrigger = (kind: GradeKind) =>
  onDocumentWritten(
    { ...TRIGGER_OPTS, document: `${SESSION_COLLECTION[kind]}/{sessionId}` },
    (event) => handleSessionWrite(kind, event as unknown as WriteEvent)
  );

export const gradeIndexQuizResponse = studentDocTrigger('quiz');
export const gradeIndexVideoResponse = studentDocTrigger('video-activity');
export const gradeIndexGuidedLearningResponse =
  studentDocTrigger('guided-learning');
export const gradeIndexFlashcardProgress = studentDocTrigger('flashcards');
export const gradeIndexProjectGrade = studentDocTrigger('projects');
export const gradeIndexMiniAppSubmission = studentDocTrigger('mini-app');
export const gradeIndexWallSubmission = studentDocTrigger('activity-wall');

export const gradeIndexQuizSession = sessionTrigger('quiz');
export const gradeIndexVideoSession = sessionTrigger('video-activity');
export const gradeIndexGuidedLearningSession =
  sessionTrigger('guided-learning');
export const gradeIndexFlashcardSession = sessionTrigger('flashcards');
export const gradeIndexProjectRun = sessionTrigger('projects');
export const gradeIndexMiniAppSession = sessionTrigger('mini-app');
export const gradeIndexWallSession = sessionTrigger('activity-wall');

/** Key or tag edits live off the session, so they queue the session themselves. */
export async function handleSideDocWrite(
  kind: GradeKind,
  sessionId: string,
  event: WriteEvent,
  fields: string[] | null
): Promise<void> {
  const before = dataOf(event.data?.before);
  const after = dataOf(event.data?.after);
  if (
    fields &&
    before &&
    after &&
    fields.every(
      (f) => stableStringify(before[f]) === stableStringify(after[f])
    )
  )
    return;
  await guarded('side doc', { kind, sessionId }, () =>
    markSessionDirty(admin.firestore(), kind, sessionId)
  );
}

export const gradeIndexQuizKey = onDocumentWritten(
  {
    ...TRIGGER_OPTS,
    document: 'users/{uid}/quiz_assignments/{assignmentId}/key/{keyDoc}',
  },
  (event) =>
    handleSideDocWrite(
      'quiz',
      event.params.assignmentId,
      event as unknown as WriteEvent,
      ['questions']
    )
);

export const gradeIndexQuizAssignment = onDocumentWritten(
  { ...TRIGGER_OPTS, document: 'users/{uid}/quiz_assignments/{assignmentId}' },
  (event) =>
    handleSideDocWrite(
      'quiz',
      event.params.assignmentId,
      event as unknown as WriteEvent,
      [
        'questionSnapshot',
        'dueAtByRosterId',
        'overridesByStudentUid',
        'localizedFibAnswers',
        'servedLanguageByStudentUid',
      ]
    )
);

export const gradeIndexVideoKey = onDocumentWritten(
  {
    ...TRIGGER_OPTS,
    document: 'video_activity_sessions/{sessionId}/key/{keyDoc}',
  },
  (event) =>
    handleSideDocWrite(
      'video-activity',
      event.params.sessionId,
      event as unknown as WriteEvent,
      ['questions']
    )
);

export const gradeIndexProjectGroup = onDocumentWritten(
  { ...TRIGGER_OPTS, document: 'project_runs/{sessionId}/groups/{groupId}' },
  (event) =>
    handleSideDocWrite(
      'projects',
      event.params.sessionId,
      event as unknown as WriteEvent,
      ['memberUids', 'classId']
    )
);

/** A row write refreshes that student's Grades-tab projection. */
export async function handleRowWrite(event: WriteEvent): Promise<void> {
  const before = dataOf(event.data?.before) as GradeIndexRow | undefined;
  const after = dataOf(event.data?.after) as GradeIndexRow | undefined;
  await guarded('projection', { rowId: event.params.rowId }, () =>
    projectRow(admin.firestore(), after ?? null, before ?? null)
  );
}

export const gradeIndexProjection = onDocumentWritten(
  { ...TRIGGER_OPTS, document: `${GRADE_INDEX}/{rowId}` },
  (event) => handleRowWrite(event as unknown as WriteEvent)
);

export async function handleMarkWrite(event: WriteEvent): Promise<void> {
  const { markId } = event.params;
  await guarded('mark', { markId }, async () => {
    const db = admin.firestore();
    const row = await db.collection(GRADE_INDEX).doc(markId).get();
    if (row.exists) await projectRow(db, row.data() as GradeIndexRow, null);
  });
}

export const gradeIndexMark = onDocumentWritten(
  { ...TRIGGER_OPTS, document: `${GRADEBOOK_MARKS}/{markId}` },
  (event) => handleMarkWrite(event as unknown as WriteEvent)
);

export async function handleColumnWrite(event: WriteEvent): Promise<void> {
  const { sessionId } = event.params;
  await guarded('column', { sessionId }, async () => {
    const db = admin.firestore();
    await reprojectRows(db, rowsForSession(db, sessionId));
  });
}

export const gradeIndexColumn = onDocumentWritten(
  { ...TRIGGER_OPTS, document: `${GRADEBOOK_COLUMNS}/{sessionId}` },
  (event) => handleColumnWrite(event as unknown as WriteEvent)
);

/** A class switching configuration re-projects that class. */
export async function handleClassSettingsWrite(
  event: WriteEvent
): Promise<void> {
  const { uid, rosterId } = event.params;
  const before = dataOf(event.data?.before);
  const after = dataOf(event.data?.after);
  if (
    before &&
    after &&
    stableStringify(before.configRef) === stableStringify(after.configRef)
  )
    return;
  await guarded('class settings', { uid, rosterId }, async () => {
    const db = admin.firestore();
    await reprojectRows(db, rowsForClass(db, uid, rosterId));
  });
}

export const gradeIndexClassSettings = onDocumentWritten(
  { ...TRIGGER_OPTS, document: 'users/{uid}/gradebook_classes/{rosterId}' },
  (event) => handleClassSettingsWrite(event as unknown as WriteEvent)
);

/** A personal configuration edit re-projects every class that uses it. */
export async function handleConfigWrite(event: WriteEvent): Promise<void> {
  const { uid, configId } = event.params;
  await guarded('config', { uid, configId }, async () => {
    const db = admin.firestore();
    const target = `users/${uid}/gradebook_settings/${configId}`;
    const classes = await db
      .collection('users')
      .doc(uid)
      .collection('gradebook_classes')
      .get();
    for (const cls of classes.docs) {
      if (configPathFor(uid, cls.data().configRef) !== target) continue;
      await reprojectRows(db, rowsForClass(db, uid, cls.id));
    }
  });
}

export const gradeIndexConfig = onDocumentWritten(
  { ...TRIGGER_OPTS, document: 'users/{uid}/gradebook_settings/{configId}' },
  (event) => handleConfigWrite(event as unknown as WriteEvent)
);

export async function runGradeIndexRecompute(
  db: admin.firestore.Firestore
): Promise<void> {
  if (!(await isGradeIndexEnabled(db))) return;
  const counts = await drainDirtySessions(db);
  if (counts.recomputed > 0 || counts.failed > 0)
    logger.info('gradeIndex: recompute run', counts);
}

export const gradeIndexRecompute = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeZone: 'America/Chicago',
    memory: '512MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    await runGradeIndexRecompute(admin.firestore());
  }
);
