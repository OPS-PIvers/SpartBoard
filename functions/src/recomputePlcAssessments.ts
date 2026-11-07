// Scheduled recompute of dirty PLC assessments into `plcs/{plcId}/aggregates` (plan §5.2).
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { parseChooseSections } from './quizSectionsChosen';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import './functionsInit';
import {
  AGGREGATE_SCHEMA_VERSION,
  computeAssessmentAggregate,
  parseTargets,
  resolveGroupQuestions,
  type AggregatePayload,
  type CompletedResponse,
  type ManualGrade,
  type QuestionTargetSnapshot,
  type RawAnswer,
  type SessionInput,
} from './plcAssessmentMath';
import { withQuizSessionContent } from './quizSessionContent';
import {
  computeFlashcardAggregate,
  parseFlashcardCheckCards,
  parseSubmittedFlashcardCheck,
  type FlashcardCheckSessionInput,
  type SubmittedFlashcardCheck,
} from './plcFlashcardAggregate';
import { activePlcMemberUids } from './plcActiveMembers';
import { sessionClassPredicate } from './sessionClassFilter';

type Firestore = admin.firestore.Firestore;

export const RECOMPUTE_BATCH_LIMIT = 50;

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseAnswer(raw: unknown): RawAnswer | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const questionId = asString(r.questionId);
  if (questionId.length === 0) return null;
  return {
    questionId,
    answer: asString(r.answer),
    answeredAt: typeof r.answeredAt === 'number' ? r.answeredAt : undefined,
    status: r.status === 'draft' ? 'draft' : undefined,
    unresponded: r.unresponded ?? undefined,
    takeIndex: typeof r.takeIndex === 'number' ? r.takeIndex : undefined,
    paperTranscript:
      r.paperTranscript === 'pending' ||
      r.paperTranscript === 'blank' ||
      r.paperTranscript === 'done' ||
      r.paperTranscript === 'image'
        ? r.paperTranscript
        : undefined,
  };
}

/** Tolerant parse of a completed response; unknown shapes yield an empty answer list. */
export function parseCompletedResponse(
  raw: Record<string, unknown>
): CompletedResponse {
  const answers = Array.isArray(raw.answers)
    ? raw.answers.map(parseAnswer).filter((a): a is RawAnswer => a !== null)
    : [];
  return {
    studentUid: asString(raw.studentUid),
    answers,
    score:
      typeof raw.score === 'number' && Number.isFinite(raw.score)
        ? raw.score
        : null,
    servedQuestionIds: Array.isArray(raw.servedQuestionIds)
      ? raw.servedQuestionIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        )
      : undefined,
    classPeriod: asString(raw.classPeriod) || undefined,
    classId: asString(raw.classId) || undefined,
    manualGrades: parseManualGrades(
      currentShortAnswerGrading(raw.grading, raw.answers)
    ),
  };
}

/** VA marks minus any whose `answeredAt` no longer matches an answer, so a retake starts unmarked. */
export function currentShortAnswerGrading(
  grading: unknown,
  answers: unknown
): unknown {
  if (typeof grading !== 'object' || grading === null) return grading;
  const list = Array.isArray(answers) ? answers : [];
  return Object.fromEntries(
    Object.entries(grading as Record<string, unknown>).filter(([qid, g]) => {
      const at =
        typeof g === 'object' && g !== null
          ? (g as Record<string, unknown>).answeredAt
          : undefined;
      return (
        at === undefined ||
        list.some(
          (a) =>
            typeof a === 'object' &&
            a !== null &&
            (a as Record<string, unknown>).questionId === qid &&
            (a as Record<string, unknown>).answeredAt === at
        )
      );
    })
  );
}

/** `grading[questionId]` for primary slots; media slot keys (`id::slot`) are skipped. */
export function parseManualGrades(
  raw: unknown
): Record<string, ManualGrade> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, ManualGrade> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.includes('::') || typeof value !== 'object' || value === null)
      continue;
    const points = (value as Record<string, unknown>).pointsAwarded;
    if (typeof points !== 'number' || !Number.isFinite(points)) continue;
    const scores = (value as Record<string, unknown>).rubricScores;
    const scoredCriterionIds = Array.isArray(scores)
      ? scores
          .map((sc) =>
            typeof sc === 'object' && sc !== null
              ? asString((sc as Record<string, unknown>).criterionId)
              : ''
          )
          .filter((id) => id.length > 0)
      : [];
    out[key] = { pointsAwarded: points, scoredCriterionIds };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** `plcs/{plcId}.members[uid].displayName`, else ''. */
