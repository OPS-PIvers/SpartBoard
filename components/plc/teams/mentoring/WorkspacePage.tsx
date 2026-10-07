// Mentoring `workspace` page (T30 to T33): a pair's own workspace, or the facilitators' Workspaces list and tracker.

import React, { useState } from 'react';
import { useAuth } from '@/context/useAuth';
import {
  addWorkspaceDoc,
  createCheckIn,
  getMentoringSubmission,
  submitMentoringTask,
  updateCheckIn,
  updateWorkspaceActionItems,
  useWorkspaceCheckIns,
} from '@/hooks/useMentoring';
import { useTeamTypeDefaults } from '@/hooks/useTeamLayout';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import { META, PAGE, Section } from '@/components/plc/redesignMockup/ui';
import type { MentoringCheckIn, MentoringWorkspace, Plc } from '@/types';
import { logError } from '@/utils/logError';
import {
  canSubmitTask,
  pairNames,
  pairTaskStatus,
  summarizeTask,
  toDateKey,
} from '@/utils/mentoring';
import { newActionItem } from '@/utils/plcActionItems';
import {
  SUBMITTER_LABEL,
  SUBMITTER_SHORT,
  msDate,
  pairStatusLabel,
  shortDate,
} from './mentoringFormat';
import { PostTaskModal } from './PostTaskModal';
import { TaskTrackerView, type TrackerFilter } from './TaskTrackerView';
import type { TeamNav, TeamPageProps } from './teamContract';
import {
  useMentoringProgram,
  type MentoringProgramData,
} from './useMentoringProgram';
import { AddDocModal, CheckInModal, DocEmbedModal } from './WorkspaceModals';
import { WorkspaceView } from './WorkspaceView';

type Dialog =
  | { kind: 'doc'; title: string; url: string }
  | { kind: 'addDoc' }
  | { kind: 'checkIn'; id: string | null; title: string; body: string }
  | null;

/** First line of a check-in that is not a heading, for the list meta. */
const summaryOf = (body: string): string =>
  body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
    ?.replace(/^[-*]\s+/, '') ?? '';

interface DetailProps {
  plc: Plc;
  ws: MentoringWorkspace;
  data: MentoringProgramData;
  isLead: boolean;
  onBack?: () => void;
}

export type RenderWorkspace = (
  ws: MentoringWorkspace,
  onBack?: () => void
) => React.ReactNode;

/** One workspace from data already loaded; the live page and the dev harness both render it. */
export const WorkspaceScreen: React.FC<
  DetailProps & {
    checkIns: MentoringCheckIn[];
    template: string;
    user: { uid: string; displayName: string | null } | null;
  }
