// Firestore and Storage security-rules regression for the Schoology quiz import inbox (docs/plans/shipped/SCHOOLOGY_QUIZ_IMPORT.md Q8).
// Requires the Firestore and Storage emulators: `pnpm run test:rules`.

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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'spartboard-schoology-import';
const OWNER_UID = 'sgy-owner';
const OTHER_UID = 'sgy-other';
const INBOX = `users/${OWNER_UID}/schoology_import_inbox`;
const ITEM = `${INBOX}/testQuiz_8629405092`;
const PICTURE = `schoology_import/${OWNER_UID}/testQuiz_8629405092/send-1/0`;
const FIRESTORE_RULES = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);
const STORAGE_RULES = fileURLToPath(
  new URL('../../storage.rules', import.meta.url)
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
const asAnonymousOwner = () =>
  testEnv.authenticatedContext(OWNER_UID, {
    firebase: { sign_in_provider: 'anonymous' },
  });
const asUnauth = () => testEnv.unauthenticatedContext();

const pictureBytes = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(FIRESTORE_RULES, 'utf8'),
      ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080),
    },
    storage: {
      rules: readFileSync(STORAGE_RULES, 'utf8'),
      ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ITEM), { questionCount: 1 });
    await uploadBytes(ref(ctx.storage(), PICTURE), pictureBytes(), {
      contentType: 'image/png',
    });
  });
});

describe('Schoology import inbox', () => {
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
    const other = `${INBOX}/assessment_1`;
    await assertFails(
      setDoc(doc(asTeacher(OWNER_UID).firestore(), other), { questionCount: 1 })
    );
    await assertFails(
      setDoc(doc(asTeacher(OTHER_UID).firestore(), other), { questionCount: 1 })
    );
    await assertFails(
      updateDoc(doc(asTeacher(OWNER_UID).firestore(), ITEM), {
        questionCount: 2,
      })
    );
  });
});

describe('Schoology import pictures', () => {
  it('lets only the owning teacher read a picture', async () => {
    await assertSucceeds(
      getBytes(ref(asTeacher(OWNER_UID).storage(), PICTURE))
    );
    await assertFails(getBytes(ref(asTeacher(OTHER_UID).storage(), PICTURE)));
    await assertFails(getBytes(ref(asStudentRoleOwner().storage(), PICTURE)));
    await assertFails(getBytes(ref(asAnonymousOwner().storage(), PICTURE)));
    await assertFails(getBytes(ref(asUnauth().storage(), PICTURE)));
  });

  it('never lets a client write or delete a picture', async () => {
    const other = `schoology_import/${OWNER_UID}/testQuiz_1/send-2/0`;
    await assertFails(
      uploadBytes(ref(asTeacher(OWNER_UID).storage(), other), pictureBytes(), {
        contentType: 'image/png',
      })
    );
    await assertFails(
      deleteObject(ref(asTeacher(OWNER_UID).storage(), PICTURE))
    );
  });
});
