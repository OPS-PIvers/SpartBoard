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
import { setDoc, doc, collection, addDoc } from 'firebase/firestore';

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
