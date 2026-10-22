// Rules for web tours (docs/plans/CHROME_EXTENSION.md T6): admin-only drafts at building_web_tours,
// web snapshots in building_guided_learning_tours for district staff only, and staff-only pictures.
//
// Requires the Firestore and Storage emulators. Invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
  type RulesTestContext,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'spartboard-web-tours-rules-test';
const ADMIN_EMAIL = 'admin@orono.k12.mn.us';
const DRAFTS = 'building_web_tours';
const TOURS = 'building_guided_learning_tours';

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

const google = (email: string, verified = true): TokenOptions => ({
  email,
  email_verified: verified,
  firebase: { sign_in_provider: 'google.com' },
});

const asAdmin = () =>
  testEnv.authenticatedContext('admin-uid', google(ADMIN_EMAIL));
const asStaff = () =>
  testEnv.authenticatedContext('staff-uid', google('teacher@orono.k12.mn.us'));
const asOutsideTeacher = () =>
  testEnv.authenticatedContext('outside-uid', google('teacher@example.com'));
const asUnverifiedStaff = () =>
  testEnv.authenticatedContext('unverified-uid', {
    email: 'teacher@orono.k12.mn.us',
    email_verified: false,
    firebase: { sign_in_provider: 'password' },
  });
const asStudentGoogle = () =>
  testEnv.authenticatedContext(
    'student-google-uid',
    google('kid@students.orono.k12.mn.us')
  );
const asAnon = () =>
  testEnv.authenticatedContext('anon-uid', {
    firebase: { sign_in_provider: 'anonymous' },
  });
const asStudentRole = () =>
  testEnv.authenticatedContext('sso-student-uid', {
    studentRole: true,
    classIds: ['class-1'],
    firebase: { sign_in_provider: 'custom' },
  });
const asSignedOut = () => testEnv.unauthenticatedContext();

const notStaff = (): RulesTestContext[] => [
  asOutsideTeacher(),
  asUnverifiedStaff(),
  asStudentGoogle(),
  asAnon(),
  asStudentRole(),
  asSignedOut(),
];

const draft = { id: 'w1', title: 'Gradebook', mode: 'tour', surface: 'web' };
const webSnapshot = {
  set: { id: 'w1', title: 'Gradebook', steps: [], surface: 'web' },
  surface: 'web',
  publishedAt: 1,
  publishedBy: 'admin-uid',
};
const boardSnapshot = {
  set: { id: 's1', title: 'Boards', steps: [] },
  publishedAt: 1,
  publishedBy: 'admin-uid',
};

const picture = (setId = 'w1', name = 'p1.png') =>
  `web_tour_pictures/${setId}/${name}`;
const upload = (ctx: RulesTestContext, path: string) =>
  uploadBytes(ref(ctx.storage(), path), new Uint8Array(64), {
    contentType: 'image/png',
  });

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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { addedAt: 1 });
    await setDoc(doc(db, `${DRAFTS}/w1`), draft);
    await setDoc(doc(db, `${TOURS}/w1`), webSnapshot);
    await setDoc(doc(db, `${TOURS}/s1`), boardSnapshot);
    await setDoc(doc(db, `${TOURS}/_meta`), { seededAt: 1 });
    await uploadBytes(ref(ctx.storage(), picture()), new Uint8Array(64), {
      contentType: 'image/png',
    });
  });
});

describe('building_web_tours drafts', () => {
  it('lets an admin read, list, write and delete a draft', async () => {
    const db = asAdmin().firestore();
    await assertSucceeds(getDoc(doc(db, `${DRAFTS}/w1`)));
    await assertSucceeds(getDocs(collection(db, DRAFTS)));
    await assertSucceeds(setDoc(doc(db, `${DRAFTS}/w2`), draft));
    await assertSucceeds(deleteDoc(doc(db, `${DRAFTS}/w1`)));
  });

  it('denies district staff who are not admins', async () => {
    const db = asStaff().firestore();
    await assertFails(getDoc(doc(db, `${DRAFTS}/w1`)));
    await assertFails(getDocs(collection(db, DRAFTS)));
    await assertFails(setDoc(doc(db, `${DRAFTS}/w2`), draft));
    await assertFails(deleteDoc(doc(db, `${DRAFTS}/w1`)));
  });

  it('denies students, anonymous sessions and signed-out users', async () => {
    for (const ctx of notStaff()) {
      const db = ctx.firestore();
      await assertFails(getDoc(doc(db, `${DRAFTS}/w1`)));
      await assertFails(getDoc(doc(db, `${DRAFTS}/missing`)));
      await assertFails(setDoc(doc(db, `${DRAFTS}/w2`), draft));
    }
  });
});

