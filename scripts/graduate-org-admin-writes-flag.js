/**
 * One-shot: graduate `global_permissions/org-admin-writes` from
 * `accessLevel: 'beta'` to `accessLevel: 'admin'` and empty the `betaUsers`
 * array.
 *
 * WHY THIS EXISTS
 *   Phase 4 Task K. During Phase 3 the flag was seeded as
 *     { accessLevel: 'beta', betaUsers: ['paul.ivers@orono.k12.mn.us'], ... }
 *   so only Paul's account could exercise the live mutation path while every
 *   other domain admin still saw "coming soon" toasts. Once Phase 4 QA passes
 *   and the merge hits prod, we flip to
 *     { accessLevel: 'admin', betaUsers: [], ... }
 *   so every admin-role user (super_admin / domain_admin) gets real writes.
 *
 *   We do NOT run `scripts/init-global-perms.js` for this — it has drifted
 *   from prod (stale daily limits, wrong access levels on unrelated flags)
 *   and uses unconditional `set()` rather than merge. See decisions log
 *   2026-04-19 for the full story. This script is a targeted, merge-based
 *   update that touches only the one doc.
 *
 *   Safe to re-run (idempotent by merge). If the doc is already at
 *   accessLevel 'admin' with empty betaUsers, the second write is a no-op.
 *
 * WHAT IT DOES
 *   1. Reads /global_permissions/org-admin-writes and prints the current
 *      accessLevel + betaUsers so you can eyeball what's about to change.
 *   2. Refuses to proceed if the doc is missing (we never create the flag
 *      from scratch here — the Phase 3 seed is the source of truth for the
 *      other fields like `featureId`, `enabled`, `config`).
 *   3. Writes `{ accessLevel: 'admin', betaUsers: [] }` with `{ merge: true }`.
 *      All other fields are preserved.
 *   4. Reads the doc back and prints the final state for confirmation.
 *
 * Usage:
 *   node scripts/graduate-org-admin-writes-flag.js [--dry-run]
 *
 * Flags:
 *   --dry-run   No writes. Log the planned change and exit.
 *
 * Credentials resolution (same as scripts/recount-org-members.js):
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON)
 *   2. scripts/service-account-key.json
 *   3. applicationDefault() via GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'spartboard';
const FLAG_ID = 'org-admin-writes';

function parseArgs(argv) {
  const args = { dryRun: false, help: false };
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(
    'Usage: node scripts/graduate-org-admin-writes-flag.js [--dry-run]'
  );
}

function loadCredentials() {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envJson) {
    return {
      source: 'FIREBASE_SERVICE_ACCOUNT env',
      creds: JSON.parse(envJson),
      useApplicationDefault: false,
    };
  }
  const keyPath = join(__dirname, 'service-account-key.json');
  try {
    const raw = readFileSync(keyPath, 'utf8');
    return {
      source: 'scripts/service-account-key.json',
      creds: JSON.parse(raw),
      useApplicationDefault: false,
    };
  } catch {
    // Fall through to ADC.
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      source:
        'GOOGLE_APPLICATION_CREDENTIALS=' +
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
      creds: null,
      useApplicationDefault: true,
    };
  }
  return {
    source: 'applicationDefault()',
    creds: null,
    useApplicationDefault: true,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const { source, creds, useApplicationDefault } = loadCredentials();
  console.log('Using credentials from ' + source);

  const initOpts = {
    projectId: (creds && creds.project_id) || PROJECT_ID,
  };
  if (useApplicationDefault) {
    initOpts.credential = applicationDefault();
  } else {
    initOpts.credential = cert(creds);
  }
  initializeApp(initOpts);

  const db = getFirestore();
  const ref = db.doc('global_permissions/' + FLAG_ID);

  const before = await ref.get();
  if (!before.exists) {
    console.error(
      '\n❌ /global_permissions/' +
        FLAG_ID +
        ' does not exist. Refusing to create it — this script only flips an existing seed.'
    );
    console.error(
      '   If this is a fresh environment, seed the doc first (see Decisions Log 2026-04-19).'
    );
    process.exit(1);
  }

  const beforeData = before.data() || {};
  console.log('');
  console.log('Current state of /global_permissions/' + FLAG_ID + ':');
  console.log('  accessLevel: ' + JSON.stringify(beforeData.accessLevel));
  console.log('  betaUsers:   ' + JSON.stringify(beforeData.betaUsers ?? []));
  console.log('  enabled:     ' + JSON.stringify(beforeData.enabled));
  console.log('  featureId:   ' + JSON.stringify(beforeData.featureId));

  if (
    beforeData.accessLevel === 'admin' &&
    (beforeData.betaUsers ?? []).length === 0
  ) {
    console.log('');
    console.log(
      '✅ Flag is already graduated (accessLevel: admin, betaUsers: []). Nothing to do.'
    );
    process.exit(0);
  }

  const patch = { accessLevel: 'admin', betaUsers: [] };
  console.log('');
  console.log('Planned patch (merge=true): ' + JSON.stringify(patch));

  if (args.dryRun) {
    console.log('');
    console.log('Dry run only -- no writes were committed.');
    process.exit(0);
  }

  await ref.set(patch, { merge: true });

  const after = await ref.get();
  const afterData = after.data() || {};
  console.log('');
  console.log('Post-write state of /global_permissions/' + FLAG_ID + ':');
  console.log('  accessLevel: ' + JSON.stringify(afterData.accessLevel));
  console.log('  betaUsers:   ' + JSON.stringify(afterData.betaUsers ?? []));
  console.log('  enabled:     ' + JSON.stringify(afterData.enabled));
  console.log('  featureId:   ' + JSON.stringify(afterData.featureId));

  console.log('');
  console.log('✅ Flag graduated. All admin-role users now get live writes.');
  process.exit(0);
}

run().catch((err) => {
  console.error(
    '\ngraduate-org-admin-writes-flag failed: ' +
      (err && err.message ? err.message : err)
  );
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
});
