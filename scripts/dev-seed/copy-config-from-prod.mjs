// Copies non-student config from prod (spartboard) into spartboard-dev. Read-only on prod; see docs/plans/DEV_FIREBASE_PROJECT.md.
// Usage: node scripts/dev-seed/copy-config-from-prod.mjs [--dry-run]
// Prod creds: scripts/service-account-key.json. Dev creds: gcloud application-default login.
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SOURCE_PROJECT = 'spartboard';
const TARGET_PROJECT = 'spartboard-dev';

// Top-level docs only: subcollections are never followed, so a student-writable one (e.g. announcements/*/pollVotes) cannot leak in.
const CONFIG_COLLECTIONS = [
  'admins',
  'admin_settings',
  'feature_permissions',
  'global_permissions',
  'admin_backgrounds',
  'global_mini_apps',
  'global_music_stations',
  'global_pdfs',
  'global_weather',
  'global_video_activities',
  'instructional_routines',
  'help_center',
  'help_resources',
  'dashboard_templates',
  'announcements',
  'standards_catalog',
  'building_guided_learning',
];

// Organization subcollections copied whole; `members` is filtered to admins below.
const ORG_SUBCOLLECTIONS = [
  'buildings',
  'domains',
  'roles',
  'studentPageConfig',
  'testClasses',
];

// Kill switches forced off in dev regardless of prod's value.
const DEV_OVERRIDES = { 'admin_settings/classlink_sync': { enabled: false } };

const dryRun = process.argv.includes('--dry-run');
const here = dirname(fileURLToPath(import.meta.url));

const sourceApp = initializeApp(
  {
    credential: cert(
      JSON.parse(
        readFileSync(join(here, '..', 'service-account-key.json'), 'utf8')
      )
    ),
    projectId: SOURCE_PROJECT,
  },
  'source'
);
const source = getFirestore(sourceApp);
const targetApp = initializeApp(
  { credential: applicationDefault(), projectId: TARGET_PROJECT },
  'target'
);
const target = getFirestore(targetApp);

if (
  targetApp.options.projectId !== TARGET_PROJECT ||
  sourceApp.options.projectId === TARGET_PROJECT
) {
  throw new Error(
    'Refusing to run: target must be spartboard-dev and source must be prod.'
  );
}

let written = 0;
const writer = target.bulkWriter();

async function copyCollection(ref) {
  const snaps = await ref.get();
  for (const snap of snaps.docs) {
    if (!dryRun) writer.set(target.doc(snap.ref.path), snap.data());
    written++;
  }
  console.log(`${dryRun ? '[dry] ' : ''}${ref.path}: ${snaps.size}`);
}

for (const name of CONFIG_COLLECTIONS)
  await copyCollection(source.collection(name));

const adminEmails = new Set(
  (await source.collection('admins').get()).docs.map((d) => d.id.toLowerCase())
);

for (const org of (await source.collection('organizations').get()).docs) {
  if (!dryRun) writer.set(target.doc(org.ref.path), org.data());
  written++;
  for (const sub of ORG_SUBCOLLECTIONS)
    await copyCollection(org.ref.collection(sub));
  const members = (await org.ref.collection('members').get()).docs.filter(
    (m) =>
      adminEmails.has(String(m.data().email ?? m.id).toLowerCase()) &&
      m.data().roleId !== 'student'
  );
  for (const m of members) {
    if (!dryRun) writer.set(target.doc(m.ref.path), m.data());
    written++;
  }
  console.log(
    `${dryRun ? '[dry] ' : ''}${org.ref.path}/members (admins only): ${members.length}`
  );
}

for (const [path, data] of Object.entries(DEV_OVERRIDES)) {
  if (!dryRun) writer.set(target.doc(path), data, { merge: true });
  console.log(`${dryRun ? '[dry] ' : ''}override ${path}`);
}

await writer.close();
console.log(
  `${dryRun ? 'Would write' : 'Wrote'} ${written} docs to ${TARGET_PROJECT}.`
);
