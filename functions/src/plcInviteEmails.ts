/**
 * PLC invitation email trigger.
 *
 * Fires on any write to `/plc_invitations/{inviteId}` and queues a
 * transactional email via the `firestore-send-email` extension by writing
 * to `/mail/{inviteId}`. Handles creates AND re-sends (the client overwrites
 * the same deterministic doc id `${plcId}_${emailLower}` when an admin
 * re-invites the same email).
 *
 * Gate: `/global_permissions/invite-emails.enabled` — same kill switch the
 * organization-invite path uses. When disabled, the invite doc still lands
 * (the sidebar UI keeps working for the invitee), but no email goes out.
 *
 * Security: `/mail/*` writes are denied to clients in `firestore.rules`; the
 * Admin SDK inside this function is the only path that can create these docs,
 * which is why the extension is safe to point at a user-writable collection.
 *
 * Shape of the email body is mirrored from `organizationInvites.ts`
 * (`buildInvitationEmail`, `escapeHtml`, `MailDoc`) rather than imported,
 * to keep the two invite pipelines independent — each can evolve its own
 * template without one breaking the other.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

// ---------------------------------------------------------------------------
// Types (shape matches types.ts PlcInvitation — kept local because the
// functions package doesn't share a tsconfig with the root.)
// ---------------------------------------------------------------------------

export type PlcInviteStatus = 'pending' | 'accepted' | 'declined';

export interface PlcInvitationDoc {
  plcId: string;
  plcName: string;
  inviteeEmailLower: string;
  invitedByUid: string;
  invitedByName: string;
  invitedAt: number;
  status: PlcInviteStatus;
  respondedAt?: number;
}

export interface InviteEmailConfig {
  enabled: boolean;
  from?: string;
  replyTo?: string;
}

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
 * Prod claim URL origin. Hardcoded to match `organizationInvites.ts` — a
 * future refactor can hoist this into a shared config if we need per-env
 * origins.
 */
export const CLAIM_URL_ORIGIN = 'https://spartboard.web.app';

// ---------------------------------------------------------------------------
// Pure helpers — exported for test coverage
// ---------------------------------------------------------------------------

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Builds the user-facing accept URL for a given invite id. */
export function buildPlcAcceptUrl(inviteId: string): string {
  return `${CLAIM_URL_ORIGIN}/plc-invite/${inviteId}`;
}

/**
 * Validates the parsed invite doc. Returns null for shape-mismatched data so
 * the trigger can skip without throwing (throws trigger Firestore retries,
 * which would keep re-queuing the same broken mail).
 */
export function parseInviteDoc(raw: unknown): PlcInvitationDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (
    typeof data.plcId !== 'string' ||
    typeof data.plcName !== 'string' ||
    typeof data.inviteeEmailLower !== 'string' ||
    typeof data.invitedByUid !== 'string' ||
    typeof data.invitedByName !== 'string' ||
    typeof data.invitedAt !== 'number'
  ) {
    return null;
  }
  const status = data.status;
  if (status !== 'pending' && status !== 'accepted' && status !== 'declined') {
    return null;
  }
  const doc: PlcInvitationDoc = {
    plcId: data.plcId,
    plcName: data.plcName,
    inviteeEmailLower: data.inviteeEmailLower,
    invitedByUid: data.invitedByUid,
    invitedByName: data.invitedByName,
    invitedAt: data.invitedAt,
    status,
  };
  if (typeof data.respondedAt === 'number') {
    doc.respondedAt = data.respondedAt;
  }
  return doc;
}

/**
 * Decides whether the trigger should queue an email for this write.
 *
 * Queue when the post-state is a pending invite AND either:
 *   - the doc didn't exist before (fresh invite), OR
 *   - the previous `invitedAt` differs (re-send: same deterministic id with
 *     a new timestamp stamp).
 *
 * Skip for:
 *   - deletes (no post-state)
 *   - accept/decline transitions (post-state status != 'pending')
 *   - no-op writes (pending -> pending with the same invitedAt)
 *   - malformed docs
 */
export function shouldSendEmail(
  before: PlcInvitationDoc | null,
  after: PlcInvitationDoc | null
): boolean {
  if (!after) return false;
  if (after.status !== 'pending') return false;
  if (!before) return true;
  if (before.status !== 'pending') return true;
  return before.invitedAt !== after.invitedAt;
}