> = ({ plc, ws, data, isLead, onBack, checkIns, template, user }) => {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const uid = data.uid ?? '';
  const canEdit = !isLead && ws.memberUids.includes(uid);
  const names = pairNames(plc, ws);
  const nameOf = (id: string | null | undefined) =>
    id === ws.mentorUid
      ? names.mentor
      : id === ws.menteeUid
        ? names.mentee
        : '';
  const nextOpen = data.tasks.find((t) => !ws.taskStatus[t.id])?.id ?? null;
  const taskDoc = (taskId: string) => ws.docs.find((d) => d.taskId === taskId);
  const ordered = [
    ...data.tasks.filter((t) => t.id === nextOpen),
    ...data.tasks.filter((t) => t.id !== nextOpen),
  ];

  const submit = async (taskId: string) => {
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task || !user) return;
    setBusyTaskId(taskId);
    try {
      await submitMentoringTask(plc.id, ws, task, user);
    } catch (err) {
      logError('WorkspacePage.submit', err, { plcId: plc.id });
    } finally {
      setBusyTaskId(null);
    }
  };

  const viewSubmission = async (taskId: string) => {
    const sub = await getMentoringSubmission(plc.id, ws.id, taskId).catch(
      () => null
    );
    const url = sub?.docUrl ?? taskDoc(taskId)?.url;
    const task = data.tasks.find((t) => t.id === taskId);
    if (url) setDialog({ kind: 'doc', title: task?.title ?? '', url });
  };

  return (
    <>
      <WorkspaceView
        title={`${names.mentor} and ${names.mentee}`}
        onBack={onBack}
        canEdit={canEdit}
        busyTaskId={busyTaskId}
        people={[
          { uid: ws.mentorUid, name: names.mentor },
          { uid: ws.menteeUid, name: names.mentee },
        ]}
        tasks={ordered.map((t) => {
          const status = pairTaskStatus(t, ws, data.now);
          const [tone, label] = pairStatusLabel(status);
          return {
            id: t.id,
            title: t.title,
            due: shortDate(t.dueDate),
            submits: SUBMITTER_SHORT[t.submitter],
            tone,
            status: label,
            submitted: status.kind === 'submitted',
            hasDoc: !!taskDoc(t.id),
            canSubmit: t.id === nextOpen && canSubmitTask(t, ws, uid),
          };
        })}
        checkIns={checkIns.map((c) => ({
          id: c.id,
          title: c.title,
          meta: summaryOf(c.body),
        }))}
        actionItems={ws.actionItems.map((a) => {
          const who = nameOf(a.assigneeUid);
          const when = a.done
            ? a.doneAt
              ? `done ${msDate(a.doneAt)}`
              : ''
            : a.dueAt
              ? `due ${msDate(a.dueAt)}`
              : '';
          return {
            id: a.id,
            title: a.text,
            done: a.done,
            meta: [who, when].filter(Boolean).join(' · '),
          };
        })}
        docs={ws.docs.map((d) => ({ id: d.id, title: d.title }))}
        onOpenTaskDoc={(taskId) => {
          const d = taskDoc(taskId);
          if (d) setDialog({ kind: 'doc', title: d.title, url: d.url });
        }}
        onSubmitTask={(taskId) => void submit(taskId)}
        onViewSubmission={(taskId) => void viewSubmission(taskId)}
        onNewCheckIn={() =>
          setDialog({
            kind: 'checkIn',
            id: null,
            title: `Check-in ${msDate(data.now)}`,
            body: template,
          })
        }
        onOpenCheckIn={(id) => {
          const c = checkIns.find((x) => x.id === id);
          if (c)
            setDialog({ kind: 'checkIn', id, title: c.title, body: c.body });
        }}
        onToggleActionItem={(id) =>
          void updateWorkspaceActionItems(plc.id, ws.id, (items) =>
            items.map((a) =>
              a.id === id
                ? { ...a, done: !a.done, doneAt: a.done ? null : Date.now() }
                : a
            )
          ).catch((err) => logError('WorkspacePage.toggle', err))
        }
        onAddActionItem={({ text, assigneeUid, dueDate }) =>
          void updateWorkspaceActionItems(plc.id, ws.id, (items) => [
            ...items,
            newActionItem(text, uid, Date.now(), {
              assigneeUid,
              dueAt: dueDate ? new Date(`${dueDate}T12:00`).getTime() : null,
            }),
          ]).catch((err) => logError('WorkspacePage.addItem', err))
        }
        onOpenDoc={(id) => {
          const d = ws.docs.find((x) => x.id === id);
          if (d) setDialog({ kind: 'doc', title: d.title, url: d.url });
        }}
        onAddDoc={() => setDialog({ kind: 'addDoc' })}
      />
      {dialog?.kind === 'doc' && (
        <DocEmbedModal
          title={dialog.title}
          url={dialog.url}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'addDoc' && (
        <AddDocModal
          onClose={() => setDialog(null)}
          onSave={(input) => addWorkspaceDoc(plc.id, ws.id, input, uid)}
        />
      )}
      {dialog?.kind === 'checkIn' && user && (
        <CheckInModal
          title={dialog.title}
          body={dialog.body}
          canEdit={canEdit}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            if (dialog.id) {
              await updateCheckIn(plc.id, ws.id, dialog.id, input);
            } else {
              await createCheckIn(plc.id, ws.id, input, user);
            }
          }}
        />
      )}
    </>
  );
};

const LiveWorkspace: React.FC<DetailProps> = (props) => {
  const { user } = useAuth();
  const defaults = useTeamTypeDefaults();
  const checkIns = useWorkspaceCheckIns(props.plc.id, props.ws.id);
  const template =
    defaults?.types.mentoring?.meetingNoteTemplate ??
    BUILT_IN_TEAM_TYPE_PRESETS.mentoring.meetingNoteTemplate ??
    '';
  return (
    <WorkspaceScreen
      {...props}
      checkIns={checkIns.items}
      template={template}
      user={user}
    />
  );
};

