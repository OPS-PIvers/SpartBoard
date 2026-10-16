// Firestore security-rules tests for the Next Up widget's student-submitted
// queue-join requests (nextup_sessions/{sessionId}/entries/{entryId}).
//
// Contract under test:
//   - entries/{entryId}: any authed (incl. anonymous) user may create ONLY
//     while the parent session exists and is active, with exactly
//     {name, joinedAt}: name a non-empty string capped at 100 chars,
//     joinedAt an int. Read/delete stay teacher(path-prefix)/admin-only.
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
import {
  setDoc,
  doc,
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-nextup-entries-test';
const TEACHER_UID = 'teacher-nextup';
const WIDGET_ID = 'widget-1';
const ACTIVE_SESSION_ID = `${TEACHER_UID}_${WIDGET_ID}`;
const INACTIVE_SESSION_ID = `${TEACHER_UID}_inactive`;
const STUDENT_UID = 'student-anon';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnonStudent = (uid = STUDENT_UID) =>
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

const asOtherTeacher = () =>
  testEnv
    .authenticatedContext('teacher-other', {
      email: 'other@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asUnauthed = () => testEnv.unauthenticatedContext().firestore();

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
    await setDoc(doc(db, `nextup_sessions/${ACTIVE_SESSION_ID}`), {
      isActive: true,
      createdAt: 1000,
    });
    await setDoc(doc(db, `nextup_sessions/${INACTIVE_SESSION_ID}`), {
      isActive: false,
      createdAt: 1000,
    });
  });
});

const entriesRef = (
  db: ReturnType<typeof asAnonStudent>,
  sessionId = ACTIVE_SESSION_ID
) => collection(db, `nextup_sessions/${sessionId}/entries`);

describe('nextup entries — create', () => {
  it('control: an anon student joins the queue with a valid payload', async () => {
    await assertSucceeds(
      addDoc(entriesRef(asAnonStudent()), { name: 'Alex', joinedAt: 2000 })
    );
  });

  it('rejects a missing joinedAt (would be invisible to the teacher listener query)', async () => {
    await assertFails(addDoc(entriesRef(asAnonStudent()), { name: 'Alex' }));
  });

  it('rejects a non-int joinedAt', async () => {
    await assertFails(
      addDoc(entriesRef(asAnonStudent()), {
        name: 'Alex',
        joinedAt: 'not-a-number',
      })
    );
  });

  it('rejects a non-string name', async () => {
    await assertFails(
      addDoc(entriesRef(asAnonStudent()), { name: 123, joinedAt: 2000 })
    );
  });

  it('rejects an empty name', async () => {
    await assertFails(
      addDoc(entriesRef(asAnonStudent()), { name: '', joinedAt: 2000 })
    );
  });

  it('rejects a name over 100 characters (Drive-export size cap)', async () => {
    await assertFails(
      addDoc(entriesRef(asAnonStudent()), {
        name: 'x'.repeat(101),
        joinedAt: 2000,
      })
    );
  });

  it('allows a name at exactly the 100-character cap', async () => {
    await assertSucceeds(
      addDoc(entriesRef(asAnonStudent()), {
        name: 'x'.repeat(100),
        joinedAt: 2000,
      })
    );
  });

  it('rejects extra fields beyond name/joinedAt', async () => {
    await assertFails(
      addDoc(entriesRef(asAnonStudent()), {
        name: 'Alex',
        joinedAt: 2000,
        teacherUid: TEACHER_UID,
      })
    );
  });

  it('rejects a join against an inactive session', async () => {
    await assertFails(
      addDoc(entriesRef(asAnonStudent(), INACTIVE_SESSION_ID), {
        name: 'Alex',
        joinedAt: 2000,
      })
    );
  });

  it('rejects a join against a non-existent session', async () => {
    await assertFails(
      addDoc(entriesRef(asAnonStudent(), `${TEACHER_UID}_does-not-exist`), {
        name: 'Alex',
        joinedAt: 2000,
      })
    );
  });

  it('an unauthenticated caller cannot join the queue', async () => {
    await assertFails(
      addDoc(entriesRef(asUnauthed()), { name: 'Alex', joinedAt: 2000 })
    );
  });

  it('a non-anonymous teacher can still submit a valid entry (create has no role gate)', async () => {
    await assertSucceeds(
      addDoc(entriesRef(asTeacher()), { name: 'Sam', joinedAt: 2000 })
    );
  });
});

