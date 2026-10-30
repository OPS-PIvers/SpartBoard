// One-off (#4695): reset `removed` PLC member entries whose uid is back in memberUids to active members; dry run unless --apply.

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

/** Uids that rejoined a PLC before #4695 and still carry a `removed` map entry. */
export function staleRejoinUids(plc) {
  const memberUids = Array.isArray(plc?.memberUids) ? plc.memberUids : [];
  const members =
    plc?.members && typeof plc.members === 'object' ? plc.members : {};
  // A lead never leaves or is removed; skip one rather than demote it.
  return memberUids.filter(
    (uid) =>
      members[uid]?.status === 'removed' &&
      members[uid]?.role !== 'lead' &&
      uid !== plc.leadUid
  );
}

/** The reset entry: role member, status active, every other key kept. */
export function resetEntry(entry) {
  return { ...entry, role: 'member', status: 'active' };
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
      'Usage: node scripts/backfill-plc-rejoin-entries.mjs --project <id> [--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }

  initializeApp({ credential: credential(args.project), projectId: args.project });
  const db = getFirestore();

  const snap = await db.collection('plcs').get();
  const plans = [];
  for (const d of snap.docs) {
    const data = d.data();
    for (const uid of staleRejoinUids(data)) {
      plans.push({ ref: d.ref, plcId: d.id, uid, entry: data.members[uid] });
    }
  }

  console.log(
    `${args.project}: ${snap.size} PLCs, ${plans.length} rejoined members with a removed entry.`
  );
  for (const p of plans) {
    console.log(`  plcs/${p.plcId}  ${p.uid}  role=${p.entry.role}  -> member/active`);
  }

  if (!args.apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to apply.');
    return;
  }
  let reset = 0;
  for (const p of plans) {
    const wrote = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(p.ref)).data();
      if (!staleRejoinUids(fresh).includes(p.uid)) return false;
      tx.update(p.ref, {
        [`members.${p.uid}`]: resetEntry(fresh.members[p.uid]),
        updatedAt: Date.now(),
      });
      return true;
    });
    if (wrote) reset++;
  }
  console.log(`Reset ${reset} of ${plans.length} member entries.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
