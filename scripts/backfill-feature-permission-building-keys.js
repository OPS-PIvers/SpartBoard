/**
 * One-shot backfill: canonicalize legacy building-ID keys in
 * /feature_permissions/{widgetType}.config.dockDefaults and .buildingDefaults.
 *
 * BACKGROUND
 *   Feature-permission docs were written when the admin panel wrote
 *   long-form legacy building IDs (`orono-high-school`, `orono-middle-school`,
 *   `orono-intermediate-school`, `schumann-elementary`). The Organization
 *   admin panel has since switched to canonical short IDs (`high`,
 *   `middle`, `intermediate`, `schumann`), and user `selectedBuildings`
 *   are canonicalized on every read/write in AuthContext. The old
 *   feature-permission keys never got rewritten, so per-building lookups
 *   like `dockDefaults['high']` silently missed and every teacher fell
 *   through to the `['time-tool']` fallback in getDefaultDockTools().
 *
 *   The app code now normalizes feature-permission keys at the two dock
 *   lookup sites (getDefaultDockTools + getAdminBuildingConfig in
 *   context/DashboardContext.tsx) via canonicalizeBuildingKeyedRecord
 *   from config/buildings.ts. That covers the dock tool list and
 *   newly-placed widget seeding; it does NOT cover the ~dozen per-widget
 *   hooks that read `buildingDefaults[buildingId]` directly (BloomsTaxonomy,
 *   Calendar, Embed, MaterialsWidget, QR, Schedule, SpecialistSchedule,
 *   Soundboard, useClassLinkEnabled, etc.) — those still miss until
 *   Firestore holds canonical keys. So THIS SCRIPT IS REQUIRED for
 *   already-placed widgets to start picking up their per-building
 *   overrides. The runtime fix is a belt for the dock; the backfill is
 *   the suspenders for everything else.
 *
 * CONCURRENCY NOTE
 *   The Feature Permissions admin UI does a full `setDoc` replacement on
 *   save (no merge) and modal-based widget configs do `setDoc({ merge:
 *   true })`. Either path, if saved with a stale in-memory copy AFTER
 *   this backfill runs, can reintroduce or even wipe the canonical keys.
 *   Run outside admin working hours, or re-run the backfill (idempotent)
 *   if you know an admin save happened after the rewrite.
 *
 * WHAT THIS SCRIPT DOES
 *   - Enumerates every doc in /feature_permissions/*.
 *   - For each doc, canonicalizes the KEYS of config.dockDefaults and
 *     config.buildingDefaults (values are passed through untouched).
 *   - Writes back with { merge: true } only when a key actually changed.
 *   - When the same canonical ID has both a legacy-keyed and a
 *     canonical-keyed entry with differing values, the canonical-keyed
 *     value wins — it reflects the admin panel's most recent intent.
 *     Collision events are logged.
 *
 * WHAT THIS SCRIPT DOES NOT DO
 *   - Does NOT touch anything outside /feature_permissions/*.
 *   - Does NOT delete unknown IDs. If a stored key isn't in the alias
 *     map and isn't a known canonical ID, it's left as-is.
 *
 * SAFETY
 *   - --dry-run logs every planned change without writing.
 *   - Uses { merge: true } so unrelated fields on the doc are preserved.
 *   - Idempotent — re-running on already-canonical data writes nothing.
 *
 * Usage:
 *   node scripts/backfill-feature-permission-building-keys.js [--dry-run] [--verbose]
 *
 * Credentials resolution (same as backfill-user-building-ids.js):
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON)
 *   2. scripts/service-account-key.json
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

// Keep in sync with BUILDING_ID_ALIASES in config/buildings.ts. Duplicated
// here (vs. imported) so this Node script doesn't need a TS build step.
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
 * Canonicalizes the keys of a { [buildingId]: value } record.
 *
 * Returns { canonical, changed, collisions } where:
 *   - `canonical`  — a new record with keys normalized.
 *   - `changed`    — true iff the rewrite differs from the input (any
 *                    legacy key rewritten, or any duplicate collapsed).
 *   - `collisions` — list of { canonicalKey, legacyKey, legacyValue,
 *                    canonicalValue } entries where both a legacy and a
 *                    canonical key mapped to the same ID with different
 *                    values. Canonical wins; collision is logged so an
 *                    operator can eyeball it.
 */
