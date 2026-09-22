/**
 * Move the answer key off Video Activity session docs written before the key
 * split. Those docs still carry `questions[].correctAnswer`, which any signed-in
 * student can read.
 *
 * The script does not rewrite the docs itself: it stamps `keyScrubRequestedAt`
 * on each legacy session, and the `scrubVideoActivitySessionKeyV1` trigger
 * (functions/src/videoActivityKey.ts) does the move. Deploy functions first.
 *
 * Usage:
 *   node scripts/backfill-va-session-keys.mjs           # dry run, counts legacy docs
 *   node scripts/backfill-va-session-keys.mjs --apply   # stamps them
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT env var (JSON) or scripts/service-account-key.json.
 * Idempotent: a scrubbed doc no longer matches, so re-running touches nothing.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.slice(2).includes('--apply');
const PAGE_SIZE = 300;
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

initializeApp({ credential: cert(loadCredentials()) });
const db = getFirestore();

const hasEmbeddedKey = (questions) =>
  Array.isArray(questions) &&
  questions.some(
    (q) => q && typeof q === 'object' && typeof q.correctAnswer === 'string'
  );

let scanned = 0;
const legacy = [];
let cursor = null;
for (;;) {
  let q = db
    .collection('video_activity_sessions')
    .orderBy('__name__')
    .select('questions')
    .limit(PAGE_SIZE);
  if (cursor) q = q.startAfter(cursor);
  const snap = await q.get();
  for (const d of snap.docs) {
    scanned++;
    if (hasEmbeddedKey(d.get('questions'))) legacy.push(d.ref);
  }
  if (snap.size < PAGE_SIZE) break;
  cursor = snap.docs[snap.size - 1];
}

console.log(`Scanned ${scanned} sessions; ${legacy.length} still embed a key.`);
if (!apply) {
  console.log('Dry run. Re-run with --apply to stamp them for the scrub trigger.');
  process.exit(0);
}

for (let i = 0; i < legacy.length; i += BATCH_LIMIT) {
  const batch = db.batch();
  for (const ref of legacy.slice(i, i + BATCH_LIMIT)) {
    batch.update(ref, { keyScrubRequestedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  console.log(`Stamped ${Math.min(i + BATCH_LIMIT, legacy.length)} / ${legacy.length}`);
}
console.log('Done. Re-run the dry run in a minute to confirm the count reaches 0.');
