// Mentoring program data: tasks, workspaces, check-ins and submissions (TEAMS_REDESIGN T29 to T33).

import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import type {
  MentoringCheckIn,
  MentoringDocLink,
  MentoringSubmission,
  MentoringSubmitter,
  MentoringTask,
  MentoringWorkspace,
  Plc,
  PlcActionItem,
  PlcMentorRole,
} from '@/types';
import { logError } from '@/utils/logError';
import { sanitizeActionItemsForWrite } from '@/utils/plcActionItems';
import {
  pairNames,
  requiredSubmitters,
  submissionIdFor,
  submittedAtBy,
  parseMentoringCheckIn,
  parseMentoringSubmission,
  parseMentoringTask,
  parseMentoringWorkspace,
  workspaceIdFor,
} from '@/utils/mentoring';
import type { GoogleDriveService } from '@/utils/googleDriveService';

const PLCS = 'plcs';

interface ListState<T> {
  items: T[];
  loading: boolean;
  error: Error | null;
}

const EMPTY = { items: [], loading: false, error: null };

type Subscriber<T> = (
  key: string,
  onItems: (items: T[]) => void,
  onError: (err: Error) => void
) => () => void;

/** Shared listener plumbing: `subscribe` is module-level and `key` carries its arguments. */
function useLiveList<T>(
  key: string | null,
  subscribe: Subscriber<T>
): ListState<T> {
  const live = key !== null && !isAuthBypass;
  const [state, setState] = useState<ListState<T> & { key: string | null }>({
    ...EMPTY,
    loading: live,
    key,
  });
  if (state.key !== key) {
    setState({ items: [], loading: live, error: null, key });
  }

  useEffect(() => {
    if (key === null || isAuthBypass) return;
    return subscribe(
      key,
      (items) => setState({ items, loading: false, error: null, key }),
      (error) => setState({ items: [], loading: false, error, key })
    );
  }, [key, subscribe]);

  return { items: state.items, loading: state.loading, error: state.error };
}

const SEP = '|';

function collect<T>(
  snap: QuerySnapshot,
  parse: (id: string, data: Record<string, unknown>) => T | null
): T[] {
  const out: T[] = [];
  snap.forEach((d) => {
    const item = parse(d.id, d.data());
    if (item) out.push(item);
  });
  return out;
}

const subscribeTasks: Subscriber<MentoringTask> = (plcId, onItems, onError) =>
  onSnapshot(
    query(collection(db, PLCS, plcId, 'tasks'), orderBy('dueDate')),
    (snap) => onItems(collect(snap, parseMentoringTask)),
    (err) => {
      logError('useMentoringTasks', err, { plcId });
      onError(err);
    }
  );

