/**
 * One-shot backfill: canonicalize legacy building IDs in user-owned data.
 *
 * BACKGROUND
 *   Two parallel building-ID systems drifted apart:
 *
 *     A. The legacy hardcoded BUILDINGS array in config/buildings.ts used
 *        long-form IDs (e.g. 'orono-high-school'). The sidebar's "My
 *        Building(s)" picker wrote these into:
 *          - /users/{uid}/userProfile/profile  →  field `selectedBuildings`
 *          - /users/{uid}                      →  field `buildings`
 *
 *     B. The Organization admin panel
 *        (/organizations/{orgId}/buildings/{id}) writes short-form IDs
 *        ('schumann', 'intermediate', 'middle', 'high', plus newer
 *        org-defined ones like 'orono-community-education'). Member docs
 *        (/organizations/{orgId}/members/{emailLower}.buildingIds) and
 *        feature-permission building filters all use these.
 *
 *   Because the two ID spaces never matched, Admin Settings → Analytics
 *   showed user buildings as "Unknown (orono-high-school)" and feature-
 *   permission filtering / instructional-routine grade matching silently
 *   skipped affected users.
 *
 *   The app code now normalizes legacy → canonical IDs at every read/write
 *   boundary via `canonicalizeBuildingIds()` in config/buildings.ts (so any
 *   user logging in self-heals their own data on the next save). This
 *   script does the same rewrite ahead of time so non-active users don't
 *   linger with legacy IDs and so analytics buckets collapse cleanly.
 *
 * WHAT THIS SCRIPT DOES
 *   - Enumerates every doc under /users/* (collection group not needed —
 *     the two affected fields live on /users/{uid} and
 *     /users/{uid}/userProfile/profile).
 *   - Rewrites `selectedBuildings` (on userProfile/profile) and `buildings`
 *     (on the root /users/{uid} doc) to canonical IDs, deduplicating in
 *     the process.
 *   - Skips writes when the array is already canonical (idempotent).
 *
 * WHAT THIS SCRIPT DOES NOT DO
 *   - Does NOT touch /organizations/{orgId}/members/* — those are already
 *     written using canonical short IDs by setup-organization.js,
 *     backfill-org-members.js, and the live OrganizationPanel UI.
 *   - Does NOT touch /admins/{email} or any admin-only collections.
 *   - Does NOT delete unknown IDs. If a stored ID isn't in the alias map
 *     and isn't a known canonical ID, it's left as-is so a future config
 *     change can recognize it. The app side already shows these as
 *     "Unknown (...)" in admin UIs but treats them as a no-op for filtering.
 *
 * SAFETY
 *   - --dry-run logs every planned change without writing.
 *   - Uses { merge: true } updates so unrelated fields are preserved.
 *   - Skips writes when no IDs would change (no churn on already-canonical
 *     data).
 *
 * Usage:
 *   node scripts/backfill-user-building-ids.js [--dry-run] [--verbose]
 *
 * Credentials resolution (same order as backfill-org-members.js):
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON) — used by CI
 *   2. scripts/service-account-key.json — used by local dev
 *   3. applicationDefault() via GOOGLE_APPLICATION_CREDENTIALS or
 *      `gcloud auth application-default login`
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'spartboard';

/**
 * Legacy → canonical building-id map. Keep in sync with
 * BUILDING_ID_ALIASES in config/buildings.ts. Duplicated here (vs.
 * imported) so this Node script doesn't need a TypeScript build step.
 */
const BUILDING_ID_LEGACY_TO_CANONICAL = {
  'orono-high-school': 'high',
  'orono-middle-school': 'middle',
  'orono-intermediate-school': 'intermediate',
  'schumann-elementary': 'schumann',
};

function canonicalBuildingId(id) {
  return BUILDING_ID_LEGACY_TO_CANONICAL[id] ?? id;
}

/**
 * Returns { canonical, changed } where `canonical` is the deduplicated
 * canonical-ID array and `changed` is true iff the input differed.
 */
function canonicalizeBuildingIds(ids) {
  if (!Array.isArray(ids)) return { canonical: ids, changed: false };
  const seen = new Set();
  const out = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const c = canonicalBuildingId(raw);
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  // Cheap structural-equality check (same length, same order).
  let changed = out.length !== ids.length;
  if (!changed) {
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== ids[i]) {
        changed = true;
        break;
      }
    }
  }
  return { canonical: out, changed };
}

