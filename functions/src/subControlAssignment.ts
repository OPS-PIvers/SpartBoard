// controlSubAssignmentV1 — a substitute pauses or ends the one run they
// started (docs/plans/shipped/SUB_SHARE_COLLECTIONS.md §3.6). They cannot write the
// teacher's session docs, and the plan chose a callable over widening the
// update rules, so the write runs here as admin once the caller is proven to
// be the monitor the launch stamped.

import { onCall } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { logger } from 'firebase-functions';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  bad,
  denied,
  requireSubLaunchEnabled,
  shortId,
  verifySubCaller,
  verifySubShare,
  type SubShareCaller,
} from './subShareAccess';
import { assertViewAsAllowed } from './viewAsGuard';
import { buildQuizFinalizeUpdate, sessionQuestionIds } from './quizFinalize';
import { withQuizSessionContent } from './quizSessionContent';
import {
  ACTIONS,
  CONTROLLABLE_KINDS,
  controlPatches,
  type ControlAction,
  type ControlKind,
  type ControlState,
} from './subControlPatches';

export { controlPatches };

const SESSIONS: Record<ControlKind, string> = {
  quiz: 'quiz_sessions',
  videoActivity: 'video_activity_sessions',
  guidedLearning: 'guided_learning_sessions',
  flashcards: 'flashcard_sessions',
};

const ASSIGNMENTS: Record<ControlKind, string> = {
  quiz: 'quiz_assignments',
  videoActivity: 'video_activity_assignments',
  guidedLearning: 'guided_learning_assignments',
  flashcards: 'flashcard_assignments',
};

/** Responses read when a quiz ends; a sub-launched class is one class. */
const MAX_FINALIZED = 400;

export interface ControlSubAssignmentInput {
  shareId: string;
  /** The run to act on — the id `launchSubAssignmentV1` returned. */
  sessionId: string;
  kind: ControlKind;
  action: ControlAction;
}

export interface ControlSubAssignmentResult {
  /** What the run is now, so the sub's panel can say so. */
  state: ControlState;
}

export interface SubControlDeps {
  now: () => number;
}

export const liveSubControlDeps: SubControlDeps = { now: () => Date.now() };

/** Mirror of the teacher's End: each unfinished response is finalized in its own transaction. */
export async function finalizeQuizResponses(
  db: admin.firestore.Firestore,
  sessionId: string,
  session: Record<string, unknown>,
  now: number
): Promise<number> {
  const content = await withQuizSessionContent(
    db.doc(`quiz_sessions/${sessionId}`),
    session
  );
  const meta = {
    questionIds: sessionQuestionIds(content.publicQuestions),
    completenessModel:
      typeof content.completenessModel === 'number'
        ? content.completenessModel
        : 0,
  };
  const snap = await db
    .collection(`quiz_sessions/${sessionId}/responses`)
    .limit(MAX_FINALIZED)
    .get();
  const results = await Promise.allSettled(
    snap.docs
      .filter((doc) => {
        const status: unknown = doc.data().status;
        return status === 'in-progress' || status === 'joined';
      })
      .map((doc) =>
        db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          const update = fresh.exists
            ? buildQuizFinalizeUpdate(fresh.data() ?? {}, meta, now)
            : null;
          if (update) tx.update(doc.ref, update);
          return update !== null;
        })
      )
  );
  let count = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value) count += 1;
    } else {
      logger.warn('[controlSubAssignment] finalize failed', result.reason);
    }
  }
  return count;
}

export async function handleControlSubAssignment(
  db: admin.firestore.Firestore,
  caller: SubShareCaller | null,
  data: unknown,
  deps: SubControlDeps = liveSubControlDeps
): Promise<ControlSubAssignmentResult> {
  const { caller: sub, email } = verifySubCaller(caller ?? null);

  const input = (data ?? {}) as Partial<ControlSubAssignmentInput>;
  const shareId = shortId(input.shareId, 'shareId');
  const sessionId = shortId(input.sessionId, 'sessionId');
  const kind = input.kind as ControlKind;
  if (!CONTROLLABLE_KINDS.includes(kind)) {
    bad('That activity cannot be controlled from a share.');
  }
  const action = input.action as ControlAction;
  if (!ACTIONS.includes(action)) bad('action must be pause, resume or end.');
  if (action !== 'end' && kind !== 'quiz') {
    bad('Only a quiz can be paused and resumed.');
  }

  await requireSubLaunchEnabled(
    db,
    'Controlling an activity from a share is turned off.'
  );
  const { hostUid } = await verifySubShare(db, shareId, email, deps.now());

  const sessionRef = db.doc(`${SESSIONS[kind]}/${sessionId}`);
  const snap = await sessionRef.get();
  const session = snap.data();
  if (!snap.exists || !session) denied('That run no longer exists.');
  // The teacher on the run and the teacher on the share must be the same
  // person, or a sub could reach another teacher's session by its id.
  if (session.teacherUid !== hostUid) {
    denied('That run does not belong to this share.');
  }
  const launchedBy = session.launchedBy as { shareId?: unknown } | undefined;
  if (launchedBy?.shareId !== shareId) {
    denied('That run was not started from this share.');
  }
  const monitors = Array.isArray(session.subMonitorUids)
    ? session.subMonitorUids
    : [];
  if (!monitors.includes(sub.uid)) {
    denied('Only the substitute who started a run can control it.');
  }
  const until =
    typeof session.subMonitorUntil === 'number' ? session.subMonitorUntil : 0;
  if (deps.now() >= until) denied('Your time on that run has ended.');

  const now = deps.now();
  // Ending twice is the same end; pausing something already over is not.
  const over =
    session.status === 'ended' ||
    (kind === 'guidedLearning' &&
      typeof session.closeAt === 'number' &&
      session.closeAt <= now);
  if (over && action !== 'end') denied('That run has already ended.');
  if (over) return { state: 'ended' };

  const patches = controlPatches(kind, action, now);
  const batch = db.batch();
  batch.update(sessionRef, patches.session);
  batch.update(
    db.doc(`users/${hostUid}/${ASSIGNMENTS[kind]}/${sessionId}`),
    patches.assignment
  );
  await batch.commit();

  if (kind === 'quiz' && action === 'end') {
    await finalizeQuizResponses(db, sessionId, session, now);
  }

  return { state: patches.state };
}

export const controlSubAssignmentV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    assertViewAsAllowed(request, { outward: true });
    return handleControlSubAssignment(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            email: request.auth.token.email ?? null,
            emailVerified: request.auth.token.email_verified === true,
            anonymous:
              request.auth.token.firebase?.sign_in_provider === 'anonymous',
            studentRole: request.auth.token.studentRole === true,
          }
        : null,
      request.data
    );
  }
);
