// PLC team updates, goals, links, mentoring tasks, legacy to-dos and the activity log write here, with the checks firestore.rules made.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { hasDeactivatedClaim, isDeactivatedOperatorMember } from './authz';
import { assertViewAsAllowed } from './viewAsGuard';

if (!admin.apps.length) {
  admin.initializeApp();
}

type Data = Record<string, unknown>;

export type TeamItemReason = 'notAllowed' | 'invalid' | 'notFound';

export class TeamItemError extends Error {
  constructor(readonly reason: TeamItemReason) {
    super(reason);
  }
}

export interface UpdateDraft {
  title: string;
  body: string;
  linkUrl?: string;
  attachment?: { name: string; url: string };
  requiresAck: boolean;
  inDigest: boolean;
}

export interface GoalInput {
  title: string;
  measure?: string;
  dueDate?: string;
  students?: string;
  outcome?: string;
  /** Absent leaves stored numbers alone; present replaces them. */
  progress?: Partial<Record<'baseline' | 'current' | 'target', number>>;
  practices: unknown[];
  order: number;
}

export interface TaskInput {
  title: string;
  instructions: string;
  dueDate: string;
  submitter: string;
  templateDoc: { title: string; url: string; fileId: string } | null;
}

export interface ActivityInput {
  type: string;
  actorUid: string;
  actorName: string;
  targetType?: string;
  targetId?: string;
  targetTitle?: string;
}

export type TeamItemAction =
  | { action: 'postUpdate'; plcId: string; draft: UpdateDraft }
  | {
      action: 'editUpdate';
      plcId: string;
      updateId: string;
      draft: UpdateDraft;
    }
  | { action: 'pinUpdate'; plcId: string; updateId: string; pinned: boolean }
  | { action: 'deleteUpdate'; plcId: string; updateId: string }
  | { action: 'saveGoal'; plcId: string; goalId?: string; goal: GoalInput }
  | { action: 'deleteGoal'; plcId: string; goalId: string }
  | {
      action: 'addLink';
      plcId: string;
      link: { title: string; url: string; note: string };
    }
  | { action: 'deleteLink'; plcId: string; linkId: string }
  | { action: 'postTask'; plcId: string; task: TaskInput }
  | { action: 'deleteTask'; plcId: string; taskId: string }
  | { action: 'archiveTodos'; plcId: string; ids: string[] }
  | { action: 'logActivity'; plcId: string; event: ActivityInput };

export interface TeamItemResult {
  id?: string;
}

export interface TeamItemCaller {
  uid: string;
  emailLower: string;
  displayName: string;
  /** Token carries the deactivation claim (rules' notDeactivated()). */
  deactivated?: boolean;
  /** A pinLoginV1 token: rules' authUid() gives it no uid here. */
  pinLogin?: boolean;
}

export const MAX_TODO_IDS = 100;

export const ACTIVITY_TYPES = [
  'member_joined',
  'member_left',
  'role_changed',
  'assessment_created',
  'assessment_shared',
  'assessment_results_ready',
  'meeting_held',
  'note_created',
  'comment_added',
  'item_deleted',
  'item_restored',
  'paper_printed',
] as const;

// ── Payload parsing ──

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

function bad(): never {
  throw new HttpsError('invalid-argument', 'invalid', { reason: 'invalid' });
}

function rec(v: unknown): Data {
  if (!v || typeof v !== 'object' || Array.isArray(v)) bad();
  return v as Data;
}

function id(v: unknown): string {
  if (typeof v !== 'string' || !DOC_ID.test(v)) bad();
  return v;
}

