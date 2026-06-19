// Firestore security rules regression coverage for the VIEWER write-gate
// (Decision 3.2 — read-only `viewer` role; §3.2 / §4 rules discipline; Wave 4
// task W4-T1). The `plcCanEditContent(plcId)` helper threads through the
// create / update / delete branches of every member-writable PLC content
// subcollection so a `viewer` is denied content writes while reads stay open.
//
// This suite pins, for EACH content subcollection
// (assessments · meetings · quizzes · video_activities · assignments · notes ·
//  todos · docs · comments):
//
//   - a viewer CAN read,
//   - a viewer is DENIED create / update / delete,
//   - a non-viewer member CAN create / update / delete,
//   - a coLead and the lead CAN create (spot-checked — they share the same
//     `plcCanEditContent` edit gate).
//
// Plus the viewer-writable carve-outs the task preserves:
//   - a viewer CAN write their OWN presence doc,
//   - a viewer CAN write their OWN `/users/{uid}/plc_state` unread cursor.
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
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-content-viewer';
const PLC_ID = 'plc-content-viewer';

const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@example.com';
const COLEAD_UID = 'colead-uid';
const COLEAD_EMAIL = 'colead@example.com';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@example.com';
const VIEWER_UID = 'viewer-uid';
const VIEWER_EMAIL = 'viewer@example.com';
const NON_MEMBER_UID = 'non-member-uid';
const NON_MEMBER_EMAIL = 'outsider@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asLead = () =>
  testEnv.authenticatedContext(LEAD_UID, { email: LEAD_EMAIL }).firestore();
const asCoLead = () =>
  testEnv.authenticatedContext(COLEAD_UID, { email: COLEAD_EMAIL }).firestore();
const asMember = () =>
  testEnv.authenticatedContext(MEMBER_UID, { email: MEMBER_EMAIL }).firestore();
const asViewer = () =>
  testEnv.authenticatedContext(VIEWER_UID, { email: VIEWER_EMAIL }).firestore();
const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: NON_MEMBER_EMAIL })
    .firestore();

