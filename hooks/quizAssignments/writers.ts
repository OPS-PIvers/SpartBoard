import { appendPauseSpan, hasOpenPause } from '@/utils/quizTimeLimit';
import {
  deleteField,
  doc,
  getDoc,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  findQuizSessionsByCode,
  readJoinCodeOwner,
} from '@/utils/quizJoinCodes';
import type { QuizResponse, QuizSession, QuizSessionSection } from '@/types';
import {
  acceptsStudents,
  assignmentLifecyclePatches,
  deriveRunState,
  type AssignmentLifecycleEvent,
  type AssignmentLifecyclePatches,
} from '@/utils/sessionLifecycle';
import { QUIZ_SESSIONS_COLLECTION } from '../useQuizSession';

export const QUIZ_ASSIGNMENTS_COLLECTION = 'quiz_assignments';

/** Writes a Pause, Resume, End or Reopen in one transaction, refusing a stale Pause or Resume on a quiz that has ended. */
export async function commitQuizLifecycle(
  userId: string,
  assignmentId: string,
  event: AssignmentLifecycleEvent,
  extraSessionPatch?: (session: QuizSession) => Record<string, unknown>
): Promise<AssignmentLifecyclePatches | null> {
  const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef);
    const session = snap.data() as QuizSession | undefined;
    // Only an ended run is protected: End and Reopen always write, and Pause or Resume still repair a drifted assignment.
    const ended = session
      ? deriveRunState('quiz', session)?.phase === 'ended'
      : false;
    if (ended && (event.type === 'pause' || event.type === 'resume')) {
      return null;
    }
    const now = Date.now();
    const patches = assignmentLifecyclePatches('quiz', event, now);
    // The time limit skips this pause.
    const pauseSpans =
      session?.status === 'paused' && event.type === 'resume'
        ? appendPauseSpan(session.pauseSpans, session.pausedAt, now)
        : null;
    // End and a whole-class Reopen drop a reopen for selected students; End also ends their passes.
    const clearPicks =
      event.type === 'end' || event.type === 'reopen'
        ? { reopenedFor: deleteField() }
        : {};
    const clearPasses: Record<string, unknown> =
      event.type === 'end'
        ? Object.fromEntries(
            (session?.reopenedFor ?? []).map((uid) => [
              `studentAccess.${uid}`,
              deleteField(),
            ])
          )
        : {};
    // A reopened or resumed quiz is no longer closed or moved to Finished (ASSIGNED_TAB D24).
    const clearMarks =
      event.type === 'reopen' || event.type === 'resume'
        ? { closedAt: deleteField(), doneAt: deleteField() }
        : {};
    // D11 measures a single line left open from its last Resume.
    const opened = event.type === 'resume' ? { openedAt: now } : {};
    tx.update(
      doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),
      { ...patches.assignment, ...clearPicks, ...clearMarks, ...opened }
    );
    // A repeat Pause, or a Reopen after a paused End, keeps the open pause's start.
    const sessionPatch = { ...patches.session };
    if (
      session &&
      hasOpenPause(session.pauseSpans, session.pausedAt) &&
      (event.type === 'reopen' ||
        (event.type === 'pause' && session.status === 'paused'))
    ) {
      delete sessionPatch.pausedAt;
    }
    tx.update(sessionRef, {
      ...sessionPatch,
      ...(event.type === 'end' ? { revealedAnswers: deleteField() } : {}),
      ...clearPicks,
      ...clearPasses,
      ...(pauseSpans ? { pauseSpans } : {}),
      ...(session && extraSessionPatch ? extraSessionPatch(session) : {}),
    });
    return patches;
  });
}

/** Unique 6-char join code: one nobody has claimed yet, since a code has one owner for good. */
export async function allocateJoinCode(): Promise<string> {
  const candidate = () =>
    Math.random().toString(36).substring(2, 8).toUpperCase().padEnd(6, '0');
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = candidate();
    if ((await readJoinCodeOwner(code)) !== null) continue;
    // An unclaimed legacy code may still carry a live session; claiming it would take it over.
    const matches = await findQuizSessionsByCode(code);
    if (!matches.some((m) => acceptsStudents('quiz', m.data))) return code;
  }
  // Last resort: an owned code fails the assign batch, which the teacher can retry.
  return candidate();
}

/** The session's frozen sections, for publishing; absent on a quiz without them. */
export async function readSessionSections(
  assignmentId: string
): Promise<QuizSessionSection[] | undefined> {
  const snap = await getDoc(doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId));
  const sections = (snap.data() as QuizSession | undefined)?.sections;
  return sections?.length ? sections : undefined;
}

const RESPONSE_BATCH_WRITES = 400;

export interface ResponsePatch {
  ref: ReturnType<typeof doc>;
  patch: Record<string, unknown>;
}

/** Commits `firstBatch` (holding `reserved` writes) plus patches, split under the batch cap. */
export async function commitResponsePatches(
  firstBatch: ReturnType<typeof writeBatch>,
  reserved: number,
  patches: ResponsePatch[]
): Promise<void> {
  const firstChunk = Math.min(patches.length, RESPONSE_BATCH_WRITES - reserved);
  for (let i = 0; i < firstChunk; i++) {
    firstBatch.update(patches[i].ref, patches[i].patch);
  }
  await firstBatch.commit();
  for (
    let cursor = firstChunk;
    cursor < patches.length;
    cursor += RESPONSE_BATCH_WRITES
  ) {
    const chunkBatch = writeBatch(db);
    for (const u of patches.slice(cursor, cursor + RESPONSE_BATCH_WRITES)) {
      chunkBatch.update(u.ref, u.patch);
    }
    await chunkBatch.commit();
  }
}

const PAPER_TRANSACTION_CONCURRENCY = 10;

/** D39: re-reads and re-grades each paper row in a transaction so a transcript landing mid-publish survives. */
export async function commitPaperWrittenPatches(
  refs: ReturnType<typeof doc>[],
  buildPatch: (data: QuizResponse) => Record<string, unknown> | null
): Promise<number> {
  let written = 0;
  for (let i = 0; i < refs.length; i += PAPER_TRANSACTION_CONCURRENCY) {
    const results = await Promise.all(
      refs.slice(i, i + PAPER_TRANSACTION_CONCURRENCY).map((ref) =>
        runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) return false;
          const patch = buildPatch(snap.data() as QuizResponse);
          if (!patch) return false;
          tx.update(ref, patch);
          return true;
        })
      )
    );
    written += results.filter(Boolean).length;
  }
  return written;
}
