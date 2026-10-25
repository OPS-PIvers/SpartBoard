/**
 * One-off cleanup: delete /admins/{email} docs that organizationMembersSync
 * mirrored from an org other than the operator org (`orono`). The sync now
 * mirrors only operator-org roles, but docs it wrote earlier stay until removed.
 *
 * Only docs carrying `source: 'organizationMembersSync'` are touched; hand-made
 * and pre-sync admin docs (no marker) are never deleted.
 *
 * Usage:
 *   node scripts/remove-non-operator-admin-mirrors.mjs --project <id>          # dry run (default)
 *   node scripts/remove-non-operator-admin-mirrors.mjs --project <id> --apply  # delete
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT (JSON), else scripts/service-account-key.json
 * for `spartboard`, else applicationDefault() (gcloud ADC, used for spartboard-dev).
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const OPERATOR_ORG_ID = 'orono';
const PROVENANCE_SOURCE = 'organizationMembersSync';

/** Admin docs the sync mirrored from a non-operator org. */
export function staleMirrors(docs) {
  return docs.filter(
    (d) =>
      d.data.source === PROVENANCE_SOURCE &&
      typeof d.data.orgId === 'string' &&
      d.data.orgId !== OPERATOR_ORG_ID
  );
}

function parseArgs(argv) {
  const args = { apply: false, project: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
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
  if (args.help || !args.project) {
    console.log(
      'Usage: node scripts/remove-non-operator-admin-mirrors.mjs --project <id> [--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }

  initializeApp({ credential: credential(args.project), projectId: args.project });
  const db = getFirestore();

  const snap = await db
    .collection('admins')
    .where('source', '==', PROVENANCE_SOURCE)
    .get();
  const stale = staleMirrors(
    snap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }))
  );

  console.log(
    `${args.project}: ${snap.size} synced admin docs, ${stale.length} mirrored from another org.`
  );
  for (const d of stale) {
    console.log(`  ${d.id}  orgId=${d.data.orgId}  roleId=${d.data.roleId}`);
  }

  if (!args.apply) {
    console.log('Dry run: nothing deleted. Re-run with --apply to delete.');
    return;
  }
  for (const d of stale) {
    await d.ref.delete();
  }
  console.log(`Deleted ${stale.length} admin docs.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
