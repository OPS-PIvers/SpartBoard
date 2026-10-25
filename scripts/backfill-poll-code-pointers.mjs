// One-off: write poll_codes/{code} for joinable poll sessions last written before the pointer trigger shipped; dry run unless --apply.
// Usage: node scripts/backfill-poll-code-pointers.mjs --project dev|prod [--apply]   (run right after the functions deploy)

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const CODE_RE = /^[A-Z0-9]{1,16}$/;
const BATCH_LIMIT = 400;
const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };

// Mirrors functions/src/pollCodePointer.ts.
export function codeOfSessionId(sessionId) {
  const at = sessionId.lastIndexOf('_');
  if (at <= 0) return null;
  const code = sessionId.slice(at + 1);
  return CODE_RE.test(code) ? code : null;
}

function isJoinable(data) {
  if (!data) return false;
  return !(
    data.active !== true &&
    Array.isArray(data.questions) &&
    data.questions.length === 0
  );
}

function outranks(mine, other) {
  if (!isJoinable(other)) return true;
  if (other.active === true) return false;
  if (mine.active === true) return true;
  const n = (v) => (typeof v === 'number' ? v : 0);
  return n(mine.updatedAt) > n(other.updatedAt);
}

/** The pointer each code with no pointer yet should get. */
export function missingPointers(sessions, existingCodes) {
  const best = new Map();
  for (const { id, data } of sessions) {
    const code = codeOfSessionId(id);
    if (!code || existingCodes.has(code) || !isJoinable(data)) continue;
    if (data.code !== undefined && data.code !== code) continue;
    const prev = best.get(code);
    if (!prev || outranks(data, prev.data)) best.set(code, { id, data });
  }
  return [...best].map(([code, { id, data }]) => ({
    code,
    sessionId: id,
    teacherUid:
      typeof data.teacherUid === 'string'
        ? data.teacherUid
        : id.slice(0, id.length - code.length - 1),
  }));
}

function parseArgs(argv) {
  const args = { apply: false, project: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--project') {
      const id = argv[++i] ?? null;
      args.project = PROJECTS[id] ?? id;
    } else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function credential(project) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  if (project === 'spartboard') {
    const keyPath = join(
      dirname(fileURLToPath(import.meta.url)),
      'service-account-key.json'
    );
    try {
      return cert(JSON.parse(readFileSync(keyPath, 'utf8')));
    } catch {
      // Fall through to ADC.
    }
  }
  return applicationDefault();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project) {
    console.log(
      'Usage: node scripts/backfill-poll-code-pointers.mjs --project <id> [--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }
  initializeApp({
    credential: credential(args.project),
    projectId: args.project,
  });
  const db = getFirestore();

  const [sessionsSnap, pointersSnap] = await Promise.all([
    db.collection('poll_sessions').get(),
    db.collection('poll_codes').get(),
  ]);
  const existingCodes = new Set(pointersSnap.docs.map((d) => d.id));
  const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const missing = missingPointers(sessions, existingCodes);
  console.log(
    `${args.project}: ${sessions.length} poll sessions, ${existingCodes.size} pointers, ${missing.length} codes need one.`
  );
  if (!args.apply) {
    console.log('Dry run. Re-run with --apply to write them.');
    return;
  }
  for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const p of missing.slice(i, i + BATCH_LIMIT)) {
      // create() fails the batch if the trigger wrote this code meanwhile; re-run the dry run then.
      batch.create(db.collection('poll_codes').doc(p.code), {
        sessionId: p.sessionId,
        teacherUid: p.teacherUid,
        updatedAt: Date.now(),
      });
    }
    await batch.commit();
    console.log(
      `Wrote ${Math.min(i + BATCH_LIMIT, missing.length)} / ${missing.length}`
    );
  }
  console.log('Done. Re-run the dry run to confirm 0 remain.');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await main();
}
