// Rules for `/linked_collections/{linkId}` (docs/plans/COLLECTION_SHARING.md): reads, host,
// collaborator, self-join (role pinned to the mode), self-leave, delete, and the link host ending board shares.
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
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  doc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-linked-collections';
const SYNCED_ID = 'link-synced';
const VIEW_ID = 'link-view';
const ENDED_ID = 'link-ended';
const HOST_UID = 'host-uid';
const COLLAB_UID = 'collab-uid';
const VIEWER_UID = 'viewer-uid';
const STRANGER_UID = 'stranger-uid';
const ADMIN_UID = 'admin-uid-lc';
const ADMIN_EMAIL = 'admin@external-district.org';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const as = (uid: string, claims: Record<string, unknown> = {}) =>
  testEnv
    .authenticatedContext(uid, { email: `${uid}@example.com`, ...claims })
    .firestore();
const asHost = () => as(HOST_UID);
const asCollab = () => as(COLLAB_UID);
const asViewer = () => as(VIEWER_UID);
const asStranger = () => as(STRANGER_UID);
const asAnon = () =>
  testEnv
    .authenticatedContext('anon-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asStudent = () => as('student-uid', { studentRole: true });
const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();

const linkDoc = (overrides: Record<string, unknown> = {}) => ({
  hostUid: HOST_UID,
  hostName: 'Host',
  mode: 'synced',
  name: 'Unit 3',
  boards: [{ shareId: 'board-share-1', name: 'Day 1', order: 0 }],
  participants: {
    [COLLAB_UID]: { role: 'collaborator', name: 'Collab', joinedAt: 1000 },
    'collab2-uid': { role: 'collaborator', joinedAt: 1000 },
  },
  createdAt: 1000,
  updatedAt: 1000,
  updatedBy: HOST_UID,
  ended: false,
  ...overrides,
});

const ref = (db: ReturnType<typeof asHost>, id: string) =>
  doc(db, `linked_collections/${id}`);

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
    await setDoc(ref(db, SYNCED_ID), linkDoc());
    await setDoc(
      ref(db, VIEW_ID),
      linkDoc({
        mode: 'view-only',
        participants: {
          [VIEWER_UID]: { role: 'viewer', joinedAt: 1000 },
        },
      })
    );
    await setDoc(ref(db, ENDED_ID), linkDoc({ ended: true }));
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { email: ADMIN_EMAIL });
  });
});

describe('reads', () => {
  it('a signed-in teacher holding the link can read it', async () => {
    await assertSucceeds(getDoc(ref(asStranger(), SYNCED_ID)));
  });

  it('an anonymous student cannot read it', async () => {
    await assertFails(getDoc(ref(asAnon(), SYNCED_ID)));
  });

  it('a student-role account cannot read it', async () => {
    await assertFails(getDoc(ref(asStudent(), SYNCED_ID)));
  });

  it('signed-out callers cannot read it', async () => {
    await assertFails(
      getDoc(ref(testEnv.unauthenticatedContext().firestore(), SYNCED_ID))
    );
  });

  it('the host can list their own links', async () => {
    const db = asHost();
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'linked_collections'),
          where('hostUid', '==', HOST_UID)
        )
      )
    );
  });

  it('a teacher cannot list another host’s links', async () => {
    const db = asStranger();
    await assertFails(
      getDocs(
        query(
          collection(db, 'linked_collections'),
          where('hostUid', '==', HOST_UID)
        )
      )
    );
  });

  it('an unscoped list is denied', async () => {
    await assertFails(getDocs(collection(asHost(), 'linked_collections')));
  });
});

describe('create', () => {
  it('a teacher can create a link they host', async () => {
    await assertSucceeds(
      setDoc(ref(asStranger(), 'new-link'), {
        ...linkDoc({ hostUid: STRANGER_UID, updatedBy: STRANGER_UID }),
        participants: {},
      })
    );
  });

  it('cannot create a link for another host', async () => {
    await assertFails(
      setDoc(ref(asStranger(), 'new-link'), {
        ...linkDoc(),
        participants: {},
      })
    );
  });

  it('cannot create with members already in it', async () => {
    await assertFails(setDoc(ref(asHost(), 'new-link'), linkDoc()));
  });

  it('cannot create with an unknown mode', async () => {
    await assertFails(
      setDoc(ref(asHost(), 'new-link'), {
        ...linkDoc({ mode: 'copy' }),
        participants: {},
      })
    );
  });

  it('cannot create an already-ended link', async () => {
    await assertFails(
      setDoc(ref(asHost(), 'new-link'), {
        ...linkDoc({ ended: true }),
        participants: {},
      })
    );
  });

  it('cannot create with an empty name', async () => {
    await assertFails(
      setDoc(ref(asHost(), 'new-link'), {
        ...linkDoc({ name: '' }),
        participants: {},
      })
    );
  });

  it('cannot create with more than 200 boards', async () => {
    const boards = Array.from({ length: 201 }, (_, i) => ({
      shareId: `s${i}`,
      name: `B${i}`,
      order: i,
    }));
    await assertFails(
      setDoc(ref(asHost(), 'new-link'), {
        ...linkDoc({ boards }),
        participants: {},
      })
    );
  });

  it('an anonymous user cannot create one', async () => {
    await assertFails(
      setDoc(ref(asAnon(), 'new-link'), {
        ...linkDoc({ hostUid: 'anon-uid' }),
        participants: {},
      })
    );
  });
});

