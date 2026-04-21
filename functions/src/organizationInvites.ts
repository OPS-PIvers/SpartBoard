/**
 * Organization invitations — Phase 4 task A.
 *
 * Two v2 onCall functions back the invite flow:
 *
 *  - createOrganizationInvites: issues invite tokens and writes the matching
 *    `members/{emailLower}` (status: 'invited') + `invitations/{token}` docs.
 *    Idempotent by email: re-inviting an already-invited user refreshes
 *    role/buildingIds and mints a fresh token; an already-active user is
 *    skipped with status 'already_active' (their existing uid/status are not
 *    disturbed).
 *
 *  - claimOrganizationInvite: links the signed-in user's uid onto the pending
 *    member doc via Admin SDK (which bypasses rules — the firestore rules
 *    whitelist for member-update deliberately excludes `uid` so this path is
 *    the only way a uid lands on a member doc). Marks the invitation
 *    `claimedAt`.
 *
 * No email is sent from this function — the invite URL is returned so the UI
 * can copy it to the clipboard. Transactional email is deferred to a later
 * phase (see Phase 4 decisions in docs/organization_wiring_implementation.md).
 *
 * The business logic is kept in exported pure helpers so tests don't need to
 * stub Firestore for the common validation/mapping paths. The onCall wrappers
 * are thin shells that call the helpers and then run transactional writes.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// Guard against double-initialization. The main index.ts module calls
// initializeApp() at load time; if that module is loaded first (normal
// production path), admin.apps.length is 1 and we leave it alone. When this
// module is loaded in isolation (tests, tooling) we bootstrap it ourselves.
if (!admin.apps.length) {
  admin.initializeApp();
}

// ---------------------------------------------------------------------------
// Types (shape matches types/organization.ts — kept local because the
// functions package doesn't share a tsconfig with the root.)
// ---------------------------------------------------------------------------

export type RoleId = string;
export type UserStatus = 'active' | 'invited' | 'inactive';

export interface RawInviteInput {
  email?: unknown;
  roleId?: unknown;
  buildingIds?: unknown;
  name?: unknown;
}

export interface NormalizedInvite {
  email: string;
  roleId: string;
  buildingIds: string[];
  name?: string;
}

export interface CreateInvitesPayload {
  orgId: string;
  invitations: NormalizedInvite[];
  message?: string;
  expiresInDays: number;
}

export interface CreateInviteResult {
  email: string;
  token: string;
  claimUrl: string;
  status: 'created' | 'already_active' | 'skipped';
}

export interface CreateInviteError {
  email: string;
  reason: string;
}

export interface CreateOrganizationInvitesResponse {
  invitations: CreateInviteResult[];
  errors: CreateInviteError[];
}

export interface InvitationRecord {
  token: string;
  orgId: string;
  email: string;
  roleId: RoleId;
  buildingIds: string[];
  createdAt: string;
  expiresAt: string;
  issuedBy: string;
  claimedAt?: string;
  claimedByUid?: string;
}

export interface MemberRecord {
  email: string;
  orgId: string;
  roleId: RoleId;
  buildingIds: string[];
  status: UserStatus;
  uid?: string;
  name?: string;
  invitedAt?: string;
  lastActive?: string | null;
  addedBy?: string;
  addedBySource?: string;
}

// Minimal view of the org doc — only the fields the invite email needs.
// Full shape lives in types/organization.ts (OrgRecord) but the functions
// package doesn't share that tsconfig, so we repeat just what's used here.
export interface OrgLite {
  id: string;
  name: string;
}

// Runtime config for the Trigger Email extension queue. Sourced from
// `/global_permissions/invite-emails`. When `enabled: false` the CF skips
// the /mail/{token} write entirely so no email goes out — invites still
// mint and the copy-link flow keeps working. `from` and `replyTo` are
// optional overrides; when unset, the extension's configured defaults apply.
export interface InviteEmailConfig {
  enabled: boolean;
  from?: string;
  replyTo?: string;
}

// Shape written to the `mail` collection that the `firestore-send-email`
// Firebase extension watches. Keeping this local (not imported from the
// extension package) avoids pulling a dependency the rest of the CFs
// don't need.
export interface MailDoc {
  to: string[];
  from?: string;
  replyTo?: string;
  message: {
    subject: string;
    text: string;
    html: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Prod claim URL origin. Hardcoded for Phase 4 — a future refactor can pull
 * this from a config doc or env var if we need per-environment claim URLs.
 */
