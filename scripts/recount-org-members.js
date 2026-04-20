/**
 * One-shot recount of the denormalized `users` counters on
 *   /organizations/{orgId}
 *   /organizations/{orgId}/buildings/{buildingId}
 *   /organizations/{orgId}/domains/{domainId}
 *
 * WHY THIS EXISTS
 *   These fields display in the Organization panel (All Organizations table,
 *   Buildings list, Sign-in domains list). They're denormalized because the
 *   panel otherwise has no way to render a count without reading every
 *   member doc — bad for rules and bad for latency. The Phase 4 CF trigger
 *   that maintains these atomically is still on the Phase 4.1 backlog, so
 *   today the fields read 0 even though /organizations/orono/members/* has
 *   ~92 docs. Running this script makes the UI reflect reality.
 *
 *   It is safe to re-run, but the fields will drift again as invites land,
 *   roles change, or members are removed — until the CF trigger ships.
 *
 * WHAT IT DOES
 *   1. Lists every member doc in /organizations/{orgId}/members.
 *   2. Totals them by: org (single count), buildingId (one per building in
 *      `buildingIds`), and email-domain (stripped of the leading @).
 *   3. Batch-writes each count back onto the corresponding doc with
 *      { merge: true }. Docs that don't exist are left alone (a member
 *      assigned to a building that was later deleted doesn't get the
 *      orphan building resurrected).
 *
 * Usage:
 *   node scripts/recount-org-members.js [--dry-run] [--org <orgId>] [--verbose]
 *
 * Flags:
 *   --dry-run   No writes. Log the planned counters and exit.
 *   --org       Target org id. Defaults to 'orono'.
 *   --verbose   Log per-member bucket assignments.
 *
 * Credentials resolution matches scripts/backfill-org-members.js:
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON)
 *   2. scripts/service-account-key.json
 *   3. applicationDefault() via GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'spartboard';

function parseArgs(argv) {
  const args = { dryRun: false, orgId: 'orono', verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--org') args.orgId = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(
    'Usage: node scripts/recount-org-members.js [--dry-run] [--org <orgId>] [--verbose]'
  );
}

function loadCredentials() {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envJson) {
    return {
      source: 'FIREBASE_SERVICE_ACCOUNT env',
      creds: JSON.parse(envJson),
      useApplicationDefault: false,
    };
  }
  const keyPath = join(__dirname, 'service-account-key.json');
  try {
    const raw = readFileSync(keyPath, 'utf8');
    return {
      source: 'scripts/service-account-key.json',
      creds: JSON.parse(raw),
      useApplicationDefault: false,
    };
  } catch {
    // Fall through to ADC.
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      source:
        'GOOGLE_APPLICATION_CREDENTIALS=' +
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
      creds: null,
      useApplicationDefault: true,
    };
  }
  return {
    source: 'applicationDefault()',
    creds: null,
    useApplicationDefault: true,
  };
}

function emailDomain(email) {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

// Build the three counters from a member list. Extracted so a future CF
// trigger can unit-test the same logic without needing a real Firestore.
function tallyMembers(members, verbose) {
  let orgTotal = 0;
  const byBuilding = new Map();
  const byDomain = new Map();

  for (const m of members) {
    orgTotal += 1;

    const buildingIds = Array.isArray(m.buildingIds) ? m.buildingIds : [];
    for (const id of buildingIds) {
      if (typeof id !== 'string' || !id) continue;
      byBuilding.set(id, (byBuilding.get(id) || 0) + 1);
    }

    const email = typeof m.email === 'string' ? m.email.toLowerCase() : '';
    const domain = emailDomain(email);
    if (domain) {
      byDomain.set(domain, (byDomain.get(domain) || 0) + 1);
    }

    if (verbose) {
      console.log(
        '  [bucket] ' +
          email +
          ' buildings=' +
          JSON.stringify(buildingIds) +
          ' domain=' +
          domain
      );
    }
  }

  return { orgTotal, byBuilding, byDomain };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const { source, creds, useApplicationDefault } = loadCredentials();
  console.log('Using credentials from ' + source);

  const initOpts = {
    projectId: (creds && creds.project_id) || PROJECT_ID,
  };
  if (useApplicationDefault) {
    initOpts.credential = applicationDefault();
  } else {
    initOpts.credential = cert(creds);
  }
  initializeApp(initOpts);

  const db = getFirestore();
  const orgId = args.orgId;
  console.log(
    'Target org: ' +
      orgId +
      (args.dryRun ? '  [DRY RUN]' : '') +
      (args.verbose ? '  [verbose]' : '')
  );

  const membersSnap = await db
    .collection('organizations/' + orgId + '/members')
    .get();
  const members = membersSnap.docs.map((d) => d.data() || {});
  console.log('Loaded ' + members.length + ' member docs.');

  const { orgTotal, byBuilding, byDomain } = tallyMembers(
    members,
    args.verbose
  );

  // We need to map email-domain tallies onto /domains/{id} docs, which store
  // the domain value (e.g. '@orono.k12.mn.us') on a `domain` field — the doc
  // id is a slug ('primary'), not the domain itself.
  const domainsSnap = await db
    .collection('organizations/' + orgId + '/domains')
    .get();
  const domainDocs = domainsSnap.docs.map((d) => ({
    id: d.id,
    domain: ((d.data() || {}).domain || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/^@/, ''),
  }));

  // Buildings similarly — doc id is canonical short id; count by that.
  const buildingsSnap = await db
    .collection('organizations/' + orgId + '/buildings')
    .get();
  const buildingDocs = buildingsSnap.docs.map((d) => ({ id: d.id }));

  console.log('');
  console.log('Planned counters:');
  console.log('  org "' + orgId + '":              ' + orgTotal);
  for (const b of buildingDocs) {
    console.log(
      '  building "' + b.id + '":        ' + (byBuilding.get(b.id) || 0)
    );
  }
  for (const d of domainDocs) {
    console.log(
      '  domain  "' +
        d.id +
        '" (@' +
        d.domain +
        '): ' +
        (byDomain.get(d.domain) || 0)
    );
  }

  // Surface any members whose buildingIds/domains don't match a known doc —
  // useful for catching stale building ids or off-list domains without
  // silently inflating nothing.
  const unknownBuildings = [...byBuilding.keys()].filter(
    (id) => !buildingDocs.some((b) => b.id === id)
  );
  const unknownDomains = [...byDomain.keys()].filter(
    (d) => !domainDocs.some((x) => x.domain === d)
  );
  if (unknownBuildings.length) {
    console.log(
      '  [warn] members reference unknown buildings: ' +
        unknownBuildings.join(', ')
    );
  }
  if (unknownDomains.length) {
    console.log(
      '  [warn] members reference unknown domains: ' + unknownDomains.join(', ')
    );
  }

  if (args.dryRun) {
    console.log('');
    console.log('Dry run only -- no writes were committed.');
    process.exit(0);
  }

  const batch = db.batch();
  batch.set(
    db.doc('organizations/' + orgId),
    { users: orgTotal },
    { merge: true }
  );
  for (const b of buildingDocs) {
    batch.set(
      db.doc('organizations/' + orgId + '/buildings/' + b.id),
      { users: byBuilding.get(b.id) || 0 },
      { merge: true }
    );
  }
  for (const d of domainDocs) {
    batch.set(
      db.doc('organizations/' + orgId + '/domains/' + d.id),
      { users: byDomain.get(d.domain) || 0 },
      { merge: true }
    );
  }
  await batch.commit();

  console.log('');
  console.log('Counters written.');
  process.exit(0);
}

run().catch((err) => {
  console.error(
    '\nrecount-org-members failed: ' + (err && err.message ? err.message : err)
  );
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
});
