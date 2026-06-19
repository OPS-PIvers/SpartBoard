/**
 * PLC helpers shared across the Quiz widget, the invite hook, the results
 * recovery path, and the PLC workspace provider. Centralized to avoid the
 * membership/email logic drifting out of sync — every call site needs to
 * enumerate the PLC's members the same way (read the canonical `members` map,
 * fall back to the legacy arrays for un-migrated PLCs, skip self where
 * relevant, lowercase + de-dup) before acting on the list.
 */

import { Plc, PlcMember, PlcRole } from '@/types';

/**
 * Convert a value that may be a Firestore `Timestamp`, a legacy numeric
 * millis value, or `undefined`/`null` into milliseconds since epoch.
 *
 * All PLC writes use `serverTimestamp()`, so on read a field can come back as
 * a `Timestamp` (`.toMillis()`), but during the back-compat rollout legacy
 * docs still carry plain `number`s. Every PLC parser routes timestamp fields
 * through this helper so both shapes are tolerated. Returns `0` for anything
 * unrecognized (e.g. a pending server timestamp that hasn't resolved yet).
 */
export function tsToMillis(value: unknown): number {
  const maybeTs = value as { toMillis?: () => number } | null | undefined;
  return maybeTs?.toMillis?.() ?? (typeof value === 'number' ? value : 0);
}

/**
 * Return the canonical list of active PLC members.
 *
 * Reads the `members` map when present and non-empty. For legacy PLCs that
 * predate the map (or whose map hasn't been backfilled yet — an empty `{}`),
 * synthesizes member records from `memberUids` + `memberEmails` + `leadUid`
 * (the lead uid gets role `lead`; everyone else `member`). Only members with
 * `status === 'active'` are returned. Synthesized records report
 * `joinedAt: 0` and a best-effort `displayName` derived from the email local
 * part (no display name is recorded on legacy PLCs).
 */
export function getPlcMembers(plc: Plc): PlcMember[] {
  const members = plc.members;
  // A populated map is the source of truth. An empty (or absent) map means the
  // PLC predates migration / isn't backfilled — fall back to the legacy arrays.
  if (
    members &&
    typeof members === 'object' &&
    Object.keys(members).length > 0
  ) {
    return Object.values(members).filter(
      (member): member is PlcMember =>
        !!member && member.status === 'active' && typeof member.uid === 'string'
    );
  }

  // Legacy fallback: synthesize from the denormalized arrays.
  const emails = plc.memberEmails ?? {};
  const leadUid = plc.leadUid;
  return (plc.memberUids ?? []).map((uid): PlcMember => {
    const rawEmail = typeof emails[uid] === 'string' ? emails[uid] : '';
    const email = rawEmail.trim().toLowerCase();
    const displayName = email.includes('@') ? email.split('@')[0] : email;
    return {
      uid,
      email,
      displayName,
      role: uid === leadUid ? 'lead' : 'member',
      joinedAt: 0,
      status: 'active',
    };
  });
}

/**
 * Return the recorded (lowercased) email for a given uid within the PLC, or
 * `null` if that uid is not an active member or has no email on record. Reads
 * the canonical `members` map first; falls back to the legacy `memberEmails`
 * map for un-migrated PLCs. Used by the content-authoring paths that need the
 * acting member's own email for attribution without reading `memberEmails`
 * directly (a map-only PLC may not carry that legacy index).
 */
export function getPlcMemberEmail(plc: Plc, uid: string): string | null {
  const member = getPlcMembers(plc).find((m) => m.uid === uid);
  const email = member?.email?.trim().toLowerCase() ?? '';
  return email.length > 0 ? email : null;
}

/**
 * Return the role of a given uid within the PLC, or `null` if that uid is not
 * an active member. Reads the `members` map first; falls back to the legacy
 * `leadUid` / `memberUids` shape for un-migrated PLCs.
 */
export function getPlcRole(plc: Plc, uid: string): PlcRole | null {
  const member = getPlcMembers(plc).find((m) => m.uid === uid);
  return member ? member.role : null;
}

/** True when the uid is the PLC `lead` or a `coLead` (membership managers). */
export function isPlcLeadOrCoLead(plc: Plc, uid: string): boolean {
  const role = getPlcRole(plc, uid);
  return role === 'lead' || role === 'coLead';
}

/**
 * True when the uid may edit PLC content (author/edit assessments, notes,
 * todos, comments, etc.). Any active member except a `viewer` can edit; a uid
 * that is not a member at all (`role === null`) cannot.
 */
export function canEditPlcContent(plc: Plc, uid: string): boolean {
  const role = getPlcRole(plc, uid);
  return role !== null && role !== 'viewer';
}

/**
 * Return every active member email recorded on a PLC, normalized + de-duped.
 * Prefers the canonical `members` map; falls back to the legacy
 * `memberUids` + `memberEmails` arrays for un-migrated PLCs. Used by the
 * invite-accept reconciliation flow (where "self" was just added and should
 * also be granted access).
 */
export function getPlcMemberEmails(plc: Plc): string[] {
  const seen = new Set<string>();
  for (const member of getPlcMembers(plc)) {
    const normalized = member.email.trim().toLowerCase();
    if (normalized.length > 0) seen.add(normalized);
  }
  return Array.from(seen);
}

/**
 * Return every active PLC member email except the caller's own. Prefers the
 * canonical `members` map; falls back to the legacy arrays for un-migrated
 * PLCs. Used by the assignment-create flow (the caller already owns the sheet
 * so they don't need a separate writer permission grant). The caller's email
 * is dropped both by uid and by value (in case it appears under an aliased
 * uid).
 */
export function getPlcTeammateEmails(plc: Plc, selfUid: string): string[] {
  const members = getPlcMembers(plc);
  const self = members.find((m) => m.uid === selfUid);
  const selfEmail = self ? self.email.trim().toLowerCase() : '';

  const seen = new Set<string>();
  for (const member of members) {
    if (member.uid === selfUid) continue;
    const normalized = member.email.trim().toLowerCase();
    if (normalized.length === 0) continue;
    // Drop the caller's own email even when it shows up under another uid
    // alias — the caller already owns the sheet and doesn't need a grant.
    if (normalized === selfEmail) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
}
