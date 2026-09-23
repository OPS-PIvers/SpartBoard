// controlSubAssignmentV1 — a substitute pauses or ends the one run they
// started (docs/plans/SUB_SHARE_COLLECTIONS.md §3.6). They cannot write the
// teacher's session docs, and the plan chose a callable over widening the
// update rules, so the write runs here as admin once the caller is proven to
// be the monitor the launch stamped.

import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
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

const CONTROLLABLE_KINDS = [
  'quiz',
  'videoActivity',
  'guidedLearning',
  'flashcards',
] as const;
type ControlKind = (typeof CONTROLLABLE_KINDS)[number];

const ACTIONS = ['pause', 'resume', 'end'] as const;
type ControlAction = (typeof ACTIONS)[number];

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

/** Responses finalized per batch when a quiz ends; the teacher's own path
 *  writes them all in one, and a sub-launched class is one class. */
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
  state: 'paused' | 'active' | 'ended';
}

export interface SubControlDeps {
  now: () => number;
}

export const liveSubControlDeps: SubControlDeps = { now: () => Date.now() };

/**
 * Mirror of `finalizeAllResponses` (`hooks/useQuizSession.ts`): a student still
 * answering when the run ends is marked completed so their work reaches the
 * teacher's results. `completedAttempts` is bumped for the same reason it is
 * there — without it a rejoin reads 0 completed and slips past the cap.
 */
export async function finalizeQuizResponses(
  db: admin.firestore.Firestore,
  sessionId: string,
  now: number
): Promise<number> {
  const snap = await db
    .collection(`quiz_sessions/${sessionId}/responses`)
    .limit(MAX_FINALIZED)
    .get();
  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    const status: unknown = doc.data().status;
    if (status !== 'in-progress' && status !== 'joined') continue;
    batch.update(doc.ref, {
      status: 'completed',
      submittedAt: now,
      completedAttempts: admin.firestore.FieldValue.increment(1),
    });
    count += 1;
  }
  if (count > 0) await batch.commit();
  return count;
}

interface Patches {
  session: Record<string, unknown>;
  assignment: Record<string, unknown>;
  state: ControlSubAssignmentResult['state'];
}

/**
 * What each kind's own teacher-side control writes, mirrored field for field
 * so a sub-ended run looks exactly like a teacher-ended one.
 */
export function controlPatches(
  kind: ControlKind,
  action: ControlAction,
  now: number
): Patches {
  if (action === 'pause') {
    // Only a quiz has a paused state; the others are active or ended.
    return {
      session: { status: 'paused', autoProgressAt: null, endedAt: null },
      assignment: { status: 'paused', updatedAt: now },
      state: 'paused',
    };
  }
  if (action === 'resume') {
    // A sub-launched quiz is always self-paced, so active is where it resumes
    // to; there is no teacher-paced question index to restore.
    return {
      session: { status: 'active' },
      assignment: { status: 'active', updatedAt: now },
      state: 'active',
    };
  }
  if (kind === 'guidedLearning') {
    // A guided session has no status of its own: students are gated on the
    // close time. Archiving is the teacher's own filing action, not this.
    return {
      session: { closeAt: now },
      assignment: { closeAt: now, updatedAt: now },
      state: 'ended',
    };
  }
  if (kind === 'videoActivity') {
    return {
      session: { status: 'ended', endedAt: now },
      assignment: { status: 'inactive', updatedAt: now },
      state: 'ended',
    };
  }
  if (kind === 'flashcards') {
    return {
      session: { status: 'ended', endedAt: now, updatedAt: now },
      assignment: { status: 'ended', endedAt: now, updatedAt: now },
      state: 'ended',
    };
  }
  // A quiz and a video activity file their assignment as `inactive`, which is
  // the archived bucket the teacher's manager filters on; only the session ends.
  return {
    session: { status: 'ended', endedAt: now, autoProgressAt: null },
    assignment: { status: 'inactive', updatedAt: now },
    state: 'ended',
  };
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
    await finalizeQuizResponses(db, sessionId, now);
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
  async (request) =>
    handleControlSubAssignment(
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
    )
);