export function teacherNamesFromPlc(
  plc: Record<string, unknown> | undefined
): Map<string, string> {
  const names = new Map<string, string>();
  const members = plc?.members;
  if (typeof members !== 'object' || members === null) return names;
  for (const [uid, m] of Object.entries(members as Record<string, unknown>)) {
    if (typeof m === 'object' && m !== null) {
      names.set(uid, asString((m as Record<string, unknown>).displayName));
    }
  }
  return names;
}

/** True when the synced group was made for this PLC or one of its contributing teachers participates. */
export function syncedGroupEntitled(
  plcId: string,
  group: Record<string, unknown> | undefined,
  contributorUids: Iterable<string>
): boolean {
  if (!group) return false;
  if (group.plcId === plcId) return true;
  const participants = group.participants;
  if (typeof participants !== 'object' || participants === null) return false;
  for (const uid of contributorUids) {
    if (Object.prototype.hasOwnProperty.call(participants, uid)) return true;
  }
  return false;
}

/** `{ [questionId]: { [locale]: string[] } }` from the teacher-owned assignment doc. */
export function parseLocalizedFibAnswers(
  raw: unknown
): Record<string, Record<string, string[]>> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, Record<string, string[]>> = {};
  for (const [questionId, byLocale] of Object.entries(
    raw as Record<string, unknown>
  )) {
    if (typeof byLocale !== 'object' || byLocale === null) continue;
    const locales: Record<string, string[]> = {};
    for (const [locale, answers] of Object.entries(
      byLocale as Record<string, unknown>
    )) {
      if (!Array.isArray(answers)) continue;
      const kept = answers.filter(
        (a): a is string => typeof a === 'string' && a.trim() !== ''
      );
      if (kept.length > 0) locales[locale] = kept;
    }
    if (Object.keys(locales).length > 0) out[questionId] = locales;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** `QuizSession.paperWrittenQuestionIds`, tolerant of a malformed value. */
export function parsePaperWrittenQuestionIds(
  raw: unknown
): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((id): id is string => typeof id === 'string');
}

/** Only the served `language` off each student override; the rest is irrelevant here. */
export function parseServedLanguages(
  raw: unknown
): Record<string, { language?: string }> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, { language?: string }> = {};
  for (const [uid, override] of Object.entries(
    raw as Record<string, unknown>
  )) {
    if (typeof override !== 'object' || override === null) continue;
    const language = (override as Record<string, unknown>).language;
    if (typeof language === 'string' && language.length > 0)
      out[uid] = { language };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function clearDirtyIfUnchanged(
  db: Firestore,
  ref: admin.firestore.DocumentReference,
  dirtyAtRead: unknown
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current: unknown = snap.data()?.dirtyAt ?? null;
    if (current === (dirtyAtRead ?? null)) tx.update(ref, { dirtyAt: null });
  });
}

