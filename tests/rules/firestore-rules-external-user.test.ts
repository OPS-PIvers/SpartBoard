// Firestore security-rules tests for the no-org (external) user persona.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules
// which wraps this file in `firebase emulators:exec --only firestore`.
//
// Background — external-availability rollout (work item W9):
// The app is opening up beyond Orono. A signed-in Google user whose email
// domain maps to NO organization resolves, in the client, to userTier 'free'
// with orgId === null. From the security-rules' point of view this person is
// simply an authenticated user who is NOT a member of any org (no
// `/organizations/{orgId}/members/{email}` doc exists for them) and is neither
// an admin nor a super admin. There is no separate "external" flag in the
// rules — `isOrgMember()` only checks for the existence of a member doc — so
// this persona is the absence of membership, full stop.
//
// HARD CONSTRAINT (unchanged for Orono): existing org/internal users must see
// ZERO behavior change. This suite is purely additive — it pins down what the
// no-org persona CAN and CANNOT do without touching the rules themselves.
//
// Covers, for a signed-in user whose email domain maps to no org:
//   - CAN CRUD their OWN /users/{uid}/** subcollections (dashboards, rosters,
//     quizzes, notebooks, …).
//   - CAN read the global/shared catalogs the app reads for everyone
//     (feature_permissions, global_permissions, instructional_routines,
//     dashboard_templates, global_video_activities, global_pdfs,
//     global_mini_apps, a public custom_widget, and getById on
//     shared_quizzes / shared_assignments / synced_quizzes).
//   - CANNOT read another org's /organizations/** subtree (members, buildings,
//     domains, invitations) — EXCEPT the own-absent-member self-probe, which
//     mirrors the existing organizations suite (useAuth bootstraps with it).
//   - Announcements: CAN read a legacy announcement with NO orgId; CANNOT read
//     an announcement whose orgId belongs to an org they're not in; a member
//     of that org CAN.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, deleteDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-rules-test';
const ORG_ID = 'orono';

// The external persona: a signed-in Google user whose email domain maps to NO
// organization. They have no member doc anywhere, are not an admin, and are
// not a super admin → the client resolves them to orgId=null / tier 'free'.
const EXTERNAL_UID = 'external-uid';
const EXTERNAL_EMAIL = 'teacher@noorg.example.com';

// An org member of `orono`, used to contrast announcement visibility.
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'paul.ivers@orono.k12.mn.us';

