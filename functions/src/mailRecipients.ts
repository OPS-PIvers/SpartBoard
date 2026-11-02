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

/** Cached lookups for one run: does an address belong to a verified org domain, and is it staff there. */
export function createOrgEmailChecker(db: Firestore) {
  const orgByDomain = new Map<string, Promise<string | null>>();
  const staffByEmail = new Map<string, Promise<boolean>>();

  const orgFor = (email: string): Promise<string | null> => {
    const domain = normalizeEmailDomain(email);
    if (!domain || !isWellFormedEmail(email)) return Promise.resolve(null);
    let hit = orgByDomain.get(domain);
    if (!hit) {
      hit = resolveOrgIdForDomain(db, domain);
      orgByDomain.set(domain, hit);
    }
    return hit;
  };

  const isStaff = (raw: string): Promise<boolean> => {
    const email = raw.trim().toLowerCase();
    let hit = staffByEmail.get(email);
    if (!hit) {
      hit = orgFor(email).then(async (orgId) => {
        if (!orgId) return false;
        const member = await db
          .doc(`organizations/${orgId}/members/${email}`)
          .get();
        return isStaffMemberData(member.data());
      });
      staffByEmail.set(email, hit);
    }
    return hit;
  };

  return {
    isOrgAddress: async (raw: string) =>
      (await orgFor(raw.trim().toLowerCase())) !== null,
    isStaff,
  };
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
