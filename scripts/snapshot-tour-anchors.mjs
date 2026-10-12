/**
 * Refreshes config/tourAnchorsInUse.json, the list of anchors saved live tours
 * point at, for one project. CI (scripts/checkTourAnchors.ts) fails a PR that
 * removes one of these anchors from config/tourAnchors.ts. Read-only on Firestore.
 *
 * Usage:
 *   node scripts/snapshot-tour-anchors.mjs --project dev
 *   node scripts/snapshot-tour-anchors.mjs --project prod
 *
 * Credentials: dev uses `gcloud auth application-default login`; prod uses
 * FIREBASE_SERVICE_ACCOUNT (JSON) or scripts/service-account-key.json.
 * Steps whose anchor is no longer registered are printed, not saved: those
 * tours are already broken and show in the Live tour health panel.
 */

import { resolve, dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };
const COLLECTION = 'building_guided_learning';
const SNAPSHOT = join(__dirname, '..', 'config', 'tourAnchorsInUse.json');
const REGISTRY = join(__dirname, '..', 'config', 'tourAnchors.ts');

const anchorId = (ref) => ref.split('#')[0].split(':')[0];

/** A live tour's registered anchor ids, sorted, plus the ones the registry lacks. */
function tourAnchors(data, known) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const ids = new Set();
  const unknown = new Set();
  for (const step of steps) {
    const ref = step?.tour?.anchor;
    if (typeof ref !== 'string' || ref.trim() === '') continue;
    const id = anchorId(ref.trim());
    (known.has(id) ? ids : unknown).add(id);
  }
  return { anchors: [...ids].sort(), unknown: [...unknown].sort() };
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
  const flag = process.argv.indexOf('--project');
  const projectId = PROJECTS[process.argv[flag + 1]];
  if (flag === -1 || !projectId) {
    console.log(
      'Usage: node scripts/snapshot-tour-anchors.mjs --project dev|prod'
    );
    process.exit(1);
  }
  const registry = readFileSync(REGISTRY, 'utf8');
  const known = new Set(
    [...registry.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1])
  );

  const { initializeApp, cert, applicationDefault } =
    await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({
    credential:
      projectId === 'spartboard' ? prodCredential(cert) : applicationDefault(),
    projectId,
  });
  const snap = await getFirestore().collection(COLLECTION).get();

  const tours = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const { anchors, unknown } = tourAnchors(data, known);
    if (anchors.length === 0 && unknown.length === 0) continue;
    const title = typeof data.title === 'string' ? data.title : '(untitled)';
    if (unknown.length) {
      console.log(
        `"${title}" (${doc.id}) uses unregistered: ${unknown.join(', ')}`
      );
    }
    if (anchors.length) tours.push({ id: doc.id, title, anchors });
  }
  tours.sort(
    (a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
  );

  const current = existsSync(SNAPSHOT)
    ? JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
    : {};
  current[projectId] = {
    refreshed: new Date().toISOString().slice(0, 10),
    tours,
  };
  const ordered = Object.fromEntries(
    Object.keys(current)
      .sort()
      .map((key) => [key, current[key]])
  );
  writeFileSync(SNAPSHOT, JSON.stringify(ordered, null, 2) + '\n');
  console.log(
    `${tours.length} live tours from ${projectId} written to ${SNAPSHOT}.`
  );
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(
        '\nsnapshot-tour-anchors failed: ' +
          (err && err.message ? err.message : err)
      );
      process.exit(1);
    });
}

export { tourAnchors };
