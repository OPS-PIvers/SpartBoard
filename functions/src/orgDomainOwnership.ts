// Ties accounts to a tenant: Auth accounts are global and org admins author member docs, so only an exclusively verified domain proves an address belongs to an org.
import * as admin from './firebaseAdmin';
import { normalizeEmailDomain } from './classlinkShared';

type Firestore = admin.firestore.Firestore;

// Only organizations/{orgId}/domains/{doc} counts: admin_settings and similar wildcards let admins write nested `domains` docs.
export function isOrgDomainPath(path: string): boolean {
  const seg = path.split('/');
  return seg.length === 4 && seg[0] === 'organizations' && seg[2] === 'domains';
}

// Every verified claim must be this org's: a second org claiming the domain could otherwise win a first-match lookup.
export async function isDomainVerifiedOnlyFor(
  db: Firestore,
  domainWithAt: string,
  orgId: string
): Promise<boolean> {
  const snap = await db
    .collectionGroup('domains')
    .where('domain', '==', domainWithAt)
    .where('status', '==', 'verified')
    .get();
  const claims = snap.docs.filter((d) => isOrgDomainPath(d.ref.path));
  return (
    claims.length > 0 && claims.every((d) => d.ref.parent.parent?.id === orgId)
  );
}

/** The org's verified domains ('@example.org') that no other org also claims. */
export async function loadExclusiveOrgDomains(
  db: Firestore,
  orgId: string
): Promise<Set<string>> {
  const snap = await db
    .collection(`organizations/${orgId}/domains`)
    .where('status', '==', 'verified')
    .get();
  const stored = new Set<string>();
  for (const doc of snap.docs) {
    const raw: unknown = doc.get('domain');
    if (typeof raw === 'string' && raw.startsWith('@')) stored.add(raw);
  }
  const exclusive = new Set<string>();
  await Promise.all(
    [...stored].map(async (domain) => {
      if (await isDomainVerifiedOnlyFor(db, domain, orgId)) {
        exclusive.add(domain.toLowerCase());
      }
    })
  );
  return exclusive;
}

/** True when the address is on one of the given exclusive org domains. */
export function isEmailOnDomains(
  email: string,
  domains: ReadonlySet<string>
): boolean {
  const domain = normalizeEmailDomain(email.trim().toLowerCase());
  return !!domain && domains.has(domain);
}
