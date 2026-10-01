// View as audit entries and the unlocked direct-save path (docs/plans/ADMIN_VIEW_AS.md D13, D14, D16).
import { getDoc, setDoc, type DocumentReference } from 'firebase/firestore';
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