function parseArgs(argv) {
  const args = { dryRun: false, verbose: false, help: false };
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(
    'Usage: node scripts/backfill-user-building-ids.js [--dry-run] [--verbose]'
  );
}

function loadCredentials() {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envJson) {
    try {
      return {
        source: 'FIREBASE_SERVICE_ACCOUNT env',
        creds: JSON.parse(envJson),
        useApplicationDefault: false,
      };
    } catch (e) {
      throw new Error(
        'Failed to parse FIREBASE_SERVICE_ACCOUNT env var as JSON: ' + e.message
      );
    }
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const cred = loadCredentials();
  console.log(`[backfill-user-building-ids] credentials: ${cred.source}`);
  initializeApp({
    credential: cred.useApplicationDefault
      ? applicationDefault()
      : cert(cred.creds),
    projectId: PROJECT_ID,
  });

  const db = getFirestore();
  console.log(
    `[backfill-user-building-ids] mode: ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (writing)'}`
  );

  // Counters
  let usersScanned = 0;
  let rootBuildingsScanned = 0;
  let rootBuildingsChanged = 0;
  let profilesScanned = 0;
  let profilesChanged = 0;

  const usersSnap = await db.collection('users').get();
  console.log(
    `[backfill-user-building-ids] enumerated ${usersSnap.size} /users docs`
  );

  for (const userDoc of usersSnap.docs) {
    usersScanned++;
    const uid = userDoc.id;

    // 1. Root /users/{uid}.buildings
    const rootData = userDoc.data() ?? {};
    if (Array.isArray(rootData.buildings)) {
      rootBuildingsScanned++;
      const { canonical, changed } = canonicalizeBuildingIds(
        rootData.buildings
      );
      if (changed) {
        rootBuildingsChanged++;
        if (args.verbose || args.dryRun) {
          console.log(
            `  [users/${uid}] buildings: ${JSON.stringify(rootData.buildings)} → ${JSON.stringify(canonical)}`
          );
        }
        if (!args.dryRun) {
          await userDoc.ref.set({ buildings: canonical }, { merge: true });
        }
      } else if (args.verbose) {
        console.log(`  [users/${uid}] buildings already canonical, skipping`);
      }
    }

    // 2. /users/{uid}/userProfile/profile.selectedBuildings
    const profileRef = db
      .collection('users')
      .doc(uid)
      .collection('userProfile')
      .doc('profile');
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      if (args.verbose) {
        console.log(`  [users/${uid}/userProfile/profile] missing, skipping`);
      }
      continue;
    }
    profilesScanned++;
    const profileData = profileSnap.data() ?? {};
    if (!Array.isArray(profileData.selectedBuildings)) continue;
    const { canonical, changed } = canonicalizeBuildingIds(
      profileData.selectedBuildings
    );
    if (changed) {
      profilesChanged++;
      if (args.verbose || args.dryRun) {
        console.log(
          `  [users/${uid}/userProfile/profile] selectedBuildings: ${JSON.stringify(profileData.selectedBuildings)} → ${JSON.stringify(canonical)}`
        );
      }
      if (!args.dryRun) {
        await profileRef.set({ selectedBuildings: canonical }, { merge: true });
      }
    } else if (args.verbose) {
      console.log(
        `  [users/${uid}/userProfile/profile] selectedBuildings already canonical, skipping`
      );
    }
  }

  console.log('');
  console.log('[backfill-user-building-ids] summary');
  console.log(`  users scanned:                         ${usersScanned}`);
  console.log(
    `  root .buildings fields scanned:        ${rootBuildingsScanned}`
  );
  console.log(
    `  root .buildings fields changed:        ${rootBuildingsChanged}`
  );
  console.log(`  userProfile/profile docs scanned:      ${profilesScanned}`);
  console.log(`  userProfile/profile docs changed:      ${profilesChanged}`);
  if (args.dryRun) {
    console.log('');
    console.log(
      '  DRY RUN — no writes performed. Re-run without --dry-run to apply.'
    );
  }
}

main().catch((err) => {
  console.error('[backfill-user-building-ids] fatal:', err);
  process.exit(1);
});
