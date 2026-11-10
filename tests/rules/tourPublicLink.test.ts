// Firestore rules for public tour links (TOURS_10X.md S6, ADR 0003): the record that makes a tour public sits under
// admin_settings/{document=**}, so only admins switch a tour public, whoever authored it. Run via `pnpm run test:rules`.

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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-tour-public-link';
const ADMIN_EMAIL = 'admin@example.com';
const LINKS = 'admin_settings/tour_public_links/tours';
const LINK = `${LINKS}/set-1`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAdmin = (verified = true) =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: verified,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext('teacher-uid', {
      email: 'teacher@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asAnon = () =>
  testEnv
    .authenticatedContext('anon-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asSignedOut = () => testEnv.unauthenticatedContext().firestore();

const record = (fingerprint = 'v1\nw web_tour_pictures/set-1/a.png ') => ({
  token: '0123456789abcdef0123456789abcdef',
  fingerprint,
  kind: 'web',
  confirmedBy: ADMIN_EMAIL,
  confirmedAt: 1,
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
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), { addedAt: 1 });
  });
});

describe('public tour link record', () => {
  it('lets an admin switch a tour public, re-confirm it and switch it off', async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), LINK), record()));
    await assertSucceeds(getDoc(doc(asAdmin(), LINK)));
    await assertSucceeds(setDoc(doc(asAdmin(), LINK), record('v1\nw other')));
    await assertSucceeds(deleteDoc(doc(asAdmin(), LINK)));
  });

  it('never lets a non-admin switch a tour public, even one they wrote', async () => {
    for (const db of [asTeacher(), asAnon(), asSignedOut(), asAdmin(false)]) {
      await assertFails(setDoc(doc(db, LINK), record()));
      await assertFails(
        setDoc(doc(db, 'admin_settings/tour_public_links'), { on: true })
      );
    }
  });

  it('never lets a non-admin re-confirm, move or clear a public link, or read its token', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), LINK), {
        ...record(),
        off: { reason: 'pictures', at: 2 },
      });
    });
    for (const db of [asTeacher(), asAnon(), asSignedOut()]) {
      await assertFails(
        updateDoc(doc(db, LINK), { off: null, fingerprint: 'v1\nw new' })
      );
      await assertFails(deleteDoc(doc(db, LINK)));
      await assertFails(getDoc(doc(db, LINK)));
      await assertFails(
        getDocs(
          query(collection(db, LINKS), where('token', '==', record().token))
        )
      );
    }
  });
});
