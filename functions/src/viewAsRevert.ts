// Revert one logged View as change with the Admin SDK (docs/plans/ADMIN_VIEW_AS.md D16).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';
import { isStrictSuperAdmin } from './authz';
import { assertViewAsAllowed } from './viewAsGuard';

type Firestore = admin.firestore.Firestore;
type FieldMap = Record<string, unknown>;

export const REVERTABLE_ACTIONS: readonly string[] = [
  'view_as_save',
  'view_as_approve',
];

// Mirrors utils/dashboardPII.ts PII_WIDGET_FIELDS: these never reach Firestore.
export const PII_WIDGET_FIELDS: readonly string[] = [
  'firstNames',
  'lastNames',
  'completedNames',
  'remainingStudents',
  'lastResult',
  'lockedNames',
  'unassignedNames',
  'doneNames',
  'jigsawHomeGroups',
  'jigsawExpertGroups',
  'names',
  'roster',
  'customRoster',
];

const PROTECTED_WIDGET_KEYS = new Set(['id', 'type']);

export type RevertResult =
  | { status: 'reverted' }
  | { status: 'conflict'; current: FieldMap }
  | { status: 'missing' }
  | { status: 'already' };

export interface RevertTarget {
  docPath: string;
  widgetId: string | null;
}

/** `users/{targetUid}/...` doc path, optionally `#widgets/{widgetId}`; never `private`. */
export function parseRevertPath(
  path: unknown,
  targetUid: string
): RevertTarget {
  if (typeof path !== 'string' || !targetUid) {
    throw new HttpsError('failed-precondition', 'This entry has no path.');
  }
  const [docPath, fragment, ...rest] = path.split('#');
  const segments = docPath.split('/');
  const valid =
    rest.length === 0 &&
    segments.length % 2 === 0 &&
    segments.every((s) => s.length > 0 && s !== '.' && s !== '..') &&
    segments[0] === 'users' &&
    segments[1] === targetUid &&
    segments[2] !== 'private';
  if (!valid) {
    throw new HttpsError(
      'failed-precondition',
      "This path is outside the teacher's account."
    );
  }
  if (fragment === undefined) return { docPath, widgetId: null };
  const match = /^widgets\/([^/]+)$/.exec(fragment);
  if (!match || segments[2] !== 'dashboards' || segments.length !== 4) {
    throw new HttpsError('failed-precondition', 'Unknown widget path.');
  }
  return { docPath, widgetId: match[1] };
}

function asFieldMap(value: unknown): FieldMap | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as FieldMap)
    : null;
}

function isTimestampLike(v: unknown): v is { toMillis: () => number } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { toMillis?: unknown }).toMillis === 'function'
  );
}

/** JSON-safe, key-stable form used for comparison and for the client's side-by-side view. */
export function normalizeValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (isTimestampLike(value)) return { __timestamp: value.toMillis() };
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    const out: FieldMap = {};
    for (const key of Object.keys(value as FieldMap).sort()) {
      const v = (value as FieldMap)[key];
      if (v !== undefined) out[key] = normalizeValue(v);
    }
    return out;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  return typeof value === 'bigint' ? value.toString() : null;
}

function sameValue(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b))
  );
}

/** Drops PII from a widget `config`; custom-mode `assignments` are keyed by student names. */
export function stripPii(key: string, value: unknown): unknown {
  const config = key === 'config' ? asFieldMap(value) : null;
  if (!config) return value;
  const out: FieldMap = {};
  for (const [k, v] of Object.entries(config)) {
    if (PII_WIDGET_FIELDS.includes(k)) continue;
    if (k === 'assignments' && config.rosterMode === 'custom') continue;
    out[k] = v;
  }
  return out;
}

/** Keys the logged change touched, and the current value of each (absent keys omitted). */
export function compareToLogged(
  keys: string[],
  current: FieldMap,
  after: FieldMap
): { matches: boolean; currentNormalized: FieldMap } {
  let matches = true;
  const currentNormalized: FieldMap = {};
  for (const key of keys) {
    const has = key in current;
    if (has) currentNormalized[key] = normalizeValue(current[key]);
    if (has !== key in after) matches = false;
    else if (
      has &&
      !sameValue(stripPii(key, current[key]), stripPii(key, after[key]))
    )
      matches = false;
  }
  return { matches, currentNormalized };
}

function readDocFields(
  snap: admin.firestore.DocumentSnapshot,
  keys: string[]
): FieldMap {
  const out: FieldMap = {};
  for (const key of keys) {
    const v: unknown = snap.get(key);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function verifiedCallerEmail(request: {
  auth?: { token?: Record<string, unknown> } | null;
}): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const token = request.auth.token ?? {};
  const email = typeof token.email === 'string' ? token.email : '';
  if (!email || token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'A verified email is required.');
  }
  return email.toLowerCase();
}

export function parseRevertRequest(data: unknown): {
  logId: string;
  force: boolean;
  seen: FieldMap | null;
} {
  const raw = asFieldMap(data) ?? {};
  const logId = typeof raw.logId === 'string' ? raw.logId.trim() : '';
  if (!logId || logId.includes('/') || logId.length > 200) {
    throw new HttpsError('invalid-argument', 'logId is required.');
  }
  const force = raw.force === true;
  const seen = asFieldMap(raw.seen);
  if (force && !seen) {
    throw new HttpsError('invalid-argument', 'seen is required with force.');
  }
  return { logId, force, seen };
}

