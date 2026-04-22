/**
 * Read-only: dump full content of /organizations/{orgId}/buildings/* docs
 * so we can see what fields (grades, type, etc.) are stored.
 */
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadCredentials() {
  const path = join(__dirname, 'service-account-key.json');
  return cert(JSON.parse(readFileSync(path, 'utf8')));
}

initializeApp({ credential: loadCredentials() });
const db = getFirestore();

const orgsSnap = await db.collection('organizations').get();
for (const org of orgsSnap.docs) {
  console.log(`\n═══ org="${org.id}" ═══`);
  const buildings = await db
    .collection('organizations')
    .doc(org.id)
    .collection('buildings')
    .get();
  for (const b of buildings.docs) {
    console.log(`\n  buildings/${b.id}:`);
    console.log(
      JSON.stringify(b.data(), null, 4)
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n')
    );
  }
}
process.exit(0);