describe('host updates', () => {
  it('host can rename and change the board list', async () => {
    await assertSucceeds(
      updateDoc(ref(asHost(), SYNCED_ID), {
        name: 'Unit 3 (new)',
        boards: [],
        updatedAt: 2000,
      })
    );
  });

  it('host can remove a member', async () => {
    await assertSucceeds(
      updateDoc(ref(asHost(), SYNCED_ID), {
        [`participants.${COLLAB_UID}`]: deleteField(),
      })
    );
  });

  it('host can remove a member and keep them out', async () => {
    await assertSucceeds(
      updateDoc(ref(asHost(), SYNCED_ID), {
        [`participants.${COLLAB_UID}`]: deleteField(),
        [`removed.${COLLAB_UID}`]: 2000,
      })
    );
    await assertFails(
      updateDoc(ref(asCollab(), SYNCED_ID), {
        [`participants.${COLLAB_UID}`]: {
          role: 'collaborator',
          joinedAt: 3000,
        },
      })
    );
  });

  it('host cannot add a member', async () => {
    await assertFails(
      updateDoc(ref(asHost(), SYNCED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
      })
    );
  });

  it('host can end the share', async () => {
    await assertSucceeds(updateDoc(ref(asHost(), SYNCED_ID), { ended: true }));
  });

  it('host cannot reopen an ended link', async () => {
    await assertFails(updateDoc(ref(asHost(), ENDED_ID), { ended: false }));
  });

  it('host cannot change createdAt', async () => {
    await assertFails(updateDoc(ref(asHost(), SYNCED_ID), { createdAt: 5 }));
  });

  it('host cannot replace participants with a non-map', async () => {
    await assertFails(
      updateDoc(ref(asHost(), SYNCED_ID), { participants: ['x'] })
    );
  });

  it('host cannot change the mode', async () => {
    await assertFails(
      updateDoc(ref(asHost(), SYNCED_ID), { mode: 'view-only' })
    );
  });

  it('host cannot hand the link to someone else', async () => {
    await assertFails(
      updateDoc(ref(asHost(), SYNCED_ID), { hostUid: STRANGER_UID })
    );
  });
});

