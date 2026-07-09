// Regression test for a multi-tenant data leak in AnnouncementOverlay.tsx's
// "PATH B" listener query (used whenever orgId hasn't resolved to a non-null
// org — including the PERMANENT state of an internal-tier user with no
// `/organizations/{orgId}/members/{email}` doc, not just a brief loading
// window).
//
// The old query — where('isActive','==',true), no orgId filter — was assumed
// to be protected by the firestore.rules read rule's isOrgMember(resource.data
// .orgId) branch. Confirmed against the REAL Firestore emulator that this is
// false: a security rule's per-document branches are only enforced for a list
// query when the query's own where() clauses structurally pin the field the
// rule depends on. Without that, Firestore returns every isActive doc,
// including another org's — even though a direct getDoc() on that same
// document is correctly denied by the identical rule. See AnnouncementOverlay
// .tsx's PATH B comment for the fix: where('orgId','==',null), a filter
// Firestore CAN prove safe.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  doc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-rules-test-announcements';
const ORONO = 'orono';
const OTHER = 'other-org';

const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'teacher@orono.k12.mn.us';

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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${ORONO}/members/${MEMBER_EMAIL}`), {
      email: MEMBER_EMAIL,
      orgId: ORONO,
      roleId: 'teacher',
      status: 'active',
    });
    // Legacy pre-isolation doc: no orgId field at all.
    await setDoc(doc(db, 'announcements/legacy'), {
      title: 'legacy',
      isActive: true,
    });
    // Explicitly orgId:null doc — the shape the fixed query targets.
    await setDoc(doc(db, 'announcements/explicit-null-org'), {
      title: 'explicit null org',
      isActive: true,
      orgId: null,
    });
    // Another org's active announcement — must never reach an orono caller.
    await setDoc(doc(db, 'announcements/other-org-active'), {
      title: 'other org',
      isActive: true,
      orgId: OTHER,
    });
  });
});

const asMember = () =>
  testEnv.authenticatedContext(MEMBER_UID, { email: MEMBER_EMAIL }).firestore();

describe('announcements list-query tenant isolation', () => {
  it('sanity: a direct getDoc on the foreign-org doc is correctly denied by the rule', async () => {
    const db = asMember();
    await assertFails(getDoc(doc(db, 'announcements/other-org-active')));
  });

  // Intentional: this asserts the OLD unscoped query SUCCEEDS and returns a foreign-org doc — Firestore does not apply resource.data-dependent rule branches as a per-doc filter for list queries (see Firebase "Secure query" / rules-are-not-filters docs). If the rules are ever tightened to block this at the rules layer, this test will fail by design, signalling the fix's rationale changed — not a regression.
  it('LEAK (documents the Firestore quirk the fix works around): an unscoped isActive query returns a foreign-org doc the rule denies directly', async () => {
    const db = asMember();
    const q = query(
      collection(db, 'announcements'),
      where('isActive', '==', true)
    );
    const snap = await assertSucceeds(getDocs(q));
    const ids = snap.docs.map((d) => d.id).sort();
    expect(ids).toContain('other-org-active');
  });

  it('FIX: where(orgId==null) — the query AnnouncementOverlay now uses — excludes the foreign-org doc', async () => {
    const db = asMember();
    const q = query(
      collection(db, 'announcements'),
      where('orgId', '==', null)
    );
    const snap = await assertSucceeds(getDocs(q));
    const ids = snap.docs.map((d) => d.id).sort();
    expect(ids).toEqual(['explicit-null-org']);
  });

  it('Path A: where(orgId==orono) run by an org member returns only that org and excludes the foreign doc', async () => {
    const db = asMember();
    const q = query(
      collection(db, 'announcements'),
      where('orgId', '==', ORONO)
    );
    const snap = await assertSucceeds(getDocs(q));
    const ids = snap.docs.map((d) => d.id).sort();
    expect(ids).toEqual([]);
    expect(ids).not.toContain('other-org-active');
  });
});
