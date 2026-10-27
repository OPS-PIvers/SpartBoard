// Firestore security-rules tests for public-poll voting
// (poll_sessions/{sessionId}/votes/{questionIndex}_{participantUid}).
//
// Contract under test:
//   - Session doc: any authed user reads; only a non-anonymous teacher whose
//     uid prefixes the sessionId (or an admin) creates/updates; no client delete.
//   - votes/{voteId}: an authed (incl. anonymous) user may create/update ONLY
//     the doc whose id == `{questionIndex}_{their own uid}`, with exactly
//     {questionIndex, optionIndex, votedAt}, questionIndex an int in
//     [0, optionCounts.size()), optionIndex an int in
//     [0, optionCounts[questionIndex]), and only while the session is active.
//     Reads are open to any authed user (anonymous tallies, no PII).
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
import {
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  doc,
  collection,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-poll-votes-protection-test';
const TEACHER_UID = 'teacher-poll';
const ACTIVE_POLL_ID = 'poll-active';
const CLOSED_POLL_ID = 'poll-closed';
const ACTIVE_SESSION_ID = `${TEACHER_UID}_${ACTIVE_POLL_ID}`;
const CLOSED_SESSION_ID = `${TEACHER_UID}_${CLOSED_POLL_ID}`;
const LOCKED_SESSION_ID = `${TEACHER_UID}_poll-locked`;
const TEXT_SESSION_ID = `${TEACHER_UID}_poll-text`;
const VOTER_UID = 'voter-anon';
const OTHER_UID = 'voter-other';

// Question 0 has three options, question 1 has two — so a per-question range
// check is distinguishable from a single global optionCount.
const OPTION_COUNTS = [3, 2];

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
      code: 'ABCDE',
      optionCounts: OPTION_COUNTS,
      currentQuestionIndex: 0,
      active: true,
      startedAt: 1000,
      updatedAt: 1000,
    });
    await setDoc(doc(db, `poll_sessions/${CLOSED_SESSION_ID}`), {
      id: CLOSED_POLL_ID,
      teacherUid: TEACHER_UID,
      code: 'FGHJK',
      optionCounts: OPTION_COUNTS,
      currentQuestionIndex: 0,
      active: false,
      startedAt: 1000,
      updatedAt: 1000,
    });
    // Live, with question 0 locked and question 1 still open.
    await setDoc(doc(db, `poll_sessions/${LOCKED_SESSION_ID}`), {
      id: 'poll-locked',
      teacherUid: TEACHER_UID,
      code: 'LMNPQ',
      optionCounts: OPTION_COUNTS,
      currentQuestionIndex: 0,
      active: true,
      startedAt: 1000,
      updatedAt: 1000,
      hideResults: true,
      revealedQuestions: [],
      lockedQuestions: [0],
    });
    await setDoc(
      doc(db, `poll_sessions/${LOCKED_SESSION_ID}/votes/0_${OTHER_UID}`),
      { questionIndex: 0, optionIndex: 0, votedAt: 1000 }
    );
    // Q0 choice, Q1 word cloud, Q2 open response (locked).
    await setDoc(doc(db, `poll_sessions/${TEXT_SESSION_ID}`), {
      id: 'poll-text',
      teacherUid: TEACHER_UID,
      code: 'RSTVW',
      optionCounts: [2, 0, 0],
      textQuestions: [1, 2],
      currentQuestionIndex: 1,
      active: true,
      startedAt: 1000,
      updatedAt: 1000,
      lockedQuestions: [2],
    });
    await setDoc(
      doc(db, `poll_sessions/${TEXT_SESSION_ID}/answers/1_${OTHER_UID}`),
      { questionIndex: 1, text: 'gravity', votedAt: 1000 }
    );
    await setDoc(
      doc(db, `poll_sessions/${CLOSED_SESSION_ID}`),
      {
        textQuestions: [1],
      },
      { merge: true }
    );
    // A pre-existing vote so read/delete tests have a target.
    await setDoc(
      doc(db, `poll_sessions/${ACTIVE_SESSION_ID}/votes/0_${OTHER_UID}`),
      { questionIndex: 0, optionIndex: 0, votedAt: 1000 }
    );
  });
});

const voteRef = (
  db: ReturnType<typeof asAnonVoter>,
  voteId: string,
  session = ACTIVE_SESSION_ID
) => doc(db, `poll_sessions/${session}/votes/${voteId}`);

