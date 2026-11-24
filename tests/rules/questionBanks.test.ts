// Firestore security-rules regression for question banks
// (docs/plans/shipped/QUIZ_QUESTION_BANKS_AND_LEARNING_TARGETS.md §5, PR 2):
//   - /users/{uid}/question_banks + question_bank_folders: owner-only
//   - /synced_question_banks/{groupId}: any authed get, owner-only writes,
//     version +1, list closed
//   - /plcs/{plcId}/question_banks/{id}: member reads, non-viewer creates,
//     sharer or lead edits/deletes, identity immutable
//   - student servedQuestionIds on a bank-slot session: never student-written
//     (drawQuizBankQuestionsV1 records the draw)
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
  writeBatch,
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
type RulesDb = ReturnType<typeof as>;

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
const ownersPath = (id: string) => `synced_bank_owners/${id}`;
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

/** Creates a synced bank with its id reservation in one batch, as the client does. */
const createReserved = (
  db: RulesDb,
  id: string,
  ownerUid: string,
  bank: Record<string, unknown>,
  ownerExtra: Record<string, unknown> = {}
) => {
  const batch = writeBatch(db);
  batch.set(doc(db, ownersPath(id)), { ownerUid, at: 1, ...ownerExtra });
  batch.set(doc(db, `synced_question_banks/${id}`), bank);
  return batch.commit();
};

/** Deletes the synced bank and keeps its reservation in one batch. */
const deleteReserved = (db: RulesDb, ownerUid: string) => {
  const batch = writeBatch(db);
  batch.set(doc(db, ownersPath(GROUP_ID)), { ownerUid, at: 2 });
  batch.delete(doc(db, syncedPath));
  return batch.commit();
};

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
    await assertSucceeds(
      createReserved(as(OWNER_UID), GROUP_ID, OWNER_UID, syncedDoc())
    );
    await assertFails(
      createReserved(
        as(MEMBER_UID),
        'other',
        MEMBER_UID,
        syncedDoc({ id: 'other' })
      )
    );
    await assertFails(
      createReserved(
        as(OWNER_UID),
        'extra',
        OWNER_UID,
        syncedDoc({ id: 'extra', participants: {} })
      )
    );
    await assertFails(
      createReserved(
        as(OWNER_UID),
        'v2',
        OWNER_UID,
        syncedDoc({ id: 'v2', version: 2 })
      )
    );
  });

  it('anonymous and studentRole callers cannot create a bank', async () => {
    const anon = testEnv.authenticatedContext(OWNER_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    });
    await assertFails(setDoc(doc(anon.firestore(), syncedPath), syncedDoc()));
    await assertFails(setDoc(doc(asStudent(), syncedPath), syncedDoc()));
  });

  it('owner gets by id; a non-staff outsider, student and anonymous cannot; list is closed', async () => {
    // Staff and admin reads are covered in syncedContentReads.test.ts.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), syncedPath), syncedDoc());
    });
    await assertSucceeds(getDoc(doc(as(OWNER_UID), syncedPath)));
    await assertFails(getDoc(doc(as(OUTSIDER_UID), syncedPath)));
    await assertFails(getDoc(doc(asStudent(), syncedPath)));
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
    await assertFails(deleteReserved(as(MEMBER_UID), MEMBER_UID));
    await assertSucceeds(deleteReserved(as(OWNER_UID), OWNER_UID));
  });

  it('a deleted bank id stays reserved for its first owner (security #18)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ownersPath(GROUP_ID)), {
        ownerUid: OWNER_UID,
        at: 1,
      });
    });
    const forged = syncedDoc({ ownerUid: MEMBER_UID });
    await assertFails(setDoc(doc(as(MEMBER_UID), syncedPath), forged));
    await assertFails(
      createReserved(as(MEMBER_UID), GROUP_ID, MEMBER_UID, forged)
    );
    await assertSucceeds(
      createReserved(
        as(MEMBER_UID),
        'fresh',
        MEMBER_UID,
        syncedDoc({ id: 'fresh', ownerUid: MEMBER_UID })
      )
    );
    await assertSucceeds(setDoc(doc(as(OWNER_UID), syncedPath), syncedDoc()));
    await assertFails(getDoc(doc(as(OWNER_UID), ownersPath(GROUP_ID))));
  });
});

describe('synced_bank_owners/{groupId} (atomic id reservation)', () => {
  it('a first create without the reservation in the same batch is refused', async () => {
    await assertFails(setDoc(doc(as(OWNER_UID), syncedPath), syncedDoc()));
  });

  it('an id with no reservation cannot be claimed without creating the bank', async () => {
    await assertFails(
      setDoc(doc(as(MEMBER_UID), ownersPath(GROUP_ID)), {
        ownerUid: MEMBER_UID,
        at: 1,
      })
    );
    await assertFails(
      createReserved(as(MEMBER_UID), GROUP_ID, OWNER_UID, syncedDoc())
    );
    await assertFails(
      createReserved(as(OWNER_UID), GROUP_ID, OWNER_UID, syncedDoc(), {
        extra: true,
      })
    );
  });

  it('the owner delete keeps the id reserved in the same batch, so no one else re-creates it', async () => {
    await assertSucceeds(
      createReserved(as(OWNER_UID), GROUP_ID, OWNER_UID, syncedDoc())
    );
    await assertSucceeds(deleteReserved(as(OWNER_UID), OWNER_UID));
    const forged = syncedDoc({ ownerUid: MEMBER_UID });
    await assertFails(setDoc(doc(as(MEMBER_UID), syncedPath), forged));
    await assertFails(
      createReserved(as(MEMBER_UID), GROUP_ID, MEMBER_UID, forged)
    );
    await assertSucceeds(
      createReserved(as(OWNER_UID), GROUP_ID, OWNER_UID, syncedDoc())
    );
  });

  it('a legacy bank with no reservation: only its owner can reserve it, and delete requires it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), syncedPath), syncedDoc());
    });
    await assertFails(deleteDoc(doc(as(OWNER_UID), syncedPath)));
    await assertFails(
      setDoc(doc(as(MEMBER_UID), ownersPath(GROUP_ID)), {
        ownerUid: MEMBER_UID,
        at: 1,
      })
    );
    await assertSucceeds(deleteReserved(as(OWNER_UID), OWNER_UID));
    await assertFails(
      createReserved(
        as(MEMBER_UID),
        GROUP_ID,
        MEMBER_UID,
        syncedDoc({ ownerUid: MEMBER_UID })
      )
    );
  });

  it('the owner never moves and nobody else rewrites the reservation', async () => {
    await assertSucceeds(
      createReserved(as(OWNER_UID), GROUP_ID, OWNER_UID, syncedDoc())
    );
    await assertSucceeds(
      setDoc(doc(as(OWNER_UID), ownersPath(GROUP_ID)), {
        ownerUid: OWNER_UID,
        at: 2,
      })
    );
    await assertFails(
      setDoc(doc(as(OWNER_UID), ownersPath(GROUP_ID)), {
        ownerUid: MEMBER_UID,
        at: 3,
      })
    );
    await assertFails(
      setDoc(doc(as(MEMBER_UID), ownersPath(GROUP_ID)), {
        ownerUid: MEMBER_UID,
        at: 3,
      })
    );
    await assertFails(deleteDoc(doc(as(OWNER_UID), ownersPath(GROUP_ID))));
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

  it('rejects a student-written draw even at the full size', async () => {
    await seedSession(true);
    const write = updateDoc(
      doc(asStudent(), responsePath),
      answerWrite({ servedQuestionIds: ['f1', 'b2', 'b3'] })
    );
    await assertFails(write);
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
