// Anonymous PIN seats: one canonical key per PIN (leading zeros stripped), a PIN doc keeps
// its key's period, a linked student's retired PIN seats no one on a ClassLink-rostered
// session, and video activity refuses sign-in-length PIN keys on rostered sessions.
//
// Requires a running Firestore emulator: pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import {
  encodeResponseKeySegment,
  quizPinKeySegment,
} from '@/utils/quizResponseKey';

const PROJECT_ID = 'spartboard-quiz-join-pins';
const TEACHER = 'teacher-qjp';
const ANON = 'anon-qjp';
const ANON_OTHER = 'anon-other-qjp';
const SSO = 'sso-qjp';
const CLASS = 'class-qjp';
const PLAIN = 'qjp-plain';
const PERIODS = 'qjp-periods';
const ROSTERED = 'qjp-rostered';
const VA_ROSTERED = 'qjp-va-rostered';
const VA_PLAIN = 'qjp-va-plain';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const anonDb = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
const ssoDb = () =>
  testEnv
    .authenticatedContext(SSO, {
      studentRole: true,
      classIds: [CLASS],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const rawKey = (period: string, pin: string) =>
  `pin-${encodeResponseKeySegment(period)}-${encodeResponseKeySegment(pin)}`;
const quizKey = (period: string, pin: string) =>
  `pin-${encodeResponseKeySegment(period)}-${quizPinKeySegment(pin)}`;

const joinDoc = (uid: string, extra: Record<string, unknown> = {}) => ({
  studentUid: uid,
  joinedAt: 1000,
  status: 'joined',
  answers: [],
  score: null,
  submittedAt: null,
  completedAttempts: 0,
  preSyncVersion: 0,
  ...extra,
});

const vaJoinDoc = (uid: string, pin: string) => ({
  studentUid: uid,
  pin,
  classPeriod: 'Period 1',
  joinedAt: 1000,
  score: null,
  answers: [],
  completedAt: null,
  completedAttempts: 0,
  tabSwitchWarnings: 0,
});

const quizRef = (db: ReturnType<typeof anonDb>, session: string, key: string) =>
  doc(db, `quiz_sessions/${session}/responses/${key}`);

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(
        process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? '8080'
      ),
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
    await setDoc(doc(db, `quiz_sessions/${PLAIN}`), {
      teacherUid: TEACHER,
      status: 'active',
      code: 'QJPA',
    });
    await setDoc(doc(db, `quiz_sessions/${PERIODS}`), {
      teacherUid: TEACHER,
      status: 'active',
      code: 'QJPB',
      periodNames: ['Period 1', 'Period 2'],
    });
    await setDoc(doc(db, `quiz_sessions/${ROSTERED}`), {
      teacherUid: TEACHER,
      status: 'active',
      code: 'QJPC',
      rosterIds: ['roster-1'],
      classIds: [CLASS],
    });
    await setDoc(doc(db, `video_activity_sessions/${VA_ROSTERED}`), {
      teacherUid: TEACHER,
      status: 'active',
      mode: 'submissions',
      code: 'QJPD',
      rosterIds: ['roster-1'],
      classIds: [CLASS],
    });
    await setDoc(doc(db, `video_activity_sessions/${VA_PLAIN}`), {
      teacherUid: TEACHER,
      status: 'active',
      mode: 'submissions',
      code: 'QJPE',
    });
    // Alice's old sequential PIN 01, retired when she got a 6-digit PIN.
    await setDoc(doc(db, `users/${TEACHER}/retired_pins/period_1__01`), {
      rosterId: 'roster-1',
      updatedAt: 1,
    });
  });
});

describe('quiz PIN keys: leading zeros share one seat', () => {
  it('takes a padded PIN only at its zero-stripped key', async () => {
    const fields = { pin: '04821', classPeriod: 'Period 1' };
    await assertFails(
      setDoc(
        quizRef(anonDb(ANON), PLAIN, rawKey('Period 1', '04821')),
        joinDoc(ANON, fields)
      )
    );
    await assertSucceeds(
      setDoc(
        quizRef(anonDb(ANON), PLAIN, 'pin-period_1-4821'),
        joinDoc(ANON, fields)
      )
    );
  });

  it('refuses a padded rejoin once the unpadded seat is completed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        quizRef(ctx.firestore(), PLAIN, 'pin-period_1-4821'),
        joinDoc(ANON_OTHER, {
          pin: '4821',
          classPeriod: 'Period 1',
          status: 'completed',
          completedAttempts: 1,
        })
      );
    });
    for (const pin of ['04821', '004821']) {
      for (const key of [rawKey('Period 1', pin), quizKey('Period 1', pin)]) {
        await assertFails(
          setDoc(
            quizRef(anonDb(ANON), PLAIN, key),
            joinDoc(ANON, { pin, classPeriod: 'Period 1' })
          )
        );
      }
    }
  });

  it('keeps two-digit roster PINs at their usual keys', async () => {
    for (const [pin, key] of [
      ['05', 'pin-period_1-05'],
      ['5', 'pin-period_1-05'],
      ['10', 'pin-period_1-10'],
    ] as const) {
      await testEnv.clearFirestore();
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `quiz_sessions/${PLAIN}`), {
          teacherUid: TEACHER,
          status: 'active',
          code: 'QJPA',
        });
      });
      await assertSucceeds(
        setDoc(
          quizRef(anonDb(ANON), PLAIN, key),
          joinDoc(ANON, { pin, classPeriod: 'Period 1' })
        )
      );
    }
  });
});

