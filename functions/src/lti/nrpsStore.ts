// Schoology LTI 1.3 — NRPS membership-endpoint persistence (PII-free).
//
// When a Schoology student launches a deep-linked quiz, the launch carries the
// context's `context_memberships_url` (NRPS). We file that URL under the quiz
// SESSION the student is joining so the teacher's monitor can later resolve
// every Schoology student's name on-read. ONLY the URL + platform ids are
// stored — never a name or email. Keyed by sessionId (not the recyclable join
// code) so a recycled code can never leak one teacher's roster to another: the
// resolver reads only its own session's contexts and is gated on session
// ownership.
//
// Admin-SDK only; `firestore.rules` denies all client access to this tree.

import type * as admin from 'firebase-admin';
import { normalizeQuizCode } from '../quizCode';

type Db = admin.firestore.Firestore;

export const QUIZ_SESSIONS_COLLECTION = 'quiz_sessions';
/** `lti_session_memberships/{sessionId}/contexts/{contextId}` */
export const LTI_SESSION_MEMBERSHIPS_COLLECTION = 'lti_session_memberships';

// The session statuses that are still accepting joins — mirrors the client's
// join-target selection in useQuizSession so the membership is filed under the
// SAME session the student's responses land in.
const JOINABLE_STATUSES = new Set(['waiting', 'active', 'paused']);

export interface PersistNrpsArgs {
  /** The quiz join code embedded in the deep-link (`custom.quiz_code`). */
  quizCode: string;
  /** The Schoology context (course) id from the launch. */
  contextId: string;
  /** The platform-hosted NRPS membership URL (PII-free service endpoint). */
  membershipUrl: string;
  /** Launch deployment id, stored for diagnostics / future multi-deployment. */
  deploymentId: string;
}

/**
 * Resolve the joinable quiz session for `quizCode` and persist the context's
 * NRPS membership URL under it. Sets `ltiNrps: true` on the session the FIRST
 * time a context is filed (so the monitor knows to call the resolver, and so
 * we don't re-write the session doc — and re-fire its snapshot listeners — on
 * every subsequent student launch).
 *
 * Returns the resolved sessionId, or null when no joinable session matched
 * (e.g. the session ended between launch and exchange) — a benign no-op.
 */
export async function persistNrpsMembershipForLaunch(
  db: Db,
  args: PersistNrpsArgs
): Promise<string | null> {
  const normCode = normalizeQuizCode(args.quizCode);
  if (!normCode) return null;

  const snap = await db
    .collection(QUIZ_SESSIONS_COLLECTION)
    .where('code', '==', normCode)
    .get();

  // Filter to joinable docs and prefer the most recently started — identical
  // to the client's join-target selection, so the membership is filed under
  // the exact session the student joined.
  const joinable = snap.docs
    .filter((d) => JOINABLE_STATUSES.has((d.data().status as string) ?? ''))
    .sort(
      (a, b) =>
        ((b.data().startedAt as number) ?? 0) -
        ((a.data().startedAt as number) ?? 0)
    );
  const sessionDoc = joinable[0];
  if (!sessionDoc) return null;

  const sessionId = sessionDoc.id;
  const ctxRef = db
    .collection(LTI_SESSION_MEMBERSHIPS_COLLECTION)
    .doc(sessionId)
    .collection('contexts')
    .doc(args.contextId);

  // First-context check: only flip the session flag when this context is new,
  // bounding session-doc writes to the number of distinct Schoology contexts
  // (1 for a single-course attach; a handful for a multi-section one) rather
  // than once per student launch.
  const existing = await ctxRef.get();
  await ctxRef.set(
    {
      contextMembershipsUrl: args.membershipUrl,
      deploymentId: args.deploymentId,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  if (!existing.exists) {
    await db
      .collection(QUIZ_SESSIONS_COLLECTION)
      .doc(sessionId)
      .set({ ltiNrps: true }, { merge: true });
  }
  return sessionId;
}
