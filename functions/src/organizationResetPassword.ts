/**
 * Admin-initiated password reset — Phase 4 task.
 *
 * A single v2 onCall function that an org admin can invoke to trigger a
 * Firebase Auth password-reset email for another member of their org.
 *
 * Authorization mirrors `createOrganizationInvites`: caller must be a
 * super_admin OR domain_admin on the target org (per the member doc's
 * roleId). Target email must already have a member doc in the org — we never
 * expose this callable for arbitrary email addresses; it's strictly a
 * "reset this existing member's password" primitive.
 *
 * The reset link is minted via Admin SDK (`auth.generatePasswordResetLink`)
 * and queued through the same `mail/{docId}` collection that the Trigger
 * Email extension watches. The email queue respects the `invite-emails`
 * global_permissions flag — when disabled we still mint the link and return
 * it so the admin can copy/paste.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import {
  ADMIN_ROLE_IDS,
  type MemberRecord,
  type MailDoc,
  type InviteEmailConfig,
  escapeHtml,
} from './organizationInvites';

if (!admin.apps.length) {
  admin.initializeApp();
}

export interface ResetPasswordPayload {
  orgId: string;
  email: string;
}

export interface ResetPasswordResponse {
  sent: boolean;
  email: string;
  /**
   * The minted Firebase Auth password-reset URL. Only populated when the
   * `invite-emails` global permission is disabled — in that case the org
   * admin needs the link to copy/paste manually. When the email queue is
   * enabled and the queue write succeeds, the URL is intentionally omitted
   * so admins cannot bypass the audit trail (they must trust the queue).
   */
  resetUrl?: string;
}

function parsePayload(data: unknown): ResetPasswordPayload {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Payload must be an object.');
  }
  const raw = data as Record<string, unknown>;
  const orgId = typeof raw.orgId === 'string' ? raw.orgId.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.trim() : '';
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required.');
  if (!email) throw new HttpsError('invalid-argument', 'email is required.');
  return { orgId, email: email.toLowerCase() };
}

async function loadMember(
  db: admin.firestore.Firestore,
  orgId: string,
  emailLower: string
): Promise<MemberRecord> {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('members')
    .doc(emailLower)
    .get();
  if (!snap.exists) {
    throw new HttpsError(
      'not-found',
      `No member record for ${emailLower} in this organization.`
    );
  }
  return snap.data() as MemberRecord;
}

async function assertCallerIsOrgAdmin(
  db: admin.firestore.Firestore,
  orgId: string,
  callerEmailLower: string
): Promise<void> {
  const caller = await loadMember(db, orgId, callerEmailLower).catch(() => {
    throw new HttpsError(
      'permission-denied',
      'Caller is not a member of this organization.'
    );
  });
  if (!ADMIN_ROLE_IDS.includes(caller.roleId)) {
    throw new HttpsError(
      'permission-denied',
      'Caller does not have permission to reset passwords.'
    );
  }
}

async function loadEmailConfig(
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

function buildResetEmail(opts: { resetUrl: string; targetEmail: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const { resetUrl, targetEmail } = opts;
  const subject = 'Reset your SpartBoard password';
  const text = [
    `An administrator requested a password reset for ${targetEmail}.`,
    '',
    'Reset your password:',
    resetUrl,
    '',
    "If you weren't expecting this email, you can safely ignore it.",
  ].join('\n');
  const safeUrl = escapeHtml(resetUrl);
  const safeEmail = escapeHtml(targetEmail);
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td style="padding:0 0 16px 0;">
            <div style="font-size:20px;font-weight:600;color:#1d2a5d;">Reset your password</div>
          </td></tr>
          <tr><td style="padding:0 0 16px 0;color:#334155;font-size:15px;line-height:1.5;">
            An administrator requested a password reset for <strong>${safeEmail}</strong>.
          </td></tr>
          <tr><td style="padding:16px 0;">
            <a href="${safeUrl}" style="display:inline-block;background:#2d3f89;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">Reset password</a>
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

export const resetOrganizationUserPassword = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request): Promise<ResetPasswordResponse> => {
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

    const { orgId, email } = parsePayload(request.data);
    const db = admin.firestore();

    await assertCallerIsOrgAdmin(db, orgId, callerEmailLower);
    await loadMember(db, orgId, email);

    // Firebase Auth's `generatePasswordResetLink` throws `auth/user-not-found`
    // if no Auth user matches — common for members who were invited but
    // haven't claimed yet. We surface that as a clear HttpsError so the UI
    // can tell the admin to re-invite rather than reset.
    let resetUrl: string;
    try {
      resetUrl = await admin.auth().generatePasswordResetLink(email);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found') {
        throw new HttpsError(
          'failed-precondition',
          `${email} has no Auth account yet. Ask them to claim their invite first.`
        );
      }
      console.error('[resetOrganizationUserPassword] Auth error', err);
      throw new HttpsError('internal', 'Failed to mint password-reset link.');
    }

    const emailConfig = await loadEmailConfig(db);
    if (emailConfig.enabled) {
      // Queue the email through the Trigger Email extension. If this write
      // fails we let the error propagate — the caller should retry rather
      // than silently fall back to handing the URL to the admin, because
      // doing so would bypass the audit trail the queue provides.
      const mailId = crypto.randomBytes(16).toString('hex');
      const mailRef = db.collection('mail').doc(`pwreset-${mailId}`);
      const body = buildResetEmail({ resetUrl, targetEmail: email });
      const mailDoc: MailDoc = {
        to: [email],
        message: body,
      };
      if (emailConfig.from) mailDoc.from = emailConfig.from;
      if (emailConfig.replyTo) mailDoc.replyTo = emailConfig.replyTo;
      await mailRef.set(mailDoc);
      return { sent: true, email };
    }

    // Email queue disabled: hand the minted URL back so the admin can copy
    // and deliver it manually. Per the doc-string contract at the top of
    // this file, this is the documented fallback path.
    return { sent: false, email, resetUrl };
  }
);
