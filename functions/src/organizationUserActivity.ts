/**
 * Org-scoped "Last active" lookup.
 *
 * Returns `{ email → lastSignInMs | null }` for every member of an organization
 * by batch-reading `admin.auth().getUsers()` metadata. This is the same signal
 * the Analytics page uses (Firebase Auth `lastSignInTime`), projected through
 * the org's member list so the Users tab can render an accurate "Last active"
 * column for every row — not just the currently signed-in user.
 *
 * Why a callable instead of a client read: Firebase Auth metadata is only
 * reachable via the Admin SDK, so we need the function tier. The callable is
 * scoped to a single orgId and gated on the caller being an admin-tier member
 * of that org.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { type MemberRecord } from './organizationInvites';

if (!admin.apps.length) {
  admin.initializeApp();
}

export interface OrgUserActivityPayload {
  orgId: string;
}

export interface OrgUserActivityEntry {
  email: string;
  lastActiveMs: number | null;
}

export interface OrgUserActivityResponse {
  activity: OrgUserActivityEntry[];
  /**
   * `true` when one or more `admin.auth().getUsers()` batches failed (e.g. Auth
   * outage, transient 5xx, rate limit). The `activity` array still reflects all
   * data we DID retrieve — emails belonging to a failed batch are returned with
   * `lastActiveMs: null`, indistinguishable on the wire from "never signed in".
   *
   * Consumers MUST inspect this flag and surface a "data is incomplete — refresh
   * to retry" affordance when it is `true`, otherwise users will mistake an Auth
   * outage for a roster of inactive members.
   */
  partial: boolean;
  /** Number of `getUsers` batches that failed. `0` when `partial` is `false`. */
  failedBatchCount: number;
}

// Admin-tier roles that can view the org's member activity. Broader than the
// invite/reset-password admin set (super + domain only) because building admins
// can already read the members list today — exposing `lastActive` to them is
// not a new information leak, it's just filling in the column.
const ACTIVITY_ROLE_IDS: readonly string[] = [
  'super_admin',
  'domain_admin',
  'building_admin',
];

// `admin.auth().getUsers()` caps each call at 100 identifiers.
const AUTH_LOOKUP_BATCH = 100;

function parsePayload(data: unknown): OrgUserActivityPayload {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Payload must be an object.');
  }
  const raw = data as Record<string, unknown>;
  const orgId = typeof raw.orgId === 'string' ? raw.orgId.trim() : '';
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required.');
  return { orgId };
}

async function assertCallerIsAdminMember(
  db: admin.firestore.Firestore,
  orgId: string,
  callerEmailLower: string
): Promise<void> {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('members')
    .doc(callerEmailLower)
    .get();
  if (!snap.exists) {
    throw new HttpsError(
      'permission-denied',
      'Caller is not a member of this organization.'
    );
  }
  const data = snap.data() as MemberRecord;
  if (!ACTIVITY_ROLE_IDS.includes(data.roleId)) {
    throw new HttpsError(
      'permission-denied',
      'Caller does not have permission to view member activity.'
    );
  }
}

async function listMemberEmails(
  db: admin.firestore.Firestore,
  orgId: string
): Promise<string[]> {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('members')
    .select() // doc ids only — we don't need the member body here
    .get();
  return snap.docs.map((d) => d.id);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseLastSignIn(metadata: admin.auth.UserMetadata): number | null {
  const raw = metadata.lastSignInTime;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export const getOrgUserActivity = onCall<OrgUserActivityPayload>(
  { region: 'us-central1' },
  async (request): Promise<OrgUserActivityResponse> => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Sign in to view member activity.'
      );
    }
    const callerEmail = request.auth.token.email;
    if (typeof callerEmail !== 'string' || callerEmail.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Caller must have a verified email.'
      );
    }
    const callerEmailLower = callerEmail.toLowerCase();

    const { orgId } = parsePayload(request.data);
    const db = admin.firestore();

    await assertCallerIsAdminMember(db, orgId, callerEmailLower);

    const emails = await listMemberEmails(db, orgId);
    if (emails.length === 0) {
      return { activity: [], partial: false, failedBatchCount: 0 };
    }

    // Populate from Auth in parallel batches. Each getUsers call returns only
    // users that exist — invited-but-never-signed-in members simply don't
    // appear, so we initialize the map with null and overwrite as results land.
    const lastActive = new Map<string, number | null>();
    for (const email of emails) lastActive.set(email, null);

    const batches = chunk(emails, AUTH_LOOKUP_BATCH);
    // Track per-batch failures so we can surface `partial: true` to the caller
    // instead of silently masking an Auth outage as "everyone is inactive".
    type BatchOutcome =
      | { ok: true; result: admin.auth.GetUsersResult }
      | { ok: false; error: unknown };
    const outcomes: BatchOutcome[] = await Promise.all(
      batches.map((batch) =>
        admin
          .auth()
          .getUsers(batch.map((email) => ({ email })))
          .then<BatchOutcome>((result) => ({ ok: true, result }))
          .catch<BatchOutcome>((error: unknown) => ({ ok: false, error }))
      )
    );

    let failedBatchCount = 0;
    let firstFailureCode: string | undefined;
    let firstFailureMessage: string | undefined;
    for (const outcome of outcomes) {
      if (outcome.ok) {
        for (const user of outcome.result.users) {
          const email = user.email?.toLowerCase();
          if (!email) continue;
          if (!lastActive.has(email)) continue;
          lastActive.set(email, parseLastSignIn(user.metadata));
        }
      } else {
        failedBatchCount += 1;
        if (firstFailureCode === undefined) {
          const err = outcome.error as
            | { code?: unknown; message?: unknown }
            | undefined;
          firstFailureCode =
            typeof err?.code === 'string' ? err.code : 'unknown';
          firstFailureMessage =
            typeof err?.message === 'string'
              ? err.message
              : err instanceof Error
                ? err.message
                : JSON.stringify(outcome.error);
        }
      }
    }

    const partial = failedBatchCount > 0;
    if (partial) {
      // Structured fields so Cloud Logging can group/alert on this. Logged at
      // `error` level (not `warn`) because a partial response means at least
      // one row in the admin UI will mis-display until refresh.
      console.error('[getOrgUserActivity] partial response', {
        orgId,
        totalBatches: batches.length,
        failedBatchCount,
        firstFailureCode,
        firstFailureMessage,
      });
    }

    const activity: OrgUserActivityEntry[] = emails.map((email) => ({
      email,
      lastActiveMs: lastActive.get(email) ?? null,
    }));
    return { activity, partial, failedBatchCount };
  }
);
