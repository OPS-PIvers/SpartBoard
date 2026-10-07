// Google Tasks sync for team action items (docs/plans/GOOGLE_TASKS_ACTION_ITEMS.md).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import axios from 'axios';
import './functionsInit';
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
  refreshGoogleAccessTokenForUid,
} from './googleOAuth';
import { assertViewAsAllowed } from './viewAsGuard';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import {
  GOOGLE_TASKS_FEATURE_ID,
  GOOGLE_TASKS_LIST_TITLE,
  appOriginForProject,
  buildTaskPayload,
  diffActionItems,
  isActivePlcMember,
  liveItems,
  mapDocId,
  parentLink,
  payloadHash,
  scopeIncludesTasks,
  type ItemOp,
  type SyncedActionItem,
  type TaskPayload,
  type TaskSource,
} from './googleTasksCore';

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const API_TIMEOUT_MS = 10_000;
const CLAIM_WAIT_STEPS = 5;
const CLAIM_WAIT_MS = 1_000;
// A claim this old belongs to an instance that died between create and insert.
const STALE_CLAIM_MS = 60_000;
// Overlap on the pull window so a task edited during the previous pull is not missed.
const PULL_OVERLAP_MS = 10 * 60 * 1000;
const SECRETS = [
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
];

export type DisconnectReason = 'needs-consent' | 'missing-scope';

interface TasksState {
  enabled: boolean;
  listId: string | null;
  email: string | null;
  lastPullAt: number | null;
}

interface MapDoc {
  claimedAt?: number;
  taskId?: string;
  listId?: string;
  lastPushedHash?: string;
  pending?: boolean;
}

interface Session {
  uid: string;
  token: string;
  state: TasksState;
}

interface ParentContext {
  plcId: string;
  source: TaskSource;
  parentId: string;
  teamName: string;
  parentTitle: string;
}

const db = () => admin.firestore();
const stateRef = (uid: string) => db().doc(`users/${uid}/private/googleTasks`);
const mapCol = (uid: string) => stateRef(uid).collection('map');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class TasksNotFound extends Error {}
class TasksAuthError extends Error {}

function parseState(data: unknown): TasksState {
  const d = (data && typeof data === 'object' ? data : {}) as Record<
    string,
    unknown
  >;
  return {
    enabled: d.enabled === true,
    listId: typeof d.listId === 'string' ? d.listId : null,
    email: typeof d.email === 'string' ? d.email : null,
    lastPullAt: typeof d.lastPullAt === 'number' ? d.lastPullAt : null,
  };
}

// A 403 is also how Google reports rate limits and a disabled API; only a scope 403 disconnects.
function isScopeError(data: unknown): boolean {
  const text = JSON.stringify(data ?? '');
  return (
    text.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
    text.includes('insufficientPermissions')
  );
}

async function tasksRequest<T>(
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<T> {
  try {
    const res = await axios.request<T>({
      method,
      url: `${TASKS_API}${path}`,
      data: body,
      params,
      headers: { Authorization: `Bearer ${token}` },
      timeout: API_TIMEOUT_MS,
    });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 404 || status === 410) throw new TasksNotFound(path);
      if (
        status === 401 ||
        (status === 403 && isScopeError(err.response?.data))
      ) {
        throw new TasksAuthError(`${status} ${path}`);
      }
    }
    throw err;
  }
}

function taskBody(payload: TaskPayload): Record<string, unknown> {
  return {
    title: payload.title,
    notes: payload.notes,
    due: payload.due,
    status: payload.status,
    // Clearing `completed` is what reopens a task in Google.
    ...(payload.status === 'needsAction' ? { completed: null } : {}),
  };
}

async function disconnect(uid: string, reason: DisconnectReason) {
  await stateRef(uid).set(
    { enabled: false, disconnectReason: reason, updatedAt: Date.now() },
    { merge: true }
  );
  logger.info('[googleTasks] disconnected', { uid, reason });
}

