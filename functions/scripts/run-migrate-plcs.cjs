#!/usr/bin/env node
/**
 * One-time PLC migration runner (the `migratePlcs` callable, run as an ops
 * script via the Admin SDK so no Firebase-Auth admin token is needed).
 *
 * It backfills existing PLC root docs: arrays → canonical `members` map,
 * infers `orgId` from member email domains, backfills the `leadUid` mirror,
 * repairs any legacy multi-lead corruption, and seeds the `/aggregates`
 * skeleton. Idempotent + safe to re-run (dual-shape reads keep un-migrated
 * PLCs working in the meantime).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SETUP (one of):
 *   • `gcloud auth application-default login`   (uses your Google login), OR
 *   • export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
 *       (the SA needs Cloud Datastore User / Firestore read+write on `spartboard`)
 *
 * USAGE:
 *   1. DRY RUN (read-only — reports exactly what would change, writes nothing):
 *        node functions/scripts/run-migrate-plcs.cjs --dry-run
 *   2. COMMIT (performs the migration — build the functions first so the exact
 *      tested logic is used):
 *        pnpm -C functions build
 *        node functions/scripts/run-migrate-plcs.cjs --commit
 *
 * Project defaults to `spartboard`; override with GCLOUD_PROJECT.
 * ──────────────────────────────────────────────────────────────────────────
 */
const admin = require('firebase-admin');

const COMMIT = process.argv.includes('--commit');
const DRY = process.argv.includes('--dry-run') || !COMMIT;
const PROJECT = process.env.GCLOUD_PROJECT || 'spartboard';

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

async function dryRun() {
  const snap = await db.collection('plcs').get();
  let total = 0,
    withMap = 0,
    needsMap = 0,
    withOrg = 0,
    withoutOrg = 0,
    multiLead = 0,
    missingLead = 0;
  const sample = [];
  snap.forEach((d) => {
    total++;
    const x = d.data();
    const m = x.members;
    const hasMap = m && typeof m === 'object' && Object.keys(m).length > 0;
    if (hasMap) withMap++;
    else needsMap++;
    if (typeof x.orgId === 'string' && x.orgId) withOrg++;
    else withoutOrg++;
    if (!x.leadUid) missingLead++;
    if (hasMap) {
      const leads = Object.values(m).filter((e) => e && e.role === 'lead').length;
      if (leads > 1) multiLead++;
    }
    if (sample.length < 25) {
      sample.push({
        id: d.id,
        name: x.name,
        hasMembersMap: !!hasMap,
        orgId: x.orgId ?? null,
        memberUids: Array.isArray(x.memberUids) ? x.memberUids.length : 0,
        leadUid: x.leadUid ? 'set' : 'MISSING',
      });
    }
  });
  console.log('=== DRY RUN — /plcs (read-only, NOTHING written) ===');
  console.log(
    JSON.stringify(
      {
        totalPlcs: total,
        alreadyHaveMembersMap: withMap,
        needMembersMapMigration: needsMap,
        haveOrgId: withOrg,
        missingOrgId_candidateForInference: withoutOrg,
        legacyMultiLeadCorruption: multiLead,
        missingLeadUid: missingLead,
      },
      null,
      2
    )
  );
  console.log('--- sample (up to 25) ---');
  console.log(JSON.stringify(sample, null, 2));
  console.log(
    '\nReview the above. To perform the migration: `pnpm -C functions build` then re-run with --commit.'
  );
}

async function commit() {
  let runMigratePlcs;
  try {
    ({ runMigratePlcs } = require('../lib/migratePlcs'));
  } catch (e) {
    console.error(
      'Could not load ../lib/migratePlcs — build the functions first:\n  pnpm -C functions build\n(' +
        e.message +
        ')'
    );
    process.exit(2);
  }
  console.log(`=== COMMIT — running migratePlcs against project "${PROJECT}" ===`);
  const result = await runMigratePlcs(db, () =>
    admin.firestore.FieldValue.serverTimestamp()
  );
  console.log('Migration complete:', JSON.stringify(result, null, 2));
}

(async () => {
  if (DRY && !COMMIT) await dryRun();
  else await commit();
  process.exit(0);
})().catch((e) => {
  console.error('ERROR:', e && e.message ? e.message : e);
  process.exit(1);
});
