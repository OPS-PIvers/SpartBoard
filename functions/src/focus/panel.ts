// The extension side panel's Focus tab (CHROME_EXTENSION.md F12): one endpoint over the teacher session actions.
import { HttpsError } from 'firebase-functions/v2/https';
import type * as admin from 'firebase-admin';
import {
  canUseFocusWidget,
  handleFocusEnd,
  handleFocusExtend,
  handleFocusRelease,
  handleFocusStart,
  verifyTeacher,
  type FocusCaller,
  type FocusDeps,
} from './sessions';
import {
  DEFAULT_FOCUS_LEVEL,
  FOCUS_SESSIONS_COLLECTION,
  type FocusPanelClass,
  type FocusPanelListReply,
  type FocusPanelSession,
  type FocusSessionDoc,
} from './shared.gen';

type Firestore = admin.firestore.Firestore;

const MAX_CLASS_ID = 128;
const MAX_CLASSES = 100;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The teacher's classes, from their ClassLink rosters (and mock-class ones where the server allows them), one row per class. */
export async function panelClasses(
  db: Firestore,
  uid: string,
  includeMock: boolean
): Promise<FocusPanelClass[]> {
  const snap = await db.collection(`users/${uid}/rosters`).get();
  const byId = new Map<string, FocusPanelClass>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const classId =
      str(data.classlinkClassId) || (includeMock ? str(data.testClassId) : '');
    if (!classId || classId.length > MAX_CLASS_ID || classId.includes('/'))
      continue;
    if (byId.has(classId)) continue;
    byId.set(classId, {
      classId,
      name: str(data.name).trim().slice(0, 100) || 'Class',
    });
  }
  return [...byId.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_CLASSES);
}

/** Running sessions the teacher is on, oldest first. */
export async function panelSessions(
  db: Firestore,
  uid: string,
  now: number
): Promise<FocusPanelSession[]> {
  const snap = await db
    .collection(FOCUS_SESSIONS_COLLECTION)
    .where('teacherUids', 'array-contains', uid)
    .where('endedAt', '==', null)
    .get();
  return snap.docs
    .map((doc) => ({ id: doc.id, s: doc.data() as FocusSessionDoc }))
    .filter(({ s }) => s.endedAt === null && s.endsAt > now)
    .sort((a, b) => a.s.startedAt - b.s.startedAt)
    .map(({ id, s }) => ({
      sessionId: id,
      classId: s.classId,
      className: s.className,
      level: s.level,
      sites: s.sites,
      endsAt: s.endsAt,
      studentCount: s.studentUids.length,
    }));
}

/** Routes one panel call; the session handlers do every class, window and permission check. */
export async function handleFocusPanel(
  db: Firestore,
  caller: FocusCaller,
  body: unknown,
  deps: FocusDeps
): Promise<unknown> {
  const { email } = verifyTeacher(caller);
  const input = (body ?? {}) as Record<string, unknown>;
  switch (input.action) {
    case 'list': {
      if (!(await canUseFocusWidget(db, email)))
        throw new HttpsError(
          'permission-denied',
          'Focus is not turned on for your account.'
        );
      // Mock classes start only on dev or for admins (taughtClassStudentUids), so list them only then.
      const includeMock =
        deps.mockClassesOpen() ||
        (await db.doc(`admins/${email}`).get()).exists;
      const [classes, sessions] = await Promise.all([
        panelClasses(db, caller.uid, includeMock),
        panelSessions(db, caller.uid, deps.now()),
      ]);
      return { classes, sessions } satisfies FocusPanelListReply;
    }
    case 'start':
      // The panel has no level picker; the widget holds the full settings (F12).
      return handleFocusStart(
        db,
        caller,
        {
          classId: input.classId,
          className: input.className,
          minutes: input.minutes,
          sites: input.sites,
          level: DEFAULT_FOCUS_LEVEL,
        },
        deps
      );
    case 'extend':
      return handleFocusExtend(
        db,
        caller,
        { sessionId: input.sessionId },
        deps
      );
    case 'release':
      return handleFocusRelease(
        db,
        caller,
        { sessionId: input.sessionId },
        deps
      );
    case 'end':
      return handleFocusEnd(db, caller, { sessionId: input.sessionId }, deps);
    default:
      throw new HttpsError('invalid-argument', 'Unknown action.');
  }
}