/** Narrows the callable payload to one action; field contents are checked against the rule later. */
export function parseTeamItemAction(raw: unknown): TeamItemAction {
  const d = rec(raw);
  const plcId = id(d.plcId);
  switch (d.action) {
    case 'postUpdate':
      return { action: 'postUpdate', plcId, draft: rec(d.draft) as never };
    case 'editUpdate':
      return {
        action: 'editUpdate',
        plcId,
        updateId: id(d.updateId),
        draft: rec(d.draft) as never,
      };
    case 'pinUpdate':
      if (typeof d.pinned !== 'boolean') bad();
      return {
        action: 'pinUpdate',
        plcId,
        updateId: id(d.updateId),
        pinned: d.pinned,
      };
    case 'deleteUpdate':
      return { action: 'deleteUpdate', plcId, updateId: id(d.updateId) };
    case 'saveGoal':
      return {
        action: 'saveGoal',
        plcId,
        ...(d.goalId === undefined || d.goalId === null
          ? {}
          : { goalId: id(d.goalId) }),
        goal: rec(d.goal) as never,
      };
    case 'deleteGoal':
      return { action: 'deleteGoal', plcId, goalId: id(d.goalId) };
    case 'addLink':
      return { action: 'addLink', plcId, link: rec(d.link) as never };
    case 'deleteLink':
      return { action: 'deleteLink', plcId, linkId: id(d.linkId) };
    case 'postTask':
      return { action: 'postTask', plcId, task: rec(d.task) as never };
    case 'deleteTask':
      return { action: 'deleteTask', plcId, taskId: id(d.taskId) };
    case 'archiveTodos': {
      if (
        !Array.isArray(d.ids) ||
        d.ids.length === 0 ||
        d.ids.length > MAX_TODO_IDS
      )
        bad();
      return { action: 'archiveTodos', plcId, ids: d.ids.map(id) };
    }
    case 'logActivity':
      return { action: 'logActivity', plcId, event: rec(d.event) as never };
    default:
      bad();
  }
}

// ── Who may write (rules' plcReader, plcEditor and isPlcMembershipManager) ──

export type Gate = 'reader' | 'editor' | 'manager';

/** The caller's members-map entry; null when it is not a map (rules' get() then errors and denies). */
function memberEntry(plc: Data, uid: string): Data | null {
  const members = plc.members;
  if (members === undefined) return {};
  if (!isPlainMap(members)) return null;
  const entry = members[uid];
  if (entry === undefined) return {};
  return isPlainMap(entry) ? entry : null;
}

/** The rule helpers' gates, given the caller already passed notDeactivated(). */
export function passesGate(plc: Data, uid: string, gate: Gate): boolean {
  const uids = Array.isArray(plc.memberUids) ? plc.memberUids : [];
  if (!uids.includes(uid)) return false;
  const entry = memberEntry(plc, uid);
  if (gate === 'reader') return true;
  if (entry === null) return false;
  if (gate === 'editor') return entry.role !== 'viewer';
  return (
    uid === (typeof plc.leadUid === 'string' ? plc.leadUid : '') ||
    ((entry.role === 'lead' || entry.role === 'coLead') &&
      entry.status !== 'removed')
  );
}

export function gateFor(action: TeamItemAction['action']): Gate {
  switch (action) {
    case 'postUpdate':
    case 'editUpdate':
    case 'pinUpdate':
    case 'deleteUpdate':
    case 'postTask':
    case 'deleteTask':
      return 'manager';
    case 'logActivity':
      return 'reader';
    default:
      return 'editor';
  }
}

// ── Shape checks, one per rule ──

const isStr = (v: unknown): v is string => typeof v === 'string';
// Rules' string size() counts characters, not UTF-16 units.
const len = (v: string): number => [...v].length;
const isInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v);
const isTimestamp = (v: unknown): boolean =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as { toMillis?: unknown }).toMillis === 'function';
const isPlainMap = (v: unknown): v is Data =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !isTimestamp(v);
const keysOnly = (d: Data, allowed: readonly string[]): boolean =>
  Object.keys(d).every((k) => allowed.includes(k));