export async function revertViewAsChange(
  db: Firestore,
  callerEmail: string,
  input: { logId: string; force: boolean; seen: FieldMap | null }
): Promise<RevertResult> {
  const logRef = db.collection('admin_audit_log').doc(input.logId);
  const logSnap = await logRef.get();
  const entry = logSnap.exists ? ((logSnap.data() ?? {}) as FieldMap) : null;
  if (!entry || !REVERTABLE_ACTIONS.includes(entry.action as string)) {
    throw new HttpsError('not-found', 'No change to revert.');
  }
  const sid = typeof entry.sid === 'string' ? entry.sid : '';
  const targetUid = typeof entry.targetUid === 'string' ? entry.targetUid : '';
  const before = asFieldMap(entry.before);
  const after = asFieldMap(entry.after);
  if (!sid || !before || !after) {
    throw new HttpsError(
      'failed-precondition',
      'This entry has no change to revert.'
    );
  }
  // Only entries a real session wrote: rules bind sid, by and targetUid to the minted claim.
  const sessionSnap = sid.includes('/')
    ? null
    : await db.doc(`view_as_sessions/${sid}`).get();
  if (
    !sessionSnap?.exists ||
    sessionSnap.get('by') !== entry.email ||
    sessionSnap.get('targetUid') !== targetUid
  ) {
    throw new HttpsError(
      'failed-precondition',
      'This entry has no matching session.'
    );
  }
  const target = parseRevertPath(entry.path, targetUid);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  if (
    keys.length === 0 ||
    (target.widgetId && keys.some((k) => PROTECTED_WIDGET_KEYS.has(k)))
  ) {
    throw new HttpsError(
      'failed-precondition',
      'This entry has no change to revert.'
    );
  }

  const prior = await db
    .collection('admin_audit_log')
    .where('revertOf', '==', input.logId)
    .limit(1)
    .get();
  if (!prior.empty && !input.force) return { status: 'already' };

  const docRef = db.doc(target.docPath);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return { status: 'missing' } as const;

    let current: FieldMap;
    let widgets: FieldMap[] = [];
    let widgetIndex = -1;
    if (target.widgetId) {
      const raw: unknown = snap.get('widgets');
      widgets = Array.isArray(raw) ? (raw as FieldMap[]) : [];
      widgetIndex = widgets.findIndex((w) => w?.id === target.widgetId);
      if (widgetIndex < 0) return { status: 'missing' } as const;
      const widget = widgets[widgetIndex];
      current = {};
      for (const key of keys) {
        if (widget[key] !== undefined) current[key] = widget[key];
      }
    } else {
      current = readDocFields(snap, keys);
    }

    const { matches, currentNormalized } = compareToLogged(
      keys,
      current,
      after
    );
    if (!matches) {
      const seenMatches =
        input.force &&
        input.seen !== null &&
        JSON.stringify(normalizeValue(input.seen)) ===
          JSON.stringify(normalizeValue(currentNormalized));
      if (!seenMatches) {
        return { status: 'conflict', current: currentNormalized } as const;
      }
    }

    const restored: FieldMap = {};
    for (const key of keys) {
      if (key in before) restored[key] = stripPii(key, before[key]);
    }
    if (target.widgetId) {
      const widget: FieldMap = { ...widgets[widgetIndex] };
      for (const key of keys) {
        if (key in restored) widget[key] = restored[key];
        else delete widget[key];
      }
      const next = [...widgets];
      next[widgetIndex] = widget;
      tx.update(docRef, { widgets: next, updatedAt: Date.now() });
    } else {
      const update: FieldMap = {};
      for (const key of keys) {
        update[key] =
          key in restored ? restored[key] : admin.firestore.FieldValue.delete();
      }
      tx.update(docRef, update);
    }
    tx.set(db.collection('admin_audit_log').doc(), {
      action: 'view_as_revert',
      sid,
      email: callerEmail,
      targetEmail:
        typeof entry.targetEmail === 'string' ? entry.targetEmail : '',
      targetUid,
      path: entry.path as string,
      before: current,
      after: restored,
      revertOf: input.logId,
      forced: !matches,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { status: 'reverted' } as const;
  });
}

export const revertViewAsChangeV1 = onCall(
  { cors: ALLOWED_ORIGINS },
  async (request): Promise<RevertResult> => {
    // Revert runs from the admin's own session, never from a View as tab.
    if (assertViewAsAllowed(request)) {
      throw new HttpsError(
        'permission-denied',
        'Exit View as before reverting a change.'
      );
    }
    const callerEmail = verifiedCallerEmail(request);
    const input = parseRevertRequest(request.data);
    const db = admin.firestore();
    if (!(await isStrictSuperAdmin(db, callerEmail))) {
      throw new HttpsError('permission-denied', 'Revert requires super admin.');
    }
    return revertViewAsChange(db, callerEmail, input);
  }
);