const subscribeWorkspaces: Subscriber<MentoringWorkspace> = (
  key,
  onItems,
  onError
) => {
  const [plcId, uid, all] = key.split(SEP);
  const ref = collection(db, PLCS, plcId, 'workspaces');
  const q =
    all === '1' ? ref : query(ref, where('memberUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => onItems(collect(snap, parseMentoringWorkspace)),
    (err) => {
      logError('useMentoringWorkspaces', err, { plcId });
      onError(err);
    }
  );
};

const subscribeCheckIns: Subscriber<MentoringCheckIn> = (
  key,
  onItems,
  onError
) => {
  const [plcId, workspaceId] = key.split(SEP);
  return onSnapshot(
    query(
      collection(db, PLCS, plcId, 'workspaces', workspaceId, 'checkins'),
      orderBy('createdAt', 'desc')
    ),
    (snap) => onItems(collect(snap, parseMentoringCheckIn)),
    (err) => {
      logError('useWorkspaceCheckIns', err, { plcId, workspaceId });
      onError(err);
    }
  );
};

export function useMentoringTasks(plcId: string | null) {
  return useLiveList(plcId, subscribeTasks);
}

/** Facilitators see every workspace; anyone else only their own. */
export function useMentoringWorkspaces(
  plcId: string | null,
  uid: string | null,
  isFacilitator: boolean
) {
  const key =
    plcId && uid ? [plcId, uid, isFacilitator ? '1' : '0'].join(SEP) : null;
  return useLiveList(key, subscribeWorkspaces);
}

export function useWorkspaceCheckIns(
  plcId: string | null,
  workspaceId: string | null
) {
  const key = plcId && workspaceId ? [plcId, workspaceId].join(SEP) : null;
  return useLiveList(key, subscribeCheckIns);
}

const wsRef = (plcId: string, workspaceId: string) =>
  doc(db, PLCS, plcId, 'workspaces', workspaceId);

/** Facilitators tag a member as mentor or mentee, or clear the tag (T29). */
export async function setMemberMentorRole(
  plcId: string,
  uid: string,
  mentorRole: PlcMentorRole | null
): Promise<void> {
  await updateDoc(doc(db, PLCS, plcId), {
    [`members.${uid}.mentorRole`]: mentorRole ?? deleteField(),
    roleChangeUid: uid,
    updatedAt: serverTimestamp(),
  });
}

/** A pairing is its workspace; the id is deterministic so a pair has one. */
export async function createPairing(
  plc: Plc,
  mentorUid: string,
  menteeUid: string
): Promise<string> {
  const id = workspaceIdFor(mentorUid, menteeUid);
  const names = pairNames(plc, {
    mentorUid,
    menteeUid,
    mentorName: '',
    menteeName: '',
  });
  await setDoc(wsRef(plc.id, id), {
    mentorUid,
    menteeUid,
    memberUids: [mentorUid, menteeUid],
    mentorName: names.mentor,
    menteeName: names.mentee,
    actionItems: [],
    docs: [],
    taskStatus: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export const BATCH_LIMIT = 450;

/** Deletes the workspace with its check-ins and submissions, so re-pairing starts clean. */
export async function removePairing(
  plcId: string,
  workspaceId: string
): Promise<void> {
  const ws = wsRef(plcId, workspaceId);
  const [checkIns, submissions] = await Promise.all([
    getDocs(collection(ws, 'checkins')),
    getDocs(collection(ws, 'submissions')),
  ]);
  const refs = [...checkIns.docs, ...submissions.docs].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const r of refs.slice(i, i + BATCH_LIMIT)) batch.delete(r);
    await batch.commit();
  }
  await deleteDoc(ws);
}

export interface MentoringTaskInput {
  title: string;
  instructions: string;
  dueDate: string;
  submitter: MentoringSubmitter;
  templateDoc: { title: string; url: string; fileId: string } | null;
}

/** Appends a doc link to a workspace, keeping a teammate's concurrent edits. */
async function appendWorkspaceDoc(
  plcId: string,
  workspaceId: string,
  link: MentoringDocLink
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = wsRef(plcId, workspaceId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const ws = parseMentoringWorkspace(snap.id, snap.data());
    if (!ws) return;
    tx.update(ref, {
      docs: [...ws.docs.filter((d) => d.id !== link.id), link],
      updatedAt: serverTimestamp(),
    });
  });
}

const COPY_CONCURRENCY = 4;

/** Runs `fn` over `items` with at most `limit` in flight; one failure never stops the rest. */
async function eachBounded<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
}

/** Gives each workspace its own copy of the template, shared with the pair (T32); returns pairs that failed. */
export async function copyTemplateIntoWorkspaces(
  plc: Plc,
  taskId: string,
  input: MentoringTaskInput,
  workspaces: readonly MentoringWorkspace[],
  uid: string,
  drive: GoogleDriveService | null
): Promise<string[]> {
  const template = input.templateDoc;
  if (!template || workspaces.length === 0) return [];
  const fileId = template.fileId;
  const title = `${template.title || input.title} (template)`;
  const failed: string[] = [];
  await eachBounded(workspaces, COPY_CONCURRENCY, async (ws) => {
    const names = pairNames(plc, ws);
    let copyId: string | null = null;
    try {
      if (!drive || !fileId) throw new Error('Template cannot be copied');
      const copy = await drive.copyFile(
        fileId,
        `${input.title} · ${names.mentor} and ${names.mentee}`
      );
      copyId = copy.id;
      for (const pairUid of [ws.mentorUid, ws.menteeUid]) {
        const email = plc.members?.[pairUid]?.email;
        if (!email) throw new Error('Pair member has no email');
        await drive.addEditorPermission(copy.id, email);
      }
      await appendWorkspaceDoc(plc.id, ws.id, {
        id: `task-${taskId}`,
        title,
        url:
          copy.webViewLink ??
          `https://docs.google.com/document/d/${copy.id}/edit`,
        taskId,
        addedBy: uid,
        addedAt: Date.now(),
      });
    } catch (err) {
      logError('copyTemplateIntoWorkspaces', err, {
        plcId: plc.id,
        workspaceId: ws.id,
      });
      // Trash a half-shared copy so a failed pair leaves no orphaned Drive file.
      if (drive && copyId) {
        await drive.trashFile(copyId).catch((trashErr: unknown) =>
          logError('copyTemplateIntoWorkspaces.trash', trashErr, {
            plcId: plc.id,
          })
        );
      }
      failed.push(`${names.mentor} and ${names.mentee}`);
    }
  });
  return failed;
}