export const CLAIM_URL_ORIGIN = 'https://spartboard.web.app';

/** Roles permitted to mint invitations. */
export const ADMIN_ROLE_IDS: readonly RoleId[] = [
  'super_admin',
  'domain_admin',
];

/** Maximum invitation TTL in days (clamp ceiling). */
export const MAX_EXPIRES_IN_DAYS = 60;

/** Default invitation TTL in days when payload omits the field. */
export const DEFAULT_EXPIRES_IN_DAYS = 14;

// ---------------------------------------------------------------------------
// Pure helpers — exported for test coverage
// ---------------------------------------------------------------------------

/**
 * Clamps an expiresInDays input to the allowed range. Non-positive, NaN, or
 * missing inputs fall back to DEFAULT_EXPIRES_IN_DAYS; values above the ceiling
 * are capped at MAX_EXPIRES_IN_DAYS.
 */
export function clampExpiresInDays(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_EXPIRES_IN_DAYS;
  }
  const rounded = Math.floor(raw);
  if (rounded <= 0) return DEFAULT_EXPIRES_IN_DAYS;
  if (rounded > MAX_EXPIRES_IN_DAYS) return MAX_EXPIRES_IN_DAYS;
  return rounded;
}

/**
 * Normalizes a single raw invite payload entry. Returns null for entries that
 * fail schema validation (the caller records them as errors).
 */
export function normalizeInvite(
  raw: RawInviteInput
): { invite: NormalizedInvite } | { error: CreateInviteError } {
  const rawEmail = typeof raw.email === 'string' ? raw.email.trim() : '';
  if (!rawEmail) {
    return {
      error: {
        email: '',
        reason: 'Missing email.',
      },
    };
  }
  const email = rawEmail.toLowerCase();
  // Minimal email shape check: must contain @ and at least one . after @.
  const atIdx = email.indexOf('@');
  if (atIdx < 1 || email.indexOf('.', atIdx) < 0) {
    return { error: { email, reason: 'Malformed email address.' } };
  }

  const roleId = typeof raw.roleId === 'string' ? raw.roleId.trim() : '';
  if (!roleId) {
    return { error: { email, reason: 'Missing roleId.' } };
  }

  let buildingIds: string[] = [];
  if (Array.isArray(raw.buildingIds)) {
    buildingIds = raw.buildingIds
      .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      .map((b) => b.trim());
  }

  const name =
    typeof raw.name === 'string' && raw.name.trim().length > 0
      ? raw.name.trim()
      : undefined;

  const invite: NormalizedInvite = { email, roleId, buildingIds };
  if (name !== undefined) invite.name = name;
  return { invite };
}

/**
 * Parses and validates the `createOrganizationInvites` payload. Throws
 * HttpsError('invalid-argument') for structural failures. Entries that fail
 * per-invite validation are returned separately so partial success can be
 * reported without aborting the whole batch.
 */
export function parseCreateInvitesPayload(raw: unknown): {
  payload: CreateInvitesPayload;
  perEntryErrors: CreateInviteError[];
} {
  if (!raw || typeof raw !== 'object') {
    throw new HttpsError('invalid-argument', 'Payload must be an object.');
  }
  const obj = raw as Record<string, unknown>;

  const orgId = typeof obj.orgId === 'string' ? obj.orgId.trim() : '';
  if (!orgId) {
    throw new HttpsError('invalid-argument', 'orgId is required.');
  }

  const invitationsRaw = obj.invitations;
  if (!Array.isArray(invitationsRaw) || invitationsRaw.length === 0) {
    throw new HttpsError(
      'invalid-argument',
      'invitations must be a non-empty array.'
    );
  }

  const invitations: NormalizedInvite[] = [];
  const perEntryErrors: CreateInviteError[] = [];
  for (const entry of invitationsRaw) {
    if (!entry || typeof entry !== 'object') {
      perEntryErrors.push({ email: '', reason: 'Invalid invite entry.' });
      continue;
    }
    const result = normalizeInvite(entry as RawInviteInput);
    if ('error' in result) {
      perEntryErrors.push(result.error);
    } else {
      invitations.push(result.invite);
    }
  }

  const expiresInDays = clampExpiresInDays(obj.expiresInDays);

  return {
    payload: {
      orgId,
      invitations,
      expiresInDays,
      ...(typeof obj.message === 'string' ? { message: obj.message } : {}),
    },
    perEntryErrors,
  };
}

