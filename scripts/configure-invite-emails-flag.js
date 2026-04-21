/**
 * Seed / adjust `/global_permissions/invite-emails` — the kill switch that
 * gates whether `createOrganizationInvites` queues a `/mail/{token}` write
 * for the Trigger Email extension.
 *
 * WHY THIS EXISTS
 *   Phase 4.1 (invite email wiring). The CF defaults to OFF when the doc
 *   is missing, so we have to opt-in explicitly after the extension is
 *   installed + configured with valid SMTP creds. This script creates the
 *   doc for the first time (defaults: disabled, Resend test sender) and
 *   can later flip `enabled` or update `from` / `replyTo` when we migrate
 *   off the test sender.
 *
 *   Similar pattern to scripts/graduate-org-admin-writes-flag.js, but this
 *   one is upsert + multi-field, so it stays useful across multiple runs:
 *     - First run (no doc):     creates the doc with defaults + any flags
 *     - Subsequent runs:        merges only the fields you explicitly pass
 *     - No flags, doc exists:   prints state and exits (no-op)
 *
 *   Schema at `/global_permissions/invite-emails`:
 *     enabled: boolean
 *     from?: string     // default sender; the extension also has a default
 *     replyTo?: string  // default reply-to
 *
 * Usage:
 *   # First-time seed (disabled, Resend test sender — Option A path)
 *   node scripts/configure-invite-emails-flag.js
 *
 *   # Enable sends
 *   node scripts/configure-invite-emails-flag.js --enable
 *
 *   # Swap to a verified domain after DNS is live
 *   node scripts/configure-invite-emails-flag.js \
 *     --from invites@spartboard.orono.k12.mn.us \
 *     --reply-to support@orono.k12.mn.us
 *
 *   # Kill switch
 *   node scripts/configure-invite-emails-flag.js --disable
 *
 *   # Inspect current state
 *   node scripts/configure-invite-emails-flag.js --dry-run
 *
 * Credentials resolution (same chain as sibling scripts):
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON)
 *   2. scripts/service-account-key.json
 *   3. applicationDefault() via GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'spartboard';
const FLAG_ID = 'invite-emails';

// Default sender for the initial Option A smoke-test path. Resend's
// onboarding@resend.dev sender works without domain verification but can
// only deliver to the Resend account's own verified email address
// (paul.ivers@orono.k12.mn.us). Swap via --from once a real domain is live.
const DEFAULT_FROM = 'onboarding@resend.dev';

function parseArgs(argv) {
  const args = {
    dryRun: false,
    help: false,
    enable: null, // null = don't touch; true/false = set explicitly
    from: null,
    replyTo: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--enable') args.enable = true;
    else if (a === '--disable') args.enable = false;
    else if (a === '--from') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) {
        console.error('Error: --from requires an email address.');
        process.exit(1);
      }
      args.from = val;
      i += 1;
    } else if (a === '--reply-to') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) {
        console.error('Error: --reply-to requires an email address.');
        process.exit(1);
      }
      args.replyTo = val;
      i += 1;
    }
  }
  return args;
}

function printHelp() {
  console.log(
    `Usage: node scripts/configure-invite-emails-flag.js [options]

Options:
  --enable            Set enabled: true
  --disable           Set enabled: false
  --from <addr>       Set default sender
  --reply-to <addr>   Set default reply-to
  --dry-run, -n       Show planned write without committing
  --help, -h          Show this help

First run with no flags seeds the doc with defaults (enabled: false,
from: ${DEFAULT_FROM}). Subsequent runs only touch fields you pass
explicitly — unspecified fields are left alone.`
  );
}

function loadCredentials() {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envJson) {
    return {
      source: 'FIREBASE_SERVICE_ACCOUNT env',
      creds: JSON.parse(envJson),
      useApplicationDefault: false,
    };
  }
  const keyPath = join(__dirname, 'service-account-key.json');
  try {
    const raw = readFileSync(keyPath, 'utf8');
    return {
      source: 'scripts/service-account-key.json',
      creds: JSON.parse(raw),
      useApplicationDefault: false,
    };
  } catch {
    // Fall through to ADC.
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      source:
        'GOOGLE_APPLICATION_CREDENTIALS=' +
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
      creds: null,
      useApplicationDefault: true,
    };
  }
  return {
    source: 'applicationDefault()',
    creds: null,
    useApplicationDefault: true,
  };
}

function printState(label, data) {
  console.log('');
  console.log(label);
  console.log('  enabled:  ' + JSON.stringify(data?.enabled ?? null));
  console.log('  from:     ' + JSON.stringify(data?.from ?? null));
  console.log('  replyTo:  ' + JSON.stringify(data?.replyTo ?? null));
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const { source, creds, useApplicationDefault } = loadCredentials();
  console.log('Using credentials from ' + source);

  const initOpts = {
    projectId: (creds && creds.project_id) || PROJECT_ID,
  };
  if (useApplicationDefault) {
    initOpts.credential = applicationDefault();
  } else {
    initOpts.credential = cert(creds);
  }
  initializeApp(initOpts);

  const db = getFirestore();
  const ref = db.doc('global_permissions/' + FLAG_ID);

  const before = await ref.get();
  const beforeData = before.exists ? (before.data() ?? {}) : null;

  if (before.exists) {
    printState(
      'Current state of /global_permissions/' + FLAG_ID + ':',
      beforeData
    );
  } else {
    console.log('');
    console.log(
      '/global_permissions/' + FLAG_ID + ' does not exist — will be created.'
    );
  }

  // Build the merge patch from flags. First run (no doc) always gets the
  // default `from`; subsequent runs only touch fields the caller passed.
  const patch = {};
  if (!before.exists) {
    patch.enabled = args.enable === true; // defaults to false on first seed
    patch.from = args.from ?? DEFAULT_FROM;
    if (args.replyTo !== null) patch.replyTo = args.replyTo;
  } else {
    if (args.enable !== null) patch.enabled = args.enable;
    if (args.from !== null) patch.from = args.from;
    if (args.replyTo !== null) patch.replyTo = args.replyTo;
  }

  if (Object.keys(patch).length === 0) {
    console.log('');
    console.log(
      'No flags provided — nothing to change. Pass --help to see options.'
    );
    process.exit(0);
  }

  console.log('');
  console.log('Planned patch (merge=true): ' + JSON.stringify(patch));

  if (args.dryRun) {
    console.log('');
    console.log('Dry run only -- no writes were committed.');
    process.exit(0);
  }

  await ref.set(patch, { merge: true });

  const after = await ref.get();
  printState(
    'Post-write state of /global_permissions/' + FLAG_ID + ':',
    after.data() ?? {}
  );

  console.log('');
  console.log('✅ Invite-email config updated.');
  process.exit(0);
}

run().catch((err) => {
  console.error(
    '\nconfigure-invite-emails-flag failed: ' +
      (err && err.message ? err.message : err)
  );
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
});