/** Pools every active member's linked Flashcards check sessions; staff-audience sessions never count. */
async function flashcardAggregateFor(
  db: Firestore,
  plcRef: admin.firestore.DocumentReference,
  plcId: string,
  assessmentId: string,
  title: string,
  syncGroupId: string
): Promise<AggregatePayload> {
  const [sessionsSnap, plcSnap] = await Promise.all([
    db
      .collection('flashcard_sessions')
      .where('plcId', '==', plcId)
      .where('syncGroupId', '==', syncGroupId)
      .get(),
    plcRef.get(),
  ]);
  const teacherNames = teacherNamesFromPlc(plcSnap.data());
  const activeMembers = activePlcMemberUids(plcSnap.data());
  const sessions: FlashcardCheckSessionInput[] = [];
  // Set tags are read live from each teacher's set, so tagging after assigning still counts.
  const setTargets = new Map<string, Promise<QuestionTargetSnapshot[]>>();
  const targetsOf = (teacherUid: string, setId: string) => {
    const key = `${teacherUid}/${setId}`;
    let pending = setTargets.get(key);
    if (!pending) {
      pending = setId
        ? db
            .doc(`users/${teacherUid}/flashcard_sets/${setId}`)
            .get()
            .then((snap) => parseTargets(snap.data()?.targets))
        : Promise.resolve([]);
      setTargets.set(key, pending);
    }
    return pending;
  };
  for (const sessionDoc of sessionsSnap.docs) {
    const s = sessionDoc.data();
    const teacherUid = asString(s.teacherUid);
    if (!activeMembers.has(teacherUid)) continue;
    if (s.kind !== 'check' || s.audience === 'staff') continue;
    const [progressSnap, contentSnap, targets] = await Promise.all([
      sessionDoc.ref.collection('progress').get(),
      s.cardsInContent === true
        ? sessionDoc.ref.collection('content').doc('cards').get()
        : Promise.resolve(null),
      targetsOf(teacherUid, asString(s.setId)),
    ]);
    const keepClass = sessionClassPredicate(s);
    sessions.push({
      id: sessionDoc.id,
      teacherUid,
      teacherName: teacherNames.get(teacherUid) ?? '',
      checkMode: asString(s.checkMode),
      cards: parseFlashcardCheckCards(
        contentSnap ? contentSnap.data()?.cards : s.cards
      ),
      submissions: progressSnap.docs
        .filter((d) => keepClass(d.data()))
        .map((d) => parseSubmittedFlashcardCheck(d.data()))
        .filter((p): p is SubmittedFlashcardCheck => p !== null),
      targets,
    });
  }
  return computeFlashcardAggregate({ assessmentId, title, sessions });
}

