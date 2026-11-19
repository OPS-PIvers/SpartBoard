// Firestore triggers and the scheduled worker that keep `grade_index` and `student_grades` current (GRADEBOOK.md D10, D37).
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from '../firebaseAdmin';
import '../functionsInit';
import {
  SESSION_COLLECTION,
  STUDENT_SUBCOLLECTION,
  applyDocWrite,
  docWriteMatters,
  drainDirtySessions,
  isGradeIndexEnabled,
  markSessionDirty,
  stableStringify,
} from './gradeIndex';
import {
  GRADEBOOK_COLUMNS,
  GRADEBOOK_MARKS,
  configPathFor,
  inRoster,
  projectRow,
  removeFlagsOnScore,
  reprojectRows,
  rowsForClass,
  rowsForSession,
} from './gradeProjection';
import { GRADE_INDEX } from './gradeIndex';
import { legacyRowId, rowId } from './gradeRowMath';
import type { IndexRow, GradeKind } from './types';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from '../secrets';
import {
  applyAttemptGradeWrite,
  applyAttemptWrite,
} from '../quizAttemptHistory';
import { stampTurnIn } from '../quizTurnIn';
import { RosterUnavailableError } from './rosterUnavailable';
import { migrateLegacyProjectOverrides } from '../projectGradeOverrides';
import {
  TRIGGER_OPTS,
  dataOf,
  guarded,
  type WriteEvent,
} from './gradeSessionTriggers';

// Project rows and every Grades-tab projection are checked against the owner's live class roster.
const ROSTER_SECRETS = [
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
];
const PROJECTION_OPTS = { ...TRIGGER_OPTS, secrets: ROSTER_SECRETS };
// Config edits re-project whole classes, so they get the long timeout.
const FANOUT_OPTS = { ...PROJECTION_OPTS, timeoutSeconds: 540 };

/** Per-student doc handler body, exported for tests. */
export async function handleStudentDocWrite(
  kind: GradeKind,
  event: WriteEvent
): Promise<void> {
  const { sessionId, docId } = event.params;
  const write = {
    kind,
    sessionId,
    docId,
    before: dataOf(event.data?.before),
    after: dataOf(event.data?.after),
  };
  if (docWriteMatters(write)) {
    await guarded('student doc', { kind, sessionId, docId }, async () => {
      const db = admin.firestore();
      try {
        await applyDocWrite(db, write);
      } catch (err) {
        // Let the recompute worker heal the row instead of dropping the update.
        await markSessionDirty(db, kind, sessionId);
        throw err;
      }
    });
  }
  // Runs whether or not the index is on: a legacy map keeps a released grade unreadable to members.
  if (kind === 'projects')
    await failUnlessStale(event.time, async () => {
      await migrateLegacyProjectOverrides(
        admin.firestore(),
        sessionId,
        docId,
        write.after
      );
    });
}

const studentDocTrigger = (kind: GradeKind) =>
  onDocumentWritten(
    {
      ...TRIGGER_OPTS,
      // Projects retry so a failed legacy override migration runs again.
      ...(kind === 'projects' ? { secrets: ROSTER_SECRETS, retry: true } : {}),
      document: `${SESSION_COLLECTION[kind]}/{sessionId}/${STUDENT_SUBCOLLECTION[kind]}/{docId}`,
    },
    (event) => handleStudentDocWrite(kind, event as unknown as WriteEvent)
  );

const MAX_RETRY_AGE_MS = 2 * 60 * 60_000;

