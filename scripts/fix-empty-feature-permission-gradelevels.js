/**
 * One-shot repair for /feature_permissions/{widgetType} docs whose
 * `gradeLevels` field is an empty array.
 *
 * WHY THIS EXISTS
 *   A bug in FeaturePermissionsManager.toggleAllGradeLevels() previously wrote
 *   `gradeLevels: []` whenever an admin tapped the "ALL" pill off. The Dock
 *   filter then treated that empty array as a valid admin override and hid
 *   the widget from every user whose buildings resolved to a non-empty grade
 *   set — i.e. the Widget Library showed "No widgets available for your
 *   buildings". Both the writer and the reader have been fixed, but existing
 *   docs with `gradeLevels: []` still need to be cleaned up so affected users
 *   get their widgets back without waiting for an admin to re-toggle.
 *
 * WHAT IT DOES
 *   1. Scans every doc in /feature_permissions.
 *   2. For any doc where `gradeLevels` is an empty array, removes the field
 *      via FieldValue.delete() (a missing field is what the Dock now treats
 *      as "no override"; writing the widget default here would freeze that
 *      default into Firestore even if the seed changes later).
 *   3. Leaves non-empty `gradeLevels` arrays and missing fields alone.
 *
 * It is safe to re-run. Docs that don't match the pattern are untouched.
 *
 * Usage:
 *   node scripts/fix-empty-feature-permission-gradelevels.js [--dry-run] [--verbose]
 *
 * Flags:
 *   --dry-run   No writes. Log what would change and exit.
 *   --verbose   Log every doc inspected, not just the ones that change.
 *
 * Credentials resolution matches scripts/recount-org-members.js:
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON)
 *   2. scripts/service-account-key.json
 *   3. applicationDefault() via GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'spartboard';

function parseArgs(argv) {
  const args = { dryRun: false, verbose: false, help: false };
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(
    'Usage: node scripts/fix-empty-feature-permission-gradelevels.js [--dry-run] [--verbose]'
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
  console.log(
    'Scanning /feature_permissions' +
      (args.dryRun ? '  [DRY RUN]' : '') +
      (args.verbose ? '  [verbose]' : '')
  );

  const snap = await db.collection('feature_permissions').get();
  console.log('Loaded ' + snap.size + ' feature_permissions docs.');

  const toFix = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const levels = data.gradeLevels;
    const isEmptyArray = Array.isArray(levels) && levels.length === 0;
    if (args.verbose) {
      console.log(
        '  ' +
          doc.id +
          ': gradeLevels=' +
          (levels === undefined ? '<missing>' : JSON.stringify(levels)) +
          (isEmptyArray ? '  -> will clear' : '')
      );
    }
    if (isEmptyArray) toFix.push(doc.id);
  }

  console.log('');
  console.log(
    'Docs with empty gradeLevels arrays: ' +
      toFix.length +
      (toFix.length ? ' (' + toFix.join(', ') + ')' : '')
  );

  if (args.dryRun || toFix.length === 0) {
    if (args.dryRun) {
      console.log('');
      console.log('Dry run only -- no writes were committed.');
    }
    process.exit(0);
  }

  // Firestore batches cap at 500 ops; chunk to stay well clear.
  const CHUNK = 400;
  for (let i = 0; i < toFix.length; i += CHUNK) {
    const batch = db.batch();
    for (const id of toFix.slice(i, i + CHUNK)) {
      batch.update(db.doc('feature_permissions/' + id), {
        gradeLevels: FieldValue.delete(),
      });
    }
    await batch.commit();
  }

  console.log('');
  console.log('Cleared gradeLevels on ' + toFix.length + ' doc(s).');
  process.exit(0);
}

run().catch((err) => {
  console.error(
    '\nfix-empty-feature-permission-gradelevels failed: ' +
      (err && err.message ? err.message : err)
  );
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
});