describe('poll votes — create/update', () => {
  it('control: anon voter writes their own vote with valid payload', async () => {
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`), {
        questionIndex: 0,
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('accepts a vote on a later question', async () => {
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), `1_${VOTER_UID}`), {
        questionIndex: 1,
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects writing another participant’s vote doc', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `0_${OTHER_UID}`), {
        questionIndex: 0,
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects a doc id whose question prefix disagrees with the payload', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `1_${VOTER_UID}`), {
        questionIndex: 0,
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects a bare-uid doc id (the pre-multi-question key)', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), VOTER_UID), {
        questionIndex: 0,
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects an out-of-range questionIndex', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `2_${VOTER_UID}`), {
        questionIndex: 2,
        optionIndex: 0,
        votedAt: 2000,
      })
    );
  });

  it('rejects a negative questionIndex', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `-1_${VOTER_UID}`), {
        questionIndex: -1,
        optionIndex: 0,
        votedAt: 2000,
      })
    );
  });

  it('rejects an out-of-range optionIndex', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`), {
        questionIndex: 0,
        optionIndex: 3,
        votedAt: 2000,
      })
    );
  });

  it('range-checks optionIndex against THIS question’s option count', async () => {
    // optionIndex 2 is valid for question 0 (3 options) but not question 1 (2).
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`), {
        questionIndex: 0,
        optionIndex: 2,
        votedAt: 2000,
      })
    );
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `1_${VOTER_UID}`), {
        questionIndex: 1,
        optionIndex: 2,
        votedAt: 2000,
      })
    );
  });

  it('rejects a negative optionIndex', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`), {
        questionIndex: 0,
        optionIndex: -1,
        votedAt: 2000,
      })
    );
  });

  it('rejects a vote against a non-existent session', async () => {
    await assertFails(
      setDoc(
        voteRef(
          asAnonVoter(),
          `0_${VOTER_UID}`,
          `${TEACHER_UID}_does-not-exist`
        ),
        { questionIndex: 0, optionIndex: 0, votedAt: 2000 }
      )
    );
  });

  it('rejects a payload missing questionIndex', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`), {
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects extra fields beyond the three declared keys', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`), {
        questionIndex: 0,
        optionIndex: 1,
        votedAt: 2000,
        teacherUid: TEACHER_UID,
      })
    );
  });

  it('rejects a vote when the session is not active', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`, CLOSED_SESSION_ID), {
        questionIndex: 0,
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('allows a voter to overwrite their own vote on the same question', async () => {
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`), {
        questionIndex: 0,
        optionIndex: 0,
        votedAt: 2000,
      })
    );
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`), {
        questionIndex: 0,
        optionIndex: 2,
        votedAt: 3000,
      })
    );
  });
});

describe('poll votes — locked questions', () => {
  it('rejects a new vote on a locked question', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`, LOCKED_SESSION_ID), {
        questionIndex: 0,
        optionIndex: 1,
        votedAt: 2000,
      })
    );
  });

  it('rejects changing an existing vote on a locked question', async () => {
    await assertFails(
      setDoc(
        voteRef(asAnonVoter(OTHER_UID), `0_${OTHER_UID}`, LOCKED_SESSION_ID),
        {
          questionIndex: 0,
          optionIndex: 2,
          votedAt: 2000,
        }
      )
    );
  });

  it('accepts a vote on a question that is not locked', async () => {
    await assertSucceeds(
      setDoc(voteRef(asAnonVoter(), `1_${VOTER_UID}`, LOCKED_SESSION_ID), {
        questionIndex: 1,
        optionIndex: 0,
        votedAt: 2000,
      })
    );
  });

  it('still lets any authed user read votes on a locked question', async () => {
    await assertSucceeds(
      getDoc(voteRef(asAnonVoter(), `0_${OTHER_UID}`, LOCKED_SESSION_ID))
    );
  });

  it('the teacher can lock and unlock a question on their session', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), `poll_sessions/${LOCKED_SESSION_ID}`),
        { lockedQuestions: [], revealedQuestions: [0], updatedAt: 3000 },
        { merge: true }
      )
    );
  });

  it('a participant cannot unlock a question', async () => {
    await assertFails(
      setDoc(
        doc(asAnonVoter(), `poll_sessions/${LOCKED_SESSION_ID}`),
        { lockedQuestions: [] },
        { merge: true }
      )
    );
  });
});

