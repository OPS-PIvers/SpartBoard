/**
 * One-time backfill: stamp `orgId: 'orono'` onto every `/announcements/{id}`
 * document that lacks an `orgId` field.
 *
 * WHY: announcements is a single global collection with no per-tenant scope.
 * Org-isolation (work item W6) gates the dashboard overlay listener on the
 * caller's distribution tier and filters client-side / in the Firestore read
 * rule by `orgId`, but EXISTING announcements were created before the field
 * existed. Those legacy docs are deliberately treated as "global" (visible to
 * all authenticated users) so Orono's announcements keep showing unchanged.
 * Before the External launch we want every legacy announcement explicitly
 * scoped to the operator org ('orono') so a future external/no-org user can
 * never read them — at which point the read rule's org-membership branch
 * applies instead of the legacy "visible to all" branch.
 *
 * 'For Paul to run against prod before the External launch.'  DO NOT auto-run.
 *
 * Safe to re-run — it only writes the `orgId` field on docs that are MISSING
 * it, leaving any already-stamped doc untouched (idempotent). It never
 * overwrites a non-'orono' orgId, so it won't clobber a future multi-org doc.
 *
 * Usage:
 *   node scripts/migrateAnnouncements.js [--dry-run] [--org=<id>]
 *
 *   --dry-run   Report what WOULD change without writing.
 *   --org=<id>  Org id to stamp onto legacy docs (default: 'orono').
 *
 * Requires firebase-admin credentials:
 *   - FIREBASE_SERVICE_ACCOUNT env var (JSON string), OR
 *   - scripts/service-account-key.json file (gitignored)
 *
 * Outputs:
 *   - A JSON report at scripts/output/announcements-migration-{timestamp}.json
 *   - Stderr summary to console
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_ORG_ID = 'orono';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const orgId =
  args.find((a) => a.startsWith('--org='))?.split('=')[1] ?? DEFAULT_ORG_ID;

function loadCredentials() {
  const envCreds = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envCreds) {
    try {
      return JSON.parse(envCreds);
    } catch (e) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT env var is set but not valid JSON: ${e.message}`
      );
    }
  }
  const filePath = join(__dirname, 'service-account-key.json');
  if (!existsSync(filePath)) {
    throw new Error(
      `No credentials. Set FIREBASE_SERVICE_ACCOUNT env var or place service-account-key.json in scripts/.`
    );
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

async function main() {
  const creds = loadCredentials();
  initializeApp({ credential: cert(creds) });
  const db = getFirestore();

  const report = {
    startedAt: new Date().toISOString(),
    dryRun,
    orgId,
    total: 0,
    stamped: [],
    wouldStamp: [],
    /** Docs already carrying an orgId — left untouched (idempotent re-run). */
    alreadyScoped: [],
    errors: [],
  };

  const snap = await db.collection('announcements').get();
  report.total = snap.size;

  for (const docSnap of snap.docs) {
    const id = docSnap.id;
    const data = docSnap.data();
    try {
      // Only stamp docs MISSING orgId. A doc that already has any orgId value
      // (including a future non-'orono' org) is left exactly as-is so this
      // backfill stays idempotent and never reassigns tenancy.
      const existing = data.orgId;
      if (typeof existing === 'string' && existing.length > 0) {
        report.alreadyScoped.push({ id, orgId: existing });
        continue;
      }
      if (dryRun) {
        report.wouldStamp.push({ id, name: data.name ?? null });
        continue;
      }
      await db
        .collection('announcements')
        .doc(id)
        .set({ orgId, updatedAt: Date.now() }, { merge: true });
      report.stamped.push({ id, name: data.name ?? null });
      console.log(`  ✓ ${id} → orgId='${orgId}'`);
    } catch (err) {
      report.errors.push({ id, error: err.message ?? String(err) });
      console.error(`  ✗ ${id}: ${err.message ?? err}`);
    }
  }

  report.finishedAt = new Date().toISOString();

  const outDir = join(__dirname, 'output');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(
    outDir,
    `announcements-migration-${report.startedAt.replace(/[:.]/g, '-')}.json`
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log(
    `Summary: ${report.total} announcement(s) — ${
      dryRun
        ? report.wouldStamp.length + ' would stamp'
        : report.stamped.length + ' stamped'
    }, ${report.alreadyScoped.length} already scoped, ${report.errors.length} errors.`
  );

  // Exit non-zero on errors so a partially-failed backfill isn't mistaken for
  // success by a `&&`-chained shell or CI step. The report file is still
  // written, so the operator can diff and re-run (the script is idempotent).
  if (report.errors.length > 0) {
    console.error(
      `\nFAILED: ${report.errors.length} error(s) — see report at ${outPath}.`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
