// Firestore rules regression: only the Schoology launch handler sets a session's ltiAttachment, which grade push trusts. Run via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-session-lti-attachment';
const TEACHER_UID = 'lti-teacher';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);
const ATTACHMENT = { resourceLinkId: 'rl-victim', contextId: 'ctx-1' };

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: `${TEACHER_UID}@example.com`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const CASES = [
  {
    name: 'quiz_sessions',
    path: 'quiz_sessions/s1',
    session: { teacherUid: TEACHER_UID, quizTitle: 'Quiz', status: 'active' },
  },
  {
    name: 'video_activity_sessions',
    path: 'video_activity_sessions/s1',
    session: {
      id: 's1',
      teacherUid: TEACHER_UID,
      activityId: 'a1',
      createdAt: 1,
      status: 'active',
    },
  },
];

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
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

describe.each(CASES)('$name ltiAttachment', (c) => {
  it('refuses a teacher creating a session that carries one', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), c.path), {
        ...c.session,
        ltiAttachment: ATTACHMENT,
      })
    );
  });

  it('refuses a teacher adding, changing or removing one', async () => {
    await seed(c.path, c.session);
    await assertFails(
      updateDoc(doc(asTeacher(), c.path), { ltiAttachment: ATTACHMENT })
    );
    await seed(c.path, { ...c.session, ltiAttachment: ATTACHMENT });
    await assertFails(
      updateDoc(doc(asTeacher(), c.path), {
        'ltiAttachment.resourceLinkId': 'rl-other',
      })
    );
    await assertFails(
      setDoc(doc(asTeacher(), c.path), { ...c.session, status: 'ended' })
    );
  });

  it('still lets the teacher edit an attached session', async () => {
    await seed(c.path, { ...c.session, ltiAttachment: ATTACHMENT });
    await assertSucceeds(
      updateDoc(doc(asTeacher(), c.path), { status: 'ended' })
    );
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), c.path),
        { ...c.session, ltiAttachment: ATTACHMENT, status: 'ended' },
        { merge: true }
      )
    );
  });
});
