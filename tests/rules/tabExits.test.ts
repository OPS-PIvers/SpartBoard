// Firestore rules for the tab-away exit log (`tabExits`) on Quiz and Video
// Activity responses (docs/plans/TAB_AWAY_TIMER.md §3.2). A student may only
// append one exit or close their own open last exit; earlier entries never
// change and the log stops at 50. Reads: the student and the teacher see the
// log, another student does not.
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
  setDoc,
  updateDoc,
  getDoc,
  doc,
  increment,
  Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-tab-exits';
const TEACHER_UID = 'teacher-uid-tabexits';
const STUDENT_UID = 'student-uid-tabexits';
const OTHER_UID = 'other-uid-tabexits';
const QUIZ_SESSION = 'quiz-session-tabexits';
const VA_SESSION = 'va-session-tabexits';
const PIN_KEY = 'pin-period_1-01';

const COLLECTIONS = [
  {
    name: 'quiz',
    session: `quiz_sessions/${QUIZ_SESSION}`,
    response: `quiz_sessions/${QUIZ_SESSION}/responses/${PIN_KEY}`,
  },
  {
    name: 'video activity',
    session: `video_activity_sessions/${VA_SESSION}`,
    response: `video_activity_sessions/${VA_SESSION}/responses/${PIN_KEY}`,
  },
] as const;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const anon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asStudent = () => anon(STUDENT_UID);
const asOther = () => anon(OTHER_UID);
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const closedExit = {
  leftAt: 1_000,
  returnedAt: 5_000,
  durationMs: 4_000,
  questionIndex: 1,
  attempt: 0,
  outcome: 'returned',
};
const openExit = { leftAt: 10_000, questionIndex: 2, attempt: 0 };

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

async function seed(tabExits?: unknown[]) {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, COLLECTIONS[0].session), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'TABEXIT',
    });
    await setDoc(doc(db, COLLECTIONS[1].session), {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
    });
    const base = {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      completedAttempts: 0,
      tabSwitchWarnings: tabExits?.length ?? 0,
      ...(tabExits ? { tabExits } : {}),
    };
    await setDoc(doc(db, COLLECTIONS[0].response), {
      ...base,
      status: 'in-progress',
      submittedAt: null,
      preSyncVersion: 0,
      lastWriteAt: Timestamp.fromMillis(1000),
    });
    await setDoc(doc(db, COLLECTIONS[1].response), {
      ...base,
      completedAt: null,
    });
  });
}

