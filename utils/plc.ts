/**
 * PLC helpers shared across the Quiz widget, the invite hook, and the
 * results recovery path. Centralized to avoid the email-extraction logic
 * drifting out of sync — every call site needs to enumerate the PLC's
 * teammates the same way (skip self, lowercase + de-dup) before passing
 * the list to Drive permission grants.
 */

import { Plc } from '@/types';

/**
 * Return every member email recorded on a PLC, normalized + de-duped.
 * Used by the invite-accept reconciliation flow (where "self" was just
 * added and should also be granted access).
 */
export function getPlcMemberEmails(plc: Plc): string[] {
  const emails = plc.memberEmails ?? {};
  const seen = new Set<string>();
  for (const uid of plc.memberUids ?? []) {
    const raw = emails[uid];
    if (typeof raw !== 'string') continue;
    const normalized = raw.trim().toLowerCase();
    if (normalized.length > 0) seen.add(normalized);
  }
  return Array.from(seen);
}

/**
 * Return every PLC member email except the caller's own. Used by the
 * assignment-create flow (the caller already owns the sheet so they
 * don't need a separate writer permission grant).
 */
export function getPlcTeammateEmails(plc: Plc, selfUid: string): string[] {
  const emails = plc.memberEmails ?? {};
  const selfEmail =
    typeof emails[selfUid] === 'string'
      ? emails[selfUid].trim().toLowerCase()
      : '';
  const teammateUids = (plc.memberUids ?? []).filter((uid) => uid !== selfUid);
  const seen = new Set<string>();
  for (const uid of teammateUids) {
    const raw = emails[uid];
    if (typeof raw !== 'string') continue;
    const normalized = raw.trim().toLowerCase();
    if (normalized.length === 0) continue;
    // Drop the caller's own email even when it shows up under another UID
    // alias — the caller already owns the sheet and doesn't need a grant.
    if (normalized === selfEmail) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
}