// A field the server sets to the write time satisfies `== request.time` and `is timestamp`.
const isServerTime = (v: unknown, ts: unknown): boolean => v === ts;
/** plcSubTimeFieldOk: absent, a timestamp, or legacy int millis. */
const timeFieldOk = (d: Data, k: string, ts: unknown): boolean =>
  !(k in d) || isServerTime(d[k], ts) || isTimestamp(d[k]) || isInt(d[k]);
const optStrMax = (d: Data, k: string, max: number): boolean =>
  !(k in d) || (isStr(d[k]) && len(d[k]) <= max);
const optPct = (d: Data, k: string): boolean =>
  !(k in d) || (isInt(d[k]) && d[k] >= 0 && d[k] <= 100);
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const HTTPS = /^https:\/\/.*$/;

const UPDATE_KEYS = [
  'title',
  'body',
  'linkUrl',
  'attachment',
  'requiresAck',
  'inDigest',
  'pinned',
  'reactions',
  'authorUid',
  'authorName',
  'createdAt',
  'updatedAt',
] as const;

/** updShapeOk(d), with updatedAt == request.time. */
export function updateShapeOk(d: Data, ts: unknown): boolean {
  const att = d.attachment;
  return (
    keysOnly(d, UPDATE_KEYS) &&
    isStr(d.title) &&
    len(d.title) > 0 &&
    len(d.title) <= 200 &&
    isStr(d.body) &&
    len(d.body) <= 5000 &&
    (!('linkUrl' in d) ||
      (isStr(d.linkUrl) &&
        len(d.linkUrl) <= 2000 &&
        /^https:\/\/.+$/.test(d.linkUrl))) &&
    (!('attachment' in d) ||
      (isPlainMap(att) &&
        keysOnly(att, ['name', 'url']) &&
        isStr(att.name) &&
        len(att.name) <= 200 &&
        isStr(att.url) &&
        len(att.url) <= 2000 &&
        /^https:\/\/(drive|docs)[.]google[.]com\/.+$/.test(att.url))) &&
    typeof d.requiresAck === 'boolean' &&
    typeof d.inDigest === 'boolean' &&
    typeof d.pinned === 'boolean' &&
    isPlainMap(d.reactions) &&
    isStr(d.authorName) &&
    len(d.authorName) <= 200 &&
    isServerTime(d.updatedAt, ts)
  );
}

const GOAL_KEYS = [
  'id',
  'title',
  'measure',
  'practices',
  'order',
  'baseline',
  'current',
  'target',
  'dueDate',
  'students',
  'outcome',
  'createdBy',
  'createdAt',
  'updatedAt',
] as const;

/** The goals create/update rule on the stored-after document. */
export function goalShapeOk(d: Data, goalId: string, ts: unknown): boolean {
  return (
    keysOnly(d, GOAL_KEYS) &&
    d.id === goalId &&
    optPct(d, 'baseline') &&
    optPct(d, 'current') &&
    optPct(d, 'target') &&
    isStr(d.title) &&
    len(d.title) <= 600 &&
    (!('measure' in d) || isStr(d.measure)) &&
    (!('dueDate' in d) || (isStr(d.dueDate) && DATE.test(d.dueDate))) &&
    optStrMax(d, 'students', 200) &&
    optStrMax(d, 'outcome', 300) &&
    Array.isArray(d.practices) &&
    d.practices.length <= 20 &&
    (!('order' in d) || isInt(d.order)) &&
    isStr(d.createdBy) &&
    timeFieldOk(d, 'createdAt', ts) &&
    timeFieldOk(d, 'updatedAt', ts)
  );
}

const LINK_KEYS = [
  'id',
  'title',
  'url',
  'note',
  'createdBy',
  'createdByName',
  'createdAt',
  'updatedAt',
] as const;

