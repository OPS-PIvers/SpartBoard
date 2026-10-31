/**
 * One-off cleanup for PR #4895: students share @orono.k12.mn.us, and before it
 * resolveOrgForUser auto-enrolled any non-numeric address as a teacher. Rules
 * now treat an active, non-student member doc as staff, so every such student
 * doc still passes. This lists orono teacher members (auto-enroll, the April
 * backfill or setup-organization) that ClassLink or a mock class says are students and, with --apply, sets roleId 'student'
 * (App.tsx then sends them to the student sign-in, and rules deny them staff).
 *
 * Read-only by default. Prod data: run only with Paul's OK.
 *   CLASSLINK_CLIENT_ID=... CLASSLINK_CLIENT_SECRET=... CLASSLINK_TENANT_URL=... \
 *     node scripts/demote-student-member-docs.mjs [--apply]
 * Credentials: FIREBASE_SERVICE_ACCOUNT or scripts/service-account-key.json.
 * Prints counts and the affected addresses to the console only; nothing else is stored.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '../functions/package.json'));
const axios = require('axios');
const OAuth = require('oauth-1.0a');
const CryptoJS = require('crypto-js');

const apply = process.argv.includes('--apply');
const ORG_ID = 'orono';
const ONEROSTER_BASE = '/ims/oneroster/v1p1';

function loadCredentials() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) return JSON.parse(fromEnv);
  const keyPath = join(__dirname, 'service-account-key.json');
  if (existsSync(keyPath)) return JSON.parse(readFileSync(keyPath, 'utf8'));
  console.error(
    'No credentials: set FIREBASE_SERVICE_ACCOUNT or add scripts/service-account-key.json'
  );
  process.exit(1);
}

const clientId = process.env.CLASSLINK_CLIENT_ID ?? '';
const clientSecret = process.env.CLASSLINK_CLIENT_SECRET ?? '';
const tenantUrl = (process.env.CLASSLINK_TENANT_URL ?? '').replace(/\/$/, '');
if (!clientId || !clientSecret || !tenantUrl) {
  console.error('Set CLASSLINK_CLIENT_ID, CLASSLINK_CLIENT_SECRET and CLASSLINK_TENANT_URL.');
  process.exit(1);
}

const oauth = new OAuth({
  consumer: { key: clientId, secret: clientSecret },
  signature_method: 'HMAC-SHA1',
  hash_function: (base, key) =>
    CryptoJS.HmacSHA1(base, key).toString(CryptoJS.enc.Base64),
});

function roleNames(user) {
  const names = [];
  if (typeof user.role === 'string') names.push(user.role.toLowerCase());
  for (const r of Array.isArray(user.roles) ? user.roles : []) {
    if (typeof r?.role === 'string') names.push(r.role.toLowerCase());
  }
  return names;
}

// Same rules as functions/src/studentEmailIdentity.ts isOneRosterStaff / isOneRosterStudent.
const STAFF_ROLES = new Set([
  'teacher',
  'administrator',
  'aide',
  'proctor',
  'principal',
  'counselor',
  'districtadministrator',
  'siteadministrator',
  'systemadministrator',
]);
const isOneRosterStaff = (user) => roleNames(user).some((n) => STAFF_ROLES.has(n));

function isOneRosterStudent(user) {
  if (roleNames(user).includes('student')) return true;
  return (
    Array.isArray(user.roles) &&
    user.roles.some(
      (r) => !r?.role && (r?.roleType ?? '').toLowerCase() === 'primary'
    )
  );
}

async function oneRosterUsers(email) {
  const url = `${tenantUrl}${ONEROSTER_BASE}/users`;
  const params = { filter: `email='${email}'` };
  const headers = oauth.toHeader(oauth.authorize({ url, method: 'GET', data: params }));
  const res = await axios.get(url, { params, headers });
  return res.data.users ?? [];
}

initializeApp({ credential: cert(loadCredentials()) });
const db = getFirestore();

const mockSnap = await db.collection(`organizations/${ORG_ID}/testClasses`).get();
const mockEmails = new Set(
  mockSnap.docs.flatMap((d) =>
    (d.get('memberEmails') ?? []).map((e) => String(e).toLowerCase())
  )
);

const members = await db
  .collection(`organizations/${ORG_ID}/members`)
  .where('roleId', '==', 'teacher')
  .get();

let checked = 0;
let failed = 0;
const students = [];
for (const doc of members.docs) {
  const email = doc.id.toLowerCase();
  checked += 1;
  if (email.includes("'")) continue;
  try {
    const users = await oneRosterUsers(email);
    if (users.some(isOneRosterStaff)) continue;
    if (mockEmails.has(email)) {
      students.push({ ref: doc.ref, why: 'mock class' });
    } else if (users.some(isOneRosterStudent)) {
      students.push({ ref: doc.ref, why: 'ClassLink student' });
    }
  } catch (err) {
    failed += 1;
    console.warn(`ClassLink lookup failed for ${doc.id}: ${err.response?.status ?? err.message}`);
  }
}

console.log(`Teacher docs checked: ${checked}`);
console.log(`ClassLink lookups that failed: ${failed}`);
console.log(`Student docs found: ${students.length}`);
for (const { ref, why } of students) console.log(`  ${ref.id} (${why})`);

if (!apply) {
  console.log('Dry run. Re-run with --apply to set roleId to student.');
  process.exit(0);
}
for (const { ref } of students) {
  await ref.update({ roleId: 'student', demotedBy: 'demote-student-member-docs' });
}
console.log(`Updated ${students.length} member docs.`);
