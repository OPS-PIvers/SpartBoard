// Students and staff share @orono.k12.mn.us, so rules tests seed the member doc that makes an address staff.
import { doc, setDoc, type Firestore } from 'firebase/firestore';

export const STUDENT_GOOGLE_EMAIL = '704522@orono.k12.mn.us';
export const LEGACY_STUDENT_MEMBER_EMAIL = 'legacy.student@orono.k12.mn.us';
export const INACTIVE_STAFF_EMAIL = 'former.teacher@orono.k12.mn.us';

/** Active teacher member docs for each address, plus a student-role and an inactive member for the denial cases. */
export async function seedDistrictStaff(
  db: Firestore,
  emails: readonly string[]
): Promise<void> {
  const member = (email: string, data: Record<string, unknown>) =>
    setDoc(doc(db, `organizations/orono/members/${email.toLowerCase()}`), {
      email: email.toLowerCase(),
      orgId: 'orono',
      ...data,
    });
  await Promise.all([
    ...emails.map((email) =>
      member(email, { roleId: 'teacher', status: 'active' })
    ),
    member(LEGACY_STUDENT_MEMBER_EMAIL, {
      roleId: 'student',
      status: 'active',
    }),
    member(INACTIVE_STAFF_EMAIL, { roleId: 'teacher', status: 'inactive' }),
  ]);
}

/** Verified Google tokens on the district domain that are not staff. */
export const NOT_STAFF_DISTRICT_EMAILS = [
  STUDENT_GOOGLE_EMAIL,
  LEGACY_STUDENT_MEMBER_EMAIL,
  INACTIVE_STAFF_EMAIL,
] as const;