export async function postMentoringTask(
  plc: Plc,
  input: MentoringTaskInput,
  uid: string,
  workspaces: readonly MentoringWorkspace[],
  drive: GoogleDriveService | null
): Promise<{ taskId: string; failedPairs: string[] }> {
  const ref = doc(collection(db, PLCS, plc.id, 'tasks'));
  await setDoc(ref, {
    id: ref.id,
    title: input.title,
    instructions: input.instructions,
    dueDate: input.dueDate,
    submitter: input.submitter,
    templateDoc: input.templateDoc,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const failedPairs = await copyTemplateIntoWorkspaces(
    plc,
    ref.id,
    input,
    workspaces,
    uid,
    drive
  );
  return { taskId: ref.id, failedPairs };
}

export async function deleteMentoringTask(
  plcId: string,
  taskId: string
): Promise<void> {
  await deleteDoc(doc(db, PLCS, plcId, 'tasks', taskId));
}

/** Hands in a task: the submitter's own submission plus, if still open, its status on the workspace. */
export async function submitMentoringTask(
  plcId: string,
  workspace: MentoringWorkspace,
  task: MentoringTask,
  user: { uid: string; displayName: string | null }
): Promise<void> {
  const docUrl = workspace.docs.find((d) => d.taskId === task.id)?.url;
  const id = submissionIdFor(task.id, user.uid);
  const batch = writeBatch(db);
  batch.set(
    doc(db, PLCS, plcId, 'workspaces', workspace.id, 'submissions', id),
    {
      id,
      taskId: task.id,
      submittedBy: user.uid,
      submittedByName: user.displayName ?? '',
      submittedAt: serverTimestamp(),
      ...(docUrl ? { docUrl } : {}),
    }
  );
  if (!workspace.taskStatus[id]) {
    batch.update(wsRef(plcId, workspace.id), {
      [`taskStatus.${id}`]: {
        submittedAt: serverTimestamp(),
        submittedBy: user.uid,
      },
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** The latest submission handed in for this task on this workspace. */
export async function getMentoringSubmission(
  plcId: string,
  workspace: Pick<
    MentoringWorkspace,
    'id' | 'taskStatus' | 'mentorUid' | 'menteeUid'
  >,
  task: Pick<MentoringTask, 'id' | 'submitter'>
): Promise<MentoringSubmission | null> {
  const taskId = task.id;
  const by = requiredSubmitters(task, workspace)
    .filter((u) => submittedAtBy(task, workspace, u) !== null)
    .sort(
      (a, b) =>
        (submittedAtBy(task, workspace, b) ?? 0) -
        (submittedAtBy(task, workspace, a) ?? 0)
    )[0];
  if (!by) return null;
  const snap = await getDoc(
    doc(
      db,
      PLCS,
      plcId,
      'workspaces',
      workspace.id,
      'submissions',
      submissionIdFor(taskId, by)
    )
  );
  return snap.exists() ? parseMentoringSubmission(snap.id, snap.data()) : null;
}

export async function addWorkspaceDoc(
  plcId: string,
  workspaceId: string,
  input: { title: string; url: string },
  uid: string
): Promise<void> {
  await appendWorkspaceDoc(plcId, workspaceId, {
    id: crypto.randomUUID(),
    title: input.title,
    url: input.url,
    addedBy: uid,
    addedAt: Date.now(),
  });
}

/** Replaces the action items inside a transaction so concurrent edits by the partner are kept. */
export async function updateWorkspaceActionItems(
  plcId: string,
  workspaceId: string,
  change: (items: PlcActionItem[]) => PlcActionItem[]
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = wsRef(plcId, workspaceId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const ws = parseMentoringWorkspace(snap.id, snap.data());
    if (!ws) return;
    tx.update(ref, {
      actionItems: sanitizeActionItemsForWrite(change(ws.actionItems)),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function createCheckIn(
  plcId: string,
  workspaceId: string,
  input: { title: string; body: string },
  user: { uid: string; displayName: string | null }
): Promise<string> {
  const ref = doc(
    collection(db, PLCS, plcId, 'workspaces', workspaceId, 'checkins')
  );
  await setDoc(ref, {
    id: ref.id,
    title: input.title,
    body: input.body,
    createdBy: user.uid,
    createdByName: user.displayName ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCheckIn(
  plcId: string,
  workspaceId: string,
  checkInId: string,
  patch: { title?: string; body?: string }
): Promise<void> {
  await updateDoc(
    doc(db, PLCS, plcId, 'workspaces', workspaceId, 'checkins', checkInId),
    { ...patch, updatedAt: serverTimestamp() }
  );
}
