/**
 * Backfill `quiz_join_codes/{code}/sessions/{sessionId}` pointers for quiz
 * sessions created before the lookup collection shipped
 * (docs/plans/shipped/QUIZ_JOIN_CODE_LOOKUP.md).
 *
 * Without a pointer a session is reachable only through the legacy
 * `where('code','==',code)` query, which is the query that keeps `quiz_sessions`
 * answering `list` to every signed-in caller. Every live session needs a pointer
 * before that rule can be scoped.
 *
 * Usage:
 *   node scripts/backfill-quiz-join-codes.mjs                  # dry run, prints a table
 *   node scripts/backfill-quiz-join-codes.mjs --apply          # writes
 *   node scripts/backfill-quiz-join-codes.mjs --all            # include ended sessions
 *
 * By default only sessions that can still be joined (waiting / active / paused)
 * are backfilled — those are the ones a student PIN can land on today. `--all`
 * also covers ended sessions, which the in-quiz review screen resolves by code.
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT env var (JSON) or scripts/service-account-key.json.
 * A JSON report is written to scripts/output/ on every run. Idempotent: a pointer
 * that already exists is left alone, and re-running writes nothing new.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const includeEnded = args.includes('--all');

const JOINABLE = new Set(['waiting', 'active', 'paused']);
const PAGE_SIZE = 500;
const BATCH_LIMIT = 400;

function loadCredentials() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) return JSON.parse(fromEnv);
  const keyPath = join(__dirname, 'service-account-key.json');
  if (existsSync(keyPath)) return JSON.parse(readFileSync(keyPath, 'utf8'));
  console.error(
    'No credentials: set FIREBASE_SERVICE_ACCOUNT or add scripts/service-account-key.json'
  );
  process.exit(1);
}

/** Mirrors normalizeQuizCode() on the client — the pointer path must match what join sends. */
function normalizeQuizCode(code) {
  return String(code)
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

initializeApp({ credential: cert(loadCredentials()) });
const db = getFirestore();

async function* pagedSessions() {
  let cursor = null;
  for (;;) {
    let q = db
      .collection('quiz_sessions')
      .orderBy('__name__')
      .limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) return;
    for (const d of snap.docs) yield d;
    if (snap.size < PAGE_SIZE) return;
    cursor = snap.docs[snap.size - 1];
  }
}

const report = {
  startedAt: new Date().toISOString(),
  apply,
  includeEnded,
  scanned: 0,
  written: 0,
  alreadyPresent: 0,
  skippedNotJoinable: 0,
  skippedNoCode: 0,
  skippedNoTeacher: 0,
  skippedBadCode: 0,
  pending: [],
};

let batch = db.batch();
let batched = 0;

async function flush() {
  if (batched === 0) return;
  if (apply) await batch.commit();
  batch = db.batch();
  batched = 0;
}

for await (const sessionDoc of pagedSessions()) {
  report.scanned += 1;
  const data = sessionDoc.data();
  const status = typeof data.status === 'string' ? data.status : '';
  if (!includeEnded && !JOINABLE.has(status)) {
    report.skippedNotJoinable += 1;
    continue;
  }
  if (typeof data.code !== 'string' || data.code.length === 0) {
    report.skippedNoCode += 1;
    continue;
  }
  const code = normalizeQuizCode(data.code);
  // The rules only accept a canonical code in the path, so a legacy session with
  // a stray character has to be reported rather than silently half-migrated.
  if (!/^[A-Z0-9]{1,16}$/.test(code)) {
    report.skippedBadCode += 1;
    report.pending.push({ sessionId: sessionDoc.id, reason: 'bad-code', code });
    continue;
  }
  if (typeof data.teacherUid !== 'string' || data.teacherUid.length === 0) {
    report.skippedNoTeacher += 1;
    report.pending.push({ sessionId: sessionDoc.id, reason: 'no-teacher-uid' });
    continue;
  }

  const ref = db
    .collection('quiz_join_codes')
    .doc(code)
    .collection('sessions')
    .doc(sessionDoc.id);
  const existing = await ref.get();
  if (existing.exists) {
    report.alreadyPresent += 1;
    continue;
  }

  report.written += 1;
  report.pending.push({
    sessionId: sessionDoc.id,
    code,
    status,
    teacherUid: data.teacherUid,
  });
  batch.set(ref, {
    sessionId: sessionDoc.id,
    teacherUid: data.teacherUid,
    createdAt:
      typeof data.createdAt === 'number'
        ? data.createdAt
        : typeof data.startedAt === 'number'
          ? data.startedAt
          : 0,
  });
  batched += 1;
  if (batched >= BATCH_LIMIT) await flush();
}
await flush();

report.finishedAt = new Date().toISOString();
const outDir = join(__dirname, 'output');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(
  outDir,
  `backfill-quiz-join-codes-${apply ? 'apply' : 'dryrun'}-${Date.now()}.json`
);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(
  [
    `${apply ? 'APPLIED' : 'DRY RUN'} (${includeEnded ? 'all sessions' : 'joinable sessions only'})`,
    `  scanned:            ${report.scanned}`,
    `  pointers ${apply ? 'written' : 'to write'}: ${report.written}`,
    `  already present:    ${report.alreadyPresent}`,
    `  skipped not joinable: ${report.skippedNotJoinable}`,
    `  skipped no code:      ${report.skippedNoCode}`,
    `  skipped no teacherUid:${report.skippedNoTeacher}`,
    `  skipped bad code:     ${report.skippedBadCode}`,
    `  report: ${outPath}`,
  ].join('\n')
);
