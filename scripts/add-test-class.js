/**
 * Seed/delete a "mock class" for PII-free student SSO testing.
 *
 * Writes to `/organizations/{orgId}/testClasses/{classId}`. The student login
 * Cloud Function (studentLoginV1) reads this subcollection as an allowlist
 * bypass of ClassLink/OneRoster, and admin-facing teacher class pickers merge
 * it into their options so test assignments can target mock classes.
 *
 * Usage:
 *   node scripts/add-test-class.js \
 *     --org <orgId> \
 *     --classId <classId> \
 *     --title "Mock Period 1 (Paul QA)" \
 *     [--subject Math] \
 *     --emails a@school.org,b@school.org
 *
 *   node scripts/add-test-class.js --org <orgId> --classId <classId> --delete
 *
 * Credentials resolution (same as scripts/setup-organization.js):
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON) — used by CI
 *   2. scripts/service-account-key.json — used by local dev
 *   3. GOOGLE_APPLICATION_CREDENTIALS → Application Default Credentials
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(argv) {
  const args = { emails: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--org':
        args.org = next();
        break;
      case '--classId':
        args.classId = next();
        break;
      case '--title':
        args.title = next();
        break;
      case '--subject':
        args.subject = next();
        break;
      case '--emails':
        args.emails = next()
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        break;
      case '--createdBy':
        args.createdBy = next();
        break;
      case '--delete':
        args.delete = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown arg: ${a}`);
    }
  }
  return args;
}

function loadCredentials() {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envJson) {
    try {
      return {
        source: 'FIREBASE_SERVICE_ACCOUNT env',
        creds: JSON.parse(envJson),
        useApplicationDefault: false,
      };
    } catch (e) {
      throw new Error(
        `Failed to parse FIREBASE_SERVICE_ACCOUNT env var as JSON: ${e.message}`
      );
    }
  }
  const path = join(__dirname, 'service-account-key.json');
  try {
    return {
      source: 'scripts/service-account-key.json',
      creds: JSON.parse(readFileSync(path, 'utf8')),
      useApplicationDefault: false,
    };
  } catch {
    // Fall through to ADC.
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      source: `GOOGLE_APPLICATION_CREDENTIALS=${process.env.GOOGLE_APPLICATION_CREDENTIALS}`,
      creds: null,
      useApplicationDefault: true,
    };
  }
  throw new Error(
    'Firebase Admin credentials not found. Options:\n' +
      '  1. Set FIREBASE_SERVICE_ACCOUNT env var (JSON)\n' +
      '  2. Save a service account key at scripts/service-account-key.json\n' +
      '  3. Set GOOGLE_APPLICATION_CREDENTIALS to a credentials file'
  );
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage:\n' +
        '  node scripts/add-test-class.js --org <orgId> --classId <classId> \\\n' +
        '    --title "Mock Period 1" --emails a@x.org,b@x.org [--subject Math]\n' +
        '  node scripts/add-test-class.js --org <orgId> --classId <classId> --delete'
    );
    process.exit(0);
  }
  if (!args.org || !args.classId) {
    throw new Error('Missing required --org and/or --classId flag.');
  }

  const { source, creds, useApplicationDefault } = loadCredentials();
  console.log(`✅ Using credentials from ${source}`);

  initializeApp({
    credential: useApplicationDefault ? applicationDefault() : cert(creds),
    ...(useApplicationDefault && process.env.FIREBASE_PROJECT_ID
      ? { projectId: process.env.FIREBASE_PROJECT_ID }
      : {}),
  });
  const db = getFirestore();
  const ref = db.doc(`organizations/${args.org}/testClasses/${args.classId}`);

  if (args.delete) {
    await ref.delete();
    console.log(
      `🗑️  Deleted organizations/${args.org}/testClasses/${args.classId}`
    );
    return;
  }

  if (!args.title) {
    throw new Error('Missing --title (required when not deleting).');
  }
  if (args.emails.length === 0) {
    throw new Error(
      'Missing --emails (comma-separated, required when not deleting).'
    );
  }

  const payload = {
    title: args.title,
    memberEmails: args.emails,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: args.createdBy ?? 'script:add-test-class',
  };
  if (args.subject) payload.subject = args.subject;

  await ref.set(payload, { merge: true });
  console.log(
    `✅ Wrote organizations/${args.org}/testClasses/${args.classId} ` +
      `(${args.emails.length} member email${args.emails.length === 1 ? '' : 's'})`
  );
}

run().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
