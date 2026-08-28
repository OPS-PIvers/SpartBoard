// Firestore security-rules tests for `sessions/{userId}/students/{studentId}`
// (the live-session join roster written by hooks/useLiveSession.ts).
//
// Contract under test:
//   - create: only the joining student (auth.uid == studentId), payload must
//     be EXACTLY {pin, status, joinedAt, lastActive} — pin a non-empty string
//     capped at 10 chars (MAX_PIN_LENGTH in useLiveSession.ts), status one of
//     the three LiveStudent enum values, joinedAt/lastActive ints.
//   - update: only the teacher/admin/owning-student, and only ever the
//     `status` field — the real client (toggleFreezeStudent, leaveSession,
//     endSession's disconnect sweep) never touches any other field.
//
// Regression coverage: before this rule tightened, `create` had no schema
// check at all, so any authenticated user who learned a live sessionId
// (broad `sessions` read/list is a tracked, deliberately-unfixed MEDIUM —
// see docs/scheduled-tasks/firestore-rules.md) could spray unbounded
// arbitrary-shape docs into a teacher's roster; `update` was equally
// unconstrained for the same three actors.
//
// Requires a running Firestore emulator. Invoke via: pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-live-session-students-test';
const TEACHER_UID = 'teacher-live';
const STUDENT_UID = 'student-anon';
const ATTACKER_UID = 'attacker-anon';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

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
    await setDoc(doc(db, `sessions/${TEACHER_UID}`), {
      id: TEACHER_UID,
      isActive: true,
      activeWidgetId: null,
      activeWidgetType: null,
      code: 'ABC123',
      frozen: false,
      createdAt: 1000,
    });
  });
});

const studentRef = (
  db: ReturnType<typeof asStudent>,
  studentId: string,
  teacherId = TEACHER_UID
) => doc(db, `sessions/${teacherId}/students/${studentId}`);

describe('live session students — create', () => {
  it('control: a student joins with the real client shape', async () => {
    await assertSucceeds(
      setDoc(studentRef(asStudent(STUDENT_UID), STUDENT_UID), {
        pin: '4821',
        status: 'active',
        joinedAt: 2000,
        lastActive: 2000,
      })
    );
  });

  it('rejects a stray extra field beyond the client shape', async () => {
    await assertFails(
      setDoc(studentRef(asStudent(ATTACKER_UID), ATTACKER_UID), {
        pin: '1234',
        status: 'active',
        joinedAt: 2000,
        lastActive: 2000,
        payload: 'x'.repeat(100000),
      })
    );
  });

  it('rejects an oversized pin', async () => {
    await assertFails(
      setDoc(studentRef(asStudent(ATTACKER_UID), ATTACKER_UID), {
        pin: 'x'.repeat(500),
        status: 'active',
        joinedAt: 2000,
        lastActive: 2000,
      })
    );
  });

  it('rejects an empty pin', async () => {
    await assertFails(
      setDoc(studentRef(asStudent(ATTACKER_UID), ATTACKER_UID), {
        pin: '',
        status: 'active',
        joinedAt: 2000,
        lastActive: 2000,
      })
    );
  });

  it('rejects a non-string pin', async () => {
    await assertFails(
      setDoc(studentRef(asStudent(ATTACKER_UID), ATTACKER_UID), {
        pin: 4821,
        status: 'active',
        joinedAt: 2000,
        lastActive: 2000,
      })
    );
  });

  it('rejects an invalid status enum value', async () => {
    await assertFails(
      setDoc(studentRef(asStudent(ATTACKER_UID), ATTACKER_UID), {
        pin: '1234',
        status: 'hacked',
        joinedAt: 2000,
        lastActive: 2000,
      })
    );
  });

  it('rejects a non-int joinedAt', async () => {
    await assertFails(
      setDoc(studentRef(asStudent(ATTACKER_UID), ATTACKER_UID), {
        pin: '1234',
        status: 'active',
        joinedAt: 'now',
        lastActive: 2000,
      })
    );
  });

  it('rejects a non-int lastActive', async () => {
    await assertFails(
      setDoc(studentRef(asStudent(ATTACKER_UID), ATTACKER_UID), {
        pin: '1234',
        status: 'active',
        joinedAt: 2000,
        lastActive: 'now',
      })
    );
  });

  it('rejects a missing field (joinedAt)', async () => {
    await assertFails(
      setDoc(studentRef(asStudent(ATTACKER_UID), ATTACKER_UID), {
        pin: '1234',
        status: 'active',
        lastActive: 2000,
      })
    );
  });

  it('rejects create on behalf of another student (uid mismatch)', async () => {
    await assertFails(
      setDoc(studentRef(asStudent(ATTACKER_UID), STUDENT_UID), {
        pin: '1234',
        status: 'active',
        joinedAt: 2000,
        lastActive: 2000,
      })
    );
  });
});

describe('live session students — update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `sessions/${TEACHER_UID}/students/${STUDENT_UID}`), {
        pin: '4821',
        status: 'active',
        joinedAt: 2000,
        lastActive: 2000,
      });
    });
  });

  it('control: the owning student flips their own status (leaveSession)', async () => {
    await assertSucceeds(
      updateDoc(studentRef(asStudent(STUDENT_UID), STUDENT_UID), {
        status: 'disconnected',
      })
    );
  });

  it('control: the teacher flips a student status (toggleFreezeStudent)', async () => {
    await assertSucceeds(
      updateDoc(studentRef(asTeacher(), STUDENT_UID), {
        status: 'frozen',
      })
    );
  });

  it('rejects a status update to an invalid enum value', async () => {
    await assertFails(
      updateDoc(studentRef(asTeacher(), STUDENT_UID), {
        status: 'hacked',
      })
    );
  });

  it('rejects the owning student rewriting their own pin via update', async () => {
    await assertFails(
      updateDoc(studentRef(asStudent(STUDENT_UID), STUDENT_UID), {
        pin: '9999',
      })
    );
  });

  it('rejects the owning student smuggling an extra field alongside a valid status change', async () => {
    await assertFails(
      updateDoc(studentRef(asStudent(STUDENT_UID), STUDENT_UID), {
        status: 'disconnected',
        payload: 'x'.repeat(100000),
      })
    );
  });

  it('rejects a stranger (not teacher/admin/owning student) updating status', async () => {
    await assertFails(
      updateDoc(studentRef(asStudent(ATTACKER_UID), STUDENT_UID), {
        status: 'disconnected',
      })
    );
  });
});
