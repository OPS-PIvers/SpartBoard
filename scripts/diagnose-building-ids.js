/**
 * Diagnostic: Building ID alignment between user profiles, root user docs,
 * org-defined buildings, and org member assignments.
 *
 * READ-ONLY. Makes no writes.
 *
 * Outputs:
 *   - Distinct building IDs present in users/{uid}/userProfile/profile.selectedBuildings
 *   - Distinct building IDs present in users/{uid}.buildings (root doc)
 *   - All /organizations/{orgId}/buildings/{id} doc IDs
 *   - All distinct buildingIds across /organizations/{orgId}/members/{email}.buildingIds
 *   - Mismatch analysis: which IDs appear in user data but NOT in org-defined buildings
 *
 * Usage:
 *   node scripts/diagnose-building-ids.js [--org <orgId>]
 *
 * Defaults to scanning all orgs found under /organizations.
 *
 * Credentials resolution (same as setup-organization.js):
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON)
 *   2. scripts/service-account-key.json
 *   3. GOOGLE_APPLICATION_CREDENTIALS (Application Default Credentials)
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(argv) {
  const args = { org: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--org') args.org = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
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
  const path = join(__dirname, 'service-account-key.json');
  try {
    return {
      source: 'scripts/service-account-key.json',
      creds: JSON.parse(readFileSync(path, 'utf8')),
      useApplicationDefault: false,
    };
  } catch {
    // Fall through to ADC.
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      source: `GOOGLE_APPLICATION_CREDENTIALS=${process.env.GOOGLE_APPLICATION_CREDENTIALS}`,
      creds: null,
      useApplicationDefault: true,
    };
  }
  throw new Error(
    'Firebase Admin credentials not found. Place key at scripts/service-account-key.json'
  );
}

function bumpCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function fmtMapDesc(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `    ${JSON.stringify(k)}  →  ${v}`)
    .join('\n');
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/diagnose-building-ids.js [--org <orgId>]\n\n' +
        'Reads (no writes):\n' +
        '  - users/{uid}/userProfile/profile.selectedBuildings\n' +
        '  - users/{uid}.buildings\n' +
        '  - /organizations/{orgId}/buildings/*\n' +
        '  - /organizations/{orgId}/members/*.buildingIds'
    );
    process.exit(0);
  }

  const { source, creds, useApplicationDefault } = loadCredentials();
  console.log(`✅ Using credentials from ${source}\n`);

  initializeApp({
    credential: useApplicationDefault ? applicationDefault() : cert(creds),
    ...(useApplicationDefault && process.env.FIREBASE_PROJECT_ID
      ? { projectId: process.env.FIREBASE_PROJECT_ID }
      : {}),
  });
  const db = getFirestore();

  // ─── 1. User profiles (selectedBuildings) ────────────────────────────────
  console.log(
    '📥 Reading users/{uid}/userProfile/profile.selectedBuildings via collectionGroup…'
  );
  const profileSnap = await db.collectionGroup('userProfile').get();
  const selectedBuildingsCounts = new Map();
  let profileCount = 0;
  let profilesWithBuildings = 0;
  for (const doc of profileSnap.docs) {
    if (doc.id !== 'profile') continue;
    profileCount += 1;
    const data = doc.data();
    if (
      Array.isArray(data?.selectedBuildings) &&
      data.selectedBuildings.length > 0
    ) {
      profilesWithBuildings += 1;
      for (const id of data.selectedBuildings) {
        bumpCount(selectedBuildingsCounts, String(id));
      }
    }
  }
  console.log(
    `   Scanned ${profileCount} profile docs, ${profilesWithBuildings} have selectedBuildings.`
  );

  // ─── 2. Root user docs (.buildings) ──────────────────────────────────────
  console.log('\n📥 Reading users/{uid}.buildings (root doc)…');
  const usersSnap = await db.collection('users').get();
  const rootBuildingsCounts = new Map();
  let usersWithRootBuildings = 0;
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (Array.isArray(data?.buildings) && data.buildings.length > 0) {
      usersWithRootBuildings += 1;
      for (const id of data.buildings) {
        bumpCount(rootBuildingsCounts, String(id));
      }
    }
  }
  console.log(
    `   Scanned ${usersSnap.size} root user docs, ${usersWithRootBuildings} have .buildings.`
  );

  // ─── 3. Org-defined buildings ────────────────────────────────────────────
  console.log('\n📥 Reading /organizations/*/buildings/*…');
  const orgsSnap = await db.collection('organizations').get();
  const targetOrgs = args.org
    ? orgsSnap.docs.filter((d) => d.id === args.org)
    : orgsSnap.docs;
  if (args.org && targetOrgs.length === 0) {
    console.warn(`   ⚠️  No organization found with id "${args.org}".`);
  }
  const orgBuildings = new Map(); // orgId → [{id, name}]
  const orgMemberBuildingIds = new Map(); // orgId → Map<id, count>
  for (const orgDoc of targetOrgs) {
    const orgId = orgDoc.id;
    const buildingsSnap = await db
      .collection('organizations')
      .doc(orgId)
      .collection('buildings')
      .get();
    orgBuildings.set(
      orgId,
      buildingsSnap.docs.map((b) => ({
        id: b.id,
        name: b.data()?.name ?? '(no name)',
      }))
    );

    const memberSnap = await db
      .collection('organizations')
      .doc(orgId)
      .collection('members')
      .get();
    const counts = new Map();
    for (const m of memberSnap.docs) {
      const ids = m.data()?.buildingIds;
      if (Array.isArray(ids)) {
        for (const id of ids) bumpCount(counts, String(id));
      }
    }
    orgMemberBuildingIds.set(orgId, counts);
  }

  // ─── 4. Report ───────────────────────────────────────────────────────────
  const banner = (s) =>
    console.log(`\n${'═'.repeat(72)}\n  ${s}\n${'═'.repeat(72)}`);

  banner('USER PROFILE selectedBuildings (sidebar writes here)');
  if (selectedBuildingsCounts.size === 0) {
    console.log('  (none)');
  } else {
    console.log(fmtMapDesc(selectedBuildingsCounts));
  }

  banner('ROOT USER DOC .buildings (mirror for analytics)');
  if (rootBuildingsCounts.size === 0) {
    console.log('  (none)');
  } else {
    console.log(fmtMapDesc(rootBuildingsCounts));
  }

  banner('ORG-DEFINED BUILDINGS  /organizations/{orgId}/buildings/*');
  if (orgBuildings.size === 0) {
    console.log('  (no organizations found)');
  } else {
    for (const [orgId, list] of orgBuildings) {
      console.log(`  org="${orgId}":`);
      if (list.length === 0) {
        console.log('    (no building docs)');
      } else {
        for (const b of list) {
          console.log(`    ${JSON.stringify(b.id)}  (name: ${b.name})`);
        }
      }
    }
  }

  banner('ORG MEMBER buildingIds  /organizations/{orgId}/members/*');
  for (const [orgId, counts] of orgMemberBuildingIds) {
    console.log(`  org="${orgId}":`);
    if (counts.size === 0) {
      console.log('    (no buildingIds set)');
    } else {
      console.log(fmtMapDesc(counts));
    }
  }

  // ─── 5. Mismatch analysis ────────────────────────────────────────────────
  banner('MISMATCH ANALYSIS');
  const allOrgBuildingIds = new Set();
  for (const list of orgBuildings.values()) {
    for (const b of list) allOrgBuildingIds.add(b.id);
  }

  const profileNotInOrg = [...selectedBuildingsCounts.keys()].filter(
    (id) => !allOrgBuildingIds.has(id)
  );
  const orgNotInProfile = [...allOrgBuildingIds].filter(
    (id) => !selectedBuildingsCounts.has(id)
  );

  console.log(
    `  user-profile IDs that are NOT defined in any org's buildings (${profileNotInOrg.length}):`
  );
  if (profileNotInOrg.length === 0) {
    console.log('    (none — clean!)');
  } else {
    for (const id of profileNotInOrg) {
      console.log(
        `    ${JSON.stringify(id)}  (used by ${selectedBuildingsCounts.get(id)} user(s))`
      );
    }
  }

  console.log(
    `\n  org-defined building IDs that NO user profile references (${orgNotInProfile.length}):`
  );
  if (orgNotInProfile.length === 0) {
    console.log('    (none — clean!)');
  } else {
    for (const id of orgNotInProfile) {
      console.log(`    ${JSON.stringify(id)}`);
    }
  }

  // Profile vs root drift
  const onlyInProfile = [...selectedBuildingsCounts.keys()].filter(
    (id) => !rootBuildingsCounts.has(id)
  );
  const onlyInRoot = [...rootBuildingsCounts.keys()].filter(
    (id) => !selectedBuildingsCounts.has(id)
  );
  if (onlyInProfile.length > 0 || onlyInRoot.length > 0) {
    console.log(
      `\n  ⚠️  Drift between user profile selectedBuildings and root .buildings:`
    );
    if (onlyInProfile.length > 0) {
      console.log(
        `     IDs only in profile: ${onlyInProfile.map((s) => JSON.stringify(s)).join(', ')}`
      );
    }
    if (onlyInRoot.length > 0) {
      console.log(
        `     IDs only in root:    ${onlyInRoot.map((s) => JSON.stringify(s)).join(', ')}`
      );
    }
  } else {
    console.log(
      '\n  ✅ Profile selectedBuildings and root .buildings are aligned.'
    );
  }

  console.log('\n✨ Diagnostic complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ diagnose-building-ids failed:', err.message ?? err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
