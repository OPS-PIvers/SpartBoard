/**
 * Live tour type migration (docs/plans/GL_LIVE_TOUR_TYPE.md T11).
 *
 * Lists every building Guided Learning set with an anchored step or
 * `hasLiveTour: true`: id, title, Help Center flag, mode, step count, and the
 * steps with no anchor or no image. With --apply, sets whose every step is
 * anchored get `mode: 'tour'` and `hasLiveTour: true`; the rest are only listed.
 *
 * Usage:
 *   node scripts/audit-live-tours.mjs --project dev            # dry run (default)
 *   node scripts/audit-live-tours.mjs --project dev --apply    # write
 *   node scripts/audit-live-tours.mjs --project prod           # read-only audit
 *   --apply on prod also needs --confirm-prod.
 *
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 * Never run --apply against prod without Paul's word. Idempotent.
 */

import { resolve, dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };
const COLLECTION = 'building_guided_learning';
const BATCH_LIMIT = 400;

function parseArgs(argv) {
  const args = { apply: false, project: null, confirmProd: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--project') args.project = argv[++i] ?? null;
    else if (a === '--confirm-prod') args.confirmProd = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  if (args.project) args.project = PROJECTS[args.project] ?? 'invalid';
  return args;
}

const hasAnchor = (step) =>
  !!step &&
  typeof step === 'object' &&
  !!step.tour &&
  typeof step.tour.anchor === 'string' &&
  step.tour.anchor.trim() !== '';

function stepHasImage(step, imageUrls) {
  if (!step || typeof step !== 'object') return false;
  const index = typeof step.imageIndex === 'number' ? step.imageIndex : 0;
  const url = Array.isArray(imageUrls) ? imageUrls[index] : undefined;
  return typeof url === 'string' && url.trim() !== '';
}

const stepLabel = (step, i) =>
  step && typeof step.id === 'string' ? `${i + 1} (${step.id})` : `${i + 1}`;

/** Returns null for sets that are not live tours. */
function classifySet(id, data) {
  const d = data && typeof data === 'object' ? data : {};
  const steps = Array.isArray(d.steps) ? d.steps : [];
  const anyAnchor = steps.some(hasAnchor);
  if (!anyAnchor && d.hasLiveTour !== true) return null;
  const withoutAnchor = [];
  const withoutImage = [];
  steps.forEach((step, i) => {
    if (!hasAnchor(step)) withoutAnchor.push(stepLabel(step, i));
    if (!stepHasImage(step, d.imageUrls)) withoutImage.push(stepLabel(step, i));
  });
  const convertible = steps.length > 0 && withoutAnchor.length === 0;
  const alreadyTour = d.mode === 'tour' && d.hasLiveTour === true;
  return {
    id,
    title: typeof d.title === 'string' ? d.title : '(untitled)',
    helpCenter: d.helpCenter === true,
    mode: typeof d.mode === 'string' ? d.mode : '(none)',
    stepCount: steps.length,
    withoutAnchor,
    withoutImage,
    convertible,
    needsUpdate: convertible && !alreadyTour,
  };
}

function formatRow(row) {
  return [
    `${row.id}  "${row.title}"`,
    `  helpCenter: ${row.helpCenter}  mode: ${row.mode}  steps: ${row.stepCount}`,
    `  without anchor: ${row.withoutAnchor.length ? row.withoutAnchor.join(', ') : 'none'}`,
    `  without image: ${row.withoutImage.length ? row.withoutImage.join(', ') : 'none'}`,
  ].join('\n');
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

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project || args.project === 'invalid') {
    console.log(
      'Usage: node scripts/audit-live-tours.mjs --project dev|prod [--apply] [--confirm-prod]'
    );
    process.exit(args.help ? 0 : 1);
  }
  if (args.apply && args.project === 'spartboard' && !args.confirmProd) {
    console.error('--apply on prod also needs --confirm-prod (Paul\'s word).');
    process.exit(1);
  }

  const { initializeApp, cert, applicationDefault } =
    await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({
    credential:
      args.project === 'spartboard' ? prodCredential(cert) : applicationDefault(),
    projectId: args.project,
  });
  const db = getFirestore();

  console.log(
    `${args.apply ? 'APPLY' : 'DRY RUN'} on ${args.project}/${COLLECTION}\n`
  );
  const snap = await db.collection(COLLECTION).get();
  const rows = snap.docs
    .map((doc) => classifySet(doc.id, doc.data()))
    .filter((row) => row !== null);

  const ready = rows.filter((r) => r.convertible);
  const toFix = rows.filter((r) => !r.convertible);

  console.log(`Every step anchored (${ready.length}):\n`);
  for (const row of ready) console.log(formatRow(row) + '\n');
  console.log(`Needs fixing before conversion (${toFix.length}):\n`);
  for (const row of toFix) console.log(formatRow(row) + '\n');

  const updates = ready.filter((r) => r.needsUpdate);
  console.log(
    `${rows.length} live tour sets of ${snap.size}; ${updates.length} to set mode 'tour', ${ready.length - updates.length} already converted.`
  );
  if (!args.apply) {
    if (updates.length) console.log('Re-run with --apply to convert them.');
    return;
  }

  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const row of updates.slice(i, i + BATCH_LIMIT)) {
      batch.update(db.collection(COLLECTION).doc(row.id), {
        mode: 'tour',
        hasLiveTour: true,
      });
    }
    await batch.commit();
  }
  console.log(`Converted ${updates.length} sets.`);
}

// Guard direct execution so the pure helpers can be imported and unit-tested.
const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(
        '\naudit-live-tours failed: ' + (err && err.message ? err.message : err)
      );
      process.exit(1);
    });
}

export { parseArgs, classifySet, formatRow };
