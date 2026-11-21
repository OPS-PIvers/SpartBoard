/**
 * One-off (AB-334): Grades-tab entries projected between #6310 and #6407 carry `ownerUid` but no
 * `vouched`, so a sub swap would still purge them. This touches each such entry's `grade_index` row so
 * the deployed `gradeIndexProjection` trigger re-projects it with the roster check: a roster that still
 * vouches for the owner stamps the entry (rewriting it if the rebuilt entry differs), and an owner the
 * roster no longer vouches for loses the unchecked entry, as any projection would do.
 *
 * Usage:
 *   node scripts/stamp-vouched-grade-entries.mjs --project dev                      # dry run
 *   node scripts/stamp-vouched-grade-entries.mjs --project dev --apply [--out f.json]
 *   node scripts/stamp-vouched-grade-entries.mjs --project dev --retouch f.json [--apply]
 *
 * --apply writes every touched row to a JSON file (default stamp-vouched-<project>-<time>.json).
 * --retouch re-touches the rows in that file whose student entry is now missing, e.g. after a sub swap ends.
 * Run it only where the functions from #6407 are live; older functions write entries without the stamp.
 * Needs `admin_settings/gradebook_index.enabled` on; --apply exits non-zero when it is off.
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 * Idempotent: once re-projected, an entry is stamped or gone and a second run skips it.
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };
const NOT_FOUND = 5;
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

/** The grade_index rows to touch for these entries in this class, plus the entries with no such row. */
export function matchRows(entries, rows, classId) {
  const touches = [];
  const missing = [];
  for (const entry of entries) {
    const hits = rows.filter(
      (r) =>
        str(r.data.sessionId) === entry.sessionId &&
        str(r.data.ownerUid) === entry.ownerUid &&
        str(r.data.classId) === classId
    );
    if (hits.length === 0) missing.push(entry);
    for (const r of hits)
      if (!touches.some((t) => t.rowId === r.id))
        touches.push({ ...entry, rowId: r.id });
  }
  return { touches, missing };
}

/** Records from a --apply file whose entry is gone from its projection doc; `docs` maps path to doc data. */
export function retouchTargets(records, docs) {
  return records.filter((r) => {
    const entries = docs.get(r.path)?.entries;
    return !(isRecord(entries) && isRecord(entries[r.sessionId]));
  });
}

/** Touch records parsed from a --apply file, dropping malformed ones. */
export function parseRecords(json) {
  const list = Array.isArray(json) ? json : [];
  return list.filter(
    (r) =>
      isRecord(r) &&
      projectionKey(str(r.path)) !== null &&
      str(r.sessionId) &&
      str(r.ownerUid) &&
      str(r.rowId) &&
      !str(r.rowId).includes('/')
  );
}

/** The `{ studentUid, classId }` of a `student_grades/{studentUid}/classes/{classId}` path, or null. */
export function projectionKey(path) {
  const m = /^student_grades\/([^/]+)\/classes\/([^/]+)$/.exec(path);
  return m ? { studentUid: m[1], classId: m[2] } : null;
}

function parseArgs(argv) {
  const args = {
    apply: false,
    project: null,
    out: null,
    retouch: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--out') args.out = argv[++i] ?? null;
    else if (a === '--retouch') args.retouch = argv[++i] ?? null;
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

/** Touches each record's row; a row deleted since the scan is skipped, never recreated. */
async function touchRows(db, records) {
  const counts = { touched: 0, gone: 0, failed: 0 };
  const writer = db.bulkWriter();
  writer.onWriteError((err) => {
    if (err.code === NOT_FOUND) return false;
    return err.failedAttempts < 3;
  });
  const now = Date.now();
  await Promise.all(
    records.map((r) =>
      writer
        .update(db.collection('grade_index').doc(r.rowId), {
          [TOUCH_FIELD]: now,
        })
        .then(() => counts.touched++)
        .catch((err) => {
          if (err?.code === NOT_FOUND) counts.gone++;
          else {
            counts.failed++;
            console.error(`  grade_index/${r.rowId}: ${err?.message ?? err}`);
          }
        })
    )
  );
  await writer.close();
  return counts;
}

async function scan(db) {
  const counts = { docs: 0, withUnstamped: 0, entries: 0, noRow: 0 };
  const touches = [];
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
    const found = matchRows(
      entries,
      rows.docs.map((d) => ({ id: d.id, data: d.data() })),
      key.classId
    );
    counts.noRow += found.missing.length;
    for (const m of found.missing)
      console.log(
        `  ${doc.ref.path} ${m.sessionId} (owner ${m.ownerUid}): no index row, left as is`
      );
    touches.push(...found.touches.map((t) => ({ path: doc.ref.path, ...t })));
  }
  console.log(
    `${counts.docs} projection doc(s), ${counts.withUnstamped} with ${counts.entries} unstamped entr(ies); ` +
      `${touches.length} index row(s) to re-project, ${counts.noRow} entr(ies) with no row.`
  );
  return touches;
}

async function retouchList(db, file) {
  const records = parseRecords(JSON.parse(readFileSync(file, 'utf8')));
  const docs = new Map();
  for (const path of new Set(records.map((r) => r.path))) {
    const snap = await db.doc(path).get();
    if (snap.exists) docs.set(path, snap.data());
  }
  const targets = retouchTargets(records, docs);
  console.log(
    `${records.length} recorded row(s), ${targets.length} whose entry is now missing.`
  );
  for (const t of targets)
    console.log(`  ${t.path} ${t.sessionId} (owner ${t.ownerUid})`);
  return targets;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args.project
    ? (PROJECTS[args.project] ?? args.project)
    : null;
  if (args.help || !projectId) {
    console.log(
      'Usage: node scripts/stamp-vouched-grade-entries.mjs --project dev|prod [--apply] [--out file.json] [--retouch file.json]'
    );
    process.exit(args.help ? 0 : 1);
  }

  initializeApp({ credential: credential(projectId), projectId });
  const db = getFirestore();
  console.log(`Project ${projectId}${args.retouch ? ' (retouch)' : ''}.`);

  const index = await db.doc('admin_settings/gradebook_index').get();
  if (index.data()?.enabled !== true) {
    console.warn(
      'admin_settings/gradebook_index is off: the trigger ignores touched rows until it is on.'
    );
    if (args.apply) process.exit(1);
  }

  const records = args.retouch
    ? await retouchList(db, args.retouch)
    : await scan(db);
  if (!args.apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to re-project.');
    return;
  }

  if (!args.retouch) {
    const out = args.out ?? `stamp-vouched-${args.project}-${Date.now()}.json`;
    writeFileSync(out, JSON.stringify(records, null, 2));
    console.log(
      `Wrote ${records.length} row record(s) to ${out}; keep it for --retouch.`
    );
  }
  const counts = await touchRows(db, records);
  console.log(
    `Touched ${counts.touched} row(s); ${counts.gone} gone since the scan, ${counts.failed} failed. ` +
      'Re-run the dry run in a few minutes to check what is left.'
  );
  if (counts.failed > 0) process.exit(1);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
