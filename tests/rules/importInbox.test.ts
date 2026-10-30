// Firestore security-rules regression for the Import inbox and the reader-failure log (docs/plans/IMPORT.md D14, D18).
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-import-inbox';
const OWNER_UID = 'imp-owner';
const OTHER_UID = 'imp-other';
const ADMIN_UID = 'imp-admin';
const ADMIN_EMAIL = `${ADMIN_UID}@example.com`;
const INBOX = `users/${OWNER_UID}/import_inbox`;
const ITEM = `${INBOX}/abc123`;
const FAILURES = 'import_reader_failures';
const FAILURE = `${FAILURES}/f1`;
const FIRESTORE_RULES = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const hostPort = (envValue: string | undefined, fallbackPort: number) => {
  const [host, port] = envValue ? envValue.split(':') : [];
  return {
    host: host || '127.0.0.1',
    port: port ? Number(port) : fallbackPort,
  };
};

const teacherToken = (uid: string): TokenOptions => ({
  email: `${uid}@example.com`,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
});

const asTeacher = (uid: string) =>
  testEnv.authenticatedContext(uid, teacherToken(uid));
const asStudentRoleOwner = () =>
  testEnv.authenticatedContext(OWNER_UID, {
    ...teacherToken(OWNER_UID),
    studentRole: true,
  });
const asUnverifiedAdmin = () =>
  testEnv.authenticatedContext(ADMIN_UID, {
    ...teacherToken(ADMIN_UID),
    email_verified: false,
  });
const asUnauth = () => testEnv.unauthenticatedContext();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(FIRESTORE_RULES, 'utf8'),
      ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ITEM), { url: 'https://a.example/' });
    await setDoc(doc(ctx.firestore(), FAILURE), { platform: 'schoology' });
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {});
  });
});

describe('Import inbox', () => {
  it('lets only the owner read an item', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(OWNER_UID).firestore(), ITEM)));
    await assertFails(getDoc(doc(asTeacher(OTHER_UID).firestore(), ITEM)));
    await assertFails(getDoc(doc(asStudentRoleOwner().firestore(), ITEM)));
    await assertFails(getDoc(doc(asUnauth().firestore(), ITEM)));
  });

  it('lets only the owner list the inbox', async () => {
    await assertSucceeds(
      getDocs(collection(asTeacher(OWNER_UID).firestore(), INBOX))
    );
    await assertFails(
      getDocs(collection(asTeacher(OTHER_UID).firestore(), INBOX))
    );
    await assertFails(getDocs(collection(asUnauth().firestore(), INBOX)));
  });

  it('lets only the owner delete an item', async () => {
    await assertFails(deleteDoc(doc(asTeacher(OTHER_UID).firestore(), ITEM)));
    await assertFails(deleteDoc(doc(asStudentRoleOwner().firestore(), ITEM)));
    await assertFails(deleteDoc(doc(asUnauth().firestore(), ITEM)));
    await assertSucceeds(
      deleteDoc(doc(asTeacher(OWNER_UID).firestore(), ITEM))
    );
  });

  it('never lets a client create or change an item', async () => {
    await assertFails(
      setDoc(doc(asTeacher(OWNER_UID).firestore(), `${INBOX}/new`), {
        url: 'https://a.example/',
      })
    );
    await assertFails(
      setDoc(doc(asTeacher(OTHER_UID).firestore(), `${INBOX}/new`), {
        url: 'https://a.example/',
      })
    );
    await assertFails(
      updateDoc(doc(asTeacher(OWNER_UID).firestore(), ITEM), { title: 'x' })
    );
  });
});

describe('Import reader failures', () => {
  it('lets only a verified admin read or list them', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacher(ADMIN_UID).firestore(), FAILURE))
    );
    await assertSucceeds(
      getDocs(collection(asTeacher(ADMIN_UID).firestore(), FAILURES))
    );
    await assertFails(getDoc(doc(asTeacher(OWNER_UID).firestore(), FAILURE)));
    await assertFails(
      getDocs(collection(asTeacher(OWNER_UID).firestore(), FAILURES))
    );
    await assertFails(getDoc(doc(asUnverifiedAdmin().firestore(), FAILURE)));
    await assertFails(getDoc(doc(asUnauth().firestore(), FAILURE)));
  });

  it('never lets a client write one, admins included', async () => {
    await assertFails(
      addDoc(collection(asTeacher(OWNER_UID).firestore(), FAILURES), {
        platform: 'x',
      })
    );
    await assertFails(
      addDoc(collection(asTeacher(ADMIN_UID).firestore(), FAILURES), {
        platform: 'x',
      })
    );
    await assertFails(
      updateDoc(doc(asTeacher(ADMIN_UID).firestore(), FAILURE), {
        platform: 'y',
      })
    );
    await assertFails(
      deleteDoc(doc(asTeacher(ADMIN_UID).firestore(), FAILURE))
    );
  });
});