// Start, End and the midnight close are teacher-only transitions on the session doc.
describe('nextup session doc — reads and teacher-only transitions', () => {
  const sessionDoc = (db: ReturnType<typeof asAnonStudent>) =>
    doc(db, `nextup_sessions/${ACTIVE_SESSION_ID}`);

  it('a signed-in student can read the session to see if it is open', async () => {
    await assertSucceeds(getDoc(sessionDoc(asAnonStudent())));
  });

  it('an unauthenticated caller cannot read the session', async () => {
    await assertFails(getDoc(sessionDoc(asUnauthed())));
  });

  it('the owning teacher can start a session', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), `nextup_sessions/${TEACHER_UID}_widget-2`), {
        isActive: true,
        createdAt: 2000,
      })
    );
  });

  it('the owning teacher can close the session (End or the midnight close)', async () => {
    await assertSucceeds(
      updateDoc(sessionDoc(asTeacher()), { isActive: false })
    );
  });

  it('a student cannot close the session', async () => {
    await assertFails(
      updateDoc(sessionDoc(asAnonStudent()), { isActive: false })
    );
  });

  it('a student cannot reopen a closed session', async () => {
    await assertFails(
      updateDoc(
        doc(asAnonStudent(), `nextup_sessions/${INACTIVE_SESSION_ID}`),
        {
          isActive: true,
        }
      )
    );
  });

  it('another teacher cannot close or reopen the session', async () => {
    await assertFails(
      updateDoc(sessionDoc(asOtherTeacher()), { isActive: false })
    );
    await assertFails(
      updateDoc(
        doc(asOtherTeacher(), `nextup_sessions/${INACTIVE_SESSION_ID}`),
        { isActive: true }
      )
    );
  });

  it('a student cannot start a session under a teacher’s id', async () => {
    await assertFails(
      setDoc(doc(asAnonStudent(), `nextup_sessions/${TEACHER_UID}_widget-3`), {
        isActive: true,
        createdAt: 2000,
      })
    );
  });

  it('once closed, students can no longer join', async () => {
    await assertSucceeds(
      updateDoc(sessionDoc(asTeacher()), { isActive: false })
    );
    await assertFails(
      addDoc(entriesRef(asAnonStudent()), { name: 'Alex', joinedAt: 3000 })
    );
  });
});

describe('nextup entries — reads and deletes', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `nextup_sessions/${ACTIVE_SESSION_ID}/entries/e1`),
        { name: 'Alex', joinedAt: 2000 }
      );
    });
  });

  const entryDoc = (db: ReturnType<typeof asAnonStudent>) =>
    doc(db, `nextup_sessions/${ACTIVE_SESSION_ID}/entries/e1`);

  it('the owning teacher can list and delete joins', async () => {
    await assertSucceeds(getDocs(entriesRef(asTeacher())));
    await assertSucceeds(deleteDoc(entryDoc(asTeacher())));
  });

  it('a student cannot read other students’ joins', async () => {
    await assertFails(getDocs(entriesRef(asAnonStudent())));
    await assertFails(getDoc(entryDoc(asAnonStudent())));
  });

  it('a student cannot delete a join', async () => {
    await assertFails(deleteDoc(entryDoc(asAnonStudent())));
  });

  it('another teacher cannot read or delete the joins', async () => {
    await assertFails(getDocs(entriesRef(asOtherTeacher())));
    await assertFails(deleteDoc(entryDoc(asOtherTeacher())));
  });
});
