// Schoology LTI 1.3 — launch-context persistence (PII-free).
//
// When a Schoology student launches a deep-linked assignment, the launch carries
// PII-free routing data we file under the SESSION the student is joining so the
// teacher's monitor/results can later (a) resolve every Schoology student's name
// ON READ via NRPS, (b) filter by the Schoology section, and (c) push grades back
// to the gradebook. Specifically we persist:
//
//   • lti_session_memberships/{sessionId}/contexts/{contextId} — the context's
//     NRPS `context_memberships_url` (a service endpoint, never a name/email).
//     Keyed by sessionId (not the recyclable join code) so a recycled code can
//     never leak one teacher's roster to another: the resolver reads only its
//     own session's contexts and is gated on session ownership.
//   • On the session doc itself (denormalized, idempotent):
//       - periodNames            ← the Schoology section title (so the class
//                                   filter shows the section instead of "No
//                                   classes" — the analogue of a roster name).
//       - classPeriodByClassId   ← { 'schoology:<contextId>': <section title> }
//                                   so the SSO join resolves each student's
//                                   period the same way the ClassLink path does.
//       - ltiAttachment          ← { resourceLinkId } so the dashboard Results
//                                   view can push AGS grades (the resource-link
//                                   id is only known server-side, at launch).
//       - ltiNrps                ← routing flag: the monitor calls the NRPS name
//                                   resolver only for flagged sessions.
//   • For a quiz, periodNames is ALSO mirrored onto the teacher's archive doc
//     (`users/{teacherUid}/quiz_assignments/{sessionId}`) so the QuizManager
//     card shows the section with ZERO extra client reads (the archive is
//     already streamed) — matching how the Classroom path stores it there.
//
// All the writes above are committed in a SINGLE batch so the membership URL and
// the `ltiNrps` flag can never desync (a half-write would leave names silently
// unresolvable — the membership filed but the monitor never told to resolve it).
//
// Section TITLES are class/section names (e.g. "Math 7"), NOT student PII — the
// Google Classroom path already stores the equivalent roster names. No student
// name or email is ever written.
//
// Quiz vs Video Activity: a quiz deep-link carries a join CODE (the session is
// created later when the teacher runs it), so we resolve the session by code.
// A video-activity deep-link carries the session id directly (the session
// already exists at attach time), so we file under it.
//
// Admin-SDK only; `firestore.rules` denies all client access to the membership
// tree. Best-effort throughout: a failure here NEVER blocks the student.

import type * as admin from 'firebase-admin';
import { normalizeQuizCode } from '../quizCode';

type Db = admin.firestore.Firestore;

export const QUIZ_SESSIONS_COLLECTION = 'quiz_sessions';
export const VIDEO_ACTIVITY_SESSIONS_COLLECTION = 'video_activity_sessions';
/** `users/{teacherUid}/quiz_assignments/{assignmentId}` (assignmentId == sessionId). */
export const USERS_COLLECTION = 'users';
export const QUIZ_ASSIGNMENTS_SUBCOLLECTION = 'quiz_assignments';
/** `lti_session_memberships/{sessionId}/contexts/{contextId}` */
export const LTI_SESSION_MEMBERSHIPS_COLLECTION = 'lti_session_memberships';
/** `users/{teacherUid}/lti_seen_sections/{contextId}` — linking-UI inventory. */
export const LTI_SEEN_SECTIONS_SUBCOLLECTION = 'lti_seen_sections';

export type LtiSessionKind = 'quiz' | 'va';

// The quiz-session statuses that are still accepting joins — mirrors the client's
// join-target selection in useQuizSession so the membership is filed under the
// SAME session the student's responses land in.
const JOINABLE_QUIZ_STATUSES = new Set(['waiting', 'active', 'paused']);

/**
 * Fields common to both launch kinds, plus a discriminated `kind`→id pairing so
 * an illegal combination (e.g. `kind: 'va'` with a `quizCode`) is unrepresentable
 * at the type level — the function's runtime guards then stay as defense-in-depth.
 */