export function linkShapeOk(d: Data, linkId: string, ts: unknown): boolean {
  return (
    keysOnly(d, LINK_KEYS) &&
    d.id === linkId &&
    isStr(d.title) &&
    len(d.title) <= 200 &&
    isStr(d.url) &&
    len(d.url) <= 2000 &&
    HTTPS.test(d.url) &&
    optStrMax(d, 'note', 500) &&
    isStr(d.createdByName) &&
    timeFieldOk(d, 'createdAt', ts) &&
    timeFieldOk(d, 'updatedAt', ts)
  );
}

const TASK_KEYS = [
  'id',
  'title',
  'instructions',
  'dueDate',
  'submitter',
  'templateDoc',
  'createdBy',
  'createdAt',
  'updatedAt',
] as const;

const mentHttps = (v: unknown): boolean =>
  isStr(v) && len(v) <= 2000 && HTTPS.test(v);

/** mentTaskOk(taskId) on a created task. */
export function taskShapeOk(d: Data, taskId: string, ts: unknown): boolean {
  const tpl = d.templateDoc ?? null;
  return (
    keysOnly(d, TASK_KEYS) &&
    d.id === taskId &&
    isStr(d.title) &&
    len(d.title) > 0 &&
    len(d.title) <= 200 &&
    (!('instructions' in d) || isStr(d.instructions)) &&
    (!isStr(d.instructions) || len(d.instructions) <= 5000) &&
    isStr(d.dueDate) &&
    DATE.test(d.dueDate) &&
    (d.submitter === 'mentee' ||
      d.submitter === 'mentor' ||
      d.submitter === 'both') &&
    (tpl === null ||
      (isPlainMap(tpl) &&
        keysOnly(tpl, ['title', 'url', 'fileId']) &&
        (!('title' in tpl) || isStr(tpl.title)) &&
        mentHttps(tpl.url) &&
        (!('fileId' in tpl) || isStr(tpl.fileId)))) &&
    timeFieldOk(d, 'createdAt', ts) &&
    timeFieldOk(d, 'updatedAt', ts)
  );
}

const ACTIVITY_KEYS = [
  'id',
  'type',
  'actorUid',
  'actorName',
  'targetType',
  'targetId',
  'targetTitle',
  'createdAt',
] as const;

export function activityShapeOk(
  d: Data,
  eventId: string,
  uid: string,
  ts: unknown
): boolean {
  return (
    keysOnly(d, ACTIVITY_KEYS) &&
    d.id === eventId &&
    d.actorUid === uid &&
    (ACTIVITY_TYPES as readonly unknown[]).includes(d.type) &&
    isStr(d.actorName) &&
    (!('targetType' in d) || isStr(d.targetType)) &&
    (!('targetId' in d) || isStr(d.targetId)) &&
    (!('targetTitle' in d) || isStr(d.targetTitle)) &&
    timeFieldOk(d, 'createdAt', ts)
  );
}

// ── Building the stored documents ──

function updateFields(draft: Data): Data {
  return {
    title: draft.title,
    body: draft.body,
    ...(draft.linkUrl !== undefined ? { linkUrl: draft.linkUrl } : {}),
    ...(draft.attachment !== undefined ? { attachment: draft.attachment } : {}),
    requiresAck: draft.requiresAck,
    inDigest: draft.inDigest,
  };
}

const GOAL_TEXT_KEYS = ['measure', 'dueDate', 'students', 'outcome'] as const;
const GOAL_PROGRESS_KEYS = ['baseline', 'current', 'target'] as const;

/** The goal as stored after this save: text keys replaced, numbers replaced only when progress is sent. */
export function buildGoal(
  existing: Data | null,
  goalId: string,
  input: Data,
  uid: string,
  ts: unknown
): Data {
  const out: Data = existing
    ? { ...existing }
    : { id: goalId, createdBy: uid, createdAt: ts };
  out.title = input.title;
  out.practices = input.practices;
  if (input.order === undefined) delete out.order;
  else out.order = input.order;
  out.updatedAt = ts;
  for (const k of GOAL_TEXT_KEYS) {
    if (input[k] === undefined || input[k] === null || input[k] === '')
      delete out[k];
    else out[k] = input[k];
  }
  const progress = input.progress;
  if (progress !== undefined && progress !== null) {
    const p = isPlainMap(progress) ? progress : bad();
    for (const k of GOAL_PROGRESS_KEYS) {
      if (p[k] === undefined || p[k] === null) delete out[k];
      else out[k] = p[k];
    }
  }
  return out;
}

