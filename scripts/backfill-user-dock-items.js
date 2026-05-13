/**
 * One-shot backfill: seed `userProfile.profile.dockItems` for users whose
 * profile is missing it.
 *
 * BACKGROUND
 *   PR #1615 introduced cross-device dock sync by mirroring `dockItems`,
 *   `libraryOrder`, and `dockInitialized` from the client to
 *   `/users/{uid}/userProfile/profile`. A migration bug (since fixed in
 *   PR #1618) wiped legacy localStorage dock state on the first load of
 *   the new code WITHOUT first copying it to the cloud, leaving affected
 *   users with no `dockItems` in Firestore. On their next sign-in the
 *   client now self-heals — the seeding effect computes building-aware
 *   defaults and persists them — but this script lets us populate the
 *   defaults proactively so the cloud has the data ready before users
 *   reload.
 *
 * WHAT THIS SCRIPT DOES
 *   - Loads every feature_permission and indexes `config.dockDefaults`
 *     keyed by widgetType (canonicalizing legacy building IDs).
 *   - Loads /admins/* to determine which users are admins (for filtering
 *     admin-level widgets).
 *   - Sweeps `userProfile` via collectionGroup query.
 *   - For each profile MISSING `dockItems`, computes the same default
 *     toolset that `getDefaultDockTools()` in DashboardContext would
 *     produce on the client:
 *       - selectedBuildings empty → all enabled widgets the user can
 *         access (public, plus beta-listed and admin-tier if applicable)
 *       - selectedBuildings non-empty → union of widgets whose
 *         dockDefaults match ANY of the user's buildings, filtered the
 *         same way; fallback to ['time-tool'] when the union is empty.
 *   - Writes `dockItems` (as `[{type:'tool', toolType: <type>}]`) and
 *     `dockInitialized: true`. Does NOT write `libraryOrder` — the
 *     client populates it from the TOOLS array on first hydration.
 *
 * WHAT THIS SCRIPT DOES NOT DO
 *   - Does NOT touch profiles that already have a `dockItems` field
 *     (including empty arrays — those signal "user actively cleared
 *     their dock" and shouldn't be re-seeded against their wishes).
 *   - Does NOT modify `libraryOrder` — left for the client to seed.
 *   - Does NOT touch /admins/* or feature_permissions.
 *
 * SAFETY
 *   - --dry-run logs every planned write without committing.
 *   - Uses { merge: true } so existing profile fields are preserved.
 *
 * Usage:
 *   node scripts/backfill-user-dock-items.js [--dry-run] [--verbose]
 *
 * Credentials resolution (same order as backfill-user-building-ids.js):
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON) — used by CI
 *   2. scripts/service-account-key.json — used by local dev
 *   3. applicationDefault() via GOOGLE_APPLICATION_CREDENTIALS or
 *      `gcloud auth application-default login`
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'spartboard';

/**
 * Legacy → canonical building-id map. Keep in sync with
 * BUILDING_ID_ALIASES in config/buildings.ts.
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

function canonicalizeBuildingKeyedRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const out = Object.create(null);
  for (const [rawKey, value] of Object.entries(record)) {
    out[canonicalBuildingId(rawKey)] = value;
  }
  return out;
}

function canonicalizeBuildingIds(ids) {
  if (!Array.isArray(ids)) return [];
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
  return out;
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
    'Usage: node scripts/backfill-user-dock-items.js [--dry-run] [--verbose]'
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

/**
 * Computes the default dock toolset for a user, mirroring
 * `getDefaultDockTools()` in context/DashboardContext.tsx.
 */
