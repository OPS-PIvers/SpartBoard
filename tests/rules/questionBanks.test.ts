// Firestore security-rules regression for question banks
// (docs/plans/QUIZ_QUESTION_BANKS_AND_LEARNING_TARGETS.md §5, PR 2):
//   - /users/{uid}/question_banks + question_bank_folders: owner-only
//   - /synced_question_banks/{groupId}: any authed get, owner-only writes,
//     version +1, list closed
//   - /plcs/{plcId}/question_banks/{id}: member reads, non-viewer creates,
//     sharer or lead edits/deletes, identity immutable
//   - student servedQuestionIds on a bank-slot session: size must equal
//     totalQuestions
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

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
  updateDoc,
  deleteDoc,
  doc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-question-banks';
const PLC_ID = 'plc-banks-rules-test';
const GROUP_ID = 'group-banks-1';
const SESSION_ID = 'session-banks-1';
const CLASS_ID = 'class-banks-1';

const OWNER_UID = 'owner-uid';
const LEAD_UID = 'lead-uid';
const MEMBER_UID = 'member-uid';
const VIEWER_UID = 'viewer-uid';
const OUTSIDER_UID = 'outsider-uid';
const STUDENT_UID = 'student-banks-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const as = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore();

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: 'student@school.edu',
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const syncedPath = `synced_question_banks/${GROUP_ID}`;
const entryPath = (id: string) => `plcs/${PLC_ID}/question_banks/${id}`;
const responsePath = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`;

const syncedDoc = (over: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  ownerUid: OWNER_UID,
  plcIds: [PLC_ID],
  version: 1,
  title: 'Fractions',
  questions: [{ id: 'q1', text: 'x', type: 'MC' }],
  questionCount: 1,
  targetIds: [],
  targetCounts: {},
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const entryDoc = (
  id: string,
  sharedBy: string,
  over: Record<string, unknown> = {}
) => ({
  id,
  title: 'Fractions',
  questionCount: 1,
  syncGroupId: GROUP_ID,
  targetIds: [],
  sharedBy,
  sharedByEmail: `${sharedBy}@example.com`,
  sharedByName: sharedBy,
  sharedAt: 1,
  updatedAt: 1,
  ...over,
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
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID, OWNER_UID, MEMBER_UID, VIEWER_UID],
      memberEmails: {},
      members: {
        [LEAD_UID]: { role: 'lead' },
        [OWNER_UID]: { role: 'member' },
        [MEMBER_UID]: { role: 'member' },
        [VIEWER_UID]: { role: 'viewer' },
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

describe('users/{uid}/question_banks and folders', () => {
  it('owner reads and writes; another user cannot', async () => {
    const path = `users/${OWNER_UID}/question_banks/bank-1`;
    await assertSucceeds(setDoc(doc(as(OWNER_UID), path), { id: 'bank-1' }));
    await assertSucceeds(getDoc(doc(as(OWNER_UID), path)));
    await assertFails(getDoc(doc(as(MEMBER_UID), path)));
    await assertFails(setDoc(doc(as(MEMBER_UID), path), { id: 'bank-1' }));
    const folder = `users/${OWNER_UID}/question_bank_folders/f1`;
    await assertSucceeds(setDoc(doc(as(OWNER_UID), folder), { name: 'A' }));
    await assertFails(setDoc(doc(as(MEMBER_UID), folder), { name: 'A' }));
  });
});

describe('synced_question_banks/{groupId}', () => {
  it('owner creates; ownerUid must be the caller; extra keys rejected', async () => {
    await assertSucceeds(setDoc(doc(as(OWNER_UID), syncedPath), syncedDoc()));
    await assertFails(
      setDoc(
        doc(as(MEMBER_UID), `synced_question_banks/other`),
        syncedDoc({ id: 'other' })
      )
    );
    await assertFails(
      setDoc(
        doc(as(OWNER_UID), `synced_question_banks/extra`),
        syncedDoc({ id: 'extra', participants: {} })
      )
    );
    await assertFails(
      setDoc(
        doc(as(OWNER_UID), `synced_question_banks/v2`),
        syncedDoc({ id: 'v2', version: 2 })
      )
    );
  });

  it('any authed user gets by id; anonymous cannot; list is closed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), syncedPath), syncedDoc());
    });
    await assertSucceeds(getDoc(doc(as(OUTSIDER_UID), syncedPath)));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), syncedPath))
    );
    await assertFails(
      getDocs(collection(as(OWNER_UID), 'synced_question_banks'))
    );
  });

  it('owner updates with version + 1; members cannot; owner may delete', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), syncedPath), syncedDoc());
    });
    await assertSucceeds(
      setDoc(
        doc(as(OWNER_UID), syncedPath),
        syncedDoc({ version: 2, updatedAt: 2 })
      )
    );
    await assertFails(
      setDoc(
        doc(as(OWNER_UID), syncedPath),
        syncedDoc({ version: 4, updatedAt: 3 })
      )
    );
    await assertFails(
      setDoc(
        doc(as(OWNER_UID), syncedPath),
        syncedDoc({ version: 3, ownerUid: MEMBER_UID })
      )
    );
    await assertFails(
      setDoc(doc(as(MEMBER_UID), syncedPath), syncedDoc({ version: 3 }))
    );
    await assertFails(deleteDoc(doc(as(MEMBER_UID), syncedPath)));
    await assertSucceeds(deleteDoc(doc(as(OWNER_UID), syncedPath)));
  });
});

describe('plcs/{plcId}/question_banks/{entryId}', () => {
  it('non-viewer member creates a header attributed to self', async () => {
    await assertSucceeds(
      setDoc(doc(as(OWNER_UID), entryPath('e1')), entryDoc('e1', OWNER_UID))
    );
    await assertFails(
      setDoc(doc(as(VIEWER_UID), entryPath('e2')), entryDoc('e2', VIEWER_UID))
    );
    await assertFails(
      setDoc(
        doc(as(OUTSIDER_UID), entryPath('e3')),
        entryDoc('e3', OUTSIDER_UID)
      )
    );
    await assertFails(
      setDoc(doc(as(MEMBER_UID), entryPath('e4')), entryDoc('e4', OWNER_UID))
    );
    await assertFails(
      setDoc(
        doc(as(OWNER_UID), entryPath('e5')),
        entryDoc('e5', OWNER_UID, { syncGroupId: '' })
      )
    );
    await assertFails(
      setDoc(
        doc(as(OWNER_UID), entryPath('e6')),
        entryDoc('e6', OWNER_UID, { questions: [] })
      )
    );
  });

  it('members read; outsiders cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), entryPath('e1')),
        entryDoc('e1', OWNER_UID)
      );
    });
    await assertSucceeds(getDoc(doc(as(VIEWER_UID), entryPath('e1'))));
    await assertFails(getDoc(doc(as(OUTSIDER_UID), entryPath('e1'))));
  });

  it('sharer or lead mirrors and deletes; other members cannot; identity immutable', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), entryPath('e1')),
        entryDoc('e1', OWNER_UID)
      );
    });
    await assertSucceeds(
      updateDoc(doc(as(OWNER_UID), entryPath('e1')), {
        title: 'Renamed',
        questionCount: 3,
        updatedAt: 2,
      })
    );
    await assertSucceeds(
      updateDoc(doc(as(LEAD_UID), entryPath('e1')), { updatedAt: 3 })
    );
    await assertFails(
      updateDoc(doc(as(MEMBER_UID), entryPath('e1')), { updatedAt: 4 })
    );
    await assertFails(
      updateDoc(doc(as(OWNER_UID), entryPath('e1')), {
        sharedBy: LEAD_UID,
        updatedAt: 5,
      })
    );
    await assertFails(
      updateDoc(doc(as(OWNER_UID), entryPath('e1')), {
        syncGroupId: 'other-group',
        updatedAt: 6,
      })
    );
    await assertFails(deleteDoc(doc(as(MEMBER_UID), entryPath('e1'))));
    await assertSucceeds(deleteDoc(doc(as(LEAD_UID), entryPath('e1'))));
  });
});

describe('student servedQuestionIds on a bank-slot session', () => {
  const answerWrite = (extra: Record<string, unknown>) => ({
    answers: [
      { questionId: 'f1', answer: 'a', answeredAt: 1, status: 'submitted' },
    ],
    status: 'in-progress',
    lastWriteAt: serverTimestamp(),
    ...extra,
  });

  const seedSession = async (bankSlots: boolean) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
        teacherUid: OWNER_UID,
        assignmentId: 'assignment-banks-1',
        status: 'active',
        code: 'BANKS1',
        classId: CLASS_ID,
        classIds: [CLASS_ID],
        totalQuestions: 3,
        ...(bankSlots
          ? {
              bankSlots: [
                {
                  id: 's1',
                  count: 2,
                  points: 1,
                  poolQuestionIds: ['b1', 'b2', 'b3'],
                  position: 1,
                },
              ],
            }
          : {}),
      });
      await setDoc(doc(db, responsePath), {
        studentUid: STUDENT_UID,
        joinedAt: 1000,
        score: null,
        answers: [],
        status: 'in-progress',
        completedAttempts: 0,
        preSyncVersion: 0,
      });
    });
  };

  it('accepts a draw whose size equals totalQuestions', async () => {
    await seedSession(true);
    await assertSucceeds(
      updateDoc(
        doc(asStudent(), responsePath),
        answerWrite({ servedQuestionIds: ['f1', 'b2', 'b3'] })
      )
    );
  });

  it('rejects a shorter draw and a draw on a session without slots', async () => {
    await seedSession(true);
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        answerWrite({ servedQuestionIds: ['f1', 'b2'] })
      )
    );
    await seedSession(false);
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        answerWrite({ servedQuestionIds: ['f1', 'b2', 'b3'] })
      )
    );
  });
});
