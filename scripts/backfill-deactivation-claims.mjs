// One-off (security bundle A): give members deactivated before the `deactivated` claim existed that claim and end their sessions; dry run unless --apply.

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ORG_ID = 'orono';
const LIVE = new Set(['active', 'invited']);

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

async function usersFor(auth, email, uid) {
  const users = new Map();
  for (const lookup of [
    uid ? () => auth.getUser(uid) : null,
    () => auth.getUserByEmail(email),
  ]) {
    if (!lookup) continue;
    try {
      const u = await lookup();
      users.set(u.uid, u);
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
    }
  }
  return [...users.values()];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project) {
    console.log(
      'Usage: node scripts/backfill-deactivation-claims.mjs --project <id> [--apply]'
    );
    process.exit(args.help ? 0 : 1);
  }
  initializeApp({ credential: credential(args.project), projectId: args.project });
  const db = getFirestore();
  const auth = getAuth();

  const snap = await db.collection(`organizations/${ORG_ID}/members`).get();
  const plans = [];
  for (const d of snap.docs) {
    const status = d.get('status');
    if (status === undefined || LIVE.has(status)) continue;
    for (const u of await usersFor(auth, d.id, d.get('uid'))) {
      if (u.customClaims?.deactivated === true) continue;
      plans.push({ email: d.id, user: u });
    }
  }
  console.log(`${args.project}: ${plans.length} deactivated account(s) without the claim.`);
  for (const p of plans) console.log(`  ${p.email}  uid=${p.user.uid}`);
  if (!args.apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to apply.');
    return;
  }
  let failed = 0;
  for (const p of plans) {
    try {
      await auth.setCustomUserClaims(p.user.uid, {
        ...(p.user.customClaims ?? {}),
        deactivated: true,
      });
      await auth.revokeRefreshTokens(p.user.uid);
    } catch (err) {
      failed++;
      console.error(`  ${p.email}: ${err?.message ?? err}`);
    }
  }
  console.log(`Claimed ${plans.length - failed} of ${plans.length}; ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