/** Opens a push session for a connected, flag-granted user, or returns null. */
async function openSession(uid: string): Promise<Session | null> {
  const snap = await stateRef(uid).get();
  const state = parseState(snap.data());
  if (!state.enabled) return null;
  const granted = await isGlobalFeatureGranted(
    db(),
    GOOGLE_TASKS_FEATURE_ID,
    state.email,
    uid
  );
  if (!granted) return null;
  const auth = await db().doc(`users/${uid}/private/googleAuth`).get();
  if (!scopeIncludesTasks(auth.get('scope'))) {
    await disconnect(uid, 'missing-scope');
    return null;
  }
  try {
    const { accessToken } = await refreshGoogleAccessTokenForUid(uid);
    return { uid, token: accessToken, state };
  } catch (err) {
    if (
      err instanceof HttpsError &&
      (err.details as { reason?: string } | undefined)?.reason ===
        'needs-consent'
    ) {
      await disconnect(uid, 'needs-consent');
      return null;
    }
    throw err;
  }
}

async function createList(session: Session): Promise<string> {
  const list = await tasksRequest<{ id: string }>(
    session.token,
    'POST',
    '/users/@me/lists',
    { title: GOOGLE_TASKS_LIST_TITLE }
  );
  session.state.listId = list.id;
  await stateRef(session.uid).set({ listId: list.id }, { merge: true });
  return list.id;
}

async function ensureList(session: Session): Promise<string> {
  return session.state.listId ?? createList(session);
}

/** Inserts into the SpartBoard list, recreating it once if the user deleted it (D8). */
async function insertTask(
  session: Session,
  payload: TaskPayload
): Promise<{ taskId: string; listId: string }> {
  let listId = await ensureList(session);
  try {
    const task = await tasksRequest<{ id: string }>(
      session.token,
      'POST',
      `/lists/${encodeURIComponent(listId)}/tasks`,
      taskBody(payload)
    );
    return { taskId: task.id, listId };
  } catch (err) {
    if (!(err instanceof TasksNotFound)) throw err;
    listId = await createList(session);
    const task = await tasksRequest<{ id: string }>(
      session.token,
      'POST',
      `/lists/${encodeURIComponent(listId)}/tasks`,
      taskBody(payload)
    );
    return { taskId: task.id, listId };
  }
}

async function readMapAfterClaim(
  ref: admin.firestore.DocumentReference
): Promise<MapDoc | null> {
  for (let i = 0; i < CLAIM_WAIT_STEPS; i += 1) {
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() as MapDoc;
    if (data.taskId) return data;
    await sleep(CLAIM_WAIT_MS);
  }
  return null;
}

