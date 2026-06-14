/**
 * Pilot / district-rollout request notification.
 *
 * Fires when a visitor submits the "bring SpartBoard to my school/district"
 * form (`/request`), which creates a doc in `/rollout_requests/{requestId}`,
 * and queues a notification email to the SpartBoard team via the
 * `firestore-send-email` extension by writing to `/mail/rollout-{requestId}`.
 *
 * Security: clients can only CREATE rollout_requests docs (see
 * firestore.rules) and can never touch `/mail/*`; the Admin SDK inside this
 * function is the only path that enqueues the email. Create-only trigger so
 * admin status updates on the request doc never re-send the notification.
 *
 * Part of docs/wide-distro-plan.md Phase 2.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const ROLLOUT_NOTIFY_TO = 'spartboard@orono.k12.mn.us';

/** Shape written by the /request form (validated in firestore.rules). */
export interface RolloutRequestDoc {
  kind: 'pilot' | 'district';
  name: string;
  email: string;
  role: string;
  organization: string;
  domain: string;
  size: string;
  message: string;
  status: 'new';
  createdAt: number;
  submittedByUid: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Builds the notification email. Exported for test coverage. */
export function buildRolloutRequestEmail(
  requestId: string,
  doc: RolloutRequestDoc
): { subject: string; text: string; html: string } {
  const kindLabel = doc.kind === 'district' ? 'District rollout' : 'Pilot';
  const subject = `[SpartBoard] ${kindLabel} request from ${doc.organization}`;

  const fields: Array<[string, string]> = [
    ['Type', kindLabel],
    ['Name', doc.name],
    ['Email', doc.email],
    ['Role', doc.role],
    ['School / District', doc.organization],
    ['Google Workspace domain', doc.domain],
    ['Approximate size', doc.size],
    ['Message', doc.message],
    ['Request ID', requestId],
  ];

  const text = fields.map(([label, value]) => `${label}: ${value}`).join('\n');
  const html = `<h2>${escapeHtml(kindLabel)} request</h2><table>${fields
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;vertical-align:top">${escapeHtml(
          label
        )}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
    )
    .join('')}</table>`;

  return { subject, text, html };
}

export const rolloutRequestEmail = onDocumentCreated(
  'rollout_requests/{requestId}',
  async (event) => {
    const { requestId } = event.params;
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn('rolloutRequestEmail: event without data', { requestId });
      return;
    }

    const doc = snapshot.data() as RolloutRequestDoc;
    const message = buildRolloutRequestEmail(requestId, doc);

    const db = admin.firestore();
    await db
      .collection('mail')
      .doc(`rollout-${requestId}`)
      .set({
        to: [ROLLOUT_NOTIFY_TO],
        replyTo: doc.email,
        message,
      });

    logger.info('rolloutRequestEmail: queued notification', {
      requestId,
      kind: doc.kind,
      domain: doc.domain,
    });
  }
);
