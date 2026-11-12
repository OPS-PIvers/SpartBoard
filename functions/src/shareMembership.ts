// Joining and leaving shared boards and collection links run here so firestore.rules no longer validates them.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { OPERATOR_ORG_ID } from './authz';
import { isStaffMemberData } from './districtStaff';
import { assertViewAsAllowed } from './viewAsGuard';

if (!admin.apps.length) {
  admin.initializeApp();
}

type Data = Record<string, unknown>;

export type ShareMembershipReason =
  'notAllowed' | 'notFound' | 'invalidArgument';

export class ShareMembershipError extends Error {
  constructor(readonly reason: ShareMembershipReason) {
    super(reason);
  }
}

export type ShareMembershipAction =
  | {
      action: 'joinBoard';
      shareId: string;
      role: 'collaborator' | 'viewer';
      displayName?: string;
    }
  | { action: 'leaveBoard'; shareId: string }
  | { action: 'joinCollection'; linkId: string; name?: string }
  | { action: 'leaveCollection'; linkId: string };

export interface Caller {
  uid: string;
  /** Rules' isDistrictStaff(), resolved once per call. */
  staff: boolean;
}

const STAFF_EMAIL = /^[^@]+@orono[.]k12[.]mn[.]us$/;

function deny(): never {
  throw new ShareMembershipError('notAllowed');
}

function participantsOf(d: Data): Data {
  const p = d.participants;
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Data) : {};
}

function mapOf(v: unknown): Data | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Data) : null;
}

function listMax(v: unknown, max: number): boolean {
  return Array.isArray(v) && v.length <= max;
}

/** Rules' lcShape() on the doc after the write. */
export function lcShapeOk(d: Data): boolean {
  const removed = d.removed === undefined ? {} : mapOf(d.removed);
  const participants = mapOf(d.participants);
  return (
    (d.mode === 'synced' || d.mode === 'view-only') &&
    typeof d.name === 'string' &&
    d.name.length > 0 &&
    d.name.length <= 200 &&
    listMax(d.boards, 200) &&
    (d.sections === undefined || listMax(d.sections, 200)) &&
    (d.deletedSections === undefined || listMax(d.deletedSections, 200)) &&
    participants !== null &&
    Object.keys(participants).length <= 50 &&
    removed !== null &&
    Object.keys(removed).length <= 200 &&
    (d.ended === undefined || typeof d.ended === 'boolean')
  );
}

/** Mirrors the shared_boards self-join rule; returns the participant entry to write. */
export function planBoardJoin(
  caller: Caller,
  share: Data,
  role: 'collaborator' | 'viewer',
  displayName: string | undefined,
  now: number
): Data {
  const mode = share.intendedMode ?? null;
  if (
    !caller.staff ||
    mode === 'substitute' ||
    mode === 'copy' ||
    (mode === 'view-only' && role !== 'viewer') ||
    caller.uid in participantsOf(share)
  ) {
    deny();
  }
  return { role, joinedAt: now, ...(displayName ? { displayName } : {}) };
}

/** Mirrors the linked_collections self-join rule; returns the participant entry to write. */
export function planCollectionJoin(
  caller: Caller,
  link: Data,
  name: string | undefined,
  now: number
): Data {
  const participants = participantsOf(link);
  if (
    !caller.staff ||
    link.ended === true ||
    caller.uid in participants ||
    caller.uid in (mapOf(link.removed) ?? {})
  ) {
    deny();
  }
  const entry: Data = {
    role: link.mode === 'synced' ? 'collaborator' : 'viewer',
    joinedAt: now,
    ...(name ? { name: name.slice(0, 100) } : {}),
  };
  if (
    !lcShapeOk({
      ...link,
      participants: { ...participants, [caller.uid]: entry },
    })
  ) {
    deny();
  }
  return entry;
}

function str(raw: Data, key: string): string {
  const v = raw[key];
  if (typeof v !== 'string' || !v.trim() || v.includes('/') || v.length > 300) {
    throw new ShareMembershipError('invalidArgument');
  }
  return v;
}

