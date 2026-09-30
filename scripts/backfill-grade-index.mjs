/**
 * Gradebook grade index backfill (docs/plans/GRADEBOOK.md D10).
 *
 * Queues every existing activity session in `grade_index_sessions`; the
 * scheduled `gradeIndexRecompute` function then builds each session's rows
 * with the same code the live triggers use. Needs
 * `admin_settings/gradebook_index.enabled` on, or the queue just waits.
 *
 * Usage:
 *   node scripts/backfill-grade-index.mjs --project dev            # dry run
 *   node scripts/backfill-grade-index.mjs --project dev --apply    # queue
 *   node scripts/backfill-grade-index.mjs --project dev --apply --kind quiz
 *
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 * Idempotent: a queued session is simply queued again.
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const argAfter = (flag) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };
const projectArg = argAfter('--project');
const projectId = projectArg ? (PROJECTS[projectArg] ?? projectArg) : null;
const onlyKind = argAfter('--kind');
const BATCH_LIMIT = 400;

// Mirrors SESSION_COLLECTION in functions/src/gradebook/gradeIndex.ts.
const SESSION_COLLECTION = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  flashcards: 'flashcard_sessions',
  project: 'project_runs',
  'mini-app': 'mini_app_sessions',
  'activity-wall': 'activity_wall_sessions',
};

if (!projectId) {
  console.error('Pass --project dev|prod (or a project id).');
  process.exit(1);
}
if (onlyKind && !SESSION_COLLECTION[onlyKind]) {
  console.error(`Unknown --kind ${onlyKind}.`);
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

const switchDoc = await db.doc('admin_settings/gradebook_index').get();
if (switchDoc.data()?.enabled !== true) {
  console.warn(
    'admin_settings/gradebook_index is off: queued sessions wait until it is turned on.'
  );
}

// Older sessions get older timestamps, so the worker drains them first and live edits stay behind.
let queued = 0;
let batch = db.batch();
let inBatch = 0;
const base = Date.now() - 365 * 86_400_000;
for (const [kind, collection] of Object.entries(SESSION_COLLECTION)) {
  if (onlyKind && kind !== onlyKind) continue;
  const snap = await db.collection(collection).select('teacherUid').get();
  let count = 0;
  for (const doc of snap.docs) {
    if (typeof doc.data().teacherUid !== 'string') continue;
    count++;
    if (!apply) continue;
    batch.set(db.collection('grade_index_sessions').doc(doc.id), {
      kind,
      sessionId: doc.id,
      dirtyAt: base + queued,
    });
    queued++;
    if (++inBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  console.log(`${kind}: ${count} session(s)${apply ? ' queued' : ''}`);
}
if (inBatch > 0) await batch.commit();
console.log(
  apply
    ? `Queued ${queued} session(s) on ${projectId}.`
    : `Dry run on ${projectId}; pass --apply to queue.`
);