async function pushUpsert(
  session: Session,
  ctx: ParentContext,
  item: SyncedActionItem,
  origin: string
): Promise<void> {
  const payload = buildTaskPayload({
    item,
    teamName: ctx.teamName,
    parentTitle: ctx.parentTitle,
    link: parentLink(origin, ctx.plcId, ctx.source, ctx.parentId),
  });
  const hash = payloadHash(payload);
  const ref = mapCol(session.uid).doc(
    mapDocId(ctx.plcId, ctx.source, ctx.parentId, item.id)
  );
  const base = {
    plcId: ctx.plcId,
    source: ctx.source,
    parentId: ctx.parentId,
    itemId: item.id,
  };

  // Claim the map doc first so two concurrent fires can't both insert a task.
  const claim = async (): Promise<boolean> => {
    try {
      await ref.create({ ...base, pending: true, claimedAt: Date.now() });
      return true;
    } catch (err) {
      if ((err as { code?: unknown }).code !== 6) throw err;
      return false;
    }
  };
  let claimed = await claim();
  if (!claimed) {
    const held = (await ref.get()).data() as MapDoc | undefined;
    if (
      held &&
      !held.taskId &&
      Date.now() - (held.claimedAt ?? 0) > STALE_CLAIM_MS
    ) {
      await ref.delete();
      claimed = await claim();
    }
  }

  if (claimed) {
    try {
      const { taskId, listId } = await insertTask(session, payload);
      await ref.set({
        ...base,
        taskId,
        listId,
        lastPushedHash: hash,
        lastKnownDone: item.done,
        pending: false,
      });
    } catch (err) {
      await ref.delete().catch(() => undefined);
      throw err;
    }
    return;
  }

  const existing = await readMapAfterClaim(ref);
  if (!existing?.taskId || !existing.listId) {
    logger.warn('[googleTasks] map claim never resolved', {
      uid: session.uid,
      id: ref.id,
    });
    return;
  }
  if (
    existing.lastPushedHash === hash &&
    existing.listId === session.state.listId
  ) {
    return;
  }
  try {
    await tasksRequest(
      session.token,
      'PATCH',
      `/lists/${encodeURIComponent(existing.listId)}/tasks/${encodeURIComponent(existing.taskId)}`,
      taskBody(payload)
    );
    await ref.update({ lastPushedHash: hash, lastKnownDone: item.done });
  } catch (err) {
    if (!(err instanceof TasksNotFound)) throw err;
    // The task (or its list) was deleted in Google; put it back.
    if (existing.listId === session.state.listId) {
      const lists = await tasksRequest<{ items?: { id: string }[] }>(
        session.token,
        'GET',
        '/users/@me/lists',
        undefined,
        { maxResults: '100' }
      );
      if (!(lists.items ?? []).some((l) => l.id === existing.listId)) {
        session.state.listId = null;
      }
    }
    const { taskId, listId } = await insertTask(session, payload);
    await ref.set({
      ...base,
      taskId,
      listId,
      lastPushedHash: hash,
      lastKnownDone: item.done,
      pending: false,
    });
  }
}

