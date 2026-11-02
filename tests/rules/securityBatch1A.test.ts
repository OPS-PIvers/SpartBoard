// Quiz responses: one PIN doc per roster seat, sign-in PINs join through the
// bridge on rostered sessions, the PIN length cap, the non-owner admin write
// limits, and the seated-only leaderboard names doc.
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
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { encodeResponseKeySegment } from '@/utils/quizResponseKey';

const PROJECT_ID = 'spartboard-security-batch-1a';
const SESSION = 'sb1a-session';
const ROSTERED = 'sb1a-rostered';
const TEACHER = 'teacher-sb1a';
const ADMIN_UID = 'admin-sb1a';
const ADMIN_EMAIL = 'admin-sb1a@orono.k12.mn.us';
const ANON = 'anon-sb1a';
const ANON_OTHER = 'anon-other-sb1a';
const SSO = 'sso-sb1a';
const CLASS = 'class-sb1a';

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
const teacherDb = () =>
  testEnv
    .authenticatedContext(TEACHER, {
      email: 'teacher-sb1a@orono.k12.mn.us',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const adminDb = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const pinKey = (period: string, pin: string) =>
  `pin-${encodeResponseKeySegment(period)}-${encodeResponseKeySegment(pin)}`;

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
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { role: 'admin' });
    await setDoc(doc(db, `quiz_sessions/${SESSION}`), {
      teacherUid: TEACHER,
      status: 'active',
      code: 'SB1A',
      classIds: [CLASS],
    });
    await setDoc(doc(db, `quiz_sessions/${ROSTERED}`), {
      teacherUid: TEACHER,
      status: 'active',
      code: 'SB1AR',
      rosterIds: ['roster-1'],
    });
  });
});

describe('anonymous PIN responses: one doc per roster seat', () => {
  it('lets a PIN student join at the canonical key for their period and PIN', async () => {
    const key = pinKey('Period 1', '4821');
    await assertSucceeds(
      setDoc(
        doc(anonDb(ANON), `quiz_sessions/${SESSION}/responses/${key}`),
        joinDoc(ANON, { pin: '4821', classPeriod: 'Period 1' })
      )
    );
    await assertSucceeds(
      getDoc(doc(anonDb(ANON), `quiz_sessions/${SESSION}/responses/${key}`))
    );
  });

  it('lets a PIN student with no period join under the default segment', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          anonDb(ANON),
          `quiz_sessions/${SESSION}/responses/${pinKey('', '77')}`
        ),
        joinDoc(ANON, { pin: '77' })
      )
    );
  });

  it('refuses a second doc for the same seat under another key', async () => {
    const fields = { pin: '4821', classPeriod: 'Period 1' };
    for (const key of [
      'pin-period_1x-4821',
      'pin-period_1-4821_',
      'pin-p1-4821',
      pinKey('Period 2', '4821'),
    ]) {
      await assertFails(
        setDoc(
          doc(anonDb(ANON), `quiz_sessions/${SESSION}/responses/${key}`),
          joinDoc(ANON, fields)
        )
      );
    }
  });

  it('refuses a PIN doc with no PIN field under a classmate seat key', async () => {
    await assertFails(
      setDoc(
        doc(
          anonDb(ANON),
          `quiz_sessions/${SESSION}/responses/${pinKey('Period 1', '4821')}`
        ),
        joinDoc(ANON, { classPeriod: 'Period 1' })
      )
    );
  });

  it('caps the stored PIN at 10 characters', async () => {
    const long = '12345678901';
    await assertFails(
      setDoc(
        doc(
          anonDb(ANON),
          `quiz_sessions/${SESSION}/responses/${pinKey('P1', long)}`
        ),
        joinDoc(ANON, { pin: long, classPeriod: 'P1' })
      )
    );
    await assertFails(
      setDoc(
        doc(ssoDb(), `quiz_sessions/${SESSION}/responses/${SSO}`),
        joinDoc(SSO, { pin: `${long}\nhttps://evil.example` })
      )
    );
  });

  it('still lets an SSO student join at their uid key', async () => {
    await assertSucceeds(
      setDoc(
        doc(ssoDb(), `quiz_sessions/${SESSION}/responses/${SSO}`),
        joinDoc(SSO, { classPeriod: 'Period 1' })
      )
    );
    await assertSucceeds(
      getDoc(doc(ssoDb(), `quiz_sessions/${SESSION}/responses/${SSO}`))
    );
  });
});

describe('rostered sessions: sign-in PINs join through the bridge', () => {
  it('refuses an anonymous key for a sign-in-length PIN', async () => {
    for (const pin of ['123456', '12-34-56', 'abc123']) {
      await assertFails(
        setDoc(
          doc(
            anonDb(ANON),
            `quiz_sessions/${ROSTERED}/responses/${pinKey('Period 1', pin)}`
          ),
          joinDoc(ANON, { pin, classPeriod: 'Period 1' })
        )
      );
    }
  });

  it('still takes a short roster PIN anonymously', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          anonDb(ANON),
          `quiz_sessions/${ROSTERED}/responses/${pinKey('Period 1', '05')}`
        ),
        joinDoc(ANON, { pin: '05', classPeriod: 'Period 1' })
      )
    );
  });

  it('still takes a long PIN on a session with no roster', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          anonDb(ANON),
          `quiz_sessions/${SESSION}/responses/${pinKey('Period 1', '123456')}`
        ),
        joinDoc(ANON, { pin: '123456', classPeriod: 'Period 1' })
      )
    );
  });
});

