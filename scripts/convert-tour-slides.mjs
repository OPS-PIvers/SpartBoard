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
 *   node scripts/convert-tour-slides.mjs --project dev             # print only (default)
 *   node scripts/convert-tour-slides.mjs --project dev --write     # write
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

function parseArgs(argv) {
  const args = {
    dryRun: true,
    project: null,
    confirmProd: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--write') args.dryRun = false;
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
  const snapshots = new Map(snapshotDocs.map((d) => [d.id, d]));
  const plans = [];
  for (const { id, data, updateTime } of setDocs) {
    if (!data || data.mode !== 'tour') continue;
    const draft = convertTourSet(data);
    const snapshotDoc = snapshots.get(id);
    const snapshot = snapshotDoc?.data;
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
      updateTime,
      snapshotUpdateTime: snapshotDoc?.updateTime,
    });
  }
  return plans;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project || args.project === 'invalid') {
    console.log(
      'Usage: node scripts/convert-tour-slides.mjs --project dev|prod [--write] [--confirm-prod]'
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
  const setDocs = setSnap.docs.map((d) => ({
    id: d.id,
    data: d.data(),
    updateTime: d.updateTime,
  }));
  const snapshotDocs = tourSnap.docs
    .filter((d) => !SKIP_TOUR_IDS.has(d.id))
    .map((d) => ({ id: d.id, data: d.data(), updateTime: d.updateTime }));
  const tourCount = setDocs.filter((d) => d.data?.mode === 'tour').length;
  const plans = planConversions(setDocs, snapshotDocs);

  const totals = {
    sets: 0,
    snapshots: 0,
    steps: 0,
    thumbnails: 0,
    picturesDropped: 0,
  };
  for (const plan of plans) {
    if (plan.draft.changed) {
      totals.sets++;
      totals.steps += plan.draft.stats.stepsConverted;
      totals.thumbnails += plan.draft.stats.thumbnailsAdded;
      totals.picturesDropped += plan.draft.stats.picturesDropped;
      console.log(
        formatChange('set     ', plan.id, plan.title, plan.draft.stats)
      );
    }
    if (plan.published?.changed) {
      totals.snapshots++;
      totals.steps += plan.published.stats.stepsConverted;
      totals.thumbnails += plan.published.stats.thumbnailsAdded;
      totals.picturesDropped += plan.published.stats.picturesDropped;
      console.log(
        formatChange('snapshot', plan.id, plan.title, plan.published.stats)
      );
    }
  }

  const summary = `${tourCount} tour sets of ${setSnap.size}; ${totals.sets} sets and ${totals.snapshots} snapshots to convert (${totals.steps} steps, ${totals.thumbnails} thumbnails, ${totals.picturesDropped} pictures dropped on steps with no anchor).`;
  console.log(`\n${summary}`);
  if (args.dryRun) {
    if (plans.length) console.log('Re-run with --write to write.');
    return;
  }

  // Each doc writes only if nobody saved it since it was read; a skipped doc converts on the next run.
  const done = { sets: 0, snapshots: 0 };
  const skipped = [];
  const write = async (ref, update, lastUpdateTime, label, id) => {
    try {
      await ref.update(update, { lastUpdateTime });
      return true;
    } catch (err) {
      skipped.push(`${label} ${id}: ${err?.message ?? err}`);
      return false;
    }
  };
  for (const plan of plans) {
    if (plan.draft.changed) {
      const update = { steps: plan.draft.set.steps };
      for (const key of plan.draft.stats.droppedSetFields)
        update[key] = FieldValue.delete();
      const ref = db.collection(COLLECTION).doc(plan.id);
      if (await write(ref, update, plan.updateTime, 'set', plan.id))
        done.sets++;
    }
    if (plan.published?.changed) {
      const ref = db.collection(TOURS_COLLECTION).doc(plan.id);
      const update = { set: plan.published.set };
      const at = plan.snapshotUpdateTime;
      if (await write(ref, update, at, 'snapshot', plan.id)) done.snapshots++;
    }
  }
  console.log(`Converted ${done.sets} sets and ${done.snapshots} snapshots.`);
  if (skipped.length) {
    console.log(
      `Skipped ${skipped.length} changed since read; re-run to convert:\n${skipped.join('\n')}`
    );
  }
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