/** Recompute one assessment's aggregate; tombstoned assessments drop their aggregate instead. */
export async function recomputeOnePlcAssessment(
  db: Firestore,
  plcId: string,
  assessmentId: string
): Promise<void> {
  const plcRef = db.collection('plcs').doc(plcId);
  const assessmentRef = plcRef.collection('assessments').doc(assessmentId);
  const aggregateRef = plcRef.collection('aggregates').doc(assessmentId);

  const assessmentSnap = await assessmentRef.get();
  if (!assessmentSnap.exists) {
    await aggregateRef.delete();
    return;
  }
  const assessment = assessmentSnap.data() ?? {};
  const dirtyAtRead: unknown = assessment.dirtyAt ?? null;
  const syncGroupId = asString(assessment.syncGroupId);

  if (assessment.deletedAt != null || syncGroupId.length === 0) {
    await aggregateRef.delete();
    await clearDirtyIfUnchanged(db, assessmentRef, dirtyAtRead);
    return;
  }
  if (assessment.kind === 'flashcard-check') {
    const payload = await flashcardAggregateFor(
      db,
      plcRef,
      plcId,
      assessmentId,
      asString(assessment.title),
      syncGroupId
    );
    await aggregateRef.set({
      ...payload,
      ranAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await clearDirtyIfUnchanged(db, assessmentRef, dirtyAtRead);
    return;
  }

  const [sessionsSnap, syncedSnap, plcSnap] = await Promise.all([
    db
      .collection('quiz_sessions')
      .where('plcId', '==', plcId)
      .where('syncGroupId', '==', syncGroupId)
      .get(),
    db.collection('synced_quizzes').doc(syncGroupId).get(),
    plcRef.get(),
  ]);
  const teacherNames = teacherNamesFromPlc(plcSnap.data());
  const activeMembers = activePlcMemberUids(plcSnap.data());

  const sessions: SessionInput[] = [];
  const assignmentKeys: unknown[] = [];
  for (const sessionDoc of sessionsSnap.docs) {
    // A session whose owner is not an active member of this PLC never counts.
    if (!activeMembers.has(asString(sessionDoc.data().teacherUid))) continue;
    const s = await withQuizSessionContent(sessionDoc.ref, sessionDoc.data());
    const teacherUid = asString(s.teacherUid);
    const assignmentId = asString(s.assignmentId) || sessionDoc.id;
    const [responsesSnap, assignmentSnap, keySnap] = await Promise.all([
      sessionDoc.ref
        .collection('responses')
        .where('status', '==', 'completed')
        .get(),
      teacherUid
        ? db
            .collection('users')
            .doc(teacherUid)
            .collection('quiz_assignments')
            .doc(assignmentId)
            .get()
        : Promise.resolve(null),
      teacherUid
        ? db
            .collection('users')
            .doc(teacherUid)
            .collection('quiz_assignments')
            .doc(assignmentId)
            .collection('key')
            .doc('answers')
            .get()
        : Promise.resolve(null),
    ]);
    const keyQuestions: unknown = keySnap?.data()?.questions;
    if (Array.isArray(keyQuestions)) {
      assignmentKeys.push(...(keyQuestions as unknown[]));
    }
    const assignmentData: Record<string, unknown> | undefined =
      assignmentSnap?.data();
    const keepClass = sessionClassPredicate(s);
    const questionSnapshot = assignmentData?.questionSnapshot;
    sessions.push({
      id: sessionDoc.id,
      teacherUid,
      teacherName: teacherNames.get(teacherUid) ?? '',
      publicQuestions: Array.isArray(s.publicQuestions)
        ? s.publicQuestions
        : [],
      questionSnapshot: Array.isArray(questionSnapshot) ? questionSnapshot : [],
      // A class the teacher removed from the quiz leaves the team totals; its responses stay.
      responses: responsesSnap.docs
        .filter((d) => keepClass(d.data()))
        .map((d) => parseCompletedResponse(d.data())),
      scorePublishedAt:
        typeof s.scorePublishedAt === 'number' ? s.scorePublishedAt : null,
      localizedFibAnswers: parseLocalizedFibAnswers(
        assignmentData?.localizedFibAnswers
      ),
      overridesByStudentUid: parseServedLanguages(
        assignmentData?.overridesByStudentUid
      ),
      sections: parseChooseSections(s.sections),
      paperWrittenQuestionIds: parsePaperWrittenQuestionIds(
        s.paperWrittenQuestionIds
      ),
    });
  }

  const groupQuestions = resolveGroupQuestions(
    syncedSnap.exists &&
      syncedGroupEntitled(
        plcId,
        syncedSnap.data(),
        sessions.map((session) => session.teacherUid)
      )
      ? (syncedSnap.data() ?? null)
      : null,
    sessions.flatMap((session) => session.publicQuestions),
    sessions.flatMap((session) => session.questionSnapshot ?? []),
    assignmentKeys
  );
  const kind = assessment.kind === 'video-activity' ? 'video-activity' : 'quiz';
  const payload = computeAssessmentAggregate({
    assessmentId,
    title: asString(assessment.title),
    kind,
    groupQuestions,
    sessions,
  });

  await aggregateRef.set({
    ...payload,
    ranAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await clearDirtyIfUnchanged(db, assessmentRef, dirtyAtRead);
}

export interface RecomputeCounts {
  scanned: number;
  recomputed: number;
  failed: number;
}

/** Oldest-dirty-first pass over every PLC; per-item failures are logged and skipped. */
export async function runRecomputePlcAssessments(
  db: Firestore,
  { limit = RECOMPUTE_BATCH_LIMIT }: { limit?: number } = {}
): Promise<RecomputeCounts> {
  const counts: RecomputeCounts = { scanned: 0, recomputed: 0, failed: 0 };
  const dirtySnap = await db
    .collectionGroup('assessments')
    .where('dirtyAt', '!=', null)
    .orderBy('dirtyAt', 'asc')
    .limit(limit)
    .get();

  const recompute = async (
    doc: admin.firestore.QueryDocumentSnapshot
  ): Promise<void> => {
    counts.scanned++;
    const plcId = doc.ref.parent.parent?.id;
    if (!plcId) return;
    try {
      await recomputeOnePlcAssessment(db, plcId, doc.id);
      counts.recomputed++;
    } catch (err) {
      counts.failed++;
      logger.error('recomputePlcAssessments: recompute failed', {
        plcId,
        assessmentId: doc.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
  for (const doc of dirtySnap.docs) await recompute(doc);

  // Spare budget refreshes aggregates written by an older schema.
  const remaining = limit - dirtySnap.docs.length;
  if (remaining > 0) {
    const staleSnap = await db
      .collectionGroup('aggregates')
      .where('schemaVersion', '<', AGGREGATE_SCHEMA_VERSION)
      .limit(remaining)
      .get();
    for (const doc of staleSnap.docs) await recompute(doc);
  }
  return counts;
}

export const recomputePlcAssessments = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeZone: 'America/Chicago',
    memory: '512MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const counts = await runRecomputePlcAssessments(admin.firestore());
    logger.info('recomputePlcAssessments: run complete', counts);
  }
);
