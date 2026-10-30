// Synced quiz, bank and video activity groups hold answer keys, and a PLC-pooled
// session doc (readable by students) names the group, so only staff may get them.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-synced-answer-keys';
const GROUP_ID = 'group-answer-key';
const SESSION_ID = 'session-plc-pooled';
const TEACHER_UID = 'teacher-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';
const STUDENT_UID = 'student-uid';
const CLASS_A = 'class-a';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const COLLECTIONS = [
  'synced_quizzes',
  'synced_question_banks',
  'synced_video_activities',
] as const;

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@orono.k12.mn.us`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asEmailUser = (email: string, verified: boolean) =>
  testEnv
    .authenticatedContext('email-user-uid', {
      email,
      email_verified: verified,
      firebase: { sign_in_provider: verified ? 'google.com' : 'password' },
    })
    .firestore();

const asAnon = () =>
  testEnv
    .authenticatedContext('anon-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asStudentRole = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asPin = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      pinLogin: true,
      pinSessionId: SESSION_ID,
      auth_time: Math.floor(Date.now() / 1000),
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

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
    const key = [{ id: 'q1', correctAnswer: 'secret' }];
    await setDoc(doc(db, `synced_quizzes/${GROUP_ID}`), {
      id: GROUP_ID,
      version: 1,
      questions: key,
      participants: { [TEACHER_UID]: { joinedAt: 1 } },
    });
    await setDoc(doc(db, `synced_question_banks/${GROUP_ID}`), {
      id: GROUP_ID,
      ownerUid: TEACHER_UID,
      version: 1,
      questions: key,
    });
    await setDoc(doc(db, `synced_video_activities/${GROUP_ID}`), {
      id: GROUP_ID,
      version: 1,
      questions: key,
      participants: { [TEACHER_UID]: { joinedAt: 1 } },
    });
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      classId: CLASS_A,
      plcId: 'plc-1',
      syncGroupId: GROUP_ID,
    });
  });
});

describe.each(COLLECTIONS)('%s get', (coll) => {
  it('a participant teacher can get it', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), coll, GROUP_ID)));
  });

  it('a non-participant teacher can still get it (share import, PLC pull)', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacher(OTHER_TEACHER_UID), coll, GROUP_ID))
    );
  });

  it('a verified teacher outside the district can get it', async () => {
    await assertSucceeds(
      getDoc(
        doc(asEmailUser('teacher@noorg.example.com', true), coll, GROUP_ID)
      )
    );
  });

  it('an unverified email/password account is denied', async () => {
    await assertFails(
      getDoc(
        doc(asEmailUser('teacher@noorg.example.com', false), coll, GROUP_ID)
      )
    );
  });

  it('a district student Google account (numeric local part) is denied', async () => {
    await assertFails(
      getDoc(doc(asEmailUser('123456@orono.k12.mn.us', true), coll, GROUP_ID))
    );
  });

  it('a numeric address outside the district still passes', async () => {
    await assertSucceeds(
      getDoc(doc(asEmailUser('40213@district.org', true), coll, GROUP_ID))
    );
  });

  it('a students-domain Google account is denied', async () => {
    await assertFails(
      getDoc(
        doc(
          asEmailUser('Kid.Name@Students.Orono.k12.mn.us', true),
          coll,
          GROUP_ID
        )
      )
    );
  });

  it("another district's students-domain Google account is denied", async () => {
    await assertFails(
      getDoc(
        doc(asEmailUser('kid@students.otherdistrict.org', true), coll, GROUP_ID)
      )
    );
  });

  it('an anonymous token is denied', async () => {
    await assertFails(getDoc(doc(asAnon(), coll, GROUP_ID)));
  });

  it('a studentRole token is denied', async () => {
    await assertFails(getDoc(doc(asStudentRole(), coll, GROUP_ID)));
  });

  it('a pinLogin token is denied', async () => {
    await assertFails(getDoc(doc(asPin(), coll, GROUP_ID)));
  });
});

describe('PLC-pooled quiz session', () => {
  it('a student who reads the syncGroupId still cannot get the answer key', async () => {
    for (const db of [asAnon(), asStudentRole()]) {
      const session = await assertSucceeds(
        getDoc(doc(db, `quiz_sessions/${SESSION_ID}`))
      );
      const groupId = session.data()?.syncGroupId as string;
      expect(groupId).toBe(GROUP_ID);
      await assertFails(getDoc(doc(db, `synced_quizzes/${groupId}`)));
    }
  });
});