export interface ClaimInvitePayload {
  token: string;
  orgId: string;
}

/** Parses the `claimOrganizationInvite` payload. */
export function parseClaimInvitePayload(raw: unknown): ClaimInvitePayload {
  if (!raw || typeof raw !== 'object') {
    throw new HttpsError('invalid-argument', 'Payload must be an object.');
  }
  const obj = raw as Record<string, unknown>;
  const token = typeof obj.token === 'string' ? obj.token.trim() : '';
  const orgId = typeof obj.orgId === 'string' ? obj.orgId.trim() : '';
  if (!token) throw new HttpsError('invalid-argument', 'token is required.');
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required.');
  return { token, orgId };
}

/** Generates a URL-safe invitation token. */
export function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Builds the user-facing claim URL for a given token. */
export function buildClaimUrl(token: string): string {
  return `${CLAIM_URL_ORIGIN}/invite/${token}`;
}

/**
 * Minimal HTML-escape for user-supplied strings interpolated into the
 * invitation email body. We only interpolate: org name, role label, admin's
 * personal message, and expiry date. Inviters are trusted org admins but
 * the invitee's mail client renders this as HTML, so any `<` / `>` / `&` /
 * `"` in those fields must not become live markup.
 */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Turns a roleId into a human-friendly label for the invite email. We don't
 * load the org's role docs (one extra read per invite, marginal value for
 * the email body), so this is a best-effort transform: system roleIds get
 * Title Case + spaces; custom roleIds fall through as-is.
 */
