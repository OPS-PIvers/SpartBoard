/**
 * Shared authorization checks for the `plc*SyncJoin` callables, which add the
 * caller to a synced group's `participants` map (co-edit rights).
 */

import { HttpsError } from 'firebase-functions/v2/https';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Throws `permission-denied` unless `uid` is in the PLC's `memberUids`. */
export function assertPlcMember(
  plcData: Record<string, unknown> | undefined,
  uid: string
): void {
  const memberUids = Array.isArray(plcData?.memberUids)
    ? (plcData?.memberUids as unknown[]).filter(
        (u): u is string => typeof u === 'string'
      )
    : [];
  if (!memberUids.includes(uid)) {
    throw new HttpsError(
      'permission-denied',
      'You are not a member of this PLC.'
    );
  }
}

/**
 * Throws `permission-denied` unless the caller may write PLC content. Mirrors
 * `plcCanEditContent` in firestore.rules: a keyed member whose role is not
 * `viewer` (and not removed), or any uid in `memberUids` on a member-map-less
 * legacy PLC.
 */
export function assertPlcContentEditor(
  plcData: Record<string, unknown> | undefined,
  uid: string
): void {
  assertPlcMember(plcData, uid);
  const members = plcData?.members;
  const entry = isRecord(members) ? members[uid] : undefined;
  if (
    isRecord(entry) &&
    (entry.role === 'viewer' || entry.status === 'removed')
  ) {
    throw new HttpsError(
      'permission-denied',
      'Viewers cannot edit shared PLC content.'
    );
  }
}

/** Server-only marker `detachPlcSyncLinkage` leaves so Undo can re-join through the same header. */
export const PLC_DETACHED_SUBCOLLECTION = 'plcDetached';

/** True when a detach marker records this caller leaving the group via this PLC header. */
export function isDetachMarkerFor(
  marker: Record<string, unknown> | undefined,
  plcId: string,
  plcContentId: string
): boolean {
  return marker?.plcId === plcId && marker?.plcContentId === plcContentId;
}

const hasKey = (obj: unknown, key: unknown): boolean =>
  isRecord(obj) &&
  typeof key === 'string' &&
  key.length > 0 &&
  Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Throws `permission-denied` unless the synced group really was shared into
 * this PLC: the header's `sharedBy` (rules-pinned to its writer) is a
 * participant, or the group was created for this PLC (immutable `plcId`) and an
 * active keyed PLC member still participates (so a recreated PLC id gains nothing).
 */
export function assertGroupLinkedToPlc(
  plcId: string,
  plcData: Record<string, unknown> | undefined,
  header: Record<string, unknown> | undefined,
  group: Record<string, unknown> | undefined
): void {
  const participants = group?.participants;
  if (hasKey(participants, header?.sharedBy)) return;
  // Leads can rewrite memberUids freely; only consented `members` entries count.
  const members = plcData?.members;
  const memberUids = isRecord(members)
    ? Object.keys(members).filter((m) => {
        const entry = members[m];
        return isRecord(entry) && entry.status !== 'removed';
      })
    : Array.isArray(plcData?.memberUids)
      ? (plcData?.memberUids as unknown[])
      : [];
  if (
    group?.plcId === plcId &&
    memberUids.some((m) => hasKey(participants, m))
  ) {
    return;
  }
  throw new HttpsError(
    'permission-denied',
    'This synced group is not shared with this PLC.'
  );
}

/**
 * Throws `permission-denied` unless a share link's author participates in the
 * group it names, so a share doc pointing at someone else's group grants nothing.
 */
export function assertShareAuthorInGroup(
  share: Record<string, unknown> | undefined,
  group: Record<string, unknown> | undefined
): void {
  if (hasKey(group?.participants, share?.originalAuthor)) return;
  throw new HttpsError(
    'permission-denied',
    'This share is not linked to that synced group.'
  );
}
