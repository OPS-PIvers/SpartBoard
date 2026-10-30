// Staff-audience identity from a caller's ID token; mirrors utils/staffAudience.ts and staffJoinOk in firestore.rules.
export interface StaffIdentity {
  staffEmail: string;
  staffName: string;
}

const DISTRICT_EMAIL = /^[^@]+@orono\.k12\.mn\.us$/;

/** The caller's verified district staff identity, or null for students, PIN tokens and other accounts. */
export function staffIdentityFromToken(
  token: Record<string, unknown> | null | undefined
): StaffIdentity | null {
  if (!token) return null;
  const email =
    typeof token.email === 'string' ? token.email.toLowerCase() : '';
  if (
    token.email_verified !== true ||
    token.studentRole === true ||
    token.pinLogin === true ||
    !DISTRICT_EMAIL.test(email)
  ) {
    return null;
  }
  return {
    staffEmail: email,
    staffName: typeof token.name === 'string' ? token.name : '',
  };
}