describe('poll votes — read', () => {
  it('any authed user can read a vote doc (live tally)', async () => {
    await assertSucceeds(getDoc(voteRef(asAnonVoter(), `0_${OTHER_UID}`)));
  });

  it('an unauthenticated caller cannot read a vote doc', async () => {
    await assertFails(getDoc(voteRef(asUnauthed(), `0_${OTHER_UID}`)));
  });
});

describe('poll votes — delete (reset)', () => {
  it('teacher can delete a vote', async () => {
    await assertSucceeds(deleteDoc(voteRef(asTeacher(), `0_${OTHER_UID}`)));
  });

  it('a participant cannot delete another participant’s vote', async () => {
    await assertFails(deleteDoc(voteRef(asAnonVoter(), `0_${OTHER_UID}`)));
  });

  it('a voter cannot delete their own vote', async () => {
    // Delete is teacher/admin-only — participants never delete, even their own.
    await assertFails(deleteDoc(voteRef(asAnonVoter(), `0_${VOTER_UID}`)));
  });
});

describe('poll votes — unauthenticated write', () => {
  it('an unauthenticated caller cannot cast a vote', async () => {
    await assertFails(
      setDoc(voteRef(asUnauthed(), `0_${VOTER_UID}`), {
        questionIndex: 0,
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
        code: 'MNPQR',
        optionCounts: [2],
        currentQuestionIndex: 0,
        active: true,
        startedAt: 4000,
        updatedAt: 4000,
      })
    );
  });

  it('an anonymous user cannot create a session doc', async () => {
    await assertFails(
      setDoc(doc(asAnonVoter(), `poll_sessions/${VOTER_UID}_x`), {
        id: 'x',
        teacherUid: VOTER_UID,
        code: 'TUVWX',
        optionCounts: [2],
        currentQuestionIndex: 0,
        active: true,
        startedAt: 4000,
        updatedAt: 4000,
      })
    );
  });

  it('a different teacher cannot create a session under another teacher’s uid', async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), `poll_sessions/${TEACHER_UID}_foreign`), {
        id: 'foreign',
        teacherUid: TEACHER_UID,
        code: 'YACDE',
        optionCounts: [2],
        currentQuestionIndex: 0,
        active: true,
        startedAt: 4000,
        updatedAt: 4000,
      })
    );
  });

  it('a different teacher cannot update another teacher’s existing session', async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), `poll_sessions/${ACTIVE_SESSION_ID}`), {
        id: ACTIVE_POLL_ID,
        teacherUid: TEACHER_UID,
        code: 'ABCDE',
        optionCounts: OPTION_COUNTS,
        currentQuestionIndex: 0,
        active: false,
        startedAt: 1000,
        updatedAt: 5000,
      })
    );
  });
});

