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
//       - classIds               ← ∪ 'schoology:<contextId>' so students of
//                                   every linked section pass the rules
//                                   class-gate (the deep-link only knows the
//                                   section it was attached from).
//       - periodNames            ← the Schoology section title (so the class
//                                   filter shows the section instead of "No
//                                   classes" — the analogue of a roster name).
//                                   Skipped/removed when the section is linked
//                                   to a class already on the session, so a
//                                   roster + its linked section count once.
//       - classPeriodByClassId   ← { 'schoology:<contextId>': <section title> }
//                                   so the SSO join resolves each student's
//                                   period the same way the ClassLink path does.
//       - ltiAttachment          ← { resourceLinkId } so the dashboard Results
//                                   view can push AGS grades (the resource-link
//                                   id is only known server-side, at launch).
//       - ltiNrps                ← routing flag: the monitor calls the NRPS name
//                                   resolver only for flagged sessions.
//   • For a quiz, periodNames/classIds/classPeriodByClassId are ALSO mirrored onto the archive doc
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
/** Section↔ClassLink link docs (owned by courseLinkEndpoints.ts; read here only). */
const LTI_COURSE_LINKS_COLLECTION = 'lti_course_links';
const RESPONSES_SUBCOLLECTION = 'responses';

function sessionCollectionForKind(kind: LtiSessionKind): string {
  return kind === 'va'
    ? VIDEO_ACTIVITY_SESSIONS_COLLECTION
    : QUIZ_SESSIONS_COLLECTION;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as unknown[]).filter(
        (v): v is string => typeof v === 'string' && !!v
      )
    : [];
}

/** True when the section's paired ClassLink class or roster already targets the session. */
export function sectionPairedOnSession(
  sessionData: admin.firestore.DocumentData,
  classlinkClassId: unknown,
  rosterId: unknown
): boolean {
  const classIds = stringList(sessionData.classIds);
  const rosterIds = stringList(sessionData.rosterIds);
  return (
    (typeof classlinkClassId === 'string' &&
      !!classlinkClassId &&
      classIds.includes(classlinkClassId)) ||
    (typeof rosterId === 'string' && !!rosterId && rosterIds.includes(rosterId))
  );
}

export interface DedupeLinkedSectionPeriodArgs {
  kind: LtiSessionKind;
  sessionId: string;
  sessionData: admin.firestore.DocumentData;
  contextTitle: string | null;
  classlinkClassId: unknown;
  rosterId: unknown;
}

/**
 * The session's periodNames with a linked section's title removed, or null when
 * nothing should change: the section isn't paired with a class already on the
 * session, the title isn't present, or a response already carries that label
 * (PIN students picked it — removing it would fork the period filter).
 */
export async function dedupeLinkedSectionPeriod(
  db: Db,
  args: DedupeLinkedSectionPeriodArgs
): Promise<string[] | null> {
  const { kind, sessionId, sessionData, contextTitle } = args;
  if (!contextTitle) return null;
  if (
    !sectionPairedOnSession(sessionData, args.classlinkClassId, args.rosterId)
  )
    return null;
  const periods = stringList(sessionData.periodNames);
  if (!periods.includes(contextTitle)) return null;
  const used = await db
    .collection(sessionCollectionForKind(kind))
    .doc(sessionId)
    .collection(RESPONSES_SUBCOLLECTION)
    .where('classPeriod', '==', contextTitle)
    .limit(1)
    .get();
  if (!used.empty) return null;
  return periods.filter((p) => p !== contextTitle);
}

export interface DropLinkedSectionPeriodArgs {
  kind: LtiSessionKind;
  sessionId: string;
  contextTitle: string | null;
  classlinkClassId: unknown;
  rosterId: unknown;
}

/**
 * Link-time counterpart of the launch-time dedupe: when a teacher links a
 * section to a class already on the session, drop the section's title from the
 * session (and the quiz archive doc) so the card stops counting it twice.
 * Returns true when a write happened.
 */
export async function dropLinkedSectionPeriod(
  db: Db,
  args: DropLinkedSectionPeriodArgs
): Promise<boolean> {
  const { kind, sessionId } = args;
  const ref = db.collection(sessionCollectionForKind(kind)).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const sessionData = snap.data() ?? {};
  const next = await dedupeLinkedSectionPeriod(db, { ...args, sessionData });
  if (!next) return false;
  const batch = db.batch();
  batch.set(ref, { periodNames: next }, { merge: true });
  const teacherUid =
    typeof sessionData.teacherUid === 'string' ? sessionData.teacherUid : '';
  if (kind === 'quiz' && teacherUid) {
    batch.set(
      db
        .collection(USERS_COLLECTION)
        .doc(teacherUid)
        .collection(QUIZ_ASSIGNMENTS_SUBCOLLECTION)
        .doc(sessionId),
      { periodNames: next },
      { merge: true }
    );
  }
  await batch.commit();
  return true;
}
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
/** Identifies the session a launch targets: a quiz join code or a VA session id. */
export type LtiTargetSessionArgs =
  | { kind: 'quiz'; quizCode: string }
  | { kind: 'va'; sessionId: string };

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
  /** ClassLink class the launch was bridged to (classlinkBridge.ts), if any. */
  bridgedClassId?: string | null;
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