describe('collaborator updates', () => {
  it('a Synced collaborator can rename and change boards', async () => {
    await assertSucceeds(
      updateDoc(ref(asCollab(), SYNCED_ID), {
        name: 'Renamed',
        boards: [],
        updatedAt: 2000,
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('a collaborator must stamp themselves as updatedBy', async () => {
    await assertFails(
      updateDoc(ref(asCollab(), SYNCED_ID), {
        name: 'Renamed',
        updatedBy: HOST_UID,
      })
    );
  });

  it('a collaborator cannot end the share', async () => {
    await assertFails(
      updateDoc(ref(asCollab(), SYNCED_ID), {
        ended: true,
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('a collaborator cannot change members', async () => {
    await assertFails(
      updateDoc(ref(asCollab(), SYNCED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 1,
        },
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('a collaborator cannot change hostName', async () => {
    await assertFails(
      updateDoc(ref(asCollab(), SYNCED_ID), {
        hostName: 'Spoof',
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('a collaborator cannot edit an ended share', async () => {
    await assertFails(
      updateDoc(ref(asCollab(), ENDED_ID), {
        name: 'Renamed',
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('a collaborator-role entry on a View-Only link still cannot edit', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(ref(ctx.firestore(), VIEW_ID), {
        [`participants.${COLLAB_UID}`]: { role: 'collaborator', joinedAt: 1 },
      });
    });
    await assertFails(
      updateDoc(ref(asCollab(), VIEW_ID), {
        name: 'Renamed',
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('a viewer cannot edit', async () => {
    await assertFails(
      updateDoc(ref(asViewer(), VIEW_ID), {
        name: 'Renamed',
        updatedBy: VIEWER_UID,
      })
    );
  });

  it('a stranger cannot edit', async () => {
    await assertFails(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        name: 'Renamed',
        updatedBy: STRANGER_UID,
      })
    );
  });
});

describe('self-join and self-leave', () => {
  it('a teacher can join a Synced link as collaborator', async () => {
    await assertSucceeds(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          name: 'Stranger',
          joinedAt: 2000,
        },
      })
    );
  });

  it('a teacher can join a View-Only link as viewer', async () => {
    await assertSucceeds(
      updateDoc(ref(asStranger(), VIEW_ID), {
        [`participants.${STRANGER_UID}`]: { role: 'viewer', joinedAt: 2000 },
      })
    );
  });

  it('joining a View-Only link as collaborator is denied', async () => {
    await assertFails(
      updateDoc(ref(asStranger(), VIEW_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
      })
    );
  });

  it('joining with an extra field is denied', async () => {
    await assertFails(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
          admin: true,
        },
      })
    );
  });

  it('joining with a name over 100 characters is denied', async () => {
    await assertFails(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          name: 'x'.repeat(101),
          joinedAt: 2000,
        },
      })
    );
  });

  it('joining with a non-string name is denied', async () => {
    await assertFails(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          name: 42,
          joinedAt: 2000,
        },
      })
    );
  });

  it('joining a link that already has 50 members is denied', async () => {
    const participants = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [
        `member-${i}`,
        { role: 'collaborator', joinedAt: 1 },
      ])
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(ref(ctx.firestore(), SYNCED_ID), { participants });
    });
    await assertFails(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
      })
    );
  });

  it('joining with a non-number joinedAt is denied', async () => {
    await assertFails(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: ['x'.repeat(1000)],
        },
      })
    );
  });

  it('cannot add someone else', async () => {
    await assertFails(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        [`participants.other-uid`]: { role: 'collaborator', joinedAt: 2000 },
      })
    );
  });

  it('cannot change other fields while joining', async () => {
    await assertFails(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
        name: 'Hijacked',
      })
    );
  });

  it('cannot join an ended link', async () => {
    await assertFails(
      updateDoc(ref(asStranger(), ENDED_ID), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
      })
    );
  });

  it('an anonymous user cannot join', async () => {
    await assertFails(
      updateDoc(ref(asAnon(), SYNCED_ID), {
        [`participants.anon-uid`]: { role: 'collaborator', joinedAt: 2000 },
      })
    );
  });

  it('a member can leave', async () => {
    await assertSucceeds(
      updateDoc(ref(asCollab(), SYNCED_ID), {
        [`participants.${COLLAB_UID}`]: deleteField(),
      })
    );
  });

  it('a member can leave an ended link', async () => {
    await assertSucceeds(
      updateDoc(ref(asCollab(), ENDED_ID), {
        [`participants.${COLLAB_UID}`]: deleteField(),
      })
    );
  });

  it('a member cannot remove someone else', async () => {
    await assertFails(
      updateDoc(ref(asCollab(), SYNCED_ID), {
        [`participants.${COLLAB_UID}`]: deleteField(),
        [`participants.collab2-uid`]: deleteField(),
      })
    );
  });
});

describe('delete', () => {
  it('host can delete', async () => {
    await assertSucceeds(deleteDoc(ref(asHost(), SYNCED_ID)));
  });

  it('admin can delete', async () => {
    await assertSucceeds(deleteDoc(ref(asAdmin(), SYNCED_ID)));
  });

  it('a collaborator cannot delete', async () => {
    await assertFails(deleteDoc(ref(asCollab(), SYNCED_ID)));
  });
});

