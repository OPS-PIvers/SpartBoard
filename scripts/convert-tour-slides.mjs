/**
 * Live tour slide conversion (docs/plans/shipped/LIVE_TOUR_EDITOR.md E11, PR 1).
 *
 * For every `building_guided_learning` set with `mode: 'tour'` and its
 * `building_guided_learning_tours` snapshot, moves each step's slide into
 * `step.tour.thumbnail` and drops slide, region and callout fields. Both
 * copies convert the same way, so a published tour stays "published".
 * `updatedAt` is left alone and Storage objects are not touched.
 *
 * Usage:
 *   node scripts/convert-tour-slides.mjs --project dev --dry-run   # print only
 *   node scripts/convert-tour-slides.mjs --project dev             # write
 *   Writing on prod also needs --confirm-prod.
 *
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 * Never write to prod without Paul's word. Idempotent.
 */

import { resolve, dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { convertTourSet, formatChange } from './lib/convertTourSlides.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };
const COLLECTION = 'building_guided_learning';
const TOURS_COLLECTION = 'building_guided_learning_tours';
const SKIP_TOUR_IDS = new Set(['_meta', '_lock']);
const BATCH_LIMIT = 200;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    project: null,
    confirmProd: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--project') args.project = argv[++i] ?? null;
    else if (a === '--confirm-prod') args.confirmProd = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  if (args.project) args.project = PROJECTS[args.project] ?? 'invalid';
  return args;
}

function prodCredential(cert) {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) return cert(JSON.parse(fromEnv));
  const keyPath = join(__dirname, 'service-account-key.json');
  if (existsSync(keyPath)) {
    return cert(JSON.parse(readFileSync(keyPath, 'utf8')));
  }
  console.error(
    'No prod credentials: set FIREBASE_SERVICE_ACCOUNT or add scripts/service-account-key.json'
  );
  process.exit(1);
}

/** Pairs each tour set with its snapshot and returns the writes to make. */
function planConversions(setDocs, snapshotDocs) {
  const snapshots = new Map(snapshotDocs.map((d) => [d.id, d.data]));
  const plans = [];
  for (const { id, data } of setDocs) {
    if (!data || data.mode !== 'tour') continue;
    const draft = convertTourSet(data);
    const snapshot = snapshots.get(id);
    const published =
      snapshot && snapshot.set && typeof snapshot.set === 'object'
        ? convertTourSet(snapshot.set, { requireTourMode: false })
        : null;
    if (!draft.changed && !published?.changed) continue;
    plans.push({
      id,
      title: typeof data.title === 'string' ? data.title : '(untitled)',
      draft,
      published,
    });
  }
  return plans;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project || args.project === 'invalid') {
    console.log(
      'Usage: node scripts/convert-tour-slides.mjs --project dev|prod [--dry-run] [--confirm-prod]'
    );
    process.exit(args.help ? 0 : 1);
  }
  if (!args.dryRun && args.project === 'spartboard' && !args.confirmProd) {
    console.error("Writing to prod also needs --confirm-prod (Paul's word).");
    process.exit(1);
  }

  const { initializeApp, cert, applicationDefault } =
    await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  initializeApp({
    credential:
      args.project === 'spartboard'
        ? prodCredential(cert)
        : applicationDefault(),
    projectId: args.project,
  });
  const db = getFirestore();

  console.log(
    `${args.dryRun ? 'DRY RUN' : 'WRITE'} on ${args.project}/${COLLECTION} + ${TOURS_COLLECTION}\n`
  );
  const [setSnap, tourSnap] = await Promise.all([
    db.collection(COLLECTION).get(),
    db.collection(TOURS_COLLECTION).get(),
  ]);
  const setDocs = setSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const snapshotDocs = tourSnap.docs
    .filter((d) => !SKIP_TOUR_IDS.has(d.id))
    .map((d) => ({ id: d.id, data: d.data() }));
  const tourCount = setDocs.filter((d) => d.data?.mode === 'tour').length;
  const plans = planConversions(setDocs, snapshotDocs);

  const totals = { sets: 0, snapshots: 0, steps: 0, thumbnails: 0 };
  for (const plan of plans) {
    if (plan.draft.changed) {
      totals.sets++;
      totals.steps += plan.draft.stats.stepsConverted;
      totals.thumbnails += plan.draft.stats.thumbnailsAdded;
      console.log(
        formatChange('set     ', plan.id, plan.title, plan.draft.stats)
      );
    }
    if (plan.published?.changed) {
      totals.snapshots++;
      totals.steps += plan.published.stats.stepsConverted;
      totals.thumbnails += plan.published.stats.thumbnailsAdded;
      console.log(
        formatChange('snapshot', plan.id, plan.title, plan.published.stats)
      );
    }
  }

  const summary = `${tourCount} tour sets of ${setSnap.size}; ${totals.sets} sets and ${totals.snapshots} snapshots to convert (${totals.steps} steps, ${totals.thumbnails} thumbnails).`;
  console.log(`\n${summary}`);
  if (args.dryRun) {
    if (plans.length) console.log('Re-run without --dry-run to write.');
    return;
  }

  for (let i = 0; i < plans.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const plan of plans.slice(i, i + BATCH_LIMIT)) {
      if (plan.draft.changed) {
        const update = { steps: plan.draft.set.steps };
        for (const key of plan.draft.stats.droppedSetFields)
          update[key] = FieldValue.delete();
        batch.update(db.collection(COLLECTION).doc(plan.id), update);
      }
      if (plan.published?.changed) {
        batch.update(db.collection(TOURS_COLLECTION).doc(plan.id), {
          set: plan.published.set,
        });
      }
    }
    await batch.commit();
  }
  console.log(
    `Converted ${totals.sets} sets and ${totals.snapshots} snapshots.`
  );
}

// Guard direct execution so the helpers can be imported and unit-tested.
const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(
        '\nconvert-tour-slides failed: ' +
          (err && err.message ? err.message : err)
      );
      process.exit(1);
    });
}

export { parseArgs, planConversions };
