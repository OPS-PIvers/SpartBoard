/**
 * Give every live Classroom Live session written before join-code pointers a
 * `live_session_codes/{code}` pointer, so its class keeps taking joiners and no
 * other teacher can claim the code (pointers are create-if-absent).
 *
 * Usage:
 *   node scripts/backfill-live-session-codes.mjs --project dev            # dry run
 *   node scripts/backfill-live-session-codes.mjs --project prod --apply   # write
 *
 * At the main release, run it on prod right before the release merges and again
 * right after it deploys (the second pass catches classes started in between).
 * Before the rules release no client can write pointers, so the first pass cannot race one.
 *
 * Two live sessions sharing a code: the lowest doc id wins, as the old join query did.
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 * Idempotent: a code that already has a pointer is left alone.
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
const CODE_RE = /^[A-Z0-9]{6}$/;

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

const live = await db
  .collection('sessions')
  .where('isActive', '==', true)
  .orderBy('__name__')
  .get();

let created = 0;
let present = 0;
let conflicts = 0;
let skipped = 0;
const seen = new Set();
for (const d of live.docs) {
  const code = d.get('code');
  if (typeof code !== 'string' || !CODE_RE.test(code) || seen.has(code)) {
    skipped++;
    continue;
  }
  seen.add(code);
  const ref = db.collection('live_session_codes').doc(code);
  const pointer = await ref.get();
  if (pointer.exists) {
    if (pointer.get('teacherUid') === d.id) present++;
    else {
      conflicts++;
      console.warn(
        `Code ${code}: pointer names ${pointer.get('teacherUid')}, live session is ${d.id}`
      );
    }
    continue;
  }
  if (apply) {
    await ref
      .create({ teacherUid: d.id, createdAt: Date.now() })
      .then(() => created++)
      .catch((err) => {
        conflicts++;
        console.warn(`Code ${code}: create failed (${err.message})`);
      });
  } else {
    created++;
  }
}

console.log(
  `${projectId}: ${live.size} live sessions; ${apply ? 'created' : 'would create'} ${created} pointers, ${present} already owned, ${conflicts} conflicts, ${skipped} skipped (bad or duplicate code)`
);