describe('quiz PIN docs keep the period their key names', () => {
  const key = rawKey('Period 2', '4821');
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        quizRef(ctx.firestore(), PERIODS, key),
        joinDoc(ANON, { pin: '4821', classPeriod: 'Period 2' })
      );
      await setDoc(
        quizRef(ctx.firestore(), PERIODS, SSO),
        joinDoc(SSO, { classPeriod: 'Period 1' })
      );
    });
  });

  it('refuses relabelling a PIN doc onto another period', async () => {
    await assertFails(
      updateDoc(quizRef(anonDb(ANON), PERIODS, key), {
        classPeriod: 'Period 1',
      })
    );
  });

  it('still takes a rewrite that keeps the same period segment', async () => {
    await assertSucceeds(
      updateDoc(quizRef(anonDb(ANON), PERIODS, key), {
        classPeriod: 'period 2',
      })
    );
  });

  it('still lets an SSO doc change its period', async () => {
    await assertSucceeds(
      updateDoc(quizRef(ssoDb(), PERIODS, SSO), { classPeriod: 'Period 2' })
    );
  });
});

describe('retired roster PINs on a ClassLink-rostered quiz', () => {
  it('seats no one under a linked student’s retired PIN, in any padding', async () => {
    for (const pin of ['01', '1', '001']) {
      await assertFails(
        setDoc(
          quizRef(anonDb(ANON), ROSTERED, quizKey('Period 1', pin)),
          joinDoc(ANON, { pin, classPeriod: 'Period 1' })
        )
      );
    }
  });

  it('still seats an unretired short PIN', async () => {
    await assertSucceeds(
      setDoc(
        quizRef(anonDb(ANON), ROSTERED, quizKey('Period 1', '02')),
        joinDoc(ANON, { pin: '02', classPeriod: 'Period 1' })
      )
    );
  });

  it('ignores a retired PIN from a roster this session does not use', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${TEACHER}/retired_pins/period_1__03`),
        { rosterId: 'roster-gone', updatedAt: 1 }
      );
    });
    await assertSucceeds(
      setDoc(
        quizRef(anonDb(ANON), ROSTERED, quizKey('Period 1', '03')),
        joinDoc(ANON, { pin: '03', classPeriod: 'Period 1' })
      )
    );
  });

  it('still seats the same PIN in another period', async () => {
    await assertSucceeds(
      setDoc(
        quizRef(anonDb(ANON), ROSTERED, quizKey('Period 2', '01')),
        joinDoc(ANON, { pin: '01', classPeriod: 'Period 2' })
      )
    );
  });

  it('still lets an SSO student join', async () => {
    await assertSucceeds(
      setDoc(
        quizRef(ssoDb(), ROSTERED, SSO),
        joinDoc(SSO, { classPeriod: 'Period 1' })
      )
    );
  });

  it('keeps clients away from retired_pins', async () => {
    await assertFails(
      setDoc(doc(anonDb(ANON), `users/${TEACHER}/retired_pins/period_1__02`), {
        rosterId: 'x',
      })
    );
  });
});

describe('video activity: sign-in-length PINs on rostered sessions', () => {
  const vaRef = (session: string, key: string) =>
    doc(anonDb(ANON), `video_activity_sessions/${session}/responses/${key}`);

  it('refuses a free and a taken 6-digit PIN key alike', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `video_activity_sessions/${VA_ROSTERED}/responses/${rawKey('Period 1', '654321')}`
        ),
        vaJoinDoc(ANON_OTHER, '654321')
      );
    });
    for (const pin of ['123456', '654321', '12-34-56']) {
      await assertFails(
        setDoc(
          vaRef(VA_ROSTERED, rawKey('Period 1', pin)),
          vaJoinDoc(ANON, pin)
        )
      );
    }
  });

  it('still takes a short PIN anonymously on a rostered session', async () => {
    await assertSucceeds(
      setDoc(
        vaRef(VA_ROSTERED, rawKey('Period 1', '05')),
        vaJoinDoc(ANON, '05')
      )
    );
  });

  it('still takes a long PIN on a session with no roster', async () => {
    await assertSucceeds(
      setDoc(
        vaRef(VA_PLAIN, rawKey('Period 1', '123456')),
        vaJoinDoc(ANON, '123456')
      )
    );
  });
});
