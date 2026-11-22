// One-off (AB-333): write PLC header detach markers for groups left before #6408 from their per-uid detach records; dry run unless --apply.

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const GROUPS = {
  synced_quizzes: ['quizzes', 'assignments'],
  synced_video_activities: ['video_activities'],
};

export const markerId = (plcId, coll, headerId) =>
  `hdr:${plcId}:${coll}:${headerId}`;

/** Markers to write for one group: each leaver's own headers made before they left, minus markers that already exist. */
export function planMarkers({ group, records, headers, existingIds }) {
  const participants = group?.participants ?? {};
  const have = new Set(existingIds);
  const planned = [];
  for (const rec of records) {
    const uid = rec.id;
    if (uid.startsWith('hdr:') || Object.hasOwn(participants, uid)) continue;
    if (typeof rec.data?.detachedAt !== 'number') continue;
    for (const h of headers) {
      if (h.sharedBy !== uid || h.deletedAt) continue;
      if (h.createMs === undefined || h.createMs > rec.data.detachedAt)
        continue;
      const id = markerId(h.plcId, h.headerCollection, h.headerId);
      if (have.has(id)) continue;
      have.add(id);
      planned.push({
        id,
        data: {
          plcId: h.plcId,
          plcContentId: h.headerId,
          headerCollection: h.headerCollection,
          sharedBy: uid,
          detachedAt: rec.data.detachedAt,
        },
      });
    }
  }
  return planned;
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

async function headersFor(db, groupCollection, groupId) {
  const out = [];
  for (const coll of GROUPS[groupCollection]) {
    const snap = await db
      .collectionGroup(coll)
      .where('syncGroupId', '==', groupId)
      .get();
    for (const d of snap.docs) {
      const plcRef = d.ref.parent.parent;
      if (!plcRef || plcRef.parent.id !== 'plcs') continue;
      out.push({
        plcId: plcRef.id,
        headerCollection: coll,
        headerId: d.id,
        sharedBy: d.get('sharedBy'),
        deletedAt: d.get('deletedAt'),
        createMs: d.createTime.toMillis(),
      });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project) {
    console.log(
      'Usage: node scripts/backfill-plc-header-markers.mjs --project <id> [--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }

  initializeApp({
    credential: credential(args.project),
    projectId: args.project,
  });
  const db = getFirestore();

  const writes = [];
  for (const groupCollection of Object.keys(GROUPS)) {
    const groups = await db.collection(groupCollection).get();
    for (const g of groups.docs) {
      const detached = await g.ref.collection('plcDetached').get();
      const records = detached.docs.map((d) => ({ id: d.id, data: d.data() }));
      if (!records.some((r) => !r.id.startsWith('hdr:'))) continue;
      const planned = planMarkers({
        group: g.data(),
        records,
        headers: await headersFor(db, groupCollection, g.id),
        existingIds: records.map((r) => r.id),
      });
      for (const p of planned)
        writes.push({ ref: g.ref, groupCollection, ...p });
    }
  }

  console.log(`${args.project}: ${writes.length} header markers to write.`);
  for (const w of writes) console.log(`  ${w.ref.path}/plcDetached/${w.id}`);

  if (!args.apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to apply.');
    return;
  }
  for (const w of writes) {
    // create() fails on an existing marker, so a concurrent leave is never overwritten.
    await w.ref.collection('plcDetached').doc(w.id).create(w.data);
  }
  console.log(`Wrote ${writes.length} markers.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
