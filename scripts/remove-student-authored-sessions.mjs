// One-off: delete sessions a studentRole token authored before the create rules required a teacher; dry run unless --apply.

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

/** Session collections whose create rule once admitted studentRole tokens, with their `${sessionId}__` side collections. */
export const SESSION_COLLECTIONS = [
  { name: 'quiz_sessions', side: ['grade_index', 'quiz_attempt_ledger'] },
  {
    name: 'video_activity_sessions',
    side: ['grade_index', 'video_activity_attempt_ledger'],
  },
  { name: 'guided_learning_sessions', side: ['grade_index'] },
  { name: 'mini_app_sessions', side: ['grade_index'] },
  { name: 'activity_wall_sessions', side: ['grade_index'] },
];

const PAGE = 1000;

/** Student uids are hex HMAC-SHA256 pseudonyms; Firebase staff uids never take this shape. */
export function isStudentPseudonym(uid) {
  return typeof uid === 'string' && /^[0-9a-f]{64}$/.test(uid);
}

/** The uid that owns a session: `teacherUid`, or the `{uid}_` id prefix on an Activity Wall. */
export function sessionOwner(collection, id, data) {
  if (typeof data?.teacherUid === 'string' && data.teacherUid !== '') {
    return data.teacherUid;
  }
  if (collection === 'activity_wall_sessions' && id.includes('_')) {
    return id.slice(0, id.indexOf('_'));
  }
  return null;
}

/** True when Auth agrees the owner is a custom-token student: no account, or one with no sign-in provider. */
export function authSaysStudent(userRecord) {
  return !userRecord || (userRecord.providerData ?? []).length === 0;
}

/** Splits pseudonym-owned sessions into ones to delete and ones Auth contradicts (left for a person to check). */
export function planCleanup(candidates, usersByUid) {
  const remove = [];
  const review = [];
  for (const c of candidates) {
    (authSaysStudent(usersByUid.get(c.owner)) ? remove : review).push(c);
  }
  return { remove, review };
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

async function scanCollection(db, name) {
  const found = [];
  let last = null;
  for (;;) {
    let q = db
      .collection(name)
      .select('teacherUid')
      .orderBy(FieldPath.documentId())
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (const d of snap.docs) {
      const owner = sessionOwner(name, d.id, d.data());
      if (isStudentPseudonym(owner)) {
        found.push({ collection: name, id: d.id, owner, ref: d.ref });
      }
    }
    if (snap.size < PAGE) return found;
    last = snap.docs[snap.docs.length - 1];
  }
}

async function loadUsers(auth, uids) {
  const byUid = new Map();
  const list = [...new Set(uids)];
  for (let i = 0; i < list.length; i += 100) {
    const res = await auth.getUsers(list.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of res.users) byUid.set(u.uid, u);
  }
  return byUid;
}

/** Doc-id bounds [lo, hi) for the `${sessionId}__${uid}` rows of one session. */
export function sideIdRange(sessionId) {
  return [`${sessionId}__`, `${sessionId}__\uf8ff`];
}

async function sideRefs(db, sessionId, collections) {
  const refs = [];
  const [lo, hi] = sideIdRange(sessionId);
  for (const name of collections) {
    const snap = await db
      .collection(name)
      .where(FieldPath.documentId(), '>=', lo)
      .where(FieldPath.documentId(), '<', hi)
      .select()
      .get();
    refs.push(...snap.docs.map((d) => d.ref));
  }
  return refs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project) {
    console.log(
      'Usage: node scripts/remove-student-authored-sessions.mjs --project <id> [--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }

  initializeApp({ credential: credential(args.project), projectId: args.project });
  const db = getFirestore();

  const candidates = [];
  for (const { name } of SESSION_COLLECTIONS) {
    const found = await scanCollection(db, name);
    console.log(`${name}: ${found.length} owned by a student pseudonym`);
    candidates.push(...found);
  }
  const users = await loadUsers(getAuth(), candidates.map((c) => c.owner));
  const { remove, review } = planCleanup(candidates, users);
  const sideOf = new Map(SESSION_COLLECTIONS.map((c) => [c.name, c.side]));

  for (const c of review) {
    console.log(`  REVIEW ${c.collection}/${c.id}  owner ${c.owner.slice(0, 8)}… has a sign-in provider; left alone`);
  }
  const plans = [];
  for (const c of remove) {
    const side = await sideRefs(db, c.id, sideOf.get(c.collection));
    plans.push({ ...c, side });
    console.log(`  delete ${c.collection}/${c.id}  owner ${c.owner.slice(0, 8)}…  +${side.length} grade/ledger rows`);
  }
  console.log(`${args.project}: ${plans.length} to delete, ${review.length} to review.`);

  if (!args.apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to apply.');
    return;
  }
  let rows = 0;
  for (const p of plans) {
    await db.recursiveDelete(p.ref);
    // After the session is gone the grade-index triggers no longer rebuild its rows.
    for (const ref of await sideRefs(db, p.id, sideOf.get(p.collection))) {
      await ref.delete();
      rows++;
    }
  }
  console.log(`Deleted ${plans.length} sessions (with subcollections) and ${rows} grade/ledger rows.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
