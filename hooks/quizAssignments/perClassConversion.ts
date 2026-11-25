import {
  collection,
  deleteField,
  doc,
  getDocs,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PeriodAccess, QuizAssignment } from '@/types';
import {
  backfillClassId,
  perClassConversion,
  type WholeQuizSession,
} from '@/utils/perClassConversion';
import { hasPeriodAccess } from '@/utils/periodAccess';
import type { PeriodRoster } from '@/utils/periodPlan';
import { mirrorPlcAssignmentStatus } from '@/hooks/usePlcAssignmentIndex';
import { QUIZ_SESSIONS_COLLECTION } from '../useQuizSession';
import { QUIZ_ASSIGNMENTS_COLLECTION } from './writers';

const RESPONSE_BATCH = 400;

/** Moves a whole-quiz session onto per-class rows; returns the rows, or null when it can't move. */
export async function convertQuizToPerClass(
  teacherUid: string,
  assignmentId: string,
  rosters: readonly PeriodRoster[]
): Promise<Record<string, PeriodAccess> | null> {
  const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId);
  const assignmentRef = doc(
    db,
    'users',
    teacherUid,
    QUIZ_ASSIGNMENTS_COLLECTION,
    assignmentId
  );
  const result = await runTransaction(db, async (tx) => {
    const session = (await tx.get(sessionRef)).data() as
      WholeQuizSession | undefined;
    if (!session) return null;
    if (hasPeriodAccess(session))
      return { rows: session.periodAccess, resumed: false, plcId: null };
    const now = Date.now();
    const conversion = perClassConversion(session, rosters, now);
    if (!conversion) return null;
    const assignment = (await tx.get(assignmentRef)).data() as
      Pick<QuizAssignment, 'plc'> | undefined;
    const gate = {
      accessMode: conversion.accessMode,
      periodAccess: conversion.periodAccess,
      openAt: deleteField(),
      closeAt: deleteField(),
    };
    const resume = conversion.resume;
    tx.update(sessionRef, {
      ...gate,
      ...(resume
        ? {
            status: 'active',
            endedAt: null,
            ...(resume.pauseSpans ? { pauseSpans: resume.pauseSpans } : {}),
          }
        : {}),
    });
    tx.update(assignmentRef, {
      ...gate,
      ...(resume ? { status: 'active' } : {}),
      updatedAt: now,
    });
    return {
      rows: conversion.periodAccess,
      resumed: !!resume,
      plcId: assignment?.plc?.id ?? null,
    };
  });
  if (!result) return null;
  if (result.resumed && result.plcId)
    void mirrorPlcAssignmentStatus(result.plcId, assignmentId, 'active');
  // A response joined without a class gets one, so its class row lets it in.
  const responses = await getDocs(collection(sessionRef, 'responses'));
  const fixes = responses.docs.flatMap((d) => {
    const classId = backfillClassId(result.rows, d.data());
    return classId ? [{ ref: d.ref, classId }] : [];
  });
  for (let i = 0; i < fixes.length; i += RESPONSE_BATCH) {
    const batch = writeBatch(db);
    for (const f of fixes.slice(i, i + RESPONSE_BATCH))
      batch.update(f.ref, { classId: f.classId });
    await batch.commit();
  }
  return result.rows;
}