/** A failure past this age is logged and dropped, so a bad event cannot retry for days. */
export async function failUnlessStale(
  time: string | undefined,
  run: () => Promise<void>
): Promise<void> {
  try {
    await run();
  } catch (err) {
    const at = time ? Date.parse(time) : NaN;
    if (Number.isFinite(at) && Date.now() - at > MAX_RETRY_AGE_MS) {
      logger.error('gradeIndex: dropping stale event after retries', {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    throw err;
  }
}

/** Quiz responses also feed the attempt history, which runs whether or not the index is on. */
export async function handleQuizResponseWrite(
  event: WriteEvent
): Promise<void> {
  const { sessionId, docId } = event.params;
  const parsed = event.time ? Date.parse(event.time) : NaN;
  const eventAt = Number.isFinite(parsed) ? parsed : Date.now();
  const before = dataOf(event.data?.before);
  // The turn-in stamp lands first, so both steps below read the server's time; a stale failure is dropped.
  let after = dataOf(event.data?.after);
  await failUnlessStale(event.time, async () => {
    after = await stampTurnIn(
      admin.firestore(),
      'quiz',
      sessionId,
      docId,
      before,
      after,
      eventAt
    );
  });
  const [attempt, index] = await Promise.allSettled([
    applyAttemptWrite(admin.firestore(), {
      sessionId,
      responseKey: docId,
      before,
      after,
      eventAt,
    }),
    handleStudentDocWrite('quiz', event),
  ]);
  // Both steps run first; a failed attempt copy then fails the event so it retries.
  await failUnlessStale(event.time, () => {
    if (attempt.status === 'rejected') throw attempt.reason;
    if (index.status === 'rejected') throw index.reason;
    return Promise.resolve();
  });
}

export const gradeIndexQuizResponse = onDocumentWritten(
  {
    ...TRIGGER_OPTS,
    retry: true,
    document: `${SESSION_COLLECTION.quiz}/{sessionId}/${STUDENT_SUBCOLLECTION.quiz}/{docId}`,
  },
  (event) => handleQuizResponseWrite(event as unknown as WriteEvent)
);
// A teacher grade on an earlier quiz attempt's copy; runs whether or not the index is on.
export const quizAttemptGradeWrite = onDocumentWritten(
  {
    ...TRIGGER_OPTS,
    retry: true,
    document: `${SESSION_COLLECTION.quiz}/{sessionId}/${STUDENT_SUBCOLLECTION.quiz}/{docId}/attempts/{n}`,
  },
  (event) => {
    const { sessionId, docId, n } = (
      event as unknown as { params: Record<string, string> }
    ).params;
    return failUnlessStale((event as { time?: string }).time, () =>
      applyAttemptGradeWrite(admin.firestore(), {
        sessionId,
        responseKey: docId,
        n: Number(n),
        before: dataOf(event.data?.before),
        after: dataOf(event.data?.after),
      })
    );
  }
);
/** Video responses get the server's turn-in stamp before the index step. */
export async function handleVideoResponseWrite(
  event: WriteEvent
): Promise<void> {
  const { sessionId, docId } = event.params;
  const parsed = event.time ? Date.parse(event.time) : NaN;
  // A failed stamp retries the event rather than indexing the student's own time.
  await failUnlessStale(event.time, async () => {
    await stampTurnIn(
      admin.firestore(),
      'video-activity',
      sessionId,
      docId,
      dataOf(event.data?.before),
      dataOf(event.data?.after),
      Number.isFinite(parsed) ? parsed : Date.now()
    );
    await handleStudentDocWrite('video-activity', event);
  });
}

export const gradeIndexVideoResponse = onDocumentWritten(
  {
    ...TRIGGER_OPTS,
    retry: true,
    document: `${SESSION_COLLECTION['video-activity']}/{sessionId}/${STUDENT_SUBCOLLECTION['video-activity']}/{docId}`,
  },
  (event) => handleVideoResponseWrite(event as unknown as WriteEvent)
);
export const gradeIndexGuidedLearningResponse =
  studentDocTrigger('guided-learning');
export const gradeIndexFlashcardProgress = studentDocTrigger('flashcards');
export const gradeIndexProjectGrade = studentDocTrigger('projects');
export const gradeIndexMiniAppSubmission = studentDocTrigger('mini-app');
export const gradeIndexWallSubmission = studentDocTrigger('activity-wall');
export const gradeIndexWritingResponse = studentDocTrigger('writing');

/** Key or tag edits live off the session, so they queue the session themselves. */
export async function handleSideDocWrite(
  kind: GradeKind,
  sessionId: string,
  event: WriteEvent,
  fields: string[] | null,
  ownerUid?: string
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
  await guarded('side doc', { kind, sessionId }, async () => {
    const db = admin.firestore();
    if (ownerUid !== undefined) {
      const owner = await db
        .collection(SESSION_COLLECTION[kind])
        .doc(sessionId)
        .get();
      if (!owner.exists || owner.data()?.teacherUid !== ownerUid) return;
    }
    await markSessionDirty(db, kind, sessionId);
  });
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
      ['questions'],
      event.params.uid
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
        'paperCopyBatchIds',
      ],
      event.params.uid
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

export const gradeIndexGuidedLearningAssignment = onDocumentWritten(
  {
    ...TRIGGER_OPTS,
    document: 'users/{uid}/guided_learning_assignments/{sessionId}',
  },
  (event) =>
    handleSideDocWrite(
      'guided-learning',
      event.params.sessionId,
      event as unknown as WriteEvent,
      ['stepTargets'],
      event.params.uid
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

const POINTER_KINDS = new Set<string>([
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
  'flashcards',
  'writing',
]);

/** Individual targeting changes who is assigned and their due date (D25), so the session is rebuilt. */
export async function handlePointerWrite(event: WriteEvent): Promise<void> {
  const before = dataOf(event.data?.before);
  const after = dataOf(event.data?.after);
  const data = after ?? before ?? {};
  const kind = typeof data.kind === 'string' ? data.kind : '';
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
  if (!POINTER_KINDS.has(kind) || !sessionId || sessionId.includes('/')) return;
  const watched = ['excluded', 'dueAt', 'sessionId'];
  if (
    before &&
    after &&
    watched.every(
      (f) => stableStringify(before[f]) === stableStringify(after[f])
    )
  )
    return;
  await guarded('pointer', { sessionId }, () =>
    markSessionDirty(admin.firestore(), kind as GradeKind, sessionId)
  );
}

export const gradeIndexStudentPointer = onDocumentWritten(
  {
    ...TRIGGER_OPTS,
    document: 'student_assignments/{studentUid}/items/{assignmentId}',
  },
  (event) => handlePointerWrite(event as unknown as WriteEvent)
);

/** A row write refreshes that student's Grades-tab projection. */
export async function handleRowWrite(event: WriteEvent): Promise<void> {
  const before = dataOf(event.data?.before) as IndexRow | undefined;
  const after = dataOf(event.data?.after) as IndexRow | undefined;
  let unavailable = null as RosterUnavailableError | null;
  await guarded('projection', { rowId: event.params.rowId }, async () => {
    try {
      await projectRowWrite(event.params.rowId, after, before);
    } catch (err) {
      if (!(err instanceof RosterUnavailableError)) throw err;
      unavailable = err;
    }
  });
  // The roster service being down retries the event instead of dropping the update.
  const failure = unavailable;
  if (failure) await failUnlessStale(event.time, () => Promise.reject(failure));
}

async function projectRowWrite(
  rowIdParam: string,
  after: IndexRow | undefined,
  before: IndexRow | undefined
): Promise<void> {
  const db = admin.firestore();
  // Deleting a pre-kind row that a kind-keyed row replaced clears only an entry the replacement moved.
  const replacementId = before
    ? rowId(before.kind || 'quiz', before.sessionId, before.studentUid)
    : '';
  if (!after && before && rowIdParam !== replacementId) {
    const replacement = await db
      .collection(GRADE_INDEX)
      .doc(replacementId)
      .get();
    if (replacement.exists) {
      await projectRow(db, replacement.data() as IndexRow, before);
      return;
    }
  }
  await projectRow(db, after ?? null, before ?? null);
  const row = after ?? before;
  if (!row) return;
  await removeFlagsOnScore(
    db,
    // Marks keep the pre-kind id.
    legacyRowId(row.sessionId, row.studentUid),
    after ?? null,
    before ?? null
  );
}

export const gradeIndexProjection = onDocumentWritten(
  { ...PROJECTION_OPTS, retry: true, document: `${GRADE_INDEX}/{rowId}` },
  (event) => handleRowWrite(event as unknown as WriteEvent)
);

export async function handleMarkWrite(event: WriteEvent): Promise<void> {
  const { markId } = event.params;
  await guarded('mark', { markId }, async () => {
    const db = admin.firestore();
    const mark = dataOf(event.data?.after) ?? dataOf(event.data?.before);
    const sessionId = typeof mark?.sessionId === 'string' ? mark.sessionId : '';
    const studentUid =
      typeof mark?.studentUid === 'string' ? mark.studentUid : '';
    if (!sessionId || !studentUid) return;
    // Every kind's row for this session and student; projectRow keeps only the mark owner's.
    const rows = await db
      .collection(GRADE_INDEX)
      .where('sessionId', '==', sessionId)
      .where('studentUid', '==', studentUid)
      .get();
    for (const row of rows.docs)
      await projectRow(db, row.data() as IndexRow, null);
  });
}

export const gradeIndexMark = onDocumentWritten(
  { ...PROJECTION_OPTS, document: `${GRADEBOOK_MARKS}/{markId}` },
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
  { ...FANOUT_OPTS, document: `${GRADEBOOK_COLUMNS}/{sessionId}` },
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
    await reprojectRows(
      db,
      rowsForClass(db, uid, rosterId),
      inRoster(rosterId)
    );
  });
}

export const gradeIndexClassSettings = onDocumentWritten(
  { ...FANOUT_OPTS, document: 'users/{uid}/gradebook_classes/{rosterId}' },
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
      await reprojectRows(db, rowsForClass(db, uid, cls.id), inRoster(cls.id));
    }
  });
}

