/**
 * Reserve `synced_bank_owners/{groupId}` for synced question bank ids that have no reservation yet.
 *
 * The rules refuse a synced bank create unless the reservation names the caller, so an id without one
 * can be claimed by the first staff user to create it. This records the owner wherever the evidence
 * agrees: the owner's own `users/{uid}/question_banks` metadata (`sync.groupId`, owner-written only),
 * the live `synced_question_banks` doc's `ownerUid`, and PLC `question_banks` headers (`sharedBy`).
 * An id whose sources name more than one uid is listed and left alone for a person to decide.
 *
 * Usage:
 *   node scripts/backfill-synced-bank-owners.mjs            # dry run, counts and conflicts
 *   node scripts/backfill-synced-bank-owners.mjs --apply    # writes
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT env var (JSON) or scripts/service-account-key.json
 * (in a cloud session, `scripts/cloud-run.sh scripts/backfill-synced-bank-owners.mjs`).
 * Idempotent: ids that already have a reservation are skipped, and writes use create().
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OWNERS = 'synced_bank_owners';

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

/** The one uid every source names for an id, or null when they disagree or name none. */
export function agreedOwner(claims) {
  const uids = new Set(
    (claims ?? []).filter((u) => typeof u === 'string' && u !== '')
  );
  return uids.size === 1 ? [...uids][0] : null;
}

/** groupId → claimed owner uids, from user metadata, live canonicals and PLC headers. */
export function collectClaims({ userBanks, liveBanks, plcHeaders }) {
  const claims = new Map();
  const add = (groupId, uid) => {
    if (typeof groupId !== 'string' || !groupId) return;
    if (!claims.has(groupId)) claims.set(groupId, []);
    claims.get(groupId).push(uid);
  };
  for (const b of userBanks) add(b.groupId, b.uid);
  for (const b of liveBanks) add(b.groupId, b.ownerUid);
  for (const h of plcHeaders) add(h.groupId, h.sharedBy);
  return claims;
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  initializeApp({ credential: cert(loadCredentials()) });
  const db = getFirestore();

  const [reserved, live, banks] = await Promise.all([
    db.collection(OWNERS).select().get(),
    db.collection('synced_question_banks').select('ownerUid').get(),
    db.collectionGroup('question_banks').get(),
  ]);
  const reservedIds = new Set(reserved.docs.map((d) => d.id));

  const userBanks = [];
  const plcHeaders = [];
  for (const d of banks.docs) {
    const parent = d.ref.parent.parent;
    const root = parent?.parent.id;
    if (root === 'users') {
      userBanks.push({ uid: parent.id, groupId: d.get('sync.groupId') });
    } else if (root === 'plcs') {
      plcHeaders.push({
        groupId: d.get('syncGroupId'),
        sharedBy: d.get('sharedBy'),
      });
    }
  }
  const claims = collectClaims({
    userBanks,
    liveBanks: live.docs.map((d) => ({
      groupId: d.id,
      ownerUid: d.get('ownerUid'),
    })),
    plcHeaders,
  });

  const toWrite = [];
  const conflicts = [];
  for (const [groupId, uids] of claims) {
    if (reservedIds.has(groupId)) continue;
    const owner = agreedOwner(uids);
    if (owner) toWrite.push({ groupId, owner });
    else conflicts.push({ groupId, uids: [...new Set(uids)] });
  }

  console.log(
    `ids seen ${claims.size}; already reserved ${claims.size - toWrite.length - conflicts.length}; to reserve ${toWrite.length}; conflicts ${conflicts.length}`
  );
  for (const c of conflicts) {
    console.log(`conflict ${c.groupId}: ${c.uids.join(', ') || '(no uid)'}`);
  }
  if (!apply) {
    console.log('Dry run: nothing written. Re-run with --apply to write.');
    return;
  }
  let written = 0;
  for (const { groupId, owner } of toWrite) {
    try {
      await db
        .collection(OWNERS)
        .doc(groupId)
        .create({ ownerUid: owner, at: Date.now() });
      written++;
    } catch (err) {
      if (err?.code !== 6) throw err;
    }
  }
  console.log(`Reserved ${written} ids.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
