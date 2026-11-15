// Admin wildcards must not let an admin create a nested doc in a subcollection that a server collection-group query trusts.
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-admin-domains-forgery';
const ADMIN_EMAIL = 'admin@orono.k12.mn.us';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'admins', ADMIN_EMAIL), {});
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const asAdmin = () =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();

const forged = { domain: '@victim.tld', status: 'verified' };

describe('admin wildcard collections cannot hold a nested server collection-group subcollection', () => {
  it.each([
    'admin_settings/org/domains/x',
    'global_permissions/org/domains/x',
    'global_weather/org/domains/x',
    'global_music_stations/org/domains/x',
    'admin_settings/x/group_email_alerts/y',
    'global_permissions/x/group_email_alerts/y',
    'global_weather/x/group_email_alerts/y',
    'global_music_stations/x/group_email_alerts/y',
    'admin_settings/a/b/c/group_email_alerts/y',
    'global_permissions/x/members/y',
    'admin_settings/x/rosters/y',
    'admin_settings/x\n/group_email_alerts/y',
    'admin_settings/x/domains/y\n',
    'global_permissions/x\n/members/y',
  ])('denies an admin write to %s', async (path) => {
    await assertFails(setDoc(doc(asAdmin(), path), forged));
  });

  it.each([
    'admin_settings/feature-x',
    'global_permissions/invite-emails',
    'admin_settings/org/other/x',
    'admin_settings/tour_public_links/tours/set-1',
    'admin_settings/group_reminder_emails',
    'global_weather/current',
  ])('still allows an admin write to %s', async (path) => {
    await assertSucceeds(setDoc(doc(asAdmin(), path), { enabled: true }));
  });
});