describe('poll answers — word cloud and open response', () => {
  const answerRef = (
    db: ReturnType<typeof asAnonVoter>,
    id: string,
    session = TEXT_SESSION_ID
  ) => doc(db, `poll_sessions/${session}/answers/${id}`);
  const answer = (questionIndex: number, text: string) => ({
    questionIndex,
    text,
    votedAt: Date.now(),
    answeredAt: serverTimestamp(),
  });
  // An older phone writes no answeredAt.
  const legacyAnswer = (questionIndex: number, text: string) => ({
    questionIndex,
    text,
    votedAt: Date.now() - 1000,
  });

  it('accepts a text answer on a text question, and a changed one', async () => {
    const ref = answerRef(asAnonVoter(), `1_${VOTER_UID}`);
    await assertSucceeds(setDoc(ref, answer(1, 'friction')));
    await assertSucceeds(setDoc(ref, answer(1, 'air resistance')));
  });

  it('refuses text on a multiple choice question, in answers or votes', async () => {
    await assertFails(
      setDoc(answerRef(asAnonVoter(), `0_${VOTER_UID}`), answer(0, 'x'))
    );
    await assertFails(
      setDoc(
        voteRef(asAnonVoter(), `1_${VOTER_UID}`, TEXT_SESSION_ID),
        answer(1, 'friction')
      )
    );
  });

  it('refuses an option vote on a text question', async () => {
    await assertFails(
      setDoc(voteRef(asAnonVoter(), `1_${VOTER_UID}`, TEXT_SESSION_ID), {
        questionIndex: 1,
        optionIndex: 0,
        votedAt: 2000,
      })
    );
  });

  it('refuses empty, over-long, mixed, extra-key or future-dated answers', async () => {
    const ref = answerRef(asAnonVoter(), `1_${VOTER_UID}`);
    await assertFails(setDoc(ref, answer(1, '')));
    await assertFails(setDoc(ref, answer(1, 'x'.repeat(281))));
    await assertFails(setDoc(ref, { ...answer(1, 'a'), optionIndex: 0 }));
    await assertFails(setDoc(ref, { ...answer(1, 'a'), name: 'Sam' }));
    await assertFails(setDoc(ref, { questionIndex: 1, text: 5, votedAt: 1 }));
    await assertFails(
      setDoc(ref, { ...answer(1, 'a'), votedAt: Date.now() + 2 * 86_400_000 })
    );
  });

  it('accepts an answer from a device whose clock runs fast', async () => {
    const ref = answerRef(asAnonVoter(), `1_${VOTER_UID}`);
    await assertSucceeds(
      setDoc(ref, { ...answer(1, 'a'), votedAt: Date.now() + 3_600_000 })
    );
  });

  it('refuses an answeredAt other than the server time', async () => {
    const ref = answerRef(asAnonVoter(), `1_${VOTER_UID}`);
    await assertFails(
      setDoc(ref, { ...answer(1, 'a'), answeredAt: Date.now() + 3_600_000 })
    );
    await assertFails(
      setDoc(ref, { ...answer(1, 'a'), answeredAt: new Date(4e12) })
    );
    await assertSucceeds(setDoc(ref, answer(1, 'a')));
    // A merge can't carry the first write's time forward either.
    await assertFails(setDoc(ref, { text: 'b' }, { merge: true }));
  });

  it('accepts an older phone without answeredAt, but never future-dated', async () => {
    const ref = answerRef(asAnonVoter(), `1_${VOTER_UID}`);
    await assertSucceeds(setDoc(ref, legacyAnswer(1, 'a')));
    await assertFails(
      setDoc(ref, { ...legacyAnswer(1, 'a'), votedAt: Date.now() + 3_600_000 })
    );
  });

  it("refuses writing someone else's answer", async () => {
    await assertFails(
      setDoc(answerRef(asAnonVoter(), `1_${OTHER_UID}`), answer(1, 'x'))
    );
  });

  it('refuses a locked text question and a closed session', async () => {
    await assertFails(
      setDoc(answerRef(asAnonVoter(), `2_${VOTER_UID}`), answer(2, 'because'))
    );
    await assertFails(
      setDoc(
        answerRef(asAnonVoter(), `1_${VOTER_UID}`, CLOSED_SESSION_ID),
        answer(1, 'friction')
      )
    );
  });

  it('lets the session owner and the author read an answer, nobody else', async () => {
    await assertSucceeds(getDoc(answerRef(asTeacher(), `1_${OTHER_UID}`)));
    await assertSucceeds(
      getDoc(answerRef(asAnonVoter(OTHER_UID), `1_${OTHER_UID}`))
    );
    await assertSucceeds(getDoc(answerRef(asAnonVoter(), `1_${VOTER_UID}`)));
    await assertFails(getDoc(answerRef(asAnonVoter(), `1_${OTHER_UID}`)));
    await assertFails(getDoc(answerRef(asOtherTeacher(), `1_${OTHER_UID}`)));
    await assertFails(
      getDoc(
        doc(
          asUnauthed(),
          `poll_sessions/${TEXT_SESSION_ID}/answers/1_${OTHER_UID}`
        )
      )
    );
  });

  it('lets only the owner list every answer', async () => {
    await assertSucceeds(
      getDocs(
        collection(asTeacher(), `poll_sessions/${TEXT_SESSION_ID}/answers`)
      )
    );
    await assertFails(
      getDocs(
        collection(asAnonVoter(), `poll_sessions/${TEXT_SESSION_ID}/answers`)
      )
    );
  });

  it('lets only the teacher delete answers', async () => {
    await assertFails(deleteDoc(answerRef(asAnonVoter(), `1_${OTHER_UID}`)));
    await assertSucceeds(deleteDoc(answerRef(asTeacher(), `1_${OTHER_UID}`)));
  });
});