async function pushDelete(session: Session, mapId: string): Promise<void> {
  const ref = mapCol(session.uid).doc(mapId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as MapDoc;
  if (data.taskId && data.listId) {
    try {
      await tasksRequest(
        session.token,
        'DELETE',
        `/lists/${encodeURIComponent(data.listId)}/tasks/${encodeURIComponent(data.taskId)}`
      );
    } catch (err) {
      if (!(err instanceof TasksNotFound)) throw err;
    }
  }
  await ref.delete();
}

const projectOrigin = () =>
  appOriginForProject(
    process.env.GCLOUD_PROJECT ||
      (
        JSON.parse(process.env.FIREBASE_CONFIG ?? '{}') as {
          projectId?: string;
        }
      ).projectId
  );

/** Applies one parent's action-item diff to each affected assignee's Google Tasks. */
export async function syncParentWrite(args: {
  plcId: string;
  source: TaskSource;
  parentId: string;
  before: Record<string, unknown> | undefined;
  after: Record<string, unknown> | undefined;
}): Promise<void> {
  const { plcId, source, parentId, before, after } = args;
  const ops = diffActionItems(liveItems(before), liveItems(after));
  if (ops.length === 0) return;

  const byUid = new Map<string, ItemOp[]>();
  for (const op of ops) {
    byUid.set(op.uid, [...(byUid.get(op.uid) ?? []), op]);
  }

  const plcSnap = await db().doc(`plcs/${plcId}`).get();
  const plc = plcSnap.data();
  const ctx: ParentContext = {
    plcId,
    source,
    parentId,
    teamName: typeof plc?.name === 'string' ? plc.name : '',
    parentTitle:
      typeof after?.title === 'string'
        ? after.title
        : typeof before?.title === 'string'
          ? before.title
          : '',
  };
  const origin = projectOrigin();

  for (const [uid, userOps] of byUid) {
    // D10: leaving a team stops syncing; existing tasks stay where they are.
    if (!isActivePlcMember(plc, uid)) continue;
    try {
      const session = await openSession(uid);
      if (!session) continue;
      for (const op of userOps) {
        if (op.kind === 'upsert') {
          await pushUpsert(session, ctx, op.item, origin);
        } else {
          await pushDelete(
            session,
            mapDocId(plcId, source, parentId, op.itemId)
          );
        }
      }
    } catch (err) {
      if (err instanceof TasksAuthError) {
        await disconnect(uid, 'missing-scope');
        continue;
      }
      logger.error('[googleTasks] push failed', { uid, plcId, parentId, err });
    }
  }
}

const triggerOptions = {
  secrets: SECRETS,
  memory: '256MiB' as const,
  maxInstances: 10,
};

export const syncGoogleTasksOnNoteWrite = onDocumentWritten(
  { ...triggerOptions, document: 'plcs/{plcId}/notes/{noteId}' },
  async (event) => {
    await syncParentWrite({
      plcId: event.params.plcId,
      source: 'note',
      parentId: event.params.noteId,
      before: event.data?.before.data(),
      after: event.data?.after.data(),
    });
  }
);

export const syncGoogleTasksOnDocWrite = onDocumentWritten(
  { ...triggerOptions, document: 'plcs/{plcId}/docs/{docId}' },
  async (event) => {
    await syncParentWrite({
      plcId: event.params.plcId,
      source: 'doc',
      parentId: event.params.docId,
      before: event.data?.before.data(),
      after: event.data?.after.data(),
    });
  }
);

/** D4: pushes the user's open items across every team they are an active member of. */
async function backfill(session: Session): Promise<void> {
  const origin = projectOrigin();
  const plcs = await db()
    .collection('plcs')
    .where('memberUids', 'array-contains', session.uid)
    .get();
  for (const plcDoc of plcs.docs) {
    const plc = plcDoc.data();
    if (!isActivePlcMember(plc, session.uid)) continue;
    for (const source of ['note', 'doc'] as const) {
      const parents = await plcDoc.ref
        .collection(source === 'note' ? 'notes' : 'docs')
        .get();
      for (const parent of parents.docs) {
        const data = parent.data();
        const mine = liveItems(data).filter(
          (i) => i.assigneeUid === session.uid && !i.done
        );
        for (const item of mine) {
          await pushUpsert(
            session,
            {
              plcId: plcDoc.id,
              source,
              parentId: parent.id,
              teamName: typeof plc.name === 'string' ? plc.name : '',
              parentTitle: String(data.title ?? ''),
            },
            item,
            origin
          );
        }
      }
    }
  }
}

function requireUser(req: {
  auth?: { uid?: string; token?: Record<string, unknown> } | null;
}): { uid: string; email: string | null } {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const email = req.auth?.token?.email;
  return { uid, email: typeof email === 'string' ? email.toLowerCase() : null };
}

async function syncedCount(uid: string): Promise<number> {
  const agg = await mapCol(uid).count().get();
  return agg.data().count;
}

/** Turns the caller's Google Tasks sync on (with backfill) or off (D1, D4, D10). */
export const setGoogleTasksSyncV1 = onCall(
  { secrets: SECRETS, timeoutSeconds: 300 },
  async (req) => {
    assertViewAsAllowed(req);
    const { uid, email } = requireUser(req);
    const enabled = (req.data as { enabled?: unknown } | undefined)?.enabled;
    if (typeof enabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'enabled must be a boolean.');
    }

    if (!enabled) {
      await stateRef(uid).set(
        { enabled: false, updatedAt: Date.now() },
        { merge: true }
      );
      await db().recursiveDelete(mapCol(uid));
      return { enabled: false, syncedCount: 0 };
    }

    if (
      !(await isGlobalFeatureGranted(db(), GOOGLE_TASKS_FEATURE_ID, email, uid))
    ) {
      throw new HttpsError('permission-denied', 'Google Tasks sync is off.');
    }
    const auth = await db().doc(`users/${uid}/private/googleAuth`).get();
    if (!scopeIncludesTasks(auth.get('scope'))) {
      throw new HttpsError(
        'failed-precondition',
        'Google Tasks permission was not granted.',
        { reason: 'needs-consent' }
      );
    }
    await stateRef(uid).set(
      {
        enabled: true,
        email,
        connectedAt: Date.now(),
        updatedAt: Date.now(),
        disconnectReason: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
    const session = await openSession(uid);
    if (!session) {
      throw new HttpsError(
        'failed-precondition',
        'Google Tasks needs to be reconnected.',
        { reason: 'needs-consent' }
      );
    }
    try {
      await ensureList(session);
      await backfill(session);
    } catch (err) {
      logger.error('[googleTasks] connect backfill failed', { uid, err });
      if (err instanceof TasksAuthError) {
        await disconnect(uid, 'missing-scope');
        throw new HttpsError(
          'failed-precondition',
          'Google Tasks needs to be reconnected.',
          { reason: 'needs-consent' }
        );
      }
      throw new HttpsError('internal', 'Could not reach Google Tasks.');
    }
    return { enabled: true, syncedCount: await syncedCount(uid) };
  }
);

/** The caller's own connection state for the settings toggle; never anyone else's (D11). */
export const getGoogleTasksSyncStatusV1 = onCall(async (req) => {
  assertViewAsAllowed(req, { read: true });
  const { uid } = requireUser(req);
  const snap = await stateRef(uid).get();
  const state = parseState(snap.data());
  const reason: unknown = snap.get('disconnectReason');
  return {
    enabled: state.enabled,
    disconnectReason: typeof reason === 'string' ? reason : null,
    syncedCount: state.enabled ? await syncedCount(uid) : 0,
  };
});

export interface PulledChange {
  plcId: string;
  source: TaskSource;
  parentId: string;
  itemId: string;
  done: boolean;
}

/** D6/D7: done/open changes made in Google since the last pull; the client applies them. */
export const pullGoogleTasksStatusV1 = onCall(
  { secrets: SECRETS },
  async (req): Promise<{ changes: PulledChange[] }> => {
    assertViewAsAllowed(req);
    const { uid } = requireUser(req);
    const session = await openSession(uid);
    if (!session?.state.listId) return { changes: [] };
    const startedAt = Date.now();
    const params: Record<string, string> = {
      showCompleted: 'true',
      showHidden: 'true',
      maxResults: '100',
    };
    if (session.state.lastPullAt) {
      params.updatedMin = new Date(
        session.state.lastPullAt - PULL_OVERLAP_MS
      ).toISOString();
    }

    const statusByTaskId = new Map<string, boolean>();
    try {
      let pageToken: string | undefined;
      do {
        const page = await tasksRequest<{
          items?: { id: string; status?: string }[];
          nextPageToken?: string;
        }>(
          session.token,
          'GET',
          `/lists/${encodeURIComponent(session.state.listId)}/tasks`,
          undefined,
          pageToken ? { ...params, pageToken } : params
        );
        for (const task of page.items ?? []) {
          statusByTaskId.set(task.id, task.status === 'completed');
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    } catch (err) {
      if (err instanceof TasksNotFound) return { changes: [] };
      if (err instanceof TasksAuthError) {
        await disconnect(uid, 'missing-scope');
        return { changes: [] };
      }
      logger.error('[googleTasks] pull failed', { uid, err });
      throw new HttpsError('internal', 'Could not reach Google Tasks.');
    }

    const changes: PulledChange[] = [];
    const taskIds = [...statusByTaskId.keys()];
    for (let i = 0; i < taskIds.length; i += 30) {
      const chunk = taskIds.slice(i, i + 30);
      const maps = await mapCol(uid).where('taskId', 'in', chunk).get();
      for (const m of maps.docs) {
        const d = m.data();
        const done = statusByTaskId.get(String(d.taskId));
        if (done === undefined || done === (d.lastKnownDone === true)) continue;
        changes.push({
          plcId: String(d.plcId),
          source: d.source === 'doc' ? 'doc' : 'note',
          parentId: String(d.parentId),
          itemId: String(d.itemId),
          done,
        });
      }
    }
    await stateRef(uid).set({ lastPullAt: startedAt }, { merge: true });
    return { changes };
  }
);
