// View as audit entries and the unlocked direct-save path (docs/plans/shipped/ADMIN_VIEW_AS.md D13, D14, D16).
import {
  DocumentReference,
  FieldValue,
  Timestamp,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import {
  getViewAsTabState,
  runAuditedWrite,
  updateViewAsTabState,
  viewAsAuditsWrite,
} from '@/utils/viewAsTab';
import {
  buildViewAsAuditEntry,
  type ViewAsAuditInput,
} from '@/utils/viewAsApprove';

/** Larger values are logged as a size marker so an entry stays under the doc limit. */
const MAX_VALUE_BYTES = 100_000;
export const VIEW_AS_OMITTED_KEY = '__viewAsOmitted';

function capValue(value: unknown): unknown {
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

export async function recordViewAsAudit(
  input: ViewAsAuditInput
): Promise<void> {
  const { ref, data } = await buildViewAsAuditEntry({
    ...input,
    ...(input.before !== undefined
      ? { before: capFields(input.before as Record<string, unknown>) }
      : {}),
    ...(input.after !== undefined
      ? { after: capFields(input.after as Record<string, unknown>) }
      : {}),
  });
  await runAuditedWrite(() => setDoc(ref, data));
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
  const result = await runAuditedWrite(write);
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

export type ViewAsRawWriteOp = 'set' | 'update' | 'delete' | 'add';

export interface ViewAsRawWrite {
  op: ViewAsRawWriteOp;
  path: string;
  data?: unknown;
}

const MAX_WRITE_DEPTH = 8;

/** JSON-safe copy of written data: sentinels and Firestore types become plain markers. */
export function describeWriteData(value: unknown, depth = 0): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? null : value;
  }
  if (depth >= MAX_WRITE_DEPTH) return '…';
  if (value instanceof FieldValue) {
    const name = (value as unknown as { _methodName?: unknown })._methodName;
    return `<${typeof name === 'string' ? name.replace(/^FieldValue\./, '') : 'fieldValue'}>`;
  }
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof DocumentReference) return value.path;
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) {
    return value.map((v) => describeWriteData(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined && key !== '')
      out[key] = describeWriteData(v, depth + 1);
  }
  return out;
}

/** Logs raw writes an unlocked tab made outside the wrapped save paths, so every change stays in the View as log (D16). */
export async function recordViewAsRawWrites(
  writes: readonly ViewAsRawWrite[]
): Promise<void> {
  if (writes.length === 0 || !viewAsAuditsWrite()) return;
  const targetUid = getViewAsTabState().session?.targetUid;
  const own =
    writes.length === 1 &&
    !!targetUid &&
    writes[0].path.startsWith(`users/${targetUid}/`) &&
    !writes[0].path.startsWith(`users/${targetUid}/private`);
  try {
    await recordViewAsAudit({
      action: 'view_as_outward',
      ...(own ? { path: writes[0].path } : {}),
      after: {
        action: 'Change',
        writes: capValue(
          writes.map((w) => ({
            op: w.op,
            path: w.path,
            ...(w.data !== undefined
              ? { data: describeWriteData(w.data) }
              : {}),
          }))
        ),
      },
    });
  } catch (err) {
    console.error('[viewAs] change audit failed', err);
  }
  updateViewAsTabState({ savedNotice: getViewAsTabState().savedNotice + 1 });
}