/** The session a Schoology launch joins: the VA session by id, or the most recently started joinable quiz session for the code. */
export async function resolveLtiTargetSession(
  db: Db,
  args: LtiTargetSessionArgs
): Promise<{
  sessionId: string;
  sessionData: admin.firestore.DocumentData;
} | null> {
  const collectionName = sessionCollectionForKind(args.kind);
  if (args.kind === 'va') {
    const sid = args.sessionId.trim();
    if (!sid) return null;
    const snap = await db.collection(collectionName).doc(sid).get();
    if (!snap.exists) return null;
    return { sessionId: snap.id, sessionData: snap.data() ?? {} };
  }
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
  return { sessionId: sessionDoc.id, sessionData: sessionDoc.data() ?? {} };
}

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

  const collectionName = sessionCollectionForKind(kind);

  const target = await resolveLtiTargetSession(db, args);
  if (!target) return null;
  const { sessionId, sessionData } = target;

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
    // Prefer the stored title over a null from a privacy-configured relaunch:
    // some Schoology deployments omit the context title on relaunches (privacy
    // config). Overwriting a previously-captured title with null would clear
    // the section name shown in the linking UI permanently until a titled
    // launch occurs again — the same preservation logic the seen-section
    // inventory (below) already applies to its own copy.
    const storedCtxTitle =
      typeof ex?.contextTitle === 'string' ? ex.contextTitle : null;
    const nextCtxTitle = args.contextTitle ?? storedCtxTitle;
    // Only write when new or changed — bounds writes to actual changes.
    if (
      !existing.exists ||
      ex?.contextMembershipsUrl !== membershipUrl ||
      ex?.contextTitle !== nextCtxTitle
    ) {
      batch.set(
        ctxRef,
        {
          contextMembershipsUrl: membershipUrl,
          contextTitle: nextCtxTitle,
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

  // Linked sections launch with their own contextId; union it so the rules class-gate admits them.
  const classId = `schoology:${contextId}`;
  const currentClassIds = Array.isArray(sessionData.classIds)
    ? (sessionData.classIds as unknown[]).filter(
        (c): c is string => typeof c === 'string' && !!c
      )
    : [];
  // A bridged student already passes on their ClassLink class; skip the union so SSO period resolution stays unambiguous.
  const admittedByBridge =
    !!args.bridgedClassId && currentClassIds.includes(args.bridgedClassId);
  if (!currentClassIds.includes(classId) && !admittedByBridge) {
    update.classIds = [...currentClassIds, classId];
  }

  if (args.contextTitle) {
    // A section linked to a class already on the session is that class; its title must not count twice.
    const linkSnap = await db
      .collection(LTI_COURSE_LINKS_COLLECTION)
      .doc(contextId)
      .get();
    const link = linkSnap.data() ?? {};
    // A test-class link pairs on the roster's testClassId slug (also in classIds).
    const pairedClassId: unknown =
      link.classlinkClassId ?? (link.testClassId as unknown);
    if (sectionPairedOnSession(sessionData, pairedClassId, link.rosterId)) {
      nextPeriodNames = await dedupeLinkedSectionPeriod(db, {
        kind,
        sessionId,
        sessionData,
        contextTitle: args.contextTitle,
        classlinkClassId: pairedClassId,
        rosterId: link.rosterId,
      });
      if (nextPeriodNames) update.periodNames = nextPeriodNames;
    } else {
      const currentPeriods = stringList(sessionData.periodNames);
      if (!currentPeriods.includes(args.contextTitle)) {
        nextPeriodNames = [...currentPeriods, args.contextTitle];
        update.periodNames = nextPeriodNames;
      }
    }

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
  // classIds / classPeriodByClassId ride along so the assignments hub can resolve sections without a session read.
  const archive: Record<string, unknown> = {};
  if (nextPeriodNames) archive.periodNames = nextPeriodNames;
  if (update.classIds) archive.classIds = update.classIds;
  if (update.classPeriodByClassId) {
    archive.classPeriodByClassId = update.classPeriodByClassId;
  }
  if (kind === 'quiz' && Object.keys(archive).length > 0) {
    const teacherUid =
      typeof sessionData.teacherUid === 'string' ? sessionData.teacherUid : '';
    if (teacherUid) {
      batch.set(
        db
          .collection(USERS_COLLECTION)
          .doc(teacherUid)
          .collection(QUIZ_ASSIGNMENTS_SUBCOLLECTION)
          .doc(sessionId),
        archive,
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
  // Gate on membershipUrl: the linking trust anchor (assertOwnsSchoologyContext)
  // requires the per-context membership doc, which is ONLY written when NRPS is
  // present (above). Advertising a seen section whose membership doc doesn't
  // exist would offer a section the link CFs always reject — so only inventory a
  // section that's actually linkable.
  const teacherUid =
    typeof sessionData.teacherUid === 'string' ? sessionData.teacherUid : '';
  if (teacherUid && membershipUrl) {
    const seenRef = db
      .collection(USERS_COLLECTION)
      .doc(teacherUid)
      .collection(LTI_SEEN_SECTIONS_SUBCOLLECTION)
      .doc(contextId);
    const seenExisting = await seenRef.get();
    const se = seenExisting.data();
    // Never clobber a previously-captured title with null: some launches omit the
    // context title (privacy configs), and overwriting the stored name with null
    // would degrade the linking UI to a generic "Schoology section" label.
    const storedTitle =
      typeof se?.contextTitle === 'string' ? se.contextTitle : null;
    const nextTitle = args.contextTitle ?? storedTitle;
    if (
      !seenExisting.exists ||
      se?.contextTitle !== nextTitle ||
      se?.sessionId !== sessionId ||
      se?.kind !== kind
    ) {
      batch.set(
        seenRef,
        {
          contextId,
          contextTitle: nextTitle,
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
