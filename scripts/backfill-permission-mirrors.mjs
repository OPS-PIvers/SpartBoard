// Idempotent mirror backfill, also run by the deploy workflows: node scripts/backfill-permission-mirrors.mjs --project <dev|prod> [--dry-run]
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const PROJECTS = { prod: 'spartboard', dev: 'spartboard-dev' };
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const projectArg = args[args.indexOf('--project') + 1];
const projectId = PROJECTS[projectArg];
if (!args.includes('--project') || !projectId) {
  console.error(
    'Usage: node scripts/backfill-permission-mirrors.mjs --project <dev|prod> [--dry-run]'
  );
  process.exit(1);
}

function credential() {
  if (projectArg === 'dev') return applicationDefault();
  const envCreds = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envCreds) return cert(JSON.parse(envCreds));
  const filePath = join(
    dirname(fileURLToPath(import.meta.url)),
    'service-account-key.json'
  );
  if (existsSync(filePath))
    return cert(JSON.parse(readFileSync(filePath, 'utf8')));
  return applicationDefault();
}

initializeApp({ projectId, credential: credential() });
const db = getFirestore();

const grants = new Map();
const emptyGrant = () => ({
  features: new Set(),
  global: new Set(),
  excludedFeatures: new Set(),
  excludedGlobal: new Set(),
});
const addGrant = (list, field, id) => {
  if (!Array.isArray(list)) return;
  for (const e of list) {
    if (typeof e !== 'string' || !e.trim()) continue;
    const k = e.trim().toLowerCase();
    const g = grants.get(k) ?? emptyGrant();
    g[field].add(id);
    grants.set(k, g);
  }
};
for (const [src, dst, field, exField] of [
  [
    'feature_permissions',
    'feature_permissions_public',
    'features',
    'excludedFeatures',
  ],
  ['global_permissions', 'global_permissions_public', 'global', 'excludedGlobal'],
]) {
  const snap = await db.collection(src).get();
  for (const d of snap.docs) {
    const data = d.data();
    // Same stripping as publicView in functions/src/permissionMirrors.ts.
    const { excludedUsers, ...rest } = data;
    if (!dryRun)
      await db
        .collection(dst)
        .doc(d.id)
        .set({ ...rest, betaUsers: [] });
    addGrant(data.betaUsers, field, d.id);
    addGrant(excludedUsers, exField, d.id);
  }
  console.log(
    `${src}: mirrored ${snap.size} docs${dryRun ? ' (dry run)' : ''}`
  );
}
for (const [email, g] of grants) {
  if (!dryRun)
    await db
      .collection('beta_grants')
      .doc(email)
      .set({
        features: [...g.features],
        global: [...g.global],
        excludedFeatures: [...g.excludedFeatures],
        excludedGlobal: [...g.excludedGlobal],
      });
}
console.log(`beta_grants: ${grants.size} emails${dryRun ? ' (dry run)' : ''}`);