// ESM-safe path resolution — the repo is `"type": "module"`, so __dirname is
// not defined and we locate firestore.rules via import.meta.url instead.
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

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

  // Seed everything the read-path assertions depend on using a privileged
  // (rules-disabled) context: an org with one member, the global/shared
  // catalogs, and three announcement variants.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // --- Org `orono` with a single member (NOT the external user). ---
    await setDoc(doc(db, `organizations/${ORG_ID}`), {
      id: ORG_ID,
      name: 'Orono',
      plan: 'full',
      aiEnabled: true,
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`), {
      email: MEMBER_EMAIL,
      orgId: ORG_ID,
      roleId: 'teacher',
      status: 'active',
      buildingIds: ['high'],
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/buildings/high`), {
      id: 'high',
      orgId: ORG_ID,
      name: 'Orono High',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/domains/primary`), {
      id: 'primary',
      orgId: ORG_ID,
      domain: '@orono.k12.mn.us',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/invitations/token-1`), {
      email: 'invitee@orono.k12.mn.us',
      orgId: ORG_ID,
    });

    // --- Global / shared catalogs the app reads for everyone. ---
    await setDoc(doc(db, 'feature_permissions/time-tool'), {
      accessLevel: 'public',
      enabled: true,
    });
    await setDoc(doc(db, 'global_permissions/some-feature'), {
      enabled: true,
    });
    await setDoc(doc(db, 'instructional_routines/routine-1'), {
      name: 'Think-Pair-Share',
    });
    await setDoc(doc(db, 'dashboard_templates/template-1'), {
      name: 'Morning Meeting',
    });
    await setDoc(doc(db, 'global_video_activities/activity-1'), {
      title: 'Photosynthesis',
    });
    await setDoc(doc(db, 'global_pdfs/pdf-1'), {
      title: 'Lab Safety',
    });
    await setDoc(doc(db, 'global_mini_apps/app-1'), {
      title: 'Fraction Tiles',
    });
    // custom_widgets read is conditional: published + enabled + public.
    await setDoc(doc(db, 'custom_widgets/widget-1'), {
      published: true,
      enabled: true,
      accessLevel: 'public',
      betaUsers: [],
    });
    // share/synced catalogs expose a per-id `get` (not `list`); seed one of each.
    await setDoc(doc(db, 'shared_quizzes/share-1'), {
      originalAuthor: 'some-author-uid',
      title: 'Shared Quiz',
    });
    await setDoc(doc(db, 'shared_assignments/share-2'), {
      originalAuthor: 'some-author-uid',
      title: 'Shared Assignment',
    });
    await setDoc(doc(db, 'synced_quizzes/group-1'), {
      id: 'group-1',
      version: 1,
      title: 'Synced Quiz',
      questions: [],
      participants: { 'some-author-uid': { joinedAt: 0 } },
      updatedBy: 'some-author-uid',
    });

    // --- Announcements: three visibility variants. ---
    // Legacy doc (no orgId) — readable by ANY authenticated user.
    await setDoc(doc(db, 'announcements/legacy'), {
      title: 'Legacy announcement',
      body: 'No orgId field — predates tenant isolation.',
    });
    // Org-scoped doc — readable only by a member of `orono` (or an admin).
    await setDoc(doc(db, 'announcements/orono-scoped'), {
      title: 'Orono only',
      body: 'Scoped to the orono org.',
      orgId: ORG_ID,
    });
  });
});

const asExternal = () =>
  testEnv
    .authenticatedContext(EXTERNAL_UID, { email: EXTERNAL_EMAIL })
    .firestore();
const asMember = () =>
  testEnv.authenticatedContext(MEMBER_UID, { email: MEMBER_EMAIL }).firestore();

// Path to the external user's own user-scoped subtree.
const ownDoc = (db: ReturnType<typeof asExternal>, subpath: string) =>
  doc(db, `users/${EXTERNAL_UID}/${subpath}`);