describe.each(COLLECTIONS)('tabExits on $name responses', (c) => {
  beforeEach(async () => {
    await seed([closedExit]);
  });
  const mine = () => doc(asStudent(), c.response);

  it('the student reads their own exit log', async () => {
    await assertSucceeds(getDoc(mine()));
  });

  it('the teacher reads the exit log', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), c.response)));
  });

  it('another student cannot read the exit log', async () => {
    await assertFails(getDoc(doc(asOther(), c.response)));
  });

  it('appends one open exit with the warning increment', async () => {
    await assertSucceeds(
      updateDoc(mine(), {
        tabSwitchWarnings: increment(1),
        tabExits: [closedExit, openExit],
      })
    );
  });

  it('appends an exit that is already closed (auto-submitted on leave)', async () => {
    await assertSucceeds(
      updateDoc(mine(), {
        tabExits: [
          closedExit,
          { ...openExit, durationMs: 0, outcome: 'auto-submitted' },
        ],
      })
    );
  });

  it('appends the first exit to a response with no log yet', async () => {
    await seed();
    await assertSucceeds(updateDoc(mine(), { tabExits: [openExit] }));
  });

  it('rejects appending two exits at once', async () => {
    await assertFails(
      updateDoc(mine(), {
        tabExits: [closedExit, openExit, { ...openExit, leftAt: 20_000 }],
      })
    );
  });

  it('rejects rewriting an earlier exit while appending', async () => {
    await assertFails(
      updateDoc(mine(), {
        tabExits: [{ ...closedExit, durationMs: 1 }, openExit],
      })
    );
  });

  it('rejects deleting the log', async () => {
    await assertFails(updateDoc(mine(), { tabExits: [] }));
  });

  it('rejects an exit with an unknown key', async () => {
    await assertFails(
      updateDoc(mine(), { tabExits: [closedExit, { ...openExit, note: 'x' }] })
    );
  });

  it('rejects an unknown outcome', async () => {
    await assertFails(
      updateDoc(mine(), {
        tabExits: [closedExit, { ...openExit, outcome: 'forgiven' }],
      })
    );
  });

  it('rejects a non-numeric leftAt', async () => {
    await assertFails(
      updateDoc(mine(), {
        tabExits: [closedExit, { ...openExit, leftAt: 'yesterday' }],
      })
    );
  });

  it('rejects a log that is not a list', async () => {
    await assertFails(updateDoc(mine(), { tabExits: { 0: openExit } }));
  });

  describe('closing the open exit', () => {
    beforeEach(async () => {
      await seed([closedExit, openExit]);
    });
    const close = {
      returnedAt: 14_000,
      durationMs: 4_000,
      outcome: 'returned',
    };

    it('closes the last open exit', async () => {
      await assertSucceeds(
        updateDoc(mine(), { tabExits: [closedExit, { ...openExit, ...close }] })
      );
    });

    it('closes the only exit in the log', async () => {
      await seed([openExit]);
      await assertSucceeds(
        updateDoc(mine(), { tabExits: [{ ...openExit, ...close }] })
      );
    });

    it('rejects a close that leaves the outcome unset', async () => {
      await assertFails(
        updateDoc(mine(), {
          tabExits: [closedExit, { ...openExit, returnedAt: 14_000 }],
        })
      );
    });

    it('rejects a close that moves leftAt', async () => {
      await assertFails(
        updateDoc(mine(), {
          tabExits: [closedExit, { ...openExit, ...close, leftAt: 13_000 }],
        })
      );
    });

    it('rejects re-closing an exit that already has an outcome', async () => {
      await seed([closedExit]);
      await assertFails(
        updateDoc(mine(), {
          tabExits: [{ ...closedExit, outcome: 'over-limit' }],
        })
      );
    });

    it('rejects editing an earlier exit while closing the last', async () => {
      await assertFails(
        updateDoc(mine(), {
          tabExits: [
            { ...closedExit, durationMs: 1 },
            { ...openExit, ...close },
          ],
        })
      );
    });

    it('lets the teacher close an exit as session-ended', async () => {
      await assertSucceeds(
        updateDoc(doc(asTeacher(), c.response), {
          tabExits: [
            closedExit,
            { ...openExit, returnedAt: 30_000, outcome: 'session-ended' },
          ],
        })
      );
    });
  });

  it('stops the log at 50 entries', async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      ...closedExit,
      leftAt: i,
    }));
    await seed(full);
    await assertFails(
      updateDoc(mine(), { tabExits: [...full, { ...openExit, leftAt: 99 }] })
    );
    await assertSucceeds(updateDoc(mine(), { tabSwitchWarnings: 51 }));
  });

  it('another student cannot append to the log', async () => {
    await assertFails(
      updateDoc(doc(asOther(), c.response), {
        tabExits: [closedExit, openExit],
      })
    );
  });
});

describe('tabExits on create', () => {
  it('a quiz join cannot seed an exit log', async () => {
    await seed();
    const key = 'pin-period_1-02';
    const base = {
      studentUid: OTHER_UID,
      pin: '02',
      classPeriod: 'period_1',
      joinedAt: 1000,
      status: 'joined',
      answers: [],
      score: null,
      submittedAt: null,
      completedAttempts: 0,
      preSyncVersion: 0,
    };
    const ref = doc(
      asOther(),
      `quiz_sessions/${QUIZ_SESSION}/responses/${key}`
    );
    await assertFails(setDoc(ref, { ...base, tabExits: [closedExit] }));
    await assertSucceeds(setDoc(ref, base));
  });

  it('a video activity join cannot seed an exit log', async () => {
    await seed();
    const key = 'pin-period_1-02';
    const base = {
      studentUid: OTHER_UID,
      pin: '02',
      classPeriod: 'period_1',
      joinedAt: 1000,
      answers: [],
      completedAt: null,
      score: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
    };
    const ref = doc(
      asOther(),
      `video_activity_sessions/${VA_SESSION}/responses/${key}`
    );
    await assertFails(setDoc(ref, { ...base, tabExits: [closedExit] }));
    await assertSucceeds(setDoc(ref, base));
  });
});