export function buildPlcInvitationEmail(opts: {
  plcName: string;
  invitedByName: string;
  acceptUrl: string;
}): { subject: string; text: string; html: string } {
  const { plcName, invitedByName, acceptUrl } = opts;

  const subject = `${invitedByName} invited you to join "${plcName}" on SpartBoard`;

  const text = [
    `${invitedByName} has invited you to join the Professional Learning Community "${plcName}" on SpartBoard.`,
    '',
    'Accept your invitation:',
    acceptUrl,
    '',
    "If you weren't expecting this email, you can safely ignore it.",
  ].join('\n');

  const safePlc = escapeHtml(plcName);
  const safeInviter = escapeHtml(invitedByName);
  const safeUrl = escapeHtml(acceptUrl);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td style="padding:0 0 16px 0;">
            <div style="font-size:20px;font-weight:600;color:#1d2a5d;">You're invited to a PLC</div>
          </td></tr>
          <tr><td style="padding:0 0 16px 0;color:#334155;font-size:15px;line-height:1.5;">
            <strong>${safeInviter}</strong> has invited you to join the Professional Learning Community <strong>${safePlc}</strong> on SpartBoard.
          </td></tr>
          <tr><td style="padding:16px 0;">
            <a href="${safeUrl}" style="display:inline-block;background:#2d3f89;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">Accept invitation</a>
          </td></tr>
          <tr><td style="padding:16px 0 0 0;color:#64748b;font-size:13px;line-height:1.5;">
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

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

/**
 * Reads the invite-email kill switch from `/global_permissions/invite-emails`.
 * Missing doc / missing `enabled` field defaults to `false` so email never
 * sends accidentally — operator has to opt-in explicitly once the extension
 * is installed and a smoke-test send has landed.
 */
export async function loadInviteEmailConfig(
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

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export const plcInvitationEmail = onDocumentWritten(
  'plc_invitations/{inviteId}',
  async (event) => {
    const { inviteId } = event.params;
    const change = event.data;
    if (!change) {
      logger.warn('plcInvitationEmail: received event without data', {
        inviteId,
      });
      return;
    }

    const before = change.before.exists
      ? parseInviteDoc(change.before.data())
      : null;
    const after = change.after.exists
      ? parseInviteDoc(change.after.data())
      : null;

    if (!shouldSendEmail(before, after)) {
      logger.info('plcInvitationEmail: skipping — not a fresh pending invite', {
        inviteId,
        beforeStatus: before?.status ?? null,
        afterStatus: after?.status ?? null,
      });
      return;
    }

    // Narrowed by shouldSendEmail: `after` is non-null and pending.
    const invite = after as PlcInvitationDoc;

    const db = admin.firestore();
    const emailConfig = await loadInviteEmailConfig(db);
    if (!emailConfig.enabled) {
      logger.info(
        'plcInvitationEmail: kill switch off — skipping email queue',
        { inviteId }
      );
      return;
    }

    // Parent-PLC sanity check. The invite doc's plcName is denormalized so
    // the email renders fine without the parent doc, but if the PLC has
    // been deleted we shouldn't broadcast an invite for a ghost community.
    const plcSnap = await db.collection('plcs').doc(invite.plcId).get();
    if (!plcSnap.exists) {
      logger.warn('plcInvitationEmail: parent PLC missing — skipping', {
        inviteId,
        plcId: invite.plcId,
      });
      return;
    }

    const body = buildPlcInvitationEmail({
      plcName: invite.plcName,
      invitedByName: invite.invitedByName,
      acceptUrl: buildPlcAcceptUrl(inviteId),
    });
    const mailDoc: MailDoc = {
      to: [invite.inviteeEmailLower],
      message: body,
    };
    if (emailConfig.from) mailDoc.from = emailConfig.from;
    if (emailConfig.replyTo) mailDoc.replyTo = emailConfig.replyTo;

    // Mail doc id = invite id. Re-sends overwrite the same doc so the
    // extension re-delivers cleanly and the `/mail/{id}` record stays
    // traceable back to its source invite.
    try {
      await db.collection('mail').doc(inviteId).set(mailDoc);
      logger.info('plcInvitationEmail: queued mail', {
        inviteId,
        plcId: invite.plcId,
        to: invite.inviteeEmailLower,
      });
    } catch (err) {
      // Log and swallow. A thrown trigger is retried by Firestore, which
      // could amplify a transient mail-write failure into a retry loop.
      // Operators watch the logs for these errors.
      logger.error('plcInvitationEmail: failed to queue mail', {
        inviteId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);
