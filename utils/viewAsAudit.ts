// View as audit entries and the unlocked direct-save path (docs/plans/ADMIN_VIEW_AS.md D13, D14, D16).
import { onIdTokenChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type DocumentReference,
} from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import type { ViewAsClaim } from '@/types/viewAs';
import {
  getViewAsTabState,
  isViewAsTab,
  updateViewAsTabState,
  viewAsAuditsWrite,
} from '@/utils/viewAsTab';

export type ViewAsClientAuditAction =
  | 'view_as_save'
  | 'view_as_approve'
  | 'view_as_outward';

export interface ViewAsAuditInput {
  action: ViewAsClientAuditAction;
  path?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
}

interface AuditIdentity {
  sid: string;
  email: string;
  targetEmail: string;
  targetUid: string;
}

/** Larger values are logged as a size marker so an entry stays under the doc limit. */
const MAX_VALUE_BYTES = 100_000;
export const VIEW_AS_OMITTED_KEY = '__viewAsOmitted';

let identity: AuditIdentity | null = null;
let identityPromise: Promise<AuditIdentity | null> | null = null;

async function readIdentity(): Promise<AuditIdentity | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const { claims } = await user.getIdTokenResult();
  const claim = claims.viewAs as ViewAsClaim | undefined;
  const email = typeof claims.email === 'string' ? claims.email : '';
  if (!claim?.sid || !claim.by) return null;
  return {
    sid: claim.sid,
    email: claim.by,
    targetEmail: email.toLowerCase(),
    targetUid: user.uid,
  };
}

if (isViewAsTab) {
  onIdTokenChanged(auth, () => {
    identityPromise = readIdentity().then((next) => (identity = next));
  });
}

/** Resolves the audit identity from the tab's token, for callers that need the sync builder. */
export function loadViewAsAuditIdentity(): Promise<AuditIdentity | null> {
  identityPromise ??= readIdentity().then((next) => (identity = next));
  return identityPromise;
}

function capValue(value: unknown): unknown {
  if (value === undefined) return value;
  try {
    const bytes = JSON.stringify(value)?.length ?? 0;
    return bytes > MAX_VALUE_BYTES ? { [VIEW_AS_OMITTED_KEY]: bytes } : value;
  } catch {
    return { [VIEW_AS_OMITTED_KEY]: -1 };
  }
}

function capFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = capValue(value);
  }
  return out;
}

/** Builds an entry the audit rules accept; throws until the token's claim has loaded. */
export function buildViewAsAuditEntry(input: ViewAsAuditInput): {
  ref: DocumentReference;
  data: Record<string, unknown>;
} {
  if (!identity) throw new Error('View as audit identity not loaded.');
  const data: Record<string, unknown> = {
    action: input.action,
    ...identity,
    timestamp: serverTimestamp(),
  };
  if (input.path !== undefined) data.path = input.path;
  if (input.before !== undefined) data.before = capFields(input.before);
  if (input.after !== undefined) data.after = capFields(input.after);
  if (input.reason !== undefined) data.reason = input.reason;
  return { ref: doc(collection(db, 'admin_audit_log')), data };
}

export async function recordViewAsAudit(
  input: ViewAsAuditInput
): Promise<void> {
  await loadViewAsAuditIdentity();
  const { ref, data } = buildViewAsAuditEntry(input);
  await setDoc(ref, data);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

async function readFields(
  ref: DocumentReference,
  fields: readonly string[] | null
): Promise<Record<string, unknown>> {
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  if (fields === null) return { ...snap.data() };
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value: unknown = snap.get(field);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

/** Runs a user write; unlocked view-as also audits the changed fields (dotted, null = whole doc) and toasts. */
export async function viewAsDirectSave<T>(
  ref: DocumentReference,
  fields: readonly string[] | null,
  write: () => Promise<T>
): Promise<T> {
  if (!viewAsAuditsWrite()) return write();
  const before = await readFields(ref, fields).catch(() => null);
  const result = await write();
  try {
    const after = await readFields(ref, fields);
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
    const changedBefore: Record<string, unknown> = {};
    const changedAfter: Record<string, unknown> = {};
    for (const key of keys) {
      if (before && sameValue(before[key], after[key])) continue;
      if (before && key in before) changedBefore[key] = before[key];
      if (key in after) changedAfter[key] = after[key];
    }
    if (
      Object.keys(changedBefore).length + Object.keys(changedAfter).length ===
      0
    ) {
      return result;
    }
    await recordViewAsAudit({
      action: 'view_as_save',
      path: ref.path,
      before: changedBefore,
      after: changedAfter,
    });
  } catch (err) {
    console.error('[viewAs] save audit failed', err);
  }
  updateViewAsTabState({ savedNotice: getViewAsTabState().savedNotice + 1 });
  return result;
}

/** Audits a doc the caller just created with addDoc, so its path is only known afterwards. */
export async function viewAsAuditCreated(
  ref: DocumentReference
): Promise<void> {
  if (!viewAsAuditsWrite()) return;
  try {
    const after = await readFields(ref, null);
    await recordViewAsAudit({
      action: 'view_as_save',
      path: ref.path,
      before: {},
      after,
    });
  } catch (err) {
    console.error('[viewAs] save audit failed', err);
  }
  updateViewAsTabState({ savedNotice: getViewAsTabState().savedNotice + 1 });
}

/** Logs a confirmed outward action (assign, share, AI, Drive export...) by its label. */
export async function recordViewAsOutward(
  label: string,
  path?: string
): Promise<void> {
  if (!viewAsAuditsWrite()) return;
  try {
    await recordViewAsAudit({
      action: 'view_as_outward',
      ...(path ? { path } : {}),
      after: { action: label },
    });
  } catch (err) {
    console.error('[viewAs] outward audit failed', err);
  }
}