function computeDefaultDockTools(
  featurePermissions,
  selectedBuildings,
  userEmail,
  isAdmin,
  allToolTypes
) {
  const isPermAccessible = (perm) => {
    const isEnabled = perm.enabled !== false;
    const isAccessibleByRole = perm.accessLevel !== 'admin' || isAdmin === true;
    const isBetaAccessible =
      perm.accessLevel !== 'beta' ||
      (Array.isArray(perm.betaUsers) && perm.betaUsers.includes(userEmail));
    return isEnabled && isAccessibleByRole && isBetaAccessible;
  };

  const permByType = new Map(featurePermissions.map((p) => [p.widgetType, p]));

  // No building selected → "show all content": return all accessible
  // tools from the TOOLS list. Widgets without a permission record are
  // public by default.
  if (selectedBuildings.length === 0) {
    return allToolTypes.filter((type) => {
      const perm = permByType.get(type);
      if (!perm) return true;
      return isPermAccessible(perm);
    });
  }

  const tools = [];
  for (const perm of featurePermissions) {
    const rawDockDefaults = perm.config?.dockDefaults;
    if (!rawDockDefaults) continue;
    const dockDefaults = canonicalizeBuildingKeyedRecord(rawDockDefaults);
    const isDefaultForAnyBuilding = selectedBuildings.some(
      (bid) => dockDefaults[bid] === true
    );
    if (!isDefaultForAnyBuilding) continue;
    if (isPermAccessible(perm)) {
      tools.push(perm.widgetType);
    }
  }

  if (tools.length === 0) {
    tools.push('time-tool');
  }

  return tools;
}

/**
 * The full WidgetType + InternalToolType union. Kept in sync with
 * `TOOLS` in config/tools.ts. New widgets added in the future will be
 * picked up automatically by the client-side WidgetLibrary's auto-merge
 * of TOOLS into `libraryOrder` (see WidgetLibrary.tsx). For the "no
 * building selected" code path here we only use this list as the
 * starting set to filter; missing future entries would just mean the
 * backfilled dock lacks them until the user reorders their library.
 */
const TOOL_TYPES = [
  'url',
  'soundboard',
  'clock',
  'time-tool',
  'traffic',
  'text',
  'checklist',
  'random',
  'dice',
  'sound',
  'drawing',
  'qr',
  'embed',
  'poll',
  'activity-wall',
  'webcam',
  'scoreboard',
  'expectations',
  'weather',
  'schedule',
  'specialist-schedule',
  'graphic-organizer',
  'calendar',
  'lunchCount',
  'classes',
  'car-rider-pro',
  'blending-board',
  'first-5',
  'instructionalRoutines',
  'miniApp',
  'materials',
  'stickers',
  'seating-chart',
  'catalyst',
  'smartNotebook',
  'recessGear',
  'pdf',
  'quiz',
  'talking-tool',
  'breathing',
  'mathTools',
  'nextUp',
  'numberLine',
  'music',
  'record',
  'magic',
  'remote',
  'reveal-grid',
  'syntax-framer',
  'hotspot-image',
  'concept-web',
  'starter-pack',
  'video-activity',
  'guided-learning',
  'countdown',
  'work-symbols',
  'blooms-taxonomy',
  'need-do-put-then',
  'stations',
];

async function loadFeaturePermissions(db) {
  const snap = await db.collection('feature_permissions').get();
  return snap.docs.map((d) => ({
    widgetType: d.id,
    ...d.data(),
  }));
}

