// Firestore rules regression: the Assignments hub's Close now and Edit window
// write openAt/closeAt/dueAt onto a mini_app_sessions doc (widget state audit
// MA-1). Only the session teacher may; students still read and are gated by it.
// Run via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-mini-app-session-window';
const TEACHER_UID = 'maw-teacher';
const OTHER_TEACHER_UID = 'maw-other-teacher';
const STUDENT_UID = 'maw-student';
const CLASS_A = 'class-a';
const SESSION_PATH = 'mini_app_sessions/s1';
const SUBMISSION_PATH = `${SESSION_PATH}/submissions/${STUDENT_UID}`;
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: true,
      orgId: 'orono',
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const SESSION = {
  teacherUid: TEACHER_UID,
  appId: 'app-1',
  appTitle: 'Fractions',
  assignmentName: 'Fractions',
  status: 'active',
  mode: 'submissions',
  submissionsEnabled: true,
  classIds: [CLASS_A],
};

const seed = async (extra: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), SESSION_PATH), { ...SESSION, ...extra });
  });
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? 8080),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('mini_app_sessions window edits', () => {
  it('lets the session teacher close now with a merge write (hub Close now)', async () => {
    await seed();
    await assertSucceeds(
      setDoc(
        doc(asTeacher(TEACHER_UID), SESSION_PATH),
        { closeAt: Date.now() },
        { merge: true }
      )
    );
  });

  it('lets the session teacher set and clear openAt, closeAt and dueAt', async () => {
    await seed({ closeAt: Date.now() + 60_000 });
    const later = Date.now() + 86_400_000;
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER_UID), SESSION_PATH), {
        openAt: Date.now(),
        closeAt: later,
        dueAt: later,
      })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER_UID), SESSION_PATH), {
        openAt: null,
        closeAt: null,
        dueAt: null,
      })
    );
  });

  it('refuses another teacher editing the window', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), SESSION_PATH), {
        closeAt: Date.now(),
      })
    );
  });

  it('refuses a student editing the window', async () => {
    await seed({ closeAt: Date.now() - 600_000 });
    await assertFails(
      updateDoc(doc(asStudent(), SESSION_PATH), {
        closeAt: Date.now() + 600_000,
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(), SESSION_PATH), { openAt: null, dueAt: null })
    );
  });

  it('still refuses the teacher changing fields outside the allowlist', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(asTeacher(TEACHER_UID), SESSION_PATH), {
        closeAt: Date.now(),
        submissionsEnabled: false,
      })
    );
  });

  it('lets the session teacher change classes, and refuses another teacher', async () => {
    await seed({ rosterIds: ['r-a'] });
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), SESSION_PATH), {
        classIds: ['class-b'],
        rosterIds: ['r-b'],
      })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER_UID), SESSION_PATH), {
        classIds: [CLASS_A, 'class-b'],
        rosterIds: ['r-a', 'r-b'],
      })
    );
  });

  it('lets the session teacher record removed classes, which a class student can still read', async () => {
    await seed({ rosterIds: ['r-a', 'r-b'], classIds: [CLASS_A, 'class-b'] });
    const removedClasses = { classIds: ['class-b'], periodNames: ['Period B'] };
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), SESSION_PATH), {
        removedClasses,
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(), SESSION_PATH), { removedClasses })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER_UID), SESSION_PATH), {
        classIds: [CLASS_A],
        rosterIds: ['r-a'],
        removedClasses,
      })
    );
    const snap = await assertSucceeds(getDoc(doc(asStudent(), SESSION_PATH)));
    expect(snap.data()?.removedClasses).toEqual(removedClasses);
  });

  it('refuses a student changing classes, and a removed class can no longer submit', async () => {
    await seed({ rosterIds: ['r-a'] });
    await assertFails(
      updateDoc(doc(asStudent(), SESSION_PATH), {
        classIds: [CLASS_A, 'class-b'],
      })
    );
    const submission = {
      submittedAt: Date.now(),
      studentUid: STUDENT_UID,
      payload: { score: 1 },
    };
    await assertSucceeds(setDoc(doc(asStudent(), SUBMISSION_PATH), submission));
    await updateDoc(doc(asTeacher(TEACHER_UID), SESSION_PATH), {
      classIds: ['class-b'],
      rosterIds: ['r-b'],
    });
    await assertFails(setDoc(doc(asStudent(), SUBMISSION_PATH), submission));
  });

  it('lets a student in the class read the closed session', async () => {
    const closeAt = Date.now() - 600_000;
    await seed({ closeAt });
    const snap = await assertSucceeds(getDoc(doc(asStudent(), SESSION_PATH)));
    expect(snap.data()?.closeAt).toBe(closeAt);
  });

  it('refuses a student submission once Close now has passed', async () => {
    await seed();
    const submission = {
      submittedAt: Date.now(),
      studentUid: STUDENT_UID,
      payload: { score: 1 },
    };
    await assertSucceeds(setDoc(doc(asStudent(), SUBMISSION_PATH), submission));
    await setDoc(
      doc(asTeacher(TEACHER_UID), SESSION_PATH),
      { closeAt: Date.now() - 600_000 },
      { merge: true }
    );
    await assertFails(setDoc(doc(asStudent(), SUBMISSION_PATH), submission));
  });
});