export type PersistLtiLaunchContextArgs = {
  /** The Schoology context (course) id from the launch. */
  contextId: string;
  /** The Schoology context (course/section) title from the launch, if released. */
  contextTitle: string | null;
  /** The launch's resource-link id (drives AGS grade push). */
  resourceLinkId: string | null;
  /**
   * The platform-hosted NRPS membership URL (PII-free service endpoint). Present
   * only when NRPS is enabled on the platform; absent ⇒ skip the name-resolution
   * wiring but still denormalize the section + attachment.
   */
  membershipUrl?: string | null;
  /** Launch deployment id, stored for diagnostics / future multi-deployment. */
  deploymentId: string;
} & (
  | {
      kind: 'quiz';
      /** The quiz join code embedded in the deep-link (`custom.quiz_code`). */
      quizCode: string;
    }
  | {
      kind: 'va';
      /** The video-activity session id (`custom.session_id`). */
      sessionId: string;
    }
);

/**
 * Resolve the target session for a Schoology launch and persist the PII-free
 * launch context onto it (see the module header for the full field list).
 *
 * Returns the resolved sessionId, or null when no target session matched (e.g.
 * the quiz session ended between launch and exchange, or the VA session id is
 * stale) — a benign no-op.
 *
 * Idempotent + write-bounded: the session doc is written ONLY when a field would
 * actually change, so repeat launches from the same context produce no write
 * (and therefore no monitor snapshot churn). The membership-URL doc is likewise
 * only (re)written when new or changed.
 */