async function loadAdminEmails(db) {
  const snap = await db.collection('admins').get();
  return new Set(snap.docs.map((d) => d.id.toLowerCase()));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const cred = loadCredentials();
  console.log(`[backfill-user-dock-items] credentials: ${cred.source}`);
  initializeApp({
    credential: cred.useApplicationDefault
      ? applicationDefault()
      : cert(cred.creds),
    projectId: PROJECT_ID,
  });

  const db = getFirestore();
  const auth = getAuth();

  console.log('[backfill-user-dock-items] loading feature_permissions...');
  const featurePermissions = await loadFeaturePermissions(db);
  console.log(
    `[backfill-user-dock-items] loaded ${featurePermissions.length} feature_permissions`
  );

  console.log('[backfill-user-dock-items] loading admins...');
  const adminEmails = await loadAdminEmails(db);
  console.log(
    `[backfill-user-dock-items] loaded ${adminEmails.size} admin emails`
  );

  console.log(
    '[backfill-user-dock-items] sweeping userProfile collectionGroup...'
  );
  const profiles = await db.collectionGroup('userProfile').get();
  console.log(
    `[backfill-user-dock-items] found ${profiles.size} userProfile docs`
  );

  let plannedWrites = 0;
  let skippedAlreadyHasDock = 0;
  let skippedNotProfileDoc = 0;
  let skippedNoUidPath = 0;
  let writeFailures = 0;
  let writeSuccesses = 0;

  for (const profileDoc of profiles.docs) {
    // Only target the canonical `userProfile/profile` doc — there are
    // other docs in the userProfile subcollection we don't want to
    // touch.
    if (profileDoc.id !== 'profile') {
      skippedNotProfileDoc++;
      continue;
    }

    const data = profileDoc.data();
    if (Object.prototype.hasOwnProperty.call(data, 'dockItems')) {
      skippedAlreadyHasDock++;
      if (args.verbose) {
        console.log(`  SKIP (already has dockItems): ${profileDoc.ref.path}`);
      }
      continue;
    }

    // Path is /users/{uid}/userProfile/profile — extract uid.
    const pathParts = profileDoc.ref.path.split('/');
    const usersIdx = pathParts.indexOf('users');
    if (usersIdx < 0 || pathParts.length < usersIdx + 2) {
      skippedNoUidPath++;
      console.warn(
        `  SKIP (unexpected path, can't extract uid): ${profileDoc.ref.path}`
      );
      continue;
    }
    const uid = pathParts[usersIdx + 1];

    // Look up the user's email to evaluate beta-access permissions, and
    // their admin status to evaluate admin-tier widgets.
    let userEmail = '';
    let isAdmin = false;
    try {
      const userRecord = await auth.getUser(uid);
      userEmail = (userRecord.email ?? '').toLowerCase();
      isAdmin = adminEmails.has(userEmail);
    } catch (err) {
      // User may have been deleted but their profile lingers — fall
      // back to public-only widget defaults (no email = no beta, no
      // admin).
      if (args.verbose) {
        console.warn(
          `  WARN: getUser(${uid}) failed (${err.code ?? err.message}), proceeding with no email/admin`
        );
      }
    }

    const rawSelectedBuildings = Array.isArray(data.selectedBuildings)
      ? data.selectedBuildings
      : [];
    const selectedBuildings = canonicalizeBuildingIds(rawSelectedBuildings);

    const defaultTools = computeDefaultDockTools(
      featurePermissions,
      selectedBuildings,
      userEmail,
      isAdmin,
      TOOL_TYPES
    );
    const dockItems = defaultTools.map((type) => ({
      type: 'tool',
      toolType: type,
    }));

    plannedWrites++;
    const summary = `uid=${uid} email=${userEmail || '<unknown>'} admin=${isAdmin} buildings=[${selectedBuildings.join(',')}] tools=${dockItems.length}`;

    if (args.dryRun) {
      console.log(`  DRY-RUN: would write ${summary}`);
      if (args.verbose) {
        console.log(`           dockItems=${JSON.stringify(defaultTools)}`);
      }
      continue;
    }

    try {
      await profileDoc.ref.set(
        {
          dockItems,
          dockInitialized: true,
        },
        { merge: true }
      );
      writeSuccesses++;
      console.log(`  WROTE: ${summary}`);
    } catch (err) {
      writeFailures++;
      console.error(
        `  WRITE FAILED for ${profileDoc.ref.path}: ${err.message ?? err}`
      );
    }
  }

  console.log('\n[backfill-user-dock-items] summary');
  console.log(`  profiles scanned:          ${profiles.size}`);
  console.log(`  skipped (not profile doc): ${skippedNotProfileDoc}`);
  console.log(`  skipped (no uid in path):  ${skippedNoUidPath}`);
  console.log(`  skipped (already has):     ${skippedAlreadyHasDock}`);
  console.log(`  planned writes:            ${plannedWrites}`);
  if (!args.dryRun) {
    console.log(`  writes succeeded:          ${writeSuccesses}`);
    console.log(`  writes failed:             ${writeFailures}`);
  }
}

main().catch((err) => {
  console.error('[backfill-user-dock-items] FAILED:', err);
  process.exit(1);
});
