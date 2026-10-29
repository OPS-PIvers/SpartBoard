// Focus push (F5) VAPID key setup for one project.
//
// Generates a P-256 key pair, stores the private half as Secret Manager secret
// FOCUS_VAPID_PRIVATE_KEY (piped to gcloud, never written to disk or printed), lets the
// functions' runtime service account read it, and writes the public half into that
// listing's `vapidPublicKey` in extension/src/listings.ts (safe to commit).
//
// Usage (needs gcloud signed in as a project owner):
//   node scripts/focus-vapid-keygen.mjs --project dev
//   node scripts/focus-vapid-keygen.mjs --project prod
//   add --rotate to replace an existing key (devices re-subscribe once the new extension build reaches them)
//
// Functions read the secret at run time, so no deploy is needed; push starts within 10 minutes.
// Until the listing's extension build carries the public key, devices keep their 5-minute check.

import { createECDH } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECRET = 'FOCUS_VAPID_PRIVATE_KEY';
const PROJECTS = { dev: 'spartboard-dev', prod: 'spartboard' };

const args = process.argv.slice(2);
const listing = args[args.indexOf('--project') + 1];
const rotate = args.includes('--rotate');
if (!args.includes('--project') || !(listing in PROJECTS)) {
  console.error('Usage: node scripts/focus-vapid-keygen.mjs --project dev|prod [--rotate]');
  process.exit(1);
}
const project = PROJECTS[listing];

function gcloud(gcloudArgs, input) {
  const res = spawnSync('gcloud', [...gcloudArgs, `--project=${project}`], {
    input,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return { ok: res.status === 0, out: (res.stdout ?? '').trim(), err: (res.stderr ?? '').trim() };
}

const exists = gcloud(['secrets', 'describe', SECRET, '--format=value(name)']).ok;
if (exists && !rotate) {
  console.error(`${SECRET} already exists in ${project}. Pass --rotate to replace it.`);
  process.exit(1);
}

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const privateKey = ecdh.getPrivateKey().toString('base64url');
const publicKey = ecdh.getPublicKey().toString('base64url');

const stored = exists
  ? gcloud(['secrets', 'versions', 'add', SECRET, '--data-file=-'], privateKey)
  : gcloud(['secrets', 'create', SECRET, '--replication-policy=automatic', '--data-file=-'], privateKey);
if (!stored.ok) {
  console.error(`Storing the secret failed:\n${stored.err}`);
  process.exit(1);
}

const number = gcloud(['projects', 'describe', project, '--format=value(projectNumber)']);
if (!number.ok || !number.out) {
  console.error(`Reading the project number failed:\n${number.err}`);
  process.exit(1);
}
// Functions here run as the default compute service account (none sets serviceAccount).
const member = `serviceAccount:${number.out}-compute@developer.gserviceaccount.com`;
const granted = gcloud([
  'secrets', 'add-iam-policy-binding', SECRET,
  `--member=${member}`, '--role=roles/secretmanager.secretAccessor', '--format=none',
]);
if (!granted.ok) {
  console.error(`The secret is stored, but granting ${member} read access failed:\n${granted.err}`);
  process.exit(1);
}

const listingsPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'src', 'listings.ts');
const source = readFileSync(listingsPath, 'utf8');
const block = new RegExp(`(\\n  ${listing}: \\{[\\s\\S]*?vapidPublicKey:\\s*)'[^']*'`);
if (!block.test(source)) {
  console.error(`Could not find the ${listing} listing's vapidPublicKey in ${listingsPath}. Set it by hand to:\n${publicKey}`);
  process.exit(1);
}
writeFileSync(listingsPath, source.replace(block, `$1'${publicKey}'`));

console.log(`Stored ${SECRET} in ${project} and granted ${member} read access.`);
console.log(`Wrote the ${listing} listing's public key to extension/src/listings.ts:\n${publicKey}`);
console.log('Commit that change with a manifest version bump so the extension build picks it up.');
