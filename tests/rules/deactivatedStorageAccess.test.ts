// Storage rules: the uid-keyed `deactivated` claim refuses a deactivated member as owner and as admin
// (a surviving hand-made /admins doc included), whatever email the token carries.
// The emulator cannot resolve firestore.exists(), so admin allow branches are pinned by source.
//
// Requires the Firestore and Storage emulators. Invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'spartboard-deactivated-storage-rules-test';
const UID = 'teacher-uid';
const ADMIN_EMAIL = 'former.admin@orono.k12.mn.us';

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

const google = (extra: TokenOptions): TokenOptions => ({
  firebase: { sign_in_provider: 'google.com' },
  ...extra,
});

const DEACTIVATED_TOKENS: Array<[string, TokenOptions]> = [
  [
    'a different verified email',
    google({
      email: 'renamed@personal.example',
      email_verified: true,
      deactivated: true,
    }),
  ],
  [
    'an unverified email',
    google({
      email: 'renamed@personal.example',
      email_verified: false,
      deactivated: true,
    }),
  ],
  ['no email', google({ deactivated: true })],
];

// Unique object names: other Storage suites call clearStorage() in parallel.
let seq = 0;
const seedObject = async (path: string): Promise<string> => {
  seq += 1;
  const full = `${path}-${seq}.png`;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), full), new Uint8Array(64), {
      contentType: 'image/png',
    });
  });
  return full;
};

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
    // A hand-made /admins doc (no organizationMembersSync marker) survives deactivation.
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    await setDoc(doc(db, `organizations/orono/members/${ADMIN_EMAIL}`), {
      email: ADMIN_EMAIL,
      roleId: 'domain_admin',
      status: 'inactive',
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('a deactivated uid loses its own teacher files', () => {
  for (const [label, token] of DEACTIVATED_TOKENS) {
    it(`denies read, upload and delete with ${label}`, async () => {
      const path = await seedObject(`users/${UID}/backgrounds/bg`);
      const st = testEnv.authenticatedContext(UID, token).storage();
      await assertFails(getBytes(ref(st, path)));
      await assertFails(deleteObject(ref(st, path)));
      await assertFails(
        uploadBytes(
          ref(st, `users/${UID}/backgrounds/new-${seq}.png`),
          new Uint8Array(8),
          {
            contentType: 'image/png',
          }
        )
      );
    });
  }

  it('the same uid without the claim keeps its files', async () => {
    const path = await seedObject(`users/${UID}/backgrounds/bg`);
    const st = testEnv
      .authenticatedContext(
        UID,
        google({ email: 'renamed@personal.example', email_verified: true })
      )
      .storage();
    await assertSucceeds(getBytes(ref(st, path)));
    await assertSucceeds(
      uploadBytes(
        ref(st, `users/${UID}/backgrounds/new-${seq}.png`),
        new Uint8Array(8),
        {
          contentType: 'image/png',
        }
      )
    );
    await assertSucceeds(deleteObject(ref(st, path)));
  });
});

describe('a deactivated admin with a surviving /admins doc', () => {
  const asFormerAdmin = () =>
    testEnv
      .authenticatedContext(
        'former-admin-uid',
        google({ email: ADMIN_EMAIL, email_verified: true, deactivated: true })
      )
      .storage();

  it('cannot read or delete student media, project uploads or another teacher’s files', async () => {
    for (const prefix of [
      'quiz_response_media/s1/r1/take',
      'activity_wall_media/other_s1/sub1/photo',
      'project_uploads/other_run/g1/u1/file',
      `users/${UID}/backgrounds/bg`,
    ]) {
      const path = await seedObject(prefix);
      await assertFails(getBytes(ref(asFormerAdmin(), path)));
      await assertFails(deleteObject(ref(asFormerAdmin(), path)));
    }
  });

  it('cannot overwrite shared admin assets', async () => {
    for (const path of ['admin_logos/logo.png', 'global_pdfs/guide.pdf']) {
      await assertFails(
        uploadBytes(ref(asFormerAdmin(), path), new Uint8Array(8), {
          contentType: 'image/png',
        })
      );
    }
  });

  it('every admin branch checks the claim before its Firestore read', () => {
    const rules = readFileSync(STORAGE_RULES, 'utf8');
    const fn = (name: string) => {
      const from = rules.indexOf(`function ${name}(`);
      return rules.slice(from, rules.indexOf('\n    }', from));
    };
    const isAdmin = fn('isAdmin');
    expect(isAdmin.indexOf('liveToken() &&')).toBeGreaterThan(0);
    expect(isAdmin.indexOf('liveToken()')).toBeLessThan(
      isAdmin.indexOf('firestore.exists')
    );
    expect(fn('isSiteAdmin')).toContain('isAdmin() &&');
    expect(fn('notDeactivated')).toMatch(/return liveToken\(\) && /);
    expect(fn('liveToken')).toContain(
      "request.auth.token.get('deactivated', false) != true"
    );
    // A token with no claim (fresh account, pre-backfill) is still refused through the member doc.
    expect(isAdmin).toMatch(
      /liveMember\(firestore\.get\([^)]*organizations\/orono\/members\/\$\(request\.auth\.token\.email\.lower\(\)\)/
    );
    expect(isAdmin.indexOf('liveMember(')).toBeLessThan(
      isAdmin.indexOf('firestore.exists')
    );
    // Two distinct reads (member doc, admins doc), within the cross-service budget.
    expect(isAdmin.match(/firestore\./g)).toHaveLength(2);
  });

  it('a claimless token for an inactive member is refused on admin paths', async () => {
    const claimless = testEnv
      .authenticatedContext(
        'fresh-uid',
        google({ email: ADMIN_EMAIL, email_verified: true })
      )
      .storage();
    const path = await seedObject('quiz_response_media/s1/r1/take');
    await assertFails(getBytes(ref(claimless, path)));
    await assertFails(
      uploadBytes(ref(claimless, 'admin_logos/logo.png'), new Uint8Array(8), {
        contentType: 'image/png',
      })
    );
  });
});
