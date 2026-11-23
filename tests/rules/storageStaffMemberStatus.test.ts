// Storage districtStaffMember(): only an `active` or `invited` non-student member counts as staff.
// The emulator cannot resolve storage's firestore.get() member lookup, so the status gate is pinned by source
// and the denials are checked through the SDK (they must fail whatever the lookup returns).
//
// Requires the Firestore and Storage emulators. Invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'spartboard-storage-staff-status-rules-test';
const DENIED_STATUSES = ['inactive', 'removed', 'foo', ''];

const FIRESTORE_RULES = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);
const STORAGE_RULES = fileURLToPath(
  new URL('../../storage.rules', import.meta.url)
);
const rules = readFileSync(STORAGE_RULES, 'utf8');

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

const emailFor = (status: string) =>
  `status-${status || 'empty'}@orono.k12.mn.us`;
const PICTURE = 'web_tour_pictures/status-w1/pic.png';

const functionBody = (name: string): string =>
  new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n {4}\\}`).exec(
    rules
  )?.[1] ?? '';

// Evaluates the rule's `status in [...]` clause for a member doc status (a missing field defaults to active).
const statusAdmitted = (body: string, status: string | undefined): boolean => {
  const list = /member\.data\.get\('status', 'active'\) in \[([^\]]*)\]/.exec(
    body
  )?.[1];
  const allowed = [...(list ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]);
  return allowed.includes(status ?? 'active');
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(FIRESTORE_RULES, 'utf8'),
      ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080),
    },
    storage: {
      rules,
      ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199),
    },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const status of [...DENIED_STATUSES, 'invited', 'active']) {
      await setDoc(doc(db, `organizations/orono/members/${emailFor(status)}`), {
        email: emailFor(status),
        orgId: 'orono',
        roleId: 'teacher',
        ...(status ? { status } : {}),
      });
    }
    await uploadBytes(ref(ctx.storage(), PICTURE), new Uint8Array(64), {
      contentType: 'image/png',
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('storage districtStaffMember status gate', () => {
  it('admits active, invited and a missing status', () => {
    const body = functionBody('districtStaffMember');
    expect(body).toContain('member != null');
    for (const status of ['active', 'invited', undefined]) {
      expect(statusAdmitted(body, status)).toBe(true);
    }
  });

  it('refuses inactive, removed, unknown and empty statuses', () => {
    const body = functionBody('districtStaffMember');
    for (const status of DENIED_STATUSES) {
      expect(statusAdmitted(body, status)).toBe(false);
    }
  });

  it('keeps liveMember() on the same status list as districtStaffMember()', () => {
    const live = functionBody('liveMember');
    const staff = functionBody('districtStaffMember');
    for (const status of [...DENIED_STATUSES, 'invited', 'active']) {
      expect(statusAdmitted(live, status)).toBe(statusAdmitted(staff, status));
    }
  });

  it('still refuses a student-role member whatever the status', () => {
    expect(functionBody('districtStaffMember')).toContain(
      "member.data.get('roleId', '') != 'student'"
    );
  });

  for (const status of DENIED_STATUSES) {
    it(`denies a staff picture to a member whose status is "${status}"`, async () => {
      const ctx = testEnv.authenticatedContext(
        `uid-${status || 'empty'}`,
        google(emailFor(status))
      );
      await assertFails(getBytes(ref(ctx.storage(), PICTURE)));
    });
  }
});
