// Read-only: prints each global_permissions/<id> doc's enabled, accessLevel, buildings and beta count. Usage: scripts/cloud-run.sh scripts/read-flag-state.mjs <id>...
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ids = process.argv.slice(2);
const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : null;
initializeApp(
  sa && sa.type !== 'cloud-proxy'
    ? { credential: cert(sa) }
    : {
        credential: applicationDefault(),
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
      }
);
const db = getFirestore();
for (const id of ids) {
  const snap = await db.doc('global_permissions/' + id).get();
  if (!snap.exists) {
    console.log(`${id}: NO DOC`);
    continue;
  }
  const d = snap.data();
  console.log(
    `${id}: enabled=${d.enabled} accessLevel=${d.accessLevel} buildings=${JSON.stringify(d.buildings ?? d.buildingIds ?? null)} betaUsers=${(d.betaUsers ?? []).length}`
  );
}
process.exit(0);