const member = (
  uid: string,
  email: string,
  role: 'lead' | 'coLead' | 'member' | 'viewer'
) => ({
  uid,
  email,
  displayName: email.split('@')[0],
  role,
  joinedAt: 1,
  status: 'active',
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
  // PLC carrying a populated `members` map (Decision 1.2) with a VIEWER entry,
  // so the role-aware `plcCanEditContent` gate is exercised. All four uids sit
  // in the denormalized memberUids index too, proving the viewer denial comes
  // from the MAP role (not from membership).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Viewer Test PLC',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID, VIEWER_UID],
      memberEmails: {
        [LEAD_UID]: LEAD_EMAIL,
        [COLEAD_UID]: COLEAD_EMAIL,
        [MEMBER_UID]: MEMBER_EMAIL,
        [VIEWER_UID]: VIEWER_EMAIL,
      },
      members: {
        [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
        [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
        [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
        [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

type Db = ReturnType<typeof asMember>;

// Seed an existing doc (rules-disabled) so update/delete have a target.
const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};

// ===========================================================================
// Per-collection content fixtures + the read / write matrix
// ===========================================================================

interface ContentCase {
  name: string;
  path: (id: string) => string;
  doc: (id: string, creatorUid: string) => Record<string, unknown>;
  // A minimal update patch that satisfies the immutability pins (re-stamps the
  // mutable fields). Soft-delete via deletedAt where the schema supports it.
  patch: () => Record<string, unknown>;
}

const DOC_ID = 'c1';

const cases: ContentCase[] = [
  {
    name: 'assessments',
    path: (id) => `plcs/${PLC_ID}/assessments/${id}`,
    doc: (id, creator) => ({
      id,
      title: 'Unit 4 CFA',
      kind: 'quiz',
      syncGroupId: 'sg-1',
      status: 'planning',
      createdBy: creator,
      createdAt: 1000,
      updatedAt: 1000,
    }),
    patch: () => ({ status: 'active', updatedAt: 2000 }),
  },
  {
    name: 'meetings',
    path: (id) => `plcs/${PLC_ID}/meetings/${id}`,
    doc: (id, creator) => ({
      id,
      heldAt: 1000,
      facilitatorUid: creator,
      attendeeUids: [creator],
      assessmentIds: [],
      decisions: [],
      actionItems: [],
      status: 'in-progress',
      createdBy: creator,
      updatedAt: 1000,
    }),
    patch: () => ({ status: 'completed', updatedAt: 2000 }),
  },
  {
    name: 'quizzes',
    path: (id) => `plcs/${PLC_ID}/quizzes/${id}`,
    doc: (id, creator) => ({
      id,
      title: 'Quiz',
      questionCount: 5,
      syncGroupId: 'sg-q',
      sharedBy: creator,
      sharedByEmail: 'x@example.com',
      sharedByName: 'X',
      sharedAt: 1000,
      updatedAt: 1000,
    }),
    patch: () => ({ title: 'Quiz (edited)', updatedAt: 2000 }),
  },
  {
    name: 'video_activities',
    path: (id) => `plcs/${PLC_ID}/video_activities/${id}`,
    doc: (id, creator) => ({
      id,
      title: 'VA',
      youtubeUrl: 'https://youtube.com/watch?v=x',
      questionCount: 3,
      syncGroupId: 'sg-va',
      sharedBy: creator,
      sharedByEmail: 'x@example.com',
      sharedByName: 'X',
      sharedAt: 1000,
      updatedAt: 1000,
    }),
    patch: () => ({ title: 'VA (edited)', updatedAt: 2000 }),
  },
  {
    name: 'assignments',
    path: (id) => `plcs/${PLC_ID}/assignments/${id}`,
    doc: (id, creator) => ({
      id,
      quizTitle: 'Assignment',
      quizId: 'q-1',
      syncGroupId: 'sg-a',
      sessionMode: 'teacher',
      sessionOptions: {},
      attemptLimit: null,
      sharedBy: creator,
      sharedByEmail: 'x@example.com',
      sharedByName: 'X',
      sharedAt: 1000,
      updatedAt: 1000,
    }),
    patch: () => ({ quizTitle: 'Assignment (edited)', updatedAt: 2000 }),
  },
  {
    name: 'notes',
    path: (id) => `plcs/${PLC_ID}/notes/${id}`,
    doc: (id, creator) => ({
      id,
      title: 'Note',
      body: 'body',
      createdBy: creator,
      createdAt: 1000,
      lastEditedBy: creator,
      lastEditedAt: 1000,
    }),
    // No `version` on the seed → the rollout branch (both absent) keeps it
    // editable without a version bump; re-stamp lastEditedBy to the editor
    // (the update rule requires lastEditedBy == request.auth.uid).
    patch: () => ({
      body: 'edited body',
      lastEditedBy: MEMBER_UID,
      lastEditedAt: 2000,
    }),
  },
  {
    name: 'docs',
    path: (id) => `plcs/${PLC_ID}/docs/${id}`,
    doc: (id, creator) => ({
      id,
      title: 'Doc',
      url: 'https://docs.google.com/document/d/x',
      createdBy: creator,
      createdByName: 'X',
      createdAt: 1000,
      updatedAt: 1000,
    }),
    patch: () => ({ title: 'Doc (edited)', updatedAt: 2000 }),
  },
  {
    name: 'todos',
    path: (id) => `plcs/${PLC_ID}/todos/${id}`,
    doc: (id, creator) => ({
      id,
      text: 'Todo',
      done: false,
      createdBy: creator,
      createdAt: 1000,
    }),
    patch: () => ({ done: true }),
  },
  {
    name: 'comments',
    path: (id) => `plcs/${PLC_ID}/comments/${id}`,
    doc: (id, creator) => ({
      id,
      targetType: 'dataCard',
      targetId: 'assessment-1',
      authorUid: creator,
      authorName: 'X',
      body: 'comment',
      mentions: [],
      createdAt: 1000,
    }),
    patch: () => ({ body: 'comment (edited)', editedAt: 2000 }),
  },
];

for (const c of cases) {
  describe(`plcs/{plcId}/${c.name} — viewer write-gate`, () => {
    const ref = (db: Db, id = DOC_ID) => doc(db, c.path(id));

    describe('read stays open to the viewer', () => {
      beforeEach(() => seed(c.path(DOC_ID), c.doc(DOC_ID, MEMBER_UID)));

      it('a viewer CAN read', async () => {
        await assertSucceeds(getDoc(ref(asViewer())));
      });

      it('a non-member CANNOT read (membership gate intact)', async () => {
        await assertFails(getDoc(ref(asNonMember())));
      });
    });

    describe('viewer is denied content writes', () => {
      it('a viewer CANNOT create', async () => {
        await assertFails(
          setDoc(ref(asViewer(), 'viewer-doc'), c.doc('viewer-doc', VIEWER_UID))
        );
      });

      it('a viewer CANNOT update', async () => {
        await seed(c.path(DOC_ID), c.doc(DOC_ID, MEMBER_UID));
        await assertFails(updateDoc(ref(asViewer()), c.patch()));
      });

      it('a viewer CANNOT delete', async () => {
        await seed(c.path(DOC_ID), c.doc(DOC_ID, MEMBER_UID));
        await assertFails(deleteDoc(ref(asViewer())));
      });
    });

    describe('non-viewer members can write', () => {
      it('a plain member CAN create', async () => {
        await assertSucceeds(
          setDoc(ref(asMember(), 'member-doc'), c.doc('member-doc', MEMBER_UID))
        );
      });

      it('a co-lead CAN create', async () => {
        await assertSucceeds(
          setDoc(ref(asCoLead(), 'colead-doc'), c.doc('colead-doc', COLEAD_UID))
        );
      });

      it('the lead CAN create', async () => {
        await assertSucceeds(
          setDoc(ref(asLead(), 'lead-doc'), c.doc('lead-doc', LEAD_UID))
        );
      });

      it('a plain member CAN update', async () => {
        await seed(c.path(DOC_ID), c.doc(DOC_ID, MEMBER_UID));
        await assertSucceeds(updateDoc(ref(asMember()), c.patch()));
      });

      it('a plain member CAN delete', async () => {
        await seed(c.path(DOC_ID), c.doc(DOC_ID, MEMBER_UID));
        await assertSucceeds(deleteDoc(ref(asMember())));
      });
    });
  });
}

// ===========================================================================
// Viewer-writable carve-outs (task: do NOT gate these)
// ===========================================================================

describe('viewer-writable carve-outs', () => {
  it('a viewer CAN write their OWN presence doc', async () => {
    await assertSucceeds(
      setDoc(doc(asViewer(), `plcs/${PLC_ID}/presence/${VIEWER_UID}`), {
        uid: VIEWER_UID,
        displayName: 'Viewer',
        section: 'home',
        lastActiveAt: serverTimestamp(),
      })
    );
  });

  it('a viewer CANNOT write a TEAMMATE’s presence doc (self-only)', async () => {
    await assertFails(
      setDoc(doc(asViewer(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`), {
        uid: MEMBER_UID,
        displayName: 'Member',
        section: 'home',
        lastActiveAt: serverTimestamp(),
      })
    );
  });

  it('a viewer CAN write their OWN /users/{uid}/plc_state unread cursor', async () => {
    await assertSucceeds(
      setDoc(doc(asViewer(), `users/${VIEWER_UID}/plc_state/${PLC_ID}`), {
        lastSeenAt: serverTimestamp(),
      })
    );
  });
});
