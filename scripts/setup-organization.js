/**
 * Organization migration script (Phase 1 of the Organization wiring plan).
 *
 * Creates the /organizations/{orgId} hierarchy and seeds it with:
 *   - the org doc (name, shortCode, plan, aiEnabled, …)
 *   - buildings, domains, system roles, studentPageConfig/default
 *   - members for every current /admins/* email (roleId: domain_admin)
 *   - members for every admin_settings/user_roles.superAdmins email
 *     (roleId: super_admin)
 *
 * All writes use `{ merge: true }` so the script is idempotent — running it
 * twice produces no diff.
 *
 * Usage:
 *   node scripts/setup-organization.js [--dry-run] [--seed <path>]
 *
 * Seed config is loaded from scripts/org-seed.json by default (gitignored).
 * Copy scripts/org-seed.example.json → scripts/org-seed.json and edit before
 * running for real.
 *
 * Credentials resolution mirrors scripts/setup-admins.js:
 *   1. FIREBASE_SERVICE_ACCOUNT env var (JSON)
 *   2. scripts/service-account-key.json
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mirror of types/organization.ts CapabilityId + the system role templates.
// Kept in JS so the script has no runtime dependency on TS — if a capability
// is added there, add it here too and the migration will seed the new cap.
const ALL_CAPS = [
  'viewBoards',
  'editBoards',
  'shareBoards',
  'saveTemplate',
  'accessAdmin',
  'manageUsers',
  'manageRoles',
  'manageBuildings',
  'configureWidgets',
  'manageBackgrounds',
  'postAnnouncements',
  'editOrg',
  'manageDomains',
  'editStudentPage',
  'manageOrgs',
  'toggleAI',
  'viewPlatform',
  'joinSession',
  'viewAssignments',
];

const allWith = (value) => Object.fromEntries(ALL_CAPS.map((c) => [c, value]));

const SYSTEM_ROLES = [
  {
    id: 'super_admin',
    name: 'Super admin',
    blurb: 'SpartBoard staff. Full access across every organization.',
    color: 'rose',
    system: true,
    perms: allWith('full'),
  },
  {
    id: 'domain_admin',
    name: 'Domain admin',
    blurb: 'District IT. Full access within this organization.',
    color: 'indigo',
    system: true,
    perms: {
      ...allWith('full'),
      manageOrgs: 'none',
      toggleAI: 'none',
      viewPlatform: 'none',
    },
  },
  {
    id: 'building_admin',
    name: 'Building admin',
    blurb: 'Principals and site leads. Scoped to their building(s).',
    color: 'violet',
    system: true,
    perms: {
      ...allWith('none'),
      viewBoards: 'full',
      editBoards: 'full',
      shareBoards: 'full',
      saveTemplate: 'full',
      accessAdmin: 'full',
      manageUsers: 'building',
      configureWidgets: 'building',
      manageBackgrounds: 'building',
      postAnnouncements: 'building',
    },
  },
  {
    id: 'teacher',
    name: 'Teacher',
    blurb: 'Classroom teachers. Can build and share boards.',
    color: 'emerald',
    system: true,
    perms: {
      ...allWith('none'),
      viewBoards: 'full',
      editBoards: 'full',
      shareBoards: 'full',
      saveTemplate: 'full',
    },
  },
  {
    id: 'student',
    name: 'Student',
    blurb: 'Students. Can join sessions and view assignments.',
    color: 'sky',
    system: true,
    perms: {
      ...allWith('none'),
      joinSession: 'full',
      viewAssignments: 'full',
    },
  },
];

function parseArgs(argv) {
  const args = { dryRun: false, seedPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--seed') args.seedPath = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
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
    };
  } catch {
    throw new Error(
      'Firebase Admin credentials not found. Either set FIREBASE_SERVICE_ACCOUNT (JSON) ' +
        'or save the service account key at scripts/service-account-key.json.'
    );
  }
}

function loadSeed(customPath) {
  const path = customPath ? customPath : join(__dirname, 'org-seed.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(
      `Org seed config not found at ${path}. Copy scripts/org-seed.example.json ` +
        'to scripts/org-seed.json (or pass --seed <path>) and edit before running.'
    );
  }
}

// Collects writes so --dry-run can print them without committing.
class Writer {
  constructor(db, { dryRun }) {
    this.db = db;
    this.dryRun = dryRun;
    this.queued = [];
  }

  set(refPath, data) {
    this.queued.push({ path: refPath, data });
  }

  async flush() {
    if (this.dryRun) {
      console.log(`\n[dry-run] Would write ${this.queued.length} documents:`);
      for (const q of this.queued) {
        console.log(`  - ${q.path}`);
      }
      return;
    }
    console.log(`\n✏️  Writing ${this.queued.length} documents…`);
    // Batch in chunks of 400 to stay under the 500-op batch limit.
    for (let i = 0; i < this.queued.length; i += 400) {
      const batch = this.db.batch();
      for (const { path, data } of this.queued.slice(i, i + 400)) {
        batch.set(this.db.doc(path), data, { merge: true });
      }
      await batch.commit();
    }
    console.log(`✅ Wrote ${this.queued.length} documents.`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/setup-organization.js [--dry-run] [--seed <path>]'
    );
    process.exit(0);
  }

  const { source, creds } = loadCredentials();
  console.log(`✅ Using credentials from ${source}`);

  const seed = loadSeed(args.seedPath);
  if (!seed.orgId || !seed.org) {
    throw new Error('Seed config must include "orgId" and "org" fields.');
  }
  const orgId = seed.orgId;
  console.log(`🏢 Migrating organization: ${orgId}`);

  initializeApp({ credential: cert(creds) });
  const db = getFirestore();
  const writer = new Writer(db, { dryRun: args.dryRun });

  // 1. Org doc
  const nowIso = new Date().toISOString();
  const buildings = seed.buildings ?? [];
  writer.set(`organizations/${orgId}`, {
    id: orgId,
    name: seed.org.name,
    shortName: seed.org.shortName ?? seed.org.name,
    shortCode: seed.org.shortCode,
    state: seed.org.state ?? '',
    plan: seed.org.plan ?? 'basic',
    aiEnabled: Boolean(seed.org.aiEnabled),
    primaryAdminEmail: seed.org.primaryAdminEmail?.toLowerCase() ?? '',
    status: seed.org.status ?? 'active',
    seedColor: seed.org.seedColor ?? 'bg-indigo-600',
    // Only include supportUrl when provided — OrgRecord types it as optional
    // string (not string|null) and Firestore omits undefined fields.
    ...(seed.org.supportUrl ? { supportUrl: seed.org.supportUrl } : {}),
    createdAt: nowIso,
    // Counters required by OrgRecord. A Phase-4 Cloud Function will keep
    // `users` in sync; seed `buildings` from the migration input.
    users: 0,
    buildings: buildings.length,
  });

  // 2. Buildings
  for (const b of buildings) {
    if (!b.id) throw new Error('Every building must have an "id".');
    writer.set(`organizations/${orgId}/buildings/${b.id}`, {
      id: b.id,
      orgId,
      name: b.name,
      type: b.type ?? 'other',
      address: b.address ?? '',
      grades: b.grades ?? '',
      adminEmails: (b.adminEmails ?? []).map((e) => e.toLowerCase()),
      users: 0,
    });
  }

  // 3. Domains
  const domains = seed.domains ?? [];
  for (const d of domains) {
    if (!d.id) throw new Error('Every domain must have an "id".');
    writer.set(`organizations/${orgId}/domains/${d.id}`, {
      id: d.id,
      orgId,
      domain: d.domain,
      authMethod: d.authMethod ?? 'google',
      status: d.status ?? 'pending',
      role: d.role ?? 'staff',
      addedAt: nowIso,
      users: 0,
    });
  }

  // 4. System roles
  for (const role of SYSTEM_ROLES) {
    writer.set(`organizations/${orgId}/roles/${role.id}`, role);
  }

  // 5. Student page config
  writer.set(`organizations/${orgId}/studentPageConfig/default`, {
    orgId,
    showAnnouncements: seed.studentPage?.showAnnouncements ?? true,
    showTeacherDirectory: seed.studentPage?.showTeacherDirectory ?? true,
    showLunchMenu: seed.studentPage?.showLunchMenu ?? false,
    accentColor: seed.studentPage?.accentColor ?? '#2d3f89',
    heroText:
      seed.studentPage?.heroText ??
      `Welcome, ${seed.org.shortName ?? seed.org.name ?? ''}!`.trim(),
  });

  // 6. Members from legacy /admins/*
  console.log('👥 Scanning /admins/* for domain admins…');
  const adminsSnap = await db.collection('admins').get();
  const adminEmails = adminsSnap.docs.map((d) => d.id.toLowerCase());
  console.log(`   Found ${adminEmails.length} admin email(s).`);

  // 7. Super admins from admin_settings/user_roles
  let superAdmins = [];
  const userRolesDoc = await db.doc('admin_settings/user_roles').get();
  if (userRolesDoc.exists) {
    const data = userRolesDoc.data() ?? {};
    superAdmins = Array.isArray(data.superAdmins)
      ? data.superAdmins.map((e) => String(e).toLowerCase())
      : [];
    console.log(`   Found ${superAdmins.length} super admin email(s).`);
  } else {
    console.log('   admin_settings/user_roles does not exist — skipping.');
  }

  const superSet = new Set(superAdmins);

  const allMemberEmails = new Set([...adminEmails, ...superAdmins]);
  for (const email of allMemberEmails) {
    const roleId = superSet.has(email) ? 'super_admin' : 'domain_admin';
    // `addedBy` is reserved for real Firebase Auth uids (per MemberRecord
    // in types/organization.ts). Migration-created members omit it and
    // record provenance in `addedBySource` instead.
    writer.set(`organizations/${orgId}/members/${email}`, {
      email,
      orgId,
      roleId,
      buildingIds: [],
      status: 'active',
      addedBySource: 'migration:setup-organization',
      invitedAt: nowIso,
    });
  }

  await writer.flush();

  if (args.dryRun) {
    console.log('\nℹ️  Dry run only — no writes were committed.');
  } else {
    console.log('\n✨ Organization setup complete!');
    console.log(`   Org: /organizations/${orgId}`);
    console.log(`   Buildings: ${buildings.length}`);
    console.log(`   Domains: ${domains.length}`);
    console.log(`   System roles: ${SYSTEM_ROLES.length}`);
    console.log(`   Members: ${allMemberEmails.size}`);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ setup-organization failed:', err.message ?? err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