export const gradeIndexConfig = onDocumentWritten(
  { ...FANOUT_OPTS, document: 'users/{uid}/gradebook_settings/{configId}' },
  (event) => handleConfigWrite(event as unknown as WriteEvent)
);

/** A PLC or district configuration edit re-projects every class linked to it. */
export async function handleSharedConfigWrite(
  source: 'plc' | 'district',
  id: string
): Promise<void> {
  await guarded('shared config', { source, id }, async () => {
    const db = admin.firestore();
    const field = source === 'plc' ? 'configRef.plcId' : 'configRef.configId';
    const classes = await db
      .collectionGroup('gradebook_classes')
      .where('configRef.source', '==', source)
      .where(field, '==', id)
      .get();
    for (const cls of classes.docs) {
      const uid = cls.ref.parent.parent?.id;
      if (!uid) continue;
      await reprojectRows(db, rowsForClass(db, uid, cls.id), inRoster(cls.id));
    }
  });
}

export const gradeIndexPlcConfig = onDocumentWritten(
  { ...FANOUT_OPTS, document: 'plcs/{plcId}/meta/gradebookSettings' },
  (event) => handleSharedConfigWrite('plc', event.params.plcId)
);

export const gradeIndexDistrictConfig = onDocumentWritten(
  { ...FANOUT_OPTS, document: 'gradebook_district_configs/{configId}' },
  (event) => handleSharedConfigWrite('district', event.params.configId)
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
    secrets: ROSTER_SECRETS,
  },
  async () => {
    await runGradeIndexRecompute(admin.firestore());
  }
);