function optName(raw: Data, key: string, max: number): string | undefined {
  const v = raw[key];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new ShareMembershipError('invalidArgument');
  return v.slice(0, max);
}

export function parseShareMembershipAction(
  input: unknown
): ShareMembershipAction {
  const raw = (input ?? {}) as Data;
  switch (raw.action) {
    case 'joinBoard': {
      if (raw.role !== 'collaborator' && raw.role !== 'viewer') {
        throw new ShareMembershipError('invalidArgument');
      }
      return {
        action: 'joinBoard',
        shareId: str(raw, 'shareId'),
        role: raw.role,
        displayName: optName(raw, 'displayName', 200),
      };
    }
    case 'leaveBoard':
      return { action: 'leaveBoard', shareId: str(raw, 'shareId') };
    case 'joinCollection':
      return {
        action: 'joinCollection',
        linkId: str(raw, 'linkId'),
        name: optName(raw, 'name', 100),
      };
    case 'leaveCollection':
      return { action: 'leaveCollection', linkId: str(raw, 'linkId') };
    default:
      throw new ShareMembershipError('invalidArgument');
  }
}

/** Runs one join or leave in a transaction, with the gates the rules applied. */
export async function runShareMembershipAction(
  db: admin.firestore.Firestore,
  caller: Caller,
  action: ShareMembershipAction,
  now = Date.now()
): Promise<{ changed: boolean }> {
  const path =
    action.action === 'joinBoard' || action.action === 'leaveBoard'
      ? `shared_boards/${action.shareId}`
      : `linked_collections/${action.linkId}`;
  const ref = db.doc(path);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ShareMembershipError('notFound');
    const data = snap.data() as Data;
    const key = `participants.${caller.uid}`;
    switch (action.action) {
      case 'joinBoard':
        tx.update(ref, {
          [key]: planBoardJoin(
            caller,
            data,
            action.role,
            action.displayName,
            now
          ),
        });
        return { changed: true };
      case 'joinCollection':
        tx.update(ref, {
          [key]: planCollectionJoin(caller, data, action.name, now),
        });
        return { changed: true };
      case 'leaveBoard':
      case 'leaveCollection':
        // Leaving a share you aren't in changes nothing.
        if (!(caller.uid in participantsOf(data))) return { changed: false };
        tx.update(ref, { [key]: admin.firestore.FieldValue.delete() });
        return { changed: true };
    }
  });
}

/** Rules' isDistrictStaff(): a verified Orono address, no student claim, and a live non-student operator-org member doc. */
async function isDistrictStaff(
  db: admin.firestore.Firestore,
  token: Data
): Promise<boolean> {
  const email =
    typeof token.email === 'string' ? token.email.toLowerCase() : '';
  if (token.email_verified !== true || !STAFF_EMAIL.test(email)) return false;
  if (token.studentRole === true) return false;
  const member = await db
    .doc(`organizations/${OPERATOR_ORG_ID}/members/${email}`)
    .get();
  return isStaffMemberData(member.exists ? member.data() : undefined);
}

export const shareMembershipV1 = onCall(
  { memory: '256MiB', timeoutSeconds: 60, maxInstances: 10 },
  async (request): Promise<{ changed: boolean }> => {
    await assertViewAsAllowed(request);
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in first.');
    const db = admin.firestore();
    try {
      const action = parseShareMembershipAction(request.data);
      const needsStaff =
        action.action === 'joinBoard' || action.action === 'joinCollection';
      const caller: Caller = {
        uid: request.auth.uid,
        staff: needsStaff && (await isDistrictStaff(db, request.auth.token)),
      };
      return await runShareMembershipAction(db, caller, action);
    } catch (err) {
      if (err instanceof ShareMembershipError) {
        const code =
          err.reason === 'notAllowed'
            ? 'permission-denied'
            : err.reason === 'notFound'
              ? 'not-found'
              : 'invalid-argument';
        throw new HttpsError(code, err.reason, { reason: err.reason });
      }
      throw err;
    }
  }
);
