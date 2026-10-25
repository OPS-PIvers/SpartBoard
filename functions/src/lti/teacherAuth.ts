// Shared teacher gate for the LTI callables; mirrors firestore.rules isVerifiedDistrictEmail().
const DISTRICT_EMAIL = /^[^@]+@orono\.k12\.mn\.us$/i;

/** True only for a verified district email that is not a student token. */
export function isVerifiedDistrictTeacher(token: {
  email?: string;
  email_verified?: boolean;
  studentRole?: unknown;
}): boolean {
  return (
    token.email_verified === true &&
    typeof token.email === 'string' &&
    DISTRICT_EMAIL.test(token.email) &&
    token.studentRole !== true
  );
}
