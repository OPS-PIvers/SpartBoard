// One-off: mark auto-rostered building group members whose org member doc is student-role as removed; dry run unless --apply.

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

/** Active auto-rostered members of a building group the auto-roster may remove (never a lead or co-lead), as [uid, email]. */
export function autoRosteredMembers(plc) {
  if (plc?.groupType !== 'building' || typeof plc.orgId !== 'string') return [];
  const members =
    plc.members && typeof plc.members === 'object' ? plc.members : {};
  return Object.entries(members)
    .filter(
      ([uid, m]) =>
        m?.addedBy === 'autoRoster' &&
        m.status !== 'removed' &&
        m.role !== 'lead' &&
        m.role !== 'coLead' &&
        uid !== plc.leadUid &&
        typeof m.email === 'string' &&
        m.email !== ''
    )
    .map(([uid, m]) => [uid, m.email.toLowerCase()]);
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
      'Usage: node scripts/remove-student-building-group-members.mjs --project <id> [--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }

  initializeApp({ credential: credential(args.project), projectId: args.project });
  const db = getFirestore();

  const snap = await db
    .collection('plcs')
    .where('groupType', '==', 'building')
    .get();
  const studentRole = new Map();
  const isStudent = async (orgId, email) => {
    const key = `${orgId}/${email}`;
    if (!studentRole.has(key)) {
      const m = await db.doc(`organizations/${orgId}/members/${email}`).get();
      studentRole.set(key, m.get('roleId') === 'student');
    }
    return studentRole.get(key);
  };

  const plans = [];
  for (const d of snap.docs) {
    const data = d.data();
    for (const [uid, email] of autoRosteredMembers(data)) {
      if (await isStudent(data.orgId, email)) {
        plans.push({ ref: d.ref, plcId: d.id, uid, email });
      }
    }
  }

  console.log(
    `${args.project}: ${snap.size} building groups, ${plans.length} auto-rostered student-role members.`
  );
  for (const p of plans) console.log(`  plcs/${p.plcId}  ${p.uid}  ${p.email}`);

  if (!args.apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to apply.');
    return;
  }
  let removed = 0;
  for (const p of plans) {
    const wrote = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(p.ref)).data();
      if (!autoRosteredMembers(fresh).some(([uid]) => uid === p.uid)) {
        return false;
      }
      tx.update(p.ref, {
        [`members.${p.uid}.status`]: 'removed',
        [`memberEmails.${p.uid}`]: FieldValue.delete(),
        memberUids: FieldValue.arrayRemove(p.uid),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (wrote) removed++;
  }
  console.log(`Removed ${removed} of ${plans.length} members.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
