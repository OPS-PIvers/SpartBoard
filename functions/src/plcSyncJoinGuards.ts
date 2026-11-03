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

/** Throws unless the caller may write PLC content; mirrors `plcCanEditContent` (in memberUids, not a viewer). */
export function assertPlcContentEditor(
  plcData: Record<string, unknown> | undefined,
  uid: string
): void {
  assertPlcMember(plcData, uid);
  const members = plcData?.members;
  const entry = isRecord(members) ? members[uid] : undefined;
  if (isRecord(entry) && entry.role === 'viewer') {
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

/** The slice of a Firestore snapshot the link check reads; `createTime` is server-set. */
export interface LinkSnap {
  data(): Record<string, unknown> | undefined;
  createTime?: { toMillis(): number };
}

/** True when `snap` was created at or after the current PLC root, so it can't be left over from a dissolved PLC that reused the id. */
function createdSinceRoot(plc: LinkSnap, snap: LinkSnap): boolean {
  const rootAt = plc.createTime?.toMillis();
  const at = snap.createTime?.toMillis();
  return rootAt !== undefined && at !== undefined && at >= rootAt;
}

/** True when this PLC's header names a participant, or the group was made for this PLC with an active keyed member in it; both must postdate the root. */
export function isGroupLinkedToPlc(
  plcId: string,
  plc: LinkSnap,
  header: LinkSnap,
  group: LinkSnap
): boolean {
  const plcData = plc.data();
  const headerData = header.data();
  const groupData = group.data();
  const participants = groupData?.participants;
  // A group stamped with this id but older than the root belongs to an earlier PLC.
  if (groupData?.plcId === plcId && !createdSinceRoot(plc, group)) return false;
  if (
    hasKey(participants, headerData?.sharedBy) &&
    createdSinceRoot(plc, header)
  ) {
    return true;
  }
  if (groupData?.plcId !== plcId || !createdSinceRoot(plc, group)) {
    return false;
  }
  // Leads can rewrite memberUids freely; only `members` entries count.
  const members = plcData?.members;
  const memberUids = isRecord(members)
    ? Object.keys(members).filter((m) => {
        const entry = members[m];
        return isRecord(entry) && entry.status !== 'removed';
      })
    : Array.isArray(plcData?.memberUids)
      ? (plcData?.memberUids as unknown[])
      : [];
  return memberUids.some((m) => hasKey(participants, m));
}

/** Throws `permission-denied` unless {@link isGroupLinkedToPlc}. */
export function assertGroupLinkedToPlc(
  plcId: string,
  plc: LinkSnap,
  header: LinkSnap,
  group: LinkSnap
): void {
  if (isGroupLinkedToPlc(plcId, plc, header, group)) return;
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
