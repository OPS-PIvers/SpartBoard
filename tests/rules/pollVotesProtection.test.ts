// Firestore security-rules tests for public-poll voting
// (poll_sessions/{sessionId}/votes/{participantUid}).
//
// Contract under test:
//   - Session doc: any authed user reads; only a non-anonymous teacher whose
//     uid prefixes the sessionId (or an admin) creates/updates; no client delete.
//   - votes/{participantUid}: an authed (incl. anonymous) user may create/update
//     ONLY the doc whose id == their own uid, with exactly {optionIndex, votedAt},
//     optionIndex an int in [0, optionCount), and only while the session is
//     active. Reads are open to any authed user (anonymous tallies, no PII).
//     Delete (reset) is teacher/admin-only.
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
import { setDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-poll-votes-protection-test';
const TEACHER_UID = 'teacher-poll';
const ACTIVE_POLL_ID = 'poll-active';
const CLOSED_POLL_ID = 'poll-closed';
const ACTIVE_SESSION_ID = `${TEACHER_UID}_${ACTIVE_POLL_ID}`;
const CLOSED_SESSION_ID = `${TEACHER_UID}_${CLOSED_POLL_ID}`;
const VOTER_UID = 'voter-anon';
const OTHER_UID = 'voter-other';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnonVoter = (uid = VOTER_UID) =>
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

// A different non-anonymous teacher whose uid does NOT prefix the session id.
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
    await setDoc(doc(db, `poll_sessions/${ACTIVE_SESSION_ID}`), {
      id: ACTIVE_POLL_ID,
      teacherUid: TEACHER_UID,
      optionCount: 3,
      active: true,
      updatedAt: 1000,
    });
    await setDoc(doc(db, `poll_sessions/${CLOSED_SESSION_ID}`), {
      id: CLOSED_POLL_ID,
      teacherUid: TEACHER_UID,
      optionCount: 3,
      active: false,
      updatedAt: 1000,
    });
    // A pre-existing vote so read/delete tests have a target.
    await setDoc(
      doc(db, `poll_sessions/${ACTIVE_SESSION_ID}/votes/${OTHER_UID}`),
      { optionIndex: 0, votedAt: 1000 }
    );
  });
});

const voteRef = (
  db: ReturnType<typeof asAnonVoter>,
  uid: string,
  session = ACTIVE_SESSION_ID
) => doc(db, `poll_sessions/${session}/votes/${uid}`);

describe('poll votes — create/update', () => {
  it('control: anon voter writes their own vote with valid payload', async () => {
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects writing another participant’s vote doc', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), OTHER_UID), {
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects an out-of-range optionIndex', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 3,
        votedAt: 2000,
      })
    );
  });

  it('rejects extra fields beyond optionIndex/votedAt', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 1,
        votedAt: 2000,
        teacherUid: TEACHER_UID,
      })
    );
  });

  it('rejects a vote when the session is not active', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), VOTER_UID, CLOSED_SESSION_ID), {
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('allows a voter to overwrite their own vote', async () => {
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 0,
        votedAt: 2000,
      })
    );
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        optionIndex: 2,
        votedAt: 3000,
      })
    );
  });
});

describe('poll votes — read', () => {
  it('any authed user can read a vote doc (live tally)', async () => {
    await assertSucceeds(getDoc(voteRef(asAnonVoter(), OTHER_UID)));
  });

  it('an unauthenticated caller cannot read a vote doc', async () => {
    await assertFails(getDoc(voteRef(asUnauthed(), OTHER_UID)));
  });
});

describe('poll votes — delete (reset)', () => {
  it('teacher can delete a vote', async () => {
    await assertSucceeds(deleteDoc(voteRef(asTeacher(), OTHER_UID)));
  });

  it('a participant cannot delete another participant’s vote', async () => {
    await assertFails(deleteDoc(voteRef(asAnonVoter(), OTHER_UID)));
  });

  it('a voter cannot delete their own vote', async () => {
    // Delete is teacher/admin-only — participants never delete, even their own.
    await assertFails(deleteDoc(voteRef(asAnonVoter(), VOTER_UID)));
  });
});

describe('poll votes — unauthenticated write', () => {
  it('an unauthenticated caller cannot cast a vote', async () => {
    await assertFails(
      setDoc(voteRef(asUnauthed(), VOTER_UID), {
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });
});

describe('poll session doc', () => {
  it('a non-anonymous teacher can create their own session doc', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), `poll_sessions/${TEACHER_UID}_new-poll`), {
        id: 'new-poll',
        teacherUid: TEACHER_UID,
        optionCount: 2,
        active: true,
        updatedAt: 4000,
      })
    );
  });

  it('an anonymous user cannot create a session doc', async () => {
    await assertFails(
      setDoc(doc(asAnonVoter(), `poll_sessions/${VOTER_UID}_x`), {
        id: 'x',
        teacherUid: VOTER_UID,
        optionCount: 2,
        active: true,
        updatedAt: 4000,
      })
    );
  });

  it('a different teacher cannot create a session under another teacher’s uid', async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), `poll_sessions/${TEACHER_UID}_foreign`), {
        id: 'foreign',
        teacherUid: TEACHER_UID,
        optionCount: 2,
        active: true,
        updatedAt: 4000,
      })
    );
  });

  it('a different teacher cannot update another teacher’s existing session', async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), `poll_sessions/${ACTIVE_SESSION_ID}`), {
        id: ACTIVE_POLL_ID,
        teacherUid: TEACHER_UID,
        optionCount: 3,
        active: false,
        updatedAt: 5000,
      })
    );
  });
});
