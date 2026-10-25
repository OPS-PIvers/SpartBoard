/**
 * Stamp `teacherUid` on Schoology launch contexts written before contexts carried an owner.
 *
 * Each `lti_session_memberships/{sessionId}/contexts/{contextId}` doc without a
 * `teacherUid` gets its session's current owner. A context whose session no longer
 * exists, or that predates its session (the id was recreated), is stamped with '' so it is never inherited.
 * Without this, those sections show "Student" in place of names and refuse course
 * linking until a student relaunches the assignment.
 *
 * Usage:
 *   node scripts/backfill-lti-context-owners.mjs            # dry run, counts
 *   node scripts/backfill-lti-context-owners.mjs --apply    # writes
 *
 * Run it right after the functions deploy that ships the owner check.
 * Credentials: FIREBASE_SERVICE_ACCOUNT env var (JSON) or scripts/service-account-key.json.
 * Idempotent: stamped docs are skipped.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.slice(2).includes('--apply');
const BATCH_LIMIT = 400;
// createdAt comes from the teacher's clock, so allow for skew.
const CLOCK_SLACK_MS = 60 * 60 * 1000;
const SESSION_COLLECTIONS = ['quiz_sessions', 'video_activity_sessions'];

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

const snap = await db.collectionGroup('contexts').get();
const ownerCache = new Map();
const millis = (v) =>
  typeof v === 'number' ? v : typeof v?.toMillis === 'function' ? v.toMillis() : null;
async function sessionOf(sessionId) {
  if (ownerCache.has(sessionId)) return ownerCache.get(sessionId);
  let found = { owner: '', createdAt: null };
  for (const name of SESSION_COLLECTIONS) {
    const s = await db.collection(name).doc(sessionId).get();
    if (s.exists) {
      const t = s.get('teacherUid');
      found = { owner: typeof t === 'string' ? t : '', createdAt: millis(s.get('createdAt')) };
      break;
    }
  }
  ownerCache.set(sessionId, found);
  return found;
}

const updates = [];
let scanned = 0;
let orphans = 0;
for (const d of snap.docs) {
  const sessionRef = d.ref.parent.parent;
  if (!sessionRef || sessionRef.parent.id !== 'lti_session_memberships') continue;
  scanned++;
  if (typeof d.get('teacherUid') === 'string') continue;
  const session = await sessionOf(sessionRef.id);
  const updatedAt = millis(d.get('updatedAt'));
  // A context last written before its session existed came from a deleted session at the same id.
  const predates =
    session.createdAt !== null && updatedAt !== null && updatedAt < session.createdAt - CLOCK_SLACK_MS;
  const owner = predates ? '' : session.owner;
  if (!owner) orphans++;
  updates.push({ ref: d.ref, owner });
}

console.log(
  `Scanned ${scanned} launch contexts; ${updates.length} need an owner, ${orphans} of them belong to a deleted or recreated session.`
);
if (!apply) {
  console.log('Dry run. Re-run with --apply to stamp them.');
  process.exit(0);
}

for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
  const batch = db.batch();
  for (const { ref, owner } of updates.slice(i, i + BATCH_LIMIT)) {
    batch.update(ref, { teacherUid: owner });
  }
  await batch.commit();
  console.log(`Stamped ${Math.min(i + BATCH_LIMIT, updates.length)} / ${updates.length}`);
}
console.log('Done. Re-run the dry run to confirm 0 remain.');
