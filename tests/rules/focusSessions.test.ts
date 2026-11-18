// Focus sessions (docs/plans/CHROME_EXTENSION.md F1, F4, F6, F8, F11):
//   /focus_sessions/{id} and its students/{uid} — written only by the server;
//   the class's teachers and a sub stamped as monitor read; students and
//   anonymous users never do.
//   /admin_settings/focus_sessions — staff read; only super admins write.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-focus-sessions-rules-test';
const TEACHER_UID = 'teacher-uid';
const CO_TEACHER_UID = 'co-teacher-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';
const SUB_UID = 'sub-uid';
const STUDENT_UID = 'student-uid';
const ANON_UID = 'anon-uid';
const ADMIN_EMAIL = 'principal@school.edu';
const SUPER_EMAIL = 'boss@school.edu';

const SESSION = 'focus_sessions/s1';
const STUDENT = `${SESSION}/students/${STUDENT_UID}`;
const SETTINGS = 'admin_settings/focus_sessions';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const staff = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asTeacher = () => staff(TEACHER_UID, 'teacher@school.edu');
const asCoTeacher = () => staff(CO_TEACHER_UID, 'co@school.edu');
const asOtherTeacher = () => staff(OTHER_TEACHER_UID, 'other@school.edu');
const asSub = () => staff(SUB_UID, 'sub@school.edu');
const asAdmin = () => staff('admin-uid', ADMIN_EMAIL);
const asSuper = () => staff('super-uid', SUPER_EMAIL);

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

// A student-role token whose uid was somehow put in teacherUids still reads nothing.
const asStudentInTeacherList = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnon = (uid = ANON_UID) =>
  testEnv
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const session = (extra: Record<string, unknown> = {}) => ({
  orgId: 'orono',
  classId: 'class-A',
  className: 'Period 1',
  teacherUid: TEACHER_UID,
  teacherName: 'Ms. T',
  teacherUids: [TEACHER_UID, CO_TEACHER_UID],
  level: 'redirect',
  sites: [{ host: 'desmos.com', path: '' }],
  studentUids: [STUDENT_UID],
  startedAt: 1,
  endsAt: 2,
  endedAt: null,
  endReason: null,
  ...extra,
});

const seed = async (extra: Record<string, unknown> = {}) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, SESSION), session(extra));
    await setDoc(doc(db, STUDENT), {
      status: 'on-task',
      awaySince: null,
      awayMs: 0,
      blockedTries: 0,
      lastReportAt: 1,
      protocol: 9,
      liveHost: null,
      otherSessionEndsAt: null,
    });
  });

beforeAll(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostPart, portPart] = emulatorHost ? emulatorHost.split(':') : [];
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: hostPart || '127.0.0.1',
      port: portPart ? Number(portPart) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {
      roleId: 'building_admin',
    });
    await setDoc(doc(db, `admins/${SUPER_EMAIL}`), {});
    await setDoc(doc(db, 'admin_settings/user_roles'), {
      superAdmins: [SUPER_EMAIL],
    });
  });
  await seed();
});