export async function persistLtiLaunchContext(
  db: Db,
  args: PersistLtiLaunchContextArgs
): Promise<string | null> {
  const { kind, contextId } = args;
  if (!contextId) return null;

  const collectionName =
    kind === 'va'
      ? VIDEO_ACTIVITY_SESSIONS_COLLECTION
      : QUIZ_SESSIONS_COLLECTION;

  // ── Resolve the target session doc ──────────────────────────────────────────
  let sessionId: string;
  let sessionData: admin.firestore.DocumentData;
  if (kind === 'va') {
    const sid = args.sessionId.trim();
    if (!sid) return null;
    const snap = await db.collection(collectionName).doc(sid).get();
    if (!snap.exists) return null;
    sessionId = snap.id;
    sessionData = snap.data() ?? {};
  } else {
    const normCode = normalizeQuizCode(args.quizCode);
    if (!normCode) return null;
    const snap = await db
      .collection(collectionName)
      .where('code', '==', normCode)
      .get();
    // Filter to joinable docs and prefer the most recently started — identical
    // to the client's join-target selection, so the context is filed under the
    // exact session the student joined.
    const joinable = snap.docs
      .filter((d) =>
        JOINABLE_QUIZ_STATUSES.has((d.data().status as string) ?? '')
      )
      .sort(
        (a, b) =>
          ((b.data().startedAt as number) ?? 0) -
          ((a.data().startedAt as number) ?? 0)
      );
    const sessionDoc = joinable[0];
    if (!sessionDoc) return null;
    sessionId = sessionDoc.id;
    sessionData = sessionDoc.data() ?? {};
  }

  // Everything below is committed atomically (one batch) so the membership URL
  // and the `ltiNrps` flag can't desync into a silent "names never resolve"
  // half-write. The batch stays empty (no commit) when nothing changed, so a
  // repeat launch from a known context produces zero writes / no snapshot churn.
  const batch = db.batch();
  let hasWrites = false;

  // ── File the NRPS membership URL (only when NRPS is enabled) ─────────────────
  const membershipUrl = args.membershipUrl ?? null;
  if (membershipUrl) {
    const ctxRef = db
      .collection(LTI_SESSION_MEMBERSHIPS_COLLECTION)
      .doc(sessionId)
      .collection('contexts')
      .doc(contextId);
    const existing = await ctxRef.get();
    const ex = existing.data();
    // Only write when new or changed — bounds writes to actual changes.
    if (
      !existing.exists ||
      ex?.contextMembershipsUrl !== membershipUrl ||
      ex?.contextTitle !== (args.contextTitle ?? null)
    ) {
      batch.set(
        ctxRef,
        {
          contextMembershipsUrl: membershipUrl,
          contextTitle: args.contextTitle ?? null,
          deploymentId: args.deploymentId,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      hasWrites = true;
    }
  }

  // ── Denormalize the section + attachment onto the session (idempotent) ───────
  const update: Record<string, unknown> = {};
  // The section union, computed once so the session and the archive doc stay in
  // lockstep. Null when the title is absent or already present (no change).
  let nextPeriodNames: string[] | null = null;

  if (args.contextTitle) {
    const currentPeriods = Array.isArray(sessionData.periodNames)
      ? (sessionData.periodNames as unknown[]).filter(
          (p): p is string => typeof p === 'string' && !!p
        )
      : [];
    if (!currentPeriods.includes(args.contextTitle)) {
      nextPeriodNames = [...currentPeriods, args.contextTitle];
      update.periodNames = nextPeriodNames;
    }

    const classId = `schoology:${contextId}`;
    const currentMap =
      sessionData.classPeriodByClassId &&
      typeof sessionData.classPeriodByClassId === 'object'
        ? (sessionData.classPeriodByClassId as Record<string, string>)
        : {};
    if (currentMap[classId] !== args.contextTitle) {
      update.classPeriodByClassId = {
        ...currentMap,
        [classId]: args.contextTitle,
      };
    }
  }

  // Capture the resource-link once (it's the same for every student of one
  // assignment). Don't clobber an existing attachment.
  if (args.resourceLinkId && !sessionData.ltiAttachment) {
    update.ltiAttachment = {
      resourceLinkId: args.resourceLinkId,
      contextId,
    };
  }

  // Routing flag for the on-read name resolver — only meaningful with NRPS.
  if (membershipUrl && sessionData.ltiNrps !== true) {
    update.ltiNrps = true;
  }

  if (Object.keys(update).length > 0) {
    batch.set(db.collection(collectionName).doc(sessionId), update, {
      merge: true,
    });
    hasWrites = true;
  }

  // ── Mirror the section onto the teacher's quiz archive doc (quiz only) ───────
  // The QuizManager card reads the archive doc's `periodNames`; mirroring it here
  // (only when the section set actually changed) lets the card show the Schoology
  // section with NO extra client read. The doc id is the sessionId (1:1). VA's
  // manager card labels by activity title, so it needs no equivalent write.
  if (kind === 'quiz' && nextPeriodNames) {
    const teacherUid =
      typeof sessionData.teacherUid === 'string' ? sessionData.teacherUid : '';
    if (teacherUid) {
      batch.set(
        db
          .collection(USERS_COLLECTION)
          .doc(teacherUid)
          .collection(QUIZ_ASSIGNMENTS_SUBCOLLECTION)
          .doc(sessionId),
        { periodNames: nextPeriodNames },
        { merge: true }
      );
      hasWrites = true;
    }
  }

  // ── Per-teacher "seen Schoology section" inventory (linking UI) ──────────────
  // Records, under the SESSION's owner, that this teacher has seen `contextId`
  // (via a student launch of their assignment) plus the sessionId the linking
  // CFs use as their trust anchor. The "Link to Schoology" review screen + the
  // post-launch prompt read this owner-scoped doc; it's server-written (rules
  // deny client writes). Idempotent: only (re)written when a field changed, so
  // repeat launches don't churn the teacher's snapshot. Works for quiz AND VA.
  const teacherUid =
    typeof sessionData.teacherUid === 'string' ? sessionData.teacherUid : '';
  if (teacherUid) {
    const seenRef = db
      .collection(USERS_COLLECTION)
      .doc(teacherUid)
      .collection(LTI_SEEN_SECTIONS_SUBCOLLECTION)
      .doc(contextId);
    const seenExisting = await seenRef.get();
    const se = seenExisting.data();
    if (
      !seenExisting.exists ||
      se?.contextTitle !== (args.contextTitle ?? null) ||
      se?.sessionId !== sessionId ||
      se?.kind !== kind
    ) {
      batch.set(
        seenRef,
        {
          contextId,
          contextTitle: args.contextTitle ?? null,
          sessionId,
          kind,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();

  return sessionId;
}
