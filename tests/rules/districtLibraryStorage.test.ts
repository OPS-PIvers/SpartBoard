// Storage rules for district library pictures: any signed-in user reads, only a site admin lists or writes images.
// The emulator cannot resolve firestore.exists(), so the site-admin allow branch is pinned by source.
//
// Requires the Firestore and Storage emulators. Invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
  type RulesTestContext,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'spartboard-district-library-storage-rules-test';
const BUILDING_ADMIN_EMAIL = 'building.admin@orono.k12.mn.us';

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

const google = (email: string): TokenOptions => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
});

const asBuildingAdmin = () =>
  testEnv.authenticatedContext('building-uid', google(BUILDING_ADMIN_EMAIL));
const asTeacher = () =>
  testEnv.authenticatedContext(
    'teacher-uid',
    google('teacher@orono.k12.mn.us')
  );
const asAnonStudent = () =>
  testEnv.authenticatedContext('anon-uid', {
    firebase: { sign_in_provider: 'anonymous' },
  });
const asSignedOut = () => testEnv.unauthenticatedContext();

// Unique object names: other Storage suites call clearStorage() in parallel.
let seq = 0;
const nextPath = () => {
  seq += 1;
  return `district_library/item-1/a1b2c3d4/pic-${seq}.png`;
};
const seedPicture = async (): Promise<string> => {
  const path = nextPath();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), new Uint8Array(64), {
      contentType: 'image/png',
    });
  });
  return path;
};
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${BUILDING_ADMIN_EMAIL}`), {
      source: 'organizationMembersSync',
      orgId: 'orono',
      roleId: 'building_admin',
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('district_library/** storage', () => {
  it('any signed-in user can read a picture, signed-out cannot', async () => {
    const path = await seedPicture();
    for (const ctx of [asBuildingAdmin(), asTeacher(), asAnonStudent()]) {
      await assertSucceeds(getBytes(ref(ctx.storage(), path)));
    }
    await assertFails(getBytes(ref(asSignedOut().storage(), path)));
  });

  it('no one but a site admin can list a folder', async () => {
    await seedPicture();
    const folder = 'district_library/item-1';
    for (const ctx of [
      asBuildingAdmin(),
      asTeacher(),
      asAnonStudent(),
      asSignedOut(),
    ]) {
      await assertFails(listAll(ref(ctx.storage(), folder)));
    }
  });

  it('no one but a site admin can upload or replace a picture', async () => {
    const existing = await seedPicture();
    for (const ctx of [
      asBuildingAdmin(),
      asTeacher(),
      asAnonStudent(),
      asSignedOut(),
    ]) {
      await assertFails(upload(ctx, nextPath()));
      await assertFails(upload(ctx, existing));
    }
  });

  it('no one but a site admin can delete a picture', async () => {
    const path = await seedPicture();
    for (const ctx of [
      asBuildingAdmin(),
      asTeacher(),
      asAnonStudent(),
      asSignedOut(),
    ]) {
      await assertFails(deleteObject(ref(ctx.storage(), path)));
    }
  });

  it('the site-admin branch allows only images up to 10 MB', () => {
    const rules = readFileSync(STORAGE_RULES, 'utf8');
    const from = rules.indexOf(
      'match /district_library/{itemId}/{allPaths=**}'
    );
    const block = rules.slice(from, rules.indexOf('\n    }', from));
    expect(block).toContain('allow list: if isSiteAdmin();');
    expect(block).toContain('allow delete: if isSiteAdmin();');
    expect(block).toMatch(/allow create, update: if isSiteAdmin\(\) &&/);
    expect(block).toContain('request.resource.size <= 10 * 1024 * 1024');
    expect(block).toContain(
      "request.resource.contentType.matches('image/(png|jpeg|gif|webp)')"
    );
    expect(block).not.toMatch(/[^e]isAdmin\(\)/);
  });
});
