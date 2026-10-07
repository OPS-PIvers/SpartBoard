// Pure helpers for mentoring programs: parsing, task status and summaries (TEAMS_REDESIGN T29 to T34).

import type {
  MentoringCheckIn,
  MentoringDocLink,
  MentoringSubmission,
  MentoringSubmitter,
  MentoringTask,
  MentoringTaskStatus,
  MentoringWorkspace,
  Plc,
  PlcMentorRole,
} from '@/types';
import { parseActionItems } from '@/utils/plcActionItems';
import { tsToMillis } from '@/utils/plc';

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The URL when it is an https link, else null. */
export function httpsUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return /^https:\/\/\S+$/i.test(t) ? t : null;
}

export const MENTORING_SUBMITTERS: readonly MentoringSubmitter[] = [
  'mentee',
  'mentor',
  'both',
];

export function isMentoringSubmitter(v: unknown): v is MentoringSubmitter {
  return MENTORING_SUBMITTERS.includes(v as MentoringSubmitter);
}

export function parseMentoringTask(
  id: string,
  data: Record<string, unknown>
): MentoringTask | null {
  if (
    typeof data.title !== 'string' ||
    typeof data.dueDate !== 'string' ||
    !DATE_RE.test(data.dueDate) ||
    !isMentoringSubmitter(data.submitter)
  ) {
    return null;
  }
  const tplUrl = isRecord(data.templateDoc)
    ? httpsUrl(data.templateDoc.url)
    : null;
  const template =
    isRecord(data.templateDoc) && tplUrl
      ? {
          title: str(data.templateDoc.title),
          url: tplUrl,
          ...(typeof data.templateDoc.fileId === 'string' &&
          data.templateDoc.fileId
            ? { fileId: data.templateDoc.fileId }
            : {}),
        }
      : null;
  return {
    id,
    title: data.title,
    instructions: str(data.instructions),
    dueDate: data.dueDate,
    submitter: data.submitter,
    templateDoc: template,
    createdBy: str(data.createdBy),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

function parseDocLinks(raw: unknown): MentoringDocLink[] {
  if (!Array.isArray(raw)) return [];
  const out: MentoringDocLink[] = [];
  for (const d of raw) {
    const url = isRecord(d) ? httpsUrl(d.url) : null;
    if (!isRecord(d) || !url) continue;
    out.push({
      id: str(d.id) || url,
      title: str(d.title) || url,
      url,
      ...(typeof d.taskId === 'string' && d.taskId ? { taskId: d.taskId } : {}),
      addedBy: str(d.addedBy),
      addedAt: tsToMillis(d.addedAt),
    });
  }
  return out;
}

function parseTaskStatus(raw: unknown): Record<string, MentoringTaskStatus> {
  if (!isRecord(raw)) return {};
  const out: Record<string, MentoringTaskStatus> = {};
  for (const [taskId, v] of Object.entries(raw)) {
    if (!isRecord(v)) continue;
    out[taskId] = {
      submittedAt: tsToMillis(v.submittedAt),
      submittedBy: str(v.submittedBy),
    };
  }
  return out;
}

export function parseMentoringWorkspace(
  id: string,
  data: Record<string, unknown>
): MentoringWorkspace | null {
  if (
    typeof data.mentorUid !== 'string' ||
    typeof data.menteeUid !== 'string'
  ) {
    return null;
  }
  return {
    id,
    mentorUid: data.mentorUid,
    menteeUid: data.menteeUid,
    memberUids: [data.mentorUid, data.menteeUid],
    mentorName: str(data.mentorName),
    menteeName: str(data.menteeName),
    actionItems: parseActionItems(data.actionItems),
    docs: parseDocLinks(data.docs),
    taskStatus: parseTaskStatus(data.taskStatus),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export function parseMentoringCheckIn(
  id: string,
  data: Record<string, unknown>
): MentoringCheckIn | null {
  if (typeof data.title !== 'string') return null;
  return {
    id,
    title: data.title,
    body: str(data.body),
    createdBy: str(data.createdBy),
    createdByName: str(data.createdByName),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export function parseMentoringSubmission(
  id: string,
  data: Record<string, unknown>
): MentoringSubmission | null {
  if (typeof data.submittedBy !== 'string') return null;
  const docUrl = httpsUrl(data.docUrl);
  return {
    id,
    taskId: str(data.taskId) || id,
    submittedBy: data.submittedBy,
    submittedByName: str(data.submittedByName),
    submittedAt: tsToMillis(data.submittedAt),
    ...(docUrl ? { docUrl } : {}),
  };
}

/** Local midnight that ends the due day. */
export function dueDeadline(dueDate: string): number {
  const [y, m, d] = dueDate.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, (d ?? 1) + 1).getTime();
}

/** 'YYYY-MM-DD' for a local timestamp. */
export function toDateKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type MentoringPairStatus =
  | { kind: 'submitted'; at: number; daysLate: number }
  | { kind: 'late' }
  | { kind: 'notStarted' };

type StatusTask = Pick<MentoringTask, 'id' | 'dueDate' | 'submitter'>;
type StatusWorkspace = Pick<
  MentoringWorkspace,
  'taskStatus' | 'mentorUid' | 'menteeUid'
>;

/** Who must hand in this task for the pair. */
export function requiredSubmitters(
  task: Pick<MentoringTask, 'submitter'>,
  ws: Pick<MentoringWorkspace, 'mentorUid' | 'menteeUid'>
): string[] {
  if (task.submitter === 'both') return [ws.mentorUid, ws.menteeUid];
  return [task.submitter === 'mentor' ? ws.mentorUid : ws.menteeUid];
}

/** When `uid` handed in this task, or null. */
export function submittedAtBy(
  task: Pick<MentoringTask, 'id'>,
  ws: Pick<MentoringWorkspace, 'taskStatus'>,
  uid: string
): number | null {
  return ws.taskStatus[submissionIdFor(task.id, uid)]?.submittedAt ?? null;
}

function statusFor(
  times: (number | null)[],
  dueDate: string,
  now: number
): MentoringPairStatus {
  const deadline = dueDeadline(dueDate);
  if (times.length && times.every((t) => t !== null)) {
    const at = Math.max(...times);
    const daysLate = at > deadline ? Math.ceil((at - deadline) / DAY_MS) : 0;
    return { kind: 'submitted', at, daysLate };
  }
  return now >= deadline ? { kind: 'late' } : { kind: 'notStarted' };
}

/** The pair's status: submitted once everyone required has, late by the last of them. */
export function pairTaskStatus(
  task: StatusTask,
  ws: StatusWorkspace,
  now: number
): MentoringPairStatus {
  return statusFor(
    requiredSubmitters(task, ws).map((uid) => submittedAtBy(task, ws, uid)),
    task.dueDate,
    now
  );
}

/** One partner's own status, judged by their own submit time. */
export function partnerTaskStatus(
  task: StatusTask,
  ws: StatusWorkspace,
  uid: string,
  now: number
): MentoringPairStatus {
  return statusFor([submittedAtBy(task, ws, uid)], task.dueDate, now);
}

export interface MentoringTaskSummary {
  task: MentoringTask;
  submitted: number;
  late: number;
  notStarted: number;
  total: number;
}

export function summarizeTask(
  task: MentoringTask,
  workspaces: readonly MentoringWorkspace[],
  now: number
): MentoringTaskSummary {
  const out = { task, submitted: 0, late: 0, notStarted: 0, total: 0 };
  for (const ws of workspaces) {
    const s = pairTaskStatus(task, ws, now);
    out[s.kind] += 1;
    out.total += 1;
  }
  return out;
}

export function sortTasksByDue(
  tasks: readonly MentoringTask[]
): MentoringTask[] {
  return [...tasks].sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title)
  );
}

/** Hero default (T6): a pair's earliest unsubmitted task; facilitators get the next one due. */
export function nextRequiredTask(
  tasks: readonly MentoringTask[],
  now: number,
  workspace: MentoringWorkspace | null
): MentoringTask | null {
  const sorted = sortTasksByDue(tasks);
  if (workspace) {
    return (
      sorted.find(
        (t) => pairTaskStatus(t, workspace, now).kind !== 'submitted'
      ) ?? null
    );
  }
  const today = toDateKey(now);
  return (
    sorted.find((t) => t.dueDate >= today) ?? sorted[sorted.length - 1] ?? null
  );
}

/** Whether `uid` still owes this task: they hand it in and have not yet. */
export function owesTask(
  task: Pick<MentoringTask, 'id' | 'submitter'>,
  ws: Pick<MentoringWorkspace, 'mentorUid' | 'menteeUid' | 'taskStatus'>,
  uid: string
): boolean {
  return canSubmitTask(task, ws, uid) && submittedAtBy(task, ws, uid) === null;
}

/** Whether `uid` hands in this task for their pair. */
export function canSubmitTask(
  task: Pick<MentoringTask, 'submitter'>,
  workspace: Pick<MentoringWorkspace, 'mentorUid' | 'menteeUid'>,
  uid: string
): boolean {
  if (task.submitter === 'both') {
    return uid === workspace.mentorUid || uid === workspace.menteeUid;
  }
  return task.submitter === 'mentor'
    ? uid === workspace.mentorUid
    : uid === workspace.menteeUid;
}

export function memberName(
  plc: Plc | null,
  uid: string,
  fallback = ''
): string {
  const m = plc?.members?.[uid];
  return [m?.displayName, fallback, m?.email].find((v) => !!v) ?? '';
}

export function pairNames(
  plc: Plc | null,
  ws: Pick<
    MentoringWorkspace,
    'mentorUid' | 'menteeUid' | 'mentorName' | 'menteeName'
  >
): { mentor: string; mentee: string } {
  return {
    mentor: memberName(plc, ws.mentorUid, ws.mentorName),
    mentee: memberName(plc, ws.menteeUid, ws.menteeName),
  };
}

/** Active members tagged with a mentor role, by role. */
export function mentoringRoster(
  plc: Plc
): Record<PlcMentorRole, { uid: string; name: string }[]> {
  const out: Record<PlcMentorRole, { uid: string; name: string }[]> = {
    mentor: [],
    mentee: [],
  };
  for (const m of Object.values(plc.members ?? {})) {
    if (m.status !== 'active' || m.role !== 'member' || !m.mentorRole) continue;
    out[m.mentorRole].push({ uid: m.uid, name: m.displayName || m.email });
  }
  out.mentor.sort((a, b) => a.name.localeCompare(b.name));
  out.mentee.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

const DRIVE_EDIT_PATH: Record<string, string> = {
  'application/vnd.google-apps.document': 'document',
  'application/vnd.google-apps.presentation': 'presentation',
  'application/vnd.google-apps.spreadsheet': 'spreadsheets',
};

/** An https link to a picked Drive file. */
export function driveFileUrl(file: { id: string; mimeType: string }): string {
  const kind = DRIVE_EDIT_PATH[file.mimeType];
  return kind
    ? `https://docs.google.com/${kind}/d/${file.id}/edit`
    : `https://drive.google.com/file/d/${file.id}/view`;
}

/** Each partner hands in their own submission doc per task. */
export function submissionIdFor(taskId: string, uid: string): string {
  return `${taskId}_${uid}`;
}

/** Deterministic id so a pair has one workspace. */
export function workspaceIdFor(mentorUid: string, menteeUid: string): string {
  return `${mentorUid}_${menteeUid}`;
}
