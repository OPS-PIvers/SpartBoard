// A Synced collaborator edits an Activity Wall another member of the shared board owns.
import { isDistrictStaffEmail } from './districtStaff';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';
import {
  effectiveWallClassIds,
  memberClassMap,
  ownerClassIds,
} from './activityWallClasses';

const MAX_ID_LENGTH = 128;
const MAX_CLASS_IDS = 50;
const MAX_LIST_ITEMS = 100;
const MAX_LABEL = 500;
const DISTRICT_EMAIL = /^[^@]+@orono\.k12\.mn\.us$/i;

const LAYOUTS = ['wall', 'columns', 'table', 'timeline', 'map', 'wordcloud'];
const MEDIA_TYPES = ['photo', 'link', 'file', 'video'];
const BOOLEAN_FIELDS = [
  'moderationEnabled',
  'allowGuests',
  'showNames',
  'allowStudentEdit',
  'allowStudentDelete',
  'acceptingResponses',
  'studentsCanSeePosts',
  'allowLikes',
  'allowComments',
  'allowCommentResponses',
  'timelineDatesHidden',
] as const;
const SECTION_LIST_FIELDS = [
  'sections',
  'tableRows',
  'tableCols',
  'timelineGroups',
] as const;

export interface SharedWallEditCaller {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  studentRole: boolean;
  anonymous: boolean;
}

export interface SharedWallEditInput {
  shareId: string;
  ownerUid: string;
  activityId: string;
  changes: Record<string, unknown>;
  /** The caller's own classes on this wall; undefined leaves them alone. */
  myClassIds?: string[];
}

export interface SharedWallEditDeps {
  db: admin.firestore.Firestore;
  now?: () => number;
  /** Staff member doc check; students share the district domain. */
  isStaff: (email: string) => Promise<boolean>;
}

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseId = (value: unknown, field: string): string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH &&
  !value.includes('/')
    ? value
    : invalid(`${field} is required.`);

const boundedString = (value: unknown, max: number, field: string): string =>
  typeof value === 'string' && value.length <= max
    ? value
    : invalid(`${field} is not valid.`);

const parseIdList = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.length > MAX_CLASS_IDS)
    invalid(`${field} is not valid.`);
  return [...new Set(value.map((id) => parseId(id, field)))];
};

const parseSections = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS)
    invalid(`${field} is not valid.`);
  return value.map((item) => {
    if (!isRecord(item)) invalid(`${field} is not valid.`);
    return {
      id: parseId(item.id, field),
      label: boundedString(item.label, MAX_LABEL, field),
    };
  });
};

const parsePeriods = (value: unknown) => {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS)
    invalid('timePeriods is not valid.');
  return value.map((item) => {
    if (!isRecord(item)) invalid('timePeriods is not valid.');
    return {
      id: parseId(item.id, 'timePeriods'),
      label: boundedString(item.label, MAX_LABEL, 'timePeriods'),
      from: boundedString(item.from, MAX_LABEL, 'timePeriods'),
      to: boundedString(item.to, MAX_LABEL, 'timePeriods'),
    };
  });
};

const inRange = (
  value: unknown,
  min: number,
  max: number,
  field: string
): number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max
    ? value
    : invalid(`${field} is not valid.`);

// Leaflet hands back unwrapped longitudes from a repeated world copy.
const wrapLng = (lng: unknown): unknown =>
  typeof lng === 'number' && Number.isFinite(lng)
    ? ((((lng + 180) % 360) + 360) % 360) - 180
    : lng;

// Background utilities only, so a colleague can't slip layout classes into the owner's library cards.
const BACKGROUND_CLASSES =
  /^(?:(?:bg|from|via|to)-\S+|\[background-[^\]\s]+\])(?: (?:(?:bg|from|via|to)-\S+|\[background-[^\]\s]+\]))*$/;

