// One-off (Help Center home H3): files every Live tour still in the building library in the Help Center, Hidden and Unfiled; dry run unless --apply.

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const SETS = 'building_guided_learning';
const ITEMS = 'help_resources';
const PROJECTS = {
  dev: 'spartboard-dev',
  prod: 'spartboard',
  'spartboard-dev': 'spartboard-dev',
  spartboard: 'spartboard',
};

const str = (v) => (typeof v === 'string' ? v : '');

/** Same fields as buildHiddenHelpItem in utils/helpCenterItems.ts, which the rules' hasOnly allowlist checks. */
export function hiddenHelpItem(id, set, now) {
  return {
    id,
    kind: 'guided-learning',
    title: (str(set.title).trim() || 'Untitled guide').slice(0, 200),
    description: str(set.description).trim().slice(0, 1000),
    categoryId: '',
    order: 0,
    visible: false,
    orgId: null,
    widgetTypes: [],
    url: null,
    embedType: null,
    setId: set.id,
    openCount: 0,
    createdBy: str(set.authorUid) || 'migration',
    createdByEmail: '',
    createdAt: now,
    updatedAt: now,
  };
}

/** The library hides a set the index marks as a tour, so the migration takes the same ones (functions/src/glBuildingIndex.ts). */
export const isLiveTour = (set) =>
  (set?.mode === 'tour' || set?.hasLiveTour === true) && set.surface !== 'web';

/** Sets and items are { id, ...data }; returns the items to create and the tour ids still missing helpCenter: true. */
export function planMigration(sets, items, now) {
  const at = Math.trunc(now);
  const tours = sets.filter(isLiveTour);
  const linked = new Set(
    items.map((item) => item?.setId).filter((id) => typeof id === 'string')
  );
  const takenIds = new Set(items.map((item) => item?.id));
  const create = [];
  for (const set of tours) {
    if (linked.has(set.id)) continue;
    // The tour's own id keeps a re-run from filing it twice; a clash falls back to a suffix.
    let id = set.id;
    for (let n = 2; takenIds.has(id); n++) id = `${set.id}-${n}`;
    takenIds.add(id);
    create.push(hiddenHelpItem(id, set, at));
  }
  const flag = tours.filter((set) => set.helpCenter !== true).map((s) => s.id);
  return { create, flag };
}

function parseArgs(argv) {
  const args = { apply: false, project: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--project') args.project = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function credential(project) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  if (project === 'spartboard') {
    const keyPath = join(
      dirname(fileURLToPath(import.meta.url)),
      'service-account-key.json'
    );
    try {
      return cert(JSON.parse(readFileSync(keyPath, 'utf8')));
    } catch {
      // Fall through to ADC.
    }
  }
  return applicationDefault();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const project = PROJECTS[args.project ?? ''];
  if (args.help || !project) {
    console.log(
      'Usage: node scripts/migrate-live-tours-to-help-center.mjs --project <dev|prod> [--dry-run|--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }
  // cloud-run.sh pins the identity's project; refuse a mismatch rather than write the other one.
  const pinned = process.env.GOOGLE_CLOUD_PROJECT;
  if (pinned && pinned !== project) {
    console.error(
      `--project ${project} does not match GOOGLE_CLOUD_PROJECT=${pinned}.`
    );
    process.exit(1);
  }

  initializeApp({ credential: credential(project), projectId: project });
  const db = getFirestore();

  const [modeSnap, flagSnap, itemSnap] = await Promise.all([
    db.collection(SETS).where('mode', '==', 'tour').get(),
    db.collection(SETS).where('hasLiveTour', '==', true).get(),
    db.collection(ITEMS).get(),
  ]);
  const byId = new Map();
  for (const d of [...modeSnap.docs, ...flagSnap.docs])
    byId.set(d.id, { ...d.data(), id: d.id });
  const sets = [...byId.values()];
  const items = itemSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const plan = planMigration(sets, items, Date.now());
  const tours = sets.filter(isLiveTour);

  console.log(
    `${project}: ${tours.length} Live tours, ${items.length} Help Center items.`
  );
  console.log(`New Hidden, Unfiled items: ${plan.create.length}`);
  for (const item of plan.create) {
    console.log(`  ${ITEMS}/${item.id}  "${item.title}"  set=${item.setId}`);
  }
  const titles = new Map(sets.map((s) => [s.id, str(s.title)]));
  console.log(`Tours to mark helpCenter: true: ${plan.flag.length}`);
  for (const id of plan.flag) {
    console.log(`  ${SETS}/${id}  "${titles.get(id) || 'Untitled'}"`);
  }

  if (!args.apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to apply.');
    return;
  }
  let failed = 0;
  let created = 0;
  for (const item of plan.create) {
    try {
      await db.collection(ITEMS).doc(item.id).create(item);
      created++;
    } catch (err) {
      failed++;
      console.error(`  ${ITEMS}/${item.id}: ${err?.message ?? err}`);
    }
  }
  let flagged = 0;
  for (const id of plan.flag) {
    try {
      await db
        .collection(SETS)
        .doc(id)
        .update({ helpCenter: true, updatedAt: Date.now() });
      flagged++;
    } catch (err) {
      failed++;
      console.error(`  ${SETS}/${id}: ${err?.message ?? err}`);
    }
  }
  console.log(
    `Created ${created} of ${plan.create.length} items; flagged ${flagged} of ${plan.flag.length} tours; ${failed} failed.`
  );
  if (failed > 0) process.exit(1);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