describe('non-owner admin writes to quiz responses', () => {
  const path = `quiz_sessions/${SESSION}/responses/${SSO}`;
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), joinDoc(SSO));
    });
  });

  it('refuses identity, archive, override, paper and translation fields', async () => {
    const patches: Record<string, unknown>[] = [
      { studentUid: 'someone-else' },
      {
        artifactArchive: { a1: { driveFileId: 'f1', archiveStatus: 'synced' } },
      },
      { hasStuckArchive: true },
      { resultsOverride: { mode: 'shown', publishedAt: 1 } },
      { paperSeat: 3 },
      { paperBatchId: 'batch-1' },
      { backTranslations: { q1: 'text' } },
    ];
    for (const patch of patches) {
      await assertFails(updateDoc(doc(adminDb(), path), patch));
    }
  });

  it('still lets an admin grade, read and delete', async () => {
    await assertSucceeds(
      updateDoc(doc(adminDb(), path), { 'grading.q1': { points: 1 } })
    );
    await assertSucceeds(getDoc(doc(adminDb(), path)));
    await assertSucceeds(deleteDoc(doc(adminDb(), path)));
  });

  it('still lets the session teacher write those fields', async () => {
    await assertSucceeds(
      updateDoc(doc(teacherDb(), path), {
        resultsOverride: { mode: 'shown', publishedAt: 1 },
        hasStuckArchive: false,
      })
    );
  });
});

describe('live leaderboard names', () => {
  const namesPath = `quiz_sessions/${SESSION}/live/leaderboard`;
  const anonKey = pinKey('Period 1', '4821');

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, namesPath), { names: { [SSO]: 'Ada Lovelace' } });
      await setDoc(
        doc(db, `quiz_sessions/${SESSION}/responses/${anonKey}`),
        joinDoc(ANON, { pin: '4821', classPeriod: 'Period 1' })
      );
      await setDoc(
        doc(db, `quiz_sessions/${SESSION}/responses/${SSO}`),
        joinDoc(SSO)
      );
    });
  });

  it('lets the teacher publish ranks and names together, and clear them', async () => {
    const db = teacherDb();
    await assertSucceeds(
      writeBatch(db)
        .update(doc(db, `quiz_sessions/${SESSION}`), {
          liveLeaderboard: [{ studentUid: SSO, score: 3, rank: 1 }],
        })
        .set(doc(db, namesPath), { names: { [SSO]: 'Ada Lovelace' } })
        .commit()
    );
    await assertSucceeds(getDoc(doc(db, namesPath)));
    await assertSucceeds(deleteDoc(doc(db, namesPath)));
  });

  it('hides names from a signed-in user who has not joined', async () => {
    await assertFails(getDoc(doc(anonDb(ANON_OTHER), namesPath)));
    await assertFails(getDoc(doc(ssoDb(), namesPath)));
    // The session doc itself stays readable by id for the join flow.
    await assertSucceeds(
      getDoc(doc(anonDb(ANON_OTHER), `quiz_sessions/${SESSION}`))
    );
  });

  it('refuses a seat pointing at someone else’s response', async () => {
    await assertFails(
      setDoc(
        doc(anonDb(ANON_OTHER), `quiz_sessions/${SESSION}/seats/${ANON_OTHER}`),
        {
          responseKey: anonKey,
        }
      )
    );
    await assertFails(getDoc(doc(anonDb(ANON_OTHER), namesPath)));
  });

  it('shows names to seated PIN and SSO students', async () => {
    const anon = anonDb(ANON);
    await assertSucceeds(
      setDoc(doc(anon, `quiz_sessions/${SESSION}/seats/${ANON}`), {
        responseKey: anonKey,
      })
    );
    await assertSucceeds(getDoc(doc(anon, namesPath)));
    const sso = ssoDb();
    await assertSucceeds(
      setDoc(doc(sso, `quiz_sessions/${SESSION}/seats/${SSO}`), {
        responseKey: SSO,
      })
    );
    await assertSucceeds(getDoc(doc(sso, namesPath)));
  });

  it('lets a new PIN student join and take a seat in one batch', async () => {
    const db = anonDb(ANON_OTHER);
    const key = pinKey('Period 2', '31');
    await assertSucceeds(
      writeBatch(db)
        .set(
          doc(db, `quiz_sessions/${SESSION}/responses/${key}`),
          joinDoc(ANON_OTHER, { pin: '31', classPeriod: 'Period 2' })
        )
        .set(doc(db, `quiz_sessions/${SESSION}/seats/${ANON_OTHER}`), {
          responseKey: key,
        })
        .commit()
    );
    await assertSucceeds(getDoc(doc(db, namesPath)));
  });

  it('lets only the session teacher write names', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `quiz_sessions/${SESSION}/seats/${SSO}`),
        {
          responseKey: SSO,
        }
      );
    });
    await assertFails(
      setDoc(doc(ssoDb(), namesPath), { names: { [SSO]: 'Someone Else' } })
    );
    await assertFails(setDoc(doc(adminDb(), namesPath), { names: { x: 'y' } }));
    await assertSucceeds(getDoc(doc(adminDb(), namesPath)));
  });
});
