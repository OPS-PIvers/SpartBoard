// Super admin "View as student" preview tokens (docs/plans/ADMIN_VIEW_AS.md D15).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';
import {
  VIEW_AS_SESSIONS,
  assertEnabled,
  assertStrictSuperAdmin,
  auditEntry,
  readSession,
} from './viewAs';
import { readViewAsClaim } from './viewAsGuard';

type Firestore = admin.firestore.Firestore;

export const STUDENT_PREVIEW_KINDS = [
  'quiz',
  'video-activity',
  'guided-learning',
  'activity-wall',
] as const;
export type StudentPreviewKind = (typeof STUDENT_PREVIEW_KINDS)[number];

const SESSION_COLLECTIONS: Record<StudentPreviewKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  'activity-wall': 'activity_wall_sessions',
};

const MAX_CLASS_IDS = 50;

export interface StudentPreviewRequest {
  kind: StudentPreviewKind;
  sessionId: string;
  studentKey: string;
}

export interface PreviewStudent {
  studentUid: string;
  studentRole: boolean;
  classIds: string[];
  path: string;
}

const isPathSegment = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 200 &&
  !v.includes('/') &&
  v !== '.' &&
  v !== '..';

export function parseStudentPreviewRequest(
  data: unknown
): StudentPreviewRequest {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<
    string,
    unknown
  >;
  const kind = raw.kind;
  if (!STUDENT_PREVIEW_KINDS.includes(kind as StudentPreviewKind)) {
    throw new HttpsError('invalid-argument', 'Unknown activity type.');
  }
  if (!isPathSegment(raw.sessionId) || !isPathSegment(raw.studentKey)) {
    throw new HttpsError('invalid-argument', 'Pick a student to view.');
  }
  return {
    kind: kind as StudentPreviewKind,
    sessionId: raw.sessionId,
    studentKey: raw.studentKey,
  };
}

function sessionClassIds(session: Record<string, unknown>): string[] {
  const list = Array.isArray(session.classIds)
    ? session.classIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      )
    : [];
  if (list.length > 0) return list.slice(0, MAX_CLASS_IDS);
  return typeof session.classId === 'string' && session.classId
    ? [session.classId]
    : [];
}

function classIdsFor(
  response: Record<string, unknown>,
  session: Record<string, unknown>
): string[] {
  return typeof response.classId === 'string' && response.classId
    ? [response.classId]
    : sessionClassIds(session);
}

const notFound = () =>
  new HttpsError('not-found', 'That student has no work in this activity.');

/** Derives the student from the teacher's own session data; nothing in the request is trusted beyond the ids. */
export async function resolvePreviewStudent(
  db: Firestore,
  teacherUid: string,
  req: StudentPreviewRequest
): Promise<PreviewStudent> {
  const sessionPath = `${SESSION_COLLECTIONS[req.kind]}/${req.sessionId}`;
  const sessionSnap = await db.doc(sessionPath).get();
  if (!sessionSnap.exists) throw notFound();
  const session: Record<string, unknown> = sessionSnap.data() ?? {};
  const owned =
    req.kind === 'activity-wall'
      ? req.sessionId.startsWith(`${teacherUid}_`)
      : session.teacherUid === teacherUid;
  if (!owned) {
    throw new HttpsError(
      'permission-denied',
      'That activity belongs to another teacher.'
    );
  }

  if (req.kind === 'activity-wall') {
    const posts = await db
      .collection(`${sessionPath}/submissions`)
      .where('authorUid', '==', req.studentKey)
      .limit(1)
      .get();
    if (posts.empty) throw notFound();
    const classIds = sessionClassIds(session);
    return {
      studentUid: req.studentKey,
      studentRole: classIds.length > 0,
      classIds,
      path: `${sessionPath}/submissions/${posts.docs[0].id}`,
    };
  }

  const responsePath = `${sessionPath}/responses/${req.studentKey}`;
  const responseSnap = await db.doc(responsePath).get();
  if (!responseSnap.exists) throw notFound();
  const response: Record<string, unknown> = responseSnap.data() ?? {};

  if (req.kind === 'guided-learning') {
    return {
      studentUid: req.studentKey,
      studentRole: typeof response.pin !== 'string' || response.pin === '',
      classIds: classIdsFor(response, session),
      path: responsePath,
    };
  }

  const studentUid = response.studentUid;
  if (typeof studentUid !== 'string' || !studentUid) throw notFound();
  return {
    studentUid,
    // Anonymous PIN joiners key their response `pin-…`; SSO students key it by uid.
    studentRole: !req.studentKey.startsWith('pin-'),
    classIds: classIdsFor(response, session),
    path: responsePath,
  };
}

export const startViewAsStudentV1 = onCall(
  { cors: ALLOWED_ORIGINS },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const claim = readViewAsClaim(request);
    if (!claim || !claim.sid || !claim.by) {
      throw new HttpsError(
        'permission-denied',
        "Open a student from their teacher's account."
      );
    }
    const req = parseStudentPreviewRequest(request.data);
    const db = admin.firestore();
    const sessionRef = db.collection(VIEW_AS_SESSIONS).doc(claim.sid);
    const session = readSession(await sessionRef.get());
    const now = Date.now();
    if (
      !session ||
      session.by !== claim.by ||
      session.targetUid !== request.auth.uid ||
      session.ended ||
      now >= session.expiresAtMs ||
      now >= claim.exp
    ) {
      throw new HttpsError(
        'permission-denied',
        'This View as session has ended.'
      );
    }
    await assertEnabled(db);
    await assertStrictSuperAdmin(db, claim.by);

    const student = await resolvePreviewStudent(db, request.auth.uid, req);
    const exp = Math.min(session.expiresAtMs, claim.exp);

    // Audit lands before the token exists, as for the teacher session.
    await db.collection('admin_audit_log').add(
      auditEntry('view_as_student', claim.sid, session, {
        path: student.path,
        studentUid: student.studentUid,
      })
    );

    let token: string;
    try {
      token = await admin.auth().createCustomToken(student.studentUid, {
        studentRole: student.studentRole,
        classIds: student.classIds,
        viewAs: {
          by: claim.by,
          sid: claim.sid,
          ro: true,
          adminTarget: false,
          exp,
          student: true,
        },
      });
    } catch (err) {
      console.error('[viewAsStudent] createCustomToken failed', err);
      throw new HttpsError('internal', 'Could not open the student view.');
    }

    return {
      sid: claim.sid,
      token,
      studentUid: student.studentUid,
      kind: req.kind,
      sessionId: req.sessionId,
      studentKey: req.studentKey,
      expiresAt: exp,
    };
  }
);
