/**
 * Projects redesign PR B backfill (docs/plans/PROJECTS_WIDGET.md D39, D40, D42).
 *
 * For every project run:
 *   - sets `createdAt` when missing (from `updatedAt`, else now);
 *   - sets each group's `peerVisible` from the run's `showStatusToStudents`;
 *   - moves a group's legacy `workLinks` into `groups/{id}/private/work`
 *     (merged with any links already there) and deletes the field.
 *
 * Usage:
 *   node scripts/backfill-project-work-links.mjs --project dev            # dry run
 *   node scripts/backfill-project-work-links.mjs --project dev --apply    # write
 *   node scripts/backfill-project-work-links.mjs --project prod --apply   # after the main release
 *
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 * Idempotent: a second run finds nothing left to change.
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
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
const BATCH_LIMIT = 400;

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

const linkList = (value) =>
  Array.isArray(value)
    ? value.filter(
        (l) => l && typeof l === 'object' && typeof l.id === 'string'
      )
    : [];

let batch = db.batch();
let pending = 0;
const flush = async () => {
  if (apply && pending > 0) await batch.commit();
  batch = db.batch();
  pending = 0;
};
const queue = async (fn) => {
  if (apply) fn(batch);
  pending++;
  if (pending >= BATCH_LIMIT) await flush();
};

const counts = { runs: 0, createdAt: 0, groups: 0, peerVisible: 0, moved: 0 };

const runs = await db.collection('project_runs').get();
for (const run of runs.docs) {
  counts.runs++;
  const data = run.data();
  if (typeof data.createdAt !== 'number') {
    const createdAt =
      typeof data.updatedAt === 'number' ? data.updatedAt : Date.now();
    counts.createdAt++;
    await queue((b) => b.update(run.ref, { createdAt }));
  }

  const peerVisible = data.showStatusToStudents === true;
  const groups = await run.ref.collection('groups').get();
  for (const group of groups.docs) {
    counts.groups++;
    const g = group.data();
    const update = {};
    if (g.peerVisible !== peerVisible) {
      update.peerVisible = peerVisible;
      counts.peerVisible++;
    }
    if (g.workLinks !== undefined) {
      const legacy = linkList(g.workLinks);
      const workRef = group.ref.collection('private').doc('work');
      const existing = linkList((await workRef.get()).get('workLinks'));
      const known = new Set(existing.map((l) => l.id));
      const merged = [...existing, ...legacy.filter((l) => !known.has(l.id))];
      update.workLinks = FieldValue.delete();
      counts.moved++;
      await queue((b) =>
        b.set(
          workRef,
          { workLinks: merged.slice(0, 20), updatedAt: Date.now() },
          { merge: true }
        )
      );
    }
    if (Object.keys(update).length > 0) {
      await queue((b) => b.update(group.ref, update));
    }
  }
}
await flush();

console.log(
  `${apply ? 'Applied' : 'Dry run'} on ${projectId}: ${counts.runs} runs ` +
    `(${counts.createdAt} missing createdAt), ${counts.groups} groups ` +
    `(${counts.peerVisible} peerVisible fixes, ${counts.moved} with legacy workLinks).`
);
if (!apply) console.log('Re-run with --apply to write.');