describe('external (no-org) user — owns their /users/{uid}/** subtree', () => {
  it('can create, read, update, and delete their own dashboard', async () => {
    const db = asExternal();
    const ref = ownDoc(db, 'dashboards/dash-1');
    await assertSucceeds(
      setDoc(ref, { id: 'dash-1', name: 'My Board', widgets: [] })
    );
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { name: 'Renamed' }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('can CRUD their own rosters', async () => {
    const db = asExternal();
    const ref = ownDoc(db, 'rosters/roster-1');
    await assertSucceeds(setDoc(ref, { id: 'roster-1', name: 'Period 1' }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it('can CRUD their own quizzes', async () => {
    const db = asExternal();
    const ref = ownDoc(db, 'quizzes/quiz-1');
    await assertSucceeds(setDoc(ref, { id: 'quiz-1', title: 'Pop Quiz' }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it('can CRUD their own notebooks', async () => {
    const db = asExternal();
    const ref = ownDoc(db, 'notebooks/note-1');
    await assertSucceeds(setDoc(ref, { id: 'note-1', title: 'Notes' }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it("cannot read or write ANOTHER user's /users/{uid}/** subtree", async () => {
    const db = asExternal();
    await assertFails(
      getDoc(doc(db, `users/${MEMBER_UID}/dashboards/their-dash`))
    );
    await assertFails(
      setDoc(doc(db, `users/${MEMBER_UID}/dashboards/their-dash`), {
        id: 'their-dash',
        name: 'Hijack',
        widgets: [],
      })
    );
  });
});

describe('external (no-org) user — reads global/shared catalogs', () => {
  it('can read feature_permissions and global_permissions', async () => {
    const db = asExternal();
    await assertSucceeds(getDoc(doc(db, 'feature_permissions/time-tool')));
    await assertSucceeds(getDoc(doc(db, 'global_permissions/some-feature')));
  });

  it('can read instructional_routines and dashboard_templates', async () => {
    const db = asExternal();
    await assertSucceeds(getDoc(doc(db, 'instructional_routines/routine-1')));
    await assertSucceeds(getDoc(doc(db, 'dashboard_templates/template-1')));
  });

  it('can read the global video-activity / pdf / mini-app libraries', async () => {
    const db = asExternal();
    await assertSucceeds(getDoc(doc(db, 'global_video_activities/activity-1')));
    await assertSucceeds(getDoc(doc(db, 'global_pdfs/pdf-1')));
    await assertSucceeds(getDoc(doc(db, 'global_mini_apps/app-1')));
  });

  it('can read a published+enabled+public custom widget', async () => {
    await assertSucceeds(getDoc(doc(asExternal(), 'custom_widgets/widget-1')));
  });

  it('can get-by-id shared_quizzes, shared_assignments, and synced_quizzes', async () => {
    const db = asExternal();
    await assertSucceeds(getDoc(doc(db, 'shared_quizzes/share-1')));
    await assertSucceeds(getDoc(doc(db, 'shared_assignments/share-2')));
    await assertSucceeds(getDoc(doc(db, 'synced_quizzes/group-1')));
  });

  it('cannot WRITE to any admin-owned global catalog', async () => {
    const db = asExternal();
    await assertFails(
      setDoc(doc(db, 'feature_permissions/time-tool'), {
        accessLevel: 'admin',
        enabled: false,
      })
    );
    await assertFails(
      setDoc(doc(db, 'instructional_routines/sneaky'), { name: 'Nope' })
    );
    await assertFails(
      setDoc(doc(db, 'dashboard_templates/sneaky'), { name: 'Nope' })
    );
  });
});

describe("external (no-org) user — cannot read another org's subtree", () => {
  it('cannot read the org doc', async () => {
    await assertFails(getDoc(doc(asExternal(), `organizations/${ORG_ID}`)));
  });

  it('cannot read org buildings, domains, or roles', async () => {
    const db = asExternal();
    await assertFails(
      getDoc(doc(db, `organizations/${ORG_ID}/buildings/high`))
    );
    await assertFails(
      getDoc(doc(db, `organizations/${ORG_ID}/domains/primary`))
    );
  });

  it("cannot read another user's member doc", async () => {
    await assertFails(
      getDoc(
        doc(asExternal(), `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`)
      )
    );
  });

  it('cannot read org invitations (Cloud-Function-only collection)', async () => {
    await assertFails(
      getDoc(doc(asExternal(), `organizations/${ORG_ID}/invitations/token-1`))
    );
  });

  it('CAN read their own (absent) member doc to bootstrap useAuth', async () => {
    // Mirrors the organizations suite: the self-probe branch lets a non-member
    // read members/{their-own-email} (which does not exist) so useAuth can
    // resolve them to orgId=null rather than hard-failing on a denied read.
    await assertSucceeds(
      getDoc(
        doc(
          asExternal(),
          `organizations/${ORG_ID}/members/${EXTERNAL_EMAIL.toLowerCase()}`
        )
      )
    );
  });
});

describe('external (no-org) user — announcement tenant scoping', () => {
  it('CAN read a legacy announcement with no orgId', async () => {
    await assertSucceeds(getDoc(doc(asExternal(), 'announcements/legacy')));
  });

  it("CANNOT read an announcement scoped to an org they're not in", async () => {
    await assertFails(getDoc(doc(asExternal(), 'announcements/orono-scoped')));
  });

  it('a member of that org CAN read the org-scoped announcement', async () => {
    await assertSucceeds(getDoc(doc(asMember(), 'announcements/orono-scoped')));
  });

  it('the org member can also read the legacy announcement', async () => {
    // Sanity: legacy docs stay readable for everyone, member included.
    await assertSucceeds(getDoc(doc(asMember(), 'announcements/legacy')));
  });

  it('the external user cannot write announcements (admin-only)', async () => {
    await assertFails(
      setDoc(doc(asExternal(), 'announcements/spoof'), {
        title: 'Spoof',
        body: 'nope',
      })
    );
  });
});
