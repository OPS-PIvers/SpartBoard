/**
 * One-shot (docs/plans/shipped/ADMIN_ACCESS_PAGES.md D3): copy the retired global flags
 * `screen-recording`, `magic-layout` and `remote-control` onto the Widgets-page
 * docs `feature_permissions/{record,magic,remote}`, which the Dock now reads.
 *
 * Only copies when the global doc exists and the widget doc does not, so an
 * admin's Widgets-page choice is never overwritten. Building targeting has no
 * widget equivalent and is reported, not copied. Idempotent.
 *
 * Usage:
 *   node scripts/migrate-internal-tool-permissions.mjs --project dev            # dry run
 *   node scripts/migrate-internal-tool-permissions.mjs --project dev --apply    # writes
 *   node scripts/migrate-internal-tool-permissions.mjs --project prod           # dry run on prod
 *
 * Credentials: prod uses FIREBASE_SERVICE_ACCOUNT or scripts/service-account-key.json;
 * dev uses gcloud application-default credentials.
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECTS = { prod: 'spartboard', dev: 'spartboard-dev' };
const TOOL_FEATURES = {
  record: 'screen-recording',
  magic: 'magic-layout',
  remote: 'remote-control',
};

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const projectArg = args[args.indexOf('--project') + 1];
const projectId = PROJECTS[projectArg];
if (!args.includes('--project') || !projectId) {
  console.error(
    'Usage: node scripts/migrate-internal-tool-permissions.mjs --project <dev|prod> [--apply]'
  );
  process.exit(1);
}

function credential() {
  if (projectArg === 'dev') return applicationDefault();
  const envCreds = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envCreds) return cert(JSON.parse(envCreds));
  const filePath = join(__dirname, 'service-account-key.json');
  if (existsSync(filePath))
    return cert(JSON.parse(readFileSync(filePath, 'utf8')));
  return applicationDefault();
}

initializeApp({ credential: credential(), projectId });
const db = getFirestore();

function toWidgetPermission(toolType, global) {
  const doc = {
    widgetType: toolType,
    enabled: global.enabled !== false,
    accessLevel: ['admin', 'beta', 'public'].includes(global.accessLevel)
      ? global.accessLevel
      : 'public',
    betaUsers: Array.isArray(global.betaUsers) ? global.betaUsers : [],
  };
  if (typeof global.minTier === 'string') doc.minTier = global.minTier;
  return doc;
}

console.log(
  `${apply ? 'APPLY' : 'DRY RUN'} on ${projectId}: global flag -> feature_permissions\n`
);
let planned = 0;
for (const [toolType, featureId] of Object.entries(TOOL_FEATURES)) {
  const [globalSnap, widgetSnap] = await Promise.all([
    db.collection('global_permissions').doc(featureId).get(),
    db.collection('feature_permissions').doc(toolType).get(),
  ]);
  if (!globalSnap.exists) {
    console.log(`- ${toolType}: no global_permissions/${featureId}, skip`);
    continue;
  }
  if (widgetSnap.exists) {
    console.log(`- ${toolType}: feature_permissions/${toolType} exists, skip`);
    continue;
  }
  const global = globalSnap.data() ?? {};
  const next = toWidgetPermission(toolType, global);
  planned += 1;
  console.log(`- ${toolType}: copy from ${featureId}`, JSON.stringify(next));
  if (Array.isArray(global.buildings) && global.buildings.length > 0) {
    console.log(
      `    note: building targeting ${JSON.stringify(global.buildings)} is not copied`
    );
  }
  if (apply) {
    await db.collection('feature_permissions').doc(toolType).set(next);
  }
}
console.log(
  `\n${planned} doc(s) ${apply ? 'written' : 'would be written (pass --apply)'}.`
);