describe('focus_sessions reads', () => {
  it('lets the starting teacher and a co-teacher read the session and its students', async () => {
    for (const db of [asTeacher(), asCoTeacher()]) {
      await assertSucceeds(getDoc(doc(db, SESSION)));
      await assertSucceeds(getDoc(doc(db, STUDENT)));
      await assertSucceeds(getDocs(collection(db, `${SESSION}/students`)));
    }
  });

  it('lets a teacher list their own sessions by teacherUids', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asCoTeacher(), 'focus_sessions'),
          where('teacherUids', 'array-contains', CO_TEACHER_UID)
        )
      )
    );
  });

  it('refuses a list that is not scoped to the caller', async () => {
    await assertFails(getDocs(collection(asTeacher(), 'focus_sessions')));
    await assertFails(
      getDocs(
        query(
          collection(asOtherTeacher(), 'focus_sessions'),
          where('teacherUids', 'array-contains', TEACHER_UID)
        )
      )
    );
    await assertFails(
      getDocs(
        query(
          collection(asSub(), 'focus_sessions'),
          where('subMonitorUids', 'array-contains', SUB_UID)
        )
      )
    );
  });

  it('denies a teacher who is not on the session, and an admin', async () => {
    for (const db of [asOtherTeacher(), asAdmin(), asSuper()]) {
      await assertFails(getDoc(doc(db, SESSION)));
      await assertFails(getDoc(doc(db, STUDENT)));
    }
  });

  it('lets a stamped sub read until the stamp runs out', async () => {
    await seed({
      subMonitorUids: [SUB_UID],
      subMonitorUntil: Date.now() + 60 * 60_000,
    });
    await assertSucceeds(getDoc(doc(asSub(), SESSION)));
    await assertSucceeds(getDoc(doc(asSub(), STUDENT)));
    await assertSucceeds(getDocs(collection(asSub(), `${SESSION}/students`)));

    await seed({ subMonitorUids: [SUB_UID], subMonitorUntil: Date.now() - 1 });
    await assertFails(getDoc(doc(asSub(), SESSION)));
    await assertFails(getDoc(doc(asSub(), STUDENT)));
  });

  it('denies a sub with no stamp', async () => {
    await assertFails(getDoc(doc(asSub(), SESSION)));
    await assertFails(getDoc(doc(asSub(), STUDENT)));
  });

  it('denies students, anonymous and signed-out callers, even their own state', async () => {
    for (const db of [
      asStudent(),
      asStudentInTeacherList(),
      asAnon(),
      asAnon(STUDENT_UID),
      asAnon(TEACHER_UID),
      asUnauth(),
    ]) {
      await assertFails(getDoc(doc(db, SESSION)));
      await assertFails(getDoc(doc(db, STUDENT)));
      await assertFails(getDocs(collection(db, `${SESSION}/students`)));
    }
  });

  it('denies reading students of a session that does not exist', async () => {
    await assertFails(
      getDoc(doc(asTeacher(), `focus_sessions/missing/students/${STUDENT_UID}`))
    );
  });
});

describe('focus_sessions writes', () => {
  it('refuses every client write, even from the session teacher and a super admin', async () => {
    for (const db of [asTeacher(), asSuper(), asStudent(), asAnon()]) {
      await assertFails(setDoc(doc(db, 'focus_sessions/new'), session()));
      await assertFails(updateDoc(doc(db, SESSION), { endsAt: 99 }));
      await assertFails(deleteDoc(doc(db, SESSION)));
      await assertFails(
        setDoc(doc(db, `${SESSION}/students/other`), { status: 'on-task' })
      );
      await assertFails(updateDoc(doc(db, STUDENT), { status: 'released' }));
      await assertFails(deleteDoc(doc(db, STUDENT)));
    }
  });

  it('refuses a teacher stamping themselves or a sub as monitor', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), SESSION), {
        subMonitorUids: [SUB_UID],
        subMonitorUntil: Date.now() + 60_000,
      })
    );
  });
});

describe('admin_settings/focus_sessions', () => {
  it('lets staff read it and denies students and anonymous users', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), SETTINGS)));
    await assertSucceeds(getDoc(doc(asAdmin(), SETTINGS)));
    for (const db of [asStudent(), asAnon(), asUnauth()])
      await assertFails(getDoc(doc(db, SETTINGS)));
  });

  it('lets only a super admin change the hours or the live-site switch', async () => {
    const hours = {
      window: {
        start: '08:00',
        end: '15:00',
        days: [1, 2, 3, 4, 5],
        timeZone: 'America/Chicago',
      },
    };
    for (const db of [asTeacher(), asAdmin(), asStudent(), asAnon()]) {
      await assertFails(setDoc(doc(db, SETTINGS), hours, { merge: true }));
      await assertFails(
        setDoc(doc(db, SETTINGS), { showLiveSite: true }, { merge: true })
      );
    }
    await assertSucceeds(
      setDoc(doc(asSuper(), SETTINGS), hours, { merge: true })
    );
    await assertSucceeds(
      setDoc(doc(asSuper(), SETTINGS), { showLiveSite: true }, { merge: true })
    );
    await assertFails(deleteDoc(doc(asAdmin(), SETTINGS)));
  });
});
