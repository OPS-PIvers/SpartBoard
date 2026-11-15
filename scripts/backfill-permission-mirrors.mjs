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
for (const [src, dst, field] of [
  ['feature_permissions', 'feature_permissions_public', 'features'],
  ['global_permissions', 'global_permissions_public', 'global'],
]) {
  const snap = await db.collection(src).get();
  for (const d of snap.docs) {
    const data = d.data();
    if (!dryRun)
      await db
        .collection(dst)
        .doc(d.id)
        .set({ ...data, betaUsers: [] });
    const emails = Array.isArray(data.betaUsers) ? data.betaUsers : [];
    for (const e of emails) {
      if (typeof e !== 'string' || !e.trim()) continue;
      const k = e.trim().toLowerCase();
      const g = grants.get(k) ?? { features: new Set(), global: new Set() };
      g[field].add(d.id);
      grants.set(k, g);
    }
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
      .set({ features: [...g.features], global: [...g.global] });
}
console.log(`beta_grants: ${grants.size} emails${dryRun ? ' (dry run)' : ''}`);
