// Staff audience: an assignment only signed-in district staff can open, with each response named.
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import type {
  AssignmentAudience,
  AudienceSessionFields,
  StaffResponseFields,
} from '@/types';

export type { AssignmentAudience };

export const STAFF_AUDIENCE_FEATURE = 'staff-audience' as const;

export const STAFF_EMAIL_DOMAIN = 'orono.k12.mn.us';

/** Identity a staff joiner's response carries; rules check both against the ID token. */
export interface StaffIdentity {
  staffEmail: string;
  staffName: string;
}

type StaffAudienceFields = AudienceSessionFields;

export const isStaffAudience = (
  session: StaffAudienceFields | null | undefined
): boolean => session?.audience === 'staff';

/** The session fields an assign flow writes; nothing for a student assignment, so existing sessions stay unchanged. */
export const audienceSessionFields = (
  audience: AssignmentAudience | undefined
): StaffAudienceFields => (audience === 'staff' ? { audience: 'staff' } : {});

export const isDistrictStaffEmail = (email: string | null | undefined) =>
  !!email &&
  new RegExp(`^[^@]+@${STAFF_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`).test(
    email.trim().toLowerCase()
  );

/** Reads the caller's staff identity from their ID token, or null when they are not district staff. */
export async function readStaffIdentity(
  user: User | null
): Promise<StaffIdentity | null> {
  if (!user || user.isAnonymous) return null;
  const { claims } = await user.getIdTokenResult();
  const email = typeof claims.email === 'string' ? claims.email : '';
  if (
    claims.email_verified !== true ||
    claims.studentRole === true ||
    claims.pinLogin === true ||
    !isDistrictStaffEmail(email)
  ) {
    return null;
  }
  return {
    staffEmail: email.toLowerCase(),
    staffName: typeof claims.name === 'string' ? claims.name : '',
  };
}

/** Google sign-in limited to the district domain, with no Drive scopes; a non-district account is signed back out. */
export async function signInAsStaff(auth: Auth): Promise<StaffIdentity> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    hd: STAFF_EMAIL_DOMAIN,
    prompt: 'select_account',
  });
  const { user } = await signInWithPopup(auth, provider);
  const identity = await readStaffIdentity(user);
  if (!identity) {
    await signOut(auth);
    throw new Error('not-district-staff');
  }
  return identity;
}

/** Response fields for a staff joiner; empty for a student session so its writes are unchanged. */
export const staffResponseFields = (
  identity: StaffIdentity | null | undefined
): StaffResponseFields =>
  identity
    ? { staffEmail: identity.staffEmail, staffName: identity.staffName }
    : {};

/** Results name for a staff response: their name, else their email. */
export const staffDisplayName = (
  row: StaffResponseFields | null | undefined
): string | null => {
  if (!row?.staffEmail) return null;
  const name = row.staffName?.trim();
  if (name) return name;
  return row.staffEmail;
};

/** Results label for a staff response, "Name (email)"; null for a student response. */
export const staffResultsLabel = (
  row: StaffResponseFields | null | undefined
): string | null => {
  if (!row?.staffEmail) return null;
  const name = row.staffName?.trim();
  return name ? `${name} (${row.staffEmail})` : row.staffEmail;
};

/** CSV exports add Name and Email only when a staff response is present, so student exports keep their columns. */
export const hasStaffRows = (
  rows: readonly (StaffResponseFields | null | undefined)[]
): boolean => rows.some((r) => !!r?.staffEmail);

export const STAFF_CSV_HEADERS = ['Name', 'Email'] as const;

export const staffCsvCells = (
  row: StaffResponseFields | null | undefined
): string[] => [row?.staffName ?? '', row?.staffEmail ?? ''];

/** Flashcards links are student sign-in only, so a Staff link says so in its query. */
export const FLASHCARD_STAFF_PARAM = 'staff';

export const flashcardAssignmentUrl = (
  sessionId: string,
  audience: AssignmentAudience | undefined
): string =>
  `${window.location.origin}/flashcards/a/${sessionId}${
    audience === 'staff' ? `?${FLASHCARD_STAFF_PARAM}=1` : ''
  }`;