export function formatRoleLabel(roleId: string): string {
  return roleId
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Builds the invitation email body. Pure — no I/O, no side effects. The
 * returned `{subject, text, html}` is written straight into the `mail`
 * collection doc that the Trigger Email extension picks up.
 *
 * Design notes:
 *   - HTML body is a single-column table layout (the only thing that
 *     renders consistently across Gmail/Outlook/Apple Mail). No external
 *     CSS, no web fonts — inline styles only.
 *   - The text body is the authoritative plaintext fallback. Spam filters
 *     weight the text/html similarity, so the plaintext carries the same
 *     claim URL and call-to-action, not a "view in browser" stub.
 *   - `personalMessage` from the admin is rendered inside a left-border
 *     blockquote so it reads as "the admin's own words" rather than
 *     platform boilerplate.
 *   - `expiresAt` is shown in the invitee's local time would be ideal, but
 *     the CF has no access to their TZ; we show UTC with the date first
 *     ("April 27, 2026") which reads naturally in any locale.
 */
export function buildInvitationEmail(opts: {
  orgName: string;
  roleId: string;
  claimUrl: string;
  expiresAt: string;
  personalMessage?: string;
}): { subject: string; text: string; html: string } {
  const { orgName, roleId, claimUrl, expiresAt, personalMessage } = opts;
  const roleLabel = formatRoleLabel(roleId);
  const expiryDate = new Date(expiresAt);
  const expiryFormatted = expiryDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const subject = `You're invited to ${orgName} on SpartBoard`;

  const textLines = [
    `You've been invited to join ${orgName} on SpartBoard as a ${roleLabel}.`,
    '',
  ];
  if (personalMessage && personalMessage.trim()) {
    textLines.push('A note from your administrator:');
    for (const line of personalMessage.trim().split('\n')) {
      textLines.push(`  ${line}`);
    }
    textLines.push('');
  }
  textLines.push(
    'Accept your invitation:',
    claimUrl,
    '',
    `This invitation expires on ${expiryFormatted} (UTC).`,
    '',
    "If you weren't expecting this email, you can safely ignore it."
  );
  const text = textLines.join('\n');

  const safeOrg = escapeHtml(orgName);
  const safeRole = escapeHtml(roleLabel);
  const safeExpiry = escapeHtml(expiryFormatted);
  const safeUrl = escapeHtml(claimUrl);
  const messageBlock =
    personalMessage && personalMessage.trim()
      ? `
        <tr><td style="padding:0 0 16px 0;">
          <div style="border-left:3px solid #2d3f89;padding:8px 12px;color:#334155;font-style:italic;background:#f8fafc;">
            ${escapeHtml(personalMessage.trim()).replace(/\n/g, '<br>')}
          </div>
        </td></tr>`
      : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td style="padding:0 0 16px 0;">
            <div style="font-size:20px;font-weight:600;color:#1d2a5d;">You're invited to ${safeOrg}</div>
          </td></tr>
          <tr><td style="padding:0 0 16px 0;color:#334155;font-size:15px;line-height:1.5;">
            You've been invited to join <strong>${safeOrg}</strong> on SpartBoard as a <strong>${safeRole}</strong>.
          </td></tr>
          ${messageBlock}
          <tr><td style="padding:16px 0;">
            <a href="${safeUrl}" style="display:inline-block;background:#2d3f89;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">Accept invitation</a>
          </td></tr>
          <tr><td style="padding:16px 0 0 0;color:#64748b;font-size:13px;line-height:1.5;">
            This invitation expires on <strong>${safeExpiry}</strong> (UTC).<br>
            If the button doesn't work, paste this link into your browser:<br>
            <span style="word-break:break-all;color:#2d3f89;">${safeUrl}</span>
          </td></tr>
          <tr><td style="padding:24px 0 0 0;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
            If you weren't expecting this email, you can safely ignore it.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

/**
 * Computes the expiresAt ISO timestamp from a given `now` and TTL in days.
 * Extracted so tests can pump in a deterministic clock.
 */
export function computeExpiresAt(now: Date, expiresInDays: number): string {
  const clamped = clampExpiresInDays(expiresInDays);
  const expiresAt = new Date(now.getTime() + clamped * 24 * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

/**
 * Given an existing member doc (or undefined) and a fresh invite intent,
 * decides how the write should proceed.
 *
 * - If status === 'active': skip the member write entirely; do not mint an
 *   invitation. Returns 'already_active'.
 * - Otherwise: refresh roleId/buildingIds/invitedAt on the member; mint a
 *   fresh token. Returns 'create' with the merge patch that callers should
 *   apply. `uid` and `lastActive` are never written here — we only set fields
 *   that the rules whitelist explicitly permits for a member-create/update.
 */
export function planMemberWrite(
  existing: MemberRecord | undefined,
  invite: NormalizedInvite,
  {
    orgId,
    now,
    addedBy,
  }: {
    orgId: string;
    now: Date;
    addedBy: string;
  }
):
  | { action: 'already_active' }
  | {
      action: 'create';
      patch: Partial<MemberRecord> & Pick<MemberRecord, 'email' | 'orgId'>;
    } {
  if (existing?.status === 'active') {
    return { action: 'already_active' };
  }

  const patch: Partial<MemberRecord> & Pick<MemberRecord, 'email' | 'orgId'> = {
    email: invite.email,
    orgId,
    roleId: invite.roleId,
    buildingIds: invite.buildingIds,
    status: 'invited',
    invitedAt: now.toISOString(),
    addedBy,
  };
  if (invite.name !== undefined) {
    patch.name = invite.name;
  } else if (existing?.name !== undefined) {
    // preserve existing name on refresh
    patch.name = existing.name;
  }
  return { action: 'create', patch };
}

/**
 * Classifies the current state of a claim attempt. Pure — does not touch
 * Firestore. Callers feed in the read results and use the returned verdict to
 * either throw the appropriate HttpsError or commit the write.
 */
export type ClaimVerdict =
  | {
      ok: true;
      memberPatch: Partial<MemberRecord>;
      invitationPatch: Partial<InvitationRecord>;
    }
  | {
      ok: false;
      code:
        | 'not-found'
        | 'failed-precondition'
        | 'deadline-exceeded'
        | 'permission-denied'
        | 'internal';
      message: string;
    };

export function evaluateClaim({
  invitation,
  member,
  signedInEmailLower,
  signedInUid,
  now,
}: {
  invitation: InvitationRecord | undefined;
  member: MemberRecord | undefined;
  signedInEmailLower: string;
  signedInUid: string;
  now: Date;
}): ClaimVerdict {
  if (!invitation) {
    return {
      ok: false,
      code: 'not-found',
      message: 'Invitation not found or already used.',
    };
  }
  if (invitation.claimedAt) {
    return {
      ok: false,
      code: 'failed-precondition',
      message: 'Invitation already claimed.',
    };
  }
  if (new Date(invitation.expiresAt).getTime() < now.getTime()) {
    return {
      ok: false,
      code: 'deadline-exceeded',
      message: 'Invitation expired.',
    };
  }
  if (invitation.email !== signedInEmailLower) {
    return {
      ok: false,
      code: 'permission-denied',
      message: 'This invitation is not for this account.',
    };
  }
  if (!member) {
    return {
      ok: false,
      code: 'internal',
      message:
        'Invitation is valid but no matching member record exists. Contact an administrator.',
    };
  }
  const nowIso = now.toISOString();
  return {
    ok: true,
    memberPatch: {
      uid: signedInUid,
      status: 'active',
      lastActive: nowIso,
    },
    invitationPatch: {
      claimedAt: nowIso,
      claimedByUid: signedInUid,
    },
  };
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

/**
 * Loads the caller's member doc and verifies they hold an admin role. Throws
 * permission-denied otherwise.
 */
async function assertCallerIsOrgAdmin(
  db: admin.firestore.Firestore,
  orgId: string,
  callerEmailLower: string
): Promise<void> {
  const memberRef = db
    .collection('organizations')
    .doc(orgId)
    .collection('members')
    .doc(callerEmailLower);
  const snap = await memberRef.get();
  if (!snap.exists) {
    throw new HttpsError(
      'permission-denied',
      'Caller is not a member of this organization.'
    );
  }
  const data = snap.data() as MemberRecord;
  if (!ADMIN_ROLE_IDS.includes(data.roleId)) {
    throw new HttpsError(
      'permission-denied',
      'Caller does not have permission to invite members.'
    );
  }
}

/**
 * Loads the org doc and returns a minimal view (`OrgLite`) containing the
 * fields the invite flow needs. Throws `not-found` if the org doesn't
 * exist. Replaces the earlier `assertOrgExists` — we need the org's display
 * name for the invite email anyway, so folding the read into one call
 * avoids a second round-trip.
 */
async function loadOrg(
  db: admin.firestore.Firestore,
  orgId: string
): Promise<OrgLite> {
  const orgRef = db.collection('organizations').doc(orgId);
  const snap = await orgRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Organization '${orgId}' not found.`);
  }
  const data = snap.data() ?? {};
  // Fall back to the orgId if `name` isn't set — old seed docs from Phase 1
  // may predate the field. The email subject becomes "You're invited to
  // orono on SpartBoard", which is ugly but doesn't break the flow.
  const name = typeof data.name === 'string' && data.name ? data.name : orgId;
  return { id: orgId, name };
}

/**
 * Reads the invite-email kill switch from `/global_permissions/invite-emails`.
 * Missing doc / missing `enabled` field defaults to `false` so email never
 * sends accidentally — we have to opt-in explicitly after the extension is
 * installed and a smoke-test send has landed.
 */
async function loadInviteEmailConfig(
  db: admin.firestore.Firestore
): Promise<InviteEmailConfig> {
  const snap = await db
    .collection('global_permissions')
    .doc('invite-emails')
    .get();
  if (!snap.exists) return { enabled: false };
  const data = snap.data() ?? {};
  return {
    enabled: data.enabled === true,
    from: typeof data.from === 'string' ? data.from : undefined,
    replyTo: typeof data.replyTo === 'string' ? data.replyTo : undefined,
  };
}

/** Returns the set of valid role ids for the org. */
async function loadRoleIds(
  db: admin.firestore.Firestore,
  orgId: string
): Promise<Set<string>> {
  const rolesSnap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('roles')
    .get();
  return new Set(rolesSnap.docs.map((d) => d.id));
}

/** Returns the set of valid building ids for the org. */
async function loadBuildingIds(
  db: admin.firestore.Firestore,
  orgId: string
): Promise<Set<string>> {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('buildings')
    .get();
  return new Set(snap.docs.map((d) => d.id));
}

/**
 * Filters buildingIds to only those present in the org's buildings
 * subcollection. Missing ids are dropped silently with a console.warn. Callers
 * receive the filtered set.
 */
export function filterValidBuildingIds(
  requested: string[],
  known: Set<string>,
  email: string
): string[] {
  const valid: string[] = [];
  const dropped: string[] = [];
  for (const id of requested) {
    if (known.has(id)) {
      valid.push(id);
    } else {
      dropped.push(id);
    }
  }
  if (dropped.length > 0) {
    console.warn(
      `[organizationInvites] Dropped unknown buildingIds for ${email}: ${dropped.join(', ')}`
    );
  }
  return valid;
}

// ---------------------------------------------------------------------------
// onCall: createOrganizationInvites
// ---------------------------------------------------------------------------

export const createOrganizationInvites = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request): Promise<CreateOrganizationInvitesResponse> => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }
    const callerEmail = request.auth.token.email;
    if (!callerEmail) {
      throw new HttpsError(
        'invalid-argument',
        'Caller must have an email associated with their account.'
      );
    }
    const callerEmailLower = callerEmail.toLowerCase();
    const callerUid = request.auth.uid;

    const { payload, perEntryErrors } = parseCreateInvitesPayload(request.data);

    const db = admin.firestore();

    // Authorization & existence checks happen serially (cheap reads, fail fast).
    const org = await loadOrg(db, payload.orgId);
    await assertCallerIsOrgAdmin(db, payload.orgId, callerEmailLower);

    const validRoleIds = await loadRoleIds(db, payload.orgId);
    const validBuildingIds = await loadBuildingIds(db, payload.orgId);
    const emailConfig = await loadInviteEmailConfig(db);

    const results: CreateInviteResult[] = [];
    const errors: CreateInviteError[] = [...perEntryErrors];

    // Dedupe by email within this batch — later entries win to match the
    // CSV-import use-case where a trailing correction should override an
    // earlier row.
    const byEmail = new Map<string, NormalizedInvite>();
    for (const invite of payload.invitations) {
      byEmail.set(invite.email, invite);
    }

    // Process each invite in its own transaction so one failure doesn't
    // abort the whole batch. Sequential (not Promise.all) to keep Firestore
    // contention low on tiny batches and predictable on larger ones.
    for (const invite of byEmail.values()) {
      if (!validRoleIds.has(invite.roleId)) {
        errors.push({
          email: invite.email,
          reason: `Unknown roleId '${invite.roleId}'.`,
        });
        continue;
      }
      const scopedBuildingIds = filterValidBuildingIds(
        invite.buildingIds,
        validBuildingIds,
        invite.email
      );
      const scopedInvite: NormalizedInvite = {
        ...invite,
        buildingIds: scopedBuildingIds,
      };

      try {
        const result = await writeInvitation(db, {
          orgId: payload.orgId,
          orgName: org.name,
          invite: scopedInvite,
          expiresInDays: payload.expiresInDays,
          issuedBy: callerUid,
          personalMessage: payload.message,
          emailConfig,
        });
        results.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error.';
        console.error(
          `[organizationInvites] Failed to create invite for ${invite.email}:`,
          err
        );
        errors.push({ email: invite.email, reason: message });
      }
    }

    return { invitations: results, errors };
  }
);

/**
 * Runs the member+invitation transaction for a single invite. Returns the
 * user-facing result for inclusion in the batch response. Exported only for
 * testing the Firestore-touching path if needed — production callers should
 * go through `createOrganizationInvites`.
 */
async function writeInvitation(
  db: admin.firestore.Firestore,
  opts: {
    orgId: string;
    orgName: string;
    invite: NormalizedInvite;
    expiresInDays: number;
    issuedBy: string;
    personalMessage?: string;
    emailConfig: InviteEmailConfig;
  }
): Promise<CreateInviteResult> {
  const {
    orgId,
    orgName,
    invite,
    expiresInDays,
    issuedBy,
    personalMessage,
    emailConfig,
  } = opts;
  const now = new Date();

  const memberRef = db
    .collection('organizations')
    .doc(orgId)
    .collection('members')
    .doc(invite.email);

  const token = generateToken();
  const invitationRef = db
    .collection('organizations')
    .doc(orgId)
    .collection('invitations')
    .doc(token);
  // Mail doc id = invitation token. Ties the send 1:1 to the invite (so a
  // re-send for the same token would be idempotent) and makes the extension
  // output easy to trace back to its source invite.
  const mailRef = db.collection('mail').doc(token);

  const status = await db.runTransaction(
    async (tx): Promise<'created' | 'already_active'> => {
      const memberSnap = await tx.get(memberRef);
      const existing = memberSnap.exists
        ? (memberSnap.data() as MemberRecord)
        : undefined;

      const plan = planMemberWrite(existing, invite, {
        orgId,
        now,
        addedBy: issuedBy,
      });

      if (plan.action === 'already_active') {
        // Don't mint an invitation or queue mail — the user is already
        // active and the UI should reflect "already_active".
        return 'already_active';
      }

      tx.set(memberRef, plan.patch, { merge: true });

      const expiresAt = computeExpiresAt(now, expiresInDays);
      const invitation: InvitationRecord = {
        token,
        orgId,
        email: invite.email,
        roleId: invite.roleId,
        buildingIds: invite.buildingIds,
        createdAt: now.toISOString(),
        expiresAt,
        issuedBy,
      };
      tx.set(invitationRef, invitation);

      // Email queue: only touched when the flag is enabled. Writing here
      // (inside the same tx) means "invite minted AND email queued" is
      // atomic — if the tx aborts, neither lands. The extension picks up
      // /mail/{token} async and appends its own `delivery` subfield for
      // observability.
      if (emailConfig.enabled) {
        const body = buildInvitationEmail({
          orgName,
          roleId: invite.roleId,
          claimUrl: buildClaimUrl(token),
          expiresAt,
          personalMessage,
        });
        const mailDoc: MailDoc = {
          to: [invite.email],
          message: body,
        };
        if (emailConfig.from) mailDoc.from = emailConfig.from;
        if (emailConfig.replyTo) mailDoc.replyTo = emailConfig.replyTo;
        tx.set(mailRef, mailDoc);
      }
      return 'created';
    }
  );

  if (status === 'already_active') {
    return {
      email: invite.email,
      token: '',
      claimUrl: '',
      status: 'already_active',
    };
  }

  return {
    email: invite.email,
    token,
    claimUrl: buildClaimUrl(token),
    status: 'created',
  };
}

// ---------------------------------------------------------------------------
// onCall: claimOrganizationInvite
// ---------------------------------------------------------------------------

export interface ClaimOrganizationInviteResponse {
  orgId: string;
  roleId: RoleId;
  buildingIds: string[];
}

export const claimOrganizationInvite = onCall(
  {
    memory: '128MiB',
    timeoutSeconds: 30,
  },
  async (request): Promise<ClaimOrganizationInviteResponse> => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }
    const callerEmail = request.auth.token.email;
    if (!callerEmail) {
      throw new HttpsError(
        'invalid-argument',
        'Caller must have an email associated with their account.'
      );
    }
    const { token, orgId } = parseClaimInvitePayload(request.data);
    const signedInEmailLower = callerEmail.toLowerCase();
    const signedInUid = request.auth.uid;

    const db = admin.firestore();

    const invitationRef = db
      .collection('organizations')
      .doc(orgId)
      .collection('invitations')
      .doc(token);

    const result = await db.runTransaction(async (tx) => {
      const invitationSnap = await tx.get(invitationRef);
      const invitation = invitationSnap.exists
        ? (invitationSnap.data() as InvitationRecord)
        : undefined;

      // Email -> member doc id. Read the member doc BEFORE we know the
      // verdict so the transaction sees a consistent snapshot of both docs.
      // Use the invitation's email when available (authoritative); fall back
      // to the signed-in email so the "invitation missing" verdict still wins.
      const memberEmail = invitation?.email ?? signedInEmailLower;
      const memberRef = db
        .collection('organizations')
        .doc(orgId)
        .collection('members')
        .doc(memberEmail);
      const memberSnap = await tx.get(memberRef);
      const member = memberSnap.exists
        ? (memberSnap.data() as MemberRecord)
        : undefined;

      const verdict = evaluateClaim({
        invitation,
        member,
        signedInEmailLower,
        signedInUid,
        now: new Date(),
      });

      if (!verdict.ok) {
        throw new HttpsError(verdict.code, verdict.message);
      }

      tx.update(memberRef, verdict.memberPatch);
      tx.update(invitationRef, verdict.invitationPatch);

      // `member` is defined here — evaluateClaim only returns ok when member
      // exists. Narrow explicitly for TS.
      if (!member) {
        throw new HttpsError(
          'internal',
          'Member record disappeared mid-transaction.'
        );
      }

      return {
        orgId,
        roleId: member.roleId,
        buildingIds: member.buildingIds,
      };
    });

    return result;
  }
);
