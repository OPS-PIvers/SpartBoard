/**
 * Backfill PLC linkage onto existing quiz sessions (docs/plans/PLC_ASSESSMENT_DATA.md §6).
 *
 * Finds every member's quiz assignment that was assigned through the PLC
 * (raw `plc.id`, legacy flat `plcId`, or a `sync.groupId` that belongs to the
 * PLC's shared quiz library) and writes `plcId` / `syncGroupId` / `plcLinkedAt`
 * onto the matching `quiz_sessions/{id}` doc, creates the assessment record
 * when missing, and marks it dirty so `recomputePlcAssessments` picks it up.
 *
 * Usage:
 *   node scripts/backfill-plc-sessions.mjs --plc <plcId>            # dry run, prints a table
 *   node scripts/backfill-plc-sessions.mjs --plc <plcId> --apply    # writes
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT env var (JSON) or scripts/service-account-key.json.
 * A JSON report is written to scripts/output/ on every run. Idempotent.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const plcArgIndex = args.indexOf('--plc');
const plcId =
  plcArgIndex >= 0
    ? args[plcArgIndex + 1]
    : (args.find((a) => a.startsWith('--plc='))?.split('=')[1] ?? null);

if (!plcId) {
  console.error(
    'Usage: node scripts/backfill-plc-sessions.mjs --plc <plcId> [--apply]'
  );
  process.exit(1);
}

function loadCredentials() {
  const envCreds = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envCreds) return JSON.parse(envCreds);
  const filePath = join(__dirname, 'service-account-key.json');
  if (!existsSync(filePath)) {
    throw new Error(
      'No credentials. Set FIREBASE_SERVICE_ACCOUNT or add scripts/service-account-key.json.'
    );
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

initializeApp({ credential: cert(loadCredentials()) });
const db = getFirestore();

function nonEmpty(v) {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

async function loadPlc() {
  const snap = await db.collection('plcs').doc(plcId).get();
  if (!snap.exists) throw new Error(`plcs/${plcId} does not exist`);
  const data = snap.data();
  const members = data.members ?? {};
  const uids = new Set(Array.isArray(data.memberUids) ? data.memberUids : []);
  for (const [uid, m] of Object.entries(members)) {
    if (m?.status !== 'removed') uids.add(uid);
  }
  const emailByUid = { ...(data.memberEmails ?? {}) };
  for (const [uid, m] of Object.entries(members)) {
    if (m?.email) emailByUid[uid] = m.email;
  }
  return { name: data.name ?? plcId, uids: [...uids], emailByUid };
}

function normalizeTitle(t) {
  return String(t ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadPlcSyncGroups() {
  const snap = await db
    .collection('plcs')
    .doc(plcId)
    .collection('quizzes')
    .get();
  const groups = new Set();
  const groupByTitle = new Map();
  for (const d of snap.docs) {
    const q = d.data();
    if (q.deletedAt != null) continue;
    const gid = nonEmpty(q.syncGroupId);
    if (!gid) continue;
    groups.add(gid);
    const key = normalizeTitle(q.title);
    if (key && !groupByTitle.has(key)) groupByTitle.set(key, gid);
  }
  return { groups, groupByTitle };
}

// Members usually assign their own copy, so each copy carries its own sync
// group. Pool by title: the PLC library group wins, else the largest run.
function assignPoolKeys(rows, groupByTitle) {
  const byTitle = new Map();
  for (const r of rows) {
    const key = normalizeTitle(r.quizTitle);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(r);
  }
  for (const [key, group] of byTitle) {
    const linked = group.find((r) => r.action === 'already linked');
    const largest = [...group]
      .filter((r) => r.syncGroupId)
      .sort((a, b) => b.completedResponses - a.completedResponses)[0];
    const poolKey =
      linked?.syncGroupId ??
      groupByTitle.get(key) ??
      largest?.syncGroupId ??
      '';
    for (const r of group) {
      r.poolKey = poolKey;
      if (r.action === 'link' && !poolKey) r.action = 'skip: no pooling key';
    }
  }
}

function assignmentMatches(a, syncGroups) {
  if (a?.plc?.id === plcId) return 'plc.id';
  if (a?.plcId === plcId) return 'legacy plcId';
  const gid = nonEmpty(a?.sync?.groupId);
  if (gid && syncGroups.has(gid)) return 'sync group';
  return null;
}

async function countCompleted(sessionId) {
  const snap = await db
    .collection('quiz_sessions')
    .doc(sessionId)
    .collection('responses')
    .where('status', '==', 'completed')
    .count()
    .get();
  return snap.data().count;
}

async function collectRows(plc, { groups: syncGroups, groupByTitle }) {
  const rows = [];
  for (const uid of plc.uids) {
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('quiz_assignments')
      .get();
    for (const d of snap.docs) {
      const a = d.data();
      const matchedBy = assignmentMatches(a, syncGroups);
      if (!matchedBy) continue;
      const sessionSnap = await db.collection('quiz_sessions').doc(d.id).get();
      const session = sessionSnap.exists ? sessionSnap.data() : null;
      const syncGroupId =
        nonEmpty(session?.syncGroupId) ??
        nonEmpty(a?.sync?.groupId) ??
        nonEmpty(a?.quizId) ??
        nonEmpty(session?.quizId);
      let action = 'link';
      if (!session) action = 'skip: no session';
      else if (session.plcId === plcId) action = 'already linked';
      else if (nonEmpty(session.plcId))
        action = `skip: linked to ${session.plcId}`;
      rows.push({
        sessionId: d.id,
        quizTitle: a.quizTitle ?? session?.quizTitle ?? '',
        teacherEmail: plc.emailByUid[uid] ?? uid,
        teacherUid: uid,
        quizId: a.quizId ?? session?.quizId ?? '',
        syncGroupId: syncGroupId ?? '',
        matchedBy,
        completedResponses: session ? await countCompleted(d.id) : 0,
        scorePublished: !!(session?.scorePublishedAt ?? a.scorePublishedAt),
        action,
      });
    }
  }
  assignPoolKeys(rows, groupByTitle);
  return rows;
}

async function ensureAssessment(row, now) {
  const col = db.collection('plcs').doc(plcId).collection('assessments');
  const existing = await col.where('syncGroupId', '==', row.poolKey).get();
  const live = existing.docs
    .filter((d) => d.data().deletedAt == null)
    .map((d) => d.id)
    .sort();
  if (live.length > 0) {
    const ref = col.doc(live[0]);
    const data = (await ref.get()).data();
    if (data.dirtyAt == null) await ref.update({ dirtyAt: now });
    return { id: live[0], created: false };
  }
  const ref = col.doc(row.poolKey);
  try {
    await ref.create({
      id: row.poolKey,
      title: row.quizTitle || 'Untitled assessment',
      kind: 'quiz',
      syncGroupId: row.poolKey,
      status: 'active',
      createdBy: row.teacherUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      sourceQuizId: row.quizId,
      dirtyAt: now,
    });
    return { id: row.poolKey, created: true };
  } catch (err) {
    if (err?.code === 6 || /ALREADY_EXISTS/i.test(String(err?.message))) {
      await ref.update({ dirtyAt: now });
      return { id: row.poolKey, created: false };
    }
    throw err;
  }
}

async function applyRows(rows) {
  const now = Date.now();
  const results = [];
  for (const row of rows) {
    if (row.action !== 'link') continue;
    await db.collection('quiz_sessions').doc(row.sessionId).update({
      plcId,
      syncGroupId: row.poolKey,
      plcLinkedAt: now,
    });
    const assessment = await ensureAssessment(row, now);
    results.push({
      sessionId: row.sessionId,
      assessmentId: assessment.id,
      createdAssessment: assessment.created,
    });
    console.log(
      `linked ${row.sessionId} (${row.quizTitle}) -> assessment ${assessment.id}${assessment.created ? ' (created)' : ''}`
    );
  }
  return results;
}

async function main() {
  const plc = await loadPlc();
  const syncGroups = await loadPlcSyncGroups();
  console.log(
    `PLC "${plc.name}" (${plcId}): ${plc.uids.length} members, ${syncGroups.groups.size} shared quiz groups`
  );
  const rows = await collectRows(plc, syncGroups);
  console.table(
    rows.map(({ teacherUid: _uid, quizId: _q, matchedBy: _m, ...rest }) => rest)
  );
  const toLink = rows.filter((r) => r.action === 'link');
  console.log(
    `${rows.length} matching assignments; ${toLink.length} would be linked` +
      (apply ? '' : ' (dry run, pass --apply to write)')
  );

  let applied = [];
  if (apply) applied = await applyRows(rows);

  const outDir = join(__dirname, 'output');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(
    outDir,
    `backfill-plc-sessions-${plcId}-${apply ? 'apply' : 'dry'}-${Date.now()}.json`
  );
  writeFileSync(
    outPath,
    JSON.stringify({ plcId, apply, rows, applied }, null, 2)
  );
  console.log(`report: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
