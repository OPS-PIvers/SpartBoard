/**
 * One-off (AB-334): Grades-tab entries projected between #6310 and #6407 carry `ownerUid` but no
 * `vouched`, so a sub swap would still purge them. This touches each such entry's `grade_index` row so
 * the deployed `gradeIndexProjection` trigger re-projects it: a roster that still vouches for the owner
 * stamps the entry without moving what the student sees, and an owner the roster no longer vouches for
 * loses the unchecked entry, as any projection would do.
 *
 * Usage:
 *   node scripts/stamp-vouched-grade-entries.mjs --project dev            # dry run
 *   node scripts/stamp-vouched-grade-entries.mjs --project dev --apply    # touch the rows
 *
 * Run it only where the functions from #6407 are live; older functions write entries without the stamp.
 * Needs `admin_settings/gradebook_index.enabled` on, or the trigger ignores the touch.
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 * Idempotent: once re-projected, an entry is stamped or gone and a second run skips it.
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };
const BATCH_LIMIT = 400;
// Any changed field fires the row trigger; the next index rebuild drops it.
export const TOUCH_FIELD = 'vouchedBackfillAt';

const isRecord = (v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');

/** Entries that name an owner but were never stamped `vouched`, as `{ sessionId, ownerUid }`. */
export function unstampedEntries(projection) {
  const entries = isRecord(projection?.entries) ? projection.entries : {};
  const out = [];
  for (const [sessionId, e] of Object.entries(entries)) {
    if (!isRecord(e) || e.vouched === true) continue;
    const ownerUid = str(e.ownerUid);
    // An entry with no owner predates per-entry owners; its next projection claims and stamps it.
    if (ownerUid) out.push({ sessionId, ownerUid });
  }
  return out;
}

/** Each entry's grade_index row id in this class, plus the entries with no such row. */
export function matchRows(entries, rows, classId) {
  const rowIds = [];
  const missing = [];
  for (const entry of entries) {
    const hits = rows.filter(
      (r) =>
        str(r.data.sessionId) === entry.sessionId &&
        str(r.data.ownerUid) === entry.ownerUid &&
        str(r.data.classId) === classId
    );
    if (hits.length === 0) missing.push(entry);
    for (const r of hits) if (!rowIds.includes(r.id)) rowIds.push(r.id);
  }
  return { rowIds, missing };
}

/** The `{ studentUid, classId }` of a `student_grades/{studentUid}/classes/{classId}` path, or null. */
export function projectionKey(path) {
  const m = /^student_grades\/([^/]+)\/classes\/([^/]+)$/.exec(path);
  return m ? { studentUid: m[1], classId: m[2] } : null;
}

function parseArgs(argv) {
  const args = { apply: false, project: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--project') args.project = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function credential(projectId) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  if (projectId === 'spartboard') {
    const keyPath = join(
      dirname(fileURLToPath(import.meta.url)),
      'service-account-key.json'
    );
    return cert(JSON.parse(readFileSync(keyPath, 'utf8')));
  }
  return applicationDefault();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args.project
    ? (PROJECTS[args.project] ?? args.project)
    : null;
  if (args.help || !projectId) {
    console.log(
      'Usage: node scripts/stamp-vouched-grade-entries.mjs --project dev|prod [--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }

  initializeApp({ credential: credential(projectId), projectId });
  const db = getFirestore();

  const index = await db.doc('admin_settings/gradebook_index').get();
  if (index.data()?.enabled !== true) {
    console.warn(
      'admin_settings/gradebook_index is off: the trigger ignores touched rows until it is on.'
    );
  }

  const counts = { docs: 0, withUnstamped: 0, entries: 0, rows: 0, noRow: 0 };
  const toTouch = [];
  const snap = await db.collectionGroup('classes').get();
  for (const doc of snap.docs) {
    const key = projectionKey(doc.ref.path);
    if (!key) continue;
    counts.docs++;
    const entries = unstampedEntries(doc.data());
    if (entries.length === 0) continue;
    counts.withUnstamped++;
    counts.entries += entries.length;
    const rows = await db
      .collection('grade_index')
      .where('studentUid', '==', key.studentUid)
      .get();
    const { rowIds, missing } = matchRows(
      entries,
      rows.docs.map((d) => ({ id: d.id, data: d.data() })),
      key.classId
    );
    counts.rows += rowIds.length;
    counts.noRow += missing.length;
    for (const m of missing)
      console.log(
        `  ${doc.ref.path} ${m.sessionId} (owner ${m.ownerUid}): no index row, left as is`
      );
    toTouch.push(...rowIds);
  }

  console.log(
    `${projectId}: ${counts.docs} projection doc(s), ${counts.withUnstamped} with ${counts.entries} unstamped entr(ies); ` +
      `${counts.rows} index row(s) to re-project, ${counts.noRow} entr(ies) with no row.`
  );
  if (!args.apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to re-project.');
    return;
  }

  let batch = db.batch();
  let inBatch = 0;
  const now = Date.now();
  for (const id of toTouch) {
    batch.update(db.collection('grade_index').doc(id), { [TOUCH_FIELD]: now });
    if (++inBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();
  console.log(
    `Touched ${toTouch.length} row(s) on ${projectId}; re-run the dry run in a few minutes to check what is left.`
  );
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