function fail(reason: TeamItemReason): never {
  const code =
    reason === 'notFound'
      ? 'not-found'
      : reason === 'invalid'
        ? 'invalid-argument'
        : 'permission-denied';
  throw new HttpsError(code, reason, { reason });
}

const plcPath = (plcId: string, coll: string) => `plcs/${plcId}/${coll}`;

/** Runs one write with the gate and shape checks the rule for that path made. */
export async function runTeamItemAction(
  db: admin.firestore.Firestore,
  caller: TeamItemCaller,
  action: TeamItemAction,
  ts: unknown = admin.firestore.FieldValue.serverTimestamp()
): Promise<TeamItemResult> {
  // Rules' notDeactivated(), and authUid() giving a PIN token no uid.
  if (
    caller.pinLogin ||
    caller.deactivated ||
    (caller.emailLower &&
      (await isDeactivatedOperatorMember(db, caller.emailLower)))
  )
    fail('notAllowed');
  const { plcId } = action;
  const uid = caller.uid;
  try {
    return await db.runTransaction(async (tx) => {
      const plc = await tx.get(db.doc(`plcs/${plcId}`));
      if (
        !plc.exists ||
        !passesGate(plc.data() as Data, uid, gateFor(action.action))
      )
        throw new TeamItemError('notAllowed');
      const name = [...(caller.displayName || caller.emailLower)]
        .slice(0, 200)
        .join('');

      switch (action.action) {
        case 'postUpdate': {
          const ref = db.collection(plcPath(plcId, 'updates')).doc();
          const doc: Data = {
            ...updateFields(action.draft as unknown as Data),
            pinned: false,
            reactions: {},
            authorUid: uid,
            authorName: name,
            createdAt: ts,
            updatedAt: ts,
          };
          if (!updateShapeOk(doc, ts)) throw new TeamItemError('invalid');
          tx.set(ref, doc);
          return { id: ref.id };
        }
        case 'editUpdate':
        case 'pinUpdate': {
          const ref = db.doc(`${plcPath(plcId, 'updates')}/${action.updateId}`);
          const snap = await tx.get(ref);
          if (!snap.exists) throw new TeamItemError('notFound');
          const before = snap.data() as Data;
          const after: Data =
            action.action === 'pinUpdate'
              ? { ...before, pinned: action.pinned, updatedAt: ts }
              : (() => {
                  const rest = { ...before };
                  delete rest.linkUrl;
                  delete rest.attachment;
                  return {
                    ...rest,
                    ...updateFields(action.draft as unknown as Data),
                    updatedAt: ts,
                  };
                })();
          // authorUid, createdAt and reactions carry over from the stored doc (rules' unchanged()).
          if (!updateShapeOk(after, ts)) throw new TeamItemError('invalid');
          tx.set(ref, after);
          return { id: action.updateId };
        }
        case 'deleteUpdate':
          tx.delete(db.doc(`${plcPath(plcId, 'updates')}/${action.updateId}`));
          return {};
        case 'saveGoal': {
          const goals = db.collection(plcPath(plcId, 'goals'));
          const ref = action.goalId ? goals.doc(action.goalId) : goals.doc();
          let existing: Data | null = null;
          if (action.goalId) {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new TeamItemError('notFound');
            existing = snap.data() as Data;
          }
          const doc = buildGoal(
            existing,
            ref.id,
            action.goal as unknown as Data,
            uid,
            ts
          );
          if (!goalShapeOk(doc, ref.id, ts)) throw new TeamItemError('invalid');
          tx.set(ref, doc);
          return { id: ref.id };
        }
        case 'deleteGoal':
          tx.delete(db.doc(`${plcPath(plcId, 'goals')}/${action.goalId}`));
          return {};
        case 'addLink': {
          const ref = db.collection(plcPath(plcId, 'links')).doc();
          const link = action.link as unknown as Data;
          const note = link.note ?? '';
          const doc: Data = {
            id: ref.id,
            title: link.title,
            url: link.url,
            ...(note !== '' ? { note } : {}),
            createdBy: uid,
            createdByName: name,
            createdAt: ts,
            updatedAt: ts,
          };
          if (!linkShapeOk(doc, ref.id, ts)) throw new TeamItemError('invalid');
          tx.set(ref, doc);
          return { id: ref.id };
        }
        case 'deleteLink':
          tx.delete(db.doc(`${plcPath(plcId, 'links')}/${action.linkId}`));
          return {};
        case 'postTask': {
          const ref = db.collection(plcPath(plcId, 'tasks')).doc();
          const t = action.task as unknown as Data;
          const doc: Data = {
            id: ref.id,
            title: t.title,
            ...(t.instructions !== undefined
              ? { instructions: t.instructions }
              : {}),
            dueDate: t.dueDate,
            submitter: t.submitter,
            templateDoc: t.templateDoc ?? null,
            createdBy: uid,
            createdAt: ts,
            updatedAt: ts,
          };
          if (!taskShapeOk(doc, ref.id, ts)) throw new TeamItemError('invalid');
          tx.set(ref, doc);
          return { id: ref.id };
        }
        case 'deleteTask':
          tx.delete(db.doc(`${plcPath(plcId, 'tasks')}/${action.taskId}`));
          return {};
        case 'archiveTodos': {
          const refs = action.ids.map((t) =>
            db.doc(`${plcPath(plcId, 'todos')}/${t}`)
          );
          const snaps = await Promise.all(refs.map((r) => tx.get(r)));
          if (snaps.some((s) => !s.exists)) throw new TeamItemError('notFound');
          // Rules: changedOnly(['deletedAt']) with an int tombstone.
          const at = Date.now();
          for (const r of refs) tx.update(r, { deletedAt: at });
          return {};
        }
        case 'logActivity': {
          const ref = db.collection(plcPath(plcId, 'activity')).doc();
          const e = action.event as unknown as Data;
          const doc: Data = {
            id: ref.id,
            type: e.type,
            actorUid: e.actorUid,
            actorName: e.actorName,
            ...(e.targetType !== undefined ? { targetType: e.targetType } : {}),
            ...(e.targetId !== undefined ? { targetId: e.targetId } : {}),
            ...(e.targetTitle !== undefined
              ? { targetTitle: e.targetTitle }
              : {}),
            createdAt: ts,
          };
          if (!activityShapeOk(doc, ref.id, uid, ts))
            throw new TeamItemError('invalid');
          tx.set(ref, doc);
          return { id: ref.id };
        }
      }
    });
  } catch (err) {
    if (err instanceof TeamItemError) fail(err.reason);
    throw err;
  }
}

export const plcTeamItemsV1 = onCall(
  { memory: '256MiB', timeoutSeconds: 60, maxInstances: 20 },
  async (request): Promise<TeamItemResult> => {
    await assertViewAsAllowed(request);
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in first.');
    const action = parseTeamItemAction(request.data);
    const token = request.auth.token;
    return runTeamItemAction(
      admin.firestore(),
      {
        uid: request.auth.uid,
        emailLower:
          typeof token.email === 'string'
            ? token.email.trim().toLowerCase()
            : '',
        displayName: typeof token.name === 'string' ? token.name : '',
        deactivated: hasDeactivatedClaim(token),
        pinLogin: token.pinLogin === true,
      },
      action
    );
  }
);