function canonicalizeBuildingKeyedRecord(record) {
  if (!record || typeof record !== 'object') {
    return { canonical: record, changed: false, collisions: [] };
  }
  // Object.create(null) so a stored key like "__proto__" (however
  // unlikely) doesn't walk the prototype chain or trigger the setter.
  const out = Object.create(null);
  const collisions = [];

  // First pass: collect canonical-origin entries so they win collisions.
  for (const [rawKey, value] of Object.entries(record)) {
    const canonical = canonicalBuildingId(rawKey);
    if (rawKey === canonical) {
      out[canonical] = value;
    }
  }
  // Second pass: fill in from legacy-origin entries where no canonical
  // entry already won.
  for (const [rawKey, value] of Object.entries(record)) {
    const canonical = canonicalBuildingId(rawKey);
    if (rawKey === canonical) continue;
    if (canonical in out) {
      if (!deepEqual(out[canonical], value)) {
        collisions.push({
          canonicalKey: canonical,
          legacyKey: rawKey,
          legacyValue: value,
          canonicalValue: out[canonical],
        });
      }
      continue;
    }
    out[canonical] = value;
  }

  const inputKeys = Object.keys(record);
  const outKeys = Object.keys(out);
  let changed = inputKeys.length !== outKeys.length;
  if (!changed) {
    for (const k of inputKeys) {
      if (!(k in out)) {
        changed = true;
        break;
      }
    }
  }
  return { canonical: out, changed, collisions };
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
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
    'Usage: node scripts/backfill-feature-permission-building-keys.js [--dry-run] [--verbose]'
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
  console.log(
    `[backfill-feature-permission-building-keys] credentials: ${cred.source}`
  );
  initializeApp({
    credential: cred.useApplicationDefault
      ? applicationDefault()
      : cert(cred.creds),
    projectId: PROJECT_ID,
  });

  const db = getFirestore();
  console.log(
    `[backfill-feature-permission-building-keys] mode: ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (writing)'}`
  );

  let docsScanned = 0;
  let dockDefaultsChanged = 0;
  let buildingDefaultsChanged = 0;
  let collisionsLogged = 0;

  const snap = await db.collection('feature_permissions').get();
  console.log(
    `[backfill-feature-permission-building-keys] enumerated ${snap.size} /feature_permissions docs`
  );

  for (const doc of snap.docs) {
    docsScanned++;
    const widgetType = doc.id;
    const data = doc.data() ?? {};
    const config = data.config ?? {};

    const updatePayload = {};

    // dockDefaults — { [buildingId]: boolean }
    if (config.dockDefaults && typeof config.dockDefaults === 'object') {
      const { canonical, changed, collisions } =
        canonicalizeBuildingKeyedRecord(config.dockDefaults);
      if (changed) {
        dockDefaultsChanged++;
        if (args.verbose || args.dryRun) {
          console.log(
            `  [feature_permissions/${widgetType}] dockDefaults: ${JSON.stringify(config.dockDefaults)} → ${JSON.stringify(canonical)}`
          );
        }
        updatePayload['config.dockDefaults'] = canonical;
      }
      for (const c of collisions) {
        collisionsLogged++;
        console.warn(
          `  [feature_permissions/${widgetType}] dockDefaults COLLISION on '${c.canonicalKey}': canonical=${JSON.stringify(c.canonicalValue)} wins over legacy '${c.legacyKey}'=${JSON.stringify(c.legacyValue)}`
        );
      }
    }

    // buildingDefaults — { [buildingId]: { …widgetConfigOverrides } }
    if (
      config.buildingDefaults &&
      typeof config.buildingDefaults === 'object'
    ) {
      const { canonical, changed, collisions } =
        canonicalizeBuildingKeyedRecord(config.buildingDefaults);
      if (changed) {
        buildingDefaultsChanged++;
        if (args.verbose || args.dryRun) {
          console.log(
            `  [feature_permissions/${widgetType}] buildingDefaults: ${JSON.stringify(config.buildingDefaults)} → ${JSON.stringify(canonical)}`
          );
        }
        updatePayload['config.buildingDefaults'] = canonical;
      }
      for (const c of collisions) {
        collisionsLogged++;
        console.warn(
          `  [feature_permissions/${widgetType}] buildingDefaults COLLISION on '${c.canonicalKey}': canonical=${JSON.stringify(c.canonicalValue)} wins over legacy '${c.legacyKey}'=${JSON.stringify(c.legacyValue)}`
        );
      }
    }

    if (Object.keys(updatePayload).length > 0 && !args.dryRun) {
      // Using update() with dot-paths lets us rewrite only the two nested
      // keys; other config fields (accessLevel, enabled, admin-specific
      // overrides, etc.) stay intact.
      await doc.ref.update(updatePayload);
    } else if (Object.keys(updatePayload).length === 0 && args.verbose) {
      console.log(
        `  [feature_permissions/${widgetType}] already canonical, skipping`
      );
    }
  }

  console.log('');
  console.log('[backfill-feature-permission-building-keys] summary');
  console.log(`  docs scanned:                ${docsScanned}`);
  console.log(`  dockDefaults rewritten:      ${dockDefaultsChanged}`);
  console.log(`  buildingDefaults rewritten:  ${buildingDefaultsChanged}`);
  console.log(`  collisions logged:           ${collisionsLogged}`);
  if (args.dryRun) {
    console.log('');
    console.log(
      '  DRY RUN — no writes performed. Re-run without --dry-run to apply.'
    );
  }
}

main().catch((err) => {
  console.error('[backfill-feature-permission-building-keys] fatal:', err);
  process.exit(1);
});