const isImageUrl = (raw: string): boolean => {
  if (/[\s"\\]/.test(raw)) return false;
  if (raw.startsWith('/') && !raw.startsWith('//')) return true;
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
};

const parseAppearance = (value: unknown) => {
  if (!isRecord(value)) invalid('appearance is not valid.');
  const kind = value.kind;
  const raw = boundedString(value.value, 2048, 'appearance');
  const ok =
    kind === 'image'
      ? isImageUrl(raw)
      : (kind === 'color' || kind === 'gradient') &&
        BACKGROUND_CLASSES.test(raw);
  if (!ok) invalid('appearance is not valid.');
  return { kind, value: raw };
};

/** Only the wall setup the editor changes; identity, timestamps and rosters stay the owner's. */
export function parseWallChanges(raw: unknown): Record<string, unknown> {
  if (raw === undefined) return {};
  if (!isRecord(raw)) invalid('changes is not valid.');
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if ((BOOLEAN_FIELDS as readonly string[]).includes(key)) {
      if (typeof value !== 'boolean') invalid(`${key} is not valid.`);
      out[key] = value;
    } else if ((SECTION_LIST_FIELDS as readonly string[]).includes(key)) {
      out[key] = parseSections(value, key);
    } else if (key === 'title') {
      out.title = boundedString(value, 300, key);
    } else if (key === 'prompt') {
      out.prompt = boundedString(value, 5000, key);
    } else if (key === 'mode') {
      if (value !== 'text' && value !== 'photo') invalid('mode is not valid.');
      out.mode = value;
    } else if (key === 'identificationMode') {
      if (!['anonymous', 'name', 'pin', 'name-pin'].includes(value as string))
        invalid('identificationMode is not valid.');
      out.identificationMode = value;
    } else if (key === 'layout') {
      if (!LAYOUTS.includes(value as string)) invalid('layout is not valid.');
      out.layout = value;
    } else if (key === 'maxPostsPerStudent') {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 999
      )
        invalid('maxPostsPerStudent is not valid.');
      out.maxPostsPerStudent = value;
    } else if (key === 'timePeriods') {
      out.timePeriods = parsePeriods(value);
    } else if (key === 'mapCenter') {
      if (!isRecord(value)) invalid('mapCenter is not valid.');
      out.mapCenter = {
        lat: inRange(value.lat, -90, 90, key),
        lng: inRange(wrapLng(value.lng), -180, 180, key),
        zoom: inRange(value.zoom, 0, 22, key),
      };
    } else if (key === 'allowedTypes') {
      if (!isRecord(value)) invalid('allowedTypes is not valid.');
      const types: Record<string, boolean> = {};
      for (const [type, on] of Object.entries(value)) {
        if (!MEDIA_TYPES.includes(type) || typeof on !== 'boolean')
          invalid('allowedTypes is not valid.');
        types[type] = on;
      }
      out.allowedTypes = types;
    } else if (key === 'appearance') {
      out.appearance = parseAppearance(value);
    } else {
      invalid(`${key} can't be changed here.`);
    }
  }
  return out;
}

export function parseSharedWallEditInput(raw: unknown): SharedWallEditInput {
  const data = isRecord(raw) ? raw : {};
  return {
    shareId: parseId(data.shareId, 'shareId'),
    ownerUid: parseId(data.ownerUid, 'ownerUid'),
    activityId: parseId(data.activityId, 'activityId'),
    changes: parseWallChanges(data.changes),
    ...(data.myClassIds === undefined
      ? {}
      : { myClassIds: parseIdList(data.myClassIds, 'myClassIds') }),
  };
}

const memberRole = (
  share: Record<string, unknown>,
  uid: string
): 'host' | 'collaborator' | 'viewer' | null => {
  if (share.originalAuthor === uid) return 'host';
  const participants = isRecord(share.participants) ? share.participants : {};
  const entry = participants[uid];
  if (!isRecord(entry)) return null;
  return entry.role === 'collaborator' ? 'collaborator' : 'viewer';
};

const storedIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];

export interface SharedWallEditResult {
  classIds: string[];
}

