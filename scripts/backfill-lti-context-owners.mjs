/**
 * Stamp `teacherUid` on Schoology launch contexts written before contexts carried an owner.
 *
 * Each `lti_session_memberships/{sessionId}/contexts/{contextId}` doc without a
 * `teacherUid` gets its session's current owner only on server-written evidence: the owner's
 * lti_seen_sections record names this session, or the context was created (server time) no earlier
 * than the session. Any other context, including one whose session no longer exists, is stamped ''.
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
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BATCH_LIMIT = 400;
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

const millis = (v) =>
  typeof v?.toMillis === 'function' ? v.toMillis() : null;

/** The uid to stamp on a pre-stamp context: the session owner on server-written evidence, else ''. */
export function contextOwner({
  sessionOwner,
  sessionCreatedMs,
  contextCreatedMs,
  seenSessionId,
  sessionId,
}) {
  if (!sessionOwner) return '';
  // The owner's lti_seen_sections record is written by the launch persist, never by a client.
  if (seenSessionId === sessionId) return sessionOwner;
  // Firestore create times: a context older than its session came from a deleted session at the same id.
  return sessionCreatedMs !== null &&
    contextCreatedMs !== null &&
    contextCreatedMs >= sessionCreatedMs
    ? sessionOwner
    : '';
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  initializeApp({ credential: cert(loadCredentials()) });
  const db = getFirestore();

  const snap = await db.collectionGroup('contexts').get();
  const ownerCache = new Map();
  const seenCache = new Map();
  async function seenSession(owner, contextId) {
    const key = `${owner}/${contextId}`;
    if (seenCache.has(key)) return seenCache.get(key);
    const seen = await db
      .collection('users')
      .doc(owner)
      .collection('lti_seen_sections')
      .doc(contextId)
      .get();
    const sessionId = seen.exists ? seen.get('sessionId') : null;
    seenCache.set(key, sessionId);
    return sessionId;
  }
  async function sessionOf(sessionId) {
    if (ownerCache.has(sessionId)) return ownerCache.get(sessionId);
    let found = { owner: '', createdMs: null };
    for (const name of SESSION_COLLECTIONS) {
      const s = await db.collection(name).doc(sessionId).get();
      if (s.exists) {
        const t = s.get('teacherUid');
        found = {
          owner: typeof t === 'string' ? t : '',
          createdMs: millis(s.createTime),
        };
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
    if (!sessionRef || sessionRef.parent.id !== 'lti_session_memberships')
      continue;
    scanned++;
    if (typeof d.get('teacherUid') === 'string') continue;
    const session = await sessionOf(sessionRef.id);
    const owner = contextOwner({
      sessionOwner: session.owner,
      sessionCreatedMs: session.createdMs,
      contextCreatedMs: millis(d.createTime),
      seenSessionId: session.owner
        ? await seenSession(session.owner, d.id)
        : null,
      sessionId: sessionRef.id,
    });
    if (!owner) orphans++;
    updates.push({ ref: d.ref, owner });
  }

  console.log(
    `Scanned ${scanned} launch contexts; ${updates.length} need an owner, ${orphans} of them get '' (no server-written evidence).`
  );
  if (!apply) {
    console.log('Dry run. Re-run with --apply to stamp them.');
    return;
  }

  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { ref, owner } of updates.slice(i, i + BATCH_LIMIT)) {
      batch.update(ref, { teacherUid: owner });
    }
    await batch.commit();
    console.log(
      `Stamped ${Math.min(i + BATCH_LIMIT, updates.length)} / ${updates.length}`
    );
  }
  console.log('Done. Re-run the dry run to confirm 0 remain.');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