describe('poll hidden word cloud words', () => {
  const hiddenRef = (
    db: ReturnType<typeof asTeacher>,
    session = TEXT_SESSION_ID
  ) => doc(db, `poll_sessions/${session}/hidden_words/q1`);

  it('lets the session owner hide words, read them and bring them back', async () => {
    await assertSucceeds(setDoc(hiddenRef(asTeacher()), { words: ['sam'] }));
    await assertSucceeds(getDoc(hiddenRef(asTeacher())));
    await assertSucceeds(
      getDocs(
        collection(asTeacher(), `poll_sessions/${TEXT_SESSION_ID}/hidden_words`)
      )
    );
    await assertSucceeds(deleteDoc(hiddenRef(asTeacher())));
  });

  it('keeps hidden words from co-teachers, students and signed-out users', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(hiddenRef(ctx.firestore()), { words: ['sam'] });
    });
    for (const db of [asOtherTeacher(), asAnonVoter(), asUnauthed()]) {
      await assertFails(getDoc(hiddenRef(db)));
      await assertFails(
        getDocs(collection(db, `poll_sessions/${TEXT_SESSION_ID}/hidden_words`))
      );
      await assertFails(setDoc(hiddenRef(db), { words: [] }));
      await assertFails(deleteDoc(hiddenRef(db)));
    }
  });

  it('refuses extra keys, a non-list and an oversized list', async () => {
    const ref = hiddenRef(asTeacher());
    await assertFails(setDoc(ref, { words: ['a'], text: 'x' }));
    await assertFails(setDoc(ref, { words: 'sam' }));
    await assertFails(
      setDoc(ref, { words: Array.from({ length: 501 }, (_, i) => `w${i}`) })
    );
  });

  it('refuses an anonymous user under a session id that starts with their uid', async () => {
    await assertFails(
      setDoc(hiddenRef(asAnonVoter(), `${VOTER_UID}_fake`), { words: ['a'] })
    );
  });
});

describe('poll session discovery', () => {
  const sessions = (db: ReturnType<typeof asTeacher>) =>
    collection(db, 'poll_sessions');

  it('denies an unfiltered list to anonymous users and other teachers', async () => {
    await assertFails(getDocs(sessions(asAnonVoter())));
    await assertFails(getDocs(sessions(asOtherTeacher())));
  });

  it('lets the owner list only their own sessions', async () => {
    await assertSucceeds(
      getDocs(
        query(sessions(asTeacher()), where('teacherUid', '==', TEACHER_UID))
      )
    );
    await assertFails(getDocs(sessions(asTeacher())));
  });

  it('resolves a session by code pointer but never lists pointers', async () => {
    const pointer = {
      sessionId: `${TEACHER_UID}_ABCDE`,
      teacherUid: TEACHER_UID,
      updatedAt: 1,
    };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'poll_codes/ABCDE'), pointer);
    });
    await assertSucceeds(getDoc(doc(asAnonVoter(), 'poll_codes/ABCDE')));
    await assertSucceeds(getDoc(doc(asTeacher(), 'poll_codes/ABCDE')));
    await assertSucceeds(
      getDoc(doc(asAnonVoter(), `poll_sessions/${ACTIVE_SESSION_ID}`))
    );
    await assertFails(getDocs(collection(asAnonVoter(), 'poll_codes')));
    await assertFails(getDocs(collection(asTeacher(), 'poll_codes')));
  });

  it('leaves every pointer write to the server', async () => {
    const pointer = {
      sessionId: `${TEACHER_UID}_ABCDE`,
      teacherUid: TEACHER_UID,
      updatedAt: 1,
    };
    for (const db of [asAnonVoter(), asTeacher(), asOtherTeacher()]) {
      await assertFails(setDoc(doc(db, 'poll_codes/ABCDE'), pointer));
      await assertFails(deleteDoc(doc(db, 'poll_codes/ABCDE')));
    }
    await assertFails(
      setDoc(doc(asOtherTeacher(), `poll_sessions/teacher-other_ZZZZZ`), {
        teacherUid: TEACHER_UID,
        code: 'ZZZZZ',
      })
    );
  });
});
