import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { ViewAsRawWrite } from '@/utils/viewAsAudit';
import { guardPlcCallable } from '@/utils/plcViewAsCallable';

export interface PlcUpdateDraftPayload {
  title: string;
  body: string;
  linkUrl?: string;
  attachment?: { name: string; url: string };
  requiresAck: boolean;
  inDigest: boolean;
}

export type PlcTeamItemRequest =
  | { action: 'postUpdate'; plcId: string; draft: PlcUpdateDraftPayload }
  | {
      action: 'editUpdate';
      plcId: string;
      updateId: string;
      draft: PlcUpdateDraftPayload;
    }
  | { action: 'pinUpdate'; plcId: string; updateId: string; pinned: boolean }
  | { action: 'deleteUpdate'; plcId: string; updateId: string }
  | {
      action: 'saveGoal';
      plcId: string;
      goalId?: string;
      goal: {
        title: string;
        measure?: string;
        dueDate?: string;
        students?: string;
        outcome?: string;
        progress?: Partial<Record<'baseline' | 'current' | 'target', number>>;
        practices: unknown[];
        order: number;
      };
    }
  | { action: 'deleteGoal'; plcId: string; goalId: string }
  | {
      action: 'addLink';
      plcId: string;
      link: { title: string; url: string; note: string };
    }
  | { action: 'deleteLink'; plcId: string; linkId: string }
  | {
      action: 'postTask';
      plcId: string;
      task: {
        title: string;
        instructions: string;
        dueDate: string;
        submitter: string;
        templateDoc: { title: string; url: string; fileId: string } | null;
      };
    }
  | { action: 'deleteTask'; plcId: string; taskId: string }
  | { action: 'archiveTodos'; plcId: string; ids: string[] }
  | {
      action: 'logActivity';
      plcId: string;
      event: {
        type: string;
        actorUid: string;
        actorName: string;
        targetType?: string;
        targetId?: string;
        targetTitle?: string;
      };
    };

export interface PlcTeamItemResult {
  id?: string;
}

/** Most ids one archiveTodos call takes (the server's MAX_TODO_IDS). */
export const PLC_TODO_ARCHIVE_CHUNK = 100;

/** Same text Firestore showed when the rules refused one of these writes. */
const REFUSED = 'Missing or insufficient permissions.';

const ACTION_COLLECTION: Record<PlcTeamItemRequest['action'], string> = {
  postUpdate: 'updates',
  editUpdate: 'updates',
  pinUpdate: 'updates',
  deleteUpdate: 'updates',
  saveGoal: 'goals',
  deleteGoal: 'goals',
  addLink: 'links',
  deleteLink: 'links',
  postTask: 'tasks',
  deleteTask: 'tasks',
  archiveTodos: 'todos',
  logActivity: 'activity',
};

/** The docs a request writes, as the View as guard and audit see them. */
function viewAsWrites(req: PlcTeamItemRequest): ViewAsRawWrite[] {
  const base = `plcs/${req.plcId}/${ACTION_COLLECTION[req.action]}`;
  const op = req.action.startsWith('delete') ? 'delete' : 'set';
  const ids =
    req.action === 'archiveTodos'
      ? req.ids
      : [
          ('updateId' in req ? req.updateId : undefined) ??
            ('goalId' in req ? req.goalId : undefined) ??
            ('linkId' in req ? req.linkId : undefined) ??
            ('taskId' in req ? req.taskId : undefined) ??
            'new',
        ];
  return ids.map((id) => ({
    op,
    path: `${base}/${id}`,
    ...(op === 'delete' ? {} : { data: req }),
  }));
}

/** Runs one PLC team item write on the server (updates, goals, links, tasks, to-dos, activity). */
export async function callPlcTeamItems(
  req: PlcTeamItemRequest
): Promise<PlcTeamItemResult> {
  return guardPlcCallable(viewAsWrites(req), () => run(req));
}

async function run(req: PlcTeamItemRequest): Promise<PlcTeamItemResult> {
  const fn = httpsCallable<PlcTeamItemRequest, PlcTeamItemResult>(
    functions,
    'plcTeamItemsV1'
  );
  try {
    return (await fn(req)).data;
  } catch (err) {
    const details = (err as { details?: unknown } | null)?.details;
    const reason =
      details && typeof details === 'object'
        ? (details as { reason?: unknown }).reason
        : undefined;
    if (reason !== 'notAllowed' && reason !== 'invalid') throw err;
    throw Object.assign(new Error(REFUSED), {
      code: (err as { code?: unknown }).code,
    });
  }
}
