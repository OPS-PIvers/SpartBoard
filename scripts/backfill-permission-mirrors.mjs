// Run once BEFORE deploying the tightened permission rules: node scripts/backfill-permission-mirrors.mjs [--dry-run]
// Uses application-default credentials; safe to re-run (idempotent sets).
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dryRun = process.argv.includes('--dry-run');
initializeApp({ projectId: 'spartboard', credential: applicationDefault() });
const db = getFirestore();

const grants = new Map();
for (const [src, dst, field] of [
  ['feature_permissions', 'feature_permissions_public', 'features'],
  ['global_permissions', 'global_permissions_public', 'global'],
]) {
  const snap = await db.collection(src).get();
  for (const d of snap.docs) {
    const data = d.data();
    if (!dryRun)
      await db
        .collection(dst)
        .doc(d.id)
        .set({ ...data, betaUsers: [] });
    const emails = Array.isArray(data.betaUsers) ? data.betaUsers : [];
    for (const e of emails) {
      if (typeof e !== 'string' || !e.trim()) continue;
      const k = e.trim().toLowerCase();
      const g = grants.get(k) ?? { features: new Set(), global: new Set() };
      g[field].add(d.id);
      grants.set(k, g);
    }
  }
  console.log(
    `${src}: mirrored ${snap.size} docs${dryRun ? ' (dry run)' : ''}`
  );
}
for (const [email, g] of grants) {
  if (!dryRun)
    await db
      .collection('beta_grants')
      .doc(email)
      .set({ features: [...g.features], global: [...g.global] });
}
console.log(`beta_grants: ${grants.size} emails${dryRun ? ' (dry run)' : ''}`);
