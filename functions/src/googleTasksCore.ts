// Pure helpers for Google Tasks sync of team action items (docs/plans/GOOGLE_TASKS_ACTION_ITEMS.md).
import { createHash } from 'node:crypto';

export const GOOGLE_TASKS_FEATURE_ID = 'google-tasks-sync';
export const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
export const GOOGLE_TASKS_LIST_TITLE = 'SpartBoard';
export const DISTRICT_TIME_ZONE = 'America/Chicago';

export type TaskSource = 'note' | 'doc';

export interface SyncedActionItem {
  id: string;
  text: string;
  done: boolean;
  assigneeUid: string | null;
  dueAt: number | null;
}

export interface TaskPayload {
  title: string;
  notes: string;
  due: string | null;
  status: 'needsAction' | 'completed';
}

export type ItemOp =
  | { kind: 'upsert'; uid: string; item: SyncedActionItem }
  | { kind: 'delete'; uid: string; itemId: string };

/** Lenient parse of a stored `actionItems` array; malformed entries are dropped. */
export function parseSyncedActionItems(raw: unknown): SyncedActionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SyncedActionItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id) continue;
    out.push({
      id: e.id,
      text: typeof e.text === 'string' ? e.text : '',
      done: e.done === true,
      assigneeUid:
        typeof e.assigneeUid === 'string' && e.assigneeUid
          ? e.assigneeUid
          : null,
      dueAt: typeof e.dueAt === 'number' ? e.dueAt : null,
    });
  }
  return out;
}

/** A live parent's items; a missing or soft-deleted parent has none. */
export function liveItems(
  data: Record<string, unknown> | undefined
): SyncedActionItem[] {
  if (!data) return [];
  if (data.deletedAt !== null && data.deletedAt !== undefined) return [];
  return parseSyncedActionItems(data.actionItems);
}

const sameSyncedFields = (a: SyncedActionItem, b: SyncedActionItem) =>
  a.text === b.text &&
  a.done === b.done &&
  a.assigneeUid === b.assigneeUid &&
  a.dueAt === b.dueAt;

/** Per-assignee task operations between two versions of a parent's action items. */
export function diffActionItems(
  before: readonly SyncedActionItem[],
  after: readonly SyncedActionItem[]
): ItemOp[] {
  const ops: ItemOp[] = [];
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const afterIds = new Set(after.map((i) => i.id));
  for (const item of after) {
    const prev = beforeById.get(item.id);
    if (prev && sameSyncedFields(prev, item)) continue;
    if (prev?.assigneeUid && prev.assigneeUid !== item.assigneeUid) {
      ops.push({ kind: 'delete', uid: prev.assigneeUid, itemId: item.id });
    }
    if (item.assigneeUid) {
      ops.push({ kind: 'upsert', uid: item.assigneeUid, item });
    }
  }
  for (const prev of before) {
    if (!afterIds.has(prev.id) && prev.assigneeUid) {
      ops.push({ kind: 'delete', uid: prev.assigneeUid, itemId: prev.id });
    }
  }
  return ops;
}

/** Firestore doc id for one mapped task under `users/{uid}/private/googleTasks/map`. */
export function mapDocId(
  plcId: string,
  source: TaskSource,
  parentId: string,
  itemId: string
): string {
  return [plcId, source, parentId, itemId]
    .map((part) => encodeURIComponent(part).replace(/_/g, '%5F'))
    .join('_');
}

/** Tasks `due` is date-only; the district calendar date of `dueAt` at UTC midnight. */
export function dueDateForTasks(
  dueAt: number | null,
  timeZone: string = DISTRICT_TIME_ZONE
): string | null {
  if (dueAt === null || !Number.isFinite(dueAt)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(dueAt));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T00:00:00.000Z`;
}

/** The app origin for the Firebase project this function runs in. */
export function appOriginForProject(projectId: string | undefined): string {
  return projectId === 'spartboard-dev'
    ? 'https://spartboard-dev.web.app'
    : 'https://spartboard.web.app';
}

/** Link to the item's parent: linked docs open themselves; notes open the team's Notes and Docs. */
export function parentLink(
  origin: string,
  plcId: string,
  source: TaskSource,
  parentId: string
): string {
  const base = `${origin}/plc/${encodeURIComponent(plcId)}/docs`;
  return source === 'doc' ? `${base}/${encodeURIComponent(parentId)}` : base;
}

export function buildTaskPayload(args: {
  item: SyncedActionItem;
  teamName: string;
  parentTitle: string;
  link: string;
}): TaskPayload {
  const { item, teamName, parentTitle, link } = args;
  const heading = [teamName.trim(), parentTitle.trim()]
    .filter(Boolean)
    .join(' · ');
  return {
    title: item.text.trim() || 'Action item',
    notes: heading ? `${heading}\n${link}` : link,
    due: dueDateForTasks(item.dueAt),
    status: item.done ? 'completed' : 'needsAction',
  };
}

export function payloadHash(payload: TaskPayload): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        payload.title,
        payload.notes,
        payload.due,
        payload.status,
      ])
    )
    .digest('hex');
}

/** Whether a Google grant's space-separated scope string includes Tasks. */
export function scopeIncludesTasks(scope: unknown): boolean {
  if (typeof scope !== 'string') return false;
  return new Set(scope.split(' ')).has(GOOGLE_TASKS_SCOPE);
}

/** Active member check that tolerates both the `members` map and the legacy `memberUids` index. */
export function isActivePlcMember(
  plc: Record<string, unknown> | undefined,
  uid: string
): boolean {
  if (!plc) return false;
  const members = plc.members;
  if (members && typeof members === 'object') {
    const m = (members as Record<string, unknown>)[uid];
    if (m && typeof m === 'object') {
      return (m as { status?: unknown }).status !== 'removed';
    }
  }
  return Array.isArray(plc.memberUids) && plc.memberUids.includes(uid);
}
