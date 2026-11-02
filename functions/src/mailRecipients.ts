// Who district mail may go to: proven Google accounts, and staff addresses checked against their org.
import * as admin from './firebaseAdmin';
import { normalizeEmailDomain, resolveOrgIdForDomain } from './classlinkShared';
import { isStaffMemberData } from './districtStaff';

type Firestore = admin.firestore.Firestore;
type UserLike = Pick<
  admin.auth.UserRecord,
  'email' | 'emailVerified' | 'disabled' | 'providerData' | 'customClaims'
>;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const MAX_EMAIL_LENGTH = 254;
const AUTH_BATCH = 100;

/** One plain address with no display name, list or header characters. */
export function isWellFormedEmail(raw: unknown): raw is string {
  return (
    typeof raw === 'string' &&
    raw.length <= MAX_EMAIL_LENGTH &&
    EMAIL_RE.test(raw)
  );
}

/** The account's email if it signed in with Google, proved the address, and is not disabled or a student/PIN token. */
export function provenGoogleEmail(
  user: UserLike | null | undefined
): string | null {
  if (!user || user.disabled || user.emailVerified !== true) return null;
  const claims = user.customClaims ?? {};
  if (claims.studentRole === true || claims.pinLogin === true) return null;
  if (!(user.providerData ?? []).some((p) => p.providerId === 'google.com'))
    return null;
  const email = user.email?.trim().toLowerCase();
  return email && isWellFormedEmail(email) ? email : null;
}

/** Caches a lookup for one run, and forgets a failed one so the next caller retries. */
function memo<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>
) {
  let hit = cache.get(key);
  if (!hit) {
    hit = load();
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
  }
  return hit;
}

/** Cached lookups for one run: is an address on a verified org domain, and does it hold a staff member doc in any org. */
export function createOrgEmailChecker(db: Firestore) {
  const orgByDomain = new Map<string, Promise<string | null>>();
  const membersByEmail = new Map<
    string,
    Promise<admin.firestore.DocumentData[]>
  >();
  const orgIds = new Map<string, Promise<string[]>>();

  const domainOrg = (email: string): Promise<string | null> => {
    const domain = normalizeEmailDomain(email);
    if (!domain || !isWellFormedEmail(email)) return Promise.resolve(null);
    return memo(orgByDomain, domain, () => resolveOrgIdForDomain(db, domain));
  };

  // Members are keyed by email in every org, including ones joined through Workspace hd or an admin invite.
  const memberDocs = (email: string) =>
    memo(membersByEmail, email, async () => {
      if (!isWellFormedEmail(email)) return [];
      const ids = await memo(orgIds, '', async () =>
        (await db.collection('organizations').get()).docs.map((d) => d.id)
      );
      const snaps = await Promise.all(
        ids.map((id) => db.doc(`organizations/${id}/members/${email}`).get())
      );
      return snaps.flatMap((m) => {
        const data = m.data();
        return data ? [data] : [];
      });
    });

  const isStaff = async (raw: string): Promise<boolean> =>
    (await memberDocs(raw.trim().toLowerCase())).some(isStaffMemberData);

  const isOrgAddress = async (raw: string): Promise<boolean> => {
    const email = raw.trim().toLowerCase();
    if ((await domainOrg(email)) !== null) return true;
    return (await memberDocs(email)).some(
      (m) => (m.status ?? 'active') !== 'inactive'
    );
  };

  return { isOrgAddress, isStaff };
}

/** Staff addresses for these uids, read from Firebase Auth, never from client-written docs. */
export async function resolveStaffEmailsForUids(
  auth: Pick<admin.auth.Auth, 'getUsers'>,
  checker: Pick<ReturnType<typeof createOrgEmailChecker>, 'isStaff'>,
  uids: string[]
): Promise<string[]> {
  const unique = [...new Set(uids)].filter(
    (u) => typeof u === 'string' && u.length > 0 && u.length <= 128
  );
  const out = new Set<string>();
  for (let i = 0; i < unique.length; i += AUTH_BATCH) {
    const chunk = unique.slice(i, i + AUTH_BATCH);
    const { users } = await auth.getUsers(chunk.map((uid) => ({ uid })));
    for (const user of users) {
      const email = provenGoogleEmail(user);
      if (email && (await checker.isStaff(email))) out.add(email);
    }
  }
  return [...out].sort();
}
