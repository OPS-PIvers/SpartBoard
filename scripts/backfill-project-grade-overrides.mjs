/**
 * Moves each project grade's legacy `overridesByUid` map into
 * `project_runs/{runId}/grades/{groupId}/overrides/{uid}` and deletes the field,
 * so a released grade is readable to its members without a teacher opening the run.
 * The legacy map wins over an existing override doc, as the grade trigger does.
 *
 * Usage:
 *   node scripts/backfill-project-grade-overrides.mjs --project dev            # dry run
 *   node scripts/backfill-project-grade-overrides.mjs --project dev --apply    # write
 *   node scripts/backfill-project-grade-overrides.mjs --project prod --apply   # after the main release
 *
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 * Idempotent: a second run finds nothing left to change.
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const projectArg = args[args.indexOf('--project') + 1];
const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };
const projectId =
  args.includes('--project') && projectArg
    ? (PROJECTS[projectArg] ?? projectArg)
    : null;

if (!projectId) {
  console.error('Pass --project dev|prod (or a project id).');
  process.exit(1);
}

function prodCredential() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) return cert(JSON.parse(fromEnv));
  const keyPath = join(__dirname, 'service-account-key.json');
  if (existsSync(keyPath)) {
    return cert(JSON.parse(readFileSync(keyPath, 'utf8')));
  }
  console.error(
    'No prod credentials: set FIREBASE_SERVICE_ACCOUNT or add scripts/service-account-key.json'
  );
  process.exit(1);
}

initializeApp({
  credential:
    projectId === 'spartboard' ? prodCredential() : applicationDefault(),
  projectId,
});
const db = getFirestore();

const isRecord = (v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isMemberDocId = (id) =>
  id.length > 0 &&
  id.length <= 1500 &&
  !id.includes('/') &&
  id !== '.' &&
  id !== '..' &&
  !/^__.*__$/.test(id);

const counts = { runs: 0, grades: 0, migrated: 0, overrides: 0 };

const runs = await db.collection('project_runs').get();
for (const run of runs.docs) {
  counts.runs++;
  const grades = await run.ref.collection('grades').get();
  for (const grade of grades.docs) {
    counts.grades++;
    if (!('overridesByUid' in grade.data())) continue;
    counts.migrated++;
    // One transaction per grade, so a teacher's save mid-run isn't overwritten.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(grade.ref);
      const data = snap.data();
      if (!snap.exists || !data || !('overridesByUid' in data)) return;
      const legacy = isRecord(data.overridesByUid) ? data.overridesByUid : {};
      for (const [uid, value] of Object.entries(legacy)) {
        if (!isMemberDocId(uid) || !isRecord(value)) continue;
        counts.overrides++;
        if (apply) tx.set(grade.ref.collection('overrides').doc(uid), value);
      }
      const rest = { ...data };
      delete rest.overridesByUid;
      if (apply) tx.set(grade.ref, rest);
    });
  }
}

console.log(
  `${apply ? 'Applied' : 'Dry run'} on ${projectId}: ${counts.runs} runs, ` +
    `${counts.grades} grades, ${counts.migrated} with a legacy map ` +
    `(${counts.overrides} member overrides moved).`
);
if (!apply) console.log('Re-run with --apply to write.');