describe('web tour snapshots', () => {
  it('lets district staff read a web snapshot', async () => {
    await assertSucceeds(getDoc(doc(asStaff().firestore(), `${TOURS}/w1`)));
    await assertSucceeds(getDoc(doc(asAdmin().firestore(), `${TOURS}/w1`)));
  });

  it('denies a web snapshot to every account that is not verified district staff', async () => {
    for (const ctx of notStaff()) {
      await assertFails(getDoc(doc(ctx.firestore(), `${TOURS}/w1`)));
    }
  });

  it('keeps a missing doc and _meta readable for staff', async () => {
    for (const ctx of [asStaff(), asOutsideTeacher()]) {
      const db = ctx.firestore();
      await assertSucceeds(getDoc(doc(db, `${TOURS}/never-published`)));
      await assertSucceeds(getDoc(doc(db, `${TOURS}/_meta`)));
    }
  });

  it('keeps a SpartBoard snapshot readable for a non-district staff account', async () => {
    await assertSucceeds(
      getDoc(doc(asOutsideTeacher().firestore(), `${TOURS}/s1`))
    );
  });

  it('lets district staff list snapshots and denies the list to others', async () => {
    await assertSucceeds(getDocs(collection(asStaff().firestore(), TOURS)));
    await assertFails(
      getDocs(collection(asOutsideTeacher().firestore(), TOURS))
    );
    for (const ctx of [asStudentGoogle(), asAnon(), asStudentRole()]) {
      await assertFails(getDocs(collection(ctx.firestore(), TOURS)));
    }
  });

  it('lets only admins publish or remove a web snapshot', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin().firestore(), `${TOURS}/w2`), webSnapshot)
    );
    for (const ctx of [asStaff(), ...notStaff()]) {
      const db = ctx.firestore();
      await assertFails(setDoc(doc(db, `${TOURS}/w3`), webSnapshot));
      await assertFails(
        setDoc(doc(db, `${TOURS}/s1`), { ...boardSnapshot, surface: 'web' })
      );
      await assertFails(deleteDoc(doc(db, `${TOURS}/w1`)));
    }
    await assertSucceeds(deleteDoc(doc(asAdmin().firestore(), `${TOURS}/w1`)));
  });

  it('never lets a republish change surface', async () => {
    const db = asAdmin().firestore();
    await assertSucceeds(
      setDoc(doc(db, `${TOURS}/w1`), { ...webSnapshot, publishedAt: 2 })
    );
    await assertFails(setDoc(doc(db, `${TOURS}/w1`), boardSnapshot));
    await assertFails(
      setDoc(doc(db, `${TOURS}/s1`), { ...boardSnapshot, surface: 'web' })
    );
    await assertSucceeds(
      setDoc(doc(db, `${TOURS}/s1`), { ...boardSnapshot, publishedAt: 2 })
    );
  });

  it('hides a snapshot with any surface other than spartboard from non-district accounts', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${TOURS}/odd`), {
        ...boardSnapshot,
        surface: 'other',
      });
    });
    await assertFails(
      getDoc(doc(asOutsideTeacher().firestore(), `${TOURS}/odd`))
    );
    await assertSucceeds(getDoc(doc(asStaff().firestore(), `${TOURS}/odd`)));
  });
});

describe('web_tour_pictures storage', () => {
  it('lets district staff and admins get a picture', async () => {
    await assertSucceeds(getBytes(ref(asStaff().storage(), picture())));
    await assertSucceeds(getBytes(ref(asAdmin().storage(), picture())));
  });

  it('denies a picture to everyone else', async () => {
    for (const ctx of notStaff()) {
      await assertFails(getBytes(ref(ctx.storage(), picture())));
    }
  });

  it('denies the folder list to non-admins', async () => {
    for (const ctx of [asStaff(), asStudentGoogle(), asAnon()]) {
      await assertFails(listAll(ref(ctx.storage(), 'web_tour_pictures/w1')));
    }
  });

  it('denies uploads and deletes to non-admins', async () => {
    for (const ctx of [asStaff(), ...notStaff()]) {
      await assertFails(upload(ctx, picture('w1', 'n.png')));
      await assertFails(deleteObject(ref(ctx.storage(), picture())));
    }
  });

  // The emulator cannot resolve storage's firestore.exists() admin lookup, so admin allows are pinned by source.
  it('gives admins list, delete and capped image uploads', () => {
    const rules = readFileSync(STORAGE_RULES, 'utf8');
    const body =
      /match \/web_tour_pictures\/\{setId\}\/\{fileName\} \{([\s\S]*?)\n {4}\}/.exec(
        rules
      )?.[1] ?? '';
    expect(body).toContain(
      'allow get: if isVerifiedDistrictEmail() && viewAsReadOk();'
    );
    expect(body).toContain('allow list, delete: if isAdmin();');
    expect(body).toContain('allow create: if isAdmin() &&');
    expect(body).not.toContain('update');
    expect(body).toContain('request.resource.size <= 5 * 1024 * 1024');
    expect(body).toContain("contentType.matches('image/(png|jpeg|webp)')");
  });
});