describe('shared_boards in a linked collection', () => {
  const BOARD_ID = 'board-added-by-collab';
  const boardDoc = (overrides: Record<string, unknown> = {}) => ({
    name: 'Day 2',
    widgets: [],
    sharedAt: 1000,
    originalAuthor: COLLAB_UID,
    intendedMode: 'synced',
    linkedCollectionId: SYNCED_ID,
    participants: {
      [HOST_UID]: { role: 'collaborator', joinedAt: 1000 },
      [VIEWER_UID]: { role: 'collaborator', joinedAt: 1000 },
    },
    updatedAt: 1000,
    updatedBy: COLLAB_UID,
    ...overrides,
  });
  const boardRef = (db: ReturnType<typeof asHost>) =>
    doc(db, `shared_boards/${BOARD_ID}`);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(boardRef(ctx.firestore()), boardDoc());
    });
  });

  it('the link host can end a board a collaborator added', async () => {
    await assertSucceeds(deleteDoc(boardRef(asHost())));
  });

  it('another member of the board cannot end it', async () => {
    await assertFails(deleteDoc(boardRef(asViewer())));
  });

  it('a teacher who hosts a different link cannot end it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'linked_collections/stranger-link'),
        linkDoc({ hostUid: STRANGER_UID })
      );
    });
    await assertFails(deleteDoc(boardRef(asStranger())));
  });

  it('the host cannot end a board whose author has left the link', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(ref(ctx.firestore(), SYNCED_ID), {
        [`participants.${COLLAB_UID}`]: deleteField(),
      });
    });
    await assertFails(deleteDoc(boardRef(asHost())));
  });

  it('re-creating an orphaned link id does not reach its boards', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(ref(ctx.firestore(), SYNCED_ID));
    });
    await assertSucceeds(
      setDoc(ref(asStranger(), SYNCED_ID), {
        ...linkDoc({ hostUid: STRANGER_UID, updatedBy: STRANGER_UID }),
        participants: {},
      })
    );
    await assertFails(
      updateDoc(ref(asStranger(), SYNCED_ID), {
        [`participants.${COLLAB_UID}`]: {
          role: 'collaborator',
          joinedAt: 1,
        },
      })
    );
    await assertFails(deleteDoc(boardRef(asStranger())));
  });

  it('a collaborator cannot repoint the board at a link they host', async () => {
    await assertFails(
      updateDoc(boardRef(asViewer()), {
        linkedCollectionId: 'viewer-hosted-link',
        updatedBy: VIEWER_UID,
      })
    );
  });

  it('a collaborator can still edit the board content', async () => {
    await assertSucceeds(
      updateDoc(boardRef(asViewer()), {
        name: 'Day 2 (edited)',
        updatedAt: 2000,
        updatedBy: VIEWER_UID,
      })
    );
  });
});

// Slice 3: the recipient's reads and writes when opening /share/collection/{linkId}.
describe('import flow', () => {
  const SYNC_BOARD = 'import-synced-board';
  const VIEW_BOARD = 'import-view-board';
  const board = (mode: string, linkId: string) => ({
    name: 'Day 1',
    widgets: [],
    sharedAt: 1000,
    originalAuthor: HOST_UID,
    intendedMode: mode,
    linkedCollectionId: linkId,
    participants: {},
    updatedAt: 1000,
    updatedBy: HOST_UID,
  });
  const boardRef = (db: ReturnType<typeof asHost>, id: string) =>
    doc(db, `shared_boards/${id}`);
  const joinAs = (uid: string, role: string) => ({
    [`participants.${uid}`]: { role, name: 'Me', joinedAt: 2000 },
  });

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(boardRef(db, SYNC_BOARD), board('synced', SYNCED_ID));
      await setDoc(boardRef(db, VIEW_BOARD), board('view-only', VIEW_ID));
    });
  });

  it('a teacher reads the link and its board, joins both, then edits the board', async () => {
    const db = asStranger();
    await assertSucceeds(getDoc(ref(db, SYNCED_ID)));
    await assertSucceeds(getDoc(boardRef(db, SYNC_BOARD)));
    await assertSucceeds(
      updateDoc(ref(db, SYNCED_ID), joinAs(STRANGER_UID, 'collaborator'))
    );
    await assertSucceeds(
      updateDoc(boardRef(db, SYNC_BOARD), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
      })
    );
    await assertSucceeds(
      updateDoc(boardRef(db, SYNC_BOARD), {
        name: 'Day 1 (edited)',
        updatedAt: 3000,
        updatedBy: STRANGER_UID,
      })
    );
  });

  it('a View-Only recipient joins as viewer and cannot edit the board', async () => {
    const db = asStranger();
    await assertSucceeds(
      updateDoc(ref(db, VIEW_ID), joinAs(STRANGER_UID, 'viewer'))
    );
    await assertSucceeds(
      updateDoc(boardRef(db, VIEW_BOARD), {
        [`participants.${STRANGER_UID}`]: { role: 'viewer', joinedAt: 2000 },
      })
    );
    await assertFails(
      updateDoc(boardRef(db, VIEW_BOARD), {
        name: 'Changed',
        updatedAt: 3000,
        updatedBy: STRANGER_UID,
      })
    );
  });

  it('a removed member cannot join again', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(ref(ctx.firestore(), SYNCED_ID), {
        removed: { [STRANGER_UID]: 1500 },
      });
    });
    await assertFails(
      updateDoc(
        ref(asStranger(), SYNCED_ID),
        joinAs(STRANGER_UID, 'collaborator')
      )
    );
  });

  it('a student cannot read the board list or the link', async () => {
    await assertFails(getDoc(ref(asStudent(), SYNCED_ID)));
    await assertFails(getDoc(ref(asAnon(), SYNCED_ID)));
  });
});
