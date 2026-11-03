// One-off (security batch 2D): write plcCreators/{plcId} for PLCs made before creators were recorded, then the done marker; dry run unless --apply.

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const timeMs = (v) =>
  typeof v === 'number'
    ? v
    : v && typeof v.toMillis === 'function'
      ? v.toMillis()
      : null;

/** Same rule as legacyCreatorUid in functions/src/getTeammatePrintContext.ts; '' when nobody qualifies. */
export function legacyCreatorUid(root) {
  const members = root?.members;
  if (members && typeof members === 'object') {
    const created = timeMs(root.createdAt);
    let best = null;
    for (const [uid, m] of Object.entries(members)) {
      if (!m || typeof m !== 'object') continue;
      const at = timeMs(m.joinedAt);
      if (at === null) continue;
      if (created !== null && at === created) return uid;
      if (!best || at < best.at) best = { uid, at };
    }
    const lead = root.leadUid;
    // Bulk-stamped joinedAt values can't tell members apart; the lead is the better guess then.
    if (typeof lead === 'string' && lead && Object.hasOwn(members, lead))
      return lead;
    if (best) return best.uid;
  }
  const first = Array.isArray(root?.memberUids) ? root.memberUids[0] : null;
  return typeof first === 'string' && first ? first : '';
}

/** The plcCreators record for one PLC root; '' creatorUid means nobody qualified. */
export function creatorRecord(root, rootCreateMs) {
  return { creatorUid: legacyCreatorUid(root), rootCreateMs, source: 'backfill' };
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project) {
    console.log(
      'Usage: node scripts/backfill-plc-creators.mjs --project <id> [--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }

  initializeApp({ credential: credential(args.project), projectId: args.project });
  const db = getFirestore();

  const snap = await db.collection('plcs').get();
  const plans = [];
  for (const d of snap.docs) {
    const ref = db.collection('plcCreators').doc(d.id);
    if ((await ref.get()).exists) continue;
    const root = d.data();
    plans.push({
      ref,
      plcId: d.id,
      leadUid: root.leadUid ?? '',
      record: creatorRecord(root, d.createTime.toMillis()),
    });
  }

  console.log(
    `${args.project}: ${snap.size} PLCs, ${plans.length} without a creator record.`
  );
  for (const p of plans) {
    const same = p.record.creatorUid === p.leadUid ? '' : '  (differs from lead)';
    console.log(
      `  plcs/${p.plcId}  creator=${p.record.creatorUid || '(none)'}  lead=${p.leadUid}${same}`
    );
  }

  if (!args.apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to apply.');
    return;
  }
  let wrote = 0;
  let failed = 0;
  for (const p of plans) {
    try {
      await p.ref.create(p.record);
      wrote++;
    } catch (err) {
      // ALREADY_EXISTS: a new PLC's own record landed first, which is the better one.
      if (err?.code === 6) continue;
      failed++;
      console.error(`  plcs/${p.plcId}: ${err?.message ?? err}`);
    }
  }
  console.log(`Wrote ${wrote} of ${plans.length} creator records; ${failed} failed.`);
  if (failed > 0) {
    console.log('Not marking the backfill done; fix the failures and re-run.');
    process.exit(1);
  }
  await db
    .doc('plcCreatorsMeta/backfill')
    .set({ doneAt: FieldValue.serverTimestamp(), records: wrote });
  console.log('Marked the backfill done; older PLCs no longer use the fallback.');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