export const FacilitatorWorkspacesScreen: React.FC<{
  plc: Plc;
  data: MentoringProgramData;
  renderWorkspace: RenderWorkspace;
  initialOpenId?: string | null;
}> = ({ plc, data, renderWorkspace, initialOpenId = null }) => {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [pickedTaskId, setTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TrackerFilter>('all');
  const [posting, setPosting] = useState(false);
  const [doc, setDoc] = useState<{ title: string; url: string } | null>(null);

  const open = data.workspaces.find((w) => w.id === openId);
  if (open) return renderWorkspace(open, () => setOpenId(null));

  const today = toDateKey(data.now);
  // Default to the task most recently due, else the next one.
  const task =
    data.tasks.find((t) => t.id === pickedTaskId) ??
    data.tasks.filter((t) => t.dueDate < today).pop() ??
    data.tasks[0] ??
    null;
  const summary = task ? summarizeTask(task, data.workspaces, data.now) : null;
  // Pairing order, as facilitators set them up.
  const pairs = [...data.workspaces]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((ws) => {
      const names = pairNames(plc, ws);
      const [tone, status] = task
        ? pairStatusLabel(pairTaskStatus(task, ws, data.now))
        : (['none', ''] as const);
      return {
        id: ws.id,
        mentor: names.mentor,
        mentee: names.mentee,
        tone,
        status,
      };
    });

  const openSubmission = async (workspaceId: string) => {
    if (!task) return;
    const sub = await getMentoringSubmission(
      plc.id,
      workspaceId,
      task.id
    ).catch(() => null);
    if (sub?.docUrl) setDoc({ title: task.title, url: sub.docUrl });
    else setOpenId(workspaceId);
  };

  return (
    <>
      <TaskTrackerView
        tasks={data.tasks.map((t) => ({ id: t.id, title: t.title }))}
        taskId={task?.id ?? null}
        onTask={setTaskId}
        taskMeta={
          task
            ? `Due ${shortDate(task.dueDate)} · submits: ${SUBMITTER_LABEL[task.submitter]}`
            : ''
        }
        counts={summary}
        filter={filter}
        onFilter={setFilter}
        pairs={pairs}
        onPostTask={() => setPosting(true)}
        onOpenSubmission={(id) => void openSubmission(id)}
        onOpenWorkspace={setOpenId}
      />
      {posting && (
        <PostTaskModal
          plc={plc}
          workspaces={data.workspaces}
          onClose={() => setPosting(false)}
          onPosted={setTaskId}
        />
      )}
      {doc && (
        <DocEmbedModal
          title={doc.title}
          url={doc.url}
          onClose={() => setDoc(null)}
        />
      )}
    </>
  );
};

export const PairWorkspacesScreen: React.FC<{
  plc: Plc;
  data: MentoringProgramData;
  renderWorkspace: RenderWorkspace;
}> = ({ plc, data, renderWorkspace }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const only = data.mine.length === 1 ? data.mine[0] : null;
  const open = only ?? data.mine.find((w) => w.id === openId) ?? null;
  if (open) {
    return renderWorkspace(open, only ? undefined : () => setOpenId(null));
  }
  if (data.mine.length === 0) {
    return (
      <div className={PAGE}>
        <Section first label="Workspace">
          <h2 className="text-xl font-extrabold text-slate-800">Workspace</h2>
          <p className={`${META} mt-1`}>You are not paired yet.</p>
        </Section>
      </div>
    );
  }
  return (
    <TaskTrackerView
      tasks={[]}
      taskId={null}
      onTask={() => undefined}
      taskMeta=""
      counts={null}
      filter="all"
      onFilter={() => undefined}
      pairs={data.mine.map((ws) => ({
        id: ws.id,
        ...pairNames(plc, ws),
        tone: 'none',
        status: '',
      }))}
      onOpenSubmission={setOpenId}
      onOpenWorkspace={setOpenId}
    />
  );
};

export default function WorkspacePage({
  plc,
  isLead,
}: TeamPageProps & TeamNav) {
  const data = useMentoringProgram(plc, isLead);
  if (data.loading) return null;
  const renderWorkspace: RenderWorkspace = (ws, onBack) => (
    <LiveWorkspace
      key={ws.id}
      plc={plc}
      ws={ws}
      data={data}
      isLead={isLead}
      onBack={onBack}
    />
  );
  return isLead ? (
    <FacilitatorWorkspacesScreen
      plc={plc}
      data={data}
      renderWorkspace={renderWorkspace}
    />
  ) : (
    <PairWorkspacesScreen
      plc={plc}
      data={data}
      renderWorkspace={renderWorkspace}
    />
  );
}