export async function handleSaveSharedActivityWall(
  deps: SharedWallEditDeps,
  caller: SharedWallEditCaller | null,
  rawInput: unknown
): Promise<SharedWallEditResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (caller.anonymous || caller.studentRole)
    throw new HttpsError('permission-denied', 'Teacher sign-in required.');
  if (
    !caller.emailVerified ||
    !DISTRICT_EMAIL.test(caller.email ?? '') ||
    !(await deps.isStaff(caller.email ?? ''))
  )
    throw new HttpsError('permission-denied', 'District account required.');
  const input = parseSharedWallEditInput(rawInput);
  if (input.ownerUid === caller.uid)
    throw new HttpsError('failed-precondition', 'This wall is yours.');

  const { db } = deps;
  const shareRef = db.collection('shared_boards').doc(input.shareId);
  const sessionRef = db
    .collection('activity_wall_sessions')
    .doc(`${input.ownerUid}_${input.activityId}`);
  const accessRef = sessionRef.collection('boardAccess').doc('boards');
  const entryRef = db
    .collection('users')
    .doc(input.ownerUid)
    .collection('activity_wall_activities')
    .doc(input.activityId);

  return db.runTransaction(async (tx) => {
    const [shareSnap, sessionSnap, accessSnap, entrySnap] = await Promise.all([
      tx.get(shareRef),
      tx.get(sessionRef),
      tx.get(accessRef),
      tx.get(entryRef),
    ]);
    if (!shareSnap.exists)
      throw new HttpsError('not-found', 'This board is no longer shared.');
    const share: Record<string, unknown> = shareSnap.data() ?? {};
    const mode = share.intendedMode;
    if (mode === 'substitute' || mode === 'copy' || mode === 'view-only')
      throw new HttpsError('permission-denied', 'Not a shared board.');
    const callerRole = memberRole(share, caller.uid);
    if (callerRole !== 'host' && callerRole !== 'collaborator')
      throw new HttpsError('permission-denied', 'You can only view this wall.');
    if (!memberRole(share, input.ownerUid))
      throw new HttpsError('permission-denied', 'Not on this board.');

    if (!sessionSnap.exists || !entrySnap.exists)
      throw new HttpsError('not-found', 'Wall not found.');
    const access: Record<string, unknown> = accessSnap.data() ?? {};
    // Entries pin the share's host so a re-created share id grants nothing.
    const entryKey = `${input.shareId}/${String(share.originalAuthor)}`;
    if (!storedIds(access.boardShareIds).includes(entryKey))
      throw new HttpsError('permission-denied', 'Wall not on this board.');
    const entry: Record<string, unknown> = entrySnap.data() ?? {};

    const patch: Record<string, unknown> = { ...input.changes };
    const sessionPatch: Record<string, unknown> = { ...input.changes };
    if (typeof patch.allowGuests === 'boolean')
      sessionPatch.driveVisibility = patch.allowGuests ? 'anyone' : 'domain';
    if (typeof patch.layout === 'string' && patch.layout !== 'timeline')
      sessionPatch.timelineDates = false;

    let classIds = effectiveWallClassIds(entry);
    if (input.myClassIds) {
      // A colleague's classes sit beside the owner's, so they can never take the owner's off.
      if (ownerClassIds(entry).length === 0 && input.myClassIds.length > 0)
        throw new HttpsError(
          'failed-precondition',
          'Only the owner can turn on class targeting for this wall.'
        );
      // Not checked against ClassLink: a colleague gets the same class-targeting trust as on their own assignments.
      const members = memberClassMap(entry.memberClassIds);
      if (input.myClassIds.length > 0) members[caller.uid] = input.myClassIds;
      else delete members[caller.uid];
      classIds = effectiveWallClassIds({ ...entry, memberClassIds: members });
      if (classIds.length > MAX_CLASS_IDS)
        invalid('Too many classes on this wall.');
      patch.memberClassIds = members;
      sessionPatch.memberClassIds = members;
      sessionPatch.classIds = classIds;
    }

    if (Object.keys(patch).length === 0) return { classIds };
    const now = (deps.now ?? Date.now)();
    tx.update(entryRef, { ...patch, updatedAt: now });
    tx.update(sessionRef, { ...sessionPatch, updatedAt: now });
    return { classIds };
  });
}

export const saveSharedActivityWallV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) => {
    assertViewAsAllowed(request);
    const token = request.auth?.token;
    const db = admin.firestore();
    return handleSaveSharedActivityWall(
      {
        db,
        isStaff: (email) => isDistrictStaffEmail(db, email),
      },
      request.auth && token
        ? {
            uid: request.auth.uid,
            email: typeof token.email === 'string' ? token.email : null,
            emailVerified: token.email_verified === true,
            studentRole: token.studentRole === true,
            anonymous: token.firebase?.sign_in_provider === 'anonymous',
          }
        : null,
      request.data
    );
  }
);
